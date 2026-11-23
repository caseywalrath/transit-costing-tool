import { describe, expect, it } from 'vitest';
import { defaultDates } from './dayGroups';
import { holidayCandidates, proposeHolidayDays } from './holidays';
import { loadFeedTables, tablesWith } from './testFeeds';
import type { Row } from './feedTables';

const mini = loadFeedTables('mini');
const miniRoutes = new Set(['B1', 'R1', 'F1']);

function candidatesOf(feed: string, routes: string[]) {
  const tables = loadFeedTables(feed);
  const routeIds = new Set(routes);
  const chosen = defaultDates(tables, routeIds);
  return { tables, routeIds, candidates: holidayCandidates(tables, routeIds, chosen) };
}

describe('holidayCandidates (mini feed, hand-worked)', () => {
  const chosen = defaultDates(mini, miniRoutes);
  const candidates = holidayCandidates(mini, miniRoutes, chosen);

  it('lists the three dates where the feed departs from the normal day of the week', () => {
    expect(candidates.map((candidate) => candidate.date)).toEqual(['20260119', '20260124', '20260130']);
  });

  it('calls Monday 2026-01-19 Sunday service: B1 runs its Sunday trip and R1 and F1 do not run', () => {
    expect(candidates[0]).toEqual({
      date: '20260119',
      addedServiceIds: ['SUN'],
      removedServiceIds: ['WKDY'],
      byRoute: { B1: 'sunday', F1: 'none', R1: 'none' },
      scenarioClass: 'sunday',
    });
  });

  it('shows the event Saturday route by route and counts it as unique', () => {
    expect(candidates[1]).toEqual({
      date: '20260124',
      addedServiceIds: ['EVT'],
      removedServiceIds: [],
      byRoute: { B1: 'saturday', F1: 'saturday', R1: 'unique' },
      scenarioClass: 'unique',
    });
  });

  it('calls the Friday with Saturday trips added unique on every route', () => {
    expect(candidates[2].byRoute).toEqual({ B1: 'unique', F1: 'unique', R1: 'unique' });
    expect(candidates[2].addedServiceIds).toEqual(['SAT']);
    expect(candidates[2].removedServiceIds).toEqual([]);
    expect(candidates[2].scenarioClass).toBe('unique');
  });

  it('proposes Holiday on the date with the most trips and Holiday 2 on the other', () => {
    expect(proposeHolidayDays(mini, miniRoutes, candidates)).toEqual([
      { key: 'holiday', name: 'Holiday', date: '20260130', dates: ['20260130'] },
      { key: 'custom1', name: 'Holiday 2', date: '20260124', dates: ['20260124'] },
    ]);
  });
});

describe('holidayCandidates (calendar fixtures)', () => {
  it('finds no candidates and no holiday days in a feed without exceptions', () => {
    const { tables, routeIds, candidates } = candidatesOf('cal-friday-extras', ['R1']);
    expect(candidates).toEqual([]);
    expect(proposeHolidayDays(tables, routeIds, candidates)).toEqual([]);
  });

  it('classifies a Monday holiday that runs Saturday service on every route as Saturday service', () => {
    const { tables, routeIds, candidates } = candidatesOf('cal-holiday-saturday', ['R1', 'R2']);
    expect(candidates).toEqual([
      {
        date: '20260119',
        addedServiceIds: ['SAT'],
        removedServiceIds: ['WKDY'],
        byRoute: { R1: 'saturday', R2: 'saturday' },
        scenarioClass: 'saturday',
      },
    ]);
    expect(proposeHolidayDays(tables, routeIds, candidates)).toEqual([]);
  });

  it('shows a holiday with Saturday trips on one route and Sunday trips on another as mixed, counted as unique', () => {
    const { tables, routeIds, candidates } = candidatesOf('cal-holiday-mixed', ['R1', 'R2']);
    expect(candidates).toEqual([
      {
        date: '20260119',
        addedServiceIds: ['HOL'],
        removedServiceIds: ['WKDY'],
        byRoute: { R1: 'saturday', R2: 'sunday' },
        scenarioClass: 'unique',
      },
    ]);
    expect(proposeHolidayDays(tables, routeIds, candidates)).toEqual([
      { key: 'holiday', name: 'Holiday', date: '20260119', dates: ['20260119'] },
    ]);
  });

  it('keeps unique dates with the same trips together and gives different trips their own day', () => {
    const { tables, routeIds, candidates } = candidatesOf('cal-holiday-unique', ['R1']);
    expect(candidates.map((candidate) => [candidate.date, candidate.byRoute.R1, candidate.scenarioClass])).toEqual([
      ['20260119', 'unique', 'unique'],
      ['20260126', 'unique', 'unique'],
      ['20260128', 'unique', 'unique'],
    ]);
    // 0119 and 0128 both have 2 trips; the earlier date is the representative of Holiday.
    expect(proposeHolidayDays(tables, routeIds, candidates)).toEqual([
      { key: 'holiday', name: 'Holiday', date: '20260119', dates: ['20260119', '20260128'] },
      { key: 'custom1', name: 'Holiday 2', date: '20260126', dates: ['20260126'] },
    ]);
  });
});

// Small feeds built in code for the rules the fixtures do not isolate.
const weekdayCalendar = (id: string, start: string, end: string): Row => ({
  service_id: id,
  monday: '1',
  tuesday: '1',
  wednesday: '1',
  thursday: '1',
  friday: '1',
  saturday: '0',
  sunday: '0',
  start_date: start,
  end_date: end,
});

const twoStops = (tripId: string, departure: string, arrival: string): Row[] => [
  { trip_id: tripId, arrival_time: departure, departure_time: departure, stop_id: 'A', stop_sequence: '1' },
  { trip_id: tripId, arrival_time: arrival, departure_time: arrival, stop_id: 'B', stop_sequence: '2' },
];

describe('holidayCandidates (rules)', () => {
  // WKDY and PEAK run Monday to Friday; PEAK is removed on Monday 2026-01-19, so the route keeps only WKDY's trip.
  const reduced = tablesWith({
    calendar: [weekdayCalendar('WKDY', '20260105', '20260130'), weekdayCalendar('PEAK', '20260105', '20260130')],
    calendarDates: [{ service_id: 'PEAK', date: '20260119', exception_type: '2' }],
    trips: [
      { route_id: 'R', service_id: 'WKDY', trip_id: 'T1', direction_id: '0' },
      { route_id: 'R', service_id: 'PEAK', trip_id: 'T2', direction_id: '0' },
    ],
    stopTimes: [...twoStops('T1', '06:00:00', '06:20:00'), ...twoStops('T2', '07:00:00', '07:20:00')],
  });
  const routes = new Set(['R']);

  it('calls a weekday with some of the typical set removed a reduced weekday', () => {
    const chosen = defaultDates(reduced, routes);
    expect(holidayCandidates(reduced, routes, chosen)).toEqual([
      {
        date: '20260119',
        addedServiceIds: [],
        removedServiceIds: ['PEAK'],
        byRoute: { R: 'reducedWeekday' },
        scenarioClass: 'reducedWeekday',
      },
    ]);
  });

  it('still calls it reduced when no Weekday date is chosen, because the typical set only lost services', () => {
    const [candidate] = holidayCandidates(reduced, routes, {});
    expect(candidate.byRoute).toEqual({ R: 'reducedWeekday' });
  });

  it('does not treat a repeated calendar_dates row for a service that already runs as an exception', () => {
    const repeated = tablesWith({
      ...reduced,
      calendarDates: [{ service_id: 'WKDY', date: '20260119', exception_type: '1' }],
    });
    expect(holidayCandidates(repeated, routes, defaultDates(repeated, routes))).toEqual([]);
  });

  it('leaves out an exception date on which no selected route runs', () => {
    const nothing = tablesWith({
      ...reduced,
      calendarDates: [
        { service_id: 'PEAK', date: '20260119', exception_type: '2' },
        { service_id: 'WKDY', date: '20260119', exception_type: '2' },
      ],
    });
    expect(holidayCandidates(nothing, routes, defaultDates(nothing, routes))).toEqual([]);
  });
});
