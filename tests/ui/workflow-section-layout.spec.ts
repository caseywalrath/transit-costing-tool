import { expect, test } from '@playwright/test';

test('uses one header action layer and a right-docked Shift drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/fixtures/workflow-section-layout.html');

  const sections = page.locator('.workflow-section');
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  const tripsSection = page.locator('[aria-label="Trips section"]');
  const runtimeActions = runtimeSection.locator('.section-header-actions');
  const tripActions = tripsSection.locator('.section-header-actions');
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });

  await expect(sections).toHaveCount(2);
  await expect(runtimeActions.getByRole('button')).toHaveText(['Profile: Weekday ▾', 'Add', 'Actions ▾']);
  await expect(tripActions.getByRole('button')).toHaveText(['Profile: Default ▾', 'Actions ▾']);
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
