// Builds the records of a feed import into a Scenario (Decision 0089 items 2, 3, 13, 19 to 21, 39 and 41): the standard service days
// with their custom holiday days, the annual counts, the Routes from translateFeed, the optional per-Route own counts, and one import
// note. projectFromFeed wraps the same records in a new Project. planFeedDays is the date plan on its own, for an import into a Scenario
// that already has its service days (level C). Pure: it reads the parsed feed and returns records; nothing is written here.

import { createBlockingScenario } from '../blocking';
import { metadata, newId } from '../ids';
import { createProject, createScenarioRecords, projectSnapshotWithScenario, type ScenarioRecords } from '../project';
import type {
  BlockingScenario,
  EntityId,
  ProjectSnapshot,
  Route,
  RouteOwnAnnualServiceDays,
  ScenarioImportNote,
  ServiceDayDefinition,
} from '../types';
import { type AnnualCountProposal, proposeAnnualCounts, proposeRouteOwnCounts } from './annualCounts';
import { feedServiceRange } from './calendar';
import { type ChosenDates, defaultDates, partYearRoutes, serviceDayOfWeek, type ServiceDayKey } from './dayGroups';
import type { GtfsTables } from './feedTables';
import { type HolidayCandidate, holidayCandidates, proposeHolidayDays } from './holidays';
import { checkGtfsDate, type GtfsDate } from './time';
import { type FeedTranslation, translateFeed, type TranslateServiceDay } from './translateFeed';

export interface ScenarioFromFeedOptions {
  tables: GtfsTables;
  /** The feed's route_id values to import. */
  routeIds: string[];
  /** The name of the feed file, recorded in the import note. */
  fileName: string;
  now: string;
  /** Planner choices for the ordinary service days. An absent value uses the default date (Decision 0089 item 16). */
  dates?: Partial<Record<'weekday' | 'saturday' | 'sunday', GtfsDate>>;
  /** Planner classes for holiday candidate dates. An absent date keeps its classification. */
  holidayClasses?: Record<GtfsDate, 'saturday' | 'sunday' | 'reducedWeekday' | 'unique' | 'weekdayAsNormal'>;
  /** Default true: unique holiday dates with different trips become "Holiday 2", "Holiday 3", … (Decision 0089 item 19). */
  keepExtraHolidayDays?: boolean;
  /** Feed route_id values whose proposed own counts are switched on (Decision 0089 item 41). */
  routeOwnCountsOn?: string[];
  /** Absent: no blocks are imported. */
  blocks?: { import: boolean; pullOutMinutes: number; pullInMinutes: number };
}

export interface ScenarioFromFeed {
  records: ScenarioRecords;
  translation: FeedTranslation;
  counts: AnnualCountProposal;
}

/** The planner's choices that decide the dates and counts. */
export type FeedDayOptions = Pick<ScenarioFromFeedOptions, 'tables' | 'routeIds' | 'dates' | 'holidayClasses' | 'keepExtraHolidayDays'>;

/** A service day of the feed and the date it takes. `dateByRouteId` gives a part-year Route its own date (Decision 0089 item 17). */
export interface FeedDayDate {
  key: ServiceDayKey;
  date: GtfsDate;
  dateByRouteId?: Record<string, GtfsDate>;
}

export interface FeedDayPlan {
  /** The ordinary days, and each holiday day that has a proposed date. A day without a date gets no trips. */
  days: FeedDayDate[];
  /** The annual counts, keyed by feed service day. */
  counts: AnnualCountProposal;
  /** The feed service day a date counts under. */
  classOfDate: (date: GtfsDate) => ServiceDayKey;
  partYear: ReturnType<typeof partYearRoutes>;
  /** Every holiday day the feed proposes, including custom days the planner may keep or drop. */
  holidayDays: ReturnType<typeof proposeHolidayDays>;
}

const ORDINARY_DAYS = ['weekday', 'saturday', 'sunday'] as const;

/** 'YYYYMMDD' → 'YYYY-MM-DD', the form the backup stores import dates in. */
function isoDate(date: GtfsDate): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
}

/**
 * The first agency name, which names the publisher and the Project. A feed with no agency name (no agency.txt, or a blank name) is
 * named by its file name without ".zip", as the planner agreed on 2026-11-22.
 */
function agencyName(tables: GtfsTables, fileName: string): string {
  const name = tables.agency[0]?.agency_name?.trim();
  if (name) return name;
  const fromFile = fileName.replace(/\.zip$/i, '').trim();
  if (!fromFile) throw new Error('The feed names no agency and the file has no name to use in its place.');
  return fromFile;
}

function feedVersionOf(tables: GtfsTables): string | undefined {
  return tables.feedInfo[0]?.feed_version?.trim() || undefined;
}

function requireRange(tables: GtfsTables, routeIds: ReadonlySet<string>): { start: GtfsDate; end: GtfsDate } {
  const range = feedServiceRange(tables, routeIds);
  if (!range) throw new Error('No selected Route has a trip in this feed, so there is nothing to import.');
  return range;
}

function chosenDates(tables: GtfsTables, routeIds: ReadonlySet<string>, given: ScenarioFromFeedOptions['dates']): ChosenDates {
  const chosen: ChosenDates = { ...defaultDates(tables, routeIds) };
  for (const key of ORDINARY_DAYS) {
    const value = given?.[key];
    if (value !== undefined) chosen[key] = checkGtfsDate(value);
  }
  return chosen;
}

/**
 * Applies the planner's holiday classes to the candidates. Only candidate dates can be changed; a class for any other date is refused.
 * A date the planner calls weekdayAsNormal is not a holiday: it leaves the candidates, so it counts under its own day of the week and
 * is never a Holiday or custom day.
 */
function applyHolidayClasses(
  candidates: HolidayCandidate[],
  classes: ScenarioFromFeedOptions['holidayClasses'],
): HolidayCandidate[] {
  if (!classes) return candidates;
  const candidateDates = new Set(candidates.map((candidate) => candidate.date));
  for (const [date, value] of Object.entries(classes)) {
    if (value === undefined) continue;
    if (!candidateDates.has(date)) throw new Error(`${date} is not a holiday candidate of this feed, so its class cannot be set.`);
  }
  const kept: HolidayCandidate[] = [];
  for (const candidate of candidates) {
    const value = classes[candidate.date];
    if (value === undefined) {
      kept.push(candidate);
    } else if (value !== 'weekdayAsNormal') {
      kept.push({ ...candidate, scenarioClass: value });
    }
  }
  return kept;
}

/** The dates of one feed: the ordinary days' chosen dates, the holiday days' proposed dates, and each part-year Route's own dates. */
export function planFeedDays(options: FeedDayOptions): FeedDayPlan {
  const { tables } = options;
  const routeIds = new Set(options.routeIds);
  requireRange(tables, routeIds);

  const chosen = chosenDates(tables, routeIds, options.dates);
  const partYear = partYearRoutes(tables, routeIds, chosen);
  const candidates = applyHolidayClasses(holidayCandidates(tables, routeIds, chosen), options.holidayClasses);
  const keepExtra = options.keepExtraHolidayDays ?? true;
  const holidayDays = proposeHolidayDays(tables, routeIds, candidates);

  // Without extra holiday days, every unique date counts under Holiday (with the first date's trips).
  const holidayKeyByDate = new Map<GtfsDate, ServiceDayKey>();
  for (const day of holidayDays) for (const date of day.dates) holidayKeyByDate.set(date, keepExtra ? day.key : 'holiday');
  const candidateByDate = new Map(candidates.map((candidate) => [candidate.date, candidate]));
  const classOfDate = (date: GtfsDate): ServiceDayKey => {
    const candidate = candidateByDate.get(date);
    if (!candidate) return serviceDayOfWeek(date);
    switch (candidate.scenarioClass) {
      case 'saturday':
        return 'saturday';
      case 'sunday':
        return 'sunday';
      case 'reducedWeekday':
        return 'weekday';
      case 'unique': {
        const key = holidayKeyByDate.get(date);
        if (!key) throw new Error(`No holiday service day holds ${date}.`);
        return key;
      }
    }
  };
  const counts = proposeAnnualCounts(tables, routeIds, classOfDate);

  const partYearDatesOf = (key: string): Record<string, GtfsDate> | undefined => {
    const byRoute: Record<string, GtfsDate> = {};
    for (const flag of partYear) {
      if (flag.serviceDay === key && flag.suggestedDate !== undefined) byRoute[flag.routeId] = flag.suggestedDate;
    }
    return Object.keys(byRoute).length > 0 ? byRoute : undefined;
  };
  const ordinary: FeedDayDate[] = [];
  for (const key of ORDINARY_DAYS) {
    const date = chosen[key];
    if (date === undefined) continue;
    const byRoute = partYearDatesOf(key);
    ordinary.push({ key, date, ...(byRoute ? { dateByRouteId: byRoute } : {}) });
  }
  const holiday: FeedDayDate[] = holidayDays.map((day) => {
    const byRoute = partYearDatesOf(day.key);
    return { key: day.key, date: day.date, ...(byRoute ? { dateByRouteId: byRoute } : {}) };
  });

  return { days: [...ordinary, ...holiday], counts, classOfDate, partYear, holidayDays };
}

/**
 * The import note one import writes into a Scenario (Decision 0089 item 39): the publisher (the agency), the feed version, the file name, the
 * date used for each service day, the number of Routes, and the time of the import.
 */
export function feedImportNote(
  tables: GtfsTables,
  fileName: string,
  importedAt: string,
  datesByServiceDayId: Record<EntityId, string>,
  routeCount: number,
): ScenarioImportNote {
  const feedVersion = feedVersionOf(tables);
  return {
    publisher: agencyName(tables, fileName),
    ...(feedVersion !== undefined ? { feedVersion } : {}),
    fileName,
    datesByServiceDayId,
    routeCount,
    importedAt,
  };
}

export function scenarioFromFeed(projectId: EntityId, scenarioName: string, options: ScenarioFromFeedOptions): ScenarioFromFeed {
  const { tables, now } = options;
  const routeIds = new Set(options.routeIds);

  const base = createScenarioRecords(projectId, scenarioName, now);
  const tripProfile = base.tripProfiles?.[0];
  if (!tripProfile) throw new Error('A new Scenario has no Trip profile to receive the trips.');

  const plan = planFeedDays(options);
  const keepExtra = options.keepExtraHolidayDays ?? true;

  // Service days keyed by the same keys the counts and the translation use.
  const keyed: Array<{ key: string; day: ServiceDayDefinition }> = base.serviceDays.map((day) => ({ key: day.kind, day }));
  if (keepExtra) {
    for (const proposal of plan.holidayDays) {
      if (proposal.key === 'holiday') continue;
      const day: ServiceDayDefinition = {
        id: newId(),
        scenarioId: base.scenario.id,
        kind: 'custom',
        name: proposal.name,
        annualServiceDays: 0,
        sequence: keyed.length,
        ...metadata(now),
      };
      keyed.push({ key: proposal.key, day });
    }
  }
  const serviceDays: ServiceDayDefinition[] = keyed.map(({ key, day }) => ({
    ...day,
    annualServiceDays: plan.counts.countsByKey[key] ?? 0,
  }));
  const dayIdByKey = new Map(keyed.map(({ key, day }) => [key, day.id]));
  const idOf = (key: string): EntityId => {
    const id = dayIdByKey.get(key);
    if (!id) throw new Error(`No service day holds the count for ${key}.`);
    return id;
  };
  for (const [key, count] of Object.entries(plan.counts.countsByKey)) {
    if (count > 0) idOf(key);
  }

  // A service day with no date gets no trips; its count still stands.
  const translateDays: TranslateServiceDay[] = [];
  for (const { key, day } of keyed) {
    const dated = plan.days.find((candidate) => candidate.key === key);
    if (!dated) continue;
    translateDays.push({
      key,
      serviceDayId: day.id,
      name: day.name,
      date: dated.date,
      ...(dated.dateByRouteId ? { dateByRouteId: dated.dateByRouteId } : {}),
    });
  }

  // Part-year Routes get their own counts. They are switched on only when the planner lists them.
  const flaggedRouteIds = [...new Set(plan.partYear.map((flag) => flag.routeId))];
  const switchedOn = options.routeOwnCountsOn ?? [];
  for (const routeId of switchedOn) {
    if (!flaggedRouteIds.includes(routeId)) {
      throw new Error(`Route ${routeId} has no proposed own counts, because only part-year Routes are proposed; it cannot be switched on.`);
    }
  }
  const ownByFeedRouteId = new Map<string, RouteOwnAnnualServiceDays>();
  for (const routeId of flaggedRouteIds) {
    const perKey = proposeRouteOwnCounts(tables, routeId, plan.classOfDate, plan.counts.rangeDates);
    const countsByServiceDayId: Record<EntityId, number> = {};
    for (const [key, count] of Object.entries(perKey)) countsByServiceDayId[idOf(key)] = count;
    ownByFeedRouteId.set(routeId, { enabled: switchedOn.includes(routeId), countsByServiceDayId });
  }

  const blockingScenarios: BlockingScenario[] = [...(base.blockingScenarios ?? [])];
  let fromFeed: BlockingScenario | undefined;
  if (options.blocks?.import) {
    fromFeed = createBlockingScenario({ scenarioId: base.scenario.id, tripProfileId: tripProfile.id, name: 'From feed' }, now);
    blockingScenarios.push(fromFeed);
  }

  const translation = translateFeed({
    tables,
    routeIds: options.routeIds,
    scenarioId: base.scenario.id,
    tripProfileId: tripProfile.id,
    serviceDays: translateDays,
    blocks: {
      import: options.blocks?.import ?? false,
      blockingScenarioId: fromFeed?.id,
      pullOutMinutes: options.blocks?.pullOutMinutes,
      pullInMinutes: options.blocks?.pullInMinutes,
    },
    now,
  });
  if (translation.routes.length === 0) {
    const reasons = translation.skippedRoutes.map((skipped) => `${skipped.routeId}: ${skipped.reason}`).join('; ');
    throw new Error(`No selected Route can be imported. ${reasons}`);
  }

  const routes: Route[] = translation.routes.map(({ route }) => {
    const own = route.gtfsRouteId !== undefined ? ownByFeedRouteId.get(route.gtfsRouteId) : undefined;
    return own ? { ...route, ownAnnualServiceDays: own } : route;
  });
  const datesByServiceDayId: Record<EntityId, string> = {};
  for (const day of translateDays) datesByServiceDayId[day.serviceDayId] = isoDate(day.date);
  const note = feedImportNote(tables, options.fileName, now, datesByServiceDayId, translation.routes.length);

  const stopSets = translation.routes.flatMap((imported) => (imported.stopSet ? [imported.stopSet] : []));
  const records: ScenarioRecords = {
    ...base,
    scenario: { ...base.scenario, importNotes: [note] },
    serviceDays,
    routes,
    nodes: translation.routes.flatMap((imported) => imported.nodes),
    patterns: translation.routes.flatMap((imported) => imported.patterns),
    directions: [...(base.directions ?? []), ...translation.routes.flatMap((imported) => imported.directions)],
    runtimeProfiles: translation.routes.flatMap((imported) => imported.runtimeProfiles),
    runtimeAssignments: translation.routes.flatMap((imported) => imported.runtimeAssignments),
    blockingScenarios,
    trips: translation.routes.flatMap((imported) => imported.trips),
    blocks: translation.blocks,
    ...(stopSets.length > 0 ? { routeStopSets: stopSets } : {}),
  };
  return { records, translation, counts: plan.counts };
}

/** Level A (Decision 0089 item 2): a new Project named "{agency} ({feed version or first date})" holding one Scenario "Existing service". */
export function projectFromFeed(options: ScenarioFromFeedOptions): ProjectSnapshot {
  const range = requireRange(options.tables, new Set(options.routeIds));
  const label = feedVersionOf(options.tables) ?? isoDate(range.start);
  const project = createProject(`${agencyName(options.tables, options.fileName)} (${label})`, options.now);
  const { records } = scenarioFromFeed(project.id, 'Existing service', options);
  return projectSnapshotWithScenario(
    {
      project,
      scenarios: [],
      serviceDays: [],
      routes: [],
      nodes: [],
      patterns: [],
      runtimeProfiles: [],
      runtimeAssignments: [],
      generationSets: [],
      trips: [],
      blocks: [],
    },
    records,
  );
}
