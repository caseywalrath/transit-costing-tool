import { describe, expect, it } from 'vitest';
import type { ScenarioRecords } from './project';
import { changeCounts, diffScenarioRecords, isEmptyChange, isTripChange, planRestore, restorePointNames, restorePointsToPrune, restorePointsToPruneByGroup, rowStamp } from './restorePoints';

const stamp = '2026-11-01T00:00:00.000Z';
const NOW = '2026-11-17T12:00:00.000Z';

function trip(id: string) {
  return { id, scenarioId: 's', routeId: 'r', serviceDayId: 'wd', patternId: 'pat', tripProfileId: 'tp', stopTimes: [], provenance: { kind: 'manual' as const, manuallyChangedFields: [] }, createdAt: stamp, updatedAt: stamp };
}

function records(): ScenarioRecords {
  return {
    scenario: { id: 's', projectId: 'p', name: 'Base', createdAt: stamp, updatedAt: stamp },
    serviceDays: [
      { id: 'wd', scenarioId: 's', kind: 'weekday', name: 'Weekday', annualServiceDays: 260, sequence: 0, createdAt: stamp, updatedAt: stamp },
      { id: 'sat', scenarioId: 's', kind: 'saturday', name: 'Saturday', annualServiceDays: 52, sequence: 1, createdAt: stamp, updatedAt: stamp },
    ],
    routes: [{ id: 'r', scenarioId: 's', name: 'Route', createdAt: stamp, updatedAt: stamp }],
    nodes: [],
    patterns: [],
    runtimeProfiles: [],
    runtimeAssignments: [],
    tripProfiles: [{ id: 'tp', scenarioId: 's', name: 'Default', createdAt: stamp, updatedAt: stamp }],
    generationSets: [],
    trips: [trip('t1'), trip('t2')],
    blocks: [{ id: 'b1', scenarioId: 's', serviceDayId: 'wd', label: 'Block 1', activities: [], createdAt: stamp, updatedAt: stamp }],
  };
}

/** The records with every collection sorted by id, so two equal sets of rows compare equal whatever their order. */
function sortedRecords(value: ScenarioRecords) {
  return JSON.parse(JSON.stringify(value, (_key, item) => (Array.isArray(item) && item.every((row) => row && typeof row === 'object' && 'id' in row)
    ? [...item].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    : item)));
}

describe('restore point rules', () => {
  it('finds no change between identical records', () => {
    expect(isEmptyChange(diffScenarioRecords(records(), records()))).toBe(true);
  });

  it('records a removed Trip, a changed Block, and an added Trip with their counts and stamps', () => {
    const before = records();
    const after = records();
    after.trips = [after.trips[0], trip('t3')];
    after.blocks = after.blocks.map((block) => ({ ...block, label: 'Renamed' }));
    const change = diffScenarioRecords(before, after);
    expect(change.removed.trips).toEqual([before.trips[1]]);
    expect(change.changedBefore.blocks).toEqual([before.blocks[0]]);
    expect(change.added.trips).toEqual(['t3']);
    expect(Object.keys(change.writtenStamps.blocks!)).toEqual(['b1']);
    expect(Object.keys(change.writtenStamps.trips!)).toEqual(['t3']);
    expect(changeCounts(change)).toEqual({ trips: { removed: 1, changed: 0, added: 1 }, blocks: { removed: 0, changed: 1, added: 0 } });
  });

  it('puts every row in removed, including the Scenario, when the Scenario is deleted', () => {
    const change = diffScenarioRecords(records(), undefined);
    expect(change.removed.scenario).toHaveLength(1);
    expect(change.removed.trips).toHaveLength(2);
    expect(change.removed.serviceDays).toHaveLength(2);
    expect(change.added).toEqual({});
  });

  it('restores the records before a change exactly', () => {
    const before = records();
    const after = records();
    after.trips = [after.trips[0], trip('t3')];
    after.blocks = after.blocks.map((block) => ({ ...block, label: 'Renamed' }));
    const result = planRestore(after, diffScenarioRecords(before, after));
    expect(result.conflicts).toEqual([]);
    expect(sortedRecords(result.next!)).toEqual(sortedRecords(before));
  });

  it('reports a changedSince conflict when the changed Block was edited again', () => {
    const before = records();
    const after = records();
    after.blocks = [{ ...after.blocks[0], label: 'Renamed' }];
    const change = diffScenarioRecords(before, after);
    const edited = { ...after, blocks: [{ ...after.blocks[0], label: 'Edited again' }] };
    const result = planRestore(edited, change);
    expect(result.next).toBeUndefined();
    expect(result.conflicts).toEqual([{ collection: 'blocks', id: 'b1', reason: 'changedSince' }]);
  });

  it('reports a changedSince conflict when the changed Block was deleted', () => {
    const before = records();
    const after = records();
    after.blocks = [{ ...after.blocks[0], label: 'Renamed' }];
    const change = diffScenarioRecords(before, after);
    const result = planRestore({ ...after, blocks: [] }, change);
    expect(result.conflicts).toEqual([{ collection: 'blocks', id: 'b1', reason: 'changedSince' }]);
  });

  it('gives no conflict when the added Trip was deleted since, and restores without it', () => {
    const before = records();
    const after = records();
    after.trips = [...before.trips, trip('t3')];
    const change = diffScenarioRecords(before, after);
    const result = planRestore({ ...after, trips: before.trips }, change);
    expect(result.conflicts).toEqual([]);
    expect(sortedRecords(result.next!)).toEqual(sortedRecords(before));
  });

  it('reports recreated when a removed Trip id exists again', () => {
    const before = records();
    const after = records();
    after.trips = [before.trips[0]];
    const change = diffScenarioRecords(before, after);
    const result = planRestore({ ...after, trips: [before.trips[0], before.trips[1]] }, change);
    expect(result.conflicts).toEqual([{ collection: 'trips', id: 't2', reason: 'recreated' }]);
  });

  it('restores a deleted Scenario onto nothing, and reports scenarioExists when one already exists', () => {
    const before = records();
    const deletion = diffScenarioRecords(before, undefined);
    const restored = planRestore(undefined, deletion);
    expect(restored.conflicts).toEqual([]);
    expect(sortedRecords(restored.next!)).toEqual(sortedRecords(before));
    expect(planRestore(before, deletion).conflicts).toEqual([{ collection: 'scenario', id: 's', reason: 'scenarioExists' }]);
  });

  it('reports scenarioMissing when the change removed no Scenario and none exists', () => {
    const change = diffScenarioRecords(records(), { ...records(), trips: [] });
    expect(planRestore(undefined, change).conflicts).toEqual([{ collection: 'scenario', id: '', reason: 'scenarioMissing' }]);
  });

  it('reports cannotRemove when the change added the costing assumptions record', () => {
    const before = records();
    const after: ScenarioRecords = {
      ...records(),
      costingAssumptions: { id: 'ca', scenarioId: 's', currencyCode: 'USD', rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: 0.03, createdAt: stamp, updatedAt: stamp },
    };
    const result = planRestore(after, diffScenarioRecords(before, after));
    expect(result.conflicts).toEqual([{ collection: 'costingAssumptions', id: 'ca', reason: 'cannotRemove' }]);
  });

  it('takes each name from the first source that has the record, uses the short name of a Route, and lets extra names win', () => {
    const source = records();
    source.routes = [{ ...source.routes[0], shortName: 'R1' }];
    const withoutProfile: ScenarioRecords = { ...records(), tripProfiles: undefined, routes: [] };
    expect(restorePointNames('Project', [withoutProfile, source], { routeId: 'r', tripProfileId: 'tp', blockId: 'b1' })).toEqual({
      project: 'Project', scenario: 'Base', route: 'R1', tripProfile: 'Default', block: 'Block 1',
    });
    expect(restorePointNames('Project', [source], { routeId: 'r' }, { route: 'Forced' }).route).toBe('Forced');
  });

  it('keeps the newest twenty, drops a point older than thirty days, and keeps a single point larger than the size limit', () => {
    const at = (minutes: number) => new Date(Date.parse(NOW) - minutes * 60_000).toISOString();
    const points = Array.from({ length: 21 }, (_value, index) => ({ id: `p${index}`, createdAt: at(index), sizeEstimate: 1 }));
    expect(restorePointsToPrune(points, NOW)).toEqual(['p20']);
    const old = [{ id: 'p0', createdAt: at(0), sizeEstimate: 1 }, { id: 'p1', createdAt: new Date(Date.parse(NOW) - 31 * 86_400_000).toISOString(), sizeEstimate: 1 }];
    expect(restorePointsToPrune(old, NOW)).toEqual(['p1']);
    const sized = [{ id: 'p0', createdAt: at(0), sizeEstimate: 6 }, { id: 'p1', createdAt: at(1), sizeEstimate: 6 }, { id: 'p2', createdAt: at(2), sizeEstimate: 1 }];
    expect(restorePointsToPrune(sized, NOW, { maxCount: 20, maxAgeDays: 30, maxTotalSize: 10 })).toEqual(['p1', 'p2']);
    const single = [{ id: 'big', createdAt: at(0), sizeEstimate: 100 }];
    expect(restorePointsToPrune(single, NOW, { maxCount: 20, maxAgeDays: 30, maxTotalSize: 10 })).toEqual([]);
  });

  it('prunes trip changes as their own group of ten, with a recorded restore counted in the group of what it restored (FX8)', () => {
    const at = (minutes: number) => new Date(Date.parse(NOW) - minutes * 60_000).toISOString();
    const other = Array.from({ length: 25 }, (_value, index) => ({ id: `o${index}`, kind: 'deleteTrips' as const, createdAt: at(index * 2), sizeEstimate: 1 }));
    const trips = Array.from({ length: 15 }, (_value, index) => ({ id: `t${index}`, kind: 'shiftTrips' as const, createdAt: at(index * 2 + 1), sizeEstimate: 1 }));
    const dropped = restorePointsToPruneByGroup([...other, ...trips], NOW);
    expect(dropped.filter((id) => id.startsWith('o')).sort()).toEqual(other.slice(20).map((point) => point.id).sort());
    expect(dropped.filter((id) => id.startsWith('t')).sort()).toEqual(trips.slice(10).map((point) => point.id).sort());
    expect(isTripChange({ kind: 'restore', restoredKind: 'regenerateTrips' })).toBe(true);
    expect(isTripChange({ kind: 'restore', restoredKind: 'deleteTrips' })).toBe(false);
    const old = new Date(Date.parse(NOW) - 40 * 86_400_000).toISOString();
    expect(restorePointsToPruneByGroup([{ id: 'oldTrip', kind: 'changeTripPattern', createdAt: old, sizeEstimate: 1 }, { id: 'oldOther', kind: 'deleteRoute', createdAt: old, sizeEstimate: 1 }], NOW)).toEqual([]);
  });

  it('stamps equal rows equally and differs when one field changes', () => {
    expect(rowStamp({ id: 'a', name: 'x' })).toBe(rowStamp({ id: 'a', name: 'x' }));
    expect(rowStamp({ id: 'a', name: 'x' })).not.toBe(rowStamp({ id: 'a', name: 'y' }));
  });
});
