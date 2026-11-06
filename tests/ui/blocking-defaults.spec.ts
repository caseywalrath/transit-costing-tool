import { expect, test } from '@playwright/test';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { goldenRaw } from './support/goldenFixture';
import { chooseScope, scopeField, scopeText } from './support/ui';

test.setTimeout(120_000);

async function open(page: import('@playwright/test').Page, raw: unknown) {
  await seedSnapshot(page, raw);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
}

// A Trip Profile with no blocking scenario gets an empty "Default" one, which shows every trip as unassigned.
test('creates a Default blocking scenario when the trip profile has none', async ({ page }) => {
  await open(page, { ...goldenRaw(), generationSets: [], blockingScenarios: [], blocks: [] });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(scopeField(page, 'Blocking scenario').locator('option:checked')).toHaveText('Default', { timeout: 30_000 });
  await expect(scopeField(page, 'Blocking scenario').locator('option')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Create or select a blocking scenario' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Unassigned trips' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unassigned trips' }).locator('tbody tr').first()).toBeVisible();
  expect(await runInPage(page, 'return (await e.db.blockingScenarios.toArray()).map((item) => item.name)')).toEqual(['Default']);
});

// Breaks are switched on and off with one checkbox; the typed values are kept while breaks are off.
test('Add breaks turns the break rule off without clearing its values', async ({ page }) => {
  await open(page, { ...goldenRaw(), generationSets: [] });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Auto-blocking…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Auto-blocking' });
  const toggle = dialog.getByRole('checkbox', { name: 'Add breaks', exact: true });
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  const length = dialog.getByLabel('Break length (min)');
  await toggle.check();
  await length.fill('30');
  const summary = dialog.locator('summary').filter({ has: page.locator('.auto-blocking-section-title', { hasText: /^Breaks$/ }) });
  await expect(summary).toContainText('30 min');
  await toggle.uncheck();
  await expect(length).toBeDisabled();
  await expect(length).toHaveValue('30');
  await expect(summary).toContainText('No breaks');
  await toggle.check();
  await expect(length).toBeEnabled();
  await expect(summary).toContainText('30 min');
});

// A Scenario switch returns to the Day last viewed in that Scenario, on the Blocking tab and on the shared scope of the other tabs.
test('switching scenarios restores the Day last viewed in each scenario', async ({ page }) => {
  await open(page, { ...goldenRaw(), generationSets: [] });
  const original = await runInPage(page, 'return (await e.db.scenarios.toArray())[0].name');
  await page.getByRole('button', { name: /^Scenario: / }).click();
  await page.getByRole('menuitem', { name: 'Duplicate scenario…', exact: true }).click();
  await page.getByRole('dialog', { name: 'Duplicate scenario' }).getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect.poll(() => runInPage(page, 'return await e.db.scenarios.count()')).toBe(2);
  const copy = `${original} Copy`;
  await expect(page.getByRole('button', { name: `Scenario: ${copy}`, exact: true })).toBeVisible();

  const switchTo = async (name: string) => {
    await page.getByRole('button', { name: /^Scenario: / }).click();
    await page.getByRole('menuitemradio', { name, exact: true }).click();
    await expect(page.getByRole('button', { name: `Scenario: ${name}`, exact: true })).toBeVisible();
  };

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Sunday' });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Saturday' });

  await switchTo(original);
  await chooseScope(page, 'Day', { label: 'Holiday' });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Saturday' });

  await switchTo(copy);
  await expect.poll(() => scopeText(page, 'Day')).toBe('Sunday');
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect.poll(() => scopeText(page, 'Day')).toBe('Saturday');

  await switchTo(original);
  await expect.poll(() => scopeText(page, 'Day')).toBe('Holiday');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect.poll(() => scopeText(page, 'Day')).toBe('Saturday');
});
