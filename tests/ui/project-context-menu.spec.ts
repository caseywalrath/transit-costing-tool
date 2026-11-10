// Project context menu (Decision 0064, PCM4): right-clicking a project in the Projects group opens Open, Rename…, Back up project (JSON)
// and Delete project… for that project, which need not be the open one. The deletion dialog applies the backup guard.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { chooseProject, projectSwitcher, scenarioSwitcher } from './support/ui';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const NO_BACKUP = 'No backup of this project has been exported since its last change.';
const SECOND = 'Second project';

async function openGolden(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
}

/** Opens the golden project, creates "Second project" through the Projects menu, and switches back so the golden project is open. */
async function openGoldenWithSecondProject(page: Page): Promise<string> {
  await openGolden(page);
  const goldenName = (await projectSwitcher(page).getAttribute('aria-label'))!.replace(/^Project: /, '');
  await projectSwitcher(page).click();
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
  await page.locator('#dialog-name').fill(SECOND);
  await page.getByRole('button', { name: 'New project', exact: true }).last().click();
  await expect(projectSwitcher(page)).toHaveAccessibleName(`Project: ${SECOND}`);
  await chooseProject(page, goldenName);
  await expect(projectSwitcher(page)).toHaveAccessibleName(`Project: ${goldenName}`);
  return goldenName;
}

/** Opens the Project menu and right-clicks a project in its Projects group. Returns the project's context menu. */
async function openProjectContextMenu(page: Page, name: string) {
  await projectSwitcher(page).click();
  await page.getByRole('menu', { name: 'Project actions', exact: true }).getByRole('menuitemradio', { name, exact: true }).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: `${name} actions`, exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

test('right-clicking a project shows its Open, Rename, Back up and Delete actions', async ({ page }) => {
  await openGoldenWithSecondProject(page);
  const menu = await openProjectContextMenu(page, SECOND);
  for (const label of ['Open', 'Rename…', 'Back up project (JSON)', 'Delete project…']) {
    await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  }
  // The project is not open, so Open is available.
  await expect(menu.getByRole('menuitem', { name: 'Open', exact: true })).toBeEnabled();
});

test('Rename… renames the project that is not open and leaves the open project\'s name unchanged', async ({ page }) => {
  const goldenName = await openGoldenWithSecondProject(page);
  const menu = await openProjectContextMenu(page, SECOND);
  await menu.getByRole('menuitem', { name: 'Rename…', exact: true }).click();
  await page.locator('#dialog-name').fill('Renamed project');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();

  await expect(projectSwitcher(page)).toHaveAccessibleName(`Project: ${goldenName}`);
  await projectSwitcher(page).click();
  const projects = page.getByRole('menu', { name: 'Project actions', exact: true });
  await expect(projects.getByRole('menuitemradio', { name: 'Renamed project', exact: true })).toBeVisible();
  await expect(projects.getByRole('menuitemradio', { name: SECOND, exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('Delete project… on the project that is not open asks with the no-backup sentence, then removes it', async ({ page }) => {
  const goldenName = await openGoldenWithSecondProject(page);
  // Work in a tab other than Route and check that the open project, its tab and its scenario stay after the delete.
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Trips', exact: true })).toHaveAttribute('aria-current', 'page');
  const scenarioName = await scenarioSwitcher(page).getAttribute('aria-label');

  const menu = await openProjectContextMenu(page, SECOND);
  await menu.getByRole('menuitem', { name: 'Delete project…', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(NO_BACKUP);
  await expect(dialog.getByRole('button', { name: 'Back up and delete', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete project', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect(projectSwitcher(page)).toHaveAccessibleName(`Project: ${goldenName}`);
  await expect(page.getByRole('button', { name: 'Trips', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(scenarioSwitcher(page)).toHaveAttribute('aria-label', scenarioName!);
  await projectSwitcher(page).click();
  await expect(page.getByRole('menu', { name: 'Project actions', exact: true }).getByRole('menuitemradio', { name: SECOND, exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect.poll(() => runInPage(page, 'return await e.db.projects.count()')).toBe(1);
});

test('Back up and delete downloads the project\'s backup and then deletes the project', async ({ page }) => {
  await openGoldenWithSecondProject(page);
  const menu = await openProjectContextMenu(page, SECOND);
  await menu.getByRole('menuitem', { name: 'Delete project…', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(NO_BACKUP);

  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Back up and delete', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe(`${SECOND}.json`);

  await projectSwitcher(page).click();
  await expect(page.getByRole('menu', { name: 'Project actions', exact: true }).getByRole('menuitemradio', { name: SECOND, exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect.poll(() => runInPage(page, 'return await e.db.projects.count()')).toBe(1);
});

test('after Back up project (JSON) on a project, its delete dialog has no no-backup sentence', async ({ page }) => {
  await openGoldenWithSecondProject(page);
  const backup = await openProjectContextMenu(page, SECOND);
  const downloaded = page.waitForEvent('download');
  await backup.getByRole('menuitem', { name: 'Back up project (JSON)', exact: true }).click();
  await downloaded;

  const menu = await openProjectContextMenu(page, SECOND);
  await menu.getByRole('menuitem', { name: 'Delete project…', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText(NO_BACKUP);
  await expect(dialog.getByRole('button', { name: 'Back up and delete', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('Shift+F10 on a focused project item opens the same context menu', async ({ page }) => {
  await openGoldenWithSecondProject(page);
  await projectSwitcher(page).click();
  const item = page.getByRole('menu', { name: 'Project actions', exact: true }).getByRole('menuitemradio', { name: SECOND, exact: true });
  await item.focus();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name: `${SECOND} actions`, exact: true });
  await expect(menu).toBeVisible();
  for (const label of ['Open', 'Rename…', 'Back up project (JSON)', 'Delete project…']) {
    await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeVisible();
  }
});
