import { describe, expect, it } from 'vitest';
import { tripRuntimeSourceIsCurrent } from '../runtime';
import { validateRouteStopSet } from '../stops';
import { type GtfsTables, type Row } from './feedTables';
import { routeFromFeed } from './routeFromFeed';
import { loadFeedTables, tablesWith } from './testFeeds';
import { type FeedTranslation, type TranslateFeedInput, type TranslateServiceDay, importReportCsv, translateFeed } from './translateFeed';
import { tripsOnDate } from './tripsOnDate';

const NOW = '2026-11-21T00:00:00.000Z';

const WEEKDAY: TranslateServiceDay = { key: 'weekday', serviceDayId: 'sd-weekday', name: 'Weekday', date: '20260105' };
const SATURDAY: TranslateServiceDay = { key: 'saturday', serviceDayId: 'sd-saturday', name: 'Saturday', date: '20260110' };
const MINI_WEEKDAY: TranslateServiceDay = { ...WEEKDAY, date: '20260112' };
const MINI_SATURDAY: TranslateServiceDay = { ...SATURDAY, date: '20260117' };

function translate(tables: GtfsTables, routeIds: string[], extra: Partial<TranslateFeedInput> = {}): FeedTranslation {
  return translateFeed({
    tables,
    routeIds,
    scenarioId: 'scenario-1',
    tripProfileId: 'trip-profile-1',
    serviceDays: [WEEKDAY],
    blocks: { import: false },
    now: NOW,
    ...extra,
  });
}

function rowsWith(result: FeedTranslation, section: string, code?: string) {
  return result.report.rows
    .filter((row) => row.section === section && (code === undefined || row.code === code))
    .map((row) => ({ routeId: row.routeId, tripId: row.tripId, code: row.code, detail: row.detail }));
}

const blockOptions = { blocks: { import: true, blockingScenarioId: 'blocking-1', pullOutMinutes: 10, pullInMinutes: 10 } };

describe('edge-no-direction on Weekday 20260105 (Decision 0089 items 24 to 31, 37)', () => {
  const tables = loadFeedTables('edge-no-direction');
  const result = translate(tables, ['N1']);
  const [route] = result.routes;

  it('imports one Route with its three trips and skips nothing', () => {
    expect(result.skippedRoutes).toEqual([]);
    expect(route.route.name).toBe('N1');
    expect(route.trips).toHaveLength(3);
  });

  it('gives each pattern one run-time profile for the service day, with hourly bands', () => {
    const outbound = route.patterns[0];
    const inbound = route.patterns[1];
    expect(route.runtimeProfiles.map((profile) => [profile.name, profile.patternId, profile.bands.map((band) => [band.label, band.segmentRuntimeSeconds])])).toEqual([
      ['Weekday from feed', outbound.id, [['06:00–07:00', [720]], ['07:00–08:00', [840]]]],
      ['Weekday from feed', inbound.id, [['06:00–07:00', [720]]]],
    ]);
  });

  it('assigns each profile to its pattern on the service day', () => {
    expect(route.runtimeAssignments.map((assignment) => [assignment.patternId, assignment.serviceDayId, assignment.runtimeProfileId])).toEqual(
      route.runtimeProfiles.map((profile) => [profile.patternId, 'sd-weekday', profile.id]),
    );
  });

  it('stores each trip\'s first departure and last arrival as the feed gives them', () => {
    const fromFeed = tripsOnDate(tables, '20260105', new Set(['N1'])).byRoute.get('N1') ?? [];
    const feedEnds = fromFeed.map((trip) => [trip.stopTimes[0].departure, trip.stopTimes[trip.stopTimes.length - 1].arrival]).sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
    const importedEnds = route.trips.map((trip) => [trip.stopTimes[0].time, trip.stopTimes[trip.stopTimes.length - 1].time]).sort((a, b) => a[0] - b[0]);
    expect(importedEnds).toEqual(feedEnds);
  });

  it('records every trip as made from the feed, with a calculation source that is still current', () => {
    for (const trip of route.trips) {
      const profile = route.runtimeProfiles.find((candidate) => candidate.id === trip.provenance.runtimeProfileId);
      expect(profile).toBeDefined();
      expect(trip.provenance).toMatchObject({ kind: 'generated', creationMethod: 'feed', manuallyChangedFields: [] });
      expect(tripRuntimeSourceIsCurrent(trip.provenance.calculationSource!, profile!)).toBe(true);
    }
  });

  it('builds a route stop set with no error-level finding', () => {
    expect(route.stopSet).toBeDefined();
    expect(validateRouteStopSet(route.stopSet!, route.patterns).filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('reports fidelity OK, with the feed and imported trips and running seconds equal', () => {
    expect(result.report.fidelity).toEqual([
      expect.objectContaining({ routeId: 'N1', serviceDay: 'Weekday', feedTrips: 3, importedTrips: 3 }),
    ]);
    expect(result.report.fidelity[0].importedRunningSeconds).toBe(result.report.fidelity[0].feedRunningSeconds);
    expect(result.report.fidelityOk).toBe(true);
    expect(result.report.sizeWarning).toBe(false);
  });

  it('uses the date a Route is given for a service day, in place of the service day\'s date (Decision 0089 item 17)', () => {
    const own = translate(tables, ['N1'], { serviceDays: [{ ...WEEKDAY, date: '20260106', dateByRouteId: { N1: '20260105' } }] });
    expect(own.routes[0].trips).toHaveLength(3);
  });
});

describe('edge-multi-route-blocks: blocks across Routes (Decision 0089 items 34 and 35)', () => {
  const tables = loadFeedTables('edge-multi-route-blocks');

  it('imports Y, and leaves X out "also serves M2", when only M1 is imported', () => {
    const result = translate(tables, ['M1'], blockOptions);
    expect(result.blocks.map((block) => block.label)).toEqual(['Y']);
    expect(result.blocks[0].activities.filter((activity) => activity.type === 'revenueTrip')).toHaveLength(2);
    expect(rowsWith(result, 'block')).toEqual([{ routeId: 'M1', tripId: '', code: 'leftOut', detail: 'X: also serves M2' }]);
  });

  it('imports Z, and leaves X out "also serves M1", when only M2 is imported', () => {
    const result = translate(tables, ['M2'], blockOptions);
    expect(result.blocks.map((block) => block.label)).toEqual(['Z']);
    expect(rowsWith(result, 'block').map((row) => row.detail)).toEqual(['X: also serves M1']);
  });

  it('imports X, Y and Z when both Routes are imported, with X carrying trips of both Routes', () => {
    const result = translate(tables, ['M1', 'M2'], blockOptions);
    expect(result.blocks.map((block) => block.label)).toEqual(['X', 'Y', 'Z']);
    const x = result.blocks.find((block) => block.label === 'X')!;
    expect(x.activities.filter((activity) => activity.type === 'revenueTrip')).toHaveLength(3);
    expect(x.activities[0].type).toBe('pullOut');
    expect(x.activities[x.activities.length - 1].type).toBe('pullIn');
    expect(rowsWith(result, 'block')).toEqual([]);
  });

  it('puts a zero-minute deadhead where a trip ends at a Node that is not the next trip\'s start Node', () => {
    const result = translate(tables, ['M1', 'M2'], blockOptions);
    const x = result.blocks.find((block) => block.label === 'X')!;
    const deadheads = x.activities.filter((activity) => activity.type === 'deadhead');
    // M1's trips and M2's trip meet at the shared stop HUB, but each Route has its own Node for it.
    expect(deadheads).toEqual([expect.objectContaining({ minutesAfterPreviousTrip: 0 })]);
    expect(deadheads[0]).toMatchObject({ type: 'deadhead' });
  });

  it('requires pull-out and pull-in minutes when blocks are imported, and accepts 0 (user decision 2026-11-22)', () => {
    expect(() => translate(tables, ['M1'], { blocks: { import: true, blockingScenarioId: 'blocking-1', pullInMinutes: 10 } })).toThrow(/minutes are required/);
    expect(() => translate(tables, ['M1'], { blocks: { import: true, blockingScenarioId: 'blocking-1', pullOutMinutes: 2.5, pullInMinutes: 10 } })).toThrow(/minutes are required/);
    const result = translate(tables, ['M1'], { blocks: { import: true, blockingScenarioId: 'blocking-1', pullOutMinutes: 0, pullInMinutes: 0 } });
    expect(result.blocks.map((block) => block.label)).toEqual(['Y']);
  });

  it('refuses to import blocks without a Blocking scenario', () => {
    expect(() => translate(tables, ['M1'], { blocks: { import: true } })).toThrow(/Blocking scenario/);
  });
});

describe('mini on Weekday 20260112 and Saturday 20260117 (Decision 0089 items 22, 23, 29, 31 and 37)', () => {
  const tables = loadFeedTables('mini');
  const days = [MINI_WEEKDAY, MINI_SATURDAY];
  const result = translate(tables, ['B1', 'R1', 'F1'], { serviceDays: days });

  it('imports the three Routes, with no skipped Route', () => {
    expect(result.skippedRoutes).toEqual([]);
    expect(result.routes.map((route) => route.route.gtfsRouteId)).toEqual(['B1', 'R1', 'F1']);
  });

  it('matches the feed on Weekday: trips B1 5, R1 2, F1 18; running seconds B1 6000, R1 4440, F1 16200', () => {
    const weekday = result.report.fidelity.filter((row) => row.serviceDay === 'Weekday');
    expect(weekday.map((row) => [row.routeId, row.importedTrips, row.importedRunningSeconds])).toEqual([
      ['B1', 5, 6000],
      ['R1', 2, 4440],
      ['F1', 18, 16200],
    ]);
    expect(weekday.every((row) => row.feedTrips === row.importedTrips && row.feedRunningSeconds === row.importedRunningSeconds)).toBe(true);
  });

  it('reports fidelity OK for every Route on both days', () => {
    expect(result.report.fidelityOk).toBe(true);
  });

  it('gives every trip on both days a calculation source that is still current', () => {
    const profiles = result.routes.flatMap((route) => route.runtimeProfiles);
    const trips = result.routes.flatMap((route) => route.trips);
    expect(trips.length).toBeGreaterThan(0);
    for (const trip of trips) {
      const profile = profiles.find((candidate) => candidate.id === trip.provenance.runtimeProfileId);
      expect(profile).toBeDefined();
      expect(tripRuntimeSourceIsCurrent(trip.provenance.calculationSource!, profile!)).toBe(true);
    }
  });

  it('lists the invalid trip B1_W_BAD on Weekday, and leaves it out of the Route', () => {
    expect(rowsWith(result, 'trip', 'blankFirstOrLastTime')).toEqual([
      { routeId: 'B1', tripId: 'B1_W_BAD', code: 'blankFirstOrLastTime', detail: 'Left out of the import' },
    ]);
    const b1 = result.routes.find((route) => route.route.gtfsRouteId === 'B1')!;
    expect(b1.trips.every((trip) => trip.publicLabel !== 'B1_W_BAD')).toBe(true);
  });

  it('marks as approximate the nine F1_W_FREQ trips on Weekday, and no other trip', () => {
    const approximate = rowsWith(result, 'trip', 'approximateFrequency');
    expect(approximate).toHaveLength(9);
    expect(approximate.every((row) => row.routeId === 'F1' && row.tripId.startsWith('F1_W_FREQ@'))).toBe(true);
  });

  it('reports the blank B1 time that was filled, at S2 of B1_W_2', () => {
    expect(rowsWith(result, 'route', 'filledTime')).toEqual([
      expect.objectContaining({ routeId: 'B1', tripId: 'B1_W_2', code: 'filledTime', detail: expect.stringContaining('outbound:S1>S2>S3') }),
    ]);
  });

  it('names B1 "Main St, Crosstown (feed)", and lists it, when the Scenario already has that name (ignoring case)', () => {
    const named = translate(tables, ['B1', 'R1', 'F1'], { serviceDays: days, existingRouteNames: ['main st, crosstown'] });
    expect(named.routes.find((route) => route.route.gtfsRouteId === 'B1')?.route.name).toBe('Main St, Crosstown (feed)');
    expect(named.routes.find((route) => route.route.gtfsRouteId === 'R1')?.route.name).toBe('Airport Rail');
    expect(rowsWith(named, 'route', 'nameClash')).toEqual([
      { routeId: 'B1', tripId: '', code: 'nameClash', detail: 'Named "Main St, Crosstown (feed)" because a Route of this Scenario has the feed\'s name' },
    ]);
  });

  it('lists a feed file that the import does not use', () => {
    const withExtra = translate(tablesWith({ ...tables, fileNames: [...tables.fileNames, 'stations_extra.txt'] }), ['B1'], { serviceDays: [MINI_WEEKDAY] });
    expect(rowsWith(withExtra, 'file')).toEqual([{ routeId: '', tripId: '', code: 'notImported', detail: 'stations_extra.txt' }]);
  });
});

describe('a Route that fails the stop-set check is skipped, and the rest of the import goes on (Decision 0089 item 12)', () => {
  // NX and nx are two stops, served between the same two timepoints, whose IDs differ only by case: their route stop codes clash.
  const stops: Row[] = [
    { stop_id: 'A', stop_name: 'Start', stop_lat: '39.70', stop_lon: '-105.00', location_type: '' },
    { stop_id: 'NX', stop_name: 'Near X', stop_lat: '39.71', stop_lon: '-105.01', location_type: '' },
    { stop_id: 'nx', stop_name: 'Near x', stop_lat: '39.72', stop_lon: '-105.02', location_type: '' },
    { stop_id: 'B', stop_name: 'End', stop_lat: '39.73', stop_lon: '-105.03', location_type: '' },
    { stop_id: 'C', stop_name: 'Other', stop_lat: '39.80', stop_lon: '-105.10', location_type: '' },
    { stop_id: 'D', stop_name: 'Other end', stop_lat: '39.81', stop_lon: '-105.11', location_type: '' },
  ];
  const tables = tablesWith({
    routes: [
      { route_id: 'X1', agency_id: 'XA', route_short_name: 'X1', route_long_name: 'Clashing', route_type: '3' },
      { route_id: 'X2', agency_id: 'XA', route_short_name: 'X2', route_long_name: 'Fine', route_type: '3' },
    ],
    stops,
    trips: [
      { route_id: 'X1', service_id: 'SV', trip_id: 'X1_1' },
      { route_id: 'X2', service_id: 'SV', trip_id: 'X2_1' },
    ],
    stopTimes: [
      { trip_id: 'X1_1', stop_id: 'A', stop_sequence: '1', arrival_time: '08:00:00', departure_time: '08:00:00' },
      { trip_id: 'X1_1', stop_id: 'NX', stop_sequence: '2', arrival_time: '08:03:00', departure_time: '08:03:00' },
      { trip_id: 'X1_1', stop_id: 'nx', stop_sequence: '3', arrival_time: '08:06:00', departure_time: '08:06:00' },
      { trip_id: 'X1_1', stop_id: 'B', stop_sequence: '4', arrival_time: '08:10:00', departure_time: '08:10:00' },
      { trip_id: 'X2_1', stop_id: 'C', stop_sequence: '1', arrival_time: '09:00:00', departure_time: '09:00:00' },
      { trip_id: 'X2_1', stop_id: 'D', stop_sequence: '2', arrival_time: '09:10:00', departure_time: '09:10:00' },
    ],
    calendar: [{ service_id: 'SV', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date: '20260101', end_date: '20261231' }],
  });

  it('skips X1 with the rule that failed, imports X2, and lists the skip', () => {
    const result = translate(tables, ['X1', 'X2']);
    expect(result.skippedRoutes).toEqual([{ routeId: 'X1', reason: 'Route stops fail validation: routeStop.codeDuplicate' }]);
    expect(result.routes.map((route) => route.route.gtfsRouteId)).toEqual(['X2']);
    expect(rowsWith(result, 'skipped')).toEqual([
      { routeId: 'X1', tripId: '', code: 'skipped', detail: 'Route stops fail validation: routeStop.codeDuplicate' },
    ]);
  });

  it('keeps a skipped Route out of the fidelity check, which covers imported Routes only', () => {
    const result = translate(tables, ['X1', 'X2']);
    expect(result.report.fidelity.map((row) => row.routeId)).toEqual(['X2']);
    expect(result.report.fidelityOk).toBe(true);
    expect(rowsWith(result, 'fidelity')).toEqual([]);
  });
});

// Two Outbound trips of D1 visit A, B, C and then C, B, A. With every stop a timepoint, the two patterns of the one direction run in
// opposite orders, which routeFromFeed cannot place (it throws). D2 is an ordinary Route, so an import must go on past D1.
function routeThrowingFixture(): GtfsTables {
  return tablesWith({
    routes: [
      { route_id: 'D1', agency_id: 'DA', route_short_name: 'D1', route_long_name: 'Out and back', route_type: '3' },
      { route_id: 'D2', agency_id: 'DA', route_short_name: 'D2', route_long_name: 'Fine', route_type: '3' },
    ],
    stops: [
      { stop_id: 'A', stop_name: 'Alpha', stop_lat: '39.70', stop_lon: '-105.00', location_type: '' },
      { stop_id: 'B', stop_name: 'Bravo', stop_lat: '39.71', stop_lon: '-105.01', location_type: '' },
      { stop_id: 'C', stop_name: 'Charlie', stop_lat: '39.72', stop_lon: '-105.02', location_type: '' },
      { stop_id: 'E', stop_name: 'Echo', stop_lat: '39.80', stop_lon: '-105.10', location_type: '' },
      { stop_id: 'F', stop_name: 'Foxtrot', stop_lat: '39.81', stop_lon: '-105.11', location_type: '' },
    ],
    trips: [
      { route_id: 'D1', service_id: 'SV', trip_id: 'D1_1', direction_id: '0' },
      { route_id: 'D1', service_id: 'SV', trip_id: 'D1_2', direction_id: '0' },
      { route_id: 'D2', service_id: 'SV', trip_id: 'D2_1', direction_id: '0' },
    ],
    stopTimes: [
      { trip_id: 'D1_1', stop_id: 'A', stop_sequence: '1', arrival_time: '08:00:00', departure_time: '08:00:00', timepoint: '1' },
      { trip_id: 'D1_1', stop_id: 'B', stop_sequence: '2', arrival_time: '08:05:00', departure_time: '08:05:00', timepoint: '1' },
      { trip_id: 'D1_1', stop_id: 'C', stop_sequence: '3', arrival_time: '08:10:00', departure_time: '08:10:00', timepoint: '1' },
      { trip_id: 'D1_2', stop_id: 'C', stop_sequence: '1', arrival_time: '09:00:00', departure_time: '09:00:00', timepoint: '1' },
      { trip_id: 'D1_2', stop_id: 'B', stop_sequence: '2', arrival_time: '09:05:00', departure_time: '09:05:00', timepoint: '1' },
      { trip_id: 'D1_2', stop_id: 'A', stop_sequence: '3', arrival_time: '09:10:00', departure_time: '09:10:00', timepoint: '1' },
      { trip_id: 'D2_1', stop_id: 'E', stop_sequence: '1', arrival_time: '10:00:00', departure_time: '10:00:00', timepoint: '1' },
      { trip_id: 'D2_1', stop_id: 'F', stop_sequence: '2', arrival_time: '10:10:00', departure_time: '10:10:00', timepoint: '1' },
    ],
    calendar: [{ service_id: 'SV', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date: '20260101', end_date: '20261231' }],
  });
}

describe('Routes and options that cannot be used as asked', () => {
  it('skips a route ID that is not in routes.txt', () => {
    const result = translate(loadFeedTables('edge-no-direction'), ['N1', 'NOPE']);
    expect(result.skippedRoutes).toEqual([{ routeId: 'NOPE', reason: 'Not in routes.txt' }]);
  });

  it('skips a Route with no trips on the chosen dates, with the reason noTripsOnChosenDates, and creates no Route', () => {
    const sunday: TranslateServiceDay = { key: 'sunday', serviceDayId: 'sd-sunday', name: 'Sunday', date: '20260111' };
    const result = translate(loadFeedTables('edge-no-direction'), ['N1'], { serviceDays: [sunday] });
    expect(result.routes).toEqual([]);
    expect(result.blocks).toEqual([]);
    expect(result.skippedRoutes).toEqual([{ routeId: 'N1', reason: 'noTripsOnChosenDates' }]);
    expect(rowsWith(result, 'skipped')).toEqual([{ routeId: 'N1', tripId: '', code: 'skipped', detail: 'noTripsOnChosenDates' }]);
  });

  it('skips a Route whose translation throws, with the error message, and imports the rest (Decision 0089 item 12)', () => {
    // Two Outbound trips of D1 visit A, B, C and then C, B, A. With every stop a timepoint, the two patterns of the one direction run
    // in opposite orders, which routeFromFeed cannot place. D2 is an ordinary Route, so the import must go on past D1.
    const throwing = routeThrowingFixture();
    const result = translate(throwing, ['D1', 'D2']);
    expect(result.skippedRoutes).toEqual([
      { routeId: 'D1', reason: 'This pattern conflicts with the existing timetable order for its direction.' },
    ]);
    expect(result.routes.map((route) => route.route.gtfsRouteId)).toEqual(['D2']);
  });

  it('routeFromFeed itself throws on the same D1 input, so the skip above comes from that call', () => {
    const throwing = routeThrowingFixture();
    const routeRow = throwing.routes.find((row) => row.route_id === 'D1')!;
    const trips = tripsOnDate(throwing, '20260105', new Set(['D1'])).byRoute.get('D1') ?? [];
    expect(trips).toHaveLength(2);
    expect(() =>
      routeFromFeed({
        scenarioId: 'scenario-1',
        routeRow,
        trips,
        stops: new Map(throwing.stops.map((row) => [row.stop_id, row] as const)),
        shapes: new Map(),
        now: NOW,
      }),
    ).toThrow('This pattern conflicts with the existing timetable order for its direction.');
  });
});

describe('timepoint mode and overrides (Decision 0089 item 26)', () => {
  // B1 has all three stops flagged; unflagging S2 leaves two flagged stops, while the suggested rule asks for three.
  const mini = loadFeedTables('mini');
  const b1Trips = new Set(mini.trips.filter((trip) => trip.route_id === 'B1').map((trip) => trip.trip_id));
  const tables = { ...mini, stopTimes: mini.stopTimes.map((row) => (b1Trips.has(row.trip_id) && row.stop_id === 'S2' ? { ...row, timepoint: '0' } : row)) };
  const nodesOf = (extra: Partial<TranslateFeedInput>) => translate(tables, ['B1'], { serviceDays: [MINI_WEEKDAY], ...extra }).routes[0].nodes.length;

  it('uses the feed flags by default and in feed mode, and the suggested rule in suggested mode', () => {
    expect(nodesOf({})).toBe(2);
    expect(nodesOf({ timepointMode: 'feed' })).toBe(2);
    expect(nodesOf({ timepointMode: 'suggested' })).toBe(3);
  });

  it('applies an override keyed by the pattern key before the override', () => {
    expect(nodesOf({ timepointOverrides: { B1: { 'outbound:S1>S3': ['S1', 'S2', 'S3'] } } })).toBe(3);
  });
});

describe('the CSV of the report (Decision 0089 item 37)', () => {
  it('has the column header, one line per finding, and CRLF line ends', () => {
    const result = translate(loadFeedTables('mini'), ['B1'], { serviceDays: [MINI_WEEKDAY] });
    const lines = importReportCsv(result.report).split('\r\n');
    expect(lines[0]).toBe('section,routeId,serviceDay,tripId,stopId,code,detail');
    expect(lines[lines.length - 1]).toBe('');
    expect(lines.length - 2).toBe(result.report.rows.length);
  });
});
