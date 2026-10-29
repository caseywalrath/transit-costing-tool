// Review package P05 (I-029, finding 5-002): this spec used to load a hand-written fixture whose button lists no longer matched the
// app. It now drives the real Trips tab and the real Shift drawer (UI-23, UI-27, D0018-04). UR-6c: Runtimes and Trips are work surfaces;
// the header actions sit inside the surface header, and the commands that need a selection moved to the selection bar.
import { expect, test } from '@playwright/test';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { runCommand, shiftBar } from './support/ui';

test.setTimeout(60_000);

test('uses one header action layer, and Shift opens in the selection bar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createShiftReadySchedule(page, '06:20');

  const sections = page.locator('.trips-workspace .work-surface');
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  const tripsSection = page.locator('[aria-label="Trips section"]');
  const runtimeActions = runtimeSection.locator('.work-surface__actions');
  const tripActions = tripsSection.locator('.work-surface__actions');

  await page.locator('.schedule-table tbody input[type="checkbox"]').first().check();
  await runCommand(page, 'trips.shift');
  const drawer = shiftBar(page);
  await expect(drawer).toBeVisible();

  await expect(sections).toHaveCount(2);
  // Runtimes (open): the Pattern selector is the header action; the profile menu and Actions are on the line below it (UR-14: no Close).
  await expect(runtimeSection.getByRole('button', { name: 'Runtimes', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await expect(runtimeActions.getByLabel('Pattern')).toBeVisible();
  await expect(runtimeSection.locator('.runtimes-toolbar').getByRole('button')).toHaveText(['Default ▾', '']);
  // Trips: the profile and Blocking scenario menus follow the title; View, Add trip, Build trips…, and Actions sit at the right.
  await expect(tripsSection.locator('.work-surface__context').getByRole('button')).toHaveText(['Default ▾', 'No blocking scenario ▾']);
  await expect(tripActions.getByRole('button')).toHaveText(['View ▾', 'Add trip', 'Build trips…', '']);
  await expect(tripActions.getByRole('button', { name: 'Build trips…', exact: true })).toHaveClass(/primary/);
  await expect(runtimeSection.locator('.runtime-editor-toolbar')).toHaveCount(0);
  await expect(tripsSection.locator('.trip-shift-tool')).toHaveCount(0);
  // U10, UR-15: the shift bar replaces the selection commands; step buttons name their size and direction, and step sizes are one press.
  await expect(drawer.getByRole('button')).toHaveText(['← 1 min earlier', '1 min later →', 'Undo', 'Redo', 'Discard', 'Done']);
  await expect(page.getByRole('toolbar', { name: 'Selected trips', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('radio')).toHaveCount(4);
  await expect(drawer.getByRole('radio', { name: '1', exact: true })).toBeChecked();
  await expect(drawer.getByLabel('Step minutes')).toHaveValue('1');

  const [runtimeSectionBox, runtimeTitleBox, runtimeActionsBox, tripsSectionBox, tripsTitleBox, tripActionsBox, drawerBox] = await Promise.all([
    runtimeSection.boundingBox(),
    runtimeSection.getByRole('heading', { name: 'Runtimes' }).boundingBox(),
    runtimeActions.boundingBox(),
    tripsSection.boundingBox(),
    tripsSection.getByRole('heading', { name: 'Trips' }).boundingBox(),
    tripActions.boundingBox(),
    drawer.boundingBox(),
  ]);
  expect(runtimeSectionBox).not.toBeNull();
  expect(runtimeTitleBox).not.toBeNull();
  expect(runtimeActionsBox).not.toBeNull();
  expect(tripsSectionBox).not.toBeNull();
  expect(tripsTitleBox).not.toBeNull();
  expect(tripActionsBox).not.toBeNull();
  expect(drawerBox).not.toBeNull();
  expect(runtimeActionsBox!.y).toBeLessThanOrEqual(runtimeTitleBox!.y + runtimeTitleBox!.height);
  expect(runtimeActionsBox!.x + runtimeActionsBox!.width).toBeLessThanOrEqual(runtimeSectionBox!.x + runtimeSectionBox!.width - 12);
  expect(tripActionsBox!.y).toBeLessThanOrEqual(tripsTitleBox!.y + tripsTitleBox!.height);
  expect(tripActionsBox!.x + tripActionsBox!.width).toBeLessThanOrEqual(tripsSectionBox!.x + tripsSectionBox!.width - 12);
  // UR-15: the shift bar sits inside the Trips section, directly above the table, and does not cover any row.
  const tableBox = await tripsSection.locator('.schedule-table').boundingBox();
  expect(drawerBox!.x).toBeGreaterThanOrEqual(tripsSectionBox!.x);
  expect(drawerBox!.x + drawerBox!.width).toBeLessThanOrEqual(tripsSectionBox!.x + tripsSectionBox!.width);
  expect(drawerBox!.y + drawerBox!.height).toBeLessThanOrEqual(tableBox!.y + 1);
  await expect(page.locator('aside.shift-drawer')).toHaveCount(0);
});
