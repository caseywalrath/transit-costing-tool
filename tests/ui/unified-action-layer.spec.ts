import { expect, test, type Page } from '@playwright/test';

test.setTimeout(60_000);

async function createShiftReadySchedule(page: Page, lastTrip = '06:00') {
  await page.goto('/');
  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
  await page.locator('#dialog-name').fill('Unified action layer verification');
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
  await page.getByRole('button', { name: 'Trips', exact: true }).click();

  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await expect(runtimeSection.locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button', { name: 'Default' })).toBeVisible();
  await runtimeSection.getByLabel('Time band 1 segment 1').fill(':07');
  await runtimeSection.getByLabel('Time band 1 segment 1').press('Tab');
  await expect(runtimeSection.getByLabel('Time band 1 segment 1')).toHaveValue(':07');
  await expect(runtimeSection.getByRole('columnheader', { name: 'Total', exact: true })).toBeVisible();
  await expect(runtimeSection.getByText(':07', { exact: true })).toBeVisible();
  await expect(runtimeSection.locator('.runtime-table thead th')).toHaveText(['From', 'To', 'A → B', 'Total', 'Time band actions']);
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

  const firstBandStart = await runtimeSection.getByLabel('Time band 1 start').inputValue();
  const firstBandEnd = await runtimeSection.getByLabel('Time band 1 end').inputValue();
  await runtimeSection.getByRole('button', { name: 'Duplicate time band 1' }).click();
  await expect(runtimeSection.getByLabel('Time band 2 start')).toHaveValue(firstBandStart);
  await expect(runtimeSection.getByLabel('Time band 2 end')).toHaveValue(firstBandEnd);
  await runtimeSection.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(runtimeSection.getByLabel('Time band 2 start')).toHaveCount(0);

  const tripsSection = page.locator('[aria-label="Trips section"]');
  const actions = tripsSection.getByRole('button', { name: 'Trip actions', exact: true });
  await actions.focus();
  await actions.press('ArrowDown');
  const actionMenu = page.getByRole('menu', { name: 'Trip actions' });
  await expect(actionMenu.getByRole('menuitem')).toHaveText([
    'Build trips…',
    'Add trip…',
    'Regenerate selected…',
    'Shift selected…',
    'Change pattern…',
    'Assign Block…',
    'Unassign from Block…',
    'Copy from day…',
    'Delete selected…',
  ]);
  await actionMenu.getByRole('menuitem', { name: 'Build trips…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Build Trips' });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByLabel('First Trip').fill('06:00');
  await drawer.getByLabel('Headway').fill('10');
  await drawer.getByLabel('Last Trip').fill(lastTrip);
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(lastTrip === '06:00' ? 1 : 3);
}

test('Build Trips uses a right drawer and supports inclusive last-trip and count limits', async ({ page }) => {
  await createShiftReadySchedule(page);
  const tripsSection = page.locator('[aria-label="Trips section"]');
  const openBuildDrawer = async () => {
    await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
    await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Build trips…' }).click();
    const drawer = page.getByRole('complementary', { name: 'Build Trips' });
    await drawer.getByLabel('Pattern').selectOption({ index: 1 });
    return drawer;
  };

  const byLastTrip = await openBuildDrawer();
  await byLastTrip.getByLabel('First Trip').fill('05:00');
  await byLastTrip.getByLabel('Headway').fill('15');
  await byLastTrip.getByLabel('Last Trip').fill('06:00');
  await expect(byLastTrip.getByLabel('Number of Trips')).toBeDisabled();
  await byLastTrip.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(6);

  const byCount = await openBuildDrawer();
  await byCount.getByLabel('First Trip').fill('07:00');
  await byCount.getByLabel('Headway').fill('10');
  await byCount.getByLabel('Number of Trips').fill('3');
  await expect(byCount.getByLabel('Last Trip')).toBeDisabled();
  await byCount.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(9);
  await expect(page.locator('.schedule-table')).toContainText('7:20');
});

test('stages Shift actions, guards scope changes, and persists only on Done', async ({ page }) => {
  await createShiftReadySchedule(page);

  const tripsSection = page.locator('[aria-label="Trips section"]');
  await page.locator('.schedule-table tbody input[type="checkbox"]').check();
  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();

  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: '− Back' }).click();
  await expect(page.getByText('Staged 1 minute earlier')).toBeVisible();
  await expect(page.locator('.schedule-table')).toContainText('5:59');

  await page.locator('.route-picker').getByLabel('Day').selectOption({ index: 1 });
  await expect(page.getByRole('heading', { name: 'Discard staged shift?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discard staged shift?' })).toHaveCount(0);

  await drawer.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Staged 1 minute earlier')).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByText('Staged 1 minute earlier')).toBeVisible();
  await drawer.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('.schedule-table')).toContainText('6:00');

  await tripsSection.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();
  await drawer.getByRole('button', { name: '+ Forward' }).click();
  await expect(page.getByText('Staged 1 minute later')).toBeVisible();
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('.schedule-table')).toContainText('6:01');

  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table')).toContainText('6:01');
});

test('shift-click selects the inclusive range in the Trips table', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const checkboxes = page.locator('.schedule-table tbody input[type="checkbox"]');
  await checkboxes.nth(0).click();
  await checkboxes.nth(2).click({ modifiers: ['Shift'] });
  await expect(checkboxes).toHaveCount(3);
  await expect(checkboxes.nth(0)).toBeChecked();
  await expect(checkboxes.nth(1)).toBeChecked();
  await expect(checkboxes.nth(2)).toBeChecked();
});
