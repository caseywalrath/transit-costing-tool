// Decision 0077: the Cost breakdown by Route and Route estimate factors. Golden Federal Boulevard project; the two-Route case moves every
// second Trip to a copy of the Route named "Second route".
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { chooseCostBasis, editGridCell, gridCell, openMenu } from './support/ui';

test.setTimeout(120_000);

async function open(page: Page, twoRoutes: boolean) {
  const raw = { ...goldenRaw(), generationSets: [] };
  if (twoRoutes) {
    const route = raw.routes[0];
    raw.routes = [...raw.routes, { ...route, id: 'second-route', name: 'Second route', shortName: undefined }];
    raw.trips = raw.trips.map((trip: { routeId: string }, index: number) => index % 2 ? { ...trip, routeId: 'second-route' } : trip);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedSnapshot(page, raw);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await chooseCostBasis(page, 'Estimated from running time', 'Default');
  await expect(page.locator('.context-field__value')).toHaveText('Default');
}

const breakdown = (page: Page) => page.getByRole('region', { name: 'Cost breakdown' });
const factorsPanel = (page: Page) => page.getByRole('region', { name: 'Estimate factors' });
const headerBoxes = (page: Page) => breakdown(page).locator('thead th').evaluateAll((cells) => cells.map((cell) => { const box = cell.getBoundingClientRect(); return [box.left, box.width]; }));

test('one Route is expanded by default and the expanded state is remembered', async ({ page }) => {
  await open(page, false);
  const toggle = breakdown(page).locator('.costing-route-toggle');
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(breakdown(page).locator('thead th').first()).toHaveText('Route');
  await expect(breakdown(page).locator('.costing-route-day-row').first()).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(breakdown(page).locator('.costing-route-day-row')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(breakdown(page).locator('.costing-route-toggle')).toHaveAttribute('aria-expanded', 'false');
});

test('columns keep their positions collapsed, expanded and mixed; Expand all is in the Cost breakdown actions; keyboard toggles', async ({ page }) => {
  await open(page, true);
  const toggles = breakdown(page).locator('.costing-route-toggle');
  await expect(toggles).toHaveCount(2);
  await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'false');
  const collapsed = await headerBoxes(page);

  await toggles.nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(toggles.nth(0)).toHaveAttribute('aria-expanded', 'true');
  await expect(toggles.nth(0)).toBeFocused();
  expect(await headerBoxes(page)).toEqual(collapsed);

  const actions = breakdown(page).getByRole('button', { name: 'Cost breakdown actions' });
  await openMenu(page, actions, 'Cost breakdown actions');
  await page.getByRole('menuitem', { name: 'Expand all routes' }).click();
  await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'true');
  expect(await headerBoxes(page)).toEqual(collapsed);

  await toggles.nth(1).focus();
  await page.keyboard.press('Space');
  await expect(toggles.nth(1)).toHaveAttribute('aria-expanded', 'false');
  expect(await headerBoxes(page)).toEqual(collapsed);
});

test('a Route factor is saved for that Route only, its blank cells inherit, and changing the Route with unsaved edits asks first', async ({ page }) => {
  await open(page, true);
  const grid = factorsPanel(page).getByRole('grid', { name: 'Estimate factors' });
  await editGridCell(gridCell(grid, 'All days layover percent'), '10');
  await page.getByRole('button', { name: 'Save factors', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Sav/ })).toHaveCount(0);
  // Annual revenue hours of the Total row (the eighth value cell); the fixture has no rate, so costs are dashes.
  const totalBefore = await breakdown(page).locator('tfoot td').nth(7).textContent();
  expect(totalBefore).not.toBe('—');

  await openMenu(page, factorsPanel(page).getByRole('button', { name: 'Route: All routes' }), 'Route');
  await page.getByRole('menuitemradio', { name: 'Second route' }).click();
  await expect(factorsPanel(page).getByRole('button', { name: 'Route: Second route' })).toBeVisible();
  // Inherited from the Trip Profile: a placeholder, not a value.
  await expect(gridCell(grid, 'All days layover percent').locator('.grid-cell__placeholder')).toHaveText('10');
  await editGridCell(gridCell(grid, 'All days layover percent'), '30');
  await expect(breakdown(page).locator('tfoot td').nth(7)).not.toHaveText(totalBefore ?? '');

  await openMenu(page, factorsPanel(page).getByRole('button', { name: 'Route: Second route' }), 'Route');
  await page.getByRole('menuitemradio', { name: 'All routes' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Save estimate factors before changing the route?');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(factorsPanel(page).getByRole('button', { name: 'Route: All routes' })).toBeVisible();
  await expect(gridCell(grid, 'All days layover percent')).toHaveText('10');

  const stored = await runInPage(page, 'const record = (await e.db.costingAssumptions.toArray())[0]; return record.routeEstimateFactors.map((entry) => [entry.routeId, entry.factors.allDays.layoverFraction])');
  expect(stored).toEqual([['second-route', 0.3]]);
});
