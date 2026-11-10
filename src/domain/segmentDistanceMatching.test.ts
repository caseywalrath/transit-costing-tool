import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { validatePattern } from './patterns';
import { applySegmentDistancePlan, copyCandidatePatternIds, planDistanceCopy, planDistanceFill } from './segmentDistanceMatching';
import type { Node, PatternPoint, RoutePattern } from './types';

const T = metadata('2026-01-01T00:00:00.000Z');
const NODE_IDS = ['FRCC', '112AVE', '104AVE', 'WSTMNST', 'CCR', 'EVANS', 'YALE', 'ENGLWD'];

/** A pattern through `nodeIds` whose segment miles are `segments`; the id doubles as the name. */
function pattern(id: string, nodeIds: string[], segments: number[], routeId = 'r'): RoutePattern {
  const points: PatternPoint[] = [];
  let cumulative = 0;
  nodeIds.forEach((nodeId, sequence) => {
    if (sequence > 0) cumulative += segments[sequence - 1];
    points.push({ id: `${id}-${sequence}`, nodeId, sequence, cumulativeMiles: cumulative });
  });
  return { ...T, id, scenarioId: 's', routeId, name: id, points };
}

const A = pattern('A', ['FRCC', '112AVE', '104AVE', 'WSTMNST', 'CCR', 'EVANS'], [1.1, 0.9, 2.0, 1.5, 3.2]);
const B = pattern('B', ['WSTMNST', 'CCR', 'EVANS', 'YALE', 'ENGLWD'], [0, 0, 0, 0]);
const C = pattern('C', ['EVANS', 'CCR', 'WSTMNST'], [3.4, 1.5]);
const D = pattern('D', ['WSTMNST', 'CCR', 'EVANS'], [0, 0]);
const E = (miles: number) => pattern('E', ['CCR', 'EVANS'], [miles]);
const LOOP = pattern('L', ['WSTMNST', 'CCR', 'WSTMNST', 'CCR'], [0, 0, 0]);
const OTHER_ROUTE = pattern('X', ['WSTMNST', 'CCR', 'EVANS'], [9, 9], 'other');
const nodes: Node[] = NODE_IDS.map((id) => ({ id, scenarioId: 's', routeId: 'r', name: id, kind: 'timepoint' as const, ...T }));

describe('segment distance fill (Decision 0065)', () => {
  it('fills the zero segments of B from the same node pair in A and leaves segments with no source at 0', () => {
    const plan = planDistanceFill({ openPattern: B, patterns: [A, B, C] });
    expect(plan.changes).toEqual([
      { patternId: 'B', segmentIndex: 0, previousMiles: 0, nextMiles: 1.5, sourcePatternIds: ['A'], fromReverse: false },
      { patternId: 'B', segmentIndex: 1, previousMiles: 0, nextMiles: 3.2, sourcePatternIds: ['A'], fromReverse: false },
    ]);
    expect(plan.skips).toEqual([]);
  });

  it('uses the reverse pair when no pattern has the same direction, and marks the value from reverse', () => {
    const plan = planDistanceFill({ openPattern: D, patterns: [C, D] });
    expect(plan.changes).toEqual([
      { patternId: 'D', segmentIndex: 0, previousMiles: 0, nextMiles: 1.5, sourcePatternIds: ['C'], fromReverse: true },
      { patternId: 'D', segmentIndex: 1, previousMiles: 0, nextMiles: 3.4, sourcePatternIds: ['C'], fromReverse: true },
    ]);
  });

  it('prefers a same-direction source over a reverse source', () => {
    const plan = planDistanceFill({ openPattern: D, patterns: [A, C, D] });
    expect(plan.changes.find((change) => change.segmentIndex === 1)).toEqual({ patternId: 'D', segmentIndex: 1, previousMiles: 0, nextMiles: 3.2, sourcePatternIds: ['A'], fromReverse: false });
  });

  it('never changes a segment that already has a distance', () => {
    const partial = pattern('B', ['WSTMNST', 'CCR', 'EVANS', 'YALE', 'ENGLWD'], [2, 0, 0, 0]);
    const plan = planDistanceFill({ openPattern: partial, patterns: [A, partial] });
    expect(plan.changes.map((change) => change.segmentIndex)).toEqual([1]);
  });

  it('reports a conflict and leaves the segment unfilled when same-direction sources disagree', () => {
    const plan = planDistanceFill({ openPattern: D, patterns: [A, E(3.0), D] });
    expect(plan.changes.map((change) => change.segmentIndex)).toEqual([0]);
    expect(plan.skips).toEqual([{
      patternId: 'D', reason: 'conflict', segmentIndex: 1,
      candidates: [{ miles: 3, patternIds: ['E'] }, { miles: 3.2, patternIds: ['A'] }],
    }]);
  });

  it('fills a conflicting segment when the sources agree, listing every source sorted', () => {
    const plan = planDistanceFill({ openPattern: D, patterns: [A, E(3.2), D] });
    expect(plan.changes.find((change) => change.segmentIndex === 1)).toEqual({ patternId: 'D', segmentIndex: 1, previousMiles: 0, nextMiles: 3.2, sourcePatternIds: ['A', 'E'], fromReverse: false });
    expect(plan.skips).toEqual([]);
  });

  it('skips a node pair that occurs twice in the draft and fills the reverse of the other segment', () => {
    const plan = planDistanceFill({ openPattern: LOOP, patterns: [A, LOOP] });
    expect(plan.skips).toContainEqual({ patternId: 'L', reason: 'ambiguous', segmentIndex: 0 });
    expect(plan.changes).toEqual([{ patternId: 'L', segmentIndex: 1, previousMiles: 0, nextMiles: 1.5, sourcePatternIds: ['A'], fromReverse: true }]);
  });

  it('ignores patterns of another Route', () => {
    const plan = planDistanceFill({ openPattern: D, patterns: [OTHER_ROUTE, A, D] });
    expect(plan.changes.find((change) => change.segmentIndex === 1)?.nextMiles).toBe(3.2);
    expect(plan.changes.flatMap((change) => change.sourcePatternIds)).not.toContain('X');
  });
});

describe('segment distance copy (Decision 0065)', () => {
  it('replaces the matching segments of B and never writes reverse pairs into C', () => {
    const plan = planDistanceCopy({ openPattern: A, patterns: [A, B, C] });
    expect(plan.changes).toEqual([
      { patternId: 'B', segmentIndex: 0, previousMiles: 0, nextMiles: 1.5, sourcePatternIds: ['A'], fromReverse: false },
      { patternId: 'B', segmentIndex: 1, previousMiles: 0, nextMiles: 3.2, sourcePatternIds: ['A'], fromReverse: false },
    ]);
    expect(plan.affectedPatterns).toEqual([{ patternId: 'B', changeCount: 2, overwriteCount: 0 }]);
  });

  it('plans nothing for an excluded pattern', () => {
    const plan = planDistanceCopy({ openPattern: A, patterns: [A, B, C], excludedPatternIds: ['B'] });
    expect(plan.changes).toEqual([]);
    expect(plan.affectedPatterns).toEqual([]);
  });

  it('reports an ambiguous pair on another pattern and changes nothing for it', () => {
    const plan = planDistanceCopy({ openPattern: A, patterns: [A, LOOP] });
    expect(plan.changes).toEqual([]);
    expect(plan.skips).toContainEqual({ patternId: 'L', reason: 'ambiguous', segmentIndex: 3 });
  });

  it('counts a change that overwrites a non-zero value', () => {
    const existing = pattern('B', ['WSTMNST', 'CCR', 'EVANS', 'YALE', 'ENGLWD'], [0.5, 0, 0, 0]);
    const plan = planDistanceCopy({ openPattern: A, patterns: [A, existing] });
    expect(plan.affectedPatterns).toEqual([{ patternId: 'B', changeCount: 2, overwriteCount: 1 }]);
    expect(plan.changes[0]).toMatchObject({ previousMiles: 0.5, nextMiles: 1.5 });
  });

  it('writes nothing when the values are already equal', () => {
    const equal = pattern('B', ['WSTMNST', 'CCR', 'EVANS', 'YALE', 'ENGLWD'], [1.5, 3.2, 0, 0]);
    expect(planDistanceCopy({ openPattern: A, patterns: [A, equal] }).changes).toEqual([]);
  });

  it('ignores patterns of another Route', () => {
    expect(planDistanceCopy({ openPattern: A, patterns: [A, OTHER_ROUTE] }).changes).toEqual([]);
  });

  it('lists the other patterns that share a node pair with the open pattern', () => {
    expect(copyCandidatePatternIds(A, [A, B, C, D, OTHER_ROUTE])).toEqual(['B', 'D']);
  });
});

describe('applySegmentDistancePlan', () => {
  it('applies the copy to B, returns only B, and leaves the cumulative values valid', () => {
    const plan = planDistanceCopy({ openPattern: A, patterns: [A, B, C] });
    const changed = applySegmentDistancePlan([A, B, C], plan);
    expect(changed.map((pattern) => pattern.id)).toEqual(['B']);
    expect(changed[0].points.map((point) => point.cumulativeMiles)).toEqual([0, 1.5, 4.7, 4.7, 4.7]);
    expect(validatePattern(changed[0], nodes)).toEqual([]);
  });
});
