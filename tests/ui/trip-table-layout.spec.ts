// Review package P05 (I-006, I-029, finding 5-001 and 5-002). These specs drive the real Trips tab. They previously loaded a
// hand-written fixture and asserted a nested schedule scroller that Decision 0035 item 5 forbids. Trips keeps normal page-level
// vertical scrolling; a fixed duplicate heading row appears once the real headings scroll above the viewport.
import { expect, test, type Page } from '@playwright/test';
import { createShiftReadySchedule, openGoldenTrips, settleFrames } from './support/tripsWorkspace';

test.setTimeout(90_000);

/** The real grid, not the fixed duplicate heading row (which carries the same `schedule-table` class). */
const grid = (page: Page) => page.locator('.trips-workspace .schedule-table');
const duplicateHeading = (page: Page) => page.getByRole('region', { name: 'Trips table headings while scrolling' });
const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test('keeps the Trips Pattern column no wider than its compact selector', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await createShiftReadySchedule(page, '06:20');

  const patternColumn = page.locator('.trips-workspace th.trip-pattern-column');
  const patternSelector = page.getByLabel('Trip pattern', { exact: true }).first();
  const table = grid(page).locator('table');

  const [columnBox, selectorBox, tableBox, regionBox, fontSize] = await Promise.all([
    patternColumn.boundingBox(),
    patternSelector.boundingBox(),
    table.boundingBox(),
    grid(page).boundingBox(),
    patternSelector.evaluate((element) => getComputedStyle(element).fontSize),
  ]);

  expect(columnBox).not.toBeNull();
  expect(selectorBox).not.toBeNull();
  expect(tableBox).not.toBeNull();
  expect(regionBox).not.toBeNull();
  expect(columnBox!.width).toBeLessThanOrEqual(selectorBox!.width + 1);
  expect(selectorBox!.width).toBeLessThanOrEqual(96.5);
  // A short schedule must use its content width rather than stretching across the scroll region.
  expect(tableBox!.width).toBeLessThan(regionBox!.width);
  expect(fontSize).toBe('12px');
});

test('places an unsaved new trip before the saved schedule rows', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Add trip…' }).click();

  const rows = grid(page).locator('tbody > tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toHaveClass(/draft-trip-row/);
  await expect(rows.first().getByLabel('New trip pattern')).toBeVisible();
  await expect(rows.first().getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(rows.first().getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await expect(rows.nth(1)).not.toHaveClass(/draft-trip-row/);
  await expect(rows.nth(1).getByRole('checkbox')).toBeVisible();
  await expect(rows.nth(2)).not.toHaveClass(/draft-trip-row/);
});

test('shows a fixed duplicate heading row at page level while the real headings are scrolled away', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGoldenTrips(page);

  // Decision 0035 item 5: the grid is not a vertical scroller; the page scrolls. (`overflow-y: visible` computes to `auto` beside
  // `overflow-x: auto`, so the check is that the grid has no height cap and nothing to scroll vertically.)
  await expect(grid(page)).toHaveCSS('max-height', 'none');
  expect(await grid(page).evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeGreaterThan(2000);
  await expect(duplicateHeading(page)).toHaveCount(0);

  const realHeadings = grid(page).locator('thead th');
  const headingText = await realHeadings.allTextContents();
  expect(headingText.length).toBeGreaterThan(15);

  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect.poll(() => scrollY(page)).toBe(1500);
  await expect(duplicateHeading(page)).toBeVisible();
  const heading = duplicateHeading(page);
  await expect(heading).toHaveCSS('position', 'fixed');
  expect(Math.abs((await heading.boundingBox())!.y)).toBeLessThanOrEqual(1);
  // Same column headings, in the same order and at the same widths as the real grid.
  await expect(heading.locator('thead th')).toHaveText(headingText);
  const clonedWidths = await heading.locator('thead th').evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  const realWidths = await realHeadings.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  expect(clonedWidths.length).toBe(realWidths.length);
  clonedWidths.forEach((width, index) => expect(Math.abs(width - realWidths[index]!)).toBeLessThanOrEqual(1));

  // Horizontal scrolling stays synchronized in both directions.
  expect(await grid(page).evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await grid(page).evaluate((element) => { element.scrollLeft = 160; });
  await expect.poll(() => heading.evaluate((element) => element.scrollLeft)).toBe(160);
  await heading.evaluate((element) => { element.scrollLeft = 80; });
  await expect.poll(() => grid(page).evaluate((element) => element.scrollLeft)).toBe(80);

  // Scrolling back so the real headings are in view removes the duplicate.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(duplicateHeading(page)).toHaveCount(0);
});

test('restores the page and horizontal grid position after committing a Shift', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGoldenTrips(page);

  await grid(page).locator('tbody input[type="checkbox"]').nth(60).check();
  const shiftedRow = grid(page).locator('tbody tr').nth(60);
  const rowBefore = await shiftedRow.innerText();
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  await drawer.getByRole('button', { name: /min later/ }).click();
  await expect(page.getByText('Staged 1 minute later')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 2400));
  await grid(page).evaluate((element) => { element.scrollLeft = 140; });
  await expect.poll(() => scrollY(page)).toBe(2400);
  await expect.poll(() => grid(page).evaluate((element) => element.scrollLeft)).toBe(140);

  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText('Staged 1 minute later')).toHaveCount(0);
  // The shifted Trip's times changed, so the Trips have reloaded; the app restores the positions two frames later.
  await expect(shiftedRow).not.toHaveText(rowBefore);
  await settleFrames(page);
  expect(await scrollY(page)).toBe(2400);
  expect(await grid(page).evaluate((element) => element.scrollLeft)).toBe(140);
});
