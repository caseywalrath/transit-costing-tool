// A Trip's first time is edited in place and the Trip is recalculated around it, as when adding a Trip.
import { expect, test } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createShiftReadySchedule, openGoldenTrips } from './support/tripsWorkspace';

const rows = (page: import('@playwright/test').Page) => page.locator('.schedule-table tbody tr');

test('the first time edits in place, the later stops follow, and Escape or a bad time changes nothing', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const first = rows(page).first();
  const edit = first.getByRole('button', { name: /^Edit start time of/ });
  await expect(edit).toHaveText('6:00');
  await expect(first.locator('td.trip-timepoint-column').nth(1)).toHaveText('6:07');

  await edit.click();
  const field = first.getByRole('textbox', { name: 'Start time' });
  await expect(field).toHaveValue('6:00');
  await field.fill('6:05');
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(first.getByRole('button', { name: /^Edit start time of/ })).toHaveText('6:00');

  await first.getByRole('button', { name: /^Edit start time of/ }).click();
  await first.getByRole('textbox', { name: 'Start time' }).fill('soon');
  await page.keyboard.press('Enter');
  await expect(first.getByRole('alert')).toContainText('Enter a time such as');

  await first.getByRole('textbox', { name: 'Start time' }).fill('6:03');
  await page.keyboard.press('Enter');
  await expect(first.getByRole('textbox', { name: 'Start time' })).toHaveCount(0);
  await expect(first.locator('td.trip-timepoint-column').nth(0)).toContainText('6:03');
  await expect(first.locator('td.trip-timepoint-column').nth(1)).toHaveText('6:10');
  await expect.poll(() => runInPage(page, 'return (await e.db.trips.toArray()).map((trip) => trip.stopTimes.map((point) => point.time)).sort((a, b) => a[0] - b[0])[0]')).toEqual([6 * 3600 + 180, 6 * 3600 + 600]);
});

test('a trip in a block asks first, and Cancel changes nothing', async ({ page }) => {
  await openGoldenTrips(page);
  const row = rows(page).first();
  const edit = row.getByRole('button', { name: /^Edit start time of/ });
  const before = await runInPage(page, 'return JSON.stringify((await e.db.trips.toArray()).map((trip) => trip.stopTimes[0].time).sort((a, b) => a - b))');
  await edit.click();
  const field = row.getByRole('textbox', { name: 'Start time' });
  const current = await field.inputValue();
  const [hours, minutes] = current.split(':').map(Number);
  await field.fill(`${hours}:${String((minutes + 1) % 60).padStart(2, '0')}`);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Change start time?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/block/);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await runInPage(page, 'return JSON.stringify((await e.db.trips.toArray()).map((trip) => trip.stopTimes[0].time).sort((a, b) => a - b))')).toBe(before);
});

test('confirming the change in a block saves the new first time', async ({ page }) => {
  await openGoldenTrips(page);
  const row = rows(page).first();
  const firsts = () => runInPage(page, 'return (await e.db.trips.toArray()).map((trip) => trip.stopTimes[0].time).sort((a, b) => a - b)') as Promise<number[]>;
  const before = await firsts();
  await row.getByRole('button', { name: /^Edit start time of/ }).click();
  const field = row.getByRole('textbox', { name: 'Start time' });
  const [hours, minutes] = (await field.inputValue()).split(':').map(Number);
  await field.fill(`${hours}:${String((minutes + 1) % 60).padStart(2, '0')}`);
  await page.keyboard.press('Enter');
  await page.getByRole('dialog', { name: 'Change start time?' }).getByRole('button', { name: 'Change start time' }).click();
  await expect(page.getByRole('dialog', { name: 'Change start time?' })).toHaveCount(0);
  await expect.poll(async () => (await firsts()).filter((time, index) => time !== before[index]).length).toBe(1);
});
