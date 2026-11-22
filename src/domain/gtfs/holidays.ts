import {
  analyseDays,
  type ChosenDates,
  compareText,
  type ServiceDayKey,
} from './dayGroups';
import { type GtfsTables, type Row } from './feedTables';
import { dayOfWeek, type GtfsDate } from './time';
import { type FeedTrip, stopIdKey, tripsOnDate } from './tripsOnDate';

export type HolidayClass = 'saturday' | 'sunday' | 'reducedWeekday' | 'unique' | 'none';

export interface HolidayCandidate {
  date: GtfsDate;
  /** Services a calendar_dates row adds on the date that its day of the week does not normally run. */
  addedServiceIds: string[];
  /** Services of the typical set of its day of the week that a calendar_dates row removes on the date. */
  removedServiceIds: string[];
  byRoute: Record<string, HolidayClass>;
  /** The class for the Scenario: a class only when every route that runs the date has it, otherwise unique. */
  scenarioClass: Exclude<HolidayClass, 'none'>;
}

// Two trips are the same when direction, stop sequence and first departure match.
// Trip IDs and service IDs are left out on purpose: a holiday often reuses Saturday trips under a new service.
function tripKey(trip: FeedTrip): string {
  const first = trip.stopTimes[0];
  const departure = first?.departure ?? first?.arrival ?? '';
  return `${trip.directionId ?? ''}|${stopIdKey(trip.stopTimes)}|${departure}`;
}

/** Per route, the sorted identity keys of its trips on the date. Routes with no trip are absent. */
function tripKeysOnDate(tables: GtfsTables, routeIds: ReadonlySet<string>, date: GtfsDate): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const [routeId, trips] of tripsOnDate(tables, date, routeIds).byRoute) {
    if (trips.length > 0) keys.set(routeId, trips.map(tripKey).sort(compareText));
  }
  return keys;
}

function sameKeys(a: readonly string[], b: readonly string[] | undefined): boolean {
  return b !== undefined && a.length === b.length && a.every((key, index) => key === b[index]);
}

/**
 * Dates where the feed departs from the normal day of the week, each classified per route
 * against the chosen Saturday, Sunday and Weekday dates. Names of public holidays are never read.
 * A date on which none of the routes runs is left out: there is nothing to classify, and the annual counts
 * list it as a date without trips.
 */
export function holidayCandidates(
  tables: GtfsTables,
  routeIds: ReadonlySet<string>,
  chosen: ChosenDates,
): HolidayCandidate[] {
  const { range, dates, finder, typical } = analyseDays(tables, routeIds);
  if (!range) return [];

  const rowsByDate = new Map<GtfsDate, Row[]>();
  for (const row of tables.calendarDates) {
    if (!finder.services.has(row.service_id)) continue;
    const rows = rowsByDate.get(row.date) ?? [];
    rows.push(row);
    rowsByDate.set(row.date, rows);
  }

  const reference = (date: GtfsDate | undefined): Map<string, string[]> =>
    date === undefined ? new Map() : tripKeysOnDate(tables, routeIds, date);
  const saturday = reference(chosen.saturday);
  const sunday = reference(chosen.sunday);
  const weekday = reference(chosen.weekday);

  const candidates: HolidayCandidate[] = [];
  for (const date of dates) {
    const rows = rowsByDate.get(date);
    if (!rows) continue;
    const day = dayOfWeek(date);
    const active = finder.on(date);
    const normal = typical[day];
    // Both tests look at what really runs, so a row that repeats the weekly pattern is not an exception
    // and the last row for a service on a date is the one that counts, as in serviceIdsActiveOn.
    const added = unique(
      rows
        .filter((row) => row.exception_type === '1' && active.includes(row.service_id) && !normal.includes(row.service_id))
        .map((row) => row.service_id),
    );
    const removed = unique(
      rows
        .filter((row) => row.exception_type === '2' && !active.includes(row.service_id) && normal.includes(row.service_id))
        .map((row) => row.service_id),
    );
    if (added.length === 0 && removed.length === 0) continue;

    const onDate = tripKeysOnDate(tables, routeIds, date);
    if (onDate.size === 0) continue;
    // Weekday-pattern removals with nothing added are the "typical Monday–Friday set with some of it removed" case.
    const weekdayWithRemovals = day <= 4 && added.length === 0 && removed.length > 0;
    // A Sunday that matches both reference days is Sunday service; any other date prefers Saturday.
    const referenceOrder: Array<['saturday' | 'sunday', Map<string, string[]>]> =
      day === 6 ? [['sunday', sunday], ['saturday', saturday]] : [['saturday', saturday], ['sunday', sunday]];

    const byRoute: Record<string, HolidayClass> = {};
    for (const routeId of [...routeIds].sort(compareText)) {
      const keys = onDate.get(routeId);
      if (!keys) {
        byRoute[routeId] = 'none';
        continue;
      }
      const match = referenceOrder.find(([, trips]) => sameKeys(keys, trips.get(routeId)));
      if (match) {
        byRoute[routeId] = match[0];
        continue;
      }
      const weekdayKeys = new Set(weekday.get(routeId) ?? []);
      const reduced = weekdayWithRemovals || keys.every((key) => weekdayKeys.has(key));
      byRoute[routeId] = reduced ? 'reducedWeekday' : 'unique';
    }
    candidates.push({
      date,
      addedServiceIds: added,
      removedServiceIds: removed,
      byRoute,
      scenarioClass: scenarioClassOf(Object.values(byRoute)),
    });
  }
  return candidates;
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

// A shared class only when every route that runs the date has it; a mix is shown route by route and counts as unique.
function scenarioClassOf(classes: HolidayClass[]): Exclude<HolidayClass, 'none'> {
  const running = classes.filter((value): value is Exclude<HolidayClass, 'none'> => value !== 'none');
  const first = running[0];
  return running.every((value) => value === first) ? first : 'unique';
}

/**
 * Holiday service days for the unique candidates. Holiday takes the unique date with the most
 * trips (tie: earliest). Another unique date whose trips differ from every day proposed so far becomes
 * "Holiday 2", "Holiday 3"; a date with the same trips as one of them is counted under that day.
 */
export function proposeHolidayDays(
  tables: GtfsTables,
  routeIds: ReadonlySet<string>,
  candidates: HolidayCandidate[],
): Array<{ key: ServiceDayKey; name: string; date: GtfsDate; dates: GtfsDate[] }> {
  const described = candidates
    .filter((candidate) => candidate.scenarioClass === 'unique')
    .map((candidate) => {
      const keys = tripKeysOnDate(tables, routeIds, candidate.date);
      let count = 0;
      for (const list of keys.values()) count += list.length;
      const signature = [...keys.entries()]
        .sort(([a], [b]) => compareText(a, b))
        .map(([routeId, list]) => `${routeId}\u0001${list.join('\u0002')}`)
        .join('\u0003');
      return { date: candidate.date, count, signature };
    })
    .sort((a, b) => b.count - a.count || compareText(a.date, b.date));

  const days: Array<{ key: ServiceDayKey; name: string; date: GtfsDate; dates: GtfsDate[]; signature: string }> = [];
  for (const entry of described) {
    const same = days.find((day) => day.signature === entry.signature);
    if (same) {
      same.dates.push(entry.date);
      continue;
    }
    const number = days.length;
    days.push({
      key: number === 0 ? 'holiday' : `custom${number}`,
      name: number === 0 ? 'Holiday' : `Holiday ${number + 1}`,
      date: entry.date,
      dates: [entry.date],
      signature: entry.signature,
    });
  }
  return days.map(({ key, name, date, dates }) => ({ key, name, date, dates: dates.sort(compareText) }));
}
