import { describe, expect, it } from 'vitest';
import { feedServiceRange, serviceIdsActiveOn } from './calendar';
import { loadFeedTables, tablesWith } from './testFeeds';

const mini = loadFeedTables('mini');

describe('serviceIdsActiveOn (mini feed)', () => {
  it('gives the weekday service on an ordinary Monday', () => {
    expect(serviceIdsActiveOn(mini, '20260112')).toEqual(new Set(['WKDY']));
  });

  it('replaces a weekday with Sunday service on the holiday (calendar_dates removal and addition)', () => {
    expect(serviceIdsActiveOn(mini, '20260119')).toEqual(new Set(['SUN']));
  });

  it('adds the calendar_dates-only service on its date', () => {
    expect(serviceIdsActiveOn(mini, '20260124')).toEqual(new Set(['SAT', 'EVT']));
  });

  it('adds Saturday service on a Friday through calendar_dates', () => {
    expect(serviceIdsActiveOn(mini, '20260130')).toEqual(new Set(['WKDY', 'SAT']));
  });

  it('gives no service outside the calendar range', () => {
    expect(serviceIdsActiveOn(mini, '20260301')).toEqual(new Set());
  });
});

describe('serviceIdsActiveOn (rules)', () => {
  it('counts both ends of the calendar range', () => {
    const tables = tablesWith({
      calendar: [{ service_id: 'A', monday: '1', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '0', sunday: '0', start_date: '20260105', end_date: '20260112' }],
    });
    expect(serviceIdsActiveOn(tables, '20260105')).toEqual(new Set(['A']));
    expect(serviceIdsActiveOn(tables, '20260112')).toEqual(new Set(['A']));
    expect(serviceIdsActiveOn(tables, '20260119')).toEqual(new Set());
  });

  it('lets the last calendar_dates row for a date decide it', () => {
    const tables = tablesWith({
      calendar: [{ service_id: 'A', monday: '1', tuesday: '0', wednesday: '0', thursday: '0', friday: '0', saturday: '0', sunday: '0', start_date: '20260105', end_date: '20260131' }],
      calendarDates: [
        { service_id: 'A', date: '20260112', exception_type: '2' },
        { service_id: 'A', date: '20260112', exception_type: '1' },
        { service_id: 'A', date: '20260119', exception_type: '1' },
        { service_id: 'A', date: '20260119', exception_type: '9' },
      ],
    });
    expect(serviceIdsActiveOn(tables, '20260112')).toEqual(new Set(['A']));
    expect(serviceIdsActiveOn(tables, '20260119')).toEqual(new Set(['A']));
  });
});

describe('feedServiceRange', () => {
  it('spans the first and last date on which any trip runs (mini feed)', () => {
    expect(feedServiceRange(mini)).toEqual({ start: '20260105', end: '20260201' });
  });

  it('limits the range to the given routes', () => {
    // R1's weekday trips end on Friday 2026-01-30; its Saturday trips run to Saturday 2026-01-31.
    expect(feedServiceRange(mini, new Set(['R1']))).toEqual({ start: '20260105', end: '20260131' });
  });

  it('is undefined when no trip of the given routes exists', () => {
    expect(feedServiceRange(mini, new Set(['NOPE']))).toBeUndefined();
    expect(feedServiceRange(mini, new Set())).toBeUndefined();
  });

  it('skips removed dates at either end of the calendar range', () => {
    const tables = tablesWith({
      trips: [{ route_id: 'A', service_id: 'S', trip_id: 't' }],
      calendar: [{ service_id: 'S', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260105', end_date: '20260109' }],
      calendarDates: [
        { service_id: 'S', date: '20260105', exception_type: '2' },
        { service_id: 'S', date: '20260109', exception_type: '2' },
      ],
    });
    expect(feedServiceRange(tables)).toEqual({ start: '20260106', end: '20260108' });
  });

  it('counts a date added outside the calendar range', () => {
    const tables = tablesWith({
      trips: [{ route_id: 'A', service_id: 'E', trip_id: 't' }],
      calendarDates: [{ service_id: 'E', date: '20260315', exception_type: '1' }],
    });
    expect(feedServiceRange(tables)).toEqual({ start: '20260315', end: '20260315' });
  });
});
