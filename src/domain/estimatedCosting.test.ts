import { describe, expect, it } from 'vitest';
import { summarizeBlockingScenario } from './blocking';
import { calculateCosting, costingAppliedRates, type CostingAssumptionsInput } from './costing';
import { calculateEstimatedCosting, normalizeEstimateFactors, resolveDayFactors, type EstimatedCostingInput } from './estimatedCosting';
import { metadata } from './ids';
import { createStandardServiceDays } from './serviceDays';
import type { BlockingBlock, BlockingScenario, CostingEstimateFactors, RoutePattern, Scenario, ServiceDayDefinition, Trip, TripProfile } from './types';

const stamp = '2026-01-01T00:00:00.000Z';
const scenario: Scenario = { id: 'scenario', projectId: 'project', name: 'Alt', ...metadata(stamp) };
const tripProfile: TripProfile = { id: 'profile', scenarioId: scenario.id, name: 'Alt B', ...metadata(stamp) };
const assumptions: CostingAssumptionsInput = { enteredRate: 100, rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0.03 };

function serviceDays(annual: Partial<Record<ServiceDayDefinition['kind'], number>> = {}): ServiceDayDefinition[] {
  return createStandardServiceDays(scenario.id, { weekday: 255, saturday: 52, sunday: 52, holiday: 6, ...annual }, stamp).map((day) => ({ ...day, id: day.kind }));
}

/** A Trip whose stop times are given in seconds; run time is last minus first. */
function trip(id: string, start: number, end: number, serviceDayId = 'weekday', overrides: Partial<Trip> = {}): Trip {
  return {
    id, scenarioId: scenario.id, routeId: 'route', serviceDayId, patternId: 'pattern', tripProfileId: tripProfile.id,
    stopTimes: [{ patternPointId: 'p1', sequence: 0, time: start }, { patternPointId: 'p2', sequence: 1, time: end }],
    provenance: { kind: 'manual' }, ...metadata(stamp), ...overrides,
  } as Trip;
}

function estimate(trips: Trip[], factors: CostingEstimateFactors | undefined, overrides: Partial<EstimatedCostingInput> = {}) {
  return calculateEstimatedCosting({ scenario, serviceDays: serviceDays(), tripProfile, trips, assumptions: { ...assumptions, ...(factors ? { estimateFactors: factors } : {}) }, ...overrides });
}
const factors = (allDays: CostingEstimateFactors['allDays'], ...rows: CostingEstimateFactors['serviceDays']): CostingEstimateFactors => ({ allDays, serviceDays: rows });
const row = (result: ReturnType<typeof estimate>, id: string) => result.dailyRows.find((item) => item.serviceDayId === id)!;

describe('calculateEstimatedCosting', () => {
  it('turns 8 running hours into revenue, platform, and annual cost with typed factors', () => {
    const result = estimate([trip('t1', 0, 8 * 3600)], factors({}, { serviceDayId: 'weekday', layoverFraction: 0.2, deadheadFraction: 0.2 }));
    const weekday = row(result, 'weekday');
    expect(result.basis).toBe('estimated');
    expect(result.state).toBe('complete');
    expect(weekday.runningHoursPerDay).toBe(8);
    expect(weekday.revenueHoursPerDay).toBeCloseTo(10, 12);
    expect(weekday.platformHoursPerDay).toBeCloseTo(12.5, 12);
    expect(weekday.yearCosts[0].costPerDayUsd).toBeCloseTo(1000, 9);
    expect(weekday.yearCosts[0].annualCostUsd).toBeCloseTo(255000, 6);
    expect(result.yearRows[0]).toMatchObject({ serviceYear: 2026, appliedRateUsdPerRevenueHour: 100 });
    expect(result.yearRows[0].annualCostUsd).toBeCloseTo(255000, 6);
    expect(result.yearRows[0].annualRevenueHours).toBeCloseTo(2550, 9);
    expect(result.yearRows[0].annualPlatformHours).toBeCloseTo(3187.5, 9);
  });

  it('falls back to All days for each factor on its own and records the source', () => {
    const result = estimate(
      [trip('wd', 0, 3600), trip('hol', 0, 3600, 'holiday'), trip('sat', 0, 3600, 'saturday')],
      factors({ layoverFraction: 0.25 }, { serviceDayId: 'weekday', layoverFraction: 0.1, deadheadFraction: 0.1 }, { serviceDayId: 'saturday', deadheadFraction: 0.5 }),
    );
    expect(row(result, 'holiday').factors).toEqual({ layoverFraction: 0.25, layoverSource: 'allDays' });
    expect(row(result, 'weekday').factors).toEqual({ layoverFraction: 0.1, layoverSource: 'serviceDay', deadheadFraction: 0.1, deadheadSource: 'serviceDay' });
    expect(row(result, 'saturday').factors).toEqual({ layoverFraction: 0.25, layoverSource: 'allDays', deadheadFraction: 0.5, deadheadSource: 'serviceDay' });
    expect(row(result, 'holiday').revenueHoursPerDay).toBeCloseTo(1 / 0.75, 12);
  });

  it('gives no estimate when a day with running time has no layover factor, and still shows running hours', () => {
    const result = estimate([trip('t1', 0, 3600)], factors({ deadheadFraction: 0.1 }));
    expect(result.state).toBe('noEstimate');
    expect(result.noEstimateReason).toBe('layoverFactorMissing');
    expect(result.yearRows).toEqual([]);
    expect(row(result, 'weekday').runningHoursPerDay).toBe(1);
    expect(row(result, 'weekday').revenueHoursPerDay).toBeUndefined();
    expect(result.findings.some((finding) => finding.ruleId === 'costing.layoverFactorMissing')).toBe(true);
  });

  it('leaves platform hours blank without a deadhead factor, warns, and does not change the cost', () => {
    const withDeadhead = estimate([trip('t1', 0, 8 * 3600)], factors({ layoverFraction: 0.2, deadheadFraction: 0.1 }));
    const without = estimate([trip('t1', 0, 8 * 3600)], factors({ layoverFraction: 0.2 }));
    expect(without.state).toBe('complete');
    expect(row(without, 'weekday').platformHoursPerDay).toBeUndefined();
    expect(without.yearRows[0].annualPlatformHours).toBeUndefined();
    const warning = without.findings.find((finding) => finding.ruleId === 'costing.deadheadFactorMissing');
    expect(warning).toMatchObject({ severity: 'warning', parameters: { serviceDayId: 'weekday' } });
    expect(without.yearRows[0].annualCostUsd).toBe(withDeadhead.yearRows[0].annualCostUsd);
  });

  it('counts a Trip without a run time and makes the estimate partial', () => {
    const lone = trip('lone', 0, 0, 'weekday', { stopTimes: [{ patternPointId: 'p1', sequence: 0, time: 100 }] });
    const result = estimate([trip('t1', 0, 3600), lone], factors({ layoverFraction: 0.2 }));
    expect(result.state).toBe('partial');
    expect(result.tripCount).toBe(2);
    expect(result.tripsWithoutRunTimeCount).toBe(1);
    expect(row(result, 'weekday')).toMatchObject({ tripCount: 2, tripsWithoutRunTimeCount: 1, runningHoursPerDay: 1 });
  });

  it('reports no trips, and a day without Trips or factors has revenue 0 and no finding', () => {
    const none = estimate([], factors({ layoverFraction: 0.2 }));
    expect(none).toMatchObject({ state: 'noEstimate', noEstimateReason: 'noTrips', yearRows: [] });

    const onlyWeekday = estimate([trip('t1', 0, 3600)], factors({}, { serviceDayId: 'weekday', layoverFraction: 0.2 }));
    expect(onlyWeekday.state).toBe('complete');
    expect(row(onlyWeekday, 'sunday')).toMatchObject({ runningHoursPerDay: 0, revenueHoursPerDay: 0, platformHoursPerDay: 0 });
    expect(onlyWeekday.findings.filter((finding) => finding.parameters?.serviceDayId === 'sunday')).toEqual([]);
  });

  it('shows hours but no cost when no rate is entered', () => {
    const result = estimate([trip('t1', 0, 3600)], factors({ layoverFraction: 0.2, deadheadFraction: 0.1 }), { assumptions: { ...assumptions, enteredRate: undefined, estimateFactors: factors({ layoverFraction: 0.2, deadheadFraction: 0.1 }) } });
    expect(result).toMatchObject({ state: 'noEstimate', noEstimateReason: 'rateMissing', yearRows: [] });
    expect(row(result, 'weekday').revenueHoursPerDay).toBeCloseTo(1.25, 12);
    expect(row(result, 'weekday').yearCosts).toEqual([]);
  });

  it.each([
    ['a factor of 1', factors({ layoverFraction: 1 })],
    ['a negative factor', factors({ deadheadFraction: -0.1 })],
    ['a NaN factor', factors({}, { serviceDayId: 'weekday', layoverFraction: Number.NaN })],
    ['a service day listed twice', factors({}, { serviceDayId: 'weekday', layoverFraction: 0.1 }, { serviceDayId: 'weekday', layoverFraction: 0.2 })],
  ])('is invalid with %s', (_label, invalidFactors) => {
    const result = estimate([trip('t1', 0, 3600)], invalidFactors);
    expect(result.state).toBe('invalid');
    expect(result.dailyRows).toEqual([]);
    const found = result.findings.filter((finding) => finding.severity === 'error');
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((finding) => finding.field === 'estimateFactors')).toBe(true);
  });

  it('reports which factor of which day is invalid', () => {
    const result = estimate([], factors({ layoverFraction: 0.1 }, { serviceDayId: 'sunday', deadheadFraction: 1.5 }));
    expect(result.findings).toEqual([expect.objectContaining({ ruleId: 'costing.estimateFactorInvalid', parameters: { serviceDayId: 'sunday', factor: 'deadhead' } })]);
    const malformed = estimate([], { allDays: 5, serviceDays: 'x' } as unknown as CostingEstimateFactors);
    expect(malformed.findings.map((finding) => finding.ruleId)).toEqual(['costing.estimateFactorInvalid', 'costing.estimateFactorInvalid']);
    expect(malformed.findings.every((finding) => finding.parameters?.serviceDayId === 'allDays')).toBe(true);
  });

  it('ignores a factor row for an unknown day and warns', () => {
    const result = estimate([trip('t1', 0, 3600)], factors({ layoverFraction: 0.2 }, { serviceDayId: 'gone', layoverFraction: 0.5 }));
    expect(result.state).toBe('complete');
    expect(result.findings).toEqual([expect.objectContaining({ ruleId: 'costing.estimateFactorUnknownDay', severity: 'warning', parameters: { serviceDayId: 'gone' } }), expect.objectContaining({ ruleId: 'costing.deadheadFactorMissing' })]);
    expect(row(result, 'weekday').factors.layoverFraction).toBe(0.2);
  });

  it('is invalid for a Trip of another Trip Profile, another Scenario, or an unknown day, and for another profile', () => {
    expect(estimate([trip('t1', 0, 3600, 'weekday', { tripProfileId: 'other' })], factors({ layoverFraction: 0.2 })).state).toBe('invalid');
    expect(estimate([trip('t1', 0, 3600, 'weekday', { scenarioId: 'other' })], factors({ layoverFraction: 0.2 })).state).toBe('invalid');
    expect(estimate([trip('t1', 0, 3600, 'nope')], factors({ layoverFraction: 0.2 })).state).toBe('invalid');
    expect(estimate([trip('t1', 0, 3600), trip('t1', 0, 3600)], factors({ layoverFraction: 0.2 })).findings.map((finding) => finding.ruleId)).toContain('costing.duplicateTrip');
    const mismatch = estimate([], factors({ layoverFraction: 0.2 }), { tripProfile: { ...tripProfile, scenarioId: 'other' } });
    expect(mismatch.findings.map((finding) => finding.ruleId)).toContain('costing.tripProfileMismatch');
  });

  it('gives back the blocked hours and cost when run with the Profile’s own unrounded factors', () => {
    const blockingScenario: BlockingScenario = { id: 'blocking', scenarioId: scenario.id, tripProfileId: tripProfile.id, name: 'Plan', ...metadata(stamp) };
    // Two Weekday Blocks. Trips run 1 h and 1.5 h with a 20 min and 35 min layover; pull-out 10 min, pull-in 15 min.
    const trips = [trip('a1', 28800, 32400), trip('a2', 33600, 39000), trip('b1', 30000, 34500), trip('b2', 36600, 40200)];
    const activities = (id: string, first: string, second: string, outStart: number, inEnd: number): BlockingBlock => ({
      id, scenarioId: scenario.id, blockingScenarioId: blockingScenario.id, serviceDayId: 'weekday', label: id,
      activities: [
        { id: `${id}-out`, type: 'pullOut', sequence: 0, startTime: outStart, endTime: outStart + 600, toNodeId: 'garage' },
        { id: `${id}-1`, type: 'revenueTrip', sequence: 1, tripId: first },
        { id: `${id}-2`, type: 'revenueTrip', sequence: 2, tripId: second },
        { id: `${id}-in`, type: 'pullIn', sequence: 3, startTime: inEnd - 900, endTime: inEnd, fromNodeId: 'terminal' },
      ],
      ...metadata(stamp),
    });
    const blocks = [activities('A', 'a1', 'a2', 28800 - 600, 39000 + 900), activities('B', 'b1', 'b2', 30000 - 600, 40200 + 900)];
    const days = serviceDays();
    // A loop Pattern, so every connection starts where the previous Trip ended and needs no deadhead.
    const pattern: RoutePattern = {
      id: 'pattern', scenarioId: scenario.id, routeId: 'route', name: 'Loop', ...metadata(stamp),
      points: [{ id: 'p1', nodeId: 'terminal', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'terminal', sequence: 1, cumulativeMiles: 10 }],
    };
    const { blockSummaries } = summarizeBlockingScenario(blockingScenario, blocks, { scenario: { id: scenario.id }, trips, patterns: [pattern] });
    expect(blockSummaries.every((summary) => summary.valid)).toBe(true);
    const blocked = calculateCosting({ scenario, serviceDays: days, blockingScenario, tripProfile, trips, blocks, blockSummaries, assumptions });
    expect(blocked.state).toBe('complete');

    const weekday = blocked.dailyRows.find((item) => item.serviceDayId === 'weekday')!;
    const runningHours = trips.reduce((sum, item) => sum + (item.stopTimes[1].time - item.stopTimes[0].time), 0) / 3600;
    const layover = (weekday.revenueHoursPerDay - runningHours) / weekday.revenueHoursPerDay;
    const deadhead = (weekday.platformHoursPerDay - weekday.revenueHoursPerDay) / weekday.platformHoursPerDay;
    expect(layover).toBeGreaterThan(0);
    expect(deadhead).toBeGreaterThan(0);

    const result = estimate(trips, factors({}, { serviceDayId: 'weekday', layoverFraction: layover, deadheadFraction: deadhead }), { serviceDays: days });
    const estimated = row(result, 'weekday');
    expect(estimated.runningHoursPerDay).toBeCloseTo(runningHours, 9);
    expect(estimated.revenueHoursPerDay!).toBeCloseTo(weekday.revenueHoursPerDay, 9);
    expect(estimated.platformHoursPerDay!).toBeCloseTo(weekday.platformHoursPerDay, 9);
    expect(result.yearRows[0].annualRevenueHours).toBeCloseTo(blocked.yearRows[0].annualRevenueHours, 9);
    expect(result.yearRows[0].annualCostUsd).toBeCloseTo(blocked.yearRows[0].annualCostUsd, 6);
  });

  it('applies the same rates as the blocked calculation', () => {
    const escalating: CostingAssumptionsInput = { ...assumptions, enteredRate: 123.45, rateYear: 2024, baseServiceYear: 2026, futureYearCount: 3, annualEscalation: 0.035, estimateFactors: factors({ layoverFraction: 0.2 }) };
    const result = estimate([trip('t1', 0, 3600)], undefined, { assumptions: escalating });
    expect(result.yearRows.map((item) => [item.serviceYear, item.appliedRateUsdPerRevenueHour])).toEqual(costingAppliedRates(escalating).map(({ serviceYear, rate }) => [serviceYear, rate]));
    expect(result.yearRows).toHaveLength(4);
  });
});

describe('resolveDayFactors', () => {
  it('returns nothing when no factors are stored', () => {
    expect(resolveDayFactors(undefined, 'weekday')).toEqual({});
  });
});

describe('normalizeEstimateFactors', () => {
  const days = serviceDays();
  it('drops blank rows and rows of unknown days, sorts in service-day order, and returns undefined when empty', () => {
    const normalized = normalizeEstimateFactors(factors({ layoverFraction: 0.2, deadheadFraction: undefined }, { serviceDayId: 'sunday', layoverFraction: 0.3 }, { serviceDayId: 'holiday' }, { serviceDayId: 'gone', layoverFraction: 0.1 }, { serviceDayId: 'weekday', deadheadFraction: 0.05 }), days);
    expect(normalized).toEqual({ allDays: { layoverFraction: 0.2 }, serviceDays: [{ serviceDayId: 'weekday', deadheadFraction: 0.05 }, { serviceDayId: 'sunday', layoverFraction: 0.3 }] });
    expect(normalizeEstimateFactors(factors({}, { serviceDayId: 'weekday' }), days)).toBeUndefined();
    expect(normalizeEstimateFactors(undefined, days)).toBeUndefined();
  });

  it('keeps an invalid value so validation can report it', () => {
    expect(normalizeEstimateFactors(factors({ layoverFraction: Number.NaN }), days)?.allDays.layoverFraction).toBeNaN();
  });
});
