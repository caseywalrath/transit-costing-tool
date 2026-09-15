import { expect, test } from '@playwright/test';

test('keeps the Trips Pattern column no wider than its compact selector', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/fixtures/trip-table-layout.html');

  const patternColumn = page.locator('th.trip-pattern-column');
  const patternSelector = page.getByLabel('Trip pattern', { exact: true });
  const table = page.locator('.schedule-table table');
  const scrollRegion = page.locator('.schedule-table');

  const [columnBox, selectorBox, tableBox, regionBox, fontSize] = await Promise.all([
    patternColumn.boundingBox(),
    patternSelector.boundingBox(),
    table.boundingBox(),
    scrollRegion.boundingBox(),
    patternSelector.evaluate((element) => getComputedStyle(element).fontSize),
  ]);

  expect(columnBox).not.toBeNull();
  expect(selectorBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(regionBox).not.toBeNull();
  expect(columnBox!.width).toBeLessThanOrEqual(selectorBox!.width + 1);
  expect(selectorBox!.width).toBeLessThanOrEqual(96.5);
  expect(tableBox!.width).toBeLessThan(regionBox!.width);
  expect(fontSize).toBe('11.2px');
});

test('places an unsaved new trip before the saved schedule rows', async ({ page }) => {
  await page.goto('/tests/fixtures/trip-table-layout.html');

  const rows = page.locator('.schedule-table tbody > tr');

  await expect(rows.first()).toHaveClass(/draft-trip-row/);
  await expect(rows.first()).toContainText('New trip');
  await expect(rows.nth(1)).not.toHaveClass(/draft-trip-row/);
});
