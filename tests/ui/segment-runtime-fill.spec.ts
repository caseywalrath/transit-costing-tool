import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Decision 0049: "Copy segments to other patterns…", "Fill from other patterns…", and "Undo last segment copy" in the Runtime actions menu.
// The golden Weekday profiles of the Southbound patterns overlap: Wagon Road to Evans and Westminster Station to Englewood share five segments,
// and Wagon Road to Englewood has one all-day band, so its bands never match the others.
import { expect, test, type Page } from '@playwright/test';
import { runInPage } from './support/dexieEnv';
import { openGoldenTrips } from './support/tripsWorkspace';
import { openRuntimes, region } from './support/ui';

const WAGON_TO_EVANS = 'Southbound: Wagon Road to Evans';
const WESTMINSTER_TO_ENGLEWOOD = 'Southbound: Westminster Station to Englewood';
const runtimes = (page: Page) => region(page, 'runtimes');

/** The first band's five shared segments of a Weekday profile of `patternName`: Wagon Road to Evans uses segments 3 to 7, Westminster to Englewood 0 to 4. */
const sharedCells = (page: Page, patternName: string) => runInPage(page, `
  const pattern = (await e.db.patterns.toArray()).find((item) => item.name === arg);
  const day = (await e.db.serviceDays.toArray()).find((item) => item.kind === 'weekday');
  const assignment = (await e.db.runtimeAssignments.toArray()).find((item) => item.patternId === pattern.id && item.serviceDayId === day.id);
  const profile = await e.db.runtimeProfiles.get(assignment.runtimeProfileId);
  const from = arg === ${JSON.stringify(WAGON_TO_EVANS)} ? 3 : 0;
  return profile.bands[0].segmentRuntimeSeconds.slice(from, from + 5);
`, patternName) as Promise<number[]>;

/**
 * The golden Weekday band times differ between the patterns, so nothing would match. This gives the Westminster-to-Englewood profile the
 * band times of the Wagon-to-Evans profile and sets its first five segments (the ones the two patterns share) to `value`.
 */
const setWestminsterShared = (page: Page, value: number) => runInPage(page, `
  const patterns = await e.db.patterns.toArray();
  const weekdayProfile = async (name) => { const pattern = patterns.find((item) => item.name === name); return (await e.db.runtimeProfiles.toArray()).find((item) => item.patternId === pattern.id && item.name.startsWith('Weekday')); };
  const wagon = await weekdayProfile(${JSON.stringify(WAGON_TO_EVANS)});
  const profile = await weekdayProfile(${JSON.stringify(WESTMINSTER_TO_ENGLEWOOD)});
  const tail = profile.bands[0].segmentRuntimeSeconds.slice(5);
  await e.db.runtimeProfiles.put({ ...profile, bands: wagon.bands.map((band, sequence) => ({ id: 'aligned-' + band.id, label: band.label, sequence, startTime: band.startTime, endTime: band.endTime, segmentRuntimeSeconds: [...Array(5).fill(arg), ...tail] })) });
`, value);

async function openPattern(page: Page, patternName: string) {
  await page.reload();
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await openRuntimes(page);
  await runtimes(page).getByRole('combobox', { name: 'Pattern' }).selectOption({ label: patternName });
  await expect(runtimes(page).locator('.profile-usage')).toContainText(patternName);
}

async function openAction(page: Page, item: string) {
  await runtimes(page).getByRole('button', { name: 'Runtime actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Runtime actions' }).getByRole('menuitem', { name: item }).click();
}

test('copy shows an include box for each target, disables the confirm button when nothing would change, and undo restores the values', async ({ page }) => {
  await openGoldenTrips(page);
  await setWestminsterShared(page, 999);
  await openPattern(page, WAGON_TO_EVANS);
  const source = await sharedCells(page, WAGON_TO_EVANS);

  await openAction(page, 'Copy segments to other patterns…');
  const dialog = page.getByRole('dialog', { name: 'Copy segments to other patterns' });
  await expect(dialog).toBeVisible();
  const target = dialog.getByRole('checkbox', { name: `Include ${WESTMINSTER_TO_ENGLEWOOD} · Weekday workbook runtimes` });
  await expect(target).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Replace runtimes' })).toBeEnabled();
  // Decision 0074: bands pair by overlap. Wagon Road–Evans has more bands than this target pairs one to one, so a shared target band is reported.
  await expect(dialog.getByText('More than one period would copy into this period')).toBeVisible();

  await target.uncheck();
  await expect(dialog.getByText('No runtimes would change.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Replace runtimes' })).toBeDisabled();
  await target.check();
  await dialog.getByRole('button', { name: 'Show cell details' }).click();
  await expect(dialog.locator('#segment-runtime-details li').first()).toContainText('→');
  await dialog.getByRole('button', { name: 'Replace runtimes' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await sharedCells(page, WESTMINSTER_TO_ENGLEWOOD)).toEqual(source);

  await openAction(page, 'Undo last segment copy');
  await expect.poll(() => sharedCells(page, WESTMINSTER_TO_ENGLEWOOD)).toEqual([999, 999, 999, 999, 999]);
  await runtimes(page).getByRole('button', { name: /Weekday workbook runtimes/ }).first().click();
  await expect(page.getByRole('menu', { name: 'Runtime actions' }).getByRole('menuitem', { name: 'Undo last segment copy' })).toHaveCount(0);
});

test('fill writes only the cells that are :00 and leaves the segments the other pattern does not share', async ({ page }) => {
  await openGoldenTrips(page);
  await setWestminsterShared(page, 0);
  const expected = await sharedCells(page, WAGON_TO_EVANS);
  await openPattern(page, WESTMINSTER_TO_ENGLEWOOD);

  await openAction(page, 'Fill from other patterns…');
  const dialog = page.getByRole('dialog', { name: 'Fill from other patterns' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Fill runtimes' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Fill runtimes' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await sharedCells(page, WESTMINSTER_TO_ENGLEWOOD)).toEqual(expected);

  // Nothing is left to fill.
  await openAction(page, 'Fill from other patterns…');
  const again = page.getByRole('dialog', { name: 'Fill from other patterns' });
  await expect(again.getByText('No runtimes would change.')).toBeVisible();
  await expect(again.getByRole('button', { name: 'Fill runtimes' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(again).toHaveCount(0);
});

test('the copy dialog has no horizontal page scroll at 390 px wide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openGoldenTrips(page);
  await setWestminsterShared(page, 999);
  await openPattern(page, WAGON_TO_EVANS);
  // The Pattern select sizes to its longest option. Lengthen one so the check does not depend on the runner's font metrics.
  await page.evaluate(() => { const select = [...document.querySelectorAll('select')].find((item) => item.textContent?.includes('Wagon Road to Evans')); if (select) select.options[0].textContent += ' with a deliberately long pattern name'; });
  await openAction(page, 'Copy segments to other patterns…');
  const dialog = page.getByRole('dialog', { name: 'Copy segments to other patterns' });
  await expect(dialog.getByRole('button', { name: 'Replace runtimes' })).toBeVisible();
  // The include box is inside the dialog, not scrolled out of the table.
  const include = await dialog.getByRole('checkbox').first().boundingBox();
  expect(include!.x).toBeGreaterThanOrEqual(0);
  expect(include!.x + include!.width).toBeLessThanOrEqual(390);
  expect(include!.x).toBeGreaterThanOrEqual((await dialog.boundingBox())!.x);
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('fill shows the time-period pairing for each other pattern, and a pair can be changed (R9)', async ({ page }) => {
  await openGoldenTrips(page);
  await setWestminsterShared(page, 0);
  await openPattern(page, WESTMINSTER_TO_ENGLEWOOD);
  await openAction(page, 'Fill from other patterns…');
  const dialog = page.getByRole('dialog', { name: 'Fill from other patterns' });
  const map = dialog.getByRole('table', { name: new RegExp(`^Time periods paired with ${WAGON_TO_EVANS}`) });
  await expect(map).toBeVisible();
  // Golden bands differ by pattern, so every period is paired by overlap, not by identical times.
  const selects = map.getByRole('combobox');
  await expect(selects).toHaveCount(await map.locator('tbody tr').count());
  await expect(map.locator('tbody tr').first().locator('td').nth(2)).toHaveText(/^\d+%$/);
  // A pair set to None is marked as changed, and the review is rebuilt with it (no overlap to show).
  await selects.first().selectOption('');
  await expect(map.locator('tbody tr').first()).toHaveClass(/segment-band-map__changed/);
  await expect(map.locator('tbody tr').first().locator('td').nth(2)).toHaveText('—');
  await expect(dialog.getByRole('button', { name: 'Fill runtimes' })).toBeEnabled();
  await page.keyboard.press('Escape');
});

test('Compare patterns highlights differences, and Use this value for writes it and can be undone (R11)', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await openGoldenTrips(page);
  await openPattern(page, WAGON_TO_EVANS);
  await openAction(page, 'Compare patterns…');
  const dialog = page.getByRole('dialog', { name: /^Compare runtimes/ });
  await expect(dialog).toBeVisible();
  const count = dialog.getByRole('status');
  await expect(count).toHaveText(/^\d+ differences?$/);
  const before = Number((await count.textContent())!.split(' ')[0]);
  expect(before).toBeGreaterThan(0);
  const source = readFileSync(fileURLToPath(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url)), 'utf8');
  await page.addScriptTag({ content: source });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: unknown[] }> }> }> } }).axe;
    const result = await axe.run(document.querySelector('[role=dialog]'), { runOnly: { type: 'rule', values: ['aria-dialog-name', 'label', 'scope-attr-valid', 'color-contrast', 'target-size', 'button-name'] } });
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).slice(0, 3).join(' | ')}`);
  });
  expect(violations).toEqual([]);

  await dialog.locator('.compare-runtimes-diff button').first().click();
  const use = dialog.getByRole('group', { name: /^Use :\d\d for$/ });
  await expect(use).toBeVisible();
  await use.getByRole('button', { name: /^Apply to \d+$/ }).click();
  await expect(use).toHaveCount(0);
  // The count is not checked: with periods that do not line up, a copied value can disagree with another period of the source pattern.

  // The By time view lists one row per clock interval.
  await dialog.getByRole('button', { name: 'By time', exact: true }).click();
  await expect(dialog.locator('tbody tr').first().locator('th')).toHaveText(/^\d+:\d\d(:\d\d)?–\d+:\d\d(:\d\d)?$/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  // The write is a segment copy: Undo last segment copy is offered.
  await runtimes(page).getByRole('button', { name: 'Runtime actions', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Runtime actions' }).getByRole('menuitem', { name: 'Undo last segment copy' })).toBeVisible();
});
