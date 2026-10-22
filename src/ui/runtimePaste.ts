import { parseRuntimeDuration } from '../domain/durations';
import { parseServiceTime } from '../domain/time';
import type { DurationSeconds, ServiceSeconds } from '../domain/types';
import { formatServiceTime } from '../domain/time';
import { formatRuntimeDuration } from '../domain/durations';
import type { RuntimeProfile } from '../domain/types';

export interface RuntimePasteRow {
  sourceRowNumber: number;
  bandLabel?: string;
  startTime: ServiceSeconds;
  endTime: ServiceSeconds;
  segmentRuntimeSeconds: DurationSeconds[];
  calculationMethod?: 'singleBand' | 'blendSegments' | 'segmentStart';
}

/** Spreadsheet-ready CSV for the currently selected Runtime profile. */
export function runtimeProfileCsv(profile: RuntimeProfile): string {
  const headers = ['Band', 'From', 'To', 'Calculation Method', ...profile.bands[0]?.segmentRuntimeSeconds.map((_, index) => `Segment ${index + 1}`) ?? []];
  const escape = (value: unknown) => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  const rows = [headers, ...profile.bands.map((band) => [band.label, formatServiceTime(band.startTime, band.startTime % 60 !== 0), formatServiceTime(band.endTime, band.endTime % 60 !== 0), profile.calculationMethod ?? 'singleBand', ...band.segmentRuntimeSeconds.map(formatRuntimeDuration)])];
  return rows.map((row) => row.map(escape).join(',')).join('\r\n') + '\r\n';
}

export class RuntimePasteParseError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join(' '));
    this.name = 'RuntimePasteParseError';
  }
}

interface DelimitedRow {
  cells: string[];
  lineNumber: number;
}

interface RuntimePasteColumns {
  hasHeader: boolean;
  hasBandLabel: boolean;
  methodIndex?: number;
  hasTotal: boolean;
  expectedColumnCount: number;
}

function detectDelimiter(source: string): string {
  let inQuotes = false;
  let tabs = 0;
  let commas = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (inQuotes && source[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (character === '\r' || character === '\n')) {
      break;
    } else if (!inQuotes && character === '\t') {
      tabs += 1;
    } else if (!inQuotes && character === ',') {
      commas += 1;
    }
  }

  return tabs > 0 || commas === 0 ? '\t' : ',';
}

function parseDelimitedRows(source: string, delimiter: string): DelimitedRow[] {
  const rows: DelimitedRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let quoteClosed = false;
  let lineNumber = 1;
  let rowStartLine = 1;

  const finishCell = () => {
    cells.push(cell.trim());
    cell = '';
    quoteClosed = false;
  };
  const finishRow = () => {
    finishCell();
    rows.push({ cells, lineNumber: rowStartLine });
    cells = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else if (character === '\r' || character === '\n') {
        cell += '\n';
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        lineNumber += 1;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === delimiter) {
      finishCell();
      continue;
    }

    if (character === '\r' || character === '\n') {
      finishRow();
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      lineNumber += 1;
      rowStartLine = lineNumber;
      continue;
    }

    if (quoteClosed) {
      if (/\s/.test(character)) continue;
      throw new RuntimePasteParseError([`Line ${lineNumber}: unexpected text after a quoted field.`]);
    }

    if (character === '"') {
      if (cell.trim()) throw new RuntimePasteParseError([`Line ${lineNumber}: a quote must begin a field.`]);
      cell = '';
      inQuotes = true;
      continue;
    }

    cell += character;
  }

  if (inQuotes) throw new RuntimePasteParseError([`Line ${rowStartLine}: a quoted field is not closed.`]);
  if (cells.length > 0 || cell.length > 0 || quoteClosed || !/[\r\n]$/.test(source)) finishRow();
  return rows;
}

function normalizeHeader(value: string | undefined): string {
  return (value ?? '').trim().replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isFromHeader(value: string): boolean {
  return ['from', 'start', 'starttime'].includes(value);
}

function isToHeader(value: string): boolean {
  return ['to', 'end', 'endtime'].includes(value);
}

function detectColumns(rows: DelimitedRow[], segmentCount: number): RuntimePasteColumns {
  const first = rows[0]?.cells ?? [];
  const normalized = first.map(normalizeHeader);
  const hasBandLabel = ['band', 'period', 'timeperiod', 'timeband'].includes(normalized[0] ?? '')
    && isFromHeader(normalized[1] ?? '')
    && isToHeader(normalized[2] ?? '');
  const startsWithTimes = isFromHeader(normalized[0] ?? '') && isToHeader(normalized[1] ?? '');
  const hasHeader = hasBandLabel || startsWithTimes;

  if (!hasHeader) {
    return { hasHeader: false, hasBandLabel: false, hasTotal: false, expectedColumnCount: segmentCount + 2 };
  }

  const methodHeader = normalized.findIndex((header) => ['method', 'calculationmethod'].includes(header));
  const methodIndex = methodHeader >= 0 ? methodHeader : undefined;
  const hasTotal = ['total', 'runtimetotal', 'totalruntime'].includes(normalized.at(-1) ?? '');
  const expectedColumnCount = segmentCount + 2 + (hasBandLabel ? 1 : 0) + (methodIndex === undefined ? 0 : 1) + (hasTotal ? 1 : 0);
  if (first.length !== expectedColumnCount) {
    throw new RuntimePasteParseError([`The header has ${first.length} columns; this pattern needs ${expectedColumnCount} columns, including From, To, and ${segmentCount} segment runtime${segmentCount === 1 ? '' : 's'}${hasBandLabel ? ' plus Band' : ''}${hasTotal ? ' plus Total' : ''}.`]);
  }
  return { hasHeader: true, hasBandLabel, methodIndex, hasTotal, expectedColumnCount };
}

export function parseRuntimePaste(text: string, segmentCount: number): RuntimePasteRow[] {
  const source = text.replace(/^\uFEFF/, '');
  if (!source.trim()) throw new RuntimePasteParseError(['Paste at least one runtime row.']);

  const delimiter = detectDelimiter(source);
  const rows = parseDelimitedRows(source, delimiter).filter((row) => row.cells.some((value) => value.trim()));
  if (!rows.length) throw new RuntimePasteParseError(['Paste at least one runtime row.']);

  const columns = detectColumns(rows, segmentCount);
  const dataRows = columns.hasHeader ? rows.slice(1) : rows;
  if (!dataRows.length) throw new RuntimePasteParseError(['The pasted data contains a header but no runtime rows.']);

  const issues: string[] = [];
  const parsed: RuntimePasteRow[] = [];
  const offset = columns.hasBandLabel ? 1 : 0;
  const runtimeStart = offset + 2 + (columns.methodIndex === undefined ? 0 : 1);
  let importedMethod: RuntimePasteRow['calculationMethod'];

  for (const row of dataRows) {
    if (row.cells.length !== columns.expectedColumnCount) {
      issues.push(`Line ${row.lineNumber}: expected ${columns.expectedColumnCount} columns but found ${row.cells.length}. Paste From, To, and one value for each segment${columns.hasBandLabel ? ', with an optional Band column' : ''}.`);
      continue;
    }

    const bandLabel = columns.hasBandLabel ? row.cells[0].trim() : undefined;
    if (columns.hasBandLabel && !bandLabel) issues.push(`Line ${row.lineNumber}, Band: enter a time period name.`);
    let calculationMethod: RuntimePasteRow['calculationMethod'];
    if (columns.methodIndex !== undefined) {
      const value = row.cells[columns.methodIndex].trim();
      if (value === 'singleBand' || value === 'blendSegments' || value === 'segmentStart') calculationMethod = value;
      else issues.push(`Line ${row.lineNumber}, Calculation Method: use singleBand, blendSegments, or segmentStart.`);
      if (calculationMethod && importedMethod && importedMethod !== calculationMethod) issues.push('All imported rows must use the same Calculation Method.');
      importedMethod ??= calculationMethod;
    }

    let startTime: ServiceSeconds | undefined;
    let endTime: ServiceSeconds | undefined;
    try { startTime = parseServiceTime(row.cells[offset]); } catch { issues.push(`Line ${row.lineNumber}, From: use a time such as 6:30 or 25:00.`); }
    try { endTime = parseServiceTime(row.cells[offset + 1]); } catch { issues.push(`Line ${row.lineNumber}, To: use a time such as 6:30 or 25:00.`); }

    const segmentRuntimeSeconds: DurationSeconds[] = [];
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      try {
        const duration = parseRuntimeDuration(row.cells[runtimeStart + segmentIndex]);
        if (duration === undefined) throw new Error('Runtime is blank.');
        segmentRuntimeSeconds.push(duration);
      } catch {
        issues.push(`Line ${row.lineNumber}, Segment ${segmentIndex + 1}: use minutes such as 7, :07, or 7:30.`);
      }
    }

    if (startTime !== undefined && endTime !== undefined && segmentRuntimeSeconds.length === segmentCount && (!columns.hasBandLabel || bandLabel)) {
      parsed.push({ sourceRowNumber: row.lineNumber, bandLabel, startTime, endTime, segmentRuntimeSeconds, calculationMethod });
    }
  }

  if (issues.length) throw new RuntimePasteParseError(issues);
  if (!parsed.length) throw new RuntimePasteParseError(['Paste at least one runtime row.']);
  return parsed;
}
