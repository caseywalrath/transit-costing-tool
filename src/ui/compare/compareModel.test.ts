import { describe, expect, it } from 'vitest';
import type { CompareDifference, CompareError } from '../../application/compare/compareTypes';
import { buildComparison } from '../../domain/compare/buildComparison';
import { baselineSide, prepareComparison, proposedSide } from '../../domain/compare/compareFixture';
import type { CostingFinding } from '../../domain/costing';
import {
  arrangeRows, barFraction, chooseDay, dayLabel, differenceLines, errorLines, foldedSummary, formatChange, formatHeadway, formatMeasure, formatPercentChange, fromTo, headwayCell, peakMissing,
  requestKey, resolveSide, resolveSides, sideLabel, spanChange, totalsTiles, warningLines, type CompareScenarioChoice, type SideDefaults,
} from './compareModel';

const scenario = (id: string, profiles: string[], blocking: Array<[string, string]> = []): CompareScenarioChoice => ({
  id, name: id.toUpperCase(), serviceDays: [], routes: [],
  tripProfiles: profiles.map((profile) => ({ id: profile, name: profile })),
  blockingScenarios: blocking.map(([blockId, profile]) => ({ id: blockId, name: blockId, tripProfileId: profile })),
});

const defaults = (overrides: Partial<SideDefaults> = {}): SideDefaults => ({ appScenarioId: 'a', appTripProfileId: 'a2', rememberedBlocking: () => ({}), ...overrides });
const choices = [scenario('a', ['a1', 'a2'], [['ab1', 'a1'], ['ab2', 'a2']]), scenario('b', ['b1'], [['bb1', 'b1']]), scenario('c', ['c1'])];

describe('resolveSides: first open (card V4 item 2)', () => {
  it('opens Baseline on the app\'s Scenario and Trip profile, and Proposed on the first other Scenario', () => {
    expect(resolveSides(choices, {}, defaults())).toEqual({
      baseline: { scenarioId: 'a', tripProfileId: 'a2', blockingScenarioId: 'ab2' },
      proposed: { scenarioId: 'b', tripProfileId: 'b1', blockingScenarioId: 'bb1' },
    });
  });
  it('opens both sides on the same Scenario when it is the only one', () => {
    const only = [scenario('a', ['a1'], [['ab1', 'a1']])];
    const sides = resolveSides(only, {}, defaults({ appTripProfileId: 'a1' }))!;
    expect(sides.baseline).toEqual(sides.proposed);
  });
  it('opens a side with no Blocking scenario on "None"', () => {
    expect(resolveSide(choices, undefined, 'c', defaults())).toEqual({ scenarioId: 'c', tripProfileId: 'c1', blockingScenarioId: null });
  });
  it('uses the Blocking scenario remembered for the Trip profile (Decision 0081), when it still exists', () => {
    expect(resolveSide(choices, undefined, 'a', defaults({ appTripProfileId: 'a1', rememberedBlocking: () => ({ a1: 'ab1' }) }))?.blockingScenarioId).toBe('ab1');
    expect(resolveSide(choices, undefined, 'a', defaults({ appTripProfileId: 'a1', rememberedBlocking: () => ({ a1: 'gone' }) }))?.blockingScenarioId).toBe('ab1');
  });
  it('has nothing to open without a Scenario or a Trip profile', () => {
    expect(resolveSides([], {}, defaults())).toBeUndefined();
    expect(resolveSides([scenario('a', [])], {}, defaults())).toBeUndefined();
  });
});

describe('resolveSides: remembered choices (card V4 item 9)', () => {
  it('uses what is remembered, "None" included', () => {
    expect(resolveSide(choices, { scenarioId: 'a', tripProfileId: 'a1', blockingScenarioId: null }, 'b', defaults())).toEqual({ scenarioId: 'a', tripProfileId: 'a1', blockingScenarioId: null });
    expect(resolveSide(choices, { scenarioId: 'a', tripProfileId: 'a1', blockingScenarioId: 'ab1' }, 'b', defaults())).toEqual({ scenarioId: 'a', tripProfileId: 'a1', blockingScenarioId: 'ab1' });
  });
  it('puts the whole side back on the first-open rule when the Scenario is gone', () => {
    expect(resolveSide(choices, { scenarioId: 'gone', tripProfileId: 'a1', blockingScenarioId: null }, 'b', defaults())).toEqual({ scenarioId: 'b', tripProfileId: 'b1', blockingScenarioId: 'bb1' });
  });
  it('replaces only the Trip profile or Blocking scenario that is gone', () => {
    expect(resolveSide(choices, { scenarioId: 'a', tripProfileId: 'gone', blockingScenarioId: 'gone' }, 'b', defaults())).toEqual({ scenarioId: 'a', tripProfileId: 'a2', blockingScenarioId: 'ab2' });
    // A Blocking scenario of another Trip profile of the Scenario does not fit this one.
    expect(resolveSide(choices, { scenarioId: 'a', tripProfileId: 'a1', blockingScenarioId: 'ab2' }, 'b', defaults())?.blockingScenarioId).toBe('ab1');
  });
});

describe('days', () => {
  const pairs = [{ key: 'weekday', name: 'Weekday' }, { key: 'saturday', name: 'Saturday' }, { key: 'custom:holiday 2', name: 'Holiday 2' }];
  it('keeps a remembered day while both sides have it, else the Weekday, else the first', () => {
    expect(chooseDay(pairs, 'saturday')).toBe('saturday');
    expect(chooseDay(pairs, 'annual')).toBe('annual');
    expect(chooseDay(pairs, 'sunday')).toBe('weekday');
    expect(chooseDay(pairs, undefined)).toBe('weekday');
    expect(chooseDay(pairs.slice(1), undefined)).toBe('saturday');
    expect(chooseDay([], 'annual')).toBe('annual');
  });
  it('names a day', () => {
    expect(dayLabel('annual', pairs)).toBe('Annual');
    expect(dayLabel('custom:holiday 2', pairs)).toBe('Holiday 2');
  });
  it('labels a side for the CSV heading', () => {
    expect(sideLabel(choices, { scenarioId: 'a', tripProfileId: 'a1', blockingScenarioId: 'ab1' })).toBe('A / a1 / ab1');
    expect(sideLabel(choices, { scenarioId: 'c', tripProfileId: 'c1', blockingScenarioId: null })).toBe('C / c1 / No blocking scenario');
  });
  it('makes one request key for equal requests', () => {
    const side = { scenarioId: 'a', tripProfileId: 'a1', blockingScenarioId: null };
    expect(requestKey({ baseline: side, proposed: side, day: 'weekday', rates: 'baseline', counts: 'own' })).toBe(requestKey({ baseline: side, proposed: side, day: 'weekday', rates: 'baseline', counts: 'own' }));
  });
});

describe('figures (Decision 0091 item 14)', () => {
  it('writes trips and vehicles whole, miles and hours with one decimal, cost in dollars', () => {
    expect(formatMeasure('whole', 2311)).toBe('2,311');
    expect(formatMeasure('miles', 12507)).toBe('12,507.0');
    expect(formatMeasure('hours', 3.34)).toBe('3.3');
    expect(formatMeasure('money', 104165)).toBe('$104,165');
    expect(formatMeasure('whole', undefined)).toBe('—');
  });
  it('writes a million dollars or more in millions in tiles only', () => {
    expect(formatMeasure('money', 253_700_000, { tile: true })).toBe('$253.7M');
    expect(formatMeasure('money', 253_700_000)).toBe('$253,700,000');
    expect(formatMeasure('money', 104165, { tile: true })).toBe('$104,165');
    expect(formatChange('money', 7_600_000, { tile: true }).text).toBe('+$7.6M');
    expect(formatChange('money', 5_470_000).text).toBe('+$5.47M');
    expect(formatChange('money', -17_570).text).toBe('−$17,570');
  });
  it('signs a change and gives its tone; a change that rounds to nothing has no sign', () => {
    expect(formatChange('whole', 1)).toEqual({ text: '+1', tone: 'up' });
    expect(formatChange('hours', -0.4)).toEqual({ text: '−0.4', tone: 'down' });
    expect(formatChange('hours', 0.01)).toEqual({ text: '0.0', tone: 'same' });
    expect(formatChange('whole', 0)).toEqual({ text: '0', tone: 'same' });
    expect(formatChange('whole', undefined)).toEqual({ text: '—', tone: 'same' });
  });
  it('writes a percent with one decimal and no percent as a dash', () => {
    expect(formatPercentChange(16.9)).toBe('+16.9%');
    expect(formatPercentChange(-11.4)).toBe('−11.4%');
    expect(formatPercentChange(0)).toBe('0.0%');
    expect(formatPercentChange(undefined)).toBe('—');
  });
  it('writes "from → to" with a dash, or the reason, for a side with no figure', () => {
    expect(fromTo('whole', { baseline: 7, proposed: 8 })).toEqual({ from: '7', to: '8' });
    expect(fromTo('whole', { proposed: 1 })).toEqual({ from: '—', to: '1' });
    expect(fromTo('whole', { baseline: 2 }, { missing: peakMissing({ baseline: true, proposed: false }) })).toEqual({ from: '2', to: 'Not blocked' });
  });
  it('scales the bar to the largest change', () => {
    expect(barFraction(-2, 4)).toBe(0.5);
    expect(barFraction(5, 4)).toBe(1);
    expect(barFraction(undefined, 4)).toBe(0);
    expect(barFraction(1, 0)).toBe(0);
  });
});

describe('rows (Decision 0091 item 17)', () => {
  const comparison = buildComparison({ ...prepareComparison(baselineSide(), proposedSide()), day: 'weekday' });
  const names = (rows: Array<{ name: string }>) => rows.map((row) => row.name);

  it('lists the changed Routes in the comparison\'s order and folds the Unchanged ones', () => {
    const arranged = arrangeRows(comparison, { show: 'all', sort: 'hours', find: '' });
    expect(names(arranged.rows)).toEqual(['1 Main St', '2 Crosstown', '3 Airport', 'Unattributed (multi-route blocks)']);
    expect(names(arranged.folded)).toEqual(['5 Loop']);
  });
  it('sums the folded row\'s routes, trips and hours', () => {
    expect(foldedSummary(arrangeRows(comparison, { show: 'all', sort: 'hours', find: '' }).folded)).toEqual({ routes: 1, trips: 1, revenueHours: 0.25 });
  });
  it('sorts by route order with Unattributed last', () => {
    expect(names(arrangeRows(comparison, { show: 'all', sort: 'route', find: '' }).rows)).toEqual(['1 Main St', '2 Crosstown', '3 Airport', 'Unattributed (multi-route blocks)']);
  });
  it('shows one status without folding', () => {
    expect(names(arrangeRows(comparison, { show: 'unchanged', sort: 'hours', find: '' }).rows)).toEqual(['5 Loop']);
    expect(arrangeRows(comparison, { show: 'unchanged', sort: 'hours', find: '' }).folded).toEqual([]);
    expect(names(arrangeRows(comparison, { show: 'new', sort: 'hours', find: '' }).rows)).toEqual(['3 Airport']);
    expect(names(arrangeRows(comparison, { show: 'discontinued', sort: 'hours', find: '' }).rows)).toEqual(['2 Crosstown']);
  });
  it('finds by name or route code, ignoring case, without folding', () => {
    expect(names(arrangeRows(comparison, { show: 'all', sort: 'hours', find: ' LOOP ' }).rows)).toEqual(['5 Loop']);
    expect(names(arrangeRows(comparison, { show: 'all', sort: 'hours', find: 'air' }).rows)).toEqual(['3 Airport']);
    expect(names(arrangeRows(comparison, { show: 'all', sort: 'hours', find: '2' }).rows)).toContain('2 Crosstown');
  });
  it('lists the totals tiles in the screen\'s order', () => {
    expect(totalsTiles(comparison.totals).map((tile) => tile.id)).toEqual(['trips', 'revenueMiles', 'revenueHours', 'peakVehicles', 'cost']);
    expect(formatMeasure('whole', totalsTiles(comparison.totals)[0].measure.proposed)).toBe('10');
  });
});

describe('headways and spans (Decision 0091 items 9 and 11)', () => {
  it('writes a half minute as ½', () => {
    expect(formatHeadway(10)).toBe('10');
    expect(formatHeadway(7.5)).toBe('7½');
    expect(formatHeadway(0.5)).toBe('½');
    expect(formatHeadway(undefined)).toBe('—');
  });
  it('shows one value when both sides read alike, otherwise before → after', () => {
    expect(headwayCell(60, 60)).toEqual({ text: '60', changed: false });
    expect(headwayCell(30, 20)).toEqual({ text: '30 → 20', changed: true });
    expect(headwayCell(undefined, 15)).toEqual({ text: '— → 15', changed: true });
    expect(headwayCell(undefined, undefined)).toEqual({ text: '—', changed: false });
  });
  it('writes the change in a span as a signed length of time', () => {
    const direction = (baseline?: [number, number], proposed?: [number, number]) => ({ key: 'outbound', name: 'Outbound', headways: [], changed: true, span: { ...(baseline ? { baseline: { start: baseline[0], end: baseline[1] } } : {}), ...(proposed ? { proposed: { start: proposed[0], end: proposed[1] } } : {}) } });
    expect(spanChange(direction([21600, 37800], [21600, 38160]))).toEqual({ text: '+0:06', tone: 'up' });
    expect(spanChange(direction([21600, 38160], [21600, 37800]))).toEqual({ text: '−0:06', tone: 'down' });
    expect(spanChange(direction([21600, 37800], [21600, 37800]))).toEqual({ text: '0:00', tone: 'same' });
    expect(spanChange(direction(undefined, [21600, 37800]))).toEqual({ text: '—', tone: 'same' });
  });
});

describe('messages (card V4 item 3)', () => {
  const names = { baseline: 'Existing', proposed: 'Redesign' };
  const describe_ = (finding: CostingFinding) => `finding:${finding.messageKey}`;
  const finding = (messageKey: string, severity: 'error' | 'warning' = 'error'): CostingFinding => ({ ruleId: messageKey, severity, entityType: 'costingAssumptions', entityId: 's', messageKey });

  it('says how to fix a side with no rate, whichever way Costing reported it', () => {
    const fix = "Proposed (Redesign): Enter a rate on the Costing tab for Redesign, or set Rates to the other side's.";
    expect(errorLines({ side: 'proposed', code: 'compare.costingNoEstimate', detail: 'rateMissing', findings: [finding('costing.rateMissing', 'warning')] }, names, describe_)).toEqual([fix]);
    expect(errorLines({ side: 'proposed', code: 'compare.costingInvalid', findings: [finding('costing.rateMissing')] }, names, describe_)).toEqual([fix]);
  });
  it('says how to fix the other no-estimate reasons', () => {
    const lines = (detail: string) => errorLines({ side: 'baseline', code: 'compare.costingNoEstimate', detail, findings: [] }, names, describe_)[0];
    expect(lines('noEligibleBlocks')).toContain('Blocking tab');
    expect(lines('noTrips')).toContain('Trips tab');
    expect(lines('layoverFactorMissing')).toContain('Costing tab for Existing');
  });
  it('shows the error findings of an invalid side through the Costing wording, and not its warnings', () => {
    const error: CompareError = { side: 'baseline', code: 'compare.costingInvalid', findings: [finding('costing.rateYearInvalid'), finding('costing.routeCountsInUse', 'warning')] };
    expect(errorLines(error, names, describe_)).toEqual(['Baseline (Existing): Costing cannot calculate this side.', 'finding:costing.rateYearInvalid']);
  });
  it('explains a missing side and a missing day', () => {
    expect(errorLines({ side: 'baseline', code: 'compare.sideMissing', findings: [], detail: 'The baseline Scenario is no longer in this Project.' }, names, describe_)[0]).toMatch(/no longer in this Project\. Choose it again\.$/);
    expect(errorLines({ code: 'compare.dayMissing', findings: [] }, names, describe_)[0]).toMatch(/no service day in common/);
  });

  const rates = (enteredRate: number | undefined, rateYear = 2027) => ({ enteredRate, rateYear, baseServiceYear: 2027, futureYearCount: 0, annualEscalation: 0.03 });
  it('writes one line for each difference, and offers the reset only under "Each side\'s own"', () => {
    const differences: CompareDifference[] = [
      { code: 'compare.ratesDiffer', applied: 'own', baseline: rates(165.2), proposed: rates(171) },
      { code: 'compare.countsDiffer', applied: 'baseline', days: [{ key: 'weekday', name: 'Weekday', baseline: 251, proposed: 255 }], routes: [{ name: '1 Main St', baseline: { enabled: false, byDay: {} }, proposed: { enabled: true, byDay: { weekday: 62 } } }] },
      { code: 'compare.basisDiffers', baseline: 'blocked', proposed: 'estimated' },
    ];
    const lines = differenceLines(differences, names);
    expect(lines.map((line) => line.code)).toEqual(['compare.ratesDiffer', 'compare.countsDiffer', 'compare.basisDiffers']);
    expect(lines[0]).toEqual({ code: 'compare.ratesDiffer', resets: 'rates', text: 'The sides have different rates (baseline $165.20/hr, proposed $171.00/hr). Cost and annual figures include these differences, not only service changes.' });
    expect(lines[1].resets).toBeUndefined();
    expect(lines[1].text).toBe("The sides have different annual service days (Weekday 251 vs 255) and counts of their own on one route (1 Main St). Both sides use the baseline's.");
    expect(lines[2].text).toBe('The sides are costed differently: baseline from blocked hours, proposed from an estimate from factors. Peak vehicles are not shown for the proposed "Redesign", which has no Blocking scenario.');
  });
  it('names the other rate fields that differ', () => {
    const lines = differenceLines([{ code: 'compare.ratesDiffer', applied: 'proposed', baseline: rates(100, 2026), proposed: { ...rates(100, 2027), annualEscalation: 0.025, baseServiceYear: 2028, futureYearCount: 2 } }], names);
    expect(lines[0].text).toBe("The sides have different rates (rate year 2026 vs 2027; first service year 2027 vs 2028; escalation 3.0% vs 2.5%; future years 0 vs 2). Both sides use the proposed side's.");
    expect(lines[0].resets).toBeUndefined();
    expect(differenceLines([{ code: 'compare.ratesDiffer', applied: 'own', baseline: rates(undefined), proposed: rates(100) }], names)[0].text).toContain('baseline no rate entered, proposed $100.00/hr');
  });
  it('names the Routes of an ambiguous-key warning', () => {
    expect(warningLines([{ code: 'compare.ambiguousRoute', side: 'proposed', key: 's', routeIds: ['r1', 'r2'] }], (id) => ({ r1: 'S North' } as Record<string, string>)[id]))
      .toEqual(['Proposed has more than one route with the key "s" (S North, a route), so they are not matched. They appear as New or Discontinued.']);
  });
});
