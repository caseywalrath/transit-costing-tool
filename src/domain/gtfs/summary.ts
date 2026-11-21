import { feedServiceRange } from './calendar';
import { type GtfsTables, type Row, USED_FEED_FILES } from './feedTables';
import { type FeedTrip, tripsOnDate } from './tripsOnDate';
import { checkGtfsDate, daysBetween, type GtfsDate } from './time';

// A feed that ends within this many days is flagged so the planner can ask for a newer one before import.
const EXPIRY_WARNING_DAYS = 30;

export interface FeedSummary {
  agencies: Array<{ id: string; name: string }>;
  feedVersion?: string;
  publisher?: string;
  range?: { start: GtfsDate; end: GtfsDate };
  expiry: 'ok' | 'endsWithin30Days' | 'expired';
  routeCount: number;
  stopCount: number;
  notImported: string[];
  routes: Array<{
    routeId: string;
    shortName: string;
    longName: string;
    /** route_type as a whole number; -1 when the feed leaves it blank or writes it as something other than a whole number. */
    type: number;
    agencyId?: string;
    color?: string;
    tripCount: number;
  }>;
}

/**
 * today and countDate are GtfsDate; tripCount counts trips of each route on countDate. Without a countDate
 * every tripCount is 0, because no date has been chosen to count on.
 */
export function feedSummary(tables: GtfsTables, today: GtfsDate, countDate?: GtfsDate): FeedSummary {
  checkGtfsDate(today);
  const range = feedServiceRange(tables);
  const tripsByRoute = countDate === undefined ? new Map<string, FeedTrip[]>() : tripsOnDate(tables, checkGtfsDate(countDate)).byRoute;
  const info = tables.feedInfo[0];

  return {
    agencies: tables.agency.map((row) => ({ id: row.agency_id ?? '', name: row.agency_name ?? '' })),
    feedVersion: optionalText(info?.feed_version),
    publisher: optionalText(info?.feed_publisher_name),
    range,
    expiry: expiryOf(range, today),
    routeCount: tables.routes.length,
    // Stations (location_type 1) and entrances are not stops a route serves; blank means a stop.
    stopCount: tables.stops.filter((row) => (row.location_type ?? '') === '' || row.location_type === '0').length,
    notImported: tables.fileNames.filter((name) => !USED_FEED_FILES.includes(name)).sort(),
    routes: tables.routes.map((row) => ({
      routeId: row.route_id,
      shortName: row.route_short_name ?? '',
      longName: row.route_long_name ?? '',
      type: routeType(row),
      agencyId: optionalText(row.agency_id),
      color: optionalText(row.route_color),
      tripCount: tripsByRoute.get(row.route_id)?.length ?? 0,
    })),
  };
}

// With no range (no trip at all) there is nothing to expire, so the feed is not flagged.
function expiryOf(range: { start: GtfsDate; end: GtfsDate } | undefined, today: GtfsDate): FeedSummary['expiry'] {
  if (!range) return 'ok';
  if (range.end < today) return 'expired';
  if (daysBetween(today, range.end) <= EXPIRY_WARNING_DAYS) return 'endsWithin30Days';
  return 'ok';
}

function routeType(row: Row): number {
  const value = row.route_type ?? '';
  return /^\d+$/.test(value) ? Number(value) : -1;
}

function optionalText(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}
