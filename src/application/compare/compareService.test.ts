import { describe, expect, it } from 'vitest';
import type { ComparisonRow } from '../../domain/compare/types';
import type { CostingAssumptionsInput } from '../../domain/costing';
import type { CostBasis } from '../ports';
import { assumptionsRecord, directEstimate, EXAMPLE, exampleRecords, goldenRecords, goldenSide, memorySources, withScenarioCopy, type ReadCounts, type TestRecords } from './compareTestSupport';
import type { CompareProgress, CompareRequest, CompareSuccess, SideComputeInput } from './compareTypes';
import { CompareService } from './compareService';
import { createCompareEngine, type CompareEngine } from './compareWorkerClient';
import { computeSide } from './sideCompute';

const EXPECTED_ASSUMPTIONS: CostingAssumptionsInput = {
  enteredRate: 100, rateYear: 2027, sourceType: 'user', baseServiceYear: 2027, futureYearCount: 0, annualEscalation: 0.03,
  estimateFactors: { allDays: { layoverFraction: 0.182, deadheadFraction: 0.056 }, serviceDays: [] }, routeEstimateFactors: [],
};

/** A counting engine over the real computation, so a test can see which sides were costed. */
function countingEngine(): { engine: CompareEngine; inputs: SideComputeInput[] } {
  const inputs: SideComputeInput[] = [];
  return {
    inputs,
    engine: {
      computeSide: async (input, onProgress) => { inputs.push(input); return computeSide(input, onProgress); },
      dispose: () => undefined,
    },
  };
}

function serviceOf(records: TestRecords, options: { stamp?: () => string; counts?: ReadCounts } = {}) {
  const spy = countingEngine();
  const service = new CompareService(memorySources(records, options.counts), options.stamp ?? (() => '1'), () => spy.engine, () => '2026-11-22T00:00:00.000Z');
  return { service, spy };
}

const request = (records: TestRecords, overrides: Partial<CompareRequest> = {}): CompareRequest => ({
  baseline: goldenSide(records), proposed: goldenSide(records), day: 'weekday', rates: 'baseline', counts: 'baseline', ...overrides,
});

async function compare(service: CompareService, req: CompareRequest, onProgress?: (progress: CompareProgress) => void): Promise<CompareSuccess> {
  const outcome = await service.compare(req, onProgress);
  if (outcome.status !== 'ok') throw new Error(`Comparison failed: ${JSON.stringify(outcome.errors)}`);
  return outcome;
}

const rowOf = (outcome: CompareSuccess, side: 'baseline' | 'proposed', routeId: string | null): ComparisonRow =>
  outcome.comparison.rows.find((row) => (routeId === null ? row.unattributed : row.key.split(':')[side === 'baseline' ? 1 : 2] === routeId))!;

/** Plan V-D2: each side's per-Route revenue hours and first-year cost on a day equal what Costing itself returns. */
async function expectSideEqualsCosting(outcome: CompareSuccess, side: 'baseline' | 'proposed', records: TestRecords, scenarioId: string, basis: CostBasis, assumptions: CostingAssumptionsInput, dayName: string) {
  const direct = await directEstimate(records, scenarioId, basis, assumptions);
  expect(direct.routeRows.length).toBeGreaterThan(0);
  for (const route of direct.routeRows) {
    const day = route.days.find((candidate) => candidate.serviceDayName === dayName)!;
    const row = rowOf(outcome, side, route.routeId);
    const hours = day.revenueHoursPerDay ?? 0;
    // A row Costing has but the screen leaves out is an empty Unattributed day; every other row must be there.
    if (!row) { expect(route.routeId).toBeNull(); expect(hours).toBe(0); continue; }
    expect(row.revenueHours[side]).toBe(hours);
    expect(row.platformHours[side]).toBe(day.platformHoursPerDay);
    expect(row.cost[side]).toBe(day.yearCosts[0].annualCostUsd);
  }
}

describe('Comparison equals Costing (plan V-D2; never cut)', () => {
  it('worked example, both sides blocked: every Route\'s hours and first-year cost equal a direct Costing estimate', async () => {
    const records = exampleRecords();
    const { service } = serviceOf(records);
    const outcome = await compare(service, { baseline: EXAMPLE.baseline, proposed: EXAMPLE.proposed, day: 'weekday', rates: 'baseline', counts: 'baseline' });
    await expectSideEqualsCosting(outcome, 'baseline', records, 'scn-existing', { kind: 'blocked', blockingScenarioId: 'base-blocks' }, EXPECTED_ASSUMPTIONS, 'Weekday');
    await expectSideEqualsCosting(outcome, 'proposed', records, 'scn-redesign', { kind: 'blocked', blockingScenarioId: 'draft-blocks' }, EXPECTED_ASSUMPTIONS, 'Weekday');
    expect(outcome.sides.baseline.basis).toBe('blocked');
    // Matching and measures come from the V1 rules: R1 by GTFS id, R5 by short name, R2 discontinued, R3 new.
    expect(outcome.comparison.rows.map((row) => [row.name, row.status]).sort()).toEqual(expect.arrayContaining([['1 Main St', 'changed'], ['2 Crosstown', 'discontinued'], ['3 Airport', 'new'], ['5 Loop', 'unchanged']]));
    const main = outcome.comparison.rows.find((row) => row.name === '1 Main St')!;
    expect(main.trips).toMatchObject({ baseline: 7, proposed: 8, change: 1 });
    expect(main.revenueMiles).toMatchObject({ baseline: 42, proposed: 57 });
    // Peaks follow Blocking: the proposed blocks Y1 to Y3 overlap, and Y3 serves two Routes so it is Unattributed.
    expect(outcome.comparison.totals.peakVehicles).toMatchObject({ baseline: 2, proposed: 3 });
    expect(outcome.comparison.rows.find((row) => row.unattributed)!.peakVehicles).toMatchObject({ proposed: 1 });
  });

  it('worked example, Baseline unblocked ("None"): the estimated basis and "not blocked" peaks, equal to a direct estimate', async () => {
    const records = exampleRecords();
    const { service } = serviceOf(records);
    const outcome = await compare(service, { baseline: { ...EXAMPLE.baseline, blockingScenarioId: null }, proposed: EXAMPLE.proposed, day: 'weekday', rates: 'baseline', counts: 'baseline' });
    expect(outcome.sides.baseline.basis).toBe('estimated');
    expect(outcome.differences).toEqual([{ code: 'compare.basisDiffers', baseline: 'estimated', proposed: 'blocked' }]);
    await expectSideEqualsCosting(outcome, 'baseline', records, 'scn-existing', { kind: 'estimated', tripProfileId: 'profile-scn-existing' }, EXPECTED_ASSUMPTIONS, 'Weekday');
    await expectSideEqualsCosting(outcome, 'proposed', records, 'scn-redesign', { kind: 'blocked', blockingScenarioId: 'draft-blocks' }, EXPECTED_ASSUMPTIONS, 'Weekday');
    expect(outcome.comparison.totals.peakVehicles.baseline).toBeUndefined();
    expect(outcome.comparison.rows.every((row) => row.peakVehicles.baseline === undefined)).toBe(true);
  });

  it('Federal BRT against itself, blocked: equals Costing, every Route Unchanged and every change 0, on each day and Annual', async () => {
    const records = goldenRecords();
    const { service } = serviceOf(records);
    const days = records.serviceDays.map((day) => ({ key: day.kind, name: day.name }));
    for (const day of [...days.map((entry) => entry.key), 'annual']) {
      const outcome = await compare(service, request(records, { day }));
      expect(outcome.differences).toEqual([]);
      expect(outcome.comparison.rows.length).toBeGreaterThan(0);
      for (const row of outcome.comparison.rows) {
        expect(row.status).toBe('unchanged');
        for (const measure of [row.trips, row.revenueMiles, row.revenueHours, row.platformHours, row.peakVehicles, row.cost]) expect(measure.change ?? 0).toBe(0);
      }
      for (const measure of Object.values(outcome.comparison.totals)) expect(measure.change ?? 0).toBe(0);
    }
    const weekday = await compare(service, request(records));
    const scenarioId = records.scenarios[0].id;
    const assumptions: CostingAssumptionsInput = { ...EXPECTED_ASSUMPTIONS, rateYear: 2024, sourceType: 'ntd', baseServiceYear: 2026, futureYearCount: 2 };
    delete assumptions.estimateFactors;
    delete assumptions.routeEstimateFactors;
    await expectSideEqualsCosting(weekday, 'baseline', records, scenarioId, { kind: 'blocked', blockingScenarioId: goldenSide(records).blockingScenarioId! }, assumptions, 'Weekday');
    await expectSideEqualsCosting(weekday, 'proposed', records, scenarioId, { kind: 'blocked', blockingScenarioId: goldenSide(records).blockingScenarioId! }, assumptions, 'Weekday');
  });

  it('Federal BRT against itself, unblocked: equals the estimated Costing and shows no change', async () => {
    const records = goldenRecords();
    const { service } = serviceOf(records);
    const side = goldenSide(records, undefined, false);
    const outcome = await compare(service, { baseline: side, proposed: side, day: 'weekday', rates: 'baseline', counts: 'baseline' });
    const assumptions: CostingAssumptionsInput = { ...EXPECTED_ASSUMPTIONS, rateYear: 2024, sourceType: 'ntd', baseServiceYear: 2026, futureYearCount: 2 };
    await expectSideEqualsCosting(outcome, 'baseline', records, records.scenarios[0].id, { kind: 'estimated', tripProfileId: side.tripProfileId }, assumptions, 'Weekday');
    expect(outcome.comparison.rows.every((row) => row.status === 'unchanged' && (row.revenueHours.change ?? 0) === 0 && (row.cost.change ?? 0) === 0)).toBe(true);
  });

  it('times one comparison of the Federal BRT Scenario', async () => {
    const records = goldenRecords();
    const { service } = serviceOf(records);
    const copy = withScenarioCopy(records, records.scenarios[0].id, 'scn-copy');
    const { service: copyService } = serviceOf(copy);
    const started = performance.now();
    await compare(copyService, { baseline: goldenSide(copy, records.scenarios[0].id), proposed: goldenSide(copy, 'scn-copy'), day: 'annual', rates: 'baseline', counts: 'baseline' });
    const elapsed = performance.now() - started;
    console.info(`COMPARE-TIMING two Federal BRT sides, cold: ${elapsed.toFixed(0)} ms`);
    const second = performance.now();
    await compare(service, request(records));
    console.info(`COMPARE-TIMING Federal BRT against itself, cold: ${(performance.now() - second).toFixed(0)} ms`);
    expect(elapsed).toBeLessThan(30000);
  });
});

describe('Rate and count choices (Decision 0091 items 6 to 8)', () => {
  it('a copy with a different Weekday count shows cost changes under "Each side\'s own" and none under "Baseline\'s"', async () => {
    const base = goldenRecords();
    const baseId = base.scenarios[0].id;
    const records = withScenarioCopy(base, baseId, 'scn-copy', (copy) => { copy.serviceDays.find((day) => day.kind === 'weekday')!.annualServiceDays = 200; });
    const sides = { baseline: goldenSide(records, baseId), proposed: goldenSide(records, 'scn-copy') };
    const { service } = serviceOf(records);

    const own = await compare(service, { ...sides, day: 'weekday', rates: 'baseline', counts: 'own' });
    const weekdayRow = own.comparison.rows[0];
    expect(weekdayRow.cost.change).toBeLessThan(0);
    expect(own.comparison.totals.cost.change).toBeLessThan(0);
    const annual = await compare(service, { ...sides, day: 'annual', rates: 'baseline', counts: 'own' });
    expect(annual.comparison.totals.revenueHours.change).toBeLessThan(0);
    expect(annual.comparison.totals.trips.change).toBeLessThan(0);
    expect(own.differences).toEqual([expect.objectContaining({ code: 'compare.countsDiffer', applied: 'own', days: [expect.objectContaining({ key: 'weekday', baseline: base.serviceDays.find((day) => day.kind === 'weekday')!.annualServiceDays, proposed: 200 })] })]);

    const baselineCounts = await compare(service, { ...sides, day: 'weekday', rates: 'baseline', counts: 'baseline' });
    expect(baselineCounts.comparison.totals.cost.change).toBe(0);
    expect(baselineCounts.comparison.rows.every((row) => (row.cost.change ?? 0) === 0 && row.status === 'unchanged')).toBe(true);
    const annualBaseline = await compare(service, { ...sides, day: 'annual', rates: 'baseline', counts: 'baseline' });
    expect(Object.values(annualBaseline.comparison.totals).every((measure) => (measure.change ?? 0) === 0)).toBe(true);
    // The warning line still names the difference, and which side's count is in use.
    expect(baselineCounts.differences).toEqual([expect.objectContaining({ code: 'compare.countsDiffer', applied: 'baseline' })]);

    // "Proposed's" counts: the baseline takes the copy's 200, so again nothing differs.
    const proposedCounts = await compare(service, { ...sides, day: 'weekday', rates: 'baseline', counts: 'proposed' });
    expect(proposedCounts.comparison.totals.cost.change).toBe(0);
    // Equality with Costing under the counts in use: "Each side's own" costs the copy at 200 days, as a direct estimate of the copy does.
    const copyBasis: CostBasis = { kind: 'blocked', blockingScenarioId: sides.proposed.blockingScenarioId! };
    const goldenAssumptions: CostingAssumptionsInput = { enteredRate: 100, rateYear: 2024, sourceType: 'ntd', baseServiceYear: 2026, futureYearCount: 2, annualEscalation: 0.03 };
    const directCopy = await directEstimate(records, 'scn-copy', copyBasis, goldenAssumptions);
    const directDay = directCopy.routeRows[0].days.find((day) => day.serviceDayName === 'Weekday')!;
    expect(directDay.annualServiceDays).toBe(200);
    expect(own.comparison.rows[0].cost.proposed).toBe(directDay.yearCosts[0].annualCostUsd);
    expect(own.comparison.rows[0].revenueHours.proposed).toBe(directDay.revenueHoursPerDay);
    // The records read are not changed.
    expect(records.serviceDays.filter((day) => day.kind === 'weekday').map((day) => day.annualServiceDays).sort()).toEqual([200, base.serviceDays.find((day) => day.kind === 'weekday')!.annualServiceDays].sort());
  });

  it('a Route\'s own counts follow the count choice for a matched Route', async () => {
    const base = goldenRecords();
    const baseId = base.scenarios[0].id;
    const weekdayId = base.serviceDays.find((day) => day.kind === 'weekday')!.id;
    const records = withScenarioCopy(base, baseId, 'scn-copy', (copy) => { copy.routes[0].ownAnnualServiceDays = { enabled: true, countsByServiceDayId: { [weekdayId]: 62 } }; });
    const sides = { baseline: goldenSide(records, baseId), proposed: goldenSide(records, 'scn-copy') };
    const { service } = serviceOf(records);
    const own = await compare(service, { ...sides, day: 'weekday', rates: 'baseline', counts: 'own' });
    expect(own.comparison.totals.cost.change).toBeLessThan(0);
    expect(own.differences).toEqual([expect.objectContaining({ code: 'compare.countsDiffer', routes: [expect.objectContaining({ baseline: { enabled: false, byDay: {} }, proposed: { enabled: true, byDay: { weekday: 62 } } })] })]);
    const chosen = await compare(service, { ...sides, day: 'weekday', rates: 'baseline', counts: 'baseline' });
    expect(chosen.comparison.totals.cost.change).toBe(0);
  });

  it('the rate choice replaces the other side\'s rate; the estimate factors stay with their own side', async () => {
    const base = goldenRecords();
    const baseId = base.scenarios[0].id;
    const records = withScenarioCopy(base, baseId, 'scn-copy', (copy) => { copy.costingAssumptions[0].enteredRate = 150; });
    const sides = { baseline: goldenSide(records, baseId), proposed: goldenSide(records, 'scn-copy') };
    const { service } = serviceOf(records);
    const own = await compare(service, { ...sides, day: 'weekday', rates: 'own', counts: 'baseline' });
    expect(own.comparison.totals.cost.change).toBeGreaterThan(0);
    expect(own.comparison.totals.revenueHours.change).toBe(0);
    expect(own.differences).toEqual([expect.objectContaining({ code: 'compare.ratesDiffer', applied: 'own', baseline: expect.objectContaining({ enteredRate: 100 }), proposed: expect.objectContaining({ enteredRate: 150 }) })]);
    expect((await compare(service, { ...sides, day: 'weekday', rates: 'baseline', counts: 'baseline' })).comparison.totals.cost.change).toBe(0);
    const proposedRates = await compare(service, { ...sides, day: 'weekday', rates: 'proposed', counts: 'baseline' });
    expect(proposedRates.comparison.totals.cost.change).toBe(0);
    // Proposed's rate is used by both: each row's baseline cost is now the 150 figure.
    const direct = await directEstimate(records, baseId, { kind: 'blocked', blockingScenarioId: sides.baseline.blockingScenarioId! }, { enteredRate: 150, rateYear: 2024, sourceType: 'ntd', baseServiceYear: 2026, futureYearCount: 2, annualEscalation: 0.03 });
    expect(proposedRates.comparison.rows[0].cost.baseline).toBe(direct.routeRows[0].days.find((day) => day.serviceDayName === 'Weekday')!.yearCosts[0].annualCostUsd);
  });

  it('Estimate factors stay with their own side under a rate choice', async () => {
    const base = goldenRecords();
    const baseId = base.scenarios[0].id;
    const records = withScenarioCopy(base, baseId, 'scn-copy', (copy) => {
      copy.costingAssumptions[0].tripProfileEstimateFactors = [{ tripProfileId: copy.tripProfiles[0].id, factors: { allDays: { layoverFraction: 0.3, deadheadFraction: 0.056 }, serviceDays: [] } }];
    });
    const { service } = serviceOf(records);
    const outcome = await compare(service, { baseline: goldenSide(records, baseId, false), proposed: goldenSide(records, 'scn-copy', false), day: 'weekday', rates: 'baseline', counts: 'baseline' });
    // The proposed side's larger layover gives it more revenue hours, though both use the baseline's rate.
    expect(outcome.comparison.totals.revenueHours.change).toBeGreaterThan(0);
    const direct = await directEstimate(records, 'scn-copy', { kind: 'estimated', tripProfileId: records.tripProfiles.find((profile) => profile.scenarioId === 'scn-copy')!.id }, { ...EXPECTED_ASSUMPTIONS, rateYear: 2024, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 2, estimateFactors: { allDays: { layoverFraction: 0.3, deadheadFraction: 0.056 }, serviceDays: [] } });
    expect(outcome.comparison.rows[0].revenueHours.proposed).toBe(direct.routeRows[0].days.find((day) => day.serviceDayName === 'Weekday')!.revenueHoursPerDay);
  });
});

describe('Caching (Decision 0091 item 2 of card V2)', () => {
  it('changing the day, a menu that moves nothing, or one side recomputes only what changed', async () => {
    const base = goldenRecords();
    const baseId = base.scenarios[0].id;
    const records = withScenarioCopy(base, baseId, 'scn-copy');
    const counts: ReadCounts = { listTrips: 0, listBlockingBlocks: 0 };
    const { service, spy } = serviceOf(records, { counts });
    const sides = { baseline: goldenSide(records, baseId), proposed: goldenSide(records, 'scn-copy') };

    await compare(service, { ...sides, day: 'weekday', rates: 'baseline', counts: 'baseline' });
    expect(spy.inputs.map((input) => input.side)).toEqual(['baseline', 'proposed']);
    expect(counts.listTrips).toBe(2);

    // Another day, and menus that change no value reaching either side (the two assumptions and counts are equal): nothing is read or costed again.
    await compare(service, { ...sides, day: 'saturday', rates: 'baseline', counts: 'baseline' });
    await compare(service, { ...sides, day: 'annual', rates: 'own', counts: 'own' });
    await compare(service, { ...sides, day: 'weekday', rates: 'proposed', counts: 'proposed' });
    expect(spy.inputs).toHaveLength(2);
    expect(counts.listTrips).toBe(2);

    // One side changes (the Proposed becomes unblocked): only that side is costed.
    await compare(service, { ...sides, proposed: goldenSide(records, 'scn-copy', false), day: 'weekday', rates: 'baseline', counts: 'baseline' });
    expect(spy.inputs.map((input) => input.side)).toEqual(['baseline', 'proposed', 'proposed']);
    expect(spy.inputs[2].basis.kind).toBe('estimated');
    expect(counts.listTrips).toBe(3);

    // An override that reaches a side changes only that side's key: the Proposed's rate now follows the Baseline's, which differs.
    records.costingAssumptions.find((item) => item.scenarioId === 'scn-copy')!.enteredRate = 130;
    await compare(service, { ...sides, proposed: goldenSide(records, 'scn-copy', false), day: 'weekday', rates: 'baseline', counts: 'baseline' });
    // The same stamp: the edit above is not a save, so the cached side stays. A new stamp is a save.
    expect(spy.inputs).toHaveLength(3);
  });

  it('a save (a new stamp) drops every cached side', async () => {
    const records = goldenRecords();
    let stamp = '1';
    const { service, spy } = serviceOf(records, { stamp: () => stamp });
    await compare(service, request(records));
    // Both sides are one and the same side: costed once.
    expect(spy.inputs).toHaveLength(1);
    await compare(service, request(records, { day: 'saturday' }));
    expect(spy.inputs).toHaveLength(1);
    stamp = '2';
    await compare(service, request(records));
    expect(spy.inputs).toHaveLength(2);
  });

  it('clearCache drops every cached side even when the save stamp is the same (a write made in another tab)', async () => {
    const records = goldenRecords();
    const counts: ReadCounts = { listTrips: 0, listBlockingBlocks: 0 };
    const { service, spy } = serviceOf(records, { stamp: () => '1', counts });
    await compare(service, request(records));
    await compare(service, request(records, { day: 'saturday' }));
    expect(spy.inputs).toHaveLength(1);
    expect(counts.listTrips).toBe(1);
    service.clearCache();
    await compare(service, request(records));
    expect(spy.inputs).toHaveLength(2);
    expect(counts.listTrips).toBe(2);
  });

  it('an overridden side is keyed on the override: Proposed\'s rate change recosts the Baseline only when the Baseline uses it', async () => {
    const base = goldenRecords();
    const baseId = base.scenarios[0].id;
    const records = withScenarioCopy(base, baseId, 'scn-copy');
    const { service, spy } = serviceOf(records);
    const sides = { baseline: goldenSide(records, baseId), proposed: goldenSide(records, 'scn-copy') };
    await compare(service, { ...sides, day: 'weekday', rates: 'baseline', counts: 'baseline' });
    expect(spy.inputs).toHaveLength(2);
    records.costingAssumptions.find((item) => item.scenarioId === 'scn-copy')!.enteredRate = 130;
    // The Baseline's rate is used by both: the Baseline is not costed again, and the Proposed already was at 100.
    await compare(service, { ...sides, day: 'weekday', rates: 'baseline', counts: 'baseline' });
    expect(spy.inputs).toHaveLength(2);
    // Each side's own: now the Proposed uses 130 and is costed; the Baseline still is not.
    await compare(service, { ...sides, day: 'weekday', rates: 'own', counts: 'baseline' });
    expect(spy.inputs.map((input) => input.side)).toEqual(['baseline', 'proposed', 'proposed']);
  });
});

describe('Errors (Costing findings, not throws)', () => {
  it('a side with no rate returns Costing\'s findings as that side\'s error', async () => {
    const records = goldenRecords();
    const baseId = records.scenarios[0].id;
    const withCopy = withScenarioCopy(records, baseId, 'scn-copy', (copy) => { copy.costingAssumptions = []; });
    const { service } = serviceOf(withCopy);
    const outcome = await service.compare({ baseline: goldenSide(withCopy, baseId), proposed: goldenSide(withCopy, 'scn-copy'), day: 'weekday', rates: 'own', counts: 'baseline' });
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.errors).toEqual([expect.objectContaining({ side: 'proposed', code: 'compare.costingNoEstimate', detail: 'rateMissing', findings: expect.arrayContaining([expect.objectContaining({ ruleId: 'costing.rateMissing' })]) })]);
    // With the baseline's rate used by both, the proposed side can be costed.
    const fixed = await service.compare({ baseline: goldenSide(withCopy, baseId), proposed: goldenSide(withCopy, 'scn-copy'), day: 'weekday', rates: 'baseline', counts: 'baseline' });
    expect(fixed.status).toBe('ok');
  });

  it('a side whose assumptions are invalid returns the errors of Costing', async () => {
    const records = goldenRecords();
    records.costingAssumptions[0].enteredRate = -5;
    const { service } = serviceOf(records);
    const outcome = await service.compare(request(records));
    expect(outcome.status).toBe('error');
    if (outcome.status !== 'error') return;
    expect(outcome.errors[0]).toMatchObject({ side: 'baseline', code: 'compare.costingInvalid' });
    expect(outcome.errors[0].findings.some((finding) => finding.ruleId === 'costing.rateInvalid' && finding.severity === 'error')).toBe(true);
  });

  it('a missing Scenario, a Blocking scenario of another Trip profile, and an unknown day are errors', async () => {
    const records = goldenRecords();
    const { service } = serviceOf(records);
    const side = goldenSide(records);
    const gone = await service.compare(request(records, { proposed: { ...side, scenarioId: 'nope' } }));
    expect(gone).toMatchObject({ status: 'error', errors: [{ side: 'proposed', code: 'compare.sideMissing' }] });
    const wrong = await service.compare(request(records, { baseline: { ...side, blockingScenarioId: 'nope' } }));
    expect(wrong).toMatchObject({ status: 'error', errors: [{ side: 'baseline', code: 'compare.sideMissing' }] });
    const day = await service.compare(request(records, { day: 'custom:Festival' }));
    expect(day).toMatchObject({ status: 'error', errors: [{ code: 'compare.dayMissing', detail: 'custom:Festival' }] });
  });
});

describe('Progress', () => {
  it('reports reading, then costing and Route measures for each side, then comparing', async () => {
    const records = exampleRecords();
    const { service } = serviceOf(records);
    const seen: CompareProgress[] = [];
    await compare(service, { baseline: EXAMPLE.baseline, proposed: EXAMPLE.proposed, day: 'weekday', rates: 'baseline', counts: 'baseline' }, (progress) => seen.push(progress));
    const messages = seen.map((progress) => progress.message);
    expect(messages).toContain('Costing baseline…');
    expect(messages).toContain('Costing proposed…');
    expect(messages).toContain('Measuring baseline… 3 of 3 routes');
    expect(messages).toContain('Measuring proposed… 1 of 3 routes');
    expect(messages[messages.length - 1]).toBe('Comparing…');
    const stages = seen.map((progress) => progress.stage);
    expect(stages.indexOf('reading')).toBe(0);
    expect(stages.lastIndexOf('reading')).toBeLessThan(stages.indexOf('costing'));
    expect(stages.indexOf('costing')).toBeLessThan(stages.indexOf('measuring'));
    expect(seen.filter((progress) => progress.stage === 'measuring' && progress.side === 'baseline').map((progress) => progress.done)).toEqual([1, 2, 3]);
  });

  it('is unchanged when the engine is the real one with no worker (main-thread fallback)', async () => {
    const records = exampleRecords();
    const service = new CompareService(memorySources(records), () => '1', () => createCompareEngine(() => undefined));
    const seen: CompareProgress[] = [];
    const outcome = await compare(service, { baseline: EXAMPLE.baseline, proposed: EXAMPLE.proposed, day: 'annual', rates: 'baseline', counts: 'baseline' }, (progress) => seen.push(progress));
    expect(outcome.comparison.rows.length).toBeGreaterThan(0);
    expect(seen.some((progress) => progress.message === 'Costing baseline…')).toBe(true);
    // Annual: the figures are weighted by each day's count and the peak names its day.
    expect(outcome.comparison.totals.peakVehicles.dayName).toBeDefined();
  });
});
