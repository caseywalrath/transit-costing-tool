// Review package P05 (I-029, finding 5-002): this spec used to load a hand-written fixture whose button lists no longer matched the
// app, so it could not fail when the app changed. It now drives the real Trips tab (UI-23, UI-27, D0018-04).
import { expect, test } from '@playwright/test';
import { createShiftReadySchedule } from './support/tripsWorkspace';

test.setTimeout(60_000);

test('uses unified Runtime and Trips header action layers', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createShiftReadySchedule(page);

  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  const tripsSection = page.locator('[aria-label="Trips section"]');
  const runtimeActions = runtimeSection.locator('.section-header-actions');
  const tripActions = tripsSection.locator('.section-header-actions');

  await expect(runtimeActions.getByRole('button')).toHaveText(['Default ▾', '']);
  await expect(runtimeActions.getByRole('button', { name: 'Runtime actions', exact: true })).toBeVisible();
  await expect(tripActions.getByRole('button')).toHaveText(['Default ▾', 'No Blocking Scenario ▾', '']);
  await expect(tripActions.getByRole('button', { name: 'Trip actions', exact: true })).toBeVisible();
  await expect(runtimeSection.locator('.runtime-editor-toolbar')).toHaveCount(0);
  await expect(tripsSection.locator('.more-actions')).toHaveCount(0);

  // An unsaved Runtime edit adds Discard and Save to the same header layer, not to a second toolbar.
  await runtimeSection.getByLabel('Time band 1 segment 1').fill(':09');
  await runtimeSection.getByLabel('Time band 1 segment 1').press('Tab');
  await expect(runtimeActions.getByRole('button')).toHaveText(['Default ▾', 'Discard', 'Save', '']);
  await expect(runtimeSection.locator('.runtime-editor-toolbar')).toHaveCount(0);

  const [runtimeTitleBox, runtimeActionsBox, runtimeSectionBox, tripsTitleBox, tripActionsBox, tripsSectionBox] = await Promise.all([
    runtimeSection.getByRole('heading', { name: 'Runtimes' }).boundingBox(),
    runtimeActions.boundingBox(),
    runtimeSection.boundingBox(),
    tripsSection.getByRole('heading', { name: 'Trips' }).boundingBox(),
    tripActions.boundingBox(),
    tripsSection.boundingBox(),
  ]);
  expect(runtimeTitleBox).not.toBeNull();
  expect(runtimeActionsBox).not.toBeNull();
  expect(runtimeSectionBox).not.toBeNull();
  expect(tripsTitleBox).not.toBeNull();
  expect(tripActionsBox).not.toBeNull();
  expect(tripsSectionBox).not.toBeNull();
  expect(runtimeActionsBox!.y).toBeLessThanOrEqual(runtimeTitleBox!.y + runtimeTitleBox!.height);
  expect(runtimeActionsBox!.x + runtimeActionsBox!.width).toBeLessThanOrEqual(runtimeSectionBox!.x + runtimeSectionBox!.width - 12);
  expect(tripActionsBox!.y).toBeLessThanOrEqual(tripsTitleBox!.y + tripsTitleBox!.height);
  expect(tripActionsBox!.x + tripActionsBox!.width).toBeLessThanOrEqual(tripsSectionBox!.x + tripsSectionBox!.width - 12);
});
