import type { CostingResult } from '../../application/ports';
import { UNATTRIBUTED_ROUTE_NAME } from '../../domain/costSummary';
import { formatHours, formatMoney, MISSING } from '../format';

export const dailyHours = (value: number) => formatHours(value, 'daily');
export const annualHours = (value: number) => formatHours(value, 'annual');
export const money = (value: number) => formatMoney(value);

/** One row of the Cost breakdown. A value the cost basis does not have is undefined and shows as a dash. */
export type BreakdownRow = {
  key: string; name: string; days: number; trips?: number; blocks?: number;
  running?: number; revenue?: number; platform?: number; dailyCost?: number;
  annualRevenue?: number; annualPlatform?: number; annualCost?: number;
};

/** The rows of either cost basis in one shape, so the blocked and estimated tables have the same eleven columns. */
export function breakdownRows(result: CostingResult, selectedYear: number): { rows: BreakdownRow[]; total: BreakdownRow } {
  const year = result.yearRows.find((row) => row.serviceYear === selectedYear);
  const sum = (values: Array<number | undefined>) => values.every((value) => value !== undefined) ? values.reduce<number>((total, value) => total + value!, 0) : undefined;
  const rows: BreakdownRow[] = result.basis === 'estimated'
    ? result.dailyRows.map((row) => { const cost = row.yearCosts.find((item) => item.serviceYear === selectedYear); return {
      key: row.serviceDayId, name: row.serviceDayName, days: row.annualServiceDays, trips: row.tripCount, running: row.runningHoursPerDay,
      revenue: row.revenueHoursPerDay, platform: row.platformHoursPerDay, dailyCost: cost?.costPerDayUsd,
      annualRevenue: row.annualRevenueHours, annualPlatform: row.annualPlatformHours, annualCost: cost?.annualCostUsd,
    }; })
    : result.dailyRows.map((row) => { const cost = row.yearCosts.find((item) => item.serviceYear === selectedYear); return {
      key: row.serviceDayId, name: row.serviceDayName, days: row.annualServiceDays, blocks: row.eligibleBlockCount,
      revenue: row.revenueHoursPerDay, platform: row.platformHoursPerDay, dailyCost: cost?.costPerDayUsd,
      annualRevenue: row.annualRevenueHours, annualPlatform: row.annualPlatformHours, annualCost: cost?.annualCostUsd,
    }; });
  const total: BreakdownRow = {
    key: 'total', name: 'Total', days: rows.reduce((total, row) => total + row.days, 0),
    ...(result.basis === 'estimated' ? { trips: result.tripCount } : { blocks: result.eligibleBlockCount }),
    annualRevenue: year ? year.annualRevenueHours : sum(rows.map((row) => row.annualRevenue)),
    annualPlatform: year ? year.annualPlatformHours : sum(rows.map((row) => row.annualPlatform)),
    annualCost: year?.annualCostUsd,
  };
  return { rows, total };
}

/** One Route row of the Cost breakdown (Decision 0077): the Route's totals, its service-day rows, and its unassigned-trip count. */
export type RouteBreakdownRow = BreakdownRow & { routeId: string | null; unassignedTrips?: number; days: number; dayRows: BreakdownRow[] };

/**
 * The Route rows of the Cost breakdown, in the domain's order. A Route row follows the Total row's rules: annual days, trip and block
 * counts and annual values are sums of its day rows (undefined when any part is); daily values are left blank. Every service day is a
 * day row, as in the Total, so a single Route's rows match the scenario's service-day rows.
 */
export function routeBreakdownRows(result: CostingResult, selectedYear: number): { routes: RouteBreakdownRow[]; total: BreakdownRow } {
  const { total } = breakdownRows(result, selectedYear);
  const sum = (values: Array<number | undefined>) => values.every((value) => value !== undefined) ? values.reduce<number>((acc, value) => acc + value!, 0) : undefined;
  const estimated = result.basis === 'estimated';
  const routes = result.routeRows.map((route): RouteBreakdownRow => {
    const dayRows = route.days.map((day): BreakdownRow => {
      const cost = day.yearCosts.find((item) => item.serviceYear === selectedYear);
      return {
        key: `${route.routeId ?? 'unattributed'}:${day.serviceDayId}`, name: day.serviceDayName, days: day.annualServiceDays,
        ...(estimated ? { trips: day.tripCount, running: day.runningHoursPerDay } : { blocks: day.blockCount }),
        revenue: day.revenueHoursPerDay, platform: day.platformHoursPerDay, dailyCost: cost?.costPerDayUsd,
        annualRevenue: day.annualRevenueHours, annualPlatform: day.annualPlatformHours, annualCost: cost?.annualCostUsd,
      };
    });
    const unassigned = estimated ? undefined : route.days.reduce((acc, day) => acc + (day.unassignedTripCount ?? 0), 0);
    return {
      key: route.routeId ?? 'unattributed', routeId: route.routeId,
      name: route.routeId === null ? UNATTRIBUTED_ROUTE_NAME : route.routeName || 'Untitled route',
      days: dayRows.reduce((acc, row) => acc + row.days, 0),
      ...(estimated ? { trips: sum(dayRows.map((row) => row.trips)) } : { blocks: sum(dayRows.map((row) => row.blocks)) }),
      annualRevenue: sum(dayRows.map((row) => row.annualRevenue)), annualPlatform: sum(dayRows.map((row) => row.annualPlatform)),
      annualCost: dayRows.length ? sum(dayRows.map((row) => row.annualCost)) : undefined,
      ...(unassigned ? { unassignedTrips: unassigned } : {}),
      dayRows,
    };
  });
  return { routes, total };
}

/** Decision 0078: the Cost breakdown groups by Route (Decision 0077) or by service day. */
export type BreakdownGrouping = 'route' | 'day';

/** One service-day row grouped by service day (Decision 0078): the scenario's row for that day, then that day's row of each Route. */
export type DayBreakdownRow = BreakdownRow & { routeRows: Array<BreakdownRow & { unassignedTrips?: number }> };

/**
 * The service-day rows of the Cost breakdown, in service-day order. A day row is the scenario's figures for that day, the same row as
 * before Decision 0077; its Route rows are each Route's row for that day, in the Route order of `routeBreakdownRows` (by name,
 * Unattributed last). The Total row is the same as in the Route grouping.
 */
export function dayBreakdownRows(result: CostingResult, selectedYear: number): { days: DayBreakdownRow[]; total: BreakdownRow } {
  const { rows, total } = breakdownRows(result, selectedYear);
  const { routes } = routeBreakdownRows(result, selectedYear);
  const days = rows.map((day): DayBreakdownRow => ({
    ...day,
    routeRows: routes.flatMap((route) => {
      const row = route.dayRows.find((item) => item.key === `${route.key}:${day.key}`);
      if (!row) return [];
      const unassigned = result.routeRows.find((item) => (item.routeId ?? 'unattributed') === route.key)?.days.find((item) => item.serviceDayId === day.key)?.unassignedTripCount;
      return [{ ...row, key: `${day.key}:${route.key}`, name: route.name, ...(result.basis === 'blocked' && unassigned ? { unassignedTrips: unassigned } : {}) }];
    }),
  }));
  return { days, total };
}

export const BREAKDOWN_COLUMNS =['Service day', 'Days', 'Trips', 'Blocks', 'Daily running (h)', 'Daily revenue (h)', 'Daily platform (h)', 'Daily cost', 'Annual revenue (h)', 'Annual platform (h)', 'Annual cost'];

/**
 * The Cost breakdown as cells (Decision 0066 item 11, Decision 0077 item 4): the header, then each Route row followed by its service-day
 * rows, then the Total row. A Route row says "All days" in the Service day cell; a service-day row leaves the Route cell empty. Each
 * cell uses the same formatter and the same dash as the table on the screen, so the copied text shows the values as displayed.
 */
export function costBreakdownText(result: CostingResult, selectedYear: number, totalDays: number, grouping: BreakdownGrouping = 'route'): string[][] {
  const { routes, total } = routeBreakdownRows(result, selectedYear);
  const count = (value: number | undefined) => value === undefined ? MISSING : String(value);
  const daily = (value: number | undefined) => value === undefined ? MISSING : dailyHours(value);
  const annual = (value: number | undefined) => value === undefined ? MISSING : annualHours(value);
  const cash = (value: number | undefined) => value === undefined ? MISSING : money(value);
  /** The cells after the first two, in `BREAKDOWN_COLUMNS` order. A Route or Total row leaves the four daily cells blank, as on the screen. */
  const values = (row: BreakdownRow, days: number, withDaily: boolean): string[] => [
    String(days), count(row.trips), count(row.blocks),
    ...(withDaily ? [daily(row.running), daily(row.revenue), daily(row.platform), cash(row.dailyCost)] : ['', '', '', '']),
    annual(row.annualRevenue), annual(row.annualPlatform), cash(row.annualCost),
  ];
  // Decision 0078 item 4: grouped by service day, each day row (with its daily values) is followed by its Route rows.
  if (grouping === 'day') return [
    ['Service day', 'Route', ...BREAKDOWN_COLUMNS.slice(1)],
    ...dayBreakdownRows(result, selectedYear).days.flatMap((day) => [
      [day.name, 'All routes', ...values(day, day.days, true)],
      ...day.routeRows.map((row) => ['', row.name, ...values(row, row.days, true)]),
    ]),
    ['Total', '', ...values(total, totalDays, false)],
  ];
  return [
    ['Route', 'Service day', ...BREAKDOWN_COLUMNS.slice(1)],
    ...routes.flatMap((route) => [
      [route.name, 'All days', ...values(route, route.days, false)],
      ...route.dayRows.map((row) => ['', row.name, ...values(row, row.days, true)]),
    ]),
    ['Total', '', ...values(total, totalDays, false)],
  ];
}
