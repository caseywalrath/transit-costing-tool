import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/source-sans-3';
import './ui/styles/index.css';
import { App } from './ui/App';
import { DexieRouteDefinitionRepository } from './persistence/dexieRepository';
import { TransitDatabase } from './persistence/database';
import { TabGuard } from './persistence/tabGuard';
import { ProjectBackupService } from './persistence/backupRepository';
import { RouteDefinitionService } from './application/routeDefinitionService';
import { TripGenerationService } from './application/tripGenerationService';
import { PlannedFrequencyService } from './application/plannedFrequencyService';
import { BlockingApplicationService } from './application/blockingService';
import { DexieBlockingRepository } from './persistence/blockingRepository';
import { CostingApplicationService } from './application/costingService';
import { createCostingContextQueries } from './application/costingContext';
import { LocalDataProtectionService, SaveStatusPublisher } from './application/saveStatus';
import { LocalStorageDataProtectionStore } from './persistence/localDataProtectionStore';

async function start() {
  // Only one tab at a time may write (Decision 0037). Decide whether this is that tab before the application starts,
  // so no write can run before the answer is known.
  const tabGuard = new TabGuard();
  await tabGuard.acquire();

  // One publisher of the visible save status for every service that writes, and the device-local record of how well the data is
  // protected. After the first successful save the browser is asked once to keep the store (Decision 0001, amendment).
  const protection = new LocalDataProtectionService(new LocalStorageDataProtectionStore(), typeof navigator === 'undefined' ? undefined : navigator.storage);
  const saveStatus = new SaveStatusPublisher(undefined, () => protection.afterSuccessfulSave());

  const repository = new DexieRouteDefinitionRepository(new TransitDatabase(undefined, tabGuard));
  const backup = new ProjectBackupService(
    (projectId) => repository.getProjectSnapshot(projectId),
    (snapshot) => repository.saveProjectSnapshot(snapshot),
  );
  const routeDefinition = new RouteDefinitionService(repository, backup, undefined, saveStatus, protection);
  const tripGeneration = new TripGenerationService(repository, undefined, saveStatus);
  const listProfileTrips = (scenarioId: string, tripProfileId: string) => repository.listTripsForScenarioProfile(scenarioId, tripProfileId);
  const listScenarioPatterns = (scenarioId: string) => repository.db.patterns.where('scenarioId').equals(scenarioId).toArray();
  const blocking = new BlockingApplicationService(new DexieBlockingRepository(repository.db), {
    getTrip: (id) => repository.getTrip(id),
    listTrips: listProfileTrips,
    getTripProfile: (id) => repository.getTripProfile(id),
    listPatterns: listScenarioPatterns,
    listDirections: (scenarioId) => repository.db.directions.where('scenarioId').equals(scenarioId).toArray(),
    listServiceDays: (scenarioId) => repository.db.serviceDays.where('scenarioId').equals(scenarioId).toArray(),
    listNodes: (scenarioId) => repository.db.nodes.where('scenarioId').equals(scenarioId).toArray(),
    listRoutes: (scenarioId) => repository.db.routes.where('scenarioId').equals(scenarioId).toArray(),
    listProjectScenarios: async (scenarioId) => {
      const scenario = await repository.db.scenarios.get(scenarioId);
      return scenario ? repository.db.scenarios.where('projectId').equals(scenario.projectId).toArray() : [];
    },
  }, saveStatus);

  const costing = new CostingApplicationService(createCostingContextQueries({
    getScenario: (id) => repository.db.scenarios.get(id),
    listServiceDays: (id) => repository.db.serviceDays.where('scenarioId').equals(id).toArray(),
    listBlockingScenarios: (id) => blocking.listBlockingScenarios(id),
    listTripProfiles: (id) => repository.listTripProfiles(id),
    getTripProfile: (id) => repository.getTripProfile(id),
    listTrips: listProfileTrips,
    listPatterns: listScenarioPatterns,
    listBlockingBlocks: (id) => blocking.listBlockingBlocks(id),
    listRoutes: (id) => repository.db.routes.where('scenarioId').equals(id).toArray(),
  }), repository, undefined, saveStatus);

  const plannedFrequencies = new PlannedFrequencyService(repository, undefined, saveStatus);

  createRoot(document.getElementById('root')!).render(<React.StrictMode><App service={routeDefinition} tripService={tripGeneration} blockingService={blocking} costingService={costing} plannedFrequencyService={plannedFrequencies} session={tabGuard} /></React.StrictMode>);
}

void start();
