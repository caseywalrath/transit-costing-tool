// UR-7b: the Nodes table (Name, Short, Notes) and the Pattern points' Cumulative mi are spreadsheet grids (useGridNavigation). Type and the
// points' Node stay selects, reached with Tab. Service-day count fields stay ordinary inputs that save on commit and show "Saved".
import { expect, test, type Page } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { gridCell } from './support/ui';

test.setTimeout(120_000);

const focusedCell = (page: Page) => page.evaluate(() => document.activeElement?.closest('[data-cell]')?.getAttribute('data-cell') ?? document.activeElement?.getAttribute('aria-label') ?? '');
const nodes = (page: Page) => page.getByRole('grid', { name: 'Nodes' });
const saveBar = (page: Page) => page.getByRole('button', { name: 'Save nodes', exact: true });

test('Nodes: arrows, Enter edit, Tab through the Type select, edited marks, and the save bar count', async ({ page }) => {
  await createRouteWithPattern(page, 'Nodes grid');
  await expect(gridCell(page, 'Node name')).toHaveCount(2);
  // Nodes created in the same instant have no fixed order, so the test reads the order it was given.
  const [firstName, secondName] = await gridCell(page, 'Node name').allTextContents();
  expect([firstName, secondName].sort()).toEqual(['A', 'B']);
  await expect(nodes(page).locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);

  await gridCell(page, 'Node name').first().click();
  await page.keyboard.press('ArrowDown');
  expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(secondName);
  await page.keyboard.press('ArrowRight');
  expect(await focusedCell(page)).toBe('Node short name');
  // Tab moves to the Type select, then to Notes; Shift+Tab goes back.
  await page.keyboard.press('Tab');
  expect(await focusedCell(page)).toBe('Node type');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SELECT');
  await page.keyboard.press('Tab');
  expect(await focusedCell(page)).toBe('Node notes');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('SELECT');
  await gridCell(page, 'Node name').nth(1).click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('B2');
  await page.keyboard.press('Enter');
  await expect(gridCell(page, 'Node name').nth(1)).toHaveText('B2');
  await expect(gridCell(page, 'Node name').nth(1)).toHaveClass(/grid-cell--edited/);
  await expect(page.getByRole('region', { name: 'Unsaved changes' }).first()).toContainText('1 unsaved change in Nodes');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(saveBar(page)).toBeVisible();

  // Backspace edits empty and a short name commits to the stored Node.
  await gridCell(page, 'Node short name').first().click();
  await page.keyboard.type('AA');
  await page.keyboard.press('Tab');
  await expect(gridCell(page, 'Node short name').first()).toHaveText('AA');
  await expect(page.getByRole('region', { name: 'Unsaved changes' }).first()).toContainText('2 unsaved changes in Nodes');
});

test('Nodes: New node focuses its Name cell, and Escape cancels an edit', async ({ page }) => {
  await createRouteWithPattern(page, 'Nodes grid new');
  await page.getByRole('button', { name: 'New node', exact: true }).click();
  await expect(gridCell(page, 'Node name').last()).toBeFocused();
  await expect(gridCell(page, 'Node name').last()).toHaveText('Enter node name');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Temp');
  await page.keyboard.press('Escape');
  await expect(gridCell(page, 'Node name').last()).toHaveText('Enter node name');
});

test('Pattern points: Cumulative mi edits with a parser message, and Tab reaches the Node select', async ({ page }) => {
  await createRouteWithPattern(page, 'Points grid');
  const points = page.getByRole('grid', { name: 'Pattern points' });
  const distance = gridCell(page, 'Point 2 cumulative miles');
  await distance.click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await expect(page.locator('.grid-message').last()).toHaveText('Enter a non-negative number.');
  await expect(distance.locator('input')).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('4.5');
  await page.keyboard.press('Enter');
  await expect(distance).toHaveText('4.5');
  await expect(distance).toHaveClass(/grid-cell--edited/);
  await expect(points.locator('tbody tr output').nth(1)).toHaveText('4.50');
  // Shift+Tab from Cumulative mi reaches the Node select of the same point.
  await distance.click();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Point 2 node');
});

test('a Service day count shows "Saved" after a committed change', async ({ page }) => {
  await createRouteWithPattern(page, 'Saved note');
  const weekday = page.locator('input[type="number"]').first();
  const original = Number(await weekday.inputValue());
  await weekday.fill(String(original === 254 ? 253 : 254));
  await weekday.press('Enter');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0, { timeout: 5000 });
});
