// Review package P05 (I-029, finding 5-002): this spec used to load a hand-written fixture whose button lists no longer matched the
// app. It now drives the real Trips tab and the real Shift drawer (UI-23, UI-27, D0018-04).
import { expect, test } from '@playwright/test';
import { createShiftReadySchedule } from './support/tripsWorkspace';

test.setTimeout(60_000);

test('uses one header action layer and a right-docked Shift drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createShiftReadySchedule(page, '06:20');

  const sections = page.locator('.workflow-section');
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  const tripsSection = page.locator('[aria-label="Trips section"]');
  const runtimeActions = runtimeSection.locator('.section-header-actions');
  const tripActions = tripsSection.locator('.section-header-actions');

  await page.locator('.schedule-table tbody input[type="checkbox"]').first().check();
  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  await expect(drawer).toBeVisible();

  await expect(sections).toHaveCount(2);
  await expect(runtimeActions.getByRole('button')).toHaveText(['Default ▾', '']);
  await expect(tripActions.getByRole('button')).toHaveText(['Default ▾', 'No Blocking Scenario ▾', '']);
  await expect(runtimeSection.locator('.runtime-editor-toolbar')).toHaveCount(0);
  await expect(tripsSection.locator('.trip-shift-tool')).toHaveCount(0);
  await expect(drawer.getByRole('button')).toHaveText(['×', '− Back', '+ Forward', 'Undo', 'Redo', 'Discard', 'Done']);
  await expect(drawer.getByLabel('Shift minutes')).toHaveValue('1');

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
  expect(drawerBox!.width).toBe(380);
  expect(drawerBox!.x + drawerBox!.width).toBe(1280);
});
