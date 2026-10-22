// Phase 6 measurement (6.2): Chromium CPU profile (CDP Profiler) attribution at capacity. QUIRKS MODE, container CPU, unminified production build.
// Run: P6_SCRATCH=<dir> P6_DIST=<vite build --minify false dir> P6_FIXTURE=capacity-unassigned PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium \
//   pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts p6-capacity-profile
// Writes <scratch>/profile-<fixture>.json (top self-time functions and idle share per phase) plus a raw IndexedDB getAll micro-benchmark. Measurement only.
import { test, type Page, type CDPSession } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const S = process.env.P6_SCRATCH!; const FIX = process.env.P6_FIXTURE ?? 'capacity-unassigned';
test.setTimeout(900000);

function summarize(profile: any, wallMs: number) {
  const nodes = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
  const self = new Map<string, number>();
  const dt: number[] = profile.timeDeltas; const ids: number[] = profile.samples;
  let total = 0;
  ids.forEach((id, i) => { const n = nodes.get(id); const cf = n.callFrame; const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; const d = dt[i] / 1000; total += d; self.set(key, (self.get(key) ?? 0) + d); });
  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]);
  const pct = (name: string) => +(((self.get(name) ?? 0) / total) * 100).toFixed(1);
  return { wallMs: +wallMs.toFixed(0), sampledMs: +total.toFixed(0), idlePct: pct('(idle) :1'), programPct: pct('(program) :1'), gcPct: pct('(garbage collector) :1'), top: rows.slice(0, 22).map(([k, v]) => `${v.toFixed(0)} ms  ${k}`) };
}
async function profiled(page: Page, cdp: CDPSession, label: string, out: any, action: () => Promise<void>) {
  await cdp.send('Profiler.start'); const t = performance.now();
  await action();
  const wall = performance.now() - t; const { profile } = await cdp.send('Profiler.stop');
  out[label] = summarize(profile, wall);
}

test('profile capacity', async ({ page }) => {
  const out: any = {};
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(`${S}/${FIX}.json`);
  await page.getByText(/Imported/).first().waitFor({ timeout: 300000 });
  await page.locator('select').first().selectOption({ index: 1 });
  await page.waitForTimeout(1500);
  out.idbGetAll = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('transit-costing-tool'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const xs: number[] = []; let n = 0;
    for (let i = 0; i < 5; i++) { const t = performance.now(); n = await new Promise<number>((res, rej) => { const rq = db.transaction('trips').objectStore('trips').getAll(); rq.onsuccess = () => res(rq.result.length); rq.onerror = () => rej(rq.error); }); xs.push(performance.now() - t); }
    const t3: number[] = []; let pn = 0;
    for (let i = 0; i < 5; i++) { const t = performance.now(); pn = await new Promise<number>((res, rej) => { const rq = db.transaction('patterns').objectStore('patterns').getAll(); rq.onsuccess = () => res(rq.result.length); rq.onerror = () => rej(rq.error); }); t3.push(performance.now() - t); }
    db.close(); return { tripsRecords: n, tripsGetAllMs: xs.map((x) => +x.toFixed(1)), patternsRecords: pn, patternsGetAllMs: t3.map((x) => +x.toFixed(1)) };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.schedule-table tbody tr').length >= 100, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0))));
  void frames;
  await profiled(page, cdp, 'tripsToggleRowCheckbox x5', out, async () => {
    for (let i = 0; i < 5; i++) await page.evaluate(async (i) => { (document.querySelectorAll('.schedule-table tbody input[type=checkbox]')[i + 3] as HTMLElement).click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))); }, i);
  });
  await profiled(page, cdp, 'tripsToggleShowHeadways x2', out, async () => {
    for (let i = 0; i < 2; i++) { await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click(); await page.evaluate(async () => { ([...document.querySelectorAll('[role^=menuitem]')].find((e) => (e.textContent ?? '').includes('Show headways')) as HTMLElement).click(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(0)))); }); await page.waitForTimeout(300); }
  });
  if (process.env.P6_REGEN) {
    await page.locator('.schedule-table thead input[type=checkbox]').check();
    await profiled(page, cdp, 'regenerateReview (select-all rows, dialog preview ready)', out, async () => {
      await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
      await page.getByRole('menuitem', { name: /Regenerate selected/ }).click();
      await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Regenerate trips'); return !!b && !(b as HTMLButtonElement).disabled; }, null, { timeout: 120000 });
    });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  const pending = page.getByText('Reviewing Trip compatibility…');
  if (process.env.P6_SKIP_REST) { writeFileSync(`${S}/profile-${FIX}-regen.json`, JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1)); return; }
  await profiled(page, cdp, 'blockingTabUntilAssignEnabled', out, async () => {
    await page.getByRole('button', { name: 'Blocking', exact: true }).click();
    await pending.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    await pending.waitFor({ state: 'detached', timeout: 600000 });
  });
  await profiled(page, cdp, 'costingTab', out, async () => {
    await page.getByRole('button', { name: 'Costing', exact: true }).click();
    const loading = page.getByText('Loading Costing…');
    await loading.waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
    await loading.waitFor({ state: 'detached', timeout: 600000 });
  });
  writeFileSync(`${S}/profile-${FIX}.json`, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
});
