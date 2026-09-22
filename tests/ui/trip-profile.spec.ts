import { expect, test } from '@playwright/test';

test('places Trip profile selection and lifecycle actions in the Trips header menu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New Project', exact: true }).click();
  await page.locator('#dialog-name').fill('Trip profile verification');
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

  const tripsSection = page.locator('[aria-label="Trips section"]');
  const profileButton = tripsSection.locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button');
  await expect(page.locator('.route-picker').getByLabel('Trip Profile')).toHaveCount(0);
  await expect(page.locator('.trip-profile-context')).toHaveCount(0);
  const [profileControlsBox, scheduleTableBox] = await Promise.all([
    profileButton.boundingBox(),
    page.locator('.schedule-table').boundingBox(),
  ]);
  expect(profileControlsBox).not.toBeNull();
  expect(scheduleTableBox).not.toBeNull();
  expect(scheduleTableBox!.y).toBeGreaterThanOrEqual(profileControlsBox!.y + profileControlsBox!.height);
  await expect(profileButton).toBeVisible();
  await profileButton.focus();
  await profileButton.press('ArrowDown');
  await expect(profileButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('menu', { name: 'Trip profile' })).toBeVisible();
  await profileButton.press('Escape');
  await expect(profileButton).toHaveAttribute('aria-expanded', 'false');
  await profileButton.click();
  const menu = page.getByRole('menu', { name: 'Trip profile' });
  await expect(menu.getByRole('menuitemradio', { checked: true })).toHaveCount(1);
  await menu.getByRole('menuitem', { name: 'Copy profile…' }).click();
  await expect(page.getByRole('heading', { name: 'Copy Trip Profile' })).toBeVisible();
  await page.locator('#dialog-name').fill('Alternative');
  await page.getByRole('button', { name: 'Copy', exact: true }).last().click();
  await expect(profileButton).toContainText('Alternative');

  await profileButton.click();
  await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitem', { name: 'Delete profile…' }).click();
  await expect(page.getByRole('heading', { name: 'Delete Trip profile?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete Trip profile?' })).toHaveCount(0);
});
