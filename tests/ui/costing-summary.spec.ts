import { expect, test } from '@playwright/test';
import { seedCostingFixture } from './support/costingFixture';

// Decision 0054: the Operating Cost Estimate opens from Costing actions, warns first for a partial estimate, and prints alone.
test('opens the Operating Cost Estimate, warns about a partial estimate, and prints only the sheet', async ({ page }) => {
  await seedCostingFixture(page);
  await page.reload();
  await page.getByRole('button', { name: 'Costing' }).click();
  await expect(page.getByText('Partial estimate')).toBeVisible();

  await page.getByRole('button', { name: 'Costing actions', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Export costing CSV', exact: true })).toBeEnabled();
  await page.getByRole('menuitem', { name: 'View cost summary…', exact: true }).click();

  const warning = page.getByRole('alertdialog', { name: 'This estimate is partial' });
  await expect(warning).toContainText('not assigned to a block');
  await warning.getByRole('button', { name: 'Open summary', exact: true }).click();

  const sheet = page.getByRole('dialog', { name: 'Operating Cost Estimate' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.cost-summary-figures dt')).toContainText([/annual cost$/, /^Year \d+ cost$/, /revenue hours$/, /platform hours$/]);
  await expect(sheet.getByRole('heading', { name: /^Service by day/ })).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'Cost by year' })).toBeVisible();
  await expect(sheet).toContainText(/Costs are based on annual revenue hours and [\d.]+% projected inflation\./);
  await expect(sheet).not.toContainText(/partial|excluded|unassigned/i);
  // Service by day comes before cost by year.
  const headings = await sheet.locator('h3').allTextContents();
  expect(headings[0]).toMatch(/^Service by day/);
  expect(headings[1]).toBe('Cost by year');

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeHidden();
  await expect(sheet.getByRole('button', { name: 'Print or save as PDF' })).toBeHidden();
  await expect(sheet.locator('.cost-summary-sheet')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(sheet).toHaveCount(0);
});
