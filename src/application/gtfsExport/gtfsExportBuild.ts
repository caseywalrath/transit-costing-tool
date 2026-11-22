// The pure part of a GTFS export (Decision 0090; card E4): the dialog's context from a Scenario's stored records, the feed builder's inputs
// for the planner's choices, and the check that sums an export up. It runs on the main thread or in the export worker
// (gtfsExportWorkerClient.ts), so it holds no storage and no DOM.

import { buildGtfsExport, type BuildGtfsExportInput } from '../../domain/gtfsExport/feed';
import { reportCsvText } from '../../domain/gtfsExport/report';
import type { GtfsExportIssue, GtfsExportResult } from '../../domain/gtfsExport/types';
import type { ScenarioRecords } from '../../domain/project';
import type { BlockingBlock, EntityId, GtfsExportSettings, RouteDefinitionAggregate, ServiceDayKind } from '../../domain/types';

/** One Route as the dialog lists it, with how many Trips it has on each Trip profile. */
export interface GtfsExportRouteInfo {
  id: EntityId;
  name: string;
  shortName?: string;
  tripsByProfileId: Record<EntityId, number>;
}

/** What the dialog needs to open: the Scenario's choices and the defaults for the settings. Plain data. */
export interface GtfsExportContext {
  scenarioId: EntityId;
  scenarioName: string;
  routes: GtfsExportRouteInfo[];
  tripProfiles: Array<{ id: EntityId; name: string }>;
  blockingScenarios: Array<{ id: EntityId; name: string; tripProfileId: EntityId }>;
  serviceDays: Array<{ id: EntityId; name: string; kind: ServiceDayKind }>;
  /** The settings the Scenario remembers (Decision 0090 item 16), when it has any. */
  saved?: GtfsExportSettings;
  /** Defaults from the Scenario's latest import note when nothing is remembered: the range of its dates and the feed's publisher. */
  fromImportNote?: { startDate?: string; endDate?: string; agencyName?: string };
}

/** The planner's choices in the dialog. `routeIds` are the Routes to export. */
export interface GtfsExportRequest {
  routeIds: readonly EntityId[];
  tripProfileId: EntityId;
  /** Omit for "None": no `block_id` is written. */
  blockingScenarioId?: EntityId;
  settings: GtfsExportSettings;
  /** YYYY-MM-DD, written as the feed version. Defaults to today. */
  exportDate?: string;
}

/** What one check says. `ready` is false while any refusal or settings problem stands. */
export interface GtfsExportCheck {
  ready: boolean;
  refusals: GtfsExportIssue[];
  warnings: GtfsExportIssue[];
  /** Present when the export would be written. */
  counts?: { routes: number; stops: number; trips: number; serviceDays: number; blocks: number };
  /** A breach of the settings' own rules that the dialog should have prevented (a holiday outside the range, a repeated date). */
  settingsProblem?: string;
}

/** A check and, when the export is not refused, the files and report text. Plain data, so it can cross out of the worker. */
export interface BuiltFeed {
  check: GtfsExportCheck;
  files: Array<{ name: string; text: string }>;
  reportCsv: string;
}

/** A file name stem that the browser and file systems accept: letters and digits, dashes between, lower case (the approved mock-up's "rtd-sep-2026-gtfs.zip"). */
export function safeFileStem(name: string): string {
  return name.replaceAll(/[^a-z0-9]+/gi, '-').replaceAll(/^-+|-+$/g, '').toLowerCase() || 'scenario';
}

const todayIso = (): string => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** The dialog's context from the stored records. */
export function exportContextOf(records: ScenarioRecords): GtfsExportContext {
  const profileIds = (records.tripProfiles ?? []).map((profile) => profile.id);
  const zeroCounts = (): Record<EntityId, number> => Object.fromEntries(profileIds.map((id) => [id, 0]));
  const tripsByRoute = new Map<EntityId, Record<EntityId, number>>();
  for (const trip of records.trips) {
    if (!trip.tripProfileId) continue;
    const counts = tripsByRoute.get(trip.routeId) ?? zeroCounts();
    counts[trip.tripProfileId] = (counts[trip.tripProfileId] ?? 0) + 1;
    tripsByRoute.set(trip.routeId, counts);
  }
  const note = records.scenario.importNotes?.at(-1);
  const noteDates = note ? Object.values(note.datesByServiceDayId).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort() : [];
  return {
    scenarioId: records.scenario.id,
    scenarioName: records.scenario.name,
    routes: records.routes.map((route) => ({
      id: route.id,
      name: route.name,
      ...(route.shortName ? { shortName: route.shortName } : {}),
      tripsByProfileId: tripsByRoute.get(route.id) ?? zeroCounts(),
    })),
    tripProfiles: (records.tripProfiles ?? []).map((profile) => ({ id: profile.id, name: profile.name })),
    blockingScenarios: (records.blockingScenarios ?? []).map((item) => ({ id: item.id, name: item.name, tripProfileId: item.tripProfileId })),
    serviceDays: [...records.serviceDays].sort((a, b) => a.sequence - b.sequence).map((day) => ({ id: day.id, name: day.name, kind: day.kind })),
    ...(records.scenario.gtfsExportSettings ? { saved: records.scenario.gtfsExportSettings } : {}),
    ...(note
      ? { fromImportNote: { ...(noteDates.length ? { startDate: noteDates[0], endDate: noteDates.at(-1) } : {}), ...(note.publisher ? { agencyName: note.publisher } : {}) } }
      : {}),
  };
}

/** The feed builder's inputs for a request. Throws when the request names a Trip profile the records do not hold. */
export function builderInputOf(records: ScenarioRecords, request: GtfsExportRequest): BuildGtfsExportInput {
  if (!(records.tripProfiles ?? []).some((profile) => profile.id === request.tripProfileId)) throw new Error('The chosen Trip profile is not in this Scenario.');
  const selected = new Set(request.routeIds);
  const aggregateOf = (route: ScenarioRecords['routes'][number]): RouteDefinitionAggregate => ({
    route,
    nodes: records.nodes.filter((node) => node.routeId === route.id),
    patterns: records.patterns.filter((pattern) => pattern.routeId === route.id),
    directions: (records.directions ?? []).filter((direction) => direction.routeId === route.id),
  });
  const blocks = request.blockingScenarioId
    ? (records.blocks.filter((block) => block.blockingScenarioId === request.blockingScenarioId) as BlockingBlock[])
    : undefined;
  return {
    routes: records.routes.filter((route) => selected.has(route.id)).map(aggregateOf),
    routeStopSets: records.routeStopSets ?? [],
    trips: records.trips,
    tripProfileId: request.tripProfileId,
    serviceDays: records.serviceDays,
    unselectedRoutes: records.routes.filter((route) => !selected.has(route.id)),
    ...(blocks ? { blocks } : {}),
    settings: request.settings,
    exportDate: request.exportDate ?? todayIso(),
  };
}

/** One CSV line as cells (quotes doubled inside quoted fields). The input is the builder's own output. */
function cellsOf(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; } else if (char === '"') quoted = false; else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { cells.push(current); current = ''; } else current += char;
  }
  cells.push(current);
  return cells;
}

/** The rows of a written file after its header. A feed row is one line: names with line breaks are not expected. */
function rowsOf(result: GtfsExportResult, fileName: string): string[][] {
  const text = result.files.find((file) => file.name === fileName)?.text ?? '';
  return text.split('\n').slice(1).filter((line) => line !== '').map(cellsOf);
}

/** What an export would write, counted from its files. */
function countsOf(result: GtfsExportResult): NonNullable<GtfsExportCheck['counts']> {
  const header = cellsOf((result.files.find((file) => file.name === 'trips.txt')?.text ?? '').split('\n')[0] ?? '');
  const blockColumn = header.indexOf('block_id');
  const serviceColumn = header.indexOf('service_id');
  const trips = rowsOf(result, 'trips.txt');
  // A block is one block of one service day. block_id repeats across service days (a Monday block 11 and a Saturday block 11 are two blocks),
  // so the blocks are counted by service_id with block_id, not by block_id alone.
  const blocks = new Set(trips.filter((row) => row[blockColumn]).map((row) => `${row[serviceColumn]}\u0001${row[blockColumn]}`));
  return {
    routes: rowsOf(result, 'routes.txt').length,
    stops: rowsOf(result, 'stops.txt').length,
    trips: trips.length,
    serviceDays: rowsOf(result, 'calendar.txt').length,
    blocks: blockColumn < 0 ? 0 : blocks.size,
  };
}

/**
 * Builds the feed for a request and sums it up. A thrown breach of the settings' rules (a holiday outside the range, a repeated date, two
 * service days with one abbreviation) becomes `settingsProblem`. With a refusal, or when `withFiles` is false (a check, which must not move
 * megabytes of text out of the worker), the files and the report are empty (Decision 0090 item 19).
 */
export function buildFeed(records: ScenarioRecords, request: GtfsExportRequest, withFiles: boolean): BuiltFeed {
  let result: GtfsExportResult;
  try {
    result = buildGtfsExport(builderInputOf(records, request));
  } catch (error) {
    return { check: { ready: false, refusals: [], warnings: [], settingsProblem: error instanceof Error ? error.message : 'The export could not be checked.' }, files: [], reportCsv: '' };
  }
  const ready = result.refusals.length === 0;
  return {
    check: { ready, refusals: result.refusals, warnings: result.warnings, ...(ready ? { counts: countsOf(result) } : {}) },
    files: ready && withFiles ? result.files : [],
    reportCsv: ready && withFiles ? reportCsvText(result.report, result.warnings) : '',
  };
}
