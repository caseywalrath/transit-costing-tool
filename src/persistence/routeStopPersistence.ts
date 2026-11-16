import type { RoutePattern, RouteStopSet } from '../domain/types';
import { validateRouteStopSet } from '../domain/stops';

export interface RouteStopOwners {
  scenarioIds: ReadonlySet<string>;
  routes: Array<{ id: string; scenarioId: string }>;
  patterns: RoutePattern[];
}

/**
 * Refuse a write that would store an invalid stop set (Decision 0079): a duplicate ID, a missing or foreign owner, a second
 * set for one Route, no stops and no timepoint stop IDs, a timepoint stop ID of a missing pattern or point or a blank one (Decision 0080),
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
    if (set.stops.length === 0 && codeEntries.length === 0) throw new Error(`Route stop set ${set.id} has no stops.`);
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
    const errors = validateRouteStopSet(set, owners.patterns).filter((finding) => finding.severity === 'error');
    if (errors.length) throw new Error(`Route stop set ${set.id} is invalid: ${[...new Set(errors.map((finding) => finding.ruleId))].join(', ')}`);
  }
}
