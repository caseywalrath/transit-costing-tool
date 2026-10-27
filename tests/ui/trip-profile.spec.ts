import { expect, test } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { scopeField } from './support/ui';

test.setTimeout(60_000);

test('places Trip profile selection and lifecycle actions in the Trips header menu', async ({ page }) => {
  await createRouteWithPattern(page, 'Trip profile verification');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();

  const tripsSection = page.locator('[aria-label="Trips section"]');
  const profileButton = tripsSection.locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button');
  await expect(scopeField(page, 'Trip profile')).toHaveCount(0);
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
