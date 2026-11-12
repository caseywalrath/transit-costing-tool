import { describe, expect, it } from 'vitest';
import type { BlockConnection, BlockSummary } from './blocking';
import { calculateCosting, type CostingAssumptionsInput, type CostingCalculationInput } from './costing';
import { calculateEstimatedCosting, type EstimatedCostingInput } from './estimatedCosting';
import { metadata } from './ids';
import { sortRouteResults, type CostingRouteResult } from './routeCosting';
import { createStandardServiceDays } from './serviceDays';
import type { BlockingBlock, BlockingScenario, CostingEstimateFactors, Route, Scenario, ServiceDayDefinition, Trip, TripProfile } from './types';

// Decision 0077 item 3 (costing grouped by Route). Fixtures: Route "Alpha" (route-a) and Route "Beta" (route-b) on weekday and Saturday.

const stamp = '2026-01-01T00:00:00.000Z';
const scenario: Scenario = { id: 'scenario', projectId: 'project', name: 'Base', ...metadata(stamp) };
const tripProfile: TripProfile = { id: 'profile', scenarioId: scenario.id, name: 'Weekday', ...metadata(stamp) };
const blockingScenario: BlockingScenario = { id: 'blocking', scenarioId: scenario.id, tripProfileId: tripProfile.id, name: 'Plan A', ...metadata(stamp) };
const routes: Route[] = [
  { id: 'route-b', scenarioId: scenario.id, name: 'Beta', ...metadata(stamp) },
  { id: 'route-a', scenarioId: scenario.id, name: 'Alpha', ...metadata(stamp) },
  { id: 'route-c', scenarioId: scenario.id, name: 'Gamma', ...metadata(stamp) },
];
const assumptions: CostingAssumptionsInput = { enteredRate: 100, rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 1, annualEscalation: 0.03 };

function serviceDays(): ServiceDayDefinition[] {
  return createStandardServiceDays(scenario.id, { weekday: 255, saturday: 52, sunday: 52, holiday: 0 }, stamp).map((day) => ({ ...day, id: day.kind }));
}

/** A Trip whose run time is `end - start` seconds. */
function trip(id: string, routeId: string, start: number, end: number, serviceDayId = 'weekday'): Trip {
  return {
    id, scenarioId: scenario.id, routeId, serviceDayId, patternId: `${routeId}-pattern`, tripProfileId: tripProfile.id,
    stopTimes: [{ patternPointId: 'p1', sequence: 0, time: start }, { patternPointId: 'p2', sequence: 1, time: end }],
    provenance: { kind: 'manual' }, ...metadata(stamp),
  } as Trip;
}

const factors = (allDays: CostingEstimateFactors['allDays'], ...rows: CostingEstimateFactors['serviceDays']): CostingEstimateFactors => ({ allDays, serviceDays: rows });

interface EstimateOptions {
  profile?: CostingEstimateFactors;
  routeFactors?: { routeId: string; factors: CostingEstimateFactors }[];
}
function estimate(trips: Trip[], options: EstimateOptions = {}) {
  const input: EstimatedCostingInput = {
    scenario, serviceDays: serviceDays(), tripProfile, trips, routes,
    assumptions: {
      ...assumptions,
      ...(options.profile ? { estimateFactors: options.profile } : {}),
      ...(options.routeFactors ? { routeEstimateFactors: options.routeFactors } : {}),
    },
  };
  return calculateEstimatedCosting(input);
}

/** Route a: 8 h on weekday. Route b: 4 h on weekday and 2 h on Saturday. */
const estimateTrips = () => [trip('a1', 'route-a', 0, 8 * 3600), trip('b1', 'route-b', 0, 4 * 3600), trip('b2', 'route-b', 0, 2 * 3600, 'saturday')];

const routeOf = (rows: CostingRouteResult[], routeId: string | null) => rows.find((row) => row.routeId === routeId)!;
const dayOf = (row: CostingRouteResult, serviceDayId: string) => row.days.find((day) => day.serviceDayId === serviceDayId)!;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('estimated basis: costing grouped by Route', () => {
  it('gives one row per Route whose days add back to the day rows and the year totals', () => {
    const result = estimate(estimateTrips(), { profile: factors({ layoverFraction: 0.2, deadheadFraction: 0.1 }) });
    expect(result.state).toBe('complete');
    expect(result.routeRows.map((row) => row.routeId)).toEqual(['route-a', 'route-b']);
    expect(routeOf(result.routeRows, 'route-a').routeName).toBe('Alpha');
    for (const day of result.dailyRows) {
      const revenue = sum(result.routeRows.map((row) => dayOf(row, day.serviceDayId).revenueHoursPerDay!));
      expect(revenue).toBeCloseTo(day.revenueHoursPerDay!, 9);
    }
    expect(sum(result.routeRows.map((row) => row.days.reduce((total, day) => total + day.annualRevenueHours!, 0)))).toBeCloseTo(result.yearRows[0].annualRevenueHours, 6);
  });

  it('gives each Route year costs that add back to the year totals, in every service year', () => {
    const result = estimate(estimateTrips(), { profile: factors({ layoverFraction: 0.2, deadheadFraction: 0.1 }) });
    for (const yearRow of result.yearRows) {
      const routeCost = sum(result.routeRows.flatMap((row) => row.days.map((day) => day.yearCosts.find((cost) => cost.serviceYear === yearRow.serviceYear)!.annualCostUsd)));
      expect(routeCost).toBeCloseTo(yearRow.annualCostUsd, 6);
    }
  });

  it('keeps the Trip Profile computation of a day when no Route factor applies, using the same expression as before', () => {
    const result = estimate(estimateTrips(), { profile: factors({ layoverFraction: 0.2 }) });
    expect(dayOf(routeOf(result.routeRows, 'route-a'), 'weekday').revenueHoursPerDay).toBe(8 / (1 - 0.2));
    expect(result.dailyRows.find((day) => day.serviceDayId === 'weekday')!.revenueHoursPerDay).toBe(12 / (1 - 0.2));
    expect(result.dailyRows.find((day) => day.serviceDayId === 'weekday')!.factors).toEqual({ layoverFraction: 0.2, layoverSource: 'allDays' });
  });

  it('returns the same day rows when Route factors are an empty list or absent', () => {
    const without = estimate(estimateTrips(), { profile: factors({ layoverFraction: 0.2, deadheadFraction: 0.1 }) });
    const empty = estimate(estimateTrips(), { profile: factors({ layoverFraction: 0.2, deadheadFraction: 0.1 }), routeFactors: [] });
    expect(empty.dailyRows).toEqual(without.dailyRows);
    expect(empty.yearRows).toEqual(without.yearRows);
    expect(empty.routeRows).toEqual(without.routeRows);
  });

  it('changes only the Route with its own factor, and the day sum follows it', () => {
    const result = estimate(estimateTrips(), {
      profile: factors({ layoverFraction: 0.2, deadheadFraction: 0.1 }),
      routeFactors: [{ routeId: 'route-a', factors: factors({}, { serviceDayId: 'weekday', layoverFraction: 0.5 }) }],
    });
    const alpha = dayOf(routeOf(result.routeRows, 'route-a'), 'weekday');
    const beta = dayOf(routeOf(result.routeRows, 'route-b'), 'weekday');
    expect(alpha.revenueHoursPerDay).toBeCloseTo(16, 12);
    expect(alpha.factors).toEqual({ layoverFraction: 0.5, layoverSource: 'routeServiceDay', deadheadFraction: 0.1, deadheadSource: 'allDays' });
    expect(beta.revenueHoursPerDay).toBeCloseTo(5, 12);
    expect(beta.factors?.layoverSource).toBe('allDays');
    expect(result.dailyRows.find((day) => day.serviceDayId === 'weekday')!.revenueHoursPerDay).toBeCloseTo(21, 12);
    expect(result.dailyRows.find((day) => day.serviceDayId === 'weekday')!.platformHoursPerDay).toBeCloseTo(21 / 0.9, 12);
    expect(dayOf(routeOf(result.routeRows, 'route-b'), 'saturday').revenueHoursPerDay).toBeCloseTo(2.5, 12);
  });

  it('takes a Route factor from the Route All days row, and records that source', () => {
    const result = estimate(estimateTrips(), {
      profile: factors({ layoverFraction: 0.2 }),
      routeFactors: [{ routeId: 'route-b', factors: factors({ layoverFraction: 0.5 }) }],
    });
    const beta = routeOf(result.routeRows, 'route-b');
    expect(dayOf(beta, 'weekday').factors?.layoverSource).toBe('routeAllDays');
    expect(dayOf(beta, 'weekday').revenueHoursPerDay).toBeCloseTo(8, 12);
    expect(dayOf(beta, 'saturday').revenueHoursPerDay).toBeCloseTo(4, 12);
  });

  it('reports a missing layover factor once per day, for the Route that has running time without it', () => {
    const result = estimate(estimateTrips(), { routeFactors: [{ routeId: 'route-a', factors: factors({}, { serviceDayId: 'weekday', layoverFraction: 0.2 }) }] });
    const missing = result.findings.filter((finding) => finding.ruleId === 'costing.layoverFactorMissing');
    expect(missing.map((finding) => finding.parameters?.serviceDayId)).toEqual(['weekday', 'saturday']);
    expect(result.state).toBe('noEstimate');
    expect(result.noEstimateReason).toBe('layoverFactorMissing');
    expect(result.routeRows).toHaveLength(2);
    expect(result.routeRows.every((row) => row.days.every((day) => day.yearCosts.length === 0))).toBe(true);
  });

  it('returns no Route rows for an invalid result', () => {
    const stray = trip('x1', 'route-a', 0, 3600, 'missing-day');
    const result = estimate([...estimateTrips(), stray]);
    expect(result.state).toBe('invalid');
    expect(result.routeRows).toEqual([]);
  });
});

describe('blocked basis: costing grouped by Route', () => {
  // Trips: t1 Alpha (weekday, in b1); t2 Beta and t5 Alpha (weekday, in multi-route b2); t3 Alpha unassigned; t4 Gamma unassigned;
  // t6 Beta (Saturday, in b3).
  const trips = [
    trip('t1', 'route-a', 0, 3600),
    trip('t2', 'route-b', 0, 3600),
    trip('t5', 'route-a', 0, 3600),
    trip('t3', 'route-a', 0, 3600),
    trip('t4', 'route-c', 0, 3600),
    trip('t6', 'route-b', 0, 1800, 'saturday'),
  ];
  const revenueBlock = (id: string, tripIds: string[], serviceDayId = 'weekday'): BlockingBlock => ({
    id, scenarioId: scenario.id, blockingScenarioId: blockingScenario.id, serviceDayId, label: id,
    activities: [
      { id: `${id}-out`, type: 'pullOut', sequence: 0, startTime: 0, endTime: 0, toNodeId: 'garage' },
      ...tripIds.map((tripId, index) => ({ id: `${id}-r${index}`, type: 'revenueTrip' as const, sequence: index + 1, tripId })),
      { id: `${id}-in`, type: 'pullIn', sequence: tripIds.length + 1, startTime: 7200, endTime: 10800, fromNodeId: 'terminal' },
    ],
    ...metadata(stamp),
  });
  const blocks = [revenueBlock('b1', ['t1']), revenueBlock('b2', ['t2', 't5']), revenueBlock('b3', ['t6'], 'saturday')];
  const summary = (block: BlockingBlock, revenueSeconds: number, connections: BlockConnection[] = []): BlockSummary => ({
    blockId: block.id, revenueHours: revenueSeconds / 3600, revenueSeconds, runningHours: revenueSeconds / 3600,
    platformHours: 3, platformSeconds: 10800, deadheadHours: 0, layoverHours: 0, status: 'complete', complete: true, valid: true, findings: [],
    connections,
    activityTimings: [{ activityId: `${block.id}-out`, startTime: 0, endTime: 0 }, { activityId: `${block.id}-in`, startTime: 7200, endTime: 10800 }],
  });
  const blockSummaries = [
    summary(blocks[0], 3600),
    summary(blocks[1], 7200, [{ previousTripId: 't2', nextTripId: 't5', rawGapSeconds: 600, usableLayoverSeconds: 600, status: 'valid', findings: [] }]),
    summary(blocks[2], 1800),
  ];
  function blocked(overrides: Partial<CostingCalculationInput> = {}) {
    return calculateCosting({
      scenario, serviceDays: serviceDays(), blockingScenario, tripProfile, trips, blocks, blockSummaries, assumptions, routes,
      ...overrides,
    });
  }

  it('attributes a single-Route Block to its Route, and a multi-Route Block to the Unattributed row with a warning', () => {
    const result = blocked();
    expect(result.routeRows.map((row) => row.routeId)).toEqual(['route-a', 'route-b', 'route-c', null]);
    expect(routeOf(result.routeRows, 'route-a').days.find((day) => day.serviceDayId === 'weekday')!.blockCount).toBe(1);
    expect(dayOf(routeOf(result.routeRows, null), 'weekday').blockCount).toBe(1);
    expect(dayOf(routeOf(result.routeRows, null), 'weekday').revenueHoursPerDay).toBeCloseTo(2, 12);
    const warnings = result.findings.filter((finding) => finding.ruleId === 'costing.multiRouteBlock');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ severity: 'warning', entityType: 'block', entityId: 'b2', parameters: { serviceDayId: 'weekday' } });
  });

  it('makes the Route rows and the Unattributed row add up to the eligible Blocks and the day totals', () => {
    const result = blocked();
    expect(result.eligibleBlockCount).toBe(3);
    for (const day of result.dailyRows) {
      expect(sum(result.routeRows.map((row) => dayOf(row, day.serviceDayId).blockCount!))).toBe(day.eligibleBlockCount);
      expect(sum(result.routeRows.map((row) => dayOf(row, day.serviceDayId).revenueHoursPerDay!))).toBeCloseTo(day.revenueHoursPerDay, 9);
      expect(sum(result.routeRows.map((row) => dayOf(row, day.serviceDayId).platformHoursPerDay!))).toBeCloseTo(day.platformHoursPerDay, 9);
    }
    for (const yearRow of result.yearRows) {
      const routeCost = sum(result.routeRows.flatMap((row) => row.days.map((day) => day.yearCosts.find((cost) => cost.serviceYear === yearRow.serviceYear)!.annualCostUsd)));
      expect(routeCost).toBeCloseTo(yearRow.annualCostUsd, 6);
    }
  });

  it('counts unassigned Trips per Route, and gives a Route with only unassigned Trips a row with zero hours', () => {
    const result = blocked();
    expect(sum(result.routeRows.map((row) => row.days.reduce((total, day) => total + day.unassignedTripCount!, 0)))).toBe(result.unassignedTripCount);
    const gamma = routeOf(result.routeRows, 'route-c');
    expect(gamma.routeName).toBe('Gamma');
    expect(dayOf(gamma, 'weekday')).toMatchObject({ unassignedTripCount: 1, blockCount: 0, revenueHoursPerDay: 0 });
  });

  it('omits the Unattributed row when no eligible Block spans two Routes', () => {
    const result = blocked({ blocks: [blocks[0], blocks[2]], blockSummaries: [blockSummaries[0], blockSummaries[2]] });
    expect(result.routeRows.map((row) => row.routeId)).toEqual(['route-a', 'route-b', 'route-c']);
    expect(result.findings.some((finding) => finding.ruleId === 'costing.multiRouteBlock')).toBe(false);
  });

  it('gives Route rows without year costs when no rate is entered, and none for a result without eligible Blocks', () => {
    const noRate = blocked({ assumptions: { ...assumptions, enteredRate: undefined } });
    expect(noRate.noEstimateReason).toBe('rateMissing');
    expect(noRate.routeRows.length).toBeGreaterThan(0);
    expect(noRate.routeRows.every((row) => row.days.every((day) => day.yearCosts.length === 0))).toBe(true);
    const none = blocked({ blocks: [], blockSummaries: [] });
    expect(none.noEstimateReason).toBe('noEligibleBlocks');
    expect(none.routeRows).toEqual([]);
  });
});

describe('sortRouteResults', () => {
  const row = (routeId: string | null, routeName?: string): CostingRouteResult => ({ routeId, ...(routeName ? { routeName } : {}), days: [] });

  it('orders by Route name with numbers in natural order, then by ID, and puts the Unattributed row last', () => {
    const rows = [row(null), row('r10', 'Route 10'), row('r2', 'Route 2'), row('rb', 'beta'), row('ra', 'Alpha')];
    const sorted = sortRouteResults(rows);
    expect(sorted.map((item) => item.routeId)).toEqual(['ra', 'rb', 'r2', 'r10', null]);
    expect(rows[0].routeId).toBeNull();
  });
});
