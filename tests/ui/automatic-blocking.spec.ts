import { expect, test } from '@playwright/test';
import { seedSnapshot } from './support/dexieEnv';
import { goldenRaw } from './support/goldenFixture';
import { scopeField } from './support/ui';

test.setTimeout(120_000);

// Decision 0055, package AB5. Builds a new Blocking Scenario from the Federal BRT golden project with the default rules, then checks
// that the scenario is selected, its day has blocks and no unassigned trips, the provenance note is shown, and Costing offers it as a
// Blocked cost basis. The assertions do not depend on exact golden-data counts.
test('builds a blocking scenario automatically and offers it as a blocked cost basis', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(scopeField(page, 'Blocking scenario')).toHaveValue(/.+/);

  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Build blocks automatically…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Build blocks automatically' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  // The preview has at least one day row with more than zero blocks (the Blocks column is the first data cell).
  const preview = dialog.getByRole('table', { name: 'Automatic blocking preview' });
  await expect(preview.locator('tbody tr').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => {
    const counts = await preview.locator('tbody tr td:first-of-type').allTextContents();
    return counts.some((value) => Number(value) > 0);
  }, { timeout: 30_000 }).toBe(true);

  const name = `Automatic ${Date.now()}`;
  await dialog.getByLabel('Blocking scenario name').fill(name);
  const create = dialog.getByRole('button', { name: 'Create blocking scenario', exact: true });
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText('Unable to', { exact: false })).toHaveCount(0);

  // The new scenario is selected, its day has blocks, and no trip on that day is left unassigned.
  const selector = scopeField(page, 'Blocking scenario');
  await expect(selector.locator('option:checked')).toHaveText(name);
  const summary = page.getByRole('region', { name: 'Blocking summary' });
  await expect(summary).toContainText(/summary · [1-9]\d* blocks?/);
  await expect(page.getByRole('button', { name: 'Expand unassigned trips, 0', exact: true })).toBeVisible();

  await expect(page.locator('.auto-blocking-note')).toContainText('Built automatically');

  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Costing Assumptions' })).toBeVisible();
  await expect(scopeField(page, 'Cost basis').locator('option', { hasText: `Blocked · ${name}` })).toHaveCount(1);
});
