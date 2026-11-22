// Translates a feed, for the chosen service days, into Routes with their run-time profiles, Trips and Blocks, and the report of what was
// imported and what was left out (Decision 0089 items 4, 12, 19, 30 to 37 and 44). A Route that cannot be imported is skipped with its
// reason, listed in its own report section, and the rest of the import goes on (Decision 0089 item 12). A Route with no trips on any
// chosen date is skipped with the reason noTripsOnChosenDates. Pure: it reads the parsed feed and returns records; nothing is written here.

import { metadata, newId } from '../ids';
import { validateRuntimeProfile } from '../runtime';
import { validateRouteStopSet } from '../stops';
import type {
  BlockingBlock,
  EntityId,
  Route,
  RoutePattern,
  RuntimeAssignment,
  RuntimeProfile,
  Trip,
} from '../types';
import { blockFromFeed, type BlockMember } from './blocksFromFeed';
import { GtfsFeedError, type GtfsTables, type Row, USED_FEED_FILES } from './feedTables';
import {
  exceedsSizeWarning,
  type FidelityRow,
  type ImportReport,
  type ImportReportRow,
  type RouteSummary,
} from './reportFromFeed';
import { type FeedShapePoint, type GtfsFinding, type RouteFromFeed, routeFromFeed } from './routeFromFeed';
import { runtimeProfileFromFeed, timesAtPatternPoints } from './runtimesFromFeed';
import type { GtfsDate } from './time';
import { tripFromFeed } from './tripsFromFeed';
import { type FeedTrip, type InvalidTripReason, runningSeconds, type TripsOnDate, tripsOnDate } from './tripsOnDate';

export { importReportCsv, type ImportReport } from './reportFromFeed';

/** One service day the import creates, with the date it takes from the feed. */
export interface TranslateServiceDay {
  /** Unique within the import, for example 'weekday'. */
  key: string;
  serviceDayId: EntityId;
  name: string;
  /** The date every Route uses for this service day, unless dateByRouteId gives that Route its own. */
  date: GtfsDate;
  /** Feed route_id → the date that Route uses for this service day (Decision 0089 item 17). */
  dateByRouteId?: Record<string, GtfsDate>;
}

export interface TranslateFeedInput {
  tables: GtfsTables;
  /** The feed's route_id values to import, in the order they should appear. */
  routeIds: string[];
  scenarioId: EntityId;
  tripProfileId: EntityId;
  serviceDays: TranslateServiceDay[];
  blocks: {
    import: boolean;
    blockingScenarioId?: EntityId;
    pullOutMinutes?: number;
    pullInMinutes?: number;
  };
  /** Feed route_id → pattern key → the stop IDs the planner chose as timepoints (Decision 0089 item 26). */
  timepointOverrides?: Record<string, Record<string, string[]>>;
  /** Names of the Routes already in the Scenario. A feed Route with one of these names (ignoring case) is named "{name} (feed)". */
  existingRouteNames?: string[];
  now: string;
}

export interface TranslatedRoute extends RouteFromFeed {
  runtimeProfiles: RuntimeProfile[];
  runtimeAssignments: RuntimeAssignment[];
  trips: Trip[];
}

export interface SkippedRoute {
  routeId: string;
  reason: string;
}

export interface FeedTranslation {
  routes: TranslatedRoute[];
  blocks: BlockingBlock[];
  skippedRoutes: SkippedRoute[];
  report: ImportReport;
}

/** A trip of an imported Route on one service day, with the Nodes it starts and ends at. */
interface TripRecord {
  day: TranslateServiceDay;
  feedRouteId: string;
  feedTrip: FeedTrip;
  trip: Trip;
  startNodeId: EntityId;
  endNodeId: EntityId;
}

interface ImportedRoute {
  feedRouteId: string;
  translated: TranslatedRoute;
  records: TripRecord[];
  findings: GtfsFinding[];
  renamed: boolean;
}

interface RouteEntry {
  day: TranslateServiceDay;
  trip: FeedTrip;
}

interface BuildContext {
  scenarioId: EntityId;
  tripProfileId: EntityId;
  serviceDays: TranslateServiceDay[];
  stops: ReadonlyMap<string, Row>;
  shapes: ReadonlyMap<string, FeedShapePoint[]>;
  overrides: Record<string, Record<string, string[]>>;
  existingNames: ReadonlySet<string>;
  now: string;
}

interface DayFeed {
  trips: TripsOnDate;
  invalidByRoute: Map<string, TripsOnDate['invalid']>;
}

/** One trip with the block_id it carries, whether it is imported, and why it is not when it is not. */
interface BlockMemberRef {
  routeId: string;
  tripId: string;
  record?: TripRecord;
  invalidReason?: InvalidTripReason;
}

interface LeftOutBlock {
  serviceDay: string;
  label: string;
  routeIds: string[];
  reason: string;
  refused: boolean;
}

export function translateFeed(input: TranslateFeedInput): FeedTranslation {
  const { tables, serviceDays, blocks, now } = input;
  if (blocks.import && blocks.blockingScenarioId === undefined) {
    throw new GtfsFeedError('Blocks can be imported only into a Blocking scenario');
  }
  // Blank minutes would make every pull-out fail the existing block checks, so the planner must give them (0 allowed).
  if (blocks.import && (!isWholeMinutes(blocks.pullOutMinutes) || !isWholeMinutes(blocks.pullInMinutes))) {
    throw new GtfsFeedError('Pull-out and pull-in minutes are required to import blocks (whole minutes, 0 or more)');
  }
  const routeIds = [...new Set(input.routeIds)];
  const routeRows = firstRowsBy(tables.routes, 'route_id');
  const context: BuildContext = {
    scenarioId: input.scenarioId,
    tripProfileId: input.tripProfileId,
    serviceDays,
    stops: firstRowsBy(tables.stops, 'stop_id'),
    shapes: shapePointsById(tables.shapes),
    overrides: input.timepointOverrides ?? {},
    existingNames: new Set((input.existingRouteNames ?? []).map(nameKey)),
    now,
  };

  // Every trip on a date is read once, for all Routes, so that a block's trips on other Routes are known (Decision 0089 item 34).
  const feeds = new Map<GtfsDate, DayFeed>();
  const feedOn = (date: GtfsDate): DayFeed => {
    const cached = feeds.get(date);
    if (cached) return cached;
    const trips = tripsOnDate(tables, date);
    const invalidByRoute = new Map<string, TripsOnDate['invalid']>();
    for (const item of trips.invalid) pushTo(invalidByRoute, item.routeId, item);
    const feed: DayFeed = { trips, invalidByRoute };
    feeds.set(date, feed);
    return feed;
  };
  const dateOf = (day: TranslateServiceDay, routeId: string): GtfsDate => day.dateByRouteId?.[routeId] ?? day.date;

  const imported: ImportedRoute[] = [];
  const skipped: SkippedRoute[] = [];
  for (const routeId of routeIds) {
    const routeRow = routeRows.get(routeId);
    if (routeRow === undefined) {
      skipped.push({ routeId, reason: 'Not in routes.txt' });
      continue;
    }
    const entries: RouteEntry[] = [];
    for (const day of serviceDays) {
      for (const trip of feedOn(dateOf(day, routeId)).trips.byRoute.get(routeId) ?? []) entries.push({ day, trip });
    }
    // A Route with no trips on any chosen date is not created (Decision 0089 item 12 informs only; the coordinator's review answer).
    if (entries.length === 0) {
      skipped.push({ routeId, reason: 'noTripsOnChosenDates' });
      continue;
    }
    const outcome = buildRoute(routeRow, entries, context);
    if ('reason' in outcome) skipped.push({ routeId, reason: outcome.reason });
    else imported.push(outcome.route);
  }

  const recordsByKey = new Map<string, TripRecord>();
  const recordsByDayRoute = new Map<string, TripRecord[]>();
  for (const route of imported) {
    for (const record of route.records) {
      recordsByKey.set(tripKey(record.day.key, record.feedRouteId, record.feedTrip.tripId), record);
      pushTo(recordsByDayRoute, dayRouteKey(record.day.key, record.feedRouteId), record);
    }
  }

  // Blocks: a block is imported for a service day when every trip with its block_id on that day is imported (Decision 0089 item 34).
  const tripsById = new Map<EntityId, Trip>();
  const patternsById = new Map<EntityId, RoutePattern>();
  for (const route of imported) {
    for (const record of route.records) tripsById.set(record.trip.id, record.trip);
    for (const pattern of route.translated.patterns) patternsById.set(pattern.id, pattern);
  }
  const allRouteIds = [...new Set(tables.trips.map((row) => row.route_id))];
  const blockIdOfTrip = blockIdsByTripId(tables.trips);
  const importedBlocks: BlockingBlock[] = [];
  const leftOut: LeftOutBlock[] = [];
  const blockCountByRoute = new Map<string, number>();
  if (blocks.import && blocks.blockingScenarioId !== undefined) {
    const blockingScenarioId = blocks.blockingScenarioId;
    for (const day of serviceDays) {
      const membersByBlock = new Map<string, BlockMemberRef[]>();
      for (const routeId of allRouteIds) {
        const feed = feedOn(dateOf(day, routeId));
        for (const trip of feed.trips.byRoute.get(routeId) ?? []) {
          if (trip.blockId === undefined) continue;
          const record = recordsByKey.get(tripKey(day.key, routeId, trip.tripId));
          pushTo(membersByBlock, trip.blockId, { routeId, tripId: trip.tripId, record });
        }
        for (const item of feed.invalidByRoute.get(routeId) ?? []) {
          const blockId = blockIdOfTrip.get(item.tripId);
          // A caller may read stop times only for the selected Routes, so another Route's trip can look invalid here; it is reported as "also serves".
          if (blockId !== undefined) pushTo(membersByBlock, blockId, { routeId, tripId: item.tripId, invalidReason: routeIds.includes(routeId) ? item.reason : undefined });
        }
      }

      const usedLabels = new Set<string>();
      for (const blockId of [...membersByBlock.keys()].sort(compareText)) {
        const members = membersByBlock.get(blockId) ?? [];
        const importedMembers = members.flatMap((member) =>
          member.record === undefined ? [] : [{ routeId: member.routeId, tripId: member.tripId, record: member.record }],
        );
        if (importedMembers.length === 0) continue;
        const label = blockId.trim();
        const routesOfBlock = uniqueStrings(importedMembers.map((member) => member.routeId));
        if (importedMembers.length < members.length) {
          leftOut.push({ serviceDay: day.name, label, routeIds: routesOfBlock, reason: missingReason(members), refused: false });
          continue;
        }
        const blockLabel = freeLabel(label, usedLabels);
        const result = blockFromFeed({
          scenarioId: input.scenarioId,
          blockingScenarioId,
          serviceDayId: day.serviceDayId,
          label: blockLabel,
          members: importedMembers.map(
            (member): BlockMember => ({
              trip: member.record.trip,
              feedTripId: member.tripId,
              startNodeId: member.record.startNodeId,
              endNodeId: member.record.endNodeId,
            }),
          ),
          pullOutMinutes: blocks.pullOutMinutes,
          pullInMinutes: blocks.pullInMinutes,
          trips: tripsById,
          patterns: patternsById,
          now,
        });
        if ('findings' in result) {
          const rules = uniqueStrings(result.findings.map((finding) => finding.ruleId));
          leftOut.push({ serviceDay: day.name, label, routeIds: routesOfBlock, reason: rules.join(', '), refused: true });
          continue;
        }
        usedLabels.add(blockLabel);
        importedBlocks.push(result.block);
        for (const routeId of routesOfBlock) blockCountByRoute.set(routeId, (blockCountByRoute.get(routeId) ?? 0) + 1);
      }
    }
  }

  // Report rows, in the order a planner reads them: imported Routes, skipped Routes, invalid trips, approximate trips, blocks, fidelity
  // differences and files.
  const rows: ImportReportRow[] = [];
  for (const route of imported) {
    for (const finding of route.findings) rows.push(findingRow(finding));
    if (route.renamed) {
      rows.push(routeRow(route.feedRouteId, 'nameClash', `Named "${route.translated.route.name}" because a Route of this Scenario has the feed's name`));
    }
  }
  for (const item of skipped) {
    rows.push({ section: 'skipped', routeId: item.routeId, serviceDay: '', tripId: '', stopId: '', code: 'skipped', detail: item.reason });
  }
  for (const day of serviceDays) {
    for (const routeId of routeIds) {
      for (const item of feedOn(dateOf(day, routeId)).invalidByRoute.get(routeId) ?? []) {
        rows.push({ section: 'trip', routeId, serviceDay: day.name, tripId: item.tripId, stopId: '', code: item.reason, detail: 'Left out of the import' });
      }
    }
  }
  for (const route of imported) {
    for (const record of route.records) {
      if (record.feedTrip.frequency?.exact === false) {
        rows.push({ section: 'trip', routeId: route.feedRouteId, serviceDay: record.day.name, tripId: record.feedTrip.tripId, stopId: '', code: 'approximateFrequency', detail: 'Made from frequencies.txt; exact_times is not 1' });
      }
    }
  }
  for (const item of leftOut) {
    for (const routeId of item.routeIds) {
      rows.push({
        section: 'block',
        routeId,
        serviceDay: item.serviceDay,
        tripId: '',
        stopId: '',
        code: item.refused ? 'refused' : 'leftOut',
        detail: `${item.label}: ${item.reason}`,
      });
    }
  }

  // Fidelity (Decision 0089 item 37): every imported Route, on every service day. Skipped Routes are listed in their own section instead.
  const fidelity: FidelityRow[] = [];
  for (const routeId of imported.map((route) => route.feedRouteId)) {
    for (const day of serviceDays) {
      const feedTrips = feedOn(dateOf(day, routeId)).trips.byRoute.get(routeId) ?? [];
      const records = recordsByDayRoute.get(dayRouteKey(day.key, routeId)) ?? [];
      const recordOf = new Map(records.map((record) => [record.feedTrip.tripId, record]));
      const feedIds = new Set(feedTrips.map((trip) => trip.tripId));
      const feedSeconds = feedTrips.reduce((sum, trip) => sum + runningSeconds(trip), 0);
      const importedSeconds = records.reduce((sum, record) => sum + runningOf(record.trip), 0);
      fidelity.push({
        routeId,
        serviceDay: day.name,
        feedTrips: feedTrips.length,
        importedTrips: records.length,
        feedRunningSeconds: feedSeconds,
        importedRunningSeconds: importedSeconds,
      });
      for (const trip of feedTrips) {
        const record = recordOf.get(trip.tripId);
        if (record === undefined) {
          rows.push(fidelityRow(routeId, day.name, trip.tripId, 'notImported', 'Valid on the feed but not imported'));
          continue;
        }
        const fed = runningSeconds(trip);
        const got = runningOf(record.trip);
        if (fed !== got) rows.push(fidelityRow(routeId, day.name, trip.tripId, 'runningDiffers', `feed ${fed} s, imported ${got} s`));
      }
      for (const record of records) {
        if (!feedIds.has(record.feedTrip.tripId)) rows.push(fidelityRow(routeId, day.name, record.feedTrip.tripId, 'notInFeed', 'Imported but not on the feed'));
      }
    }
  }

  for (const name of tables.fileNames) {
    if (!USED_FEED_FILES.includes(name)) {
      rows.push({ section: 'file', routeId: '', serviceDay: '', tripId: '', stopId: '', code: 'notImported', detail: name });
    }
  }

  const tripsPerDay = new Map<string, number>();
  for (const route of imported) {
    for (const record of route.records) tripsPerDay.set(record.day.key, (tripsPerDay.get(record.day.key) ?? 0) + 1);
  }
  const busiestDay = Math.max(0, ...tripsPerDay.values());
  const fidelityOk =
    fidelity.every((row) => row.feedTrips === row.importedTrips && row.feedRunningSeconds === row.importedRunningSeconds) &&
    rows.every((row) => row.section !== 'fidelity');

  const routeSummaries: RouteSummary[] = imported.map((route) => ({
    routeId: route.feedRouteId,
    name: route.translated.route.name,
    patterns: route.translated.patterns.length,
    timepoints: route.translated.nodes.length,
    stops: route.translated.stopSet?.stops.length ?? 0,
    tripsByServiceDay: Object.fromEntries(serviceDays.map((day) => [day.name, route.records.filter((record) => record.day.key === day.key).length])),
    blocks: blockCountByRoute.get(route.feedRouteId) ?? 0,
  }));

  return {
    routes: imported.map((route) => route.translated),
    blocks: importedBlocks,
    skippedRoutes: skipped,
    report: {
      routes: routeSummaries,
      fidelity,
      rows,
      fidelityOk,
      sizeWarning: exceedsSizeWarning(routeIds.length, busiestDay),
    },
  };
}

/** One Route's trips on every chosen date, through routeFromFeed, then its profiles, assignments and Trips. Any failure skips the Route. */
function buildRoute(routeRow: Row, entries: readonly RouteEntry[], context: BuildContext): { route: ImportedRoute } | { reason: string } {
  try {
    const feedRouteId = routeRow.route_id;
    const result = routeFromFeed({
      scenarioId: context.scenarioId,
      routeRow,
      trips: entries.map((entry) => entry.trip),
      stops: context.stops,
      shapes: context.shapes,
      timepointOverrides: context.overrides[feedRouteId],
      now: context.now,
    });
    if (result.placements.length !== entries.length) {
      throw new GtfsFeedError(`Route ${feedRouteId} has ${result.placements.length} placements for ${entries.length} trips`);
    }
    if (result.stopSet) {
      const errors = validateRouteStopSet(result.stopSet, result.patterns).filter((finding) => finding.severity === 'error');
      if (errors.length > 0) {
        return { reason: `Route stops fail validation: ${uniqueStrings(errors.map((finding) => finding.ruleId)).join(', ')}` };
      }
    }

    const indexesOf = new Map<string, number[]>();
    result.placements.forEach((placement, index) => pushTo(indexesOf, groupKey(placement.patternId, entries[index].day.key), index));
    const patternById = new Map(result.patterns.map((pattern) => [pattern.id, pattern] as const));
    const profileOf = new Map<string, RuntimeProfile>();
    const runtimeProfiles: RuntimeProfile[] = [];
    const runtimeAssignments: RuntimeAssignment[] = [];
    for (const pattern of result.patterns) {
      for (const day of context.serviceDays) {
        const indexes = indexesOf.get(groupKey(pattern.id, day.key));
        if (indexes === undefined) continue;
        const profile = runtimeProfileFromFeed({
          pattern,
          serviceDayName: day.name,
          trips: indexes.map((index) => ({ pointTimes: timesAtPatternPoints(result.placements[index].points) })),
          now: context.now,
        });
        const errors = validateRuntimeProfile(profile, pattern).filter((finding) => finding.severity === 'error');
        if (errors.length > 0) {
          return { reason: `Run-time profile "${profile.name}" fails validation: ${uniqueStrings(errors.map((finding) => finding.ruleId)).join(', ')}` };
        }
        profileOf.set(groupKey(pattern.id, day.key), profile);
        runtimeProfiles.push(profile);
        runtimeAssignments.push({
          id: newId(),
          scenarioId: context.scenarioId,
          patternId: pattern.id,
          serviceDayId: day.serviceDayId,
          runtimeProfileId: profile.id,
          ...metadata(context.now),
        });
      }
    }

    const records: TripRecord[] = entries.map((entry, index) => {
      const placement = result.placements[index];
      const pattern = must(patternById.get(placement.patternId), `Trip ${entry.trip.tripId} has no pattern`);
      const profile = must(profileOf.get(groupKey(pattern.id, entry.day.key)), `Trip ${entry.trip.tripId} has no run-time profile`);
      const trip = tripFromFeed({
        scenarioId: context.scenarioId,
        tripProfileId: context.tripProfileId,
        routeId: result.route.id,
        serviceDayId: entry.day.serviceDayId,
        feedTrip: entry.trip,
        placement,
        pattern,
        profile,
        now: context.now,
      });
      return {
        day: entry.day,
        feedRouteId,
        feedTrip: entry.trip,
        trip,
        startNodeId: pattern.points[0].nodeId,
        endNodeId: pattern.points[pattern.points.length - 1].nodeId,
      };
    });

    // Decision 0089 item 4: a feed Route whose name a Route of the Scenario already has (ignoring case) is kept under "{name} (feed)".
    const renamed = context.existingNames.has(nameKey(result.route.name));
    const route: Route = renamed ? { ...result.route, name: `${result.route.name} (feed)` } : result.route;
    return {
      route: {
        feedRouteId,
        renamed,
        records,
        findings: result.findings,
        translated: {
          ...result,
          route,
          runtimeProfiles,
          runtimeAssignments,
          trips: records.map((record) => record.trip),
        },
      },
    };
  } catch (error) {
    return { reason: messageOf(error) };
  }
}

function missingReason(members: BlockMemberRef[]): string {
  const parts: string[] = [];
  const invalid = members.filter((member) => member.record === undefined && member.invalidReason !== undefined);
  if (invalid.length > 0) parts.push(`invalid trip ${invalid.map((member) => member.tripId).join(', ')}`);
  const others = uniqueStrings(members.filter((member) => member.record === undefined && member.invalidReason === undefined).map((member) => member.routeId));
  if (others.length > 0) parts.push(`also serves ${others.join(', ')}`);
  return parts.join('; ');
}

function freeLabel(base: string, used: ReadonlySet<string>): string {
  if (!used.has(base)) return base;
  let number = 2;
  while (used.has(`${base} (${number})`)) number += 1;
  return `${base} (${number})`;
}

function runningOf(trip: Trip): number {
  return (trip.stopTimes[trip.stopTimes.length - 1]?.time ?? 0) - (trip.stopTimes[0]?.time ?? 0);
}

function findingRow(finding: GtfsFinding): ImportReportRow {
  return {
    section: 'route',
    routeId: finding.routeId,
    serviceDay: '',
    tripId: finding.tripId ?? '',
    stopId: finding.stopId ?? '',
    code: finding.code,
    detail: [finding.patternKey, finding.detail].filter((part): part is string => part !== undefined && part !== '').join(' '),
  };
}

function routeRow(routeId: string, code: string, detail: string): ImportReportRow {
  return { section: 'route', routeId, serviceDay: '', tripId: '', stopId: '', code, detail };
}

function fidelityRow(routeId: string, serviceDay: string, tripId: string, code: string, detail: string): ImportReportRow {
  return { section: 'fidelity', routeId, serviceDay, tripId, stopId: '', code, detail };
}

/** The first row of each key, so a duplicated stop or Route ID keeps its first record. */
function firstRowsBy(rows: readonly Row[], column: string): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const key = row[column];
    if (key !== undefined && !map.has(key)) map.set(key, row);
  }
  return map;
}

/**
 * Shape points by shape_id, in file order (routeFromFeed sorts them by sequence). A shape with any point that is not a number is left
 * out altogether, so its patterns fall back to straight-line miles and say so in the report, rather than measuring a line with a gap.
 */
function shapePointsById(rows: readonly Row[]): Map<string, FeedShapePoint[]> {
  const shapes = new Map<string, FeedShapePoint[]>();
  const broken = new Set<string>();
  for (const row of rows) {
    const shapeId = row.shape_id ?? '';
    const latitude = numberOf(row.shape_pt_lat);
    const longitude = numberOf(row.shape_pt_lon);
    const sequence = numberOf(row.shape_pt_sequence);
    if (latitude === undefined || longitude === undefined || sequence === undefined) {
      broken.add(shapeId);
      continue;
    }
    pushTo(shapes, shapeId, { latitude, longitude, sequence });
  }
  for (const shapeId of broken) shapes.delete(shapeId);
  return shapes;
}

function numberOf(text: string | undefined): number | undefined {
  if (text === undefined || text.trim() === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/** Block ID per trip_id, as the trip reader keeps it: the value as written, when it is not blank. */
function blockIdsByTripId(rows: readonly Row[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const blockId = row.block_id;
    if (blockId === undefined || blockId.trim() === '' || map.has(row.trip_id)) continue;
    map.set(row.trip_id, blockId);
  }
  return map;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function tripKey(dayKey: string, feedRouteId: string, feedTripId: string): string {
  return `${dayKey}\u0001${feedRouteId}\u0001${feedTripId}`;
}

function dayRouteKey(dayKey: string, feedRouteId: string): string {
  return `${dayKey}\u0001${feedRouteId}`;
}

function groupKey(patternId: EntityId, dayKey: string): string {
  return `${patternId}\u0001${dayKey}`;
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new GtfsFeedError(message);
  return value;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isWholeMinutes(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0;
}
