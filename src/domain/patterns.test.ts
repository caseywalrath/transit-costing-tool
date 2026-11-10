import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { duplicatePattern, getSegmentMiles, normalizePattern, reversePattern, setSegmentMiles, validatePattern } from './patterns';
import type { RoutePattern } from './types';

const nodes = [
  { id: '1', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal' as const, ...metadata() },
  { id: '2', scenarioId: 's', routeId: 'r', name: 'B', kind: 'timepoint' as const, ...metadata() },
  { id: '3', scenarioId: 's', routeId: 'r', name: 'C', kind: 'terminal' as const, ...metadata() },
];

describe('patterns', () => {
  it('derives segment miles from adjacent cumulative values', () => {
    const pattern = { id: 'p', scenarioId: 's', routeId: 'r', name: 'A-C', points: [
      { id: 'a', nodeId: '1', sequence: 0, cumulativeMiles: 0 },
      { id: 'b', nodeId: '2', sequence: 1, cumulativeMiles: 4.25 },
      { id: 'c', nodeId: '3', sequence: 2, cumulativeMiles: 7.5 },
    ], ...metadata() };
    expect(pattern.points.map((_, index) => getSegmentMiles(pattern, index))).toEqual([0, 4.25, 3.25]);
    expect(Number.isNaN(getSegmentMiles(pattern, 99))).toBe(true);
  });
  it('accepts two-point, subset, and repeated-node patterns', () => {
    const pattern = { id: 'p', scenarioId: 's', routeId: 'r', name: 'Loop', points: [
      { id: 'a', nodeId: '1', sequence: 0, cumulativeMiles: 0 },
      { id: 'b', nodeId: '2', sequence: 1, cumulativeMiles: 1 },
      { id: 'c', nodeId: '1', sequence: 2, cumulativeMiles: 2 },
    ], ...metadata() };
    expect(validatePattern(pattern, nodes)).toEqual([]);
  });

  it('flags decreasing cumulative miles and missing nodes', () => {
    const pattern = { id: 'p', scenarioId: 's', routeId: 'r', name: 'Invalid', points: [
      { id: 'a', nodeId: '1', sequence: 0, cumulativeMiles: 0 },
      { id: 'b', nodeId: 'missing', sequence: 1, cumulativeMiles: -1 },
    ], ...metadata() };
    const findings = validatePattern(pattern, nodes);
    expect(findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining(['pattern.nodeExists', 'pattern.distanceValid', 'pattern.nonDecreasingDistance']));
  });

  it('normalizes sequence values without changing point order', () => {
    const pattern = { id: 'p', scenarioId: 's', routeId: 'r', name: 'A-B', points: [
      { id: 'a', nodeId: '1', sequence: 4, cumulativeMiles: 0 },
      { id: 'b', nodeId: '2', sequence: 9, cumulativeMiles: 2 },
    ], ...metadata() };
    expect(normalizePattern(pattern).points.map((point) => point.sequence)).toEqual([0, 1]);
  });

  it('reverses nodes and preserves segment miles with fresh point ids', () => {
    const p = { id: 'p', scenarioId: 's', routeId: 'r', name: 'Outbound', points: [{ id: 'a', nodeId: '1', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: '2', sequence: 1, cumulativeMiles: 2 }, { id: 'c', nodeId: '3', sequence: 2, cumulativeMiles: 5 }], ...metadata() };
    const r = reversePattern(p);
    expect(r.id).not.toBe(p.id);
    expect(r.points.map((x) => x.nodeId)).toEqual(['3', '2', '1']);
    expect(r.points.map((x) => x.cumulativeMiles)).toEqual([0, 3, 5]);
    expect(r.points.map((x) => x.id)).not.toEqual(p.points.map((x) => x.id));
  });

  it('duplicates a pattern with fresh ids and normalized point sequence', () => {
    const source = { id: 'p', scenarioId: 's', routeId: 'r', name: 'Outbound', directionLabel: 'Eastbound', notes: 'Keep this note', points: [
      { id: 'a', nodeId: '1', sequence: 4, cumulativeMiles: 0 },
      { id: 'b', nodeId: '2', sequence: 9, cumulativeMiles: 2 },
    ], ...metadata('2026-01-01T00:00:00.000Z') };
    const copy = duplicatePattern(source, 'Outbound Short', '2026-02-01T00:00:00.000Z');
    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe('Outbound Short');
    expect(copy.directionLabel).toBeUndefined();
    expect(copy.notes).toBe(source.notes);
    expect(copy.points.map((point) => point.nodeId)).toEqual(['1', '2']);
    expect(copy.points.map((point) => point.sequence)).toEqual([0, 1]);
    expect(copy.points.map((point) => point.id)).not.toEqual(source.points.map((point) => point.id));
    expect(copy.createdAt).toBe('2026-02-01T00:00:00.000Z');
    expect(copy.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('setSegmentMiles (Decision 0065)', () => {
  const pattern = (cumulative: number[], ids = cumulative.map((_, index) => `p${index}`)): RoutePattern => ({ id: 'p', scenarioId: 's', routeId: 'r', name: 'P', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', points: cumulative.map((miles, index) => ({ id: ids[index], nodeId: `n${index}`, sequence: index, cumulativeMiles: miles })) });
  const cumulative = (value: RoutePattern) => value.points.map((point) => point.cumulativeMiles);

  it('sets a segment and shifts every later point by the difference', () => {
    expect(cumulative(setSegmentMiles(pattern([0, 1.5, 4]), 0, 2))).toEqual([0, 2, 4.5]);
  });

  it('changes only the last cumulative value when the last segment is set', () => {
    expect(cumulative(setSegmentMiles(pattern([0, 1.5, 4]), 1, 3))).toEqual([0, 1.5, 4.5]);
  });

  it('rounds written values to 6 decimal places so later additions stay exact', () => {
    // Setting segment 0 to 0.3 moves the later points by 0.19999999999999998; the stored values must still be exactly 0.3.
    const once = setSegmentMiles(pattern([0, 0.1, 0.1]), 0, 0.3);
    expect(cumulative(once)).toEqual([0, 0.3, 0.3]);
    expect(cumulative(setSegmentMiles(once, 1, 0.2))).toEqual([0, 0.3, 0.5]);
  });

  it('throws for an out-of-range segment and for a negative or non-finite miles value', () => {
    const source = pattern([0, 1.5, 4]);
    expect(() => setSegmentMiles(source, -1, 1)).toThrow('Segment not found.');
    expect(() => setSegmentMiles(source, 2, 1)).toThrow('Segment not found.');
    expect(() => setSegmentMiles(source, 0, -1)).toThrow('Enter a non-negative number.');
    expect(() => setSegmentMiles(source, 0, Number.NaN)).toThrow('Enter a non-negative number.');
  });

  it('does not mutate the input pattern and keeps the points in their array order', () => {
    const source = pattern([0, 1.5, 4], ['a', 'b', 'c']);
    const next = setSegmentMiles(source, 0, 2);
    expect(cumulative(source)).toEqual([0, 1.5, 4]);
    expect(next.points.map((point) => point.id)).toEqual(['a', 'b', 'c']);
    expect(next.updatedAt).toBe(source.updatedAt);
  });
});
