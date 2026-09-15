import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { DexieRouteDefinitionRepository } from './persistence/dexieRepository';
import { ProjectBackupService } from './persistence/backupRepository';
import { RouteDefinitionService } from './application/routeDefinitionService';
import { TripGenerationService } from './application/tripGenerationService';

const repository = new DexieRouteDefinitionRepository();
const backup = new ProjectBackupService(
  (projectId) => repository.getProjectSnapshot(projectId),
  (snapshot) => repository.saveProjectSnapshot(snapshot),
);
const routeDefinition = new RouteDefinitionService(repository, backup);
const tripGeneration = new TripGenerationService(repository);

createRoot(document.getElementById('root')!).render(<React.StrictMode><App service={routeDefinition} tripService={tripGeneration} /></React.StrictMode>);
