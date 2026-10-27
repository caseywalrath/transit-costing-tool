// Screenshot tour for visual review. Skipped unless UI_TOUR=1. Output: test-results/ui-tour/<width>/<tab>.png
import { test, expect } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { openGoldenTrips } from './support/tripsWorkspace';
import { editRuntimeCell, openRuntimes, runCommand, runtimeCell, scopeField } from './support/ui';

test.skip(!process.env.UI_TOUR, 'Set UI_TOUR=1 to capture the tour.');

for (const width of [1024, 1440]) {
  test(`tour at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    await openGoldenTrips(page);
    const out = (name: string) => `test-results/ui-tour/${width}/${name}.png`;
    await page.screenshot({ path: out('trips'), fullPage: false });
    for (const tab of ['Route', 'Blocking', 'Costing'] as const) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: out(tab.toLowerCase()), fullPage: true });
    }
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await expect(page.locator('.schedule-table tbody tr').first()).toBeVisible();
    await page.screenshot({ path: out('trips-full'), fullPage: true });
    // UR-6c: Runtimes open, a selection, and the O-2 case (rows 120 to 125 selected, the page scrolled to them).
    await openRuntimes(page);
    await page.screenshot({ path: out('trips-runtimes-open'), fullPage: false });
    const boxes = page.locator('.trips-workspace .schedule-table tbody input[type="checkbox"]');
    await boxes.nth(2).check();
    await boxes.nth(3).check();
    await page.screenshot({ path: out('trips-selection'), fullPage: false });
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    for (let row = 120; row <= 125; row += 1) await boxes.nth(row).check();
    await boxes.nth(122).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(300);
    await page.screenshot({ path: out('trips-selection-scrolled'), fullPage: false });
    // UR-6d: Blocking with unassigned trips (Block 11 deleted, so its Trips are unassigned), with selections in both tables. The shot above
    // (`blocking`) is the rail, because every weekday Trip of the golden project is assigned.
    await runInPage(page, "const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday'); const block = (await e.db.blocks.toArray()).find((item) => item.label === '11' && item.serviceDayId === day.id); await e.db.blocks.delete(block.id);");
    await page.reload();
    await page.getByRole('button', { name: 'Blocking', exact: true }).click();
    const unassigned = page.getByLabel('Unassigned Trips', { exact: true });
    await expect(unassigned).toBeVisible();
    const block = page.getByRole('region', { name: 'Current Block', exact: true });
    await block.locator('.menu-field').getByRole('button').first().click();
    await page.getByRole('menuitemradio', { name: '26', exact: true }).click();
    await unassigned.locator('tbody input[type="checkbox"]').nth(0).check();
    await block.locator('tbody input[type="checkbox"]').nth(2).check();
    await block.locator('tbody input[type="checkbox"]').nth(3).check();
    await page.waitForTimeout(500);
    await page.screenshot({ path: out('blocking-unassigned'), fullPage: true });
    // UR-7: the Runtimes grid with two edited cells (corner marks and the save bar) and a third cell refused while editing.
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await openRuntimes(page);
    const runtimes = page.getByRole('region', { name: 'Runtimes section' });
    await editRuntimeCell(runtimes, 'Time band 2 segment 3', ':14');
    await editRuntimeCell(runtimes, 'Time band 3 segment 3', ':09');
    await runtimeCell(runtimes, 'Time band 3 segment 5').dblclick();
    await runtimes.getByRole('textbox', { name: 'Time band 3 segment 5', exact: true }).fill('abc');
    await page.keyboard.press('Enter');
    await runtimes.scrollIntoViewIfNeeded();
    await page.screenshot({ path: out('trips-runtime-grid'), fullPage: false });
    // UR-8: headways on (pinned Departs column, changed-headway markers), scrolled down and right to show the pinned columns and headings.
    await page.reload();
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await scopeField(page, 'Day').selectOption({ label: 'Weekday' });
    await expect(page.locator('.trips-workspace .schedule-table tbody tr')).toHaveCount(138, { timeout: 30_000 });
    await runCommand(page, 'trips.toggleHeadways');
    const schedule = page.locator('.trips-workspace .schedule-table');
    await expect(schedule.locator('th.trip-departs-column')).toBeVisible();
    await schedule.locator('td.trip-headway-changed').nth(2).evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.evaluate(() => window.scrollBy(0, 1));
    await page.waitForTimeout(500);
    await page.screenshot({ path: out('trips-headways'), fullPage: false });
    // UR-9: the header select menu open (headways still on), and a Pattern chip menu open with one pattern selected.
    await schedule.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 0));
    await schedule.getByRole('button', { name: 'Select trips by…', exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: out('trips-select-menu'), fullPage: false });
    await page.getByRole('menuitem', { name: /\(65\)$/ }).first().click();
    await schedule.locator('tbody tr').nth(2).locator('.chip-menu-trigger').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: out('trips-chip-menu'), fullPage: false });
    // Packages add states here.
  });
}
