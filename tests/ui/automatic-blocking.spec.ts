import { expect, test } from '@playwright/test';
import { seedSnapshot } from './support/dexieEnv';
import { goldenRaw } from './support/goldenFixture';
import { expectBlockingScenarioSelected, region, runCommand, scopeField, selectedBlockingScenarioName } from './support/ui';

test.setTimeout(120_000);

// Decision 0055, package AB5. Builds a new Blocking Scenario from the Federal BRT golden project with the default rules, then checks
// that the scenario is selected, its day has blocks and no unassigned trips, the provenance note is shown, and Costing offers it as a
// Blocked cost basis. The assertions do not depend on exact golden-data counts.
test('builds a blocking scenario automatically and offers it as a blocked cost basis', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expectBlockingScenarioSelected(page);

  await runCommand(page, 'blockingScenario.autoBlocking');
  const dialog = page.getByRole('dialog', { name: 'Auto-blocking' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // A new scenario is the default, named in the Auto 1, Auto 2 sequence; meal and relief text is gone.
  await expect(dialog.getByLabel('Blocking scenario name')).toHaveValue(/^Auto \d+$/, { timeout: 30_000 });
  await expect(dialog.getByRole('checkbox', { name: /^Edit rules of/ })).not.toBeChecked();
  await expect(dialog).not.toContainText('run cutting');

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
  await expect.poll(() => selectedBlockingScenarioName(page)).toBe(name);
  const summary = region(page, 'blockingSummary');
  await expect(summary.getByRole('button', { name: /^Blocking summary · Weekday/ })).toBeVisible();
  await expect(summary.locator('.work-surface__count')).toHaveText(/^[1-9]\d*$/);
  await expect(page.getByRole('button', { name: 'Expand unassigned trips, 0', exact: true })).toBeVisible();

  // No build note bar above the Blocking surfaces.
  await expect(page.getByText('Built automatically')).toHaveCount(0);

  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Costing Assumptions' })).toBeVisible();
  // Decision 0081 (D5): Costing costs the working Blocking scenario, which is the one just built.
  await scopeField(page, 'Cost basis').getByRole('radio', { name: 'Blocked', exact: true }).click();
  await expect.poll(() => selectedBlockingScenarioName(page)).toBe(name);
});

// Decision 0083. A deleted block leaves its trips unassigned; Auto-block unassigned trips adds blocks for them and keeps the other blocks.
test('auto-blocks the unassigned trips into new blocks of the selected blocking scenario', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expectBlockingScenarioSelected(page);
  const scenarioName = await selectedBlockingScenarioName(page);
  // Block rows only (not the "No blocks" row), counted once the Blocks have loaded: the footer total matches the rows.
  const rows = page.locator('.blocking-blocks-table tbody tr:has(.blocking-block-name)');
  const total = page.locator('.blocking-blocks-table tfoot th').first();
  await expect(total).toHaveText(/Total · [1-9]\d* blocks?/, { timeout: 30_000 });
  const before = Number((await total.textContent())!.match(/(\d+) block/)![1]);
  await expect(rows).toHaveCount(before);

  await runCommand(page, 'block.delete');
  await page.getByRole('alertdialog', { name: 'Delete block?', exact: true }).getByRole('button', { name: 'Delete block', exact: true }).click();
  await expect(rows).toHaveCount(before - 1);
  await expect(region(page, 'unassignedTrips').locator('.blocking-trips-table tbody tr input[type="checkbox"]').first()).toBeVisible();

  await runCommand(page, 'unassigned.autoBlock');
  const dialog = page.getByRole('dialog', { name: 'Auto-block unassigned trips' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByLabel('Blocking scenario name')).toHaveCount(0);
  await expect(dialog).toContainText(`Adds new blocks to ${scenarioName}`);
  const add = dialog.getByRole('button', { name: /^Add \d+ blocks?$/ });
  await expect(add).toBeEnabled({ timeout: 30_000 });
  const added = Number((await add.textContent())!.match(/\d+/)![0]);
  await add.click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText('Unable to', { exact: false })).toHaveCount(0);
  await expect(rows).toHaveCount(before - 1 + added);
  await expect(page.getByRole('button', { name: 'Expand unassigned trips, 0', exact: true })).toBeVisible();
  expect(await selectedBlockingScenarioName(page)).toBe(scenarioName);
});

// Decision 0056, package MR3. The preview shows peak vehicles (equal to blocks on the golden Weekday), and the Maximum vehicles field in
// Block limits refuses 0 the way other invalid limits do.
test('shows peak vehicles and validates the maximum vehicles limit', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await runCommand(page, 'blockingScenario.autoBlocking');
  const dialog = page.getByRole('dialog', { name: 'Auto-blocking' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText('became ready most recently');

  const preview = dialog.getByRole('table', { name: 'Automatic blocking preview' });
  await expect(preview.getByRole('columnheader', { name: 'Peak vehicles' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => {
    const blocks = await preview.locator('tbody tr td:nth-of-type(1)').allTextContents();
    const peaks = await preview.locator('tbody tr td:nth-of-type(2)').allTextContents();
    return blocks.length > 0 && blocks.join() === peaks.join();
  }, { timeout: 30_000 }).toBe(true);

  await dialog.getByLabel('Blocking scenario name').fill(`Limits ${Date.now()}`);
  const create = dialog.getByRole('button', { name: 'Create blocking scenario', exact: true });
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await dialog.getByText('Block limits', { exact: true }).click();
  const limit = dialog.getByLabel('Maximum vehicles per day');
  await expect(limit).toBeVisible();
  await expect(dialog.getByText('Leave blank for no limit.')).toBeVisible();
  await limit.fill('0');
  await expect(dialog.getByText('Enter a whole number of 1 or more, or leave it blank.')).toBeVisible({ timeout: 30_000 });
  await expect(create).toBeDisabled();
  await limit.fill('40');
  await expect(dialog.getByText('Enter a whole number of 1 or more, or leave it blank.')).toHaveCount(0);
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await expect(dialog.locator('.auto-blocking-section-sum', { hasText: 'max 40 vehicles' })).toBeVisible();
});
