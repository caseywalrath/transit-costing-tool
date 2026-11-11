import { describe, expect, it } from 'vitest';
import { diagnoseAnchor } from './anchorDiagnosis';
import { metadata } from './ids';
import { recalculateTripWithAnchor } from './trips';
import type { RoutePattern, RuntimeBand, RuntimeProfile, Trip } from './types';

// Decision 0072. The boundary is 8:00 (28800) in every fixture.
const stamp = '2026-11-11T09:00:00.000Z';
const makePattern = (count: number): RoutePattern => ({ id: 'p', scenarioId: 's', routeId: 'r', name: 'P', directionId: 'd', points: Array.from({ length: count }, (_, index) => ({ id: `p${index}`, nodeId: `N${index}`, sequence: index, cumulativeMiles: index })), ...metadata(stamp) });
const band = (id: string, startTime: number, endTime: number, segmentRuntimeSeconds: number[]): RuntimeBand => ({ id, label: id, sequence: 0, startTime, endTime, segmentRuntimeSeconds });
const makeProfile = (bands: RuntimeBand[], calculationMethod?: RuntimeProfile['calculationMethod']): RuntimeProfile => ({ id: 'rp', scenarioId: 's', routeId: 'r', patternId: 'p', name: 'Runtime', bands, ...(calculationMethod ? { calculationMethod } : {}), ...metadata(stamp) });
const makeTrip = (pattern: RoutePattern, times: number[]): Trip => ({ id: 't', scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', tripProfileId: 'tp', patternId: 'p', stopTimes: pattern.points.map((point, sequence) => ({ patternPointId: point.id, sequence, time: times[sequence] })), provenance: { kind: 'generated', manuallyChangedFields: [] }, ...metadata(stamp) } as Trip);
/** The Trip with a new time at the anchor point, as the review's anchorTimeByTripId seeds it. */
const withAnchorTime = (trip: Trip, pointId: string, time: number): Trip => ({ ...trip, stopTimes: trip.stopTimes.map((point) => point.patternPointId === pointId ? { ...point, time } : point) });

const threePoints = makePattern(3);
const rising = makeProfile([band('am', 0, 28800, [600, 900]), band('pm', 28800, 90000, [720, 1080])], 'segmentStart');
const falling = makeProfile([band('am', 0, 28800, [720, 1080]), band('pm', 28800, 90000, [600, 900])], 'segmentStart');

describe('diagnoseAnchor', () => {
  it('returns undefined for the first point and for an anchor that solves', () => {
    const trip = makeTrip(threePoints, [27000, 27600, 28500]);
    expect(diagnoseAnchor(trip, threePoints, rising, 'p0')).toBeUndefined();
    expect(diagnoseAnchor(trip, threePoints, rising, 'p2')).toBeUndefined();
    for (const method of [undefined, 'blendSegments'] as const) expect(diagnoseAnchor(trip, threePoints, makeProfile(rising.bands, method), 'p2')).toBeUndefined();
  });

  it('a rising runtime leaves a gap: the nearest solutions on each side, the boundary, and the segment changes', () => {
    // Departures before 8:00 whose second segment starts after 8:00 arrive at d + 1680; those whose second segment starts before it, at d + 1500.
    // Arrivals from 29700 to 29879 cannot be reached.
    const trip = makeTrip(threePoints, [28230, 28830, 29760]);
    const diagnosis = diagnoseAnchor(trip, threePoints, rising, 'p2')!;
    expect(diagnosis).toMatchObject({ kind: 'gap', anchorTime: 29760, firstDepartureWorks: true, earlier: { anchorTime: 29699, firstDeparture: 28199, differenceSeconds: -61 }, later: { anchorTime: 29880, firstDeparture: 28200, differenceSeconds: 120 } });
    expect(diagnosis.boundary).toEqual({ time: 28800, fromBand: { id: 'am', label: 'am' }, toBand: { id: 'pm', label: 'pm' }, segmentChanges: [{ segmentIndex: 0, fromSeconds: 600, toSeconds: 720 }, { segmentIndex: 1, fromSeconds: 900, toSeconds: 1080 }] });
    for (const solution of [diagnosis.earlier!, diagnosis.later!]) {
      const solved = recalculateTripWithAnchor(withAnchorTime(trip, 'p2', solution.anchorTime), threePoints, rising, stamp, 'p2').trip;
      expect(solved.stopTimes[0].time).toBe(solution.firstDeparture);
      expect(solved.stopTimes[2].time).toBe(solution.anchorTime);
    }
  });

  it('a falling runtime gives an overlap, and the nearest solutions are reached by one departure', () => {
    // Arrivals from 29700 to 29879 are reached twice.
    const trip = makeTrip(threePoints, [28000, 28720, 29760]);
    const diagnosis = diagnoseAnchor(trip, threePoints, falling, 'p2')!;
    expect(diagnosis).toMatchObject({ kind: 'overlap', earlier: { anchorTime: 29699 }, later: { anchorTime: 29880 } });
    for (const solution of [diagnosis.earlier!, diagnosis.later!]) expect(recalculateTripWithAnchor(withAnchorTime(trip, 'p2', solution.anchorTime), threePoints, falling, stamp, 'p2').trip.stopTimes[2].time).toBe(solution.anchorTime);
  });

  it('gaps of several segments add up', () => {
    const fourPoints = makePattern(4);
    const profile = makeProfile([band('am', 0, 28800, [600, 600, 600]), band('pm', 28800, 90000, [660, 660, 660])], 'segmentStart');
    const trip = makeTrip(fourPoints, [27630, 28230, 28830, 29430]);
    const diagnosis = diagnoseAnchor(trip, fourPoints, profile, 'p3')!;
    expect(diagnosis).toMatchObject({ kind: 'gap', earlier: { anchorTime: 29399 }, later: { anchorTime: 29460 } });
    expect(diagnosis.boundary?.segmentChanges.map((change) => change.segmentIndex)).toEqual([0, 1, 2]);
  });

  it('one band per trip, too far from both bands', () => {
    const profile = makeProfile([band('am', 0, 28800, [600, 900]), band('pm', 28800, 90000, [1200, 1800])]);
    const trip = makeTrip(threePoints, [29500, 30100, 31000]);
    const diagnosis = diagnoseAnchor(trip, threePoints, profile, 'p2')!;
    expect(diagnosis).toMatchObject({ kind: 'gap', earlier: { anchorTime: 30299, firstDeparture: 28799 }, later: { anchorTime: 31800, firstDeparture: 28800 }, boundary: { time: 28800 } });
  });

  it('an anchor time before every arrival is outside', () => {
    const trip = makeTrip(threePoints, [0, 500, 1000]);
    const diagnosis = diagnoseAnchor(trip, threePoints, rising, 'p2')!;
    expect(diagnosis.kind).toBe('outside');
    expect(diagnosis.earlier).toBeUndefined();
    expect(diagnosis.later?.anchorTime).toBe(1500);
  });

  it('diagnoses a 12-point, five-band trip quickly', () => {
    const twelve = makePattern(12);
    const bands = [0, 21600, 32400, 54000, 68400].map((start, index, starts) => band(`b${index}`, start, starts[index + 1] ?? 93600, Array.from({ length: 11 }, () => 240 + index * 30)));
    const profile = makeProfile(bands, 'segmentStart');
    // 11 segments of 240 s before 6:00 and 270 s after: anchor times just after the boundary jump are unreachable.
    const times = Array.from({ length: 12 }, (_, index) => 21000 + index * 240);
    times[11] = 21000 + 11 * 240 + 100;
    const trip = makeTrip(twelve, times);
    const started = performance.now();
    const diagnosis = diagnoseAnchor(trip, twelve, profile, 'p11');
    const elapsed = performance.now() - started;
    expect(diagnosis).toBeDefined();
    expect(elapsed).toBeLessThan(250);
  });
});
