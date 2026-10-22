// Backs Phase 4 S0 finding 4-001 (analyst claim A1-01, reproduced by the review lead).
// Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p4-playwright.config.ts p4-stale-records
// Each test asserts the EXPECTED behaviour (no data lost) and is marked test.fail(), so it reports as passing while the defect exists.
// Defect: App keeps Scenario records loaded at startup (App.tsx:134); Trips/Blocking/Runtime writes never refresh them; a Service day
// edit or a no-change blur of the Service day name (App.tsx:508 -> 254) calls updateServiceDay (routeDefinitionService.ts:419) with the
// stale records, and DexieRouteDefinitionRepository.saveScenarioRecords (dexieRepository.ts:92-142) deletes or reverts newer records.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { SETUP } from './p3-env';

const golden = () => JSON.parse(readFileSync(fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url)), 'utf8'));
const tripCount = (page: any) => page.evaluate(async ({ SETUP }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool'); const n = await e.db.trips.count(); e.db.close(); return n; }, { SETUP });
async function seed(page: any) {
  await page.goto('/src/styles.css');
  await page.evaluate(async ({ SETUP, raw }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool'); await e.repository.saveProjectSnapshot({ ...raw, generationSets: [] }); e.db.close(); }, { SETUP, raw: golden() });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
}

test('Trips built in the Trips workspace survive a no-change blur of the Service day name', async ({ page }) => {
  test.fail();
  await seed(page);
  await page.getByRole('button', { name: 'Trips', exact: true }).click();
  await page.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await page.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Build trips…' }).click();
  const drawer = page.getByRole('complementary', { name: 'Build Trips' });
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByLabel('First Trip').fill('03:00');
  await drawer.getByLabel('Headway').fill('10');
  await drawer.getByLabel('Number of Trips').fill('3');
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(drawer).toBeHidden({ timeout: 15000 });
  const built = await tripCount(page);
  await page.getByRole('button', { name: 'Route', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Weekday name' });
  await name.click(); await name.blur(); await page.waitForTimeout(1500);
  const after = await tripCount(page);
  console.log('[4-001] trips after build', built, 'after name blur', after); // observed at review: 987 -> 984
  expect(after).toBe(built);
});

test('a Trip time edit, a new Block, and a Runtime profile edit made after load survive a Service day name blur', async ({ page }) => {
  test.fail();
  await seed(page);
  const ids = await page.evaluate(async ({ SETUP }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool');
    const t = (await e.db.trips.toArray())[0]; await e.db.trips.put({ ...t, stopTimes: t.stopTimes.map((p: any) => ({ ...p, time: p.time + 60 })) });
    const b = (await e.db.blocks.toArray())[0]; await e.db.blocks.put({ ...b, id: 'p4-new-block', label: 'NEW', activities: [] });
    const rp = (await e.db.runtimeProfiles.toArray())[0]; await e.db.runtimeProfiles.put({ ...rp, name: 'EDITED-NAME' });
    e.db.close(); return { tripId: t.id, editedTime: t.stopTimes[0].time + 60, rpId: rp.id }; }, { SETUP });
  const name = page.getByRole('textbox', { name: 'Weekday name' });
  await name.click(); await name.blur(); await page.waitForTimeout(1500);
  const r = await page.evaluate(async ({ SETUP, ids }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool');
    const t = await e.db.trips.get(ids.tripId); const b = await e.db.blocks.get('p4-new-block'); const rp = await e.db.runtimeProfiles.get(ids.rpId); e.db.close();
    return { tripFirstTime: t.stopTimes[0].time, newBlockExists: Boolean(b), runtimeProfileName: rp.name }; }, { SETUP, ids });
  console.log('[4-001]', JSON.stringify(r)); // observed at review: time reverted, Block deleted, name reverted
  expect(r).toEqual({ tripFirstTime: ids.editedTime, newBlockExists: true, runtimeProfileName: 'EDITED-NAME' });
});
