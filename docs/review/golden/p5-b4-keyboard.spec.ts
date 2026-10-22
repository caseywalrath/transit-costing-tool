// Backs B4 findings (Plan 5.3/5.4). Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config <copy of p4-playwright.config.ts with testMatch 'p5-b4-*.spec.ts' and port 4194> from the repo root.
// Defect tests assert the EXPECTED behaviour and are marked test.fail(), so they report as passing while the defect exists.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(120000);
test.use({ actionTimeout: 10000 });

async function importGolden(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'golden.json', mimeType: 'application/json', buffer: fs.readFileSync(path.resolve(process.cwd(), 'output/federal-brt-import/federal-brt-project-backup.json')) });
  await expect(page.getByRole('heading', { name: 'Nodes' })).toBeVisible({ timeout: 30000 });
}
const active = (page: Page) => page.evaluate(() => document.activeElement === document.body ? 'BODY' : `${document.activeElement?.tagName}:${document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim().slice(0, 30)}`);
async function openMenuItemByKeyboard(page: Page, trigger: ReturnType<Page['locator']>, label: string) {
  await trigger.focus(); await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 40; i++) { const t = (await page.evaluate(() => document.activeElement?.textContent ?? '')).replace('✓', '').trim(); if (t.startsWith(label)) break; await page.keyboard.press('ArrowDown'); }
  await page.keyboard.press('Enter'); await page.waitForTimeout(600);
}

// B4-01: a dialog opened from a MenuButton item (restoreFocus default true, src/ui/MenuButton.tsx:45) loses its autoFocus to the trigger, so Escape does nothing and focus is lost to BODY on close.
test.fail('B4-01 name dialog opened from a menu by keyboard takes focus, closes on Escape and returns focus to the invoker', async ({ page }) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Project actions', exact: true });
  await openMenuItemByKeyboard(page, trigger, 'New project');
  const dialog = page.getByRole('dialog', { name: 'New Project' });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

// B4-02: no modal dialog traps Tab although every one declares aria-modal="true" (no Tab handling or inert in src/ui).
test.fail('B4-02 Tab stays inside an open modal dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New project', exact: true }).click();
  await page.locator('#dialog-name').fill('Trap check');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await expect(page.locator('.context-bar select').first().locator('option:checked')).toHaveText('Trap check');
  await page.getByRole('button', { name: 'Project actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete project', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `Tab press ${i + 1} left the dialog; focus on ${await active(page)}`).toBe(true);
  }
});

// B4-03: the runtime-profile name dialog (src/ui/App.tsx:1609) has no accessible name and no Escape handler.
test.fail('B4-03 runtime profile dialog has an accessible name and closes on Escape', async ({ page }) => {
  await importGolden(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).first().click();
  await page.locator('button[aria-haspopup=menu]').filter({ hasText: 'Weekday workbook' }).first().click();
  await page.getByRole('menuitem', { name: 'Rename profile…' }).click();
  await expect(page.getByRole('dialog', { name: /.+/ })).toHaveCount(1);
  await page.locator('[role=dialog] input').first().focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
});

// B4-04: DeleteTripsDialog, DeleteRuntimeProfileDialog, RouteEditImpactDialog and Blocking confirm/notes/layover/activity/reassign dialogs have no Escape handler (src/ui/App.tsx:1611; BlockingWorkspace.tsx:398-423). Delete trips shown here.
test.fail('B4-04 Delete trips alertdialog closes on Escape', async ({ page }) => {
  await importGolden(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).first().click();
  await page.locator('table input[type=checkbox]').nth(1).check();
  await page.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete selected…' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

// B4-05: pressing Back/Forward/Undo/Redo in the Shift drawer disables the pressed button while busy, so focus drops to BODY (src/ui/App.tsx:1221).
test.fail('B4-05 keyboard focus stays in the Shift drawer after + Forward', async ({ page }) => {
  await importGolden(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).first().click();
  await page.locator('table input[type=checkbox]').nth(1).check();
  await page.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Shift selected…' }).click();
  const forward = page.getByRole('button', { name: '+ Forward' });
  await forward.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  expect(await page.evaluate(() => !!document.activeElement?.closest('aside.shift-drawer'))).toBe(true);
});

// B4-06: after confirming a Block pill assignment, the list reload leaves focus on BODY although Decision 0025 item 9 requires focus to return to the invoking control (src/ui/App.tsx:915-960).
test.fail('B4-06 focus returns to the Block pill after confirming an assignment', async ({ page }) => {
  await importGolden(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).first().click();
  const pill = page.locator('button[aria-haspopup=menu][aria-label^="Block assignment"]').nth(3);
  await openMenuItemByKeyboard(page, pill, '13');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /Move Trip|Assign Trip/ }).focus(); await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(2000);
  expect(await active(page)).not.toBe('BODY');
});

// B4-07: clearing Discard/Save (runtime editor) or Discard changes (Node draft) removes the focused button, so focus drops to BODY.
test.fail('B4-07 focus is not lost to BODY after Discard in the Runtime editor', async ({ page }) => {
  await importGolden(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).first().click();
  await page.getByRole('button', { name: 'Runtime actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add Time Band' }).click();
  const discard = page.getByRole('button', { name: 'Discard', exact: true }).first();
  await discard.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  expect(await active(page)).not.toBe('BODY');
});

// B4-08: document shell: index.html has no doctype (quirks mode), no lang, no title (axe: html-has-lang, document-title).
test.fail('B4-08 index.html declares doctype, lang and title', async ({ page }) => {
  await page.goto('/');
  const shell = await page.evaluate(() => ({ compat: document.compatMode, lang: document.documentElement.lang, title: document.title }));
  expect(shell.compat).toBe('CSS1Compat');
  expect(shell.lang).not.toBe('');
  expect(shell.title).not.toBe('');
});

// B4-09: inputs with visible validation errors expose no aria-invalid (Field helper, src/ui/App.tsx:1772; Build Trips drawer; runtime dialog; Costing assumptions).
test.fail('B4-09 Route name input is aria-invalid when its required-field error shows', async ({ page }) => {
  await importGolden(page);
  const name = page.getByLabel('Route name');
  await name.fill(''); await name.blur();
  await expect(page.locator('.field-error').first()).toBeVisible();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
});
