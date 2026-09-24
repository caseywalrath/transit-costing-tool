import { expect, test } from '@playwright/test';

test('database version 5 preserves a version 4 project and adds the lazy Costing store', async ({ page }) => {
  await page.goto('/src/styles.css');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('transit-costing-tool', 4);
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
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  });

  await page.goto('/');
  await expect(page.getByRole('option', { name: 'Migration Project' })).toBeAttached();
  const migrated = await page.evaluate(async () => new Promise<{ version: number; stores: string[]; projectCount: number; scenarioCount: number; assumptionsCount: number; legacyCostPlanCount: number }>((resolve, reject) => {
    const request = indexedDB.open('transit-costing-tool');
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(['projects', 'scenarios', 'costingAssumptions', 'costPlans'], 'readonly');
      const projects = transaction.objectStore('projects').count();
      const scenarios = transaction.objectStore('scenarios').count();
      const assumptions = transaction.objectStore('costingAssumptions').count();
      const legacyCostPlans = transaction.objectStore('costPlans').count();
      let projectCount = 0;
      let scenarioCount = 0;
      let assumptionsCount = 0;
      let legacyCostPlanCount = 0;
      transaction.onerror = () => { database.close(); reject(transaction.error); };
      projects.onsuccess = () => { projectCount = projects.result; };
      scenarios.onsuccess = () => { scenarioCount = scenarios.result; };
      assumptions.onsuccess = () => { assumptionsCount = assumptions.result; };
      legacyCostPlans.onsuccess = () => { legacyCostPlanCount = legacyCostPlans.result; };
      transaction.oncomplete = () => {
        resolve({ version: database.version, stores: [...database.objectStoreNames], projectCount, scenarioCount, assumptionsCount, legacyCostPlanCount });
        database.close();
      };
    };
    request.onerror = () => reject(request.error);
  }));

  expect(migrated.version).toBe(50);
  expect(migrated.stores).toContain('costingAssumptions');
  expect(migrated.stores).toContain('costPlans');
  expect(migrated.projectCount).toBe(1);
  expect(migrated.scenarioCount).toBe(1);
  expect(migrated.assumptionsCount).toBe(0);
  expect(migrated.legacyCostPlanCount).toBe(1);
});
