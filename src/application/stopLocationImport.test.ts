import { describe, expect, it } from 'vitest';
import { matchStopLocations, readStopLocationFile, type StopLocationTarget } from './stopLocationImport';

// The STOPS workbook layout: a title row, a header, data, then a second block (Northbound) with its own title and header.
const STOPS_WORKBOOK = [
  'Southbound',
  'BRT ID,Stop Name,Latitude,Longitude,Distance (miles),Speed Limit',
  '100,Alpha Station,39.912274,-104.99353,0.00,35',
  '101,Stop One,39.913,-105.0,0.71,',
  'Northbound',
  'BRT ID,Stop Name,Latitude,Longitude,Distance (miles),Speed Limit',
  '200,Alpha Station,39.9123,-104.9935,0.00,35',
  '201,Stop Two,39.9,-104.9,0.50,30',
].join('\r\n');

const GTFS_STOPS = [
  'stop_id,stop_code,stop_name,stop_lat,stop_lon',
  's-100,100,Alpha Station,39.912274,-104.99353',
  's-101,,Stop One,39.913,-105',
].join('\n');

describe('readStopLocationFile (Decision 0085, section 4.10)', () => {
  it('reads every data row of a STOPS workbook with two blocks, and skips the title and header rows', () => {
    const { rows, skippedLineCount, missingColumns } = readStopLocationFile(STOPS_WORKBOOK);
    expect(missingColumns).toBe(false);
    expect(rows.map((row) => [row.line, row.stopCode, row.name, row.latitude, row.longitude, row.speedLimitMph])).toEqual([
      [3, '100', 'Alpha Station', 39.912274, -104.99353, 35],
      [4, '101', 'Stop One', 39.913, -105, undefined],
      [7, '200', 'Alpha Station', 39.9123, -104.9935, 35],
      [8, '201', 'Stop Two', 39.9, -104.9, 30],
    ]);
    // Only the second block's title ("Northbound") is a record after a header that has no usable latitude.
    expect(skippedLineCount).toBe(1);
  });

  it('reads a GTFS stops.txt, where a stop code wins over a stop ID and a stop ID is used when the code is empty', () => {
    const { rows, missingColumns } = readStopLocationFile(GTFS_STOPS);
    expect(missingColumns).toBe(false);
    expect(rows.map((row) => [row.stopCode, row.name, row.latitude, row.longitude])).toEqual([
      ['100', 'Alpha Station', 39.912274, -104.99353],
      ['s-101', 'Stop One', 39.913, -105],
    ]);
  });

  it('reports missing columns and no rows when no header has a latitude and a longitude column', () => {
    expect(readStopLocationFile('BRT ID,Stop Name\n100,Alpha\n')).toEqual({ rows: [], skippedLineCount: 0, missingColumns: true });
    expect(readStopLocationFile('')).toEqual({ rows: [], skippedLineCount: 0, missingColumns: true });
  });

  it('skips a data record whose latitude or longitude is empty or not a number, and counts it', () => {
    const text = ['stop id,latitude,longitude', '1,39.9,-105', '2,,-105', '3,39.9,abc', '4,39.8,-104.9'].join('\n');
    const { rows, skippedLineCount } = readStopLocationFile(text);
    expect(rows.map((row) => row.line)).toEqual([2, 5]);
    expect(skippedLineCount).toBe(2);
  });

  it('leaves the speed limit out when its cell is empty and reads the header in the speed_limit spelling', () => {
    const { rows } = readStopLocationFile('stop_id,lat,lon,speed_limit\nA,39.9,-105,\nB,39.8,-104.9,40\n');
    expect(rows.map((row) => row.speedLimitMph)).toEqual([undefined, 40]);
  });
});

describe('matchStopLocations (Decision 0085, section 4.10)', () => {
  const row = (line: number, stopCode: string | undefined, name: string | undefined, latitude = 39.9, longitude = -105, speedLimitMph?: number) => ({
    line, stopCode, name, latitude, longitude, speedLimitMph,
  });
  const target = (key: string, stopCode: string | undefined, name: string): StopLocationTarget => ({ key, stopCode, name });

  it('matches by stop ID, ignoring case and surrounding spaces', () => {
    const rows = [row(3, 's-101', 'Stop One')];
    const result = matchStopLocations(rows, [target('stop:a', ' S-101 ', 'Other name')]);
    expect(result.matches).toEqual([{ key: 'stop:a', row: rows[0], by: 'id' }]);
    expect(result.unusedRowLines).toEqual([]);
  });

  it('treats a stop ID shared by two rows with different values as a conflict that matches nothing', () => {
    const rows = [row(3, '100', 'Alpha', 39.9), row(4, '100', 'Alpha', 39.95)];
    const result = matchStopLocations(rows, [target('stop:a', '100', 'Alpha')]);
    expect(result.conflictStopCodes).toEqual(['100']);
    expect(result.matches).toEqual([]);
    expect(result.unmatchedTargetKeys).toEqual(['stop:a']);
    expect(result.unusedRowLines).toEqual([3, 4]);
  });

  it('matches a stop ID shared by identical rows, and counts all of them as used', () => {
    const rows = [row(3, '100', 'Alpha'), row(4, '100', 'Alpha')];
    const result = matchStopLocations(rows, [target('stop:a', '100', 'Alpha')]);
    expect(result.matches.map((match) => [match.key, match.row.line, match.by])).toEqual([['stop:a', 3, 'id']]);
    expect(result.unusedRowLines).toEqual([]);
  });

  it('matches by name only when the name is unique on both sides, and the row has no ID match', () => {
    const rows = [row(3, undefined, '  Main   Street ')];
    const result = matchStopLocations(rows, [target('point:p1', undefined, 'main street')]);
    expect(result.matches).toEqual([{ key: 'point:p1', row: rows[0], by: 'name' }]);
  });

  it('does not match by name when two targets or two rows share the name', () => {
    const twoRows = matchStopLocations([row(3, undefined, 'Hub'), row(4, undefined, 'Hub')], [target('point:p1', undefined, 'Hub')]);
    expect(twoRows.matches).toEqual([]);
    expect(twoRows.unmatchedTargetKeys).toEqual(['point:p1']);
    expect(twoRows.unusedRowLines).toEqual([3, 4]);

    const twoTargets = matchStopLocations([row(3, undefined, 'Hub')], [target('point:p1', undefined, 'Hub'), target('point:p2', undefined, 'Hub')]);
    expect(twoTargets.matches).toEqual([]);
  });

  it('does not match by name a row that an ID match already uses', () => {
    const rows = [row(3, '100', 'Alpha')];
    const result = matchStopLocations(rows, [target('stop:a', '100', 'Alpha'), target('point:p1', undefined, 'Alpha')]);
    expect(result.matches.map((match) => [match.key, match.by])).toEqual([['stop:a', 'id']]);
    expect(result.unmatchedTargetKeys).toEqual(['point:p1']);
  });

  it('reports unmatched targets in target order and unused rows by line', () => {
    const rows = [row(3, '100', 'Alpha'), row(4, '999', 'Nowhere'), row(5, undefined, 'Beta')];
    const targets = [target('point:p1', undefined, 'Gamma'), target('stop:a', '100', 'Alpha'), target('point:p2', '555', 'Beta')];
    const result = matchStopLocations(rows, targets);
    expect(result.matches.map((match) => [match.key, match.by])).toEqual([['stop:a', 'id'], ['point:p2', 'name']]);
    expect(result.unmatchedTargetKeys).toEqual(['point:p1']);
    expect(result.unusedRowLines).toEqual([4]);
  });
});
