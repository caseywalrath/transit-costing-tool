// The timepoint review of one imported pattern (Decision 0089 item 26, sub-plan I9 item 2): every stop of the pattern's most common
// variant, in order, with its median time after the trip starts and whether it is a timepoint now. The planner ticks or unticks stops, and
// the result is the list of stop IDs the translation takes as that pattern's timepoints. Pure: it reads the feed trips it is given.

import { tripOrigin } from './directionsFromFeed';
import { commonVariant } from './patternsFromFeed';
import { MAX_TIMEPOINTS } from './timepointsFromFeed';
import type { FeedTrip } from './tripsOnDate';

/** At most this many timepoints per pattern, terminals included (Decision 0089 item 26). */
export const MAX_REVIEW_TIMEPOINTS = MAX_TIMEPOINTS;

/** One stop of the pattern's most common variant. */
export interface ReviewStop {
  /** Position in the variant, from 0. */
  position: number;
  stopId: string;
  /** Median seconds after the trip's first time, over the variant's trips; undefined when no trip has a time here. */
  offsetSeconds: number | undefined;
  /** The first and last stop: always timepoints, and the review does not let the planner untick them. */
  locked: boolean;
  timepoint: boolean;
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The review rows of a pattern. `trips` are the feed trips that sit on the pattern; the rows come from their most common stop sequence
 * (a tie goes to the earliest trip, as the pattern's own stops do). `timepointStopIds` are the stops the pattern has as timepoints now.
 */
export function timepointReview(trips: readonly FeedTrip[], timepointStopIds: ReadonlySet<string>): ReviewStop[] {
  const variant = commonVariant(trips);
  if (!variant) return [];
  const last = variant.stopIds.length - 1;
  return variant.stopIds.map((stopId, position) => {
    const samples: number[] = [];
    for (const trip of variant.trips) {
      const stop = trip.stopTimes[position];
      const time = stop.departure ?? stop.arrival;
      if (time !== undefined) samples.push(time - tripOrigin(trip));
    }
    const locked = position === 0 || position === last;
    return { position, stopId, offsetSeconds: median(samples), locked, timepoint: locked || timepointStopIds.has(stopId) };
  });
}

/** The timepoint stop IDs of a review, in stop order, each once. */
export function timepointIdsOf(review: readonly ReviewStop[]): string[] {
  const ids: string[] = [];
  for (const stop of review) if (stop.timepoint && !ids.includes(stop.stopId)) ids.push(stop.stopId);
  return ids;
}

/**
 * The timepoint stop IDs after the planner ticks or unticks one stop. A locked stop cannot be unticked, and a tick that would pass the
 * limit is refused: both return the IDs unchanged.
 */
export function withTimepointToggled(review: readonly ReviewStop[], position: number, on: boolean): string[] {
  const current = timepointIdsOf(review);
  const stop = review[position];
  if (!stop) return current;
  if (!on && stop.locked) return current;
  if (on) {
    if (current.includes(stop.stopId)) return current;
    if (current.length >= MAX_REVIEW_TIMEPOINTS) return current;
    const chosen = new Set([...current, stop.stopId]);
    return timepointIdsOf(review.map((item) => ({ ...item, timepoint: item.locked || chosen.has(item.stopId) })));
  }
  const remaining = new Set(current.filter((id) => id !== stop.stopId));
  return timepointIdsOf(review.map((item) => ({ ...item, timepoint: item.locked || remaining.has(item.stopId) })));
}

/** Whole minutes between two offsets, rounded to the nearest minute. */
export function minutesBetween(fromSeconds: number | undefined, toSeconds: number | undefined): number | undefined {
  if (fromSeconds === undefined || toSeconds === undefined) return undefined;
  return Math.round((toSeconds - fromSeconds) / 60);
}
