import type { BlockingBlock, BlockingScenario, BlockActivity, DeadheadActivity, EntityId, Miles, RoutePattern, ServiceSeconds, Trip, ValidationFinding } from './types';
import { metadata, newId, withUpdatedAt } from './ids';
import { patternTotalMiles } from './patterns';
import { MANAGED_DIRECTION_GROUPS, type DirectionGroup } from './directions';

export type BlockingStatus = 'complete' | 'incomplete' | 'invalid';
export type CompatibilityStatus = 'compatible' | 'deadheadRequired' | 'insufficientLayover' | 'conflict' | 'incomplete';
export type MinimumLayoverRule = { mode: 'minutes' | 'percent'; value: number };
/** The minimum layover by direction (Decision 0050). A direction without an entry has no minimum. */
export type MinimumLayoverRules = Partial<Record<DirectionGroup, MinimumLayoverRule>>;
export interface BlockingScenarioInput { scenarioId: EntityId; tripProfileId: EntityId; name: string; description?: string; }
export interface BlockingScenarioGraph { scenario: BlockingScenario; blocks: BlockingBlock[]; }

/**
 * A Blocking rule refused an operation. `findings` are the structural findings behind the refusal (OV-VAL-01), so a caller can read
 * the rule, entity, and field instead of parsing `message`. `message` keeps the text that screens already show.
 */
export class BlockingValidationError extends Error {
  constructor(message: string, readonly findings: ValidationFinding[]) {
    super(message);
    this.name = 'BlockingValidationError';
  }
}
function reject(message: string, ruleId: string, entityType: string, entityId: EntityId, field?: string, parameters?: Record<string, string | number>): never {
  throw new BlockingValidationError(message, [finding(entityType, entityId, ruleId, ruleId, 'structural', 'error', field, parameters)]);
}
function required(value: string, label: string): string { if (!value.trim()) reject(`${label} is required`, 'blocking.fieldRequired', 'blockingScenario', 'new-blocking-scenario', undefined, { label }); return value.trim(); }
function finding(entityType: string, entityId: EntityId, ruleId: string, messageKey: string, category: 'structural' | 'operational', severity: 'error' | 'warning' = category === 'structural' ? 'error' : 'warning', field?: string, parameters?: Record<string, string | number>): ValidationFinding { return { ruleId, severity, category, entityType, entityId, messageKey, ...(field ? { field } : {}), ...(parameters ? { parameters } : {}) }; }
function sortedActivities(activities: BlockActivity[]): BlockActivity[] { return [...activities].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)); }
export function createBlockingScenario(input: BlockingScenarioInput, now = new Date().toISOString()): BlockingScenario { return { id: newId(), scenarioId: required(input.scenarioId, 'Scenario id'), tripProfileId: required(input.tripProfileId, 'Trip Profile id'), name: required(input.name, 'Blocking Scenario name'), ...(input.description?.trim() ? { description: input.description.trim() } : {}), ...metadata(now) }; }
export function validateBlockingScenarioName(name: string, siblings: BlockingScenario[] = [], currentId?: EntityId): ValidationFinding[] { const trimmed = name.trim(); const subjectId = currentId ?? 'new-blocking-scenario'; const findings: ValidationFinding[] = []; if (!trimmed) findings.push(finding('blockingScenario', subjectId, 'blockingScenario.nameRequired', 'blockingScenario.nameRequired', 'structural', 'error', 'name')); const duplicate = siblings.find((candidate) => candidate.id !== currentId && candidate.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase()); if (duplicate) findings.push(finding('blockingScenario', subjectId, 'blockingScenario.nameUnique', 'blockingScenario.nameUnique', 'structural', 'error', 'name')); return findings; }
export function renameBlockingScenario(source: BlockingScenario, name: string, siblings: BlockingScenario[] = [], now = new Date().toISOString()): BlockingScenario { const findings = validateBlockingScenarioName(name, siblings, source.id); if (findings.length) throw new BlockingValidationError(findings.map((item) => item.messageKey).join(', '), findings); return withUpdatedAt({ ...source, name: name.trim() }, now); }
export function duplicateBlockingScenario(source: BlockingScenarioGraph, targetName: string, now = new Date().toISOString()): BlockingScenarioGraph { const nameFindings = validateBlockingScenarioName(targetName); if (nameFindings.length) throw new BlockingValidationError('blockingScenario.nameRequired', nameFindings); const scenario: BlockingScenario = { ...source.scenario, id: newId(), name: targetName.trim(), ...metadata(now) }; const blocks = source.blocks.map((block) => ({ ...block, id: newId(), scenarioId: scenario.scenarioId, blockingScenarioId: scenario.id, activities: block.activities.map((activity) => ({ ...activity, id: newId() })), ...metadata(now) })); return { scenario, blocks: blocks.map(normalizeBlockActivities) }; }
export function createBlockingBlock(scenario: BlockingScenario, serviceDayId: EntityId, label: string, now = new Date().toISOString()): BlockingBlock { return { id: newId(), scenarioId: scenario.scenarioId, blockingScenarioId: scenario.id, serviceDayId: required(serviceDayId, 'Service day id'), label: required(label, 'Block label'), activities: [], ...metadata(now) }; }
export interface BlockingScenarioDeletionImpact { blockingScenarioId: EntityId; blockIds: EntityId[]; blockCount: number; activityCount: number; sourceSignature: string; }
export function createBlockingScenarioSourceSignature(scenario: BlockingScenario, blocks: BlockingBlock[]): string { const canonicalBlocks = blocks.filter((block) => block.blockingScenarioId === scenario.id).sort((a, b) => a.id.localeCompare(b.id)).map((block) => ({ id: block.id, serviceDayId: block.serviceDayId, label: block.label, notes: block.notes ?? '', activities: sortedActivities(block.activities) })); return JSON.stringify({ scenarioId: scenario.id, parentScenarioId: scenario.scenarioId, tripProfileId: scenario.tripProfileId, name: scenario.name.trim(), blocks: canonicalBlocks }); }
export function calculateBlockingScenarioDeletionImpact(scenario: BlockingScenario, blocks: BlockingBlock[]): BlockingScenarioDeletionImpact { const owned = blocks.filter((block) => block.blockingScenarioId === scenario.id); return { blockingScenarioId: scenario.id, blockIds: owned.map((block) => block.id), blockCount: owned.length, activityCount: owned.reduce((sum, block) => sum + block.activities.length, 0), sourceSignature: createBlockingScenarioSourceSignature(scenario, blocks) }; }
export function assertBlockingScenarioSourceUnchanged(scenario: BlockingScenario, blocks: BlockingBlock[], sourceSignature: string): void { if (createBlockingScenarioSourceSignature(scenario, blocks) !== sourceSignature) reject('Blocking Scenario changed since the operation was reviewed. Reload and review it again.', 'blockingScenario.sourceChanged', 'blockingScenario', scenario.id); }
export function normalizeBlockActivities<T extends BlockingBlock>(block: T): T { return { ...block, activities: sortedActivities(block.activities).map((activity, sequence) => ({ ...activity, sequence })) } as T; }
export type BoundaryActivity = Extract<BlockActivity, { type: 'pullOut' | 'pullIn' }>;
export interface BulkBoundaryRequest { blockingScenarioId: EntityId; serviceDayId: EntityId; sourceBlockId: EntityId; activity: BoundaryActivity; replaceExisting: boolean; sourceSignature: string; expectedEndpointSignature?: string; }
export interface BulkBoundaryPreview { matchingBlockCount: number; sourceBlockIncluded: boolean; addCount: number; replaceCount: number; skippedExistingCount: number; skippedWithoutTripCount: number; sourceSignature: string; endpointSignature: string; }
export function planBulkBoundaryActivities(request: BulkBoundaryRequest, blocks: BlockingBlock[], trips: Trip[], patterns: RoutePattern[], now = new Date().toISOString()): { blocks: BlockingBlock[]; preview: BulkBoundaryPreview } {
  const source = blocks.find((block) => block.id === request.sourceBlockId && block.blockingScenarioId === request.blockingScenarioId && block.serviceDayId === request.serviceDayId);
  if (!source) reject('The selected Block is no longer available.', 'block.unavailable', 'block', request.sourceBlockId);
  const tripById = tripMap(trips); const patternById = patternMap(patterns);
  const endpoint = (block: BlockingBlock) => {
    const revenue = sortedActivities(block.activities).filter((activity): activity is Extract<BlockActivity, { type: 'revenueTrip' }> => activity.type === 'revenueTrip');
    const boundary = request.activity.type === 'pullOut' ? revenue[0] : revenue.at(-1);
    const trip = boundary && tripById.get(boundary.tripId);
    const pattern = trip && patternById.get(trip.patternId);
    return request.activity.type === 'pullOut' ? pattern?.points[0]?.nodeId : pattern?.points.at(-1)?.nodeId;
  };
  const matchNodeId = request.activity.type === 'pullOut' ? request.activity.toNodeId : request.activity.fromNodeId;
  if (!matchNodeId) reject('Select a Node for the boundary activity.', 'block.boundaryNode', 'block', source.id, request.activity.type === 'pullOut' ? 'toNodeId' : 'fromNodeId');
  const endpointSignature = JSON.stringify(blocks.filter((block) => block.blockingScenarioId === request.blockingScenarioId && block.serviceDayId === request.serviceDayId).map((block) => [block.id, endpoint(block)]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
  if (request.expectedEndpointSignature && request.expectedEndpointSignature !== endpointSignature) reject('Trip endpoints changed since the review. Review matching Blocks again.', 'block.endpointsChanged', 'block', source.id);
  let matchingBlockCount = 0; let sourceBlockIncluded = false; let addCount = 0; let replaceCount = 0; let skippedExistingCount = 0; let skippedWithoutTripCount = 0;
  const next = blocks.map((block) => {
    if (block.blockingScenarioId !== request.blockingScenarioId || block.serviceDayId !== request.serviceDayId) return block;
    const nodeId = endpoint(block);
    if (!nodeId) { skippedWithoutTripCount += 1; return block; }
    if (nodeId === matchNodeId) matchingBlockCount += 1;
    if (block.id !== source.id && nodeId !== matchNodeId) return block;
    if (block.id === source.id) sourceBlockIncluded = true;
    const existing = block.activities.find((activity) => activity.type === request.activity.type);
    if (existing && block.id !== source.id && !request.replaceExisting) { skippedExistingCount += 1; return block; }
    if (existing) replaceCount += 1; else addCount += 1;
    const activity = { ...request.activity, id: existing?.id ?? (block.id === source.id ? request.activity.id : newId()), sequence: request.activity.type === 'pullOut' ? 0 : block.activities.length };
    const remaining = block.activities.filter((item) => item.type !== request.activity.type);
    const ordered = request.activity.type === 'pullOut' ? [activity, ...remaining] : [...remaining, activity];
    return normalizeBlockActivities(withUpdatedAt({ ...block, activities: ordered.map((item, sequence) => ({ ...item, sequence })) }, now));
  });
  return { blocks: next, preview: { matchingBlockCount, sourceBlockIncluded, addCount, replaceCount, skippedExistingCount, skippedWithoutTripCount, sourceSignature: request.sourceSignature, endpointSignature } };
}
function tripMap(values: Trip[] | Map<EntityId, Trip>): Map<EntityId, Trip> { return values instanceof Map ? values : new Map(values.map((trip) => [trip.id, trip])); }
function patternMap(values: RoutePattern[] | Map<EntityId, RoutePattern> | undefined): Map<EntityId, RoutePattern> { return values instanceof Map ? values : new Map((values ?? []).map((pattern) => [pattern.id, pattern])); }
function tripStart(trip: Trip | undefined): ServiceSeconds | undefined { return trip?.stopTimes[0]?.time; }
function tripEnd(trip: Trip | undefined): ServiceSeconds | undefined { return trip?.stopTimes.at(-1)?.time; }
function patternStartNode(trip: Trip, patterns: Map<EntityId, RoutePattern>): EntityId | undefined { return patterns.get(trip.patternId)?.points[0]?.nodeId; }
function patternEndNode(trip: Trip, patterns: Map<EntityId, RoutePattern>): EntityId | undefined { return patterns.get(trip.patternId)?.points.at(-1)?.nodeId; }
/** A Pattern's total distance. A total of 0 means that no distance was entered (decision 8), so it is not a complete distance. */
function revenueDistance(trip: Trip, patterns: Map<EntityId, RoutePattern>): Miles | undefined { const pattern = patterns.get(trip.patternId); return pattern ? patternTotalMiles(pattern) : undefined; }
function explicitTiming(activity: Exclude<BlockActivity, { type: 'revenueTrip' }>) { return Number.isInteger(activity.startTime) && Number.isInteger(activity.endTime) ? { startTime: activity.startTime!, endTime: activity.endTime! } : undefined; }
function hasExclusiveBoundaryTiming(activity: Extract<BlockActivity, { type: 'pullOut' | 'pullIn' }>) {
  const relative = activity.type === 'pullOut' ? activity.minutesBeforeFirstTrip : activity.minutesAfterLastTrip;
  return relative !== undefined && (activity.startTime !== undefined || activity.endTime !== undefined);
}
function hasExclusiveDeadheadTiming(activity: DeadheadActivity) {
  return activity.minutesAfterPreviousTrip !== undefined && (activity.startTime !== undefined || activity.endTime !== undefined);
}
/**
 * True when a deadhead with explicit clock times (a legacy or imported shape) does not lie inside the gap between the Trip before it
 * and the Trip after it (decision C2). A deadhead placed after the previous Trip by minutes is inside the gap by construction.
 */
function explicitDeadheadOutsideGap(deadhead: DeadheadActivity, timing: { startTime?: ServiceSeconds; endTime?: ServiceSeconds } | undefined, previousEnd: ServiceSeconds | undefined, nextStart: ServiceSeconds | undefined): boolean {
  if (deadhead.minutesAfterPreviousTrip !== undefined || timing?.startTime === undefined || timing.endTime === undefined || previousEnd === undefined || nextStart === undefined) return false;
  return timing.startTime < previousEnd || timing.endTime > nextStart;
}
/** Operational findings that make a Block invalid: its times or placements contradict the Trips it connects. */
const INVALIDATING_RULES = new Set(['block.connectionOverlap', 'block.deadheadDoesNotFit', 'block.deadheadNodeDiscontinuity', 'block.deadheadOutsideGap', 'block.boundaryOverlap']);
export interface BlockingValidationContext { scenario?: { id: EntityId }; blockingScenario?: BlockingScenario; trips: Trip[] | Map<EntityId, Trip>; patterns?: RoutePattern[] | Map<EntityId, RoutePattern>; }
export function validateBlockingBlock(block: BlockingBlock, context: BlockingValidationContext): ValidationFinding[] {
  const findings: ValidationFinding[] = []; const trips = tripMap(context.trips); const patterns = patternMap(context.patterns); const activities = sortedActivities(block.activities);
  if (!block.scenarioId.trim()) findings.push(finding('block', block.id, 'block.scenarioRequired', 'block.scenarioRequired', 'structural', 'error', 'scenarioId')); if (!block.blockingScenarioId.trim()) findings.push(finding('block', block.id, 'block.blockingScenarioRequired', 'block.blockingScenarioRequired', 'structural', 'error', 'blockingScenarioId')); if (context.scenario && block.scenarioId !== context.scenario.id) findings.push(finding('block', block.id, 'block.scenarioMismatch', 'block.scenarioMismatch', 'structural')); const scenario = context.blockingScenario; if (scenario && (scenario.id !== block.blockingScenarioId || scenario.scenarioId !== block.scenarioId)) findings.push(finding('block', block.id, 'block.blockingScenarioMismatch', 'block.blockingScenarioMismatch', 'structural')); if (!block.serviceDayId.trim()) findings.push(finding('block', block.id, 'block.serviceDayRequired', 'block.serviceDayRequired', 'structural', 'error', 'serviceDayId')); if (!block.label.trim()) findings.push(finding('block', block.id, 'block.labelRequired', 'block.labelRequired', 'structural', 'error', 'label'));
  const pullOuts = activities.filter((activity) => activity.type === 'pullOut'); const pullIns = activities.filter((activity) => activity.type === 'pullIn'); if (pullOuts.length > 1) findings.push(finding('block', block.id, 'block.multiplePullOut', 'block.multiplePullOut', 'structural')); if (pullIns.length > 1) findings.push(finding('block', block.id, 'block.multiplePullIn', 'block.multiplePullIn', 'structural')); if (pullOuts[0] && activities[0]?.id !== pullOuts[0].id) findings.push(finding('block', block.id, 'block.pullOutMustBeFirst', 'block.pullOutMustBeFirst', 'structural')); if (pullIns[0] && activities.at(-1)?.id !== pullIns[0].id) findings.push(finding('block', block.id, 'block.pullInMustBeLast', 'block.pullInMustBeLast', 'structural'));
  activities.forEach((activity, index) => {
    if (activity.sequence !== index) findings.push(finding('block', block.id, 'block.sequence', 'block.sequenceNotNormalized', 'structural', 'error', undefined, { sequence: activity.sequence }));
    if (activity.type === 'revenueTrip') { const trip = trips.get(activity.tripId); if (!trip) { findings.push(finding('block', block.id, 'block.tripExists', 'block.missingTrip', 'structural', 'error', undefined, { tripId: activity.tripId })); return; } if (trip.scenarioId !== block.scenarioId || trip.serviceDayId !== block.serviceDayId) findings.push(finding('block', block.id, 'block.tripContext', 'block.tripContextMismatch', 'structural', 'error', undefined, { tripId: activity.tripId })); if (scenario && trip.tripProfileId !== scenario.tripProfileId) findings.push(finding('block', block.id, 'block.tripProfile', 'block.tripProfileMismatch', 'structural', 'error', undefined, { tripId: activity.tripId })); if (!patterns.has(trip.patternId)) findings.push(finding('block', block.id, 'block.patternExists', 'block.missingPattern', 'structural', 'error', undefined, { tripId: activity.tripId })); return; }
    const timing = explicitTiming(activity);
    if (activity.type === 'deadhead') {
      const relative = activity.minutesAfterPreviousTrip;
      if (hasExclusiveDeadheadTiming(activity) || (relative === undefined && (!timing || timing.startTime < 0 || timing.endTime < 0 || timing.endTime < timing.startTime)) || (relative !== undefined && (!Number.isInteger(relative) || relative < 0))) findings.push(finding('block', block.id, 'block.activityTime', 'block.invalidActivityTime', 'structural', 'error', undefined, { sequence: activity.sequence }));
      if (!activity.fromNodeId.trim() || !activity.toNodeId.trim()) findings.push(finding('block', block.id, 'block.deadheadNodes', 'block.deadheadNodesRequired', 'structural'));
    } else {
      const offset = activity.type === 'pullOut' ? activity.minutesBeforeFirstTrip : activity.minutesAfterLastTrip;
      if (hasExclusiveBoundaryTiming(activity) || (offset === undefined && (!timing || timing.startTime < 0 || timing.endTime < 0 || timing.endTime < timing.startTime)) || (offset !== undefined && (!Number.isInteger(offset) || offset < 0))) findings.push(finding('block', block.id, 'block.boundaryTiming', 'block.invalidBoundaryTiming', 'structural', 'error', undefined, { sequence: activity.sequence }));
      if (activity.type === 'pullOut' && !activity.toNodeId.trim()) findings.push(finding('block', block.id, 'block.pullOutNode', 'block.pullOutNodeRequired', 'structural'));
      if (activity.type === 'pullIn' && !activity.fromNodeId.trim()) findings.push(finding('block', block.id, 'block.pullInNode', 'block.pullInNodeRequired', 'structural'));
    }
    if (activity.miles !== undefined && (!Number.isFinite(activity.miles) || activity.miles < 0)) findings.push(finding('block', block.id, 'block.invalidMiles', 'block.invalidMiles', 'structural'));
  });
  const revenueIndices = activities.map((activity, index) => activity.type === 'revenueTrip' ? index : -1).filter((index) => index >= 0); for (let index = 0; index < revenueIndices.length - 1; index += 1) { const between = activities.slice(revenueIndices[index] + 1, revenueIndices[index + 1]).filter((activity) => activity.type === 'deadhead'); if (between.length > 1) findings.push(finding('block', block.id, 'block.multipleDeadheads', 'block.multipleDeadheads', 'structural', 'error', undefined, { sequence: between[1].sequence })); } activities.forEach((activity) => { if (activity.type !== 'deadhead') return; const activityIndex = activities.indexOf(activity); if (!activities.slice(0, activityIndex).some((candidate) => candidate.type === 'revenueTrip') || !activities.slice(activityIndex + 1).some((candidate) => candidate.type === 'revenueTrip')) findings.push(finding('block', block.id, 'block.deadheadPlacement', 'block.deadheadPlacement', 'structural')); }); return findings;
}
export function assertStructurallyValidBlock(block: BlockingBlock, context: BlockingValidationContext): void { const findings = validateBlockingBlock(block, context); const structural = findings.filter((item) => item.category === 'structural'); if (structural.length) throw new BlockingValidationError(structural.map((item) => item.messageKey).join(', '), structural); }
export function validateBlockingAssignments(scenario: BlockingScenario, blocks: BlockingBlock[], trips: Trip[] | Map<EntityId, Trip>): ValidationFinding[] { const findings: ValidationFinding[] = []; const map = tripMap(trips); const seen = new Map<string, EntityId>(); blocks.filter((block) => block.blockingScenarioId === scenario.id).forEach((block) => block.activities.forEach((activity) => { if (activity.type !== 'revenueTrip') return; const trip = map.get(activity.tripId); if (!trip) return; const key = `${trip.serviceDayId}:${trip.id}`; const previous = seen.get(key); if (previous) findings.push(finding('block', block.id, 'block.duplicateTripAssignment', 'block.duplicateTripAssignment', 'structural', 'error', undefined, { tripId: trip.id, sourceBlockId: previous })); else seen.set(key, block.id); })); return findings; }
export interface BlockConnection { previousTripId: EntityId; nextTripId: EntityId; rawGapSeconds?: number; deadhead?: DeadheadActivity; usableLayoverSeconds?: number; status: 'valid' | 'incomplete' | 'conflict'; findings: ValidationFinding[]; }
export interface ResolvedActivityTiming { activityId: EntityId; startTime?: ServiceSeconds; endTime?: ServiceSeconds; }
export interface BlockSummary { blockId: EntityId; revenueHours: number; /** Whole seconds behind `revenueHours`; totals add these, so they stay exact. */ revenueSeconds?: number; runningHours: number; platformHours?: number; /** Whole seconds behind `platformHours`. */ platformSeconds?: number; deadheadHours: number; layoverHours: number; layoverPercent?: number; revenueMiles?: Miles; platformMiles?: Miles; status: BlockingStatus; complete: boolean; valid: boolean; findings: ValidationFinding[]; connections: BlockConnection[]; activityTimings: ResolvedActivityTiming[]; }
export function summarizeBlock(block: BlockingBlock, context: BlockingValidationContext): BlockSummary {
  const trips = tripMap(context.trips); const patterns = patternMap(context.patterns); const activities = sortedActivities(block.activities); const structural = validateBlockingBlock(block, context); const operational: ValidationFinding[] = []; const revenue = activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => ({ activity, trip: trips.get(activity.tripId) })).filter((item): item is { activity: Extract<BlockActivity, { type: 'revenueTrip' }>; trip: Trip } => Boolean(item.trip)); let runningSeconds = 0; let deadheadSeconds = 0; let layoverSeconds = 0; const connections: BlockConnection[] = [];
  const activityTimings: ResolvedActivityTiming[] = activities.map((activity, activityIndex) => {
    if (activity.type === 'revenueTrip') { const trip = trips.get(activity.tripId); return { activityId: activity.id, ...(tripStart(trip) === undefined ? {} : { startTime: tripStart(trip) }), ...(tripEnd(trip) === undefined ? {} : { endTime: tripEnd(trip) }) }; }
    if (activity.type === 'deadhead' && activity.minutesAfterPreviousTrip !== undefined) { const predecessor = [...activities.slice(0, activityIndex)].reverse().find((candidate) => candidate.type === 'revenueTrip'); const predecessorEnd = predecessor?.type === 'revenueTrip' ? tripEnd(trips.get(predecessor.tripId)) : undefined; return { activityId: activity.id, ...(predecessorEnd === undefined ? {} : { startTime: predecessorEnd, endTime: predecessorEnd + activity.minutesAfterPreviousTrip * 60 }) }; }
    if (activity.type === 'deadhead') return { activityId: activity.id, ...explicitTiming(activity) };
    if (activity.type === 'pullOut' && activity.minutesBeforeFirstTrip !== undefined) { const firstStart = revenue[0] ? tripStart(revenue[0].trip) : undefined; return { activityId: activity.id, ...(firstStart === undefined ? {} : { startTime: firstStart - activity.minutesBeforeFirstTrip * 60, endTime: firstStart }) }; }
    if (activity.type === 'pullIn' && activity.minutesAfterLastTrip !== undefined) { const lastEnd = revenue.at(-1) ? tripEnd(revenue.at(-1)!.trip) : undefined; return { activityId: activity.id, ...(lastEnd === undefined ? {} : { startTime: lastEnd, endTime: lastEnd + activity.minutesAfterLastTrip * 60 }) }; }
    return { activityId: activity.id, ...explicitTiming(activity) };
  });
  const timingFor = (activityId: EntityId) => activityTimings.find((item) => item.activityId === activityId);
  activities.filter((activity): activity is Extract<BlockActivity, { type: 'pullOut' | 'pullIn' }> => activity.type === 'pullOut' || activity.type === 'pullIn').forEach((activity) => {
    const timing = timingFor(activity.id);
    if (timing?.startTime !== undefined && timing.endTime !== undefined && timing.endTime >= timing.startTime) deadheadSeconds += timing.endTime - timing.startTime;
    const firstStart = revenue[0] ? tripStart(revenue[0].trip) : undefined; const lastEnd = revenue.at(-1) ? tripEnd(revenue.at(-1)!.trip) : undefined;
    const overlaps = activity.type === 'pullOut' ? timing?.endTime !== undefined && firstStart !== undefined && timing.endTime > firstStart : timing?.startTime !== undefined && lastEnd !== undefined && timing.startTime < lastEnd;
    if (overlaps) operational.push(finding('block', block.id, 'block.boundaryOverlap', 'block.boundaryOverlap', 'operational', 'warning', undefined, { sequence: activity.sequence }));
  });
  revenue.forEach(({ trip }) => { const start = tripStart(trip); const end = tripEnd(trip); if (start !== undefined && end !== undefined && end >= start) runningSeconds += end - start; });
  for (let index = 0; index < revenue.length - 1; index += 1) { const previous = revenue[index]; const next = revenue[index + 1]; const previousEnd = tripEnd(previous.trip); const nextStart = tripStart(next.trip); const rawGapSeconds = previousEnd !== undefined && nextStart !== undefined ? nextStart - previousEnd : undefined; const between = activities.slice(activities.indexOf(previous.activity) + 1, activities.indexOf(next.activity)).filter((activity) => activity.type !== 'pullOut' && activity.type !== 'pullIn'); const deadhead = between.find((activity): activity is DeadheadActivity => activity.type === 'deadhead'); const deadheadTiming = deadhead ? timingFor(deadhead.id) : undefined; const connectionFindings: ValidationFinding[] = []; if (rawGapSeconds === undefined) connectionFindings.push(finding('block', block.id, 'block.connectionTimesMissing', 'block.connectionTimesMissing', 'operational')); else if (rawGapSeconds < 0) connectionFindings.push(finding('block', block.id, 'block.connectionOverlap', 'block.connectionOverlap', 'operational')); const fromNode = patternEndNode(previous.trip, patterns); const toNode = patternStartNode(next.trip, patterns); let usableLayoverSeconds: number | undefined; let status: BlockConnection['status'] = 'valid'; if (deadhead) { const deadheadDuration = deadheadTiming?.startTime !== undefined && deadheadTiming.endTime !== undefined ? deadheadTiming.endTime - deadheadTiming.startTime : undefined; if (deadheadDuration !== undefined) deadheadSeconds += Math.max(0, deadheadDuration); else connectionFindings.push(finding('block', block.id, 'block.connectionTimesMissing', 'block.connectionTimesMissing', 'operational')); if ((fromNode && deadhead.fromNodeId !== fromNode) || (toNode && deadhead.toNodeId !== toNode)) connectionFindings.push(finding('block', block.id, 'block.deadheadNodeDiscontinuity', 'block.deadheadNodeDiscontinuity', 'operational')); if (rawGapSeconds !== undefined && deadheadDuration !== undefined) { const misplaced = explicitDeadheadOutsideGap(deadhead, deadheadTiming, previousEnd, nextStart); if (!misplaced) usableLayoverSeconds = rawGapSeconds - deadheadDuration; if (misplaced) connectionFindings.push(finding('block', block.id, 'block.deadheadOutsideGap', 'block.deadheadOutsideGap', 'operational', 'warning', undefined, { sequence: deadhead.sequence })); if (deadheadDuration > rawGapSeconds) connectionFindings.push(finding('block', block.id, 'block.deadheadDoesNotFit', 'block.deadheadDoesNotFit', 'operational')); } } else if (fromNode && toNode && fromNode !== toNode) connectionFindings.push(finding('block', block.id, 'block.deadheadMissing', 'block.deadheadMissing', 'operational')); else if (rawGapSeconds !== undefined && rawGapSeconds >= 0) usableLayoverSeconds = rawGapSeconds; if (connectionFindings.length) status = connectionFindings.some((item) => item.ruleId === 'block.connectionTimesMissing' || item.ruleId === 'block.deadheadMissing') ? 'incomplete' : 'conflict'; if (usableLayoverSeconds !== undefined && usableLayoverSeconds >= 0) layoverSeconds += usableLayoverSeconds; operational.push(...connectionFindings); connections.push({ previousTripId: previous.trip.id, nextTripId: next.trip.id, rawGapSeconds, ...(deadhead ? { deadhead } : {}), ...(usableLayoverSeconds !== undefined ? { usableLayoverSeconds } : {}), status, findings: connectionFindings }); }
  const pullOut = activities.find((activity) => activity.type === 'pullOut'); const pullIn = activities.find((activity) => activity.type === 'pullIn'); const pullOutTiming = pullOut ? timingFor(pullOut.id) : undefined; const pullInTiming = pullIn ? timingFor(pullIn.id) : undefined;
  let platformSeconds: number | undefined;
  if (!pullOut || !pullIn) operational.push(finding('block', block.id, 'block.platformBoundaryMissing', 'block.platformBoundaryMissing', 'operational'));
  else if (pullOutTiming?.startTime === undefined || pullInTiming?.endTime === undefined) operational.push(finding('block', block.id, 'block.platformBoundaryTripMissing', 'block.platformBoundaryTripMissing', 'operational'));
  else if (pullOutTiming.startTime < 0 || pullInTiming.endTime < 0 || pullInTiming.endTime < pullOutTiming.startTime) operational.push(finding('block', block.id, 'block.platformBoundaryTimeInvalid', 'block.platformBoundaryTimeInvalid', 'operational'));
  else platformSeconds = pullInTiming.endTime - pullOutTiming.startTime;
  const revenueMilesValues = revenue.map(({ trip }) => revenueDistance(trip, patterns)); const revenueMiles = revenueMilesValues.every((value) => value !== undefined) ? revenueMilesValues.reduce((sum, value) => sum + (value ?? 0), 0) : undefined; if (revenue.length && revenueMiles === undefined) operational.push(finding('block', block.id, 'block.revenueMilesIncomplete', 'block.revenueMilesIncomplete', 'operational')); const nonRevenue = activities.filter((activity) => activity.type === 'pullOut' || activity.type === 'pullIn' || activity.type === 'deadhead'); const nonRevenueMiles = nonRevenue.map((activity) => activity.miles); const platformMiles = revenueMiles !== undefined && nonRevenueMiles.every((value) => value !== undefined) ? revenueMiles + nonRevenueMiles.reduce((sum, value) => sum + (value ?? 0), 0) : undefined; if (platformMiles === undefined && (revenue.length > 0 || nonRevenue.length > 0)) operational.push(finding('block', block.id, 'block.platformMilesIncomplete', 'block.platformMilesIncomplete', 'operational')); const allFindings = [...structural, ...operational]; const valid = !allFindings.some((item) => item.severity === 'error' || INVALIDATING_RULES.has(item.ruleId)); const complete = !operational.some((item) => item.ruleId.includes('Missing') || item.ruleId.includes('Incomplete') || item.ruleId.includes('Invalid')) && platformSeconds !== undefined && platformMiles !== undefined; return { blockId: block.id, revenueHours: (runningSeconds + layoverSeconds) / 3600, revenueSeconds: runningSeconds + layoverSeconds, runningHours: runningSeconds / 3600, platformHours: platformSeconds === undefined ? undefined : platformSeconds / 3600, ...(platformSeconds === undefined ? {} : { platformSeconds }), deadheadHours: deadheadSeconds / 3600, layoverHours: layoverSeconds / 3600, layoverPercent: layoverPercent(layoverSeconds / 3600, (runningSeconds + layoverSeconds) / 3600), ...(revenueMiles !== undefined ? { revenueMiles } : {}), ...(platformMiles !== undefined ? { platformMiles } : {}), status: !valid ? 'invalid' : !complete ? 'incomplete' : 'complete', complete, valid, findings: allFindings, connections, activityTimings }; }
export interface BlockingSummary { blockingScenarioId: EntityId; blockSummaries: BlockSummary[]; revenueHours: number; runningHours: number; platformHours?: number; deadheadHours: number; layoverHours: number; layoverPercent?: number; revenueMiles?: Miles; platformMiles?: Miles; validBlockCount: number; invalidBlockCount: number; incompleteBlockCount: number; complete: boolean; }
export function summarizeBlockingScenario(scenario: BlockingScenario, blocks: BlockingBlock[], context: Omit<BlockingValidationContext, 'blockingScenario'>): BlockingSummary {
  const blockSummaries = blocks.filter((block) => block.blockingScenarioId === scenario.id).map((block) => summarizeBlock(block, { ...context, blockingScenario: scenario }));
  const valid = blockSummaries.filter((summary) => summary.valid);
  const completeValid = valid.filter((summary) => summary.complete);
  const revenueHours = valid.reduce((sum, summary) => sum + summary.revenueHours, 0); const layoverHours = valid.reduce((sum, summary) => sum + summary.layoverHours, 0);
  const sumWhenKnown = (select: (summary: BlockSummary) => number | undefined) => valid.length === 0 ? 0 : valid.every((summary) => select(summary) !== undefined) ? valid.reduce((sum, summary) => sum + select(summary)!, 0) : undefined;
  return {
    blockingScenarioId: scenario.id,
    blockSummaries,
    revenueHours,
    runningHours: valid.reduce((sum, summary) => sum + summary.runningHours, 0),
    platformHours: sumWhenKnown((summary) => summary.platformHours),
    deadheadHours: valid.reduce((sum, summary) => sum + summary.deadheadHours, 0),
    layoverHours,
    layoverPercent: layoverPercent(layoverHours, revenueHours),
    revenueMiles: sumWhenKnown((summary) => summary.revenueMiles),
    platformMiles: sumWhenKnown((summary) => summary.platformMiles),
    validBlockCount: completeValid.length,
    invalidBlockCount: blockSummaries.filter((summary) => !summary.valid).length,
    incompleteBlockCount: valid.length - completeValid.length,
    complete: blockSummaries.length === completeValid.length,
  };
}
/**
 * Returns the revenue-Trip position used for a new automatic assignment.
 *
 * Existing Block activity order remains authoritative. The candidate is placed
 * before the first displayed Trip that begins later; equal start times retain
 * their existing order. This gives normally ordered Blocks chronological
 * insertion while preserving a planner's explicit arrow-based reordering.
 */
export function suggestChronologicalInsertionIndex(block: BlockingBlock, candidate: Trip, values: Trip[] | Map<EntityId, Trip>): number {
  const candidateStart = tripStart(candidate);
  const revenue = sortedActivities(block.activities).filter((activity): activity is Extract<BlockActivity, { type: 'revenueTrip' }> => activity.type === 'revenueTrip');
  if (candidateStart === undefined) return revenue.length;
  const trips = tripMap(values);
  const laterTripIndex = revenue.findIndex((activity) => {
    const start = tripStart(trips.get(activity.tripId));
    return start !== undefined && start > candidateStart;
  });
  return laterTripIndex < 0 ? revenue.length : laterTripIndex;
}

/** Layover as a share of Revenue hours, in percent. Unknown when there are no Revenue hours. */
export function layoverPercent(layoverHours: number, revenueHours: number): number | undefined { return revenueHours > 0 ? layoverHours / revenueHours * 100 : undefined; }

function inputFinding(ruleId: string, field: string): ValidationFinding { return finding('blockActivity', 'new-activity', ruleId, ruleId, 'structural', 'error', field); }
export interface ActivityTextInput { minutes: string; miles: string }
export interface ParsedActivityInput { minutes?: number; miles?: number; findings: ValidationFinding[] }
/**
 * Reads the minutes and miles a planner typed for a pull-out, pull-in, or deadhead. A blank minutes field is refused: it is not 0
 * (review finding 4-018). Miles are optional, so a blank miles field means "not entered".
 */
export function parseActivityInput(input: ActivityTextInput): ParsedActivityInput {
  const findings: ValidationFinding[] = []; const minutesText = input.minutes.trim(); const milesText = input.miles.trim(); let minutes: number | undefined; let miles: number | undefined;
  if (!minutesText) findings.push(inputFinding('block.minutesRequired', 'minutes'));
  else { const value = Number(minutesText); if (Number.isInteger(value) && value >= 0) minutes = value; else findings.push(inputFinding('block.minutesInvalid', 'minutes')); }
  if (milesText) { const value = Number(milesText); if (Number.isFinite(value) && value >= 0) miles = value; else findings.push(inputFinding('block.invalidMiles', 'miles')); }
  return { ...(minutes === undefined ? {} : { minutes }), ...(miles === undefined ? {} : { miles }), findings };
}
export interface ParsedMinimumLayover { rule?: MinimumLayoverRule; findings: ValidationFinding[] }
/** Reads the minimum-layover rule a planner typed. A blank amount is refused; it is not a 0-minute rule. "No minimum" has no amount. */
export function parseMinimumLayoverRule(mode: 'none' | MinimumLayoverRule['mode'], amount: string): ParsedMinimumLayover {
  if (mode === 'none') return { findings: [] };
  const text = amount.trim();
  if (!text) return { findings: [finding('minimumLayover', 'minimum-layover', 'block.minimumLayoverAmountRequired', 'block.minimumLayoverAmountRequired', 'structural', 'error', 'amount')] };
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || (mode === 'percent' && value > 100)) return { findings: [finding('minimumLayover', 'minimum-layover', 'block.minimumLayoverAmountInvalid', 'block.minimumLayoverAmountInvalid', 'structural', 'error', 'amount')] };
  return { rule: { mode, value }, findings: [] };
}
export type MinimumLayoverRowInput = { mode: 'none' | MinimumLayoverRule['mode']; amount: string };
export interface ParsedMinimumLayoverRules { rules?: MinimumLayoverRules; findings: ValidationFinding[] }
/**
 * Reads the minimum-layover rule a planner typed for each direction. A finding's field is `outbound.amount` or `inbound.amount`.
 * A direction set to "No minimum" has no entry; when neither direction has one, there are no rules at all.
 */
export function parseMinimumLayoverRules(input: Record<DirectionGroup, MinimumLayoverRowInput>): ParsedMinimumLayoverRules {
  const rules: MinimumLayoverRules = {}; const findings: ValidationFinding[] = [];
  for (const group of MANAGED_DIRECTION_GROUPS) {
    const parsed = parseMinimumLayoverRule(input[group].mode, input[group].amount);
    findings.push(...parsed.findings.map((item) => ({ ...item, field: `${group}.amount` })));
    if (parsed.rule) rules[group] = parsed.rule;
  }
  return { ...(Object.keys(rules).length ? { rules } : {}), findings };
}
function storedLayoverRule(value: unknown): MinimumLayoverRule | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const { mode, value: amount } = value as Record<string, unknown>;
  return (mode === 'minutes' || mode === 'percent') && typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? { mode, value: amount } : undefined;
}
/**
 * Reads a stored minimum-layover preference of unknown shape. A single rule (the form stored before Decision 0050) applies to both
 * directions. Anything of the wrong shape, or with no usable rule, reads as no minimum.
 */
export function normalizeMinimumLayoverRules(value: unknown): MinimumLayoverRules | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const single = storedLayoverRule(value);
  if (single) return { outbound: single, inbound: single };
  const record = value as Record<string, unknown>; const rules: MinimumLayoverRules = {};
  for (const group of MANAGED_DIRECTION_GROUPS) { const rule = storedLayoverRule(record[group]); if (rule) rules[group] = rule; }
  return Object.keys(rules).length ? rules : undefined;
}

function renumbered(block: BlockingBlock, activities: BlockActivity[]): BlockingBlock { return { ...block, activities: activities.map((activity, sequence) => ({ ...activity, sequence })) }; }
/**
 * Puts a new pull-out first, a new pull-in last, or a new deadhead directly after the Trip `afterTripId`, and numbers every activity
 * again, so the order does not depend on activity ids. A deadhead needs a preceding Trip of the Block.
 */
export function insertBlockActivity(block: BlockingBlock, activity: Exclude<BlockActivity, { type: 'revenueTrip' }>, afterTripId?: EntityId): BlockingBlock {
  const activities = sortedActivities(block.activities);
  const index = activity.type === 'pullOut' ? 0 : activity.type === 'pullIn' ? activities.length : activities.findIndex((item) => item.type === 'revenueTrip' && item.tripId === afterTripId) + 1;
  if (index <= 0 && activity.type === 'deadhead') reject('Select a preceding Trip for the deadhead.', 'block.deadheadPlacement', 'block', block.id);
  return renumbered(block, [...activities.slice(0, index), activity, ...activities.slice(index)]);
}
/**
 * The activity order after moving one revenue Trip, with the activities that follow it (its deadhead), one Trip earlier or later.
 * A pull-out stays first and a pull-in stays last. Undefined when the activity is not a Trip of the Block or cannot move that way.
 */
export function moveRevenueTripGroup(block: BlockingBlock, activityId: EntityId, movement: -1 | 1): EntityId[] | undefined {
  const activities = sortedActivities(block.activities);
  const starts = activities.map((activity, index) => activity.type === 'revenueTrip' ? index : -1).filter((index) => index >= 0);
  const groupIndex = starts.findIndex((index) => activities[index].id === activityId); const target = groupIndex + movement;
  if (groupIndex < 0 || target < 0 || target >= starts.length) return undefined;
  const pullIn = activities.findIndex((activity) => activity.type === 'pullIn'); const centralEnd = pullIn >= 0 ? pullIn : activities.length;
  const groups = starts.map((start, index) => activities.slice(start, index + 1 < starts.length ? starts[index + 1] : centralEnd));
  [groups[groupIndex], groups[target]] = [groups[target], groups[groupIndex]];
  return [...activities.slice(0, starts[0]), ...groups.flat(), ...activities.slice(centralEnd)].map((activity) => activity.id);
}
/**
 * Gives every connection between two consecutive revenue Trips that ends at the deadhead's From Node and starts at its To Node a
 * deadhead with the same values. A deadhead already on such a connection keeps its id and takes the new values. The count is the
 * number of connections changed (review finding 4-007).
 */
export function applyDeadheadToMatchingConnections(block: BlockingBlock, deadhead: DeadheadActivity, tripsValue: Trip[] | Map<EntityId, Trip>, patternsValue: RoutePattern[] | Map<EntityId, RoutePattern> | undefined): { block: BlockingBlock; appliedCount: number } {
  const trips = tripMap(tripsValue); const patterns = patternMap(patternsValue); const activities = sortedActivities(block.activities);
  const revenueIndices = activities.map((activity, index) => activity.type === 'revenueTrip' ? index : -1).filter((index) => index >= 0);
  const replacements = new Map<EntityId, DeadheadActivity>(); const insertions = new Map<number, DeadheadActivity>();
  for (let position = 0; position < revenueIndices.length - 1; position += 1) {
    const previousIndex = revenueIndices[position]; const nextIndex = revenueIndices[position + 1];
    const previous = activities[previousIndex]; const next = activities[nextIndex];
    if (previous.type !== 'revenueTrip' || next.type !== 'revenueTrip') continue;
    const previousTrip = trips.get(previous.tripId); const nextTrip = trips.get(next.tripId);
    if (!previousTrip || !nextTrip || patternEndNode(previousTrip, patterns) !== deadhead.fromNodeId || patternStartNode(nextTrip, patterns) !== deadhead.toNodeId) continue;
    const existing = activities.slice(previousIndex + 1, nextIndex).find((activity) => activity.type === 'deadhead');
    if (existing) replacements.set(existing.id, { ...deadhead, id: existing.id, sequence: existing.sequence }); else insertions.set(previousIndex, { ...deadhead, id: newId() });
  }
  const appliedCount = replacements.size + insertions.size;
  if (!appliedCount) reject('No consecutive Trips use the selected From and To Nodes.', 'block.deadheadNoMatch', 'block', block.id);
  return { block: renumbered(block, activities.flatMap((activity, index) => [replacements.get(activity.id) ?? activity, ...(insertions.has(index) ? [insertions.get(index)!] : [])])), appliedCount };
}
/** The Trips of one Route and service day that none of the given Blocks holds. The Blocks are those of one Blocking Scenario. */
export function unassignedRouteTrips(trips: Trip[], blocks: BlockingBlock[], serviceDayId: EntityId, routeId: EntityId): Trip[] {
  const assigned = new Set(blocks.filter((block) => block.serviceDayId === serviceDayId).flatMap((block) => block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : [])));
  return trips.filter((trip) => trip.serviceDayId === serviceDayId && trip.routeId === routeId && !assigned.has(trip.id));
}
/** A Block label must be filled in and used by no other Block of the same service day in its Blocking Scenario, compared after trimming (Decision 0039). */
export function validateBlockLabel(label: string, serviceDayId: EntityId, blocks: BlockingBlock[], currentBlockId?: EntityId): ValidationFinding[] {
  const subject = currentBlockId ?? 'new-block'; const trimmed = label.trim();
  if (!trimmed) return [finding('block', subject, 'block.labelRequired', 'block.labelRequired', 'structural', 'error', 'label')];
  return blocks.some((block) => block.id !== currentBlockId && block.serviceDayId === serviceDayId && block.label.trim() === trimmed) ? [finding('block', subject, 'block.labelUnique', 'block.labelUnique', 'structural', 'error', 'label')] : [];
}
/** Throws `BlockingValidationError` when the label is blank or used by another Block of the service day. */
export function assertBlockLabelAvailable(label: string, serviceDayId: EntityId, blocks: BlockingBlock[], currentBlockId?: EntityId): void {
  const findings = validateBlockLabel(label, serviceDayId, blocks, currentBlockId);
  if (findings.length) throw new BlockingValidationError(findings[0].ruleId === 'block.labelRequired' ? 'Block label is required' : 'Another Block on this service day already uses that label.', findings);
}
/** The first free "Block <n>" among the labels of the given Blocks (those of one service day of one Blocking Scenario). */
export function proposeBlockLabel(blocks: BlockingBlock[]): string {
  const used = new Set(blocks.map((block) => block.label.trim()));
  let number = 1; while (used.has(`Block ${number}`)) number += 1;
  return `Block ${number}`;
}

export interface BlockingInsertionContext { block: BlockingBlock; insertAt?: number; trip: Trip; trips: Trip[] | Map<EntityId, Trip>; patterns?: RoutePattern[] | Map<EntityId, RoutePattern>; minimumLayover?: MinimumLayoverRules; /** The direction group of each Pattern, by Pattern id. A Pattern missing here has an unknown direction. */ patternDirections?: Map<EntityId, DirectionGroup>; }
export interface BlockingCompatibility { status: CompatibilityStatus; predecessorTripId?: EntityId; successorTripId?: EntityId; findings: ValidationFinding[]; }
export function classifyBlockingInsertion(input: BlockingInsertionContext): BlockingCompatibility {
  const activities = sortedActivities(input.block.activities);
  const revenue = activities.filter((activity): activity is Extract<BlockActivity, { type: 'revenueTrip' }> => activity.type === 'revenueTrip');
  const trips = tripMap(input.trips);
  const position = input.insertAt === undefined ? suggestChronologicalInsertionIndex(input.block, input.trip, trips) : Math.max(0, Math.min(input.insertAt, revenue.length));
  const predecessor = revenue[position - 1];
  const successor = revenue[position];
  const patterns = patternMap(input.patterns);
  const findings: ValidationFinding[] = [];
  const predecessorIndex = predecessor ? activities.indexOf(predecessor) : -1;
  const successorIndex = successor ? activities.indexOf(successor) : -1;
  const pullInIndex = activities.findIndex((activity) => activity.type === 'pullIn');
  const precedingDeadhead = predecessor
    ? activities.slice(predecessorIndex + 1, successorIndex >= 0 ? successorIndex : pullInIndex >= 0 ? pullInIndex : activities.length).find((activity): activity is DeadheadActivity => activity.type === 'deadhead')
    : undefined;
  const check = (left: Trip | undefined, right: Trip | undefined, deadhead?: DeadheadActivity): CompatibilityStatus => {
    if (!left || !right) return 'compatible';
    const leftStart = tripStart(left);
    const leftEnd = tripEnd(left);
    const rightStart = tripStart(right);
    const gap = (rightStart ?? Number.NaN) - (leftEnd ?? Number.NaN);
    if (!Number.isFinite(gap)) return 'incomplete';
    if (gap < 0) { findings.push(finding('block', input.block.id, 'block.connectionOverlap', 'block.connectionOverlap', 'operational')); return 'conflict'; }
    const fromNode = patternEndNode(left, patterns);
    const toNode = patternStartNode(right, patterns);
    let usableGap = gap;
    if (deadhead) {
      const timing = deadhead.minutesAfterPreviousTrip !== undefined
        ? { startTime: leftEnd, endTime: leftEnd === undefined ? undefined : leftEnd + deadhead.minutesAfterPreviousTrip * 60 }
        : explicitTiming(deadhead);
      const duration = timing?.startTime !== undefined && timing.endTime !== undefined ? timing.endTime - timing.startTime : undefined;
      if (duration === undefined) return 'incomplete';
      if (explicitDeadheadOutsideGap(deadhead, timing, leftEnd, rightStart)) {
        findings.push(finding('block', input.block.id, 'block.deadheadOutsideGap', 'block.deadheadOutsideGap', 'operational'));
        return 'conflict';
      }
      if (deadhead.fromNodeId !== fromNode || deadhead.toNodeId !== toNode || duration > gap) {
        findings.push(finding('block', input.block.id, 'block.deadheadDoesNotFit', 'block.deadheadDoesNotFit', 'operational'));
        return 'conflict';
      }
      usableGap -= duration;
    } else if (fromNode !== toNode) {
      findings.push(finding('block', input.block.id, 'block.deadheadRequired', 'block.deadheadRequired', 'operational'));
      return 'deadheadRequired';
    }
    // The layover is taken at the end of the preceding Trip, so that Trip's direction picks the rule (Decision 0050). With an
    // unknown direction the larger of the two requirements applies, so a requirement is never waived by missing data.
    const direction = input.patternDirections?.get(left.patternId);
    const rules = direction ? [input.minimumLayover?.[direction]] : MANAGED_DIRECTION_GROUPS.map((group) => input.minimumLayover?.[group]);
    const runtime = leftStart === undefined || leftEnd === undefined ? undefined : leftEnd - leftStart;
    const requirements = rules.flatMap((rule) => rule && Number.isFinite(rule.value) && rule.value >= 0 ? [rule.mode === 'minutes' ? rule.value * 60 : runtime === undefined || runtime < 0 ? undefined : Math.ceil(runtime * rule.value / 100)] : []);
    if (requirements.length) {
      if (requirements.includes(undefined)) return 'incomplete';
      const required = Math.max(...(requirements as number[]));
      if (usableGap < required) { findings.push(finding('block', input.block.id, 'block.minimumLayoverShort', 'block.minimumLayoverShort', 'operational', 'warning', undefined, { availableSeconds: usableGap, requiredSeconds: required, ...(direction ? { direction } : {}) })); return 'insufficientLayover'; }
    }
    return 'compatible';
  };
  const predecessorTrip = predecessor ? trips.get(predecessor.tripId) : undefined;
  const successorTrip = successor ? trips.get(successor.tripId) : undefined;
  const left = check(predecessorTrip, input.trip, precedingDeadhead);
  const right = check(input.trip, successorTrip);
  const statuses = [left, right];
  const status = statuses.includes('conflict') ? 'conflict' : statuses.includes('insufficientLayover') ? 'insufficientLayover' : statuses.includes('incomplete') ? 'incomplete' : statuses.includes('deadheadRequired') ? 'deadheadRequired' : 'compatible';
  return { status, predecessorTripId: predecessor?.tripId, successorTripId: successor?.tripId, findings };
}
export interface BlockingAssignmentRequest { blockingScenarioId: EntityId; serviceDayId: EntityId; tripId: EntityId; destinationBlockId: EntityId; destinationIndex?: number; sourceBlockId?: EntityId; sourceSignature: string; }
export interface BlockingBulkAssignmentRequest { blockingScenarioId: EntityId; serviceDayId: EntityId; tripIds: EntityId[]; destinationBlockId: EntityId; sourceBlockId: EntityId; sourceSignature: string; }
export interface BlockingTripsAssignmentRequest { blockingScenarioId: EntityId; serviceDayId: EntityId; tripIds: EntityId[]; destinationBlockId: EntityId; sourceSignature: string; }
export interface BulkDeadheadRequest { blockingScenarioId: EntityId; blockId: EntityId; deadhead: DeadheadActivity; sourceSignature: string; }
export interface BlockingActivityAddRequest { blockingScenarioId: EntityId; blockId: EntityId; activity: Exclude<BlockActivity, { type: 'revenueTrip' }>; afterTripId?: EntityId; sourceSignature: string; }
export interface BlockDeletionImpact { blockId: EntityId; label: string; serviceDayId: EntityId; activityCount: number; tripCount: number; deadheadCount: number; sourceSignature: string; }
/** What deleting one Block removes, with the source signature the deletion must carry. Undefined when the Block is not one of the Blocking Scenario's. */
export function calculateBlockDeletionImpact(scenario: BlockingScenario, blocks: BlockingBlock[], blockId: EntityId): BlockDeletionImpact | undefined {
  const block = blocks.find((candidate) => candidate.id === blockId && candidate.blockingScenarioId === scenario.id); if (!block) return undefined;
  return { blockId: block.id, label: block.label, serviceDayId: block.serviceDayId, activityCount: block.activities.length, tripCount: block.activities.filter((activity) => activity.type === 'revenueTrip').length, deadheadCount: block.activities.filter((activity) => activity.type === 'deadhead').length, sourceSignature: createBlockingScenarioSourceSignature(scenario, blocks) };
}
export interface BlockingActivityEditRequest { blockingScenarioId: EntityId; blockId: EntityId; activity: BlockActivity; sourceSignature: string; }
export interface BlockingScenarioCreateRequest extends BlockingScenarioInput { duplicateScenarioId?: EntityId; }

/** Pure atomic move used by the application service before the repository transaction. */
export function applyTripAssignment(request: Omit<BlockingAssignmentRequest, 'sourceSignature'>, scenario: BlockingScenario, blocks: BlockingBlock[], trips: Trip[] | Map<EntityId, Trip>, now = new Date().toISOString()): BlockingBlock[] {
  const map = tripMap(trips); const trip = map.get(request.tripId); if (!trip) reject('Trip does not exist.', 'block.tripExists', 'trip', request.tripId); if (trip.scenarioId !== scenario.scenarioId || trip.serviceDayId !== request.serviceDayId || trip.tripProfileId !== scenario.tripProfileId) reject('Trip is outside the Blocking Scenario service context.', 'block.tripContext', 'trip', trip.id);
  const destination = blocks.find((block) => block.id === request.destinationBlockId); if (!destination || destination.blockingScenarioId !== scenario.id || destination.serviceDayId !== request.serviceDayId) reject('Destination Block is outside the Blocking Scenario service context.', 'block.destinationUnavailable', 'block', request.destinationBlockId);
  const source = request.sourceBlockId ? blocks.find((block) => block.id === request.sourceBlockId) : blocks.find((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === trip.id));
  const otherAssignment = blocks.find((block) => block.id !== source?.id && block.blockingScenarioId === scenario.id && block.serviceDayId === request.serviceDayId && block.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === trip.id)); if (otherAssignment) reject('Trip is already assigned to another Block.', 'block.tripAlreadyAssigned', 'trip', trip.id, undefined, { blockId: otherAssignment.id });
  const destinationRoutes = destination.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [map.get(activity.tripId)?.routeId] : []).filter((value): value is string => Boolean(value)); if (destinationRoutes.length && destinationRoutes.some((routeId) => routeId !== trip.routeId)) reject('Phase 4 assignment cannot add another Route to a non-empty Block.', 'block.assignmentRoute', 'trip', trip.id, undefined, { blockId: destination.id });
  let next = blocks.map((block) => block.id === source?.id ? { ...block, activities: block.activities.filter((activity) => activity.type !== 'revenueTrip' || activity.tripId !== trip.id) } : block); const target = next.find((block) => block.id === destination.id)!; const revenueActivity = { id: newId(), type: 'revenueTrip' as const, sequence: 0, tripId: trip.id }; const activities = sortedActivities(target.activities); const revenuePositions = activities.map((activity, index) => activity.type === 'revenueTrip' ? index : -1).filter((index) => index >= 0); const requestedPosition = request.destinationIndex === undefined ? suggestChronologicalInsertionIndex(target, trip, map) : Math.max(0, Math.min(request.destinationIndex, revenuePositions.length)); const pullInIndex = activities.findIndex((activity) => activity.type === 'pullIn'); const insertion = requestedPosition < revenuePositions.length ? revenuePositions[requestedPosition] : pullInIndex >= 0 ? pullInIndex : activities.length; activities.splice(insertion, 0, revenueActivity); next = next.map((block) => block.id === target.id ? withUpdatedAt({ ...block, activities: activities.map((activity, sequence) => ({ ...activity, sequence })) }, now) : block); return next.map(normalizeBlockActivities);
}
