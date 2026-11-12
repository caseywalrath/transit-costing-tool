import {
  costingAppliedRates,
  validateAnnualServiceDays,
  validateCostingAssumptions,
  type CostingAssumptionsInput,
  type CostingDailyYearResult,
  type CostingEstimateState,
  type CostingFinding,
} from './costing';
import { sortServiceDays } from './serviceDays';
import { tripRunTimeSeconds } from './trips';
import type { CostingAssumptions, CostingEstimateFactors, CostingFactorPair, Route, RouteEstimateFactors, RoutePattern, Scenario, ServiceDayDefinition, Trip, TripProfile, TripProfileEstimateFactors } from './types';

/**
 * Estimated cost basis (Decision 0051): Revenue Hours and Platform Hours estimated from the running hours of a Trip Profile's Trips and
 * typed layover and deadhead factors, then costed exactly as the blocked basis is. Pure; nothing here is stored.
 *
 *   Revenue = Running ÷ (1 − layover)        Platform = Revenue ÷ (1 − deadhead)
 */

export type CostingFactorSource = 'serviceDay' | 'allDays';
export interface ResolvedDayFactors {
  layoverFraction?: number; layoverSource?: CostingFactorSource;
  deadheadFraction?: number; deadheadSource?: CostingFactorSource;
}

/** Each factor comes from the day's own row, else from All days, independently of the other factor. */
export function resolveDayFactors(factors: CostingEstimateFactors | undefined, serviceDayId: string): ResolvedDayFactors {
  const row = factors?.serviceDays?.find((candidate) => candidate.serviceDayId === serviceDayId);
  const resolved: ResolvedDayFactors = {};
  if (row?.layoverFraction !== undefined) { resolved.layoverFraction = row.layoverFraction; resolved.layoverSource = 'serviceDay'; }
  else if (factors?.allDays?.layoverFraction !== undefined) { resolved.layoverFraction = factors.allDays.layoverFraction; resolved.layoverSource = 'allDays'; }
  if (row?.deadheadFraction !== undefined) { resolved.deadheadFraction = row.deadheadFraction; resolved.deadheadSource = 'serviceDay'; }
  else if (factors?.allDays?.deadheadFraction !== undefined) { resolved.deadheadFraction = factors.allDays.deadheadFraction; resolved.deadheadSource = 'allDays'; }
  return resolved;
}

/** Decision 0077. Where a Route factor comes from: the Route's day row, the Route's All days row, or the Trip Profile's resolution. */
export type RouteFactorSource = 'routeServiceDay' | 'routeAllDays' | CostingFactorSource;
export interface ResolvedRouteDayFactors {
  layoverFraction?: number; layoverSource?: RouteFactorSource;
  deadheadFraction?: number; deadheadSource?: RouteFactorSource;
}

const routeFactorSource = (source: CostingFactorSource): RouteFactorSource => (source === 'serviceDay' ? 'routeServiceDay' : 'routeAllDays');

/**
 * Decision 0077 item 2.2. Each factor independently: the Route's day row, else the Route's All days row, else `profileFactors` resolved by
 * `resolveDayFactors`. `routeFactors` undefined means the Route has no entry.
 */
export function resolveRouteDayFactors(routeFactors: CostingEstimateFactors | undefined, profileFactors: CostingEstimateFactors | undefined, serviceDayId: string): ResolvedRouteDayFactors {
  const fromRoute = resolveDayFactors(routeFactors, serviceDayId);
  const fromProfile = resolveDayFactors(profileFactors, serviceDayId);
  const resolved: ResolvedRouteDayFactors = {};
  if (fromRoute.layoverSource) { resolved.layoverFraction = fromRoute.layoverFraction; resolved.layoverSource = routeFactorSource(fromRoute.layoverSource); }
  else if (fromProfile.layoverSource) { resolved.layoverFraction = fromProfile.layoverFraction; resolved.layoverSource = fromProfile.layoverSource; }
  if (fromRoute.deadheadSource) { resolved.deadheadFraction = fromRoute.deadheadFraction; resolved.deadheadSource = routeFactorSource(fromRoute.deadheadSource); }
  else if (fromProfile.deadheadSource) { resolved.deadheadFraction = fromProfile.deadheadFraction; resolved.deadheadSource = fromProfile.deadheadSource; }
  return resolved;
}

function definedPair(pair: CostingFactorPair | undefined): CostingFactorPair {
  return {
    ...(pair?.layoverFraction !== undefined ? { layoverFraction: pair.layoverFraction } : {}),
    ...(pair?.deadheadFraction !== undefined ? { deadheadFraction: pair.deadheadFraction } : {}),
  };
}

/**
 * Drops rows with no value and rows of days not in `serviceDays`, and sorts the rows in service-day order. Returns `undefined` when nothing
 * is left. Values are not judged here: an invalid value stays so that validation can report it. Used before every save.
 */
export function normalizeEstimateFactors(factors: CostingEstimateFactors | undefined, serviceDays: ServiceDayDefinition[]): CostingEstimateFactors | undefined {
  if (!factors) return undefined;
  const order = new Map(sortServiceDays(serviceDays).map((day, index) => [day.id, index]));
  const rows = (Array.isArray(factors.serviceDays) ? factors.serviceDays : [])
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => order.has(row.serviceDayId) && (row.layoverFraction !== undefined || row.deadheadFraction !== undefined))
    .sort((left, right) => order.get(left.row.serviceDayId)! - order.get(right.row.serviceDayId)! || left.index - right.index)
    .map(({ row }) => ({ serviceDayId: row.serviceDayId, ...definedPair(row) }));
  const allDays = definedPair(factors.allDays);
  if (rows.length === 0 && Object.keys(allDays).length === 0) return undefined;
  return { allDays, serviceDays: rows };
}

/** Where the factors of a Trip Profile come from (Decision 0062): its own entry, the Scenario's shared factors, or nowhere. */
export type EstimateFactorOwner = 'tripProfile' | 'scenario' | 'none';

/** The factors an estimated cost basis of `tripProfileId` uses. An own entry, even an empty one, replaces the Scenario's shared factors. */
export function estimateFactorsForTripProfile(
  assumptions: Pick<CostingAssumptions, 'estimateFactors' | 'tripProfileEstimateFactors'> | undefined,
  tripProfileId: string,
): { factors?: CostingEstimateFactors; owner: EstimateFactorOwner } {
  const own = assumptions?.tripProfileEstimateFactors?.find((entry) => entry.tripProfileId === tripProfileId);
  if (own) return { factors: own.factors, owner: 'tripProfile' };
  if (assumptions?.estimateFactors) return { factors: assumptions.estimateFactors, owner: 'scenario' };
  return { owner: 'none' };
}

/**
 * Returns the entries with `tripProfileId` set to `factors` (an empty set when `factors` is undefined, so the Profile no longer falls back to
 * the Scenario's factors), and drops entries of Trip Profiles not in `tripProfileIds`. Entries keep their order; a new one goes last.
 */
export function setTripProfileEstimateFactors(
  entries: TripProfileEstimateFactors[] | undefined,
  tripProfileId: string,
  factors: CostingEstimateFactors | undefined,
  tripProfileIds: ReadonlySet<string>,
): TripProfileEstimateFactors[] {
  const value = factors ?? { allDays: {}, serviceDays: [] };
  const kept = (entries ?? []).filter((entry) => tripProfileIds.has(entry.tripProfileId));
  return kept.some((entry) => entry.tripProfileId === tripProfileId)
    ? kept.map((entry) => entry.tripProfileId === tripProfileId ? { tripProfileId, factors: value } : entry)
    : [...kept, { tripProfileId, factors: value }];
}

/** Decision 0077. The Route factors of one Trip Profile, in stored order, for the calculation input. */
export function routeEstimateFactorsForTripProfile(assumptions: Pick<CostingAssumptions, 'routeEstimateFactors'> | undefined, tripProfileId: string): { routeId: string; factors: CostingEstimateFactors }[] {
  return (assumptions?.routeEstimateFactors ?? [])
    .filter((entry) => entry.tripProfileId === tripProfileId)
    .map((entry) => ({ routeId: entry.routeId, factors: entry.factors }));
}

/**
 * Decision 0077. Sets the entry of one Trip Profile × Route pair, and drops entries of Trip Profiles or Routes not in the sets. An undefined
 * `factors` removes the pair's entry, so the Route inherits again. A new entry goes last.
 */
export function setRouteEstimateFactors(
  entries: RouteEstimateFactors[] | undefined,
  tripProfileId: string,
  routeId: string,
  factors: CostingEstimateFactors | undefined,
  tripProfileIds: ReadonlySet<string>,
  routeIds: ReadonlySet<string>,
): RouteEstimateFactors[] {
  const kept = (entries ?? []).filter((entry) => tripProfileIds.has(entry.tripProfileId) && routeIds.has(entry.routeId));
  const isPair = (entry: RouteEstimateFactors) => entry.tripProfileId === tripProfileId && entry.routeId === routeId;
  if (factors === undefined) return kept.filter((entry) => !isPair(entry));
  const next: RouteEstimateFactors = { tripProfileId, routeId, factors };
  return kept.some(isPair) ? kept.map((entry) => (isPair(entry) ? next : entry)) : [...kept, next];
}

/**
 * The assumptions after a Trip Profile copy (Decision 0062, extended by Decision 0077): the copy gets the source's own factors and a clone of
 * each of the source's Route entries. Returns `undefined` when the source has neither, so nothing needs writing and the copy uses the
 * Scenario's shared factors, as the source does.
 */
export function assumptionsAfterTripProfileCopy(assumptions: CostingAssumptions | undefined, sourceTripProfileId: string, targetTripProfileId: string, now: string): CostingAssumptions | undefined {
  const own = assumptions?.tripProfileEstimateFactors?.find((entry) => entry.tripProfileId === sourceTripProfileId);
  const routeEntries = (assumptions?.routeEstimateFactors ?? []).filter((entry) => entry.tripProfileId === sourceTripProfileId);
  if (!assumptions || (!own && routeEntries.length === 0)) return undefined;
  const next: CostingAssumptions = { ...assumptions, updatedAt: now };
  if (own) {
    const others = (assumptions.tripProfileEstimateFactors ?? []).filter((entry) => entry.tripProfileId !== targetTripProfileId);
    next.tripProfileEstimateFactors = [...others, { tripProfileId: targetTripProfileId, factors: structuredClone(own.factors) }];
  }
  if (routeEntries.length > 0) {
    const others = (assumptions.routeEstimateFactors ?? []).filter((entry) => entry.tripProfileId !== targetTripProfileId);
    next.routeEstimateFactors = [...others, ...routeEntries.map((entry) => ({ tripProfileId: targetTripProfileId, routeId: entry.routeId, factors: structuredClone(entry.factors) }))];
  }
  return next;
}

/**
 * The assumptions after a Trip Profile is deleted (Decision 0062, extended by Decision 0077 to its Route entries), or `undefined` when the
 * Profile had neither.
 */
export function assumptionsAfterTripProfileDeletion(assumptions: CostingAssumptions | undefined, tripProfileId: string, now: string): CostingAssumptions | undefined {
  const hasOwn = assumptions?.tripProfileEstimateFactors?.some((entry) => entry.tripProfileId === tripProfileId) ?? false;
  const hasRoute = assumptions?.routeEstimateFactors?.some((entry) => entry.tripProfileId === tripProfileId) ?? false;
  if (!assumptions || (!hasOwn && !hasRoute)) return undefined;
  return {
    ...assumptions,
    ...(hasOwn ? { tripProfileEstimateFactors: assumptions.tripProfileEstimateFactors!.filter((entry) => entry.tripProfileId !== tripProfileId) } : {}),
    ...(hasRoute ? { routeEstimateFactors: assumptions.routeEstimateFactors!.filter((entry) => entry.tripProfileId !== tripProfileId) } : {}),
    updatedAt: now,
  };
}

/** Decision 0077. The assumptions after Route deletion: entries of Routes not in `routeIds` (the Routes that remain) are dropped. `undefined` when nothing changes. */
export function assumptionsAfterRouteDeletion(assumptions: CostingAssumptions | undefined, routeIds: ReadonlySet<string>, now: string): CostingAssumptions | undefined {
  const entries = assumptions?.routeEstimateFactors;
  if (!assumptions || !entries?.some((entry) => !routeIds.has(entry.routeId))) return undefined;
  return { ...assumptions, routeEstimateFactors: entries.filter((entry) => routeIds.has(entry.routeId)), updatedAt: now };
}

/** The factors with each service-day row renamed through `serviceDayIds`, for Scenario copies and import as a copy. */
export function remapEstimateFactorDays(factors: CostingEstimateFactors, serviceDayIds: ReadonlyMap<string, string>): CostingEstimateFactors {
  return { ...factors, serviceDays: factors.serviceDays.map((row) => ({ ...row, serviceDayId: serviceDayIds.get(row.serviceDayId) ?? row.serviceDayId })) };
}

/** Trip-Profile-owned factors with Trip Profile and service-day IDs renamed, for Scenario copies and import as a copy (Decision 0062). */
export function remapTripProfileEstimateFactors(entries: TripProfileEstimateFactors[], tripProfileIds: ReadonlyMap<string, string>, serviceDayIds: ReadonlyMap<string, string>): TripProfileEstimateFactors[] {
  return entries.map((entry) => ({ tripProfileId: tripProfileIds.get(entry.tripProfileId) ?? entry.tripProfileId, factors: remapEstimateFactorDays(entry.factors, serviceDayIds) }));
}

/** Decision 0077. Route factors with Trip Profile, Route and service-day IDs renamed, for Scenario copies and import as a copy. */
export function remapRouteEstimateFactors(entries: RouteEstimateFactors[], tripProfileIds: ReadonlyMap<string, string>, routeIds: ReadonlyMap<string, string>, serviceDayIds: ReadonlyMap<string, string>): RouteEstimateFactors[] {
  return entries.map((entry) => ({
    tripProfileId: tripProfileIds.get(entry.tripProfileId) ?? entry.tripProfileId,
    routeId: routeIds.get(entry.routeId) ?? entry.routeId,
    factors: remapEstimateFactorDays(entry.factors, serviceDayIds),
  }));
}

/** One direction of a Route on one service day, as the implied-service check sees it (Decision 0062). */
export interface ImpliedDirectionService {
  /** The Direction ID of the Patterns, or the Pattern ID when a legacy Pattern has no Direction. */
  directionKey: string;
  tripCount: number;
  meanRunSeconds: number;
  /** The median gap between consecutive first departures of the direction. Undefined with fewer than two distinct departures. */
  headwaySeconds?: number;
}
/** What a layover % implies for one Route on one service day. Derived and never stored. */
export interface ImpliedRouteService {
  routeId: string;
  routeName?: string;
  directions: ImpliedDirectionService[];
  /** The mean run time of each direction, added: the running part of one cycle through every direction. */
  roundTripRunSeconds: number;
  /** The total run time of the Route's Trips on the day, in hours (Decision 0063). */
  runningHours: number;
  /** `roundTripRunSeconds ÷ (1 − layover)`. Undefined without a layover factor. */
  roundTripWithLayoverSeconds?: number;
  /** Σ over directions of (mean run ÷ (1 − layover)) ÷ headway. Undefined without a layover factor or a headway in any direction. */
  impliedVehicles?: number;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The cycle and vehicles a layover factor implies for the Trips of one service day, per Route (Decision 0062). Trips without a usable run
 * time are left out. Directions are listed in order of their key; Routes in order of name, then ID.
 */
export function deriveImpliedService(
  trips: Trip[],
  patterns: RoutePattern[],
  layoverFraction: number | undefined,
  routes: Route[] = [],
): ImpliedRouteService[] {
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const routeName = new Map(routes.map((route) => [route.id, route.name]));
  const byRoute = new Map<string, Map<string, { runs: number[]; departures: number[] }>>();
  for (const trip of trips) {
    const run = tripRunTimeSeconds(trip);
    if (run === undefined) continue;
    const pattern = patternById.get(trip.patternId);
    const directionKey = pattern?.directionId ?? trip.patternId;
    const directions = byRoute.get(trip.routeId) ?? new Map();
    byRoute.set(trip.routeId, directions);
    const direction = directions.get(directionKey) ?? { runs: [], departures: [] };
    directions.set(directionKey, direction);
    direction.runs.push(run);
    direction.departures.push([...trip.stopTimes].sort((left, right) => left.sequence - right.sequence)[0].time);
  }
  const usableLayover = layoverFraction !== undefined && Number.isFinite(layoverFraction) && layoverFraction >= 0 && layoverFraction < 1 ? layoverFraction : undefined;
  return [...byRoute.entries()]
    .map(([routeId, directions]): ImpliedRouteService => {
      const listed = [...directions.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([directionKey, value]): ImpliedDirectionService => {
        const departures = [...value.departures].sort((left, right) => left - right);
        const gaps = departures.slice(1).map((time, index) => time - departures[index]).filter((gap) => gap > 0);
        const headwaySeconds = median(gaps);
        return {
          directionKey, tripCount: value.runs.length, meanRunSeconds: value.runs.reduce((sum, run) => sum + run, 0) / value.runs.length,
          ...(headwaySeconds !== undefined ? { headwaySeconds } : {}),
        };
      });
      const roundTripRunSeconds = listed.reduce((sum, direction) => sum + direction.meanRunSeconds, 0);
      const runningHours = listed.reduce((sum, direction) => sum + direction.meanRunSeconds * direction.tripCount, 0) / 3600;
      const route: ImpliedRouteService = { routeId, ...(routeName.has(routeId) ? { routeName: routeName.get(routeId) } : {}), directions: listed, roundTripRunSeconds, runningHours };
      if (usableLayover === undefined) return route;
      route.roundTripWithLayoverSeconds = roundTripRunSeconds / (1 - usableLayover);
      if (listed.every((direction) => direction.headwaySeconds !== undefined)) {
        route.impliedVehicles = listed.reduce((sum, direction) => sum + direction.meanRunSeconds / (1 - usableLayover) / direction.headwaySeconds!, 0);
      }
      return route;
    })
    .sort((left, right) => (left.routeName ?? '').localeCompare(right.routeName ?? '') || left.routeId.localeCompare(right.routeId));
}

/** `patterns` and `routes` are optional; without patterns, `impliedService` is not derived. */
export interface EstimatedCostingContext { scenario: Scenario; serviceDays: ServiceDayDefinition[]; tripProfile: TripProfile; trips: Trip[]; patterns?: RoutePattern[]; routes?: Route[] }
export interface EstimatedCostingInput extends EstimatedCostingContext { assumptions: CostingAssumptionsInput }

export interface EstimatedCostingDailyResult {
  serviceDayId: string; serviceDayName: string; serviceDayKind: ServiceDayDefinition['kind']; annualServiceDays: number;
  tripCount: number; tripsWithoutRunTimeCount: number;
  runningHoursPerDay: number; annualRunningHours: number;
  factors: ResolvedDayFactors;
  /** Decision 0062. Present when the context carries the Patterns. */
  impliedService?: ImpliedRouteService[];
  revenueHoursPerDay?: number; platformHoursPerDay?: number;
  annualRevenueHours?: number; annualPlatformHours?: number;
  yearCosts: CostingDailyYearResult[]; // empty without a rate or without revenue hours
}
export interface EstimatedCostingYearResult {
  serviceYear: number; appliedRateUsdPerRevenueHour: number;
  annualRunningHours: number; annualRevenueHours: number; annualPlatformHours?: number; annualCostUsd: number;
}
export type EstimatedCostingNoEstimateReason = 'noTrips' | 'layoverFactorMissing' | 'rateMissing';
export interface EstimatedCostingCalculationResult {
  basis: 'estimated'; tripProfileId: string;
  state: CostingEstimateState; noEstimateReason?: EstimatedCostingNoEstimateReason;
  sourceRate?: number; sourceRateYear: number; annualEscalation: number;
  tripCount: number; tripsWithoutRunTimeCount: number;
  findings: CostingFinding[];
  dailyRows: EstimatedCostingDailyResult[]; yearRows: EstimatedCostingYearResult[];
}

function finding(
  ruleId: string,
  severity: CostingFinding['severity'],
  entityType: string,
  entityId: string,
  field?: string,
  parameters?: CostingFinding['parameters'],
): CostingFinding {
  return { ruleId, severity, entityType, entityId, ...(field ? { field } : {}), messageKey: ruleId, ...(parameters ? { parameters } : {}) };
}

export function calculateEstimatedCosting(input: EstimatedCostingInput): EstimatedCostingCalculationResult {
  const { scenario, serviceDays, tripProfile, trips, assumptions } = input;
  const findings = [
    ...validateCostingAssumptions(assumptions, scenario.id),
    ...validateAnnualServiceDays(serviceDays, scenario.id),
  ];
  if (tripProfile.scenarioId !== scenario.id) findings.push(finding('costing.tripProfileMismatch', 'error', 'tripProfile', tripProfile.id));
  const serviceDayIds = new Set(serviceDays.map((day) => day.id));
  const tripIds = new Set<string>();
  for (const trip of trips) {
    if (tripIds.has(trip.id)) findings.push(finding('costing.duplicateTrip', 'error', 'trip', trip.id));
    tripIds.add(trip.id);
    if (trip.scenarioId !== scenario.id || trip.tripProfileId !== tripProfile.id || !serviceDayIds.has(trip.serviceDayId)) {
      findings.push(finding('costing.tripSourceMismatch', 'error', 'trip', trip.id, undefined, { serviceDayId: trip.serviceDayId }));
    }
  }

  const result = (state: CostingEstimateState, dailyRows: EstimatedCostingDailyResult[], yearRows: EstimatedCostingYearResult[], reason?: EstimatedCostingNoEstimateReason): EstimatedCostingCalculationResult => ({
    basis: 'estimated',
    tripProfileId: tripProfile.id,
    state,
    ...(reason ? { noEstimateReason: reason } : {}),
    ...(assumptions.enteredRate !== undefined && Number.isFinite(assumptions.enteredRate) ? { sourceRate: assumptions.enteredRate } : {}),
    sourceRateYear: assumptions.rateYear,
    annualEscalation: assumptions.annualEscalation,
    tripCount: trips.length,
    tripsWithoutRunTimeCount: dailyRows.reduce((sum, row) => sum + row.tripsWithoutRunTimeCount, 0),
    findings,
    dailyRows,
    yearRows,
  });
  if (findings.some((item) => item.severity === 'error')) return result('invalid', [], []);

  for (const row of assumptions.estimateFactors?.serviceDays ?? []) {
    if (!serviceDayIds.has(row.serviceDayId)) {
      findings.push(finding('costing.estimateFactorUnknownDay', 'warning', 'costingAssumptions', scenario.id, 'estimateFactors', { serviceDayId: row.serviceDayId }));
    }
  }

  // Whole seconds are added per day and converted to hours once, so hours stay exact (as the blocked basis does).
  const sortedDays = sortServiceDays(serviceDays);
  const perDay = new Map(sortedDays.map((day) => [day.id, { seconds: 0, tripCount: 0, withoutRunTime: 0 }]));
  let tripsWithRunTime = 0;
  const tripsByDay = new Map<string, Trip[]>();
  for (const trip of trips) {
    const dayTrips = tripsByDay.get(trip.serviceDayId);
    if (dayTrips) dayTrips.push(trip); else tripsByDay.set(trip.serviceDayId, [trip]);
    const day = perDay.get(trip.serviceDayId)!;
    day.tripCount += 1;
    const seconds = tripRunTimeSeconds(trip);
    if (seconds === undefined) { day.withoutRunTime += 1; continue; }
    day.seconds += seconds;
    tripsWithRunTime += 1;
  }

  const dailyRows: EstimatedCostingDailyResult[] = sortedDays.map((day) => {
    const quantities = perDay.get(day.id)!;
    const runningHoursPerDay = quantities.seconds / 3600;
    const factors = resolveDayFactors(assumptions.estimateFactors, day.id);
    const row: EstimatedCostingDailyResult = {
      serviceDayId: day.id,
      serviceDayName: day.name,
      serviceDayKind: day.kind,
      annualServiceDays: day.annualServiceDays,
      tripCount: quantities.tripCount,
      tripsWithoutRunTimeCount: quantities.withoutRunTime,
      runningHoursPerDay,
      annualRunningHours: runningHoursPerDay * day.annualServiceDays,
      factors,
      ...(input.patterns ? { impliedService: deriveImpliedService(tripsByDay.get(day.id) ?? [], input.patterns, factors.layoverFraction, input.routes) } : {}),
      yearCosts: [],
    };
    if (quantities.seconds === 0) {
      row.revenueHoursPerDay = 0;
      row.platformHoursPerDay = 0;
    } else if (factors.layoverFraction !== undefined) {
      row.revenueHoursPerDay = runningHoursPerDay / (1 - factors.layoverFraction);
      if (factors.deadheadFraction !== undefined) row.platformHoursPerDay = row.revenueHoursPerDay / (1 - factors.deadheadFraction);
    } else {
      findings.push(finding('costing.layoverFactorMissing', 'warning', 'serviceDay', day.id, 'estimateFactors', { serviceDayId: day.id }));
    }
    if (quantities.seconds > 0 && factors.deadheadFraction === undefined) {
      findings.push(finding('costing.deadheadFactorMissing', 'warning', 'serviceDay', day.id, 'estimateFactors', { serviceDayId: day.id }));
    }
    if (row.revenueHoursPerDay !== undefined) row.annualRevenueHours = row.revenueHoursPerDay * day.annualServiceDays;
    if (row.platformHoursPerDay !== undefined) row.annualPlatformHours = row.platformHoursPerDay * day.annualServiceDays;
    return row;
  });

  if (tripsWithRunTime === 0) {
    findings.push(finding('costing.noTrips', 'warning', 'tripProfile', tripProfile.id));
    return result('noEstimate', dailyRows, [], 'noTrips');
  }
  if (dailyRows.some((row) => row.revenueHoursPerDay === undefined)) return result('noEstimate', dailyRows, [], 'layoverFactorMissing');
  if (assumptions.enteredRate === undefined) {
    findings.push(finding('costing.rateMissing', 'warning', 'costingAssumptions', scenario.id, 'enteredRate'));
    return result('noEstimate', dailyRows, [], 'rateMissing');
  }

  const appliedRates = costingAppliedRates(assumptions);
  if (appliedRates.some(({ rate }) => !Number.isFinite(rate) || rate < 0)) {
    findings.push(finding('costing.adjustedRateInvalid', 'error', 'costingAssumptions', scenario.id, 'annualEscalation'));
    return result('invalid', [], []);
  }

  const costedRows = dailyRows.map((row) => ({
    ...row,
    yearCosts: appliedRates.map(({ serviceYear, rate }) => ({
      serviceYear,
      costPerDayUsd: row.revenueHoursPerDay! * rate,
      annualCostUsd: row.revenueHoursPerDay! * rate * row.annualServiceDays,
    })),
  }));
  const platformKnown = costedRows.every((row) => row.annualPlatformHours !== undefined);
  const yearRows: EstimatedCostingYearResult[] = appliedRates.map(({ serviceYear, rate }) => ({
    serviceYear,
    appliedRateUsdPerRevenueHour: rate,
    annualRunningHours: costedRows.reduce((sum, row) => sum + row.annualRunningHours, 0),
    annualRevenueHours: costedRows.reduce((sum, row) => sum + row.annualRevenueHours!, 0),
    ...(platformKnown ? { annualPlatformHours: costedRows.reduce((sum, row) => sum + row.annualPlatformHours!, 0) } : {}),
    annualCostUsd: costedRows.reduce((sum, row) => sum + row.yearCosts.find((cost) => cost.serviceYear === serviceYear)!.annualCostUsd, 0),
  }));
  const finiteNumbers = [
    ...costedRows.flatMap((row) => [row.runningHoursPerDay, row.annualRunningHours, row.revenueHoursPerDay!, row.annualRevenueHours!, ...(row.platformHoursPerDay !== undefined ? [row.platformHoursPerDay, row.annualPlatformHours!] : []), ...row.yearCosts.flatMap((cost) => [cost.costPerDayUsd, cost.annualCostUsd])]),
    ...yearRows.flatMap((row) => [row.annualRunningHours, row.annualRevenueHours, row.annualCostUsd, ...(row.annualPlatformHours !== undefined ? [row.annualPlatformHours] : [])]),
  ];
  if (!finiteNumbers.every(Number.isFinite)) {
    findings.push(finding('costing.calculationOverflow', 'error', 'scenario', scenario.id));
    return result('invalid', [], []);
  }

  const tripsWithoutRunTime = costedRows.reduce((sum, row) => sum + row.tripsWithoutRunTimeCount, 0);
  return result(tripsWithoutRunTime > 0 ? 'partial' : 'complete', costedRows, yearRows);
}

export const ESTIMATE_FACTOR_PERCENT_ERROR = 'Enter a percentage from 0 up to 100, or leave the cell blank.';

/** Reads a typed Layover % or Deadhead %: blank is no value; a number from 0 up to but not including 100 is the fraction. */
export function parseEstimateFactorPercent(text: string): { fraction?: number; error?: string } {
  const trimmed = text.trim().replace(/%$/, '').trim();
  if (!trimmed) return {};
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) return { error: ESTIMATE_FACTOR_PERCENT_ERROR };
  const percent = Number(trimmed);
  if (!Number.isFinite(percent) || percent >= 100) return { error: ESTIMATE_FACTOR_PERCENT_ERROR };
  return { fraction: percent / 100 };
}

/** A stored fraction as the Estimate factors grid shows it: × 100, up to two decimals, no trailing zeros (`0.178` → `17.8`). */
export function formatEstimateFactorPercent(fraction: number | undefined): string {
  return fraction === undefined ? '' : String(Number((fraction * 100).toFixed(2)));
}
