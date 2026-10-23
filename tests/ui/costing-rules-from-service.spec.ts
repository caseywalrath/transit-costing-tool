// Review package P11 (issue I-074b, finding 4-014). The Costing screen no longer computes the annual-day total, the 365-day check, the
// list of service years, or the limit on future years, and no longer validates the assumptions: it reads them from the Costing service.
// What the planner sees must not change, so this spec pins the displayed values on the Federal BRT project (255 + 52 + 52 + 6 = 365 days).
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(120_000);

async function openCosting(page: Page, prepare?: () => Promise<void>) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  if (prepare) await prepare();
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Costing Assumptions' })).toBeVisible();
}

const days = (page: Page) => page.locator('.costing-days');
const yearOptions = (page: Page) => page.locator('.module-toolbar').getByLabel('View year').locator('option').allTextContents();

test('shows each day count and the total against the 365-day limit, in the valid style when the total is 365', async ({ page }) => {
  await openCosting(page);
  await expect(days(page)).toContainText('Weekday 255');
  await expect(days(page)).toContainText('Holiday 6');
  await expect(days(page).locator('span').last()).toHaveText('Total 365 / 365');
  await expect(days(page).locator('.invalid')).toHaveCount(0);
});

test('marks a total above 365, saved earlier, as invalid', async ({ page }) => {
  await openCosting(page, async () => { await runInPage(page, "const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday'); await e.db.serviceDays.put({ ...day, annualServiceDays: 260 });"); });
  await expect(days(page).locator('span').last()).toHaveText('Total 370 / 365');
  await expect(days(page).locator('.invalid')).toHaveText('Total 370 / 365');
});

test('lists the service years from the first year of service and clamps future years to 0 to 10', async ({ page }) => {
  await openCosting(page);
  const firstYear = page.getByLabel('First Year of Service');
  const futureYears = page.getByLabel('Future Years');
  await firstYear.fill('2030');
  await futureYears.fill('2');
  expect(await yearOptions(page)).toEqual(['2030', '2031', '2032']);
  await futureYears.fill('25');
  await expect(futureYears).toHaveValue('10');
  expect((await yearOptions(page)).length).toBe(11);
  expect((await yearOptions(page)).at(-1)).toBe('2040');
  await futureYears.fill('-3');
  await expect(futureYears).toHaveValue('0');
  expect(await yearOptions(page)).toEqual(['2030']);
  await futureYears.fill('3.9');
  await expect(futureYears).toHaveValue('3');
  expect(await yearOptions(page)).toEqual(['2030', '2031', '2032', '2033']);
});

test('validates the assumptions: a rate year after the first year of service blocks Save and explains why', async ({ page }) => {
  await openCosting(page);
  await page.getByLabel('Operating cost per Revenue Hour in USD').fill('150');
  await page.getByLabel('Rate year').fill('2040');
  await page.getByLabel('First Year of Service').fill('2030');
  await expect(page.getByRole('alert').filter({ hasText: 'The rate year cannot be later than the base service year.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.getByLabel('Rate year').fill('2025');
  await expect(page.getByRole('alert').filter({ hasText: 'The rate year cannot be later' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
});
