// The GTFS export dialog and its two menu entries (Decision 0090; card E4). The Scenario is the fixture of tests/fixtures/gtfs-export/
// (README), seeded into the real IndexedDB; the export is unzipped in the test and compared with mini-export/. Screenshots go to
// GTFS_EXPORT_SHOTS_DIR when that variable is set, for review.
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Download, expect, type Locator, type Page, test } from '@playwright/test';
import { miniInput } from '../../src/domain/gtfsExport/miniScenarioFixture';
import { seedSnapshot } from './support/dexieEnv';
import { openMenu, projectSwitcher, scenarioSwitcher } from './support/ui';

const EXPECTED_DIR = fileURLToPath(new URL('../fixtures/gtfs-export/mini-export/', import.meta.url));
const SHOTS_DIR = process.env.GTFS_EXPORT_SHOTS_DIR;
const STAMP = '2027-01-01T00:00:00.000Z';

test.use({ viewport: { width: 1440, height: 1000 } });

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}

/** The README Scenario as a Project snapshot. With `unlocated`, the Bravo timepoint of the outbound pattern has no location. */
function miniSnapshot(options: { unlocated?: boolean } = {}): unknown {
  const input = miniInput();
  const scenarioId = input.serviceDays[0].scenarioId;
  const stopSets = structuredClone(input.routeStopSets);
  if (options.unlocated) delete stopSets[0].timepointLocationsByPatternId!['pattern-ac']['pp-ac-bravo'];
  return {
    project: { id: 'project-mini', name: 'Mini Project', distanceUnit: 'miles', currencyCode: 'USD', createdAt: STAMP, updatedAt: STAMP },
    scenarios: [{ id: scenarioId, projectId: 'project-mini', name: 'Mini Scenario', createdAt: STAMP, updatedAt: STAMP }],
    serviceDays: input.serviceDays,
    routes: input.routes.map((aggregate) => aggregate.route),
    nodes: input.routes.flatMap((aggregate) => aggregate.nodes),
    patterns: input.routes.flatMap((aggregate) => aggregate.patterns),
    directions: input.routes.flatMap((aggregate) => aggregate.directions ?? []),
    runtimeProfiles: [],
    runtimeAssignments: [],
    tripProfiles: [{ id: 'profile-base', scenarioId, name: 'Base', createdAt: STAMP, updatedAt: STAMP }],
    blockingScenarios: [{ id: 'blocking-base', scenarioId, tripProfileId: 'profile-base', name: 'Base blocks', createdAt: STAMP, updatedAt: STAMP }],
    routeStopSets: stopSets,
    generationSets: [],
    trips: input.trips,
    blocks: input.blocks ?? [],
  };
}

async function openApp(page: Page, options: { unlocated?: boolean } = {}): Promise<void> {
  await seedSnapshot(page, miniSnapshot(options));
  await page.goto('/');
  await expect(scenarioSwitcher(page)).toContainText('Mini Scenario');
}

const dialog = (page: Page): Locator => page.getByRole('dialog', { name: 'Export as GTFS feed' });
const notice = (page: Page): Locator => page.locator('.notice');
const exportButton = (page: Page): Locator => dialog(page).getByRole('button', { name: 'Export', exact: true });

/** Scenario menu → "Export as GTFS feed…". */
async function openFromScenarioMenu(page: Page): Promise<void> {
  await openMenu(page, scenarioSwitcher(page), 'Scenario actions');
  await page.getByRole('menu', { name: 'Scenario actions', exact: true }).getByRole('menuitem', { name: 'Export as GTFS feed…', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
}

/** The README's export inputs, typed into the dialog. */
async function fillReadmeInputs(page: Page): Promise<void> {
  const d = dialog(page);
  await d.getByLabel('Start date').fill('2027-01-04');
  await d.getByLabel('End date').fill('2027-01-31');
  await d.getByLabel('Holiday date to add').fill('2027-01-18');
  await d.getByRole('button', { name: 'Add holiday' }).click();
  await d.getByLabel('Agency name').fill('Test Transit');
  await d.getByLabel('Agency website').fill('https://example.org');
  await d.getByLabel('Agency time zone').selectOption('America/Denver');
}

/** The entries of a ZIP of stored files: name → text. The writer stores every entry uncompressed. */
function unzipStored(bytes: Buffer): Map<string, string> {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let index = 0; index < count; index += 1) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50);
    const method = bytes.readUInt16LE(offset + 10);
    const size = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength);
    expect(method, `${name} is stored`).toBe(0);
    const dataStart = localOffset + 30 + bytes.readUInt16LE(localOffset + 26) + bytes.readUInt16LE(localOffset + 28);
    files.set(name, bytes.toString('utf8', dataStart, dataStart + size));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/** Records every download of the page. */
function collectDownloads(page: Page): Download[] {
  const downloads: Download[] = [];
  page.on('download', (download) => { downloads.push(download); });
  return downloads;
}

test('exports the README Scenario: the dialog starts blank, the checks are ready, and stops.txt and trips.txt match the fixture', async ({ page }) => {
  await openApp(page);
  const downloads = collectDownloads(page);
  await openFromScenarioMenu(page);
  const d = dialog(page);
  await expect(d.getByLabel('Start date')).toHaveValue('');
  await expect(d.getByLabel('Agency name')).toHaveValue('');
  await expect(d.getByLabel('Routes')).toHaveValue('all');
  await expect(d.getByRole('combobox', { name: 'Trip profile' })).toHaveValue('profile-base');
  await expect(d.getByRole('combobox', { name: 'Blocking scenario' })).toHaveValue('blocking-base');
  // Nothing is set yet, so Export is off and the range and agency refusals are listed.
  await expect(exportButton(page)).toBeDisabled();
  await expect(d.getByRole('table', { name: 'Problems to fix first' })).toContainText('The date range has no dates');
  await shot(page, 'frame1-blank-problems');

  await fillReadmeInputs(page);
  await expect(d.getByText('2027-01-18 Mon')).toBeVisible();
  await expect(d.getByText('1 Route · 5 stops · 5 trips · 3 service days · 1 block')).toBeVisible();
  await expect(d.getByText('Ready')).toBeVisible();
  await expect(d.getByText(/1 stop without an ID gets a generated ID\./)).toBeVisible();
  await expect(exportButton(page)).toBeEnabled();
  await expect(d.getByText(/Downloads mini-scenario-gtfs\.zip and a report CSV\./)).toBeVisible();
  await shot(page, 'frame1-ready');

  await exportButton(page).click();
  await expect(notice(page)).toContainText('Exported 5 trips on 1 Route. Report downloaded.');
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => downloads.length).toBe(2);
  const names = downloads.map((download) => download.suggestedFilename()).sort();
  expect(names).toEqual(['mini-scenario-gtfs-report.csv', 'mini-scenario-gtfs.zip']);
  const zip = downloads.find((download) => download.suggestedFilename().endsWith('.zip'))!;
  const files = unzipStored(readFileSync((await zip.path())!));
  expect([...files.keys()]).toEqual(['agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt', 'shapes.txt', 'feed_info.txt']);
  for (const name of ['stops.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt', 'shapes.txt', 'agency.txt', 'routes.txt']) {
    expect(files.get(name), name).toBe(readFileSync(`${EXPECTED_DIR}${name}`, 'utf8'));
  }
  const report = downloads.find((download) => download.suggestedFilename().endsWith('.csv'))!;
  expect(readFileSync((await report.path())!, 'utf8')).toContain('service_day');
  await shot(page, 'after-export-notice');
});

test('a refusal shows the Problems table, keeps Export off, lists the list as CSV, and "Open on Route tab" keeps the unsaved values', async ({ page }) => {
  await openApp(page, { unlocated: true });
  const downloads = collectDownloads(page);
  await openFromScenarioMenu(page);
  const d = dialog(page);
  await fillReadmeInputs(page);
  const table = d.getByRole('table', { name: 'Problems to fix first' });
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody tr').first()).toContainText('No location');
  await expect(table.locator('tbody tr').first()).toContainText('Test Line');
  await expect(table.locator('tbody tr').first()).toContainText('Alpha to Charlie');
  await expect(table.locator('tbody tr').first()).toContainText('Bravo');
  await expect(exportButton(page)).toBeDisabled();
  await expect(d.getByText('Export is unavailable until the problems are fixed.')).toBeVisible();
  await expect(d.getByRole('button', { name: 'Close' })).toBeVisible();
  await shot(page, 'frame2-problems');

  await d.getByRole('button', { name: 'Download list' }).click();
  await expect.poll(() => downloads.length).toBe(1);
  expect(downloads[0].suggestedFilename()).toBe('mini-scenario-gtfs-problems.csv');
  const list = readFileSync((await downloads[0].path())!, 'utf8').split('\n');
  expect(list[0]).toBe('problem,route,pattern,stop_or_timepoint,detail');
  expect(list[1]).toContain('No location,Test Line,Alpha to Charlie,Bravo');

  await d.getByRole('button', { name: 'Open on Route tab' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Route', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByLabel('Pattern', { exact: false }).first()).toBeVisible();

  // Nothing was saved, so only this session's memory holds the typed values.
  await openFromScenarioMenu(page);
  await expect(dialog(page).getByLabel('Agency name')).toHaveValue('Test Transit');
  await expect(dialog(page).getByLabel('Start date')).toHaveValue('2027-01-04');
  await expect(dialog(page).getByText('2027-01-18 Mon')).toBeVisible();
});

test('the settings are remembered on the Scenario: reopening, and a reload, show the exported values', async ({ page }) => {
  await openApp(page);
  collectDownloads(page);
  await openFromScenarioMenu(page);
  await fillReadmeInputs(page);
  await dialog(page).getByRole('radio', { name: 'No map lines' }).check();
  await expect(exportButton(page)).toBeEnabled();
  await exportButton(page).click();
  await expect(notice(page)).toContainText('Exported 5 trips on 1 Route.');

  const expectRemembered = async () => {
    const d = dialog(page);
    await expect(d.getByLabel('Start date')).toHaveValue('2027-01-04');
    await expect(d.getByLabel('End date')).toHaveValue('2027-01-31');
    await expect(d.getByText('2027-01-18 Mon')).toBeVisible();
    await expect(d.getByLabel('Runs on 2027-01-18')).toHaveValue('day-hol');
    await expect(d.getByLabel('Agency name')).toHaveValue('Test Transit');
    await expect(d.getByLabel('Agency website')).toHaveValue('https://example.org');
    await expect(d.getByLabel('Agency time zone')).toHaveValue('America/Denver');
    await expect(d.getByRole('radio', { name: 'No map lines' })).toBeChecked();
    await expect(d.getByText('Ready')).toBeVisible();
  };
  await openFromScenarioMenu(page);
  await expectRemembered();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);

  await page.reload();
  await expect(scenarioSwitcher(page)).toContainText('Mini Scenario');
  await openFromScenarioMenu(page);
  await expectRemembered();
});

test('a holiday cannot be added outside the range or twice, and "Runs" lists the Scenario\'s service days', async ({ page }) => {
  await openApp(page);
  await openFromScenarioMenu(page);
  const d = dialog(page);
  const add = d.getByRole('button', { name: 'Add holiday' });
  await d.getByLabel('Holiday date to add').fill('2027-01-18');
  await expect(add).toBeDisabled();
  await expect(d.getByText('Set the start and end dates first.')).toBeVisible();
  await d.getByLabel('Start date').fill('2027-01-04');
  await d.getByLabel('End date').fill('2027-01-31');
  await expect(add).toBeEnabled();
  await d.getByLabel('Holiday date to add').fill('2027-02-01');
  await expect(add).toBeDisabled();
  await expect(d.getByText('This date is outside the range.')).toBeVisible();
  await d.getByLabel('Holiday date to add').fill('2027-01-18');
  await add.click();
  await d.getByLabel('Holiday date to add').fill('2027-01-18');
  await expect(add).toBeDisabled();
  await expect(d.getByText('This date is already listed.')).toBeVisible();
  const runs = d.getByLabel('Runs on 2027-01-18');
  await expect(runs).toHaveValue('day-hol');
  expect(await runs.locator('option').allTextContents()).toEqual(['Weekday', 'Saturday', 'Holiday']);
  // Moving the end date before the holiday flags the row and turns Export off until it is fixed.
  await d.getByLabel('End date').fill('2027-01-10');
  await expect(d.locator('.gtfs-chip--warn', { hasText: 'This date is outside the range.' })).toBeVisible();
  await expect(exportButton(page)).toBeDisabled();
  await d.getByRole('button', { name: 'Remove holiday 2027-01-18' }).click();
  await expect(d.getByText('A holiday date is outside the range')).toHaveCount(0);
});

test('"Choose Routes…" lists the Routes with a search and their trip counts, and none selected turns Export off', async ({ page }) => {
  await openApp(page);
  await openFromScenarioMenu(page);
  const d = dialog(page);
  await d.getByLabel('Routes', { exact: true }).selectOption('some');
  const list = d.getByRole('region', { name: 'Choose Routes' });
  await expect(list).toContainText('T1 · Test Line');
  await expect(list).toContainText('5 trips');
  await expect(list.getByText('0 selected')).toBeVisible();
  await expect(d.getByText('Choose at least one Route that has trips on this Trip profile.')).toBeVisible();
  await list.getByLabel('Search Routes').fill('nothing here');
  await expect(list.getByRole('checkbox')).toHaveCount(0);
  await list.getByLabel('Search Routes').fill('test');
  await list.getByRole('button', { name: 'Select all shown' }).click();
  await expect(list.getByText('1 selected')).toBeVisible();
  await shot(page, 'frame1-choose-routes');
});

test('the Project menu also offers the export, for the open Scenario', async ({ page }) => {
  await openApp(page);
  await openMenu(page, projectSwitcher(page), 'Project actions');
  const menu = page.getByRole('menu', { name: 'Project actions', exact: true });
  const items = await menu.getByRole('menuitem').allTextContents();
  const backup = items.findIndex((text) => text.startsWith('Back up project (JSON)'));
  expect(backup).toBeGreaterThanOrEqual(0);
  expect(items[backup + 1]).toBe('Export open scenario as GTFS feed…');
  await menu.getByRole('menuitem', { name: 'Export open scenario as GTFS feed…', exact: true }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('Scenario: Mini Scenario · 1 Route');
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toHaveCount(0);
});
