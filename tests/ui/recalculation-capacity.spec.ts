// Review package U08 (issue I-096, finding 6-005). At the capacity targets of the overview (OV-CAP-01), "Regenerate selected" on a
// Direction table of 500 Trips took about 2.5 seconds to show its review and as long to apply it. The dialog built one anchor list per
// Trip with every point of its Pattern (about 14,000 options), and the review read the Pattern, assignment, and profile once per Trip.
// Each anchor list now holds only its chosen point until the planner opens it, and the review reads each Pattern once.
//
// What each test holds fixed:
// - The number of anchor options in the dialog before any list is opened, and the number of Pattern reads during the review. They are
//   the defect, they do not depend on how busy the machine is, and the old code built 14,431 options and read the Pattern 481 times.
// - A coarse time limit, only to catch a return of the slow behavior. The plan's limit is 1 s for an interaction. It is met in the built
//   application (docs/implementation/review-fixes.md, U08) but this spec runs on the Vite development server, where React StrictMode
//   runs every effect twice and nothing is minified, and where parallel browsers stretch the times further.
// - Anchor selection stays available for every Trip, by pointer and by keyboard, and a chosen anchor is used by the review.
import { expect, test, type Page } from '@playwright/test';
import { capacityBackup } from './support/capacityFixture';
import { seedSnapshot } from './support/dexieEnv';

test.setTimeout(300_000);

const POINTS = 30;

async function openRegenerateDialog(page: Page, width = 1600) {
  await page.setViewportSize({ width, height: 1000 });
  await seedSnapshot(page, { ...capacityBackup({ allOutbound: true, calculationMethod: 'blendSegments' }), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Route actions', exact: true })).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect.poll(() => page.locator('.schedule-table tbody tr').count(), { timeout: 120_000 }).toBeGreaterThanOrEqual(100);
  await page.locator('.schedule-table thead input[type=checkbox]').first().check();
  // Count the reads of the Patterns store from here on.
  await page.evaluate(() => {
    const w = window as unknown as { __patternReads: number };
    w.__patternReads = 0;
    const original = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['get']>) { if (this.name === 'patterns') w.__patternReads += 1; return original.apply(this, args); };
  });
  const reviewMs = await page.evaluate(async () => {
    const item = [...document.querySelectorAll('button')].find((element) => element.textContent === 'Regenerate…') as HTMLElement;
    const ready = () => { const button = [...document.querySelectorAll('button')].find((element) => element.textContent === 'Regenerate trips') as HTMLButtonElement | undefined; return Boolean(button) && !button!.disabled; };
    const started = performance.now();
    item.click();
    while (!ready()) {
      if (performance.now() - started > 120_000) throw new Error('The review never finished.');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return performance.now() - started;
  });
  const dialog = page.getByRole('dialog', { name: 'Regenerate selected trips' });
  const rows = await dialog.locator('tbody tr').count();
  const patternReads = await page.evaluate(() => (window as unknown as { __patternReads: number }).__patternReads);
  return { dialog, rows, reviewMs, patternReads };
}

test('Regenerate selected on 480 Trips: the review builds one option per anchor, reads the Pattern a handful of times, and applies (I-096)', async ({ page }) => {
  const { dialog, rows, reviewMs, patternReads } = await openRegenerateDialog(page);
  expect(rows).toBe(480);
  await expect(dialog.locator('tbody select')).toHaveCount(rows);
  // One option per closed anchor list; the old dialog held every point of the Pattern in each (14,431 options).
  expect(await dialog.locator('tbody option').count()).toBe(rows);
  expect(patternReads).toBeLessThanOrEqual(8);
  expect(reviewMs).toBeLessThanOrEqual(10_000);
  const applyMs = await page.evaluate(async () => {
    const button = [...document.querySelectorAll('button')].find((element) => element.textContent === 'Regenerate trips') as HTMLButtonElement;
    const started = performance.now();
    button.click();
    while (document.querySelector('[role=dialog]')) {
      if (performance.now() - started > 120_000) throw new Error('The apply never finished.');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return performance.now() - started;
  });
  console.log(`Regenerate selected at 480 Trips (development server): review ${Math.round(reviewMs)} ms, apply ${Math.round(applyMs)} ms, ${patternReads} Pattern reads`);
  expect(applyMs).toBeLessThanOrEqual(10_000);
  await expect(dialog).toBeHidden();
});

test('Regenerate selected at capacity: every Trip keeps its anchor choice, by pointer and by keyboard, and the review uses it (I-096)', async ({ page }) => {
  const { dialog, rows } = await openRegenerateDialog(page);
  const anchors = dialog.locator('tbody select');
  for (const index of [0, Math.floor(rows / 2), rows - 1]) {
    const anchor = anchors.nth(index);
    await expect(anchor.locator('option')).toHaveCount(1);
    await expect(anchor).toHaveValue(/-0$/);
    // Pointer: pressing the list fills it with every point of the Pattern before it opens.
    await anchor.click();
    await expect(anchor.locator('option')).toHaveCount(POINTS);
    await page.keyboard.press('Escape');
    await expect(anchor.locator('option').first()).toHaveText('First departure');
    await expect(anchor.locator('option').last()).toHaveText('Last timepoint');
  }
  // Keyboard: focusing the next closed list fills it, and the arrow key moves to the next point.
  const keyboardAnchor = anchors.nth(1);
  await expect(keyboardAnchor.locator('option')).toHaveCount(1);
  await keyboardAnchor.focus();
  await expect(keyboardAnchor.locator('option')).toHaveCount(POINTS);
  await keyboardAnchor.press('ArrowDown');
  await expect(keyboardAnchor).toHaveValue(/-1$/);
  await expect(keyboardAnchor.locator('option:checked')).toHaveText('Stop 1');
  // The changed anchor starts a new review; the other lists keep a single option and the dialog can still apply.
  await expect(dialog.getByRole('button', { name: 'Regenerate trips' })).toBeEnabled({ timeout: 60_000 });
  await expect(anchors.nth(2).locator('option')).toHaveCount(1);
  const last = anchors.nth(rows - 1);
  await last.selectOption({ label: 'Last timepoint' });
  await expect(last).toHaveValue(new RegExp(`-${POINTS - 1}$`));
  await expect(dialog.getByRole('button', { name: 'Regenerate trips' })).toBeEnabled({ timeout: 60_000 });
  // The bulk choice still reaches every Trip.
  await dialog.getByRole('button', { name: 'Last timepoint', exact: true }).click();
  await expect(anchors.nth(0)).toHaveValue(new RegExp(`-${POINTS - 1}$`));
  await expect(anchors.nth(rows - 1)).toHaveValue(new RegExp(`-${POINTS - 1}$`));
  await expect(dialog.locator('tbody option')).toHaveCount(rows + 4 * (POINTS - 1)); // the four lists opened above
});

test('Regenerate selected at 1024 px: the dialog fits the window and its table scrolls from its first column (U08 visual check)', async ({ page }) => {
  const { dialog } = await openRegenerateDialog(page, 1024);
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(1024);
  await expect(dialog.getByRole('button', { name: 'Regenerate trips' })).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 });
  // The table starts at the left edge of its scrolling area, so the Trip and Anchor columns are not cut off.
  const edges = await dialog.locator('.preview-times').evaluate((area) => ({ area: area.getBoundingClientRect().left, table: area.querySelector('table')!.getBoundingClientRect().left, scrolls: area.scrollWidth > area.clientWidth }));
  expect(edges.table).toBeGreaterThanOrEqual(edges.area);
  expect(edges.scrolls).toBe(true);
});
