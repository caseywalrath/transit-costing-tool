// The pure view state of steps 4 and 5 of the GTFS import dialog (Decision 0089 items 26, 33 to 37; sub-plan I9): the options the planner
// sets, the options handed to the import service, and the rows the Review step shows from the translation. No React and no reading of
// files; the dialog holds the state and calls these functions.

import type { FeedPlanOptions } from '../../application/gtfs/gtfsImportService';
import type { GtfsTables } from '../../domain/gtfs/feedTables';
import type { FeedDayPlan } from '../../domain/gtfs/scenarioFromFeed';
import type { ImportReport, ImportReportRow } from '../../domain/gtfs/reportFromFeed';
import type { TimepointMode } from '../../domain/gtfs/routeFromFeed';
import type { TranslatedRoute } from '../../domain/gtfs/translateFeed';
import { type FeedTrip, tripsOnDate } from '../../domain/gtfs/tripsOnDate';
import { type DayChoices, planChoices } from './gtfsImportModel';

export type ImportLevel = 'A' | 'B' | 'C';

// ---- Step 4: options ----------------------------------------------------------------------------------------------------------------

/** The pre-filled pull-out and pull-in minutes (Decision 0089 item 35). */
export const DEFAULT_PULL_MINUTES = '10';

/** Every choice on the Options step. The minutes are kept as the text typed, so a half-typed value is not lost. */
export interface OptionChoices {
  timepointMode: TimepointMode;
  importBlocks: boolean;
  pullOutMinutes: string;
  pullInMinutes: string;
  /** Level C: the Trip profile that receives the trips. */
  tripProfileId: string;
  /** Level C: the Blocking scenario that receives the blocks; '' is "Don't import blocks". */
  blockingScenarioId: string;
}

/** What the selected Routes' stop times and trips say about the feed, for the defaults and for what step 4 offers. */
export interface FeedFacts {
  /** Any stop time of the selected Routes has timepoint = 1. */
  marksTimepoints: boolean;
  /** The distinct block_id values of the selected Routes' trips. */
  blockCount: number;
  hasFrequencies: boolean;
}

/** True when any stop-time row has timepoint = 1 (Decision 0089 item 26, the feed's flags). */
export function feedMarksTimepoints(tables: Pick<GtfsTables, 'stopTimes'>): boolean {
  return tables.stopTimes.some((row) => (row.timepoint ?? '').trim() === '1');
}

/** The number of distinct block_id values among the selected Routes' trips; blank values do not count (Decision 0089 item 33). */
export function selectedBlockCount(tables: Pick<GtfsTables, 'trips'>, routeIds: readonly string[]): number {
  const selected = new Set(routeIds);
  const blocks = new Set<string>();
  for (const trip of tables.trips) {
    const blockId = (trip.block_id ?? '').trim();
    if (selected.has(trip.route_id) && blockId !== '') blocks.add(blockId);
  }
  return blocks.size;
}

export function feedFactsOf(tables: GtfsTables, routeIds: readonly string[]): FeedFacts {
  return { marksTimepoints: feedMarksTimepoints(tables), blockCount: selectedBlockCount(tables, routeIds), hasFrequencies: tables.frequencies.length > 0 };
}

/** The starting choices: the feed's timepoints when it marks any, blocks on when the feed has them (Decision 0089 items 26 and 33). */
export function defaultOptionChoices(facts: FeedFacts, target: { tripProfileId?: string; blockingScenarioId?: string } = {}): OptionChoices {
  return {
    timepointMode: facts.marksTimepoints ? 'feed' : 'suggested',
    importBlocks: facts.blockCount > 0,
    pullOutMinutes: DEFAULT_PULL_MINUTES,
    pullInMinutes: DEFAULT_PULL_MINUTES,
    tripProfileId: target.tripProfileId ?? '',
    blockingScenarioId: target.blockingScenarioId ?? '',
  };
}

/** Whole minutes, 0 or more; undefined for anything else, including a blank (Decision 0089 item 35). */
export function wholeMinutes(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

/** Blocks are imported when the planner asks and the feed has any; at level C a Blocking scenario must also be chosen. */
export function blocksActive(choices: OptionChoices, facts: FeedFacts, level: ImportLevel): boolean {
  return facts.blockCount > 0 && choices.importBlocks && (level !== 'C' || choices.blockingScenarioId !== '');
}

export const MINUTES_MESSAGE = 'Pull-out and pull-in minutes are required: whole minutes, 0 or more.';

/** The reason Next on step 4 is off, or undefined when it may be used. */
export function optionsProblem(choices: OptionChoices, facts: FeedFacts, level: ImportLevel): string | undefined {
  if (blocksActive(choices, facts, level) && (wholeMinutes(choices.pullOutMinutes) === undefined || wholeMinutes(choices.pullInMinutes) === undefined)) return MINUTES_MESSAGE;
  if (level === 'C' && choices.tripProfileId === '') return 'Choose the Trip profile that receives the trips.';
  return undefined;
}

/** Timepoint overrides as the planner holds them: feed route_id → pattern key before the override → stop IDs. */
export type TimepointOverrides = Record<string, Record<string, string[]>>;

/**
 * The options the feed planner and the import service read: the Days step's choices, the Options step's choices and the timepoint edits.
 * `tables`, `routeIds`, `fileName` and `now` are added by the caller.
 */
export function feedPlanOptions(days: DayChoices, choices: OptionChoices, facts: FeedFacts, level: ImportLevel, overrides: TimepointOverrides): FeedPlanOptions {
  const active = blocksActive(choices, facts, level);
  return {
    ...planChoices(days),
    blocks: active
      ? { import: true, pullOutMinutes: wholeMinutes(choices.pullOutMinutes) ?? 0, pullInMinutes: wholeMinutes(choices.pullInMinutes) ?? 0 }
      : { import: false, pullOutMinutes: 0, pullInMinutes: 0 },
    timepointMode: choices.timepointMode,
    ...(Object.keys(overrides).length > 0 ? { timepointOverrides: overrides } : {}),
  };
}

// ---- Step 5: review -----------------------------------------------------------------------------------------------------------------

const DAY_ABBREVIATIONS: Record<string, string> = { Weekday: 'Wkdy', Saturday: 'Sat', Sunday: 'Sun', Holiday: 'Hol' };

/** The service days that have any imported trips, in the order the table shows them: Weekday, Saturday, Sunday, Holiday, then the rest. */
export function reviewDayNames(report: ImportReport): string[] {
  const names = new Set<string>();
  for (const route of report.routes) {
    for (const [name, count] of Object.entries(route.tripsByServiceDay)) if (count > 0) names.add(name);
  }
  const order = ['Weekday', 'Saturday', 'Sunday', 'Holiday'];
  return [...names].sort((a, b) => {
    const left = order.indexOf(a);
    const right = order.indexOf(b);
    if (left >= 0 || right >= 0) return (left < 0 ? order.length : left) - (right < 0 ? order.length : right);
    return a.localeCompare(b);
  });
}

export function dayAbbreviation(name: string): string {
  return DAY_ABBREVIATIONS[name] ?? name;
}

/** The weekday running hours of one imported Route, to one decimal, or undefined when it has no weekday trips. */
export function weekdayRunningHours(report: ImportReport, routeId: string): number | undefined {
  const row = report.fidelity.find((item) => item.routeId === routeId && item.serviceDay === 'Weekday');
  return row === undefined ? undefined : Math.round(row.importedRunningSeconds / 360) / 10;
}

/** The trips of a Route that the fidelity check lists as different from the feed. */
export function differingTripCount(report: ImportReport, routeId: string): number {
  return report.rows.filter((row) => row.section === 'fidelity' && row.routeId === routeId).length;
}

const SKIP_REASONS: Record<string, string> = { noTripsOnChosenDates: 'No trips on the dates used for the service days.', 'Not in routes.txt': 'This Route is not in routes.txt.' };

/** The reason a skipped Route gives, in words. */
export function skippedReason(reason: string): string {
  return SKIP_REASONS[reason] ?? reason;
}

function noteLabel(row: ImportReportRow): [string, string] {
  switch (row.section) {
    case 'route':
      switch (row.code) {
        case 'dwellAtTimepoint': return ['timepoint with dwell (departure kept)', 'timepoints with dwell (departure kept)'];
        case 'mergedVariant': return ['trip merged into a pattern', 'trips merged into a pattern'];
        case 'thinnedTimepoints': return ['direction with timepoints thinned to 30', 'directions with timepoints thinned to 30'];
        case 'filledTime': return ['blank time filled in', 'blank times filled in'];
        case 'straightLineMiles': return ['pattern measured in straight lines', 'patterns measured in straight lines'];
        case 'unmeasuredPattern': return ['pattern with no measurable miles', 'patterns with no measurable miles'];
        case 'stopWithoutLocation': return ['stop without a location', 'stops without a location'];
        case 'directionsGuessed': return ['note that directions were guessed', 'notes that directions were guessed'];
        case 'badRouteField': return ['route field not usable', 'route fields not usable'];
        case 'nameClash': return ['Route renamed to avoid a clash', 'Routes renamed to avoid a clash'];
        default: return [`note (${row.code})`, `notes (${row.code})`];
      }
    case 'trip':
      return row.code === 'approximateFrequency' ? ['approximate trip from frequencies.txt', 'approximate trips from frequencies.txt'] : ['invalid trip left out', 'invalid trips left out'];
    case 'block': return ['block left out', 'blocks left out'];
    case 'fidelity': return ['trip that differs from the feed', 'trips that differ from the feed'];
    case 'file': return ['file not imported', 'files not imported'];
    case 'skipped': return ['Route skipped', 'Routes skipped'];
  }
}

/** The notes as "n label" parts, the most numerous first. */
export function summarizeNotes(rows: readonly ImportReportRow[]): string[] {
  const counts = new Map<string, { singular: string; plural: string; count: number }>();
  for (const row of rows) {
    const [singular, plural] = noteLabel(row);
    const entry = counts.get(singular) ?? { singular, plural, count: 0 };
    entry.count += 1;
    counts.set(singular, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.singular.localeCompare(b.singular)).map((entry) => `${entry.count.toLocaleString('en-US')} ${entry.count === 1 ? entry.singular : entry.plural}`);
}

/** The notes of one imported Route, for its Notes cell. */
export function routeNotes(report: ImportReport, routeId: string): string {
  return summarizeNotes(report.rows.filter((row) => row.routeId === routeId && row.section !== 'skipped')).join('; ');
}

/** The line under the table: how many notes the report holds and what they are, at most four kinds. */
export function reportSummaryLine(report: ImportReport): string {
  const total = report.rows.length;
  if (total === 0) return 'The import report has no notes.';
  const parts = summarizeNotes(report.rows);
  const shown = parts.slice(0, 4).join(', ');
  return `${total.toLocaleString('en-US')} ${total === 1 ? 'note' : 'notes'}: ${shown}${parts.length > 4 ? ', and more' : ''}.`;
}

/** The footer line: what Import will create (Decision 0089 item 2 to 4). */
export function createsLine(level: ImportLevel, routeCount: number, tripCount: number, blockCount: number): string {
  const plural = (count: number, word: string) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;
  const containers = level === 'A' ? ['1 Project', '1 Scenario'] : level === 'B' ? ['1 Scenario'] : [];
  return `Creates ${[...containers, plural(routeCount, 'Route'), plural(tripCount, 'trip'), plural(blockCount, 'block')].join(', ')}`;
}

/** Imported trips, summed over Routes and service days. */
export function importedTripCount(report: ImportReport): number {
  return report.routes.reduce((sum, route) => sum + Object.values(route.tripsByServiceDay).reduce((inner, count) => inner + count, 0), 0);
}

// ---- Patterns and timepoint edits ---------------------------------------------------------------------------------------------------

export interface PatternRowView {
  patternId: string;
  /** The pattern key the translation built it from, after any timepoint edit. */
  key: string;
  label: string;
  trips: number;
  timepoints: number;
}

/** The patterns of an imported Route as the list shows them: "Outbound · name", with the number of trips on all service days. */
export function patternRows(route: TranslatedRoute): PatternRowView[] {
  const groupOf = new Map(route.directions.map((direction) => [direction.id, direction.group ?? 'outbound'] as const));
  return route.patterns.map((pattern) => {
    const group = groupOf.get(pattern.directionId ?? '') ?? 'outbound';
    return {
      patternId: pattern.id,
      key: route.patternKeys[pattern.id] ?? '',
      label: `${group === 'inbound' ? 'Inbound' : 'Outbound'} · ${pattern.name}`,
      trips: route.trips.filter((trip) => trip.patternId === pattern.id).length,
      timepoints: pattern.points.length,
    };
  });
}

/** The feed trip IDs that sit on a pattern. */
function feedTripIdsOf(route: TranslatedRoute, patternId: string): Set<string> {
  return new Set(route.placements.filter((placement) => placement.patternId === patternId).map((placement) => placement.tripId));
}

/**
 * The pattern keys a pattern had before any timepoint edit. A timepoint edit is keyed by the key from before it (sub-plan section 12a, item
 * 3), so the review finds each of the pattern's trips in the translation made without edits. With no baseline, the pattern's own key is it.
 */
export function originalKeysOf(current: TranslatedRoute, baseline: TranslatedRoute | undefined, patternId: string): string[] {
  const own = current.patternKeys[patternId];
  if (!baseline) return own === undefined ? [] : [own];
  const baselinePatternOf = new Map(baseline.placements.map((placement) => [placement.tripId, placement.patternId] as const));
  const keys = new Set<string>();
  for (const tripId of feedTripIdsOf(current, patternId)) {
    const baselinePatternId = baselinePatternOf.get(tripId);
    const key = baselinePatternId === undefined ? undefined : baseline.patternKeys[baselinePatternId];
    if (key !== undefined) keys.add(key);
  }
  return keys.size > 0 ? [...keys] : own === undefined ? [] : [own];
}

/**
 * The feed trips that sit on a pattern, on the dates the service days use. A trip that runs on several dates is listed once. The tables
 * need the stop times of the Route.
 */
export function feedTripsOfPattern(tables: GtfsTables, plan: Pick<FeedDayPlan, 'days'>, feedRouteId: string, route: TranslatedRoute, patternId: string): FeedTrip[] {
  const wanted = feedTripIdsOf(route, patternId);
  const found = new Map<string, FeedTrip>();
  for (const day of plan.days) {
    const date = day.dateByRouteId?.[feedRouteId] ?? day.date;
    for (const trip of tripsOnDate(tables, date, new Set([feedRouteId])).byRoute.get(feedRouteId) ?? []) {
      if (wanted.has(trip.tripId) && !found.has(trip.tripId)) found.set(trip.tripId, trip);
    }
  }
  return [...found.values()];
}

/** The stop IDs of a pattern key ("outbound:A>B>C"). */
export function stopIdsOfPatternKey(key: string): string[] {
  const at = key.indexOf(':');
  return (at < 0 ? key : key.slice(at + 1)).split('>').filter((id) => id !== '');
}

/** Sets the timepoint stop IDs for every original key of one Route. Returns new overrides; the input is not changed. */
export function withOverride(overrides: TimepointOverrides, feedRouteId: string, originalKeys: readonly string[], stopIds: readonly string[]): TimepointOverrides {
  const forRoute = { ...overrides[feedRouteId] };
  for (const key of originalKeys) forRoute[key] = [...stopIds];
  return { ...overrides, [feedRouteId]: forRoute };
}

/** Removes the edits of the given original keys ("Restore the feed's choice"). A Route left with none is dropped. */
export function withoutOverride(overrides: TimepointOverrides, feedRouteId: string, originalKeys: readonly string[]): TimepointOverrides {
  const forRoute = { ...overrides[feedRouteId] };
  for (const key of originalKeys) delete forRoute[key];
  const next = { ...overrides };
  if (Object.keys(forRoute).length === 0) delete next[feedRouteId];
  else next[feedRouteId] = forRoute;
  return next;
}

/** True when any of the original keys has an edit. */
export function hasOverride(overrides: TimepointOverrides, feedRouteId: string, originalKeys: readonly string[]): boolean {
  return originalKeys.some((key) => overrides[feedRouteId]?.[key] !== undefined);
}

// ---- After the import ---------------------------------------------------------------------------------------------------------------

/** The text of the notice that follows an import, for example "3 routes imported from google_transit.zip". */
export function importedNoticeText(routeCount: number, fileName: string): string {
  return `${routeCount} ${routeCount === 1 ? 'route' : 'routes'} imported from ${fileName}`;
}

/**
 * The one line under a level C notice (sub-plan section 21, answer to item 5): where the proposed counts differ from the Scenario's,
 * then any days that were not imported. Undefined when there is nothing to say.
 */
export function addedRoutesDetail(report: {
  countDifferences: ReadonlyArray<{ serviceDay: string; proposed: number; scenario: number }>;
  notImported: ReadonlyArray<{ serviceDay: string; reason: 'customDay' | 'noServiceDay' }>;
}): string | undefined {
  const parts: string[] = [];
  if (report.countDifferences.length > 0) {
    parts.push(`The feed suggests different annual days (the Scenario's are unchanged): ${report.countDifferences.map((item) => `${item.serviceDay} ${item.proposed} against ${item.scenario}`).join(', ')}.`);
  }
  if (report.notImported.length > 0) {
    parts.push(`Not imported: ${report.notImported.map((item) => `${item.serviceDay} (${item.reason === 'customDay' ? 'a custom day the Scenario does not have' : 'the Scenario has no such service day'})`).join(', ')}.`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}
