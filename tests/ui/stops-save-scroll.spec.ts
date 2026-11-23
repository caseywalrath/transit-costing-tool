// Saving the Stops drawer keeps the page behind it where it was, and moves focus to the drawer's Close button (the Save button, which held
// focus, is gone after a save). Real IndexedDB.
import { expect, test } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { runInPage } from './support/dexieEnv';

test.setTimeout(120_000);

test('saving stops keeps the page scrolled, with focus on Close', async ({ page }) => {
  await createRouteWithPattern(page, 'Scroll after save');
  await runInPage(page, `
    const [pattern] = await e.db.patterns.toArray();
    const now = new Date().toISOString();
    const copies = Array.from({ length: 14 }, (_, index) => ({ ...pattern, id: crypto.randomUUID(), name: 'Copy ' + String(index + 1).padStart(2, '0'), points: pattern.points.map((point) => ({ ...point, id: crypto.randomUUID() })), createdAt: now, updatedAt: now }));
    await e.repository.updateScenarioRecords(pattern.scenarioId, (current) => ({ ...current, patterns: [...current.patterns, ...copies] }));
  `);
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.getByRole('complementary', { name: 'Patterns' }).getByRole('button', { name: /^Copy 14/ }).click();
  await page.getByRole('button', { name: 'Pattern actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stops…', exact: true }).click();
  const drawer = page.getByRole('complementary', { name: /^Stops/ });
  await expect(drawer.getByRole('table')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(500);

  await drawer.getByRole('button', { name: /^Add stop between/ }).first().click();
  await drawer.getByPlaceholder('Stop name').first().fill('Saved stop');
  await drawer.getByRole('button', { name: 'Save stops', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Save stops', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Close Stops drawer' })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});
