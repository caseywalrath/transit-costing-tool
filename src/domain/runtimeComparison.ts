import { segmentKeys, type SegmentKey } from './segmentRuntimeMatching';
import type { DurationSeconds, RoutePattern, RuntimeAssignment, RuntimeBand, RuntimeProfile } from './types';

/** Decision 0075 items 2 to 4. Pure: no React, persistence, or application imports. */
export interface RuntimeComparisonInput {
  directionId: string;
  serviceDayId: string;
  patterns: RoutePattern[];
  profiles: RuntimeProfile[];
  assignments: RuntimeAssignment[];
  /** nodeIds in timetable-column order. */
  directionColumnOrder: string[];
}

export interface ComparisonSegment {
  key: SegmentKey;
  fromNodeId: string;
  toNodeId: string;
}

export interface ComparisonCell {
  patternId: string;
  profileId: string;
  bandId: string;
  segmentKey: SegmentKey;
  seconds: DurationSeconds;
  discrepancy: boolean;
  otherValues: { patternId: string; profileId: string; bandId: string; seconds: DurationSeconds }[];
}

export interface RuntimeComparison {
  segments: ComparisonSegment[];
  stacked: {
    patternId: string;
    profileId: string;
    bands: { bandId: string; startTime: number; endTime: number; cells: (ComparisonCell | undefined)[] /* by segments index */ }[];
  }[];
  intervals: {
    startTime: number;
    endTime: number;
    cells: Record<SegmentKey, { patternId: string; seconds: DurationSeconds }[]>;
  }[];
}

interface IncludedPattern {
  pattern: RoutePattern;
  profile: RuntimeProfile;
  /** Segment key to its index in the pattern's segment order. That index is the position in each band's segmentRuntimeSeconds. */
  indexByKey: Map<SegmentKey, number>;
  /** Keys that the pattern runs more than once (loops). */
  loopKeys: Set<SegmentKey>;
  /** Segment key to its ordered node pair. */
  ends: Map<SegmentKey, { fromNodeId: string; toNodeId: string }>;
}

/** Same ranking as segmentRuntimeMatching: sequence, then name, then id. */
function patternOrder(left: RoutePattern, right: RoutePattern): number {
  return (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

/** Same ordering as the band order used by segmentRuntimeMatching. */
function bandOrder(left: RuntimeBand, right: RuntimeBand): number {
  return left.startTime - right.startTime || left.endTime - right.endTime || left.sequence - right.sequence;
}

function sortedBands(profile: RuntimeProfile): RuntimeBand[] {
  return [...profile.bands].sort(bandOrder);
}

/** Length in seconds of the time two bands share. A value above zero means they overlap. */
function overlap(left: RuntimeBand, right: RuntimeBand): number {
  return Math.min(left.endTime, right.endTime) - Math.max(left.startTime, right.startTime);
}

/** The value of one segment in one band, or undefined when the pattern does not run that segment. */
function secondsOf(owner: IncludedPattern, band: RuntimeBand, key: SegmentKey): DurationSeconds | undefined {
  const index = owner.indexByKey.get(key);
  return index === undefined ? undefined : band.segmentRuntimeSeconds[index] ?? 0;
}

function includedPatterns(input: RuntimeComparisonInput): IncludedPattern[] {
  const profileById = new Map(input.profiles.map((profile) => [profile.id, profile]));
  return input.patterns
    .filter((pattern) => pattern.directionId === input.directionId)
    .sort(patternOrder)
    .flatMap((pattern) => {
      const assignment = input.assignments.find((item) => item.patternId === pattern.id && item.serviceDayId === input.serviceDayId);
      const profile = assignment ? profileById.get(assignment.runtimeProfileId) : undefined;
      if (!profile) return [];
      // segmentKeys and the sorted points share one order, so index i of keys is the segment from points[i] to points[i + 1].
      const keys = segmentKeys(pattern);
      const points = [...pattern.points].sort((left, right) => left.sequence - right.sequence);
      const counts = new Map<SegmentKey, number>();
      keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
      const ends = new Map<SegmentKey, { fromNodeId: string; toNodeId: string }>();
      keys.forEach((key, index) => ends.set(key, { fromNodeId: points[index].nodeId, toNodeId: points[index + 1].nodeId }));
      return [{
        pattern,
        profile,
        indexByKey: new Map(keys.map((key, index) => [key, index])),
        loopKeys: new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key)),
        ends,
      }];
    });
}

/** Other included patterns' bands that overlap `band` in time and run `key`. Zero values are listed too. */
function otherValuesFor(owner: IncludedPattern, band: RuntimeBand, key: SegmentKey, included: IncludedPattern[]): ComparisonCell['otherValues'] {
  const values: ComparisonCell['otherValues'] = [];
  for (const other of included) {
    if (other === owner) continue;
    for (const otherBand of sortedBands(other.profile)) {
      if (overlap(band, otherBand) <= 0) continue;
      const seconds = secondsOf(other, otherBand, key);
      if (seconds !== undefined) values.push({ patternId: other.pattern.id, profileId: other.profile.id, bandId: otherBand.id, seconds });
    }
  }
  return values;
}

/**
 * Decision 0075 item 4. A cell is a discrepancy when another pattern has an overlapping band with a different value for the same
 * segment. A `:00` value is never part of a discrepancy, on either side.
 */
function cellFor(owner: IncludedPattern, band: RuntimeBand, key: SegmentKey, included: IncludedPattern[]): ComparisonCell {
  const seconds = secondsOf(owner, band, key) ?? 0;
  const otherValues = otherValuesFor(owner, band, key, included);
  const discrepancy = seconds !== 0 && otherValues.some((value) => value.seconds !== 0 && value.seconds !== seconds);
  return { patternId: owner.pattern.id, profileId: owner.profile.id, bandId: band.id, segmentKey: key, seconds, discrepancy, otherValues };
}

/**
 * Decision 0075 items 2 to 4. Builds the shared segment axis, the stacked view (one row group per pattern of the Direction), and the
 * interval view (rows cut at every band boundary). Patterns without a runtime profile assigned for the Service day are left out.
 */
export function compareRouteRuntimes(input: RuntimeComparisonInput): RuntimeComparison {
  const included = includedPatterns(input);

  // Keys that any included pattern runs twice (loops) are left out of the segment axis, as segment matching leaves them out.
  const loopKeys = new Set<SegmentKey>();
  included.forEach((owner) => owner.loopKeys.forEach((key) => loopKeys.add(key)));
  const ends = new Map<SegmentKey, { fromNodeId: string; toNodeId: string }>();
  included.forEach((owner) => owner.ends.forEach((end, key) => { if (!loopKeys.has(key)) ends.set(key, end); }));

  // Decision 0075 item 2. Position is the index of the node in directionColumnOrder. A node that is not in the order sorts last.
  const position = new Map<string, number>();
  input.directionColumnOrder.forEach((nodeId, index) => { if (!position.has(nodeId)) position.set(nodeId, index); });
  const at = (nodeId: string) => position.get(nodeId) ?? Number.MAX_SAFE_INTEGER;
  const segments: ComparisonSegment[] = [...ends]
    .map(([key, end]) => ({ key, fromNodeId: end.fromNodeId, toNodeId: end.toNodeId }))
    .sort((left, right) => at(left.fromNodeId) - at(right.fromNodeId) || at(left.toNodeId) - at(right.toNodeId) || left.fromNodeId.localeCompare(right.fromNodeId) || left.toNodeId.localeCompare(right.toNodeId));

  const stacked = included.map((owner) => ({
    patternId: owner.pattern.id,
    profileId: owner.profile.id,
    bands: sortedBands(owner.profile).map((band) => ({
      bandId: band.id,
      startTime: band.startTime,
      endTime: band.endTime,
      cells: segments.map((segment) => (owner.indexByKey.has(segment.key) ? cellFor(owner, band, segment.key, included) : undefined)),
    })),
  }));

  // Decision 0075 item 3. Intervals are cut at every band boundary of the included profiles.
  const boundaries = [...new Set(included.flatMap((owner) => owner.profile.bands.flatMap((band) => [band.startTime, band.endTime])))].sort((left, right) => left - right);
  const intervals = boundaries.slice(0, -1).map((startTime, index) => {
    const endTime = boundaries[index + 1];
    const cells = Object.fromEntries(segments.map((segment) => [
      segment.key,
      included.flatMap((owner) => {
        if (!owner.indexByKey.has(segment.key)) return [];
        return sortedBands(owner.profile)
          .filter((band) => band.startTime <= startTime && band.endTime >= endTime)
          .map((band) => ({ patternId: owner.pattern.id, seconds: secondsOf(owner, band, segment.key) ?? 0 }));
      }),
    ])) as RuntimeComparison['intervals'][number]['cells'];
    return { startTime, endTime, cells };
  });

  return { segments, stacked, intervals };
}
