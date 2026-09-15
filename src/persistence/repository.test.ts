import { describe, expect, it } from 'vitest';
import { TransitDatabase } from './database';
import { InMemoryRouteDefinitionRepository } from './inMemoryRepository';
import { metadata } from '../domain/ids';

describe('route-definition persistence', () => {
  it('round trips a route aggregate in memory and removes deleted children', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const route = { id: 'route', scenarioId: 'scenario', name: 'Route', ...metadata() };
    const node = { id: 'node', scenarioId: 'scenario', routeId: 'route', name: 'Terminal', kind: 'terminal' as const, ...metadata() };
    const pattern = { id: 'pattern', scenarioId: 'scenario', routeId: 'route', name: 'Full', points: [{ id: 'point', nodeId: 'node', sequence: 0, cumulativeMiles: 0 }, { id: 'point-2', nodeId: 'node', sequence: 1, cumulativeMiles: 1 }], ...metadata() };
    await repository.saveRouteDefinition({ route, nodes: [node], patterns: [pattern] });
    expect(await repository.getRouteDefinition(route.id)).toEqual({ route, nodes: [node], patterns: [pattern] });
    await repository.saveRouteDefinition({ route, nodes: [], patterns: [] });
    expect(await repository.getRouteDefinition(route.id)).toEqual({ route, nodes: [], patterns: [] });
  });

  it('defines IndexedDB schema version 3 with runtime and trip-profile lookups', () => {
    const database = new TransitDatabase(`transit-costing-test-${Date.now()}`);
    expect(database.verno).toBe(3);
    expect(database.tables.map((table) => table.name)).toEqual(expect.arrayContaining(['runtimeProfiles', 'runtimeAssignments', 'tripProfiles']));
    expect(database.runtimeAssignments.schema.indexes.map((index) => index.name)).toEqual(expect.arrayContaining(['runtimeProfileId']));
    expect(database.trips.schema.indexes.map((index) => index.name)).toEqual(expect.arrayContaining(['tripProfileId', '[tripProfileId+routeId]', '[tripProfileId+serviceDayId]']));
    expect(database.blocks.schema.indexes.map((index) => index.name)).toEqual(expect.arrayContaining(['tripProfileId', '[tripProfileId+serviceDayId]']));
    database.close();
  });

  it('round trips runtime profiles and assignments and enforces assignment uniqueness', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const scenario = { id: 'scenario', projectId: 'project', name: 'Base', ...metadata() };
    const serviceDay = { id: 'weekday', scenarioId: scenario.id, kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...metadata() };
    const route = { id: 'route', scenarioId: scenario.id, name: 'Route', ...metadata() };
    const nodes = [
      { id: 'a', scenarioId: scenario.id, routeId: route.id, name: 'A', kind: 'terminal' as const, ...metadata() },
      { id: 'b', scenarioId: scenario.id, routeId: route.id, name: 'B', kind: 'terminal' as const, ...metadata() },
      { id: 'c', scenarioId: scenario.id, routeId: route.id, name: 'C', kind: 'terminal' as const, ...metadata() },
    ];
    const pattern = { id: 'pattern', scenarioId: scenario.id, routeId: route.id, name: 'A-C', points: nodes.map((node, sequence) => ({ id: `point-${sequence}`, nodeId: node.id, sequence, cumulativeMiles: sequence })), ...metadata() };
    const profile = { id: 'profile', scenarioId: scenario.id, routeId: route.id, patternId: pattern.id, name: 'All day', bands: [{ id: 'band', label: 'All day', sequence: 0, startTime: 0, endTime: 100000, segmentRuntimeSeconds: [600, 700] }], ...metadata() };
    const assignment = { id: 'assignment', scenarioId: scenario.id, patternId: pattern.id, serviceDayId: serviceDay.id, runtimeProfileId: profile.id, ...metadata() };
    await repository.saveProjectSnapshot({ project: { id: 'project', name: 'Project', distanceUnit: 'miles', currencyCode: 'USD', ...metadata() }, scenarios: [scenario], serviceDays: [serviceDay], routes: [route], nodes, patterns: [pattern], runtimeProfiles: [profile], runtimeAssignments: [assignment], generationSets: [], trips: [], blocks: [] });
    expect(await repository.listRuntimeProfiles(route.id)).toEqual([profile]);
    expect(await repository.listRuntimeAssignments(scenario.id)).toEqual([assignment]);
    await expect(repository.saveRuntimeAssignment({ ...assignment, id: 'duplicate' })).rejects.toThrow(/Duplicate runtime assignment/);
  });

  it('round trips generation sets, trips, and blocks and removes deleted generation records', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const project = { id: 'project', name: 'Project', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata() };
    const scenario = { id: 'scenario', projectId: project.id, name: 'Base', ...metadata() };
    const day = { id: 'day', scenarioId: scenario.id, kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...metadata() };
    const route = { id: 'route', scenarioId: scenario.id, name: 'Route', ...metadata() };
    const nodeA = { id: 'a', scenarioId: scenario.id, routeId: route.id, name: 'A', kind: 'terminal' as const, ...metadata() };
    const nodeB = { id: 'b', scenarioId: scenario.id, routeId: route.id, name: 'B', kind: 'terminal' as const, ...metadata() };
    const pattern = { id: 'pattern', scenarioId: scenario.id, routeId: route.id, name: 'A-B', points: [{ id: 'pa', nodeId: 'a', sequence: 0, cumulativeMiles: 0 }, { id: 'pb', nodeId: 'b', sequence: 1, cumulativeMiles: 1 }], ...metadata() };
    const set = { id: 'set', scenarioId: scenario.id, routeId: route.id, serviceDayId: day.id, patternId: pattern.id, name: 'Set', firstDeparture: 0, headwaySeconds: 600, limit: { mode: 'tripCount' as const, tripCount: 1 }, generationRevision: 1, ...metadata() };
    const trip = { id: 'trip', scenarioId: scenario.id, routeId: route.id, serviceDayId: day.id, patternId: pattern.id, stopTimes: [{ patternPointId: 'pa', sequence: 0, time: 0 }, { patternPointId: 'pb', sequence: 1, time: 60 }], provenance: { kind: 'generated' as const, generationSetId: set.id, generationRevision: 1, generationSequence: 0, manuallyChangedFields: [] }, ...metadata() };
    const block = { id: 'block', scenarioId: scenario.id, serviceDayId: day.id, label: '1', activities: [{ id: 'activity', type: 'revenueTrip' as const, sequence: 0, tripId: trip.id }], ...metadata() };
    const snapshot = { project, scenarios: [scenario], serviceDays: [day], routes: [route], nodes: [nodeA, nodeB], patterns: [pattern], runtimeProfiles: [], runtimeAssignments: [], generationSets: [set], trips: [trip], blocks: [block] };
    await repository.saveProjectSnapshot(snapshot);
    expect((await repository.getProjectSnapshot(project.id))?.trips).toEqual([trip]);
    await repository.saveProjectSnapshot({ ...snapshot, generationSets: [], trips: [], blocks: [] });
    expect((await repository.getProjectSnapshot(project.id))?.trips).toEqual([]);
  });

  it('atomically inserts authoritative trips', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const base = { scenarioId: 'scenario', routeId: 'route', serviceDayId: 'day', patternId: 'pattern', stopTimes: [], provenance: { kind: 'manual' as const, creationMethod: 'manual' as const, manuallyChangedFields: [] as Array<'patternId' | 'times'> }, ...metadata() };
    const existing = { ...base, id: 'existing' };
    repository.trips.set(existing.id, existing);
    await expect(repository.insertTripsAtomically([{ ...base, id: 'new' }, existing])).rejects.toThrow();
    expect([...repository.trips.keys()]).toEqual(['existing']);
  });
});
