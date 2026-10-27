// Screenshot tour for visual review. Skipped unless UI_TOUR=1. Output: test-results/ui-tour/<width>/<tab>.png
import { test, expect } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';

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
    // Packages add states here, for example runtimes open, headways on, a selection, Blocking with unassigned trips.
  });
}
