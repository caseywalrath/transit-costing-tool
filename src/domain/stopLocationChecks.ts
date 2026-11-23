// Decision 0093. Warnings that catch location typing errors (a missing minus sign, a shifted decimal, swapped values) while a pattern's
// stops are edited. They never refuse a save: loops and odd alignments are real. Pure: no React, no storage.

import { EARTH_RADIUS_MILES, greatCircleMiles } from './geo';
import { hasCoordinates, placementsBySegment, sortedPoints } from './stops';
import type { PatternStopPlacement, RoutePattern, RouteStop, StopLocation, TimepointLocations } from './types';

/** Within this distance, records with one entered stop ID are one stop. The same limit as the GTFS export (Decision 0090 item 5). */
export const SAME_STOP_METERS = 30;
const METERS_PER_MILE = 1609.344;

/**
 * A located row is out of line when the detour through it, compared with going straight between its neighbours, exceeds the larger of
 * twice that straight distance and this many miles.
 */
export const DETOUR_MIN_MILES = 1;
/** A first or last located row, which has one neighbour, is out of line when it is more than this many miles from it. */
export const END_NEIGHBOUR_MILES = 5;

/** One stop or timepoint: `key` identifies it, `label` names it in a warning (for another pattern's row, "Stop on Pattern"). */
export interface LocationRow {
  key: string;
  label: string;
  stopCode?: string;
  location?: StopLocation;
}

/** Rule A: a stop may sit this far behind the farthest row before it along the segment before it is out of order. */
export const BACKTRACK_METERS = 50;
/** Rule A applies to a segment only when its straight line (chord) is at least this share of its entered miles: a fairly straight segment. */
export const STRAIGHT_SEGMENT_SHARE = 0.7;

export type LocationWarning =
  | { key: string; kind: 'outOfOrder'; label: string; previousLabel: string; meters: number }
  | { key: string; kind: 'outOfLine'; miles: number }
  | { key: string; kind: 'stopIdElsewhere'; stopCode: string; otherLabel: string; meters: number };

type Located = LocationRow & { location: { latitude: number; longitude: number } };
const isLocated = (row: LocationRow): row is Located => hasCoordinates(row.location);

/**
 * Option 1. `rows` are one pattern's stops and timepoints in travel order. Each located row is compared with the nearest located row
 * before and after it. Rows without a location are skipped. `miles` is the detour (or, for an end row, the distance) that set off the warning.
 *
 * The detour measure keeps a wrong point from flagging its neighbours: for a row next to a far-away point, the far point is about as far
 * from the row as from the row's other neighbour, so the row's own detour stays small.
 */
export function outOfLineWarnings(rows: readonly LocationRow[]): LocationWarning[] {
  const located = rows.filter(isLocated);
  const warnings: LocationWarning[] = [];
  if (located.length < 2) return warnings;
  located.forEach((row, index) => {
    const before = located[index - 1];
    const after = located[index + 1];
    if (before && after) {
      const straight = greatCircleMiles(before.location, after.location);
      const detour = greatCircleMiles(before.location, row.location) + greatCircleMiles(row.location, after.location) - straight;
      if (detour > Math.max(2 * straight, DETOUR_MIN_MILES)) warnings.push({ key: row.key, kind: 'outOfLine', miles: detour });
      return;
    }
    const neighbour = before ?? after;
    const miles = greatCircleMiles(neighbour.location, row.location);
    // With only two located rows, either may be the wrong one; both are named.
    if (miles > END_NEIGHBOUR_MILES && (located.length === 2 || !endNeighbourIsOutOfLine(located, index))) warnings.push({ key: row.key, kind: 'outOfLine', miles });
  });
  return warnings;
}

/** True when the end row's only neighbour is itself out of line, so the end row is far only because its neighbour is wrong. */
function endNeighbourIsOutOfLine(located: readonly Located[], endIndex: number): boolean {
  const neighbourIndex = endIndex === 0 ? 1 : endIndex - 1;
  const before = located[neighbourIndex - 1];
  const after = located[neighbourIndex + 1];
  if (!before || !after) return false;
  const neighbour = located[neighbourIndex];
  const straight = greatCircleMiles(before.location, after.location);
  const detour = greatCircleMiles(before.location, neighbour.location) + greatCircleMiles(neighbour.location, after.location) - straight;
  return detour > Math.max(2 * straight, DETOUR_MIN_MILES);
}

/**
 * Option 4. Each located row of `rows` with an entered stop ID is compared with every other located record of that stop ID: the other
 * rows of `rows` and `others` (the Route's other patterns and Route stops). One warning per row, naming the farthest record more than
 * SAME_STOP_METERS away. Stop IDs match after trimming, with case kept, as the export matches them.
 */
export function stopIdElsewhereWarnings(rows: readonly LocationRow[], others: readonly LocationRow[]): LocationWarning[] {
  const byCode = new Map<string, Located[]>();
  for (const row of [...rows, ...others]) {
    const code = row.stopCode?.trim();
    if (!code || !isLocated(row)) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), row]);
  }
  const warnings: LocationWarning[] = [];
  for (const row of rows) {
    const code = row.stopCode?.trim();
    if (!code || !isLocated(row)) continue;
    let farthest: { label: string; meters: number } | undefined;
    for (const other of byCode.get(code) ?? []) {
      if (other.key === row.key) continue;
      const meters = greatCircleMiles(row.location, other.location) * METERS_PER_MILE;
      if (meters > SAME_STOP_METERS && (!farthest || meters > farthest.meters)) farthest = { label: other.label, meters };
    }
    if (farthest) warnings.push({ key: row.key, kind: 'stopIdElsewhere', stopCode: code, otherLabel: farthest.label, meters: farthest.meters });
  }
  return warnings;
}

/** One segment of a pattern for rule A: its opening and closing timepoints, its entered miles, and its stops in order. */
export interface LocationSegment {
  opening: LocationRow;
  closing: LocationRow;
  miles?: number;
  stops: LocationRow[];
}

/**
 * A pattern's segments as rule A reads them. Timepoint rows are keyed `point:<pattern point id>` and stop rows `stop:<Route stop id>`, as in
 * the Stops drawer. `stops` gives each Route stop's name and location; `timepointNames` is the display name of each pattern point.
 */
export function patternLocationSegments(
  pattern: RoutePattern,
  stops: readonly RouteStop[],
  placements: readonly PatternStopPlacement[],
  timepointLocations: TimepointLocations | undefined,
  timepointName: (pointId: string) => string,
): LocationSegment[] {
  const points = sortedPoints(pattern);
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const timepoint = (index: number): LocationRow => ({ key: `point:${points[index].id}`, label: timepointName(points[index].id), location: timepointLocations?.[points[index].id] });
  return placementsBySegment(pattern, placements).map((segment, index) => ({
    opening: timepoint(index),
    closing: timepoint(index + 1),
    miles: points[index + 1].cumulativeMiles - points[index].cumulativeMiles,
    stops: segment.map((placement) => { const stop = stopById.get(placement.stopId); return { key: `stop:${placement.stopId}`, label: stop?.name.trim() || 'Untitled stop', location: stop }; }),
  }));
}

/**
 * Rule A (backtracking). In a segment whose two timepoints are located and whose chord is at least STRAIGHT_SEGMENT_SHARE of its entered
 * miles, each located row's progress is its position along the chord (a projection onto it). Rows go opening timepoint, stops, closing
 * timepoint. A row more than BACKTRACK_METERS behind the farthest row before it is out of order; the warning names that farthest row.
 * Rows without a location are skipped. A segment with no entered miles, or 0, is checked on its chord alone.
 */
export function outOfOrderWarnings(segments: readonly LocationSegment[]): LocationWarning[] {
  const warnings: LocationWarning[] = [];
  for (const segment of segments) {
    if (!isLocated(segment.opening) || !isLocated(segment.closing)) continue;
    const origin = segment.opening.location;
    const toLocal = (location: { latitude: number; longitude: number }) => localMeters(origin, location);
    const end = toLocal(segment.closing.location);
    const chord = Math.hypot(end.x, end.y);
    if (chord === 0) continue;
    if (segment.miles !== undefined && segment.miles > 0 && chord < STRAIGHT_SEGMENT_SHARE * segment.miles * METERS_PER_MILE) continue;
    let farthest = { progress: 0, label: segment.opening.label };
    for (const row of [...segment.stops, segment.closing]) {
      if (!isLocated(row)) continue;
      const point = toLocal(row.location);
      const progress = (point.x * end.x + point.y * end.y) / chord;
      if (progress < farthest.progress - BACKTRACK_METERS) warnings.push({ key: row.key, kind: 'outOfOrder', label: row.label, previousLabel: farthest.label, meters: farthest.progress - progress });
      else if (progress > farthest.progress) farthest = { progress, label: row.label };
    }
  }
  return warnings;
}

/** Metres east (x) and north (y) of `origin`: a flat projection, close enough over a segment's few miles. */
function localMeters(origin: { latitude: number; longitude: number }, location: { latitude: number; longitude: number }): { x: number; y: number } {
  const metersPerDegree = (METERS_PER_MILE * Math.PI * EARTH_RADIUS_MILES) / 180;
  return {
    x: (location.longitude - origin.longitude) * metersPerDegree * Math.cos((origin.latitude * Math.PI) / 180),
    y: (location.latitude - origin.latitude) * metersPerDegree,
  };
}

/** The warning as one sentence. Distances below a mile read in metres, longer ones in miles. */
export function locationWarningText(warning: LocationWarning): string {
  if (warning.kind === 'outOfOrder') return `This stop is ${distanceText(warning.meters)} behind ${warning.previousLabel} along the segment. Check the order of the stops or their coordinates.`;
  if (warning.kind === 'outOfLine') return `This location is ${distanceText(warning.miles * METERS_PER_MILE)} out of line with the stops next to it. Check for a missing minus sign or a misplaced decimal point.`;
  return `Stop ID ${warning.stopCode} is ${distanceText(warning.meters)} from here at ${warning.otherLabel}.`;
}

function distanceText(meters: number): string {
  if (meters < METERS_PER_MILE) return `${Math.round(meters)} m`;
  const miles = meters / METERS_PER_MILE;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString('en-US')} mi`;
}
