import { expect, test } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createShiftReadySchedule } from './support/tripsWorkspace';

// U09: the "Run times have changed" notice says why a Trip cannot be recalculated.
const reasonLine = (page: import('@playwright/test').Page) => page.locator('[aria-label="Trips section"]').getByText(/cannot be recalculated/);

async function reopenTrips(page: import('@playwright/test').Page) {
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
}

test('names why Trips cannot be recalculated, once, and shows nothing when they can be', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(3);
  await expect(page.getByText('Run times have changed')).toHaveCount(0);
  await expect(reasonLine(page)).toHaveCount(0);

  // The only band now ends at 6:05, so the 6:10 and 6:20 departures have no band. The 6:00 Trip can still be calculated.
  await runInPage(page, `const profile = (await e.db.runtimeProfiles.toArray())[0]; await e.db.runtimeProfiles.put({ ...profile, calculationRevision: (profile.calculationRevision ?? 0) + 1, bands: profile.bands.map((band) => ({ ...band, endTime: 6 * 3600 + 5 * 60 })) });`);
  await reopenTrips(page);
  await expect(page.getByText('Run times have changed')).toBeVisible();
  const line = reasonLine(page);
  await expect(line).toHaveCount(1);
  await expect(line).toHaveText('2 Trips cannot be recalculated. No Runtime band covers its first departure. Add or extend a Runtime band.');
  await expect(line.locator('xpath=..')).toHaveAttribute('role', 'status'); // the inline note that holds the text

  // Extending the band again leaves the Trips stale but calculable: the indicator stays and the reason line goes.
  await runInPage(page, `const profile = (await e.db.runtimeProfiles.toArray())[0]; await e.db.runtimeProfiles.put({ ...profile, calculationRevision: (profile.calculationRevision ?? 0) + 1, bands: profile.bands.map((band) => ({ ...band, endTime: 24 * 3600 })) });`);
  await reopenTrips(page);
  await expect(page.getByText('Run times have changed')).toBeVisible();
  await expect(reasonLine(page)).toHaveCount(0);
});

test('a Runtime change that every Trip can follow shows the indicator without a reason line', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await runtimeSection.getByLabel('Time band 1 segment 1').fill(':10');
  await runtimeSection.getByLabel('Time band 1 segment 1').press('Tab');
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Run times have changed')).toBeVisible();
  await expect(reasonLine(page)).toHaveCount(0);
});
