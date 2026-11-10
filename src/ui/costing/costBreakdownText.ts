import type { CostingResult } from '../../application/ports';
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

export const BREAKDOWN_COLUMNS = ['Service day', 'Days', 'Trips', 'Blocks', 'Daily running (h)', 'Daily revenue (h)', 'Daily platform (h)', 'Daily cost', 'Annual revenue (h)', 'Annual platform (h)', 'Annual cost'];

/**
 * The Cost breakdown as cells, header row first, then one row per service day, then the total row (Decision 0066 item 11). Each cell
 * uses the same formatter and the same dash as the table on the screen, so the copied text shows the values as displayed.
 */
export function costBreakdownText(result: CostingResult, selectedYear: number, totalDays: number): string[][] {
  const { rows, total } = breakdownRows(result, selectedYear);
  const count = (value: number | undefined) => value === undefined ? MISSING : String(value);
  const daily = (value: number | undefined) => value === undefined ? MISSING : dailyHours(value);
  const annual = (value: number | undefined) => value === undefined ? MISSING : annualHours(value);
  const cash = (value: number | undefined) => value === undefined ? MISSING : money(value);
  return [
    [...BREAKDOWN_COLUMNS],
    ...rows.map((row) => [row.name, String(row.days), count(row.trips), count(row.blocks), daily(row.running), daily(row.revenue), daily(row.platform), cash(row.dailyCost), annual(row.annualRevenue), annual(row.annualPlatform), cash(row.annualCost)]),
    ['Total', String(totalDays), count(total.trips), count(total.blocks), '', '', '', '', annual(total.annualRevenue), annual(total.annualPlatform), cash(total.annualCost)],
  ];
}
