// Context menus on elements that are not menu items (Decision 0066, CM0). The Shift rule applies to menu items too (rule 3), so it is
// checked here on the project switcher. The row cases (fields, selected text, Shift+F10 focus return) run against a Trips row in CM1.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { seedSnapshot } from './support/dexieEnv';
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
