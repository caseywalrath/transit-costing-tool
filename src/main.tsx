import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { DexieRouteDefinitionRepository } from './persistence/dexieRepository';
import { ProjectBackupService } from './persistence/backupRepository';
import { RouteDefinitionService } from './application/routeDefinitionService';
import { TripGenerationService } from './application/tripGenerationService';
import { BlockingApplicationService } from './application/blockingService';
import { DexieBlockingRepository } from './persistence/blockingRepository';
import { CostingApplicationService } from './application/costingService';

const repository = new DexieRouteDefinitionRepository();
const backup = new ProjectBackupService(
  (projectId) => repository.getProjectSnapshot(projectId),
  (snapshot) => repository.saveProjectSnapshot(snapshot),
);
const routeDefinition = new RouteDefinitionService(repository, backup);
const tripGeneration = new TripGenerationService(repository);
const blocking = new BlockingApplicationService(new DexieBlockingRepository(repository.db), {
  getTrip: (id) => repository.getTrip(id),
  listTrips: async (scenarioId, tripProfileId) => (await repository.db.trips.where('scenarioId').equals(scenarioId).toArray()).filter((trip) => trip.tripProfileId === tripProfileId),
  getTripProfile: (id) => repository.getTripProfile(id),
  listPatterns: (scenarioId) => repository.db.patterns.where('scenarioId').equals(scenarioId).toArray(),
});

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
}, repository);

createRoot(document.getElementById('root')!).render(<React.StrictMode><App service={routeDefinition} tripService={tripGeneration} blockingService={blocking} costingService={costing} /></React.StrictMode>);
