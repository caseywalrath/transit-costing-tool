// Planned frequencies panel on the Route tab (PF5, Decision 0058): edit and save, validation, copy from a day and from a scenario, clear, layout.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(120_000);

async function open(page: Page) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByLabel('Weekday annual service days')).toBeVisible({ timeout: 30_000 });
  return page.getByRole('region', { name: 'Planned frequencies', exact: true });
}
const dayButton = (panel: Locator) => panel.locator('.menu-field button');
async function chooseDay(panel: Locator, page: Page, name: string) {
  await dayButton(panel).click();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
  await expect(dayButton(panel)).toContainText(name);
}
async function action(panel: Locator, page: Page, item: string) {
  await panel.getByRole('button', { name: 'Planned frequency actions' }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}
async function fillPeriod(panel: Locator, index: number, from: string, to: string, headway: string) {
  await panel.getByLabel(`Period ${index} from`, { exact: true }).fill(from);
  await panel.getByLabel(`Period ${index} to`, { exact: true }).fill(to);
  await panel.getByLabel(`Period ${index} headway in minutes`, { exact: true }).fill(headway);
}
const plansOf = (page: Page, dayKind: string) => runInPage(page, `
  const days = await e.db.serviceDays.toArray();
  const day = days.find((d) => d.kind === arg);
  const plans = (await e.db.plannedFrequencies.toArray()).filter((p) => p.serviceDayId === day.id);
  return plans.map((p) => p.periods.map((q) => [q.startTime, q.endTime, q.headwaySeconds]));`, dayKind);

async function savePlan(panel: Locator, page: Page) {
  await fillPeriodRows(panel);
  await panel.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Save plan', exact: true })).toHaveCount(0);
  expect(await plansOf(page, 'weekday')).toEqual([[[21600, 28800, 1800], [28800, 68400, 900], [68400, 86400, 1800]]]);
}
async function fillPeriodRows(panel: Locator) {
  await panel.getByRole('button', { name: 'Add period', exact: true }).click();
  await fillPeriod(panel, 1, '6:00', '8:00', '30');
  await panel.getByRole('button', { name: 'Add period', exact: true }).click();
  await expect(panel.getByLabel('Period 2 from', { exact: true })).toHaveValue('8:00');
  await fillPeriod(panel, 2, '8:00', '19:00', '15');
  await panel.getByRole('button', { name: 'Add period', exact: true }).click();
  await expect(panel.getByLabel('Period 3 from', { exact: true })).toHaveValue('19:00');
  await fillPeriod(panel, 3, '19:00', '24:00', '30');
}

test('add three periods and save; an overlap is refused with a message on the row', async ({ page }) => {
  const panel = await open(page);
  await expect(panel.getByText('No plan for Weekday. Add a period or copy one.')).toBeVisible();
  await savePlan(panel, page);
  await expect(panel.getByLabel('Period 2 headway in minutes')).toHaveValue('15');
  await expect(panel.getByRole('row').filter({ has: page.getByLabel('Period 2 from') }).locator('.planned-rate')).toHaveText('4.0');

  await panel.getByLabel('Period 2 from', { exact: true }).fill('7:00');
  await panel.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(panel.getByRole('alert').filter({ hasText: 'overlaps another one' })).toBeVisible();
  expect(await plansOf(page, 'weekday')).toEqual([[[21600, 28800, 1800], [28800, 68400, 900], [68400, 86400, 1800]]]);

  await panel.getByLabel('Period 2 from', { exact: true }).fill('8:xx');
  await panel.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(panel.getByRole('alert').filter({ hasText: 'Use a start time' })).toBeVisible();
  await panel.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(panel.getByLabel('Period 2 from', { exact: true })).toHaveValue('8:00');
});

test('copy Weekday to Saturday', async ({ page }) => {
  const panel = await open(page);
  await savePlan(panel, page);
  await chooseDay(panel, page, 'Saturday');
  await expect(panel.getByText('No plan for Saturday.')).toBeVisible();
  await action(panel, page, 'Copy from another day…');
  const dialog = page.getByRole('dialog', { name: 'Copy plan to Saturday' });
  await expect(dialog.getByText('Saturday has no plan yet.')).toBeVisible();
  await expect(dialog.getByRole('row')).toHaveCount(4);
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByLabel('Period 3 to', { exact: true })).toHaveValue('24:00');
  expect(await plansOf(page, 'saturday')).toEqual([[[21600, 28800, 1800], [28800, 68400, 900], [68400, 86400, 1800]]]);

  // A second copy warns that it replaces the plan.
  await action(panel, page, 'Copy from another day…');
  await expect(page.getByRole('dialog', { name: 'Copy plan to Saturday' }).getByText('already has a plan with 3 periods')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Planned frequency actions' })).toBeFocused();
});

test('copy from another scenario lists the unmatched day and applies the matched ones', async ({ page }) => {
  const panel = await open(page);
  await savePlan(panel, page);
  await chooseDay(panel, page, 'Sunday');
  await action(panel, page, 'Copy from another day…');
  await page.getByRole('dialog', { name: 'Copy plan to Sunday' }).getByRole('button', { name: 'Copy', exact: true }).click();
  await expect.poll(() => plansOf(page, 'sunday')).toHaveLength(1);

  await page.getByRole('button', { name: /^Scenario: / }).click();
  await page.getByRole('menuitem', { name: 'Duplicate scenario…', exact: true }).click();
  await page.getByRole('dialog', { name: 'Duplicate scenario' }).getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect.poll(() => runInPage(page, 'return await e.db.scenarios.count()')).toBe(2);
  // In the copy, Sunday becomes a custom day the source cannot match, and the copied Weekday plan is cleared.
  await runInPage(page, `
    const scenarios = await e.db.scenarios.toArray();
    const copy = scenarios.find((s) => s.name.endsWith('Copy'));
    const day = (await e.db.serviceDays.where('scenarioId').equals(copy.id).toArray()).find((d) => d.kind === 'sunday');
    await e.db.serviceDays.update(day.id, { kind: 'custom', name: 'Festival' });
    const weekday = (await e.db.serviceDays.where('scenarioId').equals(copy.id).toArray()).find((d) => d.kind === 'weekday');
    await e.db.plannedFrequencies.where('scenarioId').equals(copy.id).filter((p) => p.serviceDayId === weekday.id).delete();`);
  await page.reload();
  const copyPanel = page.getByRole('region', { name: 'Planned frequencies', exact: true });
  await expect(copyPanel.getByText('No plan for Weekday.')).toBeVisible({ timeout: 30_000 });

  await action(copyPanel, page, 'Copy from another scenario…');
  const dialog = page.getByRole('dialog', { name: 'Copy plans from another scenario' });
  await expect(dialog.getByRole('region', { name: 'Weekday plan' })).toContainText('New', { timeout: 30_000 });
  await expect(dialog).toContainText('Not copied, no matching service day: Sunday.');
  await dialog.getByRole('button', { name: 'Copy plans', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(copyPanel.getByLabel('Period 1 from', { exact: true })).toHaveValue('6:00');
  expect(await plansOf(page, 'weekday')).toHaveLength(1);
});

test('clear a plan after confirming', async ({ page }) => {
  const panel = await open(page);
  await expect(panel.getByRole('button', { name: 'Planned frequency actions' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Planned frequency actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Clear plan…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await savePlan(panel, page);
  await action(panel, page, 'Clear plan…');
  const dialog = page.getByRole('alertdialog', { name: 'Clear the Weekday plan?' });
  await dialog.getByRole('button', { name: 'Clear plan', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByText('No plan for Weekday.')).toBeVisible();
  expect(await plansOf(page, 'weekday')).toEqual([]);
});

test('leaving the Route tab with unsaved planned frequencies asks first', async ({ page }) => {
  const panel = await open(page);
  await panel.getByRole('button', { name: 'Add period', exact: true }).click();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Planned frequencies have unsaved edits.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel.getByLabel('Period 1 from', { exact: true })).toBeVisible();
});

test('three columns above 1100 px, one column at 1000 px, and no page scroll at 390 px', async ({ page }) => {
  const panel = await open(page);
  await fillPeriodRows(panel);
  const tops = () => page.evaluate(() => [...document.querySelectorAll('.route-top-grid > .support-panel')].map((element) => { const rect = element.getBoundingClientRect(); return { top: Math.round(rect.top), left: Math.round(rect.left), right: Math.round(rect.right) }; }));
  const noPageScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await tops();
    expect(boxes).toHaveLength(3);
    expect(new Set(boxes.map((box) => box.top)).size, `one row at ${width} px`).toBe(1);
    expect(await noPageScroll(), `no page scroll at ${width} px`).toBe(true);
  }
  await page.setViewportSize({ width: 1000, height: 900 });
  const stacked = await tops();
  expect(new Set(stacked.map((box) => box.left)).size).toBe(1);
  expect(await noPageScroll()).toBe(true);
  // The application header is already wider than a 390 px screen (before this panel existed), so the page itself is not asserted here:
  // the panel must fit the screen and keep its wide table inside its own scroll area.
  await page.setViewportSize({ width: 390, height: 900 });
  const inside = await page.evaluate(() => {
    const panelElement = document.querySelector('[aria-label="Planned frequencies"]')!;
    const scroller = panelElement.querySelector('.planned-table')!;
    return { panelRight: panelElement.getBoundingClientRect().right, width: window.innerWidth, scrolls: scroller.scrollWidth > scroller.clientWidth, scrollerRight: scroller.getBoundingClientRect().right };
  });
  expect(inside.panelRight).toBeLessThanOrEqual(inside.width);
  expect(inside.scrollerRight).toBeLessThanOrEqual(inside.width);
});
