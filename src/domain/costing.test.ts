import { describe, expect, it } from 'vitest';
import type { BlockSummary } from './blocking';
import {
  calculateCosting,
  evaluateBlockEligibility,
  roundCostingDisplay,
  selectCostingBlockingScenario,
  validateAnnualServiceDays,
  type CostingAssumptionsInput,
  type CostingCalculationInput,
} from './costing';
import { createStandardServiceDays } from './serviceDays';
import { metadata } from './ids';
import type { BlockingBlock, BlockingScenario, Scenario, ServiceDayDefinition, Trip, TripProfile } from './types';

const scenario: Scenario = { id: 'scenario', projectId: 'project', name: 'Base', ...metadata('2026-01-01T00:00:00.000Z') };
const tripProfile: TripProfile = { id: 'profile', scenarioId: scenario.id, name: 'Weekday', ...metadata('2026-01-01T00:00:00.000Z') };
const blockingScenario: BlockingScenario = { id: 'blocking', scenarioId: scenario.id, tripProfileId: tripProfile.id, name: 'Plan A', ...metadata('2026-01-01T00:00:00.000Z') };
const assumptions: CostingAssumptionsInput = {
  enteredRate: 100,
  rateYear: 2024,
  sourceType: 'ntd',
  sourceNote: 'NTD 2024 rate',
  baseServiceYear: 2026,
  futureYearCount: 0,
  annualEscalation: 0.03,
};

function serviceDays(annual: Partial<Record<ServiceDayDefinition['kind'], number>> = {}): ServiceDayDefinition[] {
  const defaults = { weekday: 260, saturday: 52, sunday: 52, holiday: 0 };
  return createStandardServiceDays(scenario.id, { ...defaults, ...annual }, '2026-01-01T00:00:00.000Z')
    .map((day) => ({ ...day, id: day.kind }));
}

function trip(id: string, serviceDayId = 'weekday'): Trip {
  return {
    id,
    scenarioId: scenario.id,
    routeId: 'route',
    serviceDayId,
    patternId: 'pattern',
    tripProfileId: tripProfile.id,
    stopTimes: [],
    provenance: { kind: 'manual' },
    ...metadata('2026-01-01T00:00:00.000Z'),
  } as unknown as Trip;
}

function block(id: string, tripId?: string, serviceDayId = 'weekday', includePullIn = true): BlockingBlock {
  const activities: BlockingBlock['activities'] = tripId ? [
    { id: `${id}-out`, type: 'pullOut', sequence: 0, startTime: 0, endTime: 0, toNodeId: 'garage' },
    { id: `${id}-revenue`, type: 'revenueTrip', sequence: 1, tripId },
    ...(includePullIn ? [{ id: `${id}-in`, type: 'pullIn' as const, sequence: 2, startTime: 7200, endTime: 10800, fromNodeId: 'terminal' }] : []),
  ] : [];
  return { id, scenarioId: scenario.id, blockingScenarioId: blockingScenario.id, serviceDayId, label: id, activities, ...metadata('2026-01-01T00:00:00.000Z') };
}

function summary(blockId: string, options: Partial<BlockSummary> = {}): BlockSummary {
  return {
    blockId,
    revenueHours: 1,
    runningHours: 1,
    platformHours: 3,
    deadheadHours: 0,
    layoverHours: 0,
    status: 'complete',
    complete: true,
    valid: true,
    findings: [],
    connections: [],
    activityTimings: [
      { activityId: `${blockId}-out`, startTime: 0, endTime: 0 },
      { activityId: `${blockId}-in`, startTime: 7200, endTime: 10800 },
    ],
    ...options,
  };
}

function input(overrides: Partial<CostingCalculationInput> = {}): CostingCalculationInput {
  const days = serviceDays();
  const assignedTrip = trip('trip-1');
  const assignedBlock = block('block-1', assignedTrip.id);
  return {
    scenario,
    serviceDays: days,
    assumptions,
    blockingScenario,
    tripProfile,
    trips: [assignedTrip],
    blocks: [assignedBlock],
    blockSummaries: [summary(assignedBlock.id)],
    ...overrides,
  };
}

describe('Phase 5A costing calculations', () => {
  it('keeps a Block eligible when only its mileage is incomplete', () => {
    const current = input({
      blockSummaries: [summary('block-1', {
        complete: false,
        status: 'incomplete',
        revenueMiles: undefined,
        platformMiles: undefined,
        findings: [
          { ruleId: 'block.revenueMilesIncomplete', severity: 'warning', entityType: 'block', entityId: 'block-1', messageKey: 'block.revenueMilesIncomplete' },
          { ruleId: 'block.platformMilesIncomplete', severity: 'warning', entityType: 'block', entityId: 'block-1', messageKey: 'block.platformMilesIncomplete' },
        ],
      })],
    });

    const result = calculateCosting(current);
    expect(result.state).toBe('complete');
    expect(result.eligibleBlockCount).toBe(1);
    expect(result.dailyRows[0].revenueHoursPerDay).toBe(1);
    expect(result.dailyRows[0].platformHoursPerDay).toBe(3);
  });

  it('excludes a Block without a pull-in boundary and reports the reason', () => {
    const missingBoundaryBlock = block('block-1', 'trip-1', 'weekday', false);
    const result = calculateCosting(input({
      blocks: [missingBoundaryBlock],
      blockSummaries: [summary(missingBoundaryBlock.id, { platformHours: undefined, complete: false, status: 'incomplete' })],
    }));

    expect(result.state).toBe('noEstimate');
    expect(result.noEstimateReason).toBe('noEligibleBlocks');
    expect(result.dailyRows).toEqual([]);
    expect(result.exclusions[0].blocks[0].reasonCodes).toContain('block.platformBoundariesMissing');
  });

  it.each([
    ['incomplete', 'block.connectionIncomplete'],
    ['conflict', 'block.connectionConflict'],
  ] as const)('excludes a Block with a %s connection', (status, reasonCode) => {
    const current = input();
    const twoTripBlock = {
      ...current.blocks[0],
      activities: [
        current.blocks[0].activities[0],
        current.blocks[0].activities[1],
        { id: 'block-1-revenue-2', type: 'revenueTrip' as const, sequence: 2, tripId: 'trip-2' },
        { id: 'block-1-in', type: 'pullIn' as const, sequence: 3, startTime: 7200, endTime: 10800, fromNodeId: 'terminal' },
      ],
    };
    const connectionSummary = summary('block-1', {
      connections: [{ previousTripId: 'trip-1', nextTripId: 'trip-2', status, findings: [] }],
    });
    const result = calculateCosting(input({
      trips: [trip('trip-1'), trip('trip-2')],
      blocks: [twoTripBlock],
      blockSummaries: [connectionSummary],
    }));

    expect(result.state).toBe('noEstimate');
    expect(result.exclusions[0].blocks[0].reasonCodes).toContain(reasonCode);
  });

  it('does not count an empty Block as eligible work or an exclusion', () => {
    const empty = block('empty-block');
    const result = calculateCosting(input({ trips: [], blocks: [empty], blockSummaries: [] }));

    expect(result.state).toBe('noEstimate');
    expect(result.eligibleBlockCount).toBe(0);
    expect(result.excludedBlockCount).toBe(0);
    expect(result.exclusions.every((day) => day.excludedBlockCount === 0)).toBe(true);
  });

  it('counts source-profile Trips that are not assigned to any Block', () => {
    const result = calculateCosting(input({ trips: [trip('trip-1'), trip('trip-2')] }));

    expect(result.state).toBe('partial');
    expect(result.unassignedTripCount).toBe(1);
    expect(result.exclusions.find((day) => day.serviceDayId === 'weekday')?.unassignedTripCount).toBe(1);
  });

  it.each([
    [364, 0],
    [365, 1],
    [366, 2],
  ])('accepts %i annual service days only when the total is at most 365', (total, holidayDays) => {
    const findings = validateAnnualServiceDays(serviceDays({ weekday: 260, saturday: 52, sunday: 52, holiday: holidayDays }), scenario.id);
    expect(findings.some((finding) => finding.code === 'costing.annualServiceDaysExceed365')).toBe(total === 366);
  });

  it('shows quantities for a zero-count day and adds zero to annual cost', () => {
    const zeroWeekday = serviceDays({ weekday: 0, saturday: 52, sunday: 52, holiday: 0 });
    const missingPullInBlock = block('incomplete-block', 'trip-2', 'weekday', false);
    const result = calculateCosting(input({
      serviceDays: zeroWeekday,
      trips: [trip('trip-1'), trip('trip-2'), trip('trip-3')],
      blocks: [block('block-1', 'trip-1'), missingPullInBlock],
      blockSummaries: [summary('block-1'), summary('incomplete-block', { platformHours: undefined, complete: false, status: 'incomplete' })],
    }));
    const weekday = result.dailyRows.find((row) => row.serviceDayId === 'weekday')!;

    expect(result.state).toBe('partial');
    expect(weekday.revenueHoursPerDay).toBe(1);
    expect(weekday.platformHoursPerDay).toBe(3);
    expect(weekday.annualRevenueHours).toBe(0);
    expect(weekday.yearCosts[0].annualCostUsd).toBe(0);
    expect(weekday.excludedBlockCount).toBe(1);
    expect(weekday.unassignedTripCount).toBe(1);
  });

  it('compounds the source rate to the base year and future years', () => {
    const result = calculateCosting(input({ assumptions: { ...assumptions, baseServiceYear: 2026, futureYearCount: 2 } }));

    expect(result.yearRows.map((row) => row.serviceYear)).toEqual([2026, 2027, 2028]);
    expect(result.yearRows[0].appliedRateUsdPerRevenueHour).toBeCloseTo(106.09, 10);
    expect(result.yearRows[1].appliedRateUsdPerRevenueHour).toBeCloseTo(109.2727, 10);
    expect(result.yearRows[2].appliedRateUsdPerRevenueHour).toBeCloseTo(112.550881, 10);
  });

  it('supports a base year plus the maximum ten future years', () => {
    const result = calculateCosting(input({ assumptions: { ...assumptions, futureYearCount: 10 } }));
    expect(result.yearRows).toHaveLength(11);
    expect(result.yearRows.at(-1)?.serviceYear).toBe(2036);
  });

  it('does not calculate when the source rate year is later than the base service year', () => {
    const result = calculateCosting(input({ assumptions: { ...assumptions, rateYear: 2027, baseServiceYear: 2026 } }));
    expect(result.state).toBe('invalid');
    expect(result.findings.map((finding) => finding.code)).toContain('costing.rateYearAfterBaseServiceYear');
  });

  it('returns quantities without fabricating a cost when no rate has been entered', () => {
    const result = calculateCosting(input({ assumptions: { ...assumptions, enteredRate: undefined } }));
    expect(result.state).toBe('noEstimate');
    expect(result.noEstimateReason).toBe('rateMissing');
    expect(result.dailyRows[0].revenueHoursPerDay).toBe(1);
    expect(result.dailyRows[0].yearCosts).toEqual([]);
    expect(result.yearRows).toEqual([]);
  });

  it('rounds exact decimal ties away from zero and rounds totals independently', () => {
    expect(roundCostingDisplay(1.005, 2)).toBe(1.01);
    expect(roundCostingDisplay(-1.005, 2)).toBe(-1.01);
    expect(roundCostingDisplay(1.23445, 4)).toBe(1.2345);
  });

  it('calculates row and total rounding independently from unrounded costs', () => {
    const days = serviceDays({ weekday: 1, saturday: 1, sunday: 0, holiday: 0 });
    const firstBlock = block('block-weekday', 'trip-weekday', 'weekday');
    const secondBlock = block('block-saturday', 'trip-saturday', 'saturday');
    const result = calculateCosting(input({
      serviceDays: days,
      assumptions: { ...assumptions, enteredRate: 1, rateYear: 2026, baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0 },
      trips: [trip('trip-weekday', 'weekday'), trip('trip-saturday', 'saturday')],
      blocks: [firstBlock, secondBlock],
      blockSummaries: [summary(firstBlock.id, { revenueHours: 0.005 }), summary(secondBlock.id, { revenueHours: 0.005 })],
    }));
    const dayCosts = result.dailyRows.slice(0, 2).map((row) => row.yearCosts[0].annualCostUsd);
    const independentlyRoundedRows = dayCosts.reduce((sum, cost) => sum + roundCostingDisplay(cost, 2), 0);

    expect(independentlyRoundedRows).toBe(0.02);
    expect(roundCostingDisplay(result.yearRows[0].annualCostUsd, 2)).toBe(0.01);
  });

  it('requires an explicitly selected Blocking Scenario from the requested Scenario', () => {
    expect(selectCostingBlockingScenario(scenario.id, [blockingScenario], blockingScenario.id)).toEqual(blockingScenario);
    expect(selectCostingBlockingScenario(scenario.id, [blockingScenario])).toBeUndefined();
    expect(selectCostingBlockingScenario('another-scenario', [blockingScenario], blockingScenario.id)).toBeUndefined();
  });

  it('requires finite nonnegative hours and boundary-derived Platform Hours', () => {
    const current = input();
    const dayIds = new Set(current.serviceDays.map((day) => day.id));
    const invalidRevenue = evaluateBlockEligibility(current.blocks[0], summary('block-1', { revenueHours: Number.NaN }), scenario, blockingScenario, dayIds);
    const invalidPlatform = evaluateBlockEligibility(current.blocks[0], summary('block-1', { platformHours: Number.POSITIVE_INFINITY }), scenario, blockingScenario, dayIds);

    expect(invalidRevenue.eligible).toBe(false);
    expect(invalidRevenue.reasonCodes).toContain('block.revenueHoursInvalid');
    expect(invalidPlatform.eligible).toBe(false);
    expect(invalidPlatform.reasonCodes).toContain('block.platformHoursInvalid');
  });
});
