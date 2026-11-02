import type { BlockActivity, BlockingBlock, BlockingScenario, EntityId, RoutePattern, ServiceDayDefinition, Trip, ValidationFinding } from './types';
import { newId } from './ids';
import { normalizeBlockActivities, removeSelectedTripsFromBlock, validateBlockingBlock, type MinimumLayoverRules } from './blocking';
import type { DirectionGroup } from './directions';

// Decision 0052: copy the Blocks of one service day into another. Pure domain code: no React, IndexedDB, or repository access.

/** Below this share of matched held Trips the copy is refused. Exactly this share is allowed. */
export const BLOCKING_DAY_COPY_MATCH_THRESHOLD = 0.5;

export interface BlockingDayCopyRequest {
  scenarioId: EntityId; blockingScenarioId: EntityId;
  sourceServiceDayId: EntityId; targetServiceDayId: EntityId;
  /** Required to apply when the source day has no Blocks (clear target). */
  allowEmptySource?: boolean;
  /** Required to apply when the match is partial, has tier-2 matches, or is ambiguous. */
  acknowledgeMismatch?: boolean;
}
export type TripMatchTier = 'exact' | 'firstDeparture';
export interface TripMatch { sourceTripId: EntityId; targetTripId: EntityId; tier: TripMatchTier; ambiguous: boolean; }
export interface TripMatchResult { matches: TripMatch[]; unmatchedSourceTripIds: EntityId[]; unmatchedTargetTripIds: EntityId[]; }

export interface BlockingDayCopyRouteImpact { routeId: EntityId; heldTripCount: number; exactCount: number; firstDepartureCount: number; unmatchedCount: number; unassignedTargetTripCount: number; }
export interface BlockingDayCopyImpact {
  sourceBlockCount: number; replacedTargetBlockCount: number; copiedBlockCount: number;
  heldTripCount: number; matchedTripCount: number; exactCount: number; firstDepartureCount: number; ambiguousCount: number;
  /** matched / held; undefined when the source Blocks hold no Trips. */
  matchRate?: number;
  unmatchedSourceTripIds: EntityId[];
  unassignedTargetTripIds: EntityId[];
  removedDeadheadCount: number;
  /** Copied Blocks that held Trips on the source day and hold none after the copy (ids of the new target Blocks). */
  emptiedBlockIds: EntityId[];
  routes: BlockingDayCopyRouteImpact[];
  requiresExplicitEmptySourceReview: boolean;
  requiresMismatchAcknowledgment: boolean;
  belowThreshold: boolean;
}
export interface BlockingDayCopyPreview {
  request: BlockingDayCopyRequest;
  sourceSignature: string;
  blocks: BlockingBlock[];
  removedTargetBlockIds: EntityId[];
  tripMatches: TripMatch[];
  impact: BlockingDayCopyImpact;
  blockFindings: ValidationFinding[];
  sourceBlockFindingCount: number;
  findings: ValidationFinding[];
}
export interface BlockingDayCopyInput {
  request: BlockingDayCopyRequest; blockingScenario: BlockingScenario; serviceDays: ServiceDayDefinition[];
  sourceBlocks: BlockingBlock[]; targetBlocks: BlockingBlock[];
  sourceTrips: Trip[]; targetTrips: Trip[]; patterns: RoutePattern[];
  minimumLayover?: MinimumLayoverRules; patternDirections?: Map<EntityId, DirectionGroup>;
  now: string;
}

const byText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const byId = <T extends { id: string }>(left: T, right: T) => byText(left.id, right.id);

function finding(ruleId: string, entityId: EntityId, parameters?: Record<string, string | number>): ValidationFinding {
  return { ruleId, severity: 'error', category: 'structural', entityType: 'blockingDayCopy', entityId, messageKey: ruleId, ...(parameters ? { parameters } : {}) };
}

const orderedStopTimes = (trip: Trip) => [...trip.stopTimes].sort((left, right) => left.sequence - right.sequence);
const fullKey = (trip: Trip) => orderedStopTimes(trip).map((point) => `${point.patternPointId}@${point.time}`).join(',');
const departureKey = (trip: Trip) => String(orderedStopTimes(trip)[0]?.time ?? '');

/** Pairs Trips one-to-one by `keyOf` within one Route and Pattern group. Returns the pairs and the Trips left over. */
function pairByKey(sources: Trip[], targets: Trip[], keyOf: (trip: Trip) => string, tier: TripMatchTier): { matches: TripMatch[]; sources: Trip[]; targets: Trip[] } {
  const order = (left: Trip, right: Trip) => byText(fullKey(left), fullKey(right)) || byId(left, right);
  const group = (trips: Trip[]) => { const map = new Map<string, Trip[]>(); [...trips].sort(order).forEach((trip) => { const key = keyOf(trip); map.set(key, [...(map.get(key) ?? []), trip]); }); return map; };
  const sourceGroups = group(sources); const targetGroups = group(targets);
  const matches: TripMatch[] = []; const leftSources: Trip[] = []; const leftTargets: Trip[] = [];
  [...new Set([...sourceGroups.keys(), ...targetGroups.keys()])].sort(byText).forEach((key) => {
    const left = sourceGroups.get(key) ?? []; const right = targetGroups.get(key) ?? [];
    const ambiguous = left.length > 1 || right.length > 1;
    const paired = Math.min(left.length, right.length);
    for (let index = 0; index < paired; index += 1) matches.push({ sourceTripId: left[index].id, targetTripId: right[index].id, tier, ambiguous });
    leftSources.push(...left.slice(paired)); leftTargets.push(...right.slice(paired));
  });
  return { matches, sources: leftSources, targets: leftTargets };
}

/** Matches Trips of two service days in two tiers (Decision 0052 item 4): exact stop times, then same first departure. */
export function matchTripsAcrossDays(sourceTrips: Trip[], targetTrips: Trip[]): TripMatchResult {
  const groupKey = (trip: Trip) => JSON.stringify([trip.routeId, trip.patternId]);
  const groups = new Map<string, { sources: Trip[]; targets: Trip[] }>();
  const slot = (key: string) => { let value = groups.get(key); if (!value) { value = { sources: [], targets: [] }; groups.set(key, value); } return value; };
  sourceTrips.forEach((trip) => slot(groupKey(trip)).sources.push(trip));
  targetTrips.forEach((trip) => slot(groupKey(trip)).targets.push(trip));
  const matches: TripMatch[] = []; const unmatchedSources: Trip[] = []; const unmatchedTargets: Trip[] = [];
  [...groups.keys()].sort(byText).forEach((key) => {
    const group = groups.get(key)!;
    const exact = pairByKey(group.sources, group.targets, fullKey, 'exact');
    const first = pairByKey(exact.sources, exact.targets, departureKey, 'firstDeparture');
    matches.push(...exact.matches, ...first.matches);
    unmatchedSources.push(...first.sources); unmatchedTargets.push(...first.targets);
  });
  return {
    matches: matches.sort((left, right) => byText(left.sourceTripId, right.sourceTripId)),
    unmatchedSourceTripIds: unmatchedSources.map((trip) => trip.id).sort(byText),
    unmatchedTargetTripIds: unmatchedTargets.map((trip) => trip.id).sort(byText),
  };
}

type Scope = Pick<BlockingDayCopyInput, 'request' | 'blockingScenario' | 'sourceBlocks' | 'targetBlocks' | 'sourceTrips' | 'targetTrips'>;
const blocksOf = (blocks: BlockingBlock[], scope: Scope, serviceDayId: EntityId) => blocks.filter((block) => block.blockingScenarioId === scope.blockingScenario.id && block.serviceDayId === serviceDayId);
const tripsOf = (trips: Trip[], scope: Scope, serviceDayId: EntityId) => trips.filter((trip) => trip.scenarioId === scope.request.scenarioId && trip.tripProfileId === scope.blockingScenario.tripProfileId && trip.serviceDayId === serviceDayId);
const blockOrder = (left: BlockingBlock, right: BlockingBlock) => byText(left.label, right.label) || byId(left, right);
const revenueTripIds = (block: BlockingBlock) => block.activities.filter((activity): activity is Extract<BlockActivity, { type: 'revenueTrip' }> => activity.type === 'revenueTrip').map((activity) => activity.tripId);
const deadheadCount = (block: BlockingBlock) => block.activities.filter((activity) => activity.type === 'deadhead').length;
const sortedActivities = (activities: BlockActivity[]) => [...activities].sort((left, right) => left.sequence - right.sequence || byText(left.id, right.id));

/** A stable token over the request, both days' Blocks, and both days' in-scope Trips. The two acknowledgment flags are not part of it. */
export function createBlockingDayCopySignature(input: Omit<BlockingDayCopyInput, 'now' | 'minimumLayover' | 'patternDirections' | 'serviceDays' | 'patterns'>): string {
  const { request, blockingScenario } = input;
  const blockPart = (blocks: BlockingBlock[]) => [...blocks].sort(byId).map((block) => ({ id: block.id, label: block.label, notes: block.notes ?? '', updatedAt: block.updatedAt, activities: sortedActivities(block.activities) }));
  const tripPart = (trips: Trip[]) => [...trips].sort(byId).map((trip) => ({ id: trip.id, routeId: trip.routeId, patternId: trip.patternId, stopTimes: orderedStopTimes(trip), updatedAt: trip.updatedAt }));
  return JSON.stringify({
    request: { scenarioId: request.scenarioId, blockingScenarioId: request.blockingScenarioId, sourceServiceDayId: request.sourceServiceDayId, targetServiceDayId: request.targetServiceDayId },
    blockingScenarioId: blockingScenario.id, tripProfileId: blockingScenario.tripProfileId,
    sourceBlocks: blockPart(blocksOf(input.sourceBlocks, input, request.sourceServiceDayId)),
    targetBlocks: blockPart(blocksOf(input.targetBlocks, input, request.targetServiceDayId)),
    sourceTrips: tripPart(tripsOf(input.sourceTrips, input, request.sourceServiceDayId)),
    targetTrips: tripPart(tripsOf(input.targetTrips, input, request.targetServiceDayId)),
  });
}

/** Builds the proposed target-day Blocks and the review for a Block copy. The preview is built in full even when it carries refusing findings. */
export function buildBlockingDayCopyPreview(input: BlockingDayCopyInput): BlockingDayCopyPreview {
  const { request, blockingScenario, now } = input;
  const sourceBlocks = blocksOf(input.sourceBlocks, input, request.sourceServiceDayId).sort(blockOrder);
  const targetBlocks = blocksOf(input.targetBlocks, input, request.targetServiceDayId);
  const sourceTrips = tripsOf(input.sourceTrips, input, request.sourceServiceDayId);
  const targetTrips = tripsOf(input.targetTrips, input, request.targetServiceDayId);
  const match = matchTripsAcrossDays(sourceTrips, targetTrips);

  const sourceTripById = new Map(sourceTrips.map((trip) => [trip.id, trip]));
  const heldIds = [...new Set(sourceBlocks.flatMap(revenueTripIds))].sort(byText);
  const held = new Set(heldIds);
  const tripMatches = match.matches.filter((item) => held.has(item.sourceTripId));
  const matchBySource = new Map(tripMatches.map((item) => [item.sourceTripId, item]));
  const unmatchedSourceTripIds = heldIds.filter((id) => !matchBySource.has(id));
  const unmatchedSet = new Set(unmatchedSourceTripIds);

  // Copy each source Block: drop unmatched Trips (with adjacent deadheads), then re-point the rest.
  let removedDeadheadCount = 0; const emptiedBlockIds: EntityId[] = [];
  const blocks = sourceBlocks.map((source): BlockingBlock => {
    const heldBefore = revenueTripIds(source).length;
    const stripped = removeSelectedTripsFromBlock(source, unmatchedSet);
    removedDeadheadCount += deadheadCount(source) - deadheadCount(stripped);
    const id = newId();
    const activities = sortedActivities(stripped.activities).map((activity): BlockActivity => activity.type === 'revenueTrip'
      ? { ...activity, id: newId(), tripId: matchBySource.get(activity.tripId)!.targetTripId }
      : { ...activity, id: newId() });
    const copy = normalizeBlockActivities<BlockingBlock>({ ...source, id, serviceDayId: request.targetServiceDayId, activities, createdAt: now, updatedAt: now });
    if (heldBefore > 0 && !revenueTripIds(copy).length) emptiedBlockIds.push(id);
    return copy;
  });

  const assignedTargets = new Set(tripMatches.map((item) => item.targetTripId));
  const unassignedTargetTripIds = targetTrips.filter((trip) => !assignedTargets.has(trip.id)).map((trip) => trip.id).sort(byText);
  const unassignedSet = new Set(unassignedTargetTripIds);

  const routeIds = new Set<EntityId>();
  heldIds.forEach((id) => { const trip = sourceTripById.get(id); if (trip) routeIds.add(trip.routeId); });
  targetTrips.forEach((trip) => { if (unassignedSet.has(trip.id)) routeIds.add(trip.routeId); });
  const routes: BlockingDayCopyRouteImpact[] = [...routeIds].sort(byText).map((routeId) => {
    const heldHere = heldIds.filter((id) => sourceTripById.get(id)?.routeId === routeId);
    const matchedHere = heldHere.map((id) => matchBySource.get(id)).filter((item): item is TripMatch => Boolean(item));
    return {
      routeId, heldTripCount: heldHere.length,
      exactCount: matchedHere.filter((item) => item.tier === 'exact').length,
      firstDepartureCount: matchedHere.filter((item) => item.tier === 'firstDeparture').length,
      unmatchedCount: heldHere.length - matchedHere.length,
      unassignedTargetTripCount: targetTrips.filter((trip) => trip.routeId === routeId && unassignedSet.has(trip.id)).length,
    };
  });

  const heldTripCount = heldIds.length; const matchedTripCount = tripMatches.length;
  const exactCount = tripMatches.filter((item) => item.tier === 'exact').length;
  const firstDepartureCount = matchedTripCount - exactCount;
  const ambiguousCount = tripMatches.filter((item) => item.ambiguous).length;
  const matchRate = heldTripCount > 0 ? matchedTripCount / heldTripCount : undefined;
  const belowThreshold = matchRate !== undefined && matchRate < BLOCKING_DAY_COPY_MATCH_THRESHOLD;
  const requiresMismatchAcknowledgment = heldTripCount > 0 && (unmatchedSourceTripIds.length > 0 || firstDepartureCount > 0 || ambiguousCount > 0);
  const requiresExplicitEmptySourceReview = sourceBlocks.length === 0;

  const subject = blockingScenario.id;
  const findings: ValidationFinding[] = [];
  const sourceDay = input.serviceDays.find((day) => day.id === request.sourceServiceDayId);
  const targetDay = input.serviceDays.find((day) => day.id === request.targetServiceDayId);
  if (request.sourceServiceDayId === request.targetServiceDayId) findings.push(finding('blockingDayCopy.sameDay', subject));
  if (!sourceDay || !targetDay || sourceDay.scenarioId !== request.scenarioId || targetDay.scenarioId !== request.scenarioId) findings.push(finding('blockingDayCopy.dayUnavailable', subject));
  if (blockingScenario.id !== request.blockingScenarioId || blockingScenario.scenarioId !== request.scenarioId) findings.push(finding('blockingDayCopy.scenarioMismatch', subject));
  if (requiresExplicitEmptySourceReview && !request.allowEmptySource) findings.push(finding('blockingDayCopy.emptySourceRequiresExplicitClear', subject));
  if (belowThreshold) findings.push(finding('blockingDayCopy.matchBelowThreshold', subject, { matched: matchedTripCount, held: heldTripCount }));
  if (requiresMismatchAcknowledgment && !request.acknowledgeMismatch) findings.push(finding('blockingDayCopy.mismatchRequiresAcknowledgment', subject));

  const scenarioRef = { id: request.scenarioId };
  const blockFindings = blocks.flatMap((block) => validateBlockingBlock(block, { scenario: scenarioRef, blockingScenario, trips: targetTrips, patterns: input.patterns }));
  const sourceBlockFindingCount = sourceBlocks.reduce((sum, block) => sum + validateBlockingBlock(block, { scenario: scenarioRef, blockingScenario, trips: sourceTrips, patterns: input.patterns }).length, 0);

  return {
    request,
    sourceSignature: createBlockingDayCopySignature(input),
    blocks,
    removedTargetBlockIds: targetBlocks.map((block) => block.id).sort(byText),
    tripMatches,
    impact: {
      sourceBlockCount: sourceBlocks.length, replacedTargetBlockCount: targetBlocks.length, copiedBlockCount: blocks.length,
      heldTripCount, matchedTripCount, exactCount, firstDepartureCount, ambiguousCount,
      ...(matchRate !== undefined ? { matchRate } : {}),
      unmatchedSourceTripIds, unassignedTargetTripIds, removedDeadheadCount, emptiedBlockIds, routes,
      requiresExplicitEmptySourceReview, requiresMismatchAcknowledgment, belowThreshold,
    },
    blockFindings, sourceBlockFindingCount, findings,
  };
}
