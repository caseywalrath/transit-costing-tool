// Decision 0070, amended by Decision 0081 item 12: after a Change pattern, Trip actions offers "Undo changed the pattern of N trips". Undo restores the Trip's Pattern, stop
// times and provenance. The saved Trip is read back from IndexedDB, as in anchored-pattern-change.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { openGoldenTrips } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

test.setTimeout(90_000);

const FULL = 'Southbound: Wagon Road to Englewood';
const SHORT = 'Southbound: Westminster Station to Englewood';

/** The fixture values, read from the golden backup so the spec does not copy ids by hand. */
function goldenCase() {
  const backup = goldenRaw();
  const weekday = backup.serviceDays.find((day: any) => day.kind === 'weekday').id;
  const full = backup.patterns.find((pattern: any) => pattern.name === FULL);
  const short = backup.patterns.find((pattern: any) => pattern.name === SHORT);
  const trip = backup.trips
    .filter((item: any) => item.patternId === full.id && item.serviceDayId === weekday)
    .sort((a: any, b: any) => a.stopTimes[0].time - b.stopTimes[0].time)[0];
  return { tripId: trip.id as string, fullId: full.id as string, shortId: short.id as string, firstTime: trip.stopTimes[0].time as number };
}

async function readTrip(page: Page, tripId: string): Promise<any> {
  return page.evaluate((id) => new Promise<any>((resolve, reject) => {
    const opening = indexedDB.open('transit-costing-tool');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const request = db.transaction('trips', 'readonly').objectStore('trips').get(id);
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }), tripId);
}

test('Undo of a pattern change restores the Trip to its Pattern and first time', async ({ page }) => {
  const golden = goldenCase();
  await openGoldenTrips(page);
  await page.getByRole('checkbox', { name: `Select ${FULL}`, exact: true }).first().check();
  await runCommand(page, 'trips.changePattern');

  const dialog = page.getByRole('dialog', { name: 'Change the pattern of this trip' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('New pattern').selectOption({ label: SHORT });
  await dialog.getByRole('button', { name: 'Change pattern', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await readTrip(page, golden.tripId)).patternId).toBe(golden.shortId);

  // The item names the kind of change; it is the only undo item, in the same place as the regeneration undo.
  const actions = page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true });
  const menu = page.getByRole('menu', { name: 'Trip actions' });
  const undo = menu.getByRole('menuitem', { name: 'Undo changed the pattern of 1 trip', exact: true });
  // The item follows the reload of the Trips after the change; reopen the menu until it is there.
  await expect(async () => {
    if (await menu.isVisible()) await page.keyboard.press('Escape');
    await actions.click();
    await expect(undo).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await undo.click();

  await expect.poll(async () => (await readTrip(page, golden.tripId)).patternId).toBe(golden.fullId);
  const restored = await readTrip(page, golden.tripId);
  expect(restored.stopTimes[0].time).toBe(golden.firstTime);

  // The undo is itself recorded (Decision 0081 item 12), so the menu now offers to redo it.
  await actions.click();
  await expect(page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Redo changed the pattern of 1 trip', exact: true })).toBeEnabled();
});
