import type { EntityId, Route, RouteOwnAnnualServiceDays, ServiceDayDefinition } from '../types';
import type { RoutePair, ServiceDayPair, SideChoice } from './types';

/** The part of one side that the counts touch: its service days (annual counts) and its Routes (own counts). */
export interface CountSide { serviceDays: ServiceDayDefinition[]; routes: Route[]; }

function copyOwn(own: RouteOwnAnnualServiceDays | undefined): RouteOwnAnnualServiceDays | undefined {
  return own ? { enabled: own.enabled, countsByServiceDayId: { ...own.countsByServiceDayId } } : undefined;
}

function withOwn(route: Route, own: RouteOwnAnnualServiceDays | undefined): Route {
  const next: Route = { ...route };
  if (own) next.ownAnnualServiceDays = own;
  else delete next.ownAnnualServiceDays;
  return next;
}

function copySide(side: CountSide): CountSide {
  return {
    serviceDays: side.serviceDays.map((day) => ({ ...day })),
    routes: side.routes.map((route) => withOwn(route, copyOwn(route.ownAnnualServiceDays))),
  };
}

/**
 * The own counts of a source Route, moved to the target side: the switch (on or off) and every count of a matched day, under the target
 * day's ID. A matched day the source has no count for stays without one, so the target Route uses its Scenario count there, which
 * the day replacement has already set to the source's.
 */
function remapOwn(own: RouteOwnAnnualServiceDays | undefined, sourceToTarget: Map<EntityId, EntityId>): RouteOwnAnnualServiceDays | undefined {
  if (!own) return undefined;
  const countsByServiceDayId: Record<EntityId, number> = {};
  for (const [sourceDayId, targetDayId] of sourceToTarget) {
    if (Object.prototype.hasOwnProperty.call(own.countsByServiceDayId, sourceDayId)) countsByServiceDayId[targetDayId] = own.countsByServiceDayId[sourceDayId];
  }
  return { enabled: own.enabled, countsByServiceDayId };
}

/**
 * Decision 0091 item 7 (and item 6's rule for the Costing inputs). Returns copies of each side's service days and Routes in which the
 * counts are replaced by the chosen side's:
 * - `baseline` / `proposed`: the other side takes the chosen side's annual count for each matched service day, and for each matched Route
 *   the chosen side's own counts (switch and numbers). Unmatched days and Routes keep their own counts.
 * - `own`: nothing changes.
 * The inputs are never changed, so a caller can keep both the original and the copies.
 */
export function applyCountChoice(
  choice: SideChoice,
  baselineSide: CountSide,
  proposedSide: CountSide,
  routePairs: RoutePair[],
  dayPairs: ServiceDayPair[],
): { baseline: CountSide; proposed: CountSide } {
  const baselineCopy = copySide(baselineSide);
  const proposedCopy = copySide(proposedSide);
  if (choice === 'own') return { baseline: baselineCopy, proposed: proposedCopy };

  const source = choice === 'baseline' ? 'baseline' : 'proposed';
  const target = source === 'baseline' ? 'proposed' : 'baseline';

  // Matched days only: source day ID to target day ID, and the count each target day takes.
  const sourceToTargetDay = new Map<EntityId, EntityId>();
  const countForTargetDay = new Map<EntityId, number>();
  for (const pair of dayPairs) {
    const sourceDay = pair[source];
    const targetDay = pair[target];
    if (!sourceDay || !targetDay) continue;
    sourceToTargetDay.set(sourceDay.id, targetDay.id);
    countForTargetDay.set(targetDay.id, sourceDay.annualServiceDays);
  }

  const targetCopy = target === 'baseline' ? baselineCopy : proposedCopy;
  const targetDays = targetCopy.serviceDays.map((day) => {
    const count = countForTargetDay.get(day.id);
    return count === undefined ? day : { ...day, annualServiceDays: count };
  });

  const sourceRouteForTarget = new Map<EntityId, Route>();
  for (const pair of routePairs) {
    const sourceRoute = pair[source];
    const targetRoute = pair[target];
    if (sourceRoute && targetRoute) sourceRouteForTarget.set(targetRoute.id, sourceRoute);
  }
  const targetRoutes = targetCopy.routes.map((route) => {
    const sourceRoute = sourceRouteForTarget.get(route.id);
    return sourceRoute ? withOwn(route, remapOwn(sourceRoute.ownAnnualServiceDays, sourceToTargetDay)) : route;
  });

  const replaced: CountSide = { serviceDays: targetDays, routes: targetRoutes };
  return target === 'baseline' ? { baseline: replaced, proposed: proposedCopy } : { baseline: baselineCopy, proposed: replaced };
}
