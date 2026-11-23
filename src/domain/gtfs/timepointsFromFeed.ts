// Timepoints of a direction: the stops a planner times, chosen per direction, thinned to at most 30 and then given
// to every trip that serves them. Also the times of those timepoints, where a blank time is filled.

import { greatCircleMiles } from '../geo';
import { tripOrigin } from './directionsFromFeed';
import { GtfsFeedError } from './feedTables';
import { commonVariant, type VariantGroup } from './patternsFromFeed';
import type { Coordinates } from './distancesFromFeed';
import { runningSeconds, type FeedStopTime, type FeedTrip } from './tripsOnDate';

/** Decision 0089 item 26. A pattern has at most this many points, terminals included. */
export const MAX_TIMEPOINTS = 30;

/** True when any stop of the trips is flagged as a timepoint (timepoint = 1). */
export function hasTimepointFlags(trips: readonly FeedTrip[]): boolean {
  return trips.some((trip) => trip.stopTimes.some((stop) => stop.timepoint === 1));
}

/** Every stop flagged as a timepoint on any of the trips. */
export function flaggedStops(trips: readonly FeedTrip[]): Set<string> {
  const stops = new Set<string>();
  for (const trip of trips) {
    for (const stop of trip.stopTimes) if (stop.timepoint === 1) stops.add(stop.stopId);
  }
  return stops;
}

/**
 * Decision 0089 item 26, suggested rule: used when no stop of the route is flagged. From the most common stop sequence of the direction,
 * N = round(median running minutes / 10) + 1 stops, at least 2 and at most 30: the two terminals, plus the stops whose times are
 * closest to even shares of the running time.
 */
export function suggestedStops(trips: readonly FeedTrip[]): Set<string> {
  const variant = commonVariant(trips);
  if (!variant) return new Set();
  const timing = variantTiming(variant);
  const count = clamp(Math.round(timing.runningSeconds / 60 / 10) + 1, 2, MAX_TIMEPOINTS);
  const terminals = terminalIds(timing.stopIds);
  const candidates = interiorCandidates(timing, new Set(terminals), () => true);
  const chosen = chooseEvenShares(candidates, timing.runningSeconds, count - terminals.length);
  return new Set([...terminals, ...chosen]);
}

/** A thinned set of timepoints, and the stops that were dropped from the set (in no particular order). */
export interface ThinResult {
  stops: Set<string>;
  dropped: string[];
}

/**
 * Decision 0089 item 26, "At most 30 per pattern", applied to the whole direction's set so that every pattern of the direction stays
 * within the limit. Above the limit, the set keeps its terminals (the first and last stop of the direction's most common variant)
 * plus the interior stops closest to even shares of the median running time. The shares are measured on the most common variant.
 */
export function thinStops(stops: ReadonlySet<string>, trips: readonly FeedTrip[], limit = MAX_TIMEPOINTS): ThinResult {
  if (stops.size <= limit) return { stops: new Set(stops), dropped: [] };
  const variant = commonVariant(trips);
  if (!variant) return { stops: new Set(stops), dropped: [] };
  const timing = variantTiming(variant);
  const terminals = terminalIds(timing.stopIds);
  const candidates = interiorCandidates(timing, new Set(terminals), (stopId) => stops.has(stopId));
  const chosen = chooseEvenShares(candidates, timing.runningSeconds, limit - terminals.length);
  const kept = new Set([...terminals, ...chosen]);
  return { stops: kept, dropped: [...stops].filter((stopId) => !kept.has(stopId)) };
}

/**
 * The positions in a trip's stop list that are timepoints under a set: the stops the set holds, plus the trip's own first and last
 * stop, which are always timepoints.
 */
export function tripTimepointIndexes(trip: FeedTrip, stops: ReadonlySet<string>): number[] {
  const last = trip.stopTimes.length - 1;
  return trip.stopTimes.flatMap((stop, index) => (index === 0 || index === last || stops.has(stop.stopId) ? [index] : []));
}

/** The stop IDs at the given positions of a trip, in order. */
export function timepointIdsOf(trip: FeedTrip, indexes: readonly number[]): string[] {
  return indexes.map((index) => trip.stopTimes[index].stopId);
}

/** A timepoint's time on one trip. `filled` is set when the feed left the time blank and it was filled in. */
export interface ResolvedTime {
  departure: number;
  arrival: number;
  filled?: 'distance' | 'equal';
}

/**
 * The times of a trip's timepoints. A timepoint with no time is filled (Decision 0089 item 26): by great-circle distance between the
 * nearest timed stops either side that have a location, otherwise by equal spacing between the nearest timed stops. For the last
 * stop both times are kept as the feed gives them; elsewhere the arrival is the departure.
 */
export function resolveTimepointTimes(
  trip: FeedTrip,
  indexes: readonly number[],
  locationOf: (stopId: string) => Coordinates | undefined,
): ResolvedTime[] {
  const stops = trip.stopTimes;
  const last = stops.length - 1;
  return indexes.map((index) => {
    const stop = stops[index];
    const known = stop.departure ?? stop.arrival;
    if (known === undefined) {
      const filled = fillBlankTime(trip, index, locationOf);
      return { departure: filled.time, arrival: filled.time, filled: filled.method };
    }
    if (index === last) return { departure: stop.departure ?? known, arrival: stop.arrival ?? known };
    return { departure: known, arrival: known };
  });
}

interface VariantTiming {
  stopIds: string[];
  /** Median seconds after each trip's origin, by position; undefined where no trip has a time. */
  offsets: Array<number | undefined>;
  /** Median running seconds of the variant's trips. */
  runningSeconds: number;
}

function variantTiming(variant: VariantGroup): VariantTiming {
  const offsets = variant.stopIds.map((_, position) => {
    const samples: number[] = [];
    for (const trip of variant.trips) {
      const stop = trip.stopTimes[position];
      const time = stop.departure ?? stop.arrival;
      if (time !== undefined) samples.push(time - tripOrigin(trip));
    }
    return median(samples);
  });
  return { stopIds: variant.stopIds, offsets, runningSeconds: median(variant.trips.map(runningSeconds)) ?? 0 };
}

function terminalIds(stopIds: readonly string[]): string[] {
  return [...new Set([stopIds[0], stopIds[stopIds.length - 1]])];
}

interface Candidate {
  stopId: string;
  position: number;
  offset: number;
}

// Interior stops of the variant with a measured time. A stop that appears more than once keeps its first position.
function interiorCandidates(timing: VariantTiming, excluded: ReadonlySet<string>, eligible: (stopId: string) => boolean): Candidate[] {
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  timing.stopIds.forEach((stopId, position) => {
    if (position === 0 || position === timing.stopIds.length - 1) return;
    const offset = timing.offsets[position];
    if (offset === undefined || excluded.has(stopId) || seen.has(stopId) || !eligible(stopId)) return;
    seen.add(stopId);
    candidates.push({ stopId, position, offset });
  });
  return candidates;
}

// Share k of `count` interior points sits at k / (count + 1) of the running time. Each share takes the nearest candidate not yet
// taken; a tie goes to the earlier stop.
function chooseEvenShares(candidates: readonly Candidate[], runningSeconds: number, count: number): string[] {
  const remaining = [...candidates];
  const chosen: string[] = [];
  for (let share = 1; share <= count && remaining.length > 0; share += 1) {
    const target = (share * runningSeconds) / (count + 1);
    let best = 0;
    for (let index = 1; index < remaining.length; index += 1) {
      const distance = Math.abs(remaining[index].offset - target);
      const bestDistance = Math.abs(remaining[best].offset - target);
      if (distance < bestDistance || (distance === bestDistance && remaining[index].position < remaining[best].position)) best = index;
    }
    chosen.push(remaining[best].stopId);
    remaining.splice(best, 1);
  }
  return chosen;
}

interface Timed {
  index: number;
  time: number;
  at: Coordinates | undefined;
}

// Decision 0089 item 26. A blank time is filled between its nearest timed stops (a departure before it, an arrival after it). The
// distance rule needs a location at the blank stop and at both neighbours, and stops without a location are skipped in the chain;
// otherwise the time is spaced equally by stop position.
function fillBlankTime(
  trip: FeedTrip,
  index: number,
  locationOf: (stopId: string) => Coordinates | undefined,
): { time: number; method: 'distance' | 'equal' } {
  const stops = trip.stopTimes;
  const leaving = (stop: FeedStopTime) => stop.departure ?? stop.arrival;
  const arriving = (stop: FeedStopTime) => stop.arrival ?? stop.departure;
  const before = findTimed(trip, index, -1, leaving, locationOf, false);
  const after = findTimed(trip, index, 1, arriving, locationOf, false);
  if (!before || !after) throw new GtfsFeedError(`Trip "${trip.tripId}" has no timed stop around a blank time`);

  const here = locationOf(stops[index].stopId);
  const beforeLocated = findTimed(trip, index, -1, leaving, locationOf, true);
  const afterLocated = findTimed(trip, index, 1, arriving, locationOf, true);
  if (here && beforeLocated?.at && afterLocated?.at) {
    const fromBefore = greatCircleMiles(beforeLocated.at, here);
    const toAfter = greatCircleMiles(here, afterLocated.at);
    if (fromBefore + toAfter > 0) {
      const share = fromBefore / (fromBefore + toAfter);
      return { time: Math.round(beforeLocated.time + (afterLocated.time - beforeLocated.time) * share), method: 'distance' };
    }
  }
  const share = (index - before.index) / (after.index - before.index);
  return { time: Math.round(before.time + (after.time - before.time) * share), method: 'equal' };
}

function findTimed(
  trip: FeedTrip,
  from: number,
  step: -1 | 1,
  timeOf: (stop: FeedStopTime) => number | undefined,
  locationOf: (stopId: string) => Coordinates | undefined,
  requireLocation: boolean,
): Timed | undefined {
  for (let index = from + step; index >= 0 && index < trip.stopTimes.length; index += step) {
    const stop = trip.stopTimes[index];
    const time = timeOf(stop);
    if (time === undefined) continue;
    const at = locationOf(stop.stopId);
    if (requireLocation && !at) continue;
    return { index, time, at };
  }
  return undefined;
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
