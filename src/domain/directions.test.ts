import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { createManagedDirections, createRouteDirection, mapPatternPointsToDirection, normalizeDirections, validateDirection, validatePatternDirection } from './directions';
import type { RoutePattern } from './types';

const nodes = [
  { id: 'a', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal' as const, ...metadata() },
  { id: 'b', scenarioId: 's', routeId: 'r', name: 'B', kind: 'timepoint' as const, ...metadata() },
];

describe('route directions and timetable columns', () => {
  it('creates the two managed route direction groups', () => {
    const directions = createManagedDirections('s', 'r', '2026-09-11T00:00:00.000Z');
    expect(directions.map((direction) => ({ name: direction.name, group: direction.group, sequence: direction.sequence }))).toEqual([
      { name: 'Outbound', group: 'outbound', sequence: 0 },
      { name: 'Inbound', group: 'inbound', sequence: 1 },
    ]);
  });

  it('orders directions and columns deterministically', () => {
    const first = { ...createRouteDirection('s', 'r', 'Inbound', 4), columns: [{ id: 'b', nodeId: 'b', sequence: 4 }, { id: 'a', nodeId: 'a', sequence: 1 }] };
    const second = createRouteDirection('s', 'r', 'Outbound', 1);
    const ordered = normalizeDirections([first, second]);
    expect(ordered.map((direction) => direction.name)).toEqual(['Outbound', 'Inbound']);
    expect(ordered[1].columns.map((column) => column.sequence)).toEqual([0, 1]);
  });

  it('maps two visits to the same node to distinct columns', () => {
    const direction = createRouteDirection('s', 'r', 'Loop');
    const pattern: RoutePattern = { id: 'p', scenarioId: 's', routeId: 'r', name: 'Loop', directionId: direction.id, points: [
      { id: 'p1', nodeId: 'a', sequence: 0, cumulativeMiles: 0 },
      { id: 'p2', nodeId: 'b', sequence: 1, cumulativeMiles: 1 },
      { id: 'p3', nodeId: 'a', sequence: 2, cumulativeMiles: 2 },
    ], ...metadata() };
    const mapped = mapPatternPointsToDirection(pattern, direction);
    expect(mapped.direction.columns.map((column) => column.nodeId)).toEqual(['a', 'b', 'a']);
    expect(mapped.pattern.points.map((point) => point.directionColumnId)).toEqual(mapped.direction.columns.map((column) => column.id));
    expect(validateDirection(mapped.direction, 'r', nodes)).toEqual([]);
    expect(validatePatternDirection(mapped.pattern, mapped.direction, nodes)).toEqual([]);
  });

  it('aligns a short-turn pattern with an established directional timetable', () => {
    const direction = createRouteDirection('s', 'r', 'Outbound');
    const full: RoutePattern = { id: 'full', scenarioId: 's', routeId: 'r', name: 'Full', directionId: direction.id, points: [
      { id: 'full-a', nodeId: 'a', sequence: 0, cumulativeMiles: 0 },
      { id: 'full-b', nodeId: 'b', sequence: 1, cumulativeMiles: 1 },
    ], ...metadata() };
    const established = mapPatternPointsToDirection(full, direction);
    const short: RoutePattern = { id: 'short', scenarioId: 's', routeId: 'r', name: 'Short', directionId: direction.id, points: [
      { id: 'short-b', nodeId: 'b', sequence: 0, cumulativeMiles: 0 },
    ], ...metadata() };
    const aligned = mapPatternPointsToDirection(short, established.direction);
    expect(aligned.direction.columns.map((column) => column.nodeId)).toEqual(['a', 'b']);
    expect(aligned.pattern.points[0].directionColumnId).toBe(aligned.direction.columns[1].id);
  });

  it('reports missing and cross-node mappings', () => {
    const direction = { ...createRouteDirection('s', 'r', 'Outbound'), columns: [{ id: 'col-a', nodeId: 'a', sequence: 0 }] };
    const pattern: RoutePattern = { id: 'p', scenarioId: 's', routeId: 'r', name: 'P', directionId: direction.id, points: [{ id: 'p1', nodeId: 'b', sequence: 0, cumulativeMiles: 0 }], ...metadata() };
    expect(validatePatternDirection(pattern, direction, nodes).map((finding) => finding.ruleId)).toContain('pattern.directionColumnRequired');
  });
});
