// UR-8 (HW-B, HW-X): with Show headways on, the Trips table adds a pinned Departs column after Pattern and marks the cells where a column's
// headway changes. The fixed duplicate heading row (Decision 0035) pins the same columns at the same offsets.
import { expect, test, type Page } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

test.setTimeout(120_000);

const grid = (page: Page) => page.locator('.trips-workspace .schedule-table');
const duplicateHeading = (page: Page) => page.getByRole('region', { name: 'Trips table headings while scrolling' });
const left = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => element.getBoundingClientRect().left);

test('Departs is shown only with headways, stays pinned, and lines up in the duplicate heading row after scrolling right', async ({ page }) => {
  // At 1024 px the golden table scrolls more than 600 px horizontally (at 1280 px it scrolls only about 370 px).
  await page.setViewportSize({ width: 1024, height: 800 });
  await openGoldenTrips(page);
  await expect(grid(page).locator('th.trip-departs-column')).toHaveCount(0);
  await expect(grid(page).locator('th.trip-pattern-column')).toHaveClass(/trip-pinned-last/);

  await runCommand(page, 'trips.toggleHeadways');
  const departsHeading = grid(page).locator('th.trip-departs-column');
  await expect(departsHeading).toHaveText('Departs');
  await expect(grid(page).locator('th.trip-pattern-column')).not.toHaveClass(/trip-pinned-last/);
  const firstDeparts = grid(page).locator('tbody td.trip-departs-column').first();
  await expect(firstDeparts).toHaveText(/^\d{1,2}:\d{2}$/);
  await expect(firstDeparts).toHaveCSS('font-weight', '700');

  // A changed headway is marked on at least one cell of the golden schedule.
  expect(await grid(page).locator('td.trip-headway-changed').count()).toBeGreaterThan(0);
  await expect(grid(page).locator('td.trip-headway-changed').first()).toHaveCSS('background-color', 'rgb(253, 243, 223)');

  // Scroll the page so the duplicate heading row appears, then scroll the table right by 600 px.
  const pinnedLeft = await left(page, '.trips-workspace .schedule-table th.trip-departs-column');
  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect(duplicateHeading(page)).toBeVisible();
  await grid(page).evaluate((element) => { element.scrollLeft = 600; });
  await expect.poll(() => duplicateHeading(page).evaluate((element) => element.scrollLeft)).toBe(600);

  const realCellLeft = await left(page, '.trips-workspace .schedule-table tbody td.trip-departs-column');
  const duplicateLeft = await duplicateHeading(page).locator('th.trip-departs-column').evaluate((element) => element.getBoundingClientRect().left);
  const duplicatePatternLeft = await duplicateHeading(page).locator('th.trip-pattern-column').evaluate((element) => element.getBoundingClientRect().left);
  const realPatternLeft = await left(page, '.trips-workspace .schedule-table tbody td.trip-pattern-column');
  expect(Math.abs(realCellLeft - pinnedLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(duplicateLeft - realCellLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(duplicatePatternLeft - realPatternLeft)).toBeLessThanOrEqual(1);

  await runCommand(page, 'trips.toggleHeadways');
  await expect(grid(page).locator('th.trip-departs-column')).toHaveCount(0);
});
