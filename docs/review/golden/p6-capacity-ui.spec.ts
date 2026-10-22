// Phase 6 measurement (6.1b/6.2): Chromium, QUIRKS MODE (index.html has no doctype), container CPU.
// Run: P6_SCRATCH=<dir> P6_FIXTURE=capacity-unassigned P6_RUNS=3 [P6_DIST=<vite build dir>] PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium \
//   pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts p6-capacity-ui
// The fixture JSON is produced by p6-capacity-validate.golden.test.ts (P6_SCRATCH). Writes <scratch>/ui-<fixture>-<mode>.json. Measurement only (no defect asserted).
import { test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const S = process.env.P6_SCRATCH!; const FIX = process.env.P6_FIXTURE ?? 'capacity-unassigned'; const RUNS = Number(process.env.P6_RUNS ?? 3);
const MODE = process.env.P6_DIST ? 'prod' : 'dev';
test.setTimeout(1800000);

const frames = '(new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))))';
async function clickInPage(page: Page, sel: string, index: number, text?: string): Promise<{ syncMs: number; paintMs: number }> {
  return page.evaluate(async ({ sel, index, text }) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => !text || (e.textContent ?? '').includes(text));
    const el = els[index] as HTMLElement; const t = performance.now(); el.click(); const s = performance.now() - t;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))));
    return { syncMs: s, paintMs: performance.now() - t };
  }, { sel, index, text });
}
const storage = (page: Page) => page.evaluate(async () => { const e = await navigator.storage.estimate(); const persisted = await navigator.storage.persisted(); return { usage: e.usage, quota: e.quota, persisted, details: (e as any).usageDetails }; });

test(`capacity UI timings ${FIX} ${MODE}`, async ({ browser }) => {
  const all: any[] = [];
  for (let run = 0; run < RUNS; run++) {
    const m: Record<string, any> = {};
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors: string[] = []; page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto('/');
    await page.getByRole('button', { name: 'Project actions', exact: true }).waitFor();
    m.storageBefore = await storage(page);
    let t = performance.now();
    await page.locator('input[type=file]').first().setInputFiles(`${S}/${FIX}.json`);
    await page.getByText(/Imported/).first().waitFor({ timeout: 300000 });
    m.restoreMs = performance.now() - t;
    await page.waitForTimeout(500);
    m.storageAfter = await storage(page);
    t = performance.now();
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Route actions', exact: true }).waitFor({ timeout: 120000 });
    m.selectProjectMs = performance.now() - t;
    await page.waitForTimeout(1500);

    // --- Trips tab first render
    t = performance.now();
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.schedule-table tbody tr').length >= 20, null, { timeout: 120000 });
    m.tripsTabFirstRenderMs = performance.now() - t;
    m.tripsRows = await page.locator('.schedule-table tbody tr').count();
    await page.waitForTimeout(1500);
    const cb = '.schedule-table tbody input[type=checkbox]';
    const toggles: any[] = []; for (let i = 0; i < 5; i++) toggles.push(await clickInPage(page, cb, i + 3));
    m.rowToggle_none_selected = toggles;
    // select-all then toggle one
    m.selectAll = await clickInPage(page, '.schedule-table thead input[type=checkbox]', 0);
    await page.waitForTimeout(500);
    const t2: any[] = []; for (let i = 0; i < 3; i++) t2.push(await clickInPage(page, cb, i + 3));
    m.rowToggle_all_selected = t2;
    m.deselectAll = await clickInPage(page, '.schedule-table thead input[type=checkbox]', 0);
    await page.waitForTimeout(500);
    // Display toggles via Trip actions menu
    const tripActions = page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true });
    for (const [key, text] of [['showHeadwaysOn', 'Show headways'], ['showHeadwaysOff', 'Show headways'], ['showBandsOn', 'Show runtime bands'], ['showBandsOff', 'Show runtime bands']] as const) {
      await tripActions.click(); await page.waitForTimeout(150);
      m[key] = await clickInPage(page, '[role^=menuitem]', 0, text);
      await page.waitForTimeout(400);
    }
    // --- Regenerate selected for all rows of the displayed direction table
    await page.locator('.schedule-table thead input[type=checkbox]').check();
    await page.waitForTimeout(500);
    await tripActions.click();
    const regen = page.getByRole('menuitem', { name: /Regenerate selected/ });
    m.regenerateEnabled = await regen.isEnabled();
    if (m.regenerateEnabled) {
      t = performance.now(); await regen.click();
      const apply = page.getByRole('button', { name: 'Regenerate trips', exact: true });
      await apply.waitFor({ timeout: 120000 });
      await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Regenerate trips'); return !!b && !(b as HTMLButtonElement).disabled; }, null, { timeout: 120000 }).catch(() => undefined);
      m.regenerateReviewMs = performance.now() - t;
      t = performance.now();
      await apply.click().catch(() => undefined);
      await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 120000 }).catch(() => undefined);
      m.regenerateApplyMs = performance.now() - t;
      const confirmBtn = page.getByRole('button', { name: /Regenerate|Confirm|Apply/ });
      void confirmBtn;
    } else { await page.keyboard.press('Escape'); }
    await page.waitForTimeout(500);

    // --- Blocking tab
    const pending = page.getByText('Reviewing Trip compatibility…');
    t = performance.now();
    await page.getByRole('button', { name: 'Blocking', exact: true }).click();
    m.blockingPendingSeen = await pending.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    await pending.waitFor({ state: 'detached', timeout: 600000 });
    m.blockingTabUntilAssignEnabledMs = performance.now() - t;
    m.unassignedRows = await page.locator('table tbody tr').count();
    // switch Block
    await page.getByLabel('Current Block').getByRole('button').first().click();
    const items = page.locator('[role=menu] [role^=menuitem]');
    const n = await items.count();
    const times: number[] = [];
    for (let k = 0; k < 3; k++) {
      if (k > 0) await page.getByLabel('Current Block').getByRole('button').first().click();
      const target = items.nth(k + 1);
      t = performance.now(); await target.click();
      await pending.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
      await pending.waitFor({ state: 'detached', timeout: 600000 });
      times.push(performance.now() - t);
    }
    m.blockSwitchUntilAssignEnabledMs = times; m.blockMenuItems = n;

    // Costing tab timing is measured by p6-costing-timing.spec.ts (the 'Loading Costing…' text lasts ~40 ms; the estimate is computed afterwards).

    // --- Backup export (JSON)
    await page.getByRole('button', { name: 'Project actions', exact: true }).click();
    t = performance.now();
    const dl = page.waitForEvent('download', { timeout: 300000 });
    await page.getByRole('menuitem', { name: 'Backup project JSON', exact: true }).click();
    const d = await dl; m.exportDownloadStartMs = performance.now() - t;
    const path = await d.path(); const { statSync } = await import('node:fs'); m.exportBytes = statSync(path!).size;
    m.pageErrors = errors;
    all.push(m);
    await ctx.close();
  }
  writeFileSync(`${S}/ui-${FIX}-${MODE}.json`, JSON.stringify(all, null, 1));
  console.log(JSON.stringify(all, null, 1));
});
