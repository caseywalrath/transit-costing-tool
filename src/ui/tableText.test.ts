import { describe, expect, it } from 'vitest';
import { tableToTsv } from './tableText';

describe('tableToTsv', () => {
  it('joins cells with tabs and rows with newlines', () => {
    expect(tableToTsv([['Day', 'Days'], ['Weekday', '260']])).toBe('Day\tDays\nWeekday\t260');
  });

  it('turns a tab or a line break inside a cell into one space', () => {
    expect(tableToTsv([['a\tb', 'c\nd', 'e\r\nf', 'g\rh']])).toBe('a b\tc d\te f\tg h');
  });

  it('trims leading and trailing spaces of each cell', () => {
    expect(tableToTsv([['  Total  ', ' 1 ']])).toBe('Total\t1');
  });

  it('keeps empty cells so that the columns stay aligned', () => {
    expect(tableToTsv([['Total', '', '$1']])).toBe('Total\t\t$1');
  });

  it('returns an empty string for no rows', () => {
    expect(tableToTsv([])).toBe('');
  });
});
