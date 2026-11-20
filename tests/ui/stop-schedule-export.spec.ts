// SS3 (Decision 0084): Trips Actions → Export stop schedule CSV…. The fixture is the Federal BRT backup (two directions, three patterns each)
// with one stop on the long southbound pattern, a stop ID on its first timepoint, and a weekday plan, imported with the Import JSON control.
import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { openMenu } from './support/ui';

test.setTimeout(180_000);

const STAMP = '2026-11-19T00:00:00.000Z';

function federalFixture(): any {
  const backup = JSON.parse(readFileSync('output/federal-brt-import/federal-brt-project-backup.json', 'utf8'));
  const route = backup.routes[0];
  const full = backup.patterns.find((pattern: any) => pattern.name === 'Southbound: Wagon Road to Englewood');
  const first = [...full.points].sort((left: any, right: any) => left.sequence - right.sequence)[0];
  const weekday = backup.serviceDays.find((day: any) => day.name === 'Weekday');
  backup.exportSchemaVersion = 15;
  backup.routeStopSets = [{
    id: 'stop-set-1', scenarioId: route.scenarioId, routeId: route.id, roundingSeconds: 60,
    stops: [{ id: 'stop-pecos', name: '120th Ave & Pecos St BRT', stopCode: '126230' }],
    placementsByPatternId: { [full.id]: [{ id: 'placement-1', stopId: 'stop-pecos', afterPatternPointId: first.id, sequence: 0, timing: 'interpolate' }] },
    // Row identity is the stop ID when there is one, so every pattern that starts at Wagon Road carries it (otherwise the row is listed twice).
    timepointStopCodesByPatternId: Object.fromEntries(backup.patterns.flatMap((pattern: any) => pattern.points.filter((point: any) => point.nodeId === first.nodeId).map((point: any) => [pattern.id, { [point.id]: '126108' }]))),
    createdAt: STAMP, updatedAt: STAMP,
  }];
  backup.plannedFrequencies = [{
    id: 'plan-1', scenarioId: route.scenarioId, routeId: route.id, serviceDayId: weekday.id, measureNodeIdByDirectionId: {},
    periods: [{ id: 'p1', startTime: 6 * 3600, endTime: 10 * 3600, headwaySeconds: 900 }],
    createdAt: STAMP, updatedAt: STAMP,
  }];
  return backup;
}

async function importFederal(page: Page) {
  await page.goto('/');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: 'federal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(federalFixture())) });
  await expect(page.locator('.notice.success')).toContainText('as an independent project', { timeout: 60000 });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr').first()).toBeVisible({ timeout: 30000 });
}

/** Opens the export dialog, chooses the column mode, exports, and returns the download. */
async function exportSchedule(page: Page, mode: 'One sample trip per period' | 'Every trip'): Promise<Download> {
  const tripsSection = page.locator('[aria-label="Trips section"]');
  await openMenu(page, tripsSection.getByRole('button', { name: 'Trip actions', exact: true }), 'Trip actions');
  await page.getByRole('menu', { name: 'Trip actions', exact: true }).getByRole('menuitem', { name: 'Export stop schedule CSV…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export stop schedule' });
  await expect(dialog).toContainText('Weekday');
  await dialog.getByRole('radio', { name: mode }).check();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await download;
  await expect(dialog).toBeHidden();
  return file;
}

/** A small RFC 4180 reader: header cells hold quoted line breaks. */
function parse(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; } else if (char === '\r') { /* CRLF */ } else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += char;
  }
  return rows;
}

test('Export stop schedule CSV writes both directions in sample and every-trip modes (Decision 0084)', async ({ page }) => {
  await importFederal(page);
  const sample = await exportSchedule(page, 'One sample trip per period');
  expect(sample.suggestedFilename()).toMatch(/-stop-schedule\.csv$/);
  const rows = parse(readFileSync((await sample.path()) as string, 'utf8'));
  const titles = rows.filter((row) => row.length === 1 && row[0] !== '').map((row) => row[0]);
  expect(titles).toEqual(['Southbound', 'Northbound']);
  expect(rows[1].slice(0, 6)).toEqual(['Stop ID', 'Stop Name', 'Latitude', 'Longitude', 'Distance (miles)', 'Speed Limit']);
  // The long pattern has the most rows: Wagon Road (stop ID 126108), the added stop, then 112th Ave.
  expect(rows.slice(3, 6).map((row) => row.slice(0, 2))).toEqual([['126108', 'Wagon Road'], ['126230', '120th Ave & Pecos St BRT'], ['', '112th Ave']]);
  // The plan period 6:00-10:00 is one window; its header names the runtime band, the measured headway, and the span.
  expect(rows[2].some((cell) => /^BRT AM Peak\n\d+ min\n6:00-10:00$/.test(cell))).toBe(true);
  // A short pattern does not serve the added stop.
  const shortColumn = rows[1].indexOf('Southbound: Westminster Station to Englewood');
  expect(rows[4][shortColumn]).toBe('-');
  expect(rows.some((row) => row[1] === 'Run time (min)')).toBe(true);

  const every = await exportSchedule(page, 'Every trip');
  const everyRows = parse(readFileSync((await every.path()) as string, 'utf8'));
  expect(everyRows[1].length).toBeGreaterThan(rows[1].length);
  expect(everyRows[2][6]).toMatch(/^.+\nTrip 1\n\d+:\d\d$/);
});

test('the export dialog cancels with Escape', async ({ page }) => {
  await importFederal(page);
  const tripsSection = page.locator('[aria-label="Trips section"]');
  await openMenu(page, tripsSection.getByRole('button', { name: 'Trip actions', exact: true }), 'Trip actions');
  await page.getByRole('menu', { name: 'Trip actions', exact: true }).getByRole('menuitem', { name: 'Export stop schedule CSV…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export stop schedule' });
  await expect(dialog.getByRole('radio', { name: 'One sample trip per period' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Leave out timepoints without a stop ID' })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
