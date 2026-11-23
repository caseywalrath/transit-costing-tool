import { describe, expect, it } from 'vitest';
import { type Coordinates } from './distancesFromFeed';
import {
  flaggedStops,
  hasTimepointFlags,
  MAX_TIMEPOINTS,
  resolveTimepointTimes,
  suggestedStops,
  thinStops,
  timepointIdsOf,
  tripTimepointIndexes,
} from './timepointsFromFeed';
import { type FeedStopTime, type FeedTrip } from './tripsOnDate';

const at = (hour: number, minute = 0): number => hour * 3600 + minute * 60;

function trip(tripId: string, stops: Array<[string, number]>, timepoints?: Array<0 | 1>): FeedTrip {
  return {
    tripId,
    sourceTripId: tripId,
    routeId: 'R1',
    serviceId: 'WK',
    stopTimes: stops.map(([stopId, time], index) => ({
      stopId,
      sequence: index + 1,
      arrival: time,
      departure: time,
      ...(timepoints ? { timepoint: timepoints[index] } : {}),
    })),
  };
}

// A trip built from explicit stop records, for a stop with a blank time.
function tripOf(tripId: string, stopTimes: FeedStopTime[]): FeedTrip {
  return { tripId, sourceTripId: tripId, routeId: 'R1', serviceId: 'WK', stopTimes };
}

describe('timepoint flags', () => {
  it('reports whether any stop is flagged, and collects the flagged stops of several trips', () => {
    const flagged = trip('f', [['A', at(8)], ['B', at(8, 5)], ['C', at(8, 10)]], [1, 0, 1]);
    const other = trip('g', [['D', at(10)], ['C', at(10, 5)]], [0, 1]);
    const plain = trip('p', [['A', at(9)], ['B', at(9, 5)]]);
    expect(hasTimepointFlags([plain])).toBe(false);
    expect(hasTimepointFlags([plain, flagged])).toBe(true);
    expect([...flaggedStops([flagged, other])].sort()).toEqual(['A', 'C']);
  });
});

describe('tripTimepointIndexes and timepointIdsOf', () => {
  it('keeps the first and last stop of a trip and the stops of the set that the trip serves', () => {
    const served = trip('t', [['A', at(8)], ['B', at(8, 5)], ['C', at(8, 10)], ['D', at(8, 15)]]);
    const indexes = tripTimepointIndexes(served, new Set(['C', 'Z']));
    expect(indexes).toEqual([0, 2, 3]);
    expect(timepointIdsOf(served, indexes)).toEqual(['A', 'C', 'D']);
  });

  it('keeps both ends of a loop', () => {
    const loop = trip('loop', [['LA', at(6)], ['LB', at(6, 5)], ['LA', at(6, 10)]]);
    expect(tripTimepointIndexes(loop, new Set())).toEqual([0, 2]);
  });
});

describe('suggestedStops', () => {
  it('uses the two terminals alone when the running time gives two stops', () => {
    const trips = [trip('t', [['NA', at(6)], ['NM', at(6, 6)], ['NB', at(6, 12)]])];
    expect([...suggestedStops(trips)].sort()).toEqual(['NA', 'NB']);
  });

  it('takes the interior stops closest to the even shares of the running time', () => {
    // 60 minutes of running time, one stop every 3 minutes: N = round(60 / 10) + 1 = 7, so five interior stops nearest 10, 20, 30, 40 and 50 minutes.
    const stops: Array<[string, number]> = [];
    for (let minute = 0; minute <= 60; minute += 3) stops.push([`M${minute}`, at(8, minute)]);
    const chosen = suggestedStops([trip('t', stops)]);
    expect([...chosen].sort()).toEqual(['M0', 'M21', 'M30', 'M39', 'M51', 'M60', 'M9'].sort());
  });

  it('is empty for a direction with no trips', () => {
    expect(suggestedStops([]).size).toBe(0);
  });
});

describe('thinStops', () => {
  it('returns the set unchanged when it is within the limit', () => {
    const result = thinStops(new Set(['A', 'B', 'C']), [trip('t', [['A', at(8)], ['B', at(8, 5)], ['C', at(8, 10)]])]);
    expect([...result.stops].sort()).toEqual(['A', 'B', 'C']);
    expect(result.dropped).toEqual([]);
  });

  it('keeps 30 stops, both terminals, and lists the rest as dropped, for a set of 35 on one trip', () => {
    const stops: Array<[string, number]> = [];
    for (let index = 1; index <= 35; index += 1) stops.push([`P${String(index).padStart(2, '0')}`, at(6, index)]);
    const flagged = new Set(stops.map(([stopId]) => stopId));
    const result = thinStops(flagged, [trip('big', stops)]);
    expect(result.stops.size).toBe(MAX_TIMEPOINTS);
    expect(result.stops.has('P01')).toBe(true);
    expect(result.stops.has('P35')).toBe(true);
    expect(result.dropped).toHaveLength(5);
    expect(new Set([...result.stops, ...result.dropped])).toEqual(flagged);
  });
});

describe('resolveTimepointTimes', () => {
  const places: Record<string, Coordinates> = {
    A: { latitude: 39.74, longitude: -104.99 },
    X: { latitude: 39.74, longitude: -104.98 },
    Q: { latitude: 39.74, longitude: -104.975 },
    B: { latitude: 39.74, longitude: -104.97 },
  };
  const locationOf = (stopId: string) => places[stopId];

  it('fills a blank time by great-circle distance between located neighbours', () => {
    const blank = tripOf('t', [
      { stopId: 'A', sequence: 1, departure: at(8) },
      { stopId: 'X', sequence: 2 },
      { stopId: 'B', sequence: 3, arrival: at(8, 20) },
    ]);
    const resolved = resolveTimepointTimes(blank, [0, 1, 2], locationOf);
    expect(resolved[1]).toEqual({ departure: at(8, 10), arrival: at(8, 10), filled: 'distance' });
    expect(resolved[0]).toEqual({ departure: at(8), arrival: at(8) });
  });

  it('fills a blank time by equal spacing when the blank stop has no location', () => {
    const blank = tripOf('t', [
      { stopId: 'A', sequence: 1, departure: at(8) },
      { stopId: 'NOWHERE', sequence: 2 },
      { stopId: 'B', sequence: 3, arrival: at(8, 20) },
    ]);
    const resolved = resolveTimepointTimes(blank, [0, 1, 2], locationOf);
    expect(resolved[1]).toEqual({ departure: at(8, 10), arrival: at(8, 10), filled: 'equal' });
  });

  it('fills by equal spacing when the located neighbours share one place, so no distance can be measured', () => {
    const samePlace = (stopId: string) => (stopId === 'B' || stopId === 'X' ? places.A : places[stopId]);
    const blank = tripOf('t', [
      { stopId: 'A', sequence: 1, departure: at(8) },
      { stopId: 'X', sequence: 2 },
      { stopId: 'B', sequence: 3, arrival: at(8, 20) },
    ]);
    const resolved = resolveTimepointTimes(blank, [0, 1, 2], samePlace);
    expect(resolved[1]).toEqual({ departure: at(8, 10), arrival: at(8, 10), filled: 'equal' });
  });

  it('keeps the departure and arrival of the last stop as the feed gives them', () => {
    const dwell = tripOf('t', [
      { stopId: 'A', sequence: 1, departure: at(8) },
      { stopId: 'B', sequence: 2, arrival: at(8, 20), departure: at(8, 22) },
    ]);
    const resolved = resolveTimepointTimes(dwell, [0, 1], locationOf);
    expect(resolved[1]).toEqual({ departure: at(8, 22), arrival: at(8, 20) });
  });

  it('fills two blank timepoints of one trip, each by the rule its location allows', () => {
    const twoBlank = tripOf('t', [
      { stopId: 'A', sequence: 1, departure: at(8) },
      { stopId: 'X', sequence: 2 },
      { stopId: 'NOWHERE', sequence: 3 },
      { stopId: 'B', sequence: 4, arrival: at(8, 30) },
    ]);
    const resolved = resolveTimepointTimes(twoBlank, [0, 1, 2, 3], locationOf);
    expect(resolved[1]).toEqual({ departure: at(8, 15), arrival: at(8, 15), filled: 'distance' });
    expect(resolved[2]).toEqual({ departure: at(8, 20), arrival: at(8, 20), filled: 'equal' });
  });
});
