// UR-6d: the Blocking tab layout (BL-A). The Unassigned trips panel sits beside Current block while there is something to assign and shrinks
// to a rail when the list is empty or the planner collapsed it. Selected rows get a selection bar, and the day summary is a stat strip.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { blockingScenarioMenu, runCommand } from './support/ui';

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
  await runCommand(page, 'blockingScenario.new');
  const scenarioDialog = page.getByRole('dialog', { name: 'New blocking scenario' });
  await scenarioDialog.getByLabel('Name').fill('Layout');
  await scenarioDialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(blockingScenarioMenu(page)).toHaveAccessibleName('Blocking scenario: Layout');
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

test('the Unassigned trips header shows the Show filter and Clear filters only while a filter is set', async ({ page }) => {
  await openBlockingWithTrips(page, 3);
  const panel = unassignedPanel(page);
  const show = panel.getByRole('combobox', { name: 'Show trips', exact: true });
  await expect(show).toHaveValue('all');
  await expect(show.locator('option')).toHaveText(['All trips', 'Possible', 'Possible, no deadhead', 'Possible, no deadhead, layover conflicts', 'Compatible only']);
  await expect(panel.getByRole('button', { name: 'Clear filters', exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Filter From time' }).click();
  await page.getByRole('dialog', { name: 'Filter From time' }).getByLabel('On or after').fill('6:10');
  await expect(panel.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Unassigned trip actions', exact: true })).toBeVisible();
});

test('the Layover column shows the gap to the block, and the Show filter hides deadhead trips without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openBlockingWithTrips(page, 3);
  const panel = unassignedPanel(page);
  const rows = panel.locator('tbody tr');
  await expect(panel.getByRole('columnheader', { name: 'Layover' })).toBeVisible();
  // An empty block has nothing to lay over against.
  const firstLayover = rows.first().locator('td.blocking-fit-layover-column');
  await expect(firstLayover).not.toHaveText(/\d/);
  await rows.first().getByRole('button', { name: /^Assign/ }).click();
  await expect(rows).toHaveCount(2);
  // Every Trip runs the same direction, so each remaining Trip needs a deadhead back to the start, with its layover beside it.
  await expect(rows.first().getByRole('button', { name: /^Needs deadhead/ })).toBeVisible();
  await expect(firstLayover).toHaveText(/^−?[\d:]+$/);
  const show = panel.getByRole('combobox', { name: 'Show trips', exact: true });
  await show.selectOption('possible');
  await expect(rows.getByRole('button', { name: /^Needs deadhead/ })).toHaveCount(2);
  await show.selectOption('noDeadhead');
  await expect(panel.getByText('No unassigned trips match the Show filter')).toBeVisible();
  await show.selectOption('all');
  await expect(rows.getByRole('button', { name: /^Needs deadhead/ })).toHaveCount(2);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const table of ['.blocking-trips-table', '.block-activities-table']) {
      expect(await page.locator(table).evaluate((element) => element.scrollWidth - element.clientWidth), `${table} at ${width}px`).toBeLessThanOrEqual(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `page at ${width}px`).toBeLessThanOrEqual(1);
  }
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

test('Decision 0076: Blocking summary comes first, holds the scenario menu and Blocks actions, and the scope bar has no Actions menu', async ({ page }) => {
  await openGoldenBlocking(page);
  const summary = page.getByRole('region', { name: 'Blocking summary', exact: true });
  const toggle = summary.getByRole('button', { name: /^Blocking summary · Weekday/ });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(summary.locator('.work-surface__count')).toHaveText(/^\d+$/);
  await expect(blockingScenarioMenu(page)).toHaveAccessibleName(/^Blocking scenario: .+/);
  await expect(summary.getByRole('button', { name: 'Blocks actions', exact: true })).toBeVisible();
  const scope = page.getByRole('region', { name: 'Scope', exact: true });
  await expect(scope.getByRole('button', { name: 'Blocking actions', exact: true })).toHaveCount(0);
  await expect(scope.getByLabel('Blocking scenario', { exact: true })).toHaveCount(0);
  // The summary sits above Unassigned trips and Current block.
  const summaryBox = await summary.boundingBox();
  const gridBox = await page.locator('.blocking-top').boundingBox();
  expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(gridBox!.y);
  // The scenario menu lists the scenarios, then the lifecycle commands, then Export.
  await openMenuByTrigger(page);
  const menu = page.getByRole('menu', { name: 'Blocking scenario', exact: true });
  await expect(menu.getByRole('menuitem')).toHaveText(['New blocking scenario…', 'Auto-blocking…', 'Duplicate blocking scenario…', 'Rename blocking scenario…', 'Delete blocking scenario…', 'Export blocking CSV (ZIP)']);
  await page.keyboard.press('Escape');
  await expect(blockingScenarioMenu(page)).toBeFocused();
});

async function openMenuByTrigger(page: Page) {
  await blockingScenarioMenu(page).click();
  await expect(page.getByRole('menu', { name: 'Blocking scenario', exact: true })).toBeVisible();
}

test('Decision 0076: collapsing Blocking summary keeps its header and one line of figures, and is remembered on this device', async ({ page }) => {
  await openGoldenBlocking(page);
  const summary = page.getByRole('region', { name: 'Blocking summary', exact: true });
  const toggle = summary.getByRole('button', { name: /^Blocking summary · Weekday/ });
  await expect(summary.locator('.work-surface__subtitle')).toHaveText('Select a block name to open it');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(summary.locator('.blocking-blocks-table')).toHaveCount(0);
  await expect(blockingScenarioMenu(page)).toBeVisible();
  await expect(summary.locator('.work-surface__subtitle')).toHaveText(/^Revenue [\d.,]+ h · Platform [\d.,]+ h · Layover [\d.]+% · Deadhead [\d.]+% · Peak pullout \d+$/);
  expect(await page.evaluate(() => localStorage.getItem('transit-costing-tool.blocking-summary-open.v1'))).toBe('{"open":false}');
  await page.reload();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Blocking summary', exact: true }).getByRole('button', { name: /^Blocking summary · Weekday/ })).toHaveAttribute('aria-expanded', 'false');
});

test('the day summary is a ten-cell strip above the Blocks table, and the footer counts the blocks', async ({ page }) => {
  await openGoldenBlocking(page);
  const summary = page.getByLabel('Blocking summary');
  await expect(summary.locator('.stat-strip dt')).toHaveText(['Revenue', 'Running', 'Platform', 'Layover', 'Layover %of revenue hours', 'Deadhead', 'Deadhead %of platform hours', 'Revenue miles', 'Platform miles', 'Peak pulloutvehicles at once']);
  // Figures share one baseline whatever the label height.
  const bottoms = await summary.locator('.stat-strip dd').evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().bottom)));
  expect(new Set(bottoms).size).toBe(1);
  const stripBox = await summary.locator('.stat-strip').boundingBox();
  const table = summary.locator('.blocking-blocks-table');
  const tableBox = await table.boundingBox();
  expect(stripBox!.y + stripBox!.height).toBeLessThanOrEqual(tableBox!.y);
  await expect(table.locator('tfoot')).toContainText(/Total · \d+ blocks/);
  // The golden weekday has more Blocks than fit: the table scrolls inside the surface, with its heading and totals rows still visible.
  const scroll = await table.evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight }));
  expect(scroll.scroll).toBeGreaterThan(scroll.client);
  await table.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const [head, foot, box] = await Promise.all([table.locator('thead th').first().boundingBox(), table.locator('tfoot th').boundingBox(), table.boundingBox()]);
  expect(Math.round(head!.y)).toBeGreaterThanOrEqual(Math.round(box!.y));
  expect(Math.round(foot!.y + foot!.height)).toBeLessThanOrEqual(Math.round(box!.y + box!.height) + 1);
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
