// Backs findings P6-S1-01 (Blocking compatibility review: one classifyInsertion + listTrips + listPatterns per unassigned Trip, 4-008) and
// P6-S1-02 (Costing context: one getBlockSummary per Block, each re-reading the scenario Trip list; main.tsx:35). Browser, Chromium, QUIRKS MODE.
// Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts p6-capacity-latency
// Defect tests assert the EXPECTED behaviour (OV-CAP-01 "smooth ... at that scale"; plan thresholds: interaction <= 1 s, render <= 2 s) and are marked test.fail().
import { expect, test, type Page } from '@playwright/test';
import { capacityBackup } from './p6-capacity-fixture.ts';
test.setTimeout(300000);

async function load(page: Page, backup: any) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'cap.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByText(/Imported/).first().waitFor({ timeout: 300000 });
  await page.locator('select').first().selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Route actions', exact: true }).waitFor({ timeout: 120000 });
}

test.fail('P6-S1-01: Blocking tab at 300 unassigned Trips enables Assign controls within 1 s of opening (observed ~22 s)', async ({ page }) => {
  await load(page, capacityBackup({ tripsPerBlock: 2 }));
  const ms = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('nav button')].find((b) => b.textContent === 'Blocking') as HTMLElement;
    const has = () => (document.body.innerText || '').includes('Reviewing Trip compatibility…');
    const t = performance.now(); btn.click();
    const deadline = performance.now() + 5000; while (performance.now() < deadline && !has()) await new Promise((r) => setTimeout(r, 5));
    while (has()) await new Promise((r) => setTimeout(r, 25));
    return performance.now() - t;
  });
  expect(ms).toBeLessThanOrEqual(1000);
});

test.fail('P6-S1-02: Costing tab at 400 Blocks / 2,000 Trips shows its estimate within 2 s (observed ~31 s)', async ({ page }) => {
  await load(page, capacityBackup({}));
  const ms = await page.evaluate(async () => {
    const btn = [...document.querySelectorAll('nav button')].find((b) => b.textContent === 'Costing') as HTMLElement;
    const t = performance.now(); btn.click();
    while (!document.querySelector('.costing-results-table, .costing-alert')) await new Promise((r) => setTimeout(r, 25));
    return performance.now() - t;
  });
  expect(ms).toBeLessThanOrEqual(2000);
});
