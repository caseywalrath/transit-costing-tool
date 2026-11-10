// CM1 (Decision 0066 rules 1, 2, 3 and 8): context menus on Trips rows and on the table headings.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createShiftReadySchedule } from './support/tripsWorkspace';
import { runCommand, shiftBar } from './support/ui';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

const rows = (page: Page) => page.locator('.schedule-table tbody tr');
const rowMenus = (page: Page) => page.getByRole('menu', { name: / actions$/ });
const checkboxes = (page: Page) => rows(page).locator('td.trip-selection-column input[type="checkbox"]');

/** Dispatches a contextmenu event at `element` and reports whether the page prevented the default (the browser menu stays when false). */
function dispatchContextMenu(element: Locator, shiftKey: boolean) {
  return element.evaluate((node, shift) => new Promise<boolean>((resolve) => {
    document.addEventListener('contextmenu', (event) => resolve(event.defaultPrevented), { once: true });
    node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: shift, button: 2 }));
  }), shiftKey);
}

test('right-clicking an unselected row opens its menu named for the row and leaves the selection unchanged', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await expect(rows(page)).toHaveCount(3);
  await rows(page).nth(1).locator('.trip-run-time-column').click({ button: 'right' });
  const menu = rowMenus(page);
  await expect(menu).toHaveCount(1);
  await expect(menu).toBeVisible();
  // The heading names the row (pattern and departure), so it is not the selection heading.
  const heading = (await menu.locator('.action-menu-heading').textContent())!.trim();
  expect(heading).toMatch(/\d:\d\d/);
  await expect(menu).toHaveAccessibleName(`${heading} actions`);
  await expect(menu.getByRole('menuitem', { name: 'Add to selection', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete trip…', exact: true })).toBeVisible();
  // Opening the menu does not select the row.
  for (let index = 0; index < 3; index += 1) await expect(checkboxes(page).nth(index)).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('right-clicking a selected row acts on the selection, and Delete… opens the two-trip deletion dialog', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await checkboxes(page).nth(0).check();
  await checkboxes(page).nth(1).check();
  await rows(page).nth(1).locator('.trip-run-time-column').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: '2 selected trips actions', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.locator('.action-menu-heading')).toHaveText('2 selected trips');
  await expect(menu.getByRole('menuitem', { name: 'Clear selection', exact: true })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Delete…', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete 2 trips?', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('Shift+F10 on a row checkbox opens the row menu, and Escape returns focus to that checkbox', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const checkbox = checkboxes(page).nth(0);
  await checkbox.focus();
  await expect(checkbox).toBeFocused();
  await page.keyboard.press('Shift+F10');
  const menu = rowMenus(page);
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(checkbox).toBeFocused();
});

test('right-clicking the table headings opens the heading menu, and Show headways adds the Departs column', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await expect(page.locator('.schedule-table thead th', { hasText: 'Departs' })).toHaveCount(0);
  await page.locator('.schedule-table thead th', { hasText: 'Run time' }).first().click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Trips table actions', exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitemcheckbox', { name: 'Show headways', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('.schedule-table thead th', { hasText: 'Departs' }).first()).toBeVisible();
});

test('Shift+right-clicking a row keeps the browser menu and opens no app menu', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const row = rows(page).nth(1);
  expect(await dispatchContextMenu(row, true)).toBe(false);
  await expect(rowMenus(page)).toHaveCount(0);
});

test('with a staged shift, right-clicking a row opens no app menu', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await checkboxes(page).nth(0).check();
  await runCommand(page, 'trips.shift');
  await expect(shiftBar(page)).toBeVisible();
  const row = rows(page).nth(1);
  await row.locator('.trip-run-time-column').click({ button: 'right' });
  await expect(rowMenus(page)).toHaveCount(0);
  expect(await dispatchContextMenu(row, false)).toBe(false);
  await expect(rowMenus(page)).toHaveCount(0);
});
