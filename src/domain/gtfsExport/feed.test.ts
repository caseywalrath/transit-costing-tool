import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildGtfsExport, type BuildGtfsExportInput } from './feed';
import { at, miniInput } from './miniScenarioFixture';

const EXPECTED_DIR = fileURLToPath(new URL('../../../tests/fixtures/gtfs-export/mini-export/', import.meta.url));
const META = { createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' };

/** Decision 0090 item 4: the order in which the files are written. */
const FILE_ORDER = [
  'agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt', 'shapes.txt', 'feed_info.txt',
];

/** A file's rows as cells. The fixtures hold no quoted cells, so a plain split is exact. */
function rowsOf(text: string): string[][] {
  return text.trimEnd().split('\n').map((line) => line.split(','));
}

function fileText(result: ReturnType<typeof buildGtfsExport>, name: string): string {
  const file = result.files.find((candidate) => candidate.name === name);
  if (file === undefined) throw new Error(`no file ${name}`);
  return file.text;
}

describe('buildGtfsExport: the README Scenario (tests/fixtures/gtfs-export)', () => {
  it('writes each file byte for byte as in mini-export/, in Decision 0090 item 4 order', () => {
    const result = buildGtfsExport(miniInput());

    expect(result.refusals).toEqual([]);
    expect(result.files.map((file) => file.name)).toEqual(FILE_ORDER);
    expect([...result.files.map((file) => file.name)].sort()).toEqual(readdirSync(EXPECTED_DIR).sort());
    for (const file of result.files) {
      expect(file.text, file.name).toBe(readFileSync(`${EXPECTED_DIR}${file.name}`, 'utf8'));
    }
  });

  it('warns only about the generated stop ID T1-1 ("Main & 1st" has no stop ID)', () => {
    const result = buildGtfsExport(miniInput());

    expect(result.warnings).toEqual([
      { code: 'gtfsExport.stopIdGenerated', routeId: 'route-t1', routeName: 'Test Line', stopName: 'Main & 1st', stopId: 'T1-1' },
    ]);
  });

  it('reports trips, running hours and the dates of the range per service day, and the directions and shapes', () => {
    const result = buildGtfsExport(miniInput());
    const days = result.report.filter((row) => row.kind === 'serviceDay');

    expect(days.map((row) => [row.serviceId, row.trips, row.datesInRange, row.scenarioAnnualServiceDays])).toEqual([
      ['HOL', 1, 1, 9],
      ['SAT', 1, 4, 52],
      ['WKD', 3, 19, 260],
    ]);
    expect(days.find((row) => row.serviceId === 'WKD')?.runningHours).toBeCloseTo(1.25, 10);
    expect(result.report.filter((row) => row.kind === 'pattern').map((row) => [row.patternName, row.directionId, row.shapeId])).toEqual([
      ['Alpha to Charlie', 0, 'T1-A-C'],
      ['Charlie to Alpha', 1, 'T1-C-A'],
    ]);
  });
});

describe('buildGtfsExport: refusals (Decision 0090 item 19) write nothing', () => {
  it('refuses a pattern whose direction has no Outbound or Inbound group (gtfsExport.directionUnassigned)', () => {
    const input = miniInput();
    input.routes[0].directions = (input.routes[0].directions ?? []).map((direction) => (direction.group === 'inbound' ? { ...direction, group: undefined } : direction));

    const result = buildGtfsExport(input);

    expect(result.refusals).toEqual([
      { code: 'gtfsExport.directionUnassigned', routeId: 'route-t1', routeName: 'Test Line', patternId: 'pattern-ca', patternName: 'Charlie to Alpha' },
    ]);
    expect(result.files).toEqual([]);
    expect(result.report).toEqual([]);
  });

  it('refuses a Trip with a missing timepoint time and names the Trip (gtfsExport.tripTimeMissing)', () => {
    const input = miniInput();
    const trip = input.trips.find((candidate) => candidate.id === 'trip-wkd-0600');
    if (trip === undefined) throw new Error('fixture trip missing');
    trip.stopTimes = trip.stopTimes.filter((point) => point.patternPointId !== 'pp-ac-bravo');

    const result = buildGtfsExport(input);

    expect(result.refusals.map((issue) => [issue.code, issue.tripId])).toEqual([['gtfsExport.tripTimeMissing', 'trip-wkd-0600']]);
    expect(result.files).toEqual([]);
  });

  it('refuses a Route stop without a location (gtfsExport.stopUnlocated, from E1)', () => {
    const input = miniInput();
    input.routeStopSets[0].stops[0] = { ...input.routeStopSets[0].stops[0], latitude: undefined, longitude: undefined };

    const result = buildGtfsExport(input);

    expect(result.refusals).toEqual([
      { code: 'gtfsExport.stopUnlocated', routeId: 'route-t1', routeName: 'Test Line', stopName: 'Main & 1st', stopId: 'T1-1' },
    ]);
    expect(result.files).toEqual([]);
  });

  it.each([
    ['agencyName', 'gtfsExport.agencyNameBlank'],
    ['agencyUrl', 'gtfsExport.agencyUrlBlank'],
    ['agencyTimezone', 'gtfsExport.agencyTimezoneBlank'],
  ] as const)('refuses a blank %s (%s)', (field, code) => {
    const input = miniInput();
    input.settings[field] = '  ';

    const result = buildGtfsExport(input);

    expect(result.refusals.map((issue) => issue.code)).toEqual([code]);
    expect(result.files).toEqual([]);
  });

  it.each([
    ['an end before the start', { endDate: '2027-01-03' }],
    ['a start that is not a date', { startDate: '2027-02-30' }],
  ])('refuses a range with no dates: %s (gtfsExport.rangeEmpty)', (_label, change) => {
    const input = miniInput();
    input.settings = { ...input.settings, ...change };

    const result = buildGtfsExport(input);

    expect(result.refusals.map((issue) => issue.code)).toEqual(['gtfsExport.rangeEmpty']);
    expect(result.files).toEqual([]);
  });
});

describe('buildGtfsExport: skipped records and warnings (Decision 0090 items 2, 15 and 20)', () => {
  it('skips a Route with no Trips in the profile and lists it (gtfsExport.routeSkipped)', () => {
    const input = miniInput();
    input.routes.push({
      route: { id: 'route-idle', scenarioId: 'scenario-mini', name: 'Idle Line', ...META },
      nodes: [],
      patterns: [],
      directions: [],
    });

    const result = buildGtfsExport(input);

    expect(result.warnings).toContainEqual({ code: 'gtfsExport.routeSkipped', routeId: 'route-idle', routeName: 'Idle Line' });
    expect(fileText(result, 'routes.txt')).not.toContain('Idle Line');
  });

  it('leaves a service day with no Trips out of calendar.txt and lists it (gtfsExport.daySkipped)', () => {
    const input = miniInput();
    input.serviceDays.push({ id: 'day-sun', scenarioId: 'scenario-mini', kind: 'sunday', name: 'Sunday', annualServiceDays: 52, sequence: 2, abbreviation: 'SUN', ...META });

    const result = buildGtfsExport(input);

    expect(result.warnings).toContainEqual({ code: 'gtfsExport.daySkipped', serviceDayId: 'day-sun', serviceDayName: 'Sunday' });
    expect(fileText(result, 'calendar.txt')).not.toContain('SUN');
  });

  it('exports a Route on its own counts on the Scenario calendar and warns (gtfsExport.ownCountsNotExpressed)', () => {
    const input = miniInput();
    input.routes[0].route = { ...input.routes[0].route, ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'day-wkd': 120 } } };

    const result = buildGtfsExport(input);

    expect(result.warnings).toContainEqual({ code: 'gtfsExport.ownCountsNotExpressed', routeId: 'route-t1', routeName: 'Test Line' });
    expect(result.files.map((file) => file.name)).toEqual(FILE_ORDER);
    expect(fileText(result, 'trips.txt')).toContain('T1-WKD-0-0600-1');
  });

  it('keeps the block_id of a selected Trip whose block also serves an unselected Route, and warns (gtfsExport.blockServesUnselectedRoute)', () => {
    const input = miniInput();
    input.trips.push({
      id: 'trip-other-0700', scenarioId: 'scenario-mini', routeId: 'route-other', serviceDayId: 'day-wkd', patternId: 'pattern-other',
      tripProfileId: 'profile-base', stopTimes: [], provenance: { kind: 'manual', manuallyChangedFields: [] }, ...META,
    });
    input.blocks = (input.blocks ?? []).map((block) => ({
      ...block,
      activities: [...block.activities, { id: 'activity-3', type: 'revenueTrip' as const, sequence: 3, tripId: 'trip-other-0700' }],
    }));
    input.unselectedRoutes = [{ id: 'route-other', scenarioId: 'scenario-mini', name: 'Other Line', ...META }];

    const result = buildGtfsExport(input);

    expect(result.warnings).toContainEqual({ code: 'gtfsExport.blockServesUnselectedRoute', blockLabel: '1', routeId: 'route-other', routeName: 'Other Line' });
    expect(rowsOf(fileText(result, 'trips.txt')).find((row) => row[2] === 'T1-WKD-0-0600-1')?.[5]).toBe('1');
  });
});

describe('buildGtfsExport: feed details (Decision 0090 items 9 to 12, 17 and 18)', () => {
  it('writes a time past 24:00 as HH:MM:SS with the hours kept, and the trip ID with them (HHMM)', () => {
    const input = miniInput();
    const trip = input.trips.find((candidate) => candidate.id === 'trip-hol-0900');
    if (trip === undefined) throw new Error('fixture trip missing');
    trip.stopTimes = [
      { ...trip.stopTimes[0], time: at(24, 30) },
      { ...trip.stopTimes[1], time: at(24, 40) },
      { ...trip.stopTimes[2], time: at(24, 55) },
    ];

    const result = buildGtfsExport(input);

    expect(result.refusals).toEqual([]);
    expect(fileText(result, 'trips.txt')).toContain('T1-HOL-0-2430-1');
    expect(fileText(result, 'stop_times.txt')).toContain('T1-HOL-0-2430-1,24:30:00,24:30:00,1001,1,1,0.000');
  });

  it('writes arrival equal to departure on every stop time (the model stores no dwell)', () => {
    const result = buildGtfsExport(miniInput());

    const rows = rowsOf(fileText(result, 'stop_times.txt')).slice(1);
    expect(rows.length).toBe(19);
    for (const row of rows) expect(row[1], row.join(',')).toBe(row[2]);
  });

  it('numbers trips that share a first departure HHMM in departure order (G-E8)', () => {
    const input = miniInput();
    const first = input.trips.find((candidate) => candidate.id === 'trip-wkd-0600');
    if (first === undefined) throw new Error('fixture trip missing');
    input.trips.push({
      ...first,
      id: 'trip-wkd-0600-half',
      stopTimes: first.stopTimes.map((point) => ({ ...point, time: point.time + 30 })),
    });

    const result = buildGtfsExport(input);

    expect(rowsOf(fileText(result, 'trips.txt')).slice(1).map((row) => row[2])).toEqual([
      'T1-HOL-0-0900-1',
      'T1-SAT-0-0800-1',
      'T1-WKD-0-0600-1',
      'T1-WKD-0-0600-2',
      'T1-WKD-0-0630-1',
      'T1-WKD-1-0700-1',
    ]);
  });

  it('writes no shapes.txt and no shape_id column when the map lines are none', () => {
    const input = miniInput();
    input.settings.mapLines = 'none';

    const result = buildGtfsExport(input);

    expect(result.files.map((file) => file.name)).not.toContain('shapes.txt');
    expect(fileText(result, 'trips.txt').split('\n')[0]).toBe('route_id,service_id,trip_id,trip_headsign,direction_id,block_id');
    expect(result.report.find((row) => row.kind === 'pattern')).toMatchObject({ shapeId: undefined });
  });

  it('writes route_color only when a Route has a colour, as six hex digits', () => {
    const input = miniInput();
    input.routes[0].route = { ...input.routes[0].route, color: 'D62828' };

    const routes = rowsOf(fileText(buildGtfsExport(input), 'routes.txt'));

    expect(routes[0]).toEqual(['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type', 'route_color']);
    expect(routes[1]).toEqual(['T1', 'agency', 'T1', 'Test Line', '3', 'D62828']);
  });

  it('gives a second Route with the same short name a route_id with -2 and notes it', () => {
    const input = miniInput();
    input.routes.push({
      route: { id: 'route-x', scenarioId: 'scenario-mini', name: 'Second Line', shortName: 'T1', ...META },
      nodes: [
        { id: 'node-x1', scenarioId: 'scenario-mini', routeId: 'route-x', name: 'X One', kind: 'terminal', ...META },
        { id: 'node-x2', scenarioId: 'scenario-mini', routeId: 'route-x', name: 'X Two', kind: 'terminal', ...META },
      ],
      patterns: [{
        id: 'pattern-x', scenarioId: 'scenario-mini', routeId: 'route-x', name: 'X out', directionId: 'direction-x', directionLabel: 'X', sequence: 1,
        points: [{ id: 'pp-x1', nodeId: 'node-x1', sequence: 1, cumulativeMiles: 0 }, { id: 'pp-x2', nodeId: 'node-x2', sequence: 2, cumulativeMiles: 1 }],
        ...META,
      }],
      directions: [{ id: 'direction-x', scenarioId: 'scenario-mini', routeId: 'route-x', name: 'Out', group: 'outbound', sequence: 0, columns: [], ...META }],
    });
    input.routeStopSets.push({
      id: 'stop-set-x', scenarioId: 'scenario-mini', routeId: 'route-x', roundingSeconds: 60, stops: [], placementsByPatternId: {},
      timepointStopCodesByPatternId: { 'pattern-x': { 'pp-x1': 'X1', 'pp-x2': 'X2' } },
      timepointLocationsByPatternId: { 'pattern-x': { 'pp-x1': { latitude: 39.8, longitude: -105 }, 'pp-x2': { latitude: 39.81, longitude: -105 } } },
      ...META,
    });
    input.trips.push({
      id: 'trip-x-0700', scenarioId: 'scenario-mini', routeId: 'route-x', serviceDayId: 'day-wkd', patternId: 'pattern-x', tripProfileId: 'profile-base',
      stopTimes: [{ patternPointId: 'pp-x1', sequence: 1, time: at(7, 0) }, { patternPointId: 'pp-x2', sequence: 2, time: at(7, 10) }],
      provenance: { kind: 'manual', manuallyChangedFields: [] }, ...META,
    });

    const result = buildGtfsExport(input);

    expect(result.refusals).toEqual([]);
    expect(rowsOf(fileText(result, 'routes.txt')).slice(1).map((row) => row[0])).toEqual(['T1', 'T1-2']);
    expect(rowsOf(fileText(result, 'trips.txt')).find((row) => row[2] === 'T1-2-WKD-0-0700-1')).toEqual(['T1-2', 'WKD', 'T1-2-WKD-0-0700-1', 'Out', '0', '', 'T1-2-X']);
    expect(result.report).toContainEqual({ kind: 'note', text: 'Route Second Line is exported as route_id T1-2; T1 is already used by an earlier Route.' });
  });

  it('refuses a holiday outside the export range, a holiday listed twice, and a holiday naming an unknown service day (throws)', () => {
    const outside = miniInput();
    outside.settings.holidays.push({ date: '2027-02-01', serviceDayId: 'day-hol' });
    expect(() => buildGtfsExport(outside)).toThrow(/outside the export range/);

    const twice = miniInput();
    twice.settings.holidays.push({ date: '2027-01-18', serviceDayId: 'day-sat' });
    expect(() => buildGtfsExport(twice)).toThrow(/listed twice/);

    const unknown = miniInput();
    unknown.settings.holidays.push({ date: '2027-01-25', serviceDayId: 'day-none' });
    expect(() => buildGtfsExport(unknown)).toThrow(/not in the Scenario/);
  });

  it('throws when the export date is not a date', () => {
    const input: BuildGtfsExportInput = { ...miniInput(), exportDate: '2027-13-01' };
    expect(() => buildGtfsExport(input)).toThrow(/export date/);
  });
});
