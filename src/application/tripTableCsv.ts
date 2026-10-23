import type { RoutePattern, Trip, TripTableImportRow } from '../domain/types';
import { parseServiceTime, formatServiceTime } from '../domain/time';
import { restoreFormulaText, toCsv } from '../persistence/csv';

export interface TripTableCsvParseResult { rows: TripTableImportRow[]; issues: string[]; }

export function tripTableCsv(trips: Trip[], patterns: RoutePattern[], nodeName: (nodeId: string) => string): string {
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const pointColumns = [...new Map(patterns.flatMap((pattern) => pattern.points.map((point) => [point.id, { id: point.id, label: `${pattern.name || 'Pattern'} · ${nodeName(point.nodeId)}` }] as const))).values()];
  const headers = ['tripId', 'patternId', 'publicLabel', ...pointColumns.map((point) => `point:${point.id}:${point.label}`)];
  return toCsv(headers, trips.map((trip) => {
    const times = new Map(trip.stopTimes.map((point) => [point.patternPointId, point.time]));
    return Object.fromEntries([
      ['tripId', trip.id], ['patternId', trip.patternId], ['publicLabel', trip.publicLabel ?? ''],
      ...pointColumns.map((point) => [`point:${point.id}:${point.label}`, times.has(point.id) ? formatServiceTime(times.get(point.id)!, times.get(point.id)! % 60 !== 0) : '']),
    ]);
  }), ['publicLabel']);
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else if (char === '\r' || char === '\n') { cell += '\n'; if (char === '\r' && source[index + 1] === '\n') index += 1; }
      else cell += char;
    } else if (char === '"') {
      if (cell.trim()) throw new Error('A CSV quote must begin a field.');
      cell = ''; quoted = true;
    } else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\r' || char === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
      if (char === '\r' && source[index + 1] === '\n') index += 1;
    } else cell += char;
  }
  if (quoted) throw new Error('A quoted CSV field is not closed.');
  if (row.length || cell || !/[\r\n]$/.test(source)) { row.push(cell); rows.push(row); }
  return rows;
}

export function parseTripTableCsv(source: string): TripTableCsvParseResult {
  try {
    const data = parseCsv(source.replace(/^\uFEFF/, '')).filter((row) => row.some((cell) => cell.trim()));
    if (data.length < 2) return { rows: [], issues: ['CSV must contain a header and at least one Trip row.'] };
    const headers = data[0].map((value) => value.trim());
    const tripIdIndex = headers.indexOf('tripId');
    const patternIndex = headers.indexOf('patternId');
    const labelIndex = headers.indexOf('publicLabel');
    const pointColumns = headers.flatMap((header, index) => {
      const match = /^point:([^:]+):/.exec(header);
      return match ? [{ id: match[1], index }] : [];
    });
    if (tripIdIndex < 0 || patternIndex < 0 || pointColumns.length === 0) return { rows: [], issues: ['Use a Trips CSV exported by this schedule. Required columns are tripId, patternId, and point time columns.'] };
    if (new Set(pointColumns.map((column) => column.id)).size !== pointColumns.length) return { rows: [], issues: ['The CSV contains duplicate timepoint columns.'] };
    const issues: string[] = [];
    const rows: TripTableImportRow[] = [];
    for (const [rowIndex, cells] of data.slice(1).entries()) {
      const line = rowIndex + 2;
      if (cells.length !== headers.length) { issues.push(`Row ${line}: expected ${headers.length} columns but found ${cells.length}.`); continue; }
      const patternId = cells[patternIndex]?.trim();
      if (!patternId) { issues.push(`Row ${line}: patternId is required.`); continue; }
      const stopTimes: TripTableImportRow['stopTimes'] = [];
      for (const column of pointColumns) {
        const value = cells[column.index]?.trim();
        if (!value) continue;
        try { stopTimes.push({ patternPointId: column.id, time: parseServiceTime(value) }); }
        catch { issues.push(`Row ${line}: enter a valid time in every used timepoint column.`); }
      }
      rows.push({
        ...(cells[tripIdIndex]?.trim() ? { tripId: cells[tripIdIndex].trim() } : {}),
        patternId,
        ...(labelIndex >= 0 && cells[labelIndex]?.trim() ? { publicLabel: restoreFormulaText(cells[labelIndex].trim()) } : {}),
        stopTimes,
      });
    }
    return { rows, issues };
  } catch (error) {
    return { rows: [], issues: [error instanceof Error ? error.message : 'Unable to read this CSV file.'] };
  }
}
