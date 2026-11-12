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

  // The copied text has every Route row and every service-day row, so each Route must be expanded on screen first.
  await expect(page.locator('.costing-route-toggle[aria-expanded="false"]')).toHaveCount(0);

  // The expected text is read from the rendered table (Decision 0077 item 4): header, then each Route row ("All days") followed by its
  // service-day rows (empty Route cell), then the total row. The Route name comes from the name span, not the whole Route cell, which
  // also holds the expand toggle and the unassigned note.
  const expected = await page.evaluate(() => {
    const table = document.querySelector('.costing-results-table table')!;
    const text = (cell: Element | null | undefined) => (cell?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const valueCells = (row: Element) => [...row.querySelectorAll('td')].map((cell) => text(cell));
    const header = [...table.querySelectorAll('thead th')].map((cell) => text(cell));
    const lines: string[][] = [[header[0]!, 'Service day', ...header.slice(1)]];
    for (const row of table.querySelectorAll('tbody tr')) {
      if (row.classList.contains('costing-route-row')) lines.push([text(row.querySelector('.costing-route-name')), 'All days', ...valueCells(row)]);
      else lines.push(['', text(row.querySelector('.costing-route-day')), ...valueCells(row)]);
    }
    lines.push(['Total', '', ...valueCells(table.querySelector('tfoot tr')!)]);
    return lines.map((line) => line.join('\t')).join('\n');
  });
  const copied = await page.evaluate(() => navigator.clipboard.readText());

  expect(copied).toBe(expected);
  expect(copied.split('\n')[0]).toBe(['Route', 'Service day', 'Days', 'Trips', 'Blocks', 'Daily running (h)', 'Daily revenue (h)', 'Daily platform (h)', 'Daily cost', 'Annual revenue (h)', 'Annual platform (h)', 'Annual cost'].join('\t'));
  // Body rows are Route rows and service-day rows together; the copied text adds the header and the total row.
  const bodyRows = await page.locator('.costing-results-table tbody tr').count();
  expect(copied.split('\n')).toHaveLength(bodyRows + 2);
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
  expect(copied.split('\n')[0]).toBe(['Route', 'Service day', 'Days', 'Trips', 'Blocks', 'Daily running (h)', 'Daily revenue (h)', 'Daily platform (h)', 'Daily cost', 'Annual revenue (h)', 'Annual platform (h)', 'Annual cost'].join('\t'));
  expect(copied.split('\n')).toHaveLength(await page.locator('.costing-results-table tbody tr').count() + 2);
});
