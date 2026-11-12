import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seedSnapshot } from './support/dexieEnv';
import { goldenRaw } from './support/goldenFixture';
import { blockingScenarioNames, chooseBlockingScenario, runCommand, selectedBlockingScenarioName } from './support/ui';
test.setTimeout(180_000);
test('round trip', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await runCommand(page, 'blockingScenario.autoBlocking');
  const dialog = page.getByRole('dialog', { name: 'Auto-blocking' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const name = 'Round trip auto';
  await dialog.getByLabel('Blocking scenario name').fill(name);
  await dialog.getByText('Block limits', { exact: true }).click();
  await dialog.getByLabel('Maximum vehicles per day').fill('17');
  const create = dialog.getByRole('button', { name: 'Create blocking scenario', exact: true });
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole('button', { name: /^Project: / }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Back up project (JSON)', exact: true }).click();
  const file = await (await download).path();
  const text = readFileSync(file, 'utf8');
  const parsed = JSON.parse(text);
  expect(parsed.exportSchemaVersion).toBe(12);
  const rec = parsed.blockingScenarios.find((s: any) => s.name === name).autoBlocking;
  expect(rec.rules.maxVehicles).toBe(17);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('.notice.success')).toContainText('as an independent project', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  // The imported project may still be settling; choose the scenario until the choice holds.
  await expect(async () => {
    await chooseBlockingScenario(page, name);
    await expect.poll(() => selectedBlockingScenarioName(page), { timeout: 1_000 }).toBe(name);
  }).toPass({ timeout: 30_000 });
  // Counted before the dialog opens: its modal backdrop stops the scenario menu from opening.
  const count = (await blockingScenarioNames(page)).length;
  await runCommand(page, 'blockingScenario.autoBlocking');
  const again = page.getByRole('dialog', { name: 'Auto-blocking' });
  // Ticking "Edit rules of" loads the selected scenario's stored rules and name and rebuilds it in place.
  const edit = again.getByRole('checkbox', { name: `Edit rules of ${name}` });
  await expect(edit).toBeEnabled({ timeout: 30_000 });
  await edit.check();
  await expect(again.getByLabel('Blocking scenario name')).toHaveValue(name);
  await again.getByText('Block limits', { exact: true }).click();
  await expect(again.getByLabel('Maximum vehicles per day')).toHaveValue('17', { timeout: 30_000 });
  await again.getByLabel('Maximum vehicles per day').fill('18');
  const rebuild = again.getByRole('button', { name: 'Rebuild blocks', exact: true });
  await expect(rebuild).toBeEnabled({ timeout: 30_000 });
  await rebuild.click();
  await expect(again).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(async () => (await blockingScenarioNames(page)).length).toBe(count);
  await expect.poll(() => selectedBlockingScenarioName(page)).toBe(name);
});
