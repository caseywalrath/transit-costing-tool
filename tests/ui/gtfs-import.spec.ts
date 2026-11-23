// The GTFS import dialog and its entry points (Decision 0089; sub-plans I8 and I9). The first tests mount the dialog from its module
// (tests/ui/support/gtfsImport.ts) to look at one step; the later ones open it through the menus and import. Screenshots go to
// GTFS_SHOTS_DIR when that variable is set, for review.
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { mountGtfsImport } from './support/gtfsImport';
import { blockingScenarioMenu, chooseScenario, costBasisText, projectSwitcher, runCommand, scenarioSwitcher } from './support/ui';

const MINI_FEED = fileURLToPath(new URL('../fixtures/gtfs/zips/mini-deflate.zip', import.meta.url));
const NO_DIRECTION_FEED = fileURLToPath(new URL('../fixtures/gtfs/zips/edge-no-direction-deflate.zip', import.meta.url));
const SHOTS_DIR = process.env.GTFS_SHOTS_DIR;

test.use({ viewport: { width: 1440, height: 900 } });

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}

/** Reads the mini feed and waits until Next on step 1 is on. */
async function readMiniFeed(page: Page): Promise<void> {
  await page.goto('/');
  await mountGtfsImport(page, { level: 'A' });
  await page.getByLabel('Choose ZIP file').setInputFiles(MINI_FEED);
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
}

test('step 1 shows the feed the file holds', async ({ page }) => {
  await readMiniFeed(page);
  await expect(page.getByText('Mini Test Transit')).toBeVisible();
  await expect(page.getByText(/Feed read in \d+\.\d s/)).toBeVisible();
  await shot(page, 'step1-feed');
});

test('step 2 lists B1, F1 and R1 in route order and totals the selection', async ({ page }) => {
  await readMiniFeed(page);
  await page.getByRole('button', { name: 'Next' }).click();
  const shortNames = await page.locator('.gtfs-table tbody tr td:nth-child(2)').allTextContents();
  expect(shortNames.map((name) => name.trim())).toEqual(['B1', 'F1', 'R1']);
  await page.getByRole('button', { name: 'Select all shown' }).click();
  // Weekday trips on 20 January 2026: B1 6 (its blank-time trip is counted here, see gtfsImportModel.ts), R1 2, F1 18.
  await expect(page.getByText('3 routes selected · 26 weekday trips')).toBeVisible();
  // Patterns fill in once the selected Routes' stop times are read after the selection settles.
  await expect(page.locator('.gtfs-table tbody tr').first().locator('td').nth(5)).toHaveText('2');
  await shot(page, 'step2-routes');
});

test('step 3 proposes Weekday 20 Jan 2026, the holiday days and the counts 235, 39, 65, 13, 13', async ({ page }) => {
  await readMiniFeed(page);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('Weekday date used')).toHaveValue('2026-01-20');
  await expect(page.getByLabel('Weekday annual service days')).toHaveValue('235');
  await expect(page.getByLabel('Saturday annual service days')).toHaveValue('39');
  await expect(page.getByLabel('Sunday annual service days')).toHaveValue('65');
  await expect(page.getByLabel('Holiday annual service days')).toHaveValue('13');
  await expect(page.getByLabel('Holiday 2 annual service days')).toHaveValue('13');
  await expect(page.getByText('Counts total 365')).toBeVisible();
  await expect(page.getByLabel('Counts as for Mon 19 Jan 2026')).toHaveValue('sunday');
  await expect(page.getByLabel('Counts as for Sat 24 Jan 2026')).toHaveValue('unique');
  await expect(page.getByLabel('Counts as for Fri 30 Jan 2026')).toHaveValue('unique');
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
  await shot(page, 'step3-days');
});

test('a file that is not a ZIP is refused with its reason, and Next stays off', async ({ page }) => {
  await page.goto('/');
  await mountGtfsImport(page, { level: 'A' });
  await page.getByLabel('Choose ZIP file').setInputFiles({ name: 'not-a-feed.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip archive') });
  await expect(page.getByRole('alert')).toContainText('not a ZIP archive');
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await shot(page, 'step1-refused');
});

// ---- Steps 4 and 5, the menus and the import (sub-plan I9) -----------------------------------------------------------------------------

const next = (page: Page): Locator => page.getByRole('button', { name: 'Next' });
const notice = (page: Page): Locator => page.locator('.notice');
const tab = (page: Page, name: string): Locator => page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: name, exact: true });

/** From step 1 with a file chosen to the Options step: all Routes selected. */
async function toOptions(page: Page, file: string): Promise<void> {
  await page.getByLabel('Choose ZIP file').setInputFiles(file);
  await expect(next(page)).toBeEnabled();
  await next(page).click();
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await next(page).click();
  await expect(page.getByLabel('Weekday date used')).toBeVisible();
  await expect(next(page)).toBeEnabled();
  await next(page).click();
  await expect(page.getByRole('heading', { name: 'Options' })).toBeAttached();
}

/** From the Options step to the Review step, once the translation is ready. */
async function toReview(page: Page): Promise<void> {
  await next(page).click();
  await expect(page.getByText(/^Creates /)).toBeVisible();
}

/** The names of the Routes in the Route switcher's menu. */
async function routeNames(page: Page): Promise<string[]> {
  const trigger = page.getByRole('region', { name: 'Scope', exact: true }).getByRole('button', { name: /^Route: / });
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Route', exact: true });
  const names = (await menu.getByRole('menuitemradio').allTextContents()).map((text) => text.replace(/^✓\s*/, '').trim());
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  return names;
}

test('step 4 offers the feed timepoints and blocks of the mini feed, and needs the block minutes', async ({ page }) => {
  await page.goto('/');
  await mountGtfsImport(page, { level: 'A' });
  await toOptions(page, MINI_FEED);
  await expect(page.getByRole('radio', { name: /Use the feed's timepoints/ })).toBeChecked();
  await expect(page.getByLabel('Pull-out minutes')).toHaveValue('10');
  await expect(page.getByLabel('Pull-in minutes')).toHaveValue('10');
  await expect(page.getByLabel('Also create planned frequencies from frequencies.txt')).toBeDisabled();
  await expect(page.getByText('Not available yet.')).toBeVisible();
  await shot(page, 'step4-options');
  await page.getByLabel('Pull-out minutes').fill('');
  await expect(next(page)).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Pull-out and pull-in minutes are required');
  await page.getByLabel('Pull-out minutes').fill('0');
  await expect(next(page)).toBeEnabled();
});

test('step 4 of a feed with no timepoint flags turns the feed choice off and says why; the feed has no blocks section', async ({ page }) => {
  await page.goto('/');
  await mountGtfsImport(page, { level: 'A' });
  await toOptions(page, NO_DIRECTION_FEED);
  await expect(page.getByRole('radio', { name: /Use the feed's timepoints/ })).toBeDisabled();
  await expect(page.getByRole('radio', { name: /Suggest timepoints/ })).toBeChecked();
  await expect(page.getByText('This feed marks no timepoints.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Blocks' })).toHaveCount(0);
});

test('a planner timepoint edit on step 5 changes the Route that is imported', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'project.newFromGtfs');
  await toOptions(page, NO_DIRECTION_FEED);
  await toReview(page);
  await expect(page.getByText('Matches the feed')).toBeVisible();
  const row = page.locator('.gtfs-table tbody tr').first();
  // Two Nodes (both terminals) before the edit; the middle stop of the outbound pattern becomes a third timepoint.
  await expect(row.locator('td').nth(1)).toHaveText('2');
  await page.getByLabel('Middle is a timepoint').check();
  await expect(page.getByRole('button', { name: "Restore the feed's choice" })).toBeVisible();
  await expect(row.locator('td').nth(1)).toHaveText('3');
  await shot(page, 'step5-timepoint-edit');
  await page.getByRole('button', { name: "Restore the feed's choice" }).click();
  await expect(row.locator('td').nth(1)).toHaveText('2');
  await page.getByLabel('Middle is a timepoint').check();
  await expect(row.locator('td').nth(1)).toHaveText('3');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(notice(page)).toContainText('1 route imported from edge-no-direction-deflate.zip');
  // The Route has three Nodes, so its Trips table has a column for each of the three timepoints.
  await tab(page, 'Trips').click();
  await expect(page.getByRole('columnheader', { name: /Middle/ })).toBeVisible();
});

test('a level A import through the Project menu opens the Project, shows B1 on the Route tab, and marks the trips "Feed"', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'project.newFromGtfs');
  await expect(page.getByRole('heading', { name: 'New project from GTFS feed' })).toBeVisible();
  await toOptions(page, MINI_FEED);
  await toReview(page);
  await expect(page.getByText('Matches the feed')).toBeVisible();
  await expect(page.locator('.gtfs-table-scroll:not(.gtfs-review-scroll) tbody tr')).toHaveCount(3);
  await expect(page.getByText(/^Creates 1 Project, 1 Scenario, 3 Routes, /)).toBeVisible();
  await shot(page, 'step5-review');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(notice(page)).toContainText('3 routes imported from mini-deflate.zip');
  await expect(notice(page).getByRole('button', { name: 'Download report' })).toBeVisible();
  // Level A offers no Undo here: the Project is deleted from its own menu.
  await expect(notice(page).getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await shot(page, 'after-import-notice');
  await expect(projectSwitcher(page)).toContainText('Mini Test Transit (2026-01-05)');
  await expect(tab(page, 'Route')).toHaveAttribute('aria-current', 'page');
  const names = await routeNames(page);
  expect(names).toHaveLength(3);
  expect(names.join(' ')).toContain('B1');
  await tab(page, 'Trips').click();
  await expect(page.locator('.trip-feed-tag').first()).toBeVisible();
  await expect(page.locator('.runtime-changed-note')).toHaveCount(0);
  await shot(page, 'after-import-trips');
});

test('a level B import adds a Scenario with its import note under the name in the Scenario menu', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'project.newFromGtfs');
  await toOptions(page, MINI_FEED);
  await toReview(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(notice(page)).toContainText('3 routes imported');
  await runCommand(page, 'scenario.newFromGtfs');
  await expect(page.getByRole('heading', { name: 'New scenario from GTFS feed' })).toBeVisible();
  await toOptions(page, MINI_FEED);
  await toReview(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(scenarioSwitcher(page)).toContainText('Existing service (2026-01-05)');
  await scenarioSwitcher(page).click();
  const menu = page.getByRole('menu', { name: 'Scenario actions', exact: true });
  // The note is the item's description, shown under its name.
  await expect(menu.getByText(/^From Mini Test Transit feed · imported \d{1,2} \w{3} \d{4} · 3 routes$/)).toHaveCount(2);
  await shot(page, 'after-import-scenario-menu');
  await page.keyboard.press('Escape');
  await chooseScenario(page, 'Existing service');
});

test('adding routes into a Scenario with the same names renames them "(feed)", leaves the counts, and Undo removes them', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'project.newFromGtfs');
  await toOptions(page, MINI_FEED);
  await toReview(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(notice(page)).toContainText('3 routes imported');
  const before = await routeNames(page);
  expect(before).toHaveLength(3);

  await runCommand(page, 'route.addFromGtfs');
  await expect(page.getByRole('heading', { name: 'Add routes from GTFS feed' })).toBeVisible();
  await page.getByLabel('Choose ZIP file').setInputFiles(MINI_FEED);
  await next(page).click();
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await expect(page.locator('.gtfs-clash p')).toHaveCount(3);
  await expect(page.locator('.gtfs-clash')).toContainText('It will be added as "Main St, Crosstown (feed)"');
  await next(page).click();
  // Level C does not change the Scenario's counts: they are shown beside the proposal.
  await expect(page.getByLabel('Weekday Scenario annual service days')).toHaveText('235');
  await expect(page.getByLabel('Weekday proposed annual service days')).toHaveText('235');
  await shot(page, 'step3-days-level-c');
  await expect(next(page)).toBeEnabled();
  await next(page).click();
  await expect(page.getByRole('combobox', { name: 'Trip profile' })).toHaveValue(/.+/);
  await expect(page.getByRole('combobox', { name: 'Blocking scenario' })).toBeVisible();
  await shot(page, 'step4-options-level-c');
  await toReview(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(notice(page)).toContainText('3 routes imported from mini-deflate.zip');
  await expect(notice(page).getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect(notice(page).getByRole('button', { name: 'Download report' })).toBeVisible();
  await shot(page, 'after-import-notice-level-c');
  const after = await routeNames(page);
  expect(after).toHaveLength(6);
  expect(after.filter((name) => name.includes('(feed)'))).toHaveLength(3);
  await expect(tab(page, 'Route')).toHaveAttribute('aria-current', 'page');

  await notice(page).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await routeNames(page)).length).toBe(3);
});

test('the report downloads from step 5 and from the notice, as the same CSV', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'project.newFromGtfs');
  await toOptions(page, MINI_FEED);
  await toReview(page);
  const [stepDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download import report (CSV)' }).click()]);
  expect(stepDownload.suggestedFilename()).toBe('mini-deflate-import-report.csv');
  const fromStep = readFileSync((await stepDownload.path())!, 'utf8');
  expect(fromStep.split('\r\n')[0]).toBe('section,routeId,serviceDay,tripId,stopId,code,detail');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(notice(page)).toContainText('3 routes imported');
  const [noticeDownload] = await Promise.all([page.waitForEvent('download'), notice(page).getByRole('button', { name: 'Download report' }).click()]);
  expect(readFileSync((await noticeDownload.path())!, 'utf8')).toBe(fromStep);
});

const AXE_SOURCE = readFileSync(fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url)), 'utf8');
const AXE_RULES = ['aria-dialog-name', 'label', 'aria-allowed-role', 'scope-attr-valid', 'color-contrast', 'target-size'];

async function axeViolations(page: Page, context: string): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async ({ rules, selector }) => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: unknown[] }> }> }> } }).axe;
    const result = await axe.run(document.querySelector(selector)!, { runOnly: { type: 'rule', values: rules } });
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`);
  }, { rules: AXE_RULES, selector: context });
}

test('steps 3, 4 and 5 pass the axe label, dialog-name, contrast and scope rules, and the steps bar marks the current step', async ({ page }) => {
  await page.goto('/');
  await mountGtfsImport(page, { level: 'A' });
  await page.getByLabel('Choose ZIP file').setInputFiles(MINI_FEED);
  await next(page).click();
  await page.getByRole('button', { name: 'Select all shown' }).click();
  await next(page).click();
  await expect(page.getByLabel('Weekday date used')).toBeVisible();
  expect(await axeViolations(page, '.gtfs-import-dialog')).toEqual([]);
  await expect(page.getByRole('list', { name: 'Import steps' }).locator('[aria-current="step"]')).toHaveText('3 Days');
  await next(page).click();
  await expect(page.getByRole('heading', { name: 'Options' })).toBeAttached();
  expect(await axeViolations(page, '.gtfs-import-dialog')).toEqual([]);
  await expect(page.getByRole('list', { name: 'Import steps' }).locator('[aria-current="step"]')).toHaveText('4 Options');
  await next(page).click();
  await expect(page.getByText(/^Creates /)).toBeVisible();
  expect(await axeViolations(page, '.gtfs-import-dialog')).toEqual([]);
  await expect(page.getByRole('list', { name: 'Import steps' }).locator('[aria-current="step"]')).toHaveText('5 Review');
});

test('the Cost summary footnote repeats the import note', async ({ page }) => {
  await page.goto('/');
  await runCommand(page, 'project.newFromGtfs');
  await toOptions(page, MINI_FEED);
  await toReview(page);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(notice(page)).toContainText('3 routes imported');
  await tab(page, 'Costing').click();
  // The workspace loads its own assumptions first; a rate typed before that is replaced by them.
  await expect(page.getByRole('heading', { name: 'Cost Breakdown' })).toBeVisible();
  // The new Scenario has an empty Default Blocking scenario beside "From feed"; Costing opens on the one with the imported blocks, with no
  // choice made here, and shows a cost basis.
  await expect(blockingScenarioMenu(page)).toHaveAttribute('aria-label', 'Blocking scenario: From feed');
  expect(await costBasisText(page)).toBe('Blocked: From feed');
  await expect(page.getByText('Select a cost basis to calculate an estimate.')).toHaveCount(0);
  await page.getByLabel('Operating cost per revenue hour in USD').fill('150');
  await expect(page.getByText('Applied rate $150.00 per revenue hour')).toBeVisible();
  await runCommand(page, 'costing.viewSummary');
  // A partial estimate asks first; the imported blocks leave some trips unassigned.
  const warning = page.getByRole('alertdialog', { name: 'This estimate is partial' });
  const sheet = page.getByRole('dialog', { name: 'Operating Cost Estimate' });
  await expect(warning.or(sheet)).toBeVisible();
  if (await warning.isVisible()) await warning.getByRole('button', { name: 'Open summary', exact: true }).click();
  await expect(sheet).toBeVisible();
  await expect(page.locator('.cost-summary-footer')).toContainText(/From Mini Test Transit feed · imported \d{1,2} \w{3} \d{4} · 3 routes/);
  await page.locator('.cost-summary-footer').scrollIntoViewIfNeeded();
  await shot(page, 'after-import-cost-summary');
});
