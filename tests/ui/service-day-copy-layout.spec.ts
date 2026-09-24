import { expect, test } from '@playwright/test';

test('uses unified Runtime and Trips header action layers', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/fixtures/service-day-copy-layout.html');

  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  const tripsSection = page.locator('[aria-label="Trips section"]');
  const runtimeActions = runtimeSection.locator('.section-header-actions');
  const tripActions = tripsSection.locator('.section-header-actions');

  await expect(runtimeActions.getByRole('button')).toHaveText(['Profile: Weekday ▾', 'Add', 'Discard', 'Save', '']);
  await expect(tripActions.getByRole('button')).toHaveText(['Profile: Default ▾', '']);
  await expect(runtimeSection.locator('.runtime-editor-toolbar')).toHaveCount(0);
  await expect(tripsSection.locator('.more-actions')).toHaveCount(0);

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
