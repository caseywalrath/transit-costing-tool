// Application header H-B (plan UR-5): the scope row stays on one line on every tab, the status line reports each save state, and the
// Project and Scenario switchers work from the keyboard and honour the unsaved-changes guard.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { chooseProject, projectSwitcher, scenarioSwitcher } from './support/ui';
import { seedCostingFixture } from './support/costingFixture';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const scopeBar = (page: Page) => page.getByRole('region', { name: 'Scope', exact: true });
const status = (page: Page) => page.locator('.save-status');

async function openGolden(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
}

for (const width of [1024, 1440]) {
  test(`the scope row is one line on every tab at ${width}px`, async ({ page }) => {
    await openGolden(page, width);
    for (const tab of ['Route', 'Trips', 'Blocking', 'Costing'] as const) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await expect(page.getByRole('button', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(scopeBar(page)).toBeVisible();
      const { height, overflow } = await scopeBar(page).evaluate((element) => ({ height: element.getBoundingClientRect().height, overflow: element.scrollWidth - element.clientWidth }));
      expect(height, `${tab} scope row height`).toBeLessThan(52);
      expect(overflow, `${tab} scope row overflow`).toBeLessThanOrEqual(0);
    }
    await expect(page.getByRole('button', { name: 'Costing', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Export costing CSV', exact: true })).toBeVisible();
  });
}

test('the scope row holds each tab\'s selectors', async ({ page }) => {
  await openGolden(page);
  const names = async () => scopeBar(page).locator('.context-field__label').allTextContents();
  expect(await names()).toEqual(['Route']);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect.poll(names).toEqual(['Route', 'Day', 'Direction']);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect.poll(names).toEqual(['Route', 'Trip profile', 'Blocking scenario', 'Day']);
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect.poll(names).toEqual(['Blocking scenario', 'Trip profile', 'View year']);
});

test('the status line shows the saved, backup, and read-only states', async ({ browser }) => {
  const context = await browser.newContext();
  const active = await context.newPage();
  await openGolden(active);
  await expect(status(active)).toContainText('Saved locally · no backup yet');

  const readOnly = await context.newPage();
  await readOnly.goto('/');
  await expect(readOnly.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await expect(status(readOnly)).toHaveText('Read-only: open in another tab');
  await context.close();
});

test('the status line reads "Saving locally…" while a write waits', async ({ page }) => {
  await openGolden(page);
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __statusSeen: string[] }).__statusSeen = seen;
    new MutationObserver(() => { const text = document.querySelector('.save-status')?.textContent; if (text) seen.push(text); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  // Keep a read-write transaction open so the app's write waits behind it and the saving state stays on screen.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('transit-costing-tool');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const transaction = db.transaction([...db.objectStoreNames], 'readwrite');
      const store = transaction.objectStore('projects');
      const until = performance.now() + 800;
      const keepOpen = () => { if (performance.now() < until) store.get('none').onsuccess = keepOpen; };
      keepOpen();
      transaction.oncomplete = () => db.close();
      resolve();
    };
  }));
  const description = page.getByLabel('Description').first();
  await description.fill('status test');
  await description.blur();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __statusSeen: string[] }).__statusSeen.includes('Saving locally…'))).toBe(true);
  await expect(status(page)).toContainText('Saved locally');
  await expect.poll(() => runInPage(page, 'return (await e.db.routes.toArray())[0].description ?? null')).toBe('status test');
});

test('the Project and Scenario menus open with ArrowDown, close with Escape, and return focus', async ({ page }) => {
  await openGolden(page);
  for (const [switcher, menuName] of [[projectSwitcher(page), 'Project actions'], [scenarioSwitcher(page), 'Scenario actions']] as const) {
    await switcher.focus();
    await page.keyboard.press('ArrowDown');
    const menu = page.getByRole('menu', { name: menuName, exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitemradio', { checked: true })).toHaveCount(1);
    await expect(menu.getByRole('menuitemradio').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(switcher).toBeFocused();
  }
});

test('choosing another project with unsaved Node edits asks first, and Cancel keeps the project and the edit', async ({ page }) => {
  await openGolden(page);
  const projectName = (await projectSwitcher(page).getAttribute('aria-label'))!.replace(/^Project: /, '');
  await projectSwitcher(page).click();
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
  await page.locator('#dialog-name').fill('Second project');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await expect(projectSwitcher(page)).toHaveAccessibleName('Project: Second project');

  await chooseProject(page, projectName);
  await expect(projectSwitcher(page)).toHaveAccessibleName(`Project: ${projectName}`);
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save nodes', exact: true })).toBeEnabled();

  await projectSwitcher(page).click();
  await page.getByRole('menu', { name: 'Project actions', exact: true }).getByRole('menuitemradio', { name: 'Second project', exact: true }).click();
  const dialog = page.getByRole('heading', { name: 'Save route changes before leaving?' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(projectSwitcher(page)).toHaveAccessibleName(`Project: ${projectName}`);
  await expect(page.getByRole('button', { name: 'Save nodes', exact: true })).toBeEnabled();
});

test('a route with a short name shows only the short name, and its full name is the selector title', async ({ page }) => {
  await seedCostingFixture(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.reload();
  const route = scopeBar(page).getByLabel('Route', { exact: true });
  await expect(route).toBeVisible();
  await expect(route.locator('option:checked')).toHaveText('31');
  await expect(route).toHaveAttribute('title', 'Federal Boulevard');
});
