// Screenshot tour for visual review. Skipped unless UI_TOUR=1. Output: test-results/ui-tour/<width>/<tab>.png
import { test, expect } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';
import { openRuntimes } from './support/ui';

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
    // Packages add states here, for example headways on, Blocking with unassigned trips.
  });
}
