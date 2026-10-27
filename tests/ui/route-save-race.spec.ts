// Package F1, item 2 (finding L-16): "Add pattern" is unavailable while a Node or Pattern save is running.
//
// Cause: a save is not instant. The Node editor already disables "New node" while Save nodes runs, but "Add pattern" stayed live, so a
// click (or a planner who is quick) opened a Pattern draft in the middle of the save, and a spec that waited only for "Save nodes" to be
// disabled (it is disabled from the moment the save starts) could not know the save had finished. I could not make the reload replace the
// Pattern draft in any timing I tried (see the fix log), so the fix closes the window instead: the button is disabled for the whole save,
// the same way "New node" is, which also makes Playwright's click wait for the end of the save.
//
// A slowed save makes the window wide: every read-write and read transaction of the app's database waits before it starts.
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { editGridCell, gridCell } from './support/ui';
import { createRouteWithPattern } from './support/tripsWorkspace';

test.setTimeout(60_000);

const addPattern = (page: Page) => page.getByRole('button', { name: 'Add pattern', exact: true });
const saveNodes = (page: Page) => page.getByRole('button', { name: 'Save nodes', exact: true });

/** Makes every transaction of the app's database wait `milliseconds` before it starts. */
async function slowSaves(page: Page, milliseconds: number) {
  await page.evaluate(`(async () => {
    const { TransitDatabase } = await import('/src/persistence/database.ts');
    const original = TransitDatabase.prototype.transaction;
    TransitDatabase.prototype.transaction = function (...args) {
      return new Promise((resolve) => setTimeout(resolve, ${milliseconds})).then(() => original.apply(this, args));
    };
  })()`);
}

test('Add pattern is disabled while Save nodes is running, then opens a Pattern draft', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
  await page.locator('#dialog-name').fill('Save race verification');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await page.getByRole('button', { name: 'Route actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New route', exact: true }).click();
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await editGridCell(gridCell(page, 'Node name'), 'A');
  await expect(addPattern(page)).toBeEnabled();

  await slowSaves(page, 600);
  await saveNodes(page).click();
  await expect(addPattern(page)).toBeDisabled();
  expect(await runInPage(page, 'return await e.db.nodes.count()')).toBe(0);
  await expect.poll(() => runInPage(page, 'return await e.db.nodes.count()')).toBe(1);
  await expect(addPattern(page)).toBeEnabled();
  await addPattern(page).click();
  await expect(page.getByText('New Pattern — not saved')).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByText('New Pattern — not saved')).toBeVisible();
});

test('Add pattern is disabled while Save Pattern is running', async ({ page }) => {
  await createRouteWithPattern(page, 'Pattern save race verification');
  await page.getByLabel('Pattern name').fill('Renamed');
  await expect(addPattern(page)).toBeEnabled();

  await slowSaves(page, 600);
  await page.getByRole('button', { name: 'Review and save', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Save and rebalance', exact: true });
  if (await confirm.isVisible()) await confirm.click();
  await expect(addPattern(page)).toBeDisabled();
  await expect.poll(() => runInPage(page, 'return (await e.db.patterns.toArray()).map((pattern) => pattern.name)')).toEqual(['Renamed']);
  await expect(addPattern(page)).toBeEnabled();
});
