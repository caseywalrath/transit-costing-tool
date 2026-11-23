// Run-time profiles from the feed's trips. Each pattern and service day gets one profile with hourly bands. A band holds the trips
// that depart in its hour, and each segment is the median of their segment times (Decision 0089 item 30). Pure: the caller passes
// the times that routeFromFeed measured.

import { metadata, newId } from '../ids';
import type { RoutePattern, RuntimeBand, RuntimeProfile, ServiceSeconds } from '../types';

const SECONDS_PER_HOUR = 3600;

/** A trip's time at each point of its pattern, in pattern order (see timesAtPatternPoints). */
export interface PatternPointTimes {
  pointTimes: readonly ServiceSeconds[];
}

/**
 * The time at each pattern point: the departure, and the arrival at the last point. Dwell at a timepoint is not stored, so a trip's
 * time at a point is the moment it leaves that point (Decision 0089 item 31).
 */
export function timesAtPatternPoints(points: ReadonlyArray<{ departure: number; arrival: number }>): ServiceSeconds[] {
  return points.map((point, index) => (index === points.length - 1 ? point.arrival : point.departure));
}

/**
 * Whole seconds. For an even count, the mean of the two middle values, rounded half up (Decision 0089 item 30). The inputs are whole
 * seconds, so the sum is exact and the "+ 1" before halving does the rounding.
 */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError('A median needs at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.floor((sorted[middle - 1] + sorted[middle] + 1) / 2);
}

/**
 * Hourly bands for trips that run on one pattern. A band starts at an hour with trips and ends where the next such hour starts, so an
 * hour with no trips joins the band before it. The last band ends at the end of the last trip's hour (Decision 0089 item 30). The hour
 * is taken from the first departure, which may be past 24:00 on a service day.
 */
export function runtimeBandsFromTrips(trips: readonly PatternPointTimes[]): RuntimeBand[] {
  if (trips.length === 0) return [];
  const byHour = new Map<number, PatternPointTimes[]>();
  for (const trip of trips) {
    const hour = Math.floor(trip.pointTimes[0] / SECONDS_PER_HOUR);
    const list = byHour.get(hour);
    if (list) list.push(trip);
    else byHour.set(hour, [trip]);
  }
  const hours = [...byHour.keys()].sort((a, b) => a - b);
  return hours.map((hour, index) => {
    const end = index + 1 < hours.length ? hours[index + 1] : hours[hours.length - 1] + 1;
    return {
      id: newId(),
      label: `${clockOf(hour)}–${clockOf(end)}`,
      sequence: index,
      startTime: hour * SECONDS_PER_HOUR,
      endTime: end * SECONDS_PER_HOUR,
      segmentRuntimeSeconds: segmentMedians(byHour.get(hour) ?? []),
    };
  });
}

export interface RuntimeProfileFromFeedInput {
  pattern: RoutePattern;
  /** The service day's name. The profile is named "{name} from feed" (Decision 0089 item 30). */
  serviceDayName: string;
  /** Every trip of the pattern on the service day. */
  trips: readonly PatternPointTimes[];
  now: string;
}

/** The run-time profile of one pattern on one service day, method segmentStart, as the feed gives it. */
export function runtimeProfileFromFeed({ pattern, serviceDayName, trips, now }: RuntimeProfileFromFeedInput): RuntimeProfile {
  return {
    id: newId(),
    scenarioId: pattern.scenarioId,
    routeId: pattern.routeId,
    patternId: pattern.id,
    name: `${serviceDayName} from feed`,
    bands: runtimeBandsFromTrips(trips),
    calculationMethod: 'segmentStart',
    calculationRevision: 0,
    ...metadata(now),
  };
}

function clockOf(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function segmentMedians(members: readonly PatternPointTimes[]): number[] {
  const segments = Math.max(0, (members[0]?.pointTimes.length ?? 0) - 1);
  return Array.from({ length: segments }, (_, index) =>
    medianOf(members.map((trip) => trip.pointTimes[index + 1] - trip.pointTimes[index])),
  );
}
