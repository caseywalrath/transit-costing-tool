import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { segmentStopTimes, stopTimeRows } from './stopTimes';
import type { Node, PatternStopPlacement, RoutePattern, RouteStopSet, StopTimingRule, Trip } from './types';

const T = metadata('2026-01-01T00:00:00.000Z');
const I: StopTimingRule = 'interpolate';

// Times in seconds from service-day midnight. 8:00:00 = 28800.
const at = (hour: number, minute: number, second = 0) => hour * 3600 + minute * 60 + second;

describe('segmentStopTimes (Decision 0079, section 4.3)', () => {
  it('places one interpolated stop at the middle of 8:00 to 8:10 with rounding 60', () => {
    expect(segmentStopTimes(at(8, 0), at(8, 10), [I], 60)).toEqual([at(8, 5)]);
  });

  it('places two interpolated stops between 8:10 and 8:16 at 8:12 and 8:14 with rounding 60', () => {
    expect(segmentStopTimes(at(8, 10), at(8, 16), [I, I], 60)).toEqual([29520, 29640]);
  });

  it('places two interpolated stops between 8:10 and 8:17 at 8:12:00 and 8:14:30 with rounding 30, and at 8:12 and 8:14 with rounding 60', () => {
    expect(segmentStopTimes(at(8, 10), at(8, 17), [I, I], 30)).toEqual([29520, 29670]);
    expect(segmentStopTimes(at(8, 10), at(8, 17), [I, I], 60)).toEqual([at(8, 12), at(8, 14)]);
  });

  it('gives previous the time A and next the time B, unrounded', () => {
    expect(segmentStopTimes(at(8, 0, 20), at(8, 10), ['previous', 'next'], 60)).toEqual([at(8, 0, 20), at(8, 10)]);
  });

  it('gives A, 8:03, 8:06 and B for previous, interpolate, interpolate, next between 8:00 and 8:09', () => {
    expect(segmentStopTimes(at(8, 0), at(8, 9), ['previous', I, I, 'next'], 60)).toEqual([at(8, 0), at(8, 3), at(8, 6), at(8, 9)]);
  });

  it('never rounds an interpolated time below A', () => {
    expect(segmentStopTimes(28850, 28852, [I], 60)).toEqual([28850]);
  });

  it('uses exact integer arithmetic: A = 0, B = 100, two interpolated stops, rounding 30 gives 30 and 60', () => {
    expect(segmentStopTimes(0, 100, [I, I], 30)).toEqual([30, 60]);
  });

  it('raises an interpolated stop to B when it comes after a next stop', () => {
    expect(segmentStopTimes(at(8, 0), at(8, 10), ['next', I], 60)).toEqual([at(8, 10), at(8, 10)]);
  });

  it('gives undefined for every stop when A is missing, B is missing, or B is earlier than A', () => {
    const timings: StopTimingRule[] = ['previous', I, 'next'];
    expect(segmentStopTimes(undefined, at(8, 10), timings, 60)).toEqual([undefined, undefined, undefined]);
    expect(segmentStopTimes(at(8, 0), undefined, timings, 60)).toEqual([undefined, undefined, undefined]);
    expect(segmentStopTimes(at(8, 10), at(8, 0), timings, 60)).toEqual([undefined, undefined, undefined]);
  });
});

describe('stopTimeRows (Decision 0079, section 8.3)', () => {
  const nodeA: Node = { ...T, id: 'nA', scenarioId: 's', routeId: 'r', name: 'Alpha', shortName: 'AL', kind: 'timepoint' };
  const nodeB: Node = { ...T, id: 'nB', scenarioId: 's', routeId: 'r', name: 'Bravo', kind: 'timepoint' };
  const nodeC: Node = { ...T, id: 'nC', scenarioId: 's', routeId: 'r', name: 'Charlie', kind: 'timepoint' };
  const nodes = [nodeA, nodeB, nodeC];
  const pattern: RoutePattern = {
    ...T, id: 'P', scenarioId: 's', routeId: 'r', name: 'P',
    points: [
      { id: 'pA', nodeId: 'nA', sequence: 0, cumulativeMiles: 0 },
      { id: 'pB', nodeId: 'nB', sequence: 1, cumulativeMiles: 1 },
      { id: 'pC', nodeId: 'nC', sequence: 2, cumulativeMiles: 2 },
    ],
  };
  const trip: Trip = {
    ...T, id: 'trip', scenarioId: 's', routeId: 'r', serviceDayId: 'd', patternId: 'P',
    stopTimes: [
      { patternPointId: 'pA', sequence: 0, time: at(8, 0) },
      { patternPointId: 'pB', sequence: 1, time: at(8, 10) },
      { patternPointId: 'pC', sequence: 2, time: at(8, 20) },
    ],
    provenance: { kind: 'generated', manuallyChangedFields: [] },
  };
  const placement = (id: string, stopId: string, afterPatternPointId: string, sequence: number, timing: StopTimingRule = I): PatternStopPlacement =>
    ({ id, stopId, afterPatternPointId, sequence, timing });
  const set: RouteStopSet = {
    ...T, id: 'set', scenarioId: 's', routeId: 'r', roundingSeconds: 60,
    stops: [
      { id: 'S1', name: 'Main St' },
      { id: 'S2', name: 'Oak Ave', stopCode: 'X2' },
      { id: 'S3', name: 'Pine Rd' },
    ],
    placementsByPatternId: {
      P: [placement('y1', 'S1', 'pA', 0), placement('y2', 'S2', 'pB', 0), placement('y3', 'S3', 'pB', 1)],
    },
    // Decision 0080: the timepoints' stop IDs on this pattern.
    timepointStopCodesByPatternId: { P: { pA: '1001', pC: '1003' }, OTHER: { pB: '9999' } },
  };

  it('returns timepoint, stop, timepoint, stop, stop, timepoint in pattern order, with stop codes and unchanged timepoint times', () => {
    const rows = stopTimeRows({ pattern, set, nodes, trip });
    expect(rows.map((row) => [row.kind, row.patternPointId, row.name])).toEqual([
      ['timepoint', 'pA', 'Alpha'],
      ['stop', 'pA', 'Main St'],
      ['timepoint', 'pB', 'Bravo'],
      ['stop', 'pB', 'Oak Ave'],
      ['stop', 'pB', 'Pine Rd'],
      ['timepoint', 'pC', 'Charlie'],
    ]);
    expect(rows[0]).toMatchObject({ nodeId: 'nA', stopCode: '1001', time: at(8, 0) });
    expect(rows[2].time).toBe(at(8, 10));
    expect(rows[2].stopCode).toBeUndefined();
    expect(rows[5]).toMatchObject({ stopCode: '1003', time: at(8, 20) });
    expect(rows[1]).toMatchObject({ kind: 'stop', segmentIndex: 0, placementId: 'y1', stopId: 'S1', time: at(8, 5), timing: I });
    expect(rows[1].stopCode).toBeUndefined();
    expect(rows[3]).toMatchObject({ stopId: 'S2', stopCode: 'X2', segmentIndex: 1, time: 29580 });
    expect(rows[4]).toMatchObject({ stopId: 'S3', segmentIndex: 1, time: 29760 });
  });

  it('returns only timepoints when there is no set', () => {
    const rows = stopTimeRows({ pattern, nodes, trip });
    expect(rows.map((row) => row.kind)).toEqual(['timepoint', 'timepoint', 'timepoint']);
    expect(rows[1].time).toBe(at(8, 10));
  });

  it('returns no times when there is no trip', () => {
    const rows = stopTimeRows({ pattern, set, nodes });
    expect(rows.every((row) => row.time === undefined)).toBe(true);
    expect(rows).toHaveLength(6);
  });

  it('uses the placements override in place of the set placements, so a changed rule changes the result', () => {
    const rows = stopTimeRows({ pattern, set, nodes, trip, placements: [placement('y1', 'S1', 'pA', 0, 'next')] });
    expect(rows.find((row) => row.placementId === 'y1')?.time).toBe(at(8, 10));
    expect(rows.filter((row) => row.kind === 'stop')).toHaveLength(1);
  });

  it('uses the rounding override in place of the set rounding', () => {
    const fine = stopTimeRows({ pattern, set, nodes, trip, roundingSeconds: 30 });
    expect(fine.find((row) => row.placementId === 'y2')?.time).toBe(29580);
    const seg = segmentStopTimes(at(8, 10), at(8, 20), [I, I], 30);
    expect(fine.find((row) => row.placementId === 'y3')?.time).toBe(seg[1]);
  });
});
