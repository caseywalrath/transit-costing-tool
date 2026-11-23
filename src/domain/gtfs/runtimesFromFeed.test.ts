import { describe, expect, it } from 'vitest';
import { validateRuntimeProfile } from '../runtime';
import type { RoutePattern } from '../types';
import { medianOf, runtimeBandsFromTrips, runtimeProfileFromFeed, timesAtPatternPoints } from './runtimesFromFeed';

const NOW = '2026-11-21T00:00:00.000Z';

const hms = (text: string): number => {
  const [h, m, s] = text.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

// A three-point pattern: two segments.
const pattern: RoutePattern = {
  id: 'pattern-1',
  scenarioId: 'scenario-1',
  routeId: 'route-1',
  name: 'Outbound',
  points: [
    { id: 'p0', nodeId: 'n0', sequence: 0, cumulativeMiles: 0 },
    { id: 'p1', nodeId: 'n1', sequence: 1, cumulativeMiles: 1 },
    { id: 'p2', nodeId: 'n2', sequence: 2, cumulativeMiles: 2 },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

// Times at the three points: the departures at the first two, the arrival at the last.
const trip = (start: string, run: [number, number]): { pointTimes: number[] } => {
  const first = hms(start);
  return { pointTimes: [first, first + run[0], first + run[0] + run[1]] };
};

describe('medianOf (Decision 0089 item 30)', () => {
  it('takes the middle of an odd count', () => {
    expect(medianOf([720, 600, 900])).toBe(720);
  });

  it('takes the mean of the two middle values of an even count, rounded half up', () => {
    expect(medianOf([10, 11])).toBe(11);
    expect(medianOf([10, 12])).toBe(11);
    expect(medianOf([10, 13])).toBe(12);
  });

  it('refuses an empty list', () => {
    expect(() => medianOf([])).toThrow(RangeError);
  });
});

describe('timesAtPatternPoints (Decision 0089 item 31)', () => {
  it('uses the departure at each point, and the arrival at the last point', () => {
    expect(
      timesAtPatternPoints([
        { departure: 100, arrival: 100 },
        { departure: 200, arrival: 190 },
        { departure: 400, arrival: 380 },
      ]),
    ).toEqual([100, 200, 380]);
  });
});

describe('runtimeBandsFromTrips (Decision 0089 item 30)', () => {
  it('makes one band per hour with trips, each with the median of its trips', () => {
    const bands = runtimeBandsFromTrips([
      trip('06:05:00', [700, 20]),
      trip('06:40:00', [740, 20]),
      trip('06:50:00', [800, 20]),
      trip('07:10:00', [840, 20]),
    ]);
    expect(bands.map((band) => [band.label, band.startTime, band.endTime, band.segmentRuntimeSeconds])).toEqual([
      ['06:00–07:00', hms('06:00:00'), hms('07:00:00'), [740, 20]],
      ['07:00–08:00', hms('07:00:00'), hms('08:00:00'), [840, 20]],
    ]);
    expect(bands.map((band) => band.sequence)).toEqual([0, 1]);
  });

  it('lets an hour with no trips join the band before it', () => {
    const bands = runtimeBandsFromTrips([trip('06:10:00', [600, 60]), trip('08:10:00', [660, 60])]);
    expect(bands.map((band) => band.label)).toEqual(['06:00–08:00', '08:00–09:00']);
    expect(bands[0].endTime).toBe(bands[1].startTime);
  });

  it('keeps times past 24:00 on the service day', () => {
    const bands = runtimeBandsFromTrips([trip('25:10:00', [600, 60])]);
    expect(bands.map((band) => [band.label, band.startTime])).toEqual([['25:00–26:00', hms('25:00:00')]]);
  });

  it('uses the first departure for the hour of a trip', () => {
    const bands = runtimeBandsFromTrips([trip('06:59:00', [600, 60]), trip('07:01:00', [600, 60])]);
    expect(bands.map((band) => band.label)).toEqual(['06:00–07:00', '07:00–08:00']);
  });

  it('returns no bands for no trips', () => {
    expect(runtimeBandsFromTrips([])).toEqual([]);
  });
});

describe('runtimeProfileFromFeed', () => {
  const profile = runtimeProfileFromFeed({ pattern, serviceDayName: 'Weekday', trips: [trip('06:05:00', [700, 20])], now: NOW });

  it('names the profile "{service day} from feed" and sets the segmentStart method', () => {
    expect(profile).toMatchObject({
      name: 'Weekday from feed',
      scenarioId: 'scenario-1',
      routeId: 'route-1',
      patternId: 'pattern-1',
      calculationMethod: 'segmentStart',
      calculationRevision: 0,
      createdAt: NOW,
    });
  });

  it('passes the existing profile validation with no error', () => {
    expect(validateRuntimeProfile(profile, pattern).filter((finding) => finding.severity === 'error')).toEqual([]);
  });
});
