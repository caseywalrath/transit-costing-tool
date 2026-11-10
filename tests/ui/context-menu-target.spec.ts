// Context menus on elements that are not menu items (Decision 0066, CM0). The Shift rule applies to menu items too (rule 3), so it is
// checked here on the project switcher. The row cases (fields, selected text, Shift+F10 focus return) run against a Trips row in CM1.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { seedSnapshot } from './support/dexieEnv';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { projectSwitcher } from './support/ui';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

async function openGolden(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
}

test('Shift+right-click on a project item keeps the browser menu and opens no app menu', async ({ page }) => {
  await openGolden(page);
  const name = (await projectSwitcher(page).getAttribute('aria-label'))!.replace(/^Project: /, '');
  await projectSwitcher(page).click();
  const item = page.getByRole('menu', { name: 'Project actions', exact: true }).getByRole('menuitemradio', { name, exact: true });
  const prevented = await item.evaluate((element) => new Promise<boolean>((resolve) => {
    document.addEventListener('contextmenu', (event) => resolve(event.defaultPrevented), { once: true });
    element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true, button: 2 }));
  }));
  expect(prevented).toBe(false);
  await expect(page.getByRole('menu', { name: `${name} actions`, exact: true })).toHaveCount(0);
  // Without Shift the same item opens its context menu.
  await item.click({ button: 'right' });
  await expect(page.getByRole('menu', { name: `${name} actions`, exact: true })).toBeVisible();
});

// CM1 extends the row cases (CM0 step 7) against a Trips row.
async function openTripsRows(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createShiftReadySchedule(page, '06:20');
  await expect(page.locator('.schedule-table tbody tr')).toHaveCount(3);
}

test('choosing a row menu item calls its action once: Add to selection checks exactly that row', async ({ page }) => {
  await openTripsRows(page);
  const rows = page.locator('.schedule-table tbody tr');
  const checkboxes = page.locator('.schedule-table tbody tr td.trip-selection-column input[type="checkbox"]');
  await rows.nth(1).locator('.trip-run-time-column').click({ button: 'right' });
  const menu = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: 'Add to selection', exact: true }) });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Add to selection', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(checkboxes.nth(1)).toBeChecked();
  await expect(checkboxes.nth(0)).not.toBeChecked();
  await expect(checkboxes.nth(2)).not.toBeChecked();
  await expect(page.locator('.schedule-table tbody tr.trip-row-selected')).toHaveCount(1);
});

test('right-click on an input inside a Trips row keeps the browser menu and opens no app menu', async ({ page }) => {
  await openTripsRows(page);
  const startEdit = page.locator('.schedule-table tbody tr').nth(1).locator('button.trip-start-edit').first();
  await startEdit.focus();
  await page.keyboard.press('F2');
  const input = page.locator('input.trip-start-input');
  await expect(input).toBeVisible();
  await input.click({ button: 'right' });
  await expect(page.getByRole('menu', { name: /actions$/ })).toHaveCount(0);
  await expect(input).toBeVisible();
});

test('right-click with text selected inside a Trips row opens no app menu', async ({ page }) => {
  await openTripsRows(page);
  const cell = page.locator('.schedule-table tbody tr').nth(1).locator('.trip-run-time-column');
  // Select the cell's text with a Range, as a planner would drag across it.
  const selected = await cell.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return !selection.isCollapsed && selection.toString().length > 0;
  });
  expect(selected).toBe(true);
  await cell.click({ button: 'right' });
  await expect(page.getByRole('menu', { name: /actions$/ })).toHaveCount(0);
});
