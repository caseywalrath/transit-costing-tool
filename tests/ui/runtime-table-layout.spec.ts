import { expect, test } from '@playwright/test';

test('keeps From and To adjacent before the runtime segments', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/fixtures/runtime-table-layout.html');

  const fromHeader = page.getByRole('columnheader', { name: 'From' });
  const toHeader = page.getByRole('columnheader', { name: 'To' });
  const firstSegmentHeader = page.getByRole('columnheader', { name: /North Terminal/ });
  const fromField = page.getByLabel('From time');
  const toField = page.getByLabel('To time');
  const table = page.locator('.runtime-table table');
  const scrollRegion = page.locator('.runtime-table');

  const [fromHeaderBox, toHeaderBox, firstSegmentBox, fromFieldBox, toFieldBox, tableBox, regionBox, toBorderWidth] = await Promise.all([
    fromHeader.boundingBox(),
    toHeader.boundingBox(),
    firstSegmentHeader.boundingBox(),
    fromField.boundingBox(),
    toField.boundingBox(),
    table.boundingBox(),
    scrollRegion.boundingBox(),
    toHeader.evaluate((element) => getComputedStyle(element).borderRightWidth),
  ]);

  expect(fromHeaderBox).not.toBeNull();
  expect(toHeaderBox).not.toBeNull();
  expect(firstSegmentBox).not.toBeNull();
  expect(fromFieldBox).not.toBeNull();
  expect(toFieldBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(regionBox).not.toBeNull();
  expect(toHeaderBox!.x - (fromHeaderBox!.x + fromHeaderBox!.width)).toBeLessThanOrEqual(1);
  expect(toFieldBox!.x - (fromFieldBox!.x + fromFieldBox!.width)).toBeLessThanOrEqual(10);
  expect(firstSegmentBox!.x).toBeGreaterThan(toHeaderBox!.x);
  expect(toBorderWidth).toBe('10px');
  expect(fromFieldBox!.width).toBeLessThanOrEqual(62.5);
  expect(toFieldBox!.width).toBeLessThanOrEqual(62.5);
  expect(tableBox!.width).toBeLessThan(regionBox!.width);
});
