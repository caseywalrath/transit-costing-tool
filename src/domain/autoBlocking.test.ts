import { describe, expect, it } from 'vitest';
import { autoBlockingEditedCount, buildAutoBlocks, checkAgainstBuiltBlocks, defaultAutoBlockingRules, describeBreakRule, measureBuiltBlocks, remapAutoBlockingRecord, summarizeAutoBlockingRules, validateAutoBlockingRules, type AutoBlockingContext, type AutoBlockingRecord, type AutoBlockingRules } from './autoBlocking';
import { metadata } from './ids';
import type { BlockingBlock, BlockingScenario, Node, Route, RouteDirection, RoutePattern, ServiceDayDefinition, Trip } from './types';

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

// ---------------------------------------------------------------------------------------------------------------------
// Engine fixtures: a synthetic out-and-back Route that mirrors docs/implementation/automatic-blocking/synthetic-check.py
// ---------------------------------------------------------------------------------------------------------------------

const NOW = '2026-01-01T00:00:00.000Z';
const meta = metadata(NOW);
const counter = () => { let next = 0; return () => `id-${next++}`; };
const day = (id: string, kind: ServiceDayDefinition['kind'], name: string, sequence: number): ServiceDayDefinition => ({ id, scenarioId: 's', kind, name, annualServiceDays: 100, sequence, ...meta });

function outAndBack(runMinutes: number, options: { extraTrips?: Trip[]; nodes?: Node[]; routes?: Route[]; patterns?: RoutePattern[]; directions?: RouteDirection[]; serviceDays?: ServiceDayDefinition[] } = {}) {
  const route: Route = { id: 'r', scenarioId: 's', name: 'Route 1', ...meta };
  const nodes: Node[] = [
    { id: 'A', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal', ...meta },
    { id: 'B', scenarioId: 's', routeId: 'r', name: 'B', kind: 'terminal', ...meta },
  ];
  const directions: RouteDirection[] = [
    { id: 'dOut', scenarioId: 's', routeId: 'r', name: 'Outbound', group: 'outbound', sequence: 0, columns: [], ...meta },
    { id: 'dIn', scenarioId: 's', routeId: 'r', name: 'Inbound', group: 'inbound', sequence: 1, columns: [], ...meta },
  ];
  const patterns: RoutePattern[] = [
    { id: 'AB', scenarioId: 's', routeId: 'r', name: 'To B', directionId: 'dOut', sequence: 0, points: [{ id: 'AB0', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'AB1', nodeId: 'B', sequence: 1, cumulativeMiles: 5 }], ...meta },
    { id: 'BA', scenarioId: 's', routeId: 'r', name: 'To A', directionId: 'dIn', sequence: 1, points: [{ id: 'BA0', nodeId: 'B', sequence: 0, cumulativeMiles: 0 }, { id: 'BA1', nodeId: 'A', sequence: 1, cumulativeMiles: 5 }], ...meta },
  ];
  const trips: Trip[] = [];
  for (let k = 0; k < 29; k += 1) {
    const out = 9 * 3600 + 900 * k; const back = 9 * 3600 + runMinutes * 60 + 900 * k;
    trips.push(
      { id: `ab-${String(k).padStart(2, '0')}`, scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId: 'AB', tripProfileId: 'tp', stopTimes: [{ patternPointId: 'AB0', sequence: 0, time: out }, { patternPointId: 'AB1', sequence: 1, time: out + runMinutes * 60 }], provenance: 'manual' as never, ...meta },
      { id: `ba-${String(k).padStart(2, '0')}`, scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId: 'BA', tripProfileId: 'tp', stopTimes: [{ patternPointId: 'BA0', sequence: 0, time: back }, { patternPointId: 'BA1', sequence: 1, time: back + runMinutes * 60 }], provenance: 'manual' as never, ...meta },
    );
  }
  const context: AutoBlockingContext = {
    scenarioId: 's', routes: options.routes ?? [route], patterns: options.patterns ?? patterns, nodes: options.nodes ?? nodes, directions: options.directions ?? directions,
    serviceDays: options.serviceDays ?? [day('wk', 'weekday', 'Weekday', 0)], trips: [...trips, ...(options.extraTrips ?? [])],
  };
  return context;
}
const blockingScenario: BlockingScenario = { id: 'bs', scenarioId: 's', tripProfileId: 'tp', name: 'Auto', ...meta };
const baseRules = (patch: Partial<AutoBlockingRules> = {}): AutoBlockingRules => ({
  serviceDayIds: ['wk'],
  patterns: [
    { patternId: 'AB', breakAllowed: false, canStart: true, canEnd: true },
    { patternId: 'BA', minimumLayover: { mode: 'minutes', value: 20 }, breakAllowed: true, canStart: true, canEnd: true },
  ],
  break: { lengthMinutes: 35, minimumBlockHours: 4, firstBreakAfterHours: 1 },
  garages: [], terminals: [], deadheads: [], ...patch,
});
const build = (context: AutoBlockingContext, rules: AutoBlockingRules) => buildAutoBlocks({ ...context, blockingScenario, rules, now: NOW, newId: counter() });
/** Block spans in minutes, sorted, from the Trips each Block holds. */
function spansOf(blocks: BlockingBlock[], context: AutoBlockingContext): number[] {
  const trips = new Map(context.trips.map((trip) => [trip.id, trip]));
  return blocks.map((block) => {
    const ids = block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : []);
    return (trips.get(ids.at(-1)!)!.stopTimes[1].time - trips.get(ids[0])!.stopTimes[0].time) / 60;
  }).sort((left, right) => left - right);
}

describe('buildAutoBlocks: reference results from synthetic-check.py', () => {
  it('35-minute Trips with breaks: 7 blocks, 2560 minutes, 6 with a break', () => {
    const context = outAndBack(35); const result = build(context, baseRules());
    expect(result.blocks).toHaveLength(7);
    expect(spansOf(result.blocks, context)).toEqual([70, 355, 355, 445, 445, 445, 445]);
    expect(spansOf(result.blocks, context).reduce((sum, value) => sum + value, 0)).toBe(2560);
    expect(result.days[0]).toMatchObject({ blockCount: 7, tripCount: 58, revenueSeconds: 153600, blocksWithOneBreak: 6, blocksWithTwoOrMoreBreaks: 0 });
    expect(result.blockFindings.filter((finding) => finding.severity === 'error')).toEqual([]);
    expect(result.blocks.map((block) => block.label)).toEqual(['Block 1', 'Block 2', 'Block 3', 'Block 4', 'Block 5', 'Block 6', 'Block 7']);
  });

  it('46-minute Trips with breaks: 9 blocks, 3348 minutes, 8 with a break', () => {
    const context = outAndBack(46); const result = build(context, baseRules());
    expect(spansOf(result.blocks, context)).toEqual([92, 347, 347, 347, 347, 467, 467, 467, 467]);
    expect(spansOf(result.blocks, context).reduce((sum, value) => sum + value, 0)).toBe(3348);
    expect(result.days[0].blocksWithOneBreak).toBe(8);
    expect(result.blockFindings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('35-minute Trips without a break rule: 6 blocks, 2490 minutes', () => {
    const context = outAndBack(35); const result = build(context, baseRules({ break: undefined }));
    expect(spansOf(result.blocks, context)).toEqual([340, 430, 430, 430, 430, 430]);
    expect(spansOf(result.blocks, context).reduce((sum, value) => sum + value, 0)).toBe(2490);
    expect(result.days[0].blocksWithOneBreak).toBe(0);
    expect(result.passes).toBe(1);
  });

  it('minimum block length of 7 h suppresses the break on short blocks by rebuilding: 7 blocks, 2530 minutes, 4 with a break', () => {
    const context = outAndBack(35); const result = build(context, baseRules({ break: { lengthMinutes: 35, minimumBlockHours: 7, firstBreakAfterHours: 1 } }));
    expect(spansOf(result.blocks, context)).toEqual([70, 340, 340, 445, 445, 445, 445]);
    expect(spansOf(result.blocks, context).reduce((sum, value) => sum + value, 0)).toBe(2530);
    expect(result.days[0].blocksWithOneBreak).toBe(4);
    expect(result.passes).toBeGreaterThanOrEqual(2);
  });
});

describe('buildAutoBlocks: rules', () => {
  const noBreak = (patch: Partial<AutoBlockingRules> = {}) => baseRules({ break: undefined, ...patch });
  /** A short line: Trips A to B at 8:00 and C to A at 9:00 (Route with a third node C). */
  function deadheadFixture() {
    const context = outAndBack(35);
    const nodeC: Node = { id: 'C', scenarioId: 's', routeId: 'r', name: 'C', kind: 'terminal', ...meta };
    const patternBC: RoutePattern = { id: 'CA', scenarioId: 's', routeId: 'r', name: 'C to A', points: [{ id: 'CA0', nodeId: 'C', sequence: 0, cumulativeMiles: 0 }, { id: 'CA1', nodeId: 'A', sequence: 1, cumulativeMiles: 3 }], ...meta };
    const trip = (id: string, patternId: string, a: string, b: string, start: number, end: number): Trip => ({ id, scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId, tripProfileId: 'tp', stopTimes: [{ patternPointId: a, sequence: 0, time: start }, { patternPointId: b, sequence: 1, time: end }], provenance: 'manual' as never, ...meta });
    return {
      ...context, nodes: [...context.nodes, nodeC], patterns: [...context.patterns, patternBC],
      trips: [trip('x1', 'AB', 'AB0', 'AB1', 8 * 3600, 8 * 3600 + 1800), trip('x2', 'CA', 'CA0', 'CA1', 9 * 3600, 9 * 3600 + 1800)],
    } as AutoBlockingContext;
  }
  const deadheadRules = (patch: Partial<AutoBlockingRules> = {}) => noBreak({
    patterns: [
      { patternId: 'AB', breakAllowed: false, canStart: true, canEnd: true },
      { patternId: 'CA', breakAllowed: false, canStart: true, canEnd: true },
    ], ...patch,
  });

  it('applies a percent layover: 50% of a 30-minute Trip needs 15 minutes', () => {
    const context = outAndBack(30);
    const rules = noBreak({ patterns: [{ patternId: 'AB', minimumLayover: { mode: 'percent', value: 50 }, breakAllowed: false, canStart: true, canEnd: true }, { patternId: 'BA', breakAllowed: false, canStart: true, canEnd: true }] });
    // AB trip k=0 arrives B at 9:30 and may take BA trip k=0 only from 9:45; BA k=0 departs 9:30, so a new vehicle is needed for it.
    const result = build(context, rules);
    const first = result.blocks[0].activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => (activity as { tripId: string }).tripId);
    expect(first.slice(0, 2)).toEqual(['ab-00', 'ba-01']);
  });

  it('breaks the chain without a connection and chains with one (deadhead of 10 minutes)', () => {
    const context = deadheadFixture();
    const without = build(context, deadheadRules());
    expect(without.blocks).toHaveLength(2);
    expect(without.findings.some((finding) => finding.ruleId === 'autoBlocking.deadEndNode' && finding.parameters?.nodeId === 'B')).toBe(true);
    const connected = build(context, deadheadRules({ deadheads: [{ fromNodeId: 'B', toNodeId: 'C', minutes: 10, bothWays: false }] }));
    expect(connected.blocks).toHaveLength(1);
    const deadhead = connected.blocks[0].activities.find((activity) => activity.type === 'deadhead');
    expect(deadhead).toMatchObject({ fromNodeId: 'B', toNodeId: 'C', minutesAfterPreviousTrip: 10 });
    expect(connected.findings.some((finding) => finding.ruleId === 'autoBlocking.deadEndNode' && finding.parameters?.nodeId === 'B')).toBe(false);
    expect(connected.blockFindings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('uses a connection in reverse only when bothWays is set', () => {
    const context = deadheadFixture();
    const reverse = { fromNodeId: 'C', toNodeId: 'B', minutes: 10 };
    expect(build(context, deadheadRules({ deadheads: [{ ...reverse, bothWays: false }] })).blocks).toHaveLength(2);
    expect(build(context, deadheadRules({ deadheads: [{ ...reverse, bothWays: true }] })).blocks).toHaveLength(1);
  });

  it('does not use a connection that arrives too late', () => {
    const context = deadheadFixture();
    expect(build(context, deadheadRules({ deadheads: [{ fromNodeId: 'B', toNodeId: 'C', minutes: 40, bothWays: false }] })).blocks).toHaveLength(2);
  });

  it('maxRunningHours splits a long chain and warns when one Trip exceeds the limit', () => {
    const context = outAndBack(35);
    const unlimited = build(context, noBreak());
    const limited = build(context, noBreak({ maxRunningHours: 3 }));
    expect(limited.blocks.length).toBeGreaterThan(unlimited.blocks.length);
    expect(limited.days[0].runningSeconds).toBe(unlimited.days[0].runningSeconds);
    const tooTight = build(context, noBreak({ maxRunningHours: 0.25 }));
    expect(tooTight.blocks).toHaveLength(58);
    expect(tooTight.findings.some((finding) => finding.ruleId === 'autoBlocking.tripExceedsLimit')).toBe(true);
  });

  it('maxRevenueMiles limits a block and is ignored with a warning when miles are incomplete', () => {
    const context = outAndBack(35);
    expect(build(context, noBreak({ maxRevenueMiles: 30 })).blocks.length).toBeGreaterThan(build(context, noBreak()).blocks.length);
    const noMiles = { ...context, patterns: context.patterns.map((pattern) => pattern.id === 'AB' ? { ...pattern, points: pattern.points.map((point) => ({ ...point, cumulativeMiles: 0 })) } : pattern) };
    const result = build(noMiles, noBreak({ maxRevenueMiles: 50 }));
    expect(result.blocks).toHaveLength(6);
    expect(result.findings.some((finding) => finding.ruleId === 'autoBlocking.revenueMilesUnavailable')).toBe(true);
  });

  it('warns when a Block must start or end on a Pattern that cannot', () => {
    const context = outAndBack(35);
    // Blocks start with an outbound Trip (the first Trip of the day) and end after an inbound one.
    const noStartAB = noBreak({ patterns: [{ patternId: 'AB', breakAllowed: false, canStart: false, canEnd: true }, { patternId: 'BA', minimumLayover: { mode: 'minutes', value: 20 }, breakAllowed: true, canStart: true, canEnd: true }] });
    expect(build(context, noStartAB).findings.some((finding) => finding.ruleId === 'autoBlocking.startNotAllowed' && finding.parameters?.patternId === 'AB')).toBe(true);
    const noEndBA = noBreak({ patterns: [{ patternId: 'AB', breakAllowed: false, canStart: true, canEnd: true }, { patternId: 'BA', minimumLayover: { mode: 'minutes', value: 20 }, breakAllowed: true, canStart: true, canEnd: false }] });
    const ended = build(context, noEndBA).findings.find((finding) => finding.ruleId === 'autoBlocking.endNotAllowed');
    expect(ended?.parameters).toMatchObject({ patternId: 'BA', blockLabel: expect.stringMatching(/^Block \d+$/) });
  });

  it('writes pull-out and pull-in from the garage and terminal rows, or from the terminal without a garage', () => {
    const base = outAndBack(35);
    const garageNode: Node = { id: 'G', scenarioId: 's', routeId: 'r', name: 'Garage', kind: 'garage', ...meta };
    const context = { ...base, nodes: [...base.nodes, garageNode] };
    const terminals = [{ nodeId: 'A', pullOutMinutes: 12, pullInMinutes: 8, miles: 2.5 }, { nodeId: 'B', pullOutMinutes: 14, pullInMinutes: 9, miles: 3 }];
    const withGarage = build(context, noBreak({ garages: [{ routeId: 'r', nodeId: 'G' }], terminals }));
    const firstBlock = withGarage.blocks[0];
    const pullOut = firstBlock.activities[0]; const pullIn = firstBlock.activities.at(-1)!;
    expect(pullOut).toMatchObject({ type: 'pullOut', fromNodeId: 'G', toNodeId: 'A', minutesBeforeFirstTrip: 12, miles: 2.5 });
    expect(pullIn).toMatchObject({ type: 'pullIn', toNodeId: 'G', fromNodeId: 'A', minutesAfterLastTrip: 8, miles: 2.5 });
    expect(withGarage.blockFindings.filter((finding) => finding.severity === 'error')).toEqual([]);
    const none = build(context, noBreak({ terminals })).blocks[0];
    expect(none.activities[0]).toMatchObject({ type: 'pullOut', fromNodeId: 'A', toNodeId: 'A', minutesBeforeFirstTrip: 12 });
    expect('miles' in none.activities[0]).toBe(false);
    expect('toNodeId' in none.activities.at(-1)!).toBe(false);
  });

  it('ignores Trips of other days, other Trip Profiles and other Scenarios, and numbers Routes in name order', () => {
    const base = outAndBack(35);
    const stray = (patch: Partial<Trip>): Trip => ({ ...base.trips[0], id: `stray-${Object.keys(patch).join('-')}`, ...patch });
    const extra = [stray({ serviceDayId: 'sa' }), stray({ tripProfileId: 'other' }), stray({ scenarioId: 'other' })];
    expect(build({ ...base, trips: [...base.trips, ...extra] }, noBreak()).blocks).toHaveLength(6);

    const route2: Route = { id: 'r2', scenarioId: 's', name: 'Aardvark', ...meta };
    const nodes2: Node[] = [{ id: 'P', scenarioId: 's', routeId: 'r2', name: 'P', kind: 'terminal', ...meta }, { id: 'Q', scenarioId: 's', routeId: 'r2', name: 'Q', kind: 'terminal', ...meta }];
    const pattern2: RoutePattern = { id: 'PQ', scenarioId: 's', routeId: 'r2', name: 'P to Q', points: [{ id: 'PQ0', nodeId: 'P', sequence: 0, cumulativeMiles: 0 }, { id: 'PQ1', nodeId: 'Q', sequence: 1, cumulativeMiles: 2 }], ...meta };
    const trip2: Trip = { id: 'z1', scenarioId: 's', routeId: 'r2', serviceDayId: 'wk', patternId: 'PQ', tripProfileId: 'tp', stopTimes: [{ patternPointId: 'PQ0', sequence: 0, time: 20 * 3600 }, { patternPointId: 'PQ1', sequence: 1, time: 20 * 3600 + 600 }], provenance: 'manual' as never, ...meta };
    const two = build({ ...base, routes: [...base.routes, route2], nodes: [...base.nodes, ...nodes2], patterns: [...base.patterns, pattern2], trips: [...base.trips, trip2] }, noBreak({ patterns: [...noBreak().patterns, { patternId: 'PQ', breakAllowed: false, canStart: true, canEnd: true }] }));
    const first = two.blocks[0].activities.find((activity) => activity.type === 'revenueTrip') as { tripId: string };
    expect(first.tripId).toBe('z1');
    expect(two.blocks.map((block) => block.label)[0]).toBe('Block 1');
    expect(two.blocks).toHaveLength(7);
  });

  it('is deterministic for shuffled input', () => {
    const context = outAndBack(35);
    const shuffled = { ...context, trips: [...context.trips].reverse() };
    expect(build(shuffled, baseRules())).toEqual(build(context, baseRules()));
  });

  describe('vehicle choice (Decision 0056)', () => {
    /** Trips on the deadhead fixture's nodes A, B and C; no layover, no break. */
    const choiceRules = (patch: Partial<AutoBlockingRules> = {}) => noBreak({
      patterns: [
        { patternId: 'AB', breakAllowed: false, canStart: true, canEnd: true },
        { patternId: 'BA', breakAllowed: false, canStart: true, canEnd: true },
        { patternId: 'CA', breakAllowed: false, canStart: true, canEnd: true },
      ], ...patch,
    });
    const at = (hours: number, minutes: number) => hours * 3600 + minutes * 60;
    const trip = (id: string, patternId: 'AB' | 'BA', start: number, end: number): Trip => ({
      id, scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId, tripProfileId: 'tp',
      stopTimes: [{ patternPointId: `${patternId}0`, sequence: 0, time: start }, { patternPointId: `${patternId}1`, sequence: 1, time: end }], provenance: 'manual' as never, ...meta,
    });
    const withTrips = (trips: Trip[]) => ({ ...deadheadFixture(), trips });
    const tripsOf = (block: BlockingBlock) => block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : []);

    it('gives the Trip to the vehicle that became ready most recently, so the other Block ends', () => {
      const context = withTrips([trip('t1', 'BA', at(7, 0), at(7, 30)), trip('t2', 'BA', at(7, 10), at(7, 50)), trip('t3', 'AB', at(8, 0), at(8, 30))]);
      const result = build(context, choiceRules());
      expect(result.blocks.map(tripsOf)).toEqual([['t1'], ['t2', 't3']]);
    });

    it('gives the Trip to the earlier-created Block when two vehicles are ready at the same time', () => {
      const context = withTrips([trip('t1', 'BA', at(7, 0), at(7, 30)), trip('t2', 'BA', at(7, 10), at(7, 30)), trip('t3', 'AB', at(8, 0), at(8, 30))]);
      const result = build(context, choiceRules());
      expect(result.blocks.map(tripsOf)).toEqual([['t1', 't3'], ['t2']]);
    });

    it('prefers a direct candidate to a deadhead candidate, even one that became ready later', () => {
      // t1 leaves a vehicle at A ready 7:30. t2 leaves a vehicle at B ready 7:35, which reaches A at 7:45 by deadhead.
      const context = withTrips([trip('t1', 'BA', at(7, 0), at(7, 30)), trip('t2', 'AB', at(7, 5), at(7, 35)), trip('t3', 'AB', at(8, 0), at(8, 30))]);
      const result = build(context, choiceRules({ deadheads: [{ fromNodeId: 'B', toNodeId: 'A', minutes: 10, bothWays: false }] }));
      expect(result.blocks.map(tripsOf)).toEqual([['t1', 't3'], ['t2']]);
      expect(result.blocks.flatMap((block) => block.activities).some((activity) => activity.type === 'deadhead')).toBe(false);
    });

    it('uses a deadhead candidate when no direct candidate can take the Trip', () => {
      const context = withTrips([trip('t2', 'AB', at(7, 5), at(7, 35)), trip('t3', 'AB', at(8, 0), at(8, 30))]);
      const result = build(context, choiceRules({ deadheads: [{ fromNodeId: 'B', toNodeId: 'A', minutes: 10, bothWays: false }] }));
      expect(result.blocks.map(tripsOf)).toEqual([['t2', 't3']]);
      expect(result.blocks[0].activities.find((activity) => activity.type === 'deadhead')).toMatchObject({ fromNodeId: 'B', toNodeId: 'A', minutesAfterPreviousTrip: 10 });
    });
  });

  it('skips Trips without run times and reports a missing Pattern row', () => {
    const context = outAndBack(35);
    const broken: Trip = { ...context.trips[0], id: 'broken', stopTimes: [context.trips[0].stopTimes[0]] };
    const result = build({ ...context, trips: [...context.trips, broken] }, noBreak({ patterns: [noBreak().patterns[0]] }));
    expect(result.findings.some((finding) => finding.ruleId === 'autoBlocking.tripWithoutTimes' && finding.parameters?.tripId === 'broken')).toBe(true);
    expect(result.findings.some((finding) => finding.ruleId === 'autoBlocking.patternRuleMissing' && finding.parameters?.patternId === 'BA')).toBe(true);
  });
});

describe('defaultAutoBlockingRules', () => {
  it('derives start, end and break from node kinds, layover from the preference, and lists only days with Trips', () => {
    const base = outAndBack(35);
    const nodes = base.nodes.map((node) => node.id === 'B' ? { ...node, kind: 'timepoint' as const } : node);
    const context = { ...base, nodes, serviceDays: [day('wk', 'weekday', 'Weekday', 0), day('sa', 'saturday', 'Saturday', 1)] };
    const rules = defaultAutoBlockingRules(context, 'tp', { inbound: { mode: 'minutes', value: 20 } });
    expect(rules.serviceDayIds).toEqual(['wk']);
    expect(rules.patterns).toEqual([
      { patternId: 'AB', breakAllowed: false, canStart: true, canEnd: false },
      { patternId: 'BA', minimumLayover: { mode: 'minutes', value: 20 }, breakAllowed: true, canStart: false, canEnd: true },
    ]);
    expect(rules.terminals).toEqual([{ nodeId: 'A', pullOutMinutes: 0, pullInMinutes: 0 }]);
    expect([rules.break, rules.garages, rules.deadheads]).toEqual([undefined, [], []]);
  });
});

describe('describeBreakRule and summarizeAutoBlockingRules', () => {
  it('counts breaks for 4, 8 and 16 hour blocks', () => {
    expect(describeBreakRule({ lengthMinutes: 35, minimumBlockHours: 4, firstBreakAfterHours: 1, anotherBreakAfterHours: 8 })).toEqual([{ hours: 4, breaks: 0 }, { hours: 8, breaks: 1 }, { hours: 16, breaks: 2 }]);
    expect(describeBreakRule({ lengthMinutes: 35, minimumBlockHours: 4, firstBreakAfterHours: 1 })).toEqual([{ hours: 4, breaks: 0 }, { hours: 8, breaks: 1 }, { hours: 16, breaks: 1 }]);
    expect(describeBreakRule(undefined)).toEqual([{ hours: 4, breaks: 0 }, { hours: 8, breaks: 0 }, { hours: 16, breaks: 0 }]);
  });

  it('writes a one-line summary', () => {
    const context = outAndBack(35);
    const rules = baseRules({ break: { lengthMinutes: 35, minimumBlockHours: 4, firstBreakAfterHours: 1, anotherBreakAfterHours: 8 }, maxRunningHours: 9, deadheads: [{ fromNodeId: 'A', toNodeId: 'B', minutes: 5, bothWays: true }, { fromNodeId: 'B', toNodeId: 'A', minutes: 5, bothWays: false }] });
    expect(summarizeAutoBlockingRules(rules, context.patterns, context.nodes, [day('wk', 'weekday', 'Weekday', 0)])).toBe(
      'Minimum layover: To B none, To A 20 min · break: 35 min after To A, from 1 h, blocks over 4 h · again after 8 h · max 9 running h · 2 deadhead connections · Weekday');
  });
});

describe('measureBuiltBlocks and checkAgainstBuiltBlocks', () => {
  /** Build blocks with the layover pattern of the Jeffco 2025 Baseline: 20 minutes after inbound, none after outbound, one 50-minute break. */
  const sourceFrom = (context: AutoBlockingContext, rules: AutoBlockingRules) => {
    const result = build(context, rules);
    return { ...context, blocks: result.blocks, blockingScenario };
  };
  const breakRules = baseRules({ break: { lengthMinutes: 50, minimumBlockHours: 4, firstBreakAfterHours: 1 } });

  it('reads minimum layovers, can start/end, and a break from built blocks (matching by name)', () => {
    const context = outAndBack(35); const source = sourceFrom(context, breakRules);
    const draft = baseRules({ patterns: baseRules().patterns.map((row) => ({ ...row, minimumLayover: undefined, breakAllowed: false, canStart: false, canEnd: false })), break: undefined });
    const measured = measureBuiltBlocks({ source, target: context, targetRules: draft });
    expect(measured.rules.break?.lengthMinutes).toBe(50);
    expect(measured.rules.break?.firstBreakAfterHours).toBeGreaterThanOrEqual(1);
    const to = new Map(measured.rules.patterns.map((row) => [row.patternId, row]));
    expect(to.get('BA')).toMatchObject({ minimumLayover: { mode: 'minutes', value: 20 }, breakAllowed: true });
    expect(to.get('AB')?.minimumLayover).toBeUndefined();
    expect(to.get('AB')?.breakAllowed).toBe(false);
    expect(measured.lines.filter((line) => line.basis === 'sameName')).toHaveLength(2);
  });

  it('falls back to the direction group when names differ, and leaves unmatched rows unchanged', () => {
    const context = outAndBack(35); const source = sourceFrom(context, breakRules);
    const renamed = { ...context, patterns: context.patterns.map((pattern) => ({ ...pattern, name: `Renamed ${pattern.id}` })) };
    const measured = measureBuiltBlocks({ source, target: renamed, targetRules: baseRules() });
    expect(measured.lines.filter((line) => line.basis === 'sameDirection')).toHaveLength(2);
    expect(measured.rules.patterns.find((row) => row.patternId === 'BA')?.minimumLayover).toEqual({ mode: 'minutes', value: 20 });
    const stranger = { ...renamed, directions: [], patterns: renamed.patterns.map((pattern) => ({ ...pattern, directionId: undefined })) };
    const unmatched = measureBuiltBlocks({ source, target: stranger, targetRules: baseRules() });
    expect(unmatched.lines.filter((line) => line.basis === 'notMatched')).toHaveLength(2);
    expect(unmatched.rules.patterns).toEqual(baseRules().patterns);
  });

  it('measures the break from Blocks with a long gap only, so a Block with only turn layovers does not hide it (Decision 0056 item 4)', () => {
    const context = outAndBack(35); const source = sourceFrom(context, breakRules);
    // The new vehicle choice leaves one short Block whose only gap is a turn layover at B.
    const trips = new Map(context.trips.map((trip) => [trip.id, trip]));
    const longestGapMinutes = (block: BlockingBlock) => {
      const ids = block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : []);
      return Math.max(0, ...ids.slice(1).map((id, index) => (trips.get(id)!.stopTimes[0].time - trips.get(ids[index])!.stopTimes[1].time) / 60));
    };
    const multiTrip = source.blocks.filter((block) => block.activities.filter((activity) => activity.type === 'revenueTrip').length >= 2);
    expect(multiTrip.some((block) => longestGapMinutes(block) <= 25)).toBe(true);
    expect(multiTrip.some((block) => longestGapMinutes(block) >= 50)).toBe(true);
    const measured = measureBuiltBlocks({ source, target: context, targetRules: baseRules({ break: undefined }) });
    expect(measured.rules.break?.lengthMinutes).toBe(50);
  });

  it('keeps the draft break when the built blocks hold none', () => {
    const context = outAndBack(35); const source = sourceFrom(context, baseRules({ break: undefined }));
    const draft = baseRules();
    expect(measureBuiltBlocks({ source, target: context, targetRules: draft }).rules.break).toEqual(draft.break);
  });

  it('checks the rules against the built blocks and reports both sides', () => {
    const context = outAndBack(35); const source = sourceFrom(context, breakRules);
    const check = checkAgainstBuiltBlocks({ source, rules: breakRules, now: NOW, target: context });
    expect(check.days).toHaveLength(1);
    expect(check.days[0]).toMatchObject({ serviceDayId: 'wk', name: 'Weekday', builtBlocks: source.blocks.length, autoBlocks: source.blocks.length });
    expect(check.days[0].autoRevenueSeconds).toBe(check.days[0].builtRevenueSeconds);
    expect(check.differencePercent).toBe(0);
    const different = checkAgainstBuiltBlocks({ source, rules: baseRules({ break: undefined }), now: NOW });
    expect(different.differencePercent).toBeLessThan(0);
  });
});

describe('autoBlockingEditedCount', () => {
  it('counts Blocks updated after the build and a changed Block count', () => {
    const record: AutoBlockingRecord = { rules: baseRules(), builtAt: '2026-01-01T00:00:00.000Z', tripCount: 4, blockCount: 2 };
    const block = (updatedAt: string) => ({ id: updatedAt, scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'wk', label: 'b', activities: [], createdAt: NOW, updatedAt });
    expect(autoBlockingEditedCount(record, [block(NOW), block('2026-01-02T00:00:00.000Z')])).toEqual({ editedBlockCount: 1, blockCountChanged: false });
    expect(autoBlockingEditedCount(record, [block(NOW)])).toEqual({ editedBlockCount: 0, blockCountChanged: true });
  });
});
