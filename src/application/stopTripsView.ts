import type { Node, PatternStopPlacement, RoutePattern, RouteStopSet, ServiceSeconds, StopTimeRoundingSeconds, Trip } from '../domain/types';
import { stopTimeRows, type StopTimeRow } from '../domain/stopTimes';

export interface StopTripsTable {
  /** Layout rows without times (`stopTimeRows` without a Trip), in pattern order. */
  rows: StopTimeRow[];
  /** The Trips of the pattern, in input order. */
  trips: Trip[];
  /** Trip ID to one time per row (undefined when none). */
  times: Map<string, Array<ServiceSeconds | undefined>>;
}

/**
 * Decision 0079 item 15: the Stop trips drawer's table for one pattern. Rows are the timepoints and stops of the pattern in pattern order. Only Trips
 * of this pattern are included. `placements` and `roundingSeconds`, when given, replace the stored ones for the drawer's draft.
 */
export function stopTripsTable(input: { pattern: RoutePattern; set?: RouteStopSet; nodes: readonly Node[]; trips: readonly Trip[]; placements?: readonly PatternStopPlacement[]; roundingSeconds?: StopTimeRoundingSeconds }): StopTripsTable {
  const { pattern, set, nodes, placements, roundingSeconds } = input;
  const trips = input.trips.filter((trip) => trip.patternId === pattern.id);
  const rows = stopTimeRows({ pattern, set, nodes, placements, roundingSeconds });
  const times = new Map(trips.map((trip) => [trip.id, stopTimeRows({ pattern, set, nodes, trip, placements, roundingSeconds }).map((row) => row.time)] as const));
  return { rows, trips, times };
}
