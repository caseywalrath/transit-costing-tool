import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration, formatHours, formatMiles, formatMoney, formatPercent, INCOMPLETE, MISSING, withUnit } from './format';

describe('formatClock (F1-A)', () => {
  it('shows seconds only when non-zero and keeps times past 24:00', () => {
    expect(formatClock(14880)).toBe('4:08');
    expect(formatClock(18270)).toBe('5:04:30');
    expect(formatClock(93660)).toBe('26:01');
  });
  it('rounds to the minute on request', () => {
    expect(formatClock(18270, { round: true })).toBe('5:05');
    expect(formatClock(18270, { round: false })).toBe('5:04:30');
  });
});

describe('formatDuration (F2-A)', () => {
  it.each([[300, ':05'], [450, ':07:30'], [3180, ':53'], [3660, '1:01'], [3900, '1:05'], [-60, '−:01'], [0, ':00'], [3725, '1:02:05']])('%i → %s', (input, output) => {
    expect(formatDuration(input)).toBe(output);
  });
  it('shows the missing marker for an undefined or non-integer value', () => {
    expect(formatDuration(undefined)).toBe(MISSING);
    expect(formatDuration(1.5)).toBe(MISSING);
  });
});

describe('formatHours (F3-A)', () => {
  it('uses two decimals for a day and whole hours for a year, with separators', () => {
    expect(formatHours(311.594, 'daily')).toBe('311.59');
    expect(formatHours(79455.6, 'annual')).toBe('79,456');
    expect(formatHours(1234.5, 'daily')).toBe('1,234.50');
  });
  it('rounds half away from zero on the decimal text, as Costing does', () => {
    expect(formatHours(14.575, 'daily')).toBe('14.58');
    expect(formatHours(1.005, 'daily')).toBe('1.01');
    expect(formatHours(0, 'daily')).toBe('0.00');
  });
  it('reports incomplete input', () => { expect(formatHours(undefined, 'daily')).toBe(INCOMPLETE); });
});

describe('formatMiles (F4-A)', () => {
  it('uses two decimals with separators', () => {
    expect(formatMiles(2.233962)).toBe('2.23');
    expect(formatMiles(4488.5)).toBe('4,488.50');
    expect(formatMiles(2.675)).toBe('2.68');
    expect(formatMiles(undefined)).toBe(INCOMPLETE);
  });
});

describe('formatMoney (F6-A)', () => {
  it('shows whole dollars, or cents on request', () => {
    expect(formatMoney(1234567.4)).toBe('$1,234,567');
    expect(formatMoney(142.5, { cents: true })).toBe('$142.50');
  });
});

describe('formatPercent (F8-A)', () => {
  it('uses one decimal', () => {
    expect(formatPercent(16.3)).toBe('16.3%');
    expect(formatPercent(3)).toBe('3.0%');
    expect(formatPercent(undefined)).toBe(MISSING);
  });
});

describe('withUnit (F5-A)', () => {
  it('attaches a unit for summary tiles and leaves Incomplete bare', () => {
    expect(withUnit('311.59', 'h')).toBe('311.59 h');
    expect(withUnit(INCOMPLETE, 'h')).toBe(INCOMPLETE);
  });
});

describe('markers (F7-A)', () => {
  it('are the dash and the word', () => {
    expect(MISSING).toBe('—');
    expect(INCOMPLETE).toBe('Incomplete');
  });
});
