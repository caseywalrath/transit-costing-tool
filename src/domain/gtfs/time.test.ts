import { describe, expect, it } from 'vitest';
import { GtfsDateError, GtfsTimeError, addDays, checkGtfsDate, dayOfWeek, daysBetween, parseGtfsTime } from './time';

describe('parseGtfsTime', () => {
  it('reads H:MM:SS and HH:MM:SS as seconds after midnight', () => {
    expect(parseGtfsTime('06:00:00')).toBe(21600);
    expect(parseGtfsTime('6:00:00')).toBe(21600);
    expect(parseGtfsTime('07:10:30')).toBe(25830);
  });

  it('keeps hours past 23 for times after midnight of the service day', () => {
    expect(parseGtfsTime('24:50:00')).toBe(89400);
    expect(parseGtfsTime('25:10:00')).toBe(90600);
  });

  it('reads a blank field as undefined', () => {
    expect(parseGtfsTime('')).toBeUndefined();
    expect(parseGtfsTime('   ')).toBeUndefined();
  });

  it('refuses anything else, without trimming it', () => {
    for (const value of ['6:0:0', '06:60:00', '06:00', '06:00:60', ' 06:00:00', '06:00:00 ', '100:00:00', 'noon']) {
      expect(() => parseGtfsTime(value)).toThrow(GtfsTimeError);
    }
  });
});

describe('dates', () => {
  it('numbers the days of the week from Monday = 0', () => {
    // 2026-01-05 is a Monday.
    expect(dayOfWeek('20260105')).toBe(0);
    expect(dayOfWeek('20260117')).toBe(5);
    expect(dayOfWeek('20260118')).toBe(6);
  });

  it('adds days across month, year and leap-day boundaries', () => {
    expect(addDays('20260131', 1)).toBe('20260201');
    expect(addDays('20261231', 1)).toBe('20270101');
    expect(addDays('20240228', 1)).toBe('20240229');
    expect(addDays('20260301', -1)).toBe('20260228');
    expect(addDays('20260120', 0)).toBe('20260120');
  });

  it('counts days from the first date to the second, signed', () => {
    expect(daysBetween('20260120', '20260201')).toBe(12);
    expect(daysBetween('20260201', '20260120')).toBe(-12);
    expect(daysBetween('20260101', '20260201')).toBe(31);
  });

  it('refuses a date that is not a real calendar date', () => {
    expect(() => checkGtfsDate('20260230')).toThrow(GtfsDateError);
    expect(() => checkGtfsDate('2026-01-05')).toThrow(GtfsDateError);
    expect(() => dayOfWeek('20261301')).toThrow(GtfsDateError);
  });
});
