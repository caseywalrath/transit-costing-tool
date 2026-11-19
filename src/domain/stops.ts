import type {
  EntityId,
  PatternPoint,
  PatternStopPlacement,
  Route,
  RoutePattern,
  RouteStop,
  RouteStopSet,
  StopLocation,
  StopTimeRoundingSeconds,
  StopTimingRule,
  TimepointLocations,
  TimepointStopCodes,
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

/**
 * Decision 0080. A pattern's timepoint stop IDs as they are stored: trimmed, blank values left out, entries whose point is not on the pattern
 * left out, in point order.
 */
export function normalizeTimepointStopCodes(pattern: RoutePattern, codes: Readonly<TimepointStopCodes> | undefined): TimepointStopCodes {
  const result: TimepointStopCodes = {};
  if (!codes) return result;
  for (const point of sortedPoints(pattern)) {
    const code = codes[point.id];
    if (typeof code === 'string' && code.trim() !== '') result[point.id] = code.trim();
  }
  return result;
}

const finiteOrUndefined = (value: number | undefined): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/**
 * Section 4.2. A location as it is stored: each field is kept only when it is a finite number, in the order latitude, longitude, speed
 * limit. Returns undefined when no field is kept (an empty location is never stored).
 */
export function normalizeStopLocation(value: StopLocation | undefined): StopLocation | undefined {
  if (!value) return undefined;
  const latitude = finiteOrUndefined(value.latitude);
  const longitude = finiteOrUndefined(value.longitude);
  const speedLimitMph = finiteOrUndefined(value.speedLimitMph);
  if (latitude === undefined && longitude === undefined && speedLimitMph === undefined) return undefined;
  return {
    ...(latitude === undefined ? {} : { latitude }),
    ...(longitude === undefined ? {} : { longitude }),
    ...(speedLimitMph === undefined ? {} : { speedLimitMph }),
  };
}

/**
 * Section 4.2 (Decision 0085). A pattern's timepoint locations as they are stored: entries whose point is not on the pattern are left out,
 * each value is normalized, and empty values are dropped. In point order.
 */
export function normalizeTimepointLocations(pattern: RoutePattern, locations: Readonly<Partial<Record<EntityId, StopLocation>>> | undefined): TimepointLocations {
  const result: TimepointLocations = {};
  if (!locations) return result;
  for (const point of sortedPoints(pattern)) {
    const location = normalizeStopLocation(locations[point.id]);
    if (location !== undefined) result[point.id] = location;
  }
  return result;
}

/** Section 4.2. True when both normalized locations are empty, or all three fields are equal (absent equals absent). */
export function sameLocation(left?: StopLocation, right?: StopLocation): boolean {
  const a = normalizeStopLocation(left);
  const b = normalizeStopLocation(right);
  if (a === undefined || b === undefined) return a === b;
  return a.latitude === b.latitude && a.longitude === b.longitude && a.speedLimitMph === b.speedLimitMph;
}

/** Section 4.2. True when latitude and longitude are both finite numbers. */
export function hasCoordinates(value?: { latitude?: number; longitude?: number }): value is { latitude: number; longitude: number } {
  return value !== undefined && finiteOrUndefined(value.latitude) !== undefined && finiteOrUndefined(value.longitude) !== undefined;
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

/**
 * Decision 0085 item 3 (section 4.3). The location rules of one stop or timepoint. `entityType` and `entityId` name the owner of the fields;
 * `parameters` are added to each finding when given.
 */
function locationFindings(location: StopLocation, entityType: string, entityId: EntityId, parameters?: Record<string, string | number>): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const { latitude, longitude, speedLimitMph } = location;
  const hasLatitude = typeof latitude === 'number';
  const hasLongitude = typeof longitude === 'number';
  if (hasLatitude !== hasLongitude) findings.push(finding('stopLocation.incomplete', 'error', entityType, entityId, 'latitude', parameters));
  if (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) findings.push(finding('stopLocation.latitudeRange', 'error', entityType, entityId, 'latitude', parameters));
  if (longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) findings.push(finding('stopLocation.longitudeRange', 'error', entityType, entityId, 'longitude', parameters));
  if (speedLimitMph !== undefined && (!Number.isFinite(speedLimitMph) || speedLimitMph <= 0 || speedLimitMph > 100)) findings.push(finding('stopLocation.speedLimitInvalid', 'error', entityType, entityId, 'speedLimitMph', parameters));
  return findings;
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
    findings.push(...locationFindings(stop, 'routeStop', stop.id));
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
    for (const [pointId, location] of Object.entries(set.timepointLocationsByPatternId?.[pattern.id] ?? {})) {
      findings.push(...locationFindings(location, 'timepointLocation', pointId, { patternId: pattern.id }));
    }
  }

  if (set.roundingSeconds !== 1 && set.roundingSeconds !== 30 && set.roundingSeconds !== 60) {
    findings.push(finding('routeStopSet.roundingInvalid', 'error', 'routeStopSet', set.id, 'roundingSeconds'));
  }
  if (set.interpolation !== undefined && set.interpolation !== 'equal' && set.interpolation !== 'distance') {
    findings.push(finding('routeStopSet.interpolationInvalid', 'error', 'routeStopSet', set.id, 'interpolation'));
  }
  return findings;
}

/**
 * Section 4.5. Returns the input array itself when nothing changed. A set left with no stops and no timepoint stop IDs is dropped, and so is
 * a set whose Route is missing. Timepoint stop IDs of a missing pattern or point are dropped (Decision 0080).
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
    let codesChanged = false;
    const timepointStopCodesByPatternId: Record<EntityId, TimepointStopCodes> = {};
    for (const [patternId, codes] of Object.entries(set.timepointStopCodesByPatternId ?? {})) {
      const pattern = patternById.get(patternId);
      const normalized = pattern && pattern.routeId === set.routeId ? normalizeTimepointStopCodes(pattern, codes) : {};
      if (Object.keys(normalized).length === 0) { codesChanged = true; continue; }
      if (JSON.stringify(normalized) !== JSON.stringify(codes)) codesChanged = true;
      timepointStopCodesByPatternId[patternId] = normalized;
    }
    const hasCodes = Object.keys(timepointStopCodesByPatternId).length > 0;
    let locationsChanged = false;
    const timepointLocationsByPatternId: Record<EntityId, TimepointLocations> = {};
    for (const [patternId, locations] of Object.entries(set.timepointLocationsByPatternId ?? {})) {
      const pattern = patternById.get(patternId);
      const normalized = pattern && pattern.routeId === set.routeId ? normalizeTimepointLocations(pattern, locations) : {};
      if (Object.keys(normalized).length === 0) { locationsChanged = true; continue; }
      if (JSON.stringify(normalized) !== JSON.stringify(locations)) locationsChanged = true;
      timepointLocationsByPatternId[patternId] = normalized;
    }
    const hasLocations = Object.keys(timepointLocationsByPatternId).length > 0;
    if (stops.length === 0 && !hasCodes && !hasLocations) { changed = true; continue; }
    if (!placementsChanged && !codesChanged && !locationsChanged && stops.length === set.stops.length) { next.push(set); continue; }
    changed = true;
    const { timepointStopCodesByPatternId: _previousCodes, timepointLocationsByPatternId: _previousLocations, ...rest } = set;
    next.push({
      ...rest,
      stops,
      placementsByPatternId,
      ...(hasCodes ? { timepointStopCodesByPatternId } : {}),
      ...(hasLocations ? { timepointLocationsByPatternId } : {}),
    });
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
 * Decision 0080. Reconciles a pattern's timepoint stop IDs with the pattern after an edit: a stop ID stays only while its point remains and
 * still stands on the same Node.
 */
export function reconcileTimepointStopCodes(saved: RoutePattern, next: RoutePattern, codes: Readonly<TimepointStopCodes>): { codes: TimepointStopCodes; removedCount: number } {
  const savedNodeByPoint = new Map(saved.points.map((point) => [point.id, point.nodeId] as const));
  const kept: TimepointStopCodes = {};
  for (const point of next.points) {
    if (codes[point.id] !== undefined && savedNodeByPoint.get(point.id) === point.nodeId) kept[point.id] = codes[point.id];
  }
  const result = normalizeTimepointStopCodes(next, kept);
  return { codes: result, removedCount: Object.keys(normalizeTimepointStopCodes(saved, codes)).length - Object.keys(result).length };
}

/**
 * Decision 0085. Reconciles a pattern's timepoint locations with the pattern after an edit, by the same rule as Decision 0080: a location
 * stays only while its point remains and still stands on the same Node.
 */
export function reconcileTimepointLocations(saved: RoutePattern, next: RoutePattern, locations: Readonly<Partial<TimepointLocations>>): { locations: TimepointLocations; removedCount: number } {
  const savedNodeByPoint = new Map(saved.points.map((point) => [point.id, point.nodeId] as const));
  const kept: Partial<TimepointLocations> = {};
  for (const point of next.points) {
    if (locations[point.id] !== undefined && savedNodeByPoint.get(point.id) === point.nodeId) kept[point.id] = locations[point.id];
  }
  const result = normalizeTimepointLocations(next, kept);
  return { locations: result, removedCount: Object.keys(normalizeTimepointLocations(saved, locations)).length - Object.keys(result).length };
}

/**
 * Decision 0080. Moves the stop IDs that Nodes carried before Decision 0080 onto every point of the Route's patterns that stands on that
 * Node, unless the point already has a stop ID. A Route without a stop set gets one. Every returned Node is without `stopCode`.
 * `changedSetIds` lists the sets that were created or changed.
 */
export function moveNodeStopCodesToPatterns<TNode extends { id: EntityId; scenarioId: EntityId; routeId: EntityId }>(input: {
  nodes: readonly TNode[];
  patterns: readonly RoutePattern[];
  routeStopSets: readonly RouteStopSet[];
  now: string;
  makeId: () => EntityId;
}): { nodes: Array<Omit<TNode, 'stopCode'>>; routeStopSets: RouteStopSet[]; changedNodeIds: EntityId[]; changedSetIds: EntityId[] } {
  const sets = new Map(input.routeStopSets.map((set) => [set.routeId, set] as const));
  const changedSetIds = new Set<EntityId>();
  const changedNodeIds: EntityId[] = [];
  const nodes = input.nodes.map((node) => {
    if (!('stopCode' in node)) return node;
    changedNodeIds.push(node.id);
    const { stopCode, ...rest } = node as TNode & { stopCode?: unknown };
    const code = typeof stopCode === 'string' ? stopCode.trim() : '';
    if (!code) return rest;
    for (const pattern of input.patterns) {
      if (pattern.routeId !== node.routeId) continue;
      const pointIds = pattern.points.filter((point) => point.nodeId === node.id).map((point) => point.id);
      if (!pointIds.length) continue;
      const current = sets.get(node.routeId) ?? { id: input.makeId(), scenarioId: node.scenarioId, routeId: node.routeId, roundingSeconds: DEFAULT_STOP_ROUNDING_SECONDS, stops: [], placementsByPatternId: {}, createdAt: input.now, updatedAt: input.now };
      const codes = { ...current.timepointStopCodesByPatternId?.[pattern.id] };
      let added = false;
      for (const pointId of pointIds) if (codes[pointId] === undefined) { codes[pointId] = code; added = true; }
      if (!added) continue;
      sets.set(node.routeId, { ...current, timepointStopCodesByPatternId: { ...current.timepointStopCodesByPatternId, [pattern.id]: normalizeTimepointStopCodes(pattern, codes) }, updatedAt: input.now });
      changedSetIds.add(current.id);
    }
    return rest;
  });
  return { nodes, routeStopSets: [...sets.values()], changedNodeIds, changedSetIds: [...changedSetIds] };
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
  // Decision 0080: timepoint stop IDs follow their pattern and point.
  const timepointStopCodesByPatternId: Record<EntityId, TimepointStopCodes> = {};
  for (const [patternId, codes] of Object.entries(set.timepointStopCodesByPatternId ?? {})) {
    const targetPatternId = target.patternIds.get(patternId);
    if (targetPatternId === undefined) continue;
    const mapped: TimepointStopCodes = {};
    for (const [pointId, code] of Object.entries(codes)) {
      const targetPointId = target.pointIds.get(pointId);
      if (targetPointId !== undefined) mapped[targetPointId] = code;
    }
    if (Object.keys(mapped).length > 0) timepointStopCodesByPatternId[targetPatternId] = mapped;
  }
  // Decision 0085: timepoint locations follow their pattern and point, as the stop IDs do.
  const timepointLocationsByPatternId: Record<EntityId, TimepointLocations> = {};
  for (const [patternId, locations] of Object.entries(set.timepointLocationsByPatternId ?? {})) {
    const targetPatternId = target.patternIds.get(patternId);
    if (targetPatternId === undefined) continue;
    const mapped: TimepointLocations = {};
    for (const [pointId, location] of Object.entries(locations)) {
      const targetPointId = target.pointIds.get(pointId);
      if (targetPointId !== undefined) mapped[targetPointId] = { ...location };
    }
    if (Object.keys(mapped).length > 0) timepointLocationsByPatternId[targetPatternId] = mapped;
  }
  const { timepointStopCodesByPatternId: _sourceCodes, timepointLocationsByPatternId: _sourceLocations, ...rest } = set;
  return {
    ...rest,
    id: target.id,
    scenarioId: target.scenarioId,
    routeId: target.routeId,
    placementsByPatternId,
    ...(Object.keys(timepointStopCodesByPatternId).length ? { timepointStopCodesByPatternId } : {}),
    ...(Object.keys(timepointLocationsByPatternId).length ? { timepointLocationsByPatternId } : {}),
    stops: set.stops.map((stop): RouteStop => ({ ...stop })),
    createdAt: now,
    updatedAt: now,
  };
}
