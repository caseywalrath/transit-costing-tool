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
import { DexieRestorePoints } from './persistence/restorePointPersistence';
import { RestorePointService } from './application/restorePointService';
import { BLOCKING_COVERAGE, GTFS_IMPORT_COVERAGE, PLANNED_FREQUENCY_COVERAGE, ROUTE_DEFINITION_COVERAGE, TRIP_GENERATION_COVERAGE, withRestorePoints, type RestorePointLookup } from './application/restorePointCoverage';
import { GtfsImportService } from './application/gtfs/gtfsImportService';
import { GtfsExportService } from './application/gtfsExport/gtfsExportService';

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
  // Decision 0081: the covered commands store a restore point in the same transaction as their write.
  const restorePoints = new DexieRestorePoints(repository.db, repository);
  const routeDefinitionCore = new RouteDefinitionService(repository, backup, undefined, saveStatus, protection);
  const restoreLookup: RestorePointLookup = {
    getTrip: (id) => repository.db.trips.get(id),
    getTripProfile: (id) => repository.db.tripProfiles.get(id),
    getRuntimeProfile: (id) => repository.db.runtimeProfiles.get(id),
    getPattern: (id) => repository.db.patterns.get(id),
    getRoute: (id) => repository.db.routes.get(id),
    getBlockingScenario: (id) => repository.db.blockingScenarios.get(id),
    getBlock: (id) => repository.db.blocks.get(id),
    getScenario: (id) => repository.db.scenarios.get(id),
    routeEditPreviewScope: (token) => routeDefinitionCore.routeEditPreviewScope(token),
  };
  const routeDefinition = withRestorePoints(routeDefinitionCore, ROUTE_DEFINITION_COVERAGE, restorePoints, restorePoints, saveStatus, restoreLookup);
  const tripGeneration = withRestorePoints(new TripGenerationService(repository, undefined, saveStatus), TRIP_GENERATION_COVERAGE, restorePoints, restorePoints, saveStatus, restoreLookup);
  const listProfileTrips = (scenarioId: string, tripProfileId: string) => repository.listTripsForScenarioProfile(scenarioId, tripProfileId);
  const listScenarioPatterns = (scenarioId: string) => repository.db.patterns.where('scenarioId').equals(scenarioId).toArray();
  const blocking = withRestorePoints(new BlockingApplicationService(new DexieBlockingRepository(repository.db), {
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
  }, saveStatus), BLOCKING_COVERAGE, restorePoints, restorePoints, saveStatus, restoreLookup);

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

  const plannedFrequencies = withRestorePoints(new PlannedFrequencyService(repository, undefined, saveStatus), PLANNED_FREQUENCY_COVERAGE, restorePoints, restorePoints, saveStatus, restoreLookup);
  // The GTFS import service. Its covered command is wired here, as the Route commands are, so that adding Routes takes a restore point.
  const gtfsImport = withRestorePoints(new GtfsImportService(repository, routeDefinitionCore, saveStatus), GTFS_IMPORT_COVERAGE, restorePoints, restorePoints, saveStatus, restoreLookup);
  // The GTFS export service (Decision 0090). It writes only the Scenario's remembered export settings, so it takes no restore point.
  const gtfsExport = new GtfsExportService(repository, saveStatus);
  const restoreService = new RestorePointService(restorePoints, restorePoints, {
    getScenarioRecords: (id) => repository.getScenarioRecords(id),
    saveScenarioRecords: (records) => repository.saveScenarioRecords(records),
    getProjectSnapshot: (id) => repository.getProjectSnapshot(id),
    saveProjectSnapshot: (snapshot) => repository.saveProjectSnapshot(snapshot),
    projectExists: async (id) => Boolean(await repository.db.projects.get(id)),
  }, saveStatus, () => routeDefinitionCore.forgetCopyUndos());

  createRoot(document.getElementById('root')!).render(<React.StrictMode><App service={routeDefinition} tripService={tripGeneration} blockingService={blocking} costingService={costing} plannedFrequencyService={plannedFrequencies} gtfsImportService={gtfsImport} gtfsExportService={gtfsExport} session={tabGuard} restorePoints={restoreService} /></React.StrictMode>);
}

void start();
