// Review package P11 (issues I-043 and I-044; findings 6-001, 6-002, 4-008). At the capacity targets of the overview (OV-CAP-01) the
// Blocking compatibility review used to take about 22 seconds and the Costing estimate about 31, because each one re-read every Trip and
// Pattern once per unassigned Trip or once per Block: 600 and 800 reads of the Trips. They now read once. Ported from the review's
// p6-capacity-latency.spec.ts.
//
// What each test holds fixed:
// - The number of times the Trips are read from IndexedDB while the tab opens. That is the defect, it does not depend on how busy the
//   machine is, and the old code did hundreds of reads where the new code does a handful.
// - A coarse time limit, a third of what the old code took, only to catch a return of the slow behavior. The plan's own limits are 1 s for
//   an interaction and 2 s for a render. They are met in the built application (below) but this spec runs on the Vite development server,
//   where React StrictMode runs every effect twice and nothing is minified, and where eight parallel browsers stretch the times a
//   further two to five times, so a tight limit here would fail for the machine's load. Measured in a production build on an idle machine
//   the Blocking review is ready in 0.6 to 0.7 s and the Costing estimate in 0.25 to 0.33 s; on the development server 1.2 to 1.4 s and
//   0.3 s (docs/implementation/review-fixes.md, P11).
import { expect, test, type Page } from '@playwright/test';
import { capacityBackup, type CapacityOpts } from './support/capacityFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(300_000);

async function openCapacityProject(page: Page, options: CapacityOpts) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await seedSnapshot(page, { ...capacityBackup(options), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Route actions', exact: true })).toBeVisible({ timeout: 120_000 });
}

/** Counts reads of the Trips store (`getAll` on the store or on one of its indexes) from now on. */
async function countTripReads(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __tripReads: number };
    w.__tripReads = 0;
    const patch = (prototype: { getAll: (...args: unknown[]) => unknown }, storeOf: (self: unknown) => string) => {
      const original = prototype.getAll;
      prototype.getAll = function (this: unknown, ...args: unknown[]) { if (storeOf(this) === 'trips') w.__tripReads += 1; return original.apply(this, args); };
    };
    patch(IDBObjectStore.prototype as never, (self) => (self as IDBObjectStore).name);
    patch(IDBIndex.prototype as never, (self) => (self as IDBIndex).objectStore.name);
  });
  return () => page.evaluate(() => (window as unknown as { __tripReads: number }).__tripReads);
}

test('Blocking: 300 unassigned Trips are reviewed with a handful of Trip reads and Assign is ready soon after the tab opens (P6-S1-01)', async ({ page }) => {
  await openCapacityProject(page, { tripsPerBlock: 2 });
  expect(await runInPage(page, 'return await e.db.trips.count()')).toBe(2000);
  const tripReads = await countTripReads(page);
  const elapsed = await page.evaluate(async () => {
    const tab = [...document.querySelectorAll('nav button')].find((button) => button.textContent === 'Blocking') as HTMLElement;
    // Ready: the unassigned list has rows, no review is pending, and the first row's button shows its result and is enabled.
    const ready = () => {
      const section = document.querySelector('[aria-label="Unassigned Trips"]');
      if (!section || section.querySelector('.blocking-compatibility-status')) return false;
      const button = section.querySelector<HTMLButtonElement>('tbody tr .assign-button');
      return Boolean(button) && !button!.disabled && button!.textContent?.trim() !== 'Select';
    };
    const started = performance.now();
    tab.click();
    while (!ready()) {
      if (performance.now() - started > 120_000) throw new Error('Assign never became ready.');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return performance.now() - started;
  });
  const reads = await tripReads();
  console.log(`Blocking review at 300 unassigned Trips: ${Math.round(elapsed)} ms, ${reads} reads of the Trips`);
  expect(reads).toBeLessThanOrEqual(16);
  expect(elapsed).toBeLessThanOrEqual(15_000);
  // Every unassigned Trip was reviewed: none is still waiting for its result.
  await expect(page.locator('[aria-label="Unassigned Trips"] tbody .assign-button:disabled')).toHaveCount(0);
  await expect(page.locator('[aria-label="Unassigned Trips"] tbody .assign-button', { hasText: 'Select' })).toHaveCount(0);
});

test('Costing: the estimate at 400 Blocks and 2,000 Trips appears soon after the tab opens, from a handful of Trip reads (P6-S1-02)', async ({ page }) => {
  await openCapacityProject(page, {});
  const tripReads = await countTripReads(page);
  const elapsed = await page.evaluate(async () => {
    const tab = [...document.querySelectorAll('nav button')].find((button) => button.textContent === 'Costing') as HTMLElement;
    const started = performance.now();
    tab.click();
    while (!document.querySelector('.costing-results-table, .costing-alert')) {
      if (performance.now() - started > 120_000) throw new Error('The estimate never appeared.');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return performance.now() - started;
  });
  const reads = await tripReads();
  console.log(`Costing estimate at capacity: ${Math.round(elapsed)} ms, ${reads} reads of the Trips`);
  expect(reads).toBeLessThanOrEqual(8);
  expect(elapsed).toBeLessThanOrEqual(10_000);
  // The estimate is a real one: all 400 Blocks are eligible and the project's rate gives a cost.
  await expect(page.locator('.costing-results-table')).toBeVisible();
  await expect(page.locator('.costing-results-table tfoot')).toContainText('400');
  await expect(page.getByText('No eligible Blocks are available')).toHaveCount(0);
});
