import type { ServiceSeconds } from '../domain/types';
import { formatServiceTime } from '../domain/time';
import type { StopScheduleColumn, StopScheduleColumnMode, StopScheduleDirection, StopScheduleRow } from '../domain/stopSchedule';
import { csvEscape, neutralizeFormulaText } from './csvText';

const FIXED_HEADER = ['Stop ID', 'Stop Name', 'Latitude', 'Longitude', 'Distance (miles)', 'Speed Limit'];
const BLANK_FIXED = ['', '', '', '', '', ''];

/**
 * Decision 0084. One block per direction: a title line, two header rows, one row per stop, and a run time row. Blocks are separated by
 * one empty line. `sample` headers name the period window; `all` headers name the Trip. Output only (Decision 0044).
 */
export function stopScheduleCsv(directions: StopScheduleDirection[], columnMode: StopScheduleColumnMode): string {
  const lines: string[][] = [];
  directions.forEach((direction, index) => {
    if (index > 0) lines.push(['']);
    // The title starts with `[`, so no spreadsheet reads it as a formula and it is written as given.
    lines.push([`[${direction.name}]`]);
    lines.push([...FIXED_HEADER, ...direction.columns.map((column) => neutralizeFormulaText(column.patternName))]);
    lines.push([...BLANK_FIXED, ...direction.columns.map((column) => headerOf(column, columnMode))]);
    direction.rows.forEach((row, rowIndex) => lines.push(rowCells(row, direction.columns, rowIndex)));
    lines.push(['', 'Run time (min)', '', '', '', '', ...direction.columns.map(runTimeOf)]);
  });
  if (lines.length === 0) return '';
  return lines.map((line) => line.map((cell) => csvEscape(cell)).join(',')).join('\r\n') + '\r\n';
}

function headerOf(column: StopScheduleColumn, columnMode: StopScheduleColumnMode): string {
  const label = neutralizeFormulaText(column.label);
  if (columnMode === 'all') {
    return [label, neutralizeFormulaText(column.tripLabel), formatServiceTime(column.startTime)].join('\n');
  }
  return [label, headwayText(column), `${formatServiceTime(column.startTime)}-${formatServiceTime(column.endTime)}`].join('\n');
}

function headwayText(column: StopScheduleColumn): string {
  if (column.headwaySeconds !== undefined) {
    const seconds = column.headwaySeconds;
    return seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} min`;
  }
  return column.tripCount === 1 ? `${column.tripCount} trip` : `${column.tripCount} trips`;
}

function rowCells(row: StopScheduleRow, columns: StopScheduleColumn[], index: number): string[] {
  return [
    neutralizeFormulaText(row.stopCode ?? ''),
    neutralizeFormulaText(row.name),
    row.latitude === undefined ? '' : String(row.latitude),
    row.longitude === undefined ? '' : String(row.longitude),
    row.distanceMiles === undefined ? '' : row.distanceMiles.toFixed(2),
    row.speedLimitMph === undefined ? '' : String(row.speedLimitMph),
    ...columns.map((column) => timeCell(column.times[index])),
  ];
}

function timeCell(time: ServiceSeconds | undefined | null): string {
  if (time === null) return '-';
  if (time === undefined) return '';
  return formatServiceTime(time, time % 60 !== 0);
}

function runTimeOf(column: StopScheduleColumn): string {
  return column.runSeconds === undefined ? '' : String(Math.round(column.runSeconds / 6) / 10);
}
