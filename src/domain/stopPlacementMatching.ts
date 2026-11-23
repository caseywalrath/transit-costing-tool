import type { EntityId, PatternPoint, PatternStopPlacement, RoutePattern, StopLocation, StopTimingRule, TimepointLocations, TimepointStopCodes, TimepointStopNames } from './types';
import { segmentKeys, type SegmentKey } from './segmentRuntimeMatching';
import { placementSegmentIndex, placementsBySegment, normalizePlacements, normalizeStopLocation, normalizeTimepointLocations, normalizeTimepointStopCodes, normalizeTimepointStopNames, sameLocation, sortedPoints } from './stops';

/** Decision 0079 item 9 and section 4.7. Matching is derived from stored placements and is never stored. */
export interface StopSegmentEntry { stopId: EntityId; timing: StopTimingRule; }
export type StopSkipReason = 'ambiguous' | 'conflict';
export interface StopSegmentChange { patternId: EntityId; segmentIndex: number; previous: StopSegmentEntry[]; next: StopSegmentEntry[]; sourcePatternIds: EntityId[]; }
export interface StopSegmentSkip { patternId: EntityId; reason: StopSkipReason; segmentIndex?: number; candidates?: { entries: StopSegmentEntry[]; patternIds: EntityId[] }[]; }
/** Decision 0080. One timepoint stop ID written to the point of `patternId` that stands on `nodeId`. */
export interface TimepointCodeChange { patternId: EntityId; patternPointId: EntityId; nodeId: EntityId; previous?: string; next: string; sourcePatternIds: EntityId[]; }
/** Decision 0080. `ambiguous`: the Node occurs more than once in the pattern. `conflict`: the source patterns disagree. */
export interface TimepointCodeSkip { patternId: EntityId; nodeId: EntityId; reason: StopSkipReason; candidates?: { stopCode: string; patternIds: EntityId[] }[]; }
/** Decision 0092 item 11. One timepoint stop name written to the point of `patternId` that stands on `nodeId`. */
export interface TimepointNameChange { patternId: EntityId; patternPointId: EntityId; nodeId: EntityId; previous?: string; next: string; sourcePatternIds: EntityId[]; }
/** Decision 0092 item 11. Same reasons as Decision 0080: `ambiguous` and `conflict`. */
export interface TimepointNameSkip { patternId: EntityId; nodeId: EntityId; reason: StopSkipReason; candidates?: { stopName: string; patternIds: EntityId[] }[]; }
/** Decision 0085 item 6. One timepoint location written to the point of `patternId` that stands on `nodeId`. */
export interface TimepointLocationChange { patternId: EntityId; patternPointId: EntityId; nodeId: EntityId; previous?: StopLocation; next: StopLocation; sourcePatternIds: EntityId[]; }
/** Decision 0085 item 6. Same reasons as Decision 0080: `ambiguous` and `conflict`. */
export interface TimepointLocationSkip { patternId: EntityId; nodeId: EntityId; reason: StopSkipReason; candidates?: { location: StopLocation; patternIds: EntityId[] }[]; }
export interface StopPlacementPlan {
  mode: 'copyToOthers' | 'fillFromOthers';
  sourcePatternId: EntityId;
  changes: StopSegmentChange[];
  skips: StopSegmentSkip[];
  /** Decision 0080. Timepoint stop IDs, matched by Node between patterns of the same direction. */
  codeChanges: TimepointCodeChange[];
  codeSkips: TimepointCodeSkip[];
  /** Decision 0085. Timepoint locations, matched the same way as timepoint stop IDs. */
  locationChanges: TimepointLocationChange[];
  locationSkips: TimepointLocationSkip[];
  /** Decision 0092 item 11. Timepoint stop names, matched the same way as timepoint stop IDs. */
  nameChanges: TimepointNameChange[];
  nameSkips: TimepointNameSkip[];
  /** A change is one segment, one timepoint stop ID, one timepoint location or one timepoint stop name; an overwrite replaces stops, a stop ID, a location or a name that were there. */
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
  /** Decision 0080. Fill: the editor draft's timepoint stop IDs. Copy: the stored ones of the open pattern. */
  openCodes?: Readonly<TimepointStopCodes>;
  /** Decision 0080. The stored timepoint stop IDs of every pattern. */
  codesByPatternId?: Readonly<Record<EntityId, Readonly<TimepointStopCodes>>>;
  /** Decision 0085. Fill: the editor draft's timepoint locations. Copy: the stored ones of the open pattern. */
  openLocations?: Readonly<Partial<TimepointLocations>>;
  /** Decision 0085. The stored timepoint locations of every pattern. */
  locationsByPatternId?: Readonly<Record<EntityId, Readonly<Partial<TimepointLocations>>>>;
  /** Decision 0092. Fill: the editor draft's timepoint stop names. Copy: the stored ones of the open pattern. */
  openNames?: Readonly<TimepointStopNames>;
  /** Decision 0092. The stored timepoint stop names of every pattern. */
  namesByPatternId?: Readonly<Record<EntityId, Readonly<TimepointStopNames>>>;
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

/** Decision 0080. Patterns of one direction: both have a direction and it is the same one. */
export function sameDirection(left: RoutePattern, right: RoutePattern): boolean {
  return left.directionId !== undefined && left.directionId === right.directionId;
}

/** Points by Node, in point order. */
function pointsByNode(pattern: RoutePattern): Map<EntityId, PatternPoint[]> {
  const result = new Map<EntityId, PatternPoint[]>();
  for (const point of sortedPoints(pattern)) result.set(point.nodeId, [...(result.get(point.nodeId) ?? []), point]);
  return result;
}

/**
 * Decision 0080. Timepoint stop IDs for Fill (the open draft's points without one, from same-direction patterns that agree) or Copy (the open
 * pattern's stop IDs onto the same Node of same-direction patterns, except excluded ones). A Node that occurs more than once in a pattern is skipped.
 */
function planCodes(mode: StopPlacementPlan['mode'], input: StopPlacementPlanInput): { codeChanges: TimepointCodeChange[]; codeSkips: TimepointCodeSkip[] } {
  const { openPattern } = input;
  const openCodes = normalizeTimepointStopCodes(openPattern, input.openCodes);
  const excluded = new Set(mode === 'copyToOthers' ? input.excludedPatternIds ?? [] : []);
  const others = otherPatterns(openPattern, input.patterns)
    .filter((pattern) => sameDirection(openPattern, pattern) && !excluded.has(pattern.id))
    .map((pattern) => ({ pattern, points: pointsByNode(pattern), codes: normalizeTimepointStopCodes(pattern, input.codesByPatternId?.[pattern.id]) }));
  const codeChanges: TimepointCodeChange[] = [];
  const codeSkips: TimepointCodeSkip[] = [];
  const reported = new Set<string>();
  const ambiguous = (patternId: EntityId, nodeId: EntityId) => {
    const id = `${patternId}\u0000${nodeId}`;
    if (!reported.has(id)) { reported.add(id); codeSkips.push({ patternId, nodeId, reason: 'ambiguous' }); }
  };
  for (const [nodeId, points] of pointsByNode(openPattern)) {
    const relevant = mode === 'fillFromOthers' ? points.some((point) => openCodes[point.id] === undefined) : points.some((point) => openCodes[point.id] !== undefined);
    if (!relevant) continue;
    if (points.length > 1) { ambiguous(openPattern.id, nodeId); continue; }
    const [point] = points;
    if (mode === 'fillFromOthers') {
      const groups = new Map<string, EntityId[]>();
      for (const other of others) {
        const at = other.points.get(nodeId) ?? [];
        if (at.length > 1) { ambiguous(other.pattern.id, nodeId); continue; }
        const code = at.length === 1 ? other.codes[at[0].id] : undefined;
        if (code !== undefined) groups.set(code, [...(groups.get(code) ?? []), other.pattern.id]);
      }
      if (groups.size === 1) {
        const [[code, patternIds]] = [...groups];
        codeChanges.push({ patternId: openPattern.id, patternPointId: point.id, nodeId, next: code, sourcePatternIds: [...patternIds].sort() });
      } else if (groups.size > 1) {
        codeSkips.push({ patternId: openPattern.id, nodeId, reason: 'conflict', candidates: [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([stopCode, patternIds]) => ({ stopCode, patternIds: [...patternIds].sort() })) });
      }
      continue;
    }
    const code = openCodes[point.id];
    for (const other of others) {
      const at = other.points.get(nodeId) ?? [];
      if (at.length > 1) { ambiguous(other.pattern.id, nodeId); continue; }
      if (at.length !== 1) continue;
      const previous = other.codes[at[0].id];
      if (previous === code) continue;
      codeChanges.push({ patternId: other.pattern.id, patternPointId: at[0].id, nodeId, ...(previous === undefined ? {} : { previous }), next: code, sourcePatternIds: [openPattern.id] });
    }
  }
  return { codeChanges, codeSkips };
}

/**
 * Decision 0092 item 11. `planCodes` for timepoint stop names: the same Node matching, direction rule, ambiguity rule and conflict rule.
 * Copy never clears a name, because an absent source is not relevant.
 */
function planNames(mode: StopPlacementPlan['mode'], input: StopPlacementPlanInput): { nameChanges: TimepointNameChange[]; nameSkips: TimepointNameSkip[] } {
  const { openPattern } = input;
  const openNames = normalizeTimepointStopNames(openPattern, input.openNames);
  const excluded = new Set(mode === 'copyToOthers' ? input.excludedPatternIds ?? [] : []);
  const others = otherPatterns(openPattern, input.patterns)
    .filter((pattern) => sameDirection(openPattern, pattern) && !excluded.has(pattern.id))
    .map((pattern) => ({ pattern, points: pointsByNode(pattern), names: normalizeTimepointStopNames(pattern, input.namesByPatternId?.[pattern.id]) }));
  const nameChanges: TimepointNameChange[] = [];
  const nameSkips: TimepointNameSkip[] = [];
  const reported = new Set<string>();
  const ambiguous = (patternId: EntityId, nodeId: EntityId) => {
    const id = `${patternId}\u0000${nodeId}`;
    if (!reported.has(id)) { reported.add(id); nameSkips.push({ patternId, nodeId, reason: 'ambiguous' }); }
  };
  for (const [nodeId, points] of pointsByNode(openPattern)) {
    const relevant = mode === 'fillFromOthers' ? points.some((point) => openNames[point.id] === undefined) : points.some((point) => openNames[point.id] !== undefined);
    if (!relevant) continue;
    if (points.length > 1) { ambiguous(openPattern.id, nodeId); continue; }
    const [point] = points;
    if (mode === 'fillFromOthers') {
      const groups = new Map<string, EntityId[]>();
      for (const other of others) {
        const at = other.points.get(nodeId) ?? [];
        if (at.length > 1) { ambiguous(other.pattern.id, nodeId); continue; }
        const name = at.length === 1 ? other.names[at[0].id] : undefined;
        if (name !== undefined) groups.set(name, [...(groups.get(name) ?? []), other.pattern.id]);
      }
      if (groups.size === 1) {
        const [[name, patternIds]] = [...groups];
        nameChanges.push({ patternId: openPattern.id, patternPointId: point.id, nodeId, next: name, sourcePatternIds: [...patternIds].sort() });
      } else if (groups.size > 1) {
        nameSkips.push({ patternId: openPattern.id, nodeId, reason: 'conflict', candidates: [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([stopName, patternIds]) => ({ stopName, patternIds: [...patternIds].sort() })) });
      }
      continue;
    }
    const name = openNames[point.id];
    for (const other of others) {
      const at = other.points.get(nodeId) ?? [];
      if (at.length > 1) { ambiguous(other.pattern.id, nodeId); continue; }
      if (at.length !== 1) continue;
      const previous = other.names[at[0].id];
      if (previous === name) continue;
      nameChanges.push({ patternId: other.pattern.id, patternPointId: at[0].id, nodeId, ...(previous === undefined ? {} : { previous }), next: name, sourcePatternIds: [openPattern.id] });
    }
  }
  return { nameChanges, nameSkips };
}

/**
 * Decision 0085 item 6 (section 4.6). `planCodes` for timepoint locations: the same Node matching, direction rule, ambiguity rule and conflict
 * rule. A location is present when it normalizes to a value. Copy never clears a location, because an absent source is not relevant.
 */
function planLocations(mode: StopPlacementPlan['mode'], input: StopPlacementPlanInput): { locationChanges: TimepointLocationChange[]; locationSkips: TimepointLocationSkip[] } {
  const { openPattern } = input;
  const openLocations = normalizeTimepointLocations(openPattern, input.openLocations);
  const excluded = new Set(mode === 'copyToOthers' ? input.excludedPatternIds ?? [] : []);
  const others = otherPatterns(openPattern, input.patterns)
    .filter((pattern) => sameDirection(openPattern, pattern) && !excluded.has(pattern.id))
    .map((pattern) => ({ pattern, points: pointsByNode(pattern), locations: normalizeTimepointLocations(pattern, input.locationsByPatternId?.[pattern.id]) }));
  const locationChanges: TimepointLocationChange[] = [];
  const locationSkips: TimepointLocationSkip[] = [];
  const reported = new Set<string>();
  const ambiguous = (patternId: EntityId, nodeId: EntityId) => {
    const id = `${patternId}\u0000${nodeId}`;
    if (!reported.has(id)) { reported.add(id); locationSkips.push({ patternId, nodeId, reason: 'ambiguous' }); }
  };
  for (const [nodeId, points] of pointsByNode(openPattern)) {
    const relevant = mode === 'fillFromOthers' ? points.some((point) => openLocations[point.id] === undefined) : points.some((point) => openLocations[point.id] !== undefined);
    if (!relevant) continue;
    if (points.length > 1) { ambiguous(openPattern.id, nodeId); continue; }
    const [point] = points;
    if (mode === 'fillFromOthers') {
      const groups = new Map<string, { location: StopLocation; patternIds: EntityId[] }>();
      for (const other of others) {
        const at = other.points.get(nodeId) ?? [];
        if (at.length > 1) { ambiguous(other.pattern.id, nodeId); continue; }
        const location = at.length === 1 ? normalizeStopLocation(other.locations[at[0].id]) : undefined;
        if (location === undefined) continue;
        const key = JSON.stringify(location);
        const group = groups.get(key) ?? { location, patternIds: [] };
        group.patternIds.push(other.pattern.id);
        groups.set(key, group);
      }
      if (groups.size === 1) {
        const [group] = [...groups.values()];
        locationChanges.push({ patternId: openPattern.id, patternPointId: point.id, nodeId, next: group.location, sourcePatternIds: [...group.patternIds].sort() });
      } else if (groups.size > 1) {
        locationSkips.push({
          patternId: openPattern.id,
          nodeId,
          reason: 'conflict',
          candidates: [...groups]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, group]) => ({ location: group.location, patternIds: [...group.patternIds].sort() })),
        });
      }
      continue;
    }
    const location = openLocations[point.id];
    for (const other of others) {
      const at = other.points.get(nodeId) ?? [];
      if (at.length > 1) { ambiguous(other.pattern.id, nodeId); continue; }
      if (at.length !== 1) continue;
      const previous = other.locations[at[0].id];
      if (sameLocation(previous, location)) continue;
      locationChanges.push({ patternId: other.pattern.id, patternPointId: at[0].id, nodeId, ...(previous === undefined ? {} : { previous }), next: location, sourcePatternIds: [openPattern.id] });
    }
  }
  return { locationChanges, locationSkips };
}

function finish(mode: StopPlacementPlan['mode'], input: StopPlacementPlanInput, changes: StopSegmentChange[], skips: StopSegmentSkip[]): StopPlacementPlan {
  const order = patternOrder(input.openPattern, input.patterns);
  const sortedChanges = [...changes].sort((left, right) => order(left.patternId, right.patternId) || left.segmentIndex - right.segmentIndex);
  const sortedSkips = [...skips].sort((left, right) => order(left.patternId, right.patternId) || (left.segmentIndex ?? 0) - (right.segmentIndex ?? 0));
  const { codeChanges, codeSkips } = planCodes(mode, input);
  // Code changes keep the open pattern's point order within each pattern; the sort is stable.
  const sortedCodeChanges = [...codeChanges].sort((left, right) => order(left.patternId, right.patternId));
  const sortedCodeSkips = [...codeSkips].sort((left, right) => order(left.patternId, right.patternId));
  const { locationChanges, locationSkips } = planLocations(mode, input);
  const sortedLocationChanges = [...locationChanges].sort((left, right) => order(left.patternId, right.patternId));
  const sortedLocationSkips = [...locationSkips].sort((left, right) => order(left.patternId, right.patternId));
  // Decision 0092 item 11. Name changes keep the open pattern's point order within each pattern; the sort is stable.
  const { nameChanges, nameSkips } = planNames(mode, input);
  const sortedNameChanges = [...nameChanges].sort((left, right) => order(left.patternId, right.patternId));
  const sortedNameSkips = [...nameSkips].sort((left, right) => order(left.patternId, right.patternId));
  const affected = new Map<EntityId, StopPlacementPlan['affectedPatterns'][number]>();
  const count = (patternId: EntityId, overwrite: boolean) => {
    const entry = affected.get(patternId) ?? { patternId, changeCount: 0, overwriteCount: 0 };
    entry.changeCount += 1;
    if (overwrite) entry.overwriteCount += 1;
    affected.set(patternId, entry);
  };
  for (const change of sortedChanges) count(change.patternId, change.previous.length !== 0);
  for (const change of sortedCodeChanges) count(change.patternId, change.previous !== undefined);
  for (const change of sortedLocationChanges) count(change.patternId, change.previous !== undefined);
  for (const change of sortedNameChanges) count(change.patternId, change.previous !== undefined);
  return {
    mode,
    sourcePatternId: input.openPattern.id,
    changes: sortedChanges,
    skips: sortedSkips,
    codeChanges: sortedCodeChanges,
    codeSkips: sortedCodeSkips,
    locationChanges: sortedLocationChanges,
    locationSkips: sortedLocationSkips,
    nameChanges: sortedNameChanges,
    nameSkips: sortedNameSkips,
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

/**
 * The other patterns of the Route that share at least one node pair with the open pattern, where the pair occurs once in each (Decision 0065,
 * rule 5), or that are of the same direction and share a Node that occurs once in each (Decision 0080).
 */
export function stopCopyCandidatePatternIds(openPattern: RoutePattern, patterns: readonly RoutePattern[]): EntityId[] {
  const countOf = (keys: string[]) => {
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  };
  const nodeKeys = (pattern: RoutePattern) => pattern.points.map((point) => point.nodeId);
  const openCounts = countOf(segmentKeys(openPattern));
  const openNodes = countOf(nodeKeys(openPattern));
  return otherPatterns(openPattern, patterns)
    .filter((pattern) => {
      const counts = countOf(segmentKeys(pattern));
      if ([...openCounts].some(([key, count]) => count === 1 && counts.get(key) === 1)) return true;
      if (!sameDirection(openPattern, pattern)) return false;
      const nodes = countOf(nodeKeys(pattern));
      return [...openNodes].some(([nodeId, count]) => count === 1 && nodes.get(nodeId) === 1);
    })
    .map((pattern) => pattern.id);
}

/**
 * Decision 0080. Applies `plan.codeChanges` to `current` (pattern ID → timepoint stop IDs). `patterns` must hold each pattern as it is to be
 * written (the draft for Fill). Returns the changed patterns' new stop IDs, normalized.
 */
export function applyTimepointCodePlan(
  patterns: readonly RoutePattern[],
  current: Readonly<Record<EntityId, Readonly<TimepointStopCodes>>>,
  plan: Pick<StopPlacementPlan, 'codeChanges'>,
): Record<EntityId, TimepointStopCodes> {
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern] as const));
  const result: Record<EntityId, TimepointStopCodes> = {};
  for (const change of plan.codeChanges) {
    const pattern = byId.get(change.patternId);
    if (!pattern) throw new Error('Pattern not found.');
    if (!pattern.points.some((point) => point.id === change.patternPointId && point.nodeId === change.nodeId)) throw new Error('Timepoint not found.');
    result[change.patternId] = { ...(result[change.patternId] ?? current[change.patternId]), [change.patternPointId]: change.next };
  }
  for (const patternId of Object.keys(result)) result[patternId] = normalizeTimepointStopCodes(byId.get(patternId)!, result[patternId]);
  return result;
}

/**
 * Decision 0092 item 11. Applies `plan.nameChanges` to `current` (pattern ID → timepoint stop names), as `applyTimepointCodePlan` does for
 * stop IDs. `patterns` must hold each pattern as it is to be written. Returns the changed patterns' new names, normalized.
 */
export function applyTimepointNamePlan(
  patterns: readonly RoutePattern[],
  current: Readonly<Record<EntityId, Readonly<TimepointStopNames>>>,
  plan: Pick<StopPlacementPlan, 'nameChanges'>,
): Record<EntityId, TimepointStopNames> {
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern] as const));
  const result: Record<EntityId, TimepointStopNames> = {};
  for (const change of plan.nameChanges) {
    const pattern = byId.get(change.patternId);
    if (!pattern) throw new Error('Pattern not found.');
    if (!pattern.points.some((point) => point.id === change.patternPointId && point.nodeId === change.nodeId)) throw new Error('Timepoint not found.');
    result[change.patternId] = { ...(result[change.patternId] ?? current[change.patternId]), [change.patternPointId]: change.next };
  }
  for (const patternId of Object.keys(result)) result[patternId] = normalizeTimepointStopNames(byId.get(patternId)!, result[patternId]);
  return result;
}

/**
 * Decision 0085 item 6. Applies `plan.locationChanges` to `current` (pattern ID → timepoint locations), as `applyTimepointCodePlan` does for
 * stop IDs. `patterns` must hold each pattern as it is to be written. Returns the changed patterns' new locations, normalized.
 */
export function applyTimepointLocationPlan(
  patterns: readonly RoutePattern[],
  current: Readonly<Record<EntityId, Readonly<Partial<TimepointLocations>>>>,
  plan: Pick<StopPlacementPlan, 'locationChanges'>,
): Record<EntityId, TimepointLocations> {
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern] as const));
  const result: Record<EntityId, Partial<TimepointLocations>> = {};
  for (const change of plan.locationChanges) {
    const pattern = byId.get(change.patternId);
    if (!pattern) throw new Error('Pattern not found.');
    if (!pattern.points.some((point) => point.id === change.patternPointId && point.nodeId === change.nodeId)) throw new Error('Timepoint not found.');
    result[change.patternId] = { ...(result[change.patternId] ?? current[change.patternId]), [change.patternPointId]: { ...change.next } };
  }
  const normalized: Record<EntityId, TimepointLocations> = {};
  for (const patternId of Object.keys(result)) normalized[patternId] = normalizeTimepointLocations(byId.get(patternId)!, result[patternId]);
  return normalized;
}

/**
 * Applies `plan.changes` to `current` (pattern ID → placements). `patterns` must hold each pattern as it is to be written (the draft for
 * Fill). A changed segment's placements are replaced by new placements on the segment's point, with new IDs from `makeId`. Other segments
 * keep theirs. Returns the changed patterns' new placement lists, normalized.
 */
export function applyStopPlacementPlan(
  patterns: readonly RoutePattern[],
  current: Readonly<Record<EntityId, readonly PatternStopPlacement[]>>,
  plan: Pick<StopPlacementPlan, 'changes'>,
  makeId: () => EntityId,
): Record<EntityId, PatternStopPlacement[]> {
  const byId = new Map(patterns.map((pattern) => [pattern.id, pattern] as const));
  const result: Record<EntityId, PatternStopPlacement[]> = {};
  for (const patternId of new Set(plan.changes.map((change) => change.patternId))) {
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
