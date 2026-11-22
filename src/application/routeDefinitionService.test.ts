import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectBackupService } from '../persistence/backupRepository';
import { TransitDatabase } from '../persistence/database';
import { DexieRouteDefinitionRepository } from '../persistence/dexieRepository';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { RouteDefinitionService, SEGMENT_DISTANCE_UNDO_REFUSED, ServiceDayValidationError, STOPS_CHANGED_ELSEWHERE, STOP_COPY_UNDO_REFUSED } from './routeDefinitionService';
import type { RouteDefinitionRepository, TripGenerationRepository } from './ports';
import { metadata, newId } from '../domain/ids';
import type { Block, PatternStopPlacement, ProjectSnapshot, RoutePattern, RouteStop, Trip } from '../domain/types';
import { addBlocks } from '../testSupport/addBlocks';
import { addRouteNodes, addTwoStopPattern, savePattern, savePatternDraft } from '../testSupport/routeFixtures';

function createService(repository = new InMemoryRouteDefinitionRepository(), now = () => '2026-09-10T12:00:00.000Z') {
  const backup = new ProjectBackupService(
    (projectId) => repository.getProjectSnapshot(projectId),
    (snapshot) => repository.saveProjectSnapshot(snapshot),
  );
  return { service: new RouteDefinitionService(repository, backup, now) };
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

  it('saves a new project with a Default Blocking Scenario on its Default Trip Profile', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Blocking default');
    const stored = await repository.getProjectSnapshot(created.project.id);
    expect(stored?.blockingScenarios).toHaveLength(1);
    expect(stored?.blockingScenarios?.[0]).toMatchObject({ name: 'Default', tripProfileId: stored?.tripProfiles?.[0].id });
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

  it('counts a Route\'s planned frequencies in its deletion review, deletes them with it, and refuses a review made before a plan changed', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Route deletion with plans');
    const kept = await service.addRoute(created.records);
    const doomed = await service.addRoute(kept.records);
    const scenarioId = created.records.scenario.id;
    const [weekday, saturday] = created.records.serviceDays;
    const plan = (id: string, routeId: string, serviceDayId: string) => ({ id, scenarioId, routeId, serviceDayId, periods: [{ id: `${id}-p`, startTime: 6 * 3600, endTime: 9 * 3600, headwaySeconds: 900 }], measureNodeIdByDirectionId: {}, ...metadata() });
    await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, plannedFrequencies: [plan('keep', kept.route.id, weekday.id), plan('wd', doomed.route.id, weekday.id), plan('sa', doomed.route.id, saturday.id)] }));

    const review = await service.getRouteDeletionImpact(doomed.route.id);
    expect(review.plannedFrequencyCount).toBe(2);
    // A plan edited after the review makes the review stale.
    await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, plannedFrequencies: current.plannedFrequencies!.map((candidate) => candidate.id === 'sa' ? { ...candidate, periods: [{ ...candidate.periods[0], headwaySeconds: 1200 }] } : candidate) }));
    await expect(service.deleteRoute(doomed.route.id, review.reviewToken)).rejects.toThrow();
    expect((await repository.listPlannedFrequencies(scenarioId)).map((candidate) => candidate.id).sort()).toEqual(['keep', 'sa', 'wd']);

    await service.deleteRoute(doomed.route.id, (await service.getRouteDeletionImpact(doomed.route.id)).reviewToken);
    expect((await repository.listPlannedFrequencies(scenarioId)).map((candidate) => candidate.id)).toEqual(['keep']);
    expect((await service.getRouteDeletionImpact(kept.route.id)).plannedFrequencyCount).toBe(1);
  });

  it('counts a Route\'s stops in its deletion review, deletes its stop set with it, and refuses a review made before the set changed (Decision 0079)', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Route deletion with stops');
    const kept = await service.addRoute(created.records);
    const doomed = await service.addRoute(kept.records);
    const scenarioId = created.records.scenario.id;
    const aggregate = (await service.loadWorkspace(created.project.id, scenarioId, doomed.route.id)).aggregate!;
    const { pattern } = await addTwoStopPattern(service, aggregate);
    const firstPoint = [...pattern.points].sort((left, right) => left.sequence - right.sequence)[0];
    await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, routeStopSets: [{
      id: 'doomed-stops', scenarioId, routeId: doomed.route.id, roundingSeconds: 60,
      stops: [{ id: 'stop-a', name: 'Stop A' }, { id: 'stop-b', name: 'Stop B' }],
      placementsByPatternId: { [pattern.id]: [{ id: 'p-a', stopId: 'stop-a', afterPatternPointId: firstPoint.id, sequence: 0, timing: 'interpolate' }, { id: 'p-b', stopId: 'stop-b', afterPatternPointId: firstPoint.id, sequence: 1, timing: 'next' }] },
      ...metadata(),
    }] }));

    const review = await service.getRouteDeletionImpact(doomed.route.id);
    expect(review.routeStopCount).toBe(2);
    expect((await service.getRouteDeletionImpact(kept.route.id)).routeStopCount).toBe(0);
    // A stop edited after the review makes the review stale.
    await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, routeStopSets: current.routeStopSets!.map((set) => ({ ...set, stops: set.stops.map((stop) => ({ ...stop, name: 'Renamed' })) })) }));
    await expect(service.deleteRoute(doomed.route.id, review.reviewToken)).rejects.toThrow();
    expect(await repository.getRouteStopSet(doomed.route.id)).toBeDefined();

    await service.deleteRoute(doomed.route.id, (await service.getRouteDeletionImpact(doomed.route.id)).reviewToken);
    expect(await repository.getRouteStopSet(doomed.route.id)).toBeUndefined();
    expect((await repository.getScenarioRecords(scenarioId))!.routeStopSets).toBeUndefined();
  });

  it('counts a pattern\'s stop placements, removes them and the stops only that pattern used, and refuses a review made before the placements changed (Decision 0079)', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Pattern deletion with stops');
    const added = await service.addRoute(created.records);
    const scenarioId = created.records.scenario.id;
    const aggregate = (await service.loadWorkspace(created.project.id, scenarioId, added.route.id)).aggregate!;
    const first = await addTwoStopPattern(service, aggregate, { patternName: 'First' });
    // Take the node order from the first pattern's points, so the second pattern runs the same way (aggregate.nodes has no fixed order).
    const [nodeAId, nodeBId] = [...first.pattern.points].sort((left, right) => left.sequence - right.sequence).map((point) => point.nodeId);
    const second = await savePattern(service, first.aggregate, { name: 'Second', stops: [{ nodeId: nodeAId }, { nodeId: nodeBId, miles: 1 }] });
    const pointAt = (pattern: { points: Array<{ id: string; sequence: number }> }) => [...pattern.points].sort((left, right) => left.sequence - right.sequence)[0].id;
    // "only-first" is placed only on the first pattern; "shared" on both.
    await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, routeStopSets: [{
      id: 'pattern-stops', scenarioId, routeId: added.route.id, roundingSeconds: 60,
      stops: [{ id: 'only-first', name: 'Only first' }, { id: 'shared', name: 'Shared' }],
      placementsByPatternId: {
        [first.pattern.id]: [{ id: 'p-only', stopId: 'only-first', afterPatternPointId: pointAt(first.pattern), sequence: 0, timing: 'interpolate' }, { id: 'p-shared-1', stopId: 'shared', afterPatternPointId: pointAt(first.pattern), sequence: 1, timing: 'next' }],
        [second.pattern.id]: [{ id: 'p-shared-2', stopId: 'shared', afterPatternPointId: pointAt(second.pattern), sequence: 0, timing: 'interpolate' }],
      },
      ...metadata(),
    }] }));

    const review = await service.getPatternDeletionImpact(first.pattern.id);
    expect(review.stopPlacementCount).toBe(2);
    // A placement changed after the review makes the review stale.
    await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, routeStopSets: current.routeStopSets!.map((set) => ({ ...set, placementsByPatternId: { ...set.placementsByPatternId, [first.pattern.id]: set.placementsByPatternId[first.pattern.id].map((placement) => placement.id === 'p-shared-1' ? { ...placement, timing: 'previous' as const } : placement) } })) }));
    await expect(service.deletePattern(first.pattern.id, review.reviewToken)).rejects.toThrow();
    expect((await repository.getRouteStopSet(added.route.id))!.placementsByPatternId[first.pattern.id]).toHaveLength(2);

    const fresh = await service.getPatternDeletionImpact(first.pattern.id);
    expect(fresh.stopPlacementCount).toBe(2);
    await service.deletePattern(first.pattern.id, fresh.reviewToken);
    const after = (await repository.getRouteStopSet(added.route.id))!;
    expect(Object.keys(after.placementsByPatternId)).toEqual([second.pattern.id]);
    expect(after.stops.map((stop) => stop.id)).toEqual(['shared']);
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

  it('renames a direction by group, keeps its ID and group through a reload and a later save, and restores the default for a blank name (Decision 0088)', async () => {
    const { service } = createService();
    const created = await service.createProject('Direction names');
    const addedRoute = await service.addRoute(created.records);
    const load = async () => (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    const before = (await load()).directions!.find((direction) => direction.group === 'inbound')!;

    let aggregate = await service.renameDirection(await load(), 'inbound', ' Northbound ');
    const renamed = (await load()).directions!.find((direction) => direction.group === 'inbound')!;
    expect(renamed).toMatchObject({ id: before.id, group: 'inbound', name: 'Northbound' });

    aggregate = await service.updateRoute(await load(), { description: 'Later edit' });
    expect(aggregate.directions!.find((direction) => direction.group === 'inbound')!.name).toBe('Northbound');
    expect((await load()).directions!.find((direction) => direction.group === 'inbound')!.name).toBe('Northbound');

    await service.renameDirection(await load(), 'inbound', '   ');
    expect((await load()).directions!.find((direction) => direction.group === 'inbound')!.name).toBe('Inbound');
  });

  it('refuses a direction name that the Route\'s other direction already uses, and writes nothing', async () => {
    const { service } = createService();
    const created = await service.createProject('Direction name clash');
    const addedRoute = await service.addRoute(created.records);
    const load = async () => (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    await service.renameDirection(await load(), 'outbound', 'Southbound');
    const before = (await load()).directions;

    await expect(service.renameDirection(await load(), 'inbound', ' southbound ')).rejects.toThrow('Each direction needs its own name.');
    expect((await load()).directions).toEqual(before);
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
describe('one runtime calculation method per Route (Decision 0045)', () => {
  async function twoPatternRoute() {
    const { service } = createService();
    const created = await service.createProject('Method project');
    const addedRoute = await service.addRoute(created.records);
    let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
    const added = await addTwoStopPattern(service, aggregate, { names: ['South', 'North'], patternName: 'Trunk' });
    aggregate = added.aggregate;
    const branch = await savePatternDraft(service, aggregate, { ...service.duplicatePatternDraft(aggregate, aggregate.patterns[0].id), name: 'Branch' });
    aggregate = branch.aggregate;
    const trunkProfile = await service.createDefaultRuntimeProfile(aggregate.patterns.find((pattern) => pattern.name === 'Trunk')!, 'Trunk runtimes');
    const branchProfile = await service.createDefaultRuntimeProfile(branch.pattern, 'Branch runtimes');
    return { service, routeId: aggregate.route.id, branchPattern: branch.pattern, trunkProfile, branchProfile };
  }

  it('gives a new profile the method the Route already uses', async () => {
    const { service, routeId, branchPattern, trunkProfile, branchProfile } = await twoPatternRoute();
    expect([trunkProfile.calculationMethod, branchProfile.calculationMethod]).toEqual(['segmentStart', 'segmentStart']);
    await service.setRouteRuntimeCalculationMethod(routeId, 'singleBand');
    const copy = await service.copyRuntimeProfile(trunkProfile.id, 'Trunk copy');
    expect(copy.calculationMethod).toBe('singleBand');
    const another = await service.createDefaultRuntimeProfile(branchPattern, 'Another');
    expect(another.calculationMethod).toBe('singleBand');
  });

  it('changes every profile of the Route at once and reports the profiles and Trips the change affects', async () => {
    const { service, routeId, trunkProfile } = await twoPatternRoute();
    expect(await service.getRouteRuntimeCalculationMethodImpact(routeId, 'singleBand')).toEqual({ profileCount: 2, tripCount: 0 });
    expect(await service.getRouteRuntimeCalculationMethodImpact(routeId, 'segmentStart')).toEqual({ profileCount: 0, tripCount: 0 });
    await service.setRouteRuntimeCalculationMethod(routeId, 'singleBand');
    const profiles = await service.listRuntimeProfiles(routeId);
    expect(profiles.map((profile) => [profile.calculationMethod, profile.calculationRevision])).toEqual([['singleBand', 1], ['singleBand', 1]]);
    expect(profiles.some((profile) => profile.id === trunkProfile.id)).toBe(true);
  });

  it('applies a method saved on one profile to every profile of the Route, and keeps the Route method when another field changes', async () => {
    const { service, routeId, trunkProfile, branchProfile } = await twoPatternRoute();
    await service.saveRuntimeProfile({ ...trunkProfile, calculationMethod: 'singleBand' });
    expect((await service.listRuntimeProfiles(routeId)).map((profile) => profile.calculationMethod)).toEqual(['singleBand', 'singleBand']);
    // A save that leaves the stored method alone cannot put a different method on one profile.
    const stored = (await service.listRuntimeProfiles(routeId)).find((profile) => profile.id === branchProfile.id)!;
    const renamed = await service.saveRuntimeProfile({ ...stored, name: 'Branch renamed' });
    expect(renamed.calculationMethod).toBe('singleBand');
  });
});

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

  it('stores a normalized abbreviation, reads it back, and clears it to the default (Decision 0059)', async () => {
    const { service, records, weekday } = await setup();
    const set = await service.updateServiceDay(records, weekday.id, { abbreviation: ' wk ' });
    expect(set.serviceDays.find((day) => day.id === weekday.id)!.abbreviation).toBe('WK');
    const stored = (await service.loadWorkspace(records.scenario.projectId, records.scenario.id)).records!.serviceDays.find((day) => day.id === weekday.id)!;
    expect(stored.abbreviation).toBe('WK');
    const cleared = await service.updateServiceDay(set, weekday.id, { abbreviation: '  ' });
    const day = cleared.serviceDays.find((candidate) => candidate.id === weekday.id)!;
    expect(day).not.toHaveProperty('abbreviation');
  });

  it('writes nothing when the abbreviation is unchanged or cleared while already blank', async () => {
    const { service, records, weekday } = await setup();
    expect((await service.updateServiceDay(records, weekday.id, { abbreviation: '' })).serviceDays).toEqual(records.serviceDays);
    const set = await service.updateServiceDay(records, weekday.id, { abbreviation: 'WK' });
    const again = await service.updateServiceDay(set, weekday.id, { abbreviation: 'wk' });
    expect(again.serviceDays.find((day) => day.id === weekday.id)!.updatedAt).toBe(set.serviceDays.find((day) => day.id === weekday.id)!.updatedAt);
  });

  it('refuses an invalid abbreviation with a field finding and a plain message', async () => {
    const { service, records, weekday } = await setup();
    const findings = await findingsOf(service.updateServiceDay(records, weekday.id, { abbreviation: 'ABCD' }));
    expect(findings).toMatchObject([{ ruleId: 'serviceDay.abbreviationInvalid', field: 'abbreviation', entityId: weekday.id }]);
    await expect(service.updateServiceDay(records, weekday.id, { abbreviation: 'A-B' })).rejects.toThrow('An abbreviation must be 1 to 3 letters or digits.');
  });

  it('refuses an abbreviation that another day uses, entered or derived', async () => {
    const { service, records, weekday, saturday } = await setup();
    await expect(service.updateServiceDay(records, weekday.id, { abbreviation: 'sat' })).rejects.toThrow('Another service day already uses the abbreviation SAT.');
    const set = await service.updateServiceDay(records, saturday.id, { abbreviation: 'S1' });
    const findings = await findingsOf(service.updateServiceDay(set, weekday.id, { abbreviation: 's1' }));
    expect(findings).toMatchObject([{ ruleId: 'serviceDay.abbreviationDuplicate', field: 'abbreviation', entityId: weekday.id, parameters: { abbreviation: 'S1' } }]);
    // The refused edit stored nothing.
    expect((await service.loadWorkspace(records.scenario.projectId, records.scenario.id)).records!.serviceDays.find((day) => day.id === weekday.id)).not.toHaveProperty('abbreviation');
  });

  it('lets a day be renamed without raising findings about a clash saved between other days', async () => {
    const { service, records, weekday, saturday } = await setup();
    const repository = (service as unknown as { repository: InMemoryRouteDefinitionRepository }).repository;
    await repository.updateScenarioRecords(records.scenario.id, (current) => ({ ...current, serviceDays: current.serviceDays.map((day) => day.id === saturday.id ? { ...day, kind: 'custom' as const, name: 'Holiday extra' } : day) }));
    const stale = (await repository.getScenarioRecords(records.scenario.id))!;
    const renamed = await service.updateServiceDay(stale, weekday.id, { name: 'Weekday plan' });
    expect(renamed.serviceDays.find((day) => day.id === weekday.id)!.name).toBe('Weekday plan');
  });

  it('refuses a rename that makes a derived custom default clash, reporting it on the name', async () => {
    const { service, records, saturday } = await setup();
    const repository = (service as unknown as { repository: InMemoryRouteDefinitionRepository }).repository;
    await repository.updateScenarioRecords(records.scenario.id, (current) => ({ ...current, serviceDays: current.serviceDays.map((day) => day.id === saturday.id ? { ...day, kind: 'custom' as const, name: 'Summer' } : day) }));
    const stale = (await repository.getScenarioRecords(records.scenario.id))!;
    const findings = await findingsOf(service.updateServiceDay(stale, saturday.id, { name: 'Sunday special' }));
    expect(findings).toMatchObject([{ ruleId: 'serviceDay.abbreviationDuplicate', field: 'name', entityId: saturday.id }]);
  });

  it('renameScenario rejects a blank name and trims a name', async () => {
    const { service, records } = await setup();
    await expect(service.renameScenario(records, '   ')).rejects.toThrow('Scenario name is required');
    expect((await service.loadWorkspace(records.scenario.projectId, records.scenario.id)).records!.scenario.name).toBe('Scenario 1');
    expect((await service.renameScenario(records, '  Base  ')).scenario.name).toBe('Base');
  });
});

// Scenario actions addressed by Scenario ID (CM3), used by the Scenario context menu for any Scenario in a Project.
describe('Scenario actions by ID', () => {
  it('renameScenarioById changes only the named Scenario name and updatedAt', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Rename by ID');
    const other = await service.createScenario(created.project.id, 'Other');
    const { service: later } = createService(repository, () => '2026-09-12T08:00:00.000Z');
    const targetBefore = { ...(await repository.getScenarioRecords(created.records.scenario.id))!.scenario };
    const otherBefore = JSON.stringify(await repository.getScenarioRecords(other.scenario.id));

    const renamed = await later.renameScenarioById(created.records.scenario.id, '  Renamed by ID  ');

    expect(renamed.scenario.id).toBe(created.records.scenario.id);
    expect(renamed.scenario.name).toBe('Renamed by ID');
    const stored = (await repository.getScenarioRecords(created.records.scenario.id))!.scenario;
    expect(stored).toEqual({ ...targetBefore, name: 'Renamed by ID', updatedAt: '2026-09-12T08:00:00.000Z' });
    expect(JSON.stringify(await repository.getScenarioRecords(other.scenario.id))).toBe(otherBefore);
  });

  it('renameScenarioById rejects a blank name', async () => {
    const { service } = createService();
    const created = await service.createProject('Blank by ID');
    await expect(service.renameScenarioById(created.records.scenario.id, '   ')).rejects.toThrow('Scenario name is required');
  });

  it('duplicateScenarioById copies the stored Scenario named by ID, not the open one', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Duplicate by ID');
    const other = await service.createScenario(created.project.id, 'Other');
    const sourceBefore = JSON.stringify(await repository.getScenarioRecords(other.scenario.id));

    const copy = await service.duplicateScenarioById(other.scenario.id, 'Other copy');

    expect(copy.scenario.id).not.toBe(other.scenario.id);
    expect(copy.scenario).toMatchObject({ projectId: created.project.id, name: 'Other copy' });
    expect(copy.serviceDays.map((day) => day.kind)).toEqual(other.serviceDays.map((day) => day.kind));
    const stored = await repository.getScenarioRecords(copy.scenario.id);
    expect(stored?.scenario.name).toBe('Other copy');
    expect(stored?.serviceDays).toHaveLength(other.serviceDays.length);
    expect(JSON.stringify(await repository.getScenarioRecords(other.scenario.id))).toBe(sourceBefore);
  });

  it('duplicateScenarioById rejects an unknown Scenario ID', async () => {
    const { service } = createService();
    await expect(service.duplicateScenarioById('missing-scenario', 'Copy')).rejects.toThrow('Scenario not found.');
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

describe('distance fill and copy between patterns (Decision 0065)', () => {
  const at = '2026-09-10T12:00:00.000Z';
  /** A Route with Trunk (South, North, Third at 0, 1.5, 4) and Branch (the same nodes at 0), each with a runtime profile, and one Trip on Branch. */
  async function distanceRoute() {
    const repository = new InMemoryRouteDefinitionRepository();
    const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
    const service = new RouteDefinitionService(repository, backup, () => at);
    const created = await service.createProject('Distances');
    const scenarioId = created.records.scenario.id;
    const weekday = created.records.serviceDays[0];
    const addedRoute = await service.addRoute(created.records);
    const routeId = addedRoute.route.id;
    let aggregate = (await service.loadWorkspace(created.project.id, scenarioId, routeId)).aggregate!;
    const withNodes = await addRouteNodes(service, aggregate, [{ name: 'South' }, { name: 'North' }, { name: 'Third' }]);
    aggregate = withNodes.aggregate;
    const [south, north, third] = withNodes.nodes;
    const trunk = await savePattern(service, aggregate, { name: 'Trunk', stops: [{ nodeId: south.id, miles: 0 }, { nodeId: north.id, miles: 1.5 }, { nodeId: third.id, miles: 4 }] });
    aggregate = trunk.aggregate;
    const branch = await savePattern(service, aggregate, { name: 'Branch', stops: [{ nodeId: south.id, miles: 0 }, { nodeId: north.id, miles: 0 }, { nodeId: third.id, miles: 0 }] });
    aggregate = branch.aggregate;
    for (const pattern of aggregate.patterns) {
      const profile = await service.createDefaultRuntimeProfile(pattern, `${pattern.name} runtimes`);
      await service.assignRuntimeProfile(scenarioId, pattern.id, weekday.id, profile.id);
    }
    await repository.saveTrips([{ id: 'trip-1', scenarioId, routeId, serviceDayId: weekday.id, patternId: branch.pattern.id, stopTimes: [], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...metadata(at) } as unknown as Trip]);
    return { repository, service, scenarioId, routeId, aggregate, trunk: trunk.pattern, branch: branch.pattern };
  }
  const cumulative = (pattern: { points: { cumulativeMiles: number }[] }) => pattern.points.map((point) => point.cumulativeMiles);
  /** Runtime profiles and Trips, as stored. */
  const runtimesAndTrips = async (repository: InMemoryRouteDefinitionRepository, scenarioId: string) => {
    const records = (await repository.getScenarioRecords(scenarioId))!;
    return JSON.stringify({ runtimeProfiles: records.runtimeProfiles, trips: records.trips });
  };

  it('fill changes only the draft, and nothing is written until the draft is saved', async () => {
    const { service, repository, scenarioId, aggregate, branch } = await distanceRoute();
    const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
    const preview = service.previewDistanceFill(aggregate, branch);
    const filled = service.applyDistanceFill(branch, preview);
    expect(cumulative(filled)).toEqual([0, 1.5, 4]);
    expect(cumulative(branch)).toEqual([0, 0, 0]);
    expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
  });

  it('copy writes the saved pattern to the other patterns, and leaves runtimes and Trips unchanged', async () => {
    const { service, repository, scenarioId, routeId, trunk, branch } = await distanceRoute();
    const runtimesBefore = await runtimesAndTrips(repository, scenarioId);
    const preview = await service.previewDistanceCopy(trunk.id);
    expect(preview.changes.map((change) => [change.patternId, change.segmentIndex, change.nextMiles])).toEqual([[branch.id, 0, 1.5], [branch.id, 1, 2.5]]);
    const result = await service.applyDistanceCopy(preview);
    expect(cumulative(result.aggregate.patterns.find((pattern) => pattern.id === branch.id)!)).toEqual([0, 1.5, 4]);
    expect(cumulative(result.aggregate.patterns.find((pattern) => pattern.id === trunk.id)!)).toEqual([0, 1.5, 4]);
    expect(await runtimesAndTrips(repository, scenarioId)).toBe(runtimesBefore);
    expect(service.getDistanceUndo()).toEqual({ routeId, patternCount: 1 });
  });

  it('refuses a copy with no changes, and a copy that the preview no longer matches', async () => {
    const { service, repository, scenarioId, aggregate, trunk, branch } = await distanceRoute();
    await expect(service.applyDistanceCopy(await service.previewDistanceCopy(trunk.id, [branch.id]))).rejects.toThrow('No distances would change.');
    const preview = await service.previewDistanceCopy(trunk.id);
    const edited = { ...branch, points: branch.points.map((point, index) => ({ ...point, cumulativeMiles: index })) };
    await service.commitPatternChange((await service.previewPatternChange(aggregate.route.id, branch.id, edited)).previewToken);
    const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
    await expect(service.applyDistanceCopy(preview)).rejects.toThrow('Distances changed after the preview. Review the changes again.');
    expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
  });

  it('aborts the whole copy when a target fails validation', async () => {
    const { service, repository, scenarioId, trunk, branch } = await distanceRoute();
    const preview = await service.previewDistanceCopy(trunk.id);
    // A stored target without a Direction cannot pass the pattern validation that the copy runs (a Copy never makes a decreasing value).
    await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, patterns: current.patterns.map((pattern) => pattern.id === branch.id ? { ...pattern, directionId: undefined } : pattern) }));
    const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
    await expect(service.applyDistanceCopy(preview)).rejects.toThrow();
    expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
  });

  it('undoes the last copy once, and is cleared by a pattern commit', async () => {
    const { service, routeId, trunk, branch } = await distanceRoute();
    await expect(service.undoDistanceCopy()).rejects.toThrow('There is no distance copy to undo.');
    await service.applyDistanceCopy(await service.previewDistanceCopy(trunk.id));
    const restored = await service.undoDistanceCopy();
    expect(cumulative(restored.aggregate.patterns.find((pattern) => pattern.id === branch.id)!)).toEqual([0, 0, 0]);
    expect(service.getDistanceUndo()).toBeUndefined();

    await service.applyDistanceCopy(await service.previewDistanceCopy(trunk.id));
    const storedTrunk = restored.aggregate.patterns.find((pattern) => pattern.id === trunk.id)!;
    await service.commitPatternChange((await service.previewPatternChange(routeId, storedTrunk.id, { ...storedTrunk, name: 'Trunk renamed' })).previewToken);
    expect(service.getDistanceUndo()).toBeUndefined();
  });

  it('refuses an undo when a target changed after the copy, and writes nothing', async () => {
    const { service, repository, scenarioId, trunk, branch } = await distanceRoute();
    await service.applyDistanceCopy(await service.previewDistanceCopy(trunk.id));
    await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, patterns: current.patterns.map((pattern) => pattern.id === branch.id ? { ...pattern, updatedAt: '2026-09-11T00:00:00.000Z' } : pattern) }));
    const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
    await expect(service.undoDistanceCopy()).rejects.toThrow(SEGMENT_DISTANCE_UNDO_REFUSED);
    expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
    expect(service.getDistanceUndo()).toBeUndefined();
  });

  it('refuses a preview for a pattern that is not saved', async () => {
    const { service } = await distanceRoute();
    await expect(service.previewDistanceCopy('not-saved')).rejects.toThrow('Save this pattern before copying its distances.');
  });

  it('forgetCopyUndos clears the distance copy undo', async () => {
    const { service, trunk } = await distanceRoute();
    await service.applyDistanceCopy(await service.previewDistanceCopy(trunk.id));
    expect(service.getDistanceUndo()).toBeDefined();
    service.forgetCopyUndos();
    expect(service.getDistanceUndo()).toBeUndefined();
  });
});

describe('route stops (Decision 0079)', () => {
  const at = '2026-09-10T12:00:00.000Z';
  /** Every save of the Route's stop list passes both stops, because the list replaces the stored one. */
  const STOPS: RouteStop[] = [{ id: 'elm', name: 'Elm Street' }, { id: 'oak', name: 'Oak Avenue' }];
  /** A Route with Trunk and Branch, both through South, North, and Third (in that order), and no stops yet. */
  async function stopRoute() {
    const repository = new InMemoryRouteDefinitionRepository();
    const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
    const service = new RouteDefinitionService(repository, backup, () => at);
    const created = await service.createProject('Stops');
    const scenarioId = created.records.scenario.id;
    const addedRoute = await service.addRoute(created.records);
    const routeId = addedRoute.route.id;
    let aggregate = (await service.loadWorkspace(created.project.id, scenarioId, routeId)).aggregate!;
    const withNodes = await addRouteNodes(service, aggregate, [{ name: 'South' }, { name: 'North' }, { name: 'Third' }]);
    aggregate = withNodes.aggregate;
    const [, north] = withNodes.nodes;
    const stops = withNodes.nodes.map((node, index) => ({ nodeId: node.id, miles: [0, 1.5, 4][index] }));
    const trunk = await savePattern(service, aggregate, { name: 'Trunk', stops });
    aggregate = trunk.aggregate;
    const branch = await savePattern(service, aggregate, { name: 'Branch', stops });
    aggregate = branch.aggregate;
    return { repository, service, scenarioId, routeId, aggregate, north, trunk: trunk.pattern, branch: branch.pattern };
  }
  /** Point IDs of a pattern in sequence order. */
  const pointIds = (pattern: RoutePattern) => [...pattern.points].sort((left, right) => left.sequence - right.sequence).map((point) => point.id);
  const placement = (stopId: string, afterPatternPointId: string, timing: PatternStopPlacement['timing'] = 'interpolate'): PatternStopPlacement => ({ id: newId(), stopId, afterPatternPointId, sequence: 0, timing });
  /** Saves one pattern's placements, with the stored stamp, so the save is not refused as stale. */
  async function saveStops(service: RouteDefinitionService, routeId: string, patternId: string, placements: PatternStopPlacement[]) {
    const stored = await service.getRouteStopSet(routeId);
    return service.saveRouteStops({ routeId, patternId, stops: STOPS, placements, timepointStopCodes: stored?.timepointStopCodesByPatternId?.[patternId] ?? {}, roundingSeconds: 60, baseUpdatedAt: stored?.updatedAt });
  }
  /** Saves one pattern's timepoint stop IDs, keeping its stored placements (Decision 0080). */
  async function saveCodes(service: RouteDefinitionService, routeId: string, patternId: string, timepointStopCodes: Record<string, string>) {
    const stored = await service.getRouteStopSet(routeId);
    return service.saveRouteStops({ routeId, patternId, stops: stored?.stops ?? [], placements: stored?.placementsByPatternId[patternId] ?? [], timepointStopCodes, roundingSeconds: 60, baseUpdatedAt: stored?.updatedAt });
  }

  it('saves a stop list, trims names and Stop IDs, renumbers sequences, and removes the set when no placement is left', async () => {
    const { service, routeId, trunk } = await stopRoute();
    const [south] = pointIds(trunk);
    const saved = await service.saveRouteStops({
      routeId, patternId: trunk.id, roundingSeconds: 60,
      stops: [{ id: 'elm', name: '  Elm Street  ', stopCode: ' 1001 ' }, { id: 'oak', name: 'Oak Avenue', stopCode: '   ' }],
      placements: [{ id: 'a', stopId: 'elm', afterPatternPointId: south, sequence: 5, timing: 'interpolate' }, { id: 'b', stopId: 'oak', afterPatternPointId: south, sequence: 9, timing: 'previous' }],
      timepointStopCodes: {},
    });
    expect(saved?.stops).toEqual([{ id: 'elm', name: 'Elm Street', stopCode: '1001' }, { id: 'oak', name: 'Oak Avenue' }]);
    expect(saved?.placementsByPatternId[trunk.id].map((item) => item.sequence)).toEqual([0, 1]);
    expect(await service.getRouteStopSet(routeId)).toEqual(saved);
    expect(await service.saveRouteStops({ routeId, patternId: trunk.id, roundingSeconds: 60, stops: saved!.stops, placements: [], timepointStopCodes: {}, baseUpdatedAt: saved!.updatedAt })).toBeUndefined();
    expect(await service.getRouteStopSet(routeId)).toBeUndefined();
  });

  it('refuses a save from an editor that opened before the stops changed, and writes nothing', async () => {
    const { service, repository, scenarioId, routeId, trunk } = await stopRoute();
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[0])]);
    const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
    await expect(service.saveRouteStops({ routeId, patternId: trunk.id, stops: STOPS, placements: [], timepointStopCodes: {}, roundingSeconds: 60, baseUpdatedAt: undefined })).rejects.toThrow(STOPS_CHANGED_ELSEWHERE);
    expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
  });

  it('refuses a duplicate Stop ID, ignoring case and surrounding spaces, and writes nothing', async () => {
    const { service, routeId, trunk } = await stopRoute();
    await expect(service.saveRouteStops({
      routeId, patternId: trunk.id, roundingSeconds: 60, placements: [], timepointStopCodes: {},
      stops: [{ id: 'a', name: 'A', stopCode: 'X1' }, { id: 'b', name: 'B', stopCode: ' x1 ' }],
    })).rejects.toMatchObject({ name: 'RouteStopValidationError', findings: [expect.objectContaining({ ruleId: 'routeStop.codeDuplicate', entityId: 'b' })] });
    expect(await service.getRouteStopSet(routeId)).toBeUndefined();
  });

  it('fill writes only into the draft, and nothing is saved until the draft is saved', async () => {
    const { service, repository, scenarioId, routeId, aggregate, trunk, branch } = await stopRoute();
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[0])]);
    const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
    const preview = service.previewStopFill(aggregate, await service.getRouteStopSet(routeId), branch, { placements: [], timepointStopCodes: {} });
    expect(preview.changes.map((change) => [change.patternId, change.segmentIndex])).toEqual([[branch.id, 0]]);
    expect(preview.stopNames).toEqual({ elm: 'Elm Street' });
    const filled = service.applyStopFill(branch, { placements: [], timepointStopCodes: {} }, preview);
    expect(filled.placements.map((item) => [item.stopId, item.afterPatternPointId])).toEqual([['elm', pointIds(branch)[0]]]);
    expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
  });

  it('copy writes the saved stops to the other pattern, and undo restores the set', async () => {
    const { service, routeId, trunk, branch } = await stopRoute();
    await expect(service.previewStopCopy(trunk.id)).rejects.toThrow("Save this pattern's stops before copying them.");
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[0])]);
    const preview = await service.previewStopCopy(trunk.id);
    expect(preview.changes.map((change) => [change.patternId, change.segmentIndex])).toEqual([[branch.id, 0]]);
    const written = await service.applyStopCopy(preview);
    expect(written.placementsByPatternId[branch.id].map((item) => [item.stopId, item.afterPatternPointId])).toEqual([['elm', pointIds(branch)[0]]]);
    expect(service.getStopCopyUndo()).toEqual({ routeId, patternCount: 1 });
    const restored = await service.undoStopCopy();
    expect(restored?.placementsByPatternId[branch.id]).toBeUndefined();
    expect(restored?.placementsByPatternId[trunk.id]).toHaveLength(1);
    expect(service.getStopCopyUndo()).toBeUndefined();
    await expect(service.undoStopCopy()).rejects.toThrow('There is no stop copy to undo.');
  });

  it('refuses a copy when the stops changed after the preview, and writes nothing', async () => {
    const { service, repository, scenarioId, routeId, trunk } = await stopRoute();
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[0])]);
    const preview = await service.previewStopCopy(trunk.id);
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[0], 'next')]);
    const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
    await expect(service.applyStopCopy(preview)).rejects.toThrow('Stops changed after the preview. Review the changes again.');
    expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
  });

  it('a stop save makes the copy undo unavailable', async () => {
    const { service, routeId, trunk } = await stopRoute();
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[0])]);
    await service.applyStopCopy(await service.previewStopCopy(trunk.id));
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[0])]);
    expect(service.getStopCopyUndo()).toBeUndefined();
    await expect(service.undoStopCopy()).rejects.toThrow('There is no stop copy to undo.');
  });

  it('refuses an undo after another write changed the stop set, and writes nothing', async () => {
    const { service, repository, scenarioId, routeId, trunk } = await stopRoute();
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[0])]);
    await service.applyStopCopy(await service.previewStopCopy(trunk.id));
    await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, routeStopSets: (current.routeStopSets ?? []).map((set) => ({ ...set, updatedAt: '2026-09-11T00:00:00.000Z' })) }));
    const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
    await expect(service.undoStopCopy()).rejects.toThrow(STOP_COPY_UNDO_REFUSED);
    expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
  });

  it('a removed middle point moves its stops to the point before it', async () => {
    const { service, routeId, trunk } = await stopRoute();
    const [south, north] = pointIds(trunk);
    await saveStops(service, routeId, trunk.id, [placement('elm', north)]);
    const sorted = [...trunk.points].sort((left, right) => left.sequence - right.sequence);
    const preview = await service.previewPatternChange(routeId, trunk.id, { ...trunk, points: [sorted[0], { ...sorted[2], sequence: 1 }] });
    expect([preview.stopsMovedCount, preview.stopsRemovedCount]).toEqual([1, 0]);
    await service.commitPatternChange(preview.previewToken);
    const set = await service.getRouteStopSet(routeId);
    expect(set?.placementsByPatternId[trunk.id].map((item) => [item.stopId, item.afterPatternPointId])).toEqual([['elm', south]]);
  });

  it('a removed last point removes the stops of the segment that ends there', async () => {
    const { service, routeId, trunk } = await stopRoute();
    const [, north] = pointIds(trunk);
    await saveStops(service, routeId, trunk.id, [placement('elm', north)]);
    const sorted = [...trunk.points].sort((left, right) => left.sequence - right.sequence);
    const preview = await service.previewPatternChange(routeId, trunk.id, { ...trunk, points: sorted.slice(0, 2) });
    expect([preview.stopsMovedCount, preview.stopsRemovedCount]).toEqual([0, 1]);
    await service.commitPatternChange(preview.previewToken);
    expect(await service.getRouteStopSet(routeId)).toBeUndefined();
  });

  it('deleting a middle Node moves the stops of every pattern that it shortens', async () => {
    const { service, routeId, aggregate, trunk, branch, north } = await stopRoute();
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[1])]);
    await saveStops(service, routeId, branch.id, [placement('oak', pointIds(branch)[1])]);
    const preview = await service.previewNodeChanges(routeId, aggregate.nodes.filter((node) => node.id !== north.id));
    expect([preview.stopsMovedCount, preview.stopsRemovedCount]).toEqual([2, 0]);
    await service.commitNodeChanges(preview.previewToken);
    const set = await service.getRouteStopSet(routeId);
    expect(set?.placementsByPatternId[trunk.id].map((item) => [item.stopId, item.afterPatternPointId])).toEqual([['elm', pointIds(trunk)[0]]]);
    expect(set?.placementsByPatternId[branch.id].map((item) => [item.stopId, item.afterPatternPointId])).toEqual([['oak', pointIds(branch)[0]]]);
  });

  describe('timepoint stop IDs (Decision 0080)', () => {
    /** Adds Return, through Third, North, and South, in the Route's other direction. */
    async function withReturn() {
      const route = await stopRoute();
      const directions = route.aggregate.directions ?? [];
      const nodeIds = [...route.trunk.points].sort((left, right) => left.sequence - right.sequence).map((point) => point.nodeId).reverse();
      const opposite = await savePattern(route.service, route.aggregate, { name: 'Return', directionId: directions[1].id, stops: nodeIds.map((nodeId, index) => ({ nodeId, miles: [0, 2.5, 4][index] })) });
      expect(route.trunk.directionId).toBe(route.branch.directionId);
      expect(opposite.pattern.directionId).not.toBe(route.trunk.directionId);
      return { ...route, aggregate: opposite.aggregate, opposite: opposite.pattern };
    }

    it('saves trimmed stop IDs per point, drops blank ones, and keeps a set that holds only stop IDs', async () => {
      const { service, routeId, trunk } = await stopRoute();
      const [south, north, third] = pointIds(trunk);
      const saved = await saveCodes(service, routeId, trunk.id, { [south]: ' 1001 ', [north]: '   ', [third]: '1003', 'not-a-point': 'X' });
      expect(saved?.stops).toEqual([]);
      expect(saved?.timepointStopCodesByPatternId).toEqual({ [trunk.id]: { [south]: '1001', [third]: '1003' } });
      expect(await saveCodes(service, routeId, trunk.id, {})).toBeUndefined();
    });

    it('fill takes stop IDs from same-direction patterns only, and copy writes them to same-direction patterns only', async () => {
      const { service, routeId, aggregate, trunk, branch, opposite } = await withReturn();
      const [south] = pointIds(trunk);
      await saveCodes(service, routeId, trunk.id, { [south]: '1001' });
      await saveCodes(service, routeId, opposite.id, { [pointIds(opposite)[1]]: '2002' });

      const fill = service.previewStopFill(aggregate, await service.getRouteStopSet(routeId), branch, { placements: [], timepointStopCodes: {} });
      expect(fill.codeChanges.map((change) => [change.patternPointId, change.next, change.sourcePatternIds])).toEqual([[pointIds(branch)[0], '1001', [trunk.id]]]);
      expect(fill.nodeNames).toEqual({ [trunk.points.find((point) => point.id === south)!.nodeId]: 'South' });
      expect(service.applyStopFill(branch, { placements: [], timepointStopCodes: {} }, fill).timepointStopCodes).toEqual({ [pointIds(branch)[0]]: '1001' });

      const copy = await service.previewStopCopy(trunk.id);
      expect(copy.changes).toEqual([]);
      expect(copy.codeChanges.map((change) => [change.patternId, change.patternPointId, change.next])).toEqual([[branch.id, pointIds(branch)[0], '1001']]);
      expect(copy.copyCandidates.map((candidate) => candidate.patternId)).toEqual([branch.id]);
      const written = await service.applyStopCopy(copy);
      expect(written.timepointStopCodesByPatternId?.[branch.id]).toEqual({ [pointIds(branch)[0]]: '1001' });
      expect(written.timepointStopCodesByPatternId?.[opposite.id]).toEqual({ [pointIds(opposite)[1]]: '2002' });
      expect(service.getStopCopyUndo()).toEqual({ routeId, patternCount: 1 });
      expect((await service.undoStopCopy())?.timepointStopCodesByPatternId?.[branch.id]).toBeUndefined();
    });

    it('fill reports a conflict when same-direction patterns disagree, and copy overwrites a different stop ID', async () => {
      const { service, routeId, aggregate, trunk, branch } = await stopRoute();
      const third = await savePattern(service, aggregate, { name: 'Third', stops: trunk.points.map((point) => ({ nodeId: point.nodeId })) });
      await saveCodes(service, routeId, trunk.id, { [pointIds(trunk)[0]]: 'A' });
      await saveCodes(service, routeId, branch.id, { [pointIds(branch)[0]]: 'B' });
      const fill = service.previewStopFill(third.aggregate, await service.getRouteStopSet(routeId), third.pattern, { placements: [], timepointStopCodes: {} });
      expect(fill.codeChanges).toEqual([]);
      expect(fill.codeSkips).toEqual([expect.objectContaining({ patternId: third.pattern.id, reason: 'conflict', candidates: [{ stopCode: 'A', patternIds: [trunk.id] }, { stopCode: 'B', patternIds: [branch.id] }] })]);
      const copy = await service.previewStopCopy(trunk.id, [third.pattern.id]);
      expect(copy.codeChanges).toEqual([expect.objectContaining({ patternId: branch.id, previous: 'B', next: 'A' })]);
      expect(copy.affectedPatterns).toEqual([{ patternId: branch.id, changeCount: 1, overwriteCount: 1 }]);
    });

    it('a pattern edit drops the stop ID of a removed point and of a point moved to another Node', async () => {
      const { service, routeId, aggregate, trunk } = await stopRoute();
      const [south, north, third] = pointIds(trunk);
      await saveCodes(service, routeId, trunk.id, { [south]: '1001', [north]: '1002', [third]: '1003' });
      const sorted = [...trunk.points].sort((left, right) => left.sequence - right.sequence);
      const otherNode = aggregate.nodes.find((node) => node.id !== sorted[0].nodeId && node.id !== sorted[1].nodeId)!;
      const preview = await service.previewPatternChange(routeId, trunk.id, { ...trunk, points: [sorted[0], { ...sorted[1], nodeId: otherNode.id }] });
      await service.commitPatternChange(preview.previewToken);
      expect((await service.getRouteStopSet(routeId))?.timepointStopCodesByPatternId).toEqual({ [trunk.id]: { [south]: '1001' } });
    });
  });

  describe('stop locations and spacing (Decisions 0085, 0086)', () => {
    type Location = { latitude?: number; longitude?: number; speedLimitMph?: number };
    /** Saves one pattern's timepoint locations, keeping its stored stops, placements and codes. */
    async function saveLocations(service: RouteDefinitionService, routeId: string, patternId: string, timepointLocations: Record<string, Location>) {
      const stored = await service.getRouteStopSet(routeId);
      return service.saveRouteStops({ routeId, patternId, stops: stored?.stops ?? [], placements: stored?.placementsByPatternId[patternId] ?? [], timepointStopCodes: stored?.timepointStopCodesByPatternId?.[patternId] ?? {}, timepointLocations, roundingSeconds: 60, baseUpdatedAt: stored?.updatedAt });
    }

    /** Adds Return, in the Route's other direction (the same helper as the Decision 0080 block). */
    async function withReturn() {
      const route = await stopRoute();
      const directions = route.aggregate.directions ?? [];
      const nodeIds = [...route.trunk.points].sort((left, right) => left.sequence - right.sequence).map((point) => point.nodeId).reverse();
      const opposite = await savePattern(route.service, route.aggregate, { name: 'Return', directionId: directions[1].id, stops: nodeIds.map((nodeId, index) => ({ nodeId, miles: [0, 2.5, 4][index] })) });
      return { ...route, aggregate: opposite.aggregate, opposite: opposite.pattern };
    }

    it('saves stop locations and speed limits, rounding 1 s, and refuses a latitude without a longitude', async () => {
      const { service, routeId, trunk } = await stopRoute();
      const [south] = pointIds(trunk);
      const located: RouteStop[] = [{ id: 'elm', name: 'Elm Street', latitude: 39.912274, longitude: -104.99353, speedLimitMph: 35 }, { id: 'oak', name: 'Oak Avenue' }];
      const saved = await service.saveRouteStops({ routeId, patternId: trunk.id, stops: located, placements: [placement('elm', south)], timepointStopCodes: {}, timepointLocations: {}, roundingSeconds: 1, baseUpdatedAt: undefined });
      // The stop no placement uses is pruned (Decision 0079); the located stop keeps its location.
      expect(saved?.stops).toEqual([located[0]]);
      expect(saved?.roundingSeconds).toBe(1);
      await expect(service.saveRouteStops({
        routeId, patternId: trunk.id, roundingSeconds: 1, placements: [placement('elm', south)], timepointStopCodes: {}, timepointLocations: {}, baseUpdatedAt: saved!.updatedAt,
        stops: [{ id: 'elm', name: 'Elm Street', latitude: 39.9 }, { id: 'oak', name: 'Oak Avenue' }],
      })).rejects.toMatchObject({ name: 'RouteStopValidationError', findings: [expect.objectContaining({ ruleId: 'stopLocation.incomplete', entityId: 'elm' })] });
      expect(await service.getRouteStopSet(routeId)).toEqual(saved);
    });

    it('keeps a pattern\'s timepoint locations when another pattern is saved, and when the save gives none', async () => {
      const { service, routeId, trunk, branch } = await stopRoute();
      const [south] = pointIds(trunk);
      await saveLocations(service, routeId, trunk.id, { [south]: { latitude: 39.91, longitude: -105 } });
      const withBranch = await saveLocations(service, routeId, branch.id, { [pointIds(branch)[0]]: { speedLimitMph: 25 } });
      expect(withBranch?.timepointLocationsByPatternId).toEqual({ [trunk.id]: { [south]: { latitude: 39.91, longitude: -105 } }, [branch.id]: { [pointIds(branch)[0]]: { speedLimitMph: 25 } } });
      // A save from an older caller that passes no locations leaves the stored ones alone.
      const kept = await saveStops(service, routeId, trunk.id, [placement('elm', south)]);
      expect(kept?.timepointLocationsByPatternId?.[trunk.id]).toEqual({ [south]: { latitude: 39.91, longitude: -105 } });
    });

    it('stores distance spacing only when chosen, and a save without a choice keeps the stored one', async () => {
      const { service, routeId, trunk } = await stopRoute();
      const [south] = pointIds(trunk);
      const distance = await service.saveRouteStops({ routeId, patternId: trunk.id, stops: STOPS, placements: [placement('elm', south)], timepointStopCodes: {}, interpolation: 'distance', roundingSeconds: 60, baseUpdatedAt: undefined });
      expect(distance?.interpolation).toBe('distance');
      const kept = await saveStops(service, routeId, trunk.id, [placement('elm', south)]);
      expect(kept?.interpolation).toBe('distance');
      const equal = await service.saveRouteStops({ routeId, patternId: trunk.id, stops: STOPS, placements: [placement('elm', south)], timepointStopCodes: {}, interpolation: 'equal', roundingSeconds: 60, baseUpdatedAt: kept!.updatedAt });
      expect(equal).toBeDefined();
      expect(equal?.interpolation).toBeUndefined();
    });

    it('fill takes locations from same-direction patterns only, and copy writes them to same-direction patterns and undo restores them', async () => {
      const { service, routeId, aggregate, trunk, branch, opposite } = await withReturn();
      const [south] = pointIds(trunk);
      await saveLocations(service, routeId, trunk.id, { [south]: { latitude: 39.91, longitude: -105 } });
      await saveLocations(service, routeId, opposite.id, { [pointIds(opposite)[1]]: { latitude: 39.5, longitude: -104 } });

      const fill = service.previewStopFill(aggregate, await service.getRouteStopSet(routeId), branch, { placements: [], timepointStopCodes: {}, timepointLocations: {} });
      expect(fill.locationChanges.map((change) => [change.patternId, change.patternPointId, change.next, change.sourcePatternIds])).toEqual([[branch.id, pointIds(branch)[0], { latitude: 39.91, longitude: -105 }, [trunk.id]]]);
      expect(service.applyStopFill(branch, { placements: [], timepointStopCodes: {}, timepointLocations: {} }, fill).timepointLocations).toEqual({ [pointIds(branch)[0]]: { latitude: 39.91, longitude: -105 } });

      const copy = await service.previewStopCopy(trunk.id);
      expect(copy.locationChanges.map((change) => [change.patternId, change.patternPointId, change.next])).toEqual([[branch.id, pointIds(branch)[0], { latitude: 39.91, longitude: -105 }]]);
      const written = await service.applyStopCopy(copy);
      expect(written.timepointLocationsByPatternId?.[branch.id]).toEqual({ [pointIds(branch)[0]]: { latitude: 39.91, longitude: -105 } });
      expect(written.timepointLocationsByPatternId?.[opposite.id]).toEqual({ [pointIds(opposite)[1]]: { latitude: 39.5, longitude: -104 } });
      expect((await service.undoStopCopy())?.timepointLocationsByPatternId?.[branch.id]).toBeUndefined();
    });

    it('refuses a copy when only a location changed after the preview, and writes nothing', async () => {
      const { service, repository, scenarioId, routeId, trunk } = await stopRoute();
      const [south] = pointIds(trunk);
      await saveLocations(service, routeId, trunk.id, { [south]: { latitude: 39.91, longitude: -105 } });
      const preview = await service.previewStopCopy(trunk.id);
      await saveLocations(service, routeId, trunk.id, { [south]: { latitude: 39.92, longitude: -105 } });
      const before = JSON.stringify(await repository.getScenarioRecords(scenarioId));
      await expect(service.applyStopCopy(preview)).rejects.toThrow('Stops changed after the preview. Review the changes again.');
      expect(JSON.stringify(await repository.getScenarioRecords(scenarioId))).toBe(before);
    });

    it('a pattern edit drops the location of a removed point and of a point moved to another Node', async () => {
      const { service, routeId, aggregate, trunk } = await stopRoute();
      const [south, north, third] = pointIds(trunk);
      await saveLocations(service, routeId, trunk.id, { [south]: { latitude: 39.91, longitude: -105 }, [north]: { latitude: 39.92, longitude: -105 }, [third]: { speedLimitMph: 30 } });
      const sorted = [...trunk.points].sort((left, right) => left.sequence - right.sequence);
      const otherNode = aggregate.nodes.find((node) => node.id !== sorted[0].nodeId && node.id !== sorted[1].nodeId)!;
      const preview = await service.previewPatternChange(routeId, trunk.id, { ...trunk, points: [sorted[0], { ...sorted[1], nodeId: otherNode.id }] });
      await service.commitPatternChange(preview.previewToken);
      expect((await service.getRouteStopSet(routeId))?.timepointLocationsByPatternId).toEqual({ [trunk.id]: { [south]: { latitude: 39.91, longitude: -105 } } });
    });
  });

  it('a Route rename leaves the stop set unchanged', async () => {
    const { service, routeId, aggregate, trunk } = await stopRoute();
    await saveStops(service, routeId, trunk.id, [placement('elm', pointIds(trunk)[0])]);
    const before = JSON.stringify(await service.getRouteStopSet(routeId));
    await service.updateRoute(aggregate, { name: 'Renamed route' });
    expect(JSON.stringify(await service.getRouteStopSet(routeId))).toBe(before);
  });
});

describe('estimate factor entries, edit preview scope (Decision 0081)', () => {
  it('counts the Route estimate factor entries of a Route in its deletion review', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Estimate factor entries');
    const scenarioId = created.records.scenario.id;
    const kept = await service.addRoute(created.records);
    const doomed = await service.addRoute(kept.records);
    const entry = (routeId: string) => ({ tripProfileId: 'tp', routeId, factors: { allDays: {}, serviceDays: [] } });
    await repository.updateScenarioRecords(scenarioId, (current) => ({
      ...current,
      costingAssumptions: { ...metadata(), id: 'costing', scenarioId, currencyCode: 'USD', rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0, routeEstimateFactors: [entry(doomed.route.id)] } as never,
    }));
    expect((await service.getRouteDeletionImpact(doomed.route.id)).routeEstimateFactorCount).toBe(1);
    expect((await service.getRouteDeletionImpact(kept.route.id)).routeEstimateFactorCount).toBe(0);
  });

  it('reads the scope of a fresh edit preview, and reads none after its commit', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const { service } = createService(repository);
    const created = await service.createProject('Preview scope');
    const added = await service.addRoute(created.records);
    const routeId = added.route.id;
    const aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, routeId)).aggregate!;
    const { nodes } = await addRouteNodes(service, aggregate, [{ name: 'South' }]);
    const preview = await service.previewNodeChanges(routeId, [{ ...nodes[0], name: 'South renamed' }]);
    expect(service.routeEditPreviewScope(preview.previewToken)).toEqual({ scenarioId: created.records.scenario.id, routeId, kind: 'nodes' });
    await service.commitNodeChanges(preview.previewToken);
    expect(service.routeEditPreviewScope(preview.previewToken)).toBeUndefined();
  });
});

describe('Route own annual counts and added service days (Decision 0089 items 41 and 43)', () => {
  async function started() {
    const { service } = createService();
    const created = await service.createProject('Own counts');
    const [weekday, saturday, sunday, holiday] = created.records.serviceDays;
    const { records, route } = await service.addRoute(created.records);
    const aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, route.id)).aggregate!;
    return { service, records, aggregate, weekday, saturday, sunday, holiday, scenarioId: created.records.scenario.id };
  }

  it('adds a custom service day with a count of 0, after the others, and refuses a blank name or a taken abbreviation', async () => {
    const { service, records, scenarioId } = await started();
    const total = records.serviceDays.reduce((sum, day) => sum + day.annualServiceDays, 0);
    const added = await service.addServiceDay(scenarioId, { name: ' Holiday 2 ', abbreviation: 'h2' });
    expect(added.serviceDay).toMatchObject({ kind: 'custom', name: 'Holiday 2', annualServiceDays: 0, abbreviation: 'H2' });
    expect(added.serviceDay.sequence).toBeGreaterThan(Math.max(...records.serviceDays.map((day) => day.sequence)));
    expect(added.records.serviceDays).toHaveLength(5);
    expect(added.records.serviceDays.reduce((sum, day) => sum + day.annualServiceDays, 0)).toBe(total);
    await expect(service.addServiceDay(scenarioId, { name: '  ' })).rejects.toBeInstanceOf(ServiceDayValidationError);
    await expect(service.addServiceDay(scenarioId, { name: 'Another', abbreviation: 'H2' })).rejects.toThrow(/abbreviation/);
    expect((await service.addServiceDay(scenarioId, { name: 'Another', abbreviation: '' })).records.serviceDays).toHaveLength(6);
  });

  it('saves a Route\'s own counts, keeps them when switched off, and drops a day that is gone', async () => {
    const { service, aggregate, weekday, saturday } = await started();
    const on = await service.updateRouteOwnCounts(aggregate, { enabled: true, countsByServiceDayId: { [weekday.id]: 62, gone: 9 } });
    expect(on.aggregate.route.ownAnnualServiceDays).toEqual({ enabled: true, countsByServiceDayId: { [weekday.id]: 62 } });
    expect(on.records.routes.find((route) => route.id === aggregate.route.id)!.ownAnnualServiceDays?.enabled).toBe(true);
    const off = await service.updateRouteOwnCounts(on.aggregate, { enabled: false, countsByServiceDayId: { [weekday.id]: 62, [saturday.id]: 0 } });
    expect(off.aggregate.route.ownAnnualServiceDays).toEqual({ enabled: false, countsByServiceDayId: { [weekday.id]: 62, [saturday.id]: 0 } });
  });

  it('refuses a count that is not a whole number of 0 or more, and a column that totals more than 365', async () => {
    const { service, aggregate, weekday, saturday } = await started();
    await expect(service.updateRouteOwnCounts(aggregate, { enabled: true, countsByServiceDayId: { [weekday.id]: -1 } })).rejects.toThrow(/whole number/);
    await expect(service.updateRouteOwnCounts(aggregate, { enabled: true, countsByServiceDayId: { [weekday.id]: 1.5 } })).rejects.toThrow(/whole number/);
    // The Scenario's other days stand in for the blank cells, so a weekday count of 366 alone is over the limit.
    await expect(service.updateRouteOwnCounts(aggregate, { enabled: true, countsByServiceDayId: { [saturday.id]: 366 } })).rejects.toThrow(/365/);
  });

  it('reaches storage through updateRoute only after the same checks', async () => {
    const { service, aggregate, weekday } = await started();
    const saved = await service.updateRoute(aggregate, { name: 'Own', ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { [weekday.id]: 62 } } });
    expect(saved.route).toMatchObject({ name: 'Own', ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { [weekday.id]: 62 } } });
    await expect(service.updateRoute(saved, { ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { [weekday.id]: -4 } } })).rejects.toBeInstanceOf(ServiceDayValidationError);
  });
});
