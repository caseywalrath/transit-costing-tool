// The pure view state of the GTFS import dialog (Decision 0089 item 9, sub-plan I8 item 7): the rules the Routes step derives from the
// feed and the planner's selection. No React and no reading of files; the dialog holds the state and calls these functions.

import { serviceIdsActiveOn } from '../../domain/gtfs/calendar';
import { frequencyWindows, windowDepartures } from '../../domain/gtfs/frequencies';
import type { FeedSummary } from '../../domain/gtfs/summary';
import type { GtfsTables } from '../../domain/gtfs/feedTables';
import type { GtfsDate } from '../../domain/gtfs/time';
import { type ChosenDates, defaultDates, type FeedRange, halfDaysFromMiddle } from '../../domain/gtfs/dayGroups';
import { type HolidayCandidate, type HolidayClass, holidayCandidates } from '../../domain/gtfs/holidays';
import { type FeedDayPlan, planFeedDays, type ScenarioFromFeedOptions } from '../../domain/gtfs/scenarioFromFeed';
import { translateFeed } from '../../domain/gtfs/translateFeed';

/** One Route as step 2 lists it: the feed's summary row. */
export type FeedRouteRow = FeedSummary['routes'][number];

/** The size rule (Decision 0089 item 44, sub-plan I8 item 3): above 40 Routes or 5,000 weekday trips the dialog warns that import may be slow. */
export const SIZE_WARNING_ROUTES = 40;
export const SIZE_WARNING_TRIPS = 5000;

/** The leading number of a short name and the text after it, or undefined when the name has no leading number (for example "A"). */
function splitLeadingNumber(name: string): { value: number; rest: string } | undefined {
  const match = /^(\d+)(.*)$/.exec(name.trim());
  return match ? { value: Number(match[1]), rest: match[2] } : undefined;
}

/**
 * Route order (sub-plan I8, item 3): Routes whose short name starts with a number come first, by that number and then by the rest of
 * the name ("0" before "0L" before "1" before "31"); Routes without one follow in text order. The long name breaks a tie.
 */
export function compareRouteOrder(a: FeedRouteRow, b: FeedRouteRow): number {
  const numberA = splitLeadingNumber(a.shortName);
  const numberB = splitLeadingNumber(b.shortName);
  if (numberA && numberB) {
    if (numberA.value !== numberB.value) return numberA.value - numberB.value;
    if (numberA.rest !== numberB.rest) return numberA.rest < numberB.rest ? -1 : 1;
  } else if (numberA || numberB) {
    return numberA ? -1 : 1;
  } else {
    const shortA = a.shortName.trim();
    const shortB = b.shortName.trim();
    if (shortA !== shortB) return shortA < shortB ? -1 : 1;
  }
  const longA = a.longName.trim();
  const longB = b.longName.trim();
  if (longA === longB) return a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0;
  return longA < longB ? -1 : 1;
}

/** The Routes of the feed in route order. The input is not changed. */
export function routeRowsInOrder(routes: readonly FeedRouteRow[]): FeedRouteRow[] {
  return [...routes].sort(compareRouteOrder);
}

/**
 * The name of a GTFS route_type for the type filter. Basic codes 0 to 12 follow the GTFS reference; the extended ranges are named by
 * their family. A blank or unknown type (-1 in the summary) is "Other".
 */
export function routeTypeName(type: number): string {
  const basic: Record<number, string> = {
    0: 'Light rail', 1: 'Subway', 2: 'Rail', 3: 'Bus', 4: 'Ferry', 5: 'Cable tram', 6: 'Aerial lift', 7: 'Funicular', 11: 'Trolleybus', 12: 'Monorail',
  };
  if (basic[type] !== undefined) return basic[type];
  if (type >= 100 && type < 200) return 'Rail';
  if (type >= 200 && type < 300) return 'Coach';
  if (type >= 700 && type < 800) return 'Bus';
  if (type >= 900 && type < 1000) return 'Light rail';
  return 'Other';
}

/** The type filter's choices: one per type name present in the feed, in the order the Routes give them. */
export function routeTypeChoices(routes: readonly FeedRouteRow[]): string[] {
  return [...new Set(routes.map((route) => routeTypeName(route.type)))];
}

/** The planner's search and type filter. An empty query matches every Route; the type "All types" is `undefined`. */
export interface RouteFilter {
  query: string;
  type?: string;
}

/** Search matches the short name or the long name, ignoring case; the type filter matches the route type name. */
export function filterRouteRows(routes: readonly FeedRouteRow[], filter: RouteFilter): FeedRouteRow[] {
  const query = filter.query.trim().toLowerCase();
  return routes.filter((route) => {
    if (filter.type !== undefined && routeTypeName(route.type) !== filter.type) return false;
    if (query === '') return true;
    return route.shortName.toLowerCase().includes(query) || route.longName.toLowerCase().includes(query);
  });
}

/** Select all shown: the selection plus every Route shown by the filter. Routes that are not shown keep their state. */
export function selectAllShown(selected: ReadonlySet<string>, shown: readonly FeedRouteRow[]): Set<string> {
  const next = new Set(selected);
  for (const route of shown) next.add(route.routeId);
  return next;
}

/**
 * The running total under the Routes table: the number of selected Routes and their weekday trips. The weekday trips come from
 * `weekdayTripsByRoute`, counted on the default weekday date (sub-plan I8, item 3).
 */
export function selectionTotals(selected: ReadonlySet<string>, weekdayTripsByRoute: ReadonlyMap<string, number>): { routes: number; weekdayTrips: number } {
  let weekdayTrips = 0;
  for (const routeId of selected) weekdayTrips += weekdayTripsByRoute.get(routeId) ?? 0;
  return { routes: selected.size, weekdayTrips };
}

/** The size warning: strictly above 40 Routes or 5,000 weekday trips. */
export function isLargeSelection(totals: { routes: number; weekdayTrips: number }): boolean {
  return totals.routes > SIZE_WARNING_ROUTES || totals.weekdayTrips > SIZE_WARNING_TRIPS;
}

/** Next on the Routes step needs at least one Route. */
export function canContinueFromRoutes(selected: ReadonlySet<string>): boolean {
  return selected.size > 0;
}

/**
 * Weekday trips of each Route on one date: the trips the planner's running total counts. Invalid trips are left out, as the rules leave
 * them out of the import (Decision 0089 item 12).
 */
export function tripCountsByRoute(tables: GtfsTables, date: GtfsDate): Map<string, number> {
  // The overview reads no stop times, so a trip is counted from its service, and a frequency template counts once per departure. A trip
  // whose times are blank is counted here, although the import leaves it out; the count is exact for every other trip.
  const active = serviceIdsActiveOn(tables, date);
  const { windows } = frequencyWindows(tables);
  const counts = new Map<string, number>();
  for (const trip of tables.trips) {
    if (!active.has(trip.service_id)) continue;
    const templated = windows.get(trip.trip_id);
    const n = templated ? templated.reduce((sum, window) => sum + windowDepartures(window).length, 0) : 1;
    counts.set(trip.route_id, (counts.get(trip.route_id) ?? 0) + n);
  }
  return counts;
}

/**
 * The number of patterns of a Route, counted by the translation rules on one date (Decision 0089 item 25). Undefined when the Route
 * cannot be translated, so the column shows a dash.
 */
export function patternCountOf(tables: GtfsTables, routeId: string, date: GtfsDate): number | undefined {
  const translation = translateFeed({
    tables,
    routeIds: [routeId],
    scenarioId: 'count',
    tripProfileId: 'count',
    serviceDays: [{ key: 'weekday', serviceDayId: 'count-weekday', name: 'Weekday', date }],
    blocks: { import: false },
    now: '2026-01-01T00:00:00.000Z',
  });
  return translation.routes[0]?.patterns.length;
}

// ---- Step 3: days, holidays, groups, part-year Routes -------------------------------------------------------------------------------

export type OrdinaryDay = 'weekday' | 'saturday' | 'sunday';
/** A holiday class the planner can set (the ones the rules accept; "Not a holiday" is weekdayAsNormal). */
export type HolidayClassChoice = 'saturday' | 'sunday' | 'reducedWeekday' | 'unique' | 'weekdayAsNormal';

/**
 * Every choice on the Days step (sub-plan I8, item 7). Empty values keep the rules' defaults. The keys match the options the feed planner
 * reads (ScenarioFromFeedOptions), so the dialog hands them over unchanged.
 */
export interface DayChoices {
  dates: Partial<Record<OrdinaryDay, GtfsDate>>;
  holidayClasses: Record<GtfsDate, HolidayClassChoice>;
  keepExtraHolidayDays: boolean;
  routeDates: Record<string, Partial<Record<OrdinaryDay, GtfsDate>>>;
  routeOwnCountsOn: string[];
  annualCountOverrides: Partial<Record<string, number>>;
}

export const NO_DAY_CHOICES: DayChoices = {
  dates: {},
  holidayClasses: {},
  keepExtraHolidayDays: true,
  routeDates: {},
  routeOwnCountsOn: [],
  annualCountOverrides: {},
};

/** The text Next shows when the annual days total more than the 365 days of a year (sub-plan I8, item 5). */
export const ANNUAL_TOTAL_MESSAGE = 'Annual service days cannot total more than 365.';
export const ANNUAL_DAYS_MAXIMUM = 365;

/** The planner's choices in the form the feed planner reads. */
export function planChoices(choices: DayChoices): Pick<ScenarioFromFeedOptions, 'dates' | 'holidayClasses' | 'keepExtraHolidayDays' | 'routeDates' | 'routeOwnCountsOn' | 'annualCountOverrides'> {
  return {
    dates: choices.dates,
    holidayClasses: choices.holidayClasses,
    keepExtraHolidayDays: choices.keepExtraHolidayDays,
    routeDates: choices.routeDates,
    routeOwnCountsOn: choices.routeOwnCountsOn,
    annualCountOverrides: choices.annualCountOverrides,
  };
}

/** The feed's plan for the chosen Routes and the planner's choices: the dates, the counts and the holiday days. */
export function planForChoices(tables: GtfsTables, routeIds: readonly string[], choices: DayChoices): FeedDayPlan {
  const options = planChoices(choices);
  return planFeedDays({
    tables,
    routeIds: [...routeIds],
    dates: options.dates,
    holidayClasses: options.holidayClasses,
    keepExtraHolidayDays: options.keepExtraHolidayDays,
    routeDates: options.routeDates,
  });
}

/** The dates the ordinary days use: the planner's choice, or the default. */
export function usedDates(tables: GtfsTables, routeIds: ReadonlySet<string>, choices: DayChoices): ChosenDates {
  return { ...defaultDates(tables, routeIds), ...choices.dates };
}

/** The holiday candidates for the chosen Routes, before the planner's classes (the Holidays list shows all of them). */
export function holidayRows(tables: GtfsTables, routeIds: ReadonlySet<string>, choices: DayChoices): HolidayCandidate[] {
  return holidayCandidates(tables, routeIds, usedDates(tables, routeIds, choices));
}

/** The label of a holiday class in the class menu. */
export function holidayClassLabel(choice: HolidayClassChoice): string {
  switch (choice) {
    case 'saturday': return 'Saturday';
    case 'sunday': return 'Sunday';
    case 'reducedWeekday': return 'Weekday (reduced)';
    case 'unique': return 'Holiday';
    case 'weekdayAsNormal': return 'Not a holiday';
  }
}

/** The class a candidate date has now: the planner's choice, or the rule's proposal. */
export function holidayClassOf(candidate: HolidayCandidate, choices: DayChoices): HolidayClassChoice {
  return choices.holidayClasses[candidate.date] ?? candidate.scenarioClass;
}

/** What one Route does on a holiday candidate, in words for the Holidays table. */
export function routeClassLabel(routeClass: HolidayClass): string {
  switch (routeClass) {
    case 'saturday': return 'Saturday trips';
    case 'sunday': return 'Sunday trips';
    case 'reducedWeekday': return 'Weekday trips, reduced';
    case 'unique': return 'Unique trips';
    case 'none': return 'Does not run';
  }
}

/**
 * The date a service-day group is used for when the planner presses Use this (sub-plan I8, answer 7b): the group's date nearest the middle
 * of the feed's range that has no calendar_dates row; with none, its first date.
 */
export function groupUseDate(tables: GtfsTables, range: FeedRange, dates: readonly GtfsDate[]): GtfsDate {
  const withRows = new Set(tables.calendarDates.map((row) => row.date));
  const free = dates.filter((date) => !withRows.has(date));
  if (free.length === 0) return dates[0];
  let best = free[0];
  for (const date of free) if (halfDaysFromMiddle(range, date) < halfDaysFromMiddle(range, best)) best = date;
  return best;
}

/** Checks the annual days of the service days: whole numbers 0 or more, and a total of at most 365. Undefined when they may be used. */
export function annualDaysProblem(values: readonly number[]): string | undefined {
  if (values.some((value) => !Number.isInteger(value) || value < 0)) return 'Enter a whole number, 0 or more.';
  if (values.reduce((sum, value) => sum + value, 0) > ANNUAL_DAYS_MAXIMUM) return ANNUAL_TOTAL_MESSAGE;
  return undefined;
}

/** Convert a date input's 'YYYY-MM-DD' value to a GtfsDate, and back. */
export function gtfsDateOfInput(value: string): GtfsDate {
  return value.replaceAll('-', '');
}
export function inputDateOf(date: GtfsDate): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** A date as the planner reads it, for example "Tue 20 Jan 2026". Computed in UTC, so the day never shifts with the viewer's zone. */
export function displayDate(date: GtfsDate): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const day = Number(date.slice(6, 8));
  const weekday = WEEKDAY_SHORT[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTH_SHORT[month - 1]} ${year}`;
}
