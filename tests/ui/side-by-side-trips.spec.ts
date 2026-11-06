// Packages SS2 and SS3 (Decision 0060): with side by side on, the Trips tab draws one workspace per direction. Only one pane may hold an
// open edit. The first tests turn the preference on through storage; the SS3 tests use the View menu.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';
import { chooseScope, openMenu, scopeField } from './support/ui';

test.setTimeout(150_000);
test.use({ actionTimeout: 15_000 });

const pane = (page: Page, direction: string) => page.locator(`[aria-label="${direction} trips"]`);
const draftRow = (container: Locator) => container.locator('.schedule-table tbody tr.draft-trip-row');

async function openSideBySide(page: Page) {
  await openGoldenTrips(page);
  await page.evaluate(() => localStorage.setItem('transit-costing-tool.trips-side-by-side.v1', JSON.stringify({ on: true })));
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Weekday' });
  await expect(pane(page, 'Southbound')).toBeVisible({ timeout: 30000 });
}

test('side by side draws a pane for each direction, without Runtimes, and disables the Direction toggle', async ({ page }) => {
  await openSideBySide(page);
  await expect(pane(page, 'Northbound')).toBeVisible();
  await expect(page.locator('[aria-label="Runtimes section"]')).toHaveCount(0);
  await expect(page.locator('[aria-label="Trips section"]')).toHaveCount(0);
  await expect(scopeField(page, 'Direction')).toHaveAttribute('aria-disabled', 'true');
  await expect(pane(page, 'Southbound').locator('.schedule-table tbody tr').first()).toBeVisible();
  await expect(pane(page, 'Northbound').locator('.schedule-table tbody tr').first()).toBeVisible();
  // Trip profile, Blocking scenario, and View are shared: they appear once, in the shared Trips header, and in neither pane.
  const sharedHeader = page.locator('[aria-label="Trips, both directions"] > header');
  for (const label of ['Trip profile', 'Blocking scenario']) {
    await expect(sharedHeader.locator('.menu-field').filter({ hasText: label })).toHaveCount(1);
    await expect(page.locator('.menu-field').filter({ hasText: label })).toHaveCount(1);
  }
  await expect(page.getByRole('button', { name: 'View', exact: true })).toHaveCount(1);
  await expect(pane(page, 'Southbound').getByRole('button', { name: 'Add trip', exact: true })).toHaveCount(1);
  await expect(pane(page, 'Northbound').getByRole('button', { name: 'Add trip', exact: true })).toHaveCount(1);
});

test('only one pane holds an Add-trip row; starting one in the other pane asks first', async ({ page }) => {
  await openSideBySide(page);
  const south = pane(page, 'Southbound');
  const north = pane(page, 'Northbound');
  await south.getByRole('button', { name: 'Add trip', exact: true }).click();
  await expect(draftRow(south)).toHaveCount(1);
  await draftRow(south).getByLabel('New trip pattern').selectOption({ index: 1 });

  await north.getByRole('button', { name: 'Add trip', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard new trip?' });
  await expect(dialog).toBeVisible();
  await expect(draftRow(north)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(draftRow(south)).toHaveCount(1);
  await expect(draftRow(north)).toHaveCount(0);

  await north.getByRole('button', { name: 'Add trip', exact: true }).click();
  await page.getByRole('dialog', { name: 'Discard new trip?' }).getByRole('button', { name: 'Discard' }).click();
  await expect(draftRow(north)).toHaveCount(1);
  await expect(draftRow(south)).toHaveCount(0);
});

// Package SS3: the View menu item, the strip, and the layout.
async function chooseView(page: Page, item: string) {
  const trigger = page.getByRole('button', { name: 'View', exact: true });
  await openMenu(page, trigger, 'View');
  await page.getByRole('menu', { name: 'View', exact: true }).getByRole('menuitemcheckbox', { name: item }).click();
}

test('the View menu turns side by side on with the current direction on the left, and Close returns to it', async ({ page }) => {
  await openGoldenTrips(page);
  await chooseScope(page, 'Direction', { label: 'Northbound' });
  await expect(page.locator('[aria-label="Runtimes section"]')).toHaveCount(1);
  await chooseView(page, 'Show both directions side by side');
  await expect(page.getByRole('group', { name: 'Side by side' })).toContainText('Northbound on the left · Southbound on the right');
  await expect(page.locator('[aria-label="Runtimes section"]')).toHaveCount(0);
  const boxes = await Promise.all(['Northbound', 'Southbound'].map((name) => pane(page, name).boundingBox()));
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  // The page never scrolls sideways (item 11).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('menuitemcheckbox', { name: 'Show both directions side by side' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Close side by side' }).click();
  await expect(page.locator('[aria-label="Trips section"]')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Northbound' })).toHaveAttribute('aria-checked', 'true');
  // The choice is remembered for the next visit.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('transit-costing-tool.trips-side-by-side.v1') ?? '{}'))).toMatchObject({ on: false, leftDirectionId: expect.any(String) });
});

test('Switch sides swaps the panes and keeps an open Add-trip row', async ({ page }) => {
  await openSideBySide(page);
  const south = pane(page, 'Southbound');
  await south.getByRole('button', { name: 'Add trip', exact: true }).click();
  await draftRow(south).getByLabel('New trip pattern').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Switch sides' }).click();
  await expect(page.getByRole('group', { name: 'Side by side' })).toContainText('Northbound on the left · Southbound on the right');
  const [north, southBox] = await Promise.all([pane(page, 'Northbound').boundingBox(), south.boundingBox()]);
  expect(north!.x).toBeLessThan(southBox!.x);
  await expect(draftRow(south)).toHaveCount(1);
  // The shared header controls follow the left pane, and stay in the shared header.
  await expect(page.locator('[aria-label="Trips, both directions"] > header .menu-field').filter({ hasText: 'Trip profile' })).toHaveCount(1);
});

test('compact panes pin the compare columns at the right and leave out Deadhead', async ({ page }) => {
  await openSideBySide(page);
  const table = pane(page, 'Southbound').locator('.schedule-table').first();
  await expect(table.getByRole('columnheader', { name: 'Deadhead' })).toHaveCount(0);
  await expect(table.getByRole('columnheader', { name: 'Run time' })).toHaveCSS('position', 'sticky');
  const scrolls = await table.evaluate((element) => element.scrollWidth > element.clientWidth);
  if (scrolls) {
    const before = await table.getByRole('columnheader', { name: 'Block' }).boundingBox();
    await table.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    const after = await table.getByRole('columnheader', { name: 'Block' }).boundingBox();
    expect(Math.round(after!.x)).toBe(Math.round(before!.x));
  }
});

test('the View item is disabled, with the reason, in a window narrower than 1100 px', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await openGoldenTrips(page);
  const trigger = page.getByRole('button', { name: 'View', exact: true });
  await openMenu(page, trigger, 'View');
  const item = page.getByRole('menu', { name: 'View', exact: true }).getByRole('menuitemcheckbox', { name: 'Show both directions side by side' });
  await expect(item).toBeDisabled();
  await expect(item).toHaveAttribute('title', /at least 1100 px/);
});

test('a Day change asks about the open edit in either pane', async ({ page }) => {
  await openSideBySide(page);
  const north = pane(page, 'Northbound');
  await north.getByRole('button', { name: 'Add trip', exact: true }).click();
  await draftRow(north).getByLabel('New trip pattern').selectOption({ index: 1 });
  await chooseScope(page, 'Day', { index: 1 });
  await expect(page.getByRole('dialog', { name: 'Discard new trip?' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Discard new trip?' }).getByRole('button', { name: 'Cancel' }).click();
  await expect(draftRow(north)).toHaveCount(1);
});
