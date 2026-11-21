import { type GtfsTables } from './feedTables';
import { addDays, checkGtfsDate, dayOfWeek, type GtfsDate } from './time';

// Column names in calendar.txt, Monday first to match dayOfWeek().
const WEEKDAY_COLUMNS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

interface ServiceCalendar {
  start: GtfsDate;
  end: GtfsDate;
  weekdays: boolean[];
}

// Built once per question so that every date check reads the same parsed feed. A service's
// calendar_dates rows are kept per date: the last row for a date wins, as the feed lists them.
interface ServiceIndex {
  calendars: Map<string, ServiceCalendar>;
  exceptions: Map<string, Map<GtfsDate, boolean>>;
}

function buildServiceIndex(tables: GtfsTables): ServiceIndex {
  const calendars = new Map<string, ServiceCalendar>();
  for (const row of tables.calendar) {
    // A service has one calendar row; a repeated row is ignored rather than merged.
    if (calendars.has(row.service_id)) continue;
    calendars.set(row.service_id, {
      start: checkGtfsDate(row.start_date),
      end: checkGtfsDate(row.end_date),
      weekdays: WEEKDAY_COLUMNS.map((column) => row[column] === '1'),
    });
  }

  const exceptions = new Map<string, Map<GtfsDate, boolean>>();
  for (const row of tables.calendarDates) {
    // Exception types other than 1 (added) and 2 (removed) are not defined by the format; they are ignored.
    if (row.exception_type !== '1' && row.exception_type !== '2') continue;
    const date = checkGtfsDate(row.date);
    let byDate = exceptions.get(row.service_id);
    if (!byDate) {
      byDate = new Map();
      exceptions.set(row.service_id, byDate);
    }
    byDate.set(date, row.exception_type === '1');
  }
  return { calendars, exceptions };
}

// An exception row overrides the weekly pattern on its date, in either direction. A service with no
// calendar row runs only on the dates its exceptions add.
function isActiveOn(index: ServiceIndex, serviceId: string, date: GtfsDate): boolean {
  const exception = index.exceptions.get(serviceId)?.get(date);
  if (exception !== undefined) return exception;
  const calendar = index.calendars.get(serviceId);
  if (!calendar) return false;
  return date >= calendar.start && date <= calendar.end && calendar.weekdays[dayOfWeek(date)];
}

/** Service IDs that run on the date, from calendar.txt and calendar_dates.txt. */
export function serviceIdsActiveOn(tables: GtfsTables, date: GtfsDate): Set<string> {
  checkGtfsDate(date);
  const index = buildServiceIndex(tables);
  const serviceIds = new Set([...index.calendars.keys(), ...index.exceptions.keys()]);
  return new Set([...serviceIds].filter((serviceId) => isActiveOn(index, serviceId, date)));
}

// First and last dates on which one service runs. The calendar range is walked from each end, so a
// removed date at either end is skipped; added dates outside the calendar range are also counted.
function serviceEdges(index: ServiceIndex, serviceId: string): { first: GtfsDate; last: GtfsDate } | undefined {
  let first: GtfsDate | undefined;
  let last: GtfsDate | undefined;

  const calendar = index.calendars.get(serviceId);
  if (calendar && calendar.weekdays.includes(true)) {
    for (let date = calendar.start; date <= calendar.end; date = addDays(date, 1)) {
      if (isActiveOn(index, serviceId, date)) {
        first = date;
        break;
      }
    }
    for (let date = calendar.end; date >= calendar.start; date = addDays(date, -1)) {
      if (isActiveOn(index, serviceId, date)) {
        last = date;
        break;
      }
    }
  }

  for (const [date, added] of index.exceptions.get(serviceId) ?? []) {
    if (!added) continue;
    if (first === undefined || date < first) first = date;
    if (last === undefined || date > last) last = date;
  }

  return first !== undefined && last !== undefined ? { first, last } : undefined;
}

/**
 * Earliest and latest date on which any trip of the given routes runs (all routes when absent).
 * Undefined when none. Every trip in trips.txt counts, including trips the rules later refuse on a date;
 * the range describes the feed's service, not the trips that can be imported.
 */
export function feedServiceRange(tables: GtfsTables, routeIds?: ReadonlySet<string>): { start: GtfsDate; end: GtfsDate } | undefined {
  const index = buildServiceIndex(tables);
  const serviceIds = new Set(
    tables.trips.filter((trip) => !routeIds || routeIds.has(trip.route_id)).map((trip) => trip.service_id),
  );

  let start: GtfsDate | undefined;
  let end: GtfsDate | undefined;
  for (const serviceId of serviceIds) {
    const edges = serviceEdges(index, serviceId);
    if (!edges) continue;
    if (start === undefined || edges.first < start) start = edges.first;
    if (end === undefined || edges.last > end) end = edges.last;
  }
  return start !== undefined && end !== undefined ? { start, end } : undefined;
}
