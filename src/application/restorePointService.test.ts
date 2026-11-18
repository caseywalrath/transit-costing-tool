import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { trimmedGoldenFixture } from '../testSupport/trimmedGolden';
import { createBlockingScenarioSourceSignature } from '../domain/blocking';
import type { ScenarioRecords } from '../domain/project';
import type { BlockActivity, ProjectSnapshot } from '../domain/types';
import { BLOCKING_COVERAGE, PLANNED_FREQUENCY_COVERAGE, ROUTE_DEFINITION_COVERAGE, TRIP_GENERATION_COVERAGE, withRestorePoints, type RestorePointLookup } from './restorePointCoverage';
import { BlockingApplicationService } from './blockingService';
import { PlannedFrequencyService } from './plannedFrequencyService';
import { RouteDefinitionService } from './routeDefinitionService';
import { TripGenerationService } from './tripGenerationService';
import { RestoreConflictError, RestorePointService } from './restorePointService';
import { ProjectBackupService } from '../persistence/backupRepository';
import { exportProjectJson, parseProjectBackup } from '../persistence/backup';
import { DexieBlockingRepository } from '../persistence/blockingRepository';
import { TransitDatabase } from '../persistence/database';
import { DexieRouteDefinitionRepository } from '../persistence/dexieRepository';
import { DexieRestorePoints } from '../persistence/restorePointPersistence';
import { SaveStatusPublisher } from './saveStatus';

let counter = 0;

/** The services, wired as `src/main.tsx` wires them, over a new database seeded with the trimmed golden project. */
async function open() {
  const name = `transit-restore-${Date.now()}-${(counter += 1)}`;
  const db = new TransitDatabase(name);
  const repository = new DexieRouteDefinitionRepository(db);
  const blockingRepository = new DexieBlockingRepository(db);
  const fixture = trimmedGoldenFixture();
  await repository.saveProjectSnapshot(fixture.snapshot);
  const saveStatus = new SaveStatusPublisher();
  const restorePoints = new DexieRestorePoints(db, repository);
  const routeCore = new RouteDefinitionService(repository, new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot)), undefined, saveStatus);
  const lookup: RestorePointLookup = {
    getTrip: (id) => db.trips.get(id), getTripProfile: (id) => db.tripProfiles.get(id), getRuntimeProfile: (id) => db.runtimeProfiles.get(id),
    getPattern: (id) => db.patterns.get(id), getRoute: (id) => db.routes.get(id), getBlockingScenario: (id) => db.blockingScenarios.get(id),
    getBlock: (id) => db.blocks.get(id), getScenario: (id) => db.scenarios.get(id), routeEditPreviewScope: (token) => routeCore.routeEditPreviewScope(token),
  };
  const routeDefinition = withRestorePoints(routeCore, ROUTE_DEFINITION_COVERAGE, restorePoints, restorePoints, saveStatus, lookup);
  const tripGeneration = withRestorePoints(new TripGenerationService(repository, undefined, saveStatus), TRIP_GENERATION_COVERAGE, restorePoints, restorePoints, saveStatus, lookup);
  const blocking = withRestorePoints(new BlockingApplicationService(blockingRepository, {
    getTrip: (id) => repository.getTrip(id),
    listTrips: (scenarioId, tripProfileId) => repository.listTripsForScenarioProfile(scenarioId, tripProfileId),
    getTripProfile: (id) => repository.getTripProfile(id),
    listPatterns: (scenarioId) => db.patterns.where('scenarioId').equals(scenarioId).toArray(),
    listDirections: (scenarioId) => db.directions.where('scenarioId').equals(scenarioId).toArray(),
    listServiceDays: (scenarioId) => db.serviceDays.where('scenarioId').equals(scenarioId).toArray(),
    listNodes: (scenarioId) => db.nodes.where('scenarioId').equals(scenarioId).toArray(),
    listRoutes: (scenarioId) => db.routes.where('scenarioId').equals(scenarioId).toArray(),
    listProjectScenarios: async (scenarioId) => {
      const scenario = await db.scenarios.get(scenarioId);
      return scenario ? db.scenarios.where('projectId').equals(scenario.projectId).toArray() : [];
    },
  }, saveStatus), BLOCKING_COVERAGE, restorePoints, restorePoints, saveStatus, lookup);
  const plannedFrequencies = withRestorePoints(new PlannedFrequencyService(repository, undefined, saveStatus), PLANNED_FREQUENCY_COVERAGE, restorePoints, restorePoints, saveStatus, lookup);
  const service = new RestorePointService(restorePoints, restorePoints, {
    getScenarioRecords: (id) => repository.getScenarioRecords(id),
    saveScenarioRecords: (records) => repository.saveScenarioRecords(records),
    getProjectSnapshot: (id) => repository.getProjectSnapshot(id),
    saveProjectSnapshot: (snapshot) => repository.saveProjectSnapshot(snapshot),
    projectExists: async (id) => Boolean(await db.projects.get(id)),
  }, saveStatus, () => routeCore.forgetCopyUndos());
  const scenarioId = fixture.scenarioId;
  const blockingScenarioOf = async (tripProfileId = fixture.defaultProfile.id) => (await db.blockingScenarios.where('scenarioId').equals(scenarioId).toArray()).find((candidate) => candidate.tripProfileId === tripProfileId)!;
  const signature = async (blockingScenarioId: string) => createBlockingScenarioSourceSignature((await db.blockingScenarios.get(blockingScenarioId))!, await blockingRepository.listBlockingBlocks(blockingScenarioId));
  return {
    db, repository, fixture, scenarioId, restorePoints, service, routeDefinition, tripGeneration, blocking, plannedFrequencies, blockingRepository, blockingScenarioOf, signature,
    close: async () => { db.close(); await Dexie.delete(name); },
  };
}
type Harness = Awaited<ReturnType<typeof open>>;

/** Records with every collection sorted by id, so equality does not depend on index order. */
function sorted(records: ScenarioRecords | undefined) {
  if (!records) return records;
  return Object.fromEntries(Object.entries(records).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort((a, b) => String(a.id).localeCompare(String(b.id))) : value]));
}
function sortedSnapshot(snapshot: ProjectSnapshot | undefined) {
  if (!snapshot) return snapshot;
  return Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [key, Array.isArray(value) ? [...value].sort((a, b) => String(a.id).localeCompare(String(b.id))) : value]));
}

/** Runs `command`, checks it stored one point of `kind`, restores that point, and checks the Scenario is as it was. */
async function roundTrip(h: Harness, kind: string, command: () => Promise<unknown>) {
  const before = sorted(await h.repository.getScenarioRecords(h.scenarioId));
  const count = (await h.restorePoints.listRestorePoints()).length;
  await command();
  const points = await h.restorePoints.listRestorePoints();
  expect(points).toHaveLength(count + 1);
  expect(points[0].kind).toBe(kind);
  expect((await h.service.listRestorePoints())[0].status).toEqual({ state: 'restorable' });
  await h.service.restore(points[0].id);
  expect(sorted(await h.repository.getScenarioRecords(h.scenarioId))).toEqual(before);
}

const firstOfType = (activities: BlockActivity[], type: BlockActivity['type']) => activities.find((activity) => activity.type === type);

async function withHarness(run: (h: Harness) => Promise<void>) {
  const h = await open();
  try { await run(h); } finally { await h.close(); }
}

describe('every covered command can be restored to the exact records before it', () => {
  it('route definition: deleteProject', () => withHarness(async (h) => {
    const projectId = h.fixture.snapshot.project.id;
    const before = sortedSnapshot(await h.repository.getProjectSnapshot(projectId));
    const impact = await h.routeDefinition.getProjectDeletionImpact(projectId);
    await h.routeDefinition.deleteProject(projectId, impact.reviewToken);
    expect(await h.repository.getProjectSnapshot(projectId)).toBeUndefined();
    const [point] = await h.service.listRestorePoints();
    expect(point).toMatchObject({ kind: 'deleteProject', status: { state: 'restorable' } });
    await h.service.restore(point.id);
    expect(sortedSnapshot(await h.repository.getProjectSnapshot(projectId))).toEqual(before);
    expect(await h.restorePoints.listRestorePoints()).toHaveLength(0);
  }));

  it('route definition: deleteScenario (restored into its existing project)', () => withHarness(async (h) => {
    await h.routeDefinition.createScenario(h.fixture.snapshot.project.id, 'Kept');
    const before = sorted(await h.repository.getScenarioRecords(h.scenarioId));
    const impact = await h.routeDefinition.getScenarioDeletionImpact(h.scenarioId);
    await h.routeDefinition.deleteScenario(h.scenarioId, impact.reviewToken);
    expect(await h.repository.getScenarioRecords(h.scenarioId)).toBeUndefined();
    const [point] = await h.service.listRestorePoints();
    expect(point.kind).toBe('deleteScenario');
    await h.service.restore(point.id);
    expect(sorted(await h.repository.getScenarioRecords(h.scenarioId))).toEqual(before);
  }));

  it('route definition: deleteRoute', () => withHarness(async (h) => {
    const route = h.fixture.snapshot.routes[0];
    await roundTrip(h, 'deleteRoute', async () => h.routeDefinition.deleteRoute(route.id, (await h.routeDefinition.getRouteDeletionImpact(route.id)).reviewToken));
  }));

  it('route definition: deletePattern', () => withHarness(async (h) => {
    const pattern = h.fixture.planPattern;
    await roundTrip(h, 'deletePattern', async () => h.routeDefinition.deletePattern(pattern.id, (await h.routeDefinition.getPatternDeletionImpact(pattern.id)).reviewToken));
  }));

  it('route definition: commitPatternChange with reset', () => withHarness(async (h) => {
    const pattern = h.fixture.planPattern;
    const points = [...pattern.points].sort((a, b) => a.sequence - b.sequence);
    const proposed = { ...pattern, points: points.slice(0, -1) };
    await roundTrip(h, 'resetPatternService', async () => {
      const preview = await h.routeDefinition.previewPatternChange(pattern.routeId, pattern.id, proposed);
      await h.routeDefinition.commitPatternChange(preview.previewToken, 'reset');
    });
  }));

  it('route definition: commitNodeChanges that deletes a node', () => withHarness(async (h) => {
    const pattern = h.fixture.planPattern;
    const points = [...pattern.points].sort((a, b) => a.sequence - b.sequence);
    const middleNodeId = points[1].nodeId;
    const nodes = (await h.db.nodes.where('scenarioId').equals(h.scenarioId).toArray()).filter((node) => (node as { routeId?: string }).routeId === undefined || (node as { routeId?: string }).routeId === pattern.routeId);
    await roundTrip(h, 'deleteNodes', async () => {
      const preview = await h.routeDefinition.previewNodeChanges(pattern.routeId, nodes.filter((node) => node.id !== middleNodeId));
      await h.routeDefinition.commitNodeChanges(preview.previewToken, preview.requiresReset ? 'reset' : 'rebalance');
    });
  }));

  it('route definition: deleteRuntimeProfile', () => withHarness(async (h) => {
    const profileId = h.fixture.assignment.runtimeProfileId;
    const profile = (await h.db.runtimeProfiles.get(profileId))!;
    const replacement = (await h.db.runtimeProfiles.where('scenarioId').equals(h.scenarioId).toArray()).find((candidate) => candidate.id !== profileId && candidate.patternId === profile.patternId);
    await roundTrip(h, 'deleteRuntimeProfile', async () => {
      const impact = await h.routeDefinition.getRuntimeProfileDeletionImpact(profileId);
      await h.routeDefinition.deleteRuntimeProfile(profileId, replacement?.id, impact.reviewToken);
    });
  }));

  it('trip generation: deleteTrips', () => withHarness(async (h) => {
    const tripIds = [h.fixture.trip.id];
    await roundTrip(h, 'deleteTrips', async () => h.tripGeneration.deleteTrips(tripIds, (await h.tripGeneration.previewTripDeletion(tripIds)).reviewToken));
  }));

  it('trip generation: applyTripCopy', () => withHarness(async (h) => {
    const { trip, weekday, defaultProfile } = h.fixture;
    const target = h.fixture.snapshot.serviceDays.find((day) => day.id !== weekday)!;
    await roundTrip(h, 'copyTripsFromDay', async () => h.tripGeneration.applyTripCopy(await h.tripGeneration.previewTripCopy({
      scenarioId: h.scenarioId, routeId: trip.routeId, tripProfileId: defaultProfile.id, sourceServiceDayId: weekday, targetServiceDayId: target.id, allowEmptySource: false,
    })));
  }));

  // FX8: the trip changes. Each records the Route, Day, and Trip profile of its first Trip.
  const directionOf = (h: Harness, patternId: string) => h.fixture.snapshot.patterns.find((pattern) => pattern.id === patternId)!.directionId!;

  it('trip generation: applyStagedTripShift (shiftTrips), with the refs of its Trip', () => withHarness(async (h) => {
    const { trip } = h.fixture;
    await roundTrip(h, 'shiftTrips', async () => h.tripGeneration.applyStagedTripShift(await h.tripGeneration.previewStagedTripShift({
      scenarioId: h.scenarioId, routeId: trip.routeId, serviceDayId: trip.serviceDayId, directionId: directionOf(h, trip.patternId), tripProfileId: trip.tripProfileId, tripIds: [trip.id], offsetSeconds: 120,
    })));
    // The recorded restore keeps the refs, so the Trips menu can offer to redo it in the same view.
    const view = { scenarioId: h.scenarioId, routeId: trip.routeId, serviceDayId: trip.serviceDayId, tripProfileId: trip.tripProfileId! };
    const points = await h.restorePoints.listRestorePoints();
    for (const point of points) expect(point.refs).toMatchObject({ routeId: trip.routeId, serviceDayId: trip.serviceDayId, tripProfileId: trip.tripProfileId });
    expect(await h.service.latestTripChange(view)).toMatchObject({ kind: 'restore', restoredKind: 'shiftTrips' });
    expect(await h.service.latestTripChange({ ...view, serviceDayId: 'another-day' })).toBeUndefined();
  }));

  it('trip generation: applyRecalculationPreview with a new start time (changeTripStartTime)', () => withHarness(async (h) => {
    const { trip } = h.fixture;
    const first = trip.stopTimes[0];
    await roundTrip(h, 'changeTripStartTime', async () => h.tripGeneration.applyRecalculationPreview(
      await h.tripGeneration.previewRecalculateTrips([trip.id], { [trip.id]: first.patternPointId }, {}, { [trip.id]: first.time + 120 }), true));
  }));

  it('trip generation: applyRecalculationReview (regenerateTrips)', () => withHarness(async (h) => {
    const { trip } = h.fixture;
    // Move the stored times off the profile first, so regenerating changes them.
    await h.repository.saveTrips([{ ...trip, stopTimes: trip.stopTimes.map((point) => ({ ...point, time: point.time + 60 })) }]);
    await roundTrip(h, 'regenerateTrips', async () => h.tripGeneration.applyRecalculationReview(await h.tripGeneration.reviewRecalculation([trip.id]), true));
  }));

  it('trip generation: applyBatchPatternChange (changeTripPattern)', () => withHarness(async (h) => {
    const { trip } = h.fixture;
    const direction = directionOf(h, trip.patternId);
    const target = h.fixture.snapshot.patterns.find((pattern) => pattern.routeId === trip.routeId && pattern.directionId === direction && pattern.id !== trip.patternId)!;
    await roundTrip(h, 'changeTripPattern', async () => h.tripGeneration.applyBatchPatternChange(await h.tripGeneration.previewBatchPatternChange({ tripIds: [trip.id], targetPatternId: target.id })));
  }));

  it('trip generation: deleteTripProfile', () => withHarness(async (h) => {
    const profileId = h.fixture.altProfile.id;
    await roundTrip(h, 'deleteTripProfile', async () => h.tripGeneration.deleteTripProfile(profileId, (await h.tripGeneration.previewTripProfileDeletion(profileId)).previewToken));
  }));

  it('blocking: deleteBlockingScenario', () => withHarness(async (h) => {
    const scenario = await h.blockingScenarioOf();
    await roundTrip(h, 'deleteBlockingScenario', async () => h.blocking.deleteBlockingScenario(scenario.id, await h.signature(scenario.id)));
  }));

  it('blocking: deleteBlock', () => withHarness(async (h) => {
    const scenario = await h.blockingScenarioOf();
    const [block] = await h.blockingRepository.listBlockingBlocks(scenario.id);
    await roundTrip(h, 'deleteBlocks', async () => h.blocking.deleteBlock(scenario.id, block.id, await h.signature(scenario.id)));
  }));

  it('blocking: deleteBlocks', () => withHarness(async (h) => {
    const scenario = await h.blockingScenarioOf();
    const blocks = (await h.blockingRepository.listBlockingBlocks(scenario.id)).slice(0, 2);
    await roundTrip(h, 'deleteBlocks', async () => h.blocking.deleteBlocks(scenario.id, blocks.map((block) => block.id), await h.signature(scenario.id)));
  }));

  it('blocking: applyBlockingDayCopy', () => withHarness(async (h) => {
    const scenario = await h.blockingScenarioOf();
    const target = h.fixture.snapshot.serviceDays.find((day) => day.id !== h.fixture.weekday)!;
    // Give the target day the same Trips, so every Block matches.
    const trips = await h.db.trips.where('scenarioId').equals(h.scenarioId).toArray();
    for (const routeId of new Set(trips.filter((trip) => trip.serviceDayId === h.fixture.weekday && trip.tripProfileId === scenario.tripProfileId).map((trip) => trip.routeId))) {
      await h.tripGeneration.applyTripCopy(await h.tripGeneration.previewTripCopy({ scenarioId: h.scenarioId, routeId, tripProfileId: scenario.tripProfileId, sourceServiceDayId: h.fixture.weekday, targetServiceDayId: target.id, allowEmptySource: false }));
    }
    await roundTrip(h, 'copyBlocksFromDay', async () => h.blocking.applyBlockingDayCopy(await h.blocking.previewBlockingDayCopy({
      scenarioId: h.scenarioId, blockingScenarioId: scenario.id, sourceServiceDayId: h.fixture.weekday, targetServiceDayId: target.id, allowEmptySource: true, acknowledgeMismatch: true,
    })));
  }));

  it('blocking: createAutoBlockingScenario rebuilding an existing scenario', () => withHarness(async (h) => {
    const tripProfileId = h.fixture.defaultProfile.id;
    const setup = await h.blocking.getAutoBlockingSetup(h.scenarioId, tripProfileId);
    const built = await h.blocking.createAutoBlockingScenario({ scenarioId: h.scenarioId, tripProfileId, name: 'Auto rebuilt', rules: setup.defaultRules });
    expect(await h.restorePoints.listRestorePoints()).toHaveLength(0);
    await roundTrip(h, 'rebuildAutoBlocks', async () => h.blocking.createAutoBlockingScenario({ scenarioId: h.scenarioId, tripProfileId, name: 'Auto rebuilt again', rules: setup.defaultRules, replaceBlockingScenarioId: built.id }));
  }));

  it('blocking: applyBulkBoundaryActivities replacing pull-outs', () => withHarness(async (h) => {
    const scenario = await h.blockingScenarioOf();
    const source = (await h.blockingRepository.listBlockingBlocks(scenario.id, h.fixture.weekday)).find((block) => firstOfType(block.activities, 'pullOut'))!;
    const pullOut = firstOfType(source.activities, 'pullOut')!;
    await roundTrip(h, 'replaceBoundaryActivities', async () => {
      const request = { blockingScenarioId: scenario.id, serviceDayId: h.fixture.weekday, sourceBlockId: source.id, activity: { ...pullOut, minutesBeforeFirstTrip: 45 } as never, replaceExisting: true, sourceSignature: await h.signature(scenario.id) };
      const preview = await h.blocking.previewBulkBoundaryActivities(request);
      await h.blocking.applyBulkBoundaryActivities({ ...request, expectedEndpointSignature: preview.endpointSignature });
    });
  }));

  it('blocking: removeTrip and removeTrips', () => withHarness(async (h) => {
    const scenario = await h.blockingScenarioOf();
    const [block] = await h.blockingRepository.listBlockingBlocks(scenario.id, h.fixture.weekday);
    const tripIds = block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : []);
    await roundTrip(h, 'unassignTrips', async () => h.blocking.removeTrip(scenario.id, h.fixture.weekday, tripIds[0], await h.signature(scenario.id)));
    await roundTrip(h, 'unassignTrips', async () => h.blocking.removeTrips(scenario.id, h.fixture.weekday, tripIds.slice(0, 2), await h.signature(scenario.id)));
  }));

  it('blocking: reassignTrips and assignTripsToBlock', () => withHarness(async (h) => {
    const scenario = await h.blockingScenarioOf();
    const [from, to] = await h.blockingRepository.listBlockingBlocks(scenario.id, h.fixture.weekday);
    const tripId = from.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : [])[0];
    await roundTrip(h, 'moveTripsToBlock', async () => h.blocking.reassignTrips({ blockingScenarioId: scenario.id, serviceDayId: h.fixture.weekday, tripIds: [tripId], sourceBlockId: from.id, destinationBlockId: to.id, sourceSignature: await h.signature(scenario.id) }));
    await roundTrip(h, 'moveTripsToBlock', async () => h.blocking.assignTripsToBlock({ blockingScenarioId: scenario.id, serviceDayId: h.fixture.weekday, tripIds: [tripId], destinationBlockId: to.id, sourceSignature: await h.signature(scenario.id) }));
  }));

  it('blocking: removeBoundaryActivity and removeDeadheads', () => withHarness(async (h) => {
    const scenario = await h.blockingScenarioOf();
    const blocks = await h.blockingRepository.listBlockingBlocks(scenario.id, h.fixture.weekday);
    const withPullOut = blocks.find((block) => firstOfType(block.activities, 'pullOut'))!;
    await roundTrip(h, 'removeBlockActivity', async () => h.blocking.removeBoundaryActivity(scenario.id, withPullOut.id, firstOfType(withPullOut.activities, 'pullOut')!.id, await h.signature(scenario.id)));
    const withDeadhead = blocks.find((block) => firstOfType(block.activities, 'deadhead'));
    if (withDeadhead) {
      await roundTrip(h, 'deleteDeadheads', async () => h.blocking.removeDeadheads(scenario.id, withDeadhead.id, [firstOfType(withDeadhead.activities, 'deadhead')!.id], await h.signature(scenario.id)));
    } else {
      const block = blocks[0];
      const trips = block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : []);
      const deadhead = await h.blocking.addActivity({ blockingScenarioId: scenario.id, blockId: block.id, afterTripId: trips[0], activity: { id: 'dh-test', type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: 1, fromNodeId: h.fixture.planPattern.points[0].nodeId, toNodeId: h.fixture.planPattern.points[0].nodeId } as never, sourceSignature: await h.signature(scenario.id) });
      const added = firstOfType(deadhead.activities, 'deadhead')!;
      await roundTrip(h, 'deleteDeadheads', async () => h.blocking.removeDeadheads(scenario.id, block.id, [added.id], await h.signature(scenario.id)));
    }
  }));

  it('planned frequency: clearPlan', () => withHarness(async (h) => {
    await roundTrip(h, 'clearPlan', () => h.plannedFrequencies.clearPlan(h.fixture.plan.routeId, h.fixture.weekday));
  }));

  it('planned frequency: applyCopyFromDay', () => withHarness(async (h) => {
    const target = h.fixture.snapshot.serviceDays.find((day) => day.id !== h.fixture.weekday)!;
    await roundTrip(h, 'copyPlanFromDay', async () => h.plannedFrequencies.applyCopyFromDay(await h.plannedFrequencies.previewCopyFromDay(h.fixture.plan.routeId, h.fixture.weekday, target.id)));
  }));

  it('planned frequency: applyCopyFromScenario', () => withHarness(async (h) => {
    const routeId = h.fixture.plan.routeId;
    const copy = await h.routeDefinition.duplicateScenarioById(h.scenarioId, 'Source copy');
    const sourceRoute = copy.routes.find((route) => route.shortName === h.fixture.snapshot.routes.find((candidate) => candidate.id === routeId)!.shortName)!;
    const sourcePlan = (await h.db.plannedFrequencies.where('scenarioId').equals(copy.scenario.id).toArray())[0];
    await h.plannedFrequencies.savePlan({ ...sourcePlan, periods: sourcePlan.periods.map((period) => ({ ...period, headwaySeconds: 600 })) } as never);
    // The source plan now differs from the target's, so the copy changes a row.
    await roundTrip(h, 'copyPlansFromScenario', async () => h.plannedFrequencies.applyCopyFromScenario(await h.plannedFrequencies.previewCopyFromScenario({ sourceScenarioId: copy.scenario.id, sourceRouteId: sourceRoute.id, targetRouteId: routeId })));
  }));
});

describe('closeout (FX10): delete, undo, and a backup round trip on the golden project', () => {
  it('a restored Route exports and re-imports to the same project as before the deletion, with no restore point in the file', () => withHarness(async (h) => {
    const projectId = h.fixture.snapshot.project.id;
    const exportedBefore = exportProjectJson((await h.repository.getProjectSnapshot(projectId))!);
    const route = h.fixture.snapshot.routes[0];
    await h.routeDefinition.deleteRoute(route.id, (await h.routeDefinition.getRouteDeletionImpact(route.id)).reviewToken);
    const [point] = await h.service.listRestorePoints();
    await h.service.restore(point.id);
    const exportedAfter = exportProjectJson((await h.repository.getProjectSnapshot(projectId))!);
    expect(exportedAfter).not.toContain('restorePoint');
    const { scenarios: scenariosAfter, project: projectAfter, ...restAfter } = sortedSnapshot(parseProjectBackup(exportedAfter))!;
    const { scenarios: scenariosBefore, project: projectBefore, ...restBefore } = sortedSnapshot(parseProjectBackup(exportedBefore))!;
    expect(restAfter).toEqual(restBefore);
    // Only the Scenario's and Project's save times may move.
    const withoutTimes = (value: unknown) => JSON.parse(JSON.stringify(value), (key, item) => key === 'updatedAt' ? undefined : item);
    expect(withoutTimes(scenariosAfter)).toEqual(withoutTimes(scenariosBefore));
    expect(withoutTimes(projectAfter)).toEqual(withoutTimes(projectBefore));
    await h.repository.saveProjectSnapshot(parseProjectBackup(exportedAfter));
    expect(exportProjectJson((await h.repository.getProjectSnapshot(projectId))!).replace(/"exportedAt": "[^"]*"/, '')).toBe(exportedAfter.replace(/"exportedAt": "[^"]*"/, ''));
  }));
});

describe('restore rules', () => {
  it('refuses a restore after a row the command wrote is edited, naming the record', () => withHarness(async (h) => {
    const scenario = await h.blockingScenarioOf();
    const [block, other] = await h.blockingRepository.listBlockingBlocks(scenario.id, h.fixture.weekday);
    const tripId = block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : [])[0];
    await h.blocking.removeTrip(scenario.id, h.fixture.weekday, tripId, await h.signature(scenario.id));
    const changed = (await h.db.blocks.get(block.id))!;
    await h.blocking.updateBlock({ ...changed, label: 'Edited since' } as never, await h.signature(scenario.id));
    const [point] = await h.service.listRestorePoints();
    expect(point.status).toEqual({ state: 'conflict', named: [{ collection: 'blocks', name: 'Edited since', reason: 'changedSince' }], more: 0 });
    await expect(h.service.restore(point.id)).rejects.toBeInstanceOf(RestoreConflictError);
    expect((await h.db.blocks.get(block.id))!.label).toBe('Edited since');
    expect(other).toBeDefined();
  }));

  it('restores an older point while an unrelated newer one stays', () => withHarness(async (h) => {
    const before = sorted(await h.repository.getScenarioRecords(h.scenarioId));
    await h.plannedFrequencies.clearPlan(h.fixture.plan.routeId, h.fixture.weekday);
    const tripIds = [h.fixture.trip.id];
    await h.tripGeneration.deleteTrips(tripIds, (await h.tripGeneration.previewTripDeletion(tripIds)).reviewToken);
    const [newer, older] = await h.service.listRestorePoints();
    expect([newer.kind, older.kind]).toEqual(['deleteTrips', 'clearPlan']);
    expect(older.status).toEqual({ state: 'restorable' });
    await h.service.restore(older.id);
    expect(await h.db.plannedFrequencies.get(h.fixture.plan.id)).toBeDefined();
    expect(await h.db.trips.get(h.fixture.trip.id)).toBeUndefined();
    const remaining = await h.service.listRestorePoints();
    await h.service.restore(remaining.find((point) => point.kind === 'deleteTrips')!.id);
    const after = sorted(await h.repository.getScenarioRecords(h.scenarioId));
    expect(after).toEqual(before);
  }));

  it('a restore stores its own point, and restoring that point undoes the restore', () => withHarness(async (h) => {
    await h.plannedFrequencies.clearPlan(h.fixture.plan.routeId, h.fixture.weekday);
    const cleared = sorted(await h.repository.getScenarioRecords(h.scenarioId));
    const [point] = await h.service.listRestorePoints();
    await h.service.restore(point.id);
    const [restorePoint] = await h.service.listRestorePoints();
    expect(restorePoint).toMatchObject({ kind: 'restore', restoredKind: 'clearPlan', status: { state: 'restorable' } });
    expect(restorePoint.names.route).toBe(point.names.route);
    await h.service.restore(restorePoint.id);
    expect(sorted(await h.repository.getScenarioRecords(h.scenarioId))).toEqual(cleared);
  }));

  it('a Scenario point of a deleted project reports projectMissing, and latestRestorable skips it', () => withHarness(async (h) => {
    await h.plannedFrequencies.clearPlan(h.fixture.plan.routeId, h.fixture.weekday);
    const projectId = h.fixture.snapshot.project.id;
    await h.routeDefinition.deleteProject(projectId, (await h.routeDefinition.getProjectDeletionImpact(projectId)).reviewToken);
    const points = await h.service.listRestorePoints();
    expect(points.find((point) => point.kind === 'clearPlan')!.status).toEqual({ state: 'projectMissing' });
    expect((await h.service.latestRestorable())!.kind).toBe('deleteProject');
    expect(await h.service.latestRestorable('another-project')).toBeUndefined();
  }));
});
