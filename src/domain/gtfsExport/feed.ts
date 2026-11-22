// Decision 0090: the feed builder. Turns one Scenario's selected Routes, Trip profile, optional Blocking scenario and settings into the GTFS
// files, the report rows, and the refusals and warnings of items 19 and 20. Pure: it writes nothing. The export service (card E4) writes the
// ZIP from `files` and the report CSV from `reportCsvText`. Reads the Scenario through its stored types, as `stopTimeRows` does.

import { directionDisplayName, orderPatterns, patternDirectionGroups, type DirectionGroup } from '../directions';
import { serviceDayAbbreviation } from '../serviceDays';
import { stopTimeRows, type StopTimeRow } from '../stopTimes';
import { sortedPoints } from '../stops';
import type {
  BlockingBlock,
  EntityId,
  GtfsExportSettings,
  Node,
  Route,
  RouteDefinitionAggregate,
  RoutePattern,
  RouteStopSet,
  ServiceDayDefinition,
  Trip,
} from '../types';
import { agencyRefusals, exportRange } from './checks';
import { type CalendarHoliday, type CalendarPlan, gtfsDateFromIso, planCalendar } from './calendar';
import { compareCodeUnits, coordinateText, csvTable, gtfsClock, gtfsHhmm, milesText, type CsvCell } from './csvText';
import { patternShapePoints, shapesText, type ExportShape } from './shapes';
import { rowMiles } from './stopTimes';
import { exportStops } from './stops';
import type {
  ExportNodeInput,
  ExportPatternInput,
  ExportReportRow,
  ExportRouteInput,
  ExportStop,
  ExportStopsResult,
  GtfsExportFile,
  GtfsExportIssue,
  GtfsExportResult,
} from './types';

/** Decision 0090 item 4 and the fixture: the one agency's agency_id, written in agency.txt and routes.txt. */
const AGENCY_ID = 'agency';
/** Decision 0090 item 9: route_type when the Route has no GTFS type. */
const DEFAULT_ROUTE_TYPE = 3;
/** Decision 0090 item 10: Outbound is direction_id 0, Inbound 1. */
const DIRECTION_ID: Readonly<Record<DirectionGroup, 0 | 1>> = { outbound: 0, inbound: 1 };
const WEEKDAY_COLUMNS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

/** The inputs of the feed builder. The Scenario's records are the stored types; the builder selects what it writes. */
export interface BuildGtfsExportInput {
  /** The selected Routes in export order, each with its Nodes, Patterns and Directions. */
  routes: RouteDefinitionAggregate[];
  /** The stop sets of the selected Routes (Decisions 0079 to 0086). A Route without one has no Route stops and no timepoint stop IDs or locations. */
  routeStopSets: RouteStopSet[];
  /** The Scenario's Trips. Only the Trips of the selected Routes and of the Trip profile are written. */
  trips: Trip[];
  tripProfileId: EntityId;
  /** The Scenario's service days. A day with no Trips in the export is left out of calendar.txt and listed (item 2). */
  serviceDays: ServiceDayDefinition[];
  /** The Scenario's Routes that are not selected. Their names appear in the block warning only. */
  unselectedRoutes?: Route[];
  /** The Blocks of the chosen Blocking scenario. Omit when no Blocking scenario is chosen: every block_id is then blank. */
  blocks?: BlockingBlock[];
  settings: GtfsExportSettings;
  /** The export date, YYYY-MM-DD. It is written as feed_version (item 18). */
  exportDate: string;
}

/** A pattern of an exported Route with its direction group (Decision 0090 item 10). */
interface AssignedPattern {
  pattern: RoutePattern;
  direction: DirectionGroup;
}

/** An exported Route: a selected Route with Trips in the profile. */
interface ExportedRoute {
  aggregate: RouteDefinitionAggregate;
  /** The export route_id (item 9), unique across the feed. */
  routeId: string;
  set: RouteStopSet | undefined;
  /** The patterns with a direction that have Trips, in Route tab order. */
  patterns: AssignedPattern[];
  /** Pattern ID → its direction's name as the headsign (item 10). */
  headsignByPatternId: Map<EntityId, string>;
  /** Pattern ID → its 1-based position in the Route's tab order: the shape_id fallback when the pattern has no short name. */
  positionByPatternId: Map<EntityId, number>;
  /** The Trips of the profile on this Route, including those whose pattern is refused. */
  trips: Trip[];
}

/** One row of a Trip's stop times, after the checks: its stop ID, time and miles. */
interface TripStop {
  stopId: string;
  timepoint: boolean;
  time: number;
  miles: number;
}

/** A Trip that is written: its Route, pattern, direction, service day and stop times. `tripId` is set once the Trips are in order. */
interface TripRecord {
  trip: Trip;
  route: ExportedRoute;
  pattern: RoutePattern;
  direction: DirectionGroup;
  service: ServiceDayDefinition;
  serviceId: string;
  firstDeparture: number;
  lastArrival: number;
  stops: TripStop[];
  blockLabel?: string;
  tripId: string;
}

/**
 * Decision 0090 items 4 to 21. Builds the feed. Refusals (items 19) stop the export: `files` and `report` are then empty. Throws only for an
 * input the settings and the stored records should not hold (a holiday outside the range, a Trip on a service day that is not in the
 * Scenario, two service days with one abbreviation); those are checked before the export is offered.
 */
export function buildGtfsExport(input: BuildGtfsExportInput): GtfsExportResult {
  const { settings } = input;
  const refusals: GtfsExportIssue[] = agencyRefusals(settings);
  const warnings: GtfsExportIssue[] = [];
  const notes: ExportReportRow[] = [];
  const rangeResult = exportRange(settings);
  refusals.push(...rangeResult.refusals);
  const { range } = rangeResult;
  const feedVersion = requireIsoDate(input.exportDate);

  const services = new Map(input.serviceDays.map((day) => [day.id, day] as const));
  const selectedRouteIds = new Set(input.routes.map((aggregate) => aggregate.route.id));
  const profileTrips = input.trips.filter((trip) => trip.tripProfileId === input.tripProfileId && selectedRouteIds.has(trip.routeId));

  // Decision 0090 item 2: a selected Route with no Trips in the profile is skipped and listed.
  const exportedAggregates = input.routes.filter((aggregate) => {
    const hasTrips = profileTrips.some((trip) => trip.routeId === aggregate.route.id);
    if (!hasTrips) warnings.push({ code: 'gtfsExport.routeSkipped', routeId: aggregate.route.id, routeName: aggregate.route.name });
    return hasTrips;
  });
  const routeIdByRouteId = uniqueRouteIds(exportedAggregates.map((aggregate) => aggregate.route), notes);
  const exported = exportedAggregates.map((aggregate) => prepareRoute({
    aggregate,
    routeId: routeIdByRouteId.get(aggregate.route.id) ?? aggregate.route.id,
    set: input.routeStopSets.find((candidate) => candidate.routeId === aggregate.route.id),
    trips: profileTrips.filter((trip) => trip.routeId === aggregate.route.id),
    refusals,
    warnings,
  }));

  // Decision 0090 items 5 to 8: stops and their IDs, from the exported patterns only.
  const stopResult = exportStops({
    routes: exported.map(exportRouteInput),
    nodes: exported.flatMap((route) => route.aggregate.nodes).map(exportNodeInput),
  });
  refusals.push(...stopResult.refusals);
  warnings.push(...stopResult.warnings);

  // Decision 0090 item 16: holidays name a service day of the Scenario, fall in the range and appear once. These are the settings' own rules,
  // so a breach throws instead of becoming a refusal.
  const holidays = holidaysOf(settings, services, range);

  // Decision 0090 item 10: the Blocks of the chosen Blocking scenario give block_id.
  const blockLabelByTripId = new Map<EntityId, string>();
  for (const block of input.blocks ?? []) {
    for (const activity of block.activities) {
      if (activity.type === 'revenueTrip' && !blockLabelByTripId.has(activity.tripId)) blockLabelByTripId.set(activity.tripId, block.label);
    }
  }

  const records = tripRecords({ exported, stopResult, services, blockLabelByTripId, refusals });
  sortRecords(records);
  assignTripIds(records);

  const usedServices = new Map<string, ServiceDayDefinition>();
  for (const record of records) {
    const existing = usedServices.get(record.serviceId);
    if (existing === undefined) usedServices.set(record.serviceId, record.service);
    else if (existing.id !== record.service.id) {
      throw new Error(`gtfsExport: service days ${existing.name} and ${record.service.name} share the abbreviation ${record.serviceId}.`);
    }
  }
  const usedDayIds = new Set(records.map((record) => record.service.id));
  // Decision 0090 item 2: a service day with no Trips is left out of calendar.txt and listed.
  for (const day of input.serviceDays) {
    if (!usedDayIds.has(day.id)) warnings.push({ code: 'gtfsExport.daySkipped', serviceDayId: day.id, serviceDayName: day.name });
  }
  // Decision 0090 item 20: a block that also serves an unselected Route keeps its block_id on the selected Trips, and is listed.
  warnings.push(...sharedBlockWarnings(input, selectedRouteIds, new Set(records.map((record) => record.trip.id))));

  if (refusals.length > 0 || range === undefined) return { files: [], report: [], refusals, warnings, exportRouteIds: routeIdByRouteId };

  const plan = planCalendar({
    range,
    services: [...usedServices].map(([serviceId, day]) => ({ serviceId, kind: day.kind })),
    holidays,
  });
  const straight = settings.mapLines === 'straight';
  const shapeIdByPatternId = new Map<EntityId, string>();
  const shapes = shapesFor(exported, shapeIdByPatternId, notes, straight);

  const files: GtfsExportFile[] = [
    { name: 'agency.txt', text: agencyText(settings) },
    { name: 'stops.txt', text: stopsText(stopResult.stops) },
    { name: 'routes.txt', text: routesText(exported) },
    { name: 'trips.txt', text: tripsText(records, straight, shapeIdByPatternId) },
    { name: 'stop_times.txt', text: stopTimesText(records) },
    { name: 'calendar.txt', text: calendarText(plan) },
  ];
  if (plan.calendarDates.length > 0) files.push({ name: 'calendar_dates.txt', text: calendarDatesText(plan) });
  if (straight) files.push({ name: 'shapes.txt', text: shapesText(shapes) });
  files.push({ name: 'feed_info.txt', text: feedInfoText(settings, range, feedVersion) });

  const report = reportRows({ exported, records, usedServices, datesInRange: plan.datesInRange, straight, shapeIdByPatternId, notes });
  return { files, report, refusals: [], warnings, exportRouteIds: routeIdByRouteId };
}

/** Decision 0090 item 9: route_id = gtfsRouteId, else the short name, else the name; made unique with -2, -3. */
function uniqueRouteIds(routes: readonly Route[], notes: ExportReportRow[]): Map<EntityId, string> {
  const used = new Set<string>();
  const routeIds = new Map<EntityId, string>();
  for (const route of routes) {
    const base = route.gtfsRouteId?.trim() || route.shortName?.trim() || route.name.trim() || route.id;
    let candidate = base;
    for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${base}-${suffix}`;
    if (candidate !== base) notes.push({ kind: 'note', text: `Route ${route.name} is exported as route_id ${candidate}; ${base} is already used by an earlier Route.` });
    used.add(candidate);
    routeIds.set(route.id, candidate);
  }
  return routeIds;
}

/** An exported Route's patterns: those with Trips in the profile. A pattern whose direction has no group refuses the export (item 10). */
function prepareRoute(input: {
  aggregate: RouteDefinitionAggregate;
  routeId: string;
  set: RouteStopSet | undefined;
  trips: Trip[];
  refusals: GtfsExportIssue[];
  warnings: GtfsExportIssue[];
}): ExportedRoute {
  const { aggregate, routeId, set, trips, refusals, warnings } = input;
  const { route } = aggregate;
  const patternsInOrder = orderPatterns(aggregate.patterns);
  const positionByPatternId = new Map(patternsInOrder.map((pattern, index) => [pattern.id, index + 1] as const));
  const patternById = new Map(aggregate.patterns.map((pattern) => [pattern.id, pattern] as const));
  for (const trip of trips) {
    if (!patternById.has(trip.patternId)) throw new Error(`gtfsExport: Trip ${trip.id} runs on pattern ${trip.patternId}, which is not a pattern of Route ${route.id}.`);
  }
  const usedPatternIds = new Set(trips.map((trip) => trip.patternId));
  const groups = patternDirectionGroups(aggregate.patterns, aggregate.directions ?? []);
  const directionById = new Map((aggregate.directions ?? []).map((direction) => [direction.id, direction] as const));

  const patterns: AssignedPattern[] = [];
  const headsignByPatternId = new Map<EntityId, string>();
  for (const pattern of patternsInOrder) {
    if (!usedPatternIds.has(pattern.id)) continue;
    const direction = groups.get(pattern.id);
    if (direction === undefined) {
      refusals.push({ code: 'gtfsExport.directionUnassigned', routeId: route.id, routeName: route.name, patternId: pattern.id, patternName: pattern.name });
      continue;
    }
    patterns.push({ pattern, direction });
    const named = pattern.directionId === undefined ? undefined : directionById.get(pattern.directionId);
    headsignByPatternId.set(pattern.id, directionDisplayName(direction, named?.name));
  }

  // Decision 0090 item 15: a Route on its own counts is exported on the Scenario calendar and listed.
  if (route.ownAnnualServiceDays?.enabled) warnings.push({ code: 'gtfsExport.ownCountsNotExpressed', routeId: route.id, routeName: route.name });

  return { aggregate, routeId, set, patterns, headsignByPatternId, positionByPatternId, trips };
}

function exportRouteInput(route: ExportedRoute): ExportRouteInput {
  return {
    id: route.aggregate.route.id,
    name: route.aggregate.route.name,
    routeId: route.routeId,
    routeStops: (route.set?.stops ?? []).map((stop) => ({
      id: stop.id,
      name: stop.name,
      stopCode: stop.stopCode,
      latitude: stop.latitude,
      longitude: stop.longitude,
    })),
    patterns: route.patterns.map(({ pattern, direction }) => exportPatternInput(pattern, direction, route.set)),
  };
}

function exportPatternInput(pattern: RoutePattern, direction: DirectionGroup, set: RouteStopSet | undefined): ExportPatternInput {
  const codes = set?.timepointStopCodesByPatternId?.[pattern.id] ?? {};
  const locations = set?.timepointLocationsByPatternId?.[pattern.id] ?? {};
  return {
    id: pattern.id,
    name: pattern.name,
    direction,
    routeStopIds: (set?.placementsByPatternId[pattern.id] ?? []).map((placement) => placement.stopId),
    points: sortedPoints(pattern).map((point) => ({
      id: point.id,
      nodeId: point.nodeId,
      sequence: point.sequence,
      stopCode: codes[point.id],
      latitude: locations[point.id]?.latitude,
      longitude: locations[point.id]?.longitude,
    })),
  };
}

function exportNodeInput(node: Node): ExportNodeInput {
  return { id: node.id, name: node.name, shortName: node.shortName };
}

/** Decision 0090 item 14. Each holiday, as a GTFS date and the abbreviation of its service. Throws for a breach of the settings' own rules. */
function holidaysOf(
  settings: GtfsExportSettings,
  services: ReadonlyMap<EntityId, ServiceDayDefinition>,
  range: { start: string; end: string } | undefined,
): CalendarHoliday[] {
  const dates = new Set<string>();
  return settings.holidays.map((holiday) => {
    const date = gtfsDateFromIso(holiday.date);
    if (date === undefined) throw new Error(`gtfsExport: holiday date ${holiday.date} is not a real date.`);
    const day = services.get(holiday.serviceDayId);
    if (day === undefined) throw new Error(`gtfsExport: holiday ${holiday.date} names service day ${holiday.serviceDayId}, which is not in the Scenario.`);
    if (range !== undefined && (date < range.start || date > range.end)) throw new Error(`gtfsExport: holiday ${holiday.date} is outside the export range.`);
    if (dates.has(date)) throw new Error(`gtfsExport: holiday ${holiday.date} is listed twice; a date appears once (Decision 0090 item 14).`);
    dates.add(date);
    return { date, serviceId: serviceDayAbbreviation(day) };
  });
}

interface TripRecordsInput {
  exported: ExportedRoute[];
  stopResult: ExportStopsResult;
  services: ReadonlyMap<EntityId, ServiceDayDefinition>;
  blockLabelByTripId: ReadonlyMap<EntityId, string>;
  refusals: GtfsExportIssue[];
}

/**
 * The Trips that are written, with their stop times (Decision 0090 items 10 and 11). A Trip with a missing time is refused (item 19); a Trip on a
 * pattern without a direction was refused already and is left out.
 */
function tripRecords(input: TripRecordsInput): TripRecord[] {
  const { exported, stopResult, services, blockLabelByTripId, refusals } = input;
  const records: TripRecord[] = [];
  for (const route of exported) {
    const { aggregate, set } = route;
    for (const trip of route.trips) {
      const assigned = route.patterns.find((item) => item.pattern.id === trip.patternId);
      if (assigned === undefined) continue;
      const { pattern, direction } = assigned;
      const rows = stopTimeRows({ pattern, set, nodes: aggregate.nodes, trip });
      const timed = rows.flatMap((row) => (row.time === undefined ? [] : [{ row, time: row.time }]));
      const missing = rows.find((row) => row.time === undefined);
      const timepoints = timed.filter((item) => item.row.kind === 'timepoint');
      const firstDeparture = timepoints[0]?.time;
      const lastArrival = timepoints.at(-1)?.time;
      if (missing !== undefined || firstDeparture === undefined || lastArrival === undefined) {
        refusals.push({
          code: 'gtfsExport.tripTimeMissing',
          routeId: aggregate.route.id,
          routeName: aggregate.route.name,
          patternId: pattern.id,
          patternName: pattern.name,
          tripId: trip.id,
          stopName: (missing ?? timepoints[0]?.row)?.name,
        });
        continue;
      }
      // Nothing is missing, so `timed` has one entry per row, in row order, and `miles` lines up with it.
      const miles = rowMiles(rows, pattern, set);
      const stops: TripStop[] = timed.map(({ row, time }, index) => ({
        stopId: stopIdOf(row, pattern, route, stopResult),
        timepoint: row.kind === 'timepoint',
        time,
        miles: miles[index],
      }));
      const service = services.get(trip.serviceDayId);
      if (service === undefined) throw new Error(`gtfsExport: Trip ${trip.id} runs on service day ${trip.serviceDayId}, which is not in the Scenario.`);
      records.push({
        trip,
        route,
        pattern,
        direction,
        service,
        serviceId: serviceDayAbbreviation(service),
        firstDeparture,
        lastArrival,
        stops,
        blockLabel: blockLabelByTripId.get(trip.id),
        tripId: '',
      });
    }
  }
  return records;
}

/** The stop ID of a stop time row, from E1's maps. Every row of an exported pattern has one (E1 maps refused records too). */
function stopIdOf(row: StopTimeRow, pattern: RoutePattern, route: ExportedRoute, stopResult: ExportStopsResult): string {
  const stopId = row.kind === 'timepoint'
    ? stopResult.byTimepoint.get(pattern.id)?.get(row.patternPointId)
    : stopResult.byRouteStop.get(route.aggregate.route.id)?.get(row.stopId ?? '');
  if (stopId === undefined) throw new Error(`gtfsExport: no stop ID for ${row.kind === 'timepoint' ? `timepoint ${row.patternPointId}` : `stop ${row.stopId}`} of pattern ${pattern.id}.`);
  return stopId;
}

/** Decision 0090 item 12: by service_id, then route, direction, first departure; the trip ID breaks a tie. */
function sortRecords(records: TripRecord[]): void {
  records.sort((left, right) =>
    compareCodeUnits(left.serviceId, right.serviceId)
    || compareCodeUnits(left.route.routeId, right.route.routeId)
    || DIRECTION_ID[left.direction] - DIRECTION_ID[right.direction]
    || left.firstDeparture - right.firstDeparture
    || compareCodeUnits(left.trip.id, right.trip.id));
}

/**
 * Decision 0090 item 10 and G-E8. `<route_id>-<service_id>-<direction>-<first departure HHMM>-<n>`, where n counts the equal prefixes in
 * departure order. The records are sorted in that order already, so a running count gives n.
 */
function assignTripIds(records: TripRecord[]): void {
  const counts = new Map<string, number>();
  for (const record of records) {
    const prefix = `${record.route.routeId}-${record.serviceId}-${DIRECTION_ID[record.direction]}-${gtfsHhmm(record.firstDeparture)}`;
    const n = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, n);
    record.tripId = `${prefix}-${n}`;
  }
}

/** Decision 0090 item 20. A block with an exported Trip that also serves a Route that is not selected: one warning per such Route. */
function sharedBlockWarnings(input: BuildGtfsExportInput, selectedRouteIds: ReadonlySet<EntityId>, exportedTripIds: ReadonlySet<EntityId>): GtfsExportIssue[] {
  const tripById = new Map(input.trips.map((trip) => [trip.id, trip] as const));
  const unselectedNames = new Map((input.unselectedRoutes ?? []).map((route) => [route.id, route.name] as const));
  const warnings: GtfsExportIssue[] = [];
  for (const block of input.blocks ?? []) {
    const served = block.activities.flatMap((activity) => {
      if (activity.type !== 'revenueTrip') return [];
      const trip = tripById.get(activity.tripId);
      return trip === undefined ? [] : [trip];
    });
    if (!served.some((trip) => exportedTripIds.has(trip.id))) continue;
    const unselected = [...new Set(served.map((trip) => trip.routeId).filter((routeId) => !selectedRouteIds.has(routeId)))];
    for (const routeId of unselected) {
      warnings.push({ code: 'gtfsExport.blockServesUnselectedRoute', blockLabel: block.label, routeId, routeName: unselectedNames.get(routeId) ?? routeId });
    }
  }
  return warnings;
}

/**
 * Decision 0090 item 17. One shape per exported pattern: `<route_id>-<pattern short name>`, the short name being the one entered, or the
 * pattern's position when none is entered; a repeated ID is made unique. The shapes are built only when the map lines are straight.
 */
function shapesFor(exported: readonly ExportedRoute[], shapeIdByPatternId: Map<EntityId, string>, notes: ExportReportRow[], straight: boolean): ExportShape[] {
  const used = new Set<string>();
  const shapes: ExportShape[] = [];
  for (const route of exported) {
    for (const { pattern } of route.patterns) {
      const label = pattern.directionLabel?.trim() || String(route.positionByPatternId.get(pattern.id) ?? 1);
      const base = `${route.routeId}-${label}`;
      let candidate = base;
      for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${base}-${suffix}`;
      if (straight && candidate !== base) notes.push({ kind: 'note', text: `Pattern ${pattern.name} of Route ${route.aggregate.route.name} is shape_id ${candidate}; ${base} is already used.` });
      used.add(candidate);
      shapeIdByPatternId.set(pattern.id, candidate);
      if (straight) shapes.push({ shapeId: candidate, points: patternShapePoints(pattern, route.aggregate.nodes, route.set) });
    }
  }
  return shapes;
}

function requireIsoDate(value: string): string {
  if (gtfsDateFromIso(value) === undefined) throw new Error(`gtfsExport: export date ${value} is not a real date (YYYY-MM-DD).`);
  return value;
}

function agencyText(settings: GtfsExportSettings): string {
  return csvTable(['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], [{
    agency_id: AGENCY_ID,
    agency_name: settings.agencyName?.trim(),
    agency_url: settings.agencyUrl?.trim(),
    agency_timezone: settings.agencyTimezone?.trim(),
  }]);
}

function stopsText(stops: readonly ExportStop[]): string {
  return csvTable(['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], stops.map((stop) => ({
    stop_id: stop.stopId,
    stop_name: stop.name,
    stop_lat: coordinateText(stop.latitude),
    stop_lon: coordinateText(stop.longitude),
  })));
}

function routesText(exported: readonly ExportedRoute[]): string {
  const routes = [...exported].sort((left, right) => compareCodeUnits(left.routeId, right.routeId));
  const hasColor = routes.some((route) => route.aggregate.route.color !== undefined && route.aggregate.route.color.trim() !== '');
  const columns = ['route_id', 'agency_id', 'route_short_name', 'route_long_name', 'route_type', ...(hasColor ? ['route_color'] : [])];
  return csvTable(columns, routes.map((route) => ({
    route_id: route.routeId,
    agency_id: AGENCY_ID,
    route_short_name: route.aggregate.route.shortName?.trim() ?? '',
    route_long_name: route.aggregate.route.name.trim(),
    route_type: route.aggregate.route.gtfsRouteType ?? DEFAULT_ROUTE_TYPE,
    route_color: route.aggregate.route.color?.trim() ?? '',
  })));
}

function tripsText(records: readonly TripRecord[], straight: boolean, shapeIdByPatternId: ReadonlyMap<EntityId, string>): string {
  const columns = ['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'block_id', ...(straight ? ['shape_id'] : [])];
  return csvTable(columns, records.map((record) => ({
    route_id: record.route.routeId,
    service_id: record.serviceId,
    trip_id: record.tripId,
    trip_headsign: record.route.headsignByPatternId.get(record.pattern.id),
    direction_id: DIRECTION_ID[record.direction],
    block_id: record.blockLabel ?? '',
    shape_id: straight ? shapeIdByPatternId.get(record.pattern.id) : undefined,
  })));
}

/** Decision 0090 item 11. Every row of a Trip: a timepoint with `timepoint=1`, a Route stop with its derived time and `timepoint=0`. */
function stopTimesText(records: readonly TripRecord[]): string {
  const rows: Array<Record<string, CsvCell>> = records.flatMap((record) => record.stops.map((stop, index) => ({
    trip_id: record.tripId,
    arrival_time: gtfsClock(stop.time),
    departure_time: gtfsClock(stop.time),
    stop_id: stop.stopId,
    stop_sequence: index + 1,
    timepoint: stop.timepoint ? 1 : 0,
    shape_dist_traveled: milesText(stop.miles),
  })));
  return csvTable(['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'timepoint', 'shape_dist_traveled'], rows);
}

function calendarText(plan: CalendarPlan): string {
  return csvTable(['service_id', ...WEEKDAY_COLUMNS, 'start_date', 'end_date'], plan.calendar.map((row) => ({
    service_id: row.serviceId,
    ...Object.fromEntries(WEEKDAY_COLUMNS.map((column, index) => [column, row.weekdays[index] ? 1 : 0])),
    start_date: row.start,
    end_date: row.end,
  })));
}

function calendarDatesText(plan: CalendarPlan): string {
  return csvTable(['service_id', 'date', 'exception_type'], plan.calendarDates.map((row) => ({
    service_id: row.serviceId,
    date: row.date,
    exception_type: row.exceptionType,
  })));
}

function feedInfoText(settings: GtfsExportSettings, range: { start: string; end: string }, feedVersion: string): string {
  return csvTable(['feed_publisher_name', 'feed_publisher_url', 'feed_lang', 'feed_start_date', 'feed_end_date', 'feed_version'], [{
    feed_publisher_name: settings.agencyName?.trim(),
    feed_publisher_url: settings.agencyUrl?.trim(),
    feed_lang: 'en',
    feed_start_date: range.start,
    feed_end_date: range.end,
    feed_version: feedVersion,
  }]);
}

function reportRows(input: {
  exported: readonly ExportedRoute[];
  records: readonly TripRecord[];
  usedServices: ReadonlyMap<string, ServiceDayDefinition>;
  datesInRange: (serviceId: string) => number;
  straight: boolean;
  shapeIdByPatternId: ReadonlyMap<EntityId, string>;
  notes: readonly ExportReportRow[];
}): ExportReportRow[] {
  const { exported, records, usedServices, datesInRange, straight, shapeIdByPatternId, notes } = input;
  const serviceIds = [...usedServices.keys()].sort(compareCodeUnits);
  const rows: ExportReportRow[] = [];
  for (const route of exported) {
    for (const serviceId of serviceIds) {
      const own = records.filter((record) => record.route === route && record.serviceId === serviceId);
      if (own.length === 0) continue;
      const service = usedServices.get(serviceId);
      if (service === undefined) continue;
      const runningSeconds = own.reduce((sum, record) => sum + (record.lastArrival - record.firstDeparture), 0);
      rows.push({
        kind: 'serviceDay',
        routeId: route.routeId,
        routeName: route.aggregate.route.name,
        serviceId,
        serviceDayName: service.name,
        trips: own.length,
        runningHours: runningSeconds / 3600,
        datesInRange: datesInRange(serviceId),
        scenarioAnnualServiceDays: service.annualServiceDays,
      });
    }
  }
  for (const route of exported) {
    for (const { pattern, direction } of route.patterns) {
      rows.push({
        kind: 'pattern',
        routeId: route.routeId,
        routeName: route.aggregate.route.name,
        patternName: pattern.name,
        directionId: DIRECTION_ID[direction],
        shapeId: straight ? shapeIdByPatternId.get(pattern.id) : undefined,
      });
    }
  }
  rows.push(...notes);
  rows.push({ kind: 'note', text: 'Directions: Outbound is direction_id 0 and Inbound is direction_id 1 (Decision 0090 item 10).' });
  rows.push({
    kind: 'note',
    text: straight
      ? 'Map lines: straight lines through each pattern\'s located stops and timepoints, in order, with miles from the pattern (Decision 0090 item 17).'
      : 'Map lines: none. shapes.txt is not written and trips.txt has no shape_id.',
  });
  rows.push({ kind: 'note', text: 'Calendar: each service runs on the Scenario\'s weekday kinds over the export range, with the holidays applied. Routes on their own counts are listed as warnings (Decision 0090 item 15).' });
  return rows;
}
