// Review package U02 (issues I-039, I-072, I-076, I-095; findings 5-014, 3-015, 4-016, 4-017, 5-029). The screens show the read-only
// state, the time of the last backup, and one plain message for every failure: a stale-source refusal in Blocking reloads the data,
// startup, selection, and export failures reach the error banner, and technical error text never does.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const PROTECTION_KEY = 'transit-costing-tool.local-data-protection.v1';
const READ_ONLY_BANNER = 'This project is open in another tab. This tab is read-only.';

async function openGolden(page: Page) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
}

const banner = (page: Page) => page.locator('.notice');

async function twoTabs(browser: Browser) {
  const context = await browser.newContext();
  const active = await context.newPage();
  await openGolden(active);
  const readOnly = await context.newPage();
  await readOnly.goto('/');
  await expect(readOnly.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  return { context, active, readOnly };
}

test('a read-only tab says so in the notice banner and the header, keeps its edit controls, and does not report a failed save', async ({ browser }) => {
  const { context, active, readOnly } = await twoTabs(browser);

  await expect(active.getByText(READ_ONLY_BANNER)).toHaveCount(0);
  await expect(active.locator('.save-status')).toHaveCount(0);

  await expect(readOnly.locator('.notice.info')).toHaveText(READ_ONLY_BANNER);
  await expect(readOnly.locator('.save-status')).toHaveText('Read-only');
  await expect(readOnly.getByRole('textbox', { name: 'Weekday name' })).toBeEnabled();
  await expect(readOnly.getByLabel('Weekday annual service days')).toBeEnabled();

  // A write is still rejected (Package P02). The header keeps saying "Read-only", not "Local save failed".
  const days = readOnly.getByLabel('Weekday annual service days');
  await days.fill('254');
  await days.press('Enter');
  await expect(readOnly.locator('.notice.error')).toContainText(/read-only/i);
  await expect(readOnly.locator('.save-status')).toHaveText('Read-only');
  await expect(readOnly.getByText('Local save failed')).toHaveCount(0);
  await context.close();
});

test('the Project menu shows when the last backup was exported, or that none was', async ({ page }) => {
  await openGolden(page);
  const menuItem = () => page.getByRole('menuitem', { name: 'Backup project JSON', exact: true });

  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await expect(menuItem()).toHaveAccessibleDescription('No backup exported yet');
  await expect(page.getByRole('menu', { name: 'Project actions' })).toContainText('No backup exported yet');

  const download = page.waitForEvent('download');
  await menuItem().click();
  await download;
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').lastBackupExportedAt as string, PROTECTION_KEY);
  expect(stored).toBeTruthy();
  const expected = await page.evaluate((iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }), stored);

  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await expect(menuItem()).toHaveAccessibleDescription(`Last backup: ${expected}`);
  await expect(page.getByRole('menu', { name: 'Project actions' })).not.toContainText('No backup exported yet');
});

test('after a stale-source refusal Blocking reloads its data and shows the message once, and the next edit works', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await openGolden(page);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const currentBlock = page.getByLabel('Current Block');
  const blockMenu = currentBlock.locator('.menu-field').filter({ hasText: 'Block' }).getByRole('button').first();
  await expect(blockMenu).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Blocks', { exact: true }).locator('.link-button').filter({ hasText: /^26$/ }).click();
  await expect(blockMenu).toContainText('26');
  const shownLabel = '26';

  // Another path changes the Blocks after this screen loaded them.
  const changed = await runInPage(page, "const blocks = (await e.db.blocks.toArray()).filter((item) => item.label === arg); for (const block of blocks) await e.db.blocks.put({ ...block, label: 'Renamed elsewhere' }); return blocks.length;", shownLabel);
  expect(changed).toBeGreaterThan(0);

  const blocksBefore = await runInPage(page, 'return await e.db.blocks.count()');
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Block' });
  await dialog.getByLabel('Name').fill('Block 900');
  await dialog.getByRole('button', { name: 'Create Block', exact: true }).click();

  const stale = 'Blocking Scenario changed since the operation was reviewed. Nothing was saved, and the latest Blocks are loaded. Review them and try again.';
  await expect(banner(page).filter({ hasText: stale })).toHaveCount(1);
  await expect(banner(page)).toHaveCount(1);
  // The screen now shows the stored label: it reloaded.
  await expect(blockMenu).toContainText('Renamed elsewhere');
  expect(await runInPage(page, 'return await e.db.blocks.count()')).toBe(blocksBefore);

  // The same action now succeeds, because the source signature was refreshed.
  await expect(dialog.getByLabel('Name')).toHaveValue('Block 900');
  await dialog.getByRole('button', { name: 'Create Block', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(blockMenu).toContainText('Block 900');
  // The earlier message stays until it is dismissed; the retry added no second one.
  await expect(banner(page)).toHaveCount(1);
  expect(await runInPage(page, 'return await e.db.blocks.count()')).toBe(blocksBefore + 1);
});

test('a typed Blocking refusal is shown once, as written', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await openGolden(page);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const currentBlock = page.getByLabel('Current Block');
  const blockMenu = currentBlock.locator('.menu-field').filter({ hasText: 'Block' }).getByRole('button').first();
  await expect(blockMenu).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Blocks', { exact: true }).locator('.link-button').filter({ hasText: /^26$/ }).click();
  await expect(blockMenu).toContainText('26');

  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Block' });
  await dialog.getByLabel('Name').fill('26');
  await dialog.getByRole('button', { name: 'Create Block', exact: true }).click();
  await expect(banner(page)).toHaveCount(1);
  await expect(banner(page)).toContainText('Another Block on this service day already uses that label.');
  expect(await banner(page).innerText()).not.toMatch(/\s{2}|^\s/);
});

test('a failed startup shows the error banner, not the empty start screen, and never the browser error text', async ({ page }) => {
  await page.addInitScript(() => {
    // Opening the database fails the way a blocked or corrupted store does.
    window.indexedDB.open = () => { throw new DOMException('Internal error opening backing store for indexedDB.open.', 'UnknownError'); };
  });
  await page.goto('/');
  await expect(banner(page)).toHaveText(/Unable to open your saved projects\. Reload this page and try again\./);
  await expect(page.getByRole('heading', { name: 'Start a local planning project' })).toHaveCount(0);
  await expect(banner(page)).not.toContainText(/UnknownError|indexedDB|backing store|Dexie/i);
});

test('selection reloads and exports that fail show the error banner with a next step', async ({ page }) => {
  await openGolden(page);
  // Delete the database under the open page: its connection closes, so every later read fails with a browser error.
  await runInPage(page, 'e.db.close(); await e.db.delete();');

  await page.locator('.context-bar select').nth(1).selectOption({ label: 'Select scenario' });
  await expect(banner(page).filter({ hasText: 'Unable to load that selection. Reload this page and try again.' })).toHaveCount(1);
  await expect(banner(page).filter({ hasText: /Dexie|IndexedDB|database|closed/i }).filter({ hasNotText: 'upgraded in another tab' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dismiss message' }).click();

  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Backup project JSON', exact: true }).click();
  await expect(banner(page).filter({ hasText: 'Unable to export the project backup. Your data was not changed. Try again.' })).toHaveCount(1);
  await expect(banner(page).filter({ hasText: /Dexie|IndexedDB|DatabaseClosed|closed/i }).filter({ hasNotText: 'upgraded in another tab' })).toHaveCount(0);
});
