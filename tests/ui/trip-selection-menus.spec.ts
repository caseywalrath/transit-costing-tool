// UR-9 (SEL-1, SEL-2): the select menu beside the header checkbox, and the menu on each Pattern chip. A choice replaces the selection; Ctrl or
// ⌘ adds to it. Every change goes through the staged-Shift check.
import { expect, test, type Page } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

test.setTimeout(120_000);

const grid = (page: Page) => page.locator('.trips-workspace .schedule-table');
const selected = (page: Page) => grid(page).locator('tbody tr.trip-row-selected');
const headerMenu = (page: Page) => page.getByRole('menu', { name: 'Select trips by…' });
const openHeaderMenu = async (page: Page) => {
  await grid(page).getByRole('button', { name: 'Select trips by…', exact: true }).click();
  await expect(headerMenu(page)).toBeVisible();
};
const countIn = (label: string) => Number(/\((\d+)\)$/.exec(label)?.[1]);

test('selects by pattern, adds a second pattern with Ctrl, inverts, and uses the chip menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openGoldenTrips(page);
  await expect(selected(page)).toHaveCount(0);

  // The header checkbox still toggles everything; the caret opens the menu.
  const headerBox = grid(page).locator('thead').getByRole('checkbox', { name: 'Select all trips' });
  await headerBox.check();
  await expect(selected(page)).toHaveCount(138);
  await headerBox.uncheck();
  await expect(selected(page)).toHaveCount(0);

  await openHeaderMenu(page);
  const labels = await headerMenu(page).getByRole('menuitem').allTextContents();
  expect(labels.slice(0, 3)).toEqual(['Select all (138)', 'Select none', 'Invert selection']);
  expect(labels.at(-2)).toMatch(/^Not assigned to a block \(\d+\)$/);
  expect(labels.at(-1)).toMatch(/^Run times have changed \(\d+\)$/);
  const patternLabels = labels.filter((label) => /\(\d+\)$/.test(label)).slice(1, -2);
  expect(patternLabels.length).toBeGreaterThanOrEqual(2);
  expect(patternLabels.map(countIn).reduce((sum, count) => sum + count, 0)).toBe(138);
  expect(patternLabels.map(countIn)).toContain(65);

  // Choosing a pattern replaces the selection.
  const big = patternLabels.find((label) => countIn(label) === 65)!;
  await headerMenu(page).getByRole('menuitem', { name: big, exact: true }).click();
  await expect(selected(page)).toHaveCount(65);

  // Ctrl adds a second pattern.
  const other = patternLabels.find((label) => label !== big)!;
  await openHeaderMenu(page);
  await headerMenu(page).getByRole('menuitem', { name: other, exact: true }).click({ modifiers: ['Control'] });
  await expect(selected(page)).toHaveCount(65 + countIn(other));

  // Invert selects the rest.
  await openHeaderMenu(page);
  await headerMenu(page).getByRole('menuitem', { name: 'Invert selection', exact: true }).click();
  await expect(selected(page)).toHaveCount(138 - 65 - countIn(other));

  // Select none.
  await openHeaderMenu(page);
  await headerMenu(page).getByRole('menuitem', { name: 'Select none', exact: true }).click();
  await expect(selected(page)).toHaveCount(0);

  // The chip menu: Select all N on the pattern, Add them, Remove them.
  const firstChip = grid(page).locator('tbody tr').first().locator('.chip-menu-trigger');
  await expect(firstChip).toHaveAttribute('aria-haspopup', 'menu');
  await firstChip.click();
  const chipMenu = page.getByRole('menu', { name: /^Select trips on / });
  await expect(chipMenu.getByRole('menuitem')).toHaveText([/^Select all \d+ on /, 'Add them to the selection', 'Remove them from the selection']);
  const chipLabel = (await chipMenu.getByRole('menuitem').first().textContent())!;
  const chipCount = Number(/^Select all (\d+) on /.exec(chipLabel)![1]);
  await chipMenu.getByRole('menuitem').first().click();
  await expect(selected(page)).toHaveCount(chipCount);

  // Ctrl-click on a chip of another pattern adds that pattern without opening the menu.
  const otherChip = grid(page).locator('tbody tr:not(.trip-row-selected) .chip-menu-trigger').first();
  await otherChip.click({ modifiers: ['Control'] });
  await expect(page.getByRole('menu', { name: /^Select trips on / })).toHaveCount(0);
  const withBoth = await selected(page).count();
  expect(withBoth).toBeGreaterThan(chipCount);

  // Remove them takes that pattern's trips out again.
  await firstChip.click();
  await page.getByRole('menu', { name: /^Select trips on / }).getByRole('menuitem', { name: 'Remove them from the selection', exact: true }).click();
  await expect(selected(page)).toHaveCount(withBoth - chipCount);
  await expect(grid(page).locator('tbody tr').first()).not.toHaveClass(/trip-row-selected/);
});

test('the select menu stays usable from the pinned headings, and a staged Shift asks before the selection changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openGoldenTrips(page);

  // With the page scrolled, the header caret in the pinned duplicate heading opens the menu without clipping it.
  await page.evaluate(() => window.scrollTo(0, 1500));
  const pinned = page.getByRole('region', { name: 'Trips table headings while scrolling' });
  await expect(pinned).toBeVisible();
  await pinned.getByRole('button', { name: 'Select trips by…', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Select trips by…' });
  await expect(menu.getByRole('menuitem', { name: /^Select all \(138\)$/ })).toBeVisible();
  const box = await menu.boundingBox();
  const heading = await pinned.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height - 1);
  await menu.getByRole('menuitem', { name: 'Select all (138)', exact: true }).click();
  await expect(selected(page)).toHaveCount(138);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Stage a Shift, then choose Select none: the app asks first and leaves the selection alone until the planner discards the shift.
  await openHeaderMenu(page);
  await headerMenu(page).getByRole('menuitem', { name: 'Select none', exact: true }).click();
  await expect(selected(page)).toHaveCount(0);
  await grid(page).locator('tbody tr').first().locator('input[type="checkbox"]').check();
  await runCommand(page, 'trips.shift');
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  await drawer.getByRole('button', { name: '1 min later' }).click();
  await expect(drawer.getByRole('status')).toContainText('1 minute later');

  await openHeaderMenu(page);
  await headerMenu(page).getByRole('menuitem', { name: 'Invert selection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard staged shift?' });
  await expect(dialog).toBeVisible();
  await expect(selected(page)).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(selected(page)).toHaveCount(1);

  await openHeaderMenu(page);
  await headerMenu(page).getByRole('menuitem', { name: 'Invert selection', exact: true }).click();
  await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(selected(page)).toHaveCount(137);
});
