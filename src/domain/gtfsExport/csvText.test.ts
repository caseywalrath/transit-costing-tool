import { describe, expect, it } from 'vitest';
import { compareCodeUnits, coordinateText, csvField, csvTable, gtfsClock, gtfsHhmm, milesText } from './csvText';

describe('csvField (Decision 0090 item 4)', () => {
  it('quotes a field only when it holds a comma, a double quote or a line break, doubling the quotes', () => {
    expect(csvField('Main')).toBe('Main');
    expect(csvField('Main & 1st')).toBe('Main & 1st');
    expect(csvField('Hall, Room')).toBe('"Hall, Room"');
    expect(csvField('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvField('Line\nBreak')).toBe('"Line\nBreak"');
    expect(csvField('Carriage\rReturn')).toBe('"Carriage\rReturn"');
  });

  it('writes a missing value as blank and a number as its digits', () => {
    expect(csvField(undefined)).toBe('');
    expect(csvField(3)).toBe('3');
  });
});

describe('csvTable', () => {
  it('writes a header, then one LF-ended line per record, in the order of the columns given', () => {
    const text = csvTable(['b', 'a'], [{ a: 1, b: 'x,y' }, { a: 2 }]);

    expect(text).toBe('b,a\n"x,y",1\n,2\n');
  });

  it('writes a header alone when there are no records', () => {
    expect(csvTable(['stop_id', 'stop_name'], [])).toBe('stop_id,stop_name\n');
  });
});

describe('GTFS time and number formats (Decision 0090 items 10, 11 and 17)', () => {
  it('writes a time as HH:MM:SS and keeps the hours past 24', () => {
    expect(gtfsClock(0)).toBe('00:00:00');
    expect(gtfsClock(6 * 3600 + 5 * 60 + 9)).toBe('06:05:09');
    expect(gtfsClock(24 * 3600)).toBe('24:00:00');
    expect(gtfsClock(25 * 3600 + 30 * 60)).toBe('25:30:00');
  });

  it('refuses a time that is not a whole, non-negative number of seconds', () => {
    expect(() => gtfsClock(10.5)).toThrow(/whole, non-negative/);
    expect(() => gtfsClock(-1)).toThrow(/whole, non-negative/);
  });

  it('writes the HHMM of a trip ID, dropping the seconds and keeping the hours past 24', () => {
    expect(gtfsHhmm(6 * 3600 + 35)).toBe('0600');
    expect(gtfsHhmm(24 * 3600 + 30 * 60 + 59)).toBe('2430');
  });

  it('writes miles to three decimals and coordinates to six', () => {
    expect(milesText(2)).toBe('2.000');
    expect(milesText(1.2345)).toBe('1.234');
    expect(coordinateText(-105)).toBe('-105.000000');
    expect(coordinateText(39.7181)).toBe('39.718100');
  });
});

describe('compareCodeUnits', () => {
  it('compares by code unit, so digits sort before letters (the feed row order, Decision 0090 item 12)', () => {
    expect(['T1-1', '2002', '1003', '1001'].sort(compareCodeUnits)).toEqual(['1001', '1003', '2002', 'T1-1']);
    expect(compareCodeUnits('b', 'a')).toBeGreaterThan(0);
    expect(compareCodeUnits('a', 'a')).toBe(0);
  });
});
