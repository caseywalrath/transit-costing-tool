import { expect, test, type Page } from '@playwright/test';

async function createShiftReadySchedule(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.locator('#dialog-name').fill('Unified action layer verification');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await page.getByRole('button', { name: 'Add route', exact: true }).click();

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
  await expect(runtimeSection.getByRole('button', { name: /^Profile: Default/ })).toBeVisible();
  await runtimeSection.getByLabel('Time band 1 segment 1').fill('10');
  await runtimeSection.getByLabel('Time band 1 segment 1').press('Tab');
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

  const tripsSection = page.locator('[aria-label="Trips section"]');
  const actions = tripsSection.getByRole('button', { name: 'Actions', exact: true });
  await actions.focus();
  await actions.press('ArrowDown');
  const actionMenu = page.getByRole('menu', { name: 'Trip actions' });
  await expect(actionMenu.getByRole('menuitem')).toHaveText([
    'Build trips…',
    'Add trip…',
    'Regenerate selected…',
    'Shift selected…',
    'Change pattern…',
    'Copy from day…',
    'Delete selected…',
  ]);
  await actionMenu.getByRole('menuitem', { name: 'Build trips…' }).click();
  await page.getByLabel('First Trip').fill('06:00');
  await page.getByLabel('Headway').fill('10');
  await page.getByLabel('Last Trip').fill('06:00');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(1);
}

test('stages Shift actions, guards scope changes, and persists only on Done', async ({ page }) => {
  await createShiftReadySchedule(page);

  const tripsSection = page.locator('[aria-label="Trips section"]');
  await page.locator('.schedule-table tbody input[type="checkbox"]').check();
  await tripsSection.getByRole('button', { name: 'Actions', exact: true }).click();
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

  await tripsSection.getByRole('button', { name: 'Actions', exact: true }).click();
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
