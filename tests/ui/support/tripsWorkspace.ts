// Shared setup for specs that drive the real Trips workspace (review package P05).
import { expect, type Page } from '@playwright/test';
import { goldenRaw } from './goldenFixture';
import { runInPage, seedSnapshot } from './dexieEnv';

/**
 * Creates a project with one Route that has Nodes A and B and one saved Pattern (A to B, rebalanced) and its Default Runtime profile.
 * Leaves the app on the Route tab with every save settled.
 *
 * Each step waits for the previous save to finish before it starts. `New node` and `Add pattern` are disabled while a save runs, so a click
 * on them waits for the end of the save (finding L-16; before package F1 `Add pattern` stayed live and this helper retried the click).
 */
export async function createRouteWithPattern(page: Page, projectName: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
  await page.locator('#dialog-name').fill(projectName);
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await page.getByRole('button', { name: 'Route actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New route', exact: true }).click();

  const saveNodes = page.getByRole('button', { name: 'Save nodes', exact: true });
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByLabel('Node name').fill('A');
  await saveNodes.click();
  await expect(saveNodes).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove A', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await page.getByLabel('Node name').last().fill('B');
  await saveNodes.click();
  await expect(saveNodes).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Remove B', exact: true })).toBeVisible();

  // "Add pattern" stays disabled until the Node save and its reload are done (review package F1, finding L-16), so the click waits for it.
  await page.getByRole('button', { name: 'Add pattern', exact: true }).click();
  await expect(page.getByText('New Pattern — not saved')).toBeVisible();
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await expect(page.getByLabel('Point 1 node')).toBeVisible();
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await expect(page.getByLabel('Point 2 node')).toBeVisible();
  await page.getByLabel('Point 2 node').selectOption({ label: 'B' });
  await page.getByRole('button', { name: 'Save Pattern', exact: true }).click();
  await page.getByRole('button', { name: 'Save and rebalance', exact: true }).click();
  await expect(page.getByText('New Pattern — not saved')).toHaveCount(0);

  // The first visit to Trips creates the Default Runtime profile and one assignment per standard Service day. The service does it in one
  // transaction and the Trips workspace loads one at a time (review package U07), so no setup step is needed before Trips mounts.
  await expect.poll(() => runInPage(page, 'return await e.db.patterns.count()')).toBe(1);
  await expect(page.getByRole('button', { name: 'Trips', exact: true })).toBeVisible();
}

/**
 * Creates that Route and builds Trips every 10 minutes from 06:00 to `lastTrip`, with one Default Runtime profile whose only segment
 * is `segment`. Leaves the app on the Trips tab.
 */
export async function createShiftReadySchedule(page: Page, lastTrip = '06:00', segment = ':07') {
  await createRouteWithPattern(page, 'Unified action layer verification');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();

  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await expect(runtimeSection.locator('.menu-field').filter({ hasText: 'Profile' }).getByRole('button', { name: 'Default' })).toBeVisible();
  await runtimeSection.getByLabel('Time band 1 segment 1').fill(segment);
  await runtimeSection.getByLabel('Time band 1 segment 1').press('Tab');
  await expect(runtimeSection.getByLabel('Time band 1 segment 1')).toHaveValue(segment);
  await expect(runtimeSection.getByRole('columnheader', { name: 'Total', exact: true })).toBeVisible();
  await expect(runtimeSection.getByText(segment, { exact: true })).toBeVisible();
  await expect(runtimeSection.locator('.runtime-table thead th')).toHaveText(['From', 'To', 'A → B', 'Total', 'Time band actions']);
  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  // The Save button disappears while the write is still running, so wait for the stored value before going on.
  const [minutes = '0', seconds = '0'] = segment.slice(1).split(':');
  await expect.poll(() => runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.bands[0].segmentRuntimeSeconds[0])')).toEqual([Number(minutes) * 60 + Number(seconds)]);
  // Saving a Runtime profile reloads the Runtime section once, and the menus stay disabled until it is done. Wait for that before the
  // steps below open a menu.
  await expect(runtimeSection.getByRole('button', { name: 'Runtime actions', exact: true })).toBeEnabled();
  await expect(runtimeSection.getByLabel('Time band 1 segment 1')).toHaveValue(segment);

  const tripsSection = page.locator('[aria-label="Trips section"]');
  await runtimeSection.getByRole('button', { name: 'Runtime actions', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Runtime actions' }).getByRole('menuitemradio', { name: 'Band at segment start' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  const actions = tripsSection.getByRole('button', { name: 'Trip actions', exact: true });
  await actions.focus();
  await actions.press('ArrowDown');
  const actionMenu = page.getByRole('menu', { name: 'Trip actions' });
  await expect(actionMenu.getByRole('menuitem')).toHaveText([
    'Build trips…',
    'Add trip…',
    'Regenerate selected…',
    'Shift selected…',
    'Change pattern…',
    'Assign Block…',
    'Unassign from Block…',
    'Copy Trips from day…',
    'Import Trips CSV…',
    'Export Trips CSV',
    'Delete selected…',
  ]);
  await actionMenu.getByRole('menuitem', { name: 'Build trips…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Build Trips' });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByLabel('First Trip').fill('06:00');
  await drawer.getByLabel('Headway').fill('10');
  await drawer.getByLabel('Last Trip').fill(lastTrip);
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden();
  const [lastHours, lastMinutes] = lastTrip.split(':').map(Number);
  const expectedTripCount = Math.floor(((lastHours * 60 + lastMinutes) - 6 * 60) / 10) + 1;
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(expectedTripCount);
}

/**
 * Seeds the Federal BRT golden project (Weekday Southbound: 138 Trips on 3 Patterns, 11 timepoints, Blocks assigned) and opens
 * its Trips tab on the Weekday service day.
 */
export async function openGoldenTrips(page: Page) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.locator('.route-picker').getByLabel('Day').selectOption({ label: 'Weekday' });
  await expect(page.locator('.trips-workspace .schedule-table tbody tr')).toHaveCount(138, { timeout: 30000 });
}

/** Waits for `count` animation frames. The app restores scroll positions two frames after a committed Shift reloads the Trips. */
export const settleFrames = (page: Page, count = 12) => page.evaluate((frames) => new Promise<void>((resolve) => {
  const step = (remaining: number) => (remaining === 0 ? resolve() : requestAnimationFrame(() => step(remaining - 1)));
  step(frames);
}), count);
