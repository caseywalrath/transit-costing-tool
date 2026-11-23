import { describe, expect, it } from 'vitest';
import { greatCircleMiles } from '../geo';
import { validateRouteStopSet } from '../stops';
import type { GtfsTables, Row } from './feedTables';
import { type FeedShapePoint, type GtfsFinding, type RouteFromFeed, type RouteFromFeedInput, routeFromFeed } from './routeFromFeed';
import { loadFeedTables, tablesWith } from './testFeeds';
import { tripsOnDate } from './tripsOnDate';

const NOW = '2026-11-21T00:00:00.000Z';
const SCENARIO = 'scenario-1';

function stopMapOf(tables: GtfsTables): Map<string, Row> {
  return new Map(tables.stops.map((row) => [row.stop_id, row]));
}

function shapeMapOf(tables: GtfsTables): Map<string, FeedShapePoint[]> {
  const shapes = new Map<string, FeedShapePoint[]>();
  for (const row of tables.shapes) {
    const list = shapes.get(row.shape_id) ?? [];
    list.push({ latitude: Number(row.shape_pt_lat), longitude: Number(row.shape_pt_lon), sequence: Number(row.shape_pt_sequence) });
    shapes.set(row.shape_id, list);
  }
  return shapes;
}

// The worked-example input: every trip of one route on one date, through the I2 reader.
function inputFor(tables: GtfsTables, date: string, routeId: string, extra: Partial<RouteFromFeedInput> = {}): RouteFromFeedInput {
  const routeRow = tables.routes.find((row) => row.route_id === routeId);
  if (!routeRow) throw new Error(`No route ${routeId}`);
  const trips = tripsOnDate(tables, date, new Set([routeId])).byRoute.get(routeId) ?? [];
  return { scenarioId: SCENARIO, routeRow, trips, stops: stopMapOf(tables), shapes: shapeMapOf(tables), now: NOW, ...extra };
}

function run(tables: GtfsTables, date: string, routeId: string, extra?: Partial<RouteFromFeedInput>): RouteFromFeed {
  return routeFromFeed(inputFor(tables, date, routeId, extra));
}

function codesOf(result: RouteFromFeed, code: GtfsFinding['code']): GtfsFinding[] {
  return result.findings.filter((finding) => finding.code === code);
}

function errorsOf(result: RouteFromFeed): unknown[] {
  if (!result.stopSet) return [];
  return validateRouteStopSet(result.stopSet, result.patterns).filter((finding) => finding.severity === 'error');
}

const hms = (seconds: number): string =>
  [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60].map((part) => String(part).padStart(2, '0')).join(':');

// A small feed built in code. Every trip runs every day of 2026 through service SV.
function builtTables(parts: { routes?: Row[]; stops: Row[]; trips: Row[]; stopTimes: Row[] }): GtfsTables {
  return tablesWith({
    routes: parts.routes ?? [{ route_id: 'X1', agency_id: 'XA', route_short_name: 'X1', route_long_name: 'Built Route', route_type: '3' }],
    stops: parts.stops,
    trips: parts.trips,
    stopTimes: parts.stopTimes,
    calendar: [{ service_id: 'SV', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date: '20260101', end_date: '20261231' }],
  });
}

const stopRow = (stopId: string, name: string, lat: string, lon: string): Row => ({ stop_id: stopId, stop_name: name, stop_lat: lat, stop_lon: lon, location_type: '' });
const tripRow = (tripId: string, routeId = 'X1', direction?: string): Row => ({ route_id: routeId, service_id: 'SV', trip_id: tripId, ...(direction === undefined ? {} : { direction_id: direction }) });
const stopTimeRow = (tripId: string, stopId: string, sequence: number, arrival: string, departure: string, timepoint?: string): Row => ({
  trip_id: tripId, stop_id: stopId, stop_sequence: String(sequence), arrival_time: arrival, departure_time: departure, ...(timepoint === undefined ? {} : { timepoint }),
});

describe('edge-no-direction: no direction column, terminal-pair grouping (Decision 0089 items 24, 25, 27, 28, 29)', () => {
  const tables = loadFeedTables('edge-no-direction');
  const result = run(tables, '20260105', 'N1');

  it('names the route from its short name, since the long name is blank', () => {
    expect(result.route).toMatchObject({ name: 'N1', shortName: 'N1', gtfsRouteId: 'N1', gtfsRouteType: 3 });
    expect(result.route.color).toBeUndefined();
  });

  it('proposes South Terminal outbound and North Terminal inbound, with two patterns of two points', () => {
    expect(result.directions.map((direction) => [direction.group, direction.name])).toEqual([['outbound', 'South Terminal'], ['inbound', 'North Terminal']]);
    expect(result.patterns.map((pattern) => pattern.name)).toEqual(['South Terminal', 'North Terminal']);
    expect(result.patterns.map((pattern) => pattern.points.length)).toEqual([2, 2]);
    expect(result.patternKeys[result.patterns[0].id]).toBe('outbound:NA>NB');
  });

  it('makes both terminals Nodes, each named by its stop', () => {
    expect(result.nodes.map((node) => [node.name, node.kind]).sort()).toEqual([['North Terminal', 'terminal'], ['South Terminal', 'terminal']]);
  });

  it('places the middle stop once as a Route stop, on both patterns', () => {
    expect(result.stopSet?.stops.map((stop) => [stop.stopCode, stop.name])).toEqual([['NM', 'Middle']]);
    const [outbound, inbound] = result.patterns;
    expect(result.stopSet?.placementsByPatternId[outbound.id]).toMatchObject([{ afterPatternPointId: outbound.points[0].id, sequence: 0, timing: 'interpolate' }]);
    expect(result.stopSet?.placementsByPatternId[inbound.id]).toMatchObject([{ afterPatternPointId: inbound.points[0].id, sequence: 0, timing: 'interpolate' }]);
  });

  it('measures each pattern by straight line, says so, and reports the directions as guessed', () => {
    expect(codesOf(result, 'straightLineMiles').map((finding) => finding.patternKey).sort()).toEqual(['inbound:NB>NA', 'outbound:NA>NB']);
    expect(codesOf(result, 'directionsGuessed')).toHaveLength(1);
    const [outbound] = result.patterns;
    const expected = greatCircleMiles({ latitude: 39.76, longitude: -104.99 }, { latitude: 39.74, longitude: -104.99 });
    expect(Math.abs(outbound.points[1].cumulativeMiles - expected)).toBeLessThanOrEqual(0.02);
  });

  it('keeps the stop set free of validation errors and gives each trip a time at each point', () => {
    expect(errorsOf(result)).toEqual([]);
    const outboundTrip = result.placements.find((placement) => placement.tripId === 'N1_a');
    expect(outboundTrip?.points.map((point) => [point.departure, point.arrival])).toEqual([[21600, 21600], [22320, 22320]]);
  });
});

describe('edge-loop-variants: loop, merged variant, short turn, dwell, frequencies (Decision 0089 items 25, 26, 27, 28, 31)', () => {
  const tables = loadFeedTables('edge-loop-variants');
  const result = run(tables, '20260105', 'L1');
  const loopPattern = result.patterns[0];
  const shortPattern = result.patterns[1];
  const keyOf = (pattern: { id: string }) => result.patternKeys[pattern.id];

  it('reads the route name and colour from the feed', () => {
    expect(result.route).toMatchObject({ name: 'Downtown Loop', gtfsRouteId: 'L1', color: 'AA00AA' });
  });

  it('has a full-loop pattern and a short-turn pattern, both outbound, named from their terminals', () => {
    expect(result.patterns).toHaveLength(2);
    expect(result.patterns.map((pattern) => keyOf(pattern)).sort()).toEqual(['outbound:LA>LC', 'outbound:LA>LC>LA']);
    expect(result.patterns.map((pattern) => pattern.name)).toEqual(['Loop Hub to Loop Hub', 'Loop Hub to Loop Far']);
    expect(result.patterns.every((pattern) => pattern.directionId === result.directions[0].id)).toBe(true);
  });

  it('gives the loop one Node at both ends', () => {
    expect(loopPattern.points).toHaveLength(3);
    expect(loopPattern.points[0].nodeId).toBe(loopPattern.points[2].nodeId);
  });

  it('places the five loop trips and one short trip, including the frequency departures', () => {
    const onLoop = result.placements.filter((placement) => placement.patternId === loopPattern.id).map((placement) => placement.tripId).sort();
    expect(onLoop).toEqual(['L1_freq@36000', 'L1_freq@37800', 'L1_full_1', 'L1_full_2', 'L1_skip']);
    expect(result.placements.filter((placement) => placement.patternId === shortPattern.id).map((placement) => placement.tripId)).toEqual(['L1_short']);
  });

  it('lists the skipped-stop trip as a merged variant', () => {
    expect(codesOf(result, 'mergedVariant')).toMatchObject([{ tripId: 'L1_skip', patternKey: 'outbound:LA>LC>LA' }]);
  });

  it('records the dwell at LC on the first full-loop trip, and keeps its departure', () => {
    expect(codesOf(result, 'dwellAtTimepoint')).toMatchObject([{ tripId: 'L1_full_1', stopId: 'LC' }]);
    const placement = result.placements.find((item) => item.tripId === 'L1_full_1');
    expect(placement?.points[1].departure).toBe(22260);
  });

  it('makes LB and LD Route stops, placed on the segments of the patterns that serve them', () => {
    expect(result.stopSet?.stops.map((stop) => stop.stopCode).sort()).toEqual(['LB', 'LD']);
    const loopPlacements = result.stopSet?.placementsByPatternId[loopPattern.id] ?? [];
    expect(loopPlacements.map((placement) => placement.afterPatternPointId)).toEqual([loopPattern.points[0].id, loopPattern.points[1].id]);
    const shortPlacements = result.stopSet?.placementsByPatternId[shortPattern.id] ?? [];
    expect(shortPlacements.map((placement) => placement.afterPatternPointId)).toEqual([shortPattern.points[0].id]);
  });

  it('measures along the chain of stops through LB and LD, with no shape, and says so for both patterns', () => {
    expect(codesOf(result, 'straightLineMiles')).toHaveLength(2);
    const at = (lat: number, lon: number) => ({ latitude: lat, longitude: lon });
    const toLb = greatCircleMiles(at(39.74, -104.99), at(39.74, -104.98));
    const toLc = toLb + greatCircleMiles(at(39.74, -104.98), at(39.75, -104.98));
    expect(Math.abs(loopPattern.points[1].cumulativeMiles - toLc)).toBeLessThanOrEqual(0.02);
  });

  it('keeps the stop set free of validation errors', () => {
    expect(errorsOf(result)).toEqual([]);
  });
});

describe('mini feed, route B1 on 20260112: flagged timepoints, a blank timepoint, and shape miles (worked example)', () => {
  const tables = loadFeedTables('mini');
  const result = run(tables, '20260112', 'B1');
  const outbound = result.patterns.find((pattern) => pattern.directionId === result.directions[0].id);
  const inbound = result.patterns.find((pattern) => pattern.directionId === result.directions[1].id);

  it('reads the route name with its comma, the short name, the type 3 and colour 0055AA', () => {
    expect(result.route).toMatchObject({ name: 'Main St, Crosstown', shortName: 'B1', gtfsRouteType: 3, color: '0055AA' });
  });

  it('has one outbound pattern S1 > S2 > S3 with three trips, and one inbound pattern S3 > S2 > S1 with two', () => {
    expect(outbound && result.patternKeys[outbound.id]).toBe('outbound:S1>S2>S3');
    expect(inbound && result.patternKeys[inbound.id]).toBe('inbound:S3>S2>S1');
    expect(result.placements.filter((placement) => placement.patternId === outbound?.id).map((placement) => placement.tripId).sort())
      .toEqual(['B1_W_0', 'B1_W_2', 'B1_W_OWL']);
    expect(result.placements.filter((placement) => placement.patternId === inbound?.id)).toHaveLength(2);
  });

  it('gives B1_W_2 the blank S2 filled by distance to 08:10:00 (29400), and lists it', () => {
    const placement = result.placements.find((item) => item.tripId === 'B1_W_2');
    expect(placement?.points[1]).toEqual({ patternPointId: outbound?.points[1].id, departure: 29400, arrival: 29400, filled: true });
    expect(codesOf(result, 'filledTime')).toMatchObject([{ tripId: 'B1_W_2', stopId: 'S2', detail: 'distance' }]);
  });

  it('lists a filled time once when the same trip reaches the route on two dates, as B1_W_2 does on the weekday and the holiday', () => {
    const tables = loadFeedTables('mini');
    const weekday = inputFor(tables, '20260112', 'B1');
    const holiday = inputFor(tables, '20260130', 'B1');
    expect(holiday.trips.some((trip) => trip.tripId === 'B1_W_2')).toBe(true);
    const twice = routeFromFeed({ ...weekday, trips: [...weekday.trips, ...holiday.trips] });
    expect(codesOf(twice, 'filledTime').filter((finding) => finding.tripId === 'B1_W_2')).toHaveLength(1);
    expect(codesOf(twice, 'filledTime')).toHaveLength(codesOf(result, 'filledTime').length);
  });

  it('makes the three stops Nodes, with the ends as terminals and the middle one a timepoint, and no Route stops', () => {
    expect(result.nodes.map((node) => [node.name, node.kind]).sort()).toEqual([
      ['Main St & 1st Ave, Shared', 'terminal'],
      ['Main St & 5th Ave', 'timepoint'],
      ['Main St & 9th Ave', 'terminal'],
    ]);
    expect(result.stopSet?.stops).toEqual([]);
  });

  it('measures the outbound points along SH_B1_0 to within 0.02 mile of the polyline length, and uses no straight-line miles', () => {
    const v1 = { latitude: 39.74, longitude: -104.99 };
    const v2 = { latitude: 39.7402, longitude: -104.98 };
    const v3 = { latitude: 39.74, longitude: -104.97 };
    expect(Math.abs((outbound?.points[1].cumulativeMiles ?? NaN) - greatCircleMiles(v1, v2))).toBeLessThanOrEqual(0.02);
    expect(Math.abs((outbound?.points[2].cumulativeMiles ?? NaN) - (greatCircleMiles(v1, v2) + greatCircleMiles(v2, v3)))).toBeLessThanOrEqual(0.02);
    expect(codesOf(result, 'straightLineMiles').filter((finding) => finding.patternKey?.startsWith('outbound'))).toHaveLength(0);
  });

  it('measures the inbound points along SH_B1_1 in the same way', () => {
    const v1 = { latitude: 39.74, longitude: -104.97 };
    const v2 = { latitude: 39.7398, longitude: -104.98 };
    const v3 = { latitude: 39.74, longitude: -104.99 };
    expect(Math.abs((inbound?.points[1].cumulativeMiles ?? NaN) - greatCircleMiles(v1, v2))).toBeLessThanOrEqual(0.02);
    expect(Math.abs((inbound?.points[2].cumulativeMiles ?? NaN) - (greatCircleMiles(v1, v2) + greatCircleMiles(v2, v3)))).toBeLessThanOrEqual(0.02);
  });

  it('keeps the stop set free of validation errors', () => {
    expect(errorsOf(result)).toEqual([]);
  });
});

describe('mini feed, route R1 on 20260112: shape miles with a shape that fits', () => {
  const tables = loadFeedTables('mini');
  const result = run(tables, '20260112', 'R1');

  it('names the patterns from the platform and the airport stop, and uses the shape', () => {
    expect(result.patterns.map((pattern) => pattern.name)).toEqual(['Union Station Track 1 to Airport', 'Airport to Union Station Track 1']);
    expect(codesOf(result, 'straightLineMiles')).toHaveLength(0);
  });

  it('measures the outbound end along SH_R1_0 to within 0.02 mile of the polyline length', () => {
    const v1 = { latitude: 39.7501, longitude: -105.0001 };
    const v2 = { latitude: 39.8, longitude: -104.85 };
    const v3 = { latitude: 39.85, longitude: -104.67 };
    const expected = greatCircleMiles(v1, v2) + greatCircleMiles(v2, v3);
    expect(Math.abs((result.patterns[0].points[1].cumulativeMiles) - expected)).toBeLessThanOrEqual(0.02);
  });
});

describe('mini feed, route F1 on 20260112: frequency trips, no shape', () => {
  const tables = loadFeedTables('mini');
  const result = run(tables, '20260112', 'F1');

  it('makes one outbound pattern of 18 trips, including the expanded frequency departures', () => {
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0].name).toBe('Main St & 1st Ave, Shared to Park Terminal');
    expect(result.placements).toHaveLength(18);
    expect(result.placements.some((placement) => placement.tripId === 'F1_W_FREQ@21600')).toBe(true);
    expect(result.route.color).toBe('228822');
  });

  it('measures by straight line because F1 has no shape, and says so', () => {
    expect(codesOf(result, 'straightLineMiles')).toMatchObject([{ patternKey: 'outbound:S1>F2' }]);
    const expected = greatCircleMiles({ latitude: 39.74, longitude: -104.99 }, { latitude: 39.73, longitude: -104.99 });
    expect(Math.abs(result.patterns[0].points[1].cumulativeMiles - expected)).toBeLessThanOrEqual(0.02);
  });
});

describe('a built feed of 35 flagged timepoints on one trip (worked example)', () => {
  const stopRows: Row[] = [];
  const stopTimeRows: Row[] = [];
  for (let index = 1; index <= 35; index += 1) {
    const id = `P${String(index).padStart(2, '0')}`;
    stopRows.push(stopRow(id, `Stop ${id}`, String(39.7 + index * 0.001), '-105'));
    stopTimeRows.push(stopTimeRow('BIG', id, index, hms(6 * 3600 + index * 60), hms(6 * 3600 + index * 60), '1'));
  }
  const tables = builtTables({ stops: stopRows, trips: [tripRow('BIG')], stopTimes: stopTimeRows });
  const result = run(tables, '20260105', 'X1');

  it('keeps 30 points, both terminals, and one thinnedTimepoints finding that lists the five dropped stops', () => {
    expect(result.patterns[0].points).toHaveLength(30);
    expect(result.nodes.map((node) => node.name)).toContain('Stop P01');
    expect(result.nodes.map((node) => node.name)).toContain('Stop P35');
    const thinned = codesOf(result, 'thinnedTimepoints');
    expect(thinned).toHaveLength(1);
    expect(thinned[0].detail?.split(': dropped ')[1].split(', ')).toHaveLength(5);
  });

  it('keeps the stop set free of validation errors', () => {
    expect(errorsOf(result)).toEqual([]);
  });
});

describe('built feeds for the remaining rules', () => {
  it('reports a blank direction_id that the feed does not give as guessed, and joins it to the direction its first stop shares', () => {
    const stops = [stopRow('A', 'Alpha', '39.74', '-104.99'), stopRow('B', 'Beta', '39.74', '-104.98')];
    const tables = builtTables({
      stops,
      trips: [tripRow('T1', 'X1', '0'), tripRow('T2', 'X1', '1'), tripRow('T3', 'X1'), tripRow('T4', 'X1')],
      stopTimes: [
        stopTimeRow('T1', 'A', 1, '08:00:00', '08:00:00'), stopTimeRow('T1', 'B', 2, '08:10:00', '08:10:00'),
        stopTimeRow('T2', 'B', 1, '09:00:00', '09:00:00'), stopTimeRow('T2', 'A', 2, '09:10:00', '09:10:00'),
        stopTimeRow('T3', 'A', 1, '10:00:00', '10:00:00'), stopTimeRow('T3', 'B', 2, '10:10:00', '10:10:00'),
        stopTimeRow('T4', 'B', 1, '11:00:00', '11:00:00'), stopTimeRow('T4', 'A', 2, '11:10:00', '11:10:00'),
      ],
    });
    const result = run(tables, '20260105', 'X1');
    const outbound = result.directions[0];
    const tripOutbound = result.placements.find((placement) => placement.tripId === 'T3');
    expect(tripOutbound && result.patterns.find((pattern) => pattern.id === tripOutbound.patternId)?.directionId).toBe(outbound.id);
    expect(codesOf(result, 'directionsGuessed').map((finding) => finding.tripId).sort()).toEqual(['T3', 'T4']);
  });

  it('fills a blank timepoint with no location by equal spacing, and reports the stop as having no location', () => {
    const tables = builtTables({
      stops: [stopRow('A', 'Alpha', '39.74', '-104.99'), stopRow('X', 'Xray', '', ''), stopRow('B', 'Beta', '39.74', '-104.97')],
      trips: [tripRow('T1')],
      stopTimes: [
        stopTimeRow('T1', 'A', 1, '08:00:00', '08:00:00', '1'),
        stopTimeRow('T1', 'X', 2, '', '', '1'),
        stopTimeRow('T1', 'B', 3, '08:20:00', '08:20:00', '1'),
      ],
    });
    const result = run(tables, '20260105', 'X1');
    expect(result.placements[0].points[1]).toEqual({ patternPointId: result.patterns[0].points[1].id, departure: 29400, arrival: 29400, filled: true });
    expect(codesOf(result, 'filledTime')).toMatchObject([{ tripId: 'T1', stopId: 'X', detail: 'equal' }]);
    expect(codesOf(result, 'stopWithoutLocation').map((finding) => finding.stopId)).toEqual(['X']);
  });

  it('leaves a pattern with fewer than two located points unmeasured, with zero miles, and says so', () => {
    const tables = builtTables({
      stops: [stopRow('A', 'Alpha', '39.74', '-104.99'), stopRow('B', 'Beta', '', '')],
      trips: [tripRow('T1')],
      stopTimes: [stopTimeRow('T1', 'A', 1, '08:00:00', '08:00:00', '1'), stopTimeRow('T1', 'B', 2, '08:10:00', '08:10:00', '1')],
    });
    const result = run(tables, '20260105', 'X1');
    expect(result.patterns[0].points.map((point) => point.cumulativeMiles)).toEqual([0, 0]);
    expect(codesOf(result, 'unmeasuredPattern')).toMatchObject([{ patternKey: 'outbound:A>B' }]);
  });

  it('keeps a valid colour with a leading "#" in upper case, and leaves a bad colour or route type unset with a finding', () => {
    const good = builtTables({
      routes: [{ route_id: 'X1', route_short_name: 'X1', route_long_name: 'Good', route_type: '3', route_color: '#0055aa' }],
      stops: [stopRow('A', 'Alpha', '39.74', '-104.99'), stopRow('B', 'Beta', '39.74', '-104.98')],
      trips: [tripRow('T1')],
      stopTimes: [stopTimeRow('T1', 'A', 1, '08:00:00', '08:00:00'), stopTimeRow('T1', 'B', 2, '08:10:00', '08:10:00')],
    });
    expect(run(good, '20260105', 'X1').route.color).toBe('0055AA');

    const bad = builtTables({
      routes: [{ route_id: 'X1', route_short_name: 'X1', route_long_name: 'Bad', route_type: 'bus', route_color: 'zz11' }],
      stops: [stopRow('A', 'Alpha', '39.74', '-104.99'), stopRow('B', 'Beta', '39.74', '-104.98')],
      trips: [tripRow('T1')],
      stopTimes: [stopTimeRow('T1', 'A', 1, '08:00:00', '08:00:00'), stopTimeRow('T1', 'B', 2, '08:10:00', '08:10:00')],
    });
    const badResult = run(bad, '20260105', 'X1');
    expect(badResult.route.color).toBeUndefined();
    expect(badResult.route.gtfsRouteType).toBeUndefined();
    expect(codesOf(badResult, 'badRouteField').map((finding) => finding.detail).sort()).toEqual(['route_color', 'route_type']);
  });

  it('names a stop with a blank stop_name by its stop_id, and a route with no names by its route_id', () => {
    const tables = builtTables({
      routes: [{ route_id: 'X1', route_short_name: '', route_long_name: '', route_type: '3' }],
      stops: [stopRow('A', '', '39.74', '-104.99'), stopRow('B', 'Beta', '39.74', '-104.98')],
      trips: [tripRow('T1')],
      stopTimes: [stopTimeRow('T1', 'A', 1, '08:00:00', '08:00:00'), stopTimeRow('T1', 'B', 2, '08:10:00', '08:10:00')],
    });
    const result = run(tables, '20260105', 'X1');
    expect(result.route.name).toBe('X1');
    expect(result.nodes.map((node) => node.name).sort()).toEqual(['A', 'Beta']);
  });

  it('applies a planner override to the trips on the overridden pattern, and ignores an override stop the pattern does not serve', () => {
    const tables = loadFeedTables('edge-loop-variants');
    const result = run(tables, '20260105', 'L1', { timepointOverrides: { 'outbound:LA>LC>LA': ['LB', 'LC', 'XX'] } });
    expect(result.patterns.map((pattern) => result.patternKeys[pattern.id]).sort()).toEqual(['outbound:LA>LB>LC>LA', 'outbound:LA>LC', 'outbound:LA>LC>LA']);
    expect(result.patterns.map((pattern) => pattern.name)).toEqual(['Loop Hub to Loop Hub', 'Loop Hub to Loop Hub 2', 'Loop Hub to Loop Far']);
    expect(result.nodes.map((node) => node.name)).toContain('Loop East');
    expect(result.nodes.some((node) => node.name === 'XX')).toBe(false);
    expect(result.stopSet?.stops.map((stop) => stop.stopCode)).toEqual(['LD']);
  });

  it('uses the suggested timepoints in suggested mode even when the feed flags some, and the flags in feed mode and by default', () => {
    // Five stops, the middle one flagged. The trip runs 4 minutes, so the suggested rule asks for round(4 / 10) + 1 = 1 stop, raised to
    // the 2-stop minimum: only the terminals. The flag adds the middle stop.
    const names = ['A', 'B', 'C', 'D', 'E'];
    const tables = builtTables({
      stops: names.map((id, index) => stopRow(id, `Stop ${id}`, '39.74', String(-104.99 + index * 0.01))),
      trips: [tripRow('T1')],
      stopTimes: names.map((id, index) => stopTimeRow('T1', id, index + 1, hms(8 * 3600 + index * 60), hms(8 * 3600 + index * 60), id === 'C' ? '1' : '0')),
    });
    const keysOf = (result: RouteFromFeed) => result.patterns.map((pattern) => result.patternKeys[pattern.id]);
    expect(keysOf(run(tables, '20260105', 'X1'))).toEqual(['outbound:A>C>E']);
    expect(keysOf(run(tables, '20260105', 'X1', { timepointMode: 'feed' }))).toEqual(['outbound:A>C>E']);
    expect(keysOf(run(tables, '20260105', 'X1', { timepointMode: 'suggested' }))).toEqual(['outbound:A>E']);
  });

  it('gives a route with no trips a route and two directions, and no patterns or stop set', () => {
    const tables = loadFeedTables('edge-loop-variants');
    const result = routeFromFeed({ ...inputFor(tables, '20260105', 'L1'), trips: [] });
    expect(result.patterns).toEqual([]);
    expect(result.stopSet).toBeUndefined();
    expect(result.directions).toHaveLength(2);
    expect(result.findings).toEqual([]);
  });
});
