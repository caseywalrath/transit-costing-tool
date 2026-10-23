import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectBackupService } from '../persistence/backupRepository';
import { TransitDatabase } from '../persistence/database';
import { DexieRouteDefinitionRepository } from '../persistence/dexieRepository';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { RouteDefinitionService, ServiceDayValidationError } from './routeDefinitionService';
import type { RouteDefinitionRepository, TripGenerationRepository } from './ports';
import { metadata, newId } from '../domain/ids';
import type { Block, ProjectSnapshot, Trip } from '../domain/types';
import { addBlocks } from '../testSupport/addBlocks';
import { addRouteNodes, addTwoStopPattern, savePattern, savePatternDraft } from '../testSupport/routeFixtures';

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
    const withNodes = await addRouteNodes(service, aggregate, [{ name: 'Decatur', kind: 'terminal' }, { name: 'Broadway' }]);
    aggregate = withNodes.aggregate;
    const [decatur, broadway] = withNodes.nodes;
    expect(aggregate.nodes.map((node) => node.name).sort()).toEqual(['Broadway', 'Decatur']);
    const addedPattern = await savePattern(service, aggregate, { name: 'Outbound', stops: [{ nodeId: decatur.id, miles: 0 }, { nodeId: broadway.id, miles: 4.2 }] });
    aggregate = addedPattern.aggregate;
    const reversed = await savePatternDraft(service, aggregate, { ...service.reversePatternDraft(aggregate, addedPattern.pattern.id), name: 'Inbound' });
    const duplicated = await savePatternDraft(service, reversed.aggregate, { ...service.duplicatePatternDraft(reversed.aggregate, addedPattern.pattern.id), name: 'Outbound Copy' });

    expect(service.validate(reversed.aggregate)).toEqual([]);
    expect(reversed.pattern.points.map((point) => point.nodeId)).toEqual([broadway.id, decatur.id]);
    expect(reversed.pattern.directionId).toBe(reversed.aggregate.directions?.find((direction) => direction.group === 'inbound')?.id);
    expect(service.getSegmentMiles(reversed.pattern, 1)).toBe(4.2);
    const reloaded = await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id);
    expect(service.exportCsv(reversed.aggregate, reloaded.records).map((file) => file.suffix)).toEqual([
      'routes', 'nodes', 'patterns', 'pattern-points', 'runtime-bands', 'generation-sets', 'trips', 'scheduled-points', 'blocks', 'block-activities',
    ]);
    // Storage returns rows in key order, and the keys are random, so the test does not depend on the order of the list.
    expect(reloaded.aggregate?.patterns.map((pattern) => pattern.name).sort()).toEqual(['Inbound', 'Outbound', 'Outbound Copy']);
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
    aggregate = (await addTwoStopPattern(service, aggregate, { names: ['South terminal', 'North terminal'], patternName: 'Outbound' })).aggregate;

    const weekday = created.records.serviceDays[0];
    const profile = await service.createDefaultRuntimeProfile(aggregate.patterns[0], 'Weekday runtimes');
    await service.assignRuntimeProfile(created.records.scenario.id, aggregate.patterns[0].id, weekday.id, profile.id);
    const saved = await service.saveRuntimeProfile({ ...profile, bands: [{ ...profile.bands[0], segmentRuntimeSeconds: [600] }] });
    const copy = await service.copyRuntimeProfile(saved.id, 'Weekday runtimes Copy');

    expect((await service.listRuntimeAssignments(created.records.scenario.id, weekday.id, aggregate.patterns[0].id))[0].runtimeProfileId).toBe(profile.id);
    expect((await service.listRuntimeProfiles(aggregate.route.id, aggregate.patterns[0].id)).map((item) => item.name).sort()).toEqual(['Weekday runtimes', 'Weekday runtimes Copy']);
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
    aggregate = (await addTwoStopPattern(service, aggregate)).aggregate;
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
    aggregate = (await addTwoStopPattern(service, aggregate)).aggregate;
    const pattern = aggregate.patterns[0];
    const defaultProfile = await service.ensureDefaultRuntimeProfile(pattern);
    const replacement = await service.createDefaultRuntimeProfile(pattern, 'Alternative');
    const review = await service.getRuntimeProfileDeletionImpact(defaultProfile.profile.id);
    await expect(service.deleteRuntimeProfile(defaultProfile.profile.id, undefined, review.reviewToken)).rejects.toThrow(/replacement/);
    await service.deleteRuntimeProfile(defaultProfile.profile.id, replacement.id, review.reviewToken);
    expect((await service.listRuntimeProfiles(aggregate.route.id, pattern.id)).map((item) => item.name)).toEqual(['Alternative']);
  });

  it('blocks direction deletion while patterns use it and cascades a confirmed pattern deletion', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Deletion impacts');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = (await addTwoStopPattern(service, aggregate)).aggregate;
    const pattern = aggregate.patterns[0]; const directionId = pattern.directionId!;
    const runtime = await service.ensureDefaultRuntimeProfile(pattern);
    const trip = { id: 'trip', scenarioId: created.records.scenario.id, routeId: aggregate.route.id, serviceDayId: created.records.serviceDays[0].id, patternId: pattern.id, stopTimes: [{ id: 'point', patternPointId: pattern.points[0].id, sequence: 0, time: 0 }], provenance: { kind: 'manual' as const, creationMethod: 'manual' as const, runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0, calculationSource: { runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0 }, manuallyChangedFields: [] }, ...metadata() };
    const block = { id: 'block', scenarioId: created.records.scenario.id, serviceDayId: created.records.serviceDays[0].id, label: '1', activities: [{ id: 'activity', type: 'revenueTrip' as const, sequence: 0, tripId: trip.id }], ...metadata() };
    repository.trips.set(trip.id, trip); repository.blocks.set(block.id, block);
    expect((await service.getDirectionDeletionImpact(aggregate, directionId)).patternIds).toEqual([pattern.id]);
    expect(await service.getPatternDeletionImpact(pattern.id)).toMatchObject({ runtimeProfileCount: 1, runtimeAssignmentCount: 4, tripCount: 1, affectedBlockCount: 1 });
    await service.deletePattern(pattern.id, (await service.getPatternDeletionImpact(pattern.id)).reviewToken);
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
    aggregate = (await addTwoStopPattern(service, aggregate)).aggregate;
    const pattern = aggregate.patterns[0];
    const runtime = await service.ensureDefaultRuntimeProfile(pattern);
    const trip = { id: 'route-trip', scenarioId: created.records.scenario.id, routeId: aggregate.route.id, serviceDayId: created.records.serviceDays[0].id, patternId: pattern.id, stopTimes: [{ id: 'point', patternPointId: pattern.points[0].id, sequence: 0, time: 0 }], provenance: { kind: 'manual' as const, creationMethod: 'manual' as const, runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0, calculationSource: { runtimeProfileId: runtime.profile.id, runtimeCalculationRevision: 0 }, manuallyChangedFields: [] }, ...metadata() };
    const block = { id: 'shared-block', scenarioId: created.records.scenario.id, serviceDayId: created.records.serviceDays[0].id, label: '1', activities: [{ id: 'route-activity', type: 'revenueTrip' as const, sequence: 0, tripId: trip.id }, { id: 'route-deadhead', type: 'deadhead' as const, sequence: 1, startTime: 100, endTime: 200, fromNodeId: aggregate.nodes[0].id, toNodeId: aggregate.nodes[1].id }], ...metadata() };
    repository.trips.set(trip.id, trip); repository.blocks.set(block.id, block);

    const review = await service.getRouteDeletionImpact(aggregate.route.id);
    expect(review).toMatchObject({ nodeCount: 2, patternCount: 1, runtimeProfileCount: 1, tripCount: 1, affectedBlockCount: 1, removedBlockActivityCount: 1, removedNonRevenueActivityCount: 1 });
    await service.deleteRoute(aggregate.route.id, review.reviewToken);

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

    const review = await service.getScenarioDeletionImpact(created.records.scenario.id);
    expect(review).toMatchObject({ remainingScenarioCount: 1, routeCount: 0, tripProfileCount: 1, blockCount: 0 });
    await service.deleteScenario(created.records.scenario.id, review.reviewToken);

    expect((await repository.listScenarios(created.project.id)).map((scenario) => scenario.id)).toEqual([alternate.scenario.id]);
    const last = await service.getScenarioDeletionImpact(alternate.scenario.id);
    await expect(service.deleteScenario(alternate.scenario.id, last.reviewToken)).rejects.toThrow('Create another scenario before deleting the only scenario');
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

    await service.deleteScenario(created.records.scenario.id, (await service.getScenarioDeletionImpact(created.records.scenario.id)).reviewToken);
    expect(await repository.getCostingAssumptions(created.records.scenario.id)).toBeUndefined();
    expect(await repository.getCostingAssumptions(copy.scenario.id)).toEqual(copy.costingAssumptions);
  });

  it('does not commit a reviewed route edit after its source data changes', async () => {
    const { service } = createService();
    const created = await service.createProject('Stale route edit');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = (await addRouteNodes(service, aggregate, [{ name: 'A' }])).aggregate;
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
    const withNodes = await addRouteNodes(service, aggregate, [{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
    aggregate = (await savePattern(service, withNodes.aggregate, { stops: [{ nodeId: withNodes.nodes[0].id, miles: 0 }, { nodeId: withNodes.nodes[2].id, miles: 2 }] })).aggregate;
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
    await addBlocks(repository, [{ id: 'block-1', scenarioId: scenario.id, serviceDayId: weekday.id, tripProfileId: 'trip-profile', label: 'NEW', activities: [], ...metadata(at) }]);
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

// P09 (review issues I-009, I-018, I-052, I-078): validation of Service day and Scenario edits, Node deletion, and the Runtime query.
describe('Service day and Scenario validation', () => {
  async function setup() {
    const { service } = createService();
    const created = await service.createProject('Service days');
    const [weekday, saturday] = created.records.serviceDays;
    return { service, records: created.records, weekday, saturday };
  }
  async function findingsOf(promise: Promise<unknown>) {
    const error = await promise.then(() => undefined, (rejected: unknown) => rejected);
    expect(error).toBeInstanceOf(ServiceDayValidationError);
    return (error as ServiceDayValidationError).findings;
  }

  it('rejects a total above 365 with a field finding and stores nothing', async () => {
    const { service, records, weekday } = await setup();
    const states: string[] = [];
    service.subscribeToSaveStatus((status) => states.push(status.state));
    const findings = await findingsOf(service.updateServiceDay(records, weekday.id, { annualServiceDays: 400 }));
    expect(findings).toMatchObject([{ ruleId: 'serviceDay.annualServiceDaysExceed365', severity: 'error', entityType: 'serviceDay', entityId: weekday.id, field: 'annualServiceDays', parameters: { total: 504, maximum: 365 } }]);
    expect((await service.loadWorkspace(records.scenario.projectId, records.scenario.id)).records!.serviceDays.find((day) => day.id === weekday.id)!.annualServiceDays).toBe(260);
    // A refused edit is not a failed save: no write starts and no error status appears.
    expect(states).not.toContain('saving');
    expect(states).not.toContain('error');
  });

  it('accepts a total of exactly 365 and a lower total', async () => {
    const { service, records, weekday } = await setup();
    const full = await service.updateServiceDay(records, weekday.id, { annualServiceDays: 261 });
    expect(full.serviceDays.reduce((sum, day) => sum + day.annualServiceDays, 0)).toBe(365);
    const lower = await service.updateServiceDay(full, weekday.id, { annualServiceDays: 100 });
    expect(lower.serviceDays.find((day) => day.id === weekday.id)!.annualServiceDays).toBe(100);
  });

  it.each([[-5], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])('rejects the count %s', async (annualServiceDays) => {
    const { service, records, weekday } = await setup();
    const findings = await findingsOf(service.updateServiceDay(records, weekday.id, { annualServiceDays }));
    expect(findings).toMatchObject([{ ruleId: 'serviceDay.annualServiceDaysInvalid', field: 'annualServiceDays', entityId: weekday.id }]);
  });

  it('rejects a blank name, trims a name, and reports every field at once', async () => {
    const { service, records, weekday } = await setup();
    expect(await findingsOf(service.updateServiceDay(records, weekday.id, { name: '   ' }))).toMatchObject([{ ruleId: 'serviceDay.nameRequired', field: 'name', entityId: weekday.id }]);
    const both = await findingsOf(service.updateServiceDay(records, weekday.id, { name: '', annualServiceDays: -1 }));
    expect(both.map((finding) => finding.field).sort()).toEqual(['annualServiceDays', 'name']);
    const renamed = await service.updateServiceDay(records, weekday.id, { name: '  Weekday plan  ' });
    expect(renamed.serviceDays.find((day) => day.id === weekday.id)!.name).toBe('Weekday plan');
  });

  it('lets a total that is already above 365 come down in steps, and still refuses to raise it', async () => {
    const { service, records, weekday, saturday } = await setup();
    const repository = (service as unknown as { repository: InMemoryRouteDefinitionRepository }).repository;
    // Data saved before the check existed: 300 + 100 + 52 + 0.
    await repository.updateScenarioRecords(records.scenario.id, (current) => ({ ...current, serviceDays: current.serviceDays.map((day) => day.id === weekday.id ? { ...day, annualServiceDays: 300 } : day.id === saturday.id ? { ...day, annualServiceDays: 100 } : day) }));
    const stale = (await repository.getScenarioRecords(records.scenario.id))!;
    await expect(service.updateServiceDay(stale, saturday.id, { annualServiceDays: 120 })).rejects.toBeInstanceOf(ServiceDayValidationError);
    const lowered = await service.updateServiceDay(stale, weekday.id, { annualServiceDays: 280 });
    expect(lowered.serviceDays.find((day) => day.id === weekday.id)!.annualServiceDays).toBe(280);
    const renamed = await service.updateServiceDay(lowered, saturday.id, { name: 'Saturday service' });
    expect(renamed.serviceDays.find((day) => day.id === saturday.id)!.name).toBe('Saturday service');
  });

  it('renameScenario rejects a blank name and trims a name', async () => {
    const { service, records } = await setup();
    await expect(service.renameScenario(records, '   ')).rejects.toThrow('Scenario name is required');
    expect((await service.loadWorkspace(records.scenario.projectId, records.scenario.id)).records!.scenario.name).toBe('Scenario 1');
    expect((await service.renameScenario(records, '  Base  ')).scenario.name).toBe('Base');
  });
});

// The P09 tests that need real storage run against the in-memory repository and the Dexie repository on fake-indexeddb.
let databaseCounter = 0;
type TestRepository = RouteDefinitionRepository & Pick<TripGenerationRepository, 'listBlocks'>;
const implementations: { name: string; create(): Promise<{ repository: TestRepository; close(): Promise<void> }> }[] = [
  { name: 'in-memory', create: async () => ({ repository: new InMemoryRouteDefinitionRepository(), close: async () => {} }) },
  {
    name: 'Dexie',
    create: async () => {
      const name = `transit-costing-p09-${Date.now()}-${databaseCounter += 1}`;
      const db = new TransitDatabase(name);
      await db.open();
      return { repository: new DexieRouteDefinitionRepository(db), close: async () => { db.close(); await Dexie.delete(name); } };
    },
  },
];

function serviceOn(repository: TestRepository) {
  const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
  return new RouteDefinitionService(repository, backup, () => '2026-09-10T12:00:00.000Z');
}

describe.each(implementations)('Node deletion removes the non-revenue activities that name the Node: $name', ({ create }) => {
  let close: () => Promise<void> = async () => {};
  afterEach(async () => { await close(); });

  const blocksOf = async (repository: TestRepository, serviceDayId: string) => new Map((await repository.listBlocks(serviceDayId)).map((block) => [block.id, block]));
  async function setup() {
    const harness = await create();
    close = harness.close;
    const repository = harness.repository;
    const service = serviceOn(repository);
    const created = await service.createProject('Node deletion');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    const withNodes = await addRouteNodes(service, aggregate, [{ name: 'A' }, { name: 'B' }, { name: 'Garage' }]);
    aggregate = (await savePattern(service, withNodes.aggregate, { stops: [{ nodeId: withNodes.nodes[0].id, miles: 0 }, { nodeId: withNodes.nodes[1].id, miles: 1 }] })).aggregate;
    const [a, b, garage] = withNodes.nodes;
    const base = { scenarioId: created.records.scenario.id, serviceDayId: created.records.serviceDays[0].id, ...metadata() };
    const block = (value: Block) => value;
    await addBlocks(repository, [block({ id: 'b1', ...base, label: '1', activities: [
      { id: 'b1-out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 5, fromNodeId: garage.id, toNodeId: a.id },
      { id: 'b1-dh', type: 'deadhead', sequence: 1, minutesAfterPreviousTrip: 4, fromNodeId: a.id, toNodeId: b.id },
      { id: 'b1-in', type: 'pullIn', sequence: 2, minutesAfterLastTrip: 5, fromNodeId: b.id, toNodeId: garage.id },
    ] }), block({ id: 'b2', ...base, label: '2', activities: [{ id: 'b2-out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 5, fromNodeId: garage.id, toNodeId: a.id }] }), block({ id: 'b3', ...base, label: '3', activities: [{ id: 'b3-dh', type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: 4, fromNodeId: a.id, toNodeId: b.id }] })]);
    return { repository, service, routeId: aggregate.route.id, nodes: withNodes.nodes, garage, dayId: base.serviceDayId };
  }

  it('reports the affected Blocks and activities in the review and writes nothing while reviewing', async () => {
    const { repository, service, routeId, nodes, garage, dayId } = await setup();
    const before = JSON.stringify([...(await blocksOf(repository, dayId)).values()].sort((left, right) => left.id.localeCompare(right.id)));
    const preview = await service.previewNodeChanges(routeId, nodes.filter((node) => node.id !== garage.id));
    expect(preview.deletedNodeIds).toEqual([garage.id]);
    expect({ blockIds: [...preview.nonRevenueImpact.blockIds].sort(), removedActivityCount: preview.nonRevenueImpact.removedActivityCount }).toEqual({ blockIds: ['b1', 'b2'], removedActivityCount: 3 });
    expect(JSON.stringify([...(await blocksOf(repository, dayId)).values()].sort((left, right) => left.id.localeCompare(right.id)))).toBe(before);
  });

  it('removes those activities on commit, keeps the Blocks, and leaves no reference to the deleted Node', async () => {
    const { repository, service, routeId, nodes, garage, dayId } = await setup();
    const preview = await service.previewNodeChanges(routeId, nodes.filter((node) => node.id !== garage.id));
    await service.commitNodeChanges(preview.previewToken);
    const blocks = await blocksOf(repository, dayId);
    expect(blocks.get('b1')!.activities.map((activity) => [activity.id, activity.sequence])).toEqual([['b1-dh', 0]]);
    expect(blocks.get('b2')!.activities).toEqual([]);
    expect(blocks.get('b3')!.activities.map((activity) => activity.id)).toEqual(['b3-dh']);
    const references = [...blocks.values()].flatMap((block) => block.activities).filter((activity) => activity.type !== 'revenueTrip' && (activity.fromNodeId === garage.id || activity.toNodeId === garage.id));
    expect(references).toEqual([]);
    expect(await repository.getRouteDefinition(routeId)).toMatchObject({ nodes: expect.not.arrayContaining([expect.objectContaining({ id: garage.id })]) });
  });

  it('refuses the commit when a Block that would lose an activity was changed after the review', async () => {
    const { repository, service, routeId, nodes, garage, dayId } = await setup();
    const preview = await service.previewNodeChanges(routeId, nodes.filter((node) => node.id !== garage.id));
    const b3 = (await blocksOf(repository, dayId)).get('b3')!;
    await addBlocks(repository, [{ ...b3, activities: [...b3.activities, { id: 'b3-in', type: 'pullIn', sequence: 1, minutesAfterLastTrip: 5, fromNodeId: nodes[1].id, toNodeId: garage.id }] }]);
    await expect(service.commitNodeChanges(preview.previewToken)).rejects.toThrow('changed after this review');
    expect((await blocksOf(repository, dayId)).get('b3')!.activities.map((activity) => activity.id)).toEqual(['b3-dh', 'b3-in']);
    expect((await repository.getRouteDefinition(routeId))!.nodes.map((node) => node.id)).toContain(garage.id);
  });

  it('counts deadhead and pull-in activities of a Node that a Pattern also uses, and reports none when no Node is deleted', async () => {
    const { service, routeId, nodes } = await setup();
    const preview = await service.previewNodeChanges(routeId, nodes.filter((node) => node.name !== 'B'));
    expect({ blockIds: [...preview.nonRevenueImpact.blockIds].sort(), removedActivityCount: preview.nonRevenueImpact.removedActivityCount }).toEqual({ blockIds: ['b1', 'b3'], removedActivityCount: 3 });
    const none = await service.previewNodeChanges(routeId, nodes);
    expect(none.nonRevenueImpact).toEqual({ blockIds: [], removedActivityCount: 0 });
  });
});

// P09 (review issues I-027, 4-011, 4-012): every deletion takes the token of the review the planner saw.
describe('Deletion reviews carry a required token', () => {
  async function setup() {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Deletion reviews');
    const alternate = await service.createScenario(created.project.id, 'Alternative');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = (await addTwoStopPattern(service, aggregate)).aggregate;
    const pattern = aggregate.patterns[0];
    const runtime = await service.ensureDefaultRuntimeProfile(pattern);
    const scenarioId = created.records.scenario.id;
    const serviceDayId = created.records.serviceDays[0].id;
    const trip = { id: 'route-trip', scenarioId, routeId: aggregate.route.id, serviceDayId, patternId: pattern.id, tripProfileId: created.records.tripProfiles![0].id, stopTimes: pattern.points.map((point, index) => ({ patternPointId: point.id, sequence: index, time: 600 * index })), provenance: { kind: 'manual' as const, creationMethod: 'manual' as const, manuallyChangedFields: [] }, ...metadata() };
    const block = { id: 'block', scenarioId, serviceDayId, label: '1', activities: [{ id: 'block-trip', type: 'revenueTrip' as const, sequence: 0, tripId: trip.id }], ...metadata() };
    repository.trips.set(trip.id, trip); repository.blocks.set(block.id, block);
    return { repository, service, created, alternate, aggregate, pattern, runtime, scenarioId, trip, block };
  }
  const stale = /out of date/;

  it('refuses a Project deletion when anything the Project holds changed after the review, and accepts a fresh review', async () => {
    const { repository, service, created, alternate } = await setup();
    const review = await service.getProjectDeletionImpact(created.project.id);
    expect(review.reviewToken).toEqual(expect.any(String));
    await service.addRoute(alternate);
    await expect(service.deleteProject(created.project.id, review.reviewToken)).rejects.toThrow(stale);
    expect(await repository.getProject(created.project.id)).toBeDefined();
    await service.deleteProject(created.project.id, (await service.getProjectDeletionImpact(created.project.id)).reviewToken);
    expect(await repository.getProject(created.project.id)).toBeUndefined();
  });

  it('refuses a Scenario deletion after a Trip or Block of that Scenario changed, but not after another Scenario changed', async () => {
    const { repository, service, created, alternate, scenarioId, block } = await setup();
    const review = await service.getScenarioDeletionImpact(scenarioId);
    await service.addRoute(alternate);
    await service.renameScenario(alternate, 'Alternative renamed');
    repository.blocks.set('late-block', { ...block, id: 'late-block', label: '2', activities: [] });
    await expect(service.deleteScenario(scenarioId, review.reviewToken)).rejects.toThrow(stale);
    expect((await repository.listScenarios(created.project.id)).map((scenario) => scenario.id).sort()).toEqual([scenarioId, alternate.scenario.id].sort());
    const fresh = await service.getScenarioDeletionImpact(scenarioId);
    await service.addRoute(alternate);
    await service.deleteScenario(scenarioId, fresh.reviewToken);
    expect((await repository.listScenarios(created.project.id)).map((scenario) => scenario.id)).toEqual([alternate.scenario.id]);
  });

  it('refuses a Route deletion after a Trip of the Route, or a Block it would change, changed after the review', async () => {
    const { repository, service, aggregate, trip, block } = await setup();
    const review = await service.getRouteDeletionImpact(aggregate.route.id);
    repository.trips.set('late-trip', { ...trip, id: 'late-trip' });
    await expect(service.deleteRoute(aggregate.route.id, review.reviewToken)).rejects.toThrow(stale);
    expect(repository.trips.has(trip.id)).toBe(true);
    const second = await service.getRouteDeletionImpact(aggregate.route.id);
    repository.blocks.set(block.id, { ...block, activities: [...block.activities, { id: 'late-activity', type: 'revenueTrip', sequence: 1, tripId: 'late-trip' }] });
    await expect(service.deleteRoute(aggregate.route.id, second.reviewToken)).rejects.toThrow(stale);
    expect(await repository.getRouteDefinition(aggregate.route.id)).toBeDefined();
    await service.deleteRoute(aggregate.route.id, (await service.getRouteDeletionImpact(aggregate.route.id)).reviewToken);
    expect(await repository.getRouteDefinition(aggregate.route.id)).toBeUndefined();
    expect(repository.blocks.get(block.id)!.activities).toEqual([]);
  });

  it('refuses a Pattern deletion after a Trip, a Runtime profile, or a Block it would change changed after the review', async () => {
    const { repository, service, aggregate, pattern, trip, block, runtime } = await setup();
    const review = await service.getPatternDeletionImpact(pattern.id);
    repository.trips.set('late-trip', { ...trip, id: 'late-trip' });
    await expect(service.deletePattern(pattern.id, review.reviewToken)).rejects.toThrow(stale);
    expect(repository.trips.has(trip.id)).toBe(true);
    const second = await service.getPatternDeletionImpact(pattern.id);
    await service.renameRuntimeProfile(runtime.profile.id, 'Renamed after review');
    await expect(service.deletePattern(pattern.id, second.reviewToken)).rejects.toThrow(stale);
    const third = await service.getPatternDeletionImpact(pattern.id);
    repository.blocks.set(block.id, { ...block, activities: [...block.activities, { id: 'late-activity', type: 'revenueTrip', sequence: 1, tripId: 'late-trip' }] });
    await expect(service.deletePattern(pattern.id, third.reviewToken)).rejects.toThrow(stale);
    expect((await repository.getRouteDefinition(aggregate.route.id))?.patterns).toHaveLength(1);
    expect(repository.trips.has('late-trip')).toBe(true);
    await service.deletePattern(pattern.id, (await service.getPatternDeletionImpact(pattern.id)).reviewToken);
    expect((await repository.getRouteDefinition(aggregate.route.id))?.patterns).toEqual([]);
    expect(repository.trips.size).toBe(0);
  });

  it('refuses a Runtime profile deletion after the profile or its assignments changed', async () => {
    const { service, runtime, aggregate, pattern } = await setup();
    const replacement = await service.createDefaultRuntimeProfile(pattern, 'Alternative');
    const review = await service.getRuntimeProfileDeletionImpact(runtime.profile.id);
    await service.renameRuntimeProfile(runtime.profile.id, 'Renamed after review');
    await expect(service.deleteRuntimeProfile(runtime.profile.id, replacement.id, review.reviewToken)).rejects.toThrow(stale);
    const second = await service.getRuntimeProfileDeletionImpact(runtime.profile.id);
    await service.assignRuntimeProfile(pattern.scenarioId, pattern.id, runtime.assignments[0].serviceDayId, replacement.id);
    await expect(service.deleteRuntimeProfile(runtime.profile.id, replacement.id, second.reviewToken)).rejects.toThrow(stale);
    const fresh = await service.getRuntimeProfileDeletionImpact(runtime.profile.id);
    await expect(service.deleteRuntimeProfile(runtime.profile.id, undefined, fresh.reviewToken)).rejects.toThrow(/replacement/);
    await service.deleteRuntimeProfile(runtime.profile.id, replacement.id, fresh.reviewToken);
    expect((await service.listRuntimeProfiles(aggregate.route.id, pattern.id)).map((profile) => profile.id)).toEqual([replacement.id]);
  });

  it('requires a token for every deletion, and an empty or foreign one is refused', async () => {
    const { repository, service, created, aggregate, runtime, scenarioId } = await setup();
    const missing = undefined as unknown as string;
    await expect(service.deleteProject(created.project.id, missing)).rejects.toThrow(stale);
    await expect(service.deleteScenario(scenarioId, '')).rejects.toThrow(stale);
    await expect(service.deleteRoute(aggregate.route.id, missing)).rejects.toThrow(stale);
    await expect(service.deletePattern(aggregate.patterns[0].id, missing)).rejects.toThrow(stale);
    await expect(service.deletePattern(aggregate.patterns[0].id, 'foreign')).rejects.toThrow(stale);
    await expect(service.deleteRuntimeProfile(runtime.profile.id, undefined, 'not-a-token')).rejects.toThrow(stale);
    const routeReview = await service.getRouteDeletionImpact(aggregate.route.id);
    await expect(service.deleteScenario(scenarioId, routeReview.reviewToken)).rejects.toThrow(stale);
    expect(await repository.getProject(created.project.id)).toBeDefined();
    expect(await repository.getRouteDefinition(aggregate.route.id)).toBeDefined();
  });
});

describe.each(implementations)('Default Runtime profile provisioning under overlapping calls: $name', ({ create }) => {
  let close: () => Promise<void> = async () => {};
  afterEach(async () => { await close(); });

  async function setup() {
    const harness = await create();
    close = harness.close;
    const repository = harness.repository;
    const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
    const service = new RouteDefinitionService(repository, backup, () => '2026-09-10T12:00:00.000Z');
    const created = await service.createProject('Race');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = (await addTwoStopPattern(service, aggregate)).aggregate;
    return { repository, service, aggregate, scenarioId: created.records.scenario.id, routeId: aggregate.route.id, pattern: aggregate.patterns[0] };
  }

  it.each([2, 5])('%i calls at once leave one Default profile and one assignment per standard Service day', async (calls) => {
    const { repository, service, scenarioId, routeId, pattern } = await setup();
    const results = await Promise.all(Array.from({ length: calls }, () => service.ensureDefaultRuntimeProfile(pattern)));
    const profiles = await repository.listRuntimeProfiles(routeId, pattern.id);
    expect(profiles.map((profile) => profile.name)).toEqual(['Default']);
    const assignments = await repository.listRuntimeAssignments(scenarioId, undefined, pattern.id);
    expect(assignments).toHaveLength(4);
    expect(new Set(assignments.map((assignment) => assignment.serviceDayId)).size).toBe(4);
    expect(assignments.every((assignment) => assignment.runtimeProfileId === profiles[0].id)).toBe(true);
    for (const result of results) {
      expect(result.profile.id).toBe(profiles[0].id);
      expect(result.assignments.map((assignment) => assignment.id).sort()).toEqual(assignments.map((assignment) => assignment.id).sort());
    }
  });

  it('a later call changes nothing and publishes no save status', async () => {
    const { repository, service, scenarioId, pattern } = await setup();
    await service.ensureDefaultRuntimeProfile(pattern);
    const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
    const states: string[] = [];
    service.subscribeToSaveStatus((status) => states.push(status.state));
    await service.ensureDefaultRuntimeProfile(pattern);
    expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
    expect(states).not.toContain('saving');
  });

  it('keeps an existing profile and its assignments, and still resizes it to the Pattern', async () => {
    const { repository, service, aggregate, scenarioId, routeId, pattern } = await setup();
    const first = await service.ensureDefaultRuntimeProfile(pattern);
    const lengthened = { ...pattern, points: [...pattern.points, { id: newId(), nodeId: pattern.points[0].nodeId, sequence: pattern.points.length, cumulativeMiles: pattern.points.at(-1)!.cumulativeMiles + 1 }] };
    const longer = (await service.commitPatternChange((await service.previewPatternChange(aggregate.route.id, pattern.id, lengthened)).previewToken)).aggregate.patterns.find((candidate) => candidate.id === pattern.id)!;
    const again = await service.ensureDefaultRuntimeProfile(longer);
    expect(again.profile.id).toBe(first.profile.id);
    expect(again.profile.bands[0].segmentRuntimeSeconds).toHaveLength(2);
    expect(again.profile.calculationRevision).toBe((first.profile.calculationRevision ?? 0) + 1);
    expect(await repository.listRuntimeProfiles(routeId, pattern.id)).toHaveLength(1);
    expect(await repository.listRuntimeAssignments(scenarioId, undefined, pattern.id)).toHaveLength(4);
  });
});

// P09 criterion 5: the query U07 needs to name every Service day that shares a Runtime profile (02R-AC18).
describe('Service days that share a Runtime profile', () => {
  it('lists every Service day assigned to the profile in the canonical order', async () => {
    const { service } = createService();
    const created = await service.createProject('Shared profile');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = (await addTwoStopPattern(service, aggregate)).aggregate;
    const pattern = aggregate.patterns[0];
    const runtime = await service.ensureDefaultRuntimeProfile(pattern);
    const saturday = created.records.serviceDays.find((day) => day.kind === 'saturday')!;
    expect((await service.listRuntimeProfileServiceDays(runtime.profile.id)).map((day) => day.kind)).toEqual(['weekday', 'saturday', 'sunday', 'holiday']);
    const alternative = await service.createDefaultRuntimeProfile(pattern, 'Saturday only');
    await service.assignRuntimeProfile(pattern.scenarioId, pattern.id, saturday.id, alternative.id);
    expect((await service.listRuntimeProfileServiceDays(runtime.profile.id)).map((day) => day.kind)).toEqual(['weekday', 'sunday', 'holiday']);
    expect((await service.listRuntimeProfileServiceDays(alternative.id)).map((day) => day.name)).toEqual(['Saturday']);
    expect(await service.listRuntimeProfileServiceDays(runtime.profile.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.records.serviceDays[0].id })]));
  });

  it('is empty for a profile nothing uses and rejects an unknown profile', async () => {
    const { service } = createService();
    const created = await service.createProject('Unused');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    aggregate = (await addTwoStopPattern(service, aggregate)).aggregate;
    const unused = await service.createDefaultRuntimeProfile(aggregate.patterns[0], 'Unused');
    expect(await service.listRuntimeProfileServiceDays(unused.id)).toEqual([]);
    await expect(service.listRuntimeProfileServiceDays('missing')).rejects.toThrow('no longer available');
  });
});
