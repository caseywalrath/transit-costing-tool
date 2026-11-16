// ST6 (Decision 0079): the Trips tab's Stop trips drawer. The Federal BRT golden project is seeded with stops on two Southbound patterns:
// derived times, a timing rule change before saving, 30 s rounding, Save after reload, selected Trips as columns, one open edit at a time,
// side by side, and the 390 px layout. Real IndexedDB.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { seedSnapshot } from './support/dexieEnv';
import { chooseScope } from './support/ui';

test.setTimeout(150_000);
test.use({ actionTimeout: 15_000 });

const STAMP = '2026-11-16T00:00:00.000Z';
const EVANS = 'Southbound: Wagon Road to Evans';
const ENGLEWOOD = 'Southbound: Wagon Road to Englewood';

/** Golden plus one stop set: "Wagon Rd & 120th" (9001) between the first two timepoints of EVANS and ENGLEWOOD, and "Northgate" on EVANS only. */
function goldenWithStops() {
  const backup = goldenRaw();
  const pattern = (name: string) => backup.patterns.find((candidate: any) => candidate.name === name);
  const firstPoint = (name: string) => [...pattern(name).points].sort((left: any, right: any) => left.sequence - right.sequence)[0].id;
  const evans = pattern(EVANS);
  const set = {
    id: 'stop-set', scenarioId: evans.scenarioId, routeId: evans.routeId, roundingSeconds: 60,
    stops: [{ id: 'stop-120th', name: 'Wagon Rd & 120th', stopCode: '9001' }, { id: 'stop-northgate', name: 'Northgate' }],
    placementsByPatternId: {
      [evans.id]: [{ id: 'p-120th', stopId: 'stop-120th', afterPatternPointId: firstPoint(EVANS), sequence: 0, timing: 'interpolate' }, { id: 'p-northgate', stopId: 'stop-northgate', afterPatternPointId: firstPoint(EVANS), sequence: 1, timing: 'interpolate' }],
      [pattern(ENGLEWOOD).id]: [{ id: 'p-120th-e', stopId: 'stop-120th', afterPatternPointId: firstPoint(ENGLEWOOD), sequence: 0, timing: 'interpolate' }],
    },
    createdAt: STAMP, updatedAt: STAMP,
  };
  return { ...backup, routeStopSets: [set], generationSets: [] };
}

async function openGoldenWithStops(page: Page) {
  await seedSnapshot(page, goldenWithStops());
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Weekday' });
  await expect(page.locator('.trips-workspace .schedule-table tbody tr')).toHaveCount(138, { timeout: 30000 });
}

async function openStopTrips(page: Page, scope: Page | Locator = page) {
  await scope.getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Stop trips…', exact: true }).click();
  const drawer = page.getByRole('complementary', { name: 'Stop trips' });
  await expect(drawer.getByRole('table')).toBeVisible();
  return drawer;
}

/** The texts of one grid row's cells (name, timing, then one time per Trip). */
async function rowCells(drawer: Locator, name: string): Promise<string[]> {
  const row = drawer.locator('tbody tr').filter({ has: drawer.page().getByRole('rowheader', { name: new RegExp(`^${name}`) }) }).first();
  return row.locator('th, td').evaluateAll((cells) => cells.map((cell) => (cell.querySelector('select') as HTMLSelectElement | null)?.selectedOptions[0]?.text ?? (cell.textContent ?? '').trim()));
}
const seconds = (clock: string) => { const [h, m, s = '0'] = clock.split(':'); return Number(h) * 3600 + Number(m) * 60 + Number(s); };
const clock = (value: number) => `${Math.floor(value / 3600)}:${String(Math.floor(value % 3600 / 60)).padStart(2, '0')}${value % 60 ? `:${String(value % 60).padStart(2, '0')}` : ''}`;

test('shows derived stop times, updates them from an unsaved rule and 30 s rounding, and keeps the saved rules after reload', async ({ page }) => {
  await openGoldenWithStops(page);
  const drawer = await openStopTrips(page);
  await drawer.getByLabel('Pattern').selectOption({ label: EVANS });
  const first = await rowCells(drawer, 'Wagon Road');
  const second = await rowCells(drawer, '112th Ave');
  const a = seconds(first[2]); const b = seconds(second[2]);
  // Two interpolated stops between A and B, rounded down to the minute: the j-th at A + (B − A) × j / 3.
  const at = (j: number, r: number) => clock(Math.max(a, Math.floor((a * 3 + (b - a) * j) / (3 * r)) * r));
  expect((await rowCells(drawer, 'Wagon Rd & 120th')).slice(1, 3)).toEqual(['Inter.', at(1, 60)]);
  expect((await rowCells(drawer, 'Northgate')).slice(1, 3)).toEqual(['Inter.', at(2, 60)]);
  await expect(drawer.getByRole('rowheader', { name: /^Wagon Rd & 120th/ })).toContainText('9001');

  // An unsaved rule shows at once: Next timepoint takes B. Out of order ([next, interpolate]) shows the warning on the first row.
  await drawer.getByLabel('Timing, Wagon Rd & 120th').selectOption({ label: 'Next' });
  expect((await rowCells(drawer, 'Wagon Rd & 120th'))[2]).toBe(second[2]);
  await expect(drawer.getByRole('img', { name: 'Stop timing rules are out of order here.' })).toHaveCount(1);
  await drawer.getByLabel('Timing, Wagon Rd & 120th').selectOption({ label: 'Prev.' });
  expect((await rowCells(drawer, 'Wagon Rd & 120th'))[2]).toBe(first[2]);
  await expect(drawer.getByRole('img', { name: 'Stop timing rules are out of order here.' })).toHaveCount(0);

  // 30 s rounding: Northgate is now the only interpolated stop, at the midpoint rounded down to 30 s.
  await drawer.getByRole('radio', { name: '30 s', exact: true }).click();
  expect((await rowCells(drawer, 'Northgate'))[2]).toBe(clock(Math.max(a, Math.floor((a * 2 + (b - a)) / (2 * 30)) * 30)));
  await expect(drawer.getByRole('status').filter({ hasText: 'unsaved change' })).toHaveText('2 unsaved changes');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(drawer.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);

  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Weekday' });
  await expect(page.locator('.trips-workspace .schedule-table tbody tr')).toHaveCount(138, { timeout: 30000 });
  const reopened = await openStopTrips(page);
  await reopened.getByLabel('Pattern').selectOption({ label: EVANS });
  await expect(reopened.getByLabel('Timing, Wagon Rd & 120th')).toHaveValue('previous');
  await expect(reopened.getByRole('radio', { name: '30 s', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('selected Trips limit the columns, and the drawer, Shift, and Build trips are never open together', async ({ page }) => {
  await openGoldenWithStops(page);
  const rows = page.locator('.trips-workspace .schedule-table tbody tr');
  await rows.first().locator('input[type=checkbox]').check();
  const drawer = await openStopTrips(page);
  // The default pattern is the selected Trip's, and its only column is that Trip.
  await expect(drawer.getByRole('status').filter({ hasText: 'selected' })).toHaveText(/^1 of \d+ trips \(selected\)$/);
  await expect(drawer.locator('thead th')).toHaveCount(3);
  await expect(page.getByRole('toolbar', { name: 'Selected trips' }).first().getByRole('button', { name: 'Shift…', exact: true })).toBeDisabled();
  await expect(page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Build trips…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Build trips…', exact: true })).toBeEnabled();
});

test('side by side opens one Stop trips drawer at a time', async ({ page }) => {
  await openGoldenWithStops(page);
  await page.evaluate(() => localStorage.setItem('transit-costing-tool.trips-side-by-side.v1', JSON.stringify({ on: true })));
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await chooseScope(page, 'Day', { label: 'Weekday' });
  const southbound = page.locator('[aria-label="Southbound trips"]');
  const northbound = page.locator('[aria-label="Northbound trips"]');
  await expect(southbound).toBeVisible({ timeout: 30000 });
  const drawer = await openStopTrips(page, southbound);
  await expect(drawer.getByLabel('Pattern').locator('option', { hasText: EVANS })).toHaveCount(1);
  await openStopTrips(page, northbound);
  await expect(page.getByRole('complementary', { name: 'Stop trips' })).toHaveCount(1);
  await expect(page.getByRole('complementary', { name: 'Stop trips' }).getByLabel('Pattern').locator('option', { hasText: 'Northbound' }).first()).toBeAttached();
});

test('fits a 390 px screen without horizontal page scroll', async ({ page }) => {
  await openGoldenWithStops(page);
  const drawer = await openStopTrips(page);
  await drawer.getByLabel('Pattern').selectOption({ label: EVANS });
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await drawer.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await expect(drawer.getByRole('rowheader', { name: /^Northgate/ })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
