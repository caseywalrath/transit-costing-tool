import { describe, expect, it } from 'vitest';
import type { BlockSummary } from '../../domain/blocking';
import { calculateCosting, type CostingAssumptionsInput, type CostingCalculationInput } from '../../domain/costing';
import { calculateEstimatedCosting } from '../../domain/estimatedCosting';
import { metadata } from '../../domain/ids';
import { createStandardServiceDays } from '../../domain/serviceDays';
import type { BlockingBlock, BlockingScenario, CostingEstimateFactors, Route, Scenario, ServiceDayDefinition, Trip, TripProfile } from '../../domain/types';
import { BREAKDOWN_COLUMNS, costBreakdownText, dayBreakdownRows, ownCountsText, routeBreakdownRows } from './costBreakdownText';

// Fixtures follow src/domain/costing.test.ts (blocked basis) and src/domain/estimatedCosting.test.ts (estimated basis).
const stamp = '2026-01-01T00:00:00.000Z';
const scenario: Scenario = { id: 'scenario', projectId: 'project', name: 'Base', ...metadata(stamp) };
const tripProfile: TripProfile = { id: 'profile', scenarioId: scenario.id, name: 'Weekday', ...metadata(stamp) };
const blockingScenario: BlockingScenario = { id: 'blocking', scenarioId: scenario.id, tripProfileId: tripProfile.id, name: 'Plan A', ...metadata(stamp) };
const assumptions: CostingAssumptionsInput = { enteredRate: 100, rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0 };

function serviceDays(): ServiceDayDefinition[] {
  return createStandardServiceDays(scenario.id, { weekday: 260, saturday: 52, sunday: 52, holiday: 0 }, stamp).map((day) => ({ ...day, id: day.kind }));
}

function trip(id: string, start = 0, end = 3600): Trip {
  return {
    id, scenarioId: scenario.id, routeId: 'route', serviceDayId: 'weekday', patternId: 'pattern', tripProfileId: tripProfile.id,
    stopTimes: [{ patternPointId: 'p1', sequence: 0, time: start }, { patternPointId: 'p2', sequence: 1, time: end }],
    provenance: { kind: 'manual' }, ...metadata(stamp),
  } as Trip;
}

function block(id: string, tripId: string): BlockingBlock {
  const activities: BlockingBlock['activities'] = [
    { id: `${id}-out`, type: 'pullOut', sequence: 0, startTime: 0, endTime: 0, toNodeId: 'garage' },
    { id: `${id}-revenue`, type: 'revenueTrip', sequence: 1, tripId },
    { id: `${id}-in`, type: 'pullIn', sequence: 2, startTime: 7200, endTime: 10800, fromNodeId: 'terminal' },
  ];
  return { id, scenarioId: scenario.id, blockingScenarioId: blockingScenario.id, serviceDayId: 'weekday', label: id, activities, ...metadata(stamp) };
}

function summary(blockId: string): BlockSummary {
  return {
    blockId, revenueHours: 1, runningHours: 1, platformHours: 3, deadheadHours: 0, layoverHours: 0, status: 'complete', complete: true, valid: true, findings: [], connections: [],
    activityTimings: [{ activityId: `${blockId}-out`, startTime: 0, endTime: 0 }, { activityId: `${blockId}-in`, startTime: 7200, endTime: 10800 }],
  };
}

function blockedResult(routes?: Route[]) {
  const assigned = trip('trip-1');
  const assignedBlock = block('block-1', assigned.id);
  const input: CostingCalculationInput = { scenario, serviceDays: serviceDays(), assumptions, blockingScenario, tripProfile, trips: [assigned], blocks: [assignedBlock], blockSummaries: [summary(assignedBlock.id)], ...(routes ? { routes } : {}) };
  return calculateCosting(input);
}

function estimatedResult() {
  const factors: CostingEstimateFactors = { allDays: {}, serviceDays: [{ serviceDayId: 'weekday', layoverFraction: 0.2, deadheadFraction: 0.2 }] };
  return calculateEstimatedCosting({
    scenario, serviceDays: serviceDays(), tripProfile, trips: [trip('t1', 0, 8 * 3600)],
    assumptions: { ...assumptions, estimateFactors: factors },
  });
}

describe('a Route on its own annual counts (Decision 0089 item 41)', () => {
  const route = (own?: Route['ownAnnualServiceDays']): Route => ({ id: 'route', scenarioId: scenario.id, name: 'Federal', ...(own ? { ownAnnualServiceDays: own } : {}), ...metadata(stamp) });

  it('marks the Route and its own-count day rows, and lists the counts the figures use', () => {
    const result = blockedResult([route({ enabled: true, countsByServiceDayId: { weekday: 62 } })]);
    const { routes } = routeBreakdownRows(result, 2026);
    expect(routes[0]!.ownCountsText).toBe('Weekday 62');
    const weekday = routes[0]!.dayRows.find((row) => row.name === 'Weekday')!;
    expect(weekday.days).toBe(62);
    expect(weekday.ownCount).toBe(true);
    expect(routes[0]!.dayRows.find((row) => row.name === 'Saturday')!.ownCount).toBeUndefined();
    // The copied text shows the count actually used for that Route, not the Scenario's 260.
    expect(costBreakdownText(result, 2026, 364).find((row) => row[1] === 'Weekday')![2]).toBe('62');
    // Grouped by service day, the Scenario's day row keeps its count and the Route's row carries the marker.
    const day = dayBreakdownRows(result, 2026).days.find((item) => item.name === 'Weekday')!;
    expect(day.days).toBe(260);
    expect(day.ownCount).toBeUndefined();
    expect(day.routeRows[0]).toMatchObject({ days: 62, ownCount: true });
  });

  it('shows no marker for a Route that is absent, switched off, or has no count', () => {
    const cases: Array<Route['ownAnnualServiceDays']> = [undefined, { enabled: false, countsByServiceDayId: { weekday: 62 } }, { enabled: true, countsByServiceDayId: {} }];
    for (const own of cases) {
      const { routes } = routeBreakdownRows(blockedResult([route(own)]), 2026);
      expect(routes[0]!.ownCountsText).toBeUndefined();
      expect(routes[0]!.dayRows.some((row) => row.ownCount)).toBe(false);
    }
  });

  it('lists only the days that use the Route\'s count', () => {
    expect(ownCountsText([{ serviceDayName: 'Weekday', annualServiceDays: 62, countSource: 'route' }, { serviceDayName: 'Saturday', annualServiceDays: 52, countSource: 'scenario' }, { serviceDayName: 'Sunday', annualServiceDays: 0, countSource: 'route' }])).toBe('Weekday 62, Sunday 0');
    expect(ownCountsText([{ serviceDayName: 'Weekday', annualServiceDays: 260, countSource: 'scenario' }])).toBeUndefined();
  });
});

describe('costBreakdownText', () => {
  it('builds the header, a Route row with its service-day rows, and the total row for a blocked result', () => {
    const result = blockedResult();
    const cells = costBreakdownText(result, 2026, 364);
    expect(cells[0]).toEqual(['Route', 'Service day', ...BREAKDOWN_COLUMNS.slice(1)]);
    // One Route row, then one row per service day of each Route, then the total row.
    const routeDayCount = result.routeRows.reduce((count, route) => count + route.days.length, 0);
    expect(cells).toHaveLength(result.routeRows.length + routeDayCount + 2);
    // The Route row says "All days" and leaves the four daily cells blank.
    const routeRow = cells[1]!;
    expect(routeRow[0]).toBe('Untitled route');
    expect(routeRow[1]).toBe('All days');
    expect(routeRow[2]).toBe(String(result.routeRows[0]!.days.reduce((total, day) => total + day.annualServiceDays, 0)));
    expect(routeRow.slice(5, 9)).toEqual(['', '', '', '']);
    const weekday = cells.find((row) => row[1] === 'Weekday');
    expect(weekday).toBeDefined();
    // A service-day row leaves the Route cell empty.
    expect(weekday![0]).toBe('');
    // A blocked basis shows the trips in its eligible Blocks and the block count.
    expect(weekday![2]).toBe('260');
    expect(weekday![3]).toMatch(/^\d[\d,]*$/);
    expect(weekday![4]).toBe(String(result.dailyRows.find((row) => row.serviceDayName === 'Weekday')!.eligibleBlockCount));
    // A blocked basis shows the running hours of those trips, and its revenue hours.
    expect(weekday![5]).toMatch(/^\d[\d,]*\.\d{2}$/);
    expect(weekday![6]).toMatch(/^\d[\d,]*\.\d{2}$/);
    expect(weekday![8]).toMatch(/^\$[\d,]+$/);
    const total = cells.at(-1)!;
    expect(total[0]).toBe('Total');
    expect(total[1]).toBe('');
    expect(total[2]).toBe('364');
    // The daily columns of the total row are blank, as on the screen.
    expect(total.slice(5, 9)).toEqual(['', '', '', '']);
    expect(total[11]).toMatch(/^\$[\d,]+$/);
  });

  it('shows the trip count and a dash for the block count for an estimated result', () => {
    const result = estimatedResult();
    const cells = costBreakdownText(result, 2026, 364);
    expect(cells[0]).toEqual(['Route', 'Service day', ...BREAKDOWN_COLUMNS.slice(1)]);
    expect(cells).toHaveLength(result.routeRows.length + result.routeRows.reduce((count, route) => count + route.days.length, 0) + 2);
    const weekday = cells.find((row) => row[1] === 'Weekday')!;
    expect(weekday[3]).toBe('1');
    expect(weekday[4]).toBe('—');
    expect(weekday[5]).toBe('8.00');
    const total = cells.at(-1)!;
    expect(total[3]).toBe(String(result.tripCount));
    expect(total[4]).toBe('—');
  });

  it('groups by service day: each day row has its daily values and is followed by its Route rows (Decision 0078)', () => {
    const result = estimatedResult();
    const byRoute = costBreakdownText(result, 2026, 364);
    const cells = costBreakdownText(result, 2026, 364, 'day');
    expect(cells[0]).toEqual(['Service day', 'Route', ...BREAKDOWN_COLUMNS.slice(1)]);
    // Header, then per service day a day row and one Route row (one Route here), then Total.
    expect(cells).toHaveLength(2 + result.dailyRows.length * 2);
    const weekday = cells.find((row) => row[0] === 'Weekday')!;
    expect(weekday[1]).toBe('All routes');
    expect(weekday[5]).toBe('8.00');
    // The day row's values equal the Route grouping's single Route on that day.
    const routeWeekday = byRoute.find((row) => row[1] === 'Weekday')!;
    expect(weekday.slice(2)).toEqual(routeWeekday.slice(2));
    const child = cells[cells.indexOf(weekday) + 1]!;
    expect(child.slice(0, 2)).toEqual(['', 'Untitled route']);
    expect(cells.at(-1)).toEqual(byRoute.at(-1));
  });
});
