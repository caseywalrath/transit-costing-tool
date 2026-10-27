import { expect, test, type Page } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

// Package P14: Blocking rules that the Blocking screen used to apply itself (findings 4-007, 4-014, 4-018; Decision 0039).
test.setTimeout(90_000);

async function openBlockingWithTrips(page: Page, tripCount: number) {
  await createRouteWithPattern(page, 'Blocking rules');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await runCommand(page, 'trips.build');
  await page.locator('.build-trips-drawer').getByLabel('Pattern').selectOption({ index: 1 });
  await page.getByLabel('First Trip').fill('06:00');
  await page.getByLabel('Headway').fill('10');
  await page.getByLabel('Last Trip').fill(`06:${String((tripCount - 1) * 10).padStart(2, '0')}`);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(tripCount);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Blocking Scenario…', exact: true }).click();
  const scenarioDialog = page.getByRole('dialog', { name: 'New Blocking Scenario' });
  await scenarioDialog.getByLabel('Name').fill('Rules');
  await scenarioDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Blocking controls' }).getByRole('combobox', { name: 'Blocking Scenario' })).toHaveValue(/.+/);
}

async function newBlock(page: Page, name?: string) {
  const currentBlock = page.getByLabel('Current Block');
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Block' });
  if (name !== undefined) await dialog.getByLabel('Name').fill(name);
  return dialog;
}

test('apply to all similar Trips adds a deadhead to every matching connection: 5 Trips give 4 deadheads', async ({ page }) => {
  await openBlockingWithTrips(page, 5);
  await (await newBlock(page)).getByRole('button', { name: 'Create Block', exact: true }).click();
  const unassigned = page.getByLabel('Unassigned Trips');
  for (let index = 0; index < 5; index += 1) {
    await expect(unassigned.locator('.assign-button').first()).toBeEnabled();
    await unassigned.locator('.assign-button').first().click();
    await expect(unassigned.locator('.assign-button')).toHaveCount(4 - index);
  }
  const currentBlock = page.getByLabel('Current Block');
  await expect(currentBlock.locator('tbody tr')).toHaveCount(5);
  await currentBlock.getByRole('button', { name: 'Add deadhead' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add Deadhead' });
  await dialog.getByLabel('Deadhead duration (minutes)').fill('3');
  await dialog.getByLabel('Apply to all similar Trips in this Block').check();
  await dialog.getByRole('button', { name: 'Add activity', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(currentBlock.locator('.deadhead-value')).toHaveCount(4);
  await expect(currentBlock.getByRole('button', { name: 'Add deadhead' })).toHaveCount(0);
  await expect(currentBlock.locator('.deadhead-value').first()).toHaveText(':03');
});

test('a blank minutes field is refused for a deadhead, a bulk pull-out, and a minimum layover', async ({ page }) => {
  await openBlockingWithTrips(page, 2);
  await (await newBlock(page)).getByRole('button', { name: 'Create Block', exact: true }).click();
  const unassigned = page.getByLabel('Unassigned Trips');
  for (let index = 0; index < 2; index += 1) {
    await expect(unassigned.locator('.assign-button').first()).toBeEnabled();
    await unassigned.locator('.assign-button').first().click();
    await expect(unassigned.locator('.assign-button')).toHaveCount(1 - index);
  }
  const currentBlock = page.getByLabel('Current Block');
  const error = page.locator('.notice.error');

  await currentBlock.getByRole('button', { name: 'Add deadhead' }).click();
  const deadheadDialog = page.getByRole('dialog', { name: 'Add Deadhead' });
  await deadheadDialog.getByLabel('Deadhead duration (minutes)').fill('');
  await deadheadDialog.getByRole('button', { name: 'Add activity', exact: true }).click();
  await expect(error).toHaveText(/Enter a non-negative whole-minute duration\./);
  await expect(deadheadDialog).toBeVisible();
  await deadheadDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(currentBlock.locator('.deadhead-value')).toHaveCount(0);
  await error.getByRole('button', { name: 'Dismiss message' }).click();

  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add pull-out…' }).click();
  const pullOut = page.getByRole('dialog', { name: 'Add Pull-out' });
  await pullOut.getByLabel('Minutes before first Trip').fill('');
  await pullOut.getByRole('combobox', { name: 'To', exact: true }).selectOption({ label: 'A' });
  await pullOut.getByText('Apply to matching Blocks').click();
  await pullOut.getByRole('button', { name: 'Review Blocks' }).click();
  await expect(error).toHaveText(/Enter a non-negative whole-minute duration\./);
  await pullOut.getByLabel('Minutes before first Trip').fill('');
  await pullOut.getByText('Apply to matching Blocks').click();
  await pullOut.getByRole('button', { name: 'Add activity' }).click();
  await expect(error).toHaveText(/Enter a non-negative whole-minute duration\./);
  await pullOut.getByRole('button', { name: 'Cancel' }).click();
  await expect(currentBlock.getByRole('cell', { name: 'Pull-out', exact: true })).toHaveCount(0);

  await page.getByLabel('Unassigned Trips').getByRole('button', { name: 'Unassigned Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: /Minimum layover/ }).click();
  const layover = page.getByRole('dialog', { name: 'Minimum layover' });
  await layover.getByLabel('Minutes', { exact: true }).fill('');
  await expect(layover.getByRole('alert')).toBeVisible();
  await expect(layover.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await layover.getByLabel('Minutes', { exact: true }).fill('0');
  await expect(layover.getByRole('button', { name: 'Apply' })).toBeEnabled();
});

test('a Block label is unique on its service day, and New Block proposes the first free "Block <n>"', async ({ page }) => {
  await openBlockingWithTrips(page, 1);
  const currentBlock = page.getByLabel('Current Block');
  const blockNames = async () => {
    await currentBlock.getByRole('button', { name: /^Block \d+/ }).first().click();
    const names = await page.getByRole('menuitemradio').allTextContents();
    await page.keyboard.press('Escape');
    return names.map((name) => name.trim()).sort();
  };

  for (const expected of ['Block 1', 'Block 2', 'Block 3']) {
    const dialog = await newBlock(page);
    await expect(dialog.getByLabel('Name')).toHaveValue(expected);
    await dialog.getByRole('button', { name: 'Create Block', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  const error = page.locator('.notice.error');
  const duplicate = await newBlock(page, ' Block 2 ');
  await duplicate.getByRole('button', { name: 'Create Block', exact: true }).click();
  await expect(error).toHaveText(/Another Block on this service day already uses that label\./);
  await duplicate.getByRole('button', { name: 'Cancel' }).click();
  expect(await blockNames()).toEqual(['Block 1', 'Block 2', 'Block 3']);

  // Delete the second Block: the next proposed label is the first free number, not the count plus one.
  await currentBlock.getByRole('button', { name: /^Block 3/ }).click();
  await page.getByRole('menuitemradio', { name: 'Block 2', exact: true }).click();
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete Block…' }).click();
  await page.getByRole('alertdialog', { name: 'Delete Block?' }).getByRole('button', { name: /^Delete/ }).last().click();
  await expect(page.getByRole('alertdialog', { name: 'Delete Block?' })).toBeHidden();
  expect(await blockNames()).toEqual(['Block 1', 'Block 3']);
  const proposed = await newBlock(page);
  await expect(proposed.getByLabel('Name')).toHaveValue('Block 2');
  await proposed.getByRole('button', { name: 'Create Block', exact: true }).click();
  await expect(proposed).toBeHidden();
  expect(await blockNames()).toEqual(['Block 1', 'Block 2', 'Block 3']);

  // A rename to another Block's label is refused; the Block keeps its name.
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename Block…' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename Block' });
  await rename.getByLabel('Name').fill('Block 1');
  await rename.getByRole('button', { name: /Rename|Save/ }).click();
  await expect(error).toHaveText(/Another Block on this service day already uses that label\./);
  await rename.getByRole('button', { name: 'Cancel' }).click();
  expect(await blockNames()).toEqual(['Block 1', 'Block 2', 'Block 3']);
});
