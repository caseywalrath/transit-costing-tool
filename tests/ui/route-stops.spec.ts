// ST5 (Decision 0079): the Route tab's Stops drawer. Placing and ordering stops, linking an existing stop from another pattern, Fill and
// Copy with Undo, timepoint stop IDs per pattern (Decision 0080), the unsaved-changes prompt, a duplicate stop ID message, and the 390 px
// layout. Real IndexedDB.
import { expect, test, type Page } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { runInPage } from './support/dexieEnv';

test.setTimeout(120_000);

/**
 * Nodes A, B, C and three saved patterns: "Main" A → B → C, "Short" A → B (shares A → B), and "Branch" B → C (shares B → C). The first two
 * steps run through the screens (createRouteWithPattern); node C and the other patterns are written to the database, then the page reloads.
 */
async function threePatternRoute(page: Page, projectName: string) {
  await createRouteWithPattern(page, projectName);
  await runInPage(page, `
    const [pattern] = await e.db.patterns.toArray();
    const records = await e.repository.getScenarioRecords(pattern.scenarioId);
    const nodes = records.nodes.filter((node) => node.routeId === pattern.routeId);
    const byName = (name) => nodes.find((node) => node.name === name);
    const now = new Date().toISOString();
    const nodeC = { ...byName('B'), id: crypto.randomUUID(), name: 'C', createdAt: now, updatedAt: now };
    const point = (nodeId, sequence, miles) => ({ id: crypto.randomUUID(), nodeId, sequence, cumulativeMiles: miles });
    const make = (name, nodeIds) => ({ ...pattern, id: crypto.randomUUID(), name, directionLabel: undefined, points: nodeIds.map((nodeId, index) => point(nodeId, index, index)), createdAt: now, updatedAt: now });
    const main = { ...pattern, name: 'Main', points: [byName('A').id, byName('B').id, nodeC.id].map((nodeId, index) => point(nodeId, index, index)), updatedAt: now };
    await e.repository.updateScenarioRecords(pattern.scenarioId, (current) => ({
      ...current,
      nodes: [...current.nodes, nodeC],
      patterns: [...current.patterns.filter((candidate) => candidate.id !== pattern.id), main, make('Short', [byName('A').id, byName('B').id]), make('Branch', [byName('B').id, nodeC.id])],
    }));
  `);
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Patterns' }).getByRole('button', { name: /^Main/ })).toBeVisible();
}

const patternButton = (page: Page, name: string) => page.getByRole('complementary', { name: 'Patterns' }).getByRole('button', { name: new RegExp(`^${name}`) });
const drawerOf = (page: Page) => page.getByRole('complementary', { name: /^Stops/ });

async function openStops(page: Page, patternName: string) {
  await patternButton(page, patternName).click();
  await expect(page.getByRole('heading', { name: patternName, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pattern actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stops…', exact: true }).click();
  const drawer = drawerOf(page);
  await expect(drawer.getByRole('table')).toBeVisible();
  return drawer;
}

async function addStop(page: Page, from: string, to: string, name: string, stopCode?: string) {
  const drawer = drawerOf(page);
  await drawer.getByRole('button', { name: `Add stop between ${from} and ${to}`, exact: true }).click();
  await page.keyboard.type(name);
  await page.keyboard.press('Tab');
  if (stopCode !== undefined) await drawer.getByRole('textbox', { name: `Stop ID, ${name}`, exact: true }).fill(stopCode);
}

async function saveStops(page: Page) {
  const drawer = drawerOf(page);
  await drawer.getByRole('button', { name: 'Save stops', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Save stops', exact: true })).toHaveCount(0);
}

/** Row names in drawer order: timepoints as their node name, stops as "· name". */
async function drawerRows(page: Page): Promise<string[]> {
  return drawerOf(page).locator('tbody tr.pattern-stops-timepoint, tbody tr.pattern-stops-stop').evaluateAll((rows) => rows.map((row) => row.classList.contains('pattern-stops-stop') ? `· ${(row.querySelector('input') as HTMLInputElement).value}` : (row.querySelector('th')?.textContent ?? '').trim()));
}

/** The stored placements of a pattern, by stop name, in order. */
async function storedStops(page: Page, patternName: string): Promise<string[]> {
  return runInPage(page, `
    const pattern = (await e.db.patterns.toArray()).find((candidate) => candidate.name === arg);
    const set = await e.repository.getRouteStopSet(pattern.routeId);
    const names = new Map((set?.stops ?? []).map((stop) => [stop.id, stop.name]));
    return (set?.placementsByPatternId[pattern.id] ?? []).map((placement) => names.get(placement.stopId));
  `, patternName);
}

test('places stops on two segments, moves one across a timepoint, and keeps them after reload', async ({ page }) => {
  await threePatternRoute(page, 'Stops placing');
  await openStops(page, 'Main');
  await addStop(page, 'A', 'B', 'First');
  await addStop(page, 'B', 'C', 'Second');
  expect(await drawerRows(page)).toEqual(['A', '· First', 'B', '· Second', 'C']);
  // The first stop of B → C moves up across B, to the end of A → B.
  await drawerOf(page).getByRole('button', { name: 'Move Second up', exact: true }).click();
  expect(await drawerRows(page)).toEqual(['A', '· First', '· Second', 'B', 'C']);
  await expect(drawerOf(page).getByRole('button', { name: 'Move First up', exact: true })).toBeDisabled();
  await expect(drawerOf(page).getByRole('status').filter({ hasText: 'unsaved change' })).toHaveText('2 unsaved changes');
  await saveStops(page);
  expect(await storedStops(page, 'Main')).toEqual(['First', 'Second']);

  await page.reload();
  await openStops(page, 'Main');
  expect(await drawerRows(page)).toEqual(['A', '· First', '· Second', 'B', 'C']);
});

test('links an existing stop from another pattern, renames it once for both, fills, copies with an exclusion, and undoes the copy', async ({ page }) => {
  await threePatternRoute(page, 'Stops sharing');
  await openStops(page, 'Main');
  await addStop(page, 'A', 'B', 'Shared', '100');
  await addStop(page, 'B', 'C', 'Branch stop');
  await saveStops(page);

  // Short: a new row typed as the suggestion "Shared · 100" links to the existing stop.
  await patternButton(page, 'Short').click();
  await expect(page.getByRole('heading', { name: 'Short', exact: true })).toBeVisible();
  await addStop(page, 'A', 'B', 'Shared · 100');
  const linked = drawerOf(page).getByRole('textbox', { name: 'Stop name, Shared', exact: true });
  await expect(linked).toHaveValue('Shared');
  await expect(drawerOf(page).getByText('2 patterns', { exact: true })).toBeVisible();
  await linked.fill('Shared stop');
  await saveStops(page);
  expect(await storedStops(page, 'Main')).toEqual(['Shared stop', 'Branch stop']);
  expect(await storedStops(page, 'Short')).toEqual(['Shared stop']);

  // Branch: Fill takes B → C from Main.
  await patternButton(page, 'Branch').click();
  await expect(page.getByRole('heading', { name: 'Branch', exact: true })).toBeVisible();
  await drawerOf(page).getByRole('button', { name: 'Stop actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Fill from other patterns…', exact: true }).click();
  const fill = page.getByRole('dialog', { name: 'Fill stops from other patterns' });
  await expect(fill.getByRole('cell', { name: 'Branch stop', exact: true })).toBeVisible();
  await fill.getByRole('button', { name: 'Fill stops', exact: true }).click();
  expect(await drawerRows(page)).toEqual(['B', '· Branch stop', 'C']);
  await saveStops(page);
  expect(await storedStops(page, 'Branch')).toEqual(['Branch stop']);

  // Main gets a second A → B stop and a second B → C stop; Copy to Short only (Branch excluded), then Undo.
  await patternButton(page, 'Main').click();
  await expect(page.getByRole('heading', { name: 'Main', exact: true })).toBeVisible();
  await addStop(page, 'A', 'B', 'Added');
  await addStop(page, 'B', 'C', 'Added on branch');
  await saveStops(page);
  await drawerOf(page).getByRole('button', { name: 'Stop actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy to other patterns…', exact: true }).click();
  const copy = page.getByRole('dialog', { name: 'Copy stops to other patterns' });
  await copy.getByRole('checkbox', { name: 'Include Branch', exact: true }).uncheck();
  await expect(copy.getByRole('checkbox', { name: 'Include Short', exact: true })).toBeChecked();
  await copy.getByRole('button', { name: 'Replace stops', exact: true }).click();
  await expect(copy).toHaveCount(0);
  expect(await storedStops(page, 'Short')).toEqual(['Shared stop', 'Added']);
  expect(await storedStops(page, 'Branch')).toEqual(['Branch stop']);

  await drawerOf(page).getByRole('button', { name: 'Stop actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Undo last stop copy', exact: true }).click();
  await expect.poll(() => storedStops(page, 'Short')).toEqual(['Shared stop']);
});

/** The stored timepoint stop IDs of a pattern, as "node name=stop ID" in point order (Decision 0080). */
async function storedCodes(page: Page, patternName: string): Promise<string[]> {
  return runInPage(page, `
    const pattern = (await e.db.patterns.toArray()).find((candidate) => candidate.name === arg);
    const set = await e.repository.getRouteStopSet(pattern.routeId);
    const nodes = new Map((await e.db.nodes.toArray()).map((node) => [node.id, node.name]));
    const codes = set?.timepointStopCodesByPatternId?.[pattern.id] ?? {};
    return [...pattern.points].sort((left, right) => left.sequence - right.sequence).filter((point) => codes[point.id]).map((point) => nodes.get(point.nodeId) + '=' + codes[point.id]);
  `, patternName);
}

test('timepoint stop IDs are entered per pattern, filled from and copied to patterns of the same direction only (Decision 0080)', async ({ page }) => {
  await threePatternRoute(page, 'Timepoint stop IDs');
  // Reverse runs C → B → A in the Route's other direction.
  await runInPage(page, `
    const patterns = await e.db.patterns.toArray();
    const main = patterns.find((candidate) => candidate.name === 'Main');
    const other = (await e.db.directions.toArray()).find((direction) => direction.routeId === main.routeId && direction.id !== main.directionId);
    const now = new Date().toISOString();
    const points = [...main.points].sort((left, right) => left.sequence - right.sequence).reverse().map((point, sequence) => ({ ...point, id: crypto.randomUUID(), sequence, cumulativeMiles: sequence }));
    await e.repository.updateScenarioRecords(main.scenarioId, (current) => ({ ...current, patterns: [...current.patterns, { ...main, id: crypto.randomUUID(), name: 'Reverse', directionId: other.id, points, createdAt: now, updatedAt: now }] }));
  `);
  await page.reload();
  await openStops(page, 'Reverse');
  await drawerOf(page).getByRole('textbox', { name: 'Timepoint stop ID, B', exact: true }).fill('B-south');
  await saveStops(page);

  await patternButton(page, 'Main').click();
  await expect(page.getByRole('heading', { name: 'Main', exact: true })).toBeVisible();
  await drawerOf(page).getByRole('textbox', { name: 'Timepoint stop ID, A', exact: true }).fill(' A-1 ');
  await drawerOf(page).getByRole('textbox', { name: 'Timepoint stop ID, B', exact: true }).fill('B-1');
  await expect(drawerOf(page).getByRole('status').filter({ hasText: 'unsaved change' })).toHaveText('2 unsaved changes');
  await saveStops(page);
  expect(await storedCodes(page, 'Main')).toEqual(['A=A-1', 'B=B-1']);

  // Short (A → B, same direction): Fill takes both stop IDs from Main, not B-south from Reverse.
  await patternButton(page, 'Short').click();
  await expect(page.getByRole('heading', { name: 'Short', exact: true })).toBeVisible();
  await drawerOf(page).getByRole('button', { name: 'Stop actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Fill from other patterns…', exact: true }).click();
  const fill = page.getByRole('dialog', { name: 'Fill stops from other patterns' });
  await expect(fill.getByRole('table', { name: 'Timepoint stop IDs' }).getByRole('row')).toHaveText(['TimepointStop IDSource', 'AA-1Main', 'BB-1Main']);
  await fill.getByRole('button', { name: 'Fill stops', exact: true }).click();
  await expect(drawerOf(page).getByRole('textbox', { name: 'Timepoint stop ID, B', exact: true })).toHaveValue('B-1');
  await saveStops(page);
  expect(await storedCodes(page, 'Short')).toEqual(['A=A-1', 'B=B-1']);

  // Copy from Main reaches Branch (B → C), and Reverse is not offered.
  await patternButton(page, 'Main').click();
  await expect(page.getByRole('heading', { name: 'Main', exact: true })).toBeVisible();
  await drawerOf(page).getByRole('button', { name: 'Stop actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy to other patterns…', exact: true }).click();
  const copy = page.getByRole('dialog', { name: 'Copy stops to other patterns' });
  await expect(copy.getByRole('checkbox', { name: 'Include Branch', exact: true })).toBeChecked();
  await expect(copy.getByRole('checkbox', { name: 'Include Reverse', exact: true })).toHaveCount(0);
  await copy.getByRole('button', { name: 'Replace stops', exact: true }).click();
  await expect(copy).toHaveCount(0);
  expect(await storedCodes(page, 'Branch')).toEqual(['B=B-1']);
  expect(await storedCodes(page, 'Reverse')).toEqual(['B=B-south']);
});

test('a stop ID typed on a new row that matches a saved stop of the Route links that stop instead of duplicating it', async ({ page }) => {
  await threePatternRoute(page, 'Stops reuse by ID');
  await openStops(page, 'Main');
  await addStop(page, 'A', 'B', 'Shared', '100');
  await saveStops(page);

  // Short is another pattern of the Route: typing a different name and the saved stop ID reuses the saved stop.
  await patternButton(page, 'Short').click();
  await expect(page.getByRole('heading', { name: 'Short', exact: true })).toBeVisible();
  await addStop(page, 'A', 'B', 'Typed name', '100');
  await drawerOf(page).getByRole('textbox', { name: 'Stop ID, Typed name', exact: true }).press('Enter');
  await expect(drawerOf(page).getByRole('textbox', { name: 'Stop name, Shared', exact: true })).toHaveValue('Shared');
  await expect(drawerOf(page).getByText('2 patterns', { exact: true })).toBeVisible();
  await expect(drawerOf(page).getByText('Another stop on this route has this stop ID.')).toHaveCount(0);
  await saveStops(page);
  expect(await storedStops(page, 'Main')).toEqual(['Shared']);
  expect(await storedStops(page, 'Short')).toEqual(['Shared']);
});

test('asks before leaving unsaved stops for another pattern, and shows a duplicate stop ID beside its row', async ({ page }) => {
  await threePatternRoute(page, 'Stops guards');
  await openStops(page, 'Main');
  await addStop(page, 'A', 'B', 'North', '7');
  await addStop(page, 'B', 'C', 'South', '7');

  await patternButton(page, 'Short').click();
  const prompt = page.getByRole('alertdialog', { name: 'Discard unsaved stop changes?' });
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Main', exact: true })).toBeVisible();

  // The save is refused, so the save bar stays.
  await drawerOf(page).getByRole('button', { name: 'Save stops', exact: true }).click();
  await expect(drawerOf(page).getByText('Another stop on this route has this stop ID.')).toBeVisible();
  await expect(drawerOf(page).getByRole('button', { name: 'Save stops', exact: true })).toBeVisible();
  await expect(drawerOf(page).getByRole('textbox', { name: 'Stop ID, South', exact: true })).toHaveAttribute('aria-invalid', 'true');

  await patternButton(page, 'Short').click();
  await page.getByRole('alertdialog', { name: 'Discard unsaved stop changes?' }).getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Short', exact: true })).toBeVisible();
  expect(await drawerRows(page)).toEqual(['A', 'B']);
  expect(await storedStops(page, 'Main')).toEqual([]);
});

test('fits a 390 px screen without horizontal page scroll', async ({ page }) => {
  await threePatternRoute(page, 'Stops narrow');
  await openStops(page, 'Main');
  await addStop(page, 'A', 'B', 'Narrow stop name that is long', '12345');
  await page.setViewportSize({ width: 390, height: 844 });
  const drawer = drawerOf(page);
  await expect(drawer.getByRole('button', { name: 'Remove Narrow stop name that is long', exact: true })).toBeInViewport();
  const box = await drawer.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
