// Review package U07 (issues I-041, I-057, I-082, I-092, I-093, I-094 and the React error boundary of I-012; added criteria: the
// single-flight Runtime load, the reload after a Runtime save, and the Recalculate dialog's band picker, Option B of Decision 0031).
// Each test drives the real app on IndexedDB and checks what the planner reads.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { createRouteWithPattern, createShiftReadySchedule } from './support/tripsWorkspace';
import { openRuntimes, runCommand, scopeField } from './support/ui';

test.setTimeout(120_000);

const tripsSection = (page: Page) => page.locator('[aria-label="Trips section"]');
const runtimeSection = (page: Page) => page.locator('[aria-label="Runtimes section"]');

async function openGoldenTripsAfter(page: Page, prepare: string) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await runInPage(page, prepare);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await scopeField(page, 'Day').selectOption({ label: 'Weekday' });
  await expect(page.locator('.trips-workspace .schedule-table tbody tr')).toHaveCount(138, { timeout: 30_000 });
  await openRuntimes(page);
}

/** Shares the Weekday Runtime profile of the first Southbound Pattern with the named Service days. */
const shareWeekdayProfileWith = (...names: string[]) => `
  const days = await e.db.serviceDays.toArray();
  const weekday = days.find((day) => day.kind === 'weekday');
  const assignments = await e.db.runtimeAssignments.toArray();
  const pattern = (await e.db.patterns.toArray()).find((item) => item.name === 'Southbound: Wagon Road to Evans');
  const shared = assignments.find((item) => item.serviceDayId === weekday.id && item.patternId === pattern.id);
  for (const name of ${JSON.stringify(names)}) {
    const day = days.find((item) => item.name === name);
    await e.service.assignRuntimeProfile(shared.scenarioId, pattern.id, day.id, shared.runtimeProfileId);
  }`;

test('the Runtime profile line lists every Service day that shares the profile (02R-AC18)', async ({ page }) => {
  await openGoldenTripsAfter(page, shareWeekdayProfileWith('Saturday', 'Sunday'));
  await expect(page.locator('.profile-usage')).toHaveText('Used by Weekday, Saturday, and Sunday for Southbound: Wagon Road to Evans.');
  // The same profile is named from Saturday's side.
  await scopeField(page, 'Day').selectOption({ label: 'Saturday' });
  await expect(page.locator('.profile-usage')).toHaveText(/^Used by Weekday, Saturday, and Sunday for /);
});

test('the Runtime profile line names two Service days with "and", and one Service day alone', async ({ page }) => {
  await openGoldenTripsAfter(page, shareWeekdayProfileWith('Saturday'));
  await expect(page.locator('.profile-usage')).toHaveText('Used by Weekday and Saturday for Southbound: Wagon Road to Evans.');
  await openGoldenTripsAfter(page, '');
  await expect(page.locator('.profile-usage')).toHaveText('Used by Weekday for Southbound: Wagon Road to Evans.');
});

test('the Trips selectors are labeled "Trip profile" and "Blocking scenario"', async ({ page }) => {
  await openGoldenTripsAfter(page, '');
  const labels = await tripsSection(page).locator('.menu-field-label').allTextContents();
  expect(labels).toEqual(['Trip profile', 'Blocking scenario']);
  await expect(tripsSection(page).locator('.menu-field').filter({ hasText: 'Blocking scenario' }).getByRole('button')).toBeVisible();
  // The Runtimes section names its profile selector "Runtime profile".
  await expect(runtimeSection(page).locator('.menu-field-label')).toHaveText(['Runtime profile']);
});

test('Runtime band totals of 60 minutes or more use the same duration format as the segments and the Run Time column', async ({ page }) => {
  await openGoldenTripsAfter(page, '');
  // The golden Weekday profile has totals of 53, 61, 65, and 57 minutes. Display-only totals read h:mm from an hour (F2-A, UR-3); the editable segment cells keep :MM (O-3).
  await expect(runtimeSection(page).locator('.runtime-total')).toHaveText([':53', '1:01', '1:05', ':57']);
  await expect(runtimeSection(page).getByLabel('Time band 2 segment 1')).toHaveValue(':06');
});

test('the Runtime Method applies to every Pattern on the Route after a confirmation, and Paste and CSV import are gone', async ({ page }) => {
  await createRouteWithPattern(page, 'Route method');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await openRuntimes(page);
  const section = runtimeSection(page);
  await expect(section.getByLabel('Time band 1 segment 1')).toBeVisible();
  const storedMethod = () => runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.calculationMethod)');
  expect(await storedMethod()).toEqual(['segmentStart']);

  await section.getByRole('button', { name: 'Runtime actions', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Runtime actions' });
  await expect(menu.getByText('Calculation method (whole route)', { exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Band at segment start' })).toHaveAttribute('aria-checked', 'true');
  await expect(menu.getByRole('menuitem', { name: 'Paste rows…' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Import profile CSV…' })).toHaveCount(0);

  // Cancel leaves the method as it is.
  await menu.getByRole('menuitemradio', { name: 'Single band for trip' }).click();
  let dialog = page.getByRole('dialog', { name: /^Use Single band for trip for .+\?$/ });
  await expect(dialog.getByRole('status')).toContainText('1 Runtime profile will change. 0 Trips will be marked Run times changed');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await storedMethod()).toEqual(['segmentStart']);

  // Change method writes the Route's method to its profiles.
  await section.getByRole('button', { name: 'Runtime actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Runtime actions' }).getByRole('menuitemradio', { name: 'Single band for trip' }).click();
  dialog = page.getByRole('dialog', { name: /^Use Single band for trip for .+\?$/ });
  await dialog.getByRole('button', { name: 'Change method', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(storedMethod).toEqual(['singleBand']);
  await section.getByRole('button', { name: 'Runtime actions', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Runtime actions' }).getByRole('menuitemradio', { name: 'Single band for trip' })).toHaveAttribute('aria-checked', 'true');
});

test('Undo and Redo change the Shift history only after the preview resolves', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await page.locator('.trips-workspace .schedule-table tbody tr').first().getByRole('checkbox').check();
  await runCommand(page, 'trips.shift');
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  const redo = drawer.getByRole('button', { name: 'Redo', exact: true });
  const undo = drawer.getByRole('button', { name: 'Undo', exact: true });
  await drawer.getByRole('button', { name: /min later/ }).click();
  await expect(page.getByText('Staged 1 minute later')).toBeVisible();
  await undo.click();
  await expect(page.getByText('Staged 1 minute later')).toHaveCount(0);
  await expect(redo).toBeEnabled();

  // A Shift that cannot be previewed (the 6:00 Trip would move before 0:00) must not clear the Redo history.
  await drawer.getByLabel('Step minutes').fill('9999');
  await drawer.getByRole('button', { name: /min earlier/ }).click();
  await expect(drawer.getByRole('alert')).toContainText('before 0:00');
  await expect(redo).toBeEnabled();

  // Redo still restores the undone step once the planner asks for it.
  await redo.click();
  await expect(drawer.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Staged 1 minute later')).toBeVisible();
  await expect(redo).toBeDisabled();
  await expect(undo).toBeEnabled();
});

test('the Trips CSV export mirrors the Trips table and contains no ids', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const downloadPromise = page.waitForEvent('download');
  await runCommand(page, 'trips.exportCsv');
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString('utf8');
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  expect(header.slice(0, 2)).toEqual(['Direction', 'Pattern']);
  expect(header.slice(-5)).toEqual(['Run Time', 'Layover', 'Deadhead', 'Next Trip', 'Block']);
  expect(lines).toHaveLength(4);
  const ids = await runInPage(page, 'return { pattern: (await e.db.patterns.toArray())[0], trips: (await e.db.trips.toArray()).map((trip) => trip.id) }');
  expect(lines[1].split(',')[1]).toBe(ids.pattern.name);
  expect(lines[1].split(',')[2]).toBe('6:00');
  expect(csv).not.toContain(ids.pattern.id);
  for (const id of ids.trips) expect(csv).not.toContain(id);
  expect(csv).not.toContain('point:');
});

test('a render error shows a recoverable message instead of an empty page, and another tab still opens', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  // A Trip with a negative time (written outside the application) cannot be formatted, so drawing the schedule throws.
  await runInPage(page, 'const [trip] = await e.db.trips.toArray(); await e.db.trips.put({ ...trip, stopTimes: trip.stopTimes.map((point, index) => ({ ...point, time: -60 + index * 420 })) });');
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'This screen could not be shown' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Your saved data is still in this browser');
  // The header and the tabs are still there.
  await expect(page.getByRole('button', { name: 'Route', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Route definition' })).toBeVisible();
  await expect(alert).toHaveCount(0);
  // Correct the data, return to Trips, and the schedule shows again (the boundary resets when the tab changes).
  await runInPage(page, 'const [trip] = await e.db.trips.toArray(); await e.db.trips.put({ ...trip, stopTimes: trip.stopTimes.map((point, index) => ({ ...point, time: 21600 + index * 420 })) });');
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(3);
});

test('the error message offers Try again, which draws the screen once the data is corrected', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await runInPage(page, 'const [trip] = await e.db.trips.toArray(); await e.db.trips.put({ ...trip, stopTimes: trip.stopTimes.map((point, index) => ({ ...point, time: -60 + index * 420 })) });');
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'This screen could not be shown' });
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Try again', exact: true }).click();
  // The data is still wrong, so the message returns; the button works and the page does not go blank.
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Reload page', exact: true })).toBeVisible();
});

test('Show runtime bands follows a Runtime profile saved in the same session, with no page reload', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await expect(page.locator('.trips-workspace .schedule-table tbody tr')).toHaveCount(3);
  await runCommand(page, 'trips.toggleBands');
  const legend = page.getByLabel('Runtime band legend');
  await expect(legend).toContainText('0:00–30:00');

  const end = runtimeSection(page).getByLabel('Time band 1 end');
  await end.fill('28:00');
  await end.press('Tab');
  await runtimeSection(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(runtimeSection(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(legend).toContainText('0:00–28:00');
  await expect(legend).not.toContainText('0:00–30:00');
});

test('the Recalculate dialog offers no band picker for a segment-start profile and says why', async ({ page }) => {
  await createShiftReadySchedule(page, '06:00');
  // Two bands that make an anchor at the last timepoint reachable from two first departures (Decision 0031 addendum): 5:55 in
  // the first band (10 minutes) and 6:00 in the second (5 minutes) both arrive at 6:05.
  await runInPage(page, `
    const [profile] = await e.db.runtimeProfiles.toArray();
    await e.service.saveRuntimeProfile({ ...profile, calculationMethod: 'segmentStart', bands: [
      { ...profile.bands[0], label: 'Early', sequence: 0, startTime: 0, endTime: 21600, segmentRuntimeSeconds: [600] },
      { id: 'band-late', label: 'Late', sequence: 1, startTime: 21600, endTime: 108000, segmentRuntimeSeconds: [300] },
    ] });
    const [trip] = await e.db.trips.toArray();
    await e.db.trips.put({ ...trip, stopTimes: [{ ...trip.stopTimes[0], time: 21300 }, { ...trip.stopTimes[1], time: 21900 }] });
  `);
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.locator('.schedule-table tbody input[type="checkbox"]').first().check();
  await runCommand(page, 'trips.regenerate');
  const dialog = page.getByRole('dialog', { name: 'Regenerate selected trips' });
  await dialog.getByRole('button', { name: 'Last timepoint', exact: true }).click();
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('ambiguous');
  // The candidates are listed, and no band can be chosen for this method.
  await expect(alert).toContainText('Early');
  await expect(alert).toContainText('5:55');
  await expect(alert).toContainText('Late');
  await expect(alert).toContainText('6:00');
  await expect(alert).toContainText('cannot be chosen');
  await expect(dialog.getByLabel('Runtime band')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Use selected band' })).toHaveCount(0);
  // The options that remain work: switch the Trip to its first departure.
  await alert.getByRole('button', { name: 'Use first departure for this trip' }).click();
  await expect(dialog.getByRole('button', { name: 'Regenerate trips', exact: true })).toBeEnabled();
});

test('the Recalculate dialog still offers the band picker for a single-band profile', async ({ page }) => {
  await createShiftReadySchedule(page, '06:00');
  await runInPage(page, `
    const [profile] = await e.db.runtimeProfiles.toArray();
    await e.service.saveRuntimeProfile({ ...profile, calculationMethod: 'singleBand', bands: [
      { ...profile.bands[0], label: 'Early', sequence: 0, startTime: 0, endTime: 21600, segmentRuntimeSeconds: [600] },
      { id: 'band-late', label: 'Late', sequence: 1, startTime: 21600, endTime: 108000, segmentRuntimeSeconds: [300] },
    ] });
    const [trip] = await e.db.trips.toArray();
    await e.db.trips.put({ ...trip, stopTimes: [{ ...trip.stopTimes[0], time: 21300 }, { ...trip.stopTimes[1], time: 21900 }] });
  `);
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.locator('.schedule-table tbody input[type="checkbox"]').first().check();
  await runCommand(page, 'trips.regenerate');
  const dialog = page.getByRole('dialog', { name: 'Regenerate selected trips' });
  await dialog.getByRole('button', { name: 'Last timepoint', exact: true }).click();
  await expect(dialog.getByLabel('Runtime band')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Use selected band' })).toBeVisible();
});

test('the first visit to Trips creates one Default Runtime profile and one assignment per standard Service day, with no error', async ({ page }) => {
  await createRouteWithPattern(page, 'First visit to Trips');
  // No default exists yet: the Route screen does not create it.
  expect(await runInPage(page, 'return [await e.db.runtimeProfiles.count(), await e.db.runtimeAssignments.count()]')).toEqual([0, 0]);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await openRuntimes(page);
  await expect(runtimeSection(page).getByLabel('Time band 1 segment 1')).toBeVisible();
  await expect(runtimeSection(page).getByRole('button', { name: 'Runtime actions', exact: true })).toBeEnabled();
  await expect(page.locator('.notice')).toHaveCount(0);
  expect(await runInPage(page, 'return [await e.db.runtimeProfiles.count(), await e.db.runtimeAssignments.count()]')).toEqual([1, 4]);
  await expect(page.locator('.profile-usage')).toHaveText('Used by Weekday, Saturday, Sunday, and Holiday for New pattern.');
});
