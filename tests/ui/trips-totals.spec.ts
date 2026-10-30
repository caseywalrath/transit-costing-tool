// Decision 0051, package E3: the Trips table's totals row and day line. Golden Federal Boulevard project, Weekday Southbound.
import { expect, test } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';

test.setTimeout(120_000);

const footer = (page: import('@playwright/test').Page) => page.locator('.trips-workspace .schedule-table tfoot');

test('the totals row counts the shown Trips and adds run time, layover, and deadhead; the day line covers both directions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGoldenTrips(page);
  const row = footer(page).locator('tr');
  await expect(row.locator('th')).toHaveText('Total · 138 trips');
  await expect(row.locator('td.trip-run-time-column')).toHaveText('129.60 h');
  await expect(row.locator('td.trip-connection-column').nth(0)).toHaveText('26.69 h');
  await expect(row.locator('td.trip-connection-column').nth(1)).toHaveText('0.00 h');
  await expect(page.locator('.trips-workspace .inline-note').filter({ hasText: 'both directions' })).toContainText('Weekday, both directions: 276 trips · running 256.28 h · layover 55.31 h · deadhead between trips 0.00 h');
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no sideways page scroll at ${width} px`).toBe(true);
  }
});

test('deleting a Trip updates both totals', async ({ page }) => {
  await openGoldenTrips(page);
  await page.locator('.trips-workspace .schedule-table tbody input[type=checkbox]').first().check();
  await page.getByRole('button', { name: 'Delete…', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: /^Delete/ }).last().click();
  await expect(footer(page).locator('th')).toHaveText('Total · 137 trips');
  await expect(page.locator('.trips-workspace .inline-note').filter({ hasText: 'both directions' })).toContainText('275 trips');
});
