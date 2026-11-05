// Planned vs built (PF8, Decision 0058 item 6): the Plan chip in the Trips header, its popover, and the headway markers.
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

test.setTimeout(180_000);

const tripsSection = (page: Page) => page.locator('[aria-label="Trips section"]');
const chip = (page: Page) => tripsSection(page).locator('.plan-chip__button');

async function storePlan(page: Page, periods: Array<[number, number, number]>) {
  await runInPage(page, `
    const day = (await e.db.serviceDays.toArray()).find((d) => d.kind === 'weekday');
    const route = (await e.db.routes.toArray())[0];
    const now = new Date().toISOString();
    await e.db.plannedFrequencies.add({ id: 'plan-1', scenarioId: route.scenarioId, routeId: route.id, serviceDayId: day.id, createdAt: now, updatedAt: now,
      periods: arg.map(([startTime, endTime, headwaySeconds], index) => ({ id: 'period-' + index, startTime, endTime, headwaySeconds })), measureNodeIdByDirectionId: {} });`, periods);
}
/** Makes the stored trips depart at exactly these first-stop times (clones the one built trip as needed). */
async function setDepartures(page: Page, departures: number[]) {
  await runInPage(page, `
    const [base] = await e.db.trips.toArray();
    await e.db.trips.clear();
    await e.db.trips.bulkAdd(arg.map((time, index) => ({ ...base, id: 'trip-' + index, stopTimes: base.stopTimes.map((point) => ({ ...point, time: point.time - base.stopTimes[0].time + time })) })));`, departures);
}
const reopen = async (page: Page, rows: number) => {
  await page.reload();
  await expect(page.getByRole('region', { name: 'Planned frequencies', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(rows);
};

test('the chip is hidden without a plan', async ({ page }) => {
  await createShiftReadySchedule(page);
  await expect(tripsSection(page).getByRole('button', { name: 'Build trips…', exact: true })).toBeVisible();
  await expect(chip(page)).toHaveCount(0);
});

test('shows differs with plain reasons, then matches after building from the plan, without a reload', async ({ page }) => {
  await createShiftReadySchedule(page); // one trip at 6:00
  await storePlan(page, [[21600, 25200, 1800]]); // 6:00, 6:30
  await reopen(page, 1);
  await expect(chip(page)).toHaveText('Plan: 1 period differs');
  await chip(page).click();
  const panel = page.getByRole('dialog', { name: 'Planned frequencies compared with built trips' });
  await expect(panel).toContainText('Measured at A');
  await expect(panel.locator('tbody tr').first()).toContainText('6:00–7:00 · every 30');
  await expect(panel.locator('tbody tr').first()).toContainText('ends 30 min early');
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();

  await tripsSection(page).getByRole('button', { name: 'Build trips…', exact: true }).click();
  const drawer = page.getByRole('complementary', { name: 'Build trips' });
  await drawer.getByRole('button', { name: 'From planned frequencies', exact: true }).click();
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(chip(page)).toHaveText('Plan: matches');
});

test('a timetable 5 minutes early still matches; one late trip makes the period differ and moving it back restores matches', async ({ page }) => {
  await createShiftReadySchedule(page);
  await storePlan(page, [[21600, 28800, 1800]]); // 6:00 to 8:00, 4 slots
  await setDepartures(page, [21300, 23100, 24900, 26700]); // all 5 minutes early
  await reopen(page, 4);
  await expect(chip(page)).toHaveText('Plan: matches');
  await setDepartures(page, [21300, 23100, 26100, 26700]); // one trip 20 minutes late
  await reopen(page, 4);
  await expect(chip(page)).toHaveText('Plan: 1 period differs');
  await chip(page).click();
  await expect(page.getByRole('dialog', { name: 'Planned frequencies compared with built trips' })).toContainText('2 gaps off');
  await setDepartures(page, [21300, 23100, 24900, 26700]);
  await reopen(page, 4);
  await expect(chip(page)).toHaveText('Plan: matches');
});

test('a gap outside the plan gets a dotted marker and a tooltip, and rows keep their height', async ({ page }) => {
  await createShiftReadySchedule(page);
  await storePlan(page, [[21600, 28800, 1800]]);
  await setDepartures(page, [21600, 23400, 26100, 27000]); // gaps 30, 45, 15 minutes
  await reopen(page, 4);
  await runCommand(page, 'trips.toggleHeadways');
  const marked = page.locator('.schedule-table tbody td.trip-plan-gap-off');
  await expect(marked).toHaveCount(2); // the 45 and the 15 minute gaps
  await expect(marked.first()).toHaveAttribute('title', /Planned every 30; this gap is 45/);
  const heights = await page.locator('.schedule-table tbody tr').evaluateAll((rows) => rows.map((row) => Math.round(row.getBoundingClientRect().height)));
  expect(new Set(heights).size).toBe(1);
});
