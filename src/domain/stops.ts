import type {
  EntityId,
  PatternPoint,
  PatternStopPlacement,
  Route,
  RoutePattern,
  RouteStop,
  RouteStopSet,
  StopTimeRoundingSeconds,
  StopTimingRule,
  ValidationFinding,
  ValidationSeverity,
} from './types';

/** Decision 0079. Order of timing rules within a segment: `previous`, then `interpolate`, then `next`. */
export const STOP_TIMING_RANK: Record<StopTimingRule, number> = { previous: 0, interpolate: 1, next: 2 };
export const DEFAULT_STOP_ROUNDING_SECONDS: StopTimeRoundingSeconds = 60;

/** Points sorted by sequence (a copy). */
export function sortedPoints(pattern: RoutePattern): PatternPoint[] {
  return [...pattern.points].sort((left, right) => left.sequence - right.sequence);
}

/** Section 4.2. Segment index of a placement, or undefined when its point is missing or is the last point. */
export function placementSegmentIndex(pattern: RoutePattern, placement: PatternStopPlacement): number | undefined {
  const points = sortedPoints(pattern);
  const index = points.findIndex((point) => point.id === placement.afterPatternPointId);
  return index >= 0 && index < points.length - 1 ? index : undefined;
}

/** Section 4.2. One array per segment (length points − 1, or 0), each sorted by sequence. Invalid placements are left out. */
export function placementsBySegment(pattern: RoutePattern, placements: readonly PatternStopPlacement[]): PatternStopPlacement[][] {
  const segments: PatternStopPlacement[][] = Array.from({ length: Math.max(pattern.points.length - 1, 0) }, () => []);
  for (const placement of placements) {
    const index = placementSegmentIndex(pattern, placement);
    if (index !== undefined) segments[index].push(placement);
  }
  for (const segment of segments) segment.sort((left, right) => left.sequence - right.sequence);
  return segments;
}

/** Section 4.5. */
export function normalizePlacements(pattern: RoutePattern, placements: readonly PatternStopPlacement[]): PatternStopPlacement[] {
  return placementsBySegment(pattern, placements).flatMap((segment) => segment.map((placement, sequence) => ({ ...placement, sequence })));
}

function finding(
  ruleId: string,
  severity: ValidationSeverity,
  entityType: string,
  entityId: EntityId,
  field?: string,
  parameters?: Record<string, string | number>,
): ValidationFinding {
  return {
    ruleId,
    severity,
    entityType,
    entityId,
    messageKey: ruleId,
    ...(field === undefined ? {} : { field }),
    ...(parameters === undefined ? {} : { parameters }),
  };
}

/** Section 4.4. `patterns` are the Route's patterns; entries for other patterns are ignored. */
export function validateRouteStopSet(set: RouteStopSet, patterns: readonly RoutePattern[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const stopIds = new Set<EntityId>();
  const codes = new Set<string>();

  for (const stop of set.stops) {
    if (stop.name.trim() === '') findings.push(finding('routeStop.nameRequired', 'error', 'routeStop', stop.id, 'name'));
    if (stopIds.has(stop.id)) findings.push(finding('routeStop.idDuplicate', 'error', 'routeStop', stop.id));
    stopIds.add(stop.id);
    // An empty stop ID after trimming is treated as no stop ID.
    const stopCode = stop.stopCode?.trim() ?? '';
    if (stopCode !== '') {
      const key = stopCode.toLowerCase();
      if (codes.has(key)) findings.push(finding('routeStop.codeDuplicate', 'error', 'routeStop', stop.id, 'stopCode', { stopCode }));
      codes.add(key);
    }
  }

  for (const pattern of patterns) {
    if (pattern.routeId !== set.routeId) continue;
    const segments = placementsBySegment(pattern, set.placementsByPatternId[pattern.id] ?? []);
    const placementIds = new Set<EntityId>();
    segments.forEach((segment, segmentIndex) => {
      const stopsInSegment = new Set<EntityId>();
      segment.forEach((placement, position) => {
        const parameters = { patternId: pattern.id, segmentIndex };
        if (placementIds.has(placement.id)) findings.push(finding('stopPlacement.idDuplicate', 'error', 'stopPlacement', placement.id));
        placementIds.add(placement.id);
        if (!stopIds.has(placement.stopId)) findings.push(finding('stopPlacement.stopMissing', 'error', 'stopPlacement', placement.id));
        if (stopsInSegment.has(placement.stopId)) findings.push(finding('stopPlacement.repeatedInSegment', 'error', 'stopPlacement', placement.id, undefined, parameters));
        stopsInSegment.add(placement.stopId);
        const previous = segment[position - 1];
        if (previous && STOP_TIMING_RANK[previous.timing] > STOP_TIMING_RANK[placement.timing]) {
          findings.push(finding('stopPlacement.timingOutOfOrder', 'warning', 'stopPlacement', previous.id, undefined, parameters));
        }
      });
    });
  }

  if (set.roundingSeconds !== 30 && set.roundingSeconds !== 60) {
    findings.push(finding('routeStopSet.roundingInvalid', 'error', 'routeStopSet', set.id, 'roundingSeconds'));
  }
  return findings;
}

/**
 * Section 4.5. Returns the input array itself when nothing changed. A set whose stops are all gone is dropped, and so is
 * a set whose Route is missing.
 */
export function pruneRouteStopSets(sets: RouteStopSet[], owners: { routes: readonly Route[]; patterns: readonly RoutePattern[] }): RouteStopSet[] {
  const routeIds = new Set(owners.routes.map((route) => route.id));
  const patternById = new Map(owners.patterns.map((pattern) => [pattern.id, pattern] as const));
  let changed = false;
  const next: RouteStopSet[] = [];

  for (const set of sets) {
    if (!routeIds.has(set.routeId)) { changed = true; continue; }
    let placementsChanged = false;
    const placementsByPatternId: Record<EntityId, RouteStopSet['placementsByPatternId'][string]> = {};
    for (const [patternId, placements] of Object.entries(set.placementsByPatternId)) {
      const pattern = patternById.get(patternId);
      if (!pattern || pattern.routeId !== set.routeId) { placementsChanged = true; continue; }
      const normalized = normalizePlacements(pattern, placements);
      if (normalized.length === 0) { placementsChanged = true; continue; }
      if (JSON.stringify(normalized) !== JSON.stringify(placements)) placementsChanged = true;
      placementsByPatternId[patternId] = normalized;
    }
    const usedStopIds = new Set(Object.values(placementsByPatternId).flat().map((placement) => placement.stopId));
    const stops = set.stops.filter((stop) => usedStopIds.has(stop.id));
    if (stops.length === 0) { changed = true; continue; }
    if (!placementsChanged && stops.length === set.stops.length) { next.push(set); continue; }
    changed = true;
    next.push({ ...set, stops, placementsByPatternId });
  }
  return changed ? next : sets;
}

/**
 * Section 4.6. Reconciles the placements of a saved pattern with the pattern after an edit. Placements are processed in saved
 * segment order, then sequence. A moved placement goes after the placements already on its new point.
 */
export function reconcilePlacements(
  saved: RoutePattern,
  next: RoutePattern,
  placements: readonly PatternStopPlacement[],
): { placements: PatternStopPlacement[]; movedCount: number; removedCount: number } {
  const savedPoints = sortedPoints(saved);
  const nextPoints = sortedPoints(next);
  const nextIds = new Set(nextPoints.map((point) => point.id));
  const nextLast = nextPoints[nextPoints.length - 1]?.id;
  const result: PatternStopPlacement[] = [];
  let movedCount = 0;
  let removedCount = 0;

  for (const placement of placementsBySegment(saved, placements).flat()) {
    if (nextPoints.length < 2) { removedCount += 1; continue; }
    const pointId = placement.afterPatternPointId;
    if (nextIds.has(pointId)) {
      if (pointId === nextLast) removedCount += 1;
      else result.push(placement);
      continue;
    }
    const savedIndex = savedPoints.findIndex((point) => point.id === pointId);
    const before = savedPoints.slice(0, savedIndex).reverse().find((point) => nextIds.has(point.id));
    const after = savedPoints.slice(savedIndex + 1).find((point) => nextIds.has(point.id));
    if (before && after && before.id !== nextLast) {
      const sequence = Math.max(-1, ...result.filter((kept) => kept.afterPatternPointId === before.id).map((kept) => kept.sequence)) + 1;
      result.push({ ...placement, afterPatternPointId: before.id, sequence });
      movedCount += 1;
    } else {
      removedCount += 1;
    }
  }
  return { placements: normalizePlacements(next, result), movedCount, removedCount };
}

/**
 * Copies a set for a duplicated Route or Scenario (Decision 0079 item 11). New set id; stop and placement ids are kept. Pattern keys and
 * afterPatternPointId are mapped; an entry whose pattern has no mapping is dropped, and a placement whose point has no mapping is dropped.
 */
export function remapRouteStopSet(
  set: RouteStopSet,
  target: { id: EntityId; scenarioId: EntityId; routeId: EntityId; patternIds: ReadonlyMap<EntityId, EntityId>; pointIds: ReadonlyMap<EntityId, EntityId> },
  now: string,
): RouteStopSet {
  const placementsByPatternId: RouteStopSet['placementsByPatternId'] = {};
  for (const [patternId, placements] of Object.entries(set.placementsByPatternId)) {
    const targetPatternId = target.patternIds.get(patternId);
    if (targetPatternId === undefined) continue;
    const mapped = placements.flatMap((placement) => {
      const pointId = target.pointIds.get(placement.afterPatternPointId);
      return pointId === undefined ? [] : [{ ...placement, afterPatternPointId: pointId }];
    });
    // A pattern with no stops has no entry (Decision 0079 item 2 and section 4.1).
    if (mapped.length > 0) placementsByPatternId[targetPatternId] = mapped;
  }
  return {
    ...set,
    id: target.id,
    scenarioId: target.scenarioId,
    routeId: target.routeId,
    placementsByPatternId,
    stops: set.stops.map((stop): RouteStop => ({ ...stop })),
    createdAt: now,
    updatedAt: now,
  };
}
