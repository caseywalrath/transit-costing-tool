// Decision 0049: "Copy segments to other patterns…", "Fill from other patterns…", and "Undo last segment copy" in the Runtime profile menu.
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
  await runtimes(page).getByRole('button', { name: /Weekday workbook runtimes/ }).first().click();
  await page.getByRole('menu', { name: 'Runtime profile' }).getByRole('menuitem', { name: item }).click();
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
  await expect(dialog.getByText('No band with the same start and end time')).toBeVisible();

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
  await expect(page.getByRole('menu', { name: 'Runtime profile' }).getByRole('menuitem', { name: 'Undo last segment copy' })).toHaveCount(0);
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
