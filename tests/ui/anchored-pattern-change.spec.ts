// Decision 0067: Change pattern keeps the time at an anchor node. The golden project's first weekday Southbound Trip on "Wagon Road to
// Englewood" (11 points) moves to "Westminster Station to Englewood" (8 points). Evans is served by both Patterns, and the Trip keeps its
// saved time there. The saved Trip is read back from IndexedDB, so the check does not depend on the table layout.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { openGoldenTrips } from './support/tripsWorkspace';
import { runCommand } from './support/ui';

test.setTimeout(90_000);

const FULL = 'Southbound: Wagon Road to Englewood';
const SHORT = 'Southbound: Westminster Station to Englewood';
const ANCHOR = 'Evans';

/** The fixture values, read from the golden backup so the spec does not copy ids by hand. */
function goldenCase() {
  const backup = goldenRaw();
  const weekday = backup.serviceDays.find((day: any) => day.kind === 'weekday').id;
  const full = backup.patterns.find((pattern: any) => pattern.name === FULL);
  const short = backup.patterns.find((pattern: any) => pattern.name === SHORT);
  const nodeId = backup.nodes.find((node: any) => node.name === ANCHOR).id;
  const trip = backup.trips
    .filter((item: any) => item.patternId === full.id && item.serviceDayId === weekday)
    .sort((a: any, b: any) => a.stopTimes[0].time - b.stopTimes[0].time)[0];
  const keptTime: number = trip.stopTimes.find((point: any) => point.patternPointId === full.points.find((point: any) => point.nodeId === nodeId).id).time;
  return { tripId: trip.id as string, shortId: short.id as string, keptTime, targetPointId: short.points.find((point: any) => point.nodeId === nodeId).id as string };
}

/** Seconds after midnight to HH:MM, for a whole-minute time. */
function clock(seconds: number): string {
  if (seconds % 60 !== 0) throw new Error(`Expected a whole-minute time, got ${seconds}`);
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;
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

test('Change pattern anchored at a shared node keeps that node time on the Trip', async ({ page }) => {
  const golden = goldenCase();
  await openGoldenTrips(page);
  await page.getByRole('checkbox', { name: `Select ${FULL}`, exact: true }).first().check();
  await runCommand(page, 'trips.changePattern');

  const dialog = page.getByRole('dialog', { name: 'Change pattern of this trip' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(FULL, { exact: true })).toBeVisible();
  await dialog.getByLabel('Target pattern').selectOption({ label: SHORT });

  // The anchor list holds First stop and the nodes both Patterns serve. Wagon Road is served only by the full Pattern.
  const anchor = dialog.getByLabel('Anchor');
  await expect(anchor.locator('option', { hasText: ANCHOR })).toHaveCount(1);
  const options = await anchor.locator('option').allTextContents();
  expect(options[0]).toBe('First stop');
  expect(options).not.toContain('Wagon Road');
  await anchor.selectOption({ label: ANCHOR });

  await dialog.getByRole('button', { name: 'Review change', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText(`Keeps ${ANCHOR} at ${clock(golden.keptTime)}.`);
  await dialog.getByRole('button', { name: 'Change pattern', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // The saved Trip is on the target Pattern, its time at the anchor node is unchanged, and the change is recorded as a pattern change.
  const saved = await readTrip(page, golden.tripId);
  expect(saved.patternId).toBe(golden.shortId);
  expect(saved.stopTimes.find((point: any) => point.patternPointId === golden.targetPointId)?.time).toBe(golden.keptTime);
  expect(saved.provenance.manuallyChangedFields).toContain('patternId');
});

test('Batch Change pattern lists the target Pattern nodes as anchors, with First stop first', async ({ page }) => {
  await openGoldenTrips(page);
  await page.getByRole('checkbox', { name: `Select ${FULL}`, exact: true }).first().check();
  await page.getByRole('checkbox', { name: `Select ${FULL}`, exact: true }).nth(1).check();
  await runCommand(page, 'trips.changePattern');

  const dialog = page.getByRole('dialog', { name: 'Change selected patterns' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Target pattern').selectOption({ label: SHORT });
  const options = await dialog.getByLabel('Anchor').locator('option').allTextContents();
  expect(options[0]).toBe('First stop');
  expect(options).toContain(ANCHOR);
  expect(options).not.toContain('Wagon Road');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
