import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { ProjectSnapshot, RouteStopSet } from '../domain/types';
import { goldenRaw } from '../testSupport/goldenBackup';
import { cloneProjectSnapshot, exportProjectJson, importProjectJson } from './backup';

const stamp = { createdAt: '2026-11-16T00:00:00.000Z', updatedAt: '2026-11-16T00:00:00.000Z' };
const withoutExportedAt = (payload: string) => { const { exportedAt: _ignored, ...rest } = JSON.parse(payload); return rest; };
const sortedPoints = (points: Array<{ sequence: number; id: string }>) => [...points].sort((left, right) => left.sequence - right.sequence);

/**
 * The golden Federal project (one Route) with a stop set on the first pattern of its Route, and a stop ID on that pattern's first timepoint.
 * Stop A is placed after the first point (timing `previous`), stop B after the third point (timing `next`). Decisions 0079 and 0080.
 */
function goldenWithStops(): ProjectSnapshot {
  const snapshot = importProjectJson(JSON.stringify(goldenRaw()));
  const route = snapshot.routes[0];
  const pattern = snapshot.patterns.find((candidate) => candidate.routeId === route.id)!;
  const points = sortedPoints(pattern.points);
  const set: RouteStopSet = {
    id: 'stop-set-golden', scenarioId: route.scenarioId, routeId: route.id, roundingSeconds: 30,
    stops: [{ id: 'stop-a', name: 'First stop', stopCode: 'S1' }, { id: 'stop-b', name: 'Second stop' }],
    placementsByPatternId: {
      [pattern.id]: [
        { id: 'placement-a', stopId: 'stop-a', afterPatternPointId: points[0].id, sequence: 0, timing: 'previous' },
        { id: 'placement-b', stopId: 'stop-b', afterPatternPointId: points[2].id, sequence: 0, timing: 'next' },
      ],
    },
    timepointStopCodesByPatternId: { [pattern.id]: { [points[0].id]: 'N1' } },
    ...stamp,
  };
  return { ...snapshot, routeStopSets: [set] };
}

/** A schema 13 file of the golden project: one Node with a stop ID, and no stop sets. */
function version13WithNodeStopCode() {
  const file = JSON.parse(exportProjectJson(importProjectJson(JSON.stringify(goldenRaw()))));
  file.exportSchemaVersion = 13;
  const pattern = file.patterns[0];
  const nodeId: string = (sortedPoints(pattern.points)[0] as unknown as { nodeId: string }).nodeId;
  file.nodes.find((node: { id: string }) => node.id === nodeId).stopCode = ' N1 ';
  return { file, nodeId };
}

describe('Route stop sets in backups (Decision 0079)', () => {
  it('round trips a schema 14 file exactly: stop sets and timepoint stop IDs survive export and import', () => {
    const snapshot = goldenWithStops();
    const payload = exportProjectJson(snapshot);
    expect(JSON.parse(payload).exportSchemaVersion).toBe(14);
    expect(JSON.parse(payload).routeStopSets).toEqual(snapshot.routeStopSets);
    const restored = importProjectJson(payload);
    expect(restored.routeStopSets).toEqual(snapshot.routeStopSets);
    expect(withoutExportedAt(exportProjectJson(restored))).toEqual(withoutExportedAt(payload));
  });

  it('a version 13 file moves a Node stop ID to every point on that Node of the Route\'s patterns (Decision 0080)', () => {
    const { file, nodeId } = version13WithNodeStopCode();
    const restored = importProjectJson(JSON.stringify(file));
    expect(restored.nodes.some((node) => 'stopCode' in node)).toBe(false);
    const [set] = restored.routeStopSets!;
    expect(set.stops).toEqual([]);
    const expected = Object.fromEntries(restored.patterns
      .filter((pattern) => pattern.points.some((point) => point.nodeId === nodeId))
      .map((pattern) => [pattern.id, Object.fromEntries(pattern.points.filter((point) => point.nodeId === nodeId).map((point) => [point.id, 'N1']))]));
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    expect(set.timepointStopCodesByPatternId).toEqual(expected);
    // The converted file exports as schema 14 and imports again unchanged.
    const again = importProjectJson(exportProjectJson(restored));
    expect(again.routeStopSets).toEqual(restored.routeStopSets);
  });

  it('a version 13 Node stop ID does not replace a point stop ID the file already has', () => {
    const { file, nodeId } = version13WithNodeStopCode();
    const pattern = file.patterns.find((candidate: { points: Array<{ nodeId: string }> }) => candidate.points.some((point) => point.nodeId === nodeId));
    const point = pattern.points.find((candidate: { nodeId: string }) => candidate.nodeId === nodeId);
    file.routeStopSets = [{ id: 'set', scenarioId: pattern.scenarioId, routeId: pattern.routeId, roundingSeconds: 60, stops: [], placementsByPatternId: {}, timepointStopCodesByPatternId: { [pattern.id]: { [point.id]: 'KEEP' } }, ...stamp }];
    const restored = importProjectJson(JSON.stringify(file));
    expect(restored.routeStopSets![0].timepointStopCodesByPatternId![pattern.id][point.id]).toBe('KEEP');
  });

  it('a project without stops exports no routeStopSets key', () => {
    const snapshot = importProjectJson(JSON.stringify(goldenRaw()));
    expect('routeStopSets' in JSON.parse(exportProjectJson(snapshot))).toBe(false);
  });

  it('a version 12 file imports with no stop sets, and its routeStopSets key is ignored', () => {
    const file = JSON.parse(exportProjectJson(goldenWithStops()));
    file.exportSchemaVersion = 12;
    expect(importProjectJson(JSON.stringify(file)).routeStopSets).toBeUndefined();
  });

  // Trap (Decision 0079 item 13): backup schema 13 must not stop version 12 files from importing their route estimate factors.
  it('a version 12 file keeps its routeEstimateFactors (the schema 13 bump must keep accepting 12)', () => {
    const factors = { allDays: { layoverFraction: 0.182, deadheadFraction: 0.056 }, serviceDays: [{ serviceDayId: 'd', layoverFraction: 0.178 }, { serviceDayId: 'e', deadheadFraction: 0.05 }] };
    const routeEntries = [{ tripProfileId: 'tp', routeId: 'r', factors: { allDays: { layoverFraction: 0.31 }, serviceDays: [{ serviceDayId: 'e', deadheadFraction: 0.07 }] } }];
    const source = {
      project: { id: 'p', name: 'Costing', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata() },
      scenarios: [{ id: 's', projectId: 'p', name: 'Base', ...metadata() }, { id: 's2', projectId: 'p', name: 'Other', ...metadata() }],
      serviceDays: [
        { id: 'd', scenarioId: 's', kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 255, sequence: 0, ...metadata() },
        { id: 'e', scenarioId: 's', kind: 'saturday' as const, name: 'Saturday', annualServiceDays: 52, sequence: 1, ...metadata() },
        { id: 'x', scenarioId: 's2', kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 255, sequence: 0, ...metadata() },
      ],
      routes: [{ id: 'r', scenarioId: 's', name: 'Route', ...metadata() }, { id: 'r2', scenarioId: 's2', name: 'Other', ...metadata() }],
      nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [],
      tripProfiles: [{ id: 'tp', scenarioId: 's', name: 'Default', ...metadata() }, { id: 'tp2', scenarioId: 's2', name: 'Default', ...metadata() }], blockingScenarios: [],
      costingAssumptions: [{ id: 'cost', scenarioId: 's', currencyCode: 'USD' as const, enteredRate: 100, rateYear: 2026, sourceType: 'user' as const, baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0.03, estimateFactors: factors, routeEstimateFactors: routeEntries, ...metadata() }],
      generationSets: [], trips: [], blocks: [],
    } as unknown as Parameters<typeof exportProjectJson>[0];
    const file = JSON.parse(exportProjectJson(source));
    expect(file.exportSchemaVersion).toBe(14);
    file.exportSchemaVersion = 12;
    const restored = importProjectJson(JSON.stringify(file));
    expect(restored.costingAssumptions?.[0].routeEstimateFactors).toEqual(routeEntries);
    expect(restored.costingAssumptions?.[0].estimateFactors).toEqual(factors);
  });

  it('import as copy gives the set a new ID, remaps Route and pattern keys and point references, and keeps stop and placement IDs', () => {
    const snapshot = goldenWithStops();
    const source = importProjectJson(exportProjectJson(snapshot));
    const copy = importProjectJson(exportProjectJson(cloneProjectSnapshot(source, stamp.createdAt)));
    const [sourceSet] = source.routeStopSets!;
    const [copySet] = copy.routeStopSets!;
    const copyRoute = copy.routes[0];
    const copyPattern = copy.patterns.find((pattern) => pattern.routeId === copyRoute.id)!;
    const sourcePattern = source.patterns.find((pattern) => pattern.routeId === sourceSet.routeId)!;
    expect(copySet.id).not.toBe(sourceSet.id);
    expect(copySet.routeId).toBe(copyRoute.id);
    expect(copySet.scenarioId).toBe(copyRoute.scenarioId);
    expect(copySet.stops).toEqual(sourceSet.stops);
    expect(Object.keys(copySet.placementsByPatternId)).toEqual([copyPattern.id]);
    const indexIn = (points: Array<{ id: string; sequence: number }>, pointId: string) => sortedPoints(points).findIndex((point) => point.id === pointId);
    const copyPlacements = copySet.placementsByPatternId[copyPattern.id];
    const sourcePlacements = sourceSet.placementsByPatternId[sourcePattern.id];
    expect(copyPlacements.map((placement) => placement.id)).toEqual(sourcePlacements.map((placement) => placement.id));
    expect(copyPlacements.map((placement) => indexIn(copyPattern.points, placement.afterPatternPointId))).toEqual(sourcePlacements.map((placement) => indexIn(sourcePattern.points, placement.afterPatternPointId)));
    // Decision 0080: the timepoint stop ID follows its pattern and point.
    const [copyPointId] = Object.keys(copySet.timepointStopCodesByPatternId![copyPattern.id]);
    const [sourcePointId] = Object.keys(sourceSet.timepointStopCodesByPatternId![sourcePattern.id]);
    expect(indexIn(copyPattern.points, copyPointId)).toBe(indexIn(sourcePattern.points, sourcePointId));
    expect(copySet.timepointStopCodesByPatternId![copyPattern.id][copyPointId]).toBe('N1');
  });

  it('import drops placements of a pattern the file does not contain', () => {
    const file = JSON.parse(exportProjectJson(goldenWithStops()));
    const [set] = file.routeStopSets;
    set.placementsByPatternId['no-such-pattern'] = [{ id: 'orphan', stopId: 'stop-a', afterPatternPointId: 'no-such-point', sequence: 0, timing: 'interpolate' }];
    const restored = importProjectJson(JSON.stringify(file));
    expect(Object.keys(restored.routeStopSets![0].placementsByPatternId)).not.toContain('no-such-pattern');
  });

  it.each([
    ['a missing Route', (set: any) => { set.routeId = 'no-route'; }, /references a missing Route/],
    ['an unknown timing rule', (set: any) => { set.placementsByPatternId[Object.keys(set.placementsByPatternId)[0]][0].timing = 'middle'; }, /timing/],
    ['a rounding of 45 seconds', (set: any) => { set.roundingSeconds = 45; }, /roundingSeconds must be 30 or 60/],
    ['a placement of a missing stop', (set: any) => { set.placementsByPatternId[Object.keys(set.placementsByPatternId)[0]][0].stopId = 'no-such-stop'; }, /stopPlacement\.stopMissing/],
    ['two stops with one stop code', (set: any) => { set.stops[1].stopCode = ' s1 '; }, /routeStop\.codeDuplicate/],
  ])('refuses a stop set with %s', (_label, change, message) => {
    const file = JSON.parse(exportProjectJson(goldenWithStops()));
    change(file.routeStopSets[0]);
    expect(() => importProjectJson(JSON.stringify(file))).toThrow(message);
  });

  it('refuses a blank Node stop code in a version 13 file', () => {
    const { file } = version13WithNodeStopCode();
    file.nodes[0].stopCode = '   ';
    expect(() => importProjectJson(JSON.stringify(file))).toThrow(/nodes\[0\]\.stopCode/);
  });

  it.each([
    ['a blank timepoint stop ID', (set: any) => { const [patternId] = Object.keys(set.timepointStopCodesByPatternId); const [pointId] = Object.keys(set.timepointStopCodesByPatternId[patternId]); set.timepointStopCodesByPatternId[patternId][pointId] = ' '; }, /must be a non-blank string/],
    ['a timepoint stop ID of a missing point', (set: any) => { const [patternId] = Object.keys(set.timepointStopCodesByPatternId); set.timepointStopCodesByPatternId[patternId]['no-such-point'] = 'X'; }, /missing timepoint/],
  ])('refuses a stop set with %s (Decision 0080)', (_label, change, message) => {
    const file = JSON.parse(exportProjectJson(goldenWithStops()));
    change(file.routeStopSets[0]);
    expect(() => importProjectJson(JSON.stringify(file))).toThrow(message);
  });
});
