// Decision 0051, package E4: the Costing screen with an estimated cost basis. Golden Federal Boulevard project, Trip profile Default.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { editGridCell, gridCell, scopeField } from './support/ui';

test.setTimeout(120_000);

async function openEstimated(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(scopeField(page, 'Cost basis').locator('option:checked')).toHaveText('Blocked · Workbook Blocks');
  await scopeField(page, 'Cost basis').selectOption({ label: 'Estimated · Default' });
  await expect(page.getByRole('region', { name: 'Estimate basis' })).toBeVisible();
}

const factors = (page: Page) => page.getByRole('grid', { name: 'Estimate factors' });
const resultRow = (page: Page, day: string) => page.locator('.costing-results-table tbody tr').filter({ has: page.locator('th', { hasText: day }) });
/** The number in the cell of the estimated table under `column` (1 is Days) in a day's row. */
async function cellNumber(page: Page, day: string, column: number) {
  return Number((await resultRow(page, day).locator('td').nth(column - 1).innerText()).replaceAll(/[$,]/g, ''));
}

test('the cost basis lists blocked and estimated choices, and Weekday factors from the baseline give back its blocked revenue hours', async ({ page }) => {
  await openEstimated(page);
  const select = scopeField(page, 'Cost basis');
  await expect(select.locator('optgroup')).toHaveCount(2);
  await expect(select.locator('optgroup[label="Blocked hours"] option')).toHaveText(['Blocked · Workbook Blocks']);
  await expect(select.locator('optgroup[label="Estimated from running time"] option')).toHaveText(['Estimated · Default']);
  await expect(page.locator('.context-field__value')).toHaveText('Default');
  await expect(page.locator('.costing-results-table thead th')).toHaveText(['Service day', 'Days', 'Trips', 'Daily running (h)', 'Daily revenue (h)estimated', 'Daily platform (h)estimated', 'Daily cost', 'Annual revenue (h)', 'Annual platform (h)', 'Annual cost']);

  // No factor yet: no estimate, running hours stay.
  await expect(page.getByText(/Enter a layover % for .* or for All days to estimate revenue hours\. Running hours are shown below\./)).toBeVisible();
  expect(await cellNumber(page, 'Weekday', 3)).toBeCloseTo(256.28, 2);

  await editGridCell(gridCell(factors(page), 'Weekday layover percent'), '17.8');
  await editGridCell(gridCell(factors(page), 'Weekday deadhead percent'), '5.5');
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '18.2');
  await expect(resultRow(page, 'Weekday').locator('td').nth(3)).not.toHaveText('—');
  expect(Math.abs(await cellNumber(page, 'Weekday', 4) - 311.59)).toBeLessThan(0.5);
  await expect(page.getByRole('button', { name: 'Save factors', exact: true })).toBeVisible();
  await expect(page.getByText('3 unsaved changes · the estimate below already includes them')).toBeVisible();
});

test('a blank day uses All days: the cell shows the value, the row says so, and the Estimate basis panel names the day', async ({ page }) => {
  await openEstimated(page);
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '18.2');
  await editGridCell(gridCell(factors(page), 'All days deadhead percent'), '5.6');
  for (const day of ['Weekday', 'Saturday', 'Sunday']) {
    await editGridCell(gridCell(factors(page), `${day} layover percent`), '18');
    await editGridCell(gridCell(factors(page), `${day} deadhead percent`), '5');
  }
  await expect(gridCell(factors(page), 'Holiday layover percent').locator('.grid-cell__placeholder')).toHaveText('18.2');
  await expect(resultRow(page, 'Holiday').locator('.costing-row-note')).toHaveText('All days factors');
  await expect(resultRow(page, 'Weekday').locator('.costing-row-note')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Estimate basis' })).toContainText('Holiday uses All days: 18.2% layover, 5.6% deadhead.');
  await page.getByLabel('Operating cost per revenue hour in USD').fill('152.40');
  await expect(page.locator('.costing-state.estimated')).toHaveText('Estimated');
  await expect(page.getByText('Applied rate $152.40 per revenue hour · revenue and platform hours estimated from running time')).toBeVisible();

  // Clearing every layover value removes the estimate; the running hours stay.
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '');
  for (const day of ['Weekday', 'Saturday', 'Sunday']) await editGridCell(gridCell(factors(page), `${day} layover percent`), '');
  await expect(page.getByText('Enter a layover % for Weekday, Saturday, Sunday, and Holiday or for All days to estimate revenue hours. Running hours are shown below.')).toBeVisible();
  expect(await cellNumber(page, 'Weekday', 3)).toBeCloseTo(256.28, 2);
});

test('Save factors keeps them over a reload with the remembered basis; Discard restores the saved values', async ({ page }) => {
  await openEstimated(page);
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '18.2');
  await page.getByRole('button', { name: 'Save factors', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save factors', exact: true })).toHaveCount(0);
  await expect.poll(() => runInPage(page, 'return (await e.db.costingAssumptions.toArray())[0]?.estimateFactors?.allDays?.layoverFraction')).toBeCloseTo(0.182, 9);

  await page.reload();
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(scopeField(page, 'Cost basis').locator('option:checked')).toHaveText('Estimated · Default');
  await expect(gridCell(factors(page), 'All days layover percent')).toHaveText('18.2');

  await editGridCell(gridCell(factors(page), 'All days layover percent'), '30');
  await expect(gridCell(factors(page), 'All days layover percent')).toHaveClass(/grid-cell--edited/);
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(gridCell(factors(page), 'All days layover percent')).toHaveText('18.2');
  await expect(page.getByRole('button', { name: 'Save factors', exact: true })).toHaveCount(0);
});

test('leaving Costing with unsaved factors asks first', async ({ page }) => {
  await openEstimated(page);
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '18.2');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Costing assumptions or estimate factors have unsaved changes.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Costing', exact: true })).toHaveAttribute('aria-current', /page|true/);
});

test('an entry that is not a percentage below 100 is refused, marked, and disables Save factors', async ({ page }) => {
  await openEstimated(page);
  await editGridCell(gridCell(factors(page), 'All days deadhead percent'), '5');
  for (const text of ['100', 'abc']) {
    const cell = gridCell(factors(page), 'All days layover percent');
    await cell.dblclick();
    await cell.locator('input').fill(text);
    await cell.locator('input').press('Enter');
    await expect(cell).toHaveAttribute('data-invalid', 'true');
    await expect(page.locator('.costing-factor-grid + .grid-message')).toHaveText('Enter a percentage from 0 up to 100, or leave the cell blank.');
    await expect(page.getByRole('button', { name: 'Save factors', exact: true })).toBeDisabled();
    await cell.locator('input').press('Escape');
    await expect(page.getByRole('button', { name: 'Save factors', exact: true })).toBeEnabled();
  }
});

test('the estimated export carries the cost basis kind', async ({ page }) => {
  await openEstimated(page);
  await page.getByLabel('Operating cost per revenue hour in USD').fill('152.40');
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '18.2');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export costing CSV', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('Default-costing.zip');
  const text = new TextDecoder().decode(new Uint8Array(await (await import('node:fs/promises')).readFile(await file.path())));
  expect(text).toContain('costBasisKind');
  expect(text).toContain(',estimated,');
});

test('at 1024 and 1440 px the ten-column table shows Annual cost without scrolling and the page never scrolls sideways', async ({ page }) => {
  await openEstimated(page);
  await page.getByLabel('Operating cost per revenue hour in USD').fill('150000');
  await editGridCell(gridCell(factors(page), 'All days layover percent'), '18.2');
  await editGridCell(gridCell(factors(page), 'All days deadhead percent'), '5.6');
  await expect(page.locator('.costing-results-table tfoot td').last()).toContainText('$');
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const table = page.locator('.costing-results-table');
    expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth), `the results table does not scroll at ${width} px`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const cell = await page.locator('.costing-results-table tbody tr').first().locator('td').last().boundingBox();
    expect(cell!.x + cell!.width).toBeLessThanOrEqual(width);
  }
});
