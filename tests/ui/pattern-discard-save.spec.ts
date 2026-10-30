// An unsaved edit to a saved Pattern asks Cancel, Discard, or Save before another Pattern is opened. A new Pattern that is still
// being built has nothing to save, so its dialog offers only Cancel and Discard.
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { openGoldenTrips } from './support/tripsWorkspace';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const dialog = (page: Page) => page.getByRole('alertdialog', { name: 'Discard unsaved pattern changes?' });
const patternList = (page: Page) => page.getByLabel('Patterns', { exact: true }).first();

async function openRoute(page: Page) {
  await openGoldenTrips(page);
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  await expect(page.getByLabel('Pattern name')).toBeVisible();
}
const storedNames = (page: Page) => runInPage(page, 'return (await e.db.patterns.toArray()).map((pattern) => pattern.name)') as Promise<string[]>;

test('Save in the dialog saves the edited Pattern and then opens the other one', async ({ page }) => {
  await openRoute(page);
  const name = page.getByLabel('Pattern name');
  const original = await name.inputValue();
  await name.fill('Renamed by dialog');
  const other = patternList(page).getByRole('button').filter({ hasNotText: original }).first();
  await other.click();
  await expect(dialog(page).getByRole('button')).toHaveText(['Cancel', 'Discard', 'Save']);
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => storedNames(page)).toContain('Renamed by dialog');
  await expect(dialog(page)).toHaveCount(0);
  await expect(name).not.toHaveValue('Renamed by dialog');
});

test('a new Pattern still being built can be discarded but not saved from the dialog', async ({ page }) => {
  await openRoute(page);
  await page.getByRole('button', { name: /^(New pattern|Add pattern)$/ }).first().click();
  await patternList(page).getByRole('button').filter({ hasNotText: 'New pattern' }).first().click();
  await expect(dialog(page).getByRole('button')).toHaveText(['Cancel', 'Discard']);
});
