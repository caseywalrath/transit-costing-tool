// Review package P05 (I-029, finding 5-002): this spec used to load a hand-written fixture whose button lists no longer matched the
// app, so it could not fail when the app changed. It now drives the real Trips tab (UI-23, UI-27, D0018-04). UR-6c: the Runtime and Trip
// actions sit in the header of their work surfaces; an unsaved Runtime edit adds a save bar at the bottom of the Runtimes section.
import { expect, test } from '@playwright/test';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { editRuntimeCell } from './support/ui';

test.setTimeout(60_000);

test('uses unified Runtime and Trips header action layers', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createShiftReadySchedule(page);

  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  const tripsSection = page.locator('[aria-label="Trips section"]');
  const runtimeHeader = runtimeSection.locator('.work-surface__header');
  const runtimeActions = runtimeSection.locator('.work-surface__actions');
  const tripActions = tripsSection.locator('.work-surface__actions');

  await expect(runtimeHeader.getByRole('button', { name: 'Runtimes', exact: true })).toBeVisible();
  await expect(runtimeSection.getByRole('button', { name: 'Runtime actions', exact: true })).toBeVisible();
  await expect(tripActions.getByRole('button', { name: 'Trip actions', exact: true })).toBeVisible();
  await expect(tripsSection.locator('.work-surface__context').getByRole('button')).toHaveText(['Default ▾', 'Default ▾']);
  await expect(runtimeSection.locator('.runtime-editor-toolbar')).toHaveCount(0);
  await expect(tripsSection.locator('.more-actions')).toHaveCount(0);
  await expect(runtimeSection.getByRole('region', { name: 'Unsaved changes' })).toHaveCount(0);

  // An unsaved Runtime edit adds Discard and Save to a save bar at the bottom of the section, not to a second toolbar in the header.
  await editRuntimeCell(runtimeSection, 'Time band 1 segment 1', ':09');
  const saveBar = runtimeSection.getByRole('region', { name: 'Unsaved changes' });
  await expect(saveBar.getByRole('button')).toHaveText(['Discard', 'Save']);
  await expect(runtimeSection.locator('.runtime-editor-toolbar')).toHaveCount(0);
  await expect(runtimeHeader.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

  const [runtimeTitleBox, runtimeActionsBox, runtimeSectionBox, tripsTitleBox, tripActionsBox, tripsSectionBox, saveBarBox] = await Promise.all([
    runtimeSection.getByRole('heading', { name: 'Runtimes' }).boundingBox(),
    runtimeActions.boundingBox(),
    runtimeSection.boundingBox(),
    tripsSection.getByRole('heading', { name: 'Trips' }).boundingBox(),
    tripActions.boundingBox(),
    tripsSection.boundingBox(),
    saveBar.boundingBox(),
  ]);
  expect(runtimeTitleBox).not.toBeNull();
  expect(runtimeActionsBox).not.toBeNull();
  expect(runtimeSectionBox).not.toBeNull();
  expect(tripsTitleBox).not.toBeNull();
  expect(tripActionsBox).not.toBeNull();
  expect(tripsSectionBox).not.toBeNull();
  expect(saveBarBox).not.toBeNull();
  expect(runtimeActionsBox!.y).toBeLessThanOrEqual(runtimeTitleBox!.y + runtimeTitleBox!.height);
  expect(runtimeActionsBox!.x + runtimeActionsBox!.width).toBeLessThanOrEqual(runtimeSectionBox!.x + runtimeSectionBox!.width - 12);
  expect(tripActionsBox!.y).toBeLessThanOrEqual(tripsTitleBox!.y + tripsTitleBox!.height);
  expect(tripActionsBox!.x + tripActionsBox!.width).toBeLessThanOrEqual(tripsSectionBox!.x + tripsSectionBox!.width - 12);
  // The save bar is the last thing in the Runtimes section.
  expect(saveBarBox!.y + saveBarBox!.height).toBeGreaterThan(runtimeSectionBox!.y + runtimeSectionBox!.height - 4);
});
