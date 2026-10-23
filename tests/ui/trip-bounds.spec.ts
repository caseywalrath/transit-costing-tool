// Review package P08. Staging a Shift that moves a Trip before 0:00 used to put negative times in the preview, and formatting one threw
// while React rendered, so the whole page went blank (I-012, findings 2-002 and 5-011). Build Trips by Last Trip ignored the
// 500-Trip limit (I-011, finding 2-001). The domain now refuses both.
import { expect, test } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createShiftReadySchedule } from './support/tripsWorkspace';

test('a Shift that would start a Trip before 0:00 is refused in the drawer, and the app stays usable', async ({ page }) => {
  await createShiftReadySchedule(page);
  // One Trip departs 6:00. Move it to 0:05 in storage so a six-minute Shift goes below 0:00.
  await runInPage(page, 'await e.db.trips.toCollection().modify((trip) => { trip.stopTimes = trip.stopTimes.map((point, index) => ({ ...point, time: 300 + index * 420 })); })');
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.schedule-table')).toContainText('0:05');

  const tripsSection = page.locator('[aria-label="Trips section"]');
  await page.locator('.schedule-table tbody input[type="checkbox"]').check();
  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  await expect(drawer).toBeVisible();

  // Six minutes earlier would be -0:01.
  await drawer.getByLabel('Shift minutes').fill('6');
  await drawer.getByRole('button', { name: '− Back' }).click();
  await expect(drawer.getByRole('alert')).toContainText('before 0:00');
  // The page is still there, the staged times did not change, and Done is unavailable until the Shift is valid.
  await expect(tripsSection.getByRole('button', { name: 'Trip actions', exact: true })).toBeVisible();
  await expect(page.locator('.schedule-table')).toContainText('0:05');
  await expect(drawer.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();

  // Five minutes earlier lands exactly on 0:00 and is allowed.
  await drawer.getByLabel('Shift minutes').fill('5');
  await drawer.getByRole('button', { name: '− Back' }).click();
  await expect(drawer.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.schedule-table')).toContainText('0:00');
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(drawer).toHaveCount(0);

  const stored = await runInPage(page, 'return (await e.db.trips.toArray()).flatMap((trip) => trip.stopTimes.map((point) => point.time))');
  expect(stored).toEqual([0, 420]);
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table')).toContainText('0:00');
});

test('Build Trips refuses a Last Trip that would create more than 500 Trips and stores none', async ({ page }) => {
  await createShiftReadySchedule(page);
  const tripsSection = page.locator('[aria-label="Trips section"]');
  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Build trips…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Build Trips' });
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  // A departure every minute from 0:00 to 23:59 is 1,440 Trips.
  await drawer.getByLabel('First Trip').fill('00:00');
  await drawer.getByLabel('Headway').fill('1');
  await drawer.getByLabel('Last Trip').fill('23:59');
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer.getByRole('alert')).toContainText('Enter 500 Trips or fewer.');
  await expect(drawer).toBeVisible();
  expect(await runInPage(page, 'return await e.db.trips.count()')).toBe(1);

  // 500 departures, one a minute from 0:00 to 8:19, is the most a request may build.
  await drawer.getByLabel('Last Trip').fill('08:19');
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect.poll(() => runInPage(page, 'return await e.db.trips.count()')).toBe(501);
});
