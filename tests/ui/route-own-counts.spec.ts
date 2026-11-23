// Decision 0089 items 41 and 43, plan U1 to U3 (adding a day): a Route's own annual counts on the Route tab, the "Own counts" marker in Costing,
// and "Add service day…". Golden Federal Boulevard project, blocked basis.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { chooseCostBasis } from './support/ui';

test.setTimeout(120_000);

const ownSwitch = (page: Page) => page.getByRole('switch', { name: 'This route uses its own counts' });
// The switch is controlled by the saved Route, so it changes after the save, not at the click.
async function setSwitch(page: Page, on: boolean) {
  await ownSwitch(page).click();
  if (on) await expect(ownSwitch(page)).toBeChecked(); else await expect(ownSwitch(page)).not.toBeChecked();
}
const ownWeekday = (page: Page) => page.getByLabel('Weekday annual service days for this route');
const breakdown = (page: Page) => page.getByRole('region', { name: 'Cost breakdown' });
const number = (text: string | null) => Number((text ?? '').replace(/[^0-9.]/g, ''));

async function open(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByLabel('Weekday annual service days')).toHaveValue('255', { timeout: 30_000 });
}
const ownCountsStored = (page: Page) => runInPage(page, 'return (await e.db.routes.toArray())[0].ownAnnualServiceDays ?? null');

test('a Route on its own counts: the switch, the column, the Costing marker and the hours that follow', async ({ page }) => {
  await open(page);
  await expect(ownWeekday(page)).toHaveCount(0);
  await expect(ownSwitch(page)).not.toBeChecked();

  await setSwitch(page, true);
  await expect(ownWeekday(page)).toBeVisible();
  // A blank cell shows the Scenario's count faintly and means "use the Scenario's".
  await expect(ownWeekday(page)).toHaveValue('');
  await expect(ownWeekday(page)).toHaveAttribute('placeholder', '255');
  await expect.poll(() => ownCountsStored(page)).toEqual({ enabled: true, countsByServiceDayId: {} });

  await ownWeekday(page).fill('62');
  await ownWeekday(page).press('Enter');
  const weekdayId = await runInPage(page, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').id") as string;
  await expect.poll(() => ownCountsStored(page)).toEqual({ enabled: true, countsByServiceDayId: { [weekdayId]: 62 } });
  // The Route's column totals its own count plus the Scenario's counts for the blank days.
  const scenarioTotal = number(await page.locator('.service-days-total').first().locator('b').textContent());
  await expect(page.locator('.service-days-total').nth(1)).toHaveText(`This route ${scenarioTotal - 255 + 62} of 365`);

  // A count that is not a whole number is refused where it is typed; a total over 365 is refused with the reason.
  await ownWeekday(page).fill('1.5');
  await ownWeekday(page).press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'whole number' })).toBeVisible();
  await ownWeekday(page).press('Escape');
  await expect(ownWeekday(page)).toHaveValue('62');
  await page.getByLabel('Saturday annual service days for this route').fill('400');
  await page.getByLabel('Saturday annual service days for this route').press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: '365' })).toBeVisible();
  expect(await ownCountsStored(page)).toEqual({ enabled: true, countsByServiceDayId: { [weekdayId]: 62 } });
  await page.getByLabel('Saturday annual service days for this route').press('Escape');

  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await chooseCostBasis(page, 'Blocked hours', 'Workbook Blocks');
  const marker = breakdown(page).locator('.costing-own-counts');
  await expect(marker).toHaveCount(1);
  await expect(marker.locator('[aria-hidden="true"]')).toHaveText('Own counts');
  await expect(marker).toHaveAttribute('title', 'This route uses its own annual service days: Weekday 62');
  const weekdayRow = breakdown(page).locator('.costing-route-day-row').filter({ hasText: 'Weekday' });
  const cells = weekdayRow.locator('td');
  await expect(cells.first()).toHaveText('62');
  const dailyRevenue = number(await cells.nth(4).textContent());
  const annualRevenue = number(await cells.nth(7).textContent());
  expect(dailyRevenue).toBeGreaterThan(0);
  expect(Math.abs(annualRevenue - dailyRevenue * 62) / (dailyRevenue * 62)).toBeLessThan(0.01);
  await page.screenshot({ path: '/tmp/claude-0/-home-user/3bdc75fd-55d7-5724-ad85-d8deb92c9cc0/scratchpad/i9b/costing-marker.png' });

  // Switching off keeps the numbers and restores the Scenario's count in Costing.
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  await setSwitch(page, false);
  await expect(ownWeekday(page)).toHaveCount(0);
  await expect.poll(() => ownCountsStored(page)).toEqual({ enabled: false, countsByServiceDayId: { [weekdayId]: 62 } });
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(breakdown(page).locator('.costing-own-counts')).toHaveCount(0);
  await expect(breakdown(page).locator('.costing-route-day-row').filter({ hasText: 'Weekday' }).locator('td').first()).toHaveText('255');
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  await setSwitch(page, true);
  await expect(ownWeekday(page)).toHaveValue('62');
});

test('Add service day… creates a custom day with a count of 0 and keeps the total', async ({ page }) => {
  await open(page);
  const total = () => page.locator('.service-days-total').first().locator('b').textContent();
  const before = await total();
  await page.getByRole('button', { name: 'Add service day…' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add service day', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a service day name.');
  await dialog.getByLabel('Name').fill('Holiday 2');
  await dialog.getByLabel(/^Abbreviation/).fill('h2');
  await page.screenshot({ path: '/tmp/claude-0/-home-user/3bdc75fd-55d7-5724-ad85-d8deb92c9cc0/scratchpad/i9b/add-service-day.png' });
  await dialog.getByRole('button', { name: 'Add service day', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Holiday 2 annual service days')).toHaveValue('0');
  expect(await total()).toBe(before);
  await expect.poll(() => runInPage(page, "return (await e.db.serviceDays.toArray()).filter((day) => day.kind === 'custom').map((day) => [day.name, day.abbreviation, day.annualServiceDays])")).toEqual([['Holiday 2', 'H2', 0]]);

  // The new day takes its own count in the Route's column like any other day.
  await setSwitch(page, true);
  await expect(page.getByLabel('Holiday 2 annual service days for this route')).toHaveAttribute('placeholder', '0');
  await page.screenshot({ path: '/tmp/claude-0/-home-user/3bdc75fd-55d7-5724-ad85-d8deb92c9cc0/scratchpad/i9b/route-tab-own-counts.png' });
});
