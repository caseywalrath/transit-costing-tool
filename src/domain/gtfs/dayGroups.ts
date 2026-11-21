import { feedServiceRange, serviceIdsActiveOn } from './calendar';
import { type GtfsTables } from './feedTables';
import { addDays, dayOfWeek, daysBetween, type GtfsDate } from './time';
import { tripsOnDate } from './tripsOnDate';

export type ServiceDayKey = 'weekday' | 'saturday' | 'sunday' | 'holiday' | `custom${number}`;

export type FeedRange = { start: GtfsDate; end: GtfsDate };

/** The date the planner (or the default rule) chose for each of the three ordinary service days. */
export type ChosenDates = Partial<Record<'weekday' | 'saturday' | 'sunday', GtfsDate>>;

export interface DayGroup {
  /** The service set shared by every date of the group, sorted. Empty for dates on which no selected route runs. */
  serviceIds: string[];
  dates: GtfsDate[];
  /** Days of the week the dates fall on, 0 = Monday … 6 = Sunday, ascending. */
  daysOfWeek: number[];
  /** Trips of the selected routes on one date of the group (invalid trips left out). */
  tripCount: number;
  /** Services that run on the group's exceptional dates but not in the typical set of that day of the week. */
  addedServiceIds: string[];
  /** Services in the typical set of that day of the week that do not run on the group's exceptional dates. */
  removedServiceIds: string[];
  /** Trips of the group minus trips of a typical day, taken on the group's first exceptional date; 0 when none. */
  tripDelta: number;
  /** Selected routes that have trips in the added or removed services. */
  routeIdsAffected: string[];
}

const SERVICE_DAY_OF_WEEK = {
  weekday: [0, 1, 2, 3, 4],
  saturday: [5],
  sunday: [6],
} as const;

export const ORDINARY_SERVICE_DAYS = ['weekday', 'saturday', 'sunday'] as const;
export type OrdinaryServiceDay = (typeof ORDINARY_SERVICE_DAYS)[number];

/** The service day an ordinary date belongs to by its day of the week. */
export function serviceDayOfWeek(date: GtfsDate): OrdinaryServiceDay {
  const day = dayOfWeek(date);
  return day === 5 ? 'saturday' : day === 6 ? 'sunday' : 'weekday';
}

/** Every date from the start to the end of the range, both included. */
export function datesInRange(range: FeedRange): GtfsDate[] {
  const dates: GtfsDate[] = [];
  for (let date = range.start; date <= range.end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

const SET_SEPARATOR = '\u0000';

export function setKey(serviceIds: readonly string[]): string {
  return serviceIds.join(SET_SEPARATOR);
}

export interface ServiceSetFinder {
  /** Services that have at least one trip of the selected routes. */
  readonly services: ReadonlySet<string>;
  /** Service IDs active on the date that are in `services`, sorted. */
  on(date: GtfsDate): string[];
}

/**
 * The service set of a date: the active services that have a trip of the selected routes. The calendar
 * tables are narrowed to those services once, because serviceIdsActiveOn reads them whole on every call
 * and a day-group pass asks about every date of the feed.
 */
export function serviceSetFinder(tables: GtfsTables, routeIds: ReadonlySet<string>): ServiceSetFinder {
  const services = new Set(tables.trips.filter((trip) => routeIds.has(trip.route_id)).map((trip) => trip.service_id));
  const narrowed: GtfsTables = {
    ...tables,
    calendar: tables.calendar.filter((row) => services.has(row.service_id)),
    calendarDates: tables.calendarDates.filter((row) => services.has(row.service_id)),
  };
  const cache = new Map<GtfsDate, string[]>();
  return {
    services,
    on(date) {
      let found = cache.get(date);
      if (!found) {
        found = [...serviceIdsActiveOn(narrowed, date)].sort(compareText);
        cache.set(date, found);
      }
      return found;
    },
  };
}

export function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Distance from the middle of the range in half days, so that no fraction is needed and a tie is exact. */
export function halfDaysFromMiddle(range: FeedRange, date: GtfsDate): number {
  return Math.abs(2 * daysBetween(range.start, date) - daysBetween(range.start, range.end));
}

export interface DayAnalysis {
  range: FeedRange | undefined;
  dates: GtfsDate[];
  finder: ServiceSetFinder;
  /** Service-set key of each date (see setKey). */
  keyOf: Map<GtfsDate, string>;
  /** Typical service set per day of the week, 0 = Monday. Empty when the range holds no date of that day. */
  typical: string[][];
}

/**
 * Service sets for every date of the feed's range and the typical set per day of the week: the set with
 * the most dates on that day, a tie going to the set whose first date is earliest.
 */
export function analyseDays(tables: GtfsTables, routeIds: ReadonlySet<string>): DayAnalysis {
  const range = feedServiceRange(tables, routeIds);
  const finder = serviceSetFinder(tables, routeIds);
  const dates = range ? datesInRange(range) : [];
  const keyOf = new Map<GtfsDate, string>();
  const tallies: Array<Map<string, { ids: string[]; count: number }>> = Array.from({ length: 7 }, () => new Map());
  for (const date of dates) {
    const ids = finder.on(date);
    const key = setKey(ids);
    keyOf.set(date, key);
    const tally = tallies[dayOfWeek(date)];
    const entry = tally.get(key);
    if (entry) entry.count += 1;
    else tally.set(key, { ids, count: 1 });
  }
  const typical = tallies.map((tally) => {
    let best: { ids: string[]; count: number } | undefined;
    // Map order is first-seen order and dates are ascending, so a strict comparison keeps the earliest set on a tie.
    for (const entry of tally.values()) {
      if (!best || entry.count > best.count) best = entry;
    }
    return best ? best.ids : [];
  });
  return { range, dates, finder, keyOf, typical };
}

function totalTrips(tables: GtfsTables, routeIds: ReadonlySet<string>, date: GtfsDate): number {
  let total = 0;
  for (const trips of tripsOnDate(tables, date, routeIds).byRoute.values()) total += trips.length;
  return total;
}

/** Dates of the feed's range grouped by service set, with the typical set of each day of the week. */
export function dayGroups(
  tables: GtfsTables,
  routeIds: ReadonlySet<string>,
): { range?: FeedRange; groups: DayGroup[]; typicalByDayOfWeek: string[][] } {
  const analysis = analyseDays(tables, routeIds);
  const { range, dates, finder, keyOf, typical } = analysis;
  if (!range) return { groups: [], typicalByDayOfWeek: typical };

  const byKey = new Map<string, { ids: string[]; dates: GtfsDate[] }>();
  for (const date of dates) {
    const key = keyOf.get(date) as string;
    const entry = byKey.get(key);
    if (entry) entry.dates.push(date);
    else byKey.set(key, { ids: finder.on(date), dates: [date] });
  }

  const tripCountOf = new Map<string, number>();
  for (const [key, entry] of byKey) {
    tripCountOf.set(key, entry.ids.length === 0 ? 0 : totalTrips(tables, routeIds, entry.dates[0]));
  }
  const typicalTrips = (day: number): number => {
    const key = setKey(typical[day]);
    if (tripCountOf.has(key)) return tripCountOf.get(key) as number;
    // A typical set always has dates, so it is a group; this only guards a range with no date on that day.
    return 0;
  };

  const routesOfService = new Map<string, Set<string>>();
  for (const trip of tables.trips) {
    if (!routeIds.has(trip.route_id)) continue;
    const routes = routesOfService.get(trip.service_id) ?? new Set<string>();
    routes.add(trip.route_id);
    routesOfService.set(trip.service_id, routes);
  }

  const groups: DayGroup[] = [];
  for (const [key, entry] of byKey) {
    const added = new Set<string>();
    const removed = new Set<string>();
    let firstExceptional: GtfsDate | undefined;
    for (const date of entry.dates) {
      const typicalIds = typical[dayOfWeek(date)];
      if (setKey(typicalIds) === key) continue;
      firstExceptional ??= date;
      for (const id of entry.ids) if (!typicalIds.includes(id)) added.add(id);
      for (const id of typicalIds) if (!entry.ids.includes(id)) removed.add(id);
    }
    const affected = new Set<string>();
    for (const id of [...added, ...removed]) {
      for (const routeId of routesOfService.get(id) ?? []) affected.add(routeId);
    }
    const tripCount = tripCountOf.get(key) as number;
    groups.push({
      serviceIds: entry.ids,
      dates: entry.dates,
      daysOfWeek: [...new Set(entry.dates.map(dayOfWeek))].sort((a, b) => a - b),
      tripCount,
      addedServiceIds: [...added].sort(compareText),
      removedServiceIds: [...removed].sort(compareText),
      tripDelta: firstExceptional === undefined ? 0 : tripCount - typicalTrips(dayOfWeek(firstExceptional)),
      routeIdsAffected: [...affected].sort(compareText),
    });
  }
  // The largest groups come first because they are the ordinary days; groups of one date are the exceptions.
  groups.sort((a, b) => b.dates.length - a.dates.length || compareText(a.dates[0], b.dates[0]));
  return { range, groups, typicalByDayOfWeek: typical };
}

// The nearest date to the middle of the range; a tie goes to the earlier date because dates are scanned in order.
function nearestMiddle(range: FeedRange, candidates: GtfsDate[]): GtfsDate | undefined {
  let best: GtfsDate | undefined;
  let bestDistance = Infinity;
  for (const date of candidates) {
    const distance = halfDaysFromMiddle(range, date);
    if (distance < bestDistance) {
      best = date;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Default date for each ordinary service day. A date qualifies when its service set is the
 * typical set of its day of the week and no calendar_dates row falls on it. Weekday uses the one typical
 * Monday–Friday set that covers the most Monday–Friday dates. A service day with no qualifying date is left out.
 *
 * Feeds that list every date in calendar_dates.txt have a row on every date, so when no date is free of rows
 * the row condition is dropped rather than offering no default at all.
 */
export function defaultDates(tables: GtfsTables, routeIds: ReadonlySet<string>): ChosenDates {
  const { range, dates, keyOf, typical } = analyseDays(tables, routeIds);
  if (!range) return {};
  const datesWithRows = new Set(tables.calendarDates.map((row) => row.date));
  const result: ChosenDates = {};

  for (const serviceDay of ORDINARY_SERVICE_DAYS) {
    const days: readonly number[] = SERVICE_DAY_OF_WEEK[serviceDay];
    const dayDates = dates.filter((date) => days.includes(dayOfWeek(date)));
    const wanted = wantedSetKey(serviceDay, dayDates, keyOf, typical);
    if (wanted === undefined) continue;
    const fits = (date: GtfsDate): boolean =>
      keyOf.get(date) === wanted && setKey(typical[dayOfWeek(date)]) === wanted;
    const picked =
      nearestMiddle(range, dayDates.filter((date) => fits(date) && !datesWithRows.has(date))) ??
      nearestMiddle(range, dayDates.filter(fits));
    if (picked !== undefined) result[serviceDay] = picked;
  }
  return result;
}

// The service set a service day's default date must have: the typical set of its day of the week, or for
// Monday–Friday the typical set that covers the most Monday–Friday dates (a tie goes to the set seen first).
function wantedSetKey(
  serviceDay: OrdinaryServiceDay,
  dayDates: GtfsDate[],
  keyOf: Map<GtfsDate, string>,
  typical: string[][],
): string | undefined {
  const days: readonly number[] = SERVICE_DAY_OF_WEEK[serviceDay];
  const typicalKeys = days.map((day) => setKey(typical[day])).filter((key) => key !== '');
  if (typicalKeys.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const date of dayDates) {
    const key = keyOf.get(date) as string;
    if (typicalKeys.includes(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  // Map order is first-seen order, so a strict comparison keeps the set that appears first on a tie.
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Routes with no trip on the date chosen for a service day but trips on other dates of that day's days of
 * the week. The suggested date is the default date the route would get on its own.
 * A route that never runs on that kind of day is not flagged: it simply does not serve that service day.
 */
export function partYearRoutes(
  tables: GtfsTables,
  routeIds: ReadonlySet<string>,
  chosen: ChosenDates,
): Array<{ routeId: string; serviceDay: OrdinaryServiceDay; suggestedDate?: GtfsDate }> {
  const flagged: Array<{ routeId: string; serviceDay: OrdinaryServiceDay; suggestedDate?: GtfsDate }> = [];
  for (const routeId of [...routeIds].sort(compareText)) {
    const own = new Set([routeId]);
    const range = feedServiceRange(tables, own);
    if (!range) continue;
    const finder = serviceSetFinder(tables, own);
    const ownDates = datesInRange(range);
    for (const serviceDay of ORDINARY_SERVICE_DAYS) {
      const date = chosen[serviceDay];
      if (date === undefined || finder.on(date).length > 0) continue;
      const days: readonly number[] = SERVICE_DAY_OF_WEEK[serviceDay];
      if (!ownDates.some((other) => days.includes(dayOfWeek(other)) && finder.on(other).length > 0)) continue;
      flagged.push({ routeId, serviceDay, suggestedDate: defaultDates(tables, own)[serviceDay] });
    }
  }
  return flagged;
}
