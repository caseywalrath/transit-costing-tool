import { feedServiceRange } from './calendar';
import {
  datesInRange,
  type FeedRange,
  serviceDayOfWeek,
  serviceSetFinder,
  type ServiceDayKey,
} from './dayGroups';
import { type GtfsTables } from './feedTables';
import { type GtfsDate } from './time';

export interface AnnualCountProposal {
  /** Days a year per service day, as proposed; they total 365 whenever the range has any date. */
  countsByKey: Record<string, number>;
  /** Dates of the counted window per service day, before any scaling. */
  datesByKey: Record<string, number>;
  /** Dates from the first to the last service date of the selected routes. */
  rangeDates: number;
  /** Dates actually counted: the whole range, or the 365 dates around its middle when the range is longer. */
  countedDates: number;
  /** True when the counts were multiplied up because the range has fewer than 365 dates. */
  scaled: boolean;
  /** Counted dates on which no selected route runs; they are counted under their day of the week. */
  unmatchedDates: GtfsDate[];
}

const YEAR_DAYS = 365;
const STANDARD_KEYS: ServiceDayKey[] = ['weekday', 'saturday', 'sunday', 'holiday'];

// A range longer than a year is cut to the 365 dates around its middle. For an even number of dates the
// centre falls between two dates and the window starts on the earlier one.
function centredWindow(dates: GtfsDate[]): GtfsDate[] {
  if (dates.length <= YEAR_DAYS) return dates;
  const start = Math.floor((dates.length - YEAR_DAYS) / 2);
  return dates.slice(start, start + YEAR_DAYS);
}

function keyOrder(a: string, b: string): number {
  const rank = (key: string): number => {
    const standard = STANDARD_KEYS.indexOf(key as ServiceDayKey);
    if (standard >= 0) return standard;
    return STANDARD_KEYS.length + Number(key.replace('custom', ''));
  };
  return rank(a) - rank(b);
}

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(STANDARD_KEYS.map((key) => [key, 0]));
}

// Dates with no trips fall back to their day of the week whatever the caller's classification says,
// because no holiday or custom day can have trips on a date where nothing runs.
function countDates(
  dates: GtfsDate[],
  hasService: (date: GtfsDate) => boolean,
  classOfDate: (date: GtfsDate) => ServiceDayKey,
): { counts: Record<string, number>; unmatched: GtfsDate[] } {
  const counts = emptyCounts();
  const unmatched: GtfsDate[] = [];
  for (const date of dates) {
    let key: ServiceDayKey;
    if (hasService(date)) {
      key = classOfDate(date);
    } else {
      unmatched.push(date);
      key = serviceDayOfWeek(date);
    }
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { counts: sortedKeys(counts), unmatched };
}

function sortedKeys(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => keyOrder(a, b)));
}

/**
 * Largest-remainder rounding of `counts × factor` to whole numbers that add up to `total`. A tie between
 * remainders goes to the key that comes first in service-day order, so the result never depends on input order.
 */
function scaleCounts(counts: Record<string, number>, factor: number, total: number): Record<string, number> {
  const entries = Object.entries(counts).sort(([a], [b]) => keyOrder(a, b));
  const exact = entries.map(([key, count]) => ({ key, quota: count * factor }));
  const floors = exact.map(({ quota }) => Math.floor(quota + 1e-9));
  let left = total - floors.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map(({ quota }, index) => ({ index, remainder: quota - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return Object.fromEntries(entries.map(([key], index) => [key, floors[index]]));
}

/**
 * Annual counts for a Scenario: every date of the feed's range goes under one service day,
 * then the counts are scaled to 365. `classOfDate` is the planner's classification of the dates.
 */
export function proposeAnnualCounts(
  tables: GtfsTables,
  routeIds: ReadonlySet<string>,
  classOfDate: (date: GtfsDate) => ServiceDayKey,
): AnnualCountProposal {
  const range = feedServiceRange(tables, routeIds);
  if (!range) {
    const none = emptyCounts();
    return { countsByKey: none, datesByKey: { ...none }, rangeDates: 0, countedDates: 0, scaled: false, unmatchedDates: [] };
  }
  const finder = serviceSetFinder(tables, routeIds);
  const rangeDates = datesInRange(range);
  const counted = centredWindow(rangeDates);
  const { counts, unmatched } = countDates(counted, (date) => finder.on(date).length > 0, classOfDate);
  const scaled = counted.length < YEAR_DAYS;
  return {
    countsByKey: scaled ? scaleCounts(counts, YEAR_DAYS / counted.length, YEAR_DAYS) : { ...counts },
    datesByKey: counts,
    rangeDates: rangeDates.length,
    countedDates: counted.length,
    scaled,
    unmatchedDates: unmatched,
  };
}

/**
 * A part-year route's own annual counts: the dates of its own range counted as for the
 * Scenario and multiplied by the Scenario's factor, 365 ÷ the Scenario's dates when that range is shorter
 * than a year. The total is the route's own days and is not forced to 365, so it stays below the Scenario's.
 */
export function proposeRouteOwnCounts(
  tables: GtfsTables,
  routeId: string,
  classOfDate: (date: GtfsDate) => ServiceDayKey,
  scenarioRangeDates: number,
): Record<string, number> {
  const own = new Set([routeId]);
  const range: FeedRange | undefined = feedServiceRange(tables, own);
  if (!range) return {};
  const finder = serviceSetFinder(tables, own);
  const counted = centredWindow(datesInRange(range));
  const { counts } = countDates(counted, (date) => finder.on(date).length > 0, classOfDate);
  const factor = scenarioRangeDates > 0 && scenarioRangeDates < YEAR_DAYS ? YEAR_DAYS / scenarioRangeDates : 1;
  const total = Math.round(counted.length * factor);
  return scaleCounts(counts, factor, total);
}
