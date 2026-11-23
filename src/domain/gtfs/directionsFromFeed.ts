// Which direction each feed trip belongs to, and the names the two directions are proposed with.
// Feed trips are grouped only by what the feed says or, when it says nothing, by their terminal stops.

import { type DirectionGroup, directionGroupName, MAX_DIRECTION_NAME_LENGTH } from '../directions';
import { GtfsFeedError } from './feedTables';
import type { FeedTrip } from './tripsOnDate';

/** The time a trip starts: its first departure, or its first arrival where the departure is blank. */
export function tripOrigin(trip: FeedTrip): number {
  const first = trip.stopTimes[0];
  const origin = first?.departure ?? first?.arrival;
  if (origin === undefined) throw new GtfsFeedError(`Trip "${trip.tripId}" has no time at its first stop`);
  return origin;
}

/** Earliest trip first; a tie in time goes to the trip ID so the order never depends on the feed's row order. */
export function compareTripsByOrigin(a: FeedTrip, b: FeedTrip): number {
  const difference = tripOrigin(a) - tripOrigin(b);
  if (difference !== 0) return difference;
  return a.tripId < b.tripId ? -1 : a.tripId > b.tripId ? 1 : 0;
}

/** A headsign as it is stored: trimmed, cut to the direction-name length, and undefined when nothing is left. */
export function normalizeHeadsign(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return undefined;
  return trimmed.slice(0, MAX_DIRECTION_NAME_LENGTH).trim() || undefined;
}

/**
 * The most common headsign of the trips. A tie goes to the headsign of the earliest trip, so the result
 * does not depend on the order the feed lists its rows.
 */
export function commonHeadsign(trips: readonly FeedTrip[]): string | undefined {
  const tally = new Map<string, number>();
  for (const trip of [...trips].sort(compareTripsByOrigin)) {
    const name = normalizeHeadsign(trip.headsign);
    if (name === undefined) continue;
    tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  // Map keeps insertion order, and the trips were sorted earliest first, so a strictly larger count is the only way to replace.
  let best: { name: string; count: number } | undefined;
  for (const [name, count] of tally) {
    if (best === undefined || count > best.count) best = { name, count };
  }
  return best?.name;
}

/** Result of splitting a route's trips into its two directions. */
export interface DirectionSplit {
  /** The direction of each trip, in the order the trips were given. */
  groupOf: DirectionGroup[];
  /** True when no trip of the route carries a direction_id, so every trip was grouped by its terminal stops. */
  noDirectionColumn: boolean;
  /** Trips whose direction_id is blank while other trips of the route have one. */
  guessedTripIds: string[];
}

interface TerminalGroup {
  key: string;
  first: string;
  last: string;
  trips: FeedTrip[];
  earliest: number;
}

/**
 * Decision 0089 item 24. Trips with a direction_id keep it (0 is Outbound, 1 is Inbound). Trips with a blank direction_id join the
 * direction whose valued trips most often share their first stop, otherwise Outbound. When no trip has a direction_id, the trips
 * are grouped by their pair of terminal stops.
 */
export function splitDirections(trips: readonly FeedTrip[]): DirectionSplit {
  if (!trips.some((trip) => trip.directionId !== undefined)) {
    return { groupOf: terminalGroupsOf(trips), noDirectionColumn: true, guessedTripIds: [] };
  }
  const valued = trips.filter((trip) => trip.directionId !== undefined);
  const guessedTripIds: string[] = [];
  const groupOf = trips.map((trip): DirectionGroup => {
    if (trip.directionId !== undefined) return trip.directionId === 0 ? 'outbound' : 'inbound';
    guessedTripIds.push(trip.tripId);
    return guessByFirstStop(trip, valued);
  });
  return { groupOf, noDirectionColumn: false, guessedTripIds };
}

function guessByFirstStop(trip: FeedTrip, valued: readonly FeedTrip[]): DirectionGroup {
  const firstStop = trip.stopTimes[0]?.stopId;
  let outbound = 0;
  let inbound = 0;
  for (const other of valued) {
    if (other.stopTimes[0]?.stopId !== firstStop) continue;
    if (other.directionId === 0) outbound += 1;
    else inbound += 1;
  }
  // A tie, including no shared first stop at all, goes to Outbound.
  return inbound > outbound ? 'inbound' : 'outbound';
}

function terminalGroupsOf(trips: readonly FeedTrip[]): DirectionGroup[] {
  const groups = new Map<string, TerminalGroup>();
  for (const trip of trips) {
    const first = trip.stopTimes[0].stopId;
    const last = trip.stopTimes[trip.stopTimes.length - 1].stopId;
    const key = JSON.stringify([first, last]);
    const group = groups.get(key) ?? { key, first, last, trips: [], earliest: Number.POSITIVE_INFINITY };
    group.trips.push(trip);
    group.earliest = Math.min(group.earliest, tripOrigin(trip));
    groups.set(key, group);
  }

  // Most trips first; a tie goes to the earliest first departure, then to the pair's key so the choice is stable.
  const ordered = [...groups.values()].sort(
    (a, b) => b.trips.length - a.trips.length || a.earliest - b.earliest || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const outbound = ordered[0];
  const reverse = ordered.find((group) => group.key !== outbound.key && group.first === outbound.last && group.last === outbound.first);
  const inboundFirst = reverse?.first;

  // Every other pair goes to Inbound when it starts where the Inbound pair starts, and to Outbound otherwise.
  const directionOfGroup = new Map<string, DirectionGroup>();
  for (const group of ordered) {
    const isInbound = group === reverse || (inboundFirst !== undefined && group.first === inboundFirst);
    directionOfGroup.set(group.key, isInbound ? 'inbound' : 'outbound');
  }

  const groupKeyOf = new Map<FeedTrip, string>();
  for (const group of ordered) for (const trip of group.trips) groupKeyOf.set(trip, group.key);
  return trips.map((trip) => directionOfGroup.get(groupKeyOf.get(trip) ?? '') ?? 'outbound');
}

/**
 * The proposed name of each direction: the most common headsign of its trips, or its group word when it has none.
 * When the two names are the same (ignoring case), both keep their group words.
 */
export function directionNames(trips: readonly FeedTrip[], groupOf: readonly DirectionGroup[]): Record<DirectionGroup, string> {
  const outbound = commonHeadsign(trips.filter((_, index) => groupOf[index] === 'outbound'));
  const inbound = commonHeadsign(trips.filter((_, index) => groupOf[index] === 'inbound'));
  if (outbound !== undefined && inbound !== undefined && outbound.toLowerCase() === inbound.toLowerCase()) {
    return { outbound: directionGroupName('outbound'), inbound: directionGroupName('inbound') };
  }
  return {
    outbound: outbound ?? directionGroupName('outbound'),
    inbound: inbound ?? directionGroupName('inbound'),
  };
}
