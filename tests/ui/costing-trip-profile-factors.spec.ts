// Decision 0062: each Trip Profile keeps its own estimate factors, and the Implied service panel shows the cycle and vehicles a layover %
// implies. Golden Federal Boulevard project with a second, empty Trip Profile "Alternative".
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { chooseCostBasis, editGridCell, gridCell, scopeField } from './support/ui';

test.setTimeout(120_000);

async function open(page: Page) {
  const raw = { ...goldenRaw(), generationSets: [] };
  const base = raw.tripProfiles[0];
  raw.tripProfiles = [...raw.tripProfiles, { ...base, id: 'alternative-profile', name: 'Alternative' }];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedSnapshot(page, raw);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await chooseCostBasis(page, 'Estimated from running time', 'Default');
  await expect(page.locator('.context-field__value')).toHaveText('Default');
}

const factors = (page: Page) => page.getByRole('grid', { name: 'Estimate factors' });
const factorsPanel = (page: Page) => page.getByRole('region', { name: 'Estimate factors' });
const implied = (page: Page) => page.getByRole('region', { name: 'Implied service' });

test('the Implied service panel shows the cycle, headway, and vehicles of each day, and they follow the layover %', async ({ page }) => {
  await open(page);
  await expect(implied(page).locator('thead th')).toHaveText(['Service day', 'Cycle running (min)', 'Cycle with layover (min)', 'Headway (min)', 'Implied vehicles']);
  const weekday = implied(page).locator('tbody tr').filter({ has: page.locator('th', { hasText: 'Weekday' }) });
  await expect(weekday.locator('td').nth(1)).toHaveText('—');
  await expect(weekday.locator('td').nth(3)).toHaveText('—');
  const running = Number(await weekday.locator('td').nth(0).innerText());
  expect(running).toBeGreaterThan(0);

  await editGridCell(gridCell(factors(page), 'All days layover percent'), '20');
  await expect(weekday.locator('td').nth(1)).toHaveText((running / 0.8).toFixed(1));
  await expect(weekday.locator('td').nth(3)).not.toHaveText('—');
  const twenty = Number(await weekday.locator('td').nth(3).innerText());
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '10');
  await expect(weekday.locator('td').nth(3)).not.toHaveText(twenty.toFixed(2));
  expect(Number(await weekday.locator('td').nth(3).innerText())).toBeLessThan(twenty);
  // The panel belongs to the estimated basis only.
  await chooseCostBasis(page, 'Blocked hours', 'Workbook Blocks');
  await expect(implied(page)).toHaveCount(0);
});

test('each Trip Profile keeps its own factors, and changing to another Profile with unsaved factors asks first', async ({ page }) => {
  await open(page);
  await expect(factorsPanel(page)).toContainText('Trip profile Default · blank days use All days');
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '22.2');
  await page.getByRole('button', { name: 'Save factors', exact: true }).click();
  // The save bar hides while the save runs ("Saving…"), so wait for the stored record instead.
  await expect.poll(() => runInPage(page, 'return (await e.db.costingAssumptions.toArray())[0]?.tripProfileEstimateFactors?.length ?? 0')).toBe(1);
  await expect(page.getByRole('button', { name: /^Sav/ })).toHaveCount(0);

  // Another Profile starts blank, and unsaved edits there are guarded when the basis changes.
  await chooseCostBasis(page, 'Estimated from running time', 'Alternative');
  await expect(factorsPanel(page)).toContainText('Trip profile Alternative');
  await expect(gridCell(factors(page), 'All days layover percent')).toHaveText('');
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '12.2222');
  await chooseCostBasis(page, 'Estimated from running time', 'Default');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Save estimate factors before changing the cost basis?');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.context-field__value')).toHaveText('Alternative');
  await chooseCostBasis(page, 'Estimated from running time', 'Default');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.context-field__value')).toHaveText('Default');
  await expect(gridCell(factors(page), 'All days layover percent')).toHaveText('22.2');

  const stored = await runInPage(page, 'return (await e.db.costingAssumptions.toArray())[0].tripProfileEstimateFactors.map((entry) => [entry.tripProfileId === "alternative-profile" ? "Alternative" : "Default", entry.factors.allDays.layoverFraction])');
  expect((stored as Array<[string, number]>).map(([name]) => name)).toEqual(['Default', 'Alternative']);
  expect((stored as Array<[string, number]>)[0][1]).toBeCloseTo(0.222, 9);
  expect((stored as Array<[string, number]>)[1][1]).toBeCloseTo(0.122222, 9);

  // The Blocked basis of the Default Profile edits the same factors as its estimated basis, so no question is asked.
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '25');
  await chooseCostBasis(page, 'Blocked hours', 'Workbook Blocks');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(gridCell(factors(page), 'All days layover percent')).toHaveText('25');
});

test('a Profile with no factors of its own shows the scenario’s shared factors until it saves its own', async ({ page }) => {
  const raw = { ...goldenRaw(), generationSets: [] };
  // A record saved before Decision 0062: only the Scenario's shared factors.
  const stamp = '2026-10-31T00:00:00.000Z';
  raw.costingAssumptions = [{ id: 'cost', scenarioId: raw.scenarios[0].id, currencyCode: 'USD', enteredRate: 150, rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0.03, estimateFactors: { allDays: { layoverFraction: 0.3 }, serviceDays: [] }, createdAt: stamp, updatedAt: stamp }];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedSnapshot(page, raw);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await chooseCostBasis(page, 'Estimated from running time', 'Default');
  await expect(factorsPanel(page)).toContainText('Trip profile Default · shared scenario factors');
  await expect(factorsPanel(page)).toContainText('These are the scenario’s shared factors. Saving stores factors for this trip profile only.');
  await expect(gridCell(factors(page), 'All days layover percent')).toHaveText('30');
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '20');
  await page.getByRole('button', { name: 'Save factors', exact: true }).click();
  await expect(factorsPanel(page)).toContainText('Trip profile Default · blank days use All days');
  await expect.poll(() => runInPage(page, 'return (await e.db.costingAssumptions.toArray())[0].estimateFactors.allDays.layoverFraction')).toBe(0.3);
  await expect(scopeField(page, 'Cost basis')).toBeVisible();
});
