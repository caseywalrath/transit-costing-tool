// Decision 0073: a Trip written by the planner's last change is marked in the Trips table, and the mark goes when the schedule changes.
import { expect, test } from '@playwright/test';
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
