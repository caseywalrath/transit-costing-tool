import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { DexieRouteDefinitionRepository } from './persistence/dexieRepository';
import { TransitDatabase } from './persistence/database';
import { TabGuard } from './persistence/tabGuard';
import { ProjectBackupService } from './persistence/backupRepository';
import { RouteDefinitionService } from './application/routeDefinitionService';
import { TripGenerationService } from './application/tripGenerationService';
import { BlockingApplicationService } from './application/blockingService';
import { DexieBlockingRepository } from './persistence/blockingRepository';
import { CostingApplicationService } from './application/costingService';
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
  const blocking = new BlockingApplicationService(new DexieBlockingRepository(repository.db), {
    getTrip: (id) => repository.getTrip(id),
    listTrips: async (scenarioId, tripProfileId) => (await repository.db.trips.where('scenarioId').equals(scenarioId).toArray()).filter((trip) => trip.tripProfileId === tripProfileId),
    getTripProfile: (id) => repository.getTripProfile(id),
    listPatterns: (scenarioId) => repository.db.patterns.where('scenarioId').equals(scenarioId).toArray(),
  }, saveStatus);

  const costing = new CostingApplicationService({
    listBlockingScenarios: (scenarioId) => blocking.listBlockingScenarios(scenarioId),
    getCostingCalculationContext: async (scenarioId, blockingScenarioId) => {
      const [scenario, serviceDays, blockingScenarios] = await Promise.all([
        repository.db.scenarios.get(scenarioId),
        repository.db.serviceDays.where('scenarioId').equals(scenarioId).toArray(),
        blocking.listBlockingScenarios(scenarioId),
      ]);
      const blockingScenario = blockingScenarios.find((candidate) => candidate.id === blockingScenarioId);
      if (!scenario || !blockingScenario) return undefined;
      const [tripProfile, trips, blocks] = await Promise.all([
        repository.getTripProfile(blockingScenario.tripProfileId),
        repository.db.trips.where('scenarioId').equals(scenarioId).toArray().then((values) => values.filter((trip) => trip.tripProfileId === blockingScenario.tripProfileId)),
        blocking.listBlockingBlocks(blockingScenario.id),
      ]);
      if (!tripProfile) return undefined;
      const blockSummaries = (await Promise.all(blocks.map((block) => blocking.getBlockSummary(blockingScenario.id, block.id)))).filter((summary): summary is NonNullable<typeof summary> => Boolean(summary));
      return { scenario, serviceDays, blockingScenario, tripProfile, trips, blocks, blockSummaries };
    },
  }, repository, undefined, saveStatus);

  createRoot(document.getElementById('root')!).render(<React.StrictMode><App service={routeDefinition} tripService={tripGeneration} blockingService={blocking} costingService={costing} /></React.StrictMode>);
}

void start();
