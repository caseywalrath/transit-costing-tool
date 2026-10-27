import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { CostingAssumptionsInput } from '../domain/costing';
import type { Node, RoutePattern } from '../domain/types';
import { countAssumptionChanges, countNodeChanges, countPatternChanges } from './draftChangeCounts';

const node = (id: string, name: string, extra: Partial<Node> = {}): Node => ({ id, scenarioId: 's', routeId: 'r', name, kind: 'timepoint', ...metadata('2026-01-01T00:00:00.000Z'), ...extra });
const pattern = (overrides: Partial<RoutePattern> = {}): RoutePattern => ({
  id: 'p', scenarioId: 's', routeId: 'r', name: 'Out', directionId: 'd1',
  points: [{ id: 'a', nodeId: 'n1', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'n2', sequence: 1, cumulativeMiles: 2 }],
  ...metadata('2026-01-01T00:00:00.000Z'), ...overrides,
}) as RoutePattern;

describe('countNodeChanges', () => {
  const saved = [node('1', 'A'), node('2', 'B')];
  it('is zero for an untouched draft', () => expect(countNodeChanges(saved, saved.map((item) => ({ ...item })), new Set())).toBe(0));
  it('counts an added Node, a renamed Node, and a Node marked for removal once each', () => {
    const draft = [node('1', 'A2'), node('2', 'B'), node('3', 'C')];
    expect(countNodeChanges(saved, draft, new Set())).toBe(2);
    expect(countNodeChanges(saved, draft, new Set(['2']))).toBe(3);
  });
  it('does not count a removed Node that was never saved, and treats a blank optional field as unchanged', () => {
    expect(countNodeChanges(saved, [...saved, node('3', 'C')], new Set(['3']))).toBe(0);
    expect(countNodeChanges(saved, [node('1', 'A', { shortName: '' }), saved[1]], new Set())).toBe(0);
  });
});

describe('countPatternChanges', () => {
  it('counts changed fields, changed points, and added or removed points', () => {
    const saved = pattern();
    expect(countPatternChanges(saved, pattern())).toBe(0);
    expect(countPatternChanges(saved, pattern({ name: 'Out 2', directionLabel: 'Full' }))).toBe(2);
    expect(countPatternChanges(saved, pattern({ points: [{ ...saved.points[0] }, { ...saved.points[1], cumulativeMiles: 3 }] }))).toBe(1);
    expect(countPatternChanges(saved, pattern({ points: [...saved.points, { id: 'c', nodeId: 'n3', sequence: 2, cumulativeMiles: 4 }] }))).toBe(1);
  });
  it('is zero for a Pattern that has not been saved, which the screen describes as new', () => expect(countPatternChanges(undefined, pattern())).toBe(0));
});

describe('countAssumptionChanges', () => {
  const saved: CostingAssumptionsInput = { enteredRate: 142.5, rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 10, annualEscalation: 0.03 };
  it('counts each differing field', () => {
    expect(countAssumptionChanges(saved, { ...saved })).toBe(0);
    expect(countAssumptionChanges(saved, { ...saved, enteredRate: 150, futureYearCount: 5 })).toBe(2);
    expect(countAssumptionChanges(saved, { ...saved, enteredRate: undefined })).toBe(1);
  });
});
