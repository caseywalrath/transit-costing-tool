import type { BlockingBlock, BlockingScenario, BlockActivity, DeadheadActivity, EntityId, Miles, RoutePattern, ServiceSeconds, Trip, ValidationFinding } from './types';
import { metadata, newId, withUpdatedAt } from './ids';

export type BlockingStatus = 'complete' | 'incomplete' | 'invalid';
export type CompatibilityStatus = 'compatible' | 'deadheadRequired' | 'insufficientLayover' | 'conflict' | 'incomplete';
export type MinimumLayoverRule = { mode: 'minutes' | 'percent'; value: number };
export interface BlockingScenarioInput { scenarioId: EntityId; tripProfileId: EntityId; name: string; description?: string; }
export interface BlockingScenarioGraph { scenario: BlockingScenario; blocks: BlockingBlock[]; }

function required(value: string, label: string): string { if (!value.trim()) throw new Error(`${label} is required`); return value.trim(); }
function finding(entityType: string, entityId: EntityId, ruleId: string, messageKey: string, category: 'structural' | 'operational', severity: 'error' | 'warning' = category === 'structural' ? 'error' : 'warning', field?: string, parameters?: Record<string, string | number>): ValidationFinding { return { ruleId, severity, category, entityType, entityId, messageKey, ...(field ? { field } : {}), ...(parameters ? { parameters } : {}) }; }
function sortedActivities(activities: BlockActivity[]): BlockActivity[] { return [...activities].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)); }
export function createBlockingScenario(input: BlockingScenarioInput, now = new Date().toISOString()): BlockingScenario { return { id: newId(), scenarioId: required(input.scenarioId, 'Scenario id'), tripProfileId: required(input.tripProfileId, 'Trip Profile id'), name: required(input.name, 'Blocking Scenario name'), ...(input.description?.trim() ? { description: input.description.trim() } : {}), ...metadata(now) }; }
export function validateBlockingScenarioName(name: string, siblings: BlockingScenario[] = [], currentId?: EntityId): ValidationFinding[] { const trimmed = name.trim(); const subjectId = currentId ?? 'new-blocking-scenario'; const findings: ValidationFinding[] = []; if (!trimmed) findings.push(finding('blockingScenario', subjectId, 'blockingScenario.nameRequired', 'blockingScenario.nameRequired', 'structural', 'error', 'name')); const duplicate = siblings.find((candidate) => candidate.id !== currentId && candidate.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase()); if (duplicate) findings.push(finding('blockingScenario', subjectId, 'blockingScenario.nameUnique', 'blockingScenario.nameUnique', 'structural', 'error', 'name')); return findings; }
export function renameBlockingScenario(source: BlockingScenario, name: string, siblings: BlockingScenario[] = [], now = new Date().toISOString()): BlockingScenario { const findings = validateBlockingScenarioName(name, siblings, source.id); if (findings.length) throw new Error(findings.map((item) => item.messageKey).join(', ')); return withUpdatedAt({ ...source, name: name.trim() }, now); }
export function duplicateBlockingScenario(source: BlockingScenarioGraph, targetName: string, now = new Date().toISOString()): BlockingScenarioGraph { if (validateBlockingScenarioName(targetName).length) throw new Error('blockingScenario.nameRequired'); const scenario: BlockingScenario = { ...source.scenario, id: newId(), name: targetName.trim(), ...metadata(now) }; const blocks = source.blocks.map((block) => ({ ...block, id: newId(), scenarioId: scenario.scenarioId, blockingScenarioId: scenario.id, activities: block.activities.map((activity) => ({ ...activity, id: newId() })), ...metadata(now) })); return { scenario, blocks: blocks.map(normalizeBlockActivities) }; }
export function createBlockingBlock(scenario: BlockingScenario, serviceDayId: EntityId, label: string, now = new Date().toISOString()): BlockingBlock { return { id: newId(), scenarioId: scenario.scenarioId, blockingScenarioId: scenario.id, serviceDayId: required(serviceDayId, 'Service day id'), label: required(label, 'Block label'), activities: [], ...metadata(now) }; }
export interface BlockingScenarioDeletionImpact { blockingScenarioId: EntityId; blockIds: EntityId[]; blockCount: number; activityCount: number; sourceSignature: string; }
export function createBlockingScenarioSourceSignature(scenario: BlockingScenario, blocks: BlockingBlock[]): string { const canonicalBlocks = blocks.filter((block) => block.blockingScenarioId === scenario.id).sort((a, b) => a.id.localeCompare(b.id)).map((block) => ({ id: block.id, serviceDayId: block.serviceDayId, label: block.label, notes: block.notes ?? '', activities: sortedActivities(block.activities) })); return JSON.stringify({ scenarioId: scenario.id, parentScenarioId: scenario.scenarioId, tripProfileId: scenario.tripProfileId, name: scenario.name.trim(), blocks: canonicalBlocks }); }
export function calculateBlockingScenarioDeletionImpact(scenario: BlockingScenario, blocks: BlockingBlock[]): BlockingScenarioDeletionImpact { const owned = blocks.filter((block) => block.blockingScenarioId === scenario.id); return { blockingScenarioId: scenario.id, blockIds: owned.map((block) => block.id), blockCount: owned.length, activityCount: owned.reduce((sum, block) => sum + block.activities.length, 0), sourceSignature: createBlockingScenarioSourceSignature(scenario, blocks) }; }
export function assertBlockingScenarioSourceUnchanged(scenario: BlockingScenario, blocks: BlockingBlock[], sourceSignature: string): void { if (createBlockingScenarioSourceSignature(scenario, blocks) !== sourceSignature) throw new Error('Blocking Scenario changed since the operation was reviewed. Reload and review it again.'); }
export function normalizeBlockActivities<T extends BlockingBlock>(block: T): T { return { ...block, activities: sortedActivities(block.activities).map((activity, sequence) => ({ ...activity, sequence })) } as T; }
export type BoundaryActivity = Extract<BlockActivity, { type: 'pullOut' | 'pullIn' }>;
export interface BulkBoundaryRequest { blockingScenarioId: EntityId; serviceDayId: EntityId; sourceBlockId: EntityId; activity: BoundaryActivity; replaceExisting: boolean; sourceSignature: string; expectedEndpointSignature?: string; }
export interface BulkBoundaryPreview { matchingBlockCount: number; sourceBlockIncluded: boolean; addCount: number; replaceCount: number; skippedExistingCount: number; skippedWithoutTripCount: number; sourceSignature: string; endpointSignature: string; }
export function planBulkBoundaryActivities(request: BulkBoundaryRequest, blocks: BlockingBlock[], trips: Trip[], patterns: RoutePattern[]): { blocks: BlockingBlock[]; preview: BulkBoundaryPreview } {
  const source = blocks.find((block) => block.id === request.sourceBlockId && block.blockingScenarioId === request.blockingScenarioId && block.serviceDayId === request.serviceDayId);
  if (!source) throw new Error('The selected Block is no longer available.');
  const tripById = tripMap(trips); const patternById = patternMap(patterns);
  const endpoint = (block: BlockingBlock) => {
    const revenue = sortedActivities(block.activities).filter((activity): activity is Extract<BlockActivity, { type: 'revenueTrip' }> => activity.type === 'revenueTrip');
    const boundary = request.activity.type === 'pullOut' ? revenue[0] : revenue.at(-1);
    const trip = boundary && tripById.get(boundary.tripId);
    const pattern = trip && patternById.get(trip.patternId);
    return request.activity.type === 'pullOut' ? pattern?.points[0]?.nodeId : pattern?.points.at(-1)?.nodeId;
  };
  const matchNodeId = request.activity.type === 'pullOut' ? request.activity.toNodeId : request.activity.fromNodeId;
  if (!matchNodeId) throw new Error('Select a Node for the boundary activity.');
  const endpointSignature = JSON.stringify(blocks.filter((block) => block.blockingScenarioId === request.blockingScenarioId && block.serviceDayId === request.serviceDayId).map((block) => [block.id, endpoint(block)]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
  if (request.expectedEndpointSignature && request.expectedEndpointSignature !== endpointSignature) throw new Error('Trip endpoints changed since the review. Review matching Blocks again.');
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
    return normalizeBlockActivities(withUpdatedAt({ ...block, activities: ordered.map((item, sequence) => ({ ...item, sequence })) }));
  });
  return { blocks: next, preview: { matchingBlockCount, sourceBlockIncluded, addCount, replaceCount, skippedExistingCount, skippedWithoutTripCount, sourceSignature: request.sourceSignature, endpointSignature } };
}
function tripMap(values: Trip[] | Map<EntityId, Trip>): Map<EntityId, Trip> { return values instanceof Map ? values : new Map(values.map((trip) => [trip.id, trip])); }
function patternMap(values: RoutePattern[] | Map<EntityId, RoutePattern> | undefined): Map<EntityId, RoutePattern> { return values instanceof Map ? values : new Map((values ?? []).map((pattern) => [pattern.id, pattern])); }
function tripStart(trip: Trip | undefined): ServiceSeconds | undefined { return trip?.stopTimes[0]?.time; }
function tripEnd(trip: Trip | undefined): ServiceSeconds | undefined { return trip?.stopTimes.at(-1)?.time; }
function patternStartNode(trip: Trip, patterns: Map<EntityId, RoutePattern>): EntityId | undefined { return patterns.get(trip.patternId)?.points[0]?.nodeId; }
function patternEndNode(trip: Trip, patterns: Map<EntityId, RoutePattern>): EntityId | undefined { return patterns.get(trip.patternId)?.points.at(-1)?.nodeId; }
function revenueDistance(trip: Trip, patterns: Map<EntityId, RoutePattern>): Miles | undefined { const end = patterns.get(trip.patternId)?.points.at(-1)?.cumulativeMiles; return end !== undefined && Number.isFinite(end) && end >= 0 ? end : undefined; }
function explicitTiming(activity: Exclude<BlockActivity, { type: 'revenueTrip' }>) { return Number.isInteger(activity.startTime) && Number.isInteger(activity.endTime) ? { startTime: activity.startTime!, endTime: activity.endTime! } : undefined; }
function hasExclusiveBoundaryTiming(activity: Extract<BlockActivity, { type: 'pullOut' | 'pullIn' }>) {
  const relative = activity.type === 'pullOut' ? activity.minutesBeforeFirstTrip : activity.minutesAfterLastTrip;
  return relative !== undefined && (activity.startTime !== undefined || activity.endTime !== undefined);
}
function hasExclusiveDeadheadTiming(activity: DeadheadActivity) {
  return activity.minutesAfterPreviousTrip !== undefined && (activity.startTime !== undefined || activity.endTime !== undefined);
}
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
export function assertStructurallyValidBlock(block: BlockingBlock, context: BlockingValidationContext): void { const findings = validateBlockingBlock(block, context); if (findings.some((item) => item.category === 'structural')) throw new Error(findings.map((item) => item.messageKey).join(', ')); }
export function validateBlockingAssignments(scenario: BlockingScenario, blocks: BlockingBlock[], trips: Trip[] | Map<EntityId, Trip>): ValidationFinding[] { const findings: ValidationFinding[] = []; const map = tripMap(trips); const seen = new Map<string, EntityId>(); blocks.filter((block) => block.blockingScenarioId === scenario.id).forEach((block) => block.activities.forEach((activity) => { if (activity.type !== 'revenueTrip') return; const trip = map.get(activity.tripId); if (!trip) return; const key = `${trip.serviceDayId}:${trip.id}`; const previous = seen.get(key); if (previous) findings.push(finding('block', block.id, 'block.duplicateTripAssignment', 'block.duplicateTripAssignment', 'structural', 'error', undefined, { tripId: trip.id, sourceBlockId: previous })); else seen.set(key, block.id); })); return findings; }
export interface BlockConnection { previousTripId: EntityId; nextTripId: EntityId; rawGapSeconds?: number; deadhead?: DeadheadActivity; usableLayoverSeconds?: number; status: 'valid' | 'incomplete' | 'conflict'; findings: ValidationFinding[]; }
export interface ResolvedActivityTiming { activityId: EntityId; startTime?: ServiceSeconds; endTime?: ServiceSeconds; }
export interface BlockSummary { blockId: EntityId; revenueHours: number; runningHours: number; platformHours?: number; deadheadHours: number; layoverHours: number; revenueMiles?: Miles; platformMiles?: Miles; status: BlockingStatus; complete: boolean; valid: boolean; findings: ValidationFinding[]; connections: BlockConnection[]; activityTimings: ResolvedActivityTiming[]; }
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
  });
  revenue.forEach(({ trip }) => { const start = tripStart(trip); const end = tripEnd(trip); if (start !== undefined && end !== undefined && end >= start) runningSeconds += end - start; });
  for (let index = 0; index < revenue.length - 1; index += 1) { const previous = revenue[index]; const next = revenue[index + 1]; const previousEnd = tripEnd(previous.trip); const nextStart = tripStart(next.trip); const rawGapSeconds = previousEnd !== undefined && nextStart !== undefined ? nextStart - previousEnd : undefined; const between = activities.slice(activities.indexOf(previous.activity) + 1, activities.indexOf(next.activity)).filter((activity) => activity.type !== 'pullOut' && activity.type !== 'pullIn'); const deadhead = between.find((activity): activity is DeadheadActivity => activity.type === 'deadhead'); const deadheadTiming = deadhead ? timingFor(deadhead.id) : undefined; const connectionFindings: ValidationFinding[] = []; if (rawGapSeconds === undefined) connectionFindings.push(finding('block', block.id, 'block.connectionTimesMissing', 'block.connectionTimesMissing', 'operational')); else if (rawGapSeconds < 0) connectionFindings.push(finding('block', block.id, 'block.connectionOverlap', 'block.connectionOverlap', 'operational')); const fromNode = patternEndNode(previous.trip, patterns); const toNode = patternStartNode(next.trip, patterns); let usableLayoverSeconds: number | undefined; let status: BlockConnection['status'] = 'valid'; if (deadhead) { const deadheadDuration = deadheadTiming?.startTime !== undefined && deadheadTiming.endTime !== undefined ? deadheadTiming.endTime - deadheadTiming.startTime : undefined; if (deadheadDuration !== undefined) deadheadSeconds += Math.max(0, deadheadDuration); else connectionFindings.push(finding('block', block.id, 'block.connectionTimesMissing', 'block.connectionTimesMissing', 'operational')); if ((fromNode && deadhead.fromNodeId !== fromNode) || (toNode && deadhead.toNodeId !== toNode)) connectionFindings.push(finding('block', block.id, 'block.deadheadNodeDiscontinuity', 'block.deadheadNodeDiscontinuity', 'operational')); if (rawGapSeconds !== undefined && deadheadDuration !== undefined) { usableLayoverSeconds = rawGapSeconds - deadheadDuration; if (deadheadDuration > rawGapSeconds) connectionFindings.push(finding('block', block.id, 'block.deadheadDoesNotFit', 'block.deadheadDoesNotFit', 'operational')); } } else if (fromNode && toNode && fromNode !== toNode) connectionFindings.push(finding('block', block.id, 'block.deadheadMissing', 'block.deadheadMissing', 'operational')); else if (rawGapSeconds !== undefined && rawGapSeconds >= 0) usableLayoverSeconds = rawGapSeconds; if (connectionFindings.length) status = connectionFindings.some((item) => item.ruleId === 'block.connectionTimesMissing' || item.ruleId === 'block.deadheadMissing') ? 'incomplete' : 'conflict'; if (usableLayoverSeconds !== undefined && usableLayoverSeconds >= 0) layoverSeconds += usableLayoverSeconds; operational.push(...connectionFindings); connections.push({ previousTripId: previous.trip.id, nextTripId: next.trip.id, rawGapSeconds, ...(deadhead ? { deadhead } : {}), ...(usableLayoverSeconds !== undefined ? { usableLayoverSeconds } : {}), status, findings: connectionFindings }); }
  const pullOut = activities.find((activity) => activity.type === 'pullOut'); const pullIn = activities.find((activity) => activity.type === 'pullIn'); const pullOutTiming = pullOut ? timingFor(pullOut.id) : undefined; const pullInTiming = pullIn ? timingFor(pullIn.id) : undefined;
  let platformSeconds: number | undefined;
  if (!pullOut || !pullIn) operational.push(finding('block', block.id, 'block.platformBoundaryMissing', 'block.platformBoundaryMissing', 'operational'));
  else if (pullOutTiming?.startTime === undefined || pullInTiming?.endTime === undefined) operational.push(finding('block', block.id, 'block.platformBoundaryTripMissing', 'block.platformBoundaryTripMissing', 'operational'));
  else if (pullOutTiming.startTime < 0 || pullInTiming.endTime < 0 || pullInTiming.endTime < pullOutTiming.startTime) operational.push(finding('block', block.id, 'block.platformBoundaryTimeInvalid', 'block.platformBoundaryTimeInvalid', 'operational'));
  else platformSeconds = pullInTiming.endTime - pullOutTiming.startTime;
  const revenueMilesValues = revenue.map(({ trip }) => revenueDistance(trip, patterns)); const revenueMiles = revenueMilesValues.every((value) => value !== undefined) ? revenueMilesValues.reduce((sum, value) => sum + (value ?? 0), 0) : undefined; if (revenue.length && revenueMiles === undefined) operational.push(finding('block', block.id, 'block.revenueMilesIncomplete', 'block.revenueMilesIncomplete', 'operational')); const nonRevenue = activities.filter((activity) => activity.type === 'pullOut' || activity.type === 'pullIn' || activity.type === 'deadhead'); const nonRevenueMiles = nonRevenue.map((activity) => activity.miles); const platformMiles = revenueMiles !== undefined && nonRevenueMiles.every((value) => value !== undefined) ? revenueMiles + nonRevenueMiles.reduce((sum, value) => sum + (value ?? 0), 0) : undefined; if (platformMiles === undefined && (revenue.length > 0 || nonRevenue.length > 0)) operational.push(finding('block', block.id, 'block.platformMilesIncomplete', 'block.platformMilesIncomplete', 'operational')); const allFindings = [...structural, ...operational]; const valid = !allFindings.some((item) => item.severity === 'error' || item.ruleId === 'block.connectionOverlap' || item.ruleId === 'block.deadheadDoesNotFit' || item.ruleId === 'block.deadheadNodeDiscontinuity'); const complete = !operational.some((item) => item.ruleId.includes('Missing') || item.ruleId.includes('Incomplete') || item.ruleId.includes('Invalid')) && platformSeconds !== undefined && platformMiles !== undefined; return { blockId: block.id, revenueHours: (runningSeconds + layoverSeconds) / 3600, runningHours: runningSeconds / 3600, platformHours: platformSeconds === undefined ? undefined : platformSeconds / 3600, deadheadHours: deadheadSeconds / 3600, layoverHours: layoverSeconds / 3600, ...(revenueMiles !== undefined ? { revenueMiles } : {}), ...(platformMiles !== undefined ? { platformMiles } : {}), status: !valid ? 'invalid' : !complete ? 'incomplete' : 'complete', complete, valid, findings: allFindings, connections, activityTimings }; }
export interface BlockingSummary { blockingScenarioId: EntityId; blockSummaries: BlockSummary[]; revenueHours: number; runningHours: number; platformHours?: number; deadheadHours: number; layoverHours: number; revenueMiles?: Miles; platformMiles?: Miles; validBlockCount: number; invalidBlockCount: number; incompleteBlockCount: number; complete: boolean; }
export function summarizeBlockingScenario(scenario: BlockingScenario, blocks: BlockingBlock[], context: Omit<BlockingValidationContext, 'blockingScenario'>): BlockingSummary {
  const blockSummaries = blocks.filter((block) => block.blockingScenarioId === scenario.id).map((block) => summarizeBlock(block, { ...context, blockingScenario: scenario }));
  const valid = blockSummaries.filter((summary) => summary.valid);
  const completeValid = valid.filter((summary) => summary.complete);
  const sumWhenKnown = (select: (summary: BlockSummary) => number | undefined) => valid.length === 0 ? 0 : valid.every((summary) => select(summary) !== undefined) ? valid.reduce((sum, summary) => sum + select(summary)!, 0) : undefined;
  return {
    blockingScenarioId: scenario.id,
    blockSummaries,
    revenueHours: valid.reduce((sum, summary) => sum + summary.revenueHours, 0),
    runningHours: valid.reduce((sum, summary) => sum + summary.runningHours, 0),
    platformHours: sumWhenKnown((summary) => summary.platformHours),
    deadheadHours: valid.reduce((sum, summary) => sum + summary.deadheadHours, 0),
    layoverHours: valid.reduce((sum, summary) => sum + summary.layoverHours, 0),
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

export interface BlockingInsertionContext { block: BlockingBlock; insertAt?: number; trip: Trip; trips: Trip[] | Map<EntityId, Trip>; patterns?: RoutePattern[] | Map<EntityId, RoutePattern>; minimumLayover?: MinimumLayoverRule; }
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
      if (deadhead.fromNodeId !== fromNode || deadhead.toNodeId !== toNode || duration > gap) {
        findings.push(finding('block', input.block.id, 'block.deadheadDoesNotFit', 'block.deadheadDoesNotFit', 'operational'));
        return 'conflict';
      }
      usableGap -= duration;
    } else if (fromNode !== toNode) {
      findings.push(finding('block', input.block.id, 'block.deadheadRequired', 'block.deadheadRequired', 'operational'));
      return 'deadheadRequired';
    }
    const rule = input.minimumLayover;
    if (rule && Number.isFinite(rule.value) && rule.value >= 0) {
      const runtime = leftStart === undefined || leftEnd === undefined ? undefined : leftEnd - leftStart;
      const required = rule.mode === 'minutes' ? rule.value * 60 : runtime === undefined || runtime < 0 ? undefined : Math.ceil(runtime * rule.value / 100);
      if (required === undefined) return 'incomplete';
      if (usableGap < required) { findings.push(finding('block', input.block.id, 'block.minimumLayoverShort', 'block.minimumLayoverShort', 'operational', 'warning', undefined, { availableSeconds: usableGap, requiredSeconds: required })); return 'insufficientLayover'; }
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
export interface BlockingActivityEditRequest { blockingScenarioId: EntityId; blockId: EntityId; activity: BlockActivity; sourceSignature: string; }
export interface BlockingScenarioCreateRequest extends BlockingScenarioInput { duplicateScenarioId?: EntityId; }

/** Pure atomic move used by the application service before the repository transaction. */
export function applyTripAssignment(request: Omit<BlockingAssignmentRequest, 'sourceSignature'>, scenario: BlockingScenario, blocks: BlockingBlock[], trips: Trip[] | Map<EntityId, Trip>, now = new Date().toISOString()): BlockingBlock[] {
  const map = tripMap(trips); const trip = map.get(request.tripId); if (!trip) throw new Error('Trip does not exist.'); if (trip.scenarioId !== scenario.scenarioId || trip.serviceDayId !== request.serviceDayId || trip.tripProfileId !== scenario.tripProfileId) throw new Error('Trip is outside the Blocking Scenario service context.');
  const destination = blocks.find((block) => block.id === request.destinationBlockId); if (!destination || destination.blockingScenarioId !== scenario.id || destination.serviceDayId !== request.serviceDayId) throw new Error('Destination Block is outside the Blocking Scenario service context.');
  const source = request.sourceBlockId ? blocks.find((block) => block.id === request.sourceBlockId) : blocks.find((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === trip.id));
  const otherAssignment = blocks.find((block) => block.id !== source?.id && block.blockingScenarioId === scenario.id && block.serviceDayId === request.serviceDayId && block.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === trip.id)); if (otherAssignment) throw new Error('Trip is already assigned to another Block.');
  const destinationRoutes = destination.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [map.get(activity.tripId)?.routeId] : []).filter((value): value is string => Boolean(value)); if (destinationRoutes.length && destinationRoutes.some((routeId) => routeId !== trip.routeId)) throw new Error('Phase 4 assignment cannot add another Route to a non-empty Block.');
  let next = blocks.map((block) => block.id === source?.id ? { ...block, activities: block.activities.filter((activity) => activity.type !== 'revenueTrip' || activity.tripId !== trip.id) } : block); const target = next.find((block) => block.id === destination.id)!; const revenueActivity = { id: newId(), type: 'revenueTrip' as const, sequence: 0, tripId: trip.id }; const activities = sortedActivities(target.activities); const revenuePositions = activities.map((activity, index) => activity.type === 'revenueTrip' ? index : -1).filter((index) => index >= 0); const requestedPosition = request.destinationIndex === undefined ? suggestChronologicalInsertionIndex(target, trip, map) : Math.max(0, Math.min(request.destinationIndex, revenuePositions.length)); const pullInIndex = activities.findIndex((activity) => activity.type === 'pullIn'); const insertion = requestedPosition < revenuePositions.length ? revenuePositions[requestedPosition] : pullInIndex >= 0 ? pullInIndex : activities.length; activities.splice(insertion, 0, revenueActivity); next = next.map((block) => block.id === target.id ? withUpdatedAt({ ...block, activities: activities.map((activity, sequence) => ({ ...activity, sequence })) }, now) : block); return next.map(normalizeBlockActivities);
}

// Behavior-oriented aliases keep callers independent from the internal function names.
export const normalizeBlock = normalizeBlockActivities;
export const validateBlock = validateBlockingBlock;
export const deriveBlockSummary = summarizeBlock;
export const deriveBlockingSummary = summarizeBlockingScenario;
export const evaluateBlockingInsertion = classifyBlockingInsertion;
