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
  // F4-A: two decimals at rest; the full value returns while editing.
  await expect(distance).toHaveText('4.50');
  await expect(distance).toHaveClass(/grid-cell--edited/);
  await expect(points.locator('tbody tr output').nth(1)).toHaveText('4.50');
  // Shift+Tab from Cumulative mi reaches the Node select of the same point.
  await distance.click();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Point 2 node');
});

// UR-14: Tab runs through a row's cells, then the row's action buttons, then the first cell of the next row; Shift+Tab is the reverse.
test('Nodes and Pattern points: Tab wraps from the end of a row to the start of the next row', async ({ page }) => {
  await createRouteWithPattern(page, 'Grid tab wrap');
  const [firstName, secondName] = await gridCell(page, 'Node name').allTextContents();
  const focusedName = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.closest('[data-cell]')?.getAttribute('data-cell') ?? '');
  const focusedText = () => page.evaluate(() => document.activeElement?.textContent ?? '');

  await gridCell(page, 'Node notes').first().click();
  await page.keyboard.press('Tab');
  expect(await focusedName()).toBe(`Remove ${firstName}`);
  await page.keyboard.press('Tab');
  expect(await focusedText()).toBe(secondName);
  expect(await focusedCell(page)).toBe('Node name');
  await page.keyboard.press('Shift+Tab');
  expect(await focusedName()).toBe(`Remove ${firstName}`);
  await page.keyboard.press('Shift+Tab');
  expect(await focusedCell(page)).toBe('Node notes');
  // Tab that commits an edit in the row's last cell moves on the same way.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Note');
  await page.keyboard.press('Tab');
  await expect(gridCell(page, 'Node notes').first()).toHaveText('Note');
  expect(await focusedName()).toBe(`Remove ${firstName}`);

  // Pattern points: Node, Cumulative mi, the enabled Order button, Remove, then the next point's Node.
  await gridCell(page, 'Point 1 cumulative miles').click();
  await page.keyboard.press('Tab');
  expect(await focusedName()).toBe('Move point down');
  await page.keyboard.press('Tab');
  expect(await focusedName()).toBe('Remove point 1');
  await page.keyboard.press('Tab');
  expect(await focusedName()).toBe('Point 2 node');
  await page.keyboard.press('Shift+Tab');
  expect(await focusedName()).toBe('Remove point 1');
});

test('saving a Node does not leave an unsaved change in the Pattern', async ({ page }) => {
  await createRouteWithPattern(page, 'Node save keeps pattern');
  await gridCell(page, 'Node short name').first().click();
  await page.keyboard.type('AA');
  await page.keyboard.press('Enter');
  await saveBar(page).click();
  await expect(saveBar(page)).toHaveCount(0);
  await expect(gridCell(page, 'Node short name').first()).toHaveText('AA');
  // Before UR-14 the Node save rewrote the Pattern's save time, and the Pattern showed a save bar that could not be saved.
  await expect(page.getByRole('button', { name: 'Review and save', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Unsaved changes' })).toHaveCount(0);
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
