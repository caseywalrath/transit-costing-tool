import { peakVehicles } from '../autoBlocking';
import type { BlockSummary } from '../blocking';
import type { BlockingBlock, EntityId, ServiceSeconds, Trip } from '../types';
import type { PeakResult } from './types';

/** One Block of the day with its summary (`summarizeBlock`). The caller passes only the Blocks it means to count. */
export interface PeakBlock { block: BlockingBlock; summary: BlockSummary; }

interface Interval { start: ServiceSeconds; end: ServiceSeconds; }

/** The first and last stop time of a Trip, in stop sequence. */
function tripEnds(trip: Trip): { first?: ServiceSeconds; last?: ServiceSeconds } {
  const stops = [...trip.stopTimes].sort((left, right) => left.sequence - right.sequence);
  return { first: stops[0]?.time, last: stops[stops.length - 1]?.time };
}

/**
 * Decision 0091 item 12. A Block's interval: the pull-out start to the pull-in end when the summary has them (as Blocking's peak does);
 * otherwise the first revenue Trip's departure to the last revenue Trip's arrival. Undefined when neither is known.
 */
function intervalOf(summary: BlockSummary, revenue: Trip[]): Interval | undefined {
  if (summary.platformStartSeconds !== undefined && summary.platformEndSeconds !== undefined) {
    return { start: summary.platformStartSeconds, end: summary.platformEndSeconds };
  }
  const start = revenue[0] ? tripEnds(revenue[0]).first : undefined;
  const end = revenue.length > 0 ? tripEnds(revenue[revenue.length - 1]).last : undefined;
  return start === undefined || end === undefined ? undefined : { start, end };
}

/**
 * Decision 0091 item 12. The peak number of vehicles for the system and for each Route, with the Unattributed count (`null`). A Block is
 * attributed to a Route when all its revenue Trips are on that Route (Decision 0077, as Costing does); otherwise it is Unattributed. The
 * peak of each count is `peakVehicles`, so an interval that ends as another starts does not overlap it. The Route entries exist only for
 * Routes that have a Block; a Route missing from the result has no vehicles. The Unattributed entry is always present.
 */
export function peakByRoute(blocks: PeakBlock[], trips: Trip[]): PeakResult {
  const tripById = new Map(trips.map((trip) => [trip.id, trip] as const));
  const allIntervals: Interval[] = [];
  const intervalsByOwner = new Map<EntityId | null, Interval[]>([[null, []]]);

  for (const { block, summary } of blocks) {
    const activities = [...block.activities].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
    const revenue: Trip[] = [];
    for (const activity of activities) {
      if (activity.type !== 'revenueTrip') continue;
      const trip = tripById.get(activity.tripId);
      if (trip) revenue.push(trip);
    }
    const interval = intervalOf(summary, revenue);
    if (!interval) continue;

    const routeIds = new Set(revenue.map((trip) => trip.routeId));
    const owner: EntityId | null = routeIds.size === 1 ? [...routeIds][0] : null;
    allIntervals.push(interval);
    intervalsByOwner.set(owner, [...(intervalsByOwner.get(owner) ?? []), interval]);
  }

  const byRoute = new Map<EntityId | null, number>();
  for (const [owner, intervals] of intervalsByOwner) byRoute.set(owner, peakVehicles(intervals));
  return { system: peakVehicles(allIntervals), byRoute };
}
