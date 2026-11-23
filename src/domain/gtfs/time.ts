// Feed times and dates as the rules read them. Times are seconds after the service day's midnight,
// so a trip that runs past midnight keeps counting on the day its service started.

export class GtfsTimeError extends Error {
  constructor(readonly value: string) {
    super(`Not a GTFS time: "${value}"`);
    this.name = 'GtfsTimeError';
  }
}

export class GtfsDateError extends Error {
  constructor(readonly value: string) {
    super(`Not a GTFS date (YYYYMMDD): "${value}"`);
    this.name = 'GtfsDateError';
  }
}

// Hours may pass 23 because a service day can run past midnight. Minutes and seconds never do.
const TIME_PATTERN = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/;

/**
 * 'H:MM:SS' or 'HH:MM:SS', hours may exceed 23. Blank → undefined. Anything else → throws GtfsTimeError.
 * A blank field is only one that holds nothing but spaces; a padded time is refused rather than trimmed,
 * so a stray space in a feed shows up instead of being quietly read.
 */
export function parseGtfsTime(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new GtfsTimeError(value);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** A GTFS date, 'YYYYMMDD'. Strings of this form sort in date order, so comparisons use plain `<`. */
export type GtfsDate = string;

const DATE_PATTERN = /^(\d{4})(\d{2})(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Returns the value when it is a real calendar date in 'YYYYMMDD' form; otherwise throws GtfsDateError. */
export function checkGtfsDate(value: string): GtfsDate {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new GtfsDateError(value);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = utcDate(year, month, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new GtfsDateError(value);
  }
  return value;
}

// Date arithmetic runs in UTC so that no local time zone or daylight saving change can shift a day.
// setUTCFullYear is used rather than Date.UTC because Date.UTC maps years 0 to 99 onto 1900 to 1999.
function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function utcDateOf(date: GtfsDate): Date {
  checkGtfsDate(date);
  return utcDate(Number(date.slice(0, 4)), Number(date.slice(4, 6)), Number(date.slice(6, 8)));
}

function formatGtfsDate(date: Date): GtfsDate {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/** Day of the week: 0 = Monday … 6 = Sunday. */
export function dayOfWeek(date: GtfsDate): number {
  // JavaScript counts from Sunday = 0; shift so that Monday = 0.
  return (utcDateOf(date).getUTCDay() + 6) % 7;
}

export function addDays(date: GtfsDate, n: number): GtfsDate {
  const value = utcDateOf(date);
  value.setUTCDate(value.getUTCDate() + n);
  return formatGtfsDate(value);
}

/** Days from `a` to `b`: positive when `b` is later. */
export function daysBetween(a: GtfsDate, b: GtfsDate): number {
  return Math.round((utcDateOf(b).getTime() - utcDateOf(a).getTime()) / MS_PER_DAY);
}
