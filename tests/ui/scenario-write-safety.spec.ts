// Review package P01 (issues I-001, I-016, I-025): Scenario-wide writes re-read the stored records, so work saved in the
// Trips, Blocking, and Runtime workspaces after the page loaded is never overwritten by a Route-tab edit.
// Every test runs against real IndexedDB with the Federal BRT golden project.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw, goldenWithAltProfile } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { runCommand } from './support/ui';

test.setTimeout(120000);

const tripCount = (page: Page) => runInPage(page, 'return await e.db.trips.count()');

async function open(page: Page, snapshot: unknown = goldenRaw()) {
  await seedSnapshot(page, snapshot);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
}

/** Builds 3 Trips from the Trips workspace. The App's startup Scenario copy does not see them. */
async function buildThreeTrips(page: Page): Promise<number> {
  const before = await tripCount(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await runCommand(page, 'trips.build');
  const drawer = page.getByRole('complementary', { name: 'Build Trips' });
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByLabel('First Trip').fill('03:00');
  await drawer.getByLabel('Headway').fill('10');
  await drawer.getByLabel('Number of Trips').fill('3');
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden({ timeout: 15000 });
  await expect.poll(() => tripCount(page)).toBe(before + 3);
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  return before + 3;
}

test('Trips built after load survive a no-change blur of the Service day name', async ({ page }) => {
  await open(page);
  const built = await buildThreeTrips(page);
  const name = page.getByRole('textbox', { name: 'Weekday name' });
  await name.click(); await name.blur();
  await page.waitForTimeout(1000);
  expect(await tripCount(page)).toBe(built);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  expect(await tripCount(page)).toBe(built);
});

test('a Trip edit, a new Block, and a Runtime profile rename made after load survive a Service day name change', async ({ page }) => {
  await open(page);
  const ids = await runInPage(page, `
    const trip = (await e.db.trips.toArray())[0];
    await e.db.trips.put({ ...trip, stopTimes: trip.stopTimes.map((point) => ({ ...point, time: point.time + 60 })) });
    const block = (await e.db.blocks.toArray())[0];
    await e.db.blocks.put({ ...block, id: 'new-block', label: 'NEW', activities: [] });
    const profile = (await e.db.runtimeProfiles.toArray())[0];
    await e.db.runtimeProfiles.put({ ...profile, name: 'EDITED-NAME' });
    return { tripId: trip.id, editedTime: trip.stopTimes[0].time + 60, profileId: profile.id };`);
  const name = page.getByRole('textbox', { name: 'Weekday name' });
  await name.fill('Weekday renamed'); await name.blur();
  await expect.poll(() => runInPage(page, 'return (await e.db.serviceDays.toArray()).some((day) => day.name === "Weekday renamed")')).toBe(true);
  const stored = await runInPage(page, `
    const trip = await e.db.trips.get(arg.tripId);
    return { firstTime: trip.stopTimes[0].time, newBlockExists: Boolean(await e.db.blocks.get('new-block')), profileName: (await e.db.runtimeProfiles.get(arg.profileId)).name };`, ids);
  expect(stored).toEqual({ firstTime: ids.editedTime, newBlockExists: true, profileName: 'EDITED-NAME' });
});

test('Rename scenario keeps Trips built after load', async ({ page }) => {
  await open(page);
  const built = await buildThreeTrips(page);
  await page.getByRole('button', { name: 'Scenario actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename scenario', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename scenario' });
  await dialog.getByLabel('Scenario name').fill('Renamed scenario');
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect.poll(() => runInPage(page, 'return (await e.db.scenarios.toArray()).map((scenario) => scenario.name)')).toContain('Renamed scenario');
  expect(await tripCount(page)).toBe(built);
});

test('New route keeps Trips built after load', async ({ page }) => {
  await open(page);
  const built = await buildThreeTrips(page);
  const routesBefore = await runInPage(page, 'return await e.db.routes.count()');
  await page.getByRole('button', { name: 'Route actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New route', exact: true }).click();
  await expect.poll(() => runInPage(page, 'return await e.db.routes.count()')).toBe(routesBefore + 1);
  expect(await tripCount(page)).toBe(built);
});

test('Duplicate route keeps Trips built after load and copies them with the Route', async ({ page }) => {
  await open(page);
  const built = await buildThreeTrips(page);
  const originalRouteIds: string[] = await runInPage(page, 'return (await e.db.routes.toArray()).map((route) => route.id)');
  await page.getByRole('button', { name: 'Route actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate route', exact: true }).click();
  await page.getByRole('dialog', { name: 'Duplicate route' }).getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect.poll(() => runInPage(page, 'return await e.db.routes.count()')).toBe(originalRouteIds.length + 1);
  expect(await tripCount(page)).toBeGreaterThan(built);
  const kept = await runInPage(page, 'return await e.db.trips.where("routeId").anyOf(arg).count()', originalRouteIds);
  expect(kept).toBe(built);
});

test('Duplicate scenario copies the stored Trips, including Trips built after load', async ({ page }) => {
  await open(page);
  const built = await buildThreeTrips(page);
  await page.getByRole('button', { name: 'Scenario actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate scenario', exact: true }).click();
  await page.getByRole('dialog', { name: 'Duplicate scenario' }).getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect.poll(() => runInPage(page, 'return await e.db.scenarios.count()')).toBe(2);
  expect(await tripCount(page)).toBe(built * 2);
});

test('Runtime "Copy from day" commits on IndexedDB in independent and shared modes', async ({ page }) => {
  await page.goto('/src/styles.css');
  const results = await page.evaluate(async ({ SETUP, raw }: any) => {
    const env = await new Function(SETUP)();
    const out: Record<string, unknown> = {};
    for (const mode of ['independent', 'shared']) {
      const name = `p01-runtime-copy-${mode}-${Math.random().toString(36).slice(2)}`;
      const e = env.make(name);
      await e.repository.saveProjectSnapshot({ ...raw, generationSets: [] });
      const dayId = (kind: string) => raw.serviceDays.find((day: any) => day.kind === kind).id;
      const request = { scenarioId: raw.scenarios[0].id, routeId: raw.routes[0].id, sourceServiceDayId: dayId('weekday'), targetServiceDayId: dayId('saturday'), mode };
      const preview = await e.trips.previewRuntimeCopy(request);
      let error = 'none';
      try { await e.trips.applyRuntimeCopy(preview); } catch (failure: any) { error = failure.message; }
      out[mode] = { error, assignmentsToWrite: preview.assignments.length };
      e.db.close(); await env.Dexie.delete(name);
    }
    return out;
  }, { SETUP: (await import('./support/dexieEnv')).SETUP, raw: goldenRaw() });
  expect(results).toEqual({ independent: { error: 'none', assignmentsToWrite: expect.any(Number) }, shared: { error: 'none', assignmentsToWrite: expect.any(Number) } });
});

test('Build Trips for a Trip profile deleted elsewhere is rejected and stores no Trip', async ({ page }) => {
  await open(page, goldenWithAltProfile());
  const before = await tripCount(page);
  const request = await runInPage(page, `
    const records = await e.repository.getScenarioRecords((await e.db.scenarios.toArray())[0].id);
    const pattern = records.patterns[0];
    return { scenarioId: records.scenario.id, routeId: pattern.routeId, serviceDayId: records.serviceDays[0].id, patternId: pattern.id, firstTrip: 10800, headwaySeconds: 600, tripCount: 3, tripProfileId: 'alt-profile' };`);
  await runInPage(page, "await e.repository.deleteTripProfile('alt-profile')");
  const after = await tripCount(page);
  const outcome = await runInPage(page, `try { await e.trips.generateTrips(arg); return 'stored'; } catch (error) { return error.message; }`, request);
  expect(outcome).toMatch(/Trip profile is no longer available/);
  expect(await tripCount(page)).toBe(after);
  expect(after).toBeLessThan(before);
});
