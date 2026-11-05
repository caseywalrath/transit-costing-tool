import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import {
  defaultMeasureNodeId,
  normalizePeriods,
  plannedSlots,
  resolveMeasureNodeId,
  tripsPerHour,
  validatePlannedFrequency,
} from './plannedFrequencies';
import type { PlannedFrequency, PlannedPeriod, RouteDirection, RoutePattern } from './types';

const HOUR = 3600;
const meta = metadata('2026-01-01T00:00:00.000Z');
const period = (id: string, startTime: number, endTime: number, headwaySeconds: number): PlannedPeriod => ({ id, startTime, endTime, headwaySeconds });
const plan = (periods: PlannedPeriod[], measure: Record<string, string> = {}): PlannedFrequency => ({
  ...meta, id: 'plan-1', scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', periods, measureNodeIdByDirectionId: measure,
});
const direction: RouteDirection = {
  ...meta, id: 'dir-out', scenarioId: 's', routeId: 'r', name: 'Outbound', group: 'outbound', sequence: 0,
  columns: [
    { id: 'c1', nodeId: 'n-first', sequence: 0 },
    { id: 'c2', nodeId: 'n-mid', sequence: 1 },
    { id: 'c3', nodeId: 'n-last', sequence: 2 },
  ],
};
const pattern = (id: string, nodeIds: string[], directionId = 'dir-out'): RoutePattern => ({
  ...meta, id, scenarioId: 's', routeId: 'r', name: id, directionId,
  points: nodeIds.map((nodeId, sequence) => ({ id: `${id}-${sequence}`, nodeId, sequence, cumulativeMiles: sequence })),
});
const patterns = [pattern('full', ['n-first', 'n-mid', 'n-last']), pattern('short', ['n-mid', 'n-last'])];
const context = { directions: [direction], patterns };
const rules = (record: PlannedFrequency) => validatePlannedFrequency(record, context).map((f) => f.ruleId);

describe('plannedSlots', () => {
  it('uses start + k × headway, end exclusive', () => {
    expect(plannedSlots(period('a', 6 * HOUR, 8 * HOUR, 1800))).toEqual([6 * HOUR, 6.5 * HOUR, 7 * HOUR, 7.5 * HOUR]);
  });
  it('supports 24-plus times', () => {
    expect(plannedSlots(period('a', 24 * HOUR, 25.5 * HOUR, 1800))).toEqual([24 * HOUR, 24.5 * HOUR, 25 * HOUR]);
  });
  it('supports a 7:30 headway', () => {
    expect(plannedSlots(period('a', 0, 1800, 450))).toEqual([0, 450, 900, 1350]);
  });
  it('ends with the last slot before the end when the length is not a multiple', () => {
    expect(plannedSlots(period('a', 0, 3000, 1200))).toEqual([0, 1200, 2400]);
  });
  it('returns nothing for an invalid period', () => {
    expect(plannedSlots(period('a', 100, 100, 60))).toEqual([]);
    expect(plannedSlots(period('a', 0, 600, 0))).toEqual([]);
  });
});

describe('tripsPerHour', () => {
  it('derives from the headway', () => {
    expect(tripsPerHour({ headwaySeconds: 900 })).toBe(4);
    expect(tripsPerHour({ headwaySeconds: 450 })).toBe(8);
    expect(tripsPerHour({ headwaySeconds: 0 })).toBe(0);
  });
});

describe('normalizePeriods', () => {
  it('sorts by start and keeps ids without mutating the input', () => {
    const input = [period('b', 8 * HOUR, 9 * HOUR, 900), period('a', 6 * HOUR, 8 * HOUR, 1800)];
    expect(normalizePeriods(input).map((p) => p.id)).toEqual(['a', 'b']);
    expect(input.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('validatePlannedFrequency', () => {
  it('accepts a valid plan with gaps and 24-plus times', () => {
    expect(rules(plan([period('a', 6 * HOUR, 8 * HOUR, 1800), period('b', 9 * HOUR, 25 * HOUR, 900)]))).toEqual([]);
  });
  it('periodEndNotAfterStart', () => {
    expect(rules(plan([period('a', 8 * HOUR, 8 * HOUR, 900)]))).toEqual(['plannedFrequency.periodEndNotAfterStart']);
    expect(rules(plan([period('a', 9 * HOUR, 8 * HOUR, 900)]))).toEqual(['plannedFrequency.periodEndNotAfterStart']);
  });
  it('periodsOverlap, but not for adjacent periods', () => {
    expect(rules(plan([period('a', 6 * HOUR, 8 * HOUR, 900), period('b', 8 * HOUR, 9 * HOUR, 900)]))).toEqual([]);
    expect(rules(plan([period('a', 6 * HOUR, 8 * HOUR, 900), period('b', 7 * HOUR, 9 * HOUR, 900)]))).toEqual(['plannedFrequency.periodsOverlap']);
  });
  it('catches a long period that overlaps a later period past a shorter one', () => {
    const found = validatePlannedFrequency(plan([period('a', 0, 10 * HOUR, 900), period('b', HOUR, 2 * HOUR, 900), period('c', 3 * HOUR, 4 * HOUR, 900)]), context);
    expect(found.filter((f) => f.ruleId === 'plannedFrequency.periodsOverlap')).toHaveLength(2);
  });
  it('headwayTooShort', () => {
    expect(rules(plan([period('a', 0, HOUR, 59)]))).toEqual(['plannedFrequency.headwayTooShort']);
    expect(rules(plan([period('a', 0, HOUR, 60)]))).toEqual([]);
    expect(rules(plan([period('a', 0, HOUR, 90.5)]))).toEqual(['plannedFrequency.headwayTooShort']);
  });
  it('headwayLongerThanPeriod, but equal to the period length is allowed', () => {
    expect(rules(plan([period('a', 0, 1800, 3600)]))).toEqual(['plannedFrequency.headwayLongerThanPeriod']);
    expect(rules(plan([period('a', 0, 1800, 1800)]))).toEqual([]);
  });
  it('measureNodeNotServed for a node no pattern of the direction serves', () => {
    expect(rules(plan([period('a', 0, HOUR, 900)], { 'dir-out': 'n-gone' }))).toEqual(['plannedFrequency.measureNodeNotServed']);
    expect(rules(plan([period('a', 0, HOUR, 900)], { 'dir-out': 'n-mid' }))).toEqual([]);
  });
  it('does not count a pattern of another direction as serving the node', () => {
    const other = [...patterns, pattern('inbound-only', ['n-elsewhere'], 'dir-in')];
    const found = validatePlannedFrequency(plan([period('a', 0, HOUR, 900)], { 'dir-out': 'n-elsewhere' }), { directions: [direction], patterns: other });
    expect(found.map((f) => f.ruleId)).toEqual(['plannedFrequency.measureNodeNotServed']);
  });
  it('uses the validation finding shape', () => {
    const [f] = validatePlannedFrequency(plan([period('a', 0, 1800, 3600)]), context);
    expect(f).toMatchObject({ severity: 'error', entityType: 'plannedFrequency', entityId: 'plan-1', field: 'periods', messageKey: 'plannedFrequency.headwayLongerThanPeriod' });
    expect(f.parameters?.periodId).toBe('a');
  });
});

describe('measure node', () => {
  it('defaults to the first timepoint column that is served', () => {
    expect(defaultMeasureNodeId(direction, patterns)).toBe('n-first');
    expect(defaultMeasureNodeId(direction, [pattern('short', ['n-mid', 'n-last'])])).toBe('n-mid');
    expect(defaultMeasureNodeId(direction, [])).toBeUndefined();
  });
  it('uses the stored node when it is served', () => {
    expect(resolveMeasureNodeId(plan([], { 'dir-out': 'n-mid' }), direction, patterns)).toEqual({ nodeId: 'n-mid', fellBack: false });
  });
  it('uses the default without reporting a fallback when nothing is stored', () => {
    expect(resolveMeasureNodeId(plan([]), direction, patterns)).toEqual({ nodeId: 'n-first', fellBack: false });
  });
  it('falls back to the default, reports it, and leaves the stored value alone, when the node is no longer served', () => {
    const record = plan([], { 'dir-out': 'n-removed' });
    expect(resolveMeasureNodeId(record, direction, patterns)).toEqual({ nodeId: 'n-first', fellBack: true });
    expect(record.measureNodeIdByDirectionId['dir-out']).toBe('n-removed');
  });
});
