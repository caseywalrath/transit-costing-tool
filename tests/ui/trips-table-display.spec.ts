// Review package P05 (I-084, I-085; findings 5-003 and 5-017). Browser coverage for Trips table behavior that had no test: rounding
// of displayed times (D0033), Show headways (D0034), runtime band shading, duplicate-departure and Block overlap warnings, net-zero
// Shift discard, and the Runtime paste dialog. Each test drives the real app and checks values, not only that a control exists.
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createRouteWithPattern, createShiftReadySchedule } from './support/tripsWorkspace';

test.setTimeout(90_000);

const tripsSection = (page: Page) => page.locator('[aria-label="Trips section"]');
const rows = (page: Page) => page.locator('.trips-workspace .schedule-table tbody tr');
/** The displayed text of one timepoint column (0 = A, 1 = B) for every row. */
const columnTexts = (page: Page, column: number) => rows(page).evaluateAll((trs, index) => trs.map((tr) => tr.querySelectorAll('td.trip-timepoint-column')[index]!.textContent), column);

/** One timepoint cell: row index, then column (0 = A, 1 = B). */
const cell = (page: Page, row: number, column: number) => rows(page).nth(row).locator('td.trip-timepoint-column').nth(column);

/** Toggles a Display item in the Trip actions menu. The role differs between menu item kinds, so match by label. */
async function toggleDisplay(page: Page, label: string) {
  await tripsSection(page).getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).locator('[role^="menuitem"]', { hasText: label }).click();
  await expect(page.getByRole('menu', { name: 'Trip actions' })).toHaveCount(0);
}

test('rounds displayed times to the minute and keeps the exact time in the cell title', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20', ':07:30');
  await expect.poll(() => columnTexts(page, 0)).toEqual(['6:00', '6:10', '6:20']);
  await expect.poll(() => columnTexts(page, 1)).toEqual(['6:07:30', '6:17:30', '6:27:30']);
  await expect(rows(page).first().locator('td.trip-timepoint-column').nth(1)).not.toHaveAttribute('title', /Exact/);

  await toggleDisplay(page, 'Round displayed times');
  await expect.poll(() => columnTexts(page, 1)).toEqual(['6:08', '6:18', '6:28']);
  await expect.poll(() => columnTexts(page, 0)).toEqual(['6:00', '6:10', '6:20']);
  await expect(rows(page).first().locator('td.trip-timepoint-column').nth(1)).toHaveAttribute('title', /Exact: 6:07:30/);
  // Whole-minute times need no "Exact" note.
  await expect(rows(page).first().locator('td.trip-timepoint-column').nth(0)).not.toHaveAttribute('title', /Exact/);

  await toggleDisplay(page, 'Round displayed times');
  await expect.poll(() => columnTexts(page, 1)).toEqual(['6:07:30', '6:17:30', '6:27:30']);
});

test('Show headways replaces each later time with the gap from the previous Trip and marks the first time', async ({ page }) => {
  await createShiftReadySchedule(page, '06:30');
  await expect.poll(() => columnTexts(page, 0)).toEqual(['6:00', '6:10', '6:20', '6:30']);

  await toggleDisplay(page, 'Show headways');
  await expect.poll(() => columnTexts(page, 0)).toEqual(['6:00', '0:10', '0:10', '0:10']);
  await expect(cell(page, 0, 0)).toHaveClass(/trip-headway-first/);
  await expect(cell(page, 1, 0)).not.toHaveClass(/trip-headway-first/);
  await expect(cell(page, 0, 0)).toHaveAttribute('title', 'First scheduled time: 6:00');
  await expect(cell(page, 1, 0)).toHaveAttribute('title', 'Headway from 6:00 to 6:10');
  await expect(cell(page, 3, 0)).toHaveAttribute('title', 'Headway from 6:20 to 6:30');

  await toggleDisplay(page, 'Show headways');
  await expect.poll(() => columnTexts(page, 0)).toEqual(['6:00', '6:10', '6:20', '6:30']);
  await expect(cell(page, 0, 0)).not.toHaveClass(/trip-headway-first/);
});

test('Show runtime bands lists the band and shades the run-time cells in the band color', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  // Reload first. After a Runtime profile is saved, the Trips table keeps the profiles it loaded earlier, so shading would be
  // computed from the pre-save profile and be missing (app finding recorded in docs/implementation/review-fixes.md, P05).
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByLabel('Runtime band legend')).toHaveCount(0);
  await expect(cell(page, 0, 1)).toHaveCSS('background-image', 'none');

  await toggleDisplay(page, 'Show runtime bands');
  const legend = page.getByLabel('Runtime band legend');
  await expect(legend).toBeVisible();
  await expect(legend.locator('span')).toHaveCount(1);
  await expect(legend).toContainText('0:00–30:00');
  const swatch = await legend.locator('i').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(swatch).toMatch(/^rgb\(/);
  // The first timepoint has no run time; every later timepoint is shaded with the legend's color.
  await expect(cell(page, 0, 0)).toHaveCSS('background-image', 'none');
  for (const row of [0, 1, 2]) {
    const shading = await cell(page, row, 1).evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(shading).toContain('linear-gradient');
    expect(shading).toContain(swatch);
  }

  await toggleDisplay(page, 'Show runtime bands');
  await expect(page.getByLabel('Runtime band legend')).toHaveCount(0);
  await expect(cell(page, 0, 1)).toHaveCSS('background-image', 'none');
});

test('flags a duplicate departure and warns on both Trips when a Block overlaps itself', async ({ page }) => {
  await createShiftReadySchedule(page, '06:10');
  await expect(page.locator('.duplicate-note')).toHaveCount(0);

  // A third Trip at 06:00 duplicates the first.
  await tripsSection(page).getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Add trip…' }).click();
  await rows(page).first().getByLabel('New trip pattern').selectOption({ index: 1 });
  await rows(page).first().getByLabel('First trip time').fill('06:00');
  await rows(page).first().getByRole('button', { name: 'Save', exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect.poll(() => columnTexts(page, 0)).toEqual(['6:00', '6:00', '6:10']);
  await expect(page.locator('.duplicate-note')).toHaveText(['Duplicate departure', 'Duplicate departure']);
  await expect(rows(page).nth(2).locator('.duplicate-note')).toHaveCount(0);

  // Put both 06:00 Trips in one Block. Each arrives at 6:07, after the other departs at 6:00, so both are warned.
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  await page.getByRole('button', { name: 'Blocking actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Blocking Scenario…', exact: true }).click();
  await page.getByRole('dialog', { name: 'New Blocking Scenario' }).getByLabel('Name').fill('Overlap check');
  await page.getByRole('dialog', { name: 'New Blocking Scenario' }).getByRole('button', { name: 'Create', exact: true }).click();
  const currentBlock = page.getByLabel('Current Block');
  await currentBlock.getByRole('button', { name: 'Current Block actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Block…', exact: true }).click();
  await page.getByRole('dialog', { name: 'New Block' }).getByLabel('Name').fill('Block 1');
  await page.getByRole('dialog', { name: 'New Block' }).getByRole('button', { name: 'Create Block', exact: true }).click();
  await expect(currentBlock.getByRole('button', { name: /Block 1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('.trip-block-warning')).toHaveCount(0);
  for (const index of [0, 1]) {
    await rows(page).nth(index).getByRole('button', { name: /Block assignment for/ }).click();
    await page.getByRole('menu', { name: /Block assignment for/ }).getByRole('menuitemradio', { name: 'Block 1', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Assign Trip to Block?' }).getByRole('button', { name: 'Assign Trip', exact: true }).click();
    await expect(rows(page).nth(index).getByRole('button', { name: /Block assignment for/ })).toContainText('Block 1');
  }
  await expect(page.locator('.trip-block-warning')).toHaveCount(2);
  const warnings = await page.locator('.trip-block-warning').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')));
  expect(warnings.some((text) => /Block 1: arrives at 6:07 after next trip departs at 6:00\./.test(text ?? ''))).toBe(true);
  expect(warnings.some((text) => /Block 1: departs at 6:00 before previous trip arrives at 6:07\./.test(text ?? ''))).toBe(true);
  // The unassigned Trip at 6:10 has no Block, so no warning.
  await expect(rows(page).nth(2).locator('.trip-block-warning')).toHaveCount(0);
});

test('discards a Shift whose net offset is zero without writing any Trip', async ({ page }) => {
  await createShiftReadySchedule(page, '06:20');
  const stored = () => runInPage(page, 'return (await e.db.trips.toArray()).sort((a, b) => a.id.localeCompare(b.id))');
  const before = await stored();
  expect(before).toHaveLength(3);

  const openShift = async () => {
    await tripsSection(page).getByRole('button', { name: 'Trip actions', exact: true }).click();
    await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Shift selected…' }).click();
    return page.getByRole('complementary', { name: 'Shift selected Trips' });
  };
  await rows(page).first().getByRole('checkbox').check();
  const drawer = await openShift();
  await drawer.getByRole('button', { name: '+ Forward' }).click();
  await expect(page.getByText('Staged 1 minute later')).toBeVisible();
  await drawer.getByRole('button', { name: '− Back' }).click();
  await expect(page.getByText('Staged 1 minute later')).toHaveCount(0);
  await expect(page.getByText('Staged 1 minute earlier')).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Done', exact: true }).click();

  await expect(drawer).toHaveCount(0);
  await expect(rows(page).first().getByRole('checkbox')).not.toBeChecked();
  await expect.poll(() => columnTexts(page, 0)).toEqual(['6:00', '6:10', '6:20']);
  expect(await stored()).toEqual(before);

  // Control: a Shift with a real net offset does write.
  await rows(page).first().getByRole('checkbox').check();
  const second = await openShift();
  await second.getByRole('button', { name: '+ Forward' }).click();
  await second.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => columnTexts(page, 0)).toEqual(['6:01', '6:10', '6:20']);
  expect(await stored()).not.toEqual(before);
});

test('pastes runtime rows through a reviewed dialog that changes only the editor draft', async ({ page }) => {
  await createRouteWithPattern(page, 'Runtime paste verification');
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  const runtimeSection = page.locator('[aria-label="Runtimes section"]');
  await expect(runtimeSection.getByLabel('Time band 1 segment 1')).toBeVisible();
  const openPaste = async () => {
    await runtimeSection.getByRole('button', { name: 'Runtime actions', exact: true }).click();
    await page.getByRole('menu', { name: 'Runtime actions' }).getByRole('menuitem', { name: 'Paste rows…' }).click();
    return page.getByRole('dialog', { name: 'Paste runtime rows' });
  };

  // A row with no runtime is refused with a message and nothing to apply.
  let dialog = await openPaste();
  await dialog.getByLabel('Spreadsheet or CSV rows').fill('From\tTo\tSegment 1\n05:00\t09:00');
  await dialog.getByRole('button', { name: 'Review rows', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Fix the pasted rows');
  await expect(dialog.getByRole('button', { name: /^Replace with/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Valid rows are previewed, then replace the draft; nothing is stored until Save.
  dialog = await openPaste();
  await dialog.getByLabel('Spreadsheet or CSV rows').fill('From\tTo\tSegment 1\n05:00\t09:00\t12\n09:00\t15:00\t15');
  await dialog.getByRole('button', { name: 'Review rows', exact: true }).click();
  const preview = dialog.getByLabel('Runtime row preview');
  await expect(preview.getByRole('heading', { name: '2 pasted time bands' })).toBeVisible();
  await expect(preview.locator('tbody tr').first()).toContainText('5:00');
  await expect(preview.locator('tbody tr').first()).toContainText(':12');
  await expect(preview.locator('tbody tr').nth(1)).toContainText(':15');
  await dialog.getByRole('button', { name: 'Replace with 2 rows', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(runtimeSection.getByLabel('Time band 1 segment 1')).toHaveValue(':12');
  await expect(runtimeSection.getByLabel('Time band 2 segment 1')).toHaveValue(':15');
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
  const storedBands = () => runInPage(page, 'return (await e.db.runtimeProfiles.toArray()).map((profile) => profile.bands.map((band) => band.segmentRuntimeSeconds[0]))');
  expect(await storedBands()).toEqual([[0]]);

  await runtimeSection.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(runtimeSection.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect.poll(storedBands).toEqual([[720, 900]]);
});
