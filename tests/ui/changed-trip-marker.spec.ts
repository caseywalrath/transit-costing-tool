// Decision 0073: a Trip written by the planner's last change is marked in the Trips table, and the mark goes when the schedule changes.
import { expect, test } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { chooseScope, runCommand, shiftBar } from './support/ui';

test('a Trip moved by a shift is marked at its new place, and the mark goes when the Day changes', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const rows = page.locator('.schedule-table tbody tr');
  // Wait for the three rows before selecting; under parallel load the selection can be pressed before they load.
  await expect(rows).toHaveCount(3);
  // Building the three Trips is a write, so their rows are marked until the next change.
  await expect(page.locator('.schedule-table tbody tr.row-moved')).toHaveCount(3);

  // The first Trip (6:00) moves 25 minutes later, past the Trips at 6:10 and 6:20.
  await rows.first().locator('input[type="checkbox"]').check();
  await runCommand(page, 'trips.shift');
  const drawer = shiftBar(page);
  await expect(drawer).toContainText('Shift 1 trip');
  await drawer.getByLabel('Step minutes').fill('25');
  await drawer.getByRole('button', { name: '25 min later', exact: true }).click();
  await expect(rows.first()).toContainText('Staged 25 minutes later');
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(drawer).toHaveCount(0);

  // The shifted Trip now starts at 6:25 and is the last row. It is the only marked row.
  const moved = page.locator('.schedule-table tbody tr', { hasText: '6:25' });
  await expect(moved).toHaveCount(1);
  await expect(moved).toHaveClass(/row-moved/);
  await expect(page.locator('.schedule-table tbody tr.row-moved')).toHaveCount(1);

  // Changing the Day clears the marks, so no row in the Trips table is marked.
  await chooseScope(page, 'Day', { label: 'Saturday' });
  await expect(page.locator('.schedule-table tbody tr.row-moved')).toHaveCount(0);
});

test('after a change to six or more trips, a status line counts them and steps, selects, and clears them (R7)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await createShiftReadySchedule(page, '06:20');
  // Twenty more trips, 10 minutes apart, so the table is taller than the window.
  await runInPage(page, `
    const [trip] = await e.db.trips.toArray();
    const more = Array.from({ length: 20 }, (_, index) => ({ ...trip, id: 'extra-' + index, stopTimes: trip.stopTimes.map((point) => ({ ...point, time: point.time + 3600 + index * 600 })) }));
    await e.db.trips.bulkPut(more);
    // A new runtime makes every trip need regenerating.
    const [profile] = await e.db.runtimeProfiles.toArray();
    await e.service.saveRuntimeProfile({ ...profile, bands: profile.bands.map((band) => ({ ...band, segmentRuntimeSeconds: band.segmentRuntimeSeconds.map(() => 600) })) });
  `);
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr:has(input[type="checkbox"])')).toHaveCount(23);
  await page.getByRole('checkbox', { name: 'Select all trips' }).check();
  await runCommand(page, 'trips.regenerate');
  const dialog = page.getByRole('dialog', { name: 'Regenerate selected trips' });
  await dialog.getByRole('button', { name: 'Regenerate 23 trips' }).click();
  await expect(dialog).toHaveCount(0);

  const bar = page.getByRole('toolbar', { name: 'Changed trips' }).first();
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('status')).toContainText('23 changed');
  await expect(bar.getByRole('status')).toContainText('below');
  await expect(page.locator('.schedule-table tbody tr.row-moved')).toHaveCount(23);

  // Next moves focus to a marked row further down.
  await bar.getByRole('button', { name: 'Next changed trip' }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('tr')?.classList.contains('row-moved') ?? false)).toBe(true);

  // Select turns the marks into a selection; the selection bar takes over.
  await bar.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Selected trips' }).first()).toContainText('23 trips selected');
  await page.getByRole('checkbox', { name: 'Select all trips' }).uncheck();

  // Clear removes the line and the marks.
  await page.getByRole('toolbar', { name: 'Changed trips' }).first().getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr.row-moved')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Changed trips' })).toHaveCount(0);
});
