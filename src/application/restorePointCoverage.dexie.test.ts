import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { trimmedGoldenFixture } from '../testSupport/trimmedGolden';
import { createBlockingScenarioSourceSignature } from '../domain/blocking';
import { BLOCKING_COVERAGE, PLANNED_FREQUENCY_COVERAGE, ROUTE_DEFINITION_COVERAGE, TRIP_GENERATION_COVERAGE, withRestorePoints, type RestorePointLookup } from './restorePointCoverage';
import { BlockingApplicationService } from './blockingService';
import { PlannedFrequencyService } from './plannedFrequencyService';
import { RouteDefinitionService } from './routeDefinitionService';
import { TripGenerationService } from './tripGenerationService';
import { ProjectBackupService } from '../persistence/backupRepository';
import { DexieBlockingRepository } from '../persistence/blockingRepository';
import { TransitDatabase } from '../persistence/database';
import { DexieRouteDefinitionRepository } from '../persistence/dexieRepository';
import { DexieRestorePoints } from '../persistence/restorePointPersistence';
import { SaveStatusPublisher } from './saveStatus';
import type { RestorePointSummary } from '../domain/types';

let counter = 0;

/** The services and their restore points, wired as `src/main.tsx` wires them, over a new database seeded with the trimmed golden project. */
async function open() {
  const name = `transit-covered-commands-${Date.now()}-${(counter += 1)}`;
  const db = new TransitDatabase(name);
  const repository = new DexieRouteDefinitionRepository(db);
  const blockingRepository = new DexieBlockingRepository(db);
  const fixture = trimmedGoldenFixture();
  await repository.saveProjectSnapshot(fixture.snapshot);
  const saveStatus = new SaveStatusPublisher();
  const restorePoints = new DexieRestorePoints(db, repository);
  const routeCore = new RouteDefinitionService(repository, new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot)), undefined, saveStatus);
  const lookup: RestorePointLookup = {
    getTrip: (id) => db.trips.get(id),
    getTripProfile: (id) => db.tripProfiles.get(id),
    getRuntimeProfile: (id) => db.runtimeProfiles.get(id),
    getPattern: (id) => db.patterns.get(id),
    getRoute: (id) => db.routes.get(id),
    getBlockingScenario: (id) => db.blockingScenarios.get(id),
    getBlock: (id) => db.blocks.get(id),
    getScenario: (id) => db.scenarios.get(id),
    routeEditPreviewScope: (token) => routeCore.routeEditPreviewScope(token),
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
  return {
    db, fixture, restorePoints, routeDefinition, tripGeneration, blocking, plannedFrequencies, blockingRepository,
    close: async () => { db.close(); await Dexie.delete(name); },
  };
}

const kindOf = (points: RestorePointSummary[], kind: string) => points.filter((point) => point.kind === kind);

describe('covered commands store one restore point each', () => {
  it('clearPlan, deleteTrips, deleteBlockingScenario, and deleteRoute each store one point with the expected names and counts', async () => {
    const h = await open();
    try {
      const { snapshot, weekday, plan, defaultProfile, planPattern } = h.fixture;
      const scenario = snapshot.scenarios[0];
      const route = snapshot.routes[0];
      const routeName = route.shortName || route.name || 'Untitled route';
      const dayName = snapshot.serviceDays.find((day) => day.id === weekday)!.name;

      await h.plannedFrequencies.clearPlan(plan.routeId, weekday);
      expect(kindOf(await h.restorePoints.listRestorePoints(), 'clearPlan')).toHaveLength(1);
      const [clear] = kindOf(await h.restorePoints.listRestorePoints(), 'clearPlan');
      expect(clear.names).toMatchObject({ scenario: scenario.name, route: routeName, serviceDay: dayName });
      expect(clear.counts.plannedFrequencies).toEqual({ removed: 1, changed: 0, added: 0 });

      const trips = snapshot.trips.filter((trip) => trip.tripProfileId === defaultProfile.id && trip.serviceDayId === weekday).slice(0, 2).map((trip) => trip.id);
      const tripReview = await h.tripGeneration.previewTripDeletion(trips);
      await h.tripGeneration.deleteTrips(trips, tripReview.reviewToken);
      const [deletedTrips] = kindOf(await h.restorePoints.listRestorePoints(), 'deleteTrips');
      expect(deletedTrips.quantity).toBe(2);
      expect(deletedTrips.names).toMatchObject({ scenario: scenario.name, serviceDay: dayName });
      expect(deletedTrips.counts.trips).toEqual({ removed: 2, changed: expect.any(Number), added: 0 });

      const blockingScenario = snapshot.blockingScenarios!.find((candidate) => candidate.name !== 'Alt Blocks')!;
      const blocks = await h.blockingRepository.listBlockingBlocks(blockingScenario.id);
      await h.blocking.deleteBlockingScenario(blockingScenario.id, createBlockingScenarioSourceSignature(blockingScenario, blocks));
      const [deletedBlocking] = kindOf(await h.restorePoints.listRestorePoints(), 'deleteBlockingScenario');
      expect(deletedBlocking.names).toMatchObject({ scenario: scenario.name, blockingScenario: blockingScenario.name });
      expect(deletedBlocking.counts.blockingScenarios).toEqual({ removed: 1, changed: 0, added: 0 });

      const review = await h.routeDefinition.getRouteDeletionImpact(route.id);
      await h.routeDefinition.deleteRoute(route.id, review.reviewToken);
      const [deletedRoute] = kindOf(await h.restorePoints.listRestorePoints(), 'deleteRoute');
      expect(deletedRoute.names).toMatchObject({ scenario: scenario.name, route: routeName });
      expect(deletedRoute.counts.routes).toEqual({ removed: 1, changed: 0, added: 0 });
      expect(planPattern.routeId).toBe(route.id);

      expect(await h.restorePoints.listRestorePoints()).toHaveLength(4);
    } finally {
      await h.close();
    }
  });
});
