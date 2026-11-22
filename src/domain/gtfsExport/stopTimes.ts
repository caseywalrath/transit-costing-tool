// Decision 0090 item 11: the miles that each stop time row carries as shape_dist_traveled. Pure. This file is the feed's stop_times rules; the
// times themselves come from `stopTimeRows` in `src/domain/stopTimes.ts` (not this folder), which owns the spacing of derived stop times.

import { greatCircleMiles } from '../geo';
import type { StopTimeRow } from '../stopTimes';
import { hasCoordinates, sortedPoints } from '../stops';
import type { RoutePattern, RouteStopSet, StopLocation } from '../types';

/**
 * The miles of each row of a pattern, in row order. A timepoint's miles are its cumulative miles. A Route stop is placed by the rule that
 * placed its time (Decision 0090 item 11): a `previous` stop sits at the segment's first point and a `next` stop at its second; an
 * interpolated stop sits at its share of the segment, by equal spacing or, under distance spacing, by great-circle distance (Decision 0086).
 * The share is not rounded down the way a stop's time is (to the rounding step, Decision 0086), so the miles are exact.
 *
 * `rows` must come from `stopTimeRows` for this pattern and `set`. Rows without a time are fine: the placement depends on timing and
 * spacing, not on times.
 */
export function rowMiles(rows: readonly StopTimeRow[], pattern: RoutePattern, set: RouteStopSet | undefined): number[] {
  const points = sortedPoints(pattern);
  const pointIndex = new Map(points.map((point, index) => [point.id, index] as const));
  const locations: Readonly<Record<string, StopLocation>> = set?.timepointLocationsByPatternId?.[pattern.id] ?? {};
  const stopById = new Map((set?.stops ?? []).map((stop) => [stop.id, stop] as const));

  const miles: number[] = rows.map((row) => {
    if (row.kind !== 'timepoint') return Number.NaN;
    const index = pointIndex.get(row.patternPointId);
    if (index === undefined) throw new Error(`gtfsExport: timepoint ${row.patternPointId} is not on pattern ${pattern.id}.`);
    return points[index].cumulativeMiles;
  });

  const segments = new Map<number, number[]>();
  rows.forEach((row, index) => {
    if (row.kind !== 'stop' || row.segmentIndex === undefined) return;
    segments.set(row.segmentIndex, [...(segments.get(row.segmentIndex) ?? []), index]);
  });

  for (const [segmentIndex, rowIndexes] of segments) {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const segmentRows = rowIndexes.map((index) => rows[index]);
    const shares = placementShares(segmentRows, start.id, end.id, locations, stopById);
    rowIndexes.forEach((rowIndex, position) => {
      const { timing } = rows[rowIndex];
      const share = timing === 'previous' ? 0 : timing === 'next' ? 1 : shares[position];
      miles[rowIndex] = start.cumulativeMiles + share * (end.cumulativeMiles - start.cumulativeMiles);
    });
  }
  return miles;
}

/**
 * The share of the segment at each stop of one segment, by position. Equal spacing: an interpolated stop is the j-th of m interpolated
 * stops, at j / (m + 1). Distance spacing (the row's `spacing`): the cumulative great-circle distance along the chain of the opening point,
 * the stops and the closing point. The same rules as `segmentStopTimes` and `distanceFractions` in `src/domain/stopTimes.ts`; a test holds
 * them to the times that function derives.
 */
function placementShares(
  segmentRows: readonly StopTimeRow[],
  startPointId: string,
  endPointId: string,
  locations: Readonly<Record<string, StopLocation>>,
  stopById: ReadonlyMap<string, { latitude?: number; longitude?: number }>,
): number[] {
  if (segmentRows[0]?.spacing === 'distance') {
    const distance = distanceShares(segmentRows, startPointId, endPointId, locations, stopById);
    if (distance) return distance;
  }
  const interpolated = segmentRows.filter((row) => row.timing === 'interpolate').length;
  let index = 0;
  return segmentRows.map((row) => {
    if (row.timing !== 'interpolate') return 0;
    index += 1;
    return index / (interpolated + 1);
  });
}

function distanceShares(
  segmentRows: readonly StopTimeRow[],
  startPointId: string,
  endPointId: string,
  locations: Readonly<Record<string, StopLocation>>,
  stopById: ReadonlyMap<string, { latitude?: number; longitude?: number }>,
): number[] | undefined {
  const chain = [
    locations[startPointId],
    ...segmentRows.map((row) => stopById.get(row.stopId ?? '')),
    locations[endPointId],
  ];
  const located: Array<{ latitude: number; longitude: number }> = [];
  for (const candidate of chain) {
    if (!hasCoordinates(candidate)) return undefined;
    located.push(candidate);
  }
  const cumulative = [0];
  for (let index = 1; index < located.length; index += 1) {
    cumulative.push(cumulative[index - 1] + greatCircleMiles(located[index - 1], located[index]));
  }
  const total = cumulative[cumulative.length - 1];
  if (!(total > 0)) return undefined;
  return segmentRows.map((_, position) => cumulative[position + 1] / total);
}
