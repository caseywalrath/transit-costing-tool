import { orderPatterns } from './directions';
import { sortedPoints } from './stops';
import { stopTimeRows, type StopTimeRow } from './stopTimes';
import type { EntityId, Node, PatternPoint, PlannedFrequency, RouteDirection, RoutePattern, RouteStopSet, RuntimeAssignment, RuntimeBand, RuntimeProfile, ServiceSeconds, Trip } from './types';

/** Decision 0084. `sample`: one column per period, from its first Trip. `all`: one column per Trip. */
export type StopScheduleColumnMode = 'sample' | 'all';
export interface StopScheduleInput {
  directions: RouteDirection[];            // already in direction order
  patterns: RoutePattern[]; nodes: Node[]; set?: RouteStopSet;
  trips: Trip[];                            // the Route's Trips of the day and Trip Profile, both directions
  runtimeProfiles: RuntimeProfile[];        // the Route's profiles
  runtimeAssignments: RuntimeAssignment[];  // the day's assignments
  plan?: PlannedFrequency;
  columnMode: StopScheduleColumnMode;
  omitTimepointsWithoutStopId: boolean;
}
export interface StopScheduleRow { key: string; name: string; stopCode?: string; isTimepoint: boolean; latitude?: number; longitude?: number; speedLimitMph?: number; distanceMiles?: number; }
export interface StopScheduleColumn {
  patternId: EntityId; patternName: string;
  label: string;                            // runtime band label, or 'Service'
  headwaySeconds?: number; tripCount: number;
  startTime: ServiceSeconds; endTime: ServiceSeconds;
  tripId: EntityId; tripLabel: string;
  /** One entry per row: a time, undefined (served, no usable time), or null (not served by this pattern). */
  times: Array<ServiceSeconds | undefined | null>;
  runSeconds?: number;
}
export interface StopScheduleDirection { directionId: EntityId; name: string; rows: StopScheduleRow[]; columns: StopScheduleColumn[]; orderConflict: boolean; }

/** A Trip with a usable departure. `position` is its 0-based place in the pattern's departure order (step 3). */
interface Departure { trip: Trip; departure: ServiceSeconds; position: number; }

/** One pattern before merging. `full` is the row list without a Trip, before omission; `keys` and `distanceByIndex` use its indices. */
interface PatternRows {
  pattern: RoutePattern;
  departures: Departure[];
  bands: RuntimeBand[];
  full: StopTimeRow[];
  keys: string[];
  kept: number[];
  distanceByIndex: Map<number, number | undefined>;
}

/** Decision 0084 steps 1 to 9. Directions with no pattern that has a usable Trip are left out. */
export function buildStopSchedule(input: StopScheduleInput): StopScheduleDirection[] {
  const result: StopScheduleDirection[] = [];
  for (const direction of input.directions) {
    const built = buildDirection(input, direction);
    if (built) result.push(built);
  }
  return result;
}

function buildDirection(input: StopScheduleInput, direction: RouteDirection): StopScheduleDirection | undefined {
  const patterns: PatternRows[] = [];
  for (const pattern of orderPatterns(input.patterns, direction.id)) {
    const departures = departuresOf(pattern, input.trips);
    if (departures.length > 0) patterns.push(patternRows(input, pattern, departures));
  }
  if (patterns.length === 0) return undefined;

  // The spine is the pattern with the most exported rows; the first pattern in order wins a tie.
  let spine = 0;
  patterns.forEach((item, index) => { if (item.kept.length > patterns[spine].kept.length) spine = index; });

  // Step 4. `placed[p]` maps each merged key of pattern p to its index in that pattern's `full` list.
  const merged = patterns[spine].kept.map((index) => patterns[spine].keys[index]);
  const placed = patterns.map(() => new Map<string, number>());
  for (const index of patterns[spine].kept) placed[spine].set(patterns[spine].keys[index], index);
  let orderConflict = false;
  patterns.forEach((item, p) => {
    if (p === spine) return;
    let cursor = -1;
    for (const index of item.kept) {
      const key = item.keys[index];
      const at = merged.indexOf(key);
      let placedKey: string;
      if (at >= 0 && at > cursor) {
        cursor = at;
        placedKey = key;
      } else if (at < 0) {
        merged.splice(cursor + 1, 0, key);
        cursor += 1;
        placedKey = key;
      } else {
        placedKey = uniqueKey(merged, key);
        merged.splice(cursor + 1, 0, placedKey);
        cursor += 1;
        orderConflict = true;
      }
      placed[p].set(placedKey, index);
    }
  });

  // Step 5. Details and distance come from the spine first, then the other patterns in order.
  const order = [spine, ...patterns.map((_, p) => p).filter((p) => p !== spine)];
  const rows: StopScheduleRow[] = [];
  for (const key of merged) {
    let detail: StopTimeRow | undefined;
    let distanceMiles: number | undefined;
    for (const p of order) {
      const index = placed[p].get(key);
      if (index === undefined) continue;
      detail ??= patterns[p].full[index];
      distanceMiles ??= patterns[p].distanceByIndex.get(index);
    }
    if (!detail) continue;
    const row: StopScheduleRow = { key, name: detail.name, isTimepoint: detail.kind === 'timepoint' };
    const code = detail.stopCode?.trim();
    if (code) row.stopCode = code;
    if (distanceMiles !== undefined) row.distanceMiles = distanceMiles;
    rows.push(row);
  }

  const columns = patterns.flatMap((item, p) => columnsOf(input, item, merged, placed[p]));
  return { directionId: direction.id, name: direction.name, rows, columns, orderConflict };
}

/** Step 2. Rows of one pattern with their keys, and the rows that survive timepoint omission. */
function patternRows(input: StopScheduleInput, pattern: RoutePattern, departures: Departure[]): PatternRows {
  const full = stopTimeRows({ pattern, set: input.set, nodes: input.nodes });
  const counts = new Map<string, number>();
  const keys = full.map((row) => {
    const base = baseKey(row);
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}#${count}`;
  });
  const kept = full.flatMap((row, index) => (input.omitTimepointsWithoutStopId && row.kind === 'timepoint' && !row.stopCode?.trim() ? [] : [index]));
  return { pattern, departures, bands: bandsOf(input, pattern.id), full, keys, kept, distanceByIndex: distancesOf(pattern, full, kept) };
}

function baseKey(row: StopTimeRow): string {
  const code = row.stopCode?.trim() ?? '';
  if (code !== '') return `code:${code.toLowerCase()}`;
  return row.kind === 'stop' ? `stop:${row.stopId ?? ''}` : `node:${row.nodeId ?? ''}`;
}

/** Step 4. The first `key~n` (n from 2) that the merged list does not hold yet. */
function uniqueKey(merged: readonly string[], key: string): string {
  let n = 2;
  while (merged.includes(`${key}~${n}`)) n += 1;
  return `${key}~${n}`;
}

/** Step 3. The pattern's Trips with a usable departure, by departure then ID. */
function departuresOf(pattern: RoutePattern, trips: readonly Trip[]): Departure[] {
  const first = sortedPoints(pattern)[0];
  const found: Array<{ trip: Trip; departure: ServiceSeconds }> = [];
  for (const trip of trips) {
    if (trip.patternId !== pattern.id) continue;
    const departure = departureOf(first, trip);
    if (departure !== undefined) found.push({ trip, departure });
  }
  found.sort((a, b) => a.departure - b.departure || a.trip.id.localeCompare(b.trip.id));
  return found.map((item, position) => ({ ...item, position }));
}

function departureOf(first: PatternPoint | undefined, trip: Trip): ServiceSeconds | undefined {
  const atFirst = first ? trip.stopTimes.find((item) => item.patternPointId === first.id) : undefined;
  if (atFirst) return atFirst.time;
  if (trip.stopTimes.length === 0) return undefined;
  return Math.min(...trip.stopTimes.map((item) => item.time));
}

/** The runtime bands of the pattern's assignment for the day, through its profile. None when unassigned. */
function bandsOf(input: StopScheduleInput, patternId: EntityId): RuntimeBand[] {
  const assignment = input.runtimeAssignments.find((item) => item.patternId === patternId);
  const profile = assignment ? input.runtimeProfiles.find((item) => item.id === assignment.runtimeProfileId) : undefined;
  return profile?.bands ?? [];
}

/**
 * Step 9 (SS1 rule). The piece between full rows k and k + 1 is the miles between their points when both are timepoints (so no stop
 * lies between them) and the miles are above 0. A row's distance is the sum of the pieces up to the pattern's next kept row.
 */
function distancesOf(pattern: RoutePattern, full: StopTimeRow[], kept: number[]): Map<number, number | undefined> {
  const pointById = new Map(pattern.points.map((point) => [point.id, point] as const));
  const piece = (index: number): number | undefined => {
    const from: StopTimeRow = full[index];
    const to: StopTimeRow | undefined = full[index + 1];
    if (from.kind !== 'timepoint' || to?.kind !== 'timepoint') return undefined;
    const start = pointById.get(from.patternPointId);
    const end = pointById.get(to.patternPointId);
    if (!start || !end) return undefined;
    const miles = end.cumulativeMiles - start.cumulativeMiles;
    return miles > 0 ? miles : undefined;
  };
  const distances = new Map<number, number | undefined>();
  kept.forEach((index, n) => {
    const next: number | undefined = kept[n + 1];
    if (next === undefined) {
      distances.set(index, undefined);
      return;
    }
    let miles: number | undefined = 0;
    for (let k = index; k < next; k += 1) {
      const step = piece(k);
      miles = step === undefined || miles === undefined ? undefined : miles + step;
    }
    distances.set(index, miles);
  });
  return distances;
}

/** Steps 6 to 8. Sample columns (one per period window) or one column per Trip, grouped by pattern. */
function columnsOf(input: StopScheduleInput, item: PatternRows, merged: string[], placed: ReadonlyMap<string, number>): StopScheduleColumn[] {
  const { pattern, departures, bands } = item;
  const columnFor = (first: Departure, tripCount: number, startTime: ServiceSeconds, endTime: ServiceSeconds, headwaySeconds?: number): StopScheduleColumn => {
    const times = timesOf(input, item, merged, placed, first.trip);
    const column: StopScheduleColumn = {
      patternId: pattern.id, patternName: pattern.name, label: bandLabel(bands, first.departure), tripCount, startTime, endTime,
      tripId: first.trip.id, tripLabel: tripLabelOf(first), times,
    };
    if (headwaySeconds !== undefined) column.headwaySeconds = headwaySeconds;
    const runSeconds = runSecondsOf(times);
    if (runSeconds !== undefined) column.runSeconds = runSeconds;
    return column;
  };

  if (input.columnMode === 'all') {
    return departures.map((departure, index) => columnFor(
      departure, 1, departure.departure, departure.departure,
      index > 0 ? departure.departure - departures[index - 1].departure : undefined,
    ));
  }

  // Step 6. Boundaries of the plan's periods and the pattern's runtime bands. Window n holds the Trips with n boundaries at or before them.
  const boundaries = [...new Set([
    ...(input.plan?.periods ?? []).flatMap((period) => [period.startTime, period.endTime]),
    ...bands.flatMap((band) => [band.startTime, band.endTime]),
  ])].sort((a, b) => a - b);
  const windows = new Map<number, Departure[]>();
  for (const departure of departures) {
    const index = boundaries.filter((boundary) => boundary <= departure.departure).length;
    const list = windows.get(index);
    if (list) list.push(departure);
    else windows.set(index, [departure]);
  }
  return [...windows].sort(([a], [b]) => a - b).map(([index, group]) => {
    const first = group[0];
    const last = group[group.length - 1];
    const startTime = index === 0 ? first.departure : boundaries[index - 1];
    const endTime = index === boundaries.length ? last.departure : boundaries[index];
    return columnFor(first, group.length, startTime, endTime, medianHeadway(group));
  });
}

/** Step 6. The lower median of the gaps between consecutive departures in the window. */
function medianHeadway(group: Departure[]): number | undefined {
  if (group.length < 2) return undefined;
  const gaps = group.slice(1).map((item, index) => item.departure - group[index].departure).sort((a, b) => a - b);
  return gaps[Math.floor((gaps.length - 1) / 2)];
}

/** Step 8. The Trip's time for each merged row; null where the pattern has no row with that key. */
function timesOf(input: StopScheduleInput, item: PatternRows, merged: string[], placed: ReadonlyMap<string, number>, trip: Trip): Array<ServiceSeconds | undefined | null> {
  const rows = stopTimeRows({ pattern: item.pattern, set: input.set, nodes: input.nodes, trip });
  return merged.map((key) => {
    const index = placed.get(key);
    return index === undefined ? null : rows[index].time;
  });
}

/** Step 8. Run time of the column: the last defined time minus the first, or undefined with fewer than two. */
function runSecondsOf(times: ReadonlyArray<ServiceSeconds | undefined | null>): number | undefined {
  const defined = times.filter((time): time is ServiceSeconds => typeof time === 'number');
  return defined.length >= 2 ? defined[defined.length - 1] - defined[0] : undefined;
}

function bandLabel(bands: readonly RuntimeBand[], departure: ServiceSeconds): string {
  return bands.find((band) => band.startTime <= departure && departure < band.endTime)?.label ?? 'Service';
}

/** Step 8. The public label when it is not blank, else `Trip` and the 1-based position in the pattern's departure order. */
function tripLabelOf(item: Departure): string {
  const label = item.trip.publicLabel;
  return label !== undefined && label.trim() !== '' ? label : `Trip ${item.position + 1}`;
}
