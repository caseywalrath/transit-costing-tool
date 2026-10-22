// Backs hand-off 2-002 (Trips workspace, staged Shift before 0:00). Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config <copy of p4-playwright.config.ts with a free port and testMatch p5-*.spec.ts> p5-trip-shift-negative
// Defect tests assert the EXPECTED behaviour and are marked test.fail(), so they report as passing while the defect exists.
// Measured: staging -6 minutes on a Trip departing 0:05 unmounts the whole React tree ("Service time must be a non-negative integer", src/domain/time.ts:3).
// Nothing is committed (IndexedDB unchanged, reload recovers), so the UI cannot persist negative times; the service layer does accept them (second test).
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './p3-fixture.ts';
import { SETUP } from './p3-env';

test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
const q = (page: Page, body: string, arg?: any) => page.evaluate(async ({ SETUP, body, arg }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool'); try { return await new Function('e', 'arg', `return (async()=>{${body}})()`)(e, arg); } finally { e.db.close(); } }, { SETUP, body, arg });
async function seedEarlyTrip(page: Page) {
  const b = goldenRaw(); const wk = b.serviceDays.find((d: any) => d.kind === 'weekday').id;
  const first = [...b.directions].sort((x: any, y: any) => x.sequence - y.sequence)[0];
  const patIds = new Set(b.patterns.filter((p: any) => p.directionId === first.id).map((p: any) => p.id));
  const trip = b.trips.filter((t: any) => t.serviceDayId === wk && patIds.has(t.patternId)).sort((x: any, y: any) => x.stopTimes[0].time - y.stopTimes[0].time)[0];
  const d = 300 - trip.stopTimes[0].time; trip.stopTimes = trip.stopTimes.map((s: any) => ({ ...s, time: s.time + d })); // first Trip departs 0:05
  await page.goto('/src/styles.css');
  await page.evaluate(async ({ SETUP, raw }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool'); await e.repository.saveProjectSnapshot({ ...raw, generationSets: raw.generationSets ?? [] }); e.db.close(); }, { SETUP, raw: b });
  return trip.id as string;
}

test('2-002 staging a Shift earlier than 0:00 keeps the app mounted and does not stage negative times', async ({ page }) => {
  test.fail();
  await page.setViewportSize({ width: 1400, height: 1000 });
  const tripId = await seedEarlyTrip(page);
  await page.goto('/'); await page.getByRole('button', { name: 'Trips', exact: true }).click(); await page.waitForTimeout(2500);
  await page.locator('.schedule-table tbody tr').first().getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Trip actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Shift selected…' }).click();
  await page.getByLabel('Shift minutes').fill('6'); await page.getByRole('button', { name: '− Back' }).click(); await page.waitForTimeout(1500);
  await expect(page.getByRole('button', { name: 'Trip actions', exact: true })).toBeVisible(); // observed: #root is empty (white screen)
  expect(await q(page, `return (await e.db.trips.get(arg)).stopTimes[0].time`, tripId)).toBeGreaterThanOrEqual(0);
});

test('2-002 the Trip service refuses a Shift that produces a negative service time', async ({ page }) => {
  test.fail();
  const tripId = await seedEarlyTrip(page);
  const outcome = await q(page, `try { await e.trips.applyTripShift([arg], -600); } catch (x) { return 'refused'; } return 'accepted: ' + (await e.db.trips.get(arg)).stopTimes[0].time`, tripId);
  expect(outcome).toBe('refused'); // observed: 'accepted: -300'; the Trips tab then throws on every render until the Trip is repaired
});
