import { describe, expect, it } from 'vitest';
import { commonVariant, draftPatterns, mergedVariantTrips, patternKeyOf, patternNameOf, uniquePatternNames, variantsOf } from './patternsFromFeed';
import { type FeedTrip } from './tripsOnDate';

const at = (hour: number, minute = 0): number => hour * 3600 + minute * 60;

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

describe('variantsOf and commonVariant', () => {
  it('orders variants by how many trips have them', () => {
    const trips = [
      trip('t1', [['A', at(6)], ['B', at(6, 5)], ['C', at(6, 10)]]),
      trip('t2', [['A', at(7)], ['C', at(7, 10)]]),
      trip('t3', [['A', at(8)], ['B', at(8, 5)], ['C', at(8, 10)]]),
    ];
    const variants = variantsOf(trips);
    expect(variants.map((variant) => variant.stopIds)).toEqual([['A', 'B', 'C'], ['A', 'C']]);
    expect(variants[0].trips.map((item) => item.tripId)).toEqual(['t1', 't3']);
    expect(commonVariant(trips)?.stopIds).toEqual(['A', 'B', 'C']);
  });

  it('breaks a tie between variants by the variant of the earliest trip', () => {
    const trips = [
      trip('late', [['A', at(9)], ['X', at(9, 5)]]),
      trip('early', [['A', at(6)], ['Y', at(6, 5)]]),
    ];
    expect(commonVariant(trips)?.stopIds).toEqual(['A', 'Y']);
  });

  it('is undefined for no trips', () => {
    expect(commonVariant([])).toBeUndefined();
  });
});

describe('patternKeyOf', () => {
  it('is the direction and the timepoint stop IDs joined by ">"', () => {
    expect(patternKeyOf('outbound', ['LA', 'LC', 'LA'])).toBe('outbound:LA>LC>LA');
    expect(patternKeyOf('inbound', ['S3'])).toBe('inbound:S3');
  });
});

describe('draftPatterns', () => {
  it('groups trips by key and orders the patterns by their earliest trip', () => {
    const drafts = draftPatterns([
      { trip: trip('short', [['LA', at(9)], ['LC', at(9, 9)]]), group: 'outbound', timepointIds: ['LA', 'LC'] },
      { trip: trip('full2', [['LA', at(7)], ['LC', at(7, 12)], ['LA', at(7, 22)]]), group: 'outbound', timepointIds: ['LA', 'LC', 'LA'] },
      { trip: trip('full1', [['LA', at(6)], ['LC', at(6, 10)], ['LA', at(6, 20)]]), group: 'outbound', timepointIds: ['LA', 'LC', 'LA'] },
    ]);
    expect(drafts.map((draft) => draft.key)).toEqual(['outbound:LA>LC>LA', 'outbound:LA>LC']);
    expect(drafts[0].trips.map((item) => item.tripId)).toEqual(['full1', 'full2']);
    expect(drafts[1].timepointIds).toEqual(['LA', 'LC']);
  });
});

describe('mergedVariantTrips', () => {
  it('lists the trips whose variant is not the most common one', () => {
    const trips = [
      trip('full1', [['LA', at(6)], ['LB', at(6, 5)], ['LC', at(6, 10)], ['LA', at(6, 20)]]),
      trip('full2', [['LA', at(7)], ['LB', at(7, 5)], ['LC', at(7, 10)], ['LA', at(7, 20)]]),
      trip('skip', [['LA', at(8)], ['LC', at(8, 9)], ['LA', at(8, 18)]]),
    ];
    expect(mergedVariantTrips(trips).map((item) => item.tripId)).toEqual(['skip']);
  });
});

describe('patternNameOf', () => {
  it('uses the most common headsign when there is one', () => {
    const trips = [
      trip('a', [['A', at(6)], ['B', at(6, 5)]], { headsign: ' Crosstown ' }),
      trip('b', [['A', at(7)], ['B', at(7, 5)]], { headsign: 'Crosstown' }),
    ];
    expect(patternNameOf(trips, 'First Stop', 'Last Stop')).toBe('Crosstown');
  });

  it('falls back to "first timepoint to last timepoint" when no trip has a headsign', () => {
    const trips = [trip('a', [['A', at(6)], ['B', at(6, 5)]])];
    expect(patternNameOf(trips, 'Loop Hub', 'Loop Far')).toBe('Loop Hub to Loop Far');
  });
});

describe('uniquePatternNames', () => {
  it('adds " 2", " 3" to repeated names in order', () => {
    expect(uniquePatternNames(['Hub to Hub', 'Hub to Far', 'Hub to Hub', 'Hub to Hub'])).toEqual([
      'Hub to Hub',
      'Hub to Far',
      'Hub to Hub 2',
      'Hub to Hub 3',
    ]);
  });

  it('skips a suffix that another name already uses', () => {
    expect(uniquePatternNames(['Name', 'Name 2', 'Name'])).toEqual(['Name', 'Name 2', 'Name 3']);
  });
});
