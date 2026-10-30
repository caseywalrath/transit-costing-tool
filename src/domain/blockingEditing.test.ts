import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import type { BlockActivity, BlockingBlock, BlockingScenario, DeadheadActivity, RoutePattern, Trip } from './types';
import {
  applyDeadheadToMatchingConnections, BlockingValidationError, deadheadPercent, weightedEstimateFactors, insertBlockActivity, layoverPercent, moveRevenueTripGroup, normalizeMinimumLayoverRules, parseActivityInput, parseMinimumLayoverRule, parseMinimumLayoverRules,
  proposeBlockLabel, summarizeBlock, summarizeBlockingScenario, unassignedRouteTrips, validateBlockLabel,
} from './blocking';

// Package P14 (issues I-024, I-074a, I-077; Decision 0039 label rule): Blocking rules that used to live in `BlockingWorkspace.tsx`.
const H = 3600; const M = 60;
const scenario: BlockingScenario = { id: 'bs', scenarioId: 'scenario', tripProfileId: 'profile', name: 'Plan', ...metadata() };
const ab: RoutePattern = { id: 'ab', scenarioId: 'scenario', routeId: 'route', name: 'AB', points: [{ id: 'ab0', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'ab1', nodeId: 'B', sequence: 1, cumulativeMiles: 5 }], ...metadata() };
const ba: RoutePattern = { id: 'ba', scenarioId: 'scenario', routeId: 'route', name: 'BA', points: [{ id: 'ba0', nodeId: 'B', sequence: 0, cumulativeMiles: 0 }, { id: 'ba1', nodeId: 'A', sequence: 1, cumulativeMiles: 5 }], ...metadata() };
const patterns = [ab, ba];
function trip(id: string, start: number, source = ab, extra: Partial<Trip> = {}): Trip {
  return { id, scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: source.id, tripProfileId: 'profile', stopTimes: [{ patternPointId: source.points[0].id, sequence: 0, time: start }, { patternPointId: source.points[1].id, sequence: 1, time: start + 30 * M }], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...metadata(), ...extra };
}
const rev = (tripId: string, id = `r-${tripId}`): BlockActivity => ({ id, type: 'revenueTrip', sequence: 0, tripId });
const deadhead = (id: string, minutes = 10, from = 'B', to = 'A'): DeadheadActivity => ({ id, type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: minutes, fromNodeId: from, toNodeId: to });
function block(activities: BlockActivity[], extra: Partial<BlockingBlock> = {}): BlockingBlock { return { id: 'b', scenarioId: 'scenario', blockingScenarioId: 'bs', serviceDayId: 'weekday', label: 'Block 1', activities: activities.map((activity, sequence) => ({ ...activity, sequence })), ...metadata(), ...extra }; }
const kinds = (value: BlockingBlock) => value.activities.map((activity) => activity.type === 'revenueTrip' ? activity.tripId : activity.id);

describe('Layover % (I-074a)', () => {
  it('is the layover share of Revenue hours, and unknown when there are no Revenue hours', () => {
    expect(layoverPercent(0.5, 2)).toBe(25);
    expect(layoverPercent(0, 2)).toBe(0);
    expect(layoverPercent(1, 0)).toBeUndefined();
  });

  it('is part of every Block summary and of the Blocking Scenario summary', () => {
    const t1 = trip('t1', 6 * H); const t2 = trip('t2', 7 * H, ba);
    const value = block([rev('t1'), rev('t2')]);
    const summary = summarizeBlock(value, { blockingScenario: scenario, trips: [t1, t2], patterns });
    expect(summary.layoverHours).toBeCloseTo(0.5); expect(summary.revenueHours).toBeCloseTo(1.5);
    expect(summary.layoverPercent).toBeCloseTo(100 / 3);
    const total = summarizeBlockingScenario(scenario, [value, block([], { id: 'empty' })], { trips: [t1, t2], patterns });
    expect(total.layoverPercent).toBeCloseTo(100 / 3);
    expect(summarizeBlock(block([]), { blockingScenario: scenario, trips: [], patterns }).layoverPercent).toBeUndefined();
  });
});

describe('Activity input (I-077)', () => {
  it.each(['', '   ', '\t'])('rejects a blank minutes field %j instead of reading it as 0', (text) => {
    const result = parseActivityInput({ minutes: text, miles: '' });
    expect(result.minutes).toBeUndefined();
    expect(result.findings).toEqual([expect.objectContaining({ ruleId: 'block.minutesRequired', severity: 'error', category: 'structural', field: 'minutes' })]);
  });

  it.each(['1.5', '-1', 'abc', '1e1x', 'Infinity'])('rejects %j as minutes', (text) => {
    expect(parseActivityInput({ minutes: text, miles: '' }).findings.map((item) => item.ruleId)).toEqual(['block.minutesInvalid']);
  });

  it.each([['0', 0], ['12', 12], [' 7 ', 7]])('accepts %j as %i minutes', (text, minutes) => {
    expect(parseActivityInput({ minutes: text, miles: '' })).toEqual({ minutes, findings: [] });
  });

  it('treats blank miles as not entered and rejects negative or non-numeric miles', () => {
    expect(parseActivityInput({ minutes: '5', miles: '' })).toEqual({ minutes: 5, findings: [] });
    expect(parseActivityInput({ minutes: '5', miles: '2.5' })).toEqual({ minutes: 5, miles: 2.5, findings: [] });
    expect(parseActivityInput({ minutes: '5', miles: '-1' }).findings.map((item) => item.ruleId)).toEqual(['block.invalidMiles']);
    expect(parseActivityInput({ minutes: '5', miles: 'x' }).findings.map((item) => item.ruleId)).toEqual(['block.invalidMiles']);
    expect(parseActivityInput({ minutes: '', miles: 'x' }).findings.map((item) => item.ruleId)).toEqual(['block.minutesRequired', 'block.invalidMiles']);
  });
});

describe('Minimum layover input (I-077)', () => {
  it.each(['minutes', 'percent'] as const)('rejects a blank %s amount instead of reading it as a 0 rule', (mode) => {
    const result = parseMinimumLayoverRule(mode, '  ');
    expect(result.rule).toBeUndefined();
    expect(result.findings.map((item) => item.ruleId)).toEqual(['block.minimumLayoverAmountRequired']);
  });

  it('accepts a non-negative amount, a percent up to 100, and no minimum', () => {
    expect(parseMinimumLayoverRule('minutes', '10')).toEqual({ rule: { mode: 'minutes', value: 10 }, findings: [] });
    expect(parseMinimumLayoverRule('minutes', '0')).toEqual({ rule: { mode: 'minutes', value: 0 }, findings: [] });
    expect(parseMinimumLayoverRule('percent', '100')).toEqual({ rule: { mode: 'percent', value: 100 }, findings: [] });
    expect(parseMinimumLayoverRule('none', '')).toEqual({ findings: [] });
  });

  it.each([['minutes', '-1'], ['minutes', 'abc'], ['percent', '101'], ['percent', 'NaN']] as const)('rejects %s %j', (mode, amount) => {
    expect(parseMinimumLayoverRule(mode, amount).findings.map((item) => item.ruleId)).toEqual(['block.minimumLayoverAmountInvalid']);
  });
});

describe('Minimum layover by direction (Decision 0050)', () => {
  const row = (mode: 'none' | 'minutes' | 'percent', amount = '') => ({ mode, amount });
  it('reads one rule per direction, and a direction set to No minimum has no entry', () => {
    expect(parseMinimumLayoverRules({ outbound: row('minutes', '10'), inbound: row('percent', '8') })).toEqual({ rules: { outbound: { mode: 'minutes', value: 10 }, inbound: { mode: 'percent', value: 8 } }, findings: [] });
    expect(parseMinimumLayoverRules({ outbound: row('minutes', '10'), inbound: row('none') })).toEqual({ rules: { outbound: { mode: 'minutes', value: 10 } }, findings: [] });
    expect(parseMinimumLayoverRules({ outbound: row('none'), inbound: row('none') })).toEqual({ findings: [] });
  });

  it('refuses a blank or invalid amount in a direction that has a rule, naming the direction in the field', () => {
    const result = parseMinimumLayoverRules({ outbound: row('minutes', '10'), inbound: row('percent', ' ') });
    expect(result.findings.map((item) => [item.ruleId, item.field])).toEqual([['block.minimumLayoverAmountRequired', 'inbound.amount']]);
    expect(result.rules).toEqual({ outbound: { mode: 'minutes', value: 10 } });
    expect(parseMinimumLayoverRules({ outbound: row('percent', '101'), inbound: row('minutes', '-1') }).findings.map((item) => item.field)).toEqual(['outbound.amount', 'inbound.amount']);
  });

  it('reads a single rule stored before the change as the rule for both directions', () => {
    const rule = { mode: 'minutes', value: 10 };
    expect(normalizeMinimumLayoverRules(rule)).toEqual({ outbound: rule, inbound: rule });
  });

  it('reads the per-direction form, and anything of the wrong shape as no minimum', () => {
    expect(normalizeMinimumLayoverRules({ outbound: { mode: 'percent', value: 8 } })).toEqual({ outbound: { mode: 'percent', value: 8 } });
    expect(normalizeMinimumLayoverRules({ outbound: { mode: 'minutes', value: 5 }, inbound: { mode: 'bad', value: 5 } })).toEqual({ outbound: { mode: 'minutes', value: 5 } });
    for (const stored of ['none', 5, null, undefined, [], {}, { mode: 'minutes', value: -1 }, { outbound: { mode: 'minutes', value: Number.NaN } }]) expect(normalizeMinimumLayoverRules(stored)).toBeUndefined();
  });
});

describe('Apply a deadhead to every matching connection (I-024, finding 4-007)', () => {
  const five = [1, 2, 3, 4, 5].map((n) => trip(`t${n}`, (5 + n) * H));
  const plain = block(five.map((value) => rev(value.id)));

  it('adds a deadhead to every connection that ends at the From Node and starts at the To Node: 5 matching Trips give 4 deadheads', () => {
    const { block: result, appliedCount } = applyDeadheadToMatchingConnections(plain, deadhead('new', 12), five, patterns);
    expect(appliedCount).toBe(4);
    expect(result.activities.map((activity) => activity.type)).toEqual(['revenueTrip', 'deadhead', 'revenueTrip', 'deadhead', 'revenueTrip', 'deadhead', 'revenueTrip', 'deadhead', 'revenueTrip']);
    expect(result.activities.map((activity) => activity.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const added = result.activities.filter((activity): activity is DeadheadActivity => activity.type === 'deadhead');
    expect(added.every((activity) => activity.minutesAfterPreviousTrip === 12 && activity.fromNodeId === 'B' && activity.toNodeId === 'A')).toBe(true);
    expect(new Set(result.activities.map((activity) => activity.id)).size).toBe(9);
    expect(result.activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => activity.type === 'revenueTrip' && activity.tripId)).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(plain.activities).toHaveLength(5);
  });

  it('replaces a deadhead that already sits on a matching connection, keeping its id, and skips connections that do not match', () => {
    const mixed = [trip('m1', 6 * H), trip('m2', 7 * H), trip('m3', 8 * H, ba), trip('m4', 9 * H)];
    const start = block([rev('m1'), deadhead('keep', 5), rev('m2'), rev('m3'), rev('m4')]);
    const { block: result, appliedCount } = applyDeadheadToMatchingConnections(start, deadhead('new', 20), mixed, patterns);
    // m1->m2 (B to A) matches and already has a deadhead; m2->m3 (B to B) does not match; m3->m4 (A to A) does not match.
    expect(appliedCount).toBe(1);
    expect(kinds(result)).toEqual(['m1', 'keep', 'm2', 'm3', 'm4']);
    expect(result.activities[1]).toMatchObject({ id: 'keep', type: 'deadhead', minutesAfterPreviousTrip: 20 });
  });

  it('refuses when no connection matches, and names the rule', () => {
    expect(() => applyDeadheadToMatchingConnections(plain, deadhead('new', 10, 'X', 'Y'), five, patterns)).toThrow(BlockingValidationError);
    try { applyDeadheadToMatchingConnections(plain, deadhead('new', 10, 'X', 'Y'), five, patterns); } catch (error) {
      expect((error as BlockingValidationError).message).toBe('No consecutive Trips use the selected From and To Nodes.');
      expect((error as BlockingValidationError).findings[0]).toMatchObject({ ruleId: 'block.deadheadNoMatch', entityType: 'block', entityId: 'b' });
    }
    expect(() => applyDeadheadToMatchingConnections(plain, deadhead('new'), five, [])).toThrow(/No consecutive Trips/);
  });

  it('does not depend on activity ids, so a deadhead id that sorts anywhere keeps its place', () => {
    for (const id of ['aaa', 'zzz']) {
      const { block: result } = applyDeadheadToMatchingConnections(block([rev('t1', 'm'), rev('t2', 'a')]), deadhead(id), five, patterns);
      expect(result.activities.map((activity) => activity.type)).toEqual(['revenueTrip', 'deadhead', 'revenueTrip']);
    }
  });
});

describe('Insert an activity (I-074a)', () => {
  const base = block([rev('t1', 'trip-b'), rev('t2', 'trip-c')]);

  it('puts a pull-out first and a pull-in last whatever their ids sort like', () => {
    for (const id of ['aaa', 'zzz']) {
      const withOut = insertBlockActivity(base, { id, type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A' });
      expect(withOut.activities.map((activity) => activity.sequence)).toEqual([0, 1, 2]);
      expect(withOut.activities[0].type).toBe('pullOut');
      const withIn = insertBlockActivity(withOut, { id, type: 'pullIn', sequence: 0, minutesAfterLastTrip: 10, fromNodeId: 'B' });
      expect(withIn.activities.map((activity) => activity.type)).toEqual(['pullOut', 'revenueTrip', 'revenueTrip', 'pullIn']);
      expect(withIn.activities.map((activity) => activity.sequence)).toEqual([0, 1, 2, 3]);
    }
  });

  it('puts a deadhead directly after the named Trip, before a following pull-in, and renumbers the rest', () => {
    const withIn = insertBlockActivity(base, { id: 'in', type: 'pullIn', sequence: 0, minutesAfterLastTrip: 10, fromNodeId: 'B' });
    const first = insertBlockActivity(withIn, deadhead('dh'), 't1');
    expect(kinds(first)).toEqual(['t1', 'dh', 't2', 'in']);
    expect(first.activities.map((activity) => activity.sequence)).toEqual([0, 1, 2, 3]);
    expect(kinds(insertBlockActivity(withIn, deadhead('dh'), 't2'))).toEqual(['t1', 't2', 'dh', 'in']);
  });

  it('refuses a deadhead with no preceding Trip', () => {
    for (const afterTripId of [undefined, 'missing']) {
      try { insertBlockActivity(base, deadhead('dh'), afterTripId); throw new Error('Expected the call to throw.'); } catch (error) {
        expect(error).toBeInstanceOf(BlockingValidationError);
        expect((error as BlockingValidationError).message).toBe('Select a preceding Trip for the deadhead.');
        expect((error as BlockingValidationError).findings[0]).toMatchObject({ ruleId: 'block.deadheadPlacement', entityId: 'b' });
      }
    }
  });
});

describe('Reorder a Trip with its deadhead (I-074a)', () => {
  const start = block([{ id: 'out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A' }, rev('t1'), deadhead('dh1'), rev('t2'), rev('t3'), { id: 'in', type: 'pullIn', sequence: 0, minutesAfterLastTrip: 10, fromNodeId: 'B' }]);

  it('moves a Trip group (the Trip and the deadhead after it) one place and keeps the pull-out and pull-in at the ends', () => {
    expect(moveRevenueTripGroup(start, 'r-t2', -1)).toEqual(['out', 'r-t2', 'r-t1', 'dh1', 'r-t3', 'in']);
    expect(moveRevenueTripGroup(start, 'r-t3', -1)).toEqual(['out', 'r-t1', 'dh1', 'r-t3', 'r-t2', 'in']);
    expect(moveRevenueTripGroup(start, 'r-t1', 1)).toEqual(['out', 'r-t2', 'r-t1', 'dh1', 'r-t3', 'in']);
    expect(moveRevenueTripGroup(start, 'r-t2', 1)).toEqual(['out', 'r-t1', 'dh1', 'r-t3', 'r-t2', 'in']);
  });

  it('reports no move at either end and for an activity that is not a Trip of the Block', () => {
    expect(moveRevenueTripGroup(start, 'r-t1', -1)).toBeUndefined();
    expect(moveRevenueTripGroup(start, 'r-t3', 1)).toBeUndefined();
    expect(moveRevenueTripGroup(start, 'dh1', 1)).toBeUndefined();
    expect(moveRevenueTripGroup(start, 'nope', 1)).toBeUndefined();
  });
});

describe('Unassigned Trips of a Route (I-074a, ownership filter)', () => {
  it('lists the Trips of the Route and service day that no Block of the Blocking Scenario holds', () => {
    const trips = [trip('a', 6 * H), trip('b', 7 * H), trip('c', 8 * H, ab, { routeId: 'other' }), trip('d', 9 * H, ab, { serviceDayId: 'saturday' }), trip('e', 10 * H)];
    const blocks = [block([rev('a')]), block([rev('d')], { id: 'sat', serviceDayId: 'saturday' }), block([rev('b')], { id: 'elsewhere', blockingScenarioId: 'other-scenario' })];
    expect(unassignedRouteTrips(trips, blocks.filter((value) => value.blockingScenarioId === 'bs'), 'weekday', 'route').map((item) => item.id).sort()).toEqual(['b', 'e']);
    expect(unassignedRouteTrips(trips, [], 'weekday', 'other').map((item) => item.id)).toEqual(['c']);
  });
});

describe('Block labels (Decision 0039)', () => {
  const others = [block([], { id: 'one', label: 'Block 1' }), block([], { id: 'two', label: ' Block 2 ' }), block([], { id: 'sat', label: 'Block 3', serviceDayId: 'saturday' })];

  it('rejects a label already used by another Block of the same service day, compared after trimming', () => {
    expect(validateBlockLabel('Block 1', 'weekday', others).map((item) => item.ruleId)).toEqual(['block.labelUnique']);
    expect(validateBlockLabel('  Block 2', 'weekday', others).map((item) => item.ruleId)).toEqual(['block.labelUnique']);
    expect(validateBlockLabel('Block 3', 'weekday', others)).toEqual([]);
    expect(validateBlockLabel('block 1', 'weekday', others)).toEqual([]);
  });

  it('lets a Block keep its own label and rejects a blank label', () => {
    expect(validateBlockLabel('Block 1', 'weekday', others, 'one')).toEqual([]);
    expect(validateBlockLabel('Block 1', 'weekday', others, 'two').map((item) => item.ruleId)).toEqual(['block.labelUnique']);
    expect(validateBlockLabel('   ', 'weekday', others).map((item) => item.ruleId)).toEqual(['block.labelRequired']);
    expect(validateBlockLabel('Block 1', 'weekday', others)[0]).toMatchObject({ entityType: 'block', field: 'label', category: 'structural', severity: 'error' });
  });

  it('proposes the first free "Block <n>" for the service day', () => {
    expect(proposeBlockLabel([])).toBe('Block 1');
    expect(proposeBlockLabel([block([], { label: 'Block 1' }), block([], { id: 'x', label: 'Block 3' })])).toBe('Block 2');
    expect(proposeBlockLabel([block([], { label: ' Block 1 ' }), block([], { id: 'x', label: 'Block 2' }), block([], { id: 'y', label: 'Block 3' })])).toBe('Block 4');
    expect(proposeBlockLabel([block([], { label: 'Express' })])).toBe('Block 1');
  });
});

describe('estimate factor percentages (Decision 0051)', () => {
  const summaryOf = (revenueHours: number, runningHours: number, platformHours: number | undefined) => ({ blockingScenarioId: 'bs', blockSummaries: [], revenueHours, runningHours, platformHours, deadheadHours: 0, layoverHours: revenueHours - runningHours, validBlockCount: 1, invalidBlockCount: 0, incompleteBlockCount: 0, complete: true });

  it('deadheadPercent is (platform − revenue) ÷ platform, and undefined without platform hours', () => {
    expect(deadheadPercent(8, 10)).toBe(20);
    expect(deadheadPercent(10, 10)).toBe(0);
    expect(deadheadPercent(8, undefined)).toBeUndefined();
    expect(deadheadPercent(0, 0)).toBeUndefined();
  });

  it('weights each day by its annual service days and ignores days with none or no revenue', () => {
    const result = weightedEstimateFactors([
      { annualServiceDays: 200, summary: summaryOf(10, 8, 12.5) },
      { annualServiceDays: 50, summary: summaryOf(5, 4, 5.5) },
      { annualServiceDays: 0, summary: summaryOf(99, 1, 100) },
      { annualServiceDays: 30, summary: summaryOf(0, 0, 0) },
    ]);
    expect(result.layoverPercent).toBeCloseTo((200 * 2 + 50 * 1) / (200 * 10 + 50 * 5) * 100, 9);
    expect(result.deadheadPercent).toBeCloseTo((200 * 2.5 + 50 * 0.5) / (200 * 12.5 + 50 * 5.5) * 100, 9);
  });

  it('leaves the deadhead percentage out when a counted day has unknown platform hours, and returns nothing without counted days', () => {
    const result = weightedEstimateFactors([{ annualServiceDays: 10, summary: summaryOf(10, 8, 12.5) }, { annualServiceDays: 10, summary: summaryOf(10, 9, undefined) }]);
    expect(result.layoverPercent).toBeCloseTo(15, 9);
    expect(result.deadheadPercent).toBeUndefined();
    expect(weightedEstimateFactors([])).toEqual({});
    expect(weightedEstimateFactors([{ annualServiceDays: 0, summary: summaryOf(10, 8, 12) }])).toEqual({});
  });
});
