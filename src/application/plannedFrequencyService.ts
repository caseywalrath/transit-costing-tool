import { newId } from '../domain/ids';
import { normalizePeriods, validatePlannedFrequency } from '../domain/plannedFrequencies';
import { compareWithPlan, type PlanComparison } from '../domain/plannedFrequencyComparison';
import type { ScenarioRecords } from '../domain/project';
import type { EntityId, Node, PlannedFrequency, PlannedPeriod, RouteDirection, RoutePattern, ServiceDayDefinition, ValidationFinding } from '../domain/types';
import type { PlannedFrequencyRepository, RouteDefinitionRepository } from './ports';
import { fingerprint } from './reviewToken';
import { publishWrites, SaveStatusPublisher } from './saveStatus';

/**
 * The repository methods this service writes with. Plans are written only through `updateScenarioRecords`, which re-reads the stored
 * Scenario inside the write (Decision 0036), so every command here is one transaction and shows in the save status.
 */
export const PLANNED_FREQUENCY_WRITE_METHODS: readonly string[] = ['updateScenarioRecords'];

/** A period as the planner enters it. A missing `id` is assigned when the plan is saved. */
export interface PlannedPeriodDraft { id?: EntityId; startTime: number; endTime: number; headwaySeconds: number; }

/** The planner's edit of one plan. The Scenario is taken from the Route. */
export interface PlannedFrequencyDraft {
  routeId: EntityId;
  serviceDayId: EntityId;
  periods: PlannedPeriodDraft[];
  measureNodeIdByDirectionId: Record<EntityId, EntityId>;
}

/** A plan was refused because it breaks Decision 0058 item 3 or 4. Nothing was written. */
export class PlannedFrequencyValidationError extends Error {
  constructor(readonly findings: ValidationFinding[]) {
    super('The planned frequencies have validation errors.');
    this.name = 'PlannedFrequencyValidationError';
  }
}

/** A copy was applied with a preview that no longer matches the stored data. Nothing was written. */
export class PlannedFrequencyPreviewStaleError extends Error {
  constructor() {
    super('The planned frequency preview is out of date. Review the copy again.');
    this.name = 'PlannedFrequencyPreviewStaleError';
  }
}

export interface CopyFromDayPreview {
  scenarioId: EntityId;
  routeId: EntityId;
  sourceServiceDayId: EntityId;
  targetServiceDayId: EntityId;
  /** The periods that would be written, in time order. */
  periods: PlannedPeriod[];
  measureNodeIdByDirectionId: Record<EntityId, EntityId>;
  /** The target day's plan, which the copy replaces. Absent when the target day has no plan. */
  replaces?: PlannedFrequency;
  /** Fingerprint of everything the copy reads and replaces. `applyCopyFromDay` refuses a preview whose token no longer matches. */
  token: string;
}

export interface ScenarioRouteSource {
  scenarioId: EntityId;
  scenarioName: string;
  routes: Array<{ id: EntityId; name: string; shortName?: string; /** Service days of the Route that have a plan. */ plannedDayCount: number }>;
}

export interface ScenarioCopyDay {
  sourceServiceDayId: EntityId;
  sourceServiceDayName: string;
  targetServiceDayId: EntityId;
  targetServiceDayName: string;
  matchedBy: 'kind' | 'name';
  /** The target day already has a plan, which the copy replaces. */
  replaces: boolean;
  periods: PlannedPeriod[];
  /** Measure nodes that found a match in the target Route, by target direction. */
  measureNodeIdByDirectionId: Record<EntityId, EntityId>;
}

export interface ScenarioCopyUnmatchedDay { serviceDayId: EntityId; name: string; }

export interface ScenarioCopyUnmatchedNode {
  serviceDayId: EntityId;
  /** Absent when the source direction has no matching direction in the target Route. */
  targetDirectionId?: EntityId;
  sourceDirectionName: string;
  nodeName: string;
}

export interface CopyFromScenarioPreview {
  scenarioId: EntityId;
  sourceScenarioId: EntityId;
  sourceRouteId: EntityId;
  targetRouteId: EntityId;
  days: ScenarioCopyDay[];
  unmatchedDays: ScenarioCopyUnmatchedDay[];
  /** Measure nodes that are not copied, so the target uses its default node for that direction. */
  unmatchedNodes: ScenarioCopyUnmatchedNode[];
  token: string;
}

export interface DirectionPlanComparison { directionId: EntityId; directionName: string; comparison: PlanComparison; }

export interface PlanComparisonResult {
  plan?: PlannedFrequency;
  /** One entry per direction of the Route, in direction order. Empty when the day has no plan. */
  directions: DirectionPlanComparison[];
}

const clean = (text: string | undefined): string => (text ?? '').trim().toLowerCase();

const periodsToken = (periods: PlannedPeriod[]) => periods.map((period) => `${period.startTime}-${period.endTime}-${period.headwaySeconds}`);

/** The plan of one Route and Service day, if any. */
const planOf = (records: ScenarioRecords, routeId: EntityId, serviceDayId: EntityId): PlannedFrequency | undefined =>
  (records.plannedFrequencies ?? []).find((plan) => plan.routeId === routeId && plan.serviceDayId === serviceDayId);

/** Copies of the periods with new IDs, in time order. */
const clonePeriods = (periods: PlannedPeriod[]): PlannedPeriod[] => normalizePeriods(periods).map((period) => ({ ...period, id: newId() }));

function requireRoute(records: ScenarioRecords, routeId: EntityId): void {
  if (!records.routes.some((route) => route.id === routeId)) throw new Error('The Route no longer exists.');
}

function requireServiceDay(records: ScenarioRecords, serviceDayId: EntityId): ServiceDayDefinition {
  const day = records.serviceDays.find((item) => item.id === serviceDayId);
  if (!day) throw new Error('The Service day no longer exists.');
  return day;
}

const routeDirections = (records: ScenarioRecords, routeId: EntityId): RouteDirection[] =>
  (records.directions ?? []).filter((direction) => direction.routeId === routeId).sort((a, b) => a.sequence - b.sequence);

const routePatterns = (records: ScenarioRecords, routeId: EntityId): RoutePattern[] => records.patterns.filter((pattern) => pattern.routeId === routeId);

/** The node IDs that some Pattern of the direction visits. */
function servedNodes(direction: RouteDirection, patterns: RoutePattern[]): Set<EntityId> {
  const served = new Set<EntityId>();
  for (const pattern of patterns) if (pattern.directionId === direction.id) for (const point of pattern.points) served.add(point.nodeId);
  return served;
}

/** Records the stored plan list with the plan of one Route and Service day replaced, added or removed. */
function withPlan(records: ScenarioRecords, routeId: EntityId, serviceDayId: EntityId, plan: PlannedFrequency | undefined): ScenarioRecords {
  const others = (records.plannedFrequencies ?? []).filter((item) => !(item.routeId === routeId && item.serviceDayId === serviceDayId));
  return { ...records, plannedFrequencies: plan ? [...others, plan] : others };
}

/**
 * Application service for planned frequencies (Decision 0058). Commands validate, re-read stored data inside the write and write one
 * Scenario transaction. The comparison is derived on request and stores nothing.
 */
export class PlannedFrequencyService {
  private readonly repository: RouteDefinitionRepository & PlannedFrequencyRepository;

  /** `saveStatus` is the one publisher of the visible save status, shared with the other services that write (Decision 0001, amendment). */
  constructor(
    repository: RouteDefinitionRepository & PlannedFrequencyRepository,
    private readonly now: () => string = () => new Date().toISOString(),
    saveStatus: SaveStatusPublisher = new SaveStatusPublisher(now),
  ) {
    this.repository = publishWrites(repository, saveStatus, PLANNED_FREQUENCY_WRITE_METHODS);
  }

  getPlan(routeId: EntityId, serviceDayId: EntityId): Promise<PlannedFrequency | undefined> {
    return this.repository.getPlannedFrequency(routeId, serviceDayId);
  }

  /**
   * Saves the plan of one Route and Service day. An empty period list clears the plan and returns undefined. Findings of Decision 0058
   * items 3 and 4 refuse the save, except that a stored measure node that is no longer served stays (item 4) while it is unchanged.
   */
  async savePlan(draft: PlannedFrequencyDraft): Promise<PlannedFrequency | undefined> {
    const scenarioId = await this.scenarioOfRoute(draft.routeId);
    let saved: PlannedFrequency | undefined;
    await this.repository.updateScenarioRecords(scenarioId, (current) => {
      requireRoute(current, draft.routeId);
      requireServiceDay(current, draft.serviceDayId);
      const stored = planOf(current, draft.routeId, draft.serviceDayId);
      if (draft.periods.length === 0) {
        saved = undefined;
        return stored ? withPlan(current, draft.routeId, draft.serviceDayId, undefined) : current;
      }
      const at = this.now();
      const candidate: PlannedFrequency = {
        id: stored?.id ?? newId(),
        scenarioId,
        routeId: draft.routeId,
        serviceDayId: draft.serviceDayId,
        periods: normalizePeriods(draft.periods.map((period) => ({ id: period.id || newId(), startTime: period.startTime, endTime: period.endTime, headwaySeconds: period.headwaySeconds }))),
        measureNodeIdByDirectionId: { ...draft.measureNodeIdByDirectionId },
        createdAt: stored?.createdAt ?? at,
        updatedAt: at,
      };
      const findings = validatePlannedFrequency(candidate, { directions: routeDirections(current, draft.routeId), patterns: routePatterns(current, draft.routeId) })
        .filter((finding) => !(finding.ruleId === 'plannedFrequency.measureNodeNotServed'
          && stored?.measureNodeIdByDirectionId[String(finding.parameters?.directionId)] === candidate.measureNodeIdByDirectionId[String(finding.parameters?.directionId)]));
      if (findings.length) throw new PlannedFrequencyValidationError(findings);
      saved = candidate;
      return withPlan(current, draft.routeId, draft.serviceDayId, candidate);
    });
    return saved;
  }

  /** Deletes the plan of one Route and Service day. Does nothing when there is none. */
  async clearPlan(routeId: EntityId, serviceDayId: EntityId): Promise<void> {
    await this.savePlan({ routeId, serviceDayId, periods: [], measureNodeIdByDirectionId: {} });
  }

  // ---- Copy from another Service day -------------------------------------------------------------------------------------------------

  async previewCopyFromDay(routeId: EntityId, sourceServiceDayId: EntityId, targetServiceDayId: EntityId): Promise<CopyFromDayPreview> {
    const scenarioId = await this.scenarioOfRoute(routeId);
    const records = await this.records(scenarioId);
    return this.buildCopyFromDay(records, routeId, sourceServiceDayId, targetServiceDayId);
  }

  /** Writes a reviewed copy. The target day's plan is replaced with new period IDs. Refuses a preview that no longer matches storage. */
  async applyCopyFromDay(preview: CopyFromDayPreview): Promise<PlannedFrequency> {
    let saved!: PlannedFrequency;
    await this.repository.updateScenarioRecords(preview.scenarioId, (current) => {
      const fresh = this.buildCopyFromDay(current, preview.routeId, preview.sourceServiceDayId, preview.targetServiceDayId);
      if (fresh.token !== preview.token) throw new PlannedFrequencyPreviewStaleError();
      const at = this.now();
      saved = {
        id: fresh.replaces?.id ?? newId(),
        scenarioId: preview.scenarioId,
        routeId: preview.routeId,
        serviceDayId: preview.targetServiceDayId,
        periods: clonePeriods(fresh.periods),
        measureNodeIdByDirectionId: { ...fresh.measureNodeIdByDirectionId },
        createdAt: fresh.replaces?.createdAt ?? at,
        updatedAt: at,
      };
      return withPlan(current, preview.routeId, preview.targetServiceDayId, saved);
    });
    return saved;
  }

  private buildCopyFromDay(records: ScenarioRecords, routeId: EntityId, sourceServiceDayId: EntityId, targetServiceDayId: EntityId): CopyFromDayPreview {
    requireRoute(records, routeId);
    requireServiceDay(records, sourceServiceDayId);
    requireServiceDay(records, targetServiceDayId);
    if (sourceServiceDayId === targetServiceDayId) throw new Error('Choose a different Service day to copy from.');
    const source = planOf(records, routeId, sourceServiceDayId);
    if (!source) throw new Error('The Service day to copy from has no planned frequencies.');
    const replaces = planOf(records, routeId, targetServiceDayId);
    const periods = normalizePeriods(source.periods).map((period) => ({ ...period }));
    const content = { id: 'copy', source: source.id, sourceUpdatedAt: source.updatedAt, periods: periodsToken(periods), nodes: source.measureNodeIdByDirectionId, replaces: replaces ? [replaces.id, replaces.updatedAt] : null };
    const token = fingerprint({ copy: content });
    return {
      scenarioId: records.scenario.id,
      routeId,
      sourceServiceDayId,
      targetServiceDayId,
      periods,
      measureNodeIdByDirectionId: { ...source.measureNodeIdByDirectionId },
      ...(replaces ? { replaces } : {}),
      token,
    };
  }

  // ---- Copy from another Scenario ----------------------------------------------------------------------------------------------------

  /** The other Scenarios of the Project with their Routes, for the copy dialog. */
  async listScenarioRouteSources(currentScenarioId: EntityId): Promise<ScenarioRouteSource[]> {
    const current = await this.records(currentScenarioId);
    const scenarios = await this.repository.listScenarios(current.scenario.projectId);
    const sources: ScenarioRouteSource[] = [];
    for (const scenario of scenarios) {
      if (scenario.id === currentScenarioId) continue;
      const records = await this.repository.getScenarioRecords(scenario.id);
      if (!records) continue;
      sources.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        routes: records.routes.map((route) => ({
          id: route.id,
          name: route.name,
          ...(route.shortName ? { shortName: route.shortName } : {}),
          plannedDayCount: (records.plannedFrequencies ?? []).filter((plan) => plan.routeId === route.id).length,
        })),
      });
    }
    return sources;
  }

  async previewCopyFromScenario(request: { sourceScenarioId: EntityId; sourceRouteId: EntityId; targetRouteId: EntityId }): Promise<CopyFromScenarioPreview> {
    const targetScenarioId = await this.scenarioOfRoute(request.targetRouteId);
    const [target, source] = await Promise.all([this.records(targetScenarioId), this.sourceRecords(request.sourceScenarioId, targetScenarioId)]);
    return this.buildCopyFromScenario(source, request.sourceRouteId, target, request.targetRouteId);
  }

  /** Writes all matched days in one transaction. Refuses a preview that no longer matches the source or the target. */
  async applyCopyFromScenario(preview: CopyFromScenarioPreview): Promise<PlannedFrequency[]> {
    const source = await this.sourceRecords(preview.sourceScenarioId, preview.scenarioId);
    let saved: PlannedFrequency[] = [];
    await this.repository.updateScenarioRecords(preview.scenarioId, (current) => {
      const fresh = this.buildCopyFromScenario(source, preview.sourceRouteId, current, preview.targetRouteId);
      if (fresh.token !== preview.token) throw new PlannedFrequencyPreviewStaleError();
      const at = this.now();
      let next = current;
      saved = [];
      for (const day of fresh.days) {
        const replaced = planOf(current, preview.targetRouteId, day.targetServiceDayId);
        const plan: PlannedFrequency = {
          id: replaced?.id ?? newId(),
          scenarioId: preview.scenarioId,
          routeId: preview.targetRouteId,
          serviceDayId: day.targetServiceDayId,
          periods: clonePeriods(day.periods),
          measureNodeIdByDirectionId: { ...day.measureNodeIdByDirectionId },
          createdAt: replaced?.createdAt ?? at,
          updatedAt: at,
        };
        saved.push(plan);
        next = withPlan(next, preview.targetRouteId, day.targetServiceDayId, plan);
      }
      return next;
    });
    return saved;
  }

  private async sourceRecords(sourceScenarioId: EntityId, targetScenarioId: EntityId): Promise<ScenarioRecords> {
    if (sourceScenarioId === targetScenarioId) throw new Error('Choose a different Scenario to copy from.');
    const source = await this.repository.getScenarioRecords(sourceScenarioId);
    if (!source) throw new Error('The Scenario to copy from no longer exists.');
    return source;
  }

  private buildCopyFromScenario(source: ScenarioRecords, sourceRouteId: EntityId, target: ScenarioRecords, targetRouteId: EntityId): CopyFromScenarioPreview {
    if (source.scenario.projectId !== target.scenario.projectId) throw new Error('Plans can be copied only between Scenarios of the same Project.');
    requireRoute(source, sourceRouteId);
    requireRoute(target, targetRouteId);
    const sourcePlans = (source.plannedFrequencies ?? []).filter((plan) => plan.routeId === sourceRouteId);
    const sourceDays = source.serviceDays.filter((day) => sourcePlans.some((plan) => plan.serviceDayId === day.id));
    const targetDays = target.serviceDays;

    // Day matching (Decision 0058 item 9): by kind when exactly one day of that kind exists on each side, otherwise by name.
    const used = new Set<EntityId>();
    const matches: Array<{ source: ServiceDayDefinition; target: ServiceDayDefinition; by: 'kind' | 'name' }> = [];
    const unmatchedDays: ScenarioCopyUnmatchedDay[] = [];
    for (const day of sourceDays) {
      let found: ServiceDayDefinition | undefined;
      let by: 'kind' | 'name' = 'kind';
      if (day.kind !== 'custom') {
        const sameKindSource = source.serviceDays.filter((item) => item.kind === day.kind);
        const sameKindTarget = targetDays.filter((item) => item.kind === day.kind);
        if (sameKindSource.length === 1 && sameKindTarget.length === 1) found = sameKindTarget[0];
      }
      if (!found) {
        by = 'name';
        found = targetDays.find((item) => clean(item.name) === clean(day.name) && !used.has(item.id));
      }
      if (found && !used.has(found.id)) { used.add(found.id); matches.push({ source: day, target: found, by }); } else unmatchedDays.push({ serviceDayId: day.id, name: day.name });
    }

    const sourceDirections = routeDirections(source, sourceRouteId);
    const targetDirections = routeDirections(target, targetRouteId);
    const targetPatterns = routePatterns(target, targetRouteId);
    const sourceNodes = new Map<EntityId, Node>(source.nodes.map((node) => [node.id, node]));
    const targetNodesById = new Map<EntityId, Node>(target.nodes.map((node) => [node.id, node]));
    const unmatchedNodes: ScenarioCopyUnmatchedNode[] = [];

    const days: ScenarioCopyDay[] = matches.map(({ source: sourceDay, target: targetDay, by }) => {
      const plan = sourcePlans.find((item) => item.serviceDayId === sourceDay.id)!;
      const measure: Record<EntityId, EntityId> = {};
      for (const [sourceDirectionId, sourceNodeId] of Object.entries(plan.measureNodeIdByDirectionId)) {
        const sourceDirection = sourceDirections.find((direction) => direction.id === sourceDirectionId);
        const sourceNode = sourceNodes.get(sourceNodeId);
        if (!sourceDirection || !sourceNode) continue;
        const targetDirection = targetDirections.find((direction) => (sourceDirection.group ? direction.group === sourceDirection.group : clean(direction.name) === clean(sourceDirection.name)));
        const served = targetDirection ? [...servedNodes(targetDirection, targetPatterns)].map((id) => targetNodesById.get(id)).filter((node): node is Node => !!node) : [];
        const sourceName = clean(sourceNode.name);
        const sourceShort = clean(sourceNode.shortName);
        const match = served.find((node) => clean(node.name) === sourceName) ?? (sourceShort ? served.find((node) => clean(node.shortName) === sourceShort) : undefined);
        if (targetDirection && match) measure[targetDirection.id] = match.id;
        else unmatchedNodes.push({ serviceDayId: sourceDay.id, ...(targetDirection ? { targetDirectionId: targetDirection.id } : {}), sourceDirectionName: sourceDirection.name, nodeName: sourceNode.name });
      }
      return {
        sourceServiceDayId: sourceDay.id,
        sourceServiceDayName: sourceDay.name,
        targetServiceDayId: targetDay.id,
        targetServiceDayName: targetDay.name,
        matchedBy: by,
        replaces: !!planOf(target, targetRouteId, targetDay.id),
        periods: normalizePeriods(plan.periods).map((period) => ({ ...period })),
        measureNodeIdByDirectionId: measure,
      };
    });

    const content = {
      id: 'copy',
      days: days.map((day) => [day.sourceServiceDayId, day.targetServiceDayId, day.matchedBy, periodsToken(day.periods), day.measureNodeIdByDirectionId, planOf(target, targetRouteId, day.targetServiceDayId)?.updatedAt ?? null]),
      unmatchedDays: unmatchedDays.map((day) => day.serviceDayId),
      unmatchedNodes: unmatchedNodes.map((node) => [node.serviceDayId, node.targetDirectionId ?? null, node.nodeName]),
    };
    const token = fingerprint({ copy: content });
    return { scenarioId: target.scenario.id, sourceScenarioId: source.scenario.id, sourceRouteId, targetRouteId, days, unmatchedDays, unmatchedNodes, token };
  }

  // ---- Comparison --------------------------------------------------------------------------------------------------------------------

  /** Compares the Trips of a Trip Profile with the plan, one result per direction. Read only; writes nothing and never blocks. */
  async comparePlan(request: { routeId: EntityId; serviceDayId: EntityId; tripProfileId: EntityId }): Promise<PlanComparisonResult> {
    const scenarioId = await this.scenarioOfRoute(request.routeId);
    const records = await this.records(scenarioId);
    const plan = planOf(records, request.routeId, request.serviceDayId);
    if (!plan) return { directions: [] };
    const patterns = routePatterns(records, request.routeId);
    const trips = records.trips.filter((trip) => trip.routeId === request.routeId && trip.serviceDayId === request.serviceDayId && trip.tripProfileId === request.tripProfileId);
    return {
      plan,
      directions: routeDirections(records, request.routeId).map((direction) => ({
        directionId: direction.id,
        directionName: direction.name,
        comparison: compareWithPlan({ plan, direction, patterns, trips }),
      })),
    };
  }

  // ---- Reads -------------------------------------------------------------------------------------------------------------------------

  private async scenarioOfRoute(routeId: EntityId): Promise<EntityId> {
    const aggregate = await this.repository.getRouteDefinition(routeId);
    if (!aggregate) throw new Error('The Route no longer exists.');
    return aggregate.route.scenarioId;
  }

  private async records(scenarioId: EntityId): Promise<ScenarioRecords> {
    const records = await this.repository.getScenarioRecords(scenarioId);
    if (!records) throw new Error('The Scenario no longer exists.');
    return records;
  }
}
