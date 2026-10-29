// UR-7: the Runtimes editor is a spreadsheet grid (useGridNavigation). The golden Weekday Southbound profile has 4 bands and 8 segments,
// so the grid has 4 rows and 10 columns: From, To, then segments 1 to 8.
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { openGoldenTrips } from './support/tripsWorkspace';
import { openRuntimes, region, runtimeCell } from './support/ui';

const runtimes = (page: Page) => region(page, 'runtimes');
const grid = (page: Page) => runtimes(page).getByRole('grid', { name: 'Runtimes' });
const cell = (page: Page, name: string) => runtimeCell(runtimes(page), name);
const field = (page: Page, name: string) => runtimes(page).getByRole('textbox', { name, exact: true });
const message = (page: Page) => runtimes(page).locator('.grid-message');
const saveBar = (page: Page) => runtimes(page).getByRole('region', { name: 'Unsaved changes' });
const focusedCell = (page: Page) => page.evaluate(() => document.activeElement?.getAttribute('data-cell') ?? document.activeElement?.getAttribute('aria-label') ?? '');
const storedSecondBand = (page: Page) => runInPage(page, "return (await e.db.runtimeProfiles.toArray()).filter((profile) => profile.bands.length === 4).map((profile) => profile.bands[1].segmentRuntimeSeconds[0]).sort().join(',')");

async function openGrid(page: Page) {
  await openGoldenTrips(page);
  await openRuntimes(page);
  await expect(cell(page, 'Time band 2 segment 1')).toHaveText(':06');
}

test('the grid has one tab stop and the arrow keys, Home, End, Tab, and Shift+Tab move between cells', async ({ page }) => {
  await openGrid(page);
  await expect(grid(page)).toBeVisible();
  await expect(grid(page).locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await cell(page, 'Time band 2 segment 1').click();
  expect(await focusedCell(page)).toBe('Time band 2 segment 1');
  await page.keyboard.press('ArrowRight');
  expect(await focusedCell(page)).toBe('Time band 2 segment 2');
  await page.keyboard.press('ArrowDown');
  expect(await focusedCell(page)).toBe('Time band 3 segment 2');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  expect(await focusedCell(page)).toBe('Time band 2 segment 1');
  await page.keyboard.press('Home');
  expect(await focusedCell(page)).toBe('Time band 2 start');
  await page.keyboard.press('End');
  expect(await focusedCell(page)).toBe('Time band 2 segment 8');
  // The roving tab stop follows the active cell.
  await expect(cell(page, 'Time band 2 segment 8')).toHaveAttribute('tabindex', '0');
  await expect(grid(page).locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  // Tab at the row's end moves to the row's Duplicate and Remove buttons, then to the next row's first cell (UR-14); Shift+Tab is the reverse.
  await page.keyboard.press('Tab');
  expect(await focusedCell(page)).toBe('Duplicate time band 2');
  await page.keyboard.press('Shift+Tab');
  expect(await focusedCell(page)).toBe('Time band 2 segment 8');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await focusedCell(page)).toBe('Remove time band 2');
  await page.keyboard.press('Tab');
  expect(await focusedCell(page)).toBe('Time band 3 start');
  await expect(grid(page).locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1);
  await cell(page, 'Time band 2 end').click();
  await page.keyboard.press('Shift+Tab');
  expect(await focusedCell(page)).toBe('Time band 2 start');
  await page.keyboard.press('Tab');
  expect(await focusedCell(page)).toBe('Time band 2 end');
  // Shift+Tab at the row's start leaves the cells, to the previous control in the page order (the row above's Remove button).
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+Tab');
  expect(await focusedCell(page)).toBe('Remove time band 1');
  await expect(field(page, 'Time band 2 start')).toHaveCount(0);
});

test('Enter edits with the text selected, Enter commits and moves down, Shift+Enter commits and moves up', async ({ page }) => {
  await openGrid(page);
  await cell(page, 'Time band 2 segment 1').click();
  await page.keyboard.press('Enter');
  await expect(field(page, 'Time band 2 segment 1')).toBeFocused();
  await expect(field(page, 'Time band 2 segment 1')).toHaveValue(':06');
  expect(await field(page, 'Time band 2 segment 1').evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, 3]);
  await page.keyboard.type(':10');
  await page.keyboard.press('Enter');
  await expect(cell(page, 'Time band 2 segment 1')).toHaveText(':10');
  await expect(cell(page, 'Time band 2 segment 1')).toHaveClass(/grid-cell--edited/);
  expect(await focusedCell(page)).toBe('Time band 3 segment 1');
  await expect(saveBar(page)).toContainText('1 unsaved change in Runtimes');

  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+A');
  await page.keyboard.type(':11');
  await page.keyboard.press('Shift+Enter');
  await expect(cell(page, 'Time band 3 segment 1')).toHaveText(':11');
  expect(await focusedCell(page)).toBe('Time band 2 segment 1');
  await expect(saveBar(page)).toContainText('2 unsaved changes in Runtimes');
  await expect(runtimes(page).locator('.grid-cell--edited')).toHaveCount(2);
});

test('F2, a printable key, Backspace, and Delete start editing; Escape cancels', async ({ page }) => {
  await openGrid(page);
  await cell(page, 'Time band 2 segment 1').click();
  await page.keyboard.press('F2');
  await expect(field(page, 'Time band 2 segment 1')).toHaveValue(':06');
  await page.keyboard.type('9');
  await page.keyboard.press('Escape');
  await expect(field(page, 'Time band 2 segment 1')).toHaveCount(0);
  await expect(cell(page, 'Time band 2 segment 1')).toHaveText(':06');
  expect(await focusedCell(page)).toBe('Time band 2 segment 1');

  await page.keyboard.press('8');
  await expect(field(page, 'Time band 2 segment 1')).toHaveValue('8');
  expect(await field(page, 'Time band 2 segment 1').evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([1, 1]);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Backspace');
  await expect(field(page, 'Time band 2 segment 1')).toHaveValue('');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await expect(field(page, 'Time band 2 segment 1')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(cell(page, 'Time band 2 segment 1')).toHaveText(':06');
  await expect(saveBar(page)).toHaveCount(0);

  // A double-click also starts editing.
  await cell(page, 'Time band 2 segment 2').dblclick();
  await expect(field(page, 'Time band 2 segment 2')).toBeFocused();
});

test('Tab and Shift+Tab commit and move across while editing', async ({ page }) => {
  await openGrid(page);
  await cell(page, 'Time band 2 segment 2').click();
  await page.keyboard.press('Enter');
  await page.keyboard.type(':04');
  await page.keyboard.press('Tab');
  await expect(cell(page, 'Time band 2 segment 2')).toHaveText(':04');
  expect(await focusedCell(page)).toBe('Time band 2 segment 3');
  await page.keyboard.press('Enter');
  await page.keyboard.type(':05');
  await page.keyboard.press('Shift+Tab');
  await expect(cell(page, 'Time band 2 segment 3')).toHaveText(':05');
  expect(await focusedCell(page)).toBe('Time band 2 segment 2');
});

test('an invalid entry stays in edit mode with the parser message; blur cancels it', async ({ page }) => {
  await openGrid(page);
  await cell(page, 'Time band 2 segment 1').click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await expect(field(page, 'Time band 2 segment 1')).toBeFocused();
  await expect(field(page, 'Time band 2 segment 1')).toHaveAttribute('aria-invalid', 'true');
  await expect(message(page)).toHaveText('Use minutes such as 7, :07, or 7:30.');
  await expect(message(page)).toHaveAttribute('role', 'status');
  await expect(cell(page, 'Time band 2 segment 1')).toHaveAttribute('data-invalid', 'true');

  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Tab');
  await expect(message(page)).toHaveText('Enter a runtime. Zero is valid.');
  await expect(field(page, 'Time band 2 segment 1')).toBeFocused();

  // Blur with an invalid entry cancels: the saved text returns and nothing is dirty.
  await field(page, 'Time band 2 segment 1').blur();
  await expect(field(page, 'Time band 2 segment 1')).toHaveCount(0);
  await expect(cell(page, 'Time band 2 segment 1')).toHaveText(':06');
  await expect(message(page)).toHaveText('');
  await expect(saveBar(page)).toHaveCount(0);

  // From and To use the time parser's message.
  await cell(page, 'Time band 2 start').click();
  await page.keyboard.press('Enter');
  await page.keyboard.type('9:75');
  await page.keyboard.press('Enter');
  await expect(message(page)).toHaveText('Use a time such as 6:30 or 25:00.');
  await page.keyboard.press('Escape');
  await expect(message(page)).toHaveText('');

  // Blur with a valid entry commits.
  await cell(page, 'Time band 2 segment 1').dblclick();
  await field(page, 'Time band 2 segment 1').fill('7.5');
  await field(page, 'Time band 2 segment 1').blur();
  await expect(cell(page, 'Time band 2 segment 1')).toHaveText(':07:30');
});

test('Discard restores the saved profile and writes nothing; Save writes the edit', async ({ page }) => {
  await openGrid(page);
  const before = await storedSecondBand(page);
  await cell(page, 'Time band 2 segment 1').click();
  await page.keyboard.type(':10');
  await page.keyboard.press('Enter');
  await expect(saveBar(page)).toContainText('1 unsaved change in Runtimes');
  await saveBar(page).getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(cell(page, 'Time band 2 segment 1')).toHaveText(':06');
  await expect(runtimes(page).locator('.grid-cell--edited')).toHaveCount(0);
  await expect(saveBar(page)).toHaveCount(0);
  expect(await storedSecondBand(page)).toBe(before);

  await cell(page, 'Time band 2 segment 1').click();
  await page.keyboard.type(':10');
  await page.keyboard.press('Enter');
  await saveBar(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(saveBar(page)).toHaveCount(0);
  await expect.poll(() => storedSecondBand(page)).not.toBe(before);
  expect((await storedSecondBand(page)).split(',')).toContain('600');
  await expect(cell(page, 'Time band 2 segment 1')).toHaveText(':10');
  await expect(runtimes(page).locator('.grid-cell--edited')).toHaveCount(0);
});

test('leaving the tab with unsaved grid edits asks first', async ({ page }) => {
  await openGrid(page);
  await cell(page, 'Time band 2 segment 1').click();
  await page.keyboard.type(':10');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Save runtime changes before leaving?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(cell(page, 'Time band 2 segment 1')).toHaveText(':10');
  await expect(saveBar(page)).toBeVisible();
});

test('the grid passes the axe ARIA structure rules at rest and while a cell is edited', async ({ page }) => {
  await openGrid(page);
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  const violations = () => page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string }> }> } }).axe;
    const result = await axe.run(document.querySelector('[role="grid"]'), { runOnly: { type: 'rule', values: ['aria-required-children', 'aria-required-parent', 'aria-allowed-attr', 'aria-valid-attr-value', 'aria-allowed-role', 'label', 'nested-interactive', 'td-headers-attr', 'th-has-data-cells'] } });
    return result.violations.map((violation) => violation.id);
  });
  expect(await violations()).toEqual([]);
  await cell(page, 'Time band 2 segment 1').click();
  await page.keyboard.press('Enter');
  expect(await violations()).toEqual([]);
});

test('+ Add time band adds a band and focuses its first cell', async ({ page }) => {
  await openGrid(page);
  await runtimes(page).getByRole('button', { name: 'Add time band', exact: true }).click();
  await expect(cell(page, 'Time band 5 start')).toBeFocused();
  await expect(cell(page, 'Time band 5 start')).toHaveAttribute('tabindex', '0');
  await expect(saveBar(page)).toBeVisible();
});
