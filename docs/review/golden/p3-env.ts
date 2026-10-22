// Shared in-browser bootstrap for Phase 3 Dexie specs. SETUP is evaluated in the page
// (Vite dev server) and returns make(dbName) -> repositories and services wired the
// way src/main.tsx wires them, but on a named IndexedDB database.
export const SETUP = `return (async () => {
  const [{ TransitDatabase }, { DexieRouteDefinitionRepository }, { InMemoryRouteDefinitionRepository }, { DexieBlockingRepository, InMemoryBlockingRepository }, { ProjectBackupService }, { RouteDefinitionService }, { TripGenerationService }, { BlockingApplicationService }] = await Promise.all([
    import('/src/persistence/database.ts'), import('/src/persistence/dexieRepository.ts'), import('/src/persistence/inMemoryRepository.ts'), import('/src/persistence/blockingRepository.ts'), import('/src/persistence/backupRepository.ts'), import('/src/application/routeDefinitionService.ts'), import('/src/application/tripGenerationService.ts'), import('/src/application/blockingService.ts'),
  ]);
  const Dexie = Object.getPrototypeOf(TransitDatabase);
  function make(name) {
    const repository = new DexieRouteDefinitionRepository(new TransitDatabase(name));
    const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (s) => repository.saveProjectSnapshot(s));
    const service = new RouteDefinitionService(repository, backup);
    const trips = new TripGenerationService(repository);
    const blockingRepository = new DexieBlockingRepository(repository.db);
    const blocking = new BlockingApplicationService(blockingRepository, {
      getTrip: (id) => repository.getTrip(id),
      listTrips: async (scenarioId, tripProfileId) => (await repository.db.trips.where('scenarioId').equals(scenarioId).toArray()).filter((t) => t.tripProfileId === tripProfileId),
      getTripProfile: (id) => repository.getTripProfile(id),
      listPatterns: (scenarioId) => repository.db.patterns.where('scenarioId').equals(scenarioId).toArray(),
    });
    const counts = async () => { const out = {}; for (const t of repository.db.tables) out[t.name] = await t.count(); return out; };
    return { db: repository.db, repository, backup, service, trips, blockingRepository, blocking, counts };
  }
  function makeMemory() {
    const repository = new InMemoryRouteDefinitionRepository();
    const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (s) => repository.saveProjectSnapshot(s));
    return { repository, backup, service: new RouteDefinitionService(repository, backup), trips: new TripGenerationService(repository) };
  }
  return { make, makeMemory, Dexie, TransitDatabase, InMemoryBlockingRepository };
})();`;
