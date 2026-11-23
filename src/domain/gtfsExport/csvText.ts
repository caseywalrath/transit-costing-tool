// CSV text and GTFS value formats for the export (Decision 0090 items 4, 10, 11 and 17). Pure. The feed's files use LF line endings, no byte
// order mark, a header row, and quote a field only when it holds a comma, a double quote or a line break (item 4).
// `src/persistence/csv.ts` is not used: it writes CRLF and neutralizes formula text for spreadsheets, and domain code imports nothing from
// persistence.

export type CsvCell = string | number | undefined;

/** One field as text: quoted, with each double quote doubled, only when it holds a comma, a double quote or a line break. */
export function csvField(value: CsvCell): string {
  const text = value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * A table as text: the header line, then one line per record, each ended by LF. Columns are written in the order given; a record's
 * value for a column it does not hold is blank.
 */
export function csvTable(columns: readonly string[], rows: ReadonlyArray<Readonly<Record<string, CsvCell>>>): string {
  const line = (cells: readonly CsvCell[]): string => `${cells.map(csvField).join(',')}\n`;
  return line(columns) + rows.map((row) => line(columns.map((column) => row[column]))).join('');
}

/** Code-unit order, which is how the feed's rows are sorted (Decision 0090 item 12). Locale order would move digits and letters apart. */
export function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

function requireWholeSeconds(seconds: number): void {
  if (!Number.isInteger(seconds) || seconds < 0) throw new Error(`gtfsExport: a GTFS time must be a whole, non-negative number of seconds, not ${seconds}.`);
}

/** Decision 0090 item 11. A GTFS time, HH:MM:SS. Hours past 23 are kept, so a trip that runs past midnight reads 24:30:00. */
export function gtfsClock(seconds: number): string {
  requireWholeSeconds(seconds);
  return `${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor((seconds % 3600) / 60))}:${pad2(seconds % 60)}`;
}

/** Decision 0090 item 10. The HHMM part of a trip ID: hours past 23 kept, seconds dropped. */
export function gtfsHhmm(seconds: number): string {
  requireWholeSeconds(seconds);
  return `${pad2(Math.floor(seconds / 3600))}${pad2(Math.floor((seconds % 3600) / 60))}`;
}

/** Decision 0090 items 11 and 17. Miles to three decimals, as shape_dist_traveled is written. */
export function milesText(miles: number): string {
  return miles.toFixed(3);
}

/** Decimal degrees to six decimals, as stop and shape coordinates are written. */
export function coordinateText(degrees: number): string {
  return degrees.toFixed(6);
}
