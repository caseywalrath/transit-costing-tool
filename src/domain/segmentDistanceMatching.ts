import type { EntityId, Miles, RoutePattern } from './types';
import { segmentKeys, type SegmentKey } from './segmentRuntimeMatching';
import { setSegmentMiles } from './patterns';

/** Decision 0065. Matching is derived from stored patterns and is never stored. */
export type DistanceSkipReason = 'ambiguous' | 'conflict';

export interface DistanceChange {
  patternId: EntityId;            // the pattern that would be written (Fill: the draft)
  segmentIndex: number;
  previousMiles: Miles; nextMiles: Miles;
  sourcePatternIds: EntityId[];   // every agreeing source (Fill) or the open pattern (Copy)
  fromReverse: boolean;           // Fill only; always false for Copy
}
export interface DistanceSkip {
  patternId: EntityId; reason: DistanceSkipReason; segmentIndex?: number;
  candidates?: { miles: Miles; patternIds: EntityId[] }[];  // conflict only
}
export interface SegmentDistancePlan {
  mode: 'copyToOthers' | 'fillFromOthers';
  sourcePatternId: EntityId;      // the open pattern in both modes
  changes: DistanceChange[];
  skips: DistanceSkip[];
  affectedPatterns: { patternId: EntityId; changeCount: number; overwriteCount: number }[];
}
export interface SegmentDistancePlanInput {
  openPattern: RoutePattern;      // Fill: the draft. Copy: the saved pattern.
  patterns: RoutePattern[];       // the Route's saved patterns; may include the open pattern's saved record, which is ignored
  excludedPatternIds?: readonly EntityId[];  // Copy only
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

interface Segment { key: SegmentKey; miles: Miles }

/** The segments in sequence order. Keys come from `segmentKeys`; miles come from the sorted points, not from `getSegmentMiles` (array order). */
function segmentsOf(pattern: RoutePattern): Segment[] {
  const points = [...pattern.points].sort((left, right) => left.sequence - right.sequence);
  return segmentKeys(pattern).map((key, index) => ({ key, miles: round6(points[index + 1].cumulativeMiles - points[index].cumulativeMiles) }));
}

/**
 * The reverse key of each segment: entry `i` is segment `i` read backwards (B>A for A>B). It runs `segmentKeys` over the reversed points,
 * so the key format is defined in one place.
 */
function reverseKeysOf(pattern: RoutePattern): SegmentKey[] {
  const points = [...pattern.points].sort((left, right) => left.sequence - right.sequence).reverse().map((point, sequence) => ({ ...point, sequence }));
  return segmentKeys({ ...pattern, points }).reverse();
}

interface Indexed { pattern: RoutePattern; segments: Segment[]; indexes: Map<SegmentKey, number[]> }

function indexed(pattern: RoutePattern): Indexed {
  const segments = segmentsOf(pattern);
  const indexes = new Map<SegmentKey, number[]>();
  segments.forEach((segment, index) => indexes.set(segment.key, [...(indexes.get(segment.key) ?? []), index]));
  return { pattern, segments, indexes };
}

function otherPatterns(openPattern: RoutePattern, patterns: RoutePattern[]): RoutePattern[] {
  return patterns.filter((pattern) => pattern.id !== openPattern.id && pattern.routeId === openPattern.routeId && pattern.scenarioId === openPattern.scenarioId);
}

/** Orders patterns by name (numeric, case-insensitive), then by id. */
function patternOrder(openPattern: RoutePattern, patterns: RoutePattern[]): (left: EntityId, right: EntityId) => number {
  const names = new Map([...patterns, openPattern].map((pattern) => [pattern.id, pattern.name] as const));
  return (left, right) => (names.get(left) ?? '').localeCompare(names.get(right) ?? '', undefined, { numeric: true, sensitivity: 'base' }) || left.localeCompare(right);
}

function finish(mode: SegmentDistancePlan['mode'], input: SegmentDistancePlanInput, changes: DistanceChange[], skips: DistanceSkip[]): SegmentDistancePlan {
  const order = patternOrder(input.openPattern, input.patterns);
  const sortedChanges = [...changes].sort((left, right) => order(left.patternId, right.patternId) || left.segmentIndex - right.segmentIndex);
  const sortedSkips = [...skips].sort((left, right) => order(left.patternId, right.patternId) || (left.segmentIndex ?? 0) - (right.segmentIndex ?? 0));
  const affected = new Map<EntityId, SegmentDistancePlan['affectedPatterns'][number]>();
  for (const change of sortedChanges) {
    const entry = affected.get(change.patternId) ?? { patternId: change.patternId, changeCount: 0, overwriteCount: 0 };
    entry.changeCount += 1;
    if (change.previousMiles !== 0) entry.overwriteCount += 1;
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
 * Rules 4, 5, 7 and 8 for "Fill distances from other patterns". Only 0 segments of the open pattern (the draft) are filled. Same-direction
 * sources win; reverse sources are used only when no same-direction source exists. Disagreeing sources are reported as a conflict.
 */
export function planDistanceFill(input: SegmentDistancePlanInput): SegmentDistancePlan {
  const { openPattern } = input;
  const open = indexed(openPattern);
  const others = otherPatterns(openPattern, input.patterns).map(indexed);
  const reverseKeys = reverseKeysOf(openPattern);
  const changes: DistanceChange[] = [];
  const skips: DistanceSkip[] = [];
  const reported = new Set<string>();
  const reportAmbiguous = (patternId: EntityId, segmentIndex: number) => {
    const id = `${patternId}\u0000${segmentIndex}`;
    if (reported.has(id)) return;
    reported.add(id);
    skips.push({ patternId, reason: 'ambiguous', segmentIndex });
  };
  for (const [, at] of open.indexes) if (at.length > 1) skips.push({ patternId: openPattern.id, reason: 'ambiguous', segmentIndex: at[0] });
  open.segments.forEach((segment, index) => {
    if (segment.miles !== 0 || open.indexes.get(segment.key)!.length > 1) return;
    const lookUp = (key: SegmentKey) => {
      const sources: { patternId: EntityId; miles: Miles }[] = [];
      for (const other of others) {
        const at = other.indexes.get(key) ?? [];
        if (at.length > 1) { reportAmbiguous(other.pattern.id, index); continue; }
        if (at.length === 1 && other.segments[at[0]].miles !== 0) sources.push({ patternId: other.pattern.id, miles: other.segments[at[0]].miles });
      }
      return sources;
    };
    let fromReverse = false;
    let sources = lookUp(segment.key);
    if (!sources.length) {
      fromReverse = true;
      sources = lookUp(reverseKeys[index]);
    }
    if (!sources.length) return;
    const values = new Map<Miles, EntityId[]>();
    for (const source of sources) values.set(source.miles, [...(values.get(source.miles) ?? []), source.patternId]);
    if (values.size === 1) {
      const [[miles, patternIds]] = [...values];
      changes.push({ patternId: openPattern.id, segmentIndex: index, previousMiles: 0, nextMiles: miles, sourcePatternIds: [...patternIds].sort(), fromReverse });
    } else {
      skips.push({
        patternId: openPattern.id, reason: 'conflict', segmentIndex: index,
        candidates: [...values].map(([miles, patternIds]) => ({ miles, patternIds: [...patternIds].sort() })).sort((left, right) => left.miles - right.miles),
      });
    }
  });
  return finish('fillFromOthers', input, changes, skips);
}

/**
 * Rules 4, 5, 9 and 10 for "Copy distances to other patterns". Each non-zero segment of the open (saved) pattern replaces the same node pair
 * on other patterns, except excluded patterns. Reverse pairs are never written.
 */
export function planDistanceCopy(input: SegmentDistancePlanInput): SegmentDistancePlan {
  const { openPattern } = input;
  const open = indexed(openPattern);
  const excluded = new Set(input.excludedPatternIds ?? []);
  const others = otherPatterns(openPattern, input.patterns).filter((pattern) => !excluded.has(pattern.id)).map(indexed);
  const changes: DistanceChange[] = [];
  const skips: DistanceSkip[] = [];
  const reported = new Set<string>();
  for (const [, at] of open.indexes) if (at.length > 1) skips.push({ patternId: openPattern.id, reason: 'ambiguous', segmentIndex: at[0] });
  open.segments.forEach((segment, index) => {
    if (segment.miles === 0 || open.indexes.get(segment.key)!.length > 1) return;
    for (const other of others) {
      const at = other.indexes.get(segment.key) ?? [];
      if (at.length > 1) {
        const id = `${other.pattern.id}\u0000${index}`;
        if (!reported.has(id)) { reported.add(id); skips.push({ patternId: other.pattern.id, reason: 'ambiguous', segmentIndex: index }); }
        continue;
      }
      if (at.length !== 1) continue;
      const previousMiles = other.segments[at[0]].miles;
      if (previousMiles === segment.miles) continue;
      changes.push({ patternId: other.pattern.id, segmentIndex: at[0], previousMiles, nextMiles: segment.miles, sourcePatternIds: [openPattern.id], fromReverse: false });
    }
  });
  return finish('copyToOthers', input, changes, skips);
}

/** The other patterns of the Route that share at least one node pair with the open pattern, where the pair occurs once in each (Decision 0065, rule 5). */
export function copyCandidatePatternIds(openPattern: RoutePattern, patterns: RoutePattern[]): EntityId[] {
  const open = indexed(openPattern);
  const unique = [...open.indexes].filter(([, at]) => at.length === 1).map(([key]) => key);
  return otherPatterns(openPattern, patterns)
    .filter((pattern) => { const other = indexed(pattern); return unique.some((key) => other.indexes.get(key)?.length === 1); })
    .map((pattern) => pattern.id);
}

/** The changed patterns after a plan, with their new segment distances. Timestamps are set by the application layer. */
export function applySegmentDistancePlan(patterns: RoutePattern[], plan: SegmentDistancePlan): RoutePattern[] {
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern] as const));
  return plan.affectedPatterns.map(({ patternId }) => {
    const pattern = byId.get(patternId);
    if (!pattern) throw new Error('Pattern not found.');
    return plan.changes
      .filter((change) => change.patternId === patternId)
      .sort((left, right) => left.segmentIndex - right.segmentIndex)
      .reduce((next, change) => setSegmentMiles(next, change.segmentIndex, change.nextMiles), pattern);
  });
}
