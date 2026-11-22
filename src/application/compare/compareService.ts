// The application side of the Scenario comparison (Decision 0091 items 1 to 3 and 6 to 8; card V2). It reads both sides of a Project, applies
// the rate and count choices to copies, costs each side with Costing itself (never re-implemented here, plan V-D2), reads the measures
// and peaks, and hands everything to the pure `buildComparison`. It changes nothing in storage (plan V-D1).
//
// Cost is kept down in two ways. A side's costed result is cached on the side, the overrides that reach it and the Project's save
// stamp, so changing the day, or only one side, recomputes only what changed. A side that is already cached is not read in full again:
// the key needs only its Routes, service days and assumptions.

import { buildCostingCalculationContext, buildEstimatedCostingContext } from '../costingContext';
import { applyCountChoice, type CountSide } from '../../domain/compare/countChoice';
import { buildComparison } from '../../domain/compare/buildComparison';
import { matchRoutes } from '../../domain/compare/routeMatch';
import { matchServiceDays } from '../../domain/compare/serviceDayMatch';
import type { CompareSide, ComparisonInput, RouteMatch, ServiceDayPair, SideDay } from '../../domain/compare/types';
import type { CostingAssumptionsInput } from '../../domain/costing';
import type { CostingAssumptions, EntityId, Route, RouteDirection, ServiceDayDefinition } from '../../domain/types';
import type { CostingContextSources } from '../ports';
import { applyRateChoice, rateValues, sameRates, sideAssumptions } from './compareAssumptions';
import type {
  CompareBasisKind,
  CompareDifference,
  CompareError,
  CompareOutcome,
  CompareOwnCounts,
  CompareProgress,
  CompareRequest,
  CompareSideRequest,
  SideComputation,
} from './compareTypes';
import { createCompareEngine, type CompareEngine } from './compareWorkerClient';

/** What the comparison reads. Costing's own sources, plus the Routes' directions and the saved assumptions. Reads only. */
export interface CompareSources extends CostingContextSources {
  listRoutes(scenarioId: EntityId): Promise<Route[]>;
  listDirections(scenarioId: EntityId): Promise<RouteDirection[]>;
  getCostingAssumptions(scenarioId: EntityId): Promise<CostingAssumptions | undefined>;
}

export interface CompareCommands {
  compare(request: CompareRequest, onProgress?: (progress: CompareProgress) => void): Promise<CompareOutcome>;
  /** Stops the worker and forgets every cached side. */
  dispose(): void;
}

/** The most sides kept at once. A comparison holds two; the rest are the recent choices a planner goes back to. */
const CACHE_LIMIT = 12;

/** One side as read cheaply, enough to match, apply the choices and build the cache key. */
interface LightSide {
  request: CompareSideRequest;
  basis: CompareBasisKind;
  serviceDays: ServiceDayDefinition[];
  routes: Route[];
  assumptions: CostingAssumptionsInput;
}

const sideLabel = (side: CompareSide) => side;

/** JSON with object keys in sorted order, so two equal values always make one cache key, however their fields were assembled. */
function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
    : item);
}

export class CompareService implements CompareCommands {
  private engine?: CompareEngine;
  private cacheStamp: string | undefined;
  private readonly cache = new Map<string, Promise<SideComputation>>();

  /**
   * `saveStamp` returns a value that changes whenever the Project is saved (see `createSaveStamp`); cached sides are valid only for one
   * stamp. `createEngine` makes the worker engine, once, on the first comparison.
   */
  constructor(
    private readonly sources: CompareSources,
    private readonly saveStamp: () => string,
    private readonly createEngine: () => CompareEngine = () => createCompareEngine(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  dispose(): void {
    this.engine?.dispose();
    this.engine = undefined;
    this.cache.clear();
    this.cacheStamp = undefined;
  }

  async compare(request: CompareRequest, onProgress?: (progress: CompareProgress) => void): Promise<CompareOutcome> {
    const stamp = this.saveStamp();
    if (stamp !== this.cacheStamp) {
      this.cache.clear();
      this.cacheStamp = stamp;
    }

    onProgress?.({ stage: 'reading', side: 'baseline', done: 0, total: 2, message: 'Reading baseline…' });
    const baseline = await this.readLight(request.baseline, 'baseline');
    onProgress?.({ stage: 'reading', side: 'proposed', done: 1, total: 2, message: 'Reading proposed…' });
    const proposed = await this.readLight(request.proposed, 'proposed');
    onProgress?.({ stage: 'reading', done: 2, total: 2, message: 'Reading proposed…' });
    const missing: CompareError[] = [baseline, proposed].flatMap((side, index) => ('error' in side ? [{ ...side.error, side: (index === 0 ? 'baseline' : 'proposed') as CompareSide }] : []));
    if ('error' in baseline || 'error' in proposed) return { status: 'error', errors: missing };

    const routeMatch = matchRoutes(baseline.routes, proposed.routes);
    const dayPairs = matchServiceDays(baseline.serviceDays, proposed.serviceDays);
    if (request.day !== 'annual' && !dayPairs.some((pair) => pair.key === request.day)) {
      return { status: 'error', errors: [{ code: 'compare.dayMissing', findings: [], detail: request.day }] };
    }
    if (dayPairs.length === 0) return { status: 'error', errors: [{ code: 'compare.dayMissing', findings: [], detail: request.day }] };

    // Items 6 and 7: the choices act on copies; the records read are never changed.
    const assumptions = applyRateChoice(request.rates, baseline.assumptions, proposed.assumptions);
    const counted = applyCountChoice(request.counts, { serviceDays: baseline.serviceDays, routes: baseline.routes }, { serviceDays: proposed.serviceDays, routes: proposed.routes }, routeMatch.pairs, dayPairs);

    const baselineResult = await this.sideResult(request.baseline, 'baseline', baseline.basis, counted.baseline, assumptions.baseline, onProgress);
    const proposedResult = await this.sideResult(request.proposed, 'proposed', proposed.basis, counted.proposed, assumptions.proposed, onProgress);
    const errors: CompareError[] = [];
    if (baselineResult.status === 'error') errors.push({ ...baselineResult.error, side: 'baseline' });
    if (proposedResult.status === 'error') errors.push({ ...proposedResult.error, side: 'proposed' });
    if (baselineResult.status === 'error' || proposedResult.status === 'error') return { status: 'error', errors };

    onProgress?.({ stage: 'comparing', done: 0, total: 1, message: 'Comparing…' });
    const input: ComparisonInput = {
      routeMatch,
      dayPairs,
      day: request.day,
      baseline: sideDaysByPair(dayPairs, 'baseline', baselineResult.days),
      proposed: sideDaysByPair(dayPairs, 'proposed', proposedResult.days),
    };
    const comparison = buildComparison(input);
    onProgress?.({ stage: 'comparing', done: 1, total: 1, message: 'Comparing…' });

    return {
      status: 'ok',
      comparison,
      differences: differencesOf(request, baseline, proposed, routeMatch, dayPairs),
      dayPairs,
      sides: { baseline: baselineResult.info, proposed: proposedResult.info },
    };
  }

  /** The cheap read of a side: its Routes, service days and assumptions, after checking that the Trip profile and Blocking scenario belong together. */
  private async readLight(request: CompareSideRequest, side: CompareSide): Promise<LightSide | { error: Omit<CompareError, 'side'> }> {
    const missing = (detail: string) => ({ error: { code: 'compare.sideMissing' as const, findings: [], detail } });
    const [scenario, tripProfile] = await Promise.all([this.sources.getScenario(request.scenarioId), this.sources.getTripProfile(request.tripProfileId)]);
    if (!scenario) return missing(`The ${sideLabel(side)} Scenario is no longer in this Project.`);
    if (!tripProfile || tripProfile.scenarioId !== scenario.id) return missing(`The ${sideLabel(side)} Trip profile is not in its Scenario.`);
    if (request.blockingScenarioId !== null) {
      const blockingScenarios = await this.sources.listBlockingScenarios(scenario.id);
      const blockingScenario = blockingScenarios.find((candidate) => candidate.id === request.blockingScenarioId);
      if (!blockingScenario || blockingScenario.tripProfileId !== tripProfile.id) return missing(`The ${sideLabel(side)} Blocking scenario is not one of its Trip profile.`);
    }
    const [serviceDays, routes, record] = await Promise.all([this.sources.listServiceDays(scenario.id), this.sources.listRoutes(scenario.id), this.sources.getCostingAssumptions(scenario.id)]);
    const basis: CompareBasisKind = request.blockingScenarioId === null ? 'estimated' : 'blocked';
    return { request, basis, serviceDays, routes, assumptions: sideAssumptions(record, tripProfile.id, basis === 'estimated', new Date(this.now()).getFullYear()) };
  }

  /** The cached result of a side, or its costing on the engine. The key holds everything that reaches the result. */
  private sideResult(
    request: CompareSideRequest,
    side: CompareSide,
    basis: CompareBasisKind,
    counted: CountSide,
    assumptions: CostingAssumptionsInput,
    onProgress?: (progress: CompareProgress) => void,
  ): Promise<SideComputation> {
    const key = stableKey([
      request.scenarioId, request.tripProfileId, request.blockingScenarioId,
      assumptions,
      counted.serviceDays.map((day) => [day.id, day.annualServiceDays]),
      counted.routes.map((route) => [route.id, route.ownAnnualServiceDays ?? null]),
    ]);
    const cached = this.cache.get(key);
    if (cached) {
      // Most recently used last.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const computation = this.compute(request, side, basis, counted, assumptions, onProgress);
    this.cache.set(key, computation);
    // A failed read must not stay cached: the next comparison reads again.
    computation.catch(() => { if (this.cache.get(key) === computation) this.cache.delete(key); });
    while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value as string);
    return computation;
  }

  private async compute(
    request: CompareSideRequest,
    side: CompareSide,
    basis: CompareBasisKind,
    counted: CountSide,
    assumptions: CostingAssumptionsInput,
    onProgress?: (progress: CompareProgress) => void,
  ): Promise<SideComputation> {
    const [patterns, directions] = await Promise.all([this.sources.listPatterns(request.scenarioId), this.sources.listDirections(request.scenarioId)]);
    let sideInput;
    if (basis === 'blocked') {
      const context = await buildCostingCalculationContext(this.sources, request.scenarioId, request.blockingScenarioId as string);
      if (!context) return { status: 'error', error: { code: 'compare.sideMissing', findings: [], detail: `The ${side} Blocking scenario cannot be read.` } };
      sideInput = { kind: 'blocked' as const, context: { ...context, serviceDays: counted.serviceDays, routes: counted.routes } };
    } else {
      const context = await buildEstimatedCostingContext(this.sources, request.scenarioId, request.tripProfileId);
      if (!context) return { status: 'error', error: { code: 'compare.sideMissing', findings: [], detail: `The ${side} Trip profile cannot be read.` } };
      sideInput = { kind: 'estimated' as const, context: { ...context, serviceDays: counted.serviceDays, routes: counted.routes } };
    }
    this.engine ??= this.createEngine();
    return this.engine.computeSide({ side, basis: sideInput, assumptions, patterns, directions }, onProgress);
  }
}

/** Each side's figures by service day pair key, from the figures by the side's own service day IDs. */
function sideDaysByPair(dayPairs: ServiceDayPair[], side: CompareSide, days: Map<EntityId, SideDay>): Map<string, SideDay> {
  const result = new Map<string, SideDay>();
  for (const pair of dayPairs) {
    const day = pair[side];
    const figures = day ? days.get(day.id) : undefined;
    if (figures) result.set(pair.key, figures);
  }
  return result;
}

/** A Route's own counts for the matched days: the switch, and each matched day's count by day pair key (only days the Route has a count for). */
function ownCountsOf(route: Route, side: CompareSide, dayPairs: ServiceDayPair[]): CompareOwnCounts {
  const own = route.ownAnnualServiceDays;
  const byDay: Record<string, number> = {};
  for (const pair of dayPairs) {
    const day = pair[side];
    if (pair.baseline && pair.proposed && day && own && Object.prototype.hasOwnProperty.call(own.countsByServiceDayId, day.id)) byDay[pair.key] = own.countsByServiceDayId[day.id];
  }
  return { enabled: own?.enabled === true, byDay };
}

/**
 * Decision 0091 item 8. What differs between the sides' OWN values (before the menus' replacement): rates, annual counts of matched days
 * and of matched Routes, and the cost basis. Estimate factors are never replaced (item 6) and are not listed here.
 */
function differencesOf(request: CompareRequest, baseline: LightSide, proposed: LightSide, routeMatch: RouteMatch, dayPairs: ServiceDayPair[]): CompareDifference[] {
  const differences: CompareDifference[] = [];
  const baselineRates = rateValues(baseline.assumptions);
  const proposedRates = rateValues(proposed.assumptions);
  if (!sameRates(baselineRates, proposedRates)) differences.push({ code: 'compare.ratesDiffer', applied: request.rates, baseline: baselineRates, proposed: proposedRates });

  const days = dayPairs
    .filter((pair) => pair.baseline && pair.proposed && pair.baseline.annualServiceDays !== pair.proposed.annualServiceDays)
    .map((pair) => ({ key: pair.key, name: pair.name, baseline: pair.baseline!.annualServiceDays, proposed: pair.proposed!.annualServiceDays }));
  const routes = routeMatch.pairs.flatMap((pair) => {
    if (!pair.baseline || !pair.proposed) return [];
    const left = ownCountsOf(pair.baseline, 'baseline', dayPairs);
    const right = ownCountsOf(pair.proposed, 'proposed', dayPairs);
    const same = left.enabled === right.enabled && (!left.enabled || JSON.stringify(left.byDay) === JSON.stringify(right.byDay));
    return same ? [] : [{ name: pair.proposed.name, baseline: left, proposed: right }];
  });
  if (days.length > 0 || routes.length > 0) differences.push({ code: 'compare.countsDiffer', applied: request.counts, days, routes });

  if (baseline.basis !== proposed.basis) differences.push({ code: 'compare.basisDiffers', baseline: baseline.basis, proposed: proposed.basis });
  return differences;
}
