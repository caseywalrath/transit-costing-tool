import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { Node, RoutePattern, RouteStopSet, Trip } from '../domain/types';
import { stopTripsTable } from './stopTripsView';

// Pattern P has three timepoints (Alpha, Bravo, Charlie). Elm Street sits on Alpha to Bravo (interpolated); Oak Avenue sits on Bravo to Charlie (previous).
const at = '2026-01-01T00:00:00.000Z';
const node = (id: string, name: string): Node => ({ id, scenarioId: 's', routeId: 'r', name, kind: 'timepoint', ...metadata(at) });
const nodes = [node('na', 'Alpha'), node('nb', 'Bravo'), node('nc', 'Charlie')];
const pattern = (id: string, points: RoutePattern['points']): RoutePattern => ({ ...metadata(at), id, scenarioId: 's', routeId: 'r', name: id, points });
const patternP = pattern('P', [{ id: 'p1', nodeId: 'na', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'nb', sequence: 1, cumulativeMiles: 1 }, { id: 'p3', nodeId: 'nc', sequence: 2, cumulativeMiles: 2 }]);
const set: RouteStopSet = {
  ...metadata(at), id: 'set', scenarioId: 's', routeId: 'r', roundingSeconds: 60,
  stops: [{ id: 'elm', name: 'Elm Street' }, { id: 'oak', name: 'Oak Avenue' }],
  placementsByPatternId: {
    P: [
      { id: 'x1', stopId: 'elm', afterPatternPointId: 'p1', sequence: 0, timing: 'interpolate' },
      { id: 'x2', stopId: 'oak', afterPatternPointId: 'p2', sequence: 0, timing: 'previous' },
    ],
  },
};
const trip = (id: string, patternId: string, times: Array<[string, number]>): Trip => ({ ...metadata(at), id, scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', tripProfileId: 'profile', patternId, publicLabel: id, stopTimes: times.map(([patternPointId, time], sequence) => ({ patternPointId, sequence, time })), provenance: { kind: 'generated', manuallyChangedFields: [] } } as unknown as Trip);
// Times in seconds. T1: 10:00, 10:10, 10:20. The stop between Alpha and Bravo is 10:05 (interpolated), the stop after Bravo is 10:10 (previous).
const t1 = trip('t1', 'P', [['p1', 36000], ['p2', 36600], ['p3', 37200]]);
const t2 = trip('t2', 'P', [['p1', 37800], ['p2', 38400], ['p3', 39000]]);
const other = trip('other', 'Q', [['p1', 36000], ['p2', 36600], ['p3', 37200]]);

describe('stop trips table', () => {
  it('lists the timepoints and stops in pattern order, with each Trip time per row', () => {
    const table = stopTripsTable({ pattern: patternP, set, nodes, trips: [t1, t2] });
    expect(table.rows.map((row) => [row.kind, row.name])).toEqual([['timepoint', 'Alpha'], ['stop', 'Elm Street'], ['timepoint', 'Bravo'], ['stop', 'Oak Avenue'], ['timepoint', 'Charlie']]);
    expect(table.rows.every((row) => row.time === undefined)).toBe(true);
    expect(table.trips.map((item) => item.id)).toEqual(['t1', 't2']);
    expect(table.times.get('t1')).toEqual([36000, 36300, 36600, 36600, 37200]);
    expect(table.times.get('t2')).toEqual([37800, 38100, 38400, 38400, 39000]);
  });

  it('leaves out Trips of another pattern', () => {
    const table = stopTripsTable({ pattern: patternP, set, nodes, trips: [t1, other] });
    expect(table.trips.map((item) => item.id)).toEqual(['t1']);
    expect([...table.times.keys()]).toEqual(['t1']);
  });

  it('lists only timepoints without a stop set', () => {
    const table = stopTripsTable({ pattern: patternP, nodes, trips: [t1] });
    expect(table.rows.map((row) => row.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    expect(table.times.get('t1')).toEqual([36000, 36600, 37200]);
  });

  it('uses the placements and rounding it is given instead of the stored ones', () => {
    // Between 10:00 and 10:09:10 the interpolated stop is 10:04:35: rounded down to the minute it is 10:04, to the half minute 10:04:30.
    const t4 = trip('t4', 'P', [['p1', 36000], ['p2', 36550], ['p3', 37150]]);
    const stored = stopTripsTable({ pattern: patternP, set, nodes, trips: [t4] });
    expect(stored.times.get('t4')?.[1]).toBe(36240);
    const halfMinute = stopTripsTable({ pattern: patternP, set, nodes, trips: [t4], roundingSeconds: 30 });
    expect(halfMinute.times.get('t4')?.[1]).toBe(36270);
    const [elm, oak] = set.placementsByPatternId.P;
    const next = stopTripsTable({ pattern: patternP, set, nodes, trips: [t1], placements: [{ ...elm, timing: 'next' }, oak] });
    expect(next.times.get('t1')).toEqual([36000, 36600, 36600, 36600, 37200]);
  });
});
