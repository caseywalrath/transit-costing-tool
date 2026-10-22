// Phase 6 measurement (6.6): what the planner sees when a Dexie write rejects with QuotaExceededError.
// SIMULATION: IDBObjectStore.put/add are patched to throw DOMException('QuotaExceededError') after the app has loaded; real quota exhaustion
// aborts the transaction with the same error name (Dexie maps both to Dexie.QuotaExceededError). Run:
//   P6_SCRATCH=<dir> PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts p6-quota
// Records visible text only; no defect asserted (the lead decides). Also records navigator.storage.persisted()/estimate() usage and grep-level absence.
import { test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const S = process.env.P6_SCRATCH!;
test.setTimeout(300000);

const visible = (page: Page) => page.evaluate(() => ({
  notice: [...document.querySelectorAll('.notice')].map((e) => (e.textContent ?? '').trim()),
  saveStatus: [...document.querySelectorAll('.save-status')].map((e) => (e.textContent ?? '').trim()),
  alerts: [...document.querySelectorAll('[role=alert]')].map((e) => (e.textContent ?? '').trim()),
}));
test('quota error surfaces', async ({ page }) => {
  const out: any = {};
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles('output/federal-brt-import/federal-brt-project-backup.json');
  await page.getByText(/Imported/).first().waitFor({ timeout: 120000 });
  await page.locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Route actions', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Dismiss message' }).click();
  out.persisted = await page.evaluate(() => navigator.storage.persisted());
  const patch = () => page.evaluate(() => {
    const err = () => new DOMException('The current transaction exceeded its quota limitations.', 'QuotaExceededError');
    for (const k of ['put', 'add'] as const) { const orig = (IDBObjectStore.prototype as any)[k]; (IDBObjectStore.prototype as any)[k] = function () { throw err(); }; (window as any)[`__orig_${k}`] = orig; }
  });
  const unpatch = () => page.evaluate(() => { for (const k of ['put', 'add']) (IDBObjectStore.prototype as any)[k] = (window as any)[`__orig_${k}`]; });

  // (1) Route edit
  await patch();
  const desc = page.getByLabel('Description').first();
  await desc.fill('quota test'); await desc.blur(); await page.waitForTimeout(1500);
  out.routeEdit = await visible(page);
  await unpatch();
  await page.getByRole('button', { name: 'Dismiss message' }).click().catch(() => undefined);

  // (2) Trips: Build trips
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Build trips…' }).click();
  const drawer = page.locator('.build-trips-drawer');
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await page.getByLabel('First Trip').fill('23:00'); await page.getByLabel('Headway').fill('30'); await page.getByLabel('Number of Trips').fill('3').catch(() => undefined);
  await patch();
  await page.getByRole('button', { name: 'Build', exact: true }).click(); await page.waitForTimeout(2000);
  out.buildTrips = await visible(page);
  await unpatch();
  await page.getByRole('button', { name: 'Close Build Trips drawer' }).click().catch(() => undefined);

  // (3) Blocking: New Block
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await page.waitForTimeout(3000);
  await page.getByLabel('Current Block').getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'New Block' });
  await dlg.getByLabel('Name').fill('QuotaBlock');
  await patch();
  await dlg.getByRole('button', { name: 'Create Block', exact: true }).click(); await page.waitForTimeout(2000);
  out.newBlock = await visible(page);
  out.newBlockDialogStillOpen = await dlg.isVisible().catch(() => false);
  await unpatch();
  writeFileSync(`${S}/quota.json`, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
});
