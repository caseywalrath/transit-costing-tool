// Decision 0076 item 10 (BSS4): the Trips Blocking scenario field menu holds New, Duplicate, Rename, and Delete, with the same items and dialogs as
// the Blocking tab. Auto-blocking and Export stay on the Blocking tab. The golden fixture has one Blocking Scenario, "Workbook Blocks", whose Blocks
// hold every Trip of the Weekday.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';
import { blockingScenarioMenu, blockingScenarioNames, chooseScope, openMenu, runCommand } from './support/ui';

test.setTimeout(150_000);
test.use({ actionTimeout: 15_000 });

const trigger = (page: Page): Locator => page.getByRole('button', { name: /^Blocking scenario: / });
const menu = (page: Page): Locator => page.getByRole('menu', { name: 'Blocking scenario', exact: true });
const pane = (page: Page, direction: string) => page.locator(`[aria-label="${direction} trips"]`);

/** The names listed in the Trips Blocking scenario menu. Opens the menu and closes it with Escape. */
async function tripsScenarioNames(page: Page): Promise<string[]> {
  await openMenu(page, trigger(page), 'Blocking scenario');
  const names = await menu(page).getByRole('menuitemradio').allTextContents();
  await page.keyboard.press('Escape');
  // A checked item carries a check mark in its text, so it is removed before the names are compared.
  return names.map((name) => name.replace(/^✓/, '').trim()).sort();
}

/** Waits until the menu lists exactly `names` (the list reloads after a write, so the first read can be early). */
async function expectTripsScenarioNames(page: Page, names: string[]) {
  await expect(async () => {
    expect(await tripsScenarioNames(page)).toEqual([...names].sort());
  }).toPass({ timeout: 20000 });
}

/** New from the Trips menu: names the scenario in the dialog and waits until Trips selects it. */
async function createScenario(page: Page, name: string) {
  await runCommand(page, 'tripsBlockingScenario.new');
  const dialog = page.getByRole('dialog', { name: 'New blocking scenario' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(trigger(page)).toHaveAccessibleName(`Blocking scenario: ${name}`, { timeout: 20000 });
}

test('the Trips Blocking scenario menu lists the scenarios, then New, Duplicate, Rename, and Delete, without Auto-blocking or Export', async ({ page }) => {
  await openGoldenTrips(page);
  await expect(trigger(page)).toHaveAccessibleName('Blocking scenario: Workbook Blocks');
  await openMenu(page, trigger(page), 'Blocking scenario');
  await expect(menu(page).getByRole('menuitemradio', { name: 'Workbook Blocks', exact: true })).toBeVisible();
  await expect(menu(page).getByRole('menuitem')).toHaveText(['New blocking scenario…', 'Duplicate blocking scenario…', 'Rename blocking scenario…', 'Delete blocking scenario…']);
  await expect(menu(page).getByRole('menuitem', { name: 'Auto-blocking…' })).toHaveCount(0);
  await expect(menu(page).getByRole('menuitem', { name: 'Export blocking CSV (ZIP)' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('New selects the new, empty scenario on Trips and lists it on Blocking', async ({ page }) => {
  await openGoldenTrips(page);
  await createScenario(page, 'Trips alt');
  await expectTripsScenarioNames(page, ['Workbook Blocks', 'Trips alt']);

  // The Blocking tab keeps its own remembered choice (Decision 0076 item 11), so only the listing is checked here.
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(blockingScenarioMenu(page)).toBeVisible();
  expect((await blockingScenarioNames(page)).map((name) => name.replace(/^✓/, '').trim())).toEqual(expect.arrayContaining(['Trips alt', 'Workbook Blocks']));
});

test('Rename updates the name on the Trips trigger and in the list', async ({ page }) => {
  await openGoldenTrips(page);
  await runCommand(page, 'tripsBlockingScenario.rename');
  const dialog = page.getByRole('dialog', { name: 'Rename blocking scenario' });
  await dialog.getByLabel('Name').fill('Renamed blocks');
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
  // A write and its reload finish after the dialog closes, so the trigger may update a moment later under load.
  await expect(trigger(page)).toHaveAccessibleName('Blocking scenario: Renamed blocks', { timeout: 20000 });
  await expectTripsScenarioNames(page, ['Renamed blocks']);
});

test('Duplicate lists a copy and keeps the selection on the original', async ({ page }) => {
  await openGoldenTrips(page);
  await runCommand(page, 'tripsBlockingScenario.duplicate');
  const dialog = page.getByRole('dialog', { name: 'Duplicate blocking scenario' });
  await expect(dialog.getByLabel('Name')).toHaveValue('Workbook Blocks Copy');
  await dialog.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expectTripsScenarioNames(page, ['Workbook Blocks', 'Workbook Blocks Copy']);
  await expect(trigger(page)).toHaveAccessibleName('Blocking scenario: Workbook Blocks');
});

test('Delete falls back to the remaining scenario', async ({ page }) => {
  await openGoldenTrips(page);
  await createScenario(page, 'Trips alt');
  await runCommand(page, 'tripsBlockingScenario.delete');
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('heading', { name: 'Delete blocking scenario?' })).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete blocking scenario', exact: true }).click();
  await expect(trigger(page)).toHaveAccessibleName('Blocking scenario: Workbook Blocks', { timeout: 20000 });
  await expectTripsScenarioNames(page, ['Workbook Blocks']);
});

test('side by side: New from the shared header leaves both panes with no assigned blocks', async ({ page }) => {
  await openGoldenTrips(page);
  await page.evaluate(() => localStorage.setItem('transit-costing-tool.trips-side-by-side.v1', JSON.stringify({ on: true })));
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Weekday' });
  await expect(pane(page, 'Southbound')).toBeVisible({ timeout: 30000 });
  const panes = [pane(page, 'Southbound'), pane(page, 'Northbound')];

  // Before New, the selected scenario assigns every Trip, so each pane shows Block pills.
  await expect(panes[0]!.locator('.schedule-table .block-pill').first()).toBeVisible();
  await createScenario(page, 'Side new');

  // The new scenario holds no Blocks, so every Trip in each pane reads Unassigned.
  for (const side of panes) {
    await expect(side.locator('.schedule-table tbody tr').first()).toBeVisible();
    await expect.poll(() => side.locator('.schedule-table .block-pill').count()).toBe(0);
    await expect.poll(async () => side.locator('.schedule-table tbody .trip-block-unassigned').count()).toBe(await side.locator('.schedule-table tbody tr').count());
  }
});
