// Phase 6 measurement (6.1b): "Regenerate selected…" on every Trip of one direction table, measured in-page (no Playwright polling in the window).
// Reports review time (menu click -> dialog "Regenerate trips" enabled), apply time (click -> dialog gone and table reloaded), and dialog DOM size.
// QUIRKS MODE, production build, container CPU. Run:
//   P6_SCRATCH=<dir> P6_FIXTURE=capacity-oneDir-blend|capacity-unassigned P6_RUNS=3 P6_DIST=<dist> PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts p6-regenerate-timing
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const S = process.env.P6_SCRATCH!; const FIX = process.env.P6_FIXTURE ?? 'capacity-oneDir-blend'; const RUNS = Number(process.env.P6_RUNS ?? 3);
test.setTimeout(1800000);
test(`regenerate timing ${FIX}`, async ({ browser }) => {
  const all: any[] = [];
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage();
    await page.goto('/');
    await page.locator('input[type=file]').first().setInputFiles(`${S}/${FIX}.json`);
    await page.getByText(/Imported/).first().waitFor({ timeout: 300000 });
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Route actions', exact: true }).waitFor({ timeout: 120000 });
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.schedule-table tbody tr').length >= 100, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.locator('.schedule-table thead input[type=checkbox]').check();
    await page.waitForTimeout(500);
    await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
    await page.waitForTimeout(200);
    const m: any = await page.evaluate(async () => {
      const item = [...document.querySelectorAll('[role^=menuitem]')].find((e) => (e.textContent ?? '').includes('Regenerate selected')) as HTMLElement;
      const ready = () => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Regenerate trips') as HTMLButtonElement | undefined; return !!b && !b.disabled; };
      const t = performance.now(); item.click();
      while (!ready()) await new Promise((r) => setTimeout(r, 10));
      const review = performance.now() - t;
      const dlg = document.querySelector('[role=dialog]')!;
      return { reviewMs: review, dialogRows: dlg.querySelectorAll('tbody tr').length, dialogOptions: dlg.querySelectorAll('option').length, dialogNodes: dlg.querySelectorAll('*').length };
    });
    const apply = await page.evaluate(async () => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Regenerate trips') as HTMLButtonElement;
      const t = performance.now(); b.click();
      while (document.querySelector('[role=dialog]')) await new Promise((r) => setTimeout(r, 10));
      return performance.now() - t;
    });
    m.applyMs = apply; all.push(m); await ctx.close();
  }
  writeFileSync(`${S}/regen-${FIX}.json`, JSON.stringify(all, null, 1)); console.log(JSON.stringify(all));
});
