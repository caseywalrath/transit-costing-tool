import { describe, expect, it } from 'vitest';
import { dayGroups, defaultDates, partYearRoutes } from './dayGroups';
import { loadFeedTables, tablesWith } from './testFeeds';

const mini = loadFeedTables('mini');
const miniRoutes = new Set(['B1', 'R1', 'F1']);

describe('dayGroups (mini feed, hand-worked)', () => {
  const result = dayGroups(mini, miniRoutes);

  it('covers the 28 dates of the feed range', () => {
    expect(result.range).toEqual({ start: '20260105', end: '20260201' });
    expect(result.groups.reduce((sum, group) => sum + group.dates.length, 0)).toBe(28);
  });

  it('finds WKDY as the typical Monday to Friday set, SAT on Saturday and SUN on Sunday', () => {
    expect(result.typicalByDayOfWeek).toEqual([['WKDY'], ['WKDY'], ['WKDY'], ['WKDY'], ['WKDY'], ['SAT'], ['SUN']]);
  });

  it('groups the dates by service set, largest group first', () => {
    expect(result.groups.map((group) => [group.serviceIds, group.dates.length, group.tripCount])).toEqual([
      [['WKDY'], 18, 25],
      [['SUN'], 5, 1],
      [['SAT'], 3, 6],
      [['EVT', 'SAT'], 1, 7],
      [['SAT', 'WKDY'], 1, 31],
    ]);
  });

  it('puts the Monday holiday with the Sundays and says what it replaced', () => {
    const sunday = result.groups[1];
    expect(sunday.dates).toEqual(['20260111', '20260118', '20260119', '20260125', '20260201']);
    expect(sunday.daysOfWeek).toEqual([0, 6]);
    expect(sunday.addedServiceIds).toEqual(['SUN']);
    expect(sunday.removedServiceIds).toEqual(['WKDY']);
    expect(sunday.tripDelta).toBe(-24);
    expect(sunday.routeIdsAffected).toEqual(['B1', 'F1', 'R1']);
  });

  it('describes the event Saturday and the Friday with Saturday service as additions', () => {
    const event = result.groups[3];
    expect(event.dates).toEqual(['20260124']);
    expect(event.addedServiceIds).toEqual(['EVT']);
    expect(event.removedServiceIds).toEqual([]);
    expect(event.tripDelta).toBe(1);
    expect(event.routeIdsAffected).toEqual(['R1']);

    const friday = result.groups[4];
    expect(friday.dates).toEqual(['20260130']);
    expect(friday.daysOfWeek).toEqual([4]);
    expect(friday.addedServiceIds).toEqual(['SAT']);
    expect(friday.tripDelta).toBe(6);
    expect(friday.routeIdsAffected).toEqual(['B1', 'F1', 'R1']);
  });

  it('reports no change for groups that are the typical set of every date they hold', () => {
    for (const group of [result.groups[0], result.groups[2]]) {
      expect(group.addedServiceIds).toEqual([]);
      expect(group.removedServiceIds).toEqual([]);
      expect(group.tripDelta).toBe(0);
      expect(group.routeIdsAffected).toEqual([]);
    }
  });

  it('counts only the selected routes', () => {
    const r1Only = dayGroups(mini, new Set(['R1']));
    expect(r1Only.groups.map((group) => [group.serviceIds, group.dates.length, group.tripCount])[0]).toEqual([['WKDY'], 18, 2]);
  });

  it('returns no groups when no selected route has a trip', () => {
    expect(dayGroups(mini, new Set(['NOPE']))).toEqual({
      groups: [],
      typicalByDayOfWeek: [[], [], [], [], [], [], []],
    });
  });
});

describe('defaultDates (mini feed, hand-worked)', () => {
  it('skips the exception dates and takes the nearest typical date to the middle', () => {
    // The middle is between 0118 and 0119. 0119 has an exception; 0120 is 1.5 days away, 0116 is 2.5.
    expect(defaultDates(mini, miniRoutes)).toEqual({ weekday: '20260120', saturday: '20260117', sunday: '20260118' });
  });

  it('gives nothing when no selected route has a trip', () => {
    expect(defaultDates(mini, new Set(['NOPE']))).toEqual({});
  });
});

describe('defaultDates (calendar fixtures)', () => {
  it('does not pick a school date when school dates are the less common set', () => {
    const tables = loadFeedTables('cal-school-days');
    // The middle of the range, 2026-01-21, is a school date; the typical weekday set is BASE alone.
    expect(defaultDates(tables, new Set(['R1']))).toEqual({ weekday: '20260126' });
  });

  it('uses the Monday to Thursday set when Friday carries an extra service, and skips the Friday in the middle', () => {
    const tables = loadFeedTables('cal-friday-extras');
    const result = dayGroups(tables, new Set(['R1']));
    expect(result.groups.map((group) => [group.serviceIds, group.dates.length, group.tripCount])).toEqual([
      [['WKDY'], 14, 2],
      [['FRI', 'WKDY'], 3, 3],
      [['SAT'], 3, 1],
      [['SUN'], 3, 1],
    ]);
    expect(result.typicalByDayOfWeek[4]).toEqual(['FRI', 'WKDY']);
    expect(defaultDates(tables, new Set(['R1']))).toEqual({ weekday: '20260115', saturday: '20260117', sunday: '20260118' });
  });

  it('puts the holiday Monday with the Saturdays in the Saturday fixture', () => {
    const tables = loadFeedTables('cal-holiday-saturday');
    const result = dayGroups(tables, new Set(['R1', 'R2']));
    expect(result.groups.map((group) => [group.serviceIds, group.dates.length])).toEqual([
      [['WKDY'], 19],
      [['SAT'], 5],
      [['SUN'], 4],
    ]);
    expect(result.groups[1].daysOfWeek).toEqual([0, 5]);
    expect(result.groups[1].addedServiceIds).toEqual(['SAT']);
    expect(result.groups[1].removedServiceIds).toEqual(['WKDY']);
    expect(result.groups[1].tripDelta).toBe(0);
    expect(defaultDates(tables, new Set(['R1', 'R2']))).toEqual({ weekday: '20260120', saturday: '20260117', sunday: '20260118' });
  });

  it('gives a service set to the holiday that is only in calendar_dates.txt', () => {
    const tables = loadFeedTables('cal-holiday-unique');
    const result = dayGroups(tables, new Set(['R1']));
    expect(result.groups.map((group) => [group.serviceIds, group.dates.length, group.tripCount, group.tripDelta])).toEqual([
      [['WKDY'], 17, 2, 0],
      [['SAT'], 4, 1, 0],
      [['SUN'], 4, 1, 0],
      [['HOL1'], 2, 2, 0],
      [['HOL2'], 1, 1, -1],
    ]);
  });

  it('falls back to a date that has calendar_dates rows when every date has one', () => {
    const rows = ['20260105', '20260106', '20260107', '20260108', '20260109', '20260112', '20260113', '20260114', '20260115', '20260116'];
    const tables = tablesWith({
      trips: [{ route_id: 'R', service_id: 'S', trip_id: 'T' }],
      calendarDates: rows.map((date) => ({ service_id: 'S', date, exception_type: '1' })),
    });
    // 0109 and 0112 are both 1.5 days from the middle of 0105..0116; the earlier date wins.
    expect(defaultDates(tables, new Set(['R']))).toEqual({ weekday: '20260109' });
  });
});

describe('partYearRoutes', () => {
  it('flags no route in the mini feed: every route runs on each chosen date, or never on that kind of day', () => {
    expect(partYearRoutes(mini, miniRoutes, defaultDates(mini, miniRoutes))).toEqual([]);
  });

  it('flags the July-only route for weekday and suggests a date in its own range', () => {
    const tables = loadFeedTables('cal-part-year');
    const routes = new Set(['R1', 'R2']);
    const chosen = defaultDates(tables, routes);
    // The nearest typical weekday to the middle of June to August is a June date: the July dates carry the other set.
    expect(chosen).toEqual({ weekday: '20260630', saturday: '20260718', sunday: '20260719' });
    expect(partYearRoutes(tables, routes, chosen)).toEqual([
      { routeId: 'R2', serviceDay: 'weekday', suggestedDate: '20260716' },
    ]);
  });

  it('does not flag a route for a service day it never runs', () => {
    const tables = loadFeedTables('cal-part-year');
    const flagged = partYearRoutes(tables, new Set(['R2']), { saturday: '20260718', sunday: '20260719' });
    expect(flagged).toEqual([]);
  });

  it('flags nothing for a service day that has no chosen date', () => {
    const tables = loadFeedTables('cal-part-year');
    expect(partYearRoutes(tables, new Set(['R1', 'R2']), {})).toEqual([]);
  });
});
