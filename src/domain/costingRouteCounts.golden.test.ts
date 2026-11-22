// Decision 0089 item 41 on the Golden (Federal BRT) backup. With no Route switched on, costing is exactly as before; switched on, the Route's
// own count applies to its day and the other days keep the Scenario's count.
import { describe, expect, it } from 'vitest';
import { summarizeBlockingScenario } from './blocking';
import { calculateCosting, type CostingAssumptionsInput, type CostingCalculationResult } from './costing';
import { calculateEstimatedCosting, type EstimatedCostingCalculationResult } from './estimatedCosting';
import { goldenRaw, goldenWithFeedFields } from '../testSupport/goldenBackup';
import type { BlockingBlock, BlockingScenario, Route, RoutePattern, Scenario, ServiceDayDefinition, Trip, TripProfile } from './types';

/** The records of the backup that the blocked basis reads, typed as the application's records. */
interface GoldenRecords {
  scenarios: Scenario[];
  serviceDays: ServiceDayDefinition[];
  routes: Route[];
  tripProfiles: TripProfile[];
  blockingScenarios: BlockingScenario[];
  blocks: BlockingBlock[];
  trips: Trip[];
  patterns: RoutePattern[];
}

const assumptions: CostingAssumptionsInput = { enteredRate: 100, rateYear: 2024, sourceType: 'ntd', baseServiceYear: 2026, futureYearCount: 2, annualEscalation: 0.03 };

/** The blocked basis of the backup's Blocking Scenario, built the way the application builds it (costingContext.ts). */
function blockedBasis(backup: GoldenRecords): CostingCalculationResult {
  const blockingScenario = backup.blockingScenarios.find((candidate) => backup.blocks.some((block) => block.blockingScenarioId === candidate.id))!;
  const scenario = backup.scenarios.find((candidate) => candidate.id === blockingScenario.scenarioId)!;
  const tripProfile = backup.tripProfiles.find((candidate) => candidate.id === blockingScenario.tripProfileId)!;
  const blocks = backup.blocks.filter((block) => block.blockingScenarioId === blockingScenario.id);
  const trips = backup.trips.filter((trip) => trip.scenarioId === scenario.id && trip.tripProfileId === tripProfile.id);
  const { blockSummaries } = summarizeBlockingScenario(blockingScenario, blocks, { scenario: { id: scenario.id }, trips, patterns: backup.patterns });
  return calculateCosting({
    scenario,
    serviceDays: backup.serviceDays.filter((day) => day.scenarioId === scenario.id),
    blockingScenario,
    tripProfile,
    trips,
    blocks,
    blockSummaries,
    routes: backup.routes.filter((route) => route.scenarioId === scenario.id),
    assumptions,
  });
}

/**
 * The estimated basis of the backup's Trip Profile, with the All days factors the blocked Blocks give (layover 18.2%, deadhead 5.6%,
 * recorded in codex.md). The backup stores no costing assumptions of its own.
 */
function estimatedBasis(backup: GoldenRecords): EstimatedCostingCalculationResult {
  const tripProfile = backup.tripProfiles[0];
  const scenario = backup.scenarios.find((candidate) => candidate.id === tripProfile.scenarioId)!;
  return calculateEstimatedCosting({
    scenario,
    serviceDays: backup.serviceDays.filter((day) => day.scenarioId === scenario.id),
    tripProfile,
    trips: backup.trips.filter((trip) => trip.scenarioId === scenario.id && trip.tripProfileId === tripProfile.id),
    patterns: backup.patterns,
    routes: backup.routes.filter((route) => route.scenarioId === scenario.id),
    assumptions: { ...assumptions, estimateFactors: { allDays: { layoverFraction: 0.182, deadheadFraction: 0.056 }, serviceDays: [] } },
  });
}

describe('estimated basis with a Route\'s own annual counts on the Golden backup (Decision 0089 item 41)', () => {
  it('gives every number of the result unchanged when no Route is switched on, whether it has counts or not', () => {
    const absent = estimatedBasis(goldenRaw() as GoldenRecords);
    const switchedOff = goldenRaw() as GoldenRecords;
    for (const route of switchedOff.routes) {
      route.ownAnnualServiceDays = { enabled: false, countsByServiceDayId: Object.fromEntries(switchedOff.serviceDays.map((day) => [day.id, 62])) };
    }
    expect(estimatedBasis(switchedOff)).toEqual(absent);
    expect(absent.state).toBe('complete');
    expect(absent.findings).toEqual([]);
    expect(absent.dailyRows.some((row) => 'usesRouteCounts' in row)).toBe(false);
    expect(absent.routeRows.every((route) => route.days.every((day) => day.countSource === 'scenario'))).toBe(true);
    // The Weekday figure of the estimate, recorded before Decision 0089 item 41 was implemented.
    expect(absent.dailyRows[0].annualRevenueHours).toBeCloseTo(79892.7261613692, 4);
  });

  it('switched on, the Route\'s own Weekday count gives that day\'s hours and cost, and the other days keep the Scenario count', () => {
    const baseline = estimatedBasis(goldenRaw() as GoldenRecords);
    const on = estimatedBasis(goldenWithFeedFields() as GoldenRecords);
    const [weekday, saturday] = on.dailyRows;
    expect(on.dailyRows.every((row) => row.usesRouteCounts === true)).toBe(true);
    expect(weekday.annualServiceDays).toBe(255);
    const route = on.routeRows[0];
    expect(route.days[0]).toMatchObject({ serviceDayName: 'Weekday', annualServiceDays: 62, countSource: 'route' });
    expect(route.days[1]).toMatchObject({ serviceDayName: 'Saturday', annualServiceDays: 52, countSource: 'scenario' });
    expect(weekday.annualRevenueHours!).toBeCloseTo(route.days[0].revenueHoursPerDay! * 62, 6);
    expect(weekday.annualRunningHours).toBeCloseTo(route.days[0].runningHoursPerDay! * 62, 6);
    expect(saturday.annualRevenueHours!).toBeCloseTo(baseline.dailyRows[1].annualRevenueHours!, 9);
    const appliedRate = on.yearRows[0].appliedRateUsdPerRevenueHour;
    const expectedCost = route.days.reduce((sum, day) => sum + day.revenueHoursPerDay! * appliedRate * day.annualServiceDays, 0);
    expect(on.yearRows[0].annualCostUsd).toBeCloseTo(expectedCost, 4);
    expect(on.yearRows[0].annualCostUsd).toBeLessThan(baseline.yearRows[0].annualCostUsd);
    expect(on.findings).toEqual([expect.objectContaining({ ruleId: 'costing.routeCountsInUse', severity: 'warning', parameters: { routes: 'Federal Boulevard BRT' } })]);
  });
});

describe('blocked basis with a Route\'s own annual counts on the Golden backup (Decision 0089 item 41)', () => {
  it('gives every number of the result unchanged when no Route is switched on, whether it has counts or not', () => {
    const absent = blockedBasis(goldenRaw() as GoldenRecords);
    const switchedOff = goldenRaw() as GoldenRecords;
    for (const route of switchedOff.routes) {
      route.ownAnnualServiceDays = { enabled: false, countsByServiceDayId: Object.fromEntries(switchedOff.serviceDays.map((day) => [day.id, 62])) };
    }
    expect(blockedBasis(switchedOff)).toEqual(absent);
    expect(absent.findings).toEqual([]);
    expect(absent.dailyRows.some((row) => 'usesRouteCounts' in row)).toBe(false);
    expect(absent.routeRows.every((route) => route.days.every((day) => day.countSource === 'scenario'))).toBe(true);
    // The Weekday figure of the baseline, recorded before Decision 0089 item 41 was implemented.
    expect(absent.dailyRows[0]).toMatchObject({ serviceDayName: 'Weekday', annualServiceDays: 255 });
    expect(absent.dailyRows[0].annualRevenueHours).toBeCloseTo(79455.875, 3);
  });

  it('switched on, the Route\'s own Weekday count gives that day\'s hours and cost, and the other days keep the Scenario count', () => {
    const baseline = blockedBasis(goldenRaw() as GoldenRecords);
    const on = blockedBasis(goldenWithFeedFields() as GoldenRecords);
    const [weekday, saturday] = on.dailyRows;
    expect(on.dailyRows.every((row) => row.usesRouteCounts === true)).toBe(true);
    expect(weekday).toMatchObject({ serviceDayName: 'Weekday', annualServiceDays: 255 });
    expect(weekday.annualRevenueHours).toBeCloseTo(weekday.revenueHoursPerDay * 62, 6);
    expect(saturday.annualRevenueHours).toBeCloseTo(baseline.dailyRows[1].annualRevenueHours, 9);
    const route = on.routeRows[0];
    expect(route.days[0]).toMatchObject({ serviceDayName: 'Weekday', annualServiceDays: 62, countSource: 'route' });
    expect(route.days[1]).toMatchObject({ serviceDayName: 'Saturday', annualServiceDays: 52, countSource: 'scenario' });
    // The first-year cost follows the same counts: each day's hours per day times the applied rate times the count the Route row uses.
    const appliedRate = on.yearRows[0].appliedRateUsdPerRevenueHour;
    const expectedCost = route.days.reduce((sum, day) => sum + day.revenueHoursPerDay! * appliedRate * day.annualServiceDays, 0);
    expect(on.yearRows[0].annualCostUsd).toBeCloseTo(expectedCost, 4);
    // Weekday's count falls from 255 to 62, so the first-year cost falls; the other days are unchanged.
    expect(on.yearRows[0].annualCostUsd).toBeLessThan(baseline.yearRows[0].annualCostUsd);
    expect(on.findings).toEqual([expect.objectContaining({ ruleId: 'costing.routeCountsInUse', severity: 'warning', parameters: { routes: 'Federal Boulevard BRT' } })]);
  });
});
