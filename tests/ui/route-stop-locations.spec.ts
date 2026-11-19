// SL4 (Decision 0085): the Stops drawer's Show locations expansion and the stop location import. Typing and saving a stop location,
// pasting a coordinate pair, an incomplete pair that blocks saving, Copy of a timepoint location to a same-direction pattern only, and an
// import that applies ID matches and leaves a name match unapplied until it is checked. Real IndexedDB.
import { expect, test, type Page } from '@playwright/test';
import { createRouteWithPattern } from './support/tripsWorkspace';
import { runInPage } from './support/dexieEnv';

test.setTimeout(120_000);

/** Nodes A, B, C; "Main" A → B → C and "Short" A → B in one direction; "Reverse" C → B → A in the other. */
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
    await e.repository.updateScenarioRecords(pattern.scenarioId, (current) => ({
      ...current,
      nodes: [...current.nodes, nodeC],
      patterns: [...current.patterns.filter((candidate) => candidate.id !== pattern.id), main, make('Short', [byName('A').id, byName('B').id]), make('Reverse', [nodeC.id, byName('B').id, byName('A').id], { directionId: other.id })],
    }));
  `);
  await page.reload();
  await expect(patternButton(page, 'Main')).toBeVisible();
}

const patternButton = (page: Page, name: string) => page.getByRole('complementary', { name: 'Patterns' }).getByRole('button', { name: new RegExp(`^${name}`) });
const drawerOf = (page: Page) => page.getByRole('complementary', { name: /^Stops/ });

async function openStops(page: Page, patternName: string) {
  await patternButton(page, patternName).click();
  await expect(page.getByRole('heading', { name: patternName, exact: true })).toBeVisible();
  if (await drawerOf(page).count() === 0) {
    await page.getByRole('button', { name: 'Pattern actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Stops…', exact: true }).click();
  }
  await expect(drawerOf(page).getByRole('table')).toBeVisible();
  return drawerOf(page);
}

async function saveStops(page: Page) {
  await drawerOf(page).getByRole('button', { name: 'Save stops', exact: true }).click();
  await expect(drawerOf(page).getByRole('button', { name: 'Save stops', exact: true })).toHaveCount(0);
}

/** The stored stop set of the Route, read straight from the database. */
async function storedSet(page: Page): Promise<any> {
  return runInPage(page, `
    const [pattern] = await e.db.patterns.toArray();
    const set = await e.repository.getRouteStopSet(pattern.routeId);
    const patterns = await e.db.patterns.toArray();
    const nodes = new Map((await e.db.nodes.toArray()).map((node) => [node.id, node.name]));
    const locations = {};
    for (const candidate of patterns) {
      const stored = set?.timepointLocationsByPatternId?.[candidate.id] ?? {};
      for (const point of candidate.points) if (stored[point.id]) locations[candidate.name + ' ' + nodes.get(point.nodeId)] = stored[point.id];
    }
    return { stops: set?.stops ?? [], locations };
  `);
}

test('stop and timepoint locations are typed, pasted, checked, saved, and copied to same-direction patterns only', async ({ page }) => {
  await route(page, 'Stop locations');
  const drawer = await openStops(page, 'Main');
  await expect(drawer.getByRole('textbox', { name: /^Latitude/ })).toHaveCount(0);
  await drawer.getByRole('button', { name: 'Show locations', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Show locations', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // A new stop: a pasted pair fills Latitude and Longitude; then a speed limit.
  await drawer.getByRole('button', { name: 'Add stop between A and B', exact: true }).click();
  await page.keyboard.type('Pecos');
  await drawer.getByRole('textbox', { name: 'Latitude, Pecos', exact: true }).fill('39.912274, -104.99353');
  await expect(drawer.getByRole('textbox', { name: 'Longitude, Pecos', exact: true })).toHaveValue('-104.99353');
  await drawer.getByRole('textbox', { name: 'Speed limit, Pecos', exact: true }).fill('35');

  // A timepoint with latitude only: the incomplete pair is refused with its message, and nothing is written.
  await drawer.getByRole('textbox', { name: 'Latitude, timepoint A', exact: true }).fill('39.9');
  await drawer.getByRole('button', { name: 'Save stops', exact: true }).click();
  await expect(drawer.getByText('Enter both latitude and longitude, or neither.')).toBeVisible();
  expect((await storedSet(page)).stops).toEqual([]);
  await drawer.getByRole('textbox', { name: 'Longitude, timepoint A', exact: true }).fill('-105.01');
  await saveStops(page);
  const saved = await storedSet(page);
  expect(saved.stops).toEqual([expect.objectContaining({ name: 'Pecos', latitude: 39.912274, longitude: -104.99353, speedLimitMph: 35 })]);
  expect(saved.locations).toEqual({ 'Main A': { latitude: 39.9, longitude: -105.01 } });

  // Text that is not a number blocks saving and counts as an edit.
  await drawer.getByRole('textbox', { name: 'Speed limit, Pecos', exact: true }).fill('fast');
  await expect(drawer.getByText('Enter latitude, longitude, and speed limit as numbers.')).toBeVisible();
  await drawer.getByRole('button', { name: 'Save stops', exact: true }).click();
  await expect(drawer.getByRole('alert')).toContainText('not numbers');
  await drawer.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(drawer.getByRole('textbox', { name: 'Speed limit, Pecos', exact: true })).toHaveValue('35');

  // Copy reaches Short (same direction, shares A) and not Reverse.
  await drawer.getByRole('button', { name: 'Stop actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Copy to other patterns…', exact: true }).click();
  const copy = page.getByRole('dialog', { name: 'Copy stops to other patterns' });
  await expect(copy.getByRole('table', { name: 'Timepoint locations' }).getByRole('row')).toHaveText(['PatternTimepointLocation', 'ShortA39.9, -105.01']);
  await expect(copy.getByRole('checkbox', { name: 'Include Reverse', exact: true })).toHaveCount(0);
  await copy.getByRole('button', { name: 'Replace stops', exact: true }).click();
  await expect(copy).toHaveCount(0);
  expect((await storedSet(page)).locations).toEqual({ 'Main A': { latitude: 39.9, longitude: -105.01 }, 'Short A': { latitude: 39.9, longitude: -105.01 } });

  // The switch is remembered on this device.
  await page.reload();
  const reopened = await openStops(page, 'Main');
  await expect(reopened.getByRole('textbox', { name: 'Latitude, Pecos', exact: true })).toHaveValue('39.912274');
});

test('import fills locations matched by stop ID and leaves a name match unapplied until it is checked', async ({ page }) => {
  await route(page, 'Stop location import');
  const drawer = await openStops(page, 'Main');
  await drawer.getByRole('button', { name: 'Show locations', exact: true }).click();
  await drawer.getByRole('button', { name: 'Add stop between A and B', exact: true }).click();
  await page.keyboard.type('Pecos');
  await drawer.getByRole('textbox', { name: 'Stop ID, Pecos', exact: true }).fill('126230');
  await drawer.getByRole('textbox', { name: 'Timepoint stop ID, A', exact: true }).fill('126108');
  await saveStops(page);

  const csv = [
    'Southbound',
    'BRT ID,Stop Name,Latitude,Longitude,Distance (miles),Speed Limit',
    '126108,Wagon Road,39.914169,-105.006705,0.71,40',
    '126230,120th & Pecos,39.912274,-104.99353,0.5,35',
    ',B,39.90,-105.00,,',
    '999,Elsewhere,39.80,-105.10,,',
  ].join('\r\n');
  await drawer.getByRole('button', { name: 'Stop actions', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Import stop locations…', exact: true }).click();
  await (await chooser).setFiles({ name: 'stops.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  const review = page.getByRole('dialog', { name: 'Import stop locations' });
  await expect(review.getByRole('table', { name: 'Matched by stop ID' }).getByRole('row')).toHaveText(['Drawer rowLocation', 'A39.914169, -105.006705 · 40 mph', 'Pecos39.912274, -104.99353 · 35 mph']);
  const nameMatch = review.getByRole('checkbox', { name: 'Apply to B', exact: true });
  await expect(nameMatch).not.toBeChecked();
  await expect(review).toContainText('Not found in the file');
  await expect(review).toContainText('line 6');
  await review.getByRole('button', { name: 'Apply 2 locations', exact: true }).click();
  await expect(review).toHaveCount(0);
  await expect(drawer.getByRole('textbox', { name: 'Latitude, timepoint B', exact: true })).toHaveValue('');
  await expect(drawer.getByRole('textbox', { name: 'Speed limit, Pecos', exact: true })).toHaveValue('35');

  // Again, checking the name match.
  await drawer.getByRole('button', { name: 'Stop actions', exact: true }).click();
  const second = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Import stop locations…', exact: true }).click();
  await (await second).setFiles({ name: 'stops.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await review.getByRole('checkbox', { name: 'Apply to B', exact: true }).check();
  await review.getByRole('button', { name: 'Apply 3 locations', exact: true }).click();
  await expect(drawer.getByRole('textbox', { name: 'Latitude, timepoint B', exact: true })).toHaveValue('39.9');
  await saveStops(page);
  const saved = await storedSet(page);
  expect(saved.locations).toEqual({ 'Main A': { latitude: 39.914169, longitude: -105.006705, speedLimitMph: 40 }, 'Main B': { latitude: 39.9, longitude: -105 } });
  expect(saved.stops[0]).toEqual(expect.objectContaining({ latitude: 39.912274, longitude: -104.99353, speedLimitMph: 35 }));
});
