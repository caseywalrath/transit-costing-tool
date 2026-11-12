import { expect, test } from '@playwright/test';
import { seedSnapshot } from './support/dexieEnv';
import { goldenRaw } from './support/goldenFixture';
import { blockingScenarioMenu, chooseScope, expectBlockingScenarioSelected, openMenu } from './support/ui';

test.setTimeout(90_000);

// Decision 0053: the Blocks table checks Blocks for deletion separately from opening one, and the Blocks surface can clear the Day.
test('deletes checked blocks, then every block on the day', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Saturday' });
  await expectBlockingScenarioSelected(page);

  const table = page.locator('.blocking-blocks-table');
  const rows = table.locator('tbody tr');
  await expect.poll(() => rows.count()).toBeGreaterThan(2);
  const before = await rows.count();
  const openedRows = table.locator('tbody tr.selected-block-row');
  // The Day's first Block opens once the Blocks load; wait for it so the count below is settled.
  await expect(openedRows).toHaveCount(1);
  const openedBefore = await openedRows.count();

  await rows.nth(0).getByRole('checkbox').check();
  await rows.nth(1).getByRole('checkbox').check();
  const bar = page.getByRole('toolbar', { name: 'Selected blocks' });
  await expect(bar).toContainText('2 blocks selected');
  // Checking a Block does not open it.
  await expect(openedRows).toHaveCount(openedBefore);

  await bar.getByRole('button', { name: 'Delete blocks…' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete selected blocks?' });
  await expect(confirm).toContainText('Delete 2 blocks');
  await confirm.getByRole('button', { name: 'Delete 2 blocks', exact: true }).click();
  await expect(rows).toHaveCount(before - 2);
  await expect(bar).toHaveCount(0);

  await page.getByRole('button', { name: 'Blocks actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete all blocks on Saturday…', exact: true }).click();
  const confirmAll = page.getByRole('alertdialog', { name: 'Delete all blocks on Saturday?' });
  await confirmAll.getByRole('button', { name: `Delete ${before - 2} blocks`, exact: true }).click();
  await expect(table.locator('.table-empty')).toBeVisible();

  // The Blocking scenario menu holds blocking-scenario commands only.
  await openMenu(page, blockingScenarioMenu(page), 'Blocking scenario');
  await expect(page.getByRole('menu', { name: 'Blocking scenario', exact: true }).getByRole('menuitem', { name: 'Copy blocks from another day…' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});
