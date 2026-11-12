import { expect, test, type Page } from '@playwright/test';
import { seedSnapshot } from './support/dexieEnv';
import { goldenRaw } from './support/goldenFixture';
import { chooseScope, expectBlockingScenarioSelected, openMenu } from './support/ui';

test.setTimeout(120_000);
// A tall viewport keeps the Blocks table in view without scrolling.
test.use({ viewport: { width: 1280, height: 2400 } });

// Decision 0066 and CM2: the Blocking tab's rows and the Block picker item have context menus that act on that row or Block.
async function openSaturdayBlocking(page: Page) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Saturday' });
  await expectBlockingScenarioSelected(page);
  await expect(page.locator('.blocking-blocks-table tbody tr.selected-block-row')).toHaveCount(1);
}

const blockName = async (row: import('@playwright/test').Locator) => ((await row.locator('.blocking-block-name button').textContent()) ?? '').trim();
const currentBlockName = (page: Page) => blockName(page.locator('.blocking-blocks-table tbody tr.selected-block-row'));
const contextMenu = (page: Page, heading: string) => page.getByRole('menu', { name: `${heading} actions`, exact: true });
/** Right-clicks a target that is in view; a scroll would close the context menu (ContextMenu.tsx closes on scroll). */
async function rightClickInView(target: import('@playwright/test').Locator) {
  await target.click({ button: 'right' });
}

test('a Blocks row menu renames a block that is not the current block', async ({ page }) => {
  await openSaturdayBlocking(page);
  const current = await currentBlockName(page);
  const other = page.locator('.blocking-blocks-table tbody tr:not(.selected-block-row)').first();
  const label = await blockName(other);

  await rightClickInView(other.locator('td').nth(2));
  await contextMenu(page, label).getByRole('menuitem', { name: 'Rename block…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename block', exact: true });
  await expect(dialog.getByLabel('Name')).toHaveValue(label);
  await dialog.getByLabel('Name').fill(`${label} renamed`);
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Decision 0066 acceptance 6: renaming a block that is not current keeps the current block.
  await expect(page.locator('.blocking-blocks-table tbody tr.selected-block-row .blocking-block-name button')).toHaveText(current);
  await expect(page.locator('.blocking-blocks-table .blocking-block-name button', { hasText: `${label} renamed` })).toHaveCount(1);
});

test('deleting a block from its row menu keeps the current block selected', async ({ page }) => {
  await openSaturdayBlocking(page);
  const current = await currentBlockName(page);
  const rows = page.locator('.blocking-blocks-table tbody tr');
  const before = await rows.count();
  const other = page.locator('.blocking-blocks-table tbody tr:not(.selected-block-row)').first();
  const label = await blockName(other);

  await rightClickInView(other.locator('td').nth(2));
  await contextMenu(page, label).getByRole('menuitem', { name: 'Delete block…', exact: true }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete block?', exact: true });
  await confirm.getByRole('button', { name: 'Delete block', exact: true }).click();

  await expect(rows).toHaveCount(before - 1);
  await expect(page.locator('.blocking-blocks-table tbody tr.selected-block-row .blocking-block-name button')).toHaveText(current);
});

test('Show only a pattern from an Unassigned trip menu filters the list, and Clear filters restores it', async ({ page }) => {
  await openSaturdayBlocking(page);
  // The Saturday blocks start with no Unassigned trips, so three Trips are removed from the current block first (Remove from block… on a Trip row).
  for (let removed = 0; removed < 3; removed += 1) {
    await rightClickInView(page.locator('.block-activities-table tbody tr:has(input[aria-label^="Select trip"])').first().locator('td').nth(4));
    await contextMenu(page, 'Trip 1').getByRole('menuitem', { name: 'Remove from block…', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Remove Trip 1?', exact: true }).getByRole('button', { name: 'Remove Trip 1', exact: true }).click();
  }

  const rows = page.locator('.blocking-trips-table tbody tr:has(.pattern-pill)');
  // A Trip from another Route stays out of this Route's Unassigned list, so two of the three removed Trips are listed (SB and NB patterns).
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(2);
  const before = await rows.count();
  const first = rows.first();
  const pill = first.locator('.pattern-pill');
  const pattern = await pill.getAttribute('title');
  const time = ((await first.locator('.blocking-time-column').first().textContent()) ?? '').trim();
  const heading = `${((await pill.textContent()) ?? '').trim()} · ${time}`;

  await rightClickInView(pill);
  await contextMenu(page, heading).getByRole('menuitem', { name: `Show only ${pattern}`, exact: true }).click();
  await expect(page.locator(`.blocking-trips-table tbody .pattern-pill:not([title="${pattern}"])`)).toHaveCount(0);
  await expect(rows).toHaveCount(1);

  await rightClickInView(rows.first().locator('.pattern-pill'));
  await page.getByRole('menu').getByRole('menuitem', { name: 'Clear filters', exact: true }).click();
  await expect(rows).toHaveCount(before);
});

test('Move down from a Trip row menu changes the order of the current block', async ({ page }) => {
  await openSaturdayBlocking(page);
  const trips = page.locator('.block-activities-table tbody tr:has(input[aria-label^="Select trip"])');
  await expect.poll(() => trips.count()).toBeGreaterThanOrEqual(2);
  const fromCell = (index: number) => trips.nth(index).locator('td').nth(4);
  const firstTime = ((await fromCell(0).textContent()) ?? '').trim();
  const secondTime = ((await fromCell(1).textContent()) ?? '').trim();
  expect(firstTime).not.toBe(secondTime);

  await fromCell(0).click({ button: 'right' });
  await contextMenu(page, 'Trip 1').getByRole('menuitem', { name: 'Move down', exact: true }).click();
  await expect(fromCell(0)).toHaveText(secondTime);
  await expect(fromCell(1)).toHaveText(firstTime);
});

test('the Block picker item menu opens Open, Rename, Edit notes and Delete for that block', async ({ page }) => {
  await openSaturdayBlocking(page);
  const current = await currentBlockName(page);
  const trigger = page.getByRole('region', { name: 'Current block', exact: true }).locator('button.menu-trigger').filter({ hasText: current });
  await openMenu(page, trigger, 'Current block');
  const picker = page.getByRole('menu', { name: 'Current block', exact: true });
  const otherName = (await picker.getByRole('menuitemradio').allTextContents()).map((text) => text.trim()).find((text) => text !== current);
  expect(otherName).toBeDefined();

  await picker.getByRole('menuitemradio', { name: otherName, exact: true }).click({ button: 'right' });
  await expect(contextMenu(page, otherName!).getByRole('menuitem')).toHaveText(['Open', 'Rename block…', 'Edit notes…', 'Delete block…']);
});
