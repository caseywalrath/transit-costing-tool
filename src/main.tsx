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

createRoot(document.getElementById('root')!).render(<React.StrictMode><App service={routeDefinition} tripService={tripGeneration} blockingService={blocking} /></React.StrictMode>);
