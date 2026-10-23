// Deletions in the real app pass the token of the review the planner confirmed (review package P09, issues I-027, 4-011, 4-012).
// Each delete command refuses to run when the stored data changed after its review; the app shows the refusal and keeps the data.
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createRouteWithPattern, createShiftReadySchedule } from './support/tripsWorkspace';

test.setTimeout(90_000);

const count = (page: Page, table: string) => runInPage(page, 'return await e.db.table(arg).count()', table);
const error = (page: Page) => page.locator('.notice.error');

async function openRouteDelete(page: Page) {
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  await page.getByRole('button', { name: 'Route actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete route?' })).toBeVisible();
}

test('Delete route removes the Route and its Trips after the review', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  expect(await count(page, 'trips')).toBe(3);
  await openRouteDelete(page);
  await expect(page.getByRole('alertdialog')).toContainText('3 trips');
  await page.getByRole('button', { name: 'Delete route', exact: true }).last().click();
  await expect.poll(() => count(page, 'routes')).toBe(0);
  expect(await count(page, 'trips')).toBe(0);
  expect(await count(page, 'patterns')).toBe(0);
  await expect(error(page)).toHaveCount(0);
});

test('Delete route is refused when the Route changed after the review, and nothing is deleted', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await openRouteDelete(page);
  await runInPage(page, "const [trip] = await e.db.trips.toArray(); await e.db.trips.put({ ...trip, id: 'added-after-review', stopTimes: trip.stopTimes.map((point) => ({ ...point, time: point.time + 3600 })) });");
  await page.getByRole('button', { name: 'Delete route', exact: true }).last().click();
  await expect(error(page)).toHaveText(/The route deletion review is out of date\. Review the impact again\./);
  expect(await count(page, 'routes')).toBe(1);
  expect(await count(page, 'trips')).toBe(4);
  // A fresh review works.
  await error(page).getByRole('button', { name: 'Dismiss message' }).click();
  await openRouteDelete(page);
  await page.getByRole('button', { name: 'Delete route', exact: true }).last().click();
  await expect.poll(() => count(page, 'routes')).toBe(0);
  expect(await count(page, 'trips')).toBe(0);
});

test('Delete scenario removes the Scenario after the review and is refused when its data changed after it', async ({ page }) => {
  await createRouteWithPattern(page, 'Scenario deletion reviews');
  await page.getByRole('button', { name: 'Scenario actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New scenario', exact: true }).click();
  await page.locator('#dialog-name').fill('Alternative');
  await page.getByRole('button', { name: 'Create scenario', exact: true }).click();
  await expect.poll(() => count(page, 'scenarios')).toBe(2);
  await expect(page.locator('.context-bar select').nth(1).locator('option:checked')).toHaveText('Alternative');

  // The review is taken for the selected (new) Scenario; a Service day of it changes before the planner confirms.
  await page.getByRole('button', { name: 'Scenario actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete scenario', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delete scenario?' })).toBeVisible();
  await runInPage(page, "const scenario = (await e.db.scenarios.toArray()).find((item) => item.name === 'Alternative'); const day = (await e.db.serviceDays.where('scenarioId').equals(scenario.id).toArray())[0]; await e.db.serviceDays.put({ ...day, name: 'Renamed after the review' });");
  await page.getByRole('button', { name: 'Delete scenario', exact: true }).last().click();
  await expect(error(page)).toHaveText(/The scenario deletion review is out of date\. Review the impact again\./);
  expect(await count(page, 'scenarios')).toBe(2);

  await error(page).getByRole('button', { name: 'Dismiss message' }).click();
  await page.getByRole('button', { name: 'Scenario actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete scenario', exact: true }).click();
  await page.getByRole('button', { name: 'Delete scenario', exact: true }).last().click();
  await expect.poll(() => count(page, 'scenarios')).toBe(1);
  await expect(error(page)).toHaveCount(0);
});

test('Delete selected removes the selected Trips after the review and is refused when a Block was saved after it', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const rows = page.locator('.schedule-table tbody tr');
  const deleteSelected = async () => {
    await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete selected…', exact: true }).click();
    await expect(page.getByRole('alertdialog')).toContainText('These trips are not assigned to a block');
  };
  await rows.first().locator('input[type="checkbox"]').check();
  await deleteSelected();
  // A Block that uses the selected Trip is saved after the review the dialog shows.
  await runInPage(page, "const trips = await e.db.trips.toArray(); const first = trips.sort((a, b) => a.stopTimes[0].time - b.stopTimes[0].time)[0]; await e.db.blocks.put({ id: 'late-block', scenarioId: first.scenarioId, serviceDayId: first.serviceDayId, label: 'Late', activities: [{ id: 'late-activity', type: 'revenueTrip', sequence: 0, tripId: first.id }], createdAt: first.createdAt, updatedAt: first.updatedAt });");
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(error(page)).toHaveText(/The Trip deletion review is out of date\. Review the impact again\./);
  expect(await count(page, 'trips')).toBe(3);
  expect(await runInPage(page, "return (await e.db.blocks.get('late-block')).activities.length")).toBe(1);

  // The dialog still shows the old review. Cancel it and review again: the Block is shown and the Trip is removed from it.
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await error(page).getByRole('button', { name: 'Dismiss message' }).click();
  await rows.first().locator('input[type="checkbox"]').check();
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete selected…', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('This will also remove their revenue activities from 1 block');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => count(page, 'trips')).toBe(2);
  expect(await runInPage(page, "return (await e.db.blocks.get('late-block')).activities.length")).toBe(0);
});

test('Delete runtime profile replaces the assignments after the review and is refused when the profile changed after it', async ({ page }) => {
  await createRouteWithPattern(page, 'Runtime profile deletion reviews');
  await runInPage(page, "const [pattern] = await e.db.patterns.toArray(); await e.service.createDefaultRuntimeProfile(pattern, 'Alternative');");
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  const profileButton = runtimeSection.locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button', { name: 'Default' });
  await expect(profileButton).toBeVisible();
  const openDelete = async () => {
    await profileButton.click();
    await page.getByRole('menu', { name: 'Runtime profile' }).getByRole('menuitem', { name: 'Delete profile…' }).click();
    await expect(page.getByRole('heading', { name: 'Delete runtime profile?' })).toBeVisible();
  };
  await openDelete();
  await runInPage(page, "const profile = (await e.db.runtimeProfiles.toArray()).find((item) => item.name === 'Default'); await e.db.runtimeProfiles.put({ ...profile, description: 'Changed after the review' });");
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(error(page)).toHaveText(/The runtime profile deletion review is out of date\. Review the impact again\./);
  expect(await count(page, 'runtimeProfiles')).toBe(2);

  // The dialog still shows the old review. Cancel it and review again.
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await error(page).getByRole('button', { name: 'Dismiss message' }).click();
  await openDelete();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => count(page, 'runtimeProfiles')).toBe(1);
  const assigned = await runInPage(page, "const [profile] = await e.db.runtimeProfiles.toArray(); const assignments = await e.db.runtimeAssignments.toArray(); return { name: profile.name, assignments: assignments.length, onIt: assignments.filter((item) => item.runtimeProfileId === profile.id).length };");
  expect(assigned).toEqual({ name: 'Alternative', assignments: 4, onIt: 4 });
});
