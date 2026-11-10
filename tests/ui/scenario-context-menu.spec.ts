// Scenario context menu (Decision 0066 item 10, CM3): right-clicking a scenario in the Scenarios group opens Open, Rename…, Duplicate… and
// Delete scenario… for that scenario, which need not be the open one.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { seedSnapshot } from './support/dexieEnv';
import { chooseScenario, scenarioSwitcher } from './support/ui';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const SECOND = 'Second scenario';

/** Opens the golden project, creates "Second scenario", and switches back so the golden scenario is open. Returns its name. */
async function openGoldenWithSecondScenario(page: Page): Promise<string> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  const goldenName = (await scenarioSwitcher(page).getAttribute('aria-label'))!.replace(/^Scenario: /, '');
  await scenarioSwitcher(page).click();
  await page.getByRole('menuitem', { name: 'New scenario…', exact: true }).click();
  await page.locator('#dialog-name').fill(SECOND);
  await page.getByRole('button', { name: 'Create scenario', exact: true }).click();
  await expect(scenarioSwitcher(page)).toHaveAccessibleName(`Scenario: ${SECOND}`);
  await chooseScenario(page, goldenName);
  await expect(scenarioSwitcher(page)).toHaveAccessibleName(`Scenario: ${goldenName}`);
  return goldenName;
}

const scenarioItem = (page: Page, name: string) => page.getByRole('menu', { name: 'Scenario actions', exact: true }).getByRole('menuitemradio', { name, exact: true });

async function openScenarioContextMenu(page: Page, name: string) {
  await scenarioSwitcher(page).click();
  await scenarioItem(page, name).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: `${name} actions`, exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

test('Rename… renames a scenario that is not open, and the open scenario and tab stay', async ({ page }) => {
  const goldenName = await openGoldenWithSecondScenario(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const menu = await openScenarioContextMenu(page, SECOND);
  await menu.getByRole('menuitem', { name: 'Rename…', exact: true }).click();
  await page.locator('#dialog-name').fill('Renamed scenario');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();

  await expect(scenarioSwitcher(page)).toHaveAccessibleName(`Scenario: ${goldenName}`);
  await expect(page.getByRole('button', { name: 'Trips', exact: true })).toHaveAttribute('aria-current', 'page');
  await scenarioSwitcher(page).click();
  await expect(scenarioItem(page, 'Renamed scenario')).toBeVisible();
  await expect(scenarioItem(page, SECOND)).toHaveCount(0);
});

test('Delete scenario… on a scenario that is not open removes it, and the open scenario stays', async ({ page }) => {
  const goldenName = await openGoldenWithSecondScenario(page);
  const menu = await openScenarioContextMenu(page, SECOND);
  await menu.getByRole('menuitem', { name: 'Delete scenario…', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(`Delete “${SECOND}”`);
  await dialog.getByRole('button', { name: 'Delete scenario', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect(scenarioSwitcher(page)).toHaveAccessibleName(`Scenario: ${goldenName}`);
  await scenarioSwitcher(page).click();
  await expect(scenarioItem(page, SECOND)).toHaveCount(0);
  await expect(scenarioItem(page, goldenName)).toBeVisible();
});

test('Duplicate… from a scenario\'s context menu opens the copy', async ({ page }) => {
  await openGoldenWithSecondScenario(page);
  const menu = await openScenarioContextMenu(page, SECOND);
  await menu.getByRole('menuitem', { name: 'Duplicate…', exact: true }).click();
  await expect(page.locator('#dialog-name')).toHaveValue(`${SECOND} Copy`);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(scenarioSwitcher(page)).toHaveAccessibleName(`Scenario: ${SECOND} Copy`);
});

test('Shift+F10 on a scenario item opens its menu, and Escape returns focus to the item', async ({ page }) => {
  const goldenName = await openGoldenWithSecondScenario(page);
  await scenarioSwitcher(page).click();
  const item = scenarioItem(page, goldenName);
  await item.focus();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name: `${goldenName} actions`, exact: true });
  await expect(menu).toBeVisible();
  for (const label of ['Open', 'Rename…', 'Duplicate…', 'Delete scenario…']) await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  // The scenario is open, so Open is unavailable.
  await expect(menu.getByRole('menuitem', { name: 'Open', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(item).toBeFocused();
});
