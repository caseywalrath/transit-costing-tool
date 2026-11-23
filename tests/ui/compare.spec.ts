// The Compare tab (Decision 0091; card V4), on the worked example of tests/fixtures/scenario-compare/README.md: Scenarios "Existing" and
// "Redesign". Trips, miles, peak vehicles, statuses, spans and headways are the README's figures. Revenue hours and cost are what Costing
// itself returns for the records (the README's hours are inputs to the pure comparison tests), so those are checked against a direct
// Costing estimate run in the page.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { directCostingFigures, seedCompareExample, type CompareExampleOptions } from './support/compareExample';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const compareTab = (page: Page) => page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Compare', exact: true });
const tile = (page: Page, id: string) => page.locator(`[data-tile="${id}"]`);
const tileValue = (page: Page, id: string) => tile(page, id).locator('.cmp-tile__value');
/** A picker of one side. The label must match exactly: "Scenario" is also part of "Blocking scenario". */
const sideField = (page: Page, side: 'Baseline' | 'Proposed', label: string) => page.getByRole('group', { name: side }).getByLabel(label, { exact: true });
const row = (page: Page, name: string) => page.locator('tr.cmp-row', { hasText: name });
const numbers = (text: string): number[] => (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((item) => Number(item.replace(/,/g, '')));

async function openExample(page: Page, options: CompareExampleOptions = {}) {
  await seedCompareExample(page, options);
  await page.reload();
  await compareTab(page).click();
}

async function expectComparison(page: Page) {
  await expect(page.locator('.cmp-tiles')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.cmp-result')).toHaveAttribute('aria-busy', 'false');
}

test('shows the weekday comparison of the worked example', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openExample(page);
  await expectComparison(page);

  // The tab covers the whole Project: the header's Scenario level is not there, and the sides open on the app's Scenario and the other one.
  await expect(page.getByRole('button', { name: /^Scenario: / })).toHaveCount(0);
  await expect(sideField(page, 'Baseline', 'Scenario')).toHaveValue('scn-existing');
  await expect(sideField(page, 'Proposed', 'Scenario')).toHaveValue('scn-redesign');
  await expect(sideField(page, 'Baseline', 'Blocking scenario')).toHaveValue('base-blocks');
  await expect(page.getByRole('radio', { name: 'Weekday', exact: true })).toHaveAttribute('aria-checked', 'true');

  // README, Weekday totals: trips 9 to 10, miles 49.0 to 72.0, peak 2 to 3.
  await expect(tileValue(page, 'trips')).toHaveText('9 → 10');
  await expect(tile(page, 'trips')).toContainText('+1 · +11.1%');
  await expect(tileValue(page, 'revenueMiles')).toHaveText('49.0 → 72.0');
  await expect(tile(page, 'revenueMiles')).toContainText('+23.0 · +46.9%');
  await expect(tileValue(page, 'peakVehicles')).toHaveText('2 → 3');
  await expect(tile(page, 'peakVehicles')).toContainText('+1');

  // Hours and cost are Costing's own figures for the two Scenarios.
  const direct = await directCostingFigures(page);
  const [hoursFrom, hoursTo] = numbers(await tileValue(page, 'revenueHours').innerText());
  expect(Math.abs(hoursFrom - direct.baseline.weekdayHours)).toBeLessThanOrEqual(0.05 + 1e-9);
  expect(Math.abs(hoursTo - direct.proposed.weekdayHours)).toBeLessThanOrEqual(0.05 + 1e-9);
  const [costFrom, costTo] = numbers(await tileValue(page, 'cost').innerText());
  expect(Math.abs(costFrom - direct.baseline.weekdayCost)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(costTo - direct.proposed.weekdayCost)).toBeLessThanOrEqual(0.5);

  // README, by route: R1 Changed (matched by GTFS id, shown with the Proposed name), R2 Discontinued, R3 New. R5 is Unchanged and folded.
  await expect(row(page, '1 Main St').locator('.cmp-chip')).toHaveText('Changed');
  await expect(row(page, '1 Main St')).toContainText('7 → 8');
  await expect(row(page, '2 Crosstown').locator('.cmp-chip')).toHaveText('Discontinued');
  await expect(row(page, '2 Crosstown')).toContainText('1 → —');
  await expect(row(page, '3 Airport').locator('.cmp-chip')).toHaveText('New');
  await expect(row(page, '3 Airport')).toContainText('— → 1');
  await expect(row(page, 'Unattributed').locator('.cmp-chip')).toHaveText('Changed');
  await expect(row(page, '5 Loop')).toHaveCount(0);
  const fold = page.getByRole('button', { name: '1 unchanged route' });
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await fold.click();
  await expect(row(page, '5 Loop').locator('.cmp-chip')).toHaveText('Unchanged');

  // Order (item 17): largest hours change first, Unattributed last of the Routes.
  const names = await page.locator('tr.cmp-row .cmp-row-button__name').allTextContents();
  expect(names.at(-2)).toBe('Unattributed (multi-route blocks)');
  expect(names.at(-1)).toBe('5 Loop');
});

test('opens a route\'s detail in place, one at a time, from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openExample(page);
  await expectComparison(page);

  const main = row(page, '1 Main St').getByRole('button', { name: '1 Main St' });
  await expect(main).toHaveAttribute('aria-expanded', 'false');
  await main.focus();
  await page.keyboard.press('Enter');
  await expect(main).toHaveAttribute('aria-expanded', 'true');

  const detail = page.locator('.cmp-detail');
  await expect(detail).toHaveCount(1);
  // README: outbound span 6:00-10:30 becomes 6:00-10:36 (changed); inbound 6:45-8:15 on both sides.
  const outboundSpan = detail.locator('tr', { hasText: 'Span, Outbound' }).locator('td');
  await expect(outboundSpan).toHaveText(['6:00–10:30', '6:00–10:36', '+0:06']);
  await expect(outboundSpan.nth(1).locator('b.cmp-differs')).toHaveCount(1);
  await expect(detail.locator('tr', { hasText: 'Span, Inbound' }).locator('td')).toHaveText(['6:45–8:15', '6:45–8:15', '0:00']);
  await expect(detail.locator('tr', { hasText: 'Span, Inbound' }).locator('b.cmp-differs')).toHaveCount(0);
  // README: outbound AM peak 30 to 20, midday 60 on both sides, other periods "—"; inbound AM peak 60.
  const headways = detail.getByRole('table', { name: '1 Main St, headway by time of day' });
  await expect(headways.locator('tr', { hasText: 'Outbound' }).locator('th, td')).toHaveText(['Outbound', '—', '30 → 20', '60', '—', '—', '—']);
  await expect(headways.locator('tr', { hasText: 'Inbound' }).locator('th, td')).toHaveText(['Inbound', '—', '60', '—', '—', '—', '—']);
  await expect(detail.getByRole('table', { name: '1 Main St, figures' }).locator('tr', { hasText: 'Revenue miles' }).locator('td').first()).toHaveText('42.0');

  // Opening another row closes this one; Space also works; the same row again closes it.
  const airport = row(page, '3 Airport').getByRole('button', { name: '3 Airport' });
  await airport.focus();
  await page.keyboard.press('Space');
  await expect(airport).toHaveAttribute('aria-expanded', 'true');
  await expect(main).toHaveAttribute('aria-expanded', 'false');
  await expect(detail).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(detail).toHaveCount(0);
});

test('adds the days up in the Annual view, with the peak of the highest day', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openExample(page);
  await expectComparison(page);
  await page.getByRole('radio', { name: 'Annual', exact: true }).click();
  await expect(tileValue(page, 'trips')).toHaveText('2,311 → 2,562', { timeout: 30_000 });
  await expect(tile(page, 'trips')).toContainText('+251 · +10.9%');
  await expect(tileValue(page, 'revenueMiles')).toHaveText('12,507.0 → 18,462.0');
  await expect(tileValue(page, 'peakVehicles')).toHaveText('2 → 3');
  await expect(tile(page, 'peakVehicles')).toContainText('+1 · Weekday');
  await expect(page.getByRole('group', { name: 'First-year cost' })).toBeVisible();

  // Revenue hours and cost: Weekday x 251 + Saturday x 52 of Costing's own figures.
  const direct = await directCostingFigures(page);
  const [hoursFrom, hoursTo] = numbers(await tileValue(page, 'revenueHours').innerText());
  expect(Math.abs(hoursFrom - (direct.baseline.weekdayHours * 251 + direct.baseline.saturdayHours * 52))).toBeLessThanOrEqual(0.05 + 1e-9);
  expect(Math.abs(hoursTo - (direct.proposed.weekdayHours * 251 + direct.proposed.saturdayHours * 52))).toBeLessThanOrEqual(0.05 + 1e-9);
  const [costFrom, costTo] = numbers(await tileValue(page, 'cost').innerText());
  expect(Math.abs(costFrom - (direct.baseline.weekdayCost + direct.baseline.saturdayCost))).toBeLessThanOrEqual(0.5);
  expect(Math.abs(costTo - (direct.proposed.weekdayCost + direct.proposed.saturdayCost))).toBeLessThanOrEqual(0.5);

  // Statuses hold in every view; a route's detail has no span or headways in the Annual view.
  await expect(row(page, '3 Airport').locator('.cmp-chip')).toHaveText('New');
  await expect(row(page, '2 Crosstown').locator('.cmp-chip')).toHaveText('Discontinued');
  await row(page, '1 Main St').click();
  await expect(page.locator('.cmp-detail')).toContainText('Span and headways are shown for one day');
  await expect(page.locator('.cmp-detail').getByRole('table', { name: '1 Main St, headway by time of day' })).toHaveCount(0);

  // README, Saturday: 1 Main St Changed (0 to 1 trip, 0 to 7.5 miles), 2 Crosstown Discontinued, 3 Airport New, 5 Loop Unchanged; no Saturday blocks.
  await page.getByRole('radio', { name: 'Saturday', exact: true }).click();
  await expect(tileValue(page, 'trips')).toHaveText('1 → 1');
  await expect(page.getByRole('button', { name: '1 Main St' })).toBeVisible();
  await expect(row(page, '1 Main St')).toContainText('0 → 1');
  await expect(tileValue(page, 'peakVehicles')).toHaveText('0 → 0');
});

test('downloads the comparison as CSV with the file name and header of Decision 0091', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openExample(page);
  await expectComparison(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
  expect(download.suggestedFilename()).toBe('existing-vs-redesign-weekday.csv');
  const text = readFileSync((await download.path())!, 'utf8');
  const lines = text.split('\n');
  expect(text).not.toContain('\r');
  expect(lines.slice(0, 5)).toEqual([
    'Baseline,Existing / Default / Base blocks',
    'Proposed,Redesign / Default / Draft blocks',
    'Day,Weekday',
    "Rates,Baseline's",
    "Counts,Baseline's",
  ]);
  expect(lines[5]).toMatch(/^Prepared,\d{4}-\d{2}-\d{2}$/);
  expect(lines[6]).toBe('');
  expect(lines[7]).toBe('route_id,route,status,trips_base,trips_proposed,trips_change,revenue_miles_base,revenue_miles_proposed,revenue_miles_change,revenue_hours_base,revenue_hours_proposed,revenue_hours_change,platform_hours_base,platform_hours_proposed,platform_hours_change,peak_vehicles_base,peak_vehicles_proposed,peak_vehicles_change,cost_base,cost_proposed,cost_change,revenue_hours_pct,cost_pct');
  // Every route is in the file, Unchanged included (the screen folds it), then the system totals.
  expect(lines.filter((line) => /^(1|2|3|5),/.test(line))).toHaveLength(4);
  expect(lines.some((line) => line.startsWith(',System total,'))).toBe(true);
});

test('a side without a rate says how to fix it, and shows no figures for the other side', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openExample(page, { proposedHasNoRate: true });
  // Rates "Baseline's" costs both sides at the baseline's rate, so the comparison works.
  await expectComparison(page);
  await page.getByLabel('Rates').selectOption('own');
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Enter a rate on the Costing tab for Redesign, or set Rates to the other side's.", { timeout: 30_000 });
  await expect(alert).not.toContainText('Existing');
  await expect(page.locator('.cmp-tiles')).toHaveCount(0);
  await expect(page.locator('.cmp-table')).toHaveCount(0);
  await page.getByLabel('Rates').selectOption('baseline');
  await expectComparison(page);
  await expect(tileValue(page, 'trips')).toHaveText('9 → 10');
});

test('warns when the sides use different rates, and resets Rates to the baseline\'s', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openExample(page, { proposedRate: 150 });
  await expectComparison(page);
  // Rates "Baseline's": both sides are costed at $100, and the line says so without offering a reset.
  const line = page.locator('.cmp-warnline', { hasText: 'different rates' });
  await expect(line).toContainText('baseline $100.00/hr, proposed $150.00/hr');
  await expect(line).toContainText("Both sides use the baseline's.");
  await expect(line.getByRole('button')).toHaveCount(0);
  const baselineCost = await tileValue(page, 'cost').innerText();
  await page.getByLabel('Rates').selectOption('own');
  await expect(line).toContainText('Cost and annual figures include these differences');
  await expect(tileValue(page, 'cost')).not.toHaveText(baselineCost);
  await line.getByRole('button', { name: "Use the baseline's for both" }).click();
  await expect(page.getByLabel('Rates')).toHaveValue('baseline');
  await expect(tileValue(page, 'cost')).toHaveText(baselineCost);
});

test('says when a side has no Blocking scenario: costed from an estimate, peak vehicles not shown', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openExample(page);
  await expectComparison(page);
  // No blocks on the proposed side: its cost is estimated from factors and its peak vehicles are not shown.
  await sideField(page, 'Proposed', 'Blocking scenario').selectOption({ label: 'None (estimate)' });
  await expect(page.getByText('The sides are costed differently')).toBeVisible({ timeout: 30_000 });
  await expect(tileValue(page, 'peakVehicles')).toHaveText('2 → Not blocked');
  await expect(row(page, '1 Main St')).toContainText('2 → Not blocked');
  await expect(row(page, '1 Main St').locator('.cmp-chip')).toHaveText('Changed');
});

test('remembers the choices for the Project and falls back when a remembered id is gone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openExample(page);
  await expectComparison(page);
  await page.getByRole('radio', { name: 'Saturday', exact: true }).click();
  await page.getByLabel('Rates').selectOption('own');
  await page.getByLabel('Day counts').selectOption('proposed');
  await page.getByLabel('Show').selectOption('changed');
  await page.getByRole('button', { name: 'Swap sides' }).click();
  await expect(sideField(page, 'Baseline', 'Scenario')).toHaveValue('scn-redesign');

  await page.reload();
  await compareTab(page).click();
  await expectComparison(page);
  await expect(sideField(page, 'Baseline', 'Scenario')).toHaveValue('scn-redesign');
  await expect(sideField(page, 'Proposed', 'Scenario')).toHaveValue('scn-existing');
  await expect(sideField(page, 'Baseline', 'Blocking scenario')).toHaveValue('draft-blocks');
  await expect(page.getByRole('radio', { name: 'Saturday', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Rates')).toHaveValue('own');
  await expect(page.getByLabel('Day counts')).toHaveValue('proposed');
  await expect(page.getByLabel('Show')).toHaveValue('changed');

  // A remembered Scenario that no longer exists falls back to the first-open rule: the app's Scenario, then the other one.
  await page.evaluate(() => {
    const key = 'transit-costing-tool.compare.v1';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}');
    stored.project.baseline = { scenarioId: 'gone', tripProfileId: 'gone', blockingScenarioId: 'gone' };
    stored.project.proposed = { scenarioId: 'scn-redesign', tripProfileId: 'gone', blockingScenarioId: 'gone' };
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload();
  await compareTab(page).click();
  await expectComparison(page);
  await expect(sideField(page, 'Baseline', 'Scenario')).toHaveValue('scn-existing');
  await expect(sideField(page, 'Baseline', 'Blocking scenario')).toHaveValue('base-blocks');
  // The Scenario is remembered, its Trip profile and Blocking scenario are not: each takes its own default.
  await expect(sideField(page, 'Proposed', 'Scenario')).toHaveValue('scn-redesign');
  await expect(sideField(page, 'Proposed', 'Trip profile')).toHaveValue('profile-scn-redesign');
  await expect(sideField(page, 'Proposed', 'Blocking scenario')).toHaveValue('draft-blocks');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`fits a 390 px window without sideways page scrolling (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 900 });
    await openExample(page);
    await expectComparison(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    // The table keeps Route, Status, hours change and cost change; the rest is in the detail.
    const headers = page.locator('.cmp-table thead th');
    await expect(headers.filter({ hasText: /^Trips$/ })).toBeHidden();
    await expect(headers.filter({ hasText: /^Peak vehicles$/ })).toBeHidden();
    for (const name of ['Route', 'Status', 'Δ hours', 'Δ cost / yr']) await expect(headers.filter({ hasText: new RegExp(`^${name.replace('/', '\\/')}$`) })).toBeVisible();
    // The sides stack: the Proposed picker is below the Baseline's.
    const baseline = await page.getByRole('group', { name: 'Baseline' }).boundingBox();
    const proposed = await page.getByRole('group', { name: 'Proposed' }).boundingBox();
    expect(proposed!.y).toBeGreaterThan(baseline!.y + baseline!.height - 1);
    // A route's detail holds the figures the table leaves out, and still fits.
    await row(page, '1 Main St').click();
    await expect(page.locator('.cmp-detail').getByRole('table', { name: '1 Main St, figures' })).toContainText('Peak vehicles');
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
}
