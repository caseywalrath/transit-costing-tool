import { describe, expect, it } from 'vitest';
import { feedSummary } from '../../domain/gtfs/summary';
import { loadFeedTables, tablesWith } from '../../domain/gtfs/testFeeds';
import {
  ANNUAL_TOTAL_MESSAGE,
  annualDaysProblem,
  canContinueFromRoutes,
  compareRouteOrder,
  type FeedRouteRow,
  filterRouteRows,
  groupUseDate,
  holidayRows,
  isLargeSelection,
  NO_DAY_CHOICES,
  patternCountOf,
  planForChoices,
  routeRowsInOrder,
  routeTypeChoices,
  routeTypeName,
  selectAllShown,
  selectionTotals,
  tripCountsByRoute,
} from './gtfsImportModel';

function route(routeId: string, shortName: string, longName = `${shortName} line`, type = 3): FeedRouteRow {
  return { routeId, shortName, longName, type, tripCount: 0 };
}

describe('route order (sub-plan I8, item 3)', () => {
  it('puts numbers first by value, then the rest of the name, then letters', () => {
    const shuffled = [route('a', 'A'), route('b', '31'), route('c', '1'), route('d', '0L'), route('e', '0'), route('f', '3'), route('g', 'B')];
    expect(routeRowsInOrder(shuffled).map((row) => row.shortName)).toEqual(['0', '0L', '1', '3', '31', 'A', 'B']);
  });

  it('compares a number with leading zeros by its value', () => {
    expect(compareRouteOrder(route('x', '007'), route('y', '12'))).toBeLessThan(0);
  });

  it('does not change the list it is given', () => {
    const input = [route('b', '2'), route('a', '1')];
    routeRowsInOrder(input);
    expect(input.map((row) => row.routeId)).toEqual(['b', 'a']);
  });
});

describe('route types and the filter', () => {
  it('names the GTFS basic codes and calls a blank or unknown type "Other"', () => {
    expect([routeTypeName(3), routeTypeName(2), routeTypeName(0), routeTypeName(900), routeTypeName(-1)]).toEqual(['Bus', 'Rail', 'Light rail', 'Light rail', 'Other']);
  });

  it('lists each type once, in the order the Routes give them', () => {
    expect(routeTypeChoices([route('a', '1', 'x', 3), route('b', 'A', 'y', 2), route('c', '2', 'z', 3)])).toEqual(['Bus', 'Rail']);
  });

  it('matches the short or long name without regard to case, and narrows by type', () => {
    const routes = [route('a', '31', 'Federal Blvd', 3), route('b', 'A', 'Union Station to Airport', 2), route('c', '0L', 'South Broadway Limited', 3)];
    expect(filterRouteRows(routes, { query: '  FEDERAL ' }).map((row) => row.routeId)).toEqual(['a']);
    expect(filterRouteRows(routes, { query: '0' }).map((row) => row.routeId)).toEqual(['c']);
    expect(filterRouteRows(routes, { query: '', type: 'Rail' }).map((row) => row.routeId)).toEqual(['b']);
    expect(filterRouteRows(routes, { query: '', type: undefined })).toHaveLength(3);
  });
});

describe('selection', () => {
  it('select all shown adds the shown Routes and keeps the rest of the selection', () => {
    const shown = [route('a', '1'), route('b', '2')];
    expect([...selectAllShown(new Set(['x']), shown)].sort()).toEqual(['a', 'b', 'x']);
  });

  it('totals the Routes selected and their weekday trips', () => {
    const counts = new Map([['a', 149], ['b', 99], ['c', 5]]);
    expect(selectionTotals(new Set(['a', 'b']), counts)).toEqual({ routes: 2, weekdayTrips: 248 });
    expect(selectionTotals(new Set(['z']), counts)).toEqual({ routes: 1, weekdayTrips: 0 });
  });

  it('warns only above 40 Routes or above 5,000 weekday trips', () => {
    expect(isLargeSelection({ routes: 40, weekdayTrips: 5000 })).toBe(false);
    expect(isLargeSelection({ routes: 41, weekdayTrips: 0 })).toBe(true);
    expect(isLargeSelection({ routes: 1, weekdayTrips: 5001 })).toBe(true);
  });

  it('lets Next through only with at least one Route', () => {
    expect(canContinueFromRoutes(new Set())).toBe(false);
    expect(canContinueFromRoutes(new Set(['a']))).toBe(true);
  });
});

describe('mini feed', () => {
  const mini = loadFeedTables('mini');

  it('counts trips per Route on 12 January 2026 from the calendar, frequency departures included; the invalid B1 trip is counted too', () => {
    const counts = tripCountsByRoute(mini, '20260112');
    expect([counts.get('B1'), counts.get('R1'), counts.get('F1')]).toEqual([6, 2, 18]);
  });

  it('lists B1, F1 and R1 in route order, as the Routes step shows them', () => {
    const summary = feedSummary(mini, '20260120', '20260112');
    expect(routeRowsInOrder(summary.routes).map((row) => row.shortName)).toEqual(['B1', 'F1', 'R1']);
  });
});

describe('days step (sub-plan I8, item 7)', () => {
  const mini = loadFeedTables('mini');
  const miniRoutes = new Set(['B1', 'R1', 'F1']);
  const range = { start: '20260105', end: '20260201' };

  it('uses the day with no calendar_dates row nearest the middle of the range, and the first date when every date has a row', () => {
    const tables = tablesWith({ calendarDates: [{ service_id: 'X', date: '20260117', exception_type: '2' }] });
    expect(groupUseDate(tables, range, ['20260110', '20260117', '20260131'])).toBe('20260110');
    const every = tablesWith({
      calendarDates: [
        { service_id: 'X', date: '20260110', exception_type: '2' },
        { service_id: 'X', date: '20260131', exception_type: '2' },
      ],
    });
    expect(groupUseDate(every, range, ['20260131', '20260110'])).toBe('20260131');
  });

  it('refuses annual days that are not whole numbers from 0, or that total more than 365', () => {
    expect(annualDaysProblem([100, 200, 65])).toBeUndefined();
    expect(annualDaysProblem([100, 200, 66])).toBe(ANNUAL_TOTAL_MESSAGE);
    expect(annualDaysProblem([1.5])).toBe('Enter a whole number, 0 or more.');
    expect(annualDaysProblem([-1])).toBe('Enter a whole number, 0 or more.');
  });

  it('counts the patterns of B1 on 12 January 2026 as two (Outbound and Inbound)', () => {
    expect(patternCountOf(mini, 'B1', '20260112')).toBe(2);
  });

  it('lists the three holiday candidates of the mini feed and gives the proposed annual counts', () => {
    expect(holidayRows(mini, miniRoutes, NO_DAY_CHOICES).map((candidate) => candidate.date)).toEqual(['20260119', '20260124', '20260130']);
    const plan = planForChoices(mini, ['B1', 'R1', 'F1'], NO_DAY_CHOICES);
    expect(plan.counts.countsByKey.weekday).toBe(235);
    expect(plan.counts.countsByKey.saturday).toBe(39);
    expect(plan.counts.countsByKey.sunday).toBe(65);
  });
});
