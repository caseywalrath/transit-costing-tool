// Shared in-browser bootstrap for Playwright specs that need real IndexedDB (review rule: Dexie-backed tests before P06).
// SETUP is evaluated inside the page (served by the Vite dev server) and returns make(dbName) -> repositories and services
// wired the way src/main.tsx wires them, on a named IndexedDB database, plus makeMemory() for in-memory parity checks.
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

export const DB_NAME = 'transit-costing-tool';

/** Runs `body` in the page with `e` bound to the app's repositories on the app's own database, then closes the handle. */
export function runInPage(page: import('@playwright/test').Page, body: string, arg?: unknown): Promise<any> {
  return page.evaluate(async ({ SETUP, DB_NAME, body, arg }) => {
    const env = await new Function(SETUP)();
    const e = env.make(DB_NAME);
    try { return await new Function('e', 'arg', `return (async()=>{${body}})()`)(e, arg); } finally { e.db.close(); }
  }, { SETUP, DB_NAME, body, arg });
}

/** Loads a Project snapshot into the app's database before the app starts. */
export async function seedSnapshot(page: import('@playwright/test').Page, snapshot: unknown): Promise<void> {
  await page.goto('/src/ui/styles/index.css');
  await runInPage(page, 'await e.repository.saveProjectSnapshot({ ...arg, generationSets: arg.generationSets ?? [] })', snapshot);
}
