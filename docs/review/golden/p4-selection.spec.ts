// Backs findings B1-06..B1-08 (plan task 4.9, Decision 0021 item 8 selection integrity). Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config <copy of p4-playwright.config.ts with a free port> p4-selection
// Each defect test asserts the EXPECTED behaviour and is marked test.fail(), so it reports as passing while the defect exists.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './p3-fixture.ts';
import { SETUP } from './p3-env';

test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
const K1 = 'transit-costing-tool.route-selection.v1', K3 = 'transit-costing-tool.blocking-selection.v1';
const q = (page: Page, body: string, arg?: any) => page.evaluate(async ({ SETUP, body, arg }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool'); try { return await new Function('e', 'arg', `return (async()=>{${body}})()`)(e, arg); } finally { e.db.close(); } }, { SETUP, body, arg });
async function seed(page: Page, raw = goldenRaw()) {
  await page.goto('/src/styles.css');
  await page.evaluate(async ({ SETUP, raw }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool'); await e.repository.saveProjectSnapshot({ ...raw, generationSets: raw.generationSets ?? [] }); e.db.close(); }, { SETUP, raw });
}

test('B1-06 JSON null in route-selection.v1 must not blank the app on startup', async ({ page }) => {
  test.fail();
  await seed(page);
  await page.evaluate((K1) => localStorage.setItem(K1, 'null'), K1);
  await page.goto('/'); await page.waitForTimeout(2500);
  await expect(page.getByRole('button', { name: 'Project actions', exact: true })).toBeVisible(); // observed: #root empty, TypeError reading 'projectId' (App.tsx:41/178)
});

test('B1-06 JSON null in blocking-selection.v1 must not blank the app when Blocking opens', async ({ page }) => {
  test.fail();
  await seed(page);
  await page.evaluate((K3) => localStorage.setItem(K3, 'null'), K3);
  await page.goto('/'); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click(); await page.waitForTimeout(2000);
  await expect(page.getByRole('button', { name: 'Project actions', exact: true })).toBeVisible(); // observed: #root empty, TypeError reading 'minimumLayover' (BlockingWorkspace.tsx:32/183)
});

test('B1-07 a Project deleted in tab B is not resurrected as orphan rows by a Route edit in stale tab A', async ({ browser }) => {
  test.fail();
  const ctx = await browser.newContext(); const a = await ctx.newPage(); const b = await ctx.newPage();
  await seed(a);
  const ids = await q(a, `const raw = arg; const p2 = await e.service.importProject(JSON.stringify(raw)); const sc = (await e.db.scenarios.where('projectId').equals(p2.id).toArray())[0]; const r = (await e.db.routes.where('scenarioId').equals(sc.id).toArray())[0]; return { projectId: p2.id, scenarioId: sc.id, routeId: r.id };`, goldenRaw());
  await a.evaluate(({ K1, v }: any) => localStorage.setItem(K1, JSON.stringify(v)), { K1, v: ids });
  for (const p of [a, b]) { await p.setViewportSize({ width: 1400, height: 1000 }); await p.goto('/'); await expect(p.getByLabel('Weekday annual service days')).toBeVisible({ timeout: 30000 }); }
  await b.getByRole('button', { name: 'Project actions', exact: true }).click(); await b.getByRole('menuitem', { name: 'Delete project', exact: true }).click();
  await b.getByRole('button', { name: 'Delete project', exact: true }).last().click(); await b.waitForTimeout(2000);
  const d = a.getByLabel('Description').first(); await d.fill('A-after-delete'); await d.blur(); await a.waitForTimeout(1500);
  const orphanRoutes = await q(a, `const sid = new Set((await e.db.scenarios.toArray()).map(s=>s.id)); return (await e.db.routes.toArray()).filter(r=>!sid.has(r.scenarioId)).length`);
  expect(orphanRoutes).toBe(0); // observed: 1 Route whose Scenario was deleted with the Project
});

test('B1-08 Trips built in stale tab A on a Trip Profile deleted in tab B are not stored with a missing profile', async ({ browser }) => {
  test.fail();
  const { goldenWithAltProfile } = await import('./p3-fixture.ts');
  const ctx = await browser.newContext(); const a = await ctx.newPage(); const b = await ctx.newPage();
  await seed(a, goldenWithAltProfile());
  for (const p of [a, b]) { await p.setViewportSize({ width: 1400, height: 1000 }); await p.goto('/'); await expect(p.getByLabel('Weekday annual service days')).toBeVisible({ timeout: 30000 }); await p.getByRole('button', { name: 'Trips', exact: true }).click(); await p.waitForTimeout(2500); }
  const profileMenu = a.locator('[aria-label="Trips section"] .menu-field').filter({ hasText: 'Profile' }).getByRole('button');
  await profileMenu.click(); await a.getByRole('menuitemradio', { name: 'Alt' }).click(); await a.waitForTimeout(2000);
  await q(b, `await e.repository.deleteTripProfile('p3-alt-profile')`);
  await a.locator('[aria-label="Trips section"]').getByRole('button', { name: 'Trip actions', exact: true }).click();
  await a.getByRole('menu', { name: 'Trip actions' }).getByRole('menuitem', { name: 'Build trips…' }).click();
  const drawer = a.getByRole('complementary', { name: 'Build Trips' });
  await drawer.getByLabel('Pattern').selectOption({ index: 1 }); await drawer.getByLabel('First Trip').fill('03:00'); await drawer.getByLabel('Headway').fill('10'); await drawer.getByLabel('Number of Trips').fill('3');
  await drawer.getByRole('button', { name: 'Build', exact: true }).click(); await a.waitForTimeout(2500);
  const missing = await q(a, `const ids = new Set((await e.db.tripProfiles.toArray()).map(p=>p.id)); return (await e.db.trips.toArray()).filter(x=>!ids.has(x.tripProfileId)).length`);
  expect(missing).toBe(0); // observed: 3 Trips referencing the deleted Trip Profile, no error shown
});
