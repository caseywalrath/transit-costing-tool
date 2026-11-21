// Miles between the points of a pattern. Miles come from the trips' shape when the shape describes the pattern,
// otherwise from great-circle distances between stops. The feed's shape_dist_traveled is never read.

import { greatCircleMiles } from '../geo';
import { compareTripsByOrigin } from './directionsFromFeed';
import type { Row } from './feedTables';
import type { FeedShapePoint } from './routeFromFeed';
import type { FeedTrip } from './tripsOnDate';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Decision 0089 item 29. A timepoint farther than this from the shape means the shape does not describe the pattern. */
export const MAX_SHAPE_OFFSET_MILES = 0.25;

const MILES_PER_HUNDREDTH = 100;

/**
 * The coordinates of a stop row, or undefined when latitude or longitude is missing, not a number, or out of range.
 * A stop that is not usable as a location is treated as having none rather than being guessed at.
 */
export function stopCoordinates(row: Row | undefined): Coordinates | undefined {
  const latitude = finiteNumber(row?.stop_lat);
  const longitude = finiteNumber(row?.stop_lon);
  if (latitude === undefined || longitude === undefined) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
}

function finiteNumber(text: string | undefined): number | undefined {
  if (text === undefined || text.trim() === '') return undefined;
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Decision 0089 item 29. The most common non-blank shape_id of the trips (pass the trips of the most common variant). A tie goes
 * to the earliest trip. Blank shape IDs are ignored.
 */
export function commonShapeId(trips: readonly FeedTrip[]): string | undefined {
  const tally = new Map<string, number>();
  for (const trip of [...trips].sort(compareTripsByOrigin)) {
    const shapeId = trip.shapeId?.trim();
    if (!shapeId) continue;
    tally.set(shapeId, (tally.get(shapeId) ?? 0) + 1);
  }
  // Insertion order is earliest trip first, so a tie keeps the shape of the earlier trip.
  let best: { id: string; count: number } | undefined;
  for (const [id, count] of tally) {
    if (best === undefined || count > best.count) best = { id, count };
  }
  return best?.id;
}

/** What a pattern needs to be measured. */
export interface PatternMeasureInput {
  /** Each stop of the pattern's most common variant, in stop order; undefined where the stop has no usable location. */
  stops: ReadonlyArray<Coordinates | undefined>;
  /** The index in `stops` of each pattern point, in point order. */
  pointAt: readonly number[];
  /** The shape the trips use, when the feed has it. */
  shape?: readonly FeedShapePoint[];
}

export interface PatternMeasure {
  /** Miles from the first point, one per pattern point, rounded to 0.01 mile. */
  cumulativeMiles: number[];
  /** 'shape': measured along the shape. 'straightLine': great-circle distances between stops. 'unmeasured': fewer than two located points. */
  method: 'shape' | 'straightLine' | 'unmeasured';
}

/**
 * Decision 0089 item 29. Timepoints are projected onto the shape in order, so a later point is never placed before an earlier one.
 * Stops without a location are left out of distance chains. A point without a location takes the value of the point before it,
 * so the cumulative miles never fall.
 */
export function measurePattern({ stops, pointAt, shape }: PatternMeasureInput): PatternMeasure {
  const located = pointAt.flatMap((position, point) => {
    const at = stops[position];
    return at ? [{ point, position, at }] : [];
  });
  if (located.length < 2) return { cumulativeMiles: pointAt.map(() => 0), method: 'unmeasured' };

  const along = shape ? projectOntoShape(shape, located.map((entry) => entry.at)) : undefined;
  const relative = along ? along.map((value) => value - along[0]) : straightLineChain(stops, located);
  const method = along ? 'shape' : 'straightLine';

  const cumulativeMiles: number[] = [];
  let next = 0;
  pointAt.forEach((_, point) => {
    if (next < located.length && located[next].point === point) {
      cumulativeMiles.push(roundMiles(relative[next]));
      next += 1;
    } else {
      cumulativeMiles.push(point === 0 ? 0 : cumulativeMiles[point - 1]);
    }
  });
  return { cumulativeMiles, method };
}

function straightLineChain(
  stops: ReadonlyArray<Coordinates | undefined>,
  located: ReadonlyArray<{ position: number }>,
): number[] {
  const relative = [0];
  for (let index = 1; index < located.length; index += 1) {
    let miles = 0;
    let previous: Coordinates | undefined;
    for (let position = located[index - 1].position; position <= located[index].position; position += 1) {
      const at = stops[position];
      if (!at) continue;
      if (previous) miles += greatCircleMiles(previous, at);
      previous = at;
    }
    relative.push(relative[index - 1] + miles);
  }
  return relative;
}

/**
 * The distance along the shape of each point, projected in order. Each point takes the nearest place on the shape at or after the
 * previous point's place. Returns undefined when the shape has fewer than two points or a point is more than 0.25 miles from it.
 */
function projectOntoShape(shapeInput: readonly FeedShapePoint[], points: readonly Coordinates[]): number[] | undefined {
  const shape = [...shapeInput].sort((a, b) => a.sequence - b.sequence);
  if (shape.length < 2) return undefined;

  const meanLatitude = shape.reduce((sum, point) => sum + point.latitude, 0) / shape.length;
  const longitudeScale = Math.cos(toRadians(meanLatitude));
  const starts: number[] = [0];
  const lengths: number[] = [];
  for (let index = 0; index < shape.length - 1; index += 1) {
    const length = greatCircleMiles(shape[index], shape[index + 1]);
    lengths.push(length);
    starts.push(starts[index] + length);
  }

  const along: number[] = [];
  let segment = 0;
  let previousAlong = 0;
  for (const point of points) {
    let best: { distance: number; along: number; segment: number } | undefined;
    for (let index = segment; index < lengths.length; index += 1) {
      const start = shape[index];
      const end = shape[index + 1];
      const length = lengths[index];
      let fraction: number;
      if (length === 0) {
        if (starts[index] < previousAlong) continue;
        fraction = 0;
      } else {
        // On the segment the previous point was on, a point may not be placed behind that point.
        const earliest = index === segment ? clamp((previousAlong - starts[index]) / length, 0, 1) : 0;
        fraction = Math.max(earliest, closestFraction(start, end, point, longitudeScale));
      }
      const at = {
        latitude: start.latitude + fraction * (end.latitude - start.latitude),
        longitude: start.longitude + fraction * (end.longitude - start.longitude),
      };
      const distance = greatCircleMiles(point, at);
      const candidateAlong = starts[index] + fraction * length;
      const better = best === undefined
        || distance < best.distance - 1e-12
        || (Math.abs(distance - best.distance) <= 1e-12 && candidateAlong < best.along);
      if (better) best = { distance, along: candidateAlong, segment: index };
    }
    if (best === undefined || best.distance > MAX_SHAPE_OFFSET_MILES) return undefined;
    along.push(best.along);
    previousAlong = best.along;
    segment = best.segment;
  }
  return along;
}

// The nearest fraction along one segment, measured in a flat frame. Over a few hundred metres the flat frame is accurate enough
// to choose the place; the distance that is reported is still great-circle.
function closestFraction(start: Coordinates, end: Coordinates, point: Coordinates, longitudeScale: number): number {
  const startX = start.longitude * longitudeScale;
  const dx = end.longitude * longitudeScale - startX;
  const dy = end.latitude - start.latitude;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return 0;
  const px = point.longitude * longitudeScale - startX;
  const py = point.latitude - start.latitude;
  return clamp((px * dx + py * dy) / lengthSquared, 0, 1);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function roundMiles(miles: number): number {
  return Math.round(miles * MILES_PER_HUNDREDTH) / MILES_PER_HUNDREDTH;
}
