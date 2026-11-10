// Decision 0065: the planner types segment miles in the pattern editor; cumulative miles are derived. "Fill distances from other patterns…",
// "Copy distances to other patterns…", and "Undo last distance copy" are in the pattern editor's Actions menu.
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { editGridCell, gridCell } from './support/ui';

test.setTimeout(150_000);

const patternName = (page: Page) => page.getByLabel('Pattern name');
const patternList = (page: Page) => page.getByLabel('Patterns', { exact: true }).first();
const reviewSave = (page: Page) => page.getByRole('button', { name: 'Review and save', exact: true });
const actionsButton = (page: Page) => page.getByRole('button', { name: 'Pattern actions', exact: true });
const totals = (page: Page) => runInPage(page, 'return Object.fromEntries((await e.db.patterns.toArray()).map((pattern) => [pattern.name, pattern.points.at(-1)?.cumulativeMiles ?? null]))') as Promise<Record<string, number | null>>;

async function actionItem(page: Page, item: string) {
  await actionsButton(page).click();
  await page.getByRole('menu', { name: 'Pattern actions', exact: true }).getByRole('menuitem', { name: item, exact: true }).click();
}

/** Saves the draft. A new pattern (or one whose points changed) asks to rebalance first; a distance-only save goes straight through. */
async function savePattern(page: Page) {
  await reviewSave(page).click();
  const rebalance = page.getByRole('button', { name: 'Save and rebalance', exact: true });
  await expect.poll(async () => (await rebalance.count()) > 0 || (await reviewSave(page).count()) === 0).toBe(true);
  if (await rebalance.count()) await rebalance.click();
  await expect(reviewSave(page)).toHaveCount(0);
}

/** A Route with one saved pattern named "Source", whose only segment is 4.5 miles (A to B). */
async function routeWithSource(page: Page, project: string) {
  await createRouteWithPattern(page, project);
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  await expect(patternName(page)).toBeVisible();
  await patternName(page).fill('Source');
  await editGridCell(gridCell(page, 'Point 2 segment miles'), '4.5');
  await savePattern(page);
  await expect(gridCell(page, 'Point 2 segment miles')).toHaveText('4.50');
}

/** Adds "Target one" and "Target two": duplicates of Source whose segment is 1 mile, so a copy from Source changes them. Leaves Source selected. */
async function routeWithTargets(page: Page, project: string) {
  await routeWithSource(page, project);
  for (const target of ['Target one', 'Target two']) {
    await actionItem(page, 'Duplicate pattern');
    await patternName(page).fill(target);
    await editGridCell(gridCell(page, 'Point 2 segment miles'), '1');
    await savePattern(page);
    await patternList(page).getByRole('button', { name: /^Source\b/ }).click();
    await expect(patternName(page)).toHaveValue('Source');
  }
}

test('typing segment miles shifts the cumulative miles of the later points', async ({ page }) => {
  await createRouteWithPattern(page, 'Segment entry');
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  await page.getByRole('button', { name: 'Add node to pattern', exact: true }).click();
  await expect(gridCell(page, 'Point 3 segment miles')).toBeVisible();
  await editGridCell(gridCell(page, 'Point 2 segment miles'), '1.5');
  await editGridCell(gridCell(page, 'Point 3 segment miles'), '3.2');
  await expect(page.locator('.pattern-editor tbody tr output')).toHaveText(['0.00', '1.50', '4.70']);
});

test('fill takes a segment from the reverse pattern, labels it, and saves through the normal review', async ({ page }) => {
  await routeWithSource(page, 'Fill from reverse');
  await page.getByRole('button', { name: 'Reverse', exact: true }).click();
  await expect(patternName(page)).toHaveValue('Source Reverse');
  await editGridCell(gridCell(page, 'Point 2 segment miles'), '0');

  await actionItem(page, 'Fill distances from other patterns…');
  const dialog = page.getByRole('dialog', { name: 'Fill distances from other patterns' });
  await expect(dialog).toContainText('B → A');
  await expect(dialog).toContainText('Source (from reverse)');
  await expect(dialog.getByRole('cell', { name: '4.50', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fill distances', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(gridCell(page, 'Point 2 segment miles')).toHaveText('4.50');

  await savePattern(page);
  await expect.poll(() => totals(page)).toEqual({ Source: 4.5, 'Source Reverse': 4.5 });
});

test('copy writes only to the included target, and undo restores it', async ({ page }) => {
  await routeWithTargets(page, 'Copy distances');
  await actionItem(page, 'Copy distances to other patterns…');
  const dialog = page.getByRole('dialog', { name: 'Copy distances to other patterns' });
  await expect(dialog.getByRole('checkbox', { name: 'Include Target one' })).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'Include Target one' }).uncheck();
  await expect(dialog.getByRole('checkbox', { name: 'Include Target one' })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Replace distances', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => totals(page)).toEqual({ Source: 4.5, 'Target one': 1, 'Target two': 4.5 });

  await actionItem(page, 'Undo last distance copy');
  await expect.poll(() => totals(page)).toEqual({ Source: 4.5, 'Target one': 1, 'Target two': 1 });
});

test('copy is disabled while the pattern has unsaved changes', async ({ page }) => {
  await routeWithTargets(page, 'Copy needs save');
  await editGridCell(gridCell(page, 'Point 2 segment miles'), '2');
  await expect(reviewSave(page)).toBeVisible();
  await actionsButton(page).click();
  const copy = page.getByRole('menu', { name: 'Pattern actions', exact: true }).getByRole('menuitem', { name: 'Copy distances to other patterns…', exact: true });
  await expect(copy).toBeDisabled();
  await expect(copy).toHaveAttribute('title', 'Save this pattern before copying its distances');
  await page.keyboard.press('Escape');
});

test('the copy dialog has no horizontal page scroll at 390 px wide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await routeWithTargets(page, 'Copy at phone width');
  await actionItem(page, 'Copy distances to other patterns…');
  const dialog = page.getByRole('dialog', { name: 'Copy distances to other patterns' });
  await expect(dialog.getByRole('button', { name: 'Replace distances', exact: true })).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
