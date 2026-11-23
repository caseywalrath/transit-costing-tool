// Decisions 0090 items 13 to 15: calendar.txt and calendar_dates.txt from the service days in use, the export range and the holidays. Pure.
// Dates are GTFS dates (YYYYMMDD); the day arithmetic is in `domain/gtfs/time.ts`.

import { addDays, checkGtfsDate, dayOfWeek, type GtfsDate } from '../gtfs/time';
import type { ServiceDayKind } from '../types';
import { compareCodeUnits } from './csvText';

/** Decision 0090 item 13. Weekday flags, Monday first. A holiday or custom day runs on no weekday. */
const WEEKDAY_FLAGS: Readonly<Record<ServiceDayKind, readonly boolean[]>> = {
  weekday: [true, true, true, true, true, false, false],
  saturday: [false, false, false, false, false, true, false],
  sunday: [false, false, false, false, false, false, true],
  holiday: [false, false, false, false, false, false, false],
  custom: [false, false, false, false, false, false, false],
};

/** A service day in use: its `service_id` (the day's abbreviation, Decision 0059) and its kind. */
export interface CalendarService {
  serviceId: string;
  kind: ServiceDayKind;
}

/** A holiday date and the service it runs (Decision 0090 item 14). */
export interface CalendarHoliday {
  date: GtfsDate;
  serviceId: string;
}

export interface CalendarRange {
  start: GtfsDate;
  end: GtfsDate;
}

export interface CalendarRow {
  serviceId: string;
  weekdays: readonly boolean[];
  start: GtfsDate;
  end: GtfsDate;
}

/** `exceptionType` 1 adds the service on the date; 2 removes it (GTFS). */
export interface CalendarDateRow {
  serviceId: string;
  date: GtfsDate;
  exceptionType: 1 | 2;
}

export interface CalendarPlan {
  /** One row per service in use, sorted by `service_id`. */
  calendar: CalendarRow[];
  /** Sorted by `service_id`, then date. */
  calendarDates: CalendarDateRow[];
  /** Whether the service runs on the date, with the calendar_dates rows applied over the weekday flags. */
  runsOn(serviceId: string, date: GtfsDate): boolean;
  /** How many dates of the range the service runs on (Decision 0090 item 21). */
  datesInRange(serviceId: string): number;
}

/** A date as the settings hold it (YYYY-MM-DD) to a GTFS date, or undefined when it is not a real calendar date. */
export function gtfsDateFromIso(value: string): GtfsDate | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  try {
    return checkGtfsDate(`${match[1]}${match[2]}${match[3]}`);
  } catch {
    return undefined;
  }
}

/**
 * Decision 0090 items 13 and 14. A holiday adds its service on its date (exception 1) when that service is in use, and removes each
 * other service that is in use and would run on that day, whatever its kind (exception 2), except the holiday's own service. Throws when two of the
 * exceptions disagree on one service and date (the caller refuses duplicate holiday dates before this).
 */
export function planCalendar(input: { range: CalendarRange; services: readonly CalendarService[]; holidays: readonly CalendarHoliday[] }): CalendarPlan {
  const { range } = input;
  const services = [...input.services].sort((left, right) => compareCodeUnits(left.serviceId, right.serviceId));
  const kindById = new Map(services.map((service) => [service.serviceId, service.kind] as const));
  const exceptions = new Map<string, Map<GtfsDate, 1 | 2>>();

  const setException = (serviceId: string, date: GtfsDate, exceptionType: 1 | 2): void => {
    const byDate = exceptions.get(serviceId) ?? new Map<GtfsDate, 1 | 2>();
    exceptions.set(serviceId, byDate);
    const existing = byDate.get(date);
    if (existing !== undefined && existing !== exceptionType) {
      throw new Error(`gtfsExport: service ${serviceId} has two calendar exceptions on ${date}.`);
    }
    byDate.set(date, exceptionType);
  };

  for (const holiday of input.holidays) {
    if (kindById.has(holiday.serviceId)) setException(holiday.serviceId, holiday.date, 1);
    // Every other in-use service that would run on that date is replaced, a Saturday or Sunday service on its day included.
    for (const service of services) {
      if (service.serviceId !== holiday.serviceId && WEEKDAY_FLAGS[service.kind][dayOfWeek(holiday.date)]) setException(service.serviceId, holiday.date, 2);
    }
  }

  const calendar: CalendarRow[] = services.map((service) => ({
    serviceId: service.serviceId,
    weekdays: WEEKDAY_FLAGS[service.kind],
    start: range.start,
    end: range.end,
  }));

  const calendarDates: CalendarDateRow[] = [];
  for (const [serviceId, byDate] of exceptions) {
    for (const [date, exceptionType] of byDate) calendarDates.push({ serviceId, date, exceptionType });
  }
  calendarDates.sort((left, right) => compareCodeUnits(left.serviceId, right.serviceId) || compareCodeUnits(left.date, right.date));

  const runsOn = (serviceId: string, date: GtfsDate): boolean => {
    const exception = exceptions.get(serviceId)?.get(date);
    if (exception !== undefined) return exception === 1;
    const kind = kindById.get(serviceId);
    return kind !== undefined && WEEKDAY_FLAGS[kind][dayOfWeek(date)];
  };

  const datesInRange = (serviceId: string): number => {
    let count = 0;
    for (let date = range.start; date <= range.end; date = addDays(date, 1)) {
      if (runsOn(serviceId, date)) count += 1;
    }
    return count;
  };

  return { calendar, calendarDates, runsOn, datesInRange };
}
