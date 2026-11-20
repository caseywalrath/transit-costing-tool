// FX6 (Decision 0081, D5 to D7): one working context in the scope bar: Project › Scenario › Trip profile › Blocking scenario.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw, goldenWithAltProfile } from './support/goldenFixture';
import { seedSnapshot } from './support/dexieEnv';

test.setTimeout(90_000);

const crumb = (page: Page, kind: string) => page.getByRole('region', { name: 'Scope' }).getByRole('button', { name: new RegExp(`^${kind}: `) });

async function open(page: Page, raw: any) {
  await seedSnapshot(page, { ...raw, generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
}

test('Trips, Blocking, and Costing share the Trip profile and Blocking scenario of the breadcrumb', async ({ page }) => {
  await open(page, goldenWithAltProfile());
  await expect(crumb(page, 'Trip profile')).toHaveCount(0);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await crumb(page, 'Trip profile').click();
  await page.getByRole('menu', { name: 'Trip profile', exact: true }).getByRole('menuitemradio', { name: 'Default' }).click();
  await expect(crumb(page, 'Trip profile')).toContainText('Default');
  // The working Blocking scenario follows the profile change a moment later; read it only once it is chosen.
  await expect(crumb(page, 'Blocking scenario')).not.toContainText('No blocking scenario');
  const blocking = (await crumb(page, 'Blocking scenario').textContent())?.replace(/^Blocking scenario/, '').replace('▾', '').trim();
  expect(blocking).toBeTruthy();

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(crumb(page, 'Trip profile')).toContainText('Default');
  await expect(crumb(page, 'Blocking scenario')).toContainText(blocking!);

  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(crumb(page, 'Trip profile')).toContainText('Default');
  await page.getByRole('radiogroup', { name: 'Cost basis' }).getByRole('radio', { name: 'Blocked' }).click();
  await expect(crumb(page, 'Blocking scenario')).toContainText(blocking!);
  await page.getByRole('radiogroup', { name: 'Cost basis' }).getByRole('radio', { name: 'Estimated' }).click();
  // The level stays in place, disabled, so the header does not shift.
  await expect(crumb(page, 'Blocking scenario')).toBeDisabled();

  // A Trip profile chosen on Costing is the one Trips opens.
  await crumb(page, 'Trip profile').click();
  await page.getByRole('menu', { name: 'Trip profile', exact: true }).getByRole('menuitemradio', { name: 'Alt' }).click();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(crumb(page, 'Trip profile')).toContainText('Alt');
});

test('a level with one choice has no identity dot; a level with two has one', async ({ page }) => {
  await open(page, goldenRaw());
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(crumb(page, 'Trip profile')).toBeVisible();
  await expect(crumb(page, 'Trip profile').locator('.identity-dot')).toHaveCount(0);
  await expect(crumb(page, 'Scenario').locator('.identity-dot')).toHaveCount(0);

  await open(page, goldenWithAltProfile());
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(crumb(page, 'Trip profile').locator('.identity-dot')).toHaveCount(1);
});

test('the breadcrumb stays on one row at 1024 px, and the Trip profile name is not cut', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await open(page, goldenWithAltProfile());
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(crumb(page, 'Trip profile')).toBeVisible();
  const bar = await page.getByRole('region', { name: 'Scope' }).boundingBox();
  expect(bar!.height).toBeLessThan(60);
  const name = crumb(page, 'Trip profile').locator('.switcher__name');
  expect(await name.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
