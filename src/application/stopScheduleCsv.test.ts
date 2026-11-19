import { describe, expect, it } from 'vitest';
import type { StopScheduleColumn, StopScheduleDirection, StopScheduleRow } from '../domain/stopSchedule';
import { csvRows } from '../testSupport/csvRows';
import { stopScheduleCsv } from './stopScheduleCsv';

const rowOf = (name: string, patch: Partial<StopScheduleRow> = {}): StopScheduleRow => ({ key: `stop:${name}`, name, isTimepoint: false, ...patch });
const columnOf = (patch: Partial<StopScheduleColumn> = {}): StopScheduleColumn => ({
  patternId: 'p1', patternName: 'Main', label: 'Service', tripCount: 1, startTime: 36000, endTime: 39600, tripId: 't1', tripLabel: 'Trip 1', times: [], ...patch,
});
const directionOf = (name: string, rows: StopScheduleRow[], columns: StopScheduleColumn[]): StopScheduleDirection => ({
  directionId: name.toLowerCase(), name, rows, columns, orderConflict: false,
});

describe('stop schedule CSV export', () => {
  it('writes one block per direction, separated by an empty line, and ends with CRLF', () => {
    const north = directionOf('Northbound', [rowOf('Alpha', { stopCode: '1000', isTimepoint: true }), rowOf('Bravo')], [
      columnOf({ patternName: 'Main', label: 'Peak', headwaySeconds: 900, tripCount: 3, startTime: 25200, endTime: 32400, times: [36000, 36600], runSeconds: 600 }),
    ]);
    const south = directionOf('Southbound', [rowOf('Charlie', { isTimepoint: true })], [
      columnOf({ patternName: 'Express', tripCount: 2, startTime: 36000, endTime: 39600, times: [null] }),
    ]);
    const text = stopScheduleCsv([north, south], 'sample');
    expect(text.endsWith('\r\n')).toBe(true);
    expect(csvRows(text)).toEqual([
      ['[Northbound]'],
      ['Stop ID', 'Stop Name', 'Latitude', 'Longitude', 'Distance (miles)', 'Speed Limit', 'Main'],
      ['', '', '', '', '', '', 'Peak\n15 min\n7:00-9:00'],
      ['1000', 'Alpha', '', '', '', '', '10:00'],
      ['', 'Bravo', '', '', '', '', '10:10'],
      ['', 'Run time (min)', '', '', '', '', '10'],
      [''],
      ['[Southbound]'],
      ['Stop ID', 'Stop Name', 'Latitude', 'Longitude', 'Distance (miles)', 'Speed Limit', 'Express'],
      ['', '', '', '', '', '', 'Service\n2 trips\n10:00-11:00'],
      ['', 'Charlie', '', '', '', '', '-'],
      ['', 'Run time (min)', '', '', '', '', ''],
    ]);
  });

  it('writes a header cell as three lines joined by a line feed, quoted, with the headway and trip count wording', () => {
    const direction = directionOf('Northbound', [], [
      columnOf({ label: 'Peak', headwaySeconds: 450, tripCount: 4, startTime: 25200, endTime: 28800 }),
      columnOf({ label: 'Off', tripCount: 1, startTime: 36000, endTime: 37800 }),
      columnOf({ label: 'Late', tripCount: 3, startTime: 72000, endTime: 75600 }),
    ]);
    const text = stopScheduleCsv([direction], 'sample');
    expect(text).toContain('"Peak\n7:30 min\n7:00-8:00"');
    expect(csvRows(text)[2].slice(6)).toEqual(['Peak\n7:30 min\n7:00-8:00', 'Off\n1 trip\n10:00-10:30', 'Late\n3 trips\n20:00-21:00']);
  });

  it('writes null as a dash, undefined as empty, and times with seconds only when the seconds are not zero', () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].map((name) => rowOf(name));
    const direction = directionOf('Northbound', rows, [columnOf({ times: [null, undefined, 36030, 36000, 90000] })]);
    const data = csvRows(stopScheduleCsv([direction], 'sample')).slice(3, 8);
    expect(data.map((row) => row[6])).toEqual(['-', '', '10:00:30', '10:00', '25:00']);
  });

  it('protects free-text cells that start with a formula character, and leaves dashes and times alone', () => {
    const direction = directionOf('Northbound', [rowOf('=SUM(A1)', { stopCode: '@5', isTimepoint: true }), rowOf('Bravo')], [
      columnOf({ patternName: '+North', label: '-Peak', times: [null, 36000] }),
    ]);
    const rows = csvRows(stopScheduleCsv([direction], 'sample'));
    expect(rows[1][6]).toBe("'+North");
    expect(rows[2][6].split('\n')[0]).toBe("'-Peak");
    expect(rows[3]).toEqual(["'@5", "'=SUM(A1)", '', '', '', '', '-']);
    expect(rows[4][6]).toBe('10:00');
  });

  it('writes latitude as given and distance to two decimal places', () => {
    const direction = directionOf('Northbound', [rowOf('Alpha', { latitude: 39.912274, longitude: -105.1, distanceMiles: 0.456 })], []);
    const rows = csvRows(stopScheduleCsv([direction], 'sample'));
    expect(rows[3].slice(2, 5)).toEqual(['39.912274', '-105.1', '0.46']);
  });

  it('writes the run time in minutes to one decimal place', () => {
    const direction = directionOf('Northbound', [rowOf('Alpha')], [columnOf({ runSeconds: 3270 })]);
    const rows = csvRows(stopScheduleCsv([direction], 'sample'));
    expect(rows[4].at(-1)).toBe('54.5');
  });

  it('uses the Trip label and a single time in the header when every Trip is a column', () => {
    const direction = directionOf('Northbound', [rowOf('Alpha', { stopCode: '1000' })], [
      columnOf({ label: 'Peak', tripLabel: 'Trip 4', headwaySeconds: 600, tripCount: 1, startTime: 36000, endTime: 36000, times: [36000] }),
    ]);
    const rows = csvRows(stopScheduleCsv([direction], 'all'));
    expect(rows[2][6]).toBe('Peak\nTrip 4\n10:00');
    expect(rows[3][6]).toBe('10:00');
  });
});
