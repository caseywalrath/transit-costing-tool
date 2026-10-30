// The row whose ↑/↓ button was pressed last stays shaded, in the Pattern points table and in the Blocking trips table.
import { expect, test } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { seedSnapshot } from './support/dexieEnv';
import { createRouteWithPattern } from './support/tripsWorkspace';

test.setTimeout(120_000);
test.use({ actionTimeout: 15_000 });

test('a pattern point moved with the arrows stays marked at its new place', async ({ page }) => {
  await createRouteWithPattern(page, 'Moved marker');
  const points = page.getByRole('grid', { name: 'Pattern points' });
  const rows = points.locator('tbody tr');
  await expect(points.locator('.row-moved')).toHaveCount(0);

  const firstNode = await rows.nth(0).getByLabel('Point 1 node').inputValue();
  await rows.nth(0).getByRole('button', { name: 'Move point down' }).click();
  await expect(rows.nth(1)).toHaveClass(/row-moved/);
  await expect(rows.nth(1).getByLabel('Point 2 node')).toHaveValue(firstNode);
  await expect(points.locator('.row-moved')).toHaveCount(1);

  // Moving another point moves the marker with it.
  await rows.nth(1).getByRole('button', { name: 'Move point up' }).click();
  await expect(rows.nth(0)).toHaveClass(/row-moved/);
  await expect(points.locator('.row-moved')).toHaveCount(1);
});

test('a trip moved with the arrows stays marked at its new place', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const block = page.getByLabel('Current block');
  await page.getByLabel('Blocks', { exact: true }).locator('.link-button').filter({ hasText: /^26$/ }).click();
  await expect(block.locator('.row-moved')).toHaveCount(0);

  await block.getByRole('button', { name: 'Move trip 1 down', exact: true }).click();
  const marked = block.locator('tr.row-moved');
  await expect(marked).toHaveCount(1);
  await expect(marked.locator('.blocking-index-column')).toHaveText('2');
});
