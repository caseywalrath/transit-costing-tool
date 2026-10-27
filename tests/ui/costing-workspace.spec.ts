import { expect, test } from '@playwright/test';
import { seedCostingFixture } from './support/costingFixture';
import { scopeField } from './support/ui';

test('Costing workspace displays a partial estimate, supports year selection, and remains usable at a narrow width', async ({ page }) => {
  await seedCostingFixture(page);
  await page.reload();
  await page.getByRole('button', { name: 'Costing' }).click();

  await expect(page.getByRole('heading', { name: 'Costing', exact: true })).toHaveCount(0);
  await expect(page.getByText('Saved locally', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Shared across/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cost Breakdown' })).toBeVisible();
  await expect(page.getByText('Partial estimate')).toBeVisible();
  await expect(page.getByText('0 excluded Blocks · 1 unassigned Trips')).toBeVisible();
  await expect(page.locator('.costing-results-table tfoot').getByRole('cell', { name: '$40,170' })).toBeVisible();
  await page.getByLabel('View year').selectOption('2027');
  await expect(page.getByRole('heading', { name: 'Cost Breakdown' })).toBeVisible();
  await expect(page.getByText('Applied rate 159 USD per Revenue Hour')).toBeVisible();
  await expect(page.getByText('Service quantities remain constant; only the rate changes.')).toHaveCount(0);
  expect(await page.locator('.costing-results-table tbody, .costing-results-table tfoot, .costing-outlook-table tbody').allInnerTexts()).not.toEqual(expect.arrayContaining([expect.stringMatching(/\d+\.\d+/)]));

  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 760, height: 900 });
  await expect(page.getByRole('heading', { name: 'Exclusions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Yearly outlook' })).toBeVisible();
  // Narrow widths: the page itself never scrolls sideways, and the results and outlook tables stay inside the viewport and keep
  // their content (they scroll inside their own regions). Showing the Annual cost column without any table scroll is package U06's.
  for (const width of [1024, 760]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Cost Breakdown' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(page.locator('.costing-results-table tfoot')).toContainText('$');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const table of await page.locator('.costing-results-table, .costing-outlook-table').all()) {
      const box = await table.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  }
});

// Review package U06 (issues I-031, I-033, I-044 loading state, I-087; Decision C3).
import type { Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

async function openGoldenCosting(page: Page, prepare?: () => Promise<void>) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  if (prepare) await prepare();
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Service days table field errors (U06 criterion 1)', () => {
  test('a total above 365 is shown beside its field, and the saved value is kept', async ({ page }) => {
    test.setTimeout(120_000);
    await openGoldenCosting(page);
    const weekday = page.getByLabel('Weekday annual service days');
    await weekday.fill('300');
    await weekday.blur();
    const message = page.getByText('Annual service days cannot total more than 365. This change would make the total 410.');
    await expect(message).toBeVisible();
    await expect(message).toHaveClass(/field-error/);
    await expect(weekday).toHaveAttribute('aria-invalid', 'true');
    await expect(weekday).toHaveAccessibleDescription(/would make the total 410/);
    // Beside the field: inside the same table row, not in the error banner.
    await expect(page.locator('.service-days-table tr', { has: weekday }).getByText(/would make the total 410/)).toBeVisible();
    await expect(page.locator('.notice')).toHaveCount(0);
    expect(await runInPage(page, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').annualServiceDays;")).toBe(255);
    // A valid value clears the message.
    await weekday.fill('250');
    await weekday.blur();
    await expect(message).toHaveCount(0);
    await expect(weekday).not.toHaveAttribute('aria-invalid', 'true');
    expect(await runInPage(page, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').annualServiceDays;")).toBe(250);
  });

  test('a blank name is shown beside the name field, and the saved name is kept', async ({ page }) => {
    test.setTimeout(120_000);
    await openGoldenCosting(page);
    const name = page.getByRole('textbox', { name: 'Weekday name' });
    await name.fill('');
    await name.blur();
    await expect(page.locator('.service-days-table tr', { has: name }).getByText('Enter a service day name.')).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(await runInPage(page, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').name;")).toBe('Weekday');
    await name.fill('Weekday plan');
    await name.blur();
    await expect(page.getByText('Enter a service day name.')).toHaveCount(0);
    expect(await runInPage(page, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').name;")).toBe('Weekday plan');
  });
});

test.describe('Costing estimate display (U06 criteria 2 to 5)', () => {
  test('an invalid estimate lists each finding', async ({ page }) => {
    test.setTimeout(120_000);
    await openGoldenCosting(page, async () => { await runInPage(page, "const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday'); await e.db.serviceDays.put({ ...day, annualServiceDays: 260 });"); });
    await page.getByRole('button', { name: 'Costing', exact: true }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'cannot be calculated' });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('listitem')).toHaveText(['Annual service days total more than 365. Correct the counts in the Service days table on the Route screen.']);
  });

  test('says "Calculating estimate…" while the estimate loads, not "Select a valid Blocking Scenario"', async ({ page }) => {
    await seedCostingFixture(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Costing', exact: true })).toBeEnabled();
    await expect(page.getByRole('textbox', { name: 'Route name' })).toBeVisible();
    // Hold a write transaction on the stores the estimate reads so that its reads wait, while the Blocking Scenarios and the
    // assumptions (other stores) still load. The transaction stays open until `release` is set.
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('transit-costing-tool'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const transaction = database.transaction(['trips', 'blocks', 'patterns'], 'readwrite');
      const store = transaction.objectStore('trips');
      const holder = { release: false, database };
      (window as unknown as { __hold: typeof holder }).__hold = holder;
      const spin = () => { if (!holder.release) store.get('none').onsuccess = spin; };
      spin();
      transaction.oncomplete = () => database.close();
    });
    await page.getByRole('button', { name: 'Costing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Costing Assumptions' })).toBeVisible();
    await expect(page.getByText('Calculating estimate…')).toBeVisible();
    await expect(page.getByText('Select a valid Blocking Scenario to calculate an estimate.')).toHaveCount(0);
    await page.evaluate(() => { (window as unknown as { __hold: { release: boolean } }).__hold.release = true; });
    await expect(page.locator('.costing-results-table tbody tr')).toHaveCount(4);
    await expect(page.getByText('Calculating estimate…')).toHaveCount(0);
  });

  test('the Total row has no daily columns, a note says totals are computed before rounding, and the counts are singular', async ({ page }) => {
    await seedCostingFixture(page);
    await page.reload();
    await page.getByRole('button', { name: 'Costing', exact: true }).click();
    const total = page.locator('.costing-results-table tfoot tr');
    await expect(total.locator('th')).toHaveText('Total');
    const cells = total.locator('td');
    // Days, Blocks, Daily Revenue Hours, Daily Platform Hours, Daily Cost, Annual Revenue Hours, Annual Platform Hours, Annual Cost.
    await expect(cells).toHaveCount(8);
    await expect(cells.nth(0)).toHaveText('364');
    await expect(cells.nth(1)).toHaveText('1');
    for (const index of [2, 3, 4]) await expect(cells.nth(index)).toHaveText('');
    await expect(cells.nth(5)).toHaveText('260');
    await expect(cells.nth(7)).toHaveText('$40,170');
    await expect(page.getByText('Totals are computed before rounding, so a total can differ by 1 from the sum of the rounded rows.')).toBeVisible();
    await expect(page.getByText('0 excluded Blocks · 1 unassigned Trip', { exact: true })).toBeVisible();
  });

  test('View year appears once, in the toolbar', async ({ page }) => {
    await seedCostingFixture(page);
    await page.reload();
    await page.getByRole('button', { name: 'Costing', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cost Breakdown' })).toBeVisible();
    await expect(page.locator('label', { hasText: /^View year/ })).toHaveCount(1);
    await expect(scopeField(page, 'View year')).toHaveCount(1);
    await expect(page.locator('section[aria-labelledby="costing-estimate-title"]').getByRole('combobox')).toHaveCount(0);
  });
});

test('Annual cost is visible without scrolling the table at 1024 and 1440 px, and the page never scrolls sideways (AC7)', async ({ page }) => {
  await seedCostingFixture(page);
  await page.reload();
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  // A rate that makes the widest money values (eight digits).
  await page.getByLabel('Operating cost per Revenue Hour in USD').fill('150000');
  await expect(page.locator('.costing-results-table tfoot')).toContainText('$40,170,000');
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const table = page.locator('.costing-results-table');
    expect(await table.evaluate((element) => element.scrollWidth <= element.clientWidth), `the results table does not scroll at ${width} px`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const header = await page.getByRole('columnheader', { name: 'Annual Cost (Revenue Hours)' }).first().boundingBox();
    const cell = await page.locator('.costing-results-table tbody tr').first().locator('td').last().boundingBox();
    for (const box of [header, cell]) {
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
  }
  // At 768 px the table may scroll inside its own frame, but the page does not.
  await page.setViewportSize({ width: 768, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
