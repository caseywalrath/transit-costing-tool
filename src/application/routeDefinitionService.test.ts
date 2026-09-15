import { describe, expect, it } from 'vitest';
import { ProjectBackupService } from '../persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { RouteDefinitionService } from './routeDefinitionService';
import { metadata } from '../domain/ids';

function createService(repository = new InMemoryRouteDefinitionRepository()) {
  const backup = new ProjectBackupService(
    (projectId) => repository.getProjectSnapshot(projectId),
    (snapshot) => repository.saveProjectSnapshot(snapshot),
  );
  return { service: new RouteDefinitionService(repository, backup, () => '2026-09-10T12:00:00.000Z') };
}

describe('RouteDefinitionService', () => {
  it('coordinates a route-definition workflow across application and persistence layers', async () => {
    const { service } = createService();
    const created = await service.createProject('Federal Boulevard');
    expect(created.records.scenario.name).toBe('Scenario 1');
    expect(created.records.serviceDays.map((day) => day.kind)).toEqual(['weekday', 'saturday', 'sunday', 'holiday']);
    expect(created.records.trips).toEqual([]);

    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    expect(aggregate.directions?.map((direction) => direction.name)).toEqual(['Outbound', 'Inbound']);
    aggregate = await service.updateRoute(aggregate, { name: 'Federal Boulevard' });
    aggregate = await service.addNode(aggregate);
    aggregate = await service.updateNode(aggregate, aggregate.nodes[0].id, { name: 'Decatur', kind: 'terminal' });
    aggregate = await service.addNode(aggregate);
    aggregate = await service.updateNode(aggregate, aggregate.nodes[1].id, { name: 'Broadway' });
    const addedPattern = await service.addPattern(aggregate);
    aggregate = await service.updatePattern(addedPattern.aggregate, addedPattern.pattern.id, { name: 'Outbound' });
    aggregate = await service.addPatternPoint(aggregate, addedPattern.pattern.id);
    aggregate = await service.addPatternPoint(aggregate, addedPattern.pattern.id);
    aggregate = await service.updatePatternPoint(aggregate, addedPattern.pattern.id, 1, { nodeId: aggregate.nodes[1].id, cumulativeMiles: 4.2 });
    const reversed = await service.createReversePattern(aggregate, addedPattern.pattern.id, 'Inbound');
    const duplicated = await service.duplicatePattern(reversed.aggregate, addedPattern.pattern.id, 'Outbound Copy');

    expect(service.validate(reversed.aggregate)).toEqual([]);
    expect(reversed.pattern.points.map((point) => point.nodeId)).toEqual([aggregate.nodes[1].id, aggregate.nodes[0].id]);
    expect(reversed.pattern.directionId).toBe(reversed.aggregate.directions?.find((direction) => direction.group === 'inbound')?.id);
    expect(service.getSegmentMiles(reversed.pattern, 1)).toBe(4.2);
    const reloaded = await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id);
    expect(service.exportCsv(reversed.aggregate, reloaded.records).map((file) => file.suffix)).toEqual([
      'routes', 'nodes', 'patterns', 'pattern-points', 'runtime-bands', 'generation-sets', 'trips', 'scheduled-points', 'blocks', 'block-activities',
    ]);
    expect(reloaded.aggregate?.patterns.map((pattern) => pattern.name)).toEqual(['Outbound', 'Inbound', 'Outbound Copy']);
    expect(duplicated.pattern.id).not.toBe(addedPattern.pattern.id);
    expect(duplicated.pattern.points.map((point) => point.id)).not.toEqual(addedPattern.pattern.points.map((point) => point.id));
  });

  it('publishes centralized saving and saved states', async () => {
    const { service } = createService();
    const states: string[] = [];
    const unsubscribe = service.subscribeToSaveStatus((status) => states.push(status.state));
    await service.createProject('Project');
    unsubscribe();
    expect(states).toEqual(['idle', 'saving', 'saved']);
    expect(service.getSaveStatus()).toEqual({ state: 'saved', updatedAt: '2026-09-10T12:00:00.000Z' });
  });

  it('provides runtime-profile editing operations without exposing persistence to the interface', async () => {
    const { service } = createService();
    const created = await service.createProject('Runtime project');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = await service.addNode(aggregate);
    aggregate = await service.updateNode(aggregate, aggregate.nodes[0].id, { name: 'South terminal' });
    aggregate = await service.addNode(aggregate);
    aggregate = await service.updateNode(aggregate, aggregate.nodes[1].id, { name: 'North terminal' });
    const addedPattern = await service.addPattern(aggregate);
    aggregate = await service.updatePattern(addedPattern.aggregate, addedPattern.pattern.id, { name: 'Outbound' });
    aggregate = await service.addPatternPoint(aggregate, addedPattern.pattern.id);
    aggregate = await service.addPatternPoint(aggregate, addedPattern.pattern.id);

    const weekday = created.records.serviceDays[0];
    const profile = await service.createDefaultRuntimeProfile(aggregate.patterns[0], 'Weekday runtimes');
    await service.assignRuntimeProfile(created.records.scenario.id, aggregate.patterns[0].id, weekday.id, profile.id);
    const saved = await service.saveRuntimeProfile({ ...profile, bands: [{ ...profile.bands[0], segmentRuntimeSeconds: [600] }] });
    const copy = await service.copyRuntimeProfile(saved.id, 'Weekday runtimes Copy');

    expect((await service.listRuntimeAssignments(created.records.scenario.id, weekday.id, aggregate.patterns[0].id))[0].runtimeProfileId).toBe(profile.id);
    expect((await service.listRuntimeProfiles(aggregate.route.id, aggregate.patterns[0].id)).map((item) => item.name)).toEqual(['Weekday runtimes', 'Weekday runtimes Copy']);
    expect(copy.bands[0].id).not.toBe(saved.bands[0].id);
  });

  it('publishes an error state and rethrows failed writes', async () => {
    class FailingRepository extends InMemoryRouteDefinitionRepository {
      override async saveProjectSnapshot(): Promise<void> { throw new Error('IndexedDB unavailable'); }
    }
    const { service } = createService(new FailingRepository());
    const states: string[] = [];
    service.subscribeToSaveStatus((status) => states.push(status.state));
    await expect(service.createProject('Project')).rejects.toThrow('IndexedDB unavailable');
    expect(states).toEqual(['idle', 'saving', 'error']);
    expect(service.getSaveStatus()).toEqual({ state: 'error', errorMessage: 'IndexedDB unavailable' });
  });

  it('provisions one Default profile and standard-day assignments idempotently', async () => {
    const { service } = createService();
    const created = await service.createProject('Defaults');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = await service.addNode(aggregate);
    aggregate = await service.updateNode(aggregate, aggregate.nodes[0].id, { name: 'A' });
    aggregate = await service.addNode(aggregate);
    aggregate = await service.updateNode(aggregate, aggregate.nodes[1].id, { name: 'B' });
    const added = await service.addPattern(aggregate);
    aggregate = await service.addPatternPoint(added.aggregate, added.pattern.id);
    aggregate = await service.addPatternPoint(aggregate, added.pattern.id);
    const pattern = aggregate.patterns[0];
    const first = await service.ensureDefaultRuntimeProfile(pattern);
    const second = await service.ensureDefaultRuntimeProfile(pattern);
    expect(first.profile.id).toBe(second.profile.id);
    expect(first.assignments).toHaveLength(4);
    expect(second.assignments.map((assignment) => assignment.id)).toEqual(first.assignments.map((assignment) => assignment.id));
  });

  it('rejects profile deletion while assigned and accepts an explicit replacement', async () => {
    const { service } = createService();
    const created = await service.createProject('Profile lifecycle');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = await service.addNode(aggregate);
    aggregate = await service.addNode(aggregate);
    const added = await service.addPattern(aggregate);
    aggregate = await service.addPatternPoint(added.aggregate, added.pattern.id);
    aggregate = await service.addPatternPoint(aggregate, added.pattern.id);
    const pattern = aggregate.patterns[0];
    const defaultProfile = await service.ensureDefaultRuntimeProfile(pattern);
    const replacement = await service.createDefaultRuntimeProfile(pattern, 'Alternative');
    await expect(service.deleteRuntimeProfile(defaultProfile.profile.id)).rejects.toThrow(/replacement/);
    await service.deleteRuntimeProfile(defaultProfile.profile.id, replacement.id);
    expect((await service.listRuntimeProfiles(aggregate.route.id, pattern.id)).map((item) => item.name)).toEqual(['Alternative']);
  });

  it('blocks direction deletion while patterns use it and cascades a confirmed pattern deletion', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Deletion impacts');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = await service.addNode(aggregate); aggregate = await service.addNode(aggregate);
    const added = await service.addPattern(aggregate);
    aggregate = await service.addPatternPoint(added.aggregate, added.pattern.id);
    aggregate = await service.addPatternPoint(aggregate, added.pattern.id);
    const pattern = aggregate.patterns[0]; const directionId = pattern.directionId!;
    const runtime = await service.ensureDefaultRuntimeProfile(pattern);
    const trip = { id: 'trip', scenarioId: created.records.scenario.id, routeId: aggregate.route.id, serviceDayId: created.records.serviceDays[0].id, patternId: pattern.id, stopTimes: [{ id: 'point', patternPointId: pattern.points[0].id, sequence: 0, time: 0 }], provenance: { kind: 'manual' as const, creationMethod: 'manual' as const, runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0, calculationSource: { runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0 }, manuallyChangedFields: [] }, ...metadata() };
    const block = { id: 'block', scenarioId: created.records.scenario.id, serviceDayId: created.records.serviceDays[0].id, label: '1', activities: [{ id: 'activity', type: 'revenueTrip' as const, sequence: 0, tripId: trip.id }], ...metadata() };
    repository.trips.set(trip.id, trip); repository.blocks.set(block.id, block);
    expect((await service.getDirectionDeletionImpact(aggregate, directionId)).patternIds).toEqual([pattern.id]);
    await expect(service.deleteDirection(aggregate, directionId)).rejects.toThrow(/managed automatically/);
    expect(await service.getPatternDeletionImpact(pattern.id)).toMatchObject({ runtimeProfileCount: 1, runtimeAssignmentCount: 4, tripCount: 1, affectedBlockCount: 1 });
    await service.deletePattern(pattern.id);
    expect((await repository.getRouteDefinition(aggregate.route.id))?.patterns).toEqual([]);
    expect(await repository.listRuntimeProfiles(aggregate.route.id)).toEqual([]);
    expect(repository.trips.has(trip.id)).toBe(false);
    expect(repository.blocks.get(block.id)?.activities).toEqual([]);
  });

  it('deletes a Route with its dependent service and retains affected blocks without its trip activities', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Route deletion');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = await service.addNode(aggregate); aggregate = await service.addNode(aggregate);
    const added = await service.addPattern(aggregate);
    aggregate = await service.addPatternPoint(added.aggregate, added.pattern.id);
    aggregate = await service.addPatternPoint(aggregate, added.pattern.id);
    const pattern = aggregate.patterns[0];
    const runtime = await service.ensureDefaultRuntimeProfile(pattern);
    const trip = { id: 'route-trip', scenarioId: created.records.scenario.id, routeId: aggregate.route.id, serviceDayId: created.records.serviceDays[0].id, patternId: pattern.id, stopTimes: [{ id: 'point', patternPointId: pattern.points[0].id, sequence: 0, time: 0 }], provenance: { kind: 'manual' as const, creationMethod: 'manual' as const, runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0, calculationSource: { runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0 }, manuallyChangedFields: [] }, ...metadata() };
    const block = { id: 'shared-block', scenarioId: created.records.scenario.id, serviceDayId: created.records.serviceDays[0].id, label: '1', activities: [{ id: 'route-activity', type: 'revenueTrip' as const, sequence: 0, tripId: trip.id }], ...metadata() };
    repository.trips.set(trip.id, trip); repository.blocks.set(block.id, block);

    await expect(service.getRouteDeletionImpact(aggregate.route.id)).resolves.toMatchObject({ nodeCount: 2, patternCount: 1, runtimeProfileCount: 1, tripCount: 1, affectedBlockCount: 1, removedBlockActivityCount: 1 });
    await service.deleteRoute(aggregate.route.id);

    expect(await repository.getRouteDefinition(aggregate.route.id)).toBeUndefined();
    expect(await repository.listRuntimeProfiles(aggregate.route.id)).toEqual([]);
    expect(repository.trips.has(trip.id)).toBe(false);
    expect(repository.blocks.get(block.id)?.activities).toEqual([]);
  });

  it('deletes a Scenario only when another Scenario remains in the project', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Scenario deletion');
    const alternate = await service.createScenario(created.project.id, 'Alternative');

    await expect(service.getScenarioDeletionImpact(created.records.scenario.id)).resolves.toMatchObject({ remainingScenarioCount: 1, routeCount: 0, tripProfileCount: 1, blockCount: 0 });
    await service.deleteScenario(created.records.scenario.id);

    expect((await repository.listScenarios(created.project.id)).map((scenario) => scenario.id)).toEqual([alternate.scenario.id]);
    await expect(service.deleteScenario(alternate.scenario.id)).rejects.toThrow('Create another scenario before deleting the only scenario');
  });

  it('does not commit a reviewed route edit after its source data changes', async () => {
    const { service } = createService();
    const created = await service.createProject('Stale route edit');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = await service.addNode(aggregate);
    aggregate = await service.updateNode(aggregate, aggregate.nodes[0].id, { name: 'A' });
    const preview = await service.previewNodeChanges(aggregate.route.id, [{ ...aggregate.nodes[0], name: 'A renamed' }]);
    await service.updateRoute(aggregate, { description: 'Changed elsewhere' });
    await expect(service.commitNodeChanges(preview.previewToken)).rejects.toThrow('changed after this review');
    const reloaded = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    expect(reloaded.nodes[0].name).toBe('A');
  });

  it('atomically rebalances a saved Pattern, runtimes, and trips after a point is inserted', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Rebalance');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    for (const name of ['A', 'B', 'C']) { aggregate = await service.addNode(aggregate); aggregate = await service.updateNode(aggregate, aggregate.nodes.at(-1)!.id, { name }); }
    const added = await service.addPattern(aggregate);
    aggregate = await service.addPatternPoint(added.aggregate, added.pattern.id);
    aggregate = await service.addPatternPoint(aggregate, added.pattern.id);
    aggregate = await service.updatePatternPoint(aggregate, added.pattern.id, 1, { nodeId: aggregate.nodes[2].id, cumulativeMiles: 2 });
    const saved = aggregate.patterns[0];
    const runtime = await service.ensureDefaultRuntimeProfile(saved);
    await service.saveRuntimeProfile({ ...runtime.profile, bands: [{ ...runtime.profile.bands[0], endTime: 86400, segmentRuntimeSeconds: [600] }] });
    repository.trips.set('trip', { id: 'trip', scenarioId: created.records.scenario.id, routeId: aggregate.route.id, serviceDayId: created.records.serviceDays[0].id, patternId: saved.id, stopTimes: [{ patternPointId: saved.points[0].id, sequence: 0, time: 21600 }, { patternPointId: saved.points[1].id, sequence: 1, time: 22200 }], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: ['times'], manualTimeShiftSeconds: 60, runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0, calculationSource: { runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0 } }, ...metadata() });
    const proposed = { ...saved, points: [saved.points[0], { id: 'inserted', nodeId: aggregate.nodes[1].id, sequence: 1, cumulativeMiles: 1 }, saved.points[1]] };
    const preview = await service.previewPatternChange(aggregate.route.id, saved.id, proposed);
    expect(preview.classification).toBe('deterministic');
    const committed = await service.commitPatternChange(preview.previewToken);
    expect(committed.records.runtimeProfiles.find((profile) => profile.id === runtime.profile.id)?.bands[0].segmentRuntimeSeconds).toEqual([0, 600]);
    expect(committed.records.trips.find((trip) => trip.id === 'trip')?.stopTimes.map((point) => point.time)).toEqual([21600, 21600, 22200]);
    expect(committed.aggregate.directions?.[0].columns).toHaveLength(3);
  });
});
