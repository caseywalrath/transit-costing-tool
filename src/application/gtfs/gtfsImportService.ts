// The application side of a GTFS import (Decision 0089 items 2 to 5, 9 and 11): reads a feed ZIP into tables, refuses a feed the rules
// cannot read, and writes a new Project (level A), a new Scenario (level B), or new Routes in an existing Scenario (level C). The reading
// and the planning run in a worker when the browser allows it (gtfsWorkerClient.ts); the functions here are the code both paths run.

import { exportProjectJson } from '../../persistence/backup';
import { findFeedFiles, readFeedHeader, readFeedTable } from '../../persistence/gtfs/feedFiles';
import { readZipEntries, type ZipEntry } from '../../persistence/gtfs/zipReader';
import { feedServiceRange } from '../../domain/gtfs/calendar';
import { type AnnualCountProposal, proposeRouteOwnCounts } from '../../domain/gtfs/annualCounts';
import { GtfsFeedError, type GtfsTables, type Row } from '../../domain/gtfs/feedTables';
import { type FeedDayPlan, feedImportNote, planFeedDays, type ScenarioFromFeed, type ScenarioFromFeedOptions, projectFromFeed, scenarioFromFeed } from '../../domain/gtfs/scenarioFromFeed';
import type { GtfsDate } from '../../domain/gtfs/time';
import { type FeedTranslation, translateFeed, type TranslateServiceDay } from '../../domain/gtfs/translateFeed';
import { newId } from '../../domain/ids';
import type { ScenarioRecords } from '../../domain/project';
import type { EntityId, Project, Route, RouteOwnAnnualServiceDays } from '../../domain/types';
import type { RouteDefinitionRepository } from '../ports';
import type { RouteDefinitionService } from '../routeDefinitionService';
import { SaveStatusPublisher } from '../saveStatus';

/** The planner's choices, the options that the feed itself does not supply. */
export type FeedPlanOptions = Omit<ScenarioFromFeedOptions, 'tables' | 'routeIds' | 'fileName' | 'now'>;

/** One reading and planning run: the feed bytes and the planner's choices. Plain data, so it can cross into a worker. */
export interface FeedJob {
  bytes: Uint8Array;
  fileName: string;
  routeIds: string[];
  now: string;
  plan: FeedPlanOptions;
}

/** What a run returns: the tables (the import needs them) and the translation and counts the planner reviews. Plain data. */
export interface FeedJobResult {
  tables: GtfsTables;
  translation: FeedTranslation;
  counts: AnnualCountProposal;
}

const NO_TRIPS_MESSAGE = 'No selected Route has a trip in this feed, so there is nothing to import.';

/** The files every import needs (Decision 0089 item 11, second bullet): the calendars are checked separately. */
const REQUIRED_FILES = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'] as const;

/**
 * The columns each table must have (Decision 0089 item 11, third bullet). Both time columns are required: the translation reads each
 * stop's arrival and departure, and a missing column would reach its time parser as undefined.
 */
const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  'routes.txt': ['route_id'],
  'trips.txt': ['route_id', 'service_id', 'trip_id'],
  'stop_times.txt': ['trip_id', 'stop_id', 'stop_sequence', 'arrival_time', 'departure_time'],
  'stops.txt': ['stop_id'],
};

/** Refuses the feed when a file the import needs is absent (Decision 0089 item 11, second bullet). */
function requireFiles(files: Map<string, ZipEntry>): void {
  for (const file of REQUIRED_FILES) {
    if (!files.has(file)) throw new GtfsFeedError(`${file} is missing from the feed, so the feed cannot be imported.`);
  }
  if (!files.has('calendar.txt') && !files.has('calendar_dates.txt')) {
    throw new GtfsFeedError('The feed has neither calendar.txt nor calendar_dates.txt, so the feed cannot be imported.');
  }
}

/**
 * Refuses the table when a column the rules need is missing from its header (Decision 0089 item 11, third bullet). The header is read from
 * the file itself, so a table with no data rows is checked too.
 */
async function requireColumns(bytes: Uint8Array, file: string, entry: ZipEntry): Promise<void> {
  const header = new Set(await readFeedHeader(bytes, entry));
  for (const column of REQUIRED_COLUMNS[file] ?? []) {
    if (!header.has(column)) throw new GtfsFeedError(`${file} has no ${column} column, so the feed cannot be imported.`);
  }
}

/**
 * Reads the feed's tables for the selected Routes (Decision 0089 items 7, 8 and 11). The required files and columns are checked before any
 * row is read. Routes, trips and the calendars are read first; stop_times.txt is read once, keeping only the rows of trips of the selected
 * Routes. A refused feed returns nothing.
 */
export async function readFeedTables(bytes: Uint8Array, routeIds: readonly string[], onFile?: (file: string) => void): Promise<GtfsTables> {
  const files = findFeedFiles(readZipEntries(bytes));
  requireFiles(files);
  for (const file of Object.keys(REQUIRED_COLUMNS)) {
    const entry = files.get(file);
    if (entry) await requireColumns(bytes, file, entry);
  }

  const read = async (file: string, keep?: (row: Row) => boolean): Promise<Row[]> => {
    const entry = files.get(file);
    if (!entry) return [];
    onFile?.(file);
    return readFeedTable(bytes, entry, keep);
  };

  const routes = await read('routes.txt');
  const trips = await read('trips.txt');
  const selected = new Set(routeIds);
  const selectedTripIds = new Set(trips.filter((trip) => selected.has(trip.route_id)).map((trip) => trip.trip_id));
  const agency = await read('agency.txt');
  const calendar = await read('calendar.txt');
  const calendarDates = await read('calendar_dates.txt');
  const frequencies = await read('frequencies.txt');
  const shapes = await read('shapes.txt');
  const feedInfo = await read('feed_info.txt');
  const stops = await read('stops.txt');
  const stopTimes = await read('stop_times.txt', (row) => selectedTripIds.has(row.trip_id));

  return {
    agency,
    routes,
    trips,
    stopTimes,
    stops,
    calendar,
    calendarDates,
    frequencies,
    shapes,
    feedInfo,
    fileNames: [...files.keys()].sort(),
  };
}

/** Reads and plans one feed: the tables, then the translation and counts the planner reviews. Nothing is written. */
export async function runFeedJob(job: FeedJob, onFile?: (file: string) => void): Promise<FeedJobResult> {
  const tables = await readFeedTables(job.bytes, job.routeIds, onFile);
  // The planning Scenario is discarded; its identifiers only have to be unique within this run.
  const { translation, counts } = scenarioFromFeed(newId(), 'Existing service', {
    ...job.plan,
    tables,
    routeIds: job.routeIds,
    fileName: job.fileName,
    now: job.now,
  });
  return { tables, translation, counts };
}

/** 'YYYYMMDD' → 'YYYY-MM-DD', the form Project and Scenario names and import notes use. */
function isoDate(date: GtfsDate): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
}

/** The feed version when the feed names one, otherwise the first date of its service (Decision 0089 item 2). */
function importLabel(tables: GtfsTables, start: GtfsDate): string {
  return tables.feedInfo[0]?.feed_version?.trim() || isoDate(start);
}

/** The name, with " 2", " 3", … added until it is not one of `taken` (Decision 0089 item 3). */
function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The four standard service days a Scenario holds, by the feed key that names each (Decision 0089 item 13). */
const STANDARD_KEYS = ['weekday', 'saturday', 'sunday', 'holiday'] as const;
type StandardKey = (typeof STANDARD_KEYS)[number];
const STANDARD_NAMES: Record<StandardKey, string> = { weekday: 'Weekday', saturday: 'Saturday', sunday: 'Sunday', holiday: 'Holiday' };

function isStandardKey(key: string): key is StandardKey {
  return (STANDARD_KEYS as readonly string[]).includes(key);
}

export interface AddRoutesReport {
  translation: FeedTranslation;
  /** The Routes added, by the name each has in the Scenario now (a clash with an existing name gets " (feed)"). */
  routeNames: string[];
  /** Standard service days whose proposed annual count differs from the Scenario's count. The Scenario's counts are not changed. */
  countDifferences: Array<{ serviceDay: string; proposed: number; scenario: number }>;
  /** Feed service days whose trips were not imported: custom holiday days, and days the Scenario has no service day for. */
  notImported: Array<{ serviceDay: string; date: GtfsDate; proposedAnnualDays: number; reason: 'customDay' | 'noServiceDay' }>;
}

/**
 * Adds the feed's Routes to one Scenario (Decision 0089 level C). The feed's service days are matched to the Scenario's own: the standard
 * days by kind, and each feed day gets the Scenario's day of that kind. Custom days have no Scenario day to take their trips, so they are
 * not imported and are listed. The Scenario's service days and counts do not change. The Scenario gains one import note.
 */
function addFeedRoutes(
  current: ScenarioRecords,
  tripProfileId: string,
  blockingScenarioId: string | undefined,
  options: ScenarioFromFeedOptions,
  plan: FeedDayPlan,
): { records: ScenarioRecords; report: AddRoutesReport } {
  if (!current.tripProfiles?.some((profile) => profile.id === tripProfileId)) {
    throw new Error('The Trip profile to receive the trips no longer exists, so nothing was imported.');
  }
  if (blockingScenarioId !== undefined) {
    const blocking = current.blockingScenarios?.find((scenario) => scenario.id === blockingScenarioId);
    if (!blocking || blocking.tripProfileId !== tripProfileId) {
      throw new Error('The Blocking scenario to receive the blocks is not on the chosen Trip profile, so nothing was imported.');
    }
  }

  const firstOfKind = (kind: string) => [...current.serviceDays].filter((day) => day.kind === kind).sort((a, b) => a.sequence - b.sequence)[0];
  const imported: TranslateServiceDay[] = [];
  const notImported: AddRoutesReport['notImported'] = [];
  for (const day of plan.days) {
    const feedName = isStandardKey(day.key) ? STANDARD_NAMES[day.key] : (plan.holidayDays.find((holiday) => holiday.key === day.key)?.name ?? day.key);
    const proposedAnnualDays = plan.counts.countsByKey[day.key] ?? 0;
    const existing = isStandardKey(day.key) ? firstOfKind(day.key) : undefined;
    if (!existing) {
      notImported.push({ serviceDay: feedName, date: day.date, proposedAnnualDays, reason: isStandardKey(day.key) ? 'noServiceDay' : 'customDay' });
      continue;
    }
    imported.push({
      key: day.key,
      serviceDayId: existing.id,
      name: existing.name,
      date: day.date,
      ...(day.dateByRouteId ? { dateByRouteId: day.dateByRouteId } : {}),
    });
  }

  const countDifferences: AddRoutesReport['countDifferences'] = [];
  for (const key of STANDARD_KEYS) {
    const existing = firstOfKind(key);
    if (!existing) continue;
    const proposed = plan.counts.countsByKey[key] ?? 0;
    if (proposed !== existing.annualServiceDays) countDifferences.push({ serviceDay: existing.name, proposed, scenario: existing.annualServiceDays });
  }

  const translation = translateFeed({
    tables: options.tables,
    routeIds: options.routeIds,
    scenarioId: current.scenario.id,
    tripProfileId,
    serviceDays: imported,
    blocks: {
      import: blockingScenarioId !== undefined && (options.blocks?.import ?? false),
      blockingScenarioId,
      pullOutMinutes: options.blocks?.pullOutMinutes,
      pullInMinutes: options.blocks?.pullInMinutes,
    },
    existingRouteNames: current.routes.map((route) => route.name),
    now: options.now,
  });
  if (translation.routes.length === 0) {
    const reasons = translation.skippedRoutes.map((skipped) => `${skipped.routeId}: ${skipped.reason}`).join('; ');
    throw new Error(`No selected Route can be imported. ${reasons}`);
  }

  // Part-year Routes get their own counts on the Scenario's days that the import imports (Decision 0089 item 41).
  const switchedOn = options.routeOwnCountsOn ?? [];
  const flaggedRouteIds = new Set(plan.partYear.map((flag) => flag.routeId));
  for (const routeId of switchedOn) {
    if (!flaggedRouteIds.has(routeId)) {
      throw new Error(`Route ${routeId} has no proposed own counts, because only part-year Routes are proposed; it cannot be switched on.`);
    }
  }
  const ownByFeedRouteId = new Map<string, RouteOwnAnnualServiceDays>();
  for (const routeId of flaggedRouteIds) {
    const perKey = proposeRouteOwnCounts(options.tables, routeId, plan.classOfDate, plan.counts.rangeDates);
    const countsByServiceDayId: Record<EntityId, number> = {};
    for (const [key, count] of Object.entries(perKey)) {
      const day = imported.find((candidate) => candidate.key === key);
      if (day) countsByServiceDayId[day.serviceDayId] = count;
    }
    ownByFeedRouteId.set(routeId, { enabled: switchedOn.includes(routeId), countsByServiceDayId });
  }
  const routes: Route[] = translation.routes.map(({ route }) => {
    const own = route.gtfsRouteId !== undefined ? ownByFeedRouteId.get(route.gtfsRouteId) : undefined;
    return own ? { ...route, ownAnnualServiceDays: own } : route;
  });

  const datesByServiceDayId: Record<EntityId, string> = {};
  for (const day of imported) datesByServiceDayId[day.serviceDayId] = isoDate(day.date);
  const note = feedImportNote(options.tables, options.fileName, options.now, datesByServiceDayId, translation.routes.length);
  const stopSets = translation.routes.flatMap((item) => (item.stopSet ? [item.stopSet] : []));

  const records: ScenarioRecords = {
    ...current,
    scenario: { ...current.scenario, importNotes: [...(current.scenario.importNotes ?? []), note], updatedAt: options.now },
    routes: [...current.routes, ...routes],
    nodes: [...current.nodes, ...translation.routes.flatMap((item) => item.nodes)],
    patterns: [...current.patterns, ...translation.routes.flatMap((item) => item.patterns)],
    directions: [...(current.directions ?? []), ...translation.routes.flatMap((item) => item.directions)],
    runtimeProfiles: [...current.runtimeProfiles, ...translation.routes.flatMap((item) => item.runtimeProfiles)],
    runtimeAssignments: [...current.runtimeAssignments, ...translation.routes.flatMap((item) => item.runtimeAssignments)],
    trips: [...current.trips, ...translation.routes.flatMap((item) => item.trips)],
    blocks: [...current.blocks, ...translation.blocks],
    ...(stopSets.length > 0 || current.routeStopSets ? { routeStopSets: [...(current.routeStopSets ?? []), ...stopSets] } : {}),
  };
  return {
    records,
    report: { translation, routeNames: routes.map((route) => route.name), countDifferences, notImported },
  };
}

export type GtfsImportRepository = Pick<RouteDefinitionRepository, 'getProject' | 'listScenarios' | 'saveScenarioRecords' | 'updateScenarioRecords'>;

export class GtfsImportService {
  /**
   * `routeDefinition` is the Route definition service, so that level A goes through the same project-import path as a backup import.
   * `saveStatus` is the application's one save-status publisher; the level B and level C writes publish through it.
   */
  constructor(
    private readonly repository: GtfsImportRepository,
    private readonly routeDefinition: Pick<RouteDefinitionService, 'importProject'>,
    private readonly saveStatus: SaveStatusPublisher = new SaveStatusPublisher(),
  ) {}

  /**
   * Level A (Decision 0089 item 2): a new Project holding one Scenario, written as a copy through the project-import path. The copy is named
   * as the feed's Project is named, not "… Copy".
   */
  async importAsProject(options: ScenarioFromFeedOptions): Promise<Project> {
    const snapshot = projectFromFeed(options);
    return this.routeDefinition.importProject(exportProjectJson(snapshot), { name: snapshot.project.name });
  }

  /**
   * Level B (Decision 0089 item 3): a new Scenario in the Project, named "Existing service ({feed version or first date})". The Scenario and
   * everything it owns are written in one Scenario write. A Project that no longer exists is refused and nothing is written.
   */
  async importAsScenario(projectId: string, options: ScenarioFromFeedOptions): Promise<ScenarioFromFeed> {
    if (!(await this.repository.getProject(projectId))) {
      throw new Error('The Project to import into no longer exists, so nothing was imported.');
    }
    const range = feedServiceRange(options.tables, new Set(options.routeIds));
    if (!range) throw new Error(NO_TRIPS_MESSAGE);
    const taken = new Set((await this.repository.listScenarios(projectId)).map((scenario) => scenario.name));
    const name = uniqueName(`Existing service (${importLabel(options.tables, range.start)})`, taken);
    const planned = scenarioFromFeed(projectId, name, options);
    await this.saveStatus.run(() => this.repository.saveScenarioRecords(planned.records));
    return planned;
  }

  /**
   * Level C (Decision 0089 item 4): adds the feed's Routes to an existing Scenario, with their trips on `tripProfileId` and their blocks on
   * `blockingScenarioId` when one is given. The check of the Scenario's records and the write are one Scenario write, so names are read as
   * the Scenario is at the time of the write. Restore points are not taken here; the caller wraps this method in the restore-point coverage.
   */
  async addRoutes(
    scenarioId: string,
    tripProfileId: string,
    blockingScenarioId: string | undefined,
    options: ScenarioFromFeedOptions,
  ): Promise<AddRoutesReport> {
    const plan = planFeedDays(options);
    const outcome: { report?: AddRoutesReport } = {};
    await this.saveStatus.run(() =>
      this.repository.updateScenarioRecords(scenarioId, (current) => {
        const added = addFeedRoutes(current, tripProfileId, blockingScenarioId, options, plan);
        outcome.report = added.report;
        return added.records;
      }),
    );
    if (!outcome.report) throw new Error('The Routes were not added.');
    return outcome.report;
  }
}
