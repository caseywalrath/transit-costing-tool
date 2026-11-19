import { parseCsv } from './csvRead';

/** Decision 0085, section 4.10. One data row of a stop location file. `line` is the 1-based record number in the file. */
export interface StopLocationFileRow {
  line: number;
  stopCode?: string;
  name?: string;
  latitude: number;
  longitude: number;
  speedLimitMph?: number;
}

/** Section 4.10. A target to fill: a Route stop (`stop:<id>`) or a timepoint of one pattern (`point:<patternPointId>`). */
export interface StopLocationTarget { key: string; stopCode?: string; name: string; }
/** Section 4.10. A target matched to a file row, by stop ID or by name. */
export interface StopLocationMatch { key: string; row: StopLocationFileRow; by: 'id' | 'name'; }

/** Section 4.10 header aliases. Header cells are compared trimmed and lower case. */
const ALIASES = {
  stopId: ['stop id', 'stop_id', 'stopid', 'brt id', 'id'],
  stopCode: ['stop code', 'stop_code'],
  name: ['stop name', 'stop_name', 'name'],
  latitude: ['latitude', 'lat', 'stop_lat'],
  longitude: ['longitude', 'lon', 'lng', 'long', 'stop_lon'],
  speed: ['speed limit', 'speed_limit', 'speed limit (mph)', 'speed'],
};

/** The column index of each field in one header record. Absent fields are undefined. */
interface ColumnMap {
  stopId?: number;
  stopCode?: number;
  name?: number;
  latitude: number;
  longitude: number;
  speed?: number;
}

/** A record is a header when it has a latitude column and a longitude column. */
function columnMapOf(record: readonly string[]): ColumnMap | undefined {
  const cells = record.map((cell) => cell.trim().toLowerCase());
  const find = (aliases: readonly string[]): number | undefined => {
    const index = cells.findIndex((cell) => aliases.includes(cell));
    return index >= 0 ? index : undefined;
  };
  const latitude = find(ALIASES.latitude);
  const longitude = find(ALIASES.longitude);
  if (latitude === undefined || longitude === undefined) return undefined;
  return {
    stopId: find(ALIASES.stopId),
    stopCode: find(ALIASES.stopCode),
    name: find(ALIASES.name),
    latitude,
    longitude,
    speed: find(ALIASES.speed),
  };
}

/** The trimmed text of a cell, or '' when the column is absent or the record is short. */
function cellOf(record: readonly string[], index: number | undefined): string {
  return index === undefined ? '' : (record[index] ?? '').trim();
}

/** A finite number from a cell, or undefined when the cell is empty or not a finite number. */
function numberOf(text: string): number | undefined {
  if (text === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Section 4.10. Reads a stop location file (a spreadsheet export or a GTFS `stops.txt`). Records before the first header are skipped and
 * not counted. Each header record starts a block: the STOPS workbook has one header per direction. A later record without a usable
 * latitude or longitude is skipped and counted in `skippedLineCount`. Values are not range-checked here; validation reports them on save.
 * When no header is found, `missingColumns` is true and there are no rows.
 */
export function readStopLocationFile(text: string): { rows: StopLocationFileRow[]; skippedLineCount: number; missingColumns: boolean } {
  const rows: StopLocationFileRow[] = [];
  let skippedLineCount = 0;
  let columns: ColumnMap | undefined;
  const records = parseCsv(text);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const header = columnMapOf(record);
    if (header) {
      columns = header;
      continue;
    }
    if (!columns) continue;
    const latitude = numberOf(cellOf(record, columns.latitude));
    const longitude = numberOf(cellOf(record, columns.longitude));
    if (latitude === undefined || longitude === undefined) {
      skippedLineCount += 1;
      continue;
    }
    const row: StopLocationFileRow = { line: index + 1, latitude, longitude };
    // A stop code wins over a stop ID when both columns exist (GTFS stop_code is the rider-facing code).
    const stopCode = cellOf(record, columns.stopCode) || cellOf(record, columns.stopId);
    if (stopCode !== '') row.stopCode = stopCode;
    const name = cellOf(record, columns.name);
    if (name !== '') row.name = name;
    const speed = numberOf(cellOf(record, columns.speed));
    if (speed !== undefined) row.speedLimitMph = speed;
    rows.push(row);
  }
  return { rows, skippedLineCount, missingColumns: columns === undefined };
}

/** Section 4.10. Stop ID comparison key: trimmed and lower case; undefined when blank. */
function idKeyOf(code: string | undefined): string | undefined {
  const key = code?.trim().toLowerCase();
  return key ? key : undefined;
}

/** Section 4.10. Name comparison key: trimmed, runs of whitespace as one space, lower case; undefined when blank. */
function nameKeyOf(name: string | undefined): string | undefined {
  const key = name?.trim().replace(/\s+/g, ' ').toLowerCase();
  return key ? key : undefined;
}

function sameValues(left: StopLocationFileRow, right: StopLocationFileRow): boolean {
  return left.latitude === right.latitude && left.longitude === right.longitude && left.speedLimitMph === right.speedLimitMph;
}

/**
 * Section 4.10. Matches file rows to targets. (1) By stop ID, ignoring case and spaces. A stop ID that two or more rows share with
 * different values is a conflict (listed by its stop ID in `conflictStopCodes`) and matches nothing. Identical rows that share a stop ID
 * all count as used. (2) By name, only for targets with no ID match: the name must be the name of exactly one target and of exactly one
 * row, and that row must not be used by an ID match. (3) Targets with no match are listed in `unmatchedTargetKeys`; rows used by no match
 * are listed by line in `unusedRowLines`. Matches are in target order.
 */
export function matchStopLocations(
  rows: readonly StopLocationFileRow[],
  targets: readonly StopLocationTarget[],
): { matches: StopLocationMatch[]; conflictStopCodes: string[]; unmatchedTargetKeys: string[]; unusedRowLines: number[] } {
  const groups = new Map<string, StopLocationFileRow[]>();
  for (const row of rows) {
    const key = idKeyOf(row.stopCode);
    if (key !== undefined) groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const conflicts = new Set<string>();
  const conflictStopCodes: string[] = [];
  for (const [key, group] of groups) {
    if (group.length > 1 && group.some((row) => !sameValues(row, group[0]))) {
      conflicts.add(key);
      conflictStopCodes.push(group[0].stopCode ?? key);
    }
  }

  const usedLines = new Set<number>();
  const idMatches = targets.map((target) => {
    const key = idKeyOf(target.stopCode);
    if (key === undefined || conflicts.has(key)) return undefined;
    const group = groups.get(key);
    if (!group) return undefined;
    for (const row of group) usedLines.add(row.line);
    return group[0];
  });

  const targetNameCounts = new Map<string, number>();
  for (const target of targets) {
    const key = nameKeyOf(target.name);
    if (key !== undefined) targetNameCounts.set(key, (targetNameCounts.get(key) ?? 0) + 1);
  }
  const rowsByName = new Map<string, StopLocationFileRow[]>();
  for (const row of rows) {
    const key = nameKeyOf(row.name);
    if (key !== undefined) rowsByName.set(key, [...(rowsByName.get(key) ?? []), row]);
  }
  const nameMatches = targets.map((target, index) => {
    if (idMatches[index] !== undefined) return undefined;
    const key = nameKeyOf(target.name);
    if (key === undefined || targetNameCounts.get(key) !== 1) return undefined;
    const candidates = rowsByName.get(key) ?? [];
    if (candidates.length !== 1 || usedLines.has(candidates[0].line)) return undefined;
    usedLines.add(candidates[0].line);
    return candidates[0];
  });

  const matches: StopLocationMatch[] = [];
  const unmatchedTargetKeys: string[] = [];
  targets.forEach((target, index) => {
    const idRow = idMatches[index];
    const nameRow = nameMatches[index];
    if (idRow !== undefined) matches.push({ key: target.key, row: idRow, by: 'id' });
    else if (nameRow !== undefined) matches.push({ key: target.key, row: nameRow, by: 'name' });
    else unmatchedTargetKeys.push(target.key);
  });
  const unusedRowLines = rows.filter((row) => !usedLines.has(row.line)).map((row) => row.line);
  return { matches, conflictStopCodes, unmatchedTargetKeys, unusedRowLines };
}
