import { directionDisplayName, patternDirectionGroups } from '../directions';
import type { EntityId, RouteDirection, RoutePattern, ServiceSeconds, Trip } from '../types';
import type { DirectionDayMeasure, HeadwayPeriodKey, RouteDayMeasures } from './types';

const HOUR = 3600;

/**
 * Decision 0091 item 11. The headway periods by a Trip's departure at its first stop time, in table order. A period includes its start
 * and excludes its end; Early takes everything before 6:00, and Night runs from 21:00 with no end, so times past 24:00 fall in it.
 */
export const HEADWAY_PERIODS: ReadonlyArray<{ key: HeadwayPeriodKey; label: string; startSeconds: number; endSeconds: number }> = [
  { key: 'early', label: 'Early', startSeconds: -Infinity, endSeconds: 6 * HOUR },
  { key: 'amPeak', label: 'AM peak', startSeconds: 6 * HOUR, endSeconds: 9 * HOUR },
  { key: 'midday', label: 'Midday', startSeconds: 9 * HOUR, endSeconds: 15 * HOUR },
  { key: 'pmPeak', label: 'PM peak', startSeconds: 15 * HOUR, endSeconds: 18 * HOUR },
  { key: 'evening', label: 'Evening', startSeconds: 18 * HOUR, endSeconds: 21 * HOUR },
  { key: 'night', label: 'Night', startSeconds: 21 * HOUR, endSeconds: Infinity },
];

/**
 * Decision 0091 item 11. The headway of each period, in minutes, in HEADWAY_PERIODS order: (last − first departure) ÷ (trips − 1),
 * rounded to the nearest half minute. Undefined ("—") with fewer than two departures in the period.
 */
export function headwaysByPeriod(departuresSeconds: readonly ServiceSeconds[]): Array<number | undefined> {
  return HEADWAY_PERIODS.map((period) => {
    const inPeriod = departuresSeconds
      .filter((seconds) => seconds >= period.startSeconds && seconds < period.endSeconds)
      .sort((left, right) => left - right);
    if (inPeriod.length < 2) return undefined;
    const minutes = (inPeriod[inPeriod.length - 1] - inPeriod[0]) / ((inPeriod.length - 1) * 60);
    return Math.round(minutes * 2) / 2;
  });
}

export interface RouteDayInput {
  routeId: EntityId;
  serviceDayId: EntityId;
  /** The side's Trips, already filtered to the Trip profile being compared. */
  trips: Trip[];
  patterns: RoutePattern[];
  directions: RouteDirection[];
}

/** Decision 0091 item 10: a pattern's direction group (named by the direction's name), or its direction's own name when it has no group. */
function directionOf(pattern: RoutePattern | undefined, group: 'outbound' | 'inbound' | undefined, directions: Map<EntityId, RouteDirection>): { key: string; name: string } {
  const direction = pattern?.directionId ? directions.get(pattern.directionId) : undefined;
  if (group) return { key: group, name: directionDisplayName(group, direction?.name) };
  if (direction) {
    const name = direction.name.trim() || 'Unnamed direction';
    return { key: `name:${name.toLowerCase()}`, name };
  }
  // A pattern with no direction at all has no direction name to show, so its own name stands in.
  return { key: `pattern:${pattern?.id ?? 'unknown'}`, name: pattern?.name?.trim() || 'Unnamed pattern' };
}

/** Outbound first, then Inbound, then the other directions by name. */
const directionRank = (key: string): number => (key === 'outbound' ? 0 : key === 'inbound' ? 1 : 2);

/**
 * Decision 0091 item 9 for one side, one Route and one service day. Trips are the Route's Trips on the day. Revenue miles of a Trip are the
 * cumulative miles of its pattern at its last stop time minus those at its first; the Route's miles are undefined when any Trip lacks
 * them. Each direction keeps its departures (first stop times) and span (earliest first departure to latest last arrival).
 */
export function routeDayMeasures(input: RouteDayInput): RouteDayMeasures {
  const trips = input.trips.filter((trip) => trip.routeId === input.routeId && trip.serviceDayId === input.serviceDayId);
  const patterns = new Map(input.patterns.map((pattern) => [pattern.id, pattern] as const));
  const directions = new Map(input.directions.map((direction) => [direction.id, direction] as const));
  const groups = patternDirectionGroups(input.patterns, input.directions);
  const byKey = new Map<string, DirectionDayMeasure>();
  let revenueMiles: number | undefined = 0;

  for (const trip of trips) {
    const pattern = patterns.get(trip.patternId);
    const stops = [...trip.stopTimes].sort((left, right) => left.sequence - right.sequence);
    const first = stops[0];
    const last = stops[stops.length - 1];

    if (revenueMiles !== undefined) {
      const milesAt = (patternPointId: EntityId) => pattern?.points.find((point) => point.id === patternPointId)?.cumulativeMiles;
      const startMiles = first ? milesAt(first.patternPointId) : undefined;
      const endMiles = last ? milesAt(last.patternPointId) : undefined;
      revenueMiles = startMiles === undefined || endMiles === undefined ? undefined : revenueMiles + (endMiles - startMiles);
    }

    const { key, name } = directionOf(pattern, groups.get(trip.patternId), directions);
    const measure: DirectionDayMeasure = byKey.get(key) ?? { key, name, departures: [] };
    byKey.set(key, measure);
    if (!first || !last) continue;
    measure.departures.push(first.time);
    measure.span = measure.span
      ? { start: Math.min(measure.span.start, first.time), end: Math.max(measure.span.end, last.time) }
      : { start: first.time, end: last.time };
  }

  const measuresByDirection = [...byKey.values()]
    .map((measure) => ({ ...measure, departures: [...measure.departures].sort((left, right) => left - right) }))
    .sort((left, right) => directionRank(left.key) - directionRank(right.key) || left.name.localeCompare(right.name));
  return { trips: trips.length, ...(revenueMiles === undefined ? {} : { revenueMiles }), directions: measuresByDirection };
}
