// Phase 2 review reproduction tests: tasks 2.9 (costing) and 2.10 (golden-dataset reconciliation).
// 2.10 recomputes per-day Revenue and Platform hours for every service day directly from the raw backup JSON in integer seconds,
// using a different formulation from summarizeBlock (Block span minus between-Trip deadhead; platform = span plus boundary offsets),
// then diffs against summarizeBlock + calculateCosting. It also re-implements the cost formula independently.
// It additionally checks lead L-22 by re-propagating every golden Trip with its assigned Runtime profile (Decision 0030 inference).
// 2.9 covers the phase-05-costing.md numeric rules. Backs finding 2-013 (hour totals accumulated in floating hours break the
// half-away-from-zero tie rule at whole-number display). Tests named "DEFECT ..." assert current defective behaviour.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importProjectJson } from '../../../src/persistence/backup';
import { summarizeBlock } from '../../../src/domain/blocking';
import { calculateCosting, roundCostingDisplay, type CostingAssumptionsInput, type CostingCalculationInput } from '../../../src/domain/costing';
import { propagatePatternTimes } from '../../../src/domain/runtime';
import type { BlockingBlock } from '../../../src/domain/types';

const BACKUP = fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url));
const raw = JSON.parse(readFileSync(BACKUP, 'utf8'));
const snap = importProjectJson(readFileSync(BACKUP, 'utf8'));
const assumptions: CostingAssumptionsInput = { enteredRate: 150, rateYear: 2022, sourceType: 'ntd', baseServiceYear: 2025, futureYearCount: 10, annualEscalation: 0.03 };

function domainInput(overrides: Partial<CostingCalculationInput> = {}): CostingCalculationInput {
  const scenario = snap.scenarios[0]; const blockingScenario = snap.blockingScenarios![0];
  const tripProfile = snap.tripProfiles!.find((profile) => profile.id === blockingScenario.tripProfileId)!;
  const trips = snap.trips.filter((trip) => trip.tripProfileId === tripProfile.id);
  const blocks = snap.blocks as BlockingBlock[];
  const blockSummaries = blocks.map((block) => summarizeBlock(block, { scenario, blockingScenario, trips, patterns: snap.patterns }));
  return { scenario, serviceDays: snap.serviceDays, blockingScenario, tripProfile, trips, blocks, blockSummaries, assumptions, ...overrides };
}

/** Independent computation from raw JSON (no app code): integer seconds per Block. */
function independent() {
  const tripById = new Map<string, any>(raw.trips.map((trip: any) => [trip.id, trip]));
  const patternById = new Map<string, any>(raw.patterns.map((pattern: any) => [pattern.id, pattern]));
  const perDay = new Map<string, { revenue: number; platform: number; running: number; blocks: number }>();
  const problems: string[] = [];
  for (const block of raw.blocks) {
    const acts = [...block.activities].sort((a: any, b: any) => a.sequence - b.sequence);
    const revenue = acts.filter((a: any) => a.type === 'revenueTrip').map((a: any) => tripById.get(a.tripId));
    const stops = (trip: any) => [...trip.stopTimes].sort((a: any, b: any) => a.sequence - b.sequence);
    const first = stops(revenue[0])[0].time; const last = stops(revenue.at(-1)).at(-1).time;
    let running = 0; let deadhead = 0;
    revenue.forEach((trip: any, index: number) => {
      const s = stops(trip); running += s.at(-1).time - s[0].time;
      if (index > 0) {
        const prev = revenue[index - 1]; const gap = s[0].time - stops(prev).at(-1).time;
        const prevEnd = patternById.get(prev.patternId).points.at(-1).nodeId; const nextStart = patternById.get(trip.patternId).points[0].nodeId;
        if (gap < 0) problems.push(`${block.label}: overlap`);
        if (prevEnd !== nextStart) problems.push(`${block.label}: terminal mismatch without deadhead`);
      }
    });
    for (const a of acts) if (a.type === 'deadhead') deadhead += a.minutesAfterPreviousTrip * 60;
    const out = acts.find((a: any) => a.type === 'pullOut'); const inn = acts.find((a: any) => a.type === 'pullIn');
    const revenueSeconds = (last - first) - deadhead; // span minus between-Trip deadhead == running + layover when gaps are non-negative
    const platformSeconds = (last + inn.minutesAfterLastTrip * 60) - (first - out.minutesBeforeFirstTrip * 60);
    const row = perDay.get(block.serviceDayId) ?? { revenue: 0, platform: 0, running: 0, blocks: 0 };
    row.revenue += revenueSeconds; row.platform += platformSeconds; row.running += running; row.blocks += 1;
    perDay.set(block.serviceDayId, row);
  }
  return { perDay, problems };
}

describe('2.10 golden-dataset reconciliation (independent integer-second recomputation)', () => {
  it('per-day Revenue and Platform hours match the domain within 1e-9 h for every service day', () => {
    const { perDay, problems } = independent();
    expect(problems).toEqual([]);
    const result = calculateCosting(domainInput());
    expect(result.state).toBe('complete');
    const table = snap.serviceDays.map((day) => {
      const mine = perDay.get(day.id)!; const row = result.dailyRows.find((item) => item.serviceDayId === day.id)!;
      return { day: day.name, blocks: mine.blocks, revenueIndependent: mine.revenue / 3600, revenueDomain: row.revenueHoursPerDay, platformIndependent: mine.platform / 3600, platformDomain: row.platformHoursPerDay, runningIndependent: mine.running / 3600 };
    });
    // Printed for the phase-2 findings file.
    console.log(JSON.stringify(table));
    for (const row of table) {
      expect(Math.abs(row.revenueIndependent - row.revenueDomain)).toBeLessThan(1e-9);
      expect(Math.abs(row.platformIndependent - row.platformDomain)).toBeLessThan(1e-9);
    }
    const weekday = table.find((row) => row.day === 'Weekday')!;
    expect(weekday.revenueIndependent).toBeCloseTo(311.591667, 6);
    expect(weekday.platformIndependent).toBeCloseTo(329.591667, 6);
  });
  it('annual cost re-implemented independently matches the domain for the base year and ten future years', () => {
    const { perDay } = independent();
    const result = calculateCosting(domainInput());
    expect(result.yearRows).toHaveLength(11);
    for (const year of result.yearRows) {
      const rate = 150 * (1.03 ** (year.serviceYear - 2022));
      const annual = snap.serviceDays.reduce((sum, day) => sum + (perDay.get(day.id)!.revenue / 3600) * day.annualServiceDays * rate, 0);
      expect(Math.abs(year.appliedRateUsdPerRevenueHour - rate) / rate).toBeLessThan(1e-12);
      expect(Math.abs(year.annualCostUsd - annual)).toBeLessThan(1e-6);
    }
    console.log(JSON.stringify(result.yearRows.slice(0, 2).map((row) => ({ year: row.serviceYear, rate: row.appliedRateUsdPerRevenueHour, annualRevenueHours: row.annualRevenueHours, annualCostUsd: row.annualCostUsd }))));
  });
  it('L-22: every golden Trip reproduces from its assigned Runtime profile (no legacy-inferred staleness)', () => {
    const patternById = new Map(snap.patterns.map((pattern) => [pattern.id, pattern]));
    const profileById = new Map(snap.runtimeProfiles.map((profile) => [profile.id, profile]));
    let mismatches = 0;
    for (const trip of snap.trips) {
      const assignment = snap.runtimeAssignments.find((item) => item.patternId === trip.patternId && item.serviceDayId === trip.serviceDayId)!;
      const result = propagatePatternTimes(patternById.get(trip.patternId)!, trip.stopTimes[0].time, profileById.get(assignment.runtimeProfileId)!);
      if ('finding' in result || result.stopTimes.some((point, index) => point.time !== trip.stopTimes[index].time)) mismatches += 1;
    }
    expect(mismatches).toBe(0);
  });
});

describe('2.9 costing rules (phase-05-costing.md Pure calculation contract)', () => {
  const run = (patch: Partial<CostingAssumptionsInput>, overrides: Partial<CostingCalculationInput> = {}) => calculateCosting(domainInput({ assumptions: { ...assumptions, ...patch }, ...overrides }));
  it('negative escalation above -100% is accepted; -100% and below, NaN and Infinity are rejected', () => {
    const half = run({ annualEscalation: -0.5, futureYearCount: 1 });
    expect(half.state).toBe('complete');
    expect(half.yearRows.map((row) => row.appliedRateUsdPerRevenueHour)).toEqual([150 * 0.5 ** 3, 150 * 0.5 ** 4]);
    for (const annualEscalation of [-1, -1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(run({ annualEscalation }).state).toBe('invalid');
    expect(run({ annualEscalation: -0.9999 }).state).toBe('complete');
  });
  it('rate year after base year is invalid; equal is valid with the unadjusted rate', () => {
    expect(run({ rateYear: 2026 }).findings.map((item) => item.code)).toContain('costing.rateYearAfterBaseServiceYear');
    expect(run({ rateYear: 2025, futureYearCount: 0 }).yearRows[0].appliedRateUsdPerRevenueHour).toBe(150);
  });
  it('horizon 0..10 accepted; 11 and fractional rejected', () => {
    expect(run({ futureYearCount: 10 }).yearRows).toHaveLength(11);
    expect(run({ futureYearCount: 11 }).state).toBe('invalid');
    expect(run({ futureYearCount: 1.5 }).state).toBe('invalid');
  });
  it('zero rate is a $0 estimate; absent rate is a no-estimate state with quantities; negative and non-finite rates are invalid', () => {
    const zero = run({ enteredRate: 0 });
    expect(zero.state).toBe('complete'); expect(zero.yearRows[0].annualCostUsd).toBe(0);
    const absent = run({ enteredRate: undefined });
    expect([absent.state, absent.noEstimateReason, absent.dailyRows.length, absent.yearRows.length]).toEqual(['noEstimate', 'rateMissing', 4, 0]);
    for (const enteredRate of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(run({ enteredRate }).state).toBe('invalid');
  });
  it('service-day counts: 365 accepted, 366 invalid, below 365 not scaled, zero-count day shows quantities but adds no cost', () => {
    const days = (counts: number[]) => snap.serviceDays.map((day, index) => ({ ...day, annualServiceDays: counts[index] }));
    expect(run({}, { serviceDays: days([255, 52, 52, 6]) }).state).toBe('complete');
    expect(run({}, { serviceDays: days([256, 52, 52, 6]) }).findings.map((item) => item.code)).toContain('costing.annualServiceDaysExceed365');
    const low = run({ futureYearCount: 0 }, { serviceDays: days([100, 0, 0, 0]) });
    const weekday = low.dailyRows.find((row) => row.serviceDayKind === 'weekday')!;
    expect(weekday.annualRevenueHours).toBeCloseTo(weekday.revenueHoursPerDay * 100, 9);
    const saturday = low.dailyRows.find((row) => row.serviceDayKind === 'saturday')!;
    expect(saturday.revenueHoursPerDay).toBeGreaterThan(0); expect(saturday.yearCosts[0].annualCostUsd).toBe(0);
  });
  it('no eligible Block is a no-estimate state, not $0', () => {
    const result = run({}, { blocks: [], blockSummaries: [] });
    expect([result.state, result.noEstimateReason, result.yearRows.length]).toEqual(['noEstimate', 'noEligibleBlocks', 0]);
  });
  it('totals are calculated before rounding; rounding is half away from zero at 2 and 4 decimals', () => {
    const result = run({ futureYearCount: 0 });
    const year = result.yearRows[0];
    const sumOfUnrounded = result.dailyRows.reduce((sum, row) => sum + row.yearCosts[0].annualCostUsd, 0);
    expect(year.annualCostUsd).toBe(sumOfUnrounded);
    expect([roundCostingDisplay(0.125, 2), roundCostingDisplay(1.005, 2), roundCostingDisplay(-1.005, 2), roundCostingDisplay(2.00005, 4), roundCostingDisplay(-2.00005, 4), roundCostingDisplay(0.00004999, 4), roundCostingDisplay(1e-7, 4), roundCostingDisplay(123456789.125, 2)])
      .toEqual([0.13, 1.01, -1.01, 2.0001, -2.0001, 0, 0, 123456789.13]);
  });
  it('a partial estimate results from one unassigned Trip even when its day count is zero', () => {
    const extra = { ...snap.trips.find((trip) => snap.serviceDays.find((day) => day.id === trip.serviceDayId)!.name === 'Holiday')!, id: 'unassigned-extra' };
    const days = snap.serviceDays.map((day) => ({ ...day, annualServiceDays: day.name === 'Holiday' ? 0 : day.annualServiceDays }));
    const result = run({}, { trips: [...domainInput().trips, extra], serviceDays: days });
    expect(result.state).toBe('partial'); expect(result.unassignedTripCount).toBe(1);
  });
  // 2-013. phase-05-costing.md: "Keep full numeric precision through all calculations and totals ... exact half-unit ties rounded away
  // from zero"; the Costing workspace shows hours as whole numbers (src/ui/CostingWorkspace.tsx:58). Expected: 17 Blocks whose
  // integer-second Revenue time totals exactly 266:30:00 display as 267 h. Actual: per-Block hours are summed as floats, the day total is
  // 266.49999999999994, and the display rounds it to 266.
  it('DEFECT 2-013: a day total of exactly 266.5 Revenue hours is accumulated as 266.49999999999994 and displays as 266', () => {
    const seconds = [67770, 66750, 71370, 56040, 59880, 57060, 50460, 50910, 56130, 54450, 56100, 51240, 45150, 58830, 44010, 57600, 55650];
    expect(seconds.reduce((sum, value) => sum + value, 0)).toBe(266.5 * 3600);
    const base = domainInput();
    const weekday = base.serviceDays.find((day) => day.name === 'Weekday')!;
    const trips = seconds.map((_, index) => ({ ...base.trips[0], id: `x${index}`, serviceDayId: weekday.id }));
    const blocks: BlockingBlock[] = seconds.map((_, index) => ({ ...(base.blocks[0] as BlockingBlock), id: `xb${index}`, serviceDayId: weekday.id, activities: [
      { id: `xb${index}-out`, type: 'pullOut', sequence: 0, startTime: 0, endTime: 0, toNodeId: 'n' },
      { id: `xb${index}-r`, type: 'revenueTrip', sequence: 1, tripId: `x${index}` },
      { id: `xb${index}-in`, type: 'pullIn', sequence: 2, startTime: 1, endTime: 1, fromNodeId: 'n' },
    ] }));
    const blockSummaries = seconds.map((value, index) => ({ blockId: `xb${index}`, revenueHours: value / 3600, runningHours: value / 3600, platformHours: value / 3600, deadheadHours: 0, layoverHours: 0, status: 'complete' as const, complete: true, valid: true, findings: [], connections: [], activityTimings: [{ activityId: `xb${index}-out`, startTime: 0, endTime: 0 }, { activityId: `xb${index}-in`, startTime: 1, endTime: 1 }] }));
    const result = calculateCosting({ ...base, trips, blocks, blockSummaries });
    const row = result.dailyRows.find((item) => item.serviceDayId === weekday.id)!;
    expect(row.revenueHoursPerDay).toBe(266.49999999999994);
    expect(roundCostingDisplay(row.revenueHoursPerDay, 0)).toBe(266);
    expect(roundCostingDisplay(266.5, 0)).toBe(267);
  });
});
