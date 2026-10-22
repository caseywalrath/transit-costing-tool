import { describe, expect, it } from 'vitest';
import { ProjectBackupService } from '../persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { RouteDefinitionService } from './routeDefinitionService';
import { metadata } from '../domain/ids';
import type { ProjectSnapshot, Trip } from '../domain/types';

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
    const block = { id: 'shared-block', scenarioId: created.records.scenario.id, serviceDayId: created.records.serviceDays[0].id, label: '1', activities: [{ id: 'route-activity', type: 'revenueTrip' as const, sequence: 0, tripId: trip.id }, { id: 'route-deadhead', type: 'deadhead' as const, sequence: 1, startTime: 100, endTime: 200, fromNodeId: aggregate.nodes[0].id, toNodeId: aggregate.nodes[1].id }], ...metadata() };
    repository.trips.set(trip.id, trip); repository.blocks.set(block.id, block);

    await expect(service.getRouteDeletionImpact(aggregate.route.id)).resolves.toMatchObject({ nodeCount: 2, patternCount: 1, runtimeProfileCount: 1, tripCount: 1, affectedBlockCount: 1, removedBlockActivityCount: 1, removedNonRevenueActivityCount: 1 });
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

  it('copies Scenario-owned costing assumptions and removes them with the Scenario', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Costing lifecycle');
    await repository.saveCostingAssumptions({
      id: 'cost-source', scenarioId: created.records.scenario.id, currencyCode: 'USD', enteredRate: 125.25,
      rateYear: 2024, sourceType: 'ntd', sourceNote: '2024 source', baseServiceYear: 2026,
      futureYearCount: 3, annualEscalation: 0.03, ...metadata(),
    });
    const sourceRecords = await repository.getScenarioRecords(created.records.scenario.id);
    const copy = await service.duplicateScenario(sourceRecords!, 'Base Copy');

    expect(copy.costingAssumptions).toMatchObject({ scenarioId: copy.scenario.id, enteredRate: 125.25, sourceType: 'ntd' });
    expect(copy.costingAssumptions?.id).not.toBe('cost-source');
    expect(await repository.getCostingAssumptions(created.records.scenario.id)).toEqual(sourceRecords?.costingAssumptions);

    await service.deleteScenario(created.records.scenario.id);
    expect(await repository.getCostingAssumptions(created.records.scenario.id)).toBeUndefined();
    expect(await repository.getCostingAssumptions(copy.scenario.id)).toEqual(copy.costingAssumptions);
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

// Scenario-wide writes (review issues I-001 and I-016 area, package P01): the caller's Scenario copy may be older than storage.
describe('Scenario-wide writes re-read stored records', () => {
  const at = '2026-09-14T00:00:00.000Z';
  const later = '2026-09-15T00:00:00.000Z';
  const project = { id: 'project', name: 'Project', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata(at) };
  const scenario = { id: 'scenario', projectId: project.id, name: 'Scenario', ...metadata(at) };
  const weekday = { id: 'weekday', scenarioId: scenario.id, kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...metadata(at) };
  const route = { id: 'route', scenarioId: scenario.id, name: 'Route', ...metadata(at) };
  const pattern = { id: 'outbound', scenarioId: scenario.id, routeId: route.id, name: 'Outbound', directionId: 'outbound', points: [0, 1].map((index) => ({ id: `outbound-${index}`, nodeId: `outbound-${index}`, sequence: index, cumulativeMiles: index })), ...metadata(at) };
  const runtimeProfile = { id: 'profile', scenarioId: scenario.id, routeId: route.id, patternId: pattern.id, name: 'All day', calculationRevision: 4, bands: [{ id: 'band', label: 'All day', sequence: 0, startTime: 0, endTime: 100000, segmentRuntimeSeconds: [600] }], ...metadata(at) };
  const makeTrip = (id: string, firstTime: number): Trip => ({
    id, scenarioId: scenario.id, routeId: route.id, serviceDayId: weekday.id, patternId: pattern.id, tripProfileId: 'trip-profile',
    stopTimes: pattern.points.map((point, index) => ({ patternPointId: point.id, sequence: index, time: firstTime + 600 * index })),
    provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...metadata(at),
  } as Trip);
  const snapshot = (): ProjectSnapshot => ({
    project, scenarios: [scenario], serviceDays: [weekday], routes: [route], nodes: [], patterns: [pattern],
    runtimeProfiles: [runtimeProfile], runtimeAssignments: [], tripProfiles: [{ id: 'trip-profile', scenarioId: scenario.id, name: 'Default', ...metadata(at) }],
    generationSets: [], trips: [makeTrip('trip-1', 1000)], blocks: [],
  });
  async function setup() {
    const repository = new InMemoryRouteDefinitionRepository();
    await repository.saveProjectSnapshot(snapshot());
    const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (value) => repository.saveProjectSnapshot(value));
    const service = new RouteDefinitionService(repository, backup, () => later);
    const stale = (await repository.getScenarioRecords(scenario.id))!;
    // Work saved by another part of the app after the caller took its copy.
    await repository.saveTrips([{ ...makeTrip('trip-1', 1000), stopTimes: makeTrip('trip-1', 1060).stopTimes }, makeTrip('trip-2', 5000)]);
    await repository.saveBlocks([{ id: 'block-1', scenarioId: scenario.id, serviceDayId: weekday.id, tripProfileId: 'trip-profile', label: 'NEW', activities: [], ...metadata(at) }]);
    await repository.saveRuntimeProfile({ ...runtimeProfile, name: 'EDITED-NAME' });
    return { repository, service, stale };
  }
  async function expectNewerWorkKept(repository: InMemoryRouteDefinitionRepository) {
    const stored = (await repository.getScenarioRecords(scenario.id))!;
    expect(stored.trips.map((trip) => trip.id)).toEqual(expect.arrayContaining(['trip-1', 'trip-2']));
    expect(stored.trips.find((trip) => trip.id === 'trip-1')!.stopTimes[0].time).toBe(1060);
    expect(stored.blocks.map((block) => block.id)).toContain('block-1');
    expect(stored.runtimeProfiles.find((profile) => profile.id === 'profile')!.name).toBe('EDITED-NAME');
  }

  it('updateServiceDay keeps newer Trips, Blocks, and Runtime profiles and applies its own change', async () => {
    const { repository, service, stale } = await setup();
    const result = await service.updateServiceDay(stale, weekday.id, { name: 'Weekday renamed' });
    await expectNewerWorkKept(repository);
    expect((await repository.getScenarioRecords(scenario.id))!.serviceDays[0].name).toBe('Weekday renamed');
    expect(result.trips).toHaveLength(2);
  });

  it('updateServiceDay with no field change writes nothing', async () => {
    const { repository, service, stale } = await setup();
    const states: string[] = [];
    service.subscribeToSaveStatus((status) => states.push(status.state));
    const before = JSON.stringify(await repository.getScenarioRecords(scenario.id));
    const result = await service.updateServiceDay(stale, weekday.id, { name: weekday.name, annualServiceDays: weekday.annualServiceDays });
    expect(JSON.stringify(await repository.getScenarioRecords(scenario.id))).toBe(before);
    expect(states).toEqual(['idle']);
    expect(result.trips).toHaveLength(2);
  });

  it('renameScenario keeps newer work', async () => {
    const { repository, service, stale } = await setup();
    await service.renameScenario(stale, 'Renamed');
    await expectNewerWorkKept(repository);
    expect((await repository.getScenarioRecords(scenario.id))!.trips).toHaveLength(2);
    expect((await repository.getScenarioRecords(scenario.id))!.scenario.name).toBe('Renamed');
  });

  it('addRoute keeps newer work', async () => {
    const { repository, service, stale } = await setup();
    const added = await service.addRoute(stale);
    await expectNewerWorkKept(repository);
    const stored = (await repository.getScenarioRecords(scenario.id))!;
    expect(stored.routes.map((candidate) => candidate.id)).toContain(added.route.id);
    expect(added.records.trips).toHaveLength(2);
  });

  it('duplicateRoute keeps newer work and copies the stored Route', async () => {
    const { repository, service, stale } = await setup();
    const duplicated = await service.duplicateRoute(stale, route.id, 'Route copy');
    await expectNewerWorkKept(repository);
    const stored = (await repository.getScenarioRecords(scenario.id))!;
    expect(stored.routes.map((candidate) => candidate.id)).toContain(duplicated.route.id);
    expect(stored.runtimeProfiles.some((profile) => profile.routeId === duplicated.route.id && profile.name === 'EDITED-NAME')).toBe(true);
  });

  it('duplicateScenario copies the stored Trips and Blocks, not the caller copy', async () => {
    const { service, stale } = await setup();
    const copy = await service.duplicateScenario(stale, 'Scenario copy');
    expect(copy.trips).toHaveLength(2);
    expect(copy.blocks).toHaveLength(1);
    expect(copy.runtimeProfiles[0].name).toBe('EDITED-NAME');
  });

  it('rejects a change to a Scenario that no longer exists instead of recreating it', async () => {
    const { repository, service, stale } = await setup();
    await repository.deleteProject(project.id);
    await expect(service.updateServiceDay(stale, weekday.id, { name: 'x' })).rejects.toThrow(/Scenario/);
    expect(await repository.getScenarioRecords(scenario.id)).toBeUndefined();
  });
});
