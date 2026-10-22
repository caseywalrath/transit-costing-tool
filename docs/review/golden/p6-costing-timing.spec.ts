// Phase 6 measurement (6.1b/6.2): Costing tab load time, measured in-page (MutationObserver) so a missed "Loading Costing…" frame cannot inflate it.
// Also re-measures Blocking-tab compatibility review the same way. QUIRKS MODE, production build, container CPU.
// Run: P6_SCRATCH=<dir> P6_FIXTURE=<json basename in scratch> P6_RUNS=3 P6_DIST=<dist> PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts p6-costing-timing
import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const S = process.env.P6_SCRATCH!; const FIX = process.env.P6_FIXTURE ?? 'capacity-unassigned'; const RUNS = Number(process.env.P6_RUNS ?? 3);
test.setTimeout(1800000);
// Resolves with ms from click() until `absentText` no longer appears in document.body; reports whether it was present right after click.
const timeTab = (page: any, tabName: string, text: string) => page.evaluate(async ({ tabName, text }: any) => {
  const btn = [...document.querySelectorAll('nav button')].find((b) => b.textContent === tabName) as HTMLElement;
  const has = () => (document.body.innerText || '').includes(text);
  const t = performance.now(); btn.click();
  // The pending text is set by an effect after mount, so wait up to 3 s for it to appear before waiting for it to go away.
  let seen = false; const deadline = performance.now() + 3000;
  while (performance.now() < deadline) { if (has()) { seen = true; break; } await new Promise((r) => setTimeout(r, 5)); }
  if (!seen) return { seen, ms: performance.now() - t, note: 'text never appeared within 3 s' };
  await new Promise<void>((resolve) => { const check = () => { if (!has()) resolve(); else setTimeout(check, 25); }; check(); });
  return { seen, ms: performance.now() - t };
}, { tabName, text });
// Costing: the estimate is computed after 'Loading Costing…' disappears; the page shows a results table or an alert when done.
const timeCosting = (page: any) => page.evaluate(async () => {
  const btn = [...document.querySelectorAll('nav button')].find((b) => b.textContent === 'Costing') as HTMLElement;
  const done = () => !!document.querySelector('.costing-results-table, .costing-alert');
  const t = performance.now(); btn.click();
  let pendingText = ''; const seenTexts = new Set<string>();
  await new Promise<void>((resolve) => { const check = () => { const m = (document.body.innerText || '').match(/Loading Costing…|Select a valid Blocking Scenario to calculate an estimate\./); if (m) seenTexts.add(m[0]); if (done()) resolve(); else setTimeout(check, 25); }; check(); });
  void pendingText; return { ms: performance.now() - t, interimTexts: [...seenTexts] };
});
test(`costing/blocking timing ${FIX}`, async ({ browser }) => {
  const all: any[] = [];
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); const page = await ctx.newPage();
    await page.goto('/');
    await page.locator('input[type=file]').first().setInputFiles(`${S}/${FIX}.json`);
    await page.getByText(/Imported/).first().waitFor({ timeout: 300000 });
    await page.locator('select').first().selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Route actions', exact: true }).waitFor({ timeout: 120000 });
    await page.waitForTimeout(1000);
    const m: any = {};
    m.blocking = await timeTab(page, 'Blocking', 'Reviewing Trip compatibility…');
    await page.waitForTimeout(500);
    m.costing = await timeCosting(page);
    await page.waitForTimeout(500);
    m.costingBodyHead = (await page.locator('body').innerText()).replace(/\n+/g, ' | ').slice(150, 420);
    all.push(m); await ctx.close();
  }
  writeFileSync(`${S}/costing-timing-${FIX}.json`, JSON.stringify(all, null, 1)); console.log(JSON.stringify(all, null, 1));
});
