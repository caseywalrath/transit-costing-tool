import type { Node, RoutePattern, RouteStopSet, Trip } from '../domain/types';
import { formatServiceTime } from '../domain/time';
import { stopTimeRows } from '../domain/stopTimes';
import { csvEscape, neutralizeFormulaText } from '../persistence/csv';

export interface StopTimesCsvInput {
  /** The Trips of the displayed schedule, in table order. */
  trips: Trip[];
  patterns: RoutePattern[];
  nodes: Node[];
  set?: RouteStopSet;
  directionName: string;
  /** The Block label of each assigned Trip. */
  blockLabels: Map<string, string>;
}

const clock = (seconds: number) => formatServiceTime(seconds, seconds % 60 !== 0);

/**
 * Decision 0079 item 13: the Trips with stops as one row per Trip per timepoint or stop, in pattern order, in long form. The file is output only
 * (Decision 0044). A Trip whose pattern is missing is skipped; Trip numbers still follow the input order.
 */
export function stopTimesCsv(input: StopTimesCsvInput): string {
  const patternById = new Map(input.patterns.map((pattern) => [pattern.id, pattern] as const));
  const header = ['Trip', 'Direction', 'Pattern', 'Stop Order', 'Stop ID', 'Stop Name', 'Timepoint', 'Time', 'Block'];
  const rows: string[][] = [];
  input.trips.forEach((trip, tripIndex) => {
    const pattern = patternById.get(trip.patternId);
    if (!pattern) return;
    const blockLabel = input.blockLabels.get(trip.id);
    stopTimeRows({ pattern, set: input.set, nodes: input.nodes, trip }).forEach((row, rowIndex) => {
      rows.push([
        String(tripIndex + 1),
        neutralizeFormulaText(input.directionName),
        neutralizeFormulaText(pattern.name),
        String(rowIndex + 1),
        neutralizeFormulaText(row.stopCode ?? ''),
        neutralizeFormulaText(row.name),
        row.kind === 'timepoint' ? 'Yes' : 'No',
        row.time === undefined ? '' : clock(row.time),
        neutralizeFormulaText(blockLabel ?? ''),
      ]);
    });
  });
  return [header, ...rows].map((row) => row.map((cell) => csvEscape(cell)).join(',')).join('\r\n') + '\r\n';
}
