import { expect, test } from '@playwright/test';

// IndexedDB stores Dexie's version times ten, so Dexie version 4 is IndexedDB version 40. Seeding version 4 would be Dexie 0.4, which
// runs every upgrade from version 1 (review finding 3-014): the Default Trip profile would be created and the Block discarded.
test('database version 9 preserves a Dexie version 4 project and adds operational stores', async ({ page }) => {
  await page.goto('/src/ui/styles/index.css');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('transit-costing-tool', 40);
      request.onupgradeneeded = () => {
        const database = request.result;
        const names = [
          'projects', 'scenarios', 'serviceDays', 'routes', 'nodes', 'patterns', 'directions',
          'runtimeProfiles', 'runtimeAssignments', 'generationSets', 'tripProfiles', 'blockingScenarios',
          'trips', 'blocks', 'costPlans', 'appMetadata',
        ];
        for (const name of names) database.createObjectStore(name, { keyPath: name === 'appMetadata' ? 'key' : 'id' });
        const now = '2026-01-01T00:00:00.000Z';
        request.transaction!.objectStore('projects').put({ id: 'migration-project', name: 'Migration Project', distanceUnit: 'miles', currencyCode: 'USD', createdAt: now, updatedAt: now });
        request.transaction!.objectStore('scenarios').put({ id: 'migration-scenario', projectId: 'migration-project', name: 'Migration Scenario', createdAt: now, updatedAt: now });
        request.transaction!.objectStore('costPlans').put({ id: 'legacy-cost-plan', scenarioId: 'migration-scenario', name: 'Legacy draft' });
        // A normalized Block of a version 4 database: the version 4 upgrade has already run, so it must not run again.
        request.transaction!.objectStore('blockingScenarios').put({ id: 'migration-blocking', scenarioId: 'migration-scenario', tripProfileId: 'migration-profile', name: 'Blocks', createdAt: now, updatedAt: now });
        request.transaction!.objectStore('blocks').put({ id: 'migration-block', scenarioId: 'migration-scenario', blockingScenarioId: 'migration-blocking', serviceDayId: 'migration-day', label: '1', activities: [], createdAt: now, updatedAt: now });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  });

  await page.goto('/');
  await expect(page.getByRole('option', { name: 'Migration Project' })).toBeAttached();
  const migrated = await page.evaluate(async () => new Promise<{ version: number; stores: string[]; projectCount: number; scenarioCount: number; assumptionsCount: number; undoCount: number; legacyCostPlanCount: number; tripProfileCount: number; blockCount: number }>((resolve, reject) => {
    const request = indexedDB.open('transit-costing-tool');
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['projects', 'scenarios', 'costingAssumptions', 'tripRegenerationUndo', 'costPlans', 'tripProfiles', 'blocks'], 'readonly');
      const projects = transaction.objectStore('projects').count();
      const scenarios = transaction.objectStore('scenarios').count();
      const assumptions = transaction.objectStore('costingAssumptions').count();
      const undo = transaction.objectStore('tripRegenerationUndo').count();
      const legacyCostPlans = transaction.objectStore('costPlans').count();
      const tripProfiles = transaction.objectStore('tripProfiles').count();
      const blocks = transaction.objectStore('blocks').count();
      let projectCount = 0;
      let scenarioCount = 0;
      let assumptionsCount = 0;
      let undoCount = 0;
      let legacyCostPlanCount = 0;
      let tripProfileCount = 0;
      let blockCount = 0;
      transaction.onerror = () => { database.close(); reject(transaction.error); };
      projects.onsuccess = () => { projectCount = projects.result; };
      scenarios.onsuccess = () => { scenarioCount = scenarios.result; };
      assumptions.onsuccess = () => { assumptionsCount = assumptions.result; };
      undo.onsuccess = () => { undoCount = undo.result; };
      legacyCostPlans.onsuccess = () => { legacyCostPlanCount = legacyCostPlans.result; };
      tripProfiles.onsuccess = () => { tripProfileCount = tripProfiles.result; };
      blocks.onsuccess = () => { blockCount = blocks.result; };
      transaction.oncomplete = () => {
        resolve({ version: database.version, stores: [...database.objectStoreNames], projectCount, scenarioCount, assumptionsCount, undoCount, legacyCostPlanCount, tripProfileCount, blockCount });
        database.close();
      };
    };
    request.onerror = () => reject(request.error);
  }));

  expect(migrated.version).toBe(90);
  expect(migrated.stores).toContain('costingAssumptions');
  expect(migrated.stores).toContain('costPlans');
  expect(migrated.stores).toContain('tripRegenerationUndo');
  expect(migrated.projectCount).toBe(1);
  expect(migrated.scenarioCount).toBe(1);
  expect(migrated.assumptionsCount).toBe(0);
  expect(migrated.undoCount).toBe(0);
  expect(migrated.legacyCostPlanCount).toBe(1);
  // A real version 4 database skips the version 3 and 4 upgrades.
  expect(migrated.tripProfileCount).toBe(0);
  expect(migrated.blockCount).toBe(1);
});
