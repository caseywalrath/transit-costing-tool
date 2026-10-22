// Backs B4 findings (Plan 5.5). Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config <copy of p4-playwright.config.ts with testMatch 'p5-b4-*.spec.ts' and port 4194> from the repo root.
// Defect tests assert the EXPECTED behaviour (a guard or a kept draft) and are marked test.fail(), so they report as passing while the defect exists.
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test.setTimeout(120000);
test.use({ actionTimeout: 10000 });

async function importGolden(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'golden.json', mimeType: 'application/json', buffer: fs.readFileSync(path.resolve(process.cwd(), 'output/federal-brt-import/federal-brt-project-backup.json')) });
  await expect(page.getByRole('heading', { name: 'Nodes' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Trips', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Runtimes' })).toBeVisible();
}
const toolbar = (page: Page) => page.locator('.module-toolbar select');
const saveVisible = (page: Page) => page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Save' && (b as HTMLElement).offsetParent));

// B4-10: an unsaved Runtime editor draft is discarded without any prompt when Day changes (RuntimeProfileEditor useEffect resets the draft on profile change, src/ui/App.tsx:1695).
// Only Node/Pattern (ui-conventions.md:41) and staged Shift (ui-conventions.md:70) have guards. Measured: the same silent loss for Project, Scenario, Route, Direction, Runtime Profile, workspace tab and page reload.
test.fail('B4-10 Runtime editor draft survives or is guarded when Day changes', async ({ page }) => {
  await importGolden(page);
  await page.getByRole('button', { name: 'Runtime actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add Time Band' }).click();
  expect(await saveVisible(page)).toBe(true);
  await toolbar(page).nth(1).selectOption({ index: 1 });
  await page.waitForTimeout(1200);
  const guarded = (await page.locator('[role=alertdialog],[role=dialog]').count()) > 0;
  expect(guarded || (await saveVisible(page))).toBe(true);
});

// B4-11: an open Build Trips drawer with typed values closes silently when Day changes.
test.fail('B4-11 Build Trips drawer draft survives or is guarded when Day changes', async ({ page }) => {
  await importGolden(page);
  await page.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Build trips…' }).click();
  await page.getByLabel('First Trip').fill('5:00');
  await toolbar(page).nth(1).selectOption({ index: 1 });
  await page.waitForTimeout(1200);
  const guarded = (await page.locator('[role=alertdialog],[role=dialog]').count()) > 0;
  expect(guarded || (await page.locator('.build-trips-drawer').count()) > 0).toBe(true);
});

// B4-12: a staged Shift is guarded for Day/Route/Direction/Trip Profile/tab, but changing the Runtime Profile discards it silently.
test.fail('B4-12 staged Shift is guarded when the Runtime Profile changes', async ({ page }) => {
  await importGolden(page);
  await page.locator('table input[type=checkbox]').nth(1).check();
  await page.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Shift selected…' }).click();
  await page.getByRole('button', { name: '+ Forward' }).click();
  await expect(page.locator('.shift-drawer-summary')).toContainText('1 minute later');
  await page.locator('button[aria-haspopup=menu]').filter({ hasText: 'Weekday workbook' }).first().click();
  await page.getByRole('menuitemradio', { name: 'Saturday workbook runtimes' }).click();
  await page.waitForTimeout(1200);
  const guarded = (await page.locator('[role=alertdialog],[role=dialog]').count()) > 0;
  expect(guarded || (await page.getByRole('complementary', { name: 'Shift selected Trips' }).count()) > 0).toBe(true);
});

// B4-13: beforeunload protects only Node/Pattern drafts (src/ui/App.tsx:405-412); a dirty Runtime editor, staged Shift or Build Trips drawer reloads without a prompt.
test.fail('B4-13 reloading with a dirty Runtime editor raises the browser leave prompt', async ({ page }) => {
  await importGolden(page);
  await page.getByRole('button', { name: 'Runtime actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add Time Band' }).click();
  let prompted = false;
  page.on('dialog', async (dialog) => { if (dialog.type() === 'beforeunload') prompted = true; await dialog.accept(); });
  await page.evaluate(() => location.reload());
  await page.waitForTimeout(2000);
  expect(prompted).toBe(true);
});
