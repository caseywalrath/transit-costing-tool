// Package SS2 (Decision 0060): with the side-by-side preference on, the Trips tab draws one workspace per direction. Only one pane may hold an
// open edit. The View menu item and the layout arrive in SS3, so these tests turn the preference on through storage.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';
import { chooseScope, scopeField } from './support/ui';

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
  // The trip profile and blocking scenario belong to the shared header, which only the left pane draws.
  await expect(pane(page, 'Southbound').locator('.menu-field').filter({ hasText: 'Trip profile' })).toHaveCount(1);
  await expect(pane(page, 'Northbound').locator('.menu-field').filter({ hasText: 'Trip profile' })).toHaveCount(0);
  await expect(pane(page, 'Southbound').locator('.menu-field').filter({ hasText: 'Blocking scenario' })).toHaveCount(1);
  await expect(pane(page, 'Northbound').locator('.menu-field').filter({ hasText: 'Blocking scenario' })).toHaveCount(0);
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
