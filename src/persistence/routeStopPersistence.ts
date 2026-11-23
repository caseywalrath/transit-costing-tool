import type { RoutePattern, RouteStopSet } from '../domain/types';
import { validateRouteStopSet } from '../domain/stops';

const LOCATION_FIELDS = ['latitude', 'longitude', 'speedLimitMph'] as const;

export interface RouteStopOwners {
  scenarioIds: ReadonlySet<string>;
  routes: Array<{ id: string; scenarioId: string }>;
  patterns: RoutePattern[];
}

/**
 * Refuse a write that would store an invalid stop set (Decision 0079): a duplicate ID, a missing or foreign owner, a second
 * set for one Route, no stops, no timepoint stop IDs, no timepoint locations and no timepoint stop names, a timepoint stop ID of a missing pattern or point or a blank one
 * (Decision 0080), a timepoint location of a missing pattern or point, an empty one, or one with a non-numeric field (Decision 0085),
 * a timepoint stop name of a missing pattern or point or a blank or untrimmed one (Decision 0092),
 * or any error finding of `validateRouteStopSet`. Warnings do not refuse.
 */
export function assertRouteStopSets(sets: RouteStopSet[], owners: RouteStopOwners): void {
  const routeById = new Map(owners.routes.map((route) => [route.id, route]));
  const ids = new Set<string>();
  const routeIds = new Set<string>();
  for (const set of sets) {
    if (ids.has(set.id)) throw new Error(`Duplicate route stop set id ${set.id}.`);
    ids.add(set.id);
    if (!owners.scenarioIds.has(set.scenarioId)) throw new Error(`Route stop set ${set.id} references a missing Scenario.`);
    const route = routeById.get(set.routeId);
    if (!route || route.scenarioId !== set.scenarioId) throw new Error(`Route stop set ${set.id} references a missing Route.`);
    if (routeIds.has(set.routeId)) throw new Error(`Route ${set.routeId} has more than one stop set.`);
    routeIds.add(set.routeId);
    const codeEntries = Object.entries(set.timepointStopCodesByPatternId ?? {});
    const locationEntries = Object.entries(set.timepointLocationsByPatternId ?? {});
    const nameEntries = Object.entries(set.timepointStopNamesByPatternId ?? {});
    if (set.stops.length === 0 && codeEntries.length === 0 && locationEntries.length === 0 && nameEntries.length === 0) throw new Error(`Route stop set ${set.id} has no stops.`);
    // Decision 0080: each pattern entry holds stop IDs of that pattern's own points, as trimmed, non-blank strings.
    for (const [patternId, codes] of codeEntries) {
      const pattern = owners.patterns.find((candidate) => candidate.id === patternId);
      if (!pattern || pattern.routeId !== set.routeId) throw new Error(`Route stop set ${set.id} has stop IDs for a missing pattern.`);
      const pointIds = new Set(pattern.points.map((point) => point.id));
      for (const [pointId, code] of Object.entries(codes)) {
        if (!pointIds.has(pointId)) throw new Error(`Route stop set ${set.id} has a stop ID for a missing timepoint.`);
        if (typeof code !== 'string' || code.trim() === '' || code !== code.trim()) throw new Error(`Route stop set ${set.id} has an invalid timepoint stop ID.`);
      }
    }
    // Decision 0085: each pattern entry holds locations of that pattern's own points. An entry is never empty, and each present field is a number.
    for (const [patternId, locations] of locationEntries) {
      const pattern = owners.patterns.find((candidate) => candidate.id === patternId);
      if (!pattern || pattern.routeId !== set.routeId) throw new Error(`Route stop set ${set.id} has locations for a missing pattern.`);
      const pointIds = new Set(pattern.points.map((point) => point.id));
      for (const [pointId, location] of Object.entries(locations)) {
        if (!pointIds.has(pointId)) throw new Error(`Route stop set ${set.id} has a location for a missing timepoint.`);
        const fields = LOCATION_FIELDS.filter((field) => location[field] !== undefined);
        if (fields.length === 0 || fields.some((field) => typeof location[field] !== 'number')) throw new Error(`Route stop set ${set.id} has an invalid timepoint location.`);
      }
    }
    // Decision 0092 item 2: each pattern entry holds stop names of that pattern's own points, as trimmed, non-blank strings.
    for (const [patternId, names] of nameEntries) {
      const pattern = owners.patterns.find((candidate) => candidate.id === patternId);
      if (!pattern || pattern.routeId !== set.routeId) throw new Error(`Route stop set ${set.id} has stop names for a missing pattern.`);
      const pointIds = new Set(pattern.points.map((point) => point.id));
      for (const [pointId, name] of Object.entries(names)) {
        if (!pointIds.has(pointId)) throw new Error(`Route stop set ${set.id} has a stop name for a missing timepoint.`);
        if (typeof name !== 'string' || name.trim() === '' || name !== name.trim()) throw new Error(`Route stop set ${set.id} has an invalid timepoint stop name.`);
      }
    }
    const errors = validateRouteStopSet(set, owners.patterns).filter((finding) => finding.severity === 'error');
    if (errors.length) throw new Error(`Route stop set ${set.id} is invalid: ${[...new Set(errors.map((finding) => finding.ruleId))].join(', ')}`);
  }
}
