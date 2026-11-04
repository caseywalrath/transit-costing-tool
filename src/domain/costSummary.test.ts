import { describe, expect, it } from 'vitest';
import { buildCostSummary, costSummaryPartialReasons } from './costSummary';
import type { CostingCalculationResult } from './costing';
import type { EstimatedCostingCalculationResult } from './estimatedCosting';

const heading = { projectName: 'Federal BRT', scenarioName: 'Proposed', preparedOn: '2026-11-03' };

function blocked(overrides: Partial<CostingCalculationResult> = {}): CostingCalculationResult {
  const day = (id: string, name: string, days: number, revenue: number, platform: number) => ({
    serviceDayId: id, serviceDayName: name, serviceDayKind: 'weekday' as const, annualServiceDays: days, eligibleBlockCount: 2, excludedBlockCount: 0, unassignedTripCount: 0,
    revenueHoursPerDay: revenue, platformHoursPerDay: platform, annualRevenueHours: days * revenue, annualPlatformHours: days * platform,
    yearCosts: [{ serviceYear: 2027, costPerDayUsd: revenue * 100, annualCostUsd: days * revenue * 100 }, { serviceYear: 2028, costPerDayUsd: revenue * 110, annualCostUsd: days * revenue * 110 }],
  });
  return {
    basis: 'blocked', state: 'complete', sourceRate: 100, sourceRateYear: 2027, annualEscalation: 0.1, eligibleBlockCount: 4, excludedBlockCount: 0, unassignedTripCount: 0,
    findings: [], exclusions: [],
    dailyRows: [day('weekday', 'Weekday', 255, 10, 12), day('saturday', 'Saturday', 52, 5, 6)],
    yearRows: [
      { serviceYear: 2027, appliedRateUsdPerRevenueHour: 100, annualRevenueHours: 2810, annualPlatformHours: 3372, annualCostUsd: 281_000 },
      { serviceYear: 2028, appliedRateUsdPerRevenueHour: 110, annualRevenueHours: 2810, annualPlatformHours: 3372, annualCostUsd: 309_100 },
    ],
    ...overrides,
  };
}

describe('buildCostSummary (Decision 0054)', () => {
  it('reports first-year figures, the last projected year, and a running total', () => {
    const summary = buildCostSummary(blocked(), heading)!;
    expect(summary).toMatchObject({ projectName: 'Federal BRT', firstYear: 2027, futureYearCount: 1, annualEscalation: 0.1, firstYearCostUsd: 281_000, lastYearCostUsd: 309_100, annualRevenueHours: 2810 });
    expect(summary).not.toHaveProperty('annualPlatformHours');
    expect(summary.years.map((year) => year.cumulativeCostUsd)).toEqual([281_000, 590_100]);
    expect(summary.days[0]).toEqual({ serviceDayId: 'weekday', name: 'Weekday', annualServiceDays: 255, revenueHoursPerDay: 10, annualRevenueHours: 2550, firstYearCostUsd: 255_000 });
  });

  it('builds no summary for an invalid result or a result without costs', () => {
    expect(buildCostSummary(blocked({ state: 'invalid' }), heading)).toBeUndefined();
    expect(buildCostSummary(blocked({ state: 'noEstimate', noEstimateReason: 'rateMissing', yearRows: [] }), heading)).toBeUndefined();
  });

  it('builds a partial summary and lists what it leaves out', () => {
    const result = blocked({ state: 'partial', exclusions: [{ serviceDayId: 'saturday', serviceDayName: 'Saturday', excludedBlockCount: 2, unassignedTripCount: 1, blocks: [] }] });
    expect(buildCostSummary(result, heading)).toBeDefined();
    expect(costSummaryPartialReasons(result)).toEqual(['2 blocks excluded on Saturday.', '1 trip not assigned to a block on Saturday.']);
    expect(costSummaryPartialReasons(blocked())).toEqual([]);
  });

  it('builds a summary for an estimate without a deadhead %', () => {
    const result: EstimatedCostingCalculationResult = {
      basis: 'estimated', tripProfileId: 'p', state: 'partial', sourceRate: 100, sourceRateYear: 2027, annualEscalation: 0, tripCount: 3, tripsWithoutRunTimeCount: 1, findings: [],
      dailyRows: [{ serviceDayId: 'weekday', serviceDayName: 'Weekday', serviceDayKind: 'weekday', annualServiceDays: 10, tripCount: 3, tripsWithoutRunTimeCount: 1, runningHoursPerDay: 8, annualRunningHours: 80,
        factors: { layoverFraction: 0.2, layoverSource: 'serviceDay' } as never, revenueHoursPerDay: 10, annualRevenueHours: 100, yearCosts: [{ serviceYear: 2027, costPerDayUsd: 1000, annualCostUsd: 10_000 }] }],
      yearRows: [{ serviceYear: 2027, appliedRateUsdPerRevenueHour: 100, annualRunningHours: 80, annualRevenueHours: 100, annualCostUsd: 10_000 }],
    };
    const summary = buildCostSummary(result, heading)!;
    expect(summary.futureYearCount).toBe(0);
    expect(costSummaryPartialReasons(result)).toEqual(['1 trip without a run time is not counted.']);
  });
});
