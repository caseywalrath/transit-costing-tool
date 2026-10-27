import { expect, test } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

test.setTimeout(60_000);

async function createUsableRoute(page: import('@playwright/test').Page) {
  await createRouteWithPattern(page, 'Blocking verification');
}

test('assigns, reassigns, and unassigns Trips from the Trips table by pill and bulk Actions', async ({ page }) => {
  await createUsableRoute(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await runCommand(page, 'trips.build');
  await page.locator('.build-trips-drawer').getByLabel('Pattern').selectOption({ index: 1 });
  await page.getByLabel('First trip').fill('06:00');
  await page.getByLabel('Headway').fill('10');
  await page.getByLabel('Last trip').fill('06:20');
  await page.getByRole('button', { name: 'Build', exact: true }).click();

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const discardRouteChanges = page.getByRole('button', { name: 'Discard', exact: true });
  // No Route draft is open, so there is nothing to discard. A conditional click here would hide a stray unsaved-Route banner.
  await expect(discardRouteChanges).toHaveCount(0);
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New blocking scenario…', exact: true }).click();
  await page.getByRole('dialog', { name: 'New blocking scenario' }).getByLabel('Name').fill('Trips assignment');
  await page.getByRole('dialog', { name: 'New blocking scenario' }).getByRole('button', { name: 'Create', exact: true }).click();
  const currentBlock = page.getByLabel('Current block');
  for (const name of ['Block 1', 'Block 2', 'Block 3']) {
    await currentBlock.getByRole('button', { name: 'New block', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New block' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Create block', exact: true }).click();
  }

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const schedule = page.locator('.schedule-table');
  const headings = (await schedule.locator('thead th').allTextContents()).map((heading) => heading.trim());
  expect(headings.indexOf('Run time')).toBe(headings.indexOf('Layover') - 1);
  const firstTripBlock = schedule.getByRole('button', { name: /Block assignment for .*departing 6:00/ });
  await firstTripBlock.click();
  await page.getByRole('menu', { name: /Block assignment for/ }).getByRole('menuitemradio', { name: 'Block 1', exact: true }).click();
  const rowAssignment = page.getByRole('alertdialog', { name: 'Assign trip to block?' });
  await rowAssignment.getByRole('button', { name: 'Assign trip', exact: true }).click();
  await expect(firstTripBlock).toContainText('Block 1');

  const secondTripBlock = schedule.getByRole('button', { name: /Block assignment for .*departing 6:10/ });
  await secondTripBlock.click();
  await page.getByRole('menu', { name: /Block assignment for/ }).getByRole('menuitemradio', { name: 'Block 2', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Assign trip to block?' }).getByRole('button', { name: 'Assign trip', exact: true }).click();
  await expect(secondTripBlock).toContainText('Block 2');

  await schedule.getByRole('checkbox', { name: 'Select all trips' }).click();
  await runCommand(page, 'trips.assignBlock');
  const bulkDialog = page.getByRole('alertdialog', { name: 'Assign 3 selected Trips?' });
  await bulkDialog.getByLabel('Destination block').selectOption({ label: 'Block 3' });
  await expect(bulkDialog).toContainText('2 selected Trips are currently in another Block and will be moved.');
  await expect(bulkDialog).toContainText('1 unassigned Trip will be assigned.');
  await bulkDialog.getByRole('button', { name: 'Assign 3 Trips', exact: true }).click();
  await expect(schedule.getByRole('button', { name: /departing 6:00: Block 3/ })).toBeVisible();
  await expect(schedule.getByRole('button', { name: /departing 6:10: Block 3/ })).toBeVisible();
  await expect(schedule.getByRole('button', { name: /departing 6:20: Block 3/ })).toBeVisible();

  await schedule.getByRole('button', { name: /departing 6:00: Block 3/ }).click();
  await page.getByRole('menu', { name: /Block assignment for/ }).getByRole('menuitemradio', { name: 'Block 1', exact: true }).click();
  const moveDialog = page.getByRole('alertdialog', { name: 'Move trip to another block?' });
  await moveDialog.getByRole('button', { name: 'Move trip', exact: true }).click();
  await expect(schedule.getByRole('button', { name: /departing 6:00: Block 1/ })).toBeVisible();

  await schedule.getByRole('button', { name: /departing 6:00: Block 1/ }).click();
  await page.getByRole('menu', { name: /Block assignment for/ }).getByRole('menuitem', { name: 'Unassign from block', exact: true }).click();
  const rowUnassignDialog = page.getByRole('alertdialog', { name: 'Unassign trip from block?' });
  await rowUnassignDialog.getByRole('button', { name: 'Unassign trip', exact: true }).click();
  await expect(schedule.getByRole('button', { name: /departing 6:00: Unassigned/ })).toBeVisible();

  await schedule.getByRole('checkbox', { name: 'Select all trips' }).click();
  await runCommand(page, 'trips.unassignBlock');
  const bulkUnassignDialog = page.getByRole('alertdialog', { name: 'Unassign selected trips?' });
  await expect(bulkUnassignDialog).toContainText('2 selected trips in “Block 3” will become unassigned.');
  await expect(bulkUnassignDialog).toContainText('1 selected trip is already unassigned and will remain so.');
  await bulkUnassignDialog.getByRole('button', { name: 'Unassign 2 trips', exact: true }).click();
  await expect(schedule.getByRole('button', { name: /departing 6:00: Unassigned/ })).toBeVisible();
  await expect(schedule.getByRole('button', { name: /departing 6:10: Unassigned/ })).toBeVisible();
  await expect(schedule.getByRole('button', { name: /departing 6:20: Unassigned/ })).toBeVisible();

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const blocksTable = page.locator('.blocking-blocks-table');
  await expect(blocksTable.locator('thead tr')).toContainText('Running');
  await expect(blocksTable.locator('thead tr')).toContainText('Revenue');
  await expect(page.getByLabel('Blocking summary').getByText('Running', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Blocking summary').getByText('Revenue', { exact: true })).toBeVisible();
  await expect(blocksTable.locator('tfoot')).toContainText(/Total · \d+ blocks?/);
  await expect(page.getByLabel('Blocking summary').getByText('Complete valid Blocks')).toHaveCount(0);
  await expect(page.getByLabel('Blocking summary').getByText('Invalid / incomplete')).toHaveCount(0);
});

test('creates an empty Blocking Scenario and an empty Block, then exposes its Trips context', async ({ page }) => {
  await createUsableRoute(page);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const discardRouteChanges = page.getByRole('button', { name: 'Discard', exact: true });
  // No Route draft is open, so there is nothing to discard. A conditional click here would hide a stray unsaved-Route banner.
  await expect(discardRouteChanges).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Scope' })).toBeVisible();
  const blockingActions = page.getByRole('button', { name: 'Blocking actions', exact: true });
  await blockingActions.click();
  await page.getByRole('menuitem', { name: 'New blocking scenario…', exact: true }).click();
  const scenarioDialog = page.getByRole('dialog', { name: 'New blocking scenario' });
  await expect(scenarioDialog.getByLabel('Name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(scenarioDialog).toBeHidden();
  await blockingActions.click();
  await page.getByRole('menuitem', { name: 'New blocking scenario…', exact: true }).click();
  await scenarioDialog.getByLabel('Name').fill('Base blocks');
  await scenarioDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Scope' }).getByRole('combobox', { name: 'Blocking scenario' })).toHaveValue(/.+/);
  await expect(page.getByRole('heading', { name: /^Weekday summary · \d+ blocks?$/ })).toBeVisible();
  const currentBlock = page.getByLabel('Current block');
  await currentBlock.getByRole('button', { name: 'New block', exact: true }).click();
  const blockDialog = page.getByRole('dialog', { name: 'New block' });
  await blockDialog.getByLabel('Name').fill('Block 11');
  await blockDialog.getByRole('button', { name: 'Create block', exact: true }).click();
  await expect(currentBlock.getByRole('button', { name: /Block 11/ })).toBeVisible();
  await currentBlock.getByRole('button', { name: 'New block', exact: true }).click();
  await blockDialog.getByLabel('Name').fill('Block 12');
  await blockDialog.getByRole('button', { name: 'Create block', exact: true }).click();
  await expect(currentBlock.getByRole('button', { name: /Block 12/ })).toBeVisible();
  await currentBlock.getByRole('button', { name: /Block 12/ }).click();
  await page.getByRole('menuitemradio', { name: 'Block 11', exact: true }).click();
  await expect(currentBlock.getByRole('button', { name: /Block 11/ })).toBeVisible();
  await expect(page.getByText('This empty Block is valid.')).toBeVisible();
  await blockingActions.click();
  const exportButton = page.getByRole('menuitem', { name: 'Export Blocking CSV (ZIP)', exact: true });
  const download = page.waitForEvent('download');
  await exportButton.click();
  expect((await download).suggestedFilename()).toBe('Base-blocks-csv.zip');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(page.getByLabel('Current block').getByRole('button', { name: /Block 11/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(page.getByLabel('Current block').getByRole('button', { name: /Block 11/ })).toBeVisible();
  // No Trips exist, so none are unassigned: the panel is its rail (BL-A).
  await expect(page.getByRole('button', { name: 'Expand unassigned trips, 0', exact: true })).toBeVisible();
  await expect(page.getByLabel('Unassigned trips', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Assign after', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Insert before activity', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 600, height: 800 });
  await page.getByLabel('Current block').getByRole('button', { name: 'Current block actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete block…', exact: true })).toBeVisible();
  // At 600 px the Current block menu opens inside the viewport and the page itself does not scroll sideways.
  const narrowMenu = page.getByRole('menu', { name: 'Current block actions' });
  const menuBox = await narrowMenu.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(600);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const tripsScenarioMenu = page.getByRole('button', { name: /Base blocks/ });
  await expect(tripsScenarioMenu).toBeVisible();
  await tripsScenarioMenu.click();
  await expect(page.getByRole('menuitem', { name: 'No blocking scenario', exact: true })).toHaveCount(0);
});

test('shift-click selects inclusive ranges in Unassigned Trips and Current block', async ({ page }) => {
  await createUsableRoute(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await runCommand(page, 'trips.build');
  await page.locator('.build-trips-drawer').getByLabel('Pattern').selectOption({ index: 1 });
  await page.getByLabel('First trip').fill('06:00');
  await page.getByLabel('Headway').fill('10');
  await page.getByLabel('Last trip').fill('06:20');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(3);

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const discardRouteChanges = page.getByRole('button', { name: 'Discard', exact: true });
  // No Route draft is open, so there is nothing to discard. A conditional click here would hide a stray unsaved-Route banner.
  await expect(discardRouteChanges).toHaveCount(0);
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New blocking scenario…', exact: true }).click();
  const scenarioDialog = page.getByRole('dialog', { name: 'New blocking scenario' });
  await scenarioDialog.getByLabel('Name').fill('Range blocks');
  await scenarioDialog.getByRole('button', { name: 'Create', exact: true }).click();
  const currentBlock = page.getByLabel('Current block');
  await currentBlock.getByRole('button', { name: 'New block', exact: true }).click();
  const blockDialog = page.getByRole('dialog', { name: 'New block' });
  await blockDialog.getByLabel('Name').fill('Block 1');
  await blockDialog.getByRole('button', { name: 'Create block', exact: true }).click();

  const unassigned = page.getByLabel('Unassigned trips');
  const unassignedCheckboxes = unassigned.locator('tbody input[type="checkbox"]');
  await expect(unassignedCheckboxes).toHaveCount(3);
  await expect(unassignedCheckboxes.nth(0)).toBeEnabled();
  await unassignedCheckboxes.nth(0).click();
  await unassignedCheckboxes.nth(2).click({ modifiers: ['Shift'] });
  for (let index = 0; index < 3; index += 1) await expect(unassignedCheckboxes.nth(index)).toBeChecked();

  for (let index = 0; index < 3; index += 1) await unassigned.locator('.assign-button').first().click();
  const blockCheckboxes = currentBlock.locator('tbody input[type="checkbox"]');
  await expect(blockCheckboxes).toHaveCount(3);
  await blockCheckboxes.nth(0).click();
  await blockCheckboxes.nth(2).click({ modifiers: ['Shift'] });
  for (let index = 0; index < 3; index += 1) await expect(blockCheckboxes.nth(index)).toBeChecked();

  await currentBlock.getByRole('button', { name: 'New block', exact: true }).click();
  await page.getByRole('dialog', { name: 'New block' }).getByLabel('Name').fill('Block 2');
  await page.getByRole('dialog', { name: 'New block' }).getByRole('button', { name: 'Create block' }).click();
  await currentBlock.getByRole('button', { name: /Block 2/ }).click();
  await page.getByRole('menuitemradio', { name: 'Block 1', exact: true }).click();
  await currentBlock.locator('tbody input[type="checkbox"]').first().click();
  await currentBlock.getByRole('toolbar', { name: 'Selected block trips' }).getByRole('button', { name: 'Move to block…', exact: true }).click();
  await page.getByRole('dialog', { name: 'Move trips to block' }).getByRole('button', { name: 'Move trips' }).click();
  await expect(currentBlock.getByRole('button', { name: /Block 2/ })).toBeVisible();
  await currentBlock.getByRole('button', { name: '+ Add pull-out', exact: true }).click();
  const pullOutDialog = page.getByRole('dialog', { name: 'Add Pull-out' });
  await pullOutDialog.getByLabel('Minutes before first trip').fill('12');
  await pullOutDialog.getByRole('combobox', { name: 'To', exact: true }).selectOption({ label: 'A' });
  await pullOutDialog.getByText('Apply to matching blocks').click();
  await pullOutDialog.getByRole('button', { name: 'Review blocks' }).click();
  await expect(pullOutDialog.getByRole('status')).toContainText('2 node matches · 2 add');
  await expect(pullOutDialog.getByRole('button', { name: 'Apply to blocks' })).toBeEnabled();
  await pullOutDialog.getByRole('button', { name: 'Apply to blocks' }).click();
  await expect(currentBlock.getByRole('cell', { name: 'Pull-out', exact: true })).toBeVisible();
  await currentBlock.getByRole('button', { name: /Block 2/ }).click();
  await page.getByRole('menuitemradio', { name: 'Block 1', exact: true }).click();
  await expect(currentBlock.getByRole('cell', { name: 'Pull-out', exact: true })).toBeVisible();
});

test('filters and sorts Unassigned Trips while assignments insert by From Time', async ({ page }) => {
  await createUsableRoute(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await runCommand(page, 'trips.build');
  await page.locator('.build-trips-drawer').getByLabel('Pattern').selectOption({ index: 1 });
  await page.getByLabel('First trip').fill('06:00');
  await page.getByLabel('Headway').fill('10');
  await page.getByLabel('Last trip').fill('06:20');
  await page.getByRole('button', { name: 'Build', exact: true }).click();

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const discardRouteChanges = page.getByRole('button', { name: 'Discard', exact: true });
  // No Route draft is open, so there is nothing to discard. A conditional click here would hide a stray unsaved-Route banner.
  await expect(discardRouteChanges).toHaveCount(0);
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New blocking scenario…', exact: true }).click();
  await page.getByRole('dialog', { name: 'New blocking scenario' }).getByLabel('Name').fill('Chronological blocks');
  await page.getByRole('dialog', { name: 'New blocking scenario' }).getByRole('button', { name: 'Create', exact: true }).click();
  const currentBlock = page.getByLabel('Current block');
  await currentBlock.getByRole('button', { name: 'New block', exact: true }).click();
  await page.getByRole('dialog', { name: 'New block' }).getByLabel('Name').fill('Block 1');
  await page.getByRole('dialog', { name: 'New block' }).getByRole('button', { name: 'Create block', exact: true }).click();

  const unassigned = page.getByLabel('Unassigned trips');
  await unassigned.getByRole('button', { name: 'Filter From time' }).click();
  const filterDialog = page.getByRole('dialog', { name: 'Filter From time' });
  await filterDialog.getByLabel('On or after').fill('6:10');
  await expect(unassigned.locator('tbody tr')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(filterDialog).toBeHidden();
  await unassigned.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(unassigned.getByRole('button', { name: 'Clear filters', exact: true })).toHaveCount(0);
  await expect(unassigned.locator('tbody tr')).toHaveCount(3);
  await unassigned.getByRole('button', { name: /Sort by From time/ }).click();
  await expect(unassigned.locator('tbody tr').first().locator('td').nth(3)).toHaveText('6:20');

  await unassigned.locator('tbody tr').filter({ hasText: '6:20' }).locator('.assign-button').click();
  await expect(unassigned.locator('tbody tr')).toHaveCount(2);
  const earlyTrip = unassigned.locator('tbody tr').filter({ hasText: '6:00' }).locator('.assign-button');
  await expect(earlyTrip).toBeEnabled();
  await expect(earlyTrip).toHaveText('Deadhead');
  await expect(earlyTrip).toHaveAccessibleName(/Needs deadhead/);
  await earlyTrip.click();
  const blockRows = currentBlock.locator('tbody tr:not(.blocking-add-row)');
  await expect(blockRows).toHaveCount(2);
  await expect(blockRows.first().locator('td').nth(4)).toHaveText('6:00');
  await expect(blockRows.nth(1).locator('td').nth(4)).toHaveText('6:20');
});
