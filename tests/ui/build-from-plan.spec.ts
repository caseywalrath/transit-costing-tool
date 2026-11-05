// Build trips "From planned frequencies" (PF7, Decision 0058 item 7): the mode is disabled without a plan, builds the plan's slots, skips slots
// that already hold a trip, and places each slot at the measure node, so a mid-route node gives earlier first-stop times.
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createShiftReadySchedule } from './support/tripsWorkspace';

test.setTimeout(180_000);

const tripsSection = (page: Page) => page.locator('[aria-label="Trips section"]');
const drawerOf = (page: Page) => page.getByRole('complementary', { name: 'Build trips' });

/** Stores a plan on the Weekday of the only Route. `measureNode` is the node name to measure at, or none for the default. */
async function storePlan(page: Page, periods: Array<[number, number, number]>, measureNode?: string) {
  await runInPage(page, `
    const day = (await e.db.serviceDays.toArray()).find((d) => d.kind === 'weekday');
    const route = (await e.db.routes.toArray())[0];
    const direction = { id: (await e.db.patterns.toArray())[0].directionId };
    const node = arg.measureNode ? (await e.db.nodes.toArray()).find((n) => n.name === arg.measureNode) : undefined;
    const now = new Date().toISOString();
    await e.db.plannedFrequencies.add({ id: 'plan-1', scenarioId: route.scenarioId, routeId: route.id, serviceDayId: day.id, createdAt: now, updatedAt: now,
      periods: arg.periods.map(([startTime, endTime, headwaySeconds], index) => ({ id: 'period-' + index, startTime, endTime, headwaySeconds })),
      measureNodeIdByDirectionId: node ? { [direction.id]: node.id } : {} });`, { periods, measureNode });
}
const reopenTrips = async (page: Page) => {
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(1);
};
const storedTimes = (page: Page): Promise<number[][]> => runInPage(page, `return (await e.db.trips.toArray()).map((trip) => trip.stopTimes.map((point) => point.time)).sort((a, b) => a[0] - b[0])`);

test('the mode is disabled with a hint when the day has no plan, and One headway stays the form', async ({ page }) => {
  await createShiftReadySchedule(page);
  await tripsSection(page).getByRole('button', { name: 'Build trips…', exact: true }).click();
  const drawer = drawerOf(page);
  await expect(drawer.getByRole('button', { name: 'One headway', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(drawer.getByRole('button', { name: 'From planned frequencies', exact: true })).toBeDisabled();
  await expect(drawer.getByText('No planned frequencies for this day. Add them on the Route screen.')).toBeVisible();
  await expect(drawer.getByLabel('First trip')).toBeVisible();
});

test('builds the checked periods of a three-period plan and skips the slot that already holds a trip', async ({ page }) => {
  await createShiftReadySchedule(page); // one trip, 6:00 at A and 6:07 at B
  // 6:00–8:00 every 30 (4), 8:00–9:00 every 20 (3), 9:00–10:00 every 60 (1).
  await storePlan(page, [[21600, 28800, 1800], [28800, 32400, 1200], [32400, 36000, 3600]]);
  await reopenTrips(page);
  await tripsSection(page).getByRole('button', { name: 'Build trips…', exact: true }).click();
  const drawer = drawerOf(page);
  await drawer.getByRole('button', { name: 'From planned frequencies', exact: true }).click();
  await expect(drawer.getByLabel('First trip')).toHaveCount(0);
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await expect(drawer.getByText('Times at:')).toContainText('A');
  await expect(drawer.getByLabel('6:00–8:00 · every 30 · 4 trips')).toBeChecked();
  await expect(drawer.getByLabel('8:00–9:00 · every 20 · 3 trips')).toBeChecked();
  await expect(drawer.getByLabel('9:00–10:00 · every 60 · 1 trip')).toBeChecked();
  await expect(drawer.locator('.build-trips-summary')).toHaveText('Builds 7 trips in 3 periods. Skipped, already built: 6:00.');

  // Unchecking the last period leaves 6 trips; the choice is remembered when the drawer is closed and opened again.
  await drawer.getByLabel('9:00–10:00 · every 60 · 1 trip').uncheck();
  await expect(drawer.locator('.build-trips-summary')).toContainText('Builds 6 trips in 2 periods.');
  await drawer.getByRole('button', { name: 'Close Build trips drawer' }).click();
  await expect(drawer).toBeHidden();
  await tripsSection(page).getByRole('button', { name: 'Build trips…', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'From planned frequencies', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(drawer.getByLabel('9:00–10:00 · every 60 · 1 trip')).not.toBeChecked();

  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(7);
  expect((await storedTimes(page)).map((times) => times[0])).toEqual([21600, 23400, 25200, 27000, 28800, 30000, 31200]);
  // The first stop is the measure node, and the existing 6:00 trip was not built twice.
  expect((await storedTimes(page)).filter((times) => times[0] === 21600)).toHaveLength(1);
});

test('a mid-route measure node puts each slot at that node, so the first stop is earlier than the slot', async ({ page }) => {
  await createShiftReadySchedule(page); // existing trip: A 6:00, B 6:07
  await storePlan(page, [[21600, 25200, 1800]], 'B'); // slots 6:00, 6:30 at B
  await reopenTrips(page);
  await tripsSection(page).getByRole('button', { name: 'Build trips…', exact: true }).click();
  const drawer = drawerOf(page);
  await drawer.getByRole('button', { name: 'From planned frequencies', exact: true }).click();
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await expect(drawer.getByText('Times at:')).toContainText('B');
  // The existing trip stands at B at 6:07, so no slot is skipped.
  await expect(drawer.locator('.build-trips-summary')).toHaveText('Builds 2 trips in 1 period.');
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(3);
  // The runtime is 7 minutes, so 6:00 and 6:30 at B are 5:53 and 6:23 at A.
  expect(await storedTimes(page)).toEqual([[21180, 21600], [21600, 22020], [22980, 23400]]);
});
