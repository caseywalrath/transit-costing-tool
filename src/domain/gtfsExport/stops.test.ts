import { describe, expect, it } from 'vitest';
import { exportStops } from './stops';
import type { ExportNodeInput, ExportPatternInput, ExportRouteInput, ExportStopInput } from './types';

const NODES: ExportNodeInput[] = [
  { id: 'n-alpha', name: 'Alpha' },
  { id: 'n-bravo', name: 'Bravo' },
  { id: 'n-charlie', name: 'Charlie' },
];

/** Route T1 of tests/fixtures/gtfs-export/README.md. The outbound pattern places "Main & 1st". */
function fixtureRoute(): ExportRouteInput {
  return {
    id: 'route-t1',
    name: 'Test Line',
    routeId: 'T1',
    routeStops: [{ id: 'rs-main', name: 'Main & 1st', latitude: 39.709, longitude: -105 }],
    patterns: [
      {
        id: 'pat-ac',
        name: 'A-C',
        direction: 'outbound',
        routeStopIds: ['rs-main'],
        points: [
          { id: 'pp-ac-alpha', nodeId: 'n-alpha', sequence: 1, stopCode: '1001', latitude: 39.7, longitude: -105 },
          { id: 'pp-ac-bravo', nodeId: 'n-bravo', sequence: 2, stopCode: '1002', latitude: 39.718, longitude: -105 },
          { id: 'pp-ac-charlie', nodeId: 'n-charlie', sequence: 3, stopCode: '1003', latitude: 39.745, longitude: -105 },
        ],
      },
      {
        id: 'pat-ca',
        name: 'C-A',
        direction: 'inbound',
        routeStopIds: [],
        points: [
          { id: 'pp-ca-charlie', nodeId: 'n-charlie', sequence: 1, stopCode: '1003', latitude: 39.745, longitude: -105 },
          { id: 'pp-ca-bravo', nodeId: 'n-bravo', sequence: 2, stopCode: '2002', latitude: 39.7181, longitude: -105.0001 },
          { id: 'pp-ca-alpha', nodeId: 'n-alpha', sequence: 3, stopCode: '1001', latitude: 39.7, longitude: -105 },
        ],
      },
    ],
  };
}

function routeWith(id: string, routeId: string, patterns: ExportPatternInput[]): ExportRouteInput {
  return { id, name: `Route ${routeId}`, routeId, routeStops: [], patterns };
}

/** An outbound pattern with one point and no placed Route stops. `latitude` undefined makes the point unlocated. */
function onePoint(
  patternId: string,
  pointId: string,
  nodeId: string,
  stopCode: string | undefined,
  latitude: number | undefined,
  longitude = -105,
): ExportPatternInput {
  return {
    id: patternId,
    name: patternId,
    direction: 'outbound',
    routeStopIds: [],
    points: [{ id: pointId, nodeId, sequence: 1, stopCode, latitude, longitude }],
  };
}

/** A latitude `meters` north of `latitude`. Moving straight north, the great-circle distance equals the move. */
function north(latitude: number, meters: number): number {
  return latitude + (meters / 1609.344 / 3958.8) * (180 / Math.PI);
}

function inputOf(routes: ExportRouteInput[], nodes: ExportNodeInput[] = NODES): ExportStopInput {
  return { routes, nodes };
}

const FIXTURE_STOP_IDS = ['1001', '1002', '1003', '2002', 'T1-1'];

describe('exportStops: fixture Scenario', () => {
  it('builds the five stops, one generated-ID warning and the stop maps', () => {
    const result = exportStops(inputOf([fixtureRoute()]));

    expect(result.refusals).toEqual([]);
    expect(result.stops).toEqual([
      { stopId: '1001', name: 'Alpha', latitude: 39.7, longitude: -105 },
      { stopId: '1002', name: 'Bravo', latitude: 39.718, longitude: -105 },
      { stopId: '1003', name: 'Charlie', latitude: 39.745, longitude: -105 },
      { stopId: '2002', name: 'Bravo', latitude: 39.7181, longitude: -105.0001 },
      { stopId: 'T1-1', name: 'Main & 1st', latitude: 39.709, longitude: -105 },
    ]);
    expect(result.warnings).toEqual([
      { code: 'gtfsExport.stopIdGenerated', routeId: 'route-t1', routeName: 'Test Line', stopName: 'Main & 1st', stopId: 'T1-1' },
    ]);
    expect(result.byRouteStop).toEqual(new Map([['route-t1', new Map([['rs-main', 'T1-1']])]]));
    expect(result.byTimepoint).toEqual(
      new Map([
        ['pat-ac', new Map([['pp-ac-alpha', '1001'], ['pp-ac-bravo', '1002'], ['pp-ac-charlie', '1003']])],
        ['pat-ca', new Map([['pp-ca-charlie', '1003'], ['pp-ca-bravo', '2002'], ['pp-ca-alpha', '1001']])],
      ]),
    );
  });
});

describe('exportStops: same stop ID (Decision 0090 item 5)', () => {
  it('merges a same-ID record 20 m away and keeps the first record\'s name and location', () => {
    const second = routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-charlie', '1001', north(39.7, 20))]);
    const result = exportStops(inputOf([fixtureRoute(), second]));

    expect(result.refusals).toEqual([]);
    expect(result.stops.map((stop) => stop.stopId)).toEqual(FIXTURE_STOP_IDS);
    expect(result.stops.find((stop) => stop.stopId === '1001')).toEqual({ stopId: '1001', name: 'Alpha', latitude: 39.7, longitude: -105 });
    expect(result.byTimepoint.get('pat-t2')?.get('pp-t2')).toBe('1001');
  });

  it('gives two Routes that share stop 1001 at one place one stop record', () => {
    const second = routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-alpha', '1001', 39.7)]);
    const result = exportStops(inputOf([fixtureRoute(), second]));

    expect(result.refusals).toEqual([]);
    expect(result.stops.map((stop) => stop.stopId)).toEqual(FIXTURE_STOP_IDS);
    expect(result.byTimepoint.get('pat-t2')?.get('pp-t2')).toBe('1001');
  });

  it('refuses a same-ID record 40 m away and gives the Route, pattern and distance', () => {
    const second = routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-alpha', '1001', north(39.7, 40))]);
    const result = exportStops(inputOf([fixtureRoute(), second]));

    expect(result.refusals).toMatchObject([
      { code: 'gtfsExport.stopIdConflict', routeId: 'route-t2', patternId: 'pat-t2', stopName: 'Alpha', stopId: '1001' },
    ]);
    expect(result.refusals[0].distanceMeters).toBeCloseTo(40, 3);
    expect(result.stops.find((stop) => stop.stopId === '1001')?.latitude).toBe(39.7);
  });

  it('merges within 30 m and refuses beyond it', () => {
    const within = exportStops(inputOf([fixtureRoute(), routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-alpha', '1001', north(39.7, 29))])]));
    const beyond = exportStops(inputOf([fixtureRoute(), routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-alpha', '1001', north(39.7, 31))])]));

    expect(within.refusals).toEqual([]);
    expect(beyond.refusals).toMatchObject([{ code: 'gtfsExport.stopIdConflict', stopId: '1001' }]);
  });

  it('compares each record with the stop\'s first record, not with the previous one', () => {
    // 20 m from the first record merges. 40 m from the first is refused, although it is only 20 m from the merged record.
    const result = exportStops(
      inputOf([
        fixtureRoute(),
        routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-alpha', '1001', north(39.7, 20))]),
        routeWith('route-t3', 'T3', [onePoint('pat-t3', 'pp-t3', 'n-alpha', '1001', north(39.7, 40))]),
      ]),
    );

    expect(result.refusals).toMatchObject([{ code: 'gtfsExport.stopIdConflict', routeId: 'route-t3', patternId: 'pat-t3', stopId: '1001' }]);
  });

  it('makes a Route stop and a timepoint with one ID a single stop, named by the Route stop', () => {
    const route = fixtureRoute();
    route.routeStops.push({ id: 'rs-bravo', name: 'Bravo platform', stopCode: '1002', latitude: 39.718, longitude: -105 });
    route.patterns[0].routeStopIds.push('rs-bravo');
    const result = exportStops(inputOf([route]));

    expect(result.refusals).toEqual([]);
    expect(result.stops.map((stop) => stop.stopId)).toEqual(FIXTURE_STOP_IDS);
    expect(result.stops.find((stop) => stop.stopId === '1002')?.name).toBe('Bravo platform');
    expect(result.byRouteStop.get('route-t1')?.get('rs-bravo')).toBe('1002');
    expect(result.byTimepoint.get('pat-ac')?.get('pp-ac-bravo')).toBe('1002');
  });
});

describe('exportStops: generated stop IDs (Decision 0090 item 6)', () => {
  it('trims entered IDs and numbers the placed Route stops without one in stop order', () => {
    const route = fixtureRoute();
    route.routeStops = [
      { id: 'rs-a', name: 'Padded', stopCode: ' 5001 ', latitude: 39.71, longitude: -105 },
      { id: 'rs-b', name: 'Unnamed one', stopCode: undefined, latitude: 39.72, longitude: -105 },
      { id: 'rs-c', name: 'Blank', stopCode: '   ', latitude: 39.73, longitude: -105 },
    ];
    route.patterns[0].routeStopIds = ['rs-a', 'rs-b', 'rs-c'];
    const result = exportStops(inputOf([route]));

    expect(result.refusals).toEqual([]);
    expect(result.byRouteStop.get('route-t1')).toEqual(
      new Map([
        ['rs-a', '5001'],
        ['rs-b', 'T1-1'],
        ['rs-c', 'T1-2'],
      ]),
    );
    expect(result.stops.map((stop) => stop.stopId)).toEqual(['1001', '1002', '1003', '2002', '5001', 'T1-1', 'T1-2']);
    expect(result.warnings.map((warning) => warning.stopId)).toEqual(['T1-1', 'T1-2']);
  });

  it('numbers a Route stop without an ID among all such stops, placed or not', () => {
    // Choice made here: the number counts every Route stop without an ID, so an exported stop keeps its ID when another placement changes.
    const route = routeWith('route-t1', 'T1', [onePoint('pat-1', 'pp-1', 'n-alpha', '1001', 39.7)]);
    route.routeStops = [
      { id: 'rs-u', name: 'Not placed', latitude: 39.71, longitude: -105 },
      { id: 'rs-p', name: 'Placed', latitude: 39.72, longitude: -105 },
    ];
    route.patterns[0].routeStopIds = ['rs-p'];
    const result = exportStops(inputOf([route]));

    expect(result.byRouteStop.get('route-t1')).toEqual(new Map([['rs-p', 'T1-2']]));
    expect(result.warnings.map((warning) => warning.stopId)).toEqual(['T1-2']);
  });

  it('gives a timepoint without an ID its Node\'s short name and direction, and keeps the two sides apart', () => {
    const route = fixtureRoute();
    route.patterns[0].points[1].stopCode = undefined;
    route.patterns[1].points[1].stopCode = undefined;
    const nodes = NODES.map((node) => (node.id === 'n-bravo' ? { ...node, shortName: 'BRV' } : node));
    const result = exportStops(inputOf([route], nodes));

    expect(result.refusals).toEqual([]);
    expect(result.stops.map((stop) => stop.stopId)).toEqual(['1001', '1003', 'T1-1', 'T1-BRV-0', 'T1-BRV-1']);
    expect(result.stops.find((stop) => stop.stopId === 'T1-BRV-0')).toEqual({ stopId: 'T1-BRV-0', name: 'Bravo', latitude: 39.718, longitude: -105 });
    expect(result.byTimepoint.get('pat-ac')?.get('pp-ac-bravo')).toBe('T1-BRV-0');
    expect(result.byTimepoint.get('pat-ca')?.get('pp-ca-bravo')).toBe('T1-BRV-1');
    expect(result.warnings.map((warning) => warning.stopId)).toEqual(['T1-1', 'T1-BRV-0', 'T1-BRV-1']);
  });

  it('merges a generated timepoint ID shared by two patterns of one direction at one Node within 30 m', () => {
    const route = routeWith('route-t1', 'T1', [
      onePoint('pat-1', 'pp-1', 'n-bravo', undefined, 39.718),
      onePoint('pat-2', 'pp-2', 'n-bravo', undefined, north(39.718, 20)),
    ]);
    const result = exportStops(inputOf([route]));

    expect(result.refusals).toEqual([]);
    expect(result.stops).toEqual([{ stopId: 'T1-Bravo-0', name: 'Bravo', latitude: 39.718, longitude: -105 }]);
    expect(result.byTimepoint.get('pat-1')?.get('pp-1')).toBe('T1-Bravo-0');
    expect(result.byTimepoint.get('pat-2')?.get('pp-2')).toBe('T1-Bravo-0');
  });

  it('refuses a generated timepoint ID shared by two patterns more than 30 m apart', () => {
    const route = routeWith('route-t1', 'T1', [
      onePoint('pat-1', 'pp-1', 'n-bravo', undefined, 39.718),
      onePoint('pat-2', 'pp-2', 'n-bravo', undefined, north(39.718, 40)),
    ]);
    const result = exportStops(inputOf([route]));

    expect(result.refusals).toMatchObject([{ code: 'gtfsExport.stopIdConflict', routeId: 'route-t1', patternId: 'pat-2', stopId: 'T1-Bravo-0' }]);
    // The refusal also names the first record, which gives the stop its location.
    expect(result.refusals[0].conflictWith).toEqual({ routeId: 'route-t1', routeName: expect.any(String), patternId: 'pat-1', patternName: expect.any(String), stopName: 'Bravo' });
    expect(result.refusals[0].distanceMeters).toBeCloseTo(40, 3);
    expect(result.stops.map((stop) => stop.stopId)).toEqual(['T1-Bravo-0']);
  });

  it('makes the generated ID of a second Node with one name unique, however close', () => {
    const route = routeWith('route-t1', 'T1', [
      onePoint('pat-1', 'pp-1', 'n-bravo', undefined, 39.718),
      onePoint('pat-2', 'pp-2', 'n-bravo-2', undefined, 39.718),
    ]);
    const result = exportStops(inputOf([route], [...NODES, { id: 'n-bravo-2', name: 'Bravo' }]));

    expect(result.refusals).toEqual([]);
    expect(result.byTimepoint.get('pat-1')?.get('pp-1')).toBe('T1-Bravo-0');
    expect(result.byTimepoint.get('pat-2')?.get('pp-2')).toBe('T1-Bravo-0-2');
    expect(result.stops.map((stop) => stop.stopId)).toEqual(['T1-Bravo-0', 'T1-Bravo-0-2']);
  });

  it('never merges a generated Route stop ID with an entered ID: the generated one gets a suffix', () => {
    const route = routeWith('route-t1', 'T1', [onePoint('pat-1', 'pp-1', 'n-alpha', 'T1-1', 39.709)]);
    route.routeStops = [{ id: 'rs-g', name: 'Unnamed stop', latitude: 39.709, longitude: -105 }];
    route.patterns[0].routeStopIds = ['rs-g'];
    const result = exportStops(inputOf([route]));

    expect(result.refusals).toEqual([]);
    expect(result.byTimepoint.get('pat-1')?.get('pp-1')).toBe('T1-1');
    expect(result.byRouteStop.get('route-t1')?.get('rs-g')).toBe('T1-1-2');
    expect(result.stops.map((stop) => stop.stopId)).toEqual(['T1-1', 'T1-1-2']);
  });

  it('keeps generated IDs of different Routes apart (Route "R" stop 2-1 and Route "R-2" stop 1) and is stable', () => {
    const build = () => {
      const first = routeWith('route-a', 'R', [onePoint('pat-a', 'pp-a', 'n-alpha', '1001', 39.7)]);
      first.routeStops = [1, 2].map((n) => ({ id: `a${n}`, name: `A${n}`, latitude: 39.7 + n / 100, longitude: -105 }));
      first.patterns[0].routeStopIds = ['a1', 'a2'];
      const second = routeWith('route-b', 'R-2', [onePoint('pat-b', 'pp-b', 'n-alpha', '1001', 39.7)]);
      second.routeStops = [{ id: 'b1', name: 'B1', latitude: 39.8, longitude: -105 }];
      second.patterns[0].routeStopIds = ['b1'];
      return exportStops(inputOf([first, second]));
    };
    const result = build();

    expect(result.refusals).toEqual([]);
    expect(result.byRouteStop.get('route-a')).toEqual(new Map([['a1', 'R-1'], ['a2', 'R-2']]));
    expect(result.byRouteStop.get('route-b')).toEqual(new Map([['b1', 'R-2-1']]));
    expect(new Set(result.stops.map((stop) => stop.stopId)).size).toBe(result.stops.length);
    expect(build()).toEqual(result);

    // A Route stop of Route "R" that is generated 'R-2-1' would collide with Route "R-2" stop 1.
    const third = routeWith('route-a', 'R', [onePoint('pat-a', 'pp-a', 'n-alpha', 'R-2-1', 39.7)]);
    const fourth = routeWith('route-b', 'R-2', []);
    fourth.routeStops = [{ id: 'b1', name: 'B1', latitude: 39.8, longitude: -105 }];
    fourth.patterns = [{ ...onePoint('pat-b', 'pp-b', 'n-alpha', '1001', 39.7), routeStopIds: ['b1'] }];
    const collided = exportStops(inputOf([third, fourth]));
    expect(collided.byRouteStop.get('route-b')?.get('b1')).toBe('R-2-1-2');
  });

  it('writes a suffixed ID for two generated IDs that are equal, and keeps merging only one Route, Node and direction', () => {
    const route = routeWith('route-t1', 'T1', [
      onePoint('pat-1', 'pp-1', 'n-bravo', undefined, 39.718),
      onePoint('pat-2', 'pp-2', 'n-bravo', undefined, north(39.718, 20)),
      onePoint('pat-3', 'pp-3', 'n-bravo-2', undefined, 39.718),
    ]);
    const result = exportStops(inputOf([route], [...NODES, { id: 'n-bravo-2', name: 'Bravo' }]));

    expect(result.byTimepoint.get('pat-1')?.get('pp-1')).toBe('T1-Bravo-0');
    expect(result.byTimepoint.get('pat-2')?.get('pp-2')).toBe('T1-Bravo-0');
    expect(result.byTimepoint.get('pat-3')?.get('pp-3')).toBe('T1-Bravo-0-2');
    expect(result.stops).toHaveLength(2);
  });

  it('warns once per distinct generated stop ID, not once per record', () => {
    const route = routeWith('route-t1', 'T1', [
      onePoint('pat-1', 'pp-1', 'n-bravo', undefined, 39.718),
      onePoint('pat-2', 'pp-2', 'n-bravo', undefined, north(39.718, 20)),
    ]);
    const result = exportStops(inputOf([route]));

    expect(result.warnings.filter((warning) => warning.code === 'gtfsExport.stopIdGenerated').map((warning) => warning.stopId)).toEqual(['T1-Bravo-0']);
  });
});

describe('exportStops: placement and unlocated stops (Decision 0090 item 7)', () => {
  it('skips a Route stop that no exported pattern places, even without a location', () => {
    const route = routeWith('route-t1', 'T1', [onePoint('pat-1', 'pp-1', 'n-alpha', '1001', 39.7)]);
    route.routeStops = [
      { id: 'rs-u', name: 'Not placed', stopCode: '9100' },
      { id: 'rs-v', name: 'Not placed either' },
    ];
    const result = exportStops(inputOf([route]));

    expect(result.refusals).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.stops.map((stop) => stop.stopId)).toEqual(['1001']);
    expect(result.byRouteStop.get('route-t1')).toEqual(new Map());
  });

  it('refuses an unlocated Route stop that a pattern places, with its Route and stop ID, and makes no stop of it', () => {
    const route = routeWith('route-t1', 'T1', [onePoint('pat-1', 'pp-1', 'n-alpha', '1001', 39.7)]);
    route.routeStops = [{ id: 'rs-x', name: 'Mystery stop', stopCode: '9001' }];
    route.patterns[0].routeStopIds = ['rs-x'];
    const result = exportStops(inputOf([route]));

    expect(result.refusals).toMatchObject([
      { code: 'gtfsExport.stopUnlocated', routeId: 'route-t1', routeName: 'Route T1', stopName: 'Mystery stop', stopId: '9001' },
    ]);
    expect(result.refusals[0].patternId).toBeUndefined();
    expect(result.stops.map((stop) => stop.stopId)).toEqual(['1001']);
    expect(result.byRouteStop.get('route-t1')?.get('rs-x')).toBe('9001');
  });

  it('refuses an unlocated timepoint with its Route and pattern', () => {
    const result = exportStops(inputOf([fixtureRoute(), routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-charlie', '9002', undefined)])]));

    expect(result.refusals).toMatchObject([
      { code: 'gtfsExport.stopUnlocated', routeId: 'route-t2', patternId: 'pat-t2', patternName: 'pat-t2', stopName: 'Charlie', stopId: '9002' },
    ]);
    expect(result.stops.map((stop) => stop.stopId)).toEqual(FIXTURE_STOP_IDS);
  });
});

describe('exportStops: timepoint stop names (Decision 0092)', () => {
  const nameDiffers = (result: ReturnType<typeof exportStops>) => result.warnings.filter((warning) => warning.code === 'gtfsExport.stopNameDiffers');

  it('exports a named timepoint under its stored name, and an unnamed or blank one under its Node name', () => {
    const route = fixtureRoute();
    // pp-ac-alpha and pp-ca-alpha share stop 1001; both carry the name, so the merged stop has no conflict.
    route.patterns[0].points[0].stopName = 'Alpha Gate 1';
    route.patterns[1].points[2].stopName = 'Alpha Gate 1';
    route.patterns[0].points[1].stopName = '   ';
    const result = exportStops(inputOf([route]));

    expect(result.refusals).toEqual([]);
    expect(result.stops.find((stop) => stop.stopId === '1001')?.name).toBe('Alpha Gate 1');
    expect(result.stops.find((stop) => stop.stopId === '1002')?.name).toBe('Bravo');
    expect(result.stops.find((stop) => stop.stopId === '1003')?.name).toBe('Charlie');
    expect(nameDiffers(result)).toEqual([]);
  });

  it('warns once per stop ID for the first merged record whose stop name differs, and keeps the first record\'s name', () => {
    // 1001 is shared by pat-ac (named "Alpha Gate 1"), pat-ca (no name, so "Alpha") and route T2 (named "Alpha Gate 2", 20 m away).
    const route = fixtureRoute();
    route.patterns[0].points[0].stopName = 'Alpha Gate 1';
    const second = routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-alpha', '1001', north(39.7, 20))]);
    second.patterns[0].points[0].stopName = 'Alpha Gate 2';
    const result = exportStops(inputOf([route, second]));

    expect(result.refusals).toEqual([]);
    expect(result.stops.find((stop) => stop.stopId === '1001')?.name).toBe('Alpha Gate 1');
    expect(nameDiffers(result)).toEqual([
      { code: 'gtfsExport.stopNameDiffers', routeId: 'route-t1', routeName: 'Test Line', patternId: 'pat-ca', patternName: 'C-A', stopName: 'Alpha', stopId: '1001' },
    ]);
  });

  it('does not compare a refused record, so a 40 m record with another name gives a conflict and no name warning', () => {
    const second = routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-alpha', '1001', north(39.7, 40))]);
    second.patterns[0].points[0].stopName = 'Alpha Gate 2';
    const result = exportStops(inputOf([fixtureRoute(), second]));

    expect(result.refusals).toMatchObject([{ code: 'gtfsExport.stopIdConflict', routeId: 'route-t2', stopId: '1001' }]);
    expect(nameDiffers(result)).toEqual([]);
  });

  it('gives no name warning when merged records have equal stop names', () => {
    const route = fixtureRoute();
    route.patterns[0].points[0].stopName = 'Alpha';
    const second = routeWith('route-t2', 'T2', [onePoint('pat-t2', 'pp-t2', 'n-alpha', '1001', north(39.7, 20))]);
    second.patterns[0].points[0].stopName = 'Alpha';
    expect(nameDiffers(exportStops(inputOf([route, second])))).toEqual([]);
  });
});
