// UR-6d: the Blocking tab layout (BL-A). The Unassigned trips panel sits beside Current block while there is something to assign and shrinks
// to a rail when the list is empty or the planner collapsed it. Selected rows get a selection bar, and the day summary is a stat strip.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const COLLAPSED_KEY = 'transit-costing-tool.blocking-unassigned-collapsed.v1';
const currentBlock = (page: Page) => page.getByRole('region', { name: 'Current block', exact: true });
const unassignedPanel = (page: Page) => page.getByLabel('Unassigned trips', { exact: true });
const rail = (page: Page, count: number) => page.getByRole('button', { name: `Expand unassigned trips, ${count}`, exact: true });
const collapseButton = (page: Page) => page.getByRole('button', { name: 'Collapse unassigned trips', exact: true });

/** A new route with `tripCount` generated Trips on the weekday, a Blocking Scenario, and one empty Block. */
async function openBlockingWithTrips(page: Page, tripCount: number) {
  await createRouteWithPattern(page, 'Blocking layout');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await runCommand(page, 'trips.build');
  await page.locator('.build-trips-drawer').getByLabel('Pattern').selectOption({ index: 1 });
  await page.getByLabel('First trip').fill('06:00');
  await page.getByLabel('Headway').fill('10');
  await page.getByLabel('Last trip').fill(`06:${String((tripCount - 1) * 10).padStart(2, '0')}`);
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(tripCount);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New blocking scenario…', exact: true }).click();
  const scenarioDialog = page.getByRole('dialog', { name: 'New blocking scenario' });
  await scenarioDialog.getByLabel('Name').fill('Layout');
  await scenarioDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Scope' }).getByRole('combobox', { name: 'Blocking scenario' })).toHaveValue(/.+/);
  await runCommand(page, 'block.new');
  await page.getByRole('dialog', { name: 'New block' }).getByRole('button', { name: 'Create block', exact: true }).click();
  await expect(currentBlock(page).getByText('This empty Block is valid.')).toBeVisible();
}

async function openGoldenBlocking(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Scope' })).toBeVisible();
}

test('the panel is a rail when the last unassigned Trip is assigned, and the side layout returns when a Trip is unassigned', async ({ page }) => {
  await openBlockingWithTrips(page, 2);
  await expect(unassignedPanel(page)).toBeVisible();
  await expect(page.locator('.blocking-top')).toHaveClass(/blocking-top--side/);
  for (let index = 0; index < 2; index += 1) {
    await expect(unassignedPanel(page).locator('.assign-button').first()).toBeEnabled();
    await unassignedPanel(page).locator('.assign-button').first().click();
    await expect(unassignedPanel(page).locator('.assign-button')).toHaveCount(1 - index);
  }
  await expect(rail(page, 0)).toBeVisible();
  await expect(unassignedPanel(page)).toHaveCount(0);
  await expect(page.locator('.blocking-top')).toHaveClass(/blocking-top--rail/);
  await expect(page.locator('.unassigned-rail__badge--ok')).toHaveText('0');
  // Removing a Trip from the Block makes it unassigned again, and the panel returns.
  await currentBlock(page).getByRole('button', { name: 'Remove Trip 1', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove Trip 1', exact: true }).click();
  await expect(unassignedPanel(page)).toBeVisible();
  await expect(page.locator('.blocking-top')).toHaveClass(/blocking-top--side/);
  await expect(unassignedPanel(page).locator('.assign-button')).toHaveCount(1);
});

test('the rail expands and collapses by keyboard, keeps the focus, and the collapse persists across a reload', async ({ page }) => {
  await openBlockingWithTrips(page, 2);
  await collapseButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(rail(page, 2)).toBeFocused();
  await expect(page.locator('.blocking-top')).toHaveClass(/blocking-top--rail/);
  await expect(page.locator('.unassigned-rail__badge--warn')).toHaveText('2');
  expect(await page.evaluate((key) => localStorage.getItem(key), COLLAPSED_KEY)).toBe('{"collapsed":true}');
  await page.reload();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(rail(page, 2)).toBeVisible();
  await expect(unassignedPanel(page)).toHaveCount(0);
  await rail(page, 2).focus();
  await page.keyboard.press('Enter');
  await expect(unassignedPanel(page)).toBeVisible();
  await expect(collapseButton(page)).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), COLLAPSED_KEY)).toBe('{"collapsed":false}');
  await page.reload();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(unassignedPanel(page)).toBeVisible();
});

test('a collapsed panel stays collapsed when Trips become unassigned, and the badge shows the count in the warning colour', async ({ page }) => {
  await openBlockingWithTrips(page, 1);
  await unassignedPanel(page).locator('.assign-button').first().click();
  await expect(rail(page, 0)).toBeVisible();
  // The planner collapsed it earlier: only the stored choice is read here, so it is set directly and the page reloaded.
  await page.evaluate((key) => localStorage.setItem(key, '{"collapsed":true}'), COLLAPSED_KEY);
  await page.reload();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(rail(page, 0)).toBeVisible();
  await currentBlock(page).getByRole('button', { name: 'Remove Trip 1', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove Trip 1', exact: true }).click();
  await expect(rail(page, 1)).toBeVisible();
  await expect(page.locator('.unassigned-rail__badge--warn')).toHaveText('1');
  await expect(unassignedPanel(page)).toHaveCount(0);
  // A malformed stored value reads as not collapsed.
  await page.evaluate((key) => localStorage.setItem(key, 'collapsed'), COLLAPSED_KEY);
  await page.reload();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(unassignedPanel(page)).toBeVisible();
});

test('the Unassigned trips header shows Compatible only as a toggle and Clear filters only while a filter is set', async ({ page }) => {
  await openBlockingWithTrips(page, 3);
  const panel = unassignedPanel(page);
  const compatibleOnly = panel.getByRole('button', { name: 'Compatible only', exact: true });
  await expect(compatibleOnly).toHaveAttribute('aria-pressed', 'false');
  await compatibleOnly.click();
  await expect(compatibleOnly).toHaveAttribute('aria-pressed', 'true');
  await compatibleOnly.click();
  await expect(compatibleOnly).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.getByRole('button', { name: 'Clear filters', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Filter From time' }).click();
  await page.getByRole('dialog', { name: 'Filter From time' }).getByLabel('On or after').fill('6:10');
  await expect(panel.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Unassigned trip actions', exact: true })).toBeVisible();
});

test('selected unassigned Trips are assigned from the selection bar to the current Block', async ({ page }) => {
  await openBlockingWithTrips(page, 3);
  const panel = unassignedPanel(page);
  const toolbar = page.getByRole('toolbar', { name: 'Selected unassigned trips' });
  await expect(toolbar).toHaveCount(0);
  const checkboxes = panel.locator('tbody input[type="checkbox"]');
  await expect(checkboxes.nth(0)).toBeEnabled();
  await checkboxes.nth(0).click();
  await checkboxes.nth(1).click();
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByText('2 selected', { exact: true })).toBeVisible();
  await toolbar.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(toolbar).toHaveCount(0);
  await checkboxes.nth(0).click();
  await checkboxes.nth(1).click();
  await runCommand(page, 'unassigned.assignSelected');
  await expect(currentBlock(page).locator('tbody tr:not(.blocking-add-row)')).toHaveCount(2);
  await expect(panel.locator('.assign-button')).toHaveCount(1);
  await expect(toolbar).toHaveCount(0);
});

test('selected Block Trips are removed or moved from the Block selection bar', async ({ page }) => {
  await openBlockingWithTrips(page, 3);
  const panel = unassignedPanel(page);
  await panel.locator('tbody input[type="checkbox"]').nth(0).click();
  await panel.locator('tbody input[type="checkbox"]').nth(1).click();
  await runCommand(page, 'unassigned.assignSelected');
  const toolbar = page.getByRole('toolbar', { name: 'Selected block trips' });
  await expect(toolbar).toHaveCount(0);
  const checkboxes = currentBlock(page).locator('tbody input[type="checkbox"]');
  await expect(checkboxes).toHaveCount(2);
  await checkboxes.nth(0).click();
  await expect(toolbar.getByText('1 trip selected', { exact: true })).toBeVisible();
  // With one Block there is nowhere to move to.
  await expect(toolbar.getByRole('button', { name: 'Move to block…', exact: true })).toBeDisabled();
  await runCommand(page, 'block.removeTrips');
  await page.getByRole('alertdialog', { name: 'Remove selected trips?' }).getByRole('button', { name: 'Remove from block', exact: true }).click();
  await expect(currentBlock(page).locator('tbody tr:not(.blocking-add-row)')).toHaveCount(1);
  await expect(toolbar).toHaveCount(0);
});

test('"+ Add pull-out" and "+ Add pull-in" are table rows that disappear once the activity exists', async ({ page }) => {
  await openBlockingWithTrips(page, 1);
  await unassignedPanel(page).locator('.assign-button').first().click();
  const block = currentBlock(page);
  const rows = block.locator('tbody tr');
  await expect(rows.first()).toContainText('+ Add pull-out');
  await expect(rows.last()).toContainText('+ Add pull-in');
  await runCommand(page, 'block.addPullOut');
  const dialog = page.getByRole('dialog', { name: 'Add Pull-out' });
  await dialog.getByLabel('Minutes before first trip').fill('10');
  await dialog.getByRole('combobox', { name: 'To', exact: true }).selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Add activity', exact: true }).click();
  await expect(block.getByRole('button', { name: '+ Add pull-out', exact: true })).toHaveCount(0);
  await expect(block.getByRole('button', { name: '+ Add pull-in', exact: true })).toBeVisible();
});

test('the Current block header shows the subtitle, New block, and a menu with Rename, Edit notes and Delete', async ({ page }) => {
  await openGoldenBlocking(page);
  await currentBlock(page).locator('.menu-field').getByRole('button').first().click();
  await page.getByRole('menuitemradio', { name: '26', exact: true }).click();
  const header = currentBlock(page).locator('.work-surface__header');
  await expect(header.getByRole('heading', { name: 'Current block' })).toBeVisible();
  await expect(header.locator('.work-surface__subtitle')).toContainText(/^\d+ trips · \d+:\d\d(:\d\d)? – \d+:\d\d(:\d\d)? · Revenue [\d.]+ h · Layover [\d.]+%$/);
  await expect(header.getByRole('button', { name: 'New block', exact: true })).toBeVisible();
  await header.getByRole('button', { name: 'Current block actions', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Current block actions' }).getByRole('menuitem')).toHaveText(['Rename block…', 'Edit notes…', 'Delete block…']);
});

test('the day summary is a seven-cell strip above the Blocks table, and the footer counts the blocks', async ({ page }) => {
  await openGoldenBlocking(page);
  const summary = page.getByLabel('Blocking summary');
  await expect(summary.getByRole('heading', { name: /^Weekday summary · \d+ blocks$/ })).toBeVisible();
  await expect(summary.locator('.stat-strip dt')).toHaveText(['Revenue', 'Running', 'Platform', 'Layover', 'Deadhead', 'Revenue miles', 'Platform miles']);
  const summaryBox = await summary.boundingBox();
  const blocksBox = await page.getByLabel('Blocks', { exact: true }).boundingBox();
  expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(blocksBox!.y);
  await expect(page.getByLabel('Blocks', { exact: true }).locator('tfoot')).toContainText(/Total · \d+ blocks/);
});

test('at 1440 px the Current block table shows every column without sideways scrolling in side mode', async ({ page }) => {
  await openGoldenBlocking(page, 1440);
  // Every weekday Trip of the golden project is assigned, so Block 11 is deleted to leave its Trips unassigned.
  await runInPage(page, "const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday'); const block = (await e.db.blocks.toArray()).find((item) => item.label === '11' && item.serviceDayId === day.id); await e.db.blocks.delete(block.id);");
  await page.reload();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(unassignedPanel(page)).toBeVisible();
  await currentBlock(page).locator('.menu-field').getByRole('button').first().click();
  await page.getByRole('menuitemradio', { name: '26', exact: true }).click();
  await expect(page.locator('.blocking-top')).toHaveClass(/blocking-top--side/);
  const table = currentBlock(page).locator('.block-activities-table');
  await expect(table.locator('thead th')).toHaveCount(10);
  const widths = await table.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  const unassignedTable = unassignedPanel(page).locator('.blocking-trips-table');
  const unassignedWidths = await unassignedTable.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(unassignedWidths.scroll).toBeLessThanOrEqual(unassignedWidths.client);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('no unassigned Trips: the rail leaves Current block the full width, and the page does not scroll sideways', async ({ page }) => {
  await openGoldenBlocking(page, 1440);
  // Every weekday Trip of the golden project is assigned.
  await expect(rail(page, 0)).toBeVisible();
  const railBox = await rail(page, 0).boundingBox();
  expect(railBox!.width).toBeLessThanOrEqual(48);
  const blockBox = await currentBlock(page).boundingBox();
  expect(blockBox!.x).toBeGreaterThan(railBox!.x + railBox!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
