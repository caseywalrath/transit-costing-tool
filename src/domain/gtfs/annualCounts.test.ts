import { describe, expect, it } from 'vitest';
import { proposeAnnualCounts, proposeRouteOwnCounts } from './annualCounts';
import { defaultDates, type ServiceDayKey } from './dayGroups';
import { holidayCandidates, proposeHolidayDays } from './holidays';
import { loadFeedTables, tablesWith } from './testFeeds';
import { dayOfWeek, type GtfsDate } from './time';

// The classification the planner starts from: each candidate's scenario class, unique dates under the
// day proposeHolidayDays gave them, every other date under its day of the week.
function defaultClassOfDate(feed: string, routes: string[]): { classOfDate: (date: GtfsDate) => ServiceDayKey; routeIds: Set<string> } {
  const tables = loadFeedTables(feed);
  const routeIds = new Set(routes);
  const candidates = holidayCandidates(tables, routeIds, defaultDates(tables, routeIds));
  const proposed = new Map<GtfsDate, ServiceDayKey>();
  for (const day of proposeHolidayDays(tables, routeIds, candidates)) {
    for (const date of day.dates) proposed.set(date, day.key);
  }
  const byDate = new Map(candidates.map((candidate) => [candidate.date, candidate.scenarioClass]));
  const ofWeek = (date: GtfsDate): ServiceDayKey => {
    const day = dayOfWeek(date);
    return day === 5 ? 'saturday' : day === 6 ? 'sunday' : 'weekday';
  };
  const classOfDate = (date: GtfsDate): ServiceDayKey => {
    const scenarioClass = byDate.get(date);
    if (scenarioClass === 'saturday') return 'saturday';
    if (scenarioClass === 'sunday') return 'sunday';
    if (scenarioClass === 'reducedWeekday') return 'weekday';
    if (scenarioClass === 'unique') return proposed.get(date) ?? 'holiday';
    return ofWeek(date);
  };
  return { classOfDate, routeIds };
}

function annualFor(feed: string, routes: string[]) {
  const { classOfDate, routeIds } = defaultClassOfDate(feed, routes);
  return proposeAnnualCounts(loadFeedTables(feed), routeIds, classOfDate);
}

describe('proposeAnnualCounts (mini feed, hand-worked)', () => {
  const proposal = annualFor('mini', ['B1', 'R1', 'F1']);

  it('counts the 28 dates of the range under the service days', () => {
    expect(proposal.rangeDates).toBe(28);
    expect(proposal.countedDates).toBe(28);
    expect(proposal.datesByKey).toEqual({ weekday: 18, saturday: 3, sunday: 5, holiday: 1, custom1: 1 });
    expect(proposal.unmatchedDates).toEqual([]);
  });

  it('scales by 365 / 28 with the largest remainder so the counts total 365', () => {
    expect(proposal.scaled).toBe(true);
    expect(proposal.countsByKey).toEqual({ weekday: 235, saturday: 39, sunday: 65, holiday: 13, custom1: 13 });
    expect(Object.values(proposal.countsByKey).reduce((sum, count) => sum + count, 0)).toBe(365);
  });
});

describe('proposeAnnualCounts (edge feeds)', () => {
  it('gives 281, 42, 42 for edge-no-direction and lists its six weekend dates as having no trips', () => {
    const tables = loadFeedTables('edge-no-direction');
    const proposal = proposeAnnualCounts(tables, new Set(['N1']), (date) => {
      const day = dayOfWeek(date);
      return day === 5 ? 'saturday' : day === 6 ? 'sunday' : 'weekday';
    });
    expect(proposal.rangeDates).toBe(26);
    expect(proposal.datesByKey).toEqual({ weekday: 20, saturday: 3, sunday: 3, holiday: 0 });
    expect(proposal.countsByKey).toEqual({ weekday: 281, saturday: 42, sunday: 42, holiday: 0 });
    expect(proposal.unmatchedDates).toEqual(['20260110', '20260111', '20260117', '20260118', '20260124', '20260125']);
  });

  it('gives nothing for routes that have no trips', () => {
    const proposal = proposeAnnualCounts(loadFeedTables('mini'), new Set(['NOPE']), () => 'weekday');
    expect(proposal).toEqual({
      countsByKey: { weekday: 0, saturday: 0, sunday: 0, holiday: 0 },
      datesByKey: { weekday: 0, saturday: 0, sunday: 0, holiday: 0 },
      rangeDates: 0,
      countedDates: 0,
      scaled: false,
      unmatchedDates: [],
    });
  });
});

describe('proposeAnnualCounts (calendar fixtures)', () => {
  it('counts the school-day feed: weekend dates have no trips and fall back to their day of the week', () => {
    const proposal = annualFor('cal-school-days', ['R1']);
    expect(proposal.datesByKey).toEqual({ weekday: 25, saturday: 4, sunday: 4, holiday: 0 });
    expect(proposal.unmatchedDates).toHaveLength(8);
    expect(proposal.countsByKey).toEqual({ weekday: 277, saturday: 44, sunday: 44, holiday: 0 });
  });

  it('breaks a tie between equal remainders in favour of the earlier service day', () => {
    expect(annualFor('cal-friday-extras', ['R1']).countsByKey).toEqual({ weekday: 270, saturday: 48, sunday: 47, holiday: 0 });
  });

  it('counts a Saturday-service holiday under Saturday', () => {
    const proposal = annualFor('cal-holiday-saturday', ['R1', 'R2']);
    expect(proposal.datesByKey).toEqual({ weekday: 19, saturday: 5, sunday: 4, holiday: 0 });
    expect(proposal.countsByKey).toEqual({ weekday: 248, saturday: 65, sunday: 52, holiday: 0 });
  });

  it('counts a mixed holiday under Holiday', () => {
    const proposal = annualFor('cal-holiday-mixed', ['R1', 'R2']);
    expect(proposal.countsByKey).toEqual({ weekday: 248, saturday: 52, sunday: 52, holiday: 13 });
  });

  it('counts two kinds of unique holiday under Holiday and Holiday 2', () => {
    const proposal = annualFor('cal-holiday-unique', ['R1']);
    expect(proposal.datesByKey).toEqual({ weekday: 17, saturday: 4, sunday: 4, holiday: 2, custom1: 1 });
    expect(proposal.countsByKey).toEqual({ weekday: 222, saturday: 52, sunday: 52, holiday: 26, custom1: 13 });
  });

  it('counts the part-year feed for the whole Scenario', () => {
    const proposal = annualFor('cal-part-year', ['R1', 'R2']);
    expect(proposal.rangeDates).toBe(92);
    expect(proposal.datesByKey).toEqual({ weekday: 66, saturday: 13, sunday: 13, holiday: 0 });
    expect(proposal.countsByKey).toEqual({ weekday: 262, saturday: 52, sunday: 51, holiday: 0 });
  });
});

// A service that runs every day of the week, for the range rules.
const everyDay = (start: string, end: string) =>
  tablesWith({
    calendar: [
      { service_id: 'S', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date: start, end_date: end },
    ],
    trips: [{ route_id: 'R', service_id: 'S', trip_id: 'T' }],
  });
const byDayOfWeek = (date: GtfsDate): ServiceDayKey => {
  const day = dayOfWeek(date);
  return day === 5 ? 'saturday' : day === 6 ? 'sunday' : 'weekday';
};

describe('proposeAnnualCounts (ranges of 365 dates or more)', () => {
  it('counts the 365 dates around the middle of a two-year range without scaling', () => {
    // 2026-01-01 to 2027-12-31 is 730 dates; the window is 2026-07-02 to 2027-07-01, which starts and ends on a Thursday.
    const proposal = proposeAnnualCounts(everyDay('20260101', '20271231'), new Set(['R']), byDayOfWeek);
    expect(proposal.rangeDates).toBe(730);
    expect(proposal.countedDates).toBe(365);
    expect(proposal.scaled).toBe(false);
    expect(proposal.countsByKey).toEqual({ weekday: 261, saturday: 52, sunday: 52, holiday: 0 });
  });

  it('starts the window on the earlier date when the centre falls between two dates', () => {
    // 366 dates from Saturday 2026-01-03: the window is the first 365, so the extra day is a Saturday.
    const proposal = proposeAnnualCounts(everyDay('20260103', '20270103'), new Set(['R']), byDayOfWeek);
    expect(proposal.rangeDates).toBe(366);
    expect(proposal.countsByKey).toEqual({ weekday: 260, saturday: 53, sunday: 52, holiday: 0 });
  });

  it('does not scale a range of exactly 365 dates', () => {
    const proposal = proposeAnnualCounts(everyDay('20260101', '20261231'), new Set(['R']), byDayOfWeek);
    expect(proposal.scaled).toBe(false);
    expect(proposal.countsByKey).toEqual({ weekday: 261, saturday: 52, sunday: 52, holiday: 0 });
  });
});

describe('proposeRouteOwnCounts', () => {
  const { classOfDate } = defaultClassOfDate('cal-part-year', ['R1', 'R2']);
  const tables = loadFeedTables('cal-part-year');

  it('counts the part-year route from its own 31 dates with the Scenario scale factor', () => {
    // 23 weekdays, 4 Saturdays, 4 Sundays in July; times 365 / 92, rounded to the route's own total of 123.
    expect(proposeRouteOwnCounts(tables, 'R2', classOfDate, 92)).toEqual({ weekday: 91, saturday: 16, sunday: 16, holiday: 0 });
  });

  it('does not scale when the Scenario range is a year or more', () => {
    expect(proposeRouteOwnCounts(tables, 'R2', classOfDate, 365)).toEqual({ weekday: 23, saturday: 4, sunday: 4, holiday: 0 });
  });

  it('gives nothing for a route with no trips', () => {
    expect(proposeRouteOwnCounts(tables, 'NOPE', classOfDate, 92)).toEqual({});
  });
});
