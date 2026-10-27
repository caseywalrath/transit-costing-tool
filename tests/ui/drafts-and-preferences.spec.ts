// Review package U03 (issues I-026, I-030, I-032, I-042, I-091; findings 4-010, 5-004, 5-006, 5-024, 5-025; user decision 14).
// Unsaved input is no longer lost without a word, Escape cancels an edit, and a stored selection of the wrong shape cannot blank the app.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { createRouteWithPattern, createShiftReadySchedule, openGoldenTrips } from './support/tripsWorkspace';
import { scopeField } from './support/ui';

test.setTimeout(150_000);
test.use({ actionTimeout: 15_000 });

const ROUTE_SELECTION_KEY = 'transit-costing-tool.route-selection.v1';
const BLOCKING_SELECTION_KEY = 'transit-costing-tool.blocking-selection.v1';
const TRIPS_BLOCKING_KEY = 'transit-costing-tool.trip-blocking-scenario.v1';

const runtimeSection = (page: Page) => page.locator('[aria-label="Runtimes section"]');
const tripsSection = (page: Page) => page.locator('[aria-label="Trips section"]');
const leaveDialog = (page: Page) => page.getByRole('alertdialog', { name: 'Save Runtime changes before leaving?' });
const shiftDialog = (page: Page) => page.getByRole('heading', { name: 'Discard staged shift?' });
const firstSegment = (page: Page) => runtimeSection(page).getByLabel('Time band 1 segment 1');

/** Types a new first-segment runtime and leaves the field, which makes the Runtime editor draft dirty. */
async function dirtyRuntime(page: Page, value = ':09') {
  await firstSegment(page).fill(value);
  await firstSegment(page).press('Tab');
  await expect(runtimeSection(page).getByRole('button', { name: 'Save', exact: true })).toBeVisible();
}

const dayOption = (page: Page) => scopeField(page, 'Day').evaluate((select: HTMLSelectElement) => select.selectedOptions[0]?.textContent ?? '');

async function startStagedShift(page: Page) {
  await page.locator('.schedule-table tbody input[type="checkbox"]').first().check();
  await tripsSection(page).getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Shift selected Trips' });
  await drawer.getByRole('button', { name: /min earlier/ }).click();
  await expect(page.getByText('Staged 1 minute earlier')).toBeVisible();
  return drawer;
}

test('a dirty Runtime draft asks Save, Discard, or Cancel before the service day changes', async ({ page }) => {
  await createShiftReadySchedule(page);
  const day = scopeField(page, 'Day');
  const original = await dayOption(page);
  await dirtyRuntime(page);

  await day.selectOption({ index: 1 });
  await expect(leaveDialog(page)).toBeVisible();
  await expect(leaveDialog(page).getByRole('button')).toHaveText(['Cancel', 'Discard', 'Save']);

  // Cancel keeps the day and the draft.
  await leaveDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(leaveDialog(page)).toHaveCount(0);
  expect(await dayOption(page)).toBe(original);
  await expect(firstSegment(page)).toHaveValue(':09');

  // Discard changes the day and drops the draft; the saved value is untouched.
  await day.selectOption({ index: 1 });
  await leaveDialog(page).getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(leaveDialog(page)).toHaveCount(0);
  expect(await dayOption(page)).not.toBe(original);
  await expect(runtimeSection(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(await runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.bands[0].segmentRuntimeSeconds[0])')).toEqual([420]);
});

test('Save in the Runtime leave dialog saves the profile, then changes the service day', async ({ page }) => {
  await createShiftReadySchedule(page);
  const day = scopeField(page, 'Day');
  const original = await dayOption(page);
  await dirtyRuntime(page, ':09');

  await day.selectOption({ index: 1 });
  await leaveDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(leaveDialog(page)).toHaveCount(0);
  await expect.poll(() => runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.bands[0].segmentRuntimeSeconds[0])')).toEqual([540]);
  await expect.poll(() => dayOption(page)).not.toBe(original);
});

test('a dirty Runtime draft is also guarded on a tab change, and Cancel stays on Trips', async ({ page }) => {
  await createShiftReadySchedule(page);
  await dirtyRuntime(page);

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(runtimeSection(page)).toBeVisible();
  await expect(firstSegment(page)).toHaveValue(':09');

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await leaveDialog(page).getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByLabel('Blocking controls')).toBeVisible();
});

test('a dirty Runtime draft is guarded when the Runtime profile changes, and a reload raises the leave prompt', async ({ page }) => {
  await openGoldenTrips(page);
  await dirtyRuntime(page);

  const pattern = runtimeSection(page).getByLabel('Pattern');
  const currentPattern = await pattern.evaluate((select: HTMLSelectElement) => select.value);
  const other = await pattern.evaluate((select: HTMLSelectElement) => [...select.options].find((option) => option.value !== select.value)!.value);
  await pattern.selectOption(other);
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(pattern).toHaveValue(currentPattern);
  await expect(firstSegment(page)).toHaveValue(':09');

  await runtimeSection(page).locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button').click();
  await page.getByRole('menu', { name: 'Runtime profile' }).getByRole('menuitem', { name: 'Rename profile…' }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();

  // Leaving the page with the draft open raises the browser's leave prompt (beforeunload is cancelled).
  expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  await runtimeSection(page).getByRole('button', { name: 'Discard', exact: true }).click();
  // The listener is removed when the draft is gone (after the next render).
  await expect.poll(() => page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
});

test('saving the Runtime profile asks before it drops a staged Shift', async ({ page }) => {
  // Wide enough that the docked Shift drawer does not cover the Runtime Save button.
  await page.setViewportSize({ width: 1900, height: 1000 });
  await createShiftReadySchedule(page);
  const drawer = await startStagedShift(page);
  await dirtyRuntime(page, ':09');

  // The docked Shift drawer covers the Runtime Save button at this width (recorded for U07), so press it from the keyboard.
  const save = runtimeSection(page).getByRole('button', { name: 'Save', exact: true });
  await save.focus(); await save.press('Enter');
  await expect(shiftDialog(page)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(shiftDialog(page)).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(page.getByText('Staged 1 minute earlier')).toBeVisible();
  expect(await runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.bands[0].segmentRuntimeSeconds[0])')).toEqual([420]);

  await save.focus(); await save.press('Enter');
  await page.getByRole('button', { name: 'Discard', exact: true }).last().click();
  await expect.poll(() => runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.bands[0].segmentRuntimeSeconds[0])')).toEqual([540]);
  await expect(drawer).toHaveCount(0);
});

test('a staged Shift is guarded on a tab change, and a dirty Runtime draft is asked about first', async ({ page }) => {
  await createShiftReadySchedule(page);
  await startStagedShift(page);
  await dirtyRuntime(page);

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(leaveDialog(page)).toBeVisible();
  await leaveDialog(page).getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(shiftDialog(page)).toBeVisible();
  await page.getByRole('button', { name: 'Discard', exact: true }).last().click();
  await expect(page.getByLabel('Blocking controls')).toBeVisible();
});

test('Build Trips closes without a prompt and shows its values again when it is reopened', async ({ page }) => {
  await createShiftReadySchedule(page);
  const actions = tripsSection(page).getByRole('button', { name: 'Trip actions', exact: true });
  const open = async () => { await actions.click(); await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Build trips…' }).click(); };
  const drawer = page.getByRole('complementary', { name: 'Build Trips' });

  await open();
  await expect(drawer.getByLabel('First Trip')).toHaveValue('');
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByLabel('First Trip').fill('07:15');
  await drawer.getByLabel('Headway').fill('20');
  await drawer.getByLabel('Number of Trips').fill('3');
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  await open();
  await expect(drawer.getByLabel('First Trip')).toHaveValue('07:15');
  await expect(drawer.getByLabel('Headway')).toHaveValue('20');
  await expect(drawer.getByLabel('Number of Trips')).toHaveValue('3');
  await expect(drawer.getByLabel('Pattern')).not.toHaveValue('');

  // A successful build clears the values.
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden();
  await open();
  await expect(drawer.getByLabel('First Trip')).toHaveValue('');
  await expect(drawer.getByLabel('Headway')).toHaveValue('');
});

test('saving Nodes keeps an unsaved Pattern draft, and saving a Pattern keeps unsaved Node edits', async ({ page }) => {
  await createRouteWithPattern(page, 'Draft preservation');
  const patternName = page.getByLabel('Pattern name');
  const nodeNames = page.getByLabel('Node name');
  const saveNodes = page.getByRole('button', { name: 'Save nodes', exact: true });
  const savePattern = page.getByRole('button', { name: 'Save Pattern', exact: true });

  // Unsaved Pattern edit, then a Node save.
  await patternName.fill('Edited pattern, not saved');
  await expect(savePattern).toBeEnabled();
  const nodeInput = async (name: string) => nodeNames.nth(await nodeNames.evaluateAll((inputs, wanted) => inputs.findIndex((input) => (input as HTMLInputElement).value === wanted), name));
  await (await nodeInput('A')).fill('A renamed');
  await saveNodes.click();
  await expect(saveNodes).toBeDisabled();
  await expect.poll(() => runInPage(page, "return (await e.db.nodes.toArray()).map((node) => node.name).sort().join(',')")).toBe('A renamed,B');
  await expect(patternName).toHaveValue('Edited pattern, not saved');
  await expect(savePattern).toBeEnabled();

  // Unsaved Node edit, then a Pattern save.
  await (await nodeInput('B')).fill('B edited, not saved');
  await expect(saveNodes).toBeEnabled();
  await savePattern.click();
  const rebalance = page.getByRole('button', { name: 'Save and rebalance', exact: true });
  if (await rebalance.isVisible().catch(() => false)) await rebalance.click();
  await expect.poll(() => runInPage(page, 'return (await e.db.patterns.toArray()).map((pattern) => pattern.name).join(",")')).toBe('Edited pattern, not saved');
  await expect(await nodeInput('B edited, not saved')).toHaveValue('B edited, not saved');
  await expect(saveNodes).toBeEnabled();
  expect(await runInPage(page, "return (await e.db.nodes.toArray()).map((node) => node.name).sort().join(',')")).toBe('A renamed,B');
});

test('Escape in a number field and in a Runtime time field restores the saved value and writes nothing', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  const weekdayDays = page.getByLabel('Weekday annual service days');
  await expect(weekdayDays).toHaveValue('255', { timeout: 30_000 });
  const savedAt = await runInPage(page, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').updatedAt");

  await weekdayDays.fill('254');
  await weekdayDays.press('Escape');
  await expect(weekdayDays).toHaveValue('255');
  await expect(weekdayDays).not.toBeFocused();
  await page.waitForTimeout(400);
  expect(await runInPage(page, "const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday'); return [day.annualServiceDays, day.updatedAt]")).toEqual([255, savedAt]);
  await expect(page.locator('.notice')).toHaveCount(0);

  // Control: Enter still commits.
  await weekdayDays.fill('254');
  await weekdayDays.press('Enter');
  await expect.poll(() => runInPage(page, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').annualServiceDays")).toBe(254);

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(firstSegment(page)).toBeVisible({ timeout: 30_000 });
  const saved = await firstSegment(page).inputValue();
  await firstSegment(page).fill(':13');
  await firstSegment(page).press('Escape');
  await expect(firstSegment(page)).toHaveValue(saved);
  await expect(runtimeSection(page).getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
});

for (const [name, route, blocking] of [
  ['null', 'null', 'null'],
  ['an array', '[]', '["x"]'],
  ['a number', '5', '7'],
  ['wrong-typed fields', '{"projectId":5,"scenarioId":["x"],"routeId":{}}', '{"tripProfileId":1,"blockingScenarioId":{},"serviceDayId":[],"minimumLayover":"none","blockSelections":[1]}'],
] as const) {
  test(`a stored selection that is ${name} falls back to the default selection`, async ({ page }) => {
    await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
    await page.evaluate(([routeKey, routeValue, blockingKey, blockingValue]) => { localStorage.setItem(routeKey, routeValue); localStorage.setItem(blockingKey, blockingValue); }, [ROUTE_SELECTION_KEY, route, BLOCKING_SELECTION_KEY, blocking]);
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Blocking', exact: true }).click();
    await expect(page.getByLabel('Blocking controls')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Blocking controls' }).getByRole('combobox', { name: 'Blocking Scenario' })).toHaveValue(/.+/);
    await expect(page.locator('.notice')).toHaveCount(0);
  });
}

test('the remembered Blocking Scenario survives a Trip Profile change and is restored in Trips and in Blocking', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  // A second Blocking Scenario on the Default Trip Profile, and a second Trip Profile with its own Blocking Scenario.
  await runInPage(page, `
    const scenario = (await e.db.scenarios.toArray())[0];
    const [profile] = await e.db.tripProfiles.toArray();
    const stamp = '2026-10-23T00:00:00.000Z';
    await e.db.tripProfiles.put({ id: 'alt-profile', scenarioId: scenario.id, name: 'Alt', createdAt: stamp, updatedAt: stamp });
    await e.blocking.createBlockingScenario({ scenarioId: scenario.id, tripProfileId: profile.id, name: 'Second blocks' });
    await e.blocking.createBlockingScenario({ scenarioId: scenario.id, tripProfileId: 'alt-profile', name: 'Alt blocks' });`);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });

  // Trips: pick the Blocking Scenario that is not the first one listed.
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await scopeField(page, 'Day').selectOption({ label: 'Weekday' });
  const scenarioMenu = tripsSection(page).locator('.menu-field').filter({ hasText: 'Scenario' }).getByRole('button');
  const profileMenu = tripsSection(page).locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button');
  await expect(scenarioMenu).toContainText(/blocks/i, { timeout: 30_000 });
  if (!/Default/.test(await profileMenu.innerText())) { await profileMenu.click(); await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitemradio', { name: 'Default', exact: true }).click(); await expect(profileMenu).toContainText('Default'); }
  await expect(scenarioMenu).toContainText(/Workbook Blocks|Second blocks/);
  const initial = (await scenarioMenu.innerText()).replace('▾', '').trim();
  const chosen = initial === 'Second blocks' ? 'Workbook Blocks' : 'Second blocks';
  await scenarioMenu.click();
  await page.getByRole('menu', { name: 'Blocking Scenario' }).getByRole('menuitemradio', { name: chosen, exact: true }).click();
  await expect(scenarioMenu).toContainText(chosen);

  // Change the Trip Profile and back: the choice for the Default profile is still the one made.
  await profileMenu.click();
  await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitemradio', { name: 'Alt', exact: true }).click();
  await expect(scenarioMenu).toContainText('Alt blocks');
  await profileMenu.click();
  await page.getByRole('menu', { name: 'Trip profile' }).getByRole('menuitemradio', { name: 'Default', exact: true }).click();
  await expect(scenarioMenu).toContainText(chosen);

  // Blocking: choose the non-first Scenario, reload, and open Blocking again. It is restored, not replaced by the first one listed.
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const blockingScenario = page.getByRole('region', { name: 'Blocking controls' }).getByRole('combobox', { name: 'Blocking Scenario' });
  const profileSelect = page.getByRole('region', { name: 'Blocking controls' }).getByRole('combobox', { name: 'Trip Profile' });
  await profileSelect.selectOption({ label: 'Default' });
  await expect(blockingScenario).toHaveValue(/.+/);
  const shown = await blockingScenario.locator('option:checked').innerText();
  const other = shown === 'Second blocks' ? 'Workbook Blocks' : 'Second blocks';
  await blockingScenario.selectOption({ label: other });
  await page.reload();
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(blockingScenario.locator('option:checked')).toHaveText(other);

  // The remembered choice for the Default profile is kept while another Trip Profile is used in Blocking.
  await profileSelect.selectOption({ label: 'Alt' });
  await expect(blockingScenario.locator('option:checked')).toHaveText('Alt blocks');
  await profileSelect.selectOption({ label: 'Default' });
  await expect(blockingScenario.locator('option:checked')).toHaveText(other);
  void TRIPS_BLOCKING_KEY;
});
