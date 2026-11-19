import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { buildStopSchedule, type StopScheduleColumn, type StopScheduleDirection, type StopScheduleInput } from './stopSchedule';
import type { Node, PatternPoint, PatternStopPlacement, PlannedFrequency, RouteDirection, RoutePattern, RouteStopSet, RuntimeAssignment, RuntimeBand, RuntimeProfile, Trip } from './types';

const at = '2026-01-01T00:00:00.000Z';
const hm = (hour: number, minute = 0) => hour * 3600 + minute * 60;

// Nodes A, B, C, D. Southbound has three patterns: North A-B-C, South B-C-D (starts at 0 miles), Full A-B-C-D.
const node = (id: string, name: string): Node => ({ ...metadata(at), id, scenarioId: 's', routeId: 'r', name, kind: 'timepoint' });
const nodes = [node('na', 'Alpha'), node('nb', 'Bravo'), node('nc', 'Charlie'), node('nd', 'Delta')];

const point = (id: string, nodeId: string, sequence: number, cumulativeMiles: number): PatternPoint => ({ id, nodeId, sequence, cumulativeMiles });
const pattern = (id: string, name: string, directionId: string, sequence: number, points: PatternPoint[]): RoutePattern =>
  ({ ...metadata(at), id, scenarioId: 's', routeId: 'r', name, directionId, sequence, points });
const north = pattern('pat-north', 'North', 'dir-south', 1, [point('n-a', 'na', 0, 0), point('n-b', 'nb', 1, 2), point('n-c', 'nc', 2, 5)]);
const south = pattern('pat-south', 'South', 'dir-south', 2, [point('s-b', 'nb', 0, 0), point('s-c', 'nc', 1, 3), point('s-d', 'nd', 2, 5)]);
const full = pattern('pat-full', 'Full', 'dir-south', 3, [point('f-a', 'na', 0, 0), point('f-b', 'nb', 1, 2), point('f-c', 'nc', 2, 5), point('f-d', 'nd', 3, 7)]);
const NORTH_POINTS = ['n-a', 'n-b', 'n-c'];
const SOUTH_POINTS = ['s-b', 's-c', 's-d'];
const FULL_POINTS = ['f-a', 'f-b', 'f-c', 'f-d'];

const directions: RouteDirection[] = [{ ...metadata(at), id: 'dir-south', scenarioId: 's', routeId: 'r', name: 'Southbound', sequence: 1, columns: [] }];

// Stop s1 (code 101) between A and B on North and Full; stop s2 (no code) between C and D on South and Full. A has stop ID 100 on North and Full.
const placement = (id: string, stopId: string, afterPatternPointId: string): PatternStopPlacement => ({ id, stopId, afterPatternPointId, sequence: 0, timing: 'interpolate' });
const stopSet = (): RouteStopSet => ({
  ...metadata(at), id: 'set', scenarioId: 's', routeId: 'r', roundingSeconds: 60,
  stops: [{ id: 's1', name: 'Stop One', stopCode: '101' }, { id: 's2', name: 'Stop Two' }],
  placementsByPatternId: {
    'pat-north': [placement('p1', 's1', 'n-a')],
    'pat-south': [placement('p2', 's2', 's-c')],
    'pat-full': [placement('p3', 's1', 'f-a'), placement('p4', 's2', 'f-c')],
  },
  timepointStopCodesByPatternId: { 'pat-north': { 'n-a': '100' }, 'pat-full': { 'f-a': '100' } },
});

const trip = (id: string, patternId: string, pointIds: string[], departure: number): Trip => ({
  ...metadata(at), id, scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', patternId,
  stopTimes: pointIds.map((patternPointId, sequence) => ({ patternPointId, sequence, time: departure + 600 * sequence })),
  provenance: { kind: 'generated', manuallyChangedFields: [] },
});
const baseTrips = (): Trip[] => [
  trip('tn1', 'pat-north', NORTH_POINTS, hm(4)),
  trip('tn2', 'pat-north', NORTH_POINTS, hm(4, 30)),
  trip('tn3', 'pat-north', NORTH_POINTS, hm(5)),
  trip('tn4', 'pat-north', NORTH_POINTS, hm(5, 15)),
  trip('tn5', 'pat-north', NORTH_POINTS, hm(6)),
  trip('tn6', 'pat-north', NORTH_POINTS, hm(6, 15)),
  trip('ts1', 'pat-south', SOUTH_POINTS, hm(5, 10)),
  trip('ts2', 'pat-south', SOUTH_POINTS, hm(5, 25)),
  trip('tf1', 'pat-full', FULL_POINTS, hm(9)),
];

const band = (id: string, label: string, startTime: number, endTime: number): RuntimeBand => ({ id, label, sequence: 1, startTime, endTime, segmentRuntimeSeconds: [] });
const bands = (): RuntimeBand[] => [band('early', 'Early', hm(4), hm(6)), band('peak', 'Peak', hm(6), hm(10))];
const runtimeProfiles = (): RuntimeProfile[] => ['pat-north', 'pat-south', 'pat-full'].map((patternId) => ({
  ...metadata(at), id: `prof-${patternId}`, scenarioId: 's', routeId: 'r', patternId, name: 'Profile', bands: bands(),
}));
const runtimeAssignments = (): RuntimeAssignment[] => ['pat-north', 'pat-south', 'pat-full'].map((patternId) => ({
  ...metadata(at), id: `asg-${patternId}`, scenarioId: 's', patternId, serviceDayId: 'weekday', runtimeProfileId: `prof-${patternId}`,
}));
const plan = (): PlannedFrequency => ({
  ...metadata(at), id: 'plan', scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', measureNodeIdByDirectionId: {},
  periods: [
    { id: 'pp1', startTime: hm(4), endTime: hm(5), headwaySeconds: 1800 },
    { id: 'pp2', startTime: hm(5), endTime: hm(10), headwaySeconds: 900 },
  ],
});

const baseInput = (overrides: Partial<StopScheduleInput> = {}): StopScheduleInput => ({
  directions, patterns: [north, south, full], nodes, set: stopSet(), trips: baseTrips(), runtimeProfiles: runtimeProfiles(),
  runtimeAssignments: runtimeAssignments(), plan: plan(), columnMode: 'sample', omitTimepointsWithoutStopId: false, ...overrides,
});
const southbound = (overrides: Partial<StopScheduleInput> = {}): StopScheduleDirection => buildStopSchedule(baseInput(overrides))[0];
const columnsOf = (dir: StopScheduleDirection, patternId: string): StopScheduleColumn[] => dir.columns.filter((column) => column.patternId === patternId);

describe('buildStopSchedule (Decision 0084, section 4.7)', () => {
  it('orders rows by the pattern with the most rows, keyed by stop ID, stop, or timepoint', () => {
    const dir = southbound();
    expect(dir.rows.map((row) => row.key)).toEqual(['code:100', 'code:101', 'node:nb', 'node:nc', 'stop:s2', 'node:nd']);
    expect(dir.rows.map((row) => row.name)).toEqual(['Alpha', 'Stop One', 'Bravo', 'Charlie', 'Stop Two', 'Delta']);
    expect(dir.orderConflict).toBe(false);
  });

  it('makes one sample column per period window on North, with headway, span, and band label', () => {
    const dir = southbound();
    const northColumns = columnsOf(dir, 'pat-north');
    expect(northColumns.map((column) => [column.startTime, column.endTime, column.label, column.headwaySeconds, column.tripCount])).toEqual([
      [hm(4), hm(5), 'Early', 1800, 2],
      [hm(5), hm(6), 'Early', 900, 2],
      [hm(6), hm(10), 'Peak', 900, 2],
    ]);
    expect(northColumns.map((column) => column.tripId)).toEqual(['tn1', 'tn3', 'tn5']);
    expect(northColumns[0].tripLabel).toBe('Trip 1');
    expect(northColumns[0].times.slice(4)).toEqual([null, null]);
  });

  it('makes no column for a window with no Trips (South has none before 5:00)', () => {
    const south = columnsOf(southbound(), 'pat-south');
    expect(south.map((column) => [column.startTime, column.endTime, column.label, column.tripCount])).toEqual([[hm(5), hm(6), 'Early', 2]]);
  });

  it('makes a column for a Trip before the first boundary, starting at its own departure', () => {
    const dir = southbound({ trips: [...baseTrips(), trip('tn0', 'pat-north', NORTH_POINTS, hm(3, 30))] });
    const first = columnsOf(dir, 'pat-north')[0];
    expect([first.tripId, first.startTime, first.endTime, first.label, first.tripCount]).toEqual(['tn0', hm(3, 30), hm(4), 'Service', 1]);
  });

  it('makes one "Service" column for the whole pattern with no plan and no runtime assignment', () => {
    const north = columnsOf(southbound({ plan: undefined, runtimeAssignments: [] }), 'pat-north');
    expect(north.map((column) => [column.label, column.tripCount, column.startTime, column.endTime])).toEqual([['Service', 6, hm(4), hm(6, 15)]]);
  });

  it('makes one column per Trip in every-trip mode, with the gap to the previous Trip as headway', () => {
    const north = columnsOf(southbound({ columnMode: 'all' }), 'pat-north');
    expect(north.map((column) => column.headwaySeconds)).toEqual([undefined, 1800, 1800, 900, 2700, 900]);
    expect(north.every((column) => column.tripCount === 1)).toBe(true);
    expect(north.map((column) => column.label)).toEqual(['Early', 'Early', 'Early', 'Early', 'Peak', 'Peak']);
    expect(north.map((column) => column.startTime)).toEqual(north.map((column) => column.endTime));
  });

  it('removes timepoints without a stop ID and keeps the times of the stops around them', () => {
    const omitted = southbound({ omitTimepointsWithoutStopId: true });
    expect(omitted.rows.map((row) => row.key)).toEqual(['code:100', 'code:101', 'stop:s2']);
    expect(columnsOf(omitted, 'pat-north').map((column) => column.times[1])).toEqual(columnsOf(southbound(), 'pat-north').map((column) => column.times[1]));
  });

  it('adds a repeated row again as a "~2" row, and reports the order conflict', () => {
    const turnback = pattern('pat-odd', 'Turnback', 'dir-south', 4, [point('o-c', 'nc', 0, 5), point('o-b', 'nb', 1, 2)]);
    const dir = southbound({ patterns: [north, south, full, turnback], trips: [...baseTrips(), trip('to1', 'pat-odd', ['o-c', 'o-b'], hm(7))] });
    expect(dir.orderConflict).toBe(true);
    expect(dir.rows.map((row) => row.key)).toEqual(['code:100', 'code:101', 'node:nb', 'node:nc', 'node:nb~2', 'stop:s2', 'node:nd']);
  });

  it('gives a distance only across a segment with no stops and above 0 miles', () => {
    const dir = southbound();
    const distanceOf = (key: string) => dir.rows.find((row) => row.key === key)?.distanceMiles;
    expect(distanceOf('node:nb')).toBe(3);
    expect(distanceOf('code:100')).toBeUndefined();
    expect(distanceOf('code:101')).toBeUndefined();
    expect(distanceOf('node:nd')).toBeUndefined();
  });

  it('uses the lower median of the gaps as the headway', () => {
    const headwayOf = (departures: number[]) => columnsOf(
      southbound({ plan: undefined, runtimeAssignments: [], patterns: [north], trips: departures.map((departure, index) => trip(`x${index}`, 'pat-north', NORTH_POINTS, departure)) }),
      'pat-north',
    )[0].headwaySeconds;
    expect(headwayOf([hm(4), hm(4, 15), hm(4, 30), hm(5)])).toBe(900);
    expect(headwayOf([hm(4), hm(4, 15), hm(4, 45)])).toBe(900);
  });

  it('leaves out a direction with no pattern that has a Trip', () => {
    const northbound: RouteDirection = { ...metadata(at), id: 'dir-north', scenarioId: 's', routeId: 'r', name: 'Northbound', sequence: 2, columns: [] };
    const idle = pattern('pat-idle', 'Idle', 'dir-north', 5, [point('i-a', 'na', 0, 0), point('i-b', 'nb', 1, 2)]);
    const result = buildStopSchedule(baseInput({ directions: [...directions, northbound], patterns: [north, south, full, idle] }));
    expect(result.map((dir) => dir.name)).toEqual(['Southbound']);
  });
});
