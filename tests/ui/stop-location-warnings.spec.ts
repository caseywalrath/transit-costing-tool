// Decision 0093: location warnings in the Stops drawer. A location out of line with its neighbours (a missing minus sign) is named on its
// own row only, and goes when corrected; a timepoint stop ID entered at a place more than 30 m from another pattern's place for the same
// stop ID is named with that place. Warnings never block saving. Real IndexedDB.
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

const warnings = (page: Page) => drawerOf(page).locator('.pattern-stops-warning');

test('warns of a location out of line, and of a stop ID at two places, without blocking the save', async ({ page }) => {
  await route(page, 'Location warnings');
  let drawer = await openStops(page, 'Main');
  await drawer.getByRole('button', { name: 'Show locations', exact: true }).click();
  await drawer.getByRole('textbox', { name: 'Latitude, timepoint A', exact: true }).fill('39.70, -105.025');
  await drawer.getByRole('textbox', { name: 'Latitude, timepoint B', exact: true }).fill('39.71, 105.025');
  await drawer.getByRole('textbox', { name: 'Latitude, timepoint C', exact: true }).fill('39.72, -105.025');
  await expect(warnings(page)).toHaveCount(1);
  await expect(warnings(page)).toContainText(/out of line with the stops next to it\. Check for a missing minus sign/);
  // The warning sits under timepoint B's row.
  await expect(drawer.locator('tr', { has: page.getByRole('textbox', { name: 'Latitude, timepoint B', exact: true }) }).locator('+ tr')).toHaveClass(/pattern-stops-warning/);
  // Screenshot for review, only when SLW_SHOTS names an output folder.
  if (process.env.SLW_SHOTS) await drawer.screenshot({ path: `${process.env.SLW_SHOTS}/out-of-line.png` });
  await drawer.getByRole('textbox', { name: 'Longitude, timepoint B', exact: true }).fill('-105.025');
  await expect(warnings(page)).toHaveCount(0);

  await drawer.getByRole('textbox', { name: 'Timepoint stop ID, A', exact: true }).fill('13703');
  await saveStops(page);

  // The Short pattern's A, with the same stop ID about 550 m away.
  drawer = await openStops(page, 'Short');
  await drawer.getByRole('textbox', { name: 'Timepoint stop ID, A', exact: true }).fill('13703');
  await drawer.getByRole('textbox', { name: 'Latitude, timepoint A', exact: true }).fill('39.705, -105.025');
  await expect(warnings(page)).toHaveCount(1);
  await expect(warnings(page)).toContainText('Stop ID 13703 is 556 m from here at A on Main.');
  if (process.env.SLW_SHOTS) await drawer.screenshot({ path: `${process.env.SLW_SHOTS}/stop-id-elsewhere.png` });
  await saveStops(page);
  await expect(warnings(page)).toHaveCount(1);
  await drawer.getByRole('textbox', { name: 'Latitude, timepoint A', exact: true }).fill('39.70');
  await expect(warnings(page)).toHaveCount(0);
});
