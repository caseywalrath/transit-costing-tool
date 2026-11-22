// The GTFS import dialog, steps 1 to 3 (Decision 0089; sub-plan I8). The dialog is mounted from its module, because the menus that open it
// are sub-plan I9 (tests/ui/support/gtfsImport.ts). Screenshots go to GTFS_SHOTS_DIR when that variable is set, for review.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { mountGtfsImport } from './support/gtfsImport';

const MINI_FEED = fileURLToPath(new URL('../fixtures/gtfs/zips/mini-deflate.zip', import.meta.url));
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
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await expect(page.getByText('Options and Review come next.')).toBeVisible();
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
