import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import {
  normalizePlacements,
  placementSegmentIndex,
  placementsBySegment,
  pruneRouteStopSets,
  reconcilePlacements,
  remapRouteStopSet,
  validateRouteStopSet,
} from './stops';
import type { PatternPoint, PatternStopPlacement, Route, RoutePattern, RouteStop, RouteStopSet, StopTimingRule } from './types';

const T = metadata('2026-01-01T00:00:00.000Z');

const point = (id: string, nodeId: string, sequence: number): PatternPoint => ({ id, nodeId, sequence, cumulativeMiles: sequence });
const pattern = (id: string, points: PatternPoint[], routeId = 'r'): RoutePattern => ({ ...T, id, scenarioId: 's', routeId, name: id, points });
const placement = (id: string, stopId: string, afterPatternPointId: string, sequence: number, timing: StopTimingRule = 'interpolate'): PatternStopPlacement =>
  ({ id, stopId, afterPatternPointId, sequence, timing });
const stop = (id: string, name = id, stopCode?: string): RouteStop => ({ id, name, ...(stopCode === undefined ? {} : { stopCode }) });

// Fixture of section 8.2: pattern P through nodes A, B, C, D; stops s1..s4; placements x1..x4.
const pA = point('pA', 'A', 0);
const pB = point('pB', 'B', 1);
const pC = point('pC', 'C', 2);
const pD = point('pD', 'D', 3);
const P = pattern('P', [pA, pB, pC, pD]);
const x1 = placement('x1', 's1', 'pA', 0);
const x2 = placement('x2', 's2', 'pB', 0);
const x3 = placement('x3', 's3', 'pB', 1);
const x4 = placement('x4', 's4', 'pC', 0);
const FIXTURE = [x1, x2, x3, x4];
const STOPS = [stop('s1'), stop('s2'), stop('s3'), stop('s4')];

function setOf(overrides: Partial<RouteStopSet> = {}): RouteStopSet {
  return {
    ...T,
    id: 'set',
    scenarioId: 's',
    routeId: 'r',
    roundingSeconds: 60,
    stops: STOPS,
    placementsByPatternId: { P: FIXTURE },
    ...overrides,
  };
}

describe('placementsBySegment and placementSegmentIndex', () => {
  it('groups placements by segment in sequence order and leaves out a placement after the last point', () => {
    const afterLast = placement('x5', 's1', 'pD', 0);
    expect(placementsBySegment(P, [...FIXTURE, afterLast])).toEqual([[x1], [x2, x3], [x4]]);
  });

  it('returns no segment for a placement after the last point or a missing point', () => {
    expect(placementSegmentIndex(P, placement('x5', 's1', 'pD', 0))).toBeUndefined();
    expect(placementSegmentIndex(P, placement('x6', 's1', 'nope', 0))).toBeUndefined();
    expect(placementSegmentIndex(P, x3)).toBe(1);
  });
});

describe('normalizePlacements', () => {
  it('renumbers sequences 5 and 9 to 0 and 1 and keeps their order', () => {
    const a = placement('a', 's1', 'pB', 5);
    const b = placement('b', 's2', 'pB', 9);
    expect(normalizePlacements(P, [a, b]).map((item) => [item.id, item.sequence])).toEqual([['a', 0], ['b', 1]]);
  });

  it('drops a placement on a missing point', () => {
    expect(normalizePlacements(P, [x1, placement('bad', 's1', 'nope', 0)])).toEqual([x1]);
  });

  it('returns an empty list for a pattern with one point', () => {
    const single = pattern('S', [pA]);
    expect(normalizePlacements(single, [x1])).toEqual([]);
  });
});

describe('validateRouteStopSet', () => {
  const summary = (findings: ReturnType<typeof validateRouteStopSet>) => findings.map((item) => [item.ruleId, item.severity, item.entityId]);

  it('routeStop.nameRequired: an empty name after trimming is an error', () => {
    const findings = validateRouteStopSet(setOf({ stops: [stop('s1', '   ')], placementsByPatternId: {} }), [P]);
    expect(summary(findings)).toEqual([['routeStop.nameRequired', 'error', 's1']]);
  });

  it('routeStop.codeDuplicate: stop IDs that match after trimming and case are duplicates, reported on the second stop', () => {
    const numeric = validateRouteStopSet(setOf({ stops: [stop('s1', 'One', '1001'), stop('s2', 'Two', ' 1001 ')], placementsByPatternId: {} }), [P]);
    expect(summary(numeric)).toEqual([['routeStop.codeDuplicate', 'error', 's2']]);
    expect(numeric[0].parameters).toEqual({ stopCode: '1001' });
    expect(numeric[0].field).toBe('stopCode');
    const letters = validateRouteStopSet(setOf({ stops: [stop('s1', 'One', 'AB'), stop('s2', 'Two', 'ab')], placementsByPatternId: {} }), [P]);
    expect(summary(letters)).toEqual([['routeStop.codeDuplicate', 'error', 's2']]);
  });

  it('routeStop.idDuplicate: two stops with one ID are an error', () => {
    const findings = validateRouteStopSet(setOf({ stops: [stop('s1', 'One'), stop('s1', 'Two')], placementsByPatternId: {} }), [P]);
    expect(summary(findings)).toEqual([['routeStop.idDuplicate', 'error', 's1']]);
  });

  it('stopPlacement.stopMissing: a placement whose stop is not in the set is an error', () => {
    const findings = validateRouteStopSet(setOf({ placementsByPatternId: { P: [placement('x9', 'nope', 'pA', 0)] } }), [P]);
    expect(summary(findings)).toEqual([['stopPlacement.stopMissing', 'error', 'x9']]);
  });

  it('stopPlacement.idDuplicate: two placements of one pattern with one ID are an error', () => {
    const findings = validateRouteStopSet(setOf({ placementsByPatternId: { P: [x1, placement('x1', 's2', 'pC', 0)] } }), [P]);
    expect(summary(findings)).toEqual([['stopPlacement.idDuplicate', 'error', 'x1']]);
  });

  it('stopPlacement.repeatedInSegment: one stop twice in one segment is an error on the second placement', () => {
    const findings = validateRouteStopSet(setOf({ placementsByPatternId: { P: [x2, placement('x7', 's2', 'pB', 1)] } }), [P]);
    expect(summary(findings)).toEqual([['stopPlacement.repeatedInSegment', 'error', 'x7']]);
    expect(findings[0].parameters).toEqual({ patternId: 'P', segmentIndex: 1 });
  });

  it('a stop placed in two different segments of one pattern is not a finding', () => {
    expect(validateRouteStopSet(setOf({ placementsByPatternId: { P: [x1, placement('x8', 's1', 'pB', 0)] } }), [P])).toEqual([]);
  });

  it('stopPlacement.timingOutOfOrder: a falling rank in a segment is a warning', () => {
    const findings = validateRouteStopSet(setOf({ placementsByPatternId: { P: [placement('n', 's2', 'pB', 0, 'next'), placement('i', 's3', 'pB', 1)] } }), [P]);
    expect(summary(findings)).toEqual([['stopPlacement.timingOutOfOrder', 'warning', 'n']]);
  });

  it('stopPlacement.timingOutOfOrder: rules in the order previous, interpolate, interpolate, next give no warning', () => {
    const ordered = [placement('p', 's1', 'pB', 0, 'previous'), placement('i1', 's2', 'pB', 1), placement('i2', 's3', 'pB', 2), placement('n', 's4', 'pB', 3, 'next')];
    expect(validateRouteStopSet(setOf({ placementsByPatternId: { P: ordered } }), [P])).toEqual([]);
  });

  it('routeStopSet.roundingInvalid: a rounding other than 30 or 60 is an error on the set', () => {
    const findings = validateRouteStopSet(setOf({ roundingSeconds: 45 as unknown as 30 }), [P]);
    expect(summary(findings)).toEqual([['routeStopSet.roundingInvalid', 'error', 'set']]);
    expect(findings[0].field).toBe('roundingSeconds');
  });

  it('gives no findings for a valid set', () => {
    expect(validateRouteStopSet(setOf(), [P])).toEqual([]);
  });
});

describe('pruneRouteStopSets', () => {
  const routes: Route[] = [{ ...T, id: 'r', scenarioId: 's', name: 'R' }];

  it('drops the set of a deleted Route', () => {
    expect(pruneRouteStopSets([setOf({ routeId: 'gone' })], { routes, patterns: [P] })).toEqual([]);
  });

  it('drops the entry of a deleted pattern', () => {
    const [pruned] = pruneRouteStopSets([setOf({ placementsByPatternId: { P: FIXTURE, Q: [placement('q1', 's1', 'pA', 0)] } })], { routes, patterns: [P] });
    expect(Object.keys(pruned.placementsByPatternId)).toEqual(['P']);
  });

  it('drops a stop that no placement uses', () => {
    const [pruned] = pruneRouteStopSets([setOf({ stops: [...STOPS, stop('unused')] })], { routes, patterns: [P] });
    expect(pruned.stops.map((item) => item.id)).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('drops a set left with no stops', () => {
    const set = setOf({ placementsByPatternId: {} });
    expect(pruneRouteStopSets([set], { routes, patterns: [P] })).toEqual([]);
  });

  it('returns the same array when nothing changed', () => {
    const sets = [setOf()];
    expect(pruneRouteStopSets(sets, { routes, patterns: [P] })).toBe(sets);
  });
});

describe('reconcilePlacements', () => {
  const pX = point('pX', 'X', 1);
  const without = (...ids: string[]) => pattern('P', [pA, pB, pC, pD].filter((item) => !ids.includes(item.id)).map((item, sequence) => ({ ...item, sequence })));

  it('removing pB moves x2 and x3 to pA after x1', () => {
    const result = reconcilePlacements(P, without('pB'), FIXTURE);
    expect(result.movedCount).toBe(2);
    expect(result.removedCount).toBe(0);
    expect(result.placements).toEqual([
      { ...x1, sequence: 0 },
      { ...x2, afterPatternPointId: 'pA', sequence: 1 },
      { ...x3, afterPatternPointId: 'pA', sequence: 2 },
      { ...x4, sequence: 0 },
    ]);
  });

  it('removing pA, the first point, removes x1', () => {
    const result = reconcilePlacements(P, without('pA'), FIXTURE);
    expect(result.removedCount).toBe(1);
    expect(result.movedCount).toBe(0);
    expect(result.placements.map((item) => item.id)).toEqual(['x2', 'x3', 'x4']);
  });

  it('removing pD, the last point, removes x4 whose point pC is now last', () => {
    const result = reconcilePlacements(P, without('pD'), FIXTURE);
    expect(result.removedCount).toBe(1);
    expect(result.placements.map((item) => item.id)).toEqual(['x1', 'x2', 'x3']);
  });

  it('inserting pX between pA and pB keeps x1 on pA and changes no counts', () => {
    const next = pattern('P', [pA, { ...pX, sequence: 1 }, { ...pB, sequence: 2 }, { ...pC, sequence: 3 }, { ...pD, sequence: 4 }]);
    const result = reconcilePlacements(P, next, FIXTURE);
    expect(result.movedCount).toBe(0);
    expect(result.removedCount).toBe(0);
    expect(result.placements.find((item) => item.id === 'x1')?.afterPatternPointId).toBe('pA');
  });

  it('reducing the pattern to pA alone removes every placement', () => {
    const result = reconcilePlacements(P, pattern('P', [pA]), FIXTURE);
    expect(result.placements).toEqual([]);
    expect(result.removedCount).toBe(4);
  });

  it('removing pB and pC moves x2, x3 and x4 to pA in that order', () => {
    const result = reconcilePlacements(P, without('pB', 'pC'), FIXTURE);
    expect(result.movedCount).toBe(3);
    expect(result.removedCount).toBe(0);
    expect(result.placements.map((item) => [item.id, item.afterPatternPointId, item.sequence])).toEqual([
      ['x1', 'pA', 0],
      ['x2', 'pA', 1],
      ['x3', 'pA', 2],
      ['x4', 'pA', 3],
    ]);
  });
});

describe('remapRouteStopSet', () => {
  const set = setOf({ placementsByPatternId: { P: FIXTURE, Q: [placement('q1', 's1', 'pA', 0)] } });
  const target = {
    id: 'new-set',
    scenarioId: 's2',
    routeId: 'r2',
    patternIds: new Map([['P', 'P2']]),
    pointIds: new Map([['pA', 'qA'], ['pC', 'qC'], ['pD', 'qD']]),
  };

  it('maps pattern keys and points, keeps stop and placement IDs, and drops an unmapped pattern and an unmapped point', () => {
    const copy = remapRouteStopSet(set, target, '2026-02-02T00:00:00.000Z');
    expect(copy).toMatchObject({ id: 'new-set', scenarioId: 's2', routeId: 'r2', createdAt: '2026-02-02T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' });
    expect(Object.keys(copy.placementsByPatternId)).toEqual(['P2']);
    expect(copy.placementsByPatternId.P2).toEqual([
      { ...x1, afterPatternPointId: 'qA' },
      { ...x4, afterPatternPointId: 'qC' },
    ]);
    expect(copy.stops).toEqual(STOPS);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(set);
    const copy = remapRouteStopSet(set, target, '2026-02-02T00:00:00.000Z');
    expect(JSON.stringify(set)).toBe(before);
    expect(copy.stops).not.toBe(set.stops);
    expect(copy.stops[0]).not.toBe(set.stops[0]);
  });
});
