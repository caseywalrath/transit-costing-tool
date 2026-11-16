import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { applyStopPlacementPlan, planStopCopy, planStopFill, stopCopyCandidatePatternIds } from './stopPlacementMatching';
import type { PatternPoint, PatternStopPlacement, RoutePattern, StopTimingRule } from './types';

const T = metadata('2026-01-01T00:00:00.000Z');
const I: StopTimingRule = 'interpolate';

/** A pattern through `nodeIds`; point IDs are `${id}-${sequence}`. The id doubles as the name. */
function pattern(id: string, nodeIds: string[], routeId = 'r'): RoutePattern {
  const points: PatternPoint[] = nodeIds.map((nodeId, sequence) => ({ id: `${id}-${sequence}`, nodeId, sequence, cumulativeMiles: sequence }));
  return { ...T, id, scenarioId: 's', routeId, name: id, points };
}

const place = (id: string, stopId: string, afterPatternPointId: string, sequence: number, timing: StopTimingRule = I): PatternStopPlacement =>
  ({ id, stopId, afterPatternPointId, sequence, timing });

// Same node pairs as segmentDistanceMatching.test.ts.
const A = pattern('A', ['FRCC', '112AVE', '104AVE', 'WSTMNST', 'CCR', 'EVANS']);
const B = pattern('B', ['WSTMNST', 'CCR', 'EVANS', 'YALE', 'ENGLWD']);
const C = pattern('C', ['EVANS', 'CCR', 'WSTMNST']);
const D = pattern('D', ['WSTMNST', 'CCR', 'EVANS']);
const F = pattern('F', ['WSTMNST', 'CCR']);
const LOOP = pattern('L', ['WSTMNST', 'CCR', 'WSTMNST', 'CCR']);
const OTHER_ROUTE = pattern('X', ['WSTMNST', 'CCR', 'EVANS'], 'other');

// A has stops S1 and S2 on its WSTMNST>CCR segment (point A-3).
const aStops = [place('a1', 'S1', 'A-3', 0), place('a2', 'S2', 'A-3', 1)];

describe('stop copy (Decision 0079, section 4.7)', () => {
  it('replaces the shared segment on B and leaves the reverse pattern C unchanged', () => {
    const plan = planStopCopy({ openPattern: A, openPlacements: aStops, patterns: [A, B, C], placementsByPatternId: { A: aStops } });
    expect(plan.changes).toEqual([
      { patternId: 'B', segmentIndex: 0, previous: [], next: [{ stopId: 'S1', timing: I }, { stopId: 'S2', timing: I }], sourcePatternIds: ['A'] },
    ]);
    expect(plan.changes.some((change) => change.patternId === 'C')).toBe(false);
    expect(plan.affectedPatterns).toEqual([{ patternId: 'B', changeCount: 1, overwriteCount: 0 }]);
  });

  it('plans nothing for an excluded pattern', () => {
    const plan = planStopCopy({ openPattern: A, openPlacements: aStops, patterns: [A, B, C], placementsByPatternId: { A: aStops }, excludedPatternIds: ['B'] });
    expect(plan.changes).toEqual([]);
    expect(plan.affectedPatterns).toEqual([]);
  });

  it('writes nothing when the lists are identical, and treats a timing-only difference as a change', () => {
    const same = [place('b1', 'S1', 'B-0', 0), place('b2', 'S2', 'B-0', 1)];
    expect(planStopCopy({ openPattern: A, openPlacements: aStops, patterns: [A, B], placementsByPatternId: { A: aStops, B: same } }).changes).toEqual([]);
    const timing = [place('b1', 'S1', 'B-0', 0), place('b2', 'S2', 'B-0', 1, 'next')];
    const plan = planStopCopy({ openPattern: A, openPlacements: aStops, patterns: [A, B], placementsByPatternId: { A: aStops, B: timing } });
    expect(plan.changes).toHaveLength(1);
    expect(plan.affectedPatterns).toEqual([{ patternId: 'B', changeCount: 1, overwriteCount: 1 }]);
  });

  it('never copies an empty source segment', () => {
    const X = pattern('X', ['CCR', 'EVANS']);
    const xStops = [place('x1', 'S9', 'X-0', 0)];
    // A's CCR>EVANS segment (A-4 to A-5) has no stops, so X keeps its stop.
    const plan = planStopCopy({ openPattern: A, openPlacements: aStops, patterns: [A, X], placementsByPatternId: { A: aStops, X: xStops } });
    expect(plan.changes).toEqual([]);
  });

  it('reports an ambiguous pair on another pattern and changes nothing for it', () => {
    const plan = planStopCopy({ openPattern: A, openPlacements: aStops, patterns: [A, LOOP], placementsByPatternId: { A: aStops } });
    expect(plan.changes).toEqual([]);
    expect(plan.skips).toContainEqual({ patternId: 'L', reason: 'ambiguous', segmentIndex: 3 });
  });

  it('ignores patterns of another Route', () => {
    const xStops = [place('x1', 'S9', 'X-0', 0)];
    const plan = planStopCopy({ openPattern: A, openPlacements: aStops, patterns: [A, OTHER_ROUTE], placementsByPatternId: { A: aStops, X: xStops } });
    expect(plan.changes).toEqual([]);
  });

  it('lists the other patterns that share a node pair with the open pattern', () => {
    expect(stopCopyCandidatePatternIds(A, [A, B, C, D, OTHER_ROUTE])).toEqual(['B', 'D']);
  });
});

describe('stop fill (Decision 0079, section 4.7)', () => {
  it('fills only the empty segment of the draft and leaves a non-empty segment alone', () => {
    const draft = [place('z1', 'Z', 'D-1', 0)];
    const plan = planStopFill({ openPattern: D, openPlacements: draft, patterns: [A, D], placementsByPatternId: { A: aStops } });
    expect(plan.changes).toEqual([
      { patternId: 'D', segmentIndex: 0, previous: [], next: [{ stopId: 'S1', timing: I }, { stopId: 'S2', timing: I }], sourcePatternIds: ['A'] },
    ]);
    expect(plan.skips).toEqual([]);
  });

  it('does not use a pattern that has only the reverse pair as a source', () => {
    const cStops = [place('c1', 'S5', 'C-0', 0)];
    const plan = planStopFill({ openPattern: D, openPlacements: [], patterns: [C, D], placementsByPatternId: { C: cStops } });
    expect(plan.changes).toEqual([]);
    expect(plan.skips).toEqual([]);
  });

  it('reports a conflict when sources disagree and lists each value with its patterns', () => {
    const bStops = [place('b1', 'S1', 'B-0', 0)];
    const fStops = [place('f1', 'S1', 'F-0', 0), place('f2', 'S2', 'F-0', 1)];
    const plan = planStopFill({ openPattern: D, openPlacements: [], patterns: [B, F, D], placementsByPatternId: { B: bStops, F: fStops } });
    expect(plan.changes).toEqual([]);
    expect(plan.skips).toEqual([{
      patternId: 'D',
      reason: 'conflict',
      segmentIndex: 0,
      candidates: [
        { entries: [{ stopId: 'S1', timing: I }, { stopId: 'S2', timing: I }], patternIds: ['F'] },
        { entries: [{ stopId: 'S1', timing: I }], patternIds: ['B'] },
      ],
    }]);
  });

  it('fills when the sources agree, listing every source sorted', () => {
    const bStops = [place('b1', 'S1', 'B-0', 0), place('b2', 'S2', 'B-0', 1)];
    const fStops = [place('f1', 'S1', 'F-0', 0), place('f2', 'S2', 'F-0', 1)];
    const plan = planStopFill({ openPattern: D, openPlacements: [], patterns: [B, F, D], placementsByPatternId: { B: bStops, F: fStops } });
    expect(plan.changes).toEqual([
      { patternId: 'D', segmentIndex: 0, previous: [], next: [{ stopId: 'S1', timing: I }, { stopId: 'S2', timing: I }], sourcePatternIds: ['B', 'F'] },
    ]);
    expect(plan.skips).toEqual([]);
  });

  it('skips an ambiguous pair in a loop draft and reports it', () => {
    const plan = planStopFill({ openPattern: LOOP, openPlacements: [], patterns: [A, LOOP], placementsByPatternId: { A: aStops } });
    expect(plan.skips).toContainEqual({ patternId: 'L', reason: 'ambiguous', segmentIndex: 0 });
  });

  it('ignores patterns of another Route', () => {
    const plan = planStopFill({ openPattern: D, openPlacements: [], patterns: [OTHER_ROUTE, D], placementsByPatternId: { X: [place('x1', 'S9', 'X-0', 0)] } });
    expect(plan.changes).toEqual([]);
  });
});

describe('applyStopPlacementPlan', () => {
  it('gives new IDs from makeId, uses the target point, numbers sequences from 0, and keeps the other segments', () => {
    const bStored = [place('s9', 'S9', 'B-0', 0), place('s8', 'S8', 'B-2', 0)];
    const placementsByPatternId = { A: aStops, B: bStored };
    const plan = planStopCopy({ openPattern: A, openPlacements: aStops, patterns: [A, B], placementsByPatternId });
    let counter = 0;
    const result = applyStopPlacementPlan([A, B], placementsByPatternId, plan, () => `new-${++counter}`);
    expect(Object.keys(result)).toEqual(['B']);
    expect(result.B).toEqual([
      { id: 'new-1', stopId: 'S1', timing: I, afterPatternPointId: 'B-0', sequence: 0 },
      { id: 'new-2', stopId: 'S2', timing: I, afterPatternPointId: 'B-0', sequence: 1 },
      { id: 's8', stopId: 'S8', timing: I, afterPatternPointId: 'B-2', sequence: 0 },
    ]);
  });
});
