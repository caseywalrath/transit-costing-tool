import type { RoutePattern, Trip } from '../domain/types';
import { formatRuntimeDuration } from '../domain/durations';
import { formatServiceTime } from '../domain/time';
import { csvEscape, neutralizeFormulaText } from '../persistence/csv';
import { formatTripConnectionDuration, tripRunTimeSeconds } from './tripsWorkspaceView';

export interface TripTableCsvInput {
  /** The Trips of the displayed schedule, in table order. */
  trips: Trip[];
  patterns: RoutePattern[];
  directionName: string;
  /** The Direction's timepoint columns in table order; each is named as the Trips table names it. */
  columns: Array<{ id: string; name: string }>;
  /** The Block label of each assigned Trip. */
  blockLabels: Map<string, string>;
  /** The Block connection after each assigned Trip, as the Trips table shows it. */
  connections: Map<string, { connection: { usableLayoverSeconds?: number; deadhead?: unknown }; deadheadSeconds?: number; nextTripStart?: number }>;
}

const clock = (seconds: number) => formatServiceTime(seconds, seconds % 60 !== 0);

/**
 * The Trips table as a spreadsheet: one row per Trip, one column per Direction timepoint (so overlaid Patterns share columns), then
 * Run Time, Layover, Deadhead, Next Trip, and Block. The file is output only; Trip and Pattern IDs are not written.
 */
export function tripTableCsv(input: TripTableCsvInput): string {
  const patternById = new Map(input.patterns.map((pattern) => [pattern.id, pattern]));
  const header = ['Direction', 'Pattern', ...input.columns.map((column) => column.name), 'Run Time', 'Layover', 'Deadhead', 'Next Trip', 'Block'];
  const rows = input.trips.map((trip) => {
    const pattern = patternById.get(trip.patternId);
    const times = new Map(trip.stopTimes.map((stop) => [stop.patternPointId, stop.time]));
    const blockLabel = input.blockLabels.get(trip.id);
    const connection = blockLabel === undefined ? undefined : input.connections.get(trip.id);
    const runTime = tripRunTimeSeconds(trip);
    const timepoints = input.columns.map((column) => {
      const point = pattern?.points.find((item) => item.directionColumnId === column.id);
      const time = point && times.get(point.id);
      return time === undefined ? '' : clock(time);
    });
    return [
      neutralizeFormulaText(input.directionName), neutralizeFormulaText(pattern?.name ?? ''), ...timepoints,
      runTime === undefined ? '' : formatRuntimeDuration(runTime),
      connection?.connection.usableLayoverSeconds === undefined ? '' : formatTripConnectionDuration(connection.connection.usableLayoverSeconds),
      connection?.connection.deadhead ? formatTripConnectionDuration(connection.deadheadSeconds) : '',
      connection?.nextTripStart === undefined ? '' : clock(connection.nextTripStart),
      neutralizeFormulaText(blockLabel ?? ''),
    ];
  });
  return [header, ...rows].map((row) => row.map((cell) => csvEscape(cell)).join(',')).join('\r\n') + '\r\n';
}
