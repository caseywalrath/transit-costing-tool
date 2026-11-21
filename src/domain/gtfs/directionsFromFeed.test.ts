import { describe, expect, it } from 'vitest';
import { directionNames, normalizeHeadsign, splitDirections, tripOrigin } from './directionsFromFeed';
import { type FeedTrip, tripsOnDate } from './tripsOnDate';
import { loadFeedTables } from './testFeeds';

const at = (hour: number, minute = 0): number => hour * 3600 + minute * 60;

// A trip that visits the given stops in order, all at one time each (departure equals arrival).
function trip(tripId: string, stops: Array<[string, number]>, extra: Partial<FeedTrip> = {}): FeedTrip {
  return {
    tripId,
    sourceTripId: tripId,
    routeId: 'R1',
    serviceId: 'WK',
    stopTimes: stops.map(([stopId, time], index) => ({ stopId, sequence: index + 1, arrival: time, departure: time })),
    ...extra,
  };
}

describe('tripOrigin', () => {
  it('is the first departure, or the first arrival when the departure is blank', () => {
    const blankDeparture = trip('T', [['A', at(8)], ['B', at(8, 10)]]);
    blankDeparture.stopTimes[0] = { stopId: 'A', sequence: 1, arrival: at(7, 55) };
    expect(tripOrigin(trip('T', [['A', at(8)], ['B', at(8, 10)]]))).toBe(at(8));
    expect(tripOrigin(blankDeparture)).toBe(at(7, 55));
  });
});

describe('normalizeHeadsign', () => {
  it('trims the headsign and cuts it to 40 characters', () => {
    expect(normalizeHeadsign('  South Terminal  ')).toBe('South Terminal');
    expect(normalizeHeadsign('x'.repeat(45))).toBe('x'.repeat(40));
  });

  it('is undefined for a blank headsign', () => {
    expect(normalizeHeadsign('   ')).toBeUndefined();
    expect(normalizeHeadsign(undefined)).toBeUndefined();
  });
});

describe('splitDirections when no trip has a direction_id', () => {
  it('groups by the pair of terminal stops and gives the largest group Outbound and its reverse Inbound', () => {
    const trips = [
      trip('a', [['NA', at(6)], ['NB', at(6, 12)]]),
      trip('b', [['NA', at(7)], ['NB', at(7, 14)]]),
      trip('c', [['NB', at(6, 30)], ['NA', at(6, 42)]]),
    ];
    const split = splitDirections(trips);
    expect(split.noDirectionColumn).toBe(true);
    expect(split.groupOf).toEqual(['outbound', 'outbound', 'inbound']);
  });

  it('breaks a tie in trip count by the earliest first departure', () => {
    const trips = [
      trip('late', [['X', at(9)], ['Y', at(9, 10)]]),
      trip('early', [['Y', at(8)], ['X', at(8, 10)]]),
    ];
    expect(splitDirections(trips).groupOf).toEqual(['inbound', 'outbound']);
  });

  it('gives a pair that shares its first stop with the Outbound pair to Outbound, and one that shares it with the Inbound pair to Inbound', () => {
    const pair = (id: string, first: string, last: string, count: number, hour: number): FeedTrip[] =>
      Array.from({ length: count }, (_, index) => trip(`${id}${index}`, [[first, at(hour, index)], [last, at(hour, index + 30)]]));
    const trips = [
      ...pair('AB', 'A', 'B', 3, 6),
      ...pair('BA', 'B', 'A', 1, 7),
      ...pair('AC', 'A', 'C', 1, 8),
      ...pair('BD', 'B', 'D', 1, 9),
      ...pair('CA', 'C', 'A', 1, 10),
    ];
    const split = splitDirections(trips);
    const groupById = Object.fromEntries(trips.map((item, index) => [item.tripId, split.groupOf[index]]));
    expect(groupById).toEqual({
      AB0: 'outbound', AB1: 'outbound', AB2: 'outbound',
      BA0: 'inbound',
      AC0: 'outbound',
      BD0: 'inbound',
      CA0: 'outbound',
    });
  });

  it('keeps a loop in Outbound with no Inbound partner', () => {
    const trips = [trip('loop', [['LA', at(6)], ['LB', at(6, 5)], ['LA', at(6, 10)]])];
    expect(splitDirections(trips).groupOf).toEqual(['outbound']);
  });
});

describe('splitDirections when some trips have a direction_id', () => {
  it('gives a blank trip the direction whose valued trips most often share its first stop, and lists it as guessed', () => {
    const trips = [
      trip('valued0', [['A', at(8)], ['B', at(8, 10)]], { directionId: 0 }),
      trip('valued1', [['B', at(9)], ['A', at(9, 10)]], { directionId: 1 }),
      trip('blankA', [['A', at(10)], ['B', at(10, 10)]]),
      trip('blankB', [['B', at(11)], ['A', at(11, 10)]]),
      trip('blankZ', [['Z', at(12)], ['A', at(12, 10)]]),
    ];
    const split = splitDirections(trips);
    expect(split.noDirectionColumn).toBe(false);
    expect(split.groupOf).toEqual(['outbound', 'inbound', 'outbound', 'inbound', 'outbound']);
    expect(split.guessedTripIds).toEqual(['blankA', 'blankB', 'blankZ']);
  });

  it('gives a tie between the two directions to Outbound', () => {
    const trips = [
      trip('out', [['A', at(8)], ['B', at(8, 10)]], { directionId: 0 }),
      trip('in', [['A', at(9)], ['B', at(9, 10)]], { directionId: 1 }),
      trip('blank', [['A', at(10)], ['B', at(10, 10)]]),
    ];
    expect(splitDirections(trips).groupOf[2]).toBe('outbound');
  });
});

describe('directionNames', () => {
  it('proposes the most common headsign of each direction', () => {
    const trips = [
      trip('a', [['NA', at(6)], ['NB', at(6, 12)]], { headsign: 'South Terminal' }),
      trip('b', [['NA', at(7)], ['NB', at(7, 14)]], { headsign: 'South Terminal' }),
      trip('c', [['NB', at(6, 30)], ['NA', at(6, 42)]], { headsign: 'North Terminal' }),
    ];
    const names = directionNames(trips, ['outbound', 'outbound', 'inbound']);
    expect(names).toEqual({ outbound: 'South Terminal', inbound: 'North Terminal' });
  });

  it('breaks a tie between headsigns by the earliest trip', () => {
    const trips = [
      trip('late', [['A', at(9)], ['B', at(9, 10)]], { headsign: 'Later Name' }),
      trip('early', [['A', at(6)], ['B', at(6, 10)]], { headsign: 'Early Name' }),
    ];
    expect(directionNames(trips, ['outbound', 'outbound']).outbound).toBe('Early Name');
  });

  it('keeps both group words when the two names clash', () => {
    const trips = [
      trip('a', [['A', at(6)], ['B', at(6, 10)]], { headsign: 'Crosstown' }),
      trip('b', [['B', at(7)], ['A', at(7, 10)]], { headsign: 'crosstown' }),
    ];
    expect(directionNames(trips, ['outbound', 'inbound'])).toEqual({ outbound: 'Outbound', inbound: 'Inbound' });
  });

  it('uses the group word when a direction has no headsign', () => {
    const trips = [trip('a', [['A', at(6)], ['B', at(6, 10)]])];
    expect(directionNames(trips, ['outbound'])).toEqual({ outbound: 'Outbound', inbound: 'Inbound' });
  });
});

describe('splitDirections and directionNames on the edge-no-direction feed', () => {
  it('reproduces the worked answer: South Terminal outbound, North Terminal inbound', () => {
    const tables = loadFeedTables('edge-no-direction');
    const { byRoute } = tripsOnDate(tables, '20260105', new Set(['N1']));
    const trips = byRoute.get('N1') ?? [];
    const split = splitDirections(trips);
    expect(split.noDirectionColumn).toBe(true);
    expect(directionNames(trips, split.groupOf)).toEqual({ outbound: 'South Terminal', inbound: 'North Terminal' });
  });

  it('returns no groups when there are no trips', () => {
    expect(splitDirections([]).groupOf).toEqual([]);
  });
});
