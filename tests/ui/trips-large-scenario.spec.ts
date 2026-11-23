// The Trips tab showed "Use Build trips or Add trip" for every Route once a Scenario held more than about 3,600 Trips (a whole-feed import).
// There is no Trip limit: the table waited for the check of changed runtimes over every Trip of the service day, and that check read all
// runtime assignments once per Pattern. The table now draws as soon as its Trips are read, and the check no longer waits on it.
import { expect, test } from '@playwright/test';
import { capacityBackup } from './support/capacityFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(240_000);

test('Trips tab lists the Route trips of a 6,000-trip Scenario even while the changed-runtime check is still running', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await seedSnapshot(page, { ...capacityBackup({ tripsPerDay: 1500, blocksPerDay: 300 }), generationSets: [] });
  expect(await runInPage(page, 'return await e.db.trips.count()')).toBeGreaterThan(5000);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Route: / })).toBeVisible({ timeout: 120_000 });
  // Hold the changed-runtime check open: the table must not depend on it.
  await page.evaluate(`(async () => {
    const { TripGenerationService } = await import('/src/application/tripGenerationService.ts');
    TripGenerationService.prototype.inspectStaleTrips = () => new Promise(() => undefined);
  })()`);
  await page.locator('nav button', { hasText: /^Trips$/ }).click();
  // The empty-state message is one table row too, so wait for more than one row.
  await expect.poll(() => page.locator('.schedule-table tbody tr').count(), { timeout: 60_000 }).toBeGreaterThan(20);
  await expect(page.getByText('Use Build trips or Add trip to begin this schedule.')).toHaveCount(0);
});
