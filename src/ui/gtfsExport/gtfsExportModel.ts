// What the GTFS export dialog holds and decides (Decision 0090; card E4), apart from drawing it: the draft of the planner's choices, the
// request it makes, which holiday dates may be added, and the plain-words text of each refusal and warning. Pure.

import { describeIssue } from '../../domain/gtfsExport/checks';
import { csvTable } from '../../domain/gtfsExport/csvText';
import { gtfsDateFromIso } from '../../domain/gtfsExport/calendar';
import type { GtfsExportIssue, GtfsExportIssueCode } from '../../domain/gtfsExport/types';
import type { GtfsExportHoliday, GtfsExportSettings } from '../../domain/types';
import type { GtfsExportCheck, GtfsExportContext, GtfsExportRequest } from '../../application/gtfsExport/gtfsExportBuild';

/** Everything the planner can change in the dialog. Kept as typed, so a half-typed date is still a draft. */
export interface GtfsExportDraft {
  /** "All N Routes" or a checklist. */
  routeMode: 'all' | 'some';
  chosenRouteIds: string[];
  tripProfileId: string;
  /** '' is "None": no block ids. */
  blockingScenarioId: string;
  startDate: string;
  endDate: string;
  holidays: GtfsExportHoliday[];
  agencyName: string;
  agencyUrl: string;
  agencyTimezone: string;
  mapLines: 'straight' | 'none';
  /** Dates of remembered holidays whose service day no longer exists and were reset to the default; the row says so until it is changed. */
  resetHolidayDates: string[];
}

/** The starting draft: the remembered settings, else the import note's dates and agency name, else blank (card E4, item 1). */
export function initialDraft(context: GtfsExportContext, working: { tripProfileId?: string; blockingScenarioId?: string }): GtfsExportDraft {
  const tripProfileId = context.tripProfiles.find((profile) => profile.id === working.tripProfileId)?.id ?? context.tripProfiles[0]?.id ?? '';
  const blockingOfProfile = context.blockingScenarios.filter((item) => item.tripProfileId === tripProfileId);
  const blockingScenarioId = blockingOfProfile.find((item) => item.id === working.blockingScenarioId)?.id ?? blockingOfProfile[0]?.id ?? '';
  const saved = context.saved;
  const note = context.fromImportNote;
  // A remembered holiday whose service day was deleted since: it runs by the default Holiday day instead, and its row says so.
  const defaultDayId = defaultHolidayServiceDayId(context);
  const dayIds = new Set(context.serviceDays.map((day) => day.id));
  const savedHolidays = sortedHolidays(saved?.holidays ?? []).map((value) => ({ value, reset: !dayIds.has(value.serviceDayId) }));
  return {
    routeMode: 'all',
    chosenRouteIds: [],
    tripProfileId,
    blockingScenarioId,
    startDate: saved?.startDate ?? note?.startDate ?? '',
    endDate: saved?.endDate ?? note?.endDate ?? '',
    holidays: savedHolidays.map((holiday) => (holiday.reset ? { date: holiday.value.date, serviceDayId: defaultDayId } : holiday.value)),
    resetHolidayDates: savedHolidays.filter((holiday) => holiday.reset).map((holiday) => holiday.value.date),
    agencyName: saved?.agencyName ?? note?.agencyName ?? '',
    agencyUrl: saved?.agencyUrl ?? '',
    agencyTimezone: saved?.agencyTimezone ?? '',
    mapLines: saved?.mapLines ?? 'straight',
  };
}

/** The note under a holiday row whose service day was deleted, or undefined. It stays until the planner picks a day or removes the row. */
export function holidayResetNote(context: GtfsExportContext, draft: GtfsExportDraft, holiday: GtfsExportHoliday): string | undefined {
  if (!draft.resetHolidayDates.includes(holiday.date)) return undefined;
  const name = context.serviceDays.find((day) => day.id === holiday.serviceDayId)?.name ?? 'Holiday';
  return `The day this holiday ran was deleted; now ${name}`;
}

export function sortedHolidays(holidays: readonly GtfsExportHoliday[]): GtfsExportHoliday[] {
  return [...holidays].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The Routes with Trips in the draft's Trip profile: what "All" means. */
export function routesWithTrips(context: GtfsExportContext, tripProfileId: string): string[] {
  return context.routes.filter((route) => (route.tripsByProfileId[tripProfileId] ?? 0) > 0).map((route) => route.id);
}

/** The Routes the draft exports. */
export function selectedRouteIds(context: GtfsExportContext, draft: GtfsExportDraft): string[] {
  if (draft.routeMode === 'all') return routesWithTrips(context, draft.tripProfileId);
  const chosen = new Set(draft.chosenRouteIds);
  return context.routes.filter((route) => chosen.has(route.id)).map((route) => route.id);
}

/** Whether a date is a real YYYY-MM-DD date. */
export function isRealDate(value: string): boolean {
  return gtfsDateFromIso(value) !== undefined;
}

/** Whether the draft's range is two real dates in order. */
export function rangeIsValid(draft: Pick<GtfsExportDraft, 'startDate' | 'endDate'>): boolean {
  return isRealDate(draft.startDate) && isRealDate(draft.endDate) && draft.startDate <= draft.endDate;
}

/** Why a holiday date cannot be added or kept, or undefined when it can (Decision 0090 item 14: inside the range, once). */
export function holidayProblem(draft: GtfsExportDraft, date: string, ignoreIndex?: number): string | undefined {
  if (!isRealDate(date)) return 'Enter a real date.';
  if (!rangeIsValid(draft)) return 'Set the start and end dates first.';
  if (date < draft.startDate || date > draft.endDate) return 'This date is outside the range.';
  if (draft.holidays.some((holiday, index) => index !== ignoreIndex && holiday.date === date)) return 'This date is already listed.';
  return undefined;
}

/** The service day a new holiday runs by default: the Scenario's Holiday day. */
export function defaultHolidayServiceDayId(context: GtfsExportContext): string {
  return (context.serviceDays.find((day) => day.kind === 'holiday') ?? context.serviceDays.at(-1))?.id ?? '';
}

/** The holidays that the feed can use: inside the range and once (the draft keeps the others so that they are not lost, item 14). */
export function usableHolidays(draft: GtfsExportDraft): GtfsExportHoliday[] {
  return sortedHolidays(draft.holidays).filter((holiday) => holidayProblem(draft, holiday.date, draft.holidays.indexOf(holiday)) === undefined);
}

/** A holiday row that must be fixed before the export can run, with its reason. */
export function holidayRowProblems(draft: GtfsExportDraft): Array<string | undefined> {
  return draft.holidays.map((holiday, index) => (rangeIsValid(draft) ? holidayProblem(draft, holiday.date, index) : undefined));
}

export function settingsOf(draft: GtfsExportDraft): GtfsExportSettings {
  return {
    startDate: draft.startDate,
    endDate: draft.endDate,
    holidays: usableHolidays(draft),
    agencyName: draft.agencyName.trim(),
    agencyUrl: draft.agencyUrl.trim(),
    agencyTimezone: draft.agencyTimezone.trim(),
    mapLines: draft.mapLines,
  };
}

export function requestOf(context: GtfsExportContext, draft: GtfsExportDraft): GtfsExportRequest {
  return {
    routeIds: selectedRouteIds(context, draft),
    tripProfileId: draft.tripProfileId,
    ...(draft.blockingScenarioId ? { blockingScenarioId: draft.blockingScenarioId } : {}),
    settings: settingsOf(draft),
  };
}

/** Why the draft cannot be exported yet, apart from the builder's own refusals; undefined when it can. */
export function draftProblem(context: GtfsExportContext, draft: GtfsExportDraft): string | undefined {
  if (selectedRouteIds(context, draft).length === 0) return 'Choose at least one Route that has trips on this Trip profile.';
  if (holidayRowProblems(draft).some((problem) => problem !== undefined)) return 'A holiday date is outside the range or listed twice. Fix or remove it.';
  return undefined;
}

/** "Thu" for a YYYY-MM-DD date (UTC arithmetic, so the viewer's time zone does not move it). */
export function weekdayLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return '';
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day];
}

/** The IANA time zones the browser knows, with `extra` added when it is not among them. */
export function timeZoneChoices(extra?: string): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  let zones: string[] = [];
  try {
    zones = intl.supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];
  return extra && !zones.includes(extra) ? [extra, ...zones] : zones;
}

/** One refusal, in the words the Problems table shows. */
const REFUSAL_TEXT: Partial<Record<GtfsExportIssueCode, string>> = {
  'gtfsExport.stopUnlocated': 'No location',
  'gtfsExport.stopIdConflict': 'Same stop ID at two places',
  'gtfsExport.directionUnassigned': 'Pattern has no Outbound or Inbound direction',
  'gtfsExport.tripTimeMissing': 'A trip has no time at a stop',
  'gtfsExport.rangeEmpty': 'The date range has no dates',
  'gtfsExport.agencyNameBlank': 'Agency name is blank',
  'gtfsExport.agencyUrlBlank': 'Agency website is blank',
  'gtfsExport.agencyUrlInvalid': 'Agency website must be a web address starting with http:// or https://',
  'gtfsExport.agencyTimezoneBlank': 'Agency time zone is not chosen',
};

export function refusalText(issue: GtfsExportIssue): string {
  return REFUSAL_TEXT[issue.code] ?? issue.code;
}

/** The stop or timepoint cell: its name, with the stop ID and the distance for a conflict. */
export function stopCell(issue: GtfsExportIssue): string {
  const name = issue.stopName ?? '';
  if (issue.code === 'gtfsExport.stopIdConflict') {
    const first = issue.conflictWith;
    // The first record of the stop ID: a timepoint names its pattern, a Route stop says so; another Route is named.
    const where = first === undefined ? 'the first' : `${first.stopName} on ${first.patternName ?? 'the route stops'}${first.routeId !== issue.routeId ? ` of ${first.routeName}` : ''}`;
    const apart = issue.distanceMeters === undefined ? '' : `, ${Math.round(issue.distanceMeters)} m from ${where}`;
    return `${name} (stop ID ${issue.stopId ?? ''}${apart})`;
  }
  return name;
}

/** The refusals as rows the table shows: every refusal, in the builder's order. */
export interface ProblemRow {
  key: string;
  problem: string;
  routeName: string;
  patternName: string;
  stop: string;
  routeId?: string;
  patternId?: string;
}

export function problemRows(refusals: readonly GtfsExportIssue[]): ProblemRow[] {
  return refusals.map((issue, index) => ({
    key: `${index}`,
    problem: refusalText(issue),
    routeName: issue.routeName ?? '',
    patternName: issue.patternName ?? '',
    stop: stopCell(issue),
    ...(issue.routeId ? { routeId: issue.routeId } : {}),
    ...(issue.patternId ? { patternId: issue.patternId } : {}),
  }));
}

/** The list of problems as a CSV file ("Download list"). A text that starts with a formula character gets an apostrophe, as in every export (Decision 0084 item 12). */
export function problemsCsv(refusals: readonly GtfsExportIssue[]): string {
  const guard = (text: string) => (/^'*[=+\-@]/.test(text) ? `'${text}` : text);
  return csvTable(
    ['problem', 'route', 'pattern', 'stop_or_timepoint', 'detail'],
    problemRows(refusals).map((row, index) => ({
      problem: row.problem,
      route: guard(row.routeName),
      pattern: guard(row.patternName),
      stop_or_timepoint: guard(row.stop),
      detail: guard(describeIssue(refusals[index])),
    })),
  );
}

export interface WarningGroup {
  code: GtfsExportIssueCode;
  count: number;
  text: string;
  details: string[];
}

const plural = (count: number, one: string, many: string): string => `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;

const WARNING_TEXT: Partial<Record<GtfsExportIssueCode, (count: number) => string>> = {
  'gtfsExport.stopIdGenerated': (count) => `${plural(count, 'stop without an ID gets a generated ID.', 'stops without an ID get generated IDs.')}`,
  'gtfsExport.stopNameDiffers': (count) => `${plural(count, 'stop ID is used with different stop names; the first name is exported.', 'stop IDs are used with different stop names; the first name of each is exported.')}`,
  'gtfsExport.routeSkipped': (count) => `${plural(count, 'Route has no trips on this Trip profile and is skipped.', 'Routes have no trips on this Trip profile and are skipped.')}`,
  'gtfsExport.daySkipped': (count) => `${plural(count, 'service day has no trips and is left out of the calendar.', 'service days have no trips and are left out of the calendar.')}`,
  'gtfsExport.ownCountsNotExpressed': (count) => `${plural(count, 'Route uses its own annual service days; the feed uses the Scenario calendar for it.', 'Routes use their own annual service days; the feed uses the Scenario calendar for them.')}`,
  'gtfsExport.blockServesUnselectedRoute': (count) => `${plural(count, 'block also serves a Route that is not exported; its block ID is kept on the exported trips.', 'blocks also serve Routes that are not exported; their block IDs are kept on the exported trips.')}`,
};

/** The warnings of a check, one line per code with how many there are. */
export function warningGroups(warnings: readonly GtfsExportIssue[]): WarningGroup[] {
  const groups = new Map<GtfsExportIssueCode, GtfsExportIssue[]>();
  for (const warning of warnings) groups.set(warning.code, [...(groups.get(warning.code) ?? []), warning]);
  return [...groups].map(([code, issues]) => ({
    code,
    count: issues.length,
    text: WARNING_TEXT[code]?.(issues.length) ?? `${plural(issues.length, 'note', 'notes')} (${code}).`,
    details: issues.map((issue) => describeIssue(issue) || issue.stopName || issue.routeName || issue.serviceDayName || issue.code),
  }));
}

/** The notice after a successful export. */
export function exportedNoticeText(tripCount: number, routeCount: number): string {
  return `Exported ${plural(tripCount, 'trip', 'trips')} on ${plural(routeCount, 'Route', 'Routes')}. Report downloaded.`;
}

/** The line under the checks when the export is ready: what it will write. */
export function willWriteText(counts: NonNullable<GtfsExportCheck['counts']>): string {
  return [
    plural(counts.routes, 'Route', 'Routes'),
    plural(counts.stops, 'stop', 'stops'),
    plural(counts.trips, 'trip', 'trips'),
    plural(counts.serviceDays, 'service day', 'service days'),
    plural(counts.blocks, 'block', 'blocks'),
  ].join(' · ');
}
