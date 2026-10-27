// Review package U04 (issues I-036, I-037, I-086, I-090; findings 5-010, 5-012, 5-018, 5-023). Ported from the review's B4 keyboard and
// accessibility reproductions: every modal dialog traps Tab, closes on Escape, has a name, and returns focus; focus is not lost after
// common actions; menus use the right roles and close on Tab; invalid fields say so; each workspace has one h1 and no nested main.
// The axe scan runs the dialog-name, label, landmark, and heading rules against each screen and the open dialogs.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { createRouteWithPattern, createShiftReadySchedule, openGoldenTrips } from './support/tripsWorkspace';
import { editGridCell, gridCell, openRuntimes, projectSwitcher, runCommand, scopeField } from './support/ui';

test.setTimeout(150_000);
test.use({ actionTimeout: 15_000 });

const AXE_SOURCE = readFileSync(fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url)), 'utf8');
const AXE_RULES = ['aria-dialog-name', 'label', 'landmark-one-main', 'landmark-no-duplicate-main', 'landmark-main-is-top-level', 'landmark-unique', 'page-has-heading-one', 'aria-allowed-role', 'html-has-lang', 'document-title', 'scope-attr-valid'];

async function axeViolations(page: Page, context?: string): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async ({ rules, context }) => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: unknown[] }> }> }> } }).axe;
    const result = await axe.run(context ? document.querySelector(context)! : document, { runOnly: { type: 'rule', values: rules } });
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`);
  }, { rules: AXE_RULES, context });
}

const active = (page: Page) => page.evaluate(() => document.activeElement === document.body ? 'BODY' : `${document.activeElement?.tagName}:${document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim().slice(0, 40)}`);
const insideDialog = (dialog: Locator) => dialog.evaluate((element) => element.contains(document.activeElement));

async function openGolden(page: Page) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
}

/** Opens the menu with the keyboard and activates the first item whose text starts with `label`. */
async function chooseByKeyboard(page: Page, trigger: Locator, label: string) {
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  for (let step = 0; step < 40; step++) {
    const text = (await page.evaluate(() => document.activeElement?.textContent ?? '')).replace('✓', '').trim();
    if (text.startsWith(label)) break;
    await page.keyboard.press('ArrowDown');
  }
  await page.keyboard.press('Enter');
}

test('a name dialog opened from a menu by keyboard takes focus, closes on Escape, and returns focus to the invoker', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /^Project: / });
  await chooseByKeyboard(page, trigger, 'New project…');
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('a menu item that opens a dialog does not refocus the menu trigger, also with the mouse', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Project: / }).click();
  // Count the times the trigger receives focus from here on: opening a dialog must not give it any.
  await page.evaluate(() => { const trigger = document.querySelector<HTMLElement>('button[aria-label^="Project: "]')!; (window as unknown as { triggerFocusCount: number }).triggerFocusCount = 0; trigger.addEventListener('focus', () => { (window as unknown as { triggerFocusCount: number }).triggerFocusCount += 1; }); });
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(250);
  expect(await insideDialog(dialog)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { triggerFocusCount: number }).triggerFocusCount)).toBe(0);
  await expect(dialog.getByLabel('Name')).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Project: / })).toBeFocused();
});

test('Tab and Shift+Tab stay inside an open modal dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
  await page.locator('#dialog-name').fill('Trap check');
  await page.getByRole('button', { name: 'New project', exact: true }).last().click();
  await expect(projectSwitcher(page)).toHaveAccessibleName('Project: Trap check');
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'Delete project…', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  for (let press = 0; press < 8; press++) {
    await page.keyboard.press('Tab');
    expect(await insideDialog(dialog), `Tab press ${press + 1} left the dialog; focus on ${await active(page)}`).toBe(true);
  }
  for (let press = 0; press < 8; press++) {
    await page.keyboard.press('Shift+Tab');
    expect(await insideDialog(dialog), `Shift+Tab press ${press + 1} left the dialog; focus on ${await active(page)}`).toBe(true);
  }
  // Focus that escapes by other means (a click on the page behind) is pulled back.
  await page.mouse.click(5, 5);
  await page.keyboard.press('Tab');
  expect(await insideDialog(dialog)).toBe(true);
});

test('the Runtime profile dialog has an accessible name and closes on Escape', async ({ page }) => {
  await openGoldenTrips(page);
  await openRuntimes(page);
  await page.locator('[aria-label="Runtimes section"] .menu-field').filter({ hasText: 'Profile' }).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Rename profile…' }).click();
  const dialog = page.getByRole('dialog', { name: /runtime profile/i });
  await expect(dialog).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
});

test('Delete trips closes on Escape and returns focus to the Delete button, and a confirmed delete moves it to Trip actions', async ({ page }) => {
  await openGoldenTrips(page);
  await page.locator('.trips-workspace .schedule-table tbody input[type=checkbox]').first().check();
  const deleteSelected = page.getByRole('button', { name: 'Delete…', exact: true });
  await deleteSelected.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(deleteSelected).toBeFocused();

  // Confirming a delete clears the selection, which removes the selection bar, so the focus moves to the Trip actions menu.
  await deleteSelected.click();
  await dialog.getByRole('button', { name: /^Delete/ }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => active(page)).not.toBe('BODY');
  await expect(page.getByRole('button', { name: 'Trip actions', exact: true })).toBeFocused();
});

test('every dialog opened from the screens has an accessible name, and the axe dialog, label, landmark, and heading rules pass on each screen', async ({ page }) => {
  await openGolden(page);
  expect(await axeViolations(page)).toEqual([]);

  // Dialogs: New project (name dialog), Delete project (alertdialog), Rename profile (Trips), Delete selected (Trips).
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'Rename project…', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'Delete project…', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await scopeField(page, 'Day').selectOption({ label: 'Weekday' });
  await expect(page.locator('.trips-workspace .schedule-table tbody tr').first()).toBeVisible({ timeout: 30_000 });
  expect(await axeViolations(page)).toEqual([]);
  await openRuntimes(page);
  expect(await axeViolations(page)).toEqual([]);
  await page.locator('[aria-label="Runtimes section"] .menu-field').filter({ hasText: 'Profile' }).getByRole('button').click();
  await page.getByRole('menuitem', { name: 'Rename profile…' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.trips-workspace .schedule-table tbody input[type=checkbox]').first().check();
  expect(await axeViolations(page)).toEqual([]);
  await runCommand(page, 'trips.delete');
  await expect(page.getByRole('alertdialog')).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Scope' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Costing Assumptions' })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test('Shift drawer steps keep keyboard focus inside the drawer', async ({ page }) => {
  await openGoldenTrips(page);
  await page.locator('.trips-workspace .schedule-table tbody input[type=checkbox]').first().check();
  await runCommand(page, 'trips.shift');
  const drawer = page.getByRole('complementary', { name: 'Shift selected trips' });
  const forward = drawer.getByRole('button', { name: /min later/ });
  await forward.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Staged 1 minute later/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('aside.shift-drawer'))).toBe(true);
  await expect(forward).toBeFocused();
  const undo = drawer.getByRole('button', { name: 'Undo', exact: true });
  await undo.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('aside.shift-drawer'))).toBe(true);
});

test('focus returns to the Block pill after confirming an assignment, and to Trip actions after an Unassign', async ({ page }) => {
  await openGoldenTrips(page);
  const pill = page.locator('button[aria-haspopup=menu][aria-label^="Block assignment"]').nth(3);
  await chooseByKeyboard(page, pill, '13');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Move trip|Assign trip/ }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => active(page), { timeout: 10_000 }).not.toBe('BODY');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toMatch(/^Block assignment/);

  await page.locator('.trips-workspace .schedule-table tbody input[type=checkbox]').first().check();
  await runCommand(page, 'trips.unassignBlock');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Unassign/ }).last().click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => active(page), { timeout: 10_000 }).not.toBe('BODY');
});

test('focus is not lost after Discard in the Runtime editor or in the Node editor', async ({ page }) => {
  await openGoldenTrips(page);
  await openRuntimes(page);
  const runtimeActions = page.getByRole('button', { name: 'Runtime actions', exact: true });
  await runCommand(page, 'runtime.addBand');
  const discard = page.locator('[aria-label="Runtimes section"]').getByRole('button', { name: 'Discard', exact: true });
  await discard.focus();
  await page.keyboard.press('Enter');
  await expect(discard).toHaveCount(0);
  await expect.poll(() => active(page)).not.toBe('BODY');
  await expect(runtimeActions).toBeFocused();

  await page.getByRole('button', { name: 'Route', exact: true }).click();
  await editGridCell(gridCell(page, 'Node name').first(), 'Edited node name');
  const discardNodes = page.getByRole('button', { name: 'Discard', exact: true }).first();
  await discardNodes.focus();
  await page.keyboard.press('Enter');
  // The save bar goes away with the draft, and the focus lands on the button that starts the next entry.
  await expect(discardNodes).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New node', exact: true })).toBeFocused();
});

test('Escape returns focus to the menu trigger at once, so the next control focused keeps its focus', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  await openRuntimes(page);
  const runtimeActions = page.getByRole('button', { name: 'Runtime actions', exact: true });
  await runtimeActions.click();
  await expect(page.getByRole('menu', { name: 'Runtime actions' })).toBeVisible();
  // Inside one task: close the menu with Escape, then move focus to another control. A deferred refocus of the trigger would win.
  const focus = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>('button[aria-label="Runtime actions"]')!;
    const other = document.querySelector<HTMLElement>('button[aria-label="Trip actions"]')!;
    document.querySelector('[role="menu"] [role^="menuitem"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const atOnce = document.activeElement === trigger;
    other.focus();
    return new Promise<{ atOnce: boolean; later: string }>((resolve) => window.setTimeout(() => resolve({ atOnce, later: document.activeElement?.getAttribute('aria-label') ?? '' }), 100));
  });
  expect(focus).toEqual({ atOnce: true, later: 'Trip actions' });
});

test('independent View toggles are menu item checkboxes, and Tab closes an open menu', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  await openRuntimes(page);
  const actions = page.getByRole('button', { name: 'View', exact: true });
  await actions.click();
  const menu = page.getByRole('menu', { name: 'View' });
  for (const name of ['Show runtime bands', 'Show headways', 'Round displayed times']) {
    await expect(menu.getByRole('menuitemcheckbox', { name })).toHaveAttribute('aria-checked', /true|false/);
    await expect(menu.getByRole('menuitemradio', { name })).toHaveCount(0);
  }
  // A choice among profiles stays a radio.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Runtime actions', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Runtime actions' }).getByRole('menuitemradio', { name: 'Band at segment start' })).toBeVisible();
  await page.keyboard.press('Escape');

  await actions.focus();
  await page.keyboard.press('ArrowDown');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
  expect(await active(page)).not.toBe('BODY');
});

test('fields with an error are marked invalid and point at the message', async ({ page }) => {
  await openGolden(page);
  const name = page.getByLabel('Route name');
  await name.fill('');
  await name.blur();
  await expect(page.locator('.field-error').first()).toBeVisible();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await name.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`[id="${describedBy}"]`)).toHaveText(/route name/i);
  await name.fill('Federal BRT');
  await name.blur();
  await expect(name).not.toHaveAttribute('aria-invalid', 'true');
});

test('Build Trips marks the fields it cannot use, and the Runtime profile dialog marks its Name', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  await runCommand(page, 'trips.build');
  const drawer = page.getByRole('complementary', { name: 'Build trips' });
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer.getByRole('alert')).toBeVisible();
  for (const label of ['Pattern', 'First trip', 'Headway']) await expect(drawer.getByLabel(label)).toHaveAttribute('aria-invalid', 'true');
  await expect(drawer.getByLabel('First trip')).toHaveAttribute('aria-describedby', 'build-trips-error');
  await drawer.getByLabel('First trip').fill('7:00');
  await drawer.getByLabel('Headway').fill('10');
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  // Neither Number of Trips nor Last Trip is entered: both are marked, the fields that are fine are not.
  await expect(drawer.getByLabel('Number of trips')).toHaveAttribute('aria-invalid', 'true');
  await expect(drawer.getByLabel('Last trip')).toHaveAttribute('aria-invalid', 'true');
  await expect(drawer.getByLabel('First trip')).toHaveAttribute('aria-invalid', 'false');
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();

  const profile = page.locator('[aria-label="Runtimes section"] .menu-field').filter({ hasText: 'Profile' }).getByRole('button');
  await profile.click();
  await page.getByRole('menuitem', { name: 'Rename profile…' }).click();
  const dialog = page.getByRole('dialog', { name: /runtime profile/i });
  await dialog.getByLabel('Name').fill('');
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(dialog.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByLabel('Name')).toHaveAttribute('aria-describedby', 'runtime-profile-dialog-error');
});

test('Costing assumptions mark the inputs a finding names', async ({ page }) => {
  await openGolden(page);
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  const rateYear = page.getByLabel('Rate year');
  await expect(rateYear).toBeVisible();
  await expect(rateYear).not.toHaveAttribute('aria-invalid', 'true');
  await rateYear.fill('2999');
  await expect(rateYear).toHaveAttribute('aria-invalid', 'true');
  await expect(rateYear).toHaveAttribute('aria-describedby', 'costing-assumptions-alert');
  await expect(page.locator('#costing-assumptions-alert')).toBeVisible();
});

test('each workspace has one h1, there is one main landmark, the file input is labelled, and table headers have a scope', async ({ page }) => {
  await openGolden(page);
  const checks = async (workspaceHeading: RegExp, loaded: Locator) => {
    await expect(loaded.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: workspaceHeading })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    expect(await page.locator('th:not([scope])').count()).toBe(0);
  };
  await checks(/Route definition/, page.locator('.route-workspace table tbody tr'));
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await checks(/Trips and runtimes/, page.locator('.trips-workspace .schedule-table tbody tr'));
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await checks(/^Blocking$/, page.getByLabel('Current block').locator('tbody tr'));
  await page.getByRole('button', { name: 'Costing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Costing Assumptions' })).toBeVisible();
  await checks(/Cost estimate/, page.getByRole('region', { name: 'Scope' }));
  await expect(page.locator('input[type=file]').first()).toHaveAccessibleName('Restore project JSON file');
  for (const input of await page.locator('input[type=file]').all()) await expect(input).toHaveAttribute('tabindex', '-1');
  void runInPage; void createRouteWithPattern;
});
