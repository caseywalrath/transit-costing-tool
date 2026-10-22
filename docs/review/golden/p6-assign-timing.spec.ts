// Phase 6 measurement (6.2): time from clicking "Assign" (assign one unassigned Trip) until the Assign controls are enabled again, at capacity
// (300 unassigned Trips on the day). QUIRKS MODE, production build, container CPU. Run:
//   P6_SCRATCH=<dir> P6_RUNS=3 P6_DIST=<dist> PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts p6-assign-timing
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const S = process.env.P6_SCRATCH!; const RUNS = Number(process.env.P6_RUNS ?? 3);
test.setTimeout(1800000);
test('assign one Trip at capacity', async ({ browser }) => {
  const all: any[] = [];
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage();
    await page.goto('/');
    await page.locator('input[type=file]').first().setInputFiles(`${S}/capacity-unassigned.json`);
    await page.getByText(/Imported/).first().waitFor({ timeout: 300000 });
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Route actions', exact: true }).waitFor({ timeout: 120000 });
    await page.getByRole('button', { name: 'Blocking', exact: true }).click();
    const pending = page.getByText('Reviewing Trip compatibility…');
    await pending.waitFor({ state: 'visible', timeout: 10000 });
    await pending.waitFor({ state: 'detached', timeout: 600000 });
    const m: any = {}; console.log('run', run, 'blocking ready');
    m.unassignedBefore = await page.locator('.blocking-trips-table tbody tr').count();
    const sel = page.locator('.blocking-trips-table tbody').getByRole('button', { name: 'Assign', exact: true });
    const enabledIdx = await page.evaluate(() => [...document.querySelectorAll('.blocking-trips-table tbody button')].findIndex((b) => b.textContent === 'Assign' && !(b as HTMLButtonElement).disabled));
    m.firstEnabledSelectIndex = enabledIdx;
    const t = performance.now();
    if (enabledIdx < 0) throw new Error('no enabled Assign button'); await page.locator('.blocking-trips-table tbody button:not([disabled])', { hasText: /^Assign$/ }).first().click({ timeout: 10000 }); void sel;
    await pending.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
    await pending.waitFor({ state: 'detached', timeout: 600000 });
    console.log('assign done');
    m.assignOneUntilControlsEnabledMs = performance.now() - t;
    m.unassignedAfter = await page.locator('.blocking-trips-table tbody tr').count();
    all.push(m); await ctx.close();
  }
  writeFileSync(`${S}/assign-timing.json`, JSON.stringify(all, null, 1)); console.log(JSON.stringify(all, null, 1));
});
