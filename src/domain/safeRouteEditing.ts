import { newId, withUpdatedAt } from './ids';
import { normalizeDirections } from './directions';
import { normalizePattern } from './patterns';
import { adjustBlockReferences } from './trips';
import type { Block, DirectionTimepointColumn, Node, RouteDefinitionAggregate, RouteDirection, RoutePattern, RuntimeProfile, Trip } from './types';

export type RouteEditClassification = 'metadata' | 'distance' | 'deterministic' | 'reset' | 'invalid';
export type RouteEditMode = 'rebalance' | 'reset';

export interface DirectionOrderConflict {
  directionId: string;
  directionName: string;
  patternIds: string[];
  patternNames: string[];
  earlierNodeName: string;
  laterNodeName: string;
  message: string;
}

export interface ReconciledDirections {
  patterns: RoutePattern[];
  directions: RouteDirection[];
  conflict?: DirectionOrderConflict;
}

export interface PatternPointChange {
  added: string[];
  removed: string[];
  nodeChanged: string[];
  retainedOrderChanged: boolean;
}

export interface PatternServiceImpact {
  profileIds: string[];
  assignmentIds: string[];
  tripIds: string[];
  blockIds: string[];
  generationSetIds: string[];
}

export interface PatternEditAnalysis {
  classification: RouteEditClassification;
  points: PatternPointChange;
  impact: PatternServiceImpact;
  reconciled?: ReconciledDirections;
  conflict?: DirectionOrderConflict;
  reason?: string;
}

function clonePattern(pattern: RoutePattern): RoutePattern {
  return { ...pattern, points: pattern.points.map((point) => ({ ...point })) };
}

function orderedPoints(pattern: RoutePattern) {
  return [...pattern.points].sort((left, right) => left.sequence - right.sequence);
}

function nodeName(nodes: Node[], nodeId: string) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  return node?.shortName || node?.name || 'Unnamed timepoint';
}

/**
 * Rebuild one direction's internal timetable order from every pattern in that
 * direction. Existing compatible column IDs are retained; only truly new
 * occurrences receive a new column. A cycle is a user-correctable conflict.
 */
export function reconcileDirectionTimetable(
  direction: RouteDirection,
  patterns: RoutePattern[],
  nodes: Node[],
  now = new Date().toISOString(),
): ReconciledDirections {
  const members = patterns.filter((pattern) => pattern.directionId === direction.id).map(clonePattern);
  const existing = [...direction.columns].sort((left, right) => left.sequence - right.sequence);
  const columns = new Map(existing.map((column) => [column.id, { ...column }]));
  const used = new Set<string>();
  const mappedMembers: RoutePattern[] = [];

  for (const member of members) {
    const pointColumns = new Set<string>();
    const occurrences = new Map<string, number>();
    const points = orderedPoints(member).map((point, sequence) => {
      const occurrence = occurrences.get(point.nodeId) ?? 0;
      occurrences.set(point.nodeId, occurrence + 1);
      let column = point.directionColumnId ? columns.get(point.directionColumnId) : undefined;
      if (!column || column.nodeId !== point.nodeId || pointColumns.has(column.id)) {
        const candidates = [...columns.values()].filter((candidate) => candidate.nodeId === point.nodeId && !pointColumns.has(candidate.id));
        column = candidates[occurrence] ?? candidates[0];
      }
      if (!column) {
        column = { id: newId(), nodeId: point.nodeId, sequence: columns.size };
        columns.set(column.id, column);
      }
      pointColumns.add(column.id);
      used.add(column.id);
      return { ...point, sequence, directionColumnId: column.id };
    });
    mappedMembers.push({ ...member, points });
  }

  const edges = new Map<string, Set<string>>();
  const edgeSources = new Map<string, Array<{ patternId: string; patternName: string }>>();
  const addEdge = (from: string, to: string, pattern: RoutePattern) => {
    if (from === to) return;
    const outgoing = edges.get(from) ?? new Set<string>();
    outgoing.add(to);
    edges.set(from, outgoing);
    const key = `${from}:${to}`;
    edgeSources.set(key, [...(edgeSources.get(key) ?? []), { patternId: pattern.id, patternName: pattern.name || 'Untitled pattern' }]);
  };
  for (const member of mappedMembers) for (let index = 1; index < member.points.length; index += 1) addEdge(member.points[index - 1].directionColumnId!, member.points[index].directionColumnId!, member);

  const retainedColumns = [...columns.values()].filter((column) => used.has(column.id));
  const columnOrder = new Map(existing.map((column, index) => [column.id, index]));
  const indegree = new Map(retainedColumns.map((column) => [column.id, 0]));
  for (const targets of edges.values()) for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
  const compare = (left: string, right: string) => (columnOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (columnOrder.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right);
  const available = retainedColumns.filter((column) => (indegree.get(column.id) ?? 0) === 0).map((column) => column.id).sort(compare);
  const sorted: string[] = [];
  while (available.length) {
    const next = available.shift()!;
    sorted.push(next);
    for (const target of edges.get(next) ?? []) {
      const nextDegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextDegree);
      if (nextDegree === 0) {
        available.push(target);
        available.sort(compare);
      }
    }
  }

  if (sorted.length !== retainedColumns.length) {
    const unresolved = retainedColumns.map((column) => column.id).filter((id) => !sorted.includes(id));
    let reversePair: [string, string] | undefined;
    for (const from of unresolved) {
      for (const to of edges.get(from) ?? []) {
        if (unresolved.includes(to) && (edges.get(to)?.has(from) ?? false)) { reversePair = [from, to]; break; }
      }
      if (reversePair) break;
    }
    const [from, to] = reversePair ?? [unresolved[0], unresolved[1] ?? unresolved[0]];
    const sources = [...(edgeSources.get(`${from}:${to}`) ?? []), ...(edgeSources.get(`${to}:${from}`) ?? [])];
    const uniqueSources = sources.filter((source, index) => sources.findIndex((candidate) => candidate.patternId === source.patternId) === index);
    const first = columns.get(from)!;
    const second = columns.get(to)!;
    const names = uniqueSources.map((source) => source.patternName);
    const firstName = nodeName(nodes, first.nodeId);
    const secondName = nodeName(nodes, second.nodeId);
    return {
      patterns,
      directions: [direction],
      conflict: {
        directionId: direction.id,
        directionName: direction.name,
        patternIds: uniqueSources.map((source) => source.patternId),
        patternNames: names,
        earlierNodeName: firstName,
        laterNodeName: secondName,
        message: `${names.join(' and ') || 'These patterns'} place ${firstName} and ${secondName} in conflicting order. Change one Pattern's Node order or Direction before saving.`,
      },
    };
  }

  const directionById = new Map([[direction.id, { ...direction, columns: sorted.map((id, sequence) => ({ ...columns.get(id)!, sequence })), updatedAt: now }]]);
  return {
    patterns: mappedMembers.map((pattern) => ({ ...pattern, updatedAt: now })),
    directions: [...directionById.values()],
  };
}

/** Reconcile all route directions, preserving untouched route directions. */
export function reconcileRouteTimetables(
  aggregate: RouteDefinitionAggregate,
  patterns: RoutePattern[],
  now = new Date().toISOString(),
): ReconciledDirections {
  const resolvedPatterns = new Map(patterns.map((pattern) => [pattern.id, clonePattern(pattern)]));
  const resolvedDirections: RouteDirection[] = [];
  for (const direction of aggregate.directions ?? []) {
    const reconciled = reconcileDirectionTimetable(direction, patterns, aggregate.nodes, now);
    if (reconciled.conflict) return { patterns, directions: aggregate.directions ?? [], conflict: reconciled.conflict };
    for (const pattern of reconciled.patterns) resolvedPatterns.set(pattern.id, pattern);
    resolvedDirections.push(reconciled.directions[0]);
  }
  return { patterns: patterns.map((pattern) => resolvedPatterns.get(pattern.id) ?? pattern), directions: normalizeDirections(resolvedDirections) };
}

export function describePatternPointChange(saved: RoutePattern | undefined, proposed: RoutePattern): PatternPointChange {
  const next = orderedPoints(proposed);
  if (!saved) return { added: next.map((point) => point.id), removed: [], nodeChanged: [], retainedOrderChanged: false };
  const old = orderedPoints(saved);
  const oldById = new Map(old.map((point) => [point.id, point]));
  const nextById = new Map(next.map((point) => [point.id, point]));
  const retainedOld = old.filter((point) => nextById.has(point.id)).map((point) => point.id);
  const retainedNext = next.filter((point) => oldById.has(point.id)).map((point) => point.id);
  return {
    added: next.filter((point) => !oldById.has(point.id)).map((point) => point.id),
    removed: old.filter((point) => !nextById.has(point.id)).map((point) => point.id),
    nodeChanged: next.filter((point) => oldById.get(point.id)?.nodeId !== point.nodeId).map((point) => point.id),
    retainedOrderChanged: retainedOld.some((id, index) => retainedNext[index] !== id),
  };
}

export function classifyPatternEdit(saved: RoutePattern | undefined, proposed: RoutePattern): RouteEditClassification {
  if (!saved) return 'deterministic';
  const change = describePatternPointChange(saved, proposed);
  const pointsChanged = change.added.length || change.removed.length || change.nodeChanged.length || change.retainedOrderChanged || saved.directionId !== proposed.directionId;
  if (!pointsChanged) {
    const distanceChanged = orderedPoints(saved).some((point, index) => point.cumulativeMiles !== orderedPoints(proposed)[index]?.cumulativeMiles);
    return distanceChanged ? 'distance' : 'metadata';
  }
  if (change.retainedOrderChanged) return 'reset';
  const oldRetained = saved.points.filter((point) => proposed.points.some((candidate) => candidate.id === point.id));
  if (saved.points.length && proposed.points.length && !oldRetained.length) return 'reset';
  return 'deterministic';
}

export function getPatternServiceImpact(patternId: string, profiles: RuntimeProfile[], assignments: { id: string; patternId: string; runtimeProfileId: string }[], trips: Trip[], blocks: Block[], generationSets: { id: string; patternId: string }[]): PatternServiceImpact {
  const profileIds = profiles.filter((profile) => profile.patternId === patternId).map((profile) => profile.id);
  const assignmentIds = assignments.filter((assignment) => assignment.patternId === patternId || profileIds.includes(assignment.runtimeProfileId)).map((assignment) => assignment.id);
  const tripIds = trips.filter((trip) => trip.patternId === patternId).map((trip) => trip.id);
  const selected = new Set(tripIds);
  return {
    profileIds,
    assignmentIds,
    tripIds,
    blockIds: blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && selected.has(activity.tripId))).map((block) => block.id),
    generationSetIds: generationSets.filter((set) => set.patternId === patternId).map((set) => set.id),
  };
}

function sumSegments(values: number[], start: number, end: number) {
  return values.slice(start, end).reduce((sum, value) => sum + value, 0);
}

/**
 * Applies the zero-minute insertion convention and endpoint merge rule to all
 * runtime bands. The calculation revision changes once per profile save.
 */
export function rebalanceRuntimeProfile(profile: RuntimeProfile, saved: RoutePattern, proposed: RoutePattern, now = new Date().toISOString()): RuntimeProfile {
  const oldPoints = orderedPoints(saved);
  const nextPoints = orderedPoints(proposed);
  const oldIndex = new Map(oldPoints.map((point, index) => [point.id, index]));
  const segmentRuntimeSeconds = (values: number[]) => nextPoints.slice(1).map((right, nextIndex) => {
    const left = nextPoints[nextIndex];
    const leftOld = oldIndex.get(left.id);
    const rightOld = oldIndex.get(right.id);
    if (leftOld !== undefined && rightOld !== undefined) return sumSegments(values, leftOld, rightOld);
    if (leftOld !== undefined) return 0;
    if (rightOld !== undefined) {
      const predecessor = nextPoints.slice(0, nextIndex + 1).reverse().find((point) => oldIndex.has(point.id));
      const predecessorOld = predecessor ? oldIndex.get(predecessor.id) : undefined;
      return predecessorOld === undefined ? 0 : sumSegments(values, predecessorOld, rightOld);
    }
    return 0;
  });
  return withUpdatedAt({
    ...profile,
    calculationRevision: (profile.calculationRevision ?? 0) + 1,
    bands: profile.bands.map((band, sequence) => ({ ...band, sequence, segmentRuntimeSeconds: segmentRuntimeSeconds(band.segmentRuntimeSeconds) })),
  }, now);
}

/** Preserve retained times and give a new point the preceding scheduled time. */
export function rebalanceTripForPattern(trip: Trip, saved: RoutePattern, proposed: RoutePattern, profileById: Map<string, RuntimeProfile>, now = new Date().toISOString()): Trip {
  const times = new Map(trip.stopTimes.map((point) => [point.patternPointId, point.time]));
  const oldFirst = trip.stopTimes[0]?.time ?? 0;
  let precedingTime = oldFirst;
  const stopTimes = orderedPoints(proposed).map((point, sequence) => {
    const time = times.get(point.id) ?? precedingTime;
    precedingTime = time;
    return { patternPointId: point.id, sequence, time };
  });
  const sourceId = trip.provenance.calculationSource?.runtimeProfileId ?? trip.provenance.runtimeProfileId;
  const profile = sourceId ? profileById.get(sourceId) : undefined;
  const revision = profile?.calculationRevision;
  return withUpdatedAt({
    ...trip,
    stopTimes,
    provenance: profile && revision !== undefined ? {
      ...trip.provenance,
      runtimeProfileId: profile.id,
      runtimeCalculationRevision: revision,
      calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision },
    } : trip.provenance,
  }, now);
}

export function resetPatternService<Assignment extends { patternId: string }, GenerationSet extends { patternId: string }>(patternId: string, profiles: RuntimeProfile[], assignments: Assignment[], trips: Trip[], blocks: Block[], generationSets: GenerationSet[]) {
  const tripIds = trips.filter((trip) => trip.patternId === patternId).map((trip) => trip.id);
  const adjusted = adjustBlockReferences(blocks, tripIds);
  return {
    runtimeProfiles: profiles.filter((profile) => profile.patternId !== patternId),
    runtimeAssignments: assignments.filter((assignment) => assignment.patternId !== patternId),
    trips: trips.filter((trip) => trip.patternId !== patternId),
    blocks: adjusted.blocks,
    generationSets: generationSets.filter((set) => set.patternId !== patternId),
    removedTripIds: tripIds,
    affectedBlockIds: adjusted.adjustments.map((adjustment) => adjustment.blockId),
  };
}
