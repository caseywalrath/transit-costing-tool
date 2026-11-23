// Decision 0092. Warnings that catch location typing errors (a missing minus sign, a shifted decimal, swapped values) while a pattern's
// stops are edited. They never refuse a save: loops and odd alignments are real. Pure: no React, no storage.

import { greatCircleMiles } from './geo';
import { hasCoordinates } from './stops';
import type { StopLocation } from './types';

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

export type LocationWarning =
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

/** The warning as one sentence. Distances below a mile read in metres, longer ones in miles. */
export function locationWarningText(warning: LocationWarning): string {
  if (warning.kind === 'outOfLine') return `This location is ${distanceText(warning.miles * METERS_PER_MILE)} out of line with the stops next to it. Check for a missing minus sign or a misplaced decimal point.`;
  return `Stop ID ${warning.stopCode} is ${distanceText(warning.meters)} from here at ${warning.otherLabel}.`;
}

function distanceText(meters: number): string {
  if (meters < METERS_PER_MILE) return `${Math.round(meters)} m`;
  const miles = meters / METERS_PER_MILE;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString('en-US')} mi`;
}
