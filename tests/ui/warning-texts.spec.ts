// Decision 0081, package FX3: the warnings, counts, and button styles that name what a save or a copy changes, checked on screen and
// against the stored records. Auto-blocking keeps a new scenario's values when its dialog is closed without creating it.
import { expect, test } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { chooseScope, expectBlockingScenarioSelected, runCommand } from './support/ui';

test.setTimeout(180_000);

const patternNodes = 'return (await e.db.patterns.toArray()).map((pattern) => pattern.points.map((point) => point.nodeId))';
const tripCount = 'return await e.db.trips.count()';

test('a point order that resets the pattern warns before the save, and Cancel in its review changes nothing', async ({ page }) => {
  await createShiftReadySchedule(page, '06:00');
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  const before = [await runInPage(page, patternNodes), await runInPage(page, tripCount)];

  const rows = page.getByRole('grid', { name: 'Pattern points' }).locator('tbody tr');
  await rows.nth(0).getByRole('button', { name: 'Move point down', exact: true }).click();
  await expect(page.getByText("Saving this point order removes the pattern's runtimes and trips.", { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: "Remove this pattern's service?", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remove service and save', exact: true })).toHaveClass(/danger/);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect([await runInPage(page, patternNodes), await runInPage(page, tripCount)]).toEqual(before);
});

test('removing a timepoint that has trips names it in the save review, and the confirm button is a danger action', async ({ page }) => {
  await createShiftReadySchedule(page, '06:00');
  await page.getByRole('button', { name: 'Route', exact: true }).click();

  // A loop, A to B to A. Adding a point at the end keeps the order of the saved points, so the save only rebalances.
  await page.getByRole('button', { name: 'Add node to pattern', exact: true }).click();
  await expect(page.getByLabel('Point 3 node')).toBeVisible();
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  const rebalance = page.getByRole('alertdialog', { name: 'Save pattern and rebalance?', exact: true });
  await rebalance.getByRole('button', { name: 'Save and rebalance', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review and save', exact: true })).toHaveCount(0);
  await expect.poll(() => runInPage(page, 'return (await e.db.patterns.toArray())[0].points.length')).toBe(3);

  await page.getByRole('button', { name: 'Remove point 2', exact: true }).click();
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Save pattern and rebalance?', exact: true });
  await expect(dialog).toContainText('Removed or changed timepoints: B.');
  await expect(dialog.getByRole('button', { name: 'Save and rebalance', exact: true })).toHaveClass(/danger/);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => runInPage(page, 'return (await e.db.patterns.toArray())[0].points.length')).toBe(3);
});

test('copying trips onto a day that already has trips asks to replace them, with a danger button', async ({ page }) => {
  await createShiftReadySchedule(page, '06:00');
  await chooseScope(page, 'Day', { label: 'Saturday' });
  const weekdayTrips = await runInPage(page, tripCount);

  await runCommand(page, 'trips.copyDay');
  const first = page.getByRole('dialog', { name: 'Copy trips', exact: true });
  await first.getByLabel('Source day').selectOption({ label: 'Weekday' });
  await first.getByRole('button', { name: 'Review copy', exact: true }).click();
  await expect(first.getByRole('button', { name: 'Copy trips', exact: true })).toHaveClass(/primary/);
  await first.getByRole('button', { name: 'Copy trips', exact: true }).click();
  await expect(first).toHaveCount(0);
  await expect.poll(() => runInPage(page, tripCount)).toBeGreaterThan(weekdayTrips);

  await runCommand(page, 'trips.copyDay');
  const second = page.getByRole('dialog', { name: 'Copy trips', exact: true });
  await second.getByLabel('Source day').selectOption({ label: 'Weekday' });
  await second.getByRole('button', { name: 'Review copy', exact: true }).click();
  await expect(second.getByRole('button', { name: 'Replace trips', exact: true })).toHaveClass(/danger/);
  await second.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(second).toHaveCount(0);
});

test('a new auto-blocking scenario closed with Cancel keeps its name for the next opening', async ({ page }) => {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expectBlockingScenarioSelected(page);

  await runCommand(page, 'blockingScenario.autoBlocking');
  const dialog = page.getByRole('dialog', { name: 'Auto-blocking' });
  await expect(dialog.getByLabel('Blocking scenario name')).toHaveValue(/^Auto \d+$/, { timeout: 30_000 });
  await dialog.getByLabel('Blocking scenario name').fill('Draft kept name');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await runCommand(page, 'blockingScenario.autoBlocking');
  const reopened = page.getByRole('dialog', { name: 'Auto-blocking' });
  await expect(reopened.getByLabel('Blocking scenario name')).toHaveValue('Draft kept name', { timeout: 30_000 });
});
