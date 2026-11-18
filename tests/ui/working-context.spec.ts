// FX5 (Decision 0081 item 6): the Trip profile and Day last used in each Scenario are remembered on this device, the app says so when it
// has to open another Trip profile, and the window title names the working context.
import { expect, test, type Page } from '@playwright/test';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { goldenWithAltProfile } from './support/goldenFixture';
import { chooseScope, scopeText } from './support/ui';

test.setTimeout(120_000);

const STORAGE_KEY = 'transit-costing-tool.working-context.v1';
const profileButton = (page: Page) => page.locator('[aria-label="Trips section"]').locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button');
const fallbackNotice = (page: Page) => page.getByText('The trip profile open last time is no longer in this scenario.');

async function open(page: Page) {
  await seedSnapshot(page, { ...goldenWithAltProfile(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
}

async function reloadApp(page: Page) {
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
}

async function chooseProfile(page: Page, name: string) {
  await profileButton(page).click();
  await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitemradio', { name, exact: true }).click();
  await expect(profileButton(page)).toContainText(name);
}

test('a reload reopens the Trip profile and Day last used in the Scenario', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseProfile(page, 'Alt');
  await chooseScope(page, 'Day', { label: 'Saturday' });
  await expect.poll(() => scopeText(page, 'Day')).toBe('Saturday');

  await reloadApp(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(profileButton(page)).toContainText('Alt');
  await expect.poll(() => scopeText(page, 'Day')).toBe('Saturday');
});

test('a remembered Trip profile that no longer exists is replaced, with a notice shown once', async ({ page }) => {
  await open(page);
  const scenarioId = await runInPage(page, 'return (await e.db.scenarios.toArray())[0].id');
  await page.evaluate(({ key, scenarioId }) => {
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...stored, scenarios: { ...(stored.scenarios ?? {}), [scenarioId]: { tripProfileId: 'missing-profile' } } }));
  }, { key: STORAGE_KEY, scenarioId });

  await reloadApp(page);
  // The fallback is the Scenario's first Trip profile in stored order.
  const fallback = await runInPage(page, 'return (await e.db.tripProfiles.toArray())[0].name');
  await expect(page.getByText(`The trip profile open last time is no longer in this scenario. ${fallback} is open.`)).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss message' }).click();

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(profileButton(page)).toContainText(fallback);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(fallbackNotice(page)).toHaveCount(0);
});

test('deleting the open Trip profile does not show the fallback notice', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseProfile(page, 'Alt');
  await profileButton(page).click();
  await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitem', { name: 'Delete profile…' }).click();
  await page.getByRole('alertdialog').filter({ hasText: 'Delete trip profile?' }).getByRole('button', { name: 'Delete trip profile', exact: true }).click();

  await expect.poll(() => runInPage(page, 'return await e.db.tripProfiles.count()')).toBe(1);
  await expect(profileButton(page)).toContainText('Default');
  await expect(fallbackNotice(page)).toHaveCount(0);
});

test('the window title names the Route, Trip profile, and Scenario on Trips, and the Scenario on Costing', async ({ page }) => {
  await open(page);
  const names = await runInPage(page, 'const route = (await e.db.routes.toArray())[0]; const scenario = (await e.db.scenarios.toArray())[0]; return { route: route.shortName || route.name || "Untitled route", scenario: scenario.name };');

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseProfile(page, 'Alt');
  await expect(page).toHaveTitle(`${names.route} · Alt · ${names.scenario} — Transit Costing Tool`);

  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(page).toHaveTitle(`Costing · ${names.scenario} — Transit Costing Tool`);
});
