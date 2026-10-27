// Review package P05 (finding 5-002). This spec stays on a fixture, reduced to the geometry that Decision 0013 permits: it measures how
// the shared styles lay out the Runtime grid's From and To cells. It does not claim the app renders these columns; the real Runtime
// section is covered by runtime-grid.spec.ts, service-day-copy-layout.spec.ts, and unified-action-layer.spec.ts.
// UR-7 made the cells borderless grid cells: the old checks (field width at most 62.5 px, a 10 px border after To) became a cell width
// of at most 70.5 px and a 1 px column rule. From and To stay adjacent, the segments follow To, and the table fits its region.
import { expect, test } from '@playwright/test';

test('keeps From and To adjacent before the runtime segments', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/tests/fixtures/runtime-table-layout.html');

  const fromHeader = page.getByRole('columnheader', { name: 'From' });
  const toHeader = page.getByRole('columnheader', { name: 'To' });
  const firstSegmentHeader = page.getByRole('columnheader', { name: /North Terminal/ });
  const fromCell = page.locator('[data-cell="From time"]');
  const toCell = page.locator('[data-cell="To time"]');
  const table = page.locator('.runtime-table table');
  const scrollRegion = page.locator('.runtime-table');

  const [fromHeaderBox, toHeaderBox, firstSegmentBox, fromCellBox, toCellBox, tableBox, regionBox, toRuleWidth] = await Promise.all([
    fromHeader.boundingBox(),
    toHeader.boundingBox(),
    firstSegmentHeader.boundingBox(),
    fromCell.boundingBox(),
    toCell.boundingBox(),
    table.boundingBox(),
    scrollRegion.boundingBox(),
    toCell.evaluate((element) => getComputedStyle(element).borderRightWidth),
  ]);

  expect(fromHeaderBox).not.toBeNull();
  expect(toHeaderBox).not.toBeNull();
  expect(firstSegmentBox).not.toBeNull();
  expect(fromCellBox).not.toBeNull();
  expect(toCellBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(regionBox).not.toBeNull();
  expect(toHeaderBox!.x - (fromHeaderBox!.x + fromHeaderBox!.width)).toBeLessThanOrEqual(1);
  expect(toCellBox!.x - (fromCellBox!.x + fromCellBox!.width)).toBeLessThanOrEqual(1);
  expect(firstSegmentBox!.x).toBeGreaterThan(toHeaderBox!.x);
  expect(toRuleWidth).toBe('1px');
  expect(fromCellBox!.width).toBeLessThanOrEqual(70.5);
  expect(toCellBox!.width).toBeLessThanOrEqual(70.5);
  expect(tableBox!.width).toBeLessThan(regionBox!.width);
});
