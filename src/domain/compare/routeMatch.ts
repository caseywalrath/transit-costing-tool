import type { Route } from '../types';
import type { AmbiguousRouteKey, RouteMatch, RoutePair } from './types';

/**
 * Decision 0091 item 4. The keys in the order they are tried. Each key is tried only on the Routes that no earlier key has matched, so a
 * Route matched by its GTFS route ID is never compared again by its short name.
 */
const MATCH_KEYS: ReadonlyArray<(route: Route) => string | undefined> = [
  (route) => route.gtfsRouteId,
  (route) => route.shortName,
  (route) => route.name,
];

/** Item 4: compared after trimming, ignoring case. A blank value holds no key. */
function keyOf(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

interface Holders { text: string; routes: Route[] }

/** The Routes of one side that hold each key, keyed by the normalized key; `text` keeps the first holder's spelling for a warning. */
function holdersByKey(routes: Route[], keyFor: (route: Route) => string | undefined): Map<string, Holders> {
  const holders = new Map<string, Holders>();
  for (const route of routes) {
    const raw = keyFor(route);
    const key = keyOf(raw);
    if (key === undefined || raw === undefined) continue;
    const entry = holders.get(key);
    if (entry) entry.routes.push(route);
    else holders.set(key, { text: raw.trim(), routes: [route] });
  }
  return holders;
}

/**
 * Pairs the Routes of the Baseline with those of the Proposed (Decision 0091 item 4). A key held by more than one Route on either side
 * matches none of them at that step, and each such key is reported in `ambiguous` (the `compare.ambiguousRoute` warning). Routes that
 * are left over are unmatched: Discontinued when on the Baseline only, New when on the Proposed only. Pairs follow the Baseline's order,
 * then the Proposed-only Routes in their order.
 */
export function matchRoutes(baseline: Route[], proposed: Route[]): RouteMatch {
  const partnerOfBaseline = new Map<Route, Route>();
  const matchedProposed = new Set<Route>();
  const ambiguous: AmbiguousRouteKey[] = [];

  for (const keyFor of MATCH_KEYS) {
    const unmatchedBaseline = baseline.filter((route) => !partnerOfBaseline.has(route));
    const unmatchedProposed = proposed.filter((route) => !matchedProposed.has(route));
    const holdersBaseline = holdersByKey(unmatchedBaseline, keyFor);
    const holdersProposed = holdersByKey(unmatchedProposed, keyFor);

    for (const [, entry] of holdersBaseline) {
      if (entry.routes.length > 1) ambiguous.push({ side: 'baseline', key: entry.text, routeIds: entry.routes.map((route) => route.id) });
    }
    for (const [, entry] of holdersProposed) {
      if (entry.routes.length > 1) ambiguous.push({ side: 'proposed', key: entry.text, routeIds: entry.routes.map((route) => route.id) });
    }

    for (const [key, entry] of holdersBaseline) {
      const counterpart = holdersProposed.get(key);
      if (!counterpart || entry.routes.length !== 1 || counterpart.routes.length !== 1) continue;
      partnerOfBaseline.set(entry.routes[0], counterpart.routes[0]);
      matchedProposed.add(counterpart.routes[0]);
    }
  }

  const pairs: RoutePair[] = baseline.map((route) => {
    const partner = partnerOfBaseline.get(route);
    return partner ? { baseline: route, proposed: partner } : { baseline: route };
  });
  for (const route of proposed) {
    if (!matchedProposed.has(route)) pairs.push({ proposed: route });
  }
  return { pairs, ambiguous };
}
