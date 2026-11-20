// RS3 (Decision 0087): the Stops section of the Route tab. Split one stop by direction and Undo it from the notice, Split all shared stops
// with name suffixes, editing and saving a stop ID, a duplicate stop ID refused, the Delete review, a Merge refused for a repeated stop,
// and the filters. Real IndexedDB.
import { expect, test, type Page } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { runInPage } from './support/dexieEnv';

test.setTimeout(120_000);

/**
 * Nodes A, B, C. "Main" A → B → C and "Short" A → B in the first direction; "Reverse" C → B → A in the second. Stops: Bates (Main and Short
 * A → B, Reverse B → A: shared across directions), Pine (Main A → B), Elm (Main B → C), Oak (Reverse C → B, stop ID 200).
 */
async function route(page: Page, projectName: string) {
  await createRouteWithPattern(page, projectName);
  await runInPage(page, `
    const [pattern] = await e.db.patterns.toArray();
    const records = await e.repository.getScenarioRecords(pattern.scenarioId);
    const nodes = records.nodes.filter((node) => node.routeId === pattern.routeId);
    const byName = (name) => nodes.find((node) => node.name === name);
    const other = (await e.db.directions.toArray()).find((direction) => direction.routeId === pattern.routeId && direction.id !== pattern.directionId);
    const now = new Date().toISOString();
    const nodeC = { ...byName('B'), id: crypto.randomUUID(), name: 'C', createdAt: now, updatedAt: now };
    const point = (nodeId, sequence) => ({ id: crypto.randomUUID(), nodeId, sequence, cumulativeMiles: sequence });
    const make = (name, nodeIds, extra) => ({ ...pattern, id: crypto.randomUUID(), name, directionLabel: undefined, points: nodeIds.map(point), createdAt: now, updatedAt: now, ...extra });
    const main = { ...pattern, name: 'Main', points: [byName('A').id, byName('B').id, nodeC.id].map(point), updatedAt: now };
    const short = make('Short', [byName('A').id, byName('B').id]);
    const reverse = make('Reverse', [nodeC.id, byName('B').id, byName('A').id], { directionId: other.id });
    const stops = [{ id: 'bates', name: 'Bates', stopCode: '100', latitude: 39.9, longitude: -105 }, { id: 'pine', name: 'Pine' }, { id: 'elm', name: 'Elm' }, { id: 'oak', name: 'Oak', stopCode: '200' }];
    const place = (id, stopId, afterPatternPointId, sequence) => ({ id, stopId, afterPatternPointId, sequence, timing: 'interpolate' });
    const set = { id: crypto.randomUUID(), scenarioId: pattern.scenarioId, routeId: pattern.routeId, roundingSeconds: 60, stops, createdAt: now, updatedAt: now, placementsByPatternId: {
      [main.id]: [place('m1', 'bates', main.points[0].id, 0), place('m2', 'pine', main.points[0].id, 1), place('m3', 'elm', main.points[1].id, 0)],
      [short.id]: [place('s1', 'bates', short.points[0].id, 0)],
      [reverse.id]: [place('r1', 'oak', reverse.points[0].id, 0), place('r2', 'bates', reverse.points[1].id, 0)],
    } };
    await e.repository.updateScenarioRecords(pattern.scenarioId, (current) => ({
      ...current,
      nodes: [...current.nodes, nodeC],
      patterns: [...current.patterns.filter((candidate) => candidate.id !== pattern.id), main, short, reverse],
      routeStopSets: [set],
    }));
  `);
  await page.reload();
  await expect(section(page).getByRole('table', { name: 'Stops of this route' })).toBeVisible();
}

const section = (page: Page) => page.getByRole('region', { name: 'Route stops' });
const directionNames = (page: Page): Promise<string[]> => runInPage(page, `
  const [pattern] = await e.db.patterns.toArray();
  const directions = (await e.db.directions.toArray()).filter((direction) => direction.routeId === pattern.routeId);
  const main = (await e.db.patterns.toArray()).find((candidate) => candidate.name === 'Main');
  return [directions.find((direction) => direction.id === main.directionId).name, directions.find((direction) => direction.id !== main.directionId).name];
`);
/** Each pattern's stops by name, in placement order, read straight from the database. */
async function stored(page: Page): Promise<{ stops: any[]; byPattern: Record<string, string[]> }> {
  return runInPage(page, `
    const [pattern] = await e.db.patterns.toArray();
    const set = await e.repository.getRouteStopSet(pattern.routeId);
    const patterns = await e.db.patterns.toArray();
    const names = new Map((set?.stops ?? []).map((stop) => [stop.id, stop.name]));
    const byPattern = {};
    for (const candidate of patterns) byPattern[candidate.name] = (set?.placementsByPatternId[candidate.id] ?? []).map((placement) => names.get(placement.stopId));
    return { stops: set?.stops ?? [], byPattern };
  `);
}
async function rowAction(page: Page, stop: string, item: string) {
  await section(page).getByRole('button', { name: `Actions for ${stop}`, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

test('one stop is split by direction, shows in both drawers, and the split is undone from the notice', async ({ page }) => {
  await route(page, 'Route stops split');
  const [first, second] = await directionNames(page);
  const table = section(page).getByRole('table', { name: 'Stops of this route' });
  await expect(table.getByRole('row').filter({ hasText: first })).toHaveCount(3);
  await expect(section(page).getByRole('img', { name: 'Used by more than one direction' })).toHaveCount(1);
  await expect(table.getByRole('row').filter({ has: page.getByRole('textbox', { name: 'Stop, Bates', exact: true }) })).toContainText(`${first} 2 · ${second} 1`);

  await rowAction(page, 'Bates', 'Split by direction…');
  const dialog = page.getByRole('dialog', { name: 'Split Bates · 100 by direction' });
  await dialog.getByRole('radio', { name: second, exact: true }).check();
  await dialog.getByRole('textbox', { name: 'New stop name', exact: true }).fill('Bates NB');
  await dialog.getByRole('textbox', { name: 'Stop ID', exact: true }).fill('101');
  await dialog.getByRole('button', { name: `Split for ${second}`, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Split stops by direction on route' })).toBeVisible();
  let saved = await stored(page);
  expect(saved.byPattern).toEqual({ Main: ['Bates', 'Pine', 'Elm'], Short: ['Bates'], Reverse: ['Oak', 'Bates NB'] });
  expect(saved.stops.map((stop) => [stop.name, stop.stopCode ?? ''])).toEqual([['Bates', '100'], ['Bates NB', '101'], ['Pine', ''], ['Elm', ''], ['Oak', '200']]);
  await expect(section(page).getByRole('img', { name: 'Used by more than one direction' })).toHaveCount(0);

  // The drawers of both directions show their own record.
  await page.getByRole('complementary', { name: 'Patterns' }).getByRole('button', { name: /^Reverse/ }).click();
  await page.getByRole('button', { name: 'Pattern actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stops…', exact: true }).click();
  const drawer = page.getByRole('complementary', { name: /^Stops/ });
  await expect(drawer.getByRole('textbox', { name: 'Stop name, Bates NB', exact: true })).toHaveValue('Bates NB');
  // The section is read-only while the drawer is open.
  await expect(section(page).getByRole('textbox', { name: 'Stop, Oak', exact: true })).toBeDisabled();
  await drawer.getByRole('button', { name: 'Close Stops drawer', exact: true }).click();
  await expect(section(page).getByRole('textbox', { name: 'Stop, Oak', exact: true })).toBeEnabled();

  await page.getByRole('status').filter({ hasText: 'Split stops by direction on route' }).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await stored(page)).byPattern.Reverse).toEqual(['Oak', 'Bates']);
  await expect(section(page).getByRole('img', { name: 'Used by more than one direction' })).toHaveCount(1);
});

test('split all shared stops gives each direction a suffixed record', async ({ page }) => {
  await route(page, 'Route stops split all');
  const [first, second] = await directionNames(page);
  await section(page).getByRole('button', { name: 'Route stop actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Split all shared stops…', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Split all shared stops' });
  await expect(dialog.getByRole('listitem')).toHaveText(['Bates · 100']);
  await dialog.getByRole('combobox', { name: 'Direction that keeps the existing stops' }).selectOption({ label: first });
  await dialog.getByRole('textbox', { name: `Name suffix, ${first}`, exact: true }).fill('SB');
  await dialog.getByRole('textbox', { name: `Name suffix, ${second}`, exact: true }).fill('NB');
  await dialog.getByRole('checkbox', { name: 'Add the suffix to the kept stops too' }).check();
  await dialog.getByRole('button', { name: 'Split 1 stop', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await stored(page);
  expect(saved.byPattern).toEqual({ Main: ['Bates SB', 'Pine', 'Elm'], Short: ['Bates SB'], Reverse: ['Oak', 'Bates NB'] });
  expect(saved.stops.find((stop) => stop.name === 'Bates SB')).toMatchObject({ stopCode: '100', latitude: 39.9 });
  expect(saved.stops.find((stop) => stop.name === 'Bates NB')).toEqual({ id: expect.any(String), name: 'Bates NB' });
  await expect(section(page).getByRole('radio', { name: /^Missing stop ID/ })).toHaveText('Missing stop ID 3');
});

test('a stop ID is edited and saved, and a duplicate stop ID is refused under its row', async ({ page }) => {
  await route(page, 'Route stops edit');
  const elm = section(page).getByRole('textbox', { name: 'Stop ID, Elm', exact: true });
  await elm.fill('300');
  await expect(section(page).getByRole('region', { name: 'Unsaved changes' })).toContainText('1 unsaved change in Stops');
  await section(page).getByRole('button', { name: 'Save stops', exact: true }).click();
  await expect(section(page).getByRole('button', { name: 'Save stops', exact: true })).toHaveCount(0);
  expect((await stored(page)).stops.find((stop) => stop.name === 'Elm').stopCode).toBe('300');

  await section(page).getByRole('textbox', { name: 'Stop ID, Pine', exact: true }).fill('200');
  await section(page).getByRole('button', { name: 'Save stops', exact: true }).click();
  await expect(section(page).getByRole('alert')).toContainText('Resolve the highlighted stop problems');
  await expect(section(page).locator('.route-stops__error')).not.toHaveCount(0);
  expect((await stored(page)).stops.find((stop) => stop.name === 'Pine').stopCode).toBeUndefined();

  // Structural commands wait for the edits to be saved or discarded.
  await section(page).getByRole('button', { name: 'Actions for Pine', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Delete…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await section(page).getByRole('button', { name: 'Discard', exact: true }).click();

  // A block pasted from a spreadsheet fills across the columns and down the rows.
  await section(page).getByRole('textbox', { name: 'Latitude, Pine', exact: true }).focus();
  await page.evaluate(() => { const data = new DataTransfer(); data.setData('text/plain', '39.1\t-105.1\n39.2\t-105.2\n'); document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
  await expect(section(page).getByRole('textbox', { name: 'Longitude, Elm', exact: true })).toHaveValue('-105.2');
  await expect(section(page).getByRole('region', { name: 'Unsaved changes' })).toContainText('2 unsaved changes in Stops');
});

test('delete lists the patterns, merge refuses a repeated stop, and the filters count', async ({ page }) => {
  await route(page, 'Route stops delete merge');
  await expect(section(page).getByRole('radio', { name: /^All/ })).toHaveText('All 4');
  await expect(section(page).getByRole('radio', { name: /^Shared/ })).toHaveText('Shared across directions 1');
  await expect(section(page).getByRole('radio', { name: /^Missing location/ })).toHaveText('Missing location 3');
  await section(page).getByRole('radio', { name: /^Shared/ }).click();
  await expect(section(page).getByRole('textbox', { name: /^Stop, / })).toHaveCount(1);
  await section(page).getByRole('radio', { name: /^All/ }).click();
  await section(page).getByRole('searchbox', { name: 'Filter stops by name or stop ID' }).fill('200');
  await expect(section(page).getByRole('textbox', { name: /^Stop, / })).toHaveCount(1);
  await expect(section(page).getByRole('textbox', { name: /^Stop, / })).toHaveValue('Oak');
  await section(page).getByRole('searchbox', { name: 'Filter stops by name or stop ID' }).fill('');

  // Bates and Pine are both on Main between A and B: merging them would place one stop twice there.
  await section(page).getByRole('checkbox', { name: 'Select Bates', exact: true }).check();
  await section(page).getByRole('checkbox', { name: 'Select Pine', exact: true }).check();
  await section(page).getByRole('toolbar', { name: 'stop actions' }).getByRole('button', { name: 'Merge…', exact: true }).click();
  const merge = page.getByRole('dialog', { name: 'Merge 2 stops' });
  await merge.getByRole('button', { name: 'Merge stops', exact: true }).click();
  await expect(merge.getByRole('alert')).toContainText('This stop is already between these timepoints. (Main)');
  await merge.getByRole('button', { name: 'Cancel', exact: true }).click();

  await section(page).getByRole('toolbar', { name: 'stop actions' }).getByRole('button', { name: 'Delete…', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Delete 2 stops?' });
  await expect(review.getByRole('row')).toHaveText(['StopRemoved from', 'Bates · 100Main, Reverse, Short', 'PineMain']);
  await review.getByRole('button', { name: 'Delete 2 stops', exact: true }).click();
  await expect(review).toHaveCount(0);
  expect((await stored(page)).byPattern).toEqual({ Main: ['Elm'], Short: [], Reverse: ['Oak'] });
  await expect(page.getByRole('status').filter({ hasText: 'Deleted stops of route' })).toBeVisible();
});

// Screenshots for review, only when RS_SHOTS names an output folder.
test('screenshots at 1024 and 1440 px', async ({ page }) => {
  test.skip(!process.env.RS_SHOTS, 'Set RS_SHOTS to capture screenshots');
  await route(page, 'Route stops screenshots');
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await section(page).scrollIntoViewIfNeeded();
    await section(page).screenshot({ path: `${process.env.RS_SHOTS}/section-${width}.png` });
  }
  await section(page).getByRole('button', { name: 'Actions for Bates', exact: true }).click();
  await page.screenshot({ path: `${process.env.RS_SHOTS}/row-menu-1440.png` });
  await page.getByRole('menuitem', { name: 'Split by direction…', exact: true }).click();
  await page.getByRole('dialog').screenshot({ path: `${process.env.RS_SHOTS}/split-dialog.png` });
  await page.keyboard.press('Escape');
  await section(page).getByRole('button', { name: 'Route stop actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Split all shared stops…', exact: true }).click();
  await page.getByRole('dialog').screenshot({ path: `${process.env.RS_SHOTS}/split-all-dialog.png` });
  await page.keyboard.press('Escape');
  await section(page).getByRole('checkbox', { name: 'Select Bates', exact: true }).check();
  await section(page).getByRole('textbox', { name: 'Stop ID, Elm', exact: true }).fill('300');
  await section(page).screenshot({ path: `${process.env.RS_SHOTS}/selection-and-save-1440.png` });
  await expect(section(page)).toBeVisible();
});
