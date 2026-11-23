import type { Route } from '../types';
import type { AmbiguousRouteKey, CompareSide, RouteMatch, RoutePair } from './types';

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
 * matches none of them at that step. Such a key is reported once in `ambiguous` (the `compare.ambiguousRoute` warning), and only if any
 * of its Routes is still unmatched after every step (naming those Routes), so a repeated short name that the name step then resolves gives no warning. Routes that
 * are left over are unmatched: Discontinued when on the Baseline only, New when on the Proposed only. Pairs follow the Baseline's order,
 * then the Proposed-only Routes in their order.
 */
export function matchRoutes(baseline: Route[], proposed: Route[]): RouteMatch {
  const partnerOfBaseline = new Map<Route, Route>();
  const matchedProposed = new Set<Route>();
  // Repeated keys seen at any step, by side and normalized key (so a key repeated at two steps is one entry). Whether to report one is
  // decided after the last step: a later key can still match its Routes.
  const repeated = new Map<string, { side: CompareSide; holders: Holders }>();
  const noteRepeated = (side: CompareSide, key: string, holders: Holders) => {
    if (holders.routes.length > 1 && !repeated.has(`${side}\u0000${key}`)) repeated.set(`${side}\u0000${key}`, { side, holders });
  };

  for (const keyFor of MATCH_KEYS) {
    const unmatchedBaseline = baseline.filter((route) => !partnerOfBaseline.has(route));
    const unmatchedProposed = proposed.filter((route) => !matchedProposed.has(route));
    const holdersBaseline = holdersByKey(unmatchedBaseline, keyFor);
    const holdersProposed = holdersByKey(unmatchedProposed, keyFor);

    for (const [key, entry] of holdersBaseline) noteRepeated('baseline', key, entry);
    for (const [key, entry] of holdersProposed) noteRepeated('proposed', key, entry);

    for (const [key, entry] of holdersBaseline) {
      const counterpart = holdersProposed.get(key);
      if (!counterpart || entry.routes.length !== 1 || counterpart.routes.length !== 1) continue;
      partnerOfBaseline.set(entry.routes[0], counterpart.routes[0]);
      matchedProposed.add(counterpart.routes[0]);
    }
  }

  // Report a repeated key only when none of its Routes ended up matched by any step.
  const ambiguous: AmbiguousRouteKey[] = [];
  for (const { side, holders } of repeated.values()) {
    const leftOver = holders.routes.filter((route) => (side === 'baseline' ? !partnerOfBaseline.has(route) : !matchedProposed.has(route)));
    if (leftOver.length) ambiguous.push({ side, key: holders.text, routeIds: leftOver.map((route) => route.id) });
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
