import type { CostingCalculationResult } from './costing';
import type { EstimatedCostingCalculationResult } from './estimatedCosting';

/** Decision 0054. The figures of the printable Operating Cost Estimate. Values keep full calculation precision; the page rounds them. */
export interface CostSummary {
  projectName: string;
  scenarioName: string;
  /** ISO date (YYYY-MM-DD) the summary was prepared. */
  preparedOn: string;
  firstYear: number;
  /** The number of future years; the "Year N cost" figure is omitted when it is 0. */
  futureYearCount: number;
  annualEscalation: number;
  firstYearCostUsd: number;
  lastYearCostUsd: number;
  /** Revenue hours are the same in every service year. */
  annualRevenueHours: number;
  days: CostSummaryDay[];
  years: CostSummaryYear[];
}

export interface CostSummaryDay {
  serviceDayId: string;
  name: string;
  annualServiceDays: number;
  revenueHoursPerDay?: number;
  annualRevenueHours?: number;
  firstYearCostUsd?: number;
}

export interface CostSummaryYear {
  serviceYear: number;
  appliedRateUsdPerRevenueHour: number;
  annualCostUsd: number;
  cumulativeCostUsd: number;
}

export interface CostSummaryHeading { projectName: string; scenarioName: string; preparedOn: string }

/**
 * Builds the summary from a calculated estimate. Returns undefined when the estimate has no cost by year (an invalid result, or no estimate).
 * A partial result builds a summary; `costSummaryPartialReasons` lists what it leaves out, for the warning shown before the page opens.
 */
export function buildCostSummary(result: CostingCalculationResult | EstimatedCostingCalculationResult, heading: CostSummaryHeading): CostSummary | undefined {
  if (result.state === 'invalid' || result.state === 'noEstimate' || result.yearRows.length === 0) return undefined;
  const first = result.yearRows[0]!;
  const last = result.yearRows.at(-1)!;
  let running = 0;
  const years = result.yearRows.map((row) => {
    running += row.annualCostUsd;
    return { serviceYear: row.serviceYear, appliedRateUsdPerRevenueHour: row.appliedRateUsdPerRevenueHour, annualCostUsd: row.annualCostUsd, cumulativeCostUsd: running };
  });
  const days = result.dailyRows.map((row): CostSummaryDay => ({
    serviceDayId: row.serviceDayId,
    name: row.serviceDayName,
    annualServiceDays: row.annualServiceDays,
    ...(row.revenueHoursPerDay === undefined ? {} : { revenueHoursPerDay: row.revenueHoursPerDay }),
    ...(row.annualRevenueHours === undefined ? {} : { annualRevenueHours: row.annualRevenueHours }),
    ...(row.yearCosts[0] && row.yearCosts[0].serviceYear === first.serviceYear ? { firstYearCostUsd: row.yearCosts[0].annualCostUsd } : {}),
  }));
  return {
    ...heading,
    firstYear: first.serviceYear,
    futureYearCount: last.serviceYear - first.serviceYear,
    annualEscalation: result.annualEscalation,
    firstYearCostUsd: first.annualCostUsd,
    lastYearCostUsd: last.annualCostUsd,
    annualRevenueHours: first.annualRevenueHours,
    days,
    years,
  };
}

/** What a partial estimate leaves out, one plain sentence each. Empty for a complete estimate. The summary page itself never shows these. */
export function costSummaryPartialReasons(result: CostingCalculationResult | EstimatedCostingCalculationResult): string[] {
  if (result.state !== 'partial') return [];
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  if (result.basis === 'blocked') {
    const reasons = result.exclusions.flatMap((day) => [
      ...(day.excludedBlockCount ? [`${count(day.excludedBlockCount, 'block')} excluded on ${day.serviceDayName}.`] : []),
      ...(day.unassignedTripCount ? [`${count(day.unassignedTripCount, 'trip')} not assigned to a block on ${day.serviceDayName}.`] : []),
    ]);
    return reasons.length ? reasons : ['Some service is not included in the estimate.'];
  }
  // An estimated result is partial only when some Trips have no run time.
  return result.tripsWithoutRunTimeCount
    ? [`${count(result.tripsWithoutRunTimeCount, 'trip')} without a run time ${result.tripsWithoutRunTimeCount === 1 ? 'is' : 'are'} not counted.`]
    : ['Some service is not included in the estimate.'];
}
