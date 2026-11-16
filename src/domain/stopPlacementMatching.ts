import type { EntityId, PatternStopPlacement, RoutePattern, StopTimingRule } from './types';
import { segmentKeys, type SegmentKey } from './segmentRuntimeMatching';
import { placementSegmentIndex, placementsBySegment, normalizePlacements, sortedPoints } from './stops';

/** Decision 0079 item 9 and section 4.7. Matching is derived from stored placements and is never stored. */
export interface StopSegmentEntry { stopId: EntityId; timing: StopTimingRule; }
export type StopSkipReason = 'ambiguous' | 'conflict';
export interface StopSegmentChange { patternId: EntityId; segmentIndex: number; previous: StopSegmentEntry[]; next: StopSegmentEntry[]; sourcePatternIds: EntityId[]; }
export interface StopSegmentSkip { patternId: EntityId; reason: StopSkipReason; segmentIndex?: number; candidates?: { entries: StopSegmentEntry[]; patternIds: EntityId[] }[]; }
export interface StopPlacementPlan {
  mode: 'copyToOthers' | 'fillFromOthers';
  sourcePatternId: EntityId;
  changes: StopSegmentChange[];
  skips: StopSegmentSkip[];
  affectedPatterns: { patternId: EntityId; changeCount: number; overwriteCount: number }[];
}
export interface StopPlacementPlanInput {
  openPattern: RoutePattern;
  /** Fill: the editor draft. Copy: the stored placements of the open pattern. */
  openPlacements: readonly PatternStopPlacement[];
  /** The Route's saved patterns; the open pattern's saved record, if present, is ignored. */
  patterns: readonly RoutePattern[];
  /** The stored placements of every pattern. */
  placementsByPatternId: Readonly<Record<EntityId, readonly PatternStopPlacement[]>>;
  excludedPatternIds?: readonly EntityId[];
}

interface Indexed { pattern: RoutePattern; keys: SegmentKey[]; values: StopSegmentEntry[][]; indexes: Map<SegmentKey, number[]> }

const entriesOf = (segment: readonly PatternStopPlacement[]): StopSegmentEntry[] => segment.map((placement) => ({ stopId: placement.stopId, timing: placement.timing }));

function sameEntries(left: readonly StopSegmentEntry[], right: readonly StopSegmentEntry[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry.stopId === right[index].stopId && entry.timing === right[index].timing);
}

/** Segments in sequence order: the key of each, and its value (the ordered stop entries; empty when no stops). */
function indexed(pattern: RoutePattern, placements: readonly PatternStopPlacement[]): Indexed {
  const keys = segmentKeys(pattern);
  const values = placementsBySegment(pattern, placements).map(entriesOf);
  const indexes = new Map<SegmentKey, number[]>();
  keys.forEach((key, index) => indexes.set(key, [...(indexes.get(key) ?? []), index]));
  return { pattern, keys, values, indexes };
}

function otherPatterns(openPattern: RoutePattern, patterns: readonly RoutePattern[]): RoutePattern[] {
  return patterns.filter((pattern) => pattern.id !== openPattern.id && pattern.routeId === openPattern.routeId && pattern.scenarioId === openPattern.scenarioId);
}

/** Orders patterns by name (numeric, case-insensitive), then by id. */
function patternOrder(openPattern: RoutePattern, patterns: readonly RoutePattern[]): (left: EntityId, right: EntityId) => number {
  const names = new Map([...patterns, openPattern].map((pattern) => [pattern.id, pattern.name] as const));
  return (left, right) => (names.get(left) ?? '').localeCompare(names.get(right) ?? '', undefined, { numeric: true, sensitivity: 'base' }) || left.localeCompare(right);
}

function finish(mode: StopPlacementPlan['mode'], input: StopPlacementPlanInput, changes: StopSegmentChange[], skips: StopSegmentSkip[]): StopPlacementPlan {
  const order = patternOrder(input.openPattern, input.patterns);
  const sortedChanges = [...changes].sort((left, right) => order(left.patternId, right.patternId) || left.segmentIndex - right.segmentIndex);
  const sortedSkips = [...skips].sort((left, right) => order(left.patternId, right.patternId) || (left.segmentIndex ?? 0) - (right.segmentIndex ?? 0));
  const affected = new Map<EntityId, StopPlacementPlan['affectedPatterns'][number]>();
  for (const change of sortedChanges) {
    const entry = affected.get(change.patternId) ?? { patternId: change.patternId, changeCount: 0, overwriteCount: 0 };
    entry.changeCount += 1;
    if (change.previous.length !== 0) entry.overwriteCount += 1;
    affected.set(change.patternId, entry);
  }
  return {
    mode,
    sourcePatternId: input.openPattern.id,
    changes: sortedChanges,
    skips: sortedSkips,
    affectedPatterns: [...affected.values()].sort((left, right) => order(left.patternId, right.patternId)),
  };
}

/**
 * Section 4.7 for "Fill stops from other patterns". Only empty segments of the open pattern (the draft) are filled, from same-direction
 * pairs only. Sources that agree on one value fill the segment. Disagreeing sources are reported as a conflict.
 */
export function planStopFill(input: StopPlacementPlanInput): StopPlacementPlan {
  const { openPattern } = input;
  const open = indexed(openPattern, input.openPlacements);
  const others = otherPatterns(openPattern, input.patterns).map((pattern) => indexed(pattern, input.placementsByPatternId[pattern.id] ?? []));
  const changes: StopSegmentChange[] = [];
  const skips: StopSegmentSkip[] = [];
  const reported = new Set<string>();
  const reportAmbiguous = (patternId: EntityId, segmentIndex: number) => {
    const id = `${patternId}\u0000${segmentIndex}`;
    if (reported.has(id)) return;
    reported.add(id);
    skips.push({ patternId, reason: 'ambiguous', segmentIndex });
  };
  for (const [, at] of open.indexes) if (at.length > 1) skips.push({ patternId: openPattern.id, reason: 'ambiguous', segmentIndex: at[0] });

  open.values.forEach((value, index) => {
    const key = open.keys[index];
    if (value.length > 0 || (open.indexes.get(key) ?? []).length > 1) return;
    const groups = new Map<string, { entries: StopSegmentEntry[]; patternIds: EntityId[] }>();
    for (const other of others) {
      const at = other.indexes.get(key) ?? [];
      if (at.length > 1) { reportAmbiguous(other.pattern.id, index); continue; }
      if (at.length !== 1 || other.values[at[0]].length === 0) continue;
      const entries = other.values[at[0]];
      const groupKey = JSON.stringify(entries);
      const group = groups.get(groupKey) ?? { entries, patternIds: [] };
      group.patternIds.push(other.pattern.id);
      groups.set(groupKey, group);
    }
    if (groups.size === 0) return;
    if (groups.size === 1) {
      const [group] = [...groups.values()];
      changes.push({ patternId: openPattern.id, segmentIndex: index, previous: [], next: group.entries, sourcePatternIds: [...group.patternIds].sort() });
      return;
    }
    skips.push({
      patternId: openPattern.id,
      reason: 'conflict',
      segmentIndex: index,
      candidates: [...groups.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([, group]) => ({ entries: group.entries, patternIds: [...group.patternIds].sort() })),
    });
  });
  return finish('fillFromOthers', input, changes, skips);
}

/**
 * Section 4.7 for "Copy stops to other patterns". Each non-empty segment of the open (saved) pattern replaces the same node pair on other
 * patterns, except excluded patterns. A segment whose value already equals the open value is not a change. Reverse pairs are never written.
 */
export function planStopCopy(input: StopPlacementPlanInput): StopPlacementPlan {
  const { openPattern } = input;
  const open = indexed(openPattern, input.openPlacements);
  const excluded = new Set(input.excludedPatternIds ?? []);
  const others = otherPatterns(openPattern, input.patterns)
    .filter((pattern) => !excluded.has(pattern.id))
    .map((pattern) => indexed(pattern, input.placementsByPatternId[pattern.id] ?? []));
  const changes: StopSegmentChange[] = [];
  const skips: StopSegmentSkip[] = [];
  const reported = new Set<string>();
  for (const [, at] of open.indexes) if (at.length > 1) skips.push({ patternId: openPattern.id, reason: 'ambiguous', segmentIndex: at[0] });

  open.values.forEach((value, index) => {
    const key = open.keys[index];
    if (value.length === 0 || (open.indexes.get(key) ?? []).length > 1) return;
    for (const other of others) {
      const at = other.indexes.get(key) ?? [];
      if (at.length > 1) {
        const id = `${other.pattern.id}\u0000${index}`;
        if (!reported.has(id)) { reported.add(id); skips.push({ patternId: other.pattern.id, reason: 'ambiguous', segmentIndex: index }); }
        continue;
      }
      if (at.length !== 1) continue;
      const previous = other.values[at[0]];
      if (sameEntries(previous, value)) continue;
      changes.push({ patternId: other.pattern.id, segmentIndex: at[0], previous, next: value, sourcePatternIds: [openPattern.id] });
    }
  });
  return finish('copyToOthers', input, changes, skips);
}

/** The other patterns of the Route that share at least one node pair with the open pattern, where the pair occurs once in each (Decision 0065, rule 5). */
export function stopCopyCandidatePatternIds(openPattern: RoutePattern, patterns: readonly RoutePattern[]): EntityId[] {
  const countOf = (keys: SegmentKey[]) => {
    const counts = new Map<SegmentKey, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  };
  const openCounts = countOf(segmentKeys(openPattern));
  return otherPatterns(openPattern, patterns)
    .filter((pattern) => {
      const counts = countOf(segmentKeys(pattern));
      return [...openCounts].some(([key, count]) => count === 1 && counts.get(key) === 1);
    })
    .map((pattern) => pattern.id);
}

/**
 * Applies `plan.changes` to `current` (pattern ID → placements). `patterns` must hold each pattern as it is to be written (the draft for
 * Fill). A changed segment's placements are replaced by new placements on the segment's point, with new IDs from `makeId`. Other segments
 * keep theirs. Returns the changed patterns' new placement lists, normalized.
 */
export function applyStopPlacementPlan(
  patterns: readonly RoutePattern[],
  current: Readonly<Record<EntityId, readonly PatternStopPlacement[]>>,
  plan: StopPlacementPlan,
  makeId: () => EntityId,
): Record<EntityId, PatternStopPlacement[]> {
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern] as const));
  const result: Record<EntityId, PatternStopPlacement[]> = {};
  for (const { patternId } of plan.affectedPatterns) {
    const pattern = byId.get(patternId);
    if (!pattern) throw new Error('Pattern not found.');
    const points = sortedPoints(pattern);
    let placements = [...(current[patternId] ?? [])];
    for (const change of plan.changes.filter((item) => item.patternId === patternId).sort((left, right) => left.segmentIndex - right.segmentIndex)) {
      const point = points[change.segmentIndex];
      if (!point) throw new Error('Segment not found.');
      placements = placements.filter((placement) => placementSegmentIndex(pattern, placement) !== change.segmentIndex);
      placements.push(...change.next.map((entry, sequence): PatternStopPlacement => ({
        id: makeId(),
        stopId: entry.stopId,
        timing: entry.timing,
        afterPatternPointId: point.id,
        sequence,
      })));
    }
    result[patternId] = normalizePlacements(pattern, placements);
  }
  return result;
}
