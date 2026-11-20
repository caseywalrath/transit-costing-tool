// ST4 (Decision 0079): the stop review texts, the Trips export with stops, and the stop placement count in the pattern deletion confirmation.
// The stops here come from a backup: the spec exports a project, adds one stop between the two timepoints and a stop ID on the first timepoint,
// and imports the file with the Import JSON control. Decision 0080: a version 13 file's Node stop ID arrives on the pattern's timepoint. Real IndexedDB.
import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { editRuntimeCell, gridCell, openMenu, openRuntimes, runCommand, runtimeCell } from './support/ui';
import { runInPage } from './support/dexieEnv';

test.setTimeout(120_000);

const STAMP = '2026-11-16T00:00:00.000Z';
const STOP_HEADER = 'Trip,Direction,Pattern,Stop Order,Stop ID,Stop Name,Timepoint,Time,Block';

/**
 * A Route with timepoints A and B, one saved Pattern, and one Trip at 06:00 whose A to B segment runs 7 minutes. Built through the Runtimes and
 * Trips screens. Leaves the app on the Trips tab.
 */
async function oneTripSchedule(page: Page, projectName: string) {
  await createRouteWithPattern(page, projectName);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await openRuntimes(page);
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await editRuntimeCell(runtimeSection, 'Time band 1 segment 1', ':07');
  await expect(runtimeCell(runtimeSection, 'Time band 1 segment 1')).toHaveText(':07');
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect.poll(() => runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.bands[0].segmentRuntimeSeconds[0])')).toEqual([420]);
  await expect(runtimeSection.getByRole('button', { name: 'Runtime actions', exact: true })).toBeEnabled();

  const tripsSection = page.locator('[aria-label="Trips section"]');
  await tripsSection.getByRole('button', { name: 'Build trips…', exact: true }).click();
  const drawer = page.getByRole('complementary', { name: 'Build trips' });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByLabel('First trip').fill('06:00');
  await drawer.getByLabel('Headway').fill('10');
  await drawer.getByLabel('Last trip').fill('06:00');
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(1);
}

/** Downloads the open project's JSON backup and returns the parsed file. */
async function exportBackup(page: Page): Promise<any> {
  const download = page.waitForEvent('download');
  await runCommand(page, 'project.backup');
  const file = await download;
  return JSON.parse(readFileSync((await file.path()) as string, 'utf8'));
}

/**
 * The backup with one stop, Middle Street (M1), in the segment after the Route's first point, so it lies between A and B, and the stop ID A-01 on
 * the first point. `legacy` writes it as a version 13 file instead, with A-01 on Node A (Decision 0080).
 */
function withMiddleStop(backup: any, legacy = false): any {
  const route = backup.routes[0];
  // A Route created without a name exports a file that the import refuses ("routes[0].name must be a non-empty string"); the app shows it as
  // "Untitled route". The fixture names it so that the import can run.
  route.name ||= 'Test route';
  const pattern = backup.patterns.find((item: any) => item.routeId === route.id);
  const first = [...pattern.points].sort((left: any, right: any) => left.sequence - right.sequence)[0];
  if (legacy) {
    backup.exportSchemaVersion = 13;
    backup.nodes.find((node: any) => node.id === first.nodeId).stopCode = 'A-01';
  }
  backup.routeStopSets = [{
    id: 'stop-set-1', scenarioId: route.scenarioId, routeId: route.id, roundingSeconds: 60,
    stops: [{ id: 'stop-middle', name: 'Middle Street', stopCode: 'M1' }],
    placementsByPatternId: { [pattern.id]: [{ id: 'placement-1', stopId: 'stop-middle', afterPatternPointId: first.id, sequence: 0, timing: 'interpolate' }] },
    ...(legacy ? {} : { timepointStopCodesByPatternId: { [pattern.id]: { [first.id]: 'A-01' } } }),
    createdAt: STAMP, updatedAt: STAMP,
  }];
  return backup;
}

/** Exports the stop-level CSV of the open Trips tab and returns its rows. */
async function exportStopTimes(page: Page): Promise<string[][]> {
  const tripsSection = page.locator('[aria-label="Trips section"]');
  const download = page.waitForEvent('download');
  await openMenu(page, tripsSection.getByRole('button', { name: 'Trip actions', exact: true }), 'Trip actions');
  await page.getByRole('menu', { name: 'Trip actions', exact: true }).getByRole('menuitem', { name: 'Export trips with stops CSV', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/-stop-times\.csv$/);
  const rows = await csvRows(file);
  expect(rows[0].join(',')).toBe(STOP_HEADER);
  return rows;
}

/** Imports a backup file with the Import JSON control. The import opens as an independent project. */
async function importBackup(page: Page, backup: unknown) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('.notice.success')).toContainText('as an independent project', { timeout: 30000 });
}

/** The rows of a downloaded CSV, each split into its cells (the names in these specs have no commas). */
async function csvRows(download: Download): Promise<string[][]> {
  const path = await download.path();
  return readFileSync(path as string, 'utf8').trim().split('\r\n').map((line) => line.split(','));
}

test('the Nodes table has no Stop ID column (Decision 0080)', async ({ page }) => {
  await createRouteWithPattern(page, 'No node stop ID');
  await expect(page.getByRole('grid', { name: 'Nodes' }).getByRole('columnheader')).toHaveText(['Name', 'Short', 'Type', 'Actions']);
});

test('a version 13 backup moves a Node stop ID to the pattern timepoint, and the export writes it there (Decision 0080)', async ({ page }) => {
  await oneTripSchedule(page, 'Legacy node stop ID');
  await importBackup(page, withMiddleStop(await exportBackup(page), true));
  await expect.poll(() => runInPage(page, 'return (await e.db.nodes.toArray()).filter((node) => "stopCode" in node).length')).toBe(0);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(1);
  expect((await exportStopTimes(page)).slice(1).map((row) => row.slice(3, 6))).toEqual([['1', 'A-01', 'A'], ['2', 'M1', 'Middle Street'], ['3', '', 'B']]);
});

test('Trips Actions offers "Export trips with stops CSV"; a Route without stops exports one row per timepoint', async ({ page }) => {
  await oneTripSchedule(page, 'Stop times without stops');
  const tripsSection = page.locator('[aria-label="Trips section"]');
  await openMenu(page, tripsSection.getByRole('button', { name: 'Trip actions', exact: true }), 'Trip actions');
  const menu = page.getByRole('menu', { name: 'Trip actions', exact: true });
  await expect(menu.getByRole('menuitem')).toHaveText(['Copy trips from another day…', 'Stop trips…', 'Export trips CSV', 'Export trips with stops CSV', 'Export stop schedule CSV…']);

  const download = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: 'Export trips with stops CSV', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/-stop-times\.csv$/);
  const rows = await csvRows(file);
  expect(rows[0].join(',')).toBe(STOP_HEADER);
  expect(rows.slice(1).map((row) => row.slice(3))).toEqual([
    ['1', '', 'A', 'Yes', '6:00', ''],
    ['2', '', 'B', 'Yes', '6:07', ''],
  ]);
});

test('a stop between two timepoints exports at its interpolated time, rounded down to the minute', async ({ page }) => {
  await oneTripSchedule(page, 'Stop times export');
  await importBackup(page, withMiddleStop(await exportBackup(page)));
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(1);
  const rows = await exportStopTimes(page);
  // The stop lies in the 7-minute segment: 6:00 + 7 min / 2 = 6:03:30, rounded down to 6:03. The formatter writes times without a leading zero.
  expect(rows.slice(1).map((row) => row.slice(3))).toEqual([
    ['1', 'A-01', 'A', 'Yes', '6:00', ''],
    ['2', 'M1', 'Middle Street', 'No', '6:03', ''],
    ['3', '', 'B', 'Yes', '6:07', ''],
  ]);
});

test('deleting a pattern with a stop placement shows "1 stop placement" in its confirmation', async ({ page }) => {
  await oneTripSchedule(page, 'Stop placement deletion');
  await importBackup(page, withMiddleStop(await exportBackup(page)));
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  await runCommand(page, 'pattern.delete');
  const confirm = page.getByRole('alertdialog', { name: 'Delete pattern?' });
  await expect(confirm).toContainText('1 stop placement');
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirm).toBeHidden();
});
