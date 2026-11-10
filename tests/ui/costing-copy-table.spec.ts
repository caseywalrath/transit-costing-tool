import { expect, test } from '@playwright/test';
import { seedCostingFixture } from './support/costingFixture';

// Decision 0066 item 11: Copy cost breakdown writes the table as shown to the clipboard, with a status line. This spec covers the
// Costing actions menu; the table's own context menu is covered once that menu exists.
test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('Copy cost breakdown from Costing actions puts the table as displayed on the clipboard', async ({ page }) => {
  await seedCostingFixture(page);
  await page.reload();
  await page.getByRole('button', { name: 'Costing' }).click();
  await expect(page.getByText('Partial estimate')).toBeVisible();

  await page.getByRole('button', { name: 'Costing actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy cost breakdown', exact: true }).click();
  // The status line also holds a decorative icon, so the match is on the sentence, not on the whole text.
  await expect(page.getByRole('status').filter({ hasText: /Copied the cost breakdown for \d{4}\./ })).toBeVisible();

  // The expected text is read from the rendered table: header, one line per service day, then the total row.
  const expected = await page.evaluate(() => {
    const table = document.querySelector('.costing-results-table table')!;
    const cells = (row: Element) => [...row.querySelectorAll('th, td')].map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim());
    const header = [...table.querySelectorAll('thead tr')].map(cells);
    const body = [...table.querySelectorAll('tbody tr')].map(cells);
    const foot = [...table.querySelectorAll('tfoot tr')].map(cells);
    return [...header, ...body, ...foot].map((row) => row.join('\t')).join('\n');
  });
  const copied = await page.evaluate(() => navigator.clipboard.readText());

  expect(copied).toBe(expected);
  expect(copied.split('\n')[0]).toBe(['Service day', 'Days', 'Trips', 'Blocks', 'Daily running (h)', 'Daily revenue (h)', 'Daily platform (h)', 'Daily cost', 'Annual revenue (h)', 'Annual platform (h)', 'Annual cost'].join('\t'));
  const dayRows = await page.locator('.costing-results-table tbody tr').count();
  expect(copied.split('\n')).toHaveLength(dayRows + 2);
});

test('right-clicking the Cost breakdown opens its menu, and Copy cost breakdown there copies the same table', async ({ page }) => {
  await seedCostingFixture(page);
  await page.reload();
  await page.getByRole('button', { name: 'Costing' }).click();
  await expect(page.getByText('Partial estimate')).toBeVisible();

  const heading = page.getByRole('heading', { name: /^Cost breakdown · \d{4}$/ });
  const year = (await heading.textContent())!.replace('Cost breakdown · ', '');
  await page.locator('.costing-results-table tbody tr').first().click({ button: 'right' });
  const menu = page.getByRole('menu', { name: `Cost breakdown · ${year} actions`, exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copy cost breakdown', exact: true })).toBeEnabled();
  await menu.getByRole('menuitem', { name: 'Copy cost breakdown', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: `Copied the cost breakdown for ${year}.` })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split('\n')[0]).toBe(['Service day', 'Days', 'Trips', 'Blocks', 'Daily running (h)', 'Daily revenue (h)', 'Daily platform (h)', 'Daily cost', 'Annual revenue (h)', 'Annual platform (h)', 'Annual cost'].join('\t'));
  expect(copied.split('\n')).toHaveLength(await page.locator('.costing-results-table tbody tr').count() + 2);
});
