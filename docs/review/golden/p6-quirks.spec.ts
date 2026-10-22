// Phase 6 measurement (index.html): layout metrics of the Trips and Blocking tabs in quirks mode (built dist/index.html, no doctype)
// versus standards mode (same build with <!doctype html><meta charset><meta viewport> prepended). Run once per dist:
//   P6_SCRATCH=<dir> P6_DIST=<dist or dist-std> P6_TAG=quirks|standards PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts p6-quirks
// Writes <scratch>/layout-<tag>.json. Measurement only.
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const S = process.env.P6_SCRATCH!; const TAG = process.env.P6_TAG ?? 'quirks';
test.setTimeout(300000);
const rect = (sel: string) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), fontSize: c.fontSize, lineHeight: c.lineHeight, overflowY: c.overflowY, scrollH: e.scrollHeight, clientH: e.clientHeight }; })()`;
test('layout metrics', async ({ page }) => {
  const out: any = { tag: TAG };
  for (const vp of [{ width: 1600, height: 1000 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(vp);
    await page.goto('/');
    out.compatMode = await page.evaluate(() => document.compatMode);
    if (!(await page.locator('select').first().isVisible().catch(() => false))) {}
    await page.locator('input[type=file]').first().setInputFiles(`${S}/capacity-unassigned.json`).catch(() => undefined);
    await page.getByText(/Imported/).first().waitFor({ timeout: 300000 });
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Route actions', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.schedule-table tbody tr').length >= 100, null, { timeout: 120000 });
    await page.waitForTimeout(1000);
    const key = `${vp.width}x${vp.height}`;
    out[key] = { trips: {} as any, blocking: {} as any };
    for (const sel of ['html', 'body', '#root', '.trips-workspace', '.schedule-table', '.schedule-table table', '.schedule-table thead', '.schedule-table tbody tr', '.schedule-table tbody tr:nth-child(2)', '.schedule-table tbody td:first-child', '.schedule-table tbody select', '.schedule-table tbody input[type=checkbox]', '.topbar', 'nav[aria-label=Primary] button']) {
      out[key].trips[sel] = await page.evaluate(rect(sel));
    }
    out[key].trips.docScroll = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, innerH: innerHeight }));
    out[key].trips.paddingBodyMargin = await page.evaluate(() => { const c = getComputedStyle(document.body); return { margin: c.margin, padding: c.padding, h: c.height }; });
    await page.getByRole('button', { name: 'Blocking', exact: true }).click();
    await page.getByText('Reviewing Trip compatibility…').waitFor({ state: 'detached', timeout: 300000 });
    await page.waitForTimeout(500);
    for (const sel of ['.blocking-workspace', '.unassigned-trips', 'main', '.table-scroll', '.table-scroll table', 'section[aria-label]']) out[key].blocking[sel] = await page.evaluate(rect(sel));
    out[key].blocking.scrollContainers = await page.evaluate(() => [...document.querySelectorAll('.table-scroll')].map((e) => ({ cls: e.className, h: Math.round(e.getBoundingClientRect().height), scrollH: e.scrollHeight, maxH: getComputedStyle(e).maxHeight })));
    out[key].blocking.docScroll = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, innerH: innerHeight }));
    await page.screenshot({ path: `${S}/layout-${TAG}-${key}-blocking.png` });
    await page.getByRole('button', { name: 'Trips', exact: true }).click(); await page.waitForTimeout(800);
    await page.screenshot({ path: `${S}/layout-${TAG}-${key}-trips.png` });
    // fresh DB for the next viewport iteration
    await page.evaluate(async () => { const dbs = await indexedDB.databases(); await Promise.all(dbs.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(0); }))); });
  }
  writeFileSync(`${S}/layout-${TAG}.json`, JSON.stringify(out, null, 1));
});
