import { describe, expect, it } from 'vitest';
import { remapAutoBlockingRecord, validateAutoBlockingRules, type AutoBlockingRecord, type AutoBlockingRules } from './autoBlocking';
import { metadata } from './ids';
import type { Node, RoutePattern } from './types';

const node = (id: string, routeId: string, kind: Node['kind']): Node => ({ id, scenarioId: 's', routeId, name: id, kind, ...metadata('2026-01-01T00:00:00.000Z') });
const pattern = (id: string): RoutePattern => ({ id, scenarioId: 's', routeId: 'r1', name: id, points: [], ...metadata('2026-01-01T00:00:00.000Z') });
const context = {
  patterns: [pattern('p1'), pattern('p2')],
  nodes: [node('A', 'r1', 'terminal'), node('B', 'r1', 'terminal'), node('G', 'r1', 'garage'), node('X', 'r2', 'terminal'), node('Y', 'r2', 'garage')],
  serviceDayIds: ['d1', 'd2'],
};
const validRules = (): AutoBlockingRules => ({
  serviceDayIds: ['d1'],
  patterns: [
    { patternId: 'p1', minimumLayover: { mode: 'minutes', value: 20 }, breakAllowed: true, canStart: true, canEnd: true },
    { patternId: 'p2', minimumLayover: { mode: 'percent', value: 10 }, breakAllowed: false, canStart: false, canEnd: false },
  ],
  break: { lengthMinutes: 35, minimumBlockHours: 4, firstBreakAfterHours: 1, anotherBreakAfterHours: 4 },
  maxRunningHours: 9,
  maxRevenueMiles: 200,
  garages: [{ routeId: 'r1', nodeId: 'G' }],
  terminals: [{ nodeId: 'A', pullOutMinutes: 10, pullInMinutes: 5, miles: 2.5 }],
  deadheads: [{ fromNodeId: 'A', toNodeId: 'B', minutes: 6, miles: 1, bothWays: true }],
});
const fieldsOf = (rules: AutoBlockingRules) => validateAutoBlockingRules(rules, context).map((finding) => `${finding.ruleId}@${finding.field}`);

describe('validateAutoBlockingRules', () => {
  it('accepts a complete valid rule set and a minimal one', () => {
    expect(validateAutoBlockingRules(validRules(), context)).toEqual([]);
    expect(validateAutoBlockingRules({ serviceDayIds: ['d1'], patterns: [], garages: [], terminals: [], deadheads: [] }, context)).toEqual([]);
  });

  it('reports findings as structural errors on the autoBlocking entity', () => {
    const [finding] = validateAutoBlockingRules({ ...validRules(), serviceDayIds: [] }, context);
    expect(finding).toMatchObject({ ruleId: 'autoBlocking.serviceDaysRequired', severity: 'error', category: 'structural', entityType: 'autoBlocking', field: 'serviceDayIds' });
  });

  it('requires at least one known, non-duplicate service day', () => {
    expect(fieldsOf({ ...validRules(), serviceDayIds: [] })).toEqual(['autoBlocking.serviceDaysRequired@serviceDayIds']);
    expect(fieldsOf({ ...validRules(), serviceDayIds: ['d1', 'nope'] })).toEqual(['autoBlocking.serviceDayUnknown@serviceDayIds[1]']);
    expect(fieldsOf({ ...validRules(), serviceDayIds: ['d1', 'd1'] })).toEqual(['autoBlocking.serviceDayDuplicate@serviceDayIds[1]']);
  });

  it('checks Pattern rows: known Pattern, no duplicates, layover shape, boolean flags', () => {
    const rules = validRules();
    expect(fieldsOf({ ...rules, patterns: [{ ...rules.patterns[0], patternId: 'missing' }] })).toEqual(['autoBlocking.patternUnknown@patterns[0].patternId']);
    expect(fieldsOf({ ...rules, patterns: [rules.patterns[0], rules.patterns[0]] })).toEqual(['autoBlocking.patternDuplicate@patterns[1].patternId']);
    expect(fieldsOf({ ...rules, patterns: [{ ...rules.patterns[0], minimumLayover: { mode: 'minutes', value: 2.5 } }] })).toEqual(['autoBlocking.layoverMinutesWhole@patterns[0].minimumLayover']);
    expect(fieldsOf({ ...rules, patterns: [{ ...rules.patterns[0], minimumLayover: { mode: 'minutes', value: -1 } }] })).toEqual(['autoBlocking.layoverValue@patterns[0].minimumLayover']);
    expect(fieldsOf({ ...rules, patterns: [{ ...rules.patterns[0], minimumLayover: { mode: 'percent', value: 101 } }] })).toEqual(['autoBlocking.layoverPercentRange@patterns[0].minimumLayover']);
    expect(fieldsOf({ ...rules, patterns: [{ ...rules.patterns[0], minimumLayover: { mode: 'percent', value: 100 } }] })).toEqual([]);
    expect(fieldsOf({ ...rules, patterns: [{ ...rules.patterns[0], minimumLayover: { mode: 'percent', value: Number.NaN } }] })).toEqual(['autoBlocking.layoverValue@patterns[0].minimumLayover']);
    expect(fieldsOf({ ...rules, patterns: [{ ...rules.patterns[0], minimumLayover: { mode: 'hours', value: 1 } as never }] })).toEqual(['autoBlocking.layoverMode@patterns[0].minimumLayover']);
    expect(fieldsOf({ ...rules, patterns: [{ ...rules.patterns[0], canStart: 'yes' as never }] })).toEqual(['autoBlocking.flagInvalid@patterns[0].canStart']);
  });

  it('checks the break rule fields', () => {
    const rules = validRules();
    const withBreak = (patch: Partial<NonNullable<AutoBlockingRules['break']>>) => fieldsOf({ ...rules, break: { ...rules.break!, ...patch } });
    expect(withBreak({ lengthMinutes: 0 })).toEqual(['autoBlocking.breakLength@break.lengthMinutes']);
    expect(withBreak({ lengthMinutes: 35.5 })).toEqual(['autoBlocking.breakLength@break.lengthMinutes']);
    expect(withBreak({ minimumBlockHours: -1 })).toEqual(['autoBlocking.breakMinimumBlock@break.minimumBlockHours']);
    expect(withBreak({ minimumBlockHours: 0 })).toEqual([]);
    expect(withBreak({ firstBreakAfterHours: Number.POSITIVE_INFINITY })).toEqual(['autoBlocking.breakFirstAfter@break.firstBreakAfterHours']);
    expect(withBreak({ anotherBreakAfterHours: 0 })).toEqual(['autoBlocking.breakAnotherAfter@break.anotherBreakAfterHours']);
    expect(withBreak({ anotherBreakAfterHours: undefined })).toEqual([]);
    expect(fieldsOf({ ...rules, break: undefined })).toEqual([]);
  });

  it('requires limits above zero when present', () => {
    const rules = validRules();
    expect(fieldsOf({ ...rules, maxRunningHours: 0 })).toEqual(['autoBlocking.limitRunningHours@maxRunningHours']);
    expect(fieldsOf({ ...rules, maxRevenueMiles: -5 })).toEqual(['autoBlocking.limitRevenueMiles@maxRevenueMiles']);
    expect(fieldsOf({ ...rules, maxRunningHours: Number.NaN })).toEqual(['autoBlocking.limitRunningHours@maxRunningHours']);
    expect(fieldsOf({ ...rules, maxRunningHours: undefined, maxRevenueMiles: undefined })).toEqual([]);
  });

  it('checks garages: a garage node on that Route, at most one per Route', () => {
    const rules = validRules();
    expect(fieldsOf({ ...rules, garages: [{ routeId: 'r1', nodeId: 'missing' }] })).toEqual(['autoBlocking.garageNodeUnknown@garages[0].nodeId']);
    expect(fieldsOf({ ...rules, garages: [{ routeId: 'r1', nodeId: 'A' }] })).toEqual(['autoBlocking.garageNodeKind@garages[0].nodeId']);
    expect(fieldsOf({ ...rules, garages: [{ routeId: 'r1', nodeId: 'Y' }] })).toEqual(['autoBlocking.garageRoute@garages[0].routeId']);
    expect(fieldsOf({ ...rules, garages: [{ routeId: 'r1', nodeId: 'G' }, { routeId: 'r1', nodeId: 'G' }] })).toEqual(['autoBlocking.garageDuplicate@garages[1].routeId']);
    expect(fieldsOf({ ...rules, garages: [{ routeId: 'r1', nodeId: 'G' }, { routeId: 'r2', nodeId: 'Y' }] })).toEqual([]);
  });

  it('checks terminal rows: known node, no duplicates, whole minutes, miles', () => {
    const rules = validRules();
    expect(fieldsOf({ ...rules, terminals: [{ nodeId: 'missing', pullOutMinutes: 0, pullInMinutes: 0 }] })).toEqual(['autoBlocking.terminalNodeUnknown@terminals[0].nodeId']);
    expect(fieldsOf({ ...rules, terminals: [{ nodeId: 'A', pullOutMinutes: 0, pullInMinutes: 0 }, { nodeId: 'A', pullOutMinutes: 0, pullInMinutes: 0 }] })).toEqual(['autoBlocking.terminalDuplicate@terminals[1].nodeId']);
    expect(fieldsOf({ ...rules, terminals: [{ nodeId: 'A', pullOutMinutes: -1, pullInMinutes: 1.5 }] })).toEqual(['autoBlocking.pullOutMinutes@terminals[0].pullOutMinutes', 'autoBlocking.pullInMinutes@terminals[0].pullInMinutes']);
    expect(fieldsOf({ ...rules, terminals: [{ nodeId: 'A', pullOutMinutes: 0, pullInMinutes: 0, miles: -0.1 }] })).toEqual(['autoBlocking.terminalMiles@terminals[0].miles']);
  });

  it('checks deadhead connections: two different known nodes of one Route, minutes, miles', () => {
    const rules = validRules();
    const deadhead = rules.deadheads[0];
    expect(fieldsOf({ ...rules, deadheads: [{ ...deadhead, fromNodeId: 'missing' }] })).toEqual(['autoBlocking.deadheadNodeUnknown@deadheads[0].fromNodeId']);
    expect(fieldsOf({ ...rules, deadheads: [{ ...deadhead, toNodeId: 'A' }] })).toEqual(['autoBlocking.deadheadSameNode@deadheads[0].toNodeId']);
    expect(fieldsOf({ ...rules, deadheads: [{ ...deadhead, toNodeId: 'X' }] })).toEqual(['autoBlocking.deadheadRoute@deadheads[0].toNodeId']);
    expect(fieldsOf({ ...rules, deadheads: [{ ...deadhead, minutes: 1.5 }] })).toEqual(['autoBlocking.deadheadMinutes@deadheads[0].minutes']);
    expect(fieldsOf({ ...rules, deadheads: [{ ...deadhead, minutes: Number.NaN }] })).toEqual(['autoBlocking.deadheadMinutes@deadheads[0].minutes']);
    expect(fieldsOf({ ...rules, deadheads: [{ ...deadhead, miles: -1 }] })).toEqual(['autoBlocking.deadheadMiles@deadheads[0].miles']);
    expect(fieldsOf({ ...rules, deadheads: [{ ...deadhead, minutes: 0, miles: undefined }] })).toEqual([]);
  });
});

describe('remapAutoBlockingRecord', () => {
  const record = (): AutoBlockingRecord => ({ rules: { ...validRules(), serviceDayIds: ['d1', 'd2'], deadheads: [{ fromNodeId: 'A', toNodeId: 'B', minutes: 6, bothWays: false }, { fromNodeId: 'A', toNodeId: 'gone', minutes: 6, bothWays: false }] }, builtAt: '2026-01-01T00:00:00.000Z', tripCount: 40, blockCount: 7, sourceBlockingScenarioId: 'bs1' });
  const maps = () => ({
    patterns: new Map([['p1', 'P1']]),
    routes: new Map([['r1', 'R1']]),
    nodes: new Map([['A', 'nA'], ['B', 'nB'], ['G', 'nG']]),
    serviceDays: new Map([['d1', 'D1']]),
    blockingScenarios: new Map([['bs1', 'BS1']]),
  });

  it('remaps every reference, drops rows with no mapping, and resets builtAt', () => {
    const result = remapAutoBlockingRecord(record(), maps(), '2026-02-01T00:00:00.000Z');
    expect(result.builtAt).toBe('2026-02-01T00:00:00.000Z');
    expect(result.sourceBlockingScenarioId).toBe('BS1');
    expect([result.tripCount, result.blockCount]).toEqual([40, 7]);
    expect(result.rules.serviceDayIds).toEqual(['D1']);
    expect(result.rules.patterns.map((row) => row.patternId)).toEqual(['P1']);
    expect(result.rules.garages).toEqual([{ routeId: 'R1', nodeId: 'nG' }]);
    expect(result.rules.terminals.map((row) => row.nodeId)).toEqual(['nA']);
    expect(result.rules.deadheads).toEqual([{ fromNodeId: 'nA', toNodeId: 'nB', minutes: 6, bothWays: false }]);
    expect(result.rules.break).toEqual(record().rules.break);
  });

  it('drops the source Blocking Scenario when it is outside the copied set and does not change the input', () => {
    const original = record();
    const snapshot = JSON.stringify(original);
    const result = remapAutoBlockingRecord(original, { ...maps(), blockingScenarios: new Map() }, '2026-02-01T00:00:00.000Z');
    expect('sourceBlockingScenarioId' in result).toBe(false);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
