import { describe, expect, it } from 'vitest';
import { MAX_REVIEW_TIMEPOINTS, minutesBetween, timepointIdsOf, timepointReview, withTimepointToggled } from './timepointReview';
import type { FeedTrip } from './tripsOnDate';

/** A trip over these stops, starting at `start` seconds, `step` seconds apart. */
function trip(tripId: string, stopIds: string[], start: number, step: number): FeedTrip {
  return {
    tripId,
    sourceTripId: tripId,
    routeId: 'R',
    serviceId: 'S',
    stopTimes: stopIds.map((stopId, index) => ({ stopId, sequence: index + 1, arrival: start + index * step, departure: start + index * step })),
  };
}

const STOPS = ['A', 'B', 'C', 'D', 'E'];

describe('timepointReview', () => {
  it('lists every stop of the most common variant with its median offset, and locks the terminals', () => {
    const trips = [trip('t1', STOPS, 8 * 3600, 60), trip('t2', STOPS, 9 * 3600, 120), trip('t3', STOPS, 10 * 3600, 180)];
    const review = timepointReview(trips, new Set(['C']));
    expect(review.map((stop) => stop.stopId)).toEqual(STOPS);
    expect(review.map((stop) => stop.offsetSeconds)).toEqual([0, 120, 240, 360, 480]);
    expect(review.map((stop) => stop.locked)).toEqual([true, false, false, false, true]);
    expect(review.map((stop) => stop.timepoint)).toEqual([true, false, true, false, true]);
  });

  it('takes the stops from the most common variant when a trip skips one', () => {
    const trips = [trip('t1', STOPS, 0, 60), trip('t2', STOPS, 3600, 60), trip('t3', ['A', 'C', 'E'], 7200, 60)];
    expect(timepointReview(trips, new Set()).map((stop) => stop.stopId)).toEqual(STOPS);
  });

  it('gives nothing for no trips', () => {
    expect(timepointReview([], new Set())).toEqual([]);
  });
});

describe('withTimepointToggled', () => {
  const review = timepointReview([trip('t1', STOPS, 0, 60)], new Set(['C']));

  it('ticks a stop and unticks it again, keeping stop order', () => {
    expect(withTimepointToggled(review, 3, true)).toEqual(['A', 'C', 'D', 'E']);
    expect(withTimepointToggled(review, 2, false)).toEqual(['A', 'E']);
    expect(withTimepointToggled(review, 1, true)).toEqual(['A', 'B', 'C', 'E']);
  });

  it('never unticks a terminal', () => {
    expect(withTimepointToggled(review, 0, false)).toEqual(['A', 'C', 'E']);
    expect(withTimepointToggled(review, 4, false)).toEqual(['A', 'C', 'E']);
  });

  it('refuses a tick past the limit of 30 timepoints', () => {
    const many = Array.from({ length: 40 }, (_, index) => `S${index}`);
    const full = timepointReview([trip('t1', many, 0, 60)], new Set(many.slice(0, MAX_REVIEW_TIMEPOINTS - 1)));
    expect(timepointIdsOf(full)).toHaveLength(MAX_REVIEW_TIMEPOINTS);
    expect(withTimepointToggled(full, 35, true)).toHaveLength(MAX_REVIEW_TIMEPOINTS);
    expect(withTimepointToggled(full, 35, true)).not.toContain('S35');
  });
});

describe('minutesBetween', () => {
  it('rounds to whole minutes and gives nothing when a time is missing', () => {
    expect(minutesBetween(0, 270)).toBe(5);
    expect(minutesBetween(undefined, 60)).toBeUndefined();
  });
});
