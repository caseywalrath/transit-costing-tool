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

test('Group by is hidden with one Route (Decision 0078)', async ({ page }) => {
  await open(page, false);
  await expect(breakdown(page).locator('.costing-route-toggle')).toHaveCount(1);
  await expect(breakdown(page).getByRole('button', { name: /^Group by:/ })).toHaveCount(0);
});

test('Group by Service day nests Routes under each day, keeps column positions and matches the totals (Decision 0078)', async ({ page }) => {
  await open(page, true);
  const totalBefore = await breakdown(page).locator('tfoot').textContent();
  const columns = await headerBoxes(page);
  await openMenu(page, breakdown(page).getByRole('button', { name: 'Group by: Route' }), 'Group by');
  await page.getByRole('menuitemradio', { name: 'Service day' }).click();
  await expect(breakdown(page).getByRole('button', { name: 'Group by: Service day' })).toBeVisible();
  await expect(breakdown(page).locator('thead th').first()).toHaveText('Service day');
  expect(await headerBoxes(page)).toEqual(columns);
  await expect(breakdown(page).locator('tfoot')).toHaveText(totalBefore ?? '');

  const toggles = breakdown(page).locator('.costing-route-toggle');
  await expect(toggles.first()).toHaveAttribute('aria-label', 'Expand Weekday');
  await expect(breakdown(page).locator('.costing-route-day-row')).toHaveCount(0);
  await openMenu(page, breakdown(page).getByRole('button', { name: 'Cost breakdown actions' }), 'Cost breakdown actions');
  await page.getByRole('menuitem', { name: 'Expand all days' }).click();
  const weekdayChildren = breakdown(page).locator('tbody').first().locator('.costing-route-day-row');
  await expect(weekdayChildren).toHaveCount(2);
  await expect(weekdayChildren.nth(1)).toContainText('Second route');
  expect(await headerBoxes(page)).toEqual(columns);

  // The grouping is remembered for the Scenario.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(breakdown(page).getByRole('button', { name: 'Group by: Service day' })).toBeVisible();
});

test('the Cost Summary shows Cost by route for two Routes', async ({ page }) => {
  await open(page, true);
  const grid = factorsPanel(page).getByRole('grid', { name: 'Estimate factors' });
  await editGridCell(gridCell(grid, 'All days layover percent'), '10');
  await page.getByRole('combobox', { name: 'Operating cost per revenue hour in USD' }).fill('150');
  await page.getByRole('button', { name: 'Costing actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'View cost summary…', exact: true }).click();
  const partial = page.getByRole('alertdialog', { name: 'This estimate is partial' });
  if (await partial.isVisible().catch(() => false)) await partial.getByRole('button', { name: 'Open summary', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Operating Cost Estimate' });
  await expect(sheet.getByRole('heading', { name: 'Cost by route' })).toBeVisible();
  await expect(sheet).toContainText('Second route');
});

test('Vehicle requirement starts from each Route’s layover % and Use writes only to the level the Route menu shows', async ({ page }) => {
  await open(page, true);
  const grid = factorsPanel(page).getByRole('grid', { name: 'Estimate factors' });
  await editGridCell(gridCell(grid, 'All days layover percent'), '10');
  await page.getByRole('button', { name: 'Save factors', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Sav/ })).toHaveCount(0);
  await openMenu(page, factorsPanel(page).getByRole('button', { name: 'Route: All routes' }), 'Route');
  await page.getByRole('menuitemradio', { name: 'Second route' }).click();
  await editGridCell(gridCell(grid, 'All days layover percent'), '30');
  await page.getByRole('button', { name: 'Save factors', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Sav/ })).toHaveCount(0);

  const panel = page.getByRole('region', { name: 'Vehicle requirement' });
  await panel.getByRole('button', { name: 'Vehicle requirement' }).click();
  const second = panel.locator('tbody tr').filter({ hasText: 'Second route' }).first();
  const first = panel.locator('tbody tr').filter({ hasNotText: 'Second route' }).first();
  await expect(second.getByRole('textbox', { name: /layover percent/ })).toHaveValue('30');
  await expect(second.locator('.cycle-source')).toHaveText('route');
  await expect(first.getByRole('textbox', { name: /layover percent/ })).toHaveValue('10');
  await expect(first.locator('.cycle-source')).toHaveText('trip profile');
  // With Second route chosen, the other Route's rows are dimmed and cannot write.
  await expect(first).toHaveClass(/cycle-row--other/);
  await first.getByRole('textbox', { name: /layover percent/ }).fill('12');
  await expect(first.getByRole('button', { name: /^Use / })).toBeDisabled();
  await second.getByRole('textbox', { name: /layover percent/ }).fill('25');
  await second.getByRole('button', { name: /^Use / }).click();
  await expect(gridCell(grid, 'Weekday layover percent').or(gridCell(grid, 'Saturday layover percent')).or(gridCell(grid, 'Sunday layover percent')).or(gridCell(grid, 'Holiday layover percent')).filter({ hasText: '25' })).toHaveCount(1);

  // With All routes chosen, a Route with its own layover cannot write to the Trip Profile.
  await factorsPanel(page).getByRole('button', { name: 'Discard', exact: true }).click();
  await openMenu(page, factorsPanel(page).getByRole('button', { name: 'Route: Second route' }), 'Route');
  await page.getByRole('menuitemradio', { name: 'All routes' }).click();
  await expect(first).not.toHaveClass(/cycle-row--other/);
  await second.getByRole('textbox', { name: /layover percent/ }).fill('20');
  await expect(second.getByRole('button', { name: /^Use / })).toBeDisabled();
  await expect(second.getByRole('button', { name: /^Use / })).toHaveAttribute('title', /own layover %/);
});
