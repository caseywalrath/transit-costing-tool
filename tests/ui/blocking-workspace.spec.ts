import { expect, test } from '@playwright/test';

test.setTimeout(60_000);

async function createUsableRoute(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
  await page.locator('#dialog-name').fill('Blocking verification');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await page.getByRole('button', { name: 'Route actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New route', exact: true }).click();
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByLabel('Node name').fill('A');
  await page.getByRole('button', { name: 'Save nodes', exact: true }).click();
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByLabel('Node name').last().fill('B');
  await page.getByRole('button', { name: 'Save nodes', exact: true }).click();
  await page.getByRole('button', { name: 'Add pattern', exact: true }).click();
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await page.getByLabel('Point 2 node').selectOption({ label: 'B' });
  await page.getByRole('button', { name: 'Save Pattern', exact: true }).click();
  await page.getByRole('button', { name: 'Save and rebalance', exact: true }).click();
}

test('assigns, reassigns, and unassigns Trips from the Trips table by pill and bulk Actions', async ({ page }) => {
  await createUsableRoute(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Build trips…' }).click();
  await page.locator('.build-trips-drawer').getByLabel('Pattern').selectOption({ index: 1 });
  await page.getByLabel('First Trip').fill('06:00');
  await page.getByLabel('Headway').fill('10');
  await page.getByLabel('Last Trip').fill('06:20');
  await page.getByRole('button', { name: 'Build', exact: true }).click();

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const discardRouteChanges = page.getByRole('button', { name: 'Discard', exact: true });
  if (await discardRouteChanges.isVisible()) await discardRouteChanges.click();
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Blocking Scenario…', exact: true }).click();
  await page.getByRole('dialog', { name: 'New Blocking Scenario' }).getByLabel('Name').fill('Trips assignment');
  await page.getByRole('dialog', { name: 'New Blocking Scenario' }).getByRole('button', { name: 'Create', exact: true }).click();
  const currentBlock = page.getByLabel('Current Block');
  for (const name of ['Block 1', 'Block 2', 'Block 3']) {
    await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New Block' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Create Block', exact: true }).click();
  }

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const schedule = page.locator('.schedule-table');
  const firstTripBlock = schedule.getByRole('button', { name: /Block assignment for .*departing 6:00/ });
  await firstTripBlock.click();
  await page.getByRole('menu', { name: /Block assignment for/ }).getByRole('menuitemradio', { name: 'Block 1', exact: true }).click();
  const rowAssignment = page.getByRole('alertdialog', { name: 'Assign Trip to Block?' });
  await rowAssignment.getByRole('button', { name: 'Assign Trip', exact: true }).click();
  await expect(firstTripBlock).toContainText('Block 1');

  const secondTripBlock = schedule.getByRole('button', { name: /Block assignment for .*departing 6:10/ });
  await secondTripBlock.click();
  await page.getByRole('menu', { name: /Block assignment for/ }).getByRole('menuitemradio', { name: 'Block 2', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Assign Trip to Block?' }).getByRole('button', { name: 'Assign Trip', exact: true }).click();
  await expect(secondTripBlock).toContainText('Block 2');

  await schedule.getByRole('checkbox', { name: 'Select all trips' }).click();
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Assign Block…', exact: true }).click();
  const bulkDialog = page.getByRole('alertdialog', { name: 'Assign 3 selected Trips?' });
  await bulkDialog.getByLabel('Destination Block').selectOption({ label: 'Block 3' });
  await expect(bulkDialog).toContainText('2 selected Trips are currently in another Block and will be moved.');
  await expect(bulkDialog).toContainText('1 unassigned Trip will be assigned.');
  await bulkDialog.getByRole('button', { name: 'Assign 3 Trips', exact: true }).click();
  await expect(schedule.getByRole('button', { name: /departing 6:00: Block 3/ })).toBeVisible();
  await expect(schedule.getByRole('button', { name: /departing 6:10: Block 3/ })).toBeVisible();
  await expect(schedule.getByRole('button', { name: /departing 6:20: Block 3/ })).toBeVisible();

  await schedule.getByRole('button', { name: /departing 6:00: Block 3/ }).click();
  await page.getByRole('menu', { name: /Block assignment for/ }).getByRole('menuitemradio', { name: 'Block 1', exact: true }).click();
  const moveDialog = page.getByRole('alertdialog', { name: 'Move Trip to another Block?' });
  await moveDialog.getByRole('button', { name: 'Move Trip', exact: true }).click();
  await expect(schedule.getByRole('button', { name: /departing 6:00: Block 1/ })).toBeVisible();

  await schedule.getByRole('button', { name: /departing 6:00: Block 1/ }).click();
  await page.getByRole('menu', { name: /Block assignment for/ }).getByRole('menuitem', { name: 'Unassign from Block', exact: true }).click();
  const rowUnassignDialog = page.getByRole('alertdialog', { name: 'Unassign Trip from Block?' });
  await rowUnassignDialog.getByRole('button', { name: 'Unassign Trip', exact: true }).click();
  await expect(schedule.getByRole('button', { name: /departing 6:00: Unassigned/ })).toBeVisible();

  await schedule.getByRole('checkbox', { name: 'Select all trips' }).click();
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Unassign from Block…', exact: true }).click();
  const bulkUnassignDialog = page.getByRole('alertdialog', { name: 'Unassign selected Trips?' });
  await expect(bulkUnassignDialog).toContainText('2 selected Trips in “Block 3” will become unassigned.');
  await expect(bulkUnassignDialog).toContainText('1 selected Trip is already unassigned and will remain so.');
  await bulkUnassignDialog.getByRole('button', { name: 'Unassign 2 Trips', exact: true }).click();
  await expect(schedule.getByRole('button', { name: /departing 6:00: Unassigned/ })).toBeVisible();
  await expect(schedule.getByRole('button', { name: /departing 6:10: Unassigned/ })).toBeVisible();
  await expect(schedule.getByRole('button', { name: /departing 6:20: Unassigned/ })).toBeVisible();

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const blocksTable = page.locator('.blocking-blocks-table');
  await expect(blocksTable.locator('thead tr')).toContainText('Running');
  await expect(blocksTable.locator('thead tr')).toContainText('Revenue');
  await expect(page.getByLabel('Blocking summary').getByText('Running time')).toBeVisible();
  await expect(page.getByLabel('Blocking summary').getByText('Revenue hours')).toBeVisible();
  await expect(page.getByLabel('Blocking summary').getByText('Complete valid Blocks')).toHaveCount(0);
  await expect(page.getByLabel('Blocking summary').getByText('Invalid / incomplete')).toHaveCount(0);
});

test('creates an empty Blocking Scenario and an empty Block, then exposes its Trips context', async ({ page }) => {
  await createUsableRoute(page);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const discardRouteChanges = page.getByRole('button', { name: 'Discard', exact: true });
  if (await discardRouteChanges.isVisible()) await discardRouteChanges.click();
  await expect(page.getByLabel('Blocking controls')).toBeVisible();
  const blockingActions = page.getByRole('button', { name: 'Blocking actions', exact: true });
  await blockingActions.click();
  await page.getByRole('menuitem', { name: 'New Blocking Scenario…', exact: true }).click();
  const scenarioDialog = page.getByRole('dialog', { name: 'New Blocking Scenario' });
  await expect(scenarioDialog.getByLabel('Name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(scenarioDialog).toBeHidden();
  await blockingActions.click();
  await page.getByRole('menuitem', { name: 'New Blocking Scenario…', exact: true }).click();
  await scenarioDialog.getByLabel('Name').fill('Base blocks');
  await scenarioDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Blocking controls' }).getByRole('combobox', { name: 'Blocking Scenario' })).toHaveValue(/.+/);
  await expect(page.getByRole('heading', { name: 'Weekday Summary' })).toBeVisible();
  const currentBlock = page.getByLabel('Current Block');
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  const blockDialog = page.getByRole('dialog', { name: 'New Block' });
  await blockDialog.getByLabel('Name').fill('Block 11');
  await blockDialog.getByRole('button', { name: 'Create Block', exact: true }).click();
  await expect(currentBlock.getByRole('button', { name: /Block 11/ })).toBeVisible();
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  await blockDialog.getByLabel('Name').fill('Block 12');
  await blockDialog.getByRole('button', { name: 'Create Block', exact: true }).click();
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
  await page.screenshot({ path: 'test-results/blocking-workspace.png', fullPage: true });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(page.getByLabel('Current Block').getByRole('button', { name: /Block 11/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(page.getByLabel('Current Block').getByRole('button', { name: /Block 11/ })).toBeVisible();
  await page.getByLabel('Unassigned Trips').getByRole('button', { name: 'Unassigned Trip actions', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Compatible only', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Unassigned Trips').getByText('Assign after', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Insert before activity', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 600, height: 800 });
  await page.getByLabel('Current Block').getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Add pull-out…', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/blocking-workspace-narrow.png', fullPage: true });

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const tripsScenarioMenu = page.getByRole('button', { name: /Base blocks/ });
  await expect(tripsScenarioMenu).toBeVisible();
  await tripsScenarioMenu.click();
  await expect(page.getByRole('menuitem', { name: 'No Blocking Scenario', exact: true })).toHaveCount(0);
});

test('shift-click selects inclusive ranges in Unassigned Trips and Current Block', async ({ page }) => {
  await createUsableRoute(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const tripsSection = page.locator('[aria-label="Trips section"]');
  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Build trips…' }).click();
  await page.locator('.build-trips-drawer').getByLabel('Pattern').selectOption({ index: 1 });
  await page.getByLabel('First Trip').fill('06:00');
  await page.getByLabel('Headway').fill('10');
  await page.getByLabel('Last Trip').fill('06:20');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(3);

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const discardRouteChanges = page.getByRole('button', { name: 'Discard', exact: true });
  if (await discardRouteChanges.isVisible()) await discardRouteChanges.click();
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Blocking Scenario…', exact: true }).click();
  const scenarioDialog = page.getByRole('dialog', { name: 'New Blocking Scenario' });
  await scenarioDialog.getByLabel('Name').fill('Range blocks');
  await scenarioDialog.getByRole('button', { name: 'Create', exact: true }).click();
  const currentBlock = page.getByLabel('Current Block');
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  const blockDialog = page.getByRole('dialog', { name: 'New Block' });
  await blockDialog.getByLabel('Name').fill('Block 1');
  await blockDialog.getByRole('button', { name: 'Create Block', exact: true }).click();

  const unassigned = page.getByLabel('Unassigned Trips');
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

  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  await page.getByRole('dialog', { name: 'New Block' }).getByLabel('Name').fill('Block 2');
  await page.getByRole('dialog', { name: 'New Block' }).getByRole('button', { name: 'Create Block' }).click();
  await currentBlock.getByRole('button', { name: /Block 2/ }).click();
  await page.getByRole('menuitemradio', { name: 'Block 1', exact: true }).click();
  await currentBlock.locator('tbody input[type="checkbox"]').first().click();
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reassign Trips…' }).click();
  await page.getByRole('dialog', { name: 'Reassign Trips to Block' }).getByRole('button', { name: 'Reassign Trips' }).click();
  await expect(currentBlock.getByRole('button', { name: /Block 2/ })).toBeVisible();
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add pull-out…' }).click();
  const pullOutDialog = page.getByRole('dialog', { name: 'Add Pull-out' });
  await pullOutDialog.getByLabel('Minutes before first Trip').fill('12');
  await pullOutDialog.getByRole('combobox', { name: 'To', exact: true }).selectOption({ label: 'A' });
  await pullOutDialog.getByText('Apply to matching Blocks').click();
  await pullOutDialog.getByRole('button', { name: 'Review Blocks' }).click();
  await expect(pullOutDialog.getByRole('status')).toContainText('2 node matches · 2 add');
  await expect(pullOutDialog.getByRole('button', { name: 'Apply to Blocks' })).toBeEnabled();
  await page.screenshot({ path: 'test-results/bulk-boundary-preview.png', fullPage: true });
  await pullOutDialog.getByRole('button', { name: 'Apply to Blocks' }).click();
  await expect(currentBlock.getByRole('cell', { name: 'Pull-out', exact: true })).toBeVisible();
  await currentBlock.getByRole('button', { name: /Block 2/ }).click();
  await page.getByRole('menuitemradio', { name: 'Block 1', exact: true }).click();
  await expect(currentBlock.getByRole('cell', { name: 'Pull-out', exact: true })).toBeVisible();
});

test('filters and sorts Unassigned Trips while assignments insert by From Time', async ({ page }) => {
  await createUsableRoute(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const tripsSection = page.locator('[aria-label="Trips section"]');
  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Build trips…' }).click();
  await page.locator('.build-trips-drawer').getByLabel('Pattern').selectOption({ index: 1 });
  await page.getByLabel('First Trip').fill('06:00');
  await page.getByLabel('Headway').fill('10');
  await page.getByLabel('Last Trip').fill('06:20');
  await page.getByRole('button', { name: 'Build', exact: true }).click();

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const discardRouteChanges = page.getByRole('button', { name: 'Discard', exact: true });
  if (await discardRouteChanges.isVisible()) await discardRouteChanges.click();
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Blocking Scenario…', exact: true }).click();
  await page.getByRole('dialog', { name: 'New Blocking Scenario' }).getByLabel('Name').fill('Chronological blocks');
  await page.getByRole('dialog', { name: 'New Blocking Scenario' }).getByRole('button', { name: 'Create', exact: true }).click();
  const currentBlock = page.getByLabel('Current Block');
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  await page.getByRole('dialog', { name: 'New Block' }).getByLabel('Name').fill('Block 1');
  await page.getByRole('dialog', { name: 'New Block' }).getByRole('button', { name: 'Create Block', exact: true }).click();

  const unassigned = page.getByLabel('Unassigned Trips');
  await unassigned.getByRole('button', { name: 'Filter From Time' }).click();
  const filterDialog = page.getByRole('dialog', { name: 'Filter From Time' });
  await filterDialog.getByLabel('On or after').fill('6:10');
  await expect(unassigned.locator('tbody tr')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(filterDialog).toBeHidden();
  await unassigned.getByRole('button', { name: 'Unassigned Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Clear filters', exact: true }).click();
  await expect(unassigned.locator('tbody tr')).toHaveCount(3);
  await unassigned.getByRole('button', { name: /Sort by From Time/ }).click();
  await expect(unassigned.locator('tbody tr').first().locator('td').nth(3)).toHaveText('6:20');

  await unassigned.locator('tbody tr').filter({ hasText: '6:20' }).locator('.assign-button').click();
  await expect(unassigned.locator('tbody tr')).toHaveCount(2);
  const earlyTrip = unassigned.locator('tbody tr').filter({ hasText: '6:00' }).locator('.assign-button');
  await expect(earlyTrip).toBeEnabled();
  await expect(earlyTrip).toHaveText('Deadhead');
  await expect(earlyTrip).toHaveAccessibleName(/Needs deadhead/);
  await earlyTrip.click();
  await expect(currentBlock.locator('tbody tr')).toHaveCount(2);
  await expect(currentBlock.locator('tbody tr').first().locator('td').nth(4)).toHaveText('6:00');
  await expect(currentBlock.locator('tbody tr').nth(1).locator('td').nth(4)).toHaveText('6:20');
});
