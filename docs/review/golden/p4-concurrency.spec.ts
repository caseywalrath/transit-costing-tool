// Backs finding B1-01..B1-05 (plan task 4.6, cross-tab lost updates; B1-01 is the cross-tab form of S0 4-001). Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config <copy of p4-playwright.config.ts with a free port> p4-concurrency
// Two pages (tabs) of ONE browser context share one IndexedDB. Tab B saves first; stale tab A then saves a different edit to the same aggregate.
// Each defect test asserts the EXPECTED behaviour (B's edit survives, or A is refused) and is marked test.fail(), so it reports as passing while the defect exists.
// The last test is a passing control: Blocking writes carry a source signature and A is refused.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { goldenRaw } from './p3-fixture.ts';
import { SETUP } from './p3-env';

test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
const q = (page: Page, body: string) => page.evaluate(async ({ SETUP, body }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool'); try { return await new Function('e', `return (async()=>{${body}})()`)(e); } finally { e.db.close(); } }, { SETUP, body });
async function twoTabs(browser: Browser, seedTab: 'route' | 'trips' | 'costing' | 'blocking' = 'route') {
  const ctx = await browser.newContext(); const a = await ctx.newPage(); const b = await ctx.newPage();
  await a.goto('/src/styles.css');
  await a.evaluate(async ({ SETUP, raw }: any) => { const env = await new Function(SETUP)(); const e = env.make('transit-costing-tool'); await e.repository.saveProjectSnapshot({ ...raw, generationSets: raw.generationSets ?? [] }); e.db.close(); }, { SETUP, raw: goldenRaw() });
  for (const p of [a, b]) { await p.setViewportSize({ width: 1400, height: 1000 }); await p.goto('/'); await expect(p.getByLabel('Weekday annual service days')).toBeVisible({ timeout: 30000 }); }
  return { a, b };
}

test('B1-02 Route aggregate: a Node added in tab B survives a Route description edit in stale tab A', async ({ browser }) => {
  test.fail();
  const { a, b } = await twoTabs(browser);
  await b.getByRole('button', { name: 'New node', exact: true }).click();
  await b.getByLabel('Node name').last().fill('B-added-node');
  await b.getByRole('button', { name: 'Save nodes', exact: true }).click(); await b.waitForTimeout(1500);
  expect(await q(a, `return (await e.db.nodes.toArray()).some(n => n.name === 'B-added-node')`)).toBe(true);
  const d = a.getByLabel('Description').first(); await d.fill('A-description'); await d.blur(); await a.waitForTimeout(1500);
  expect(await q(a, `return (await e.db.nodes.toArray()).some(n => n.name === 'B-added-node')`)).toBe(true); // observed: false, silently deleted
});

test('B1-02 Route aggregate: a Route rename in tab B survives a Short name edit in stale tab A', async ({ browser }) => {
  test.fail();
  const { a, b } = await twoTabs(browser);
  const n = b.getByLabel('Route name'); await n.fill('B-renamed'); await n.blur(); await b.waitForTimeout(1000);
  const s = a.getByLabel('Short name', { exact: true }); await s.fill('A-short'); await s.blur(); await a.waitForTimeout(1500);
  expect(await q(a, `return (await e.db.routes.toArray())[0].name`)).toBe('B-renamed'); // observed: 'Federal Boulevard BRT'
});

test('B1-01 Scenario records: a Route added in tab B survives an annual-count edit in stale tab A (cross-tab 4-001)', async ({ browser }) => {
  test.fail();
  const { a, b } = await twoTabs(browser);
  await b.getByRole('button', { name: 'Route actions', exact: true }).click(); await b.getByRole('menuitem', { name: 'New route', exact: true }).click(); await b.waitForTimeout(1000);
  expect(await q(a, `return await e.db.routes.count()`)).toBe(2);
  const f = a.getByLabel('Weekday annual service days'); await f.fill('256'); await f.press('Enter'); await a.waitForTimeout(1500);
  expect(await q(a, `return await e.db.routes.count()`)).toBe(2); // observed: 1, B's Route silently deleted
});

test('B1-01 Scenario records: a Block reorder in tab B survives an annual-count edit in stale tab A', async ({ browser }) => {
  test.fail();
  const { a, b } = await twoTabs(browser);
  await b.getByRole('button', { name: 'Blocking', exact: true }).click();
  const cur = b.getByLabel('Current Block'); await expect(cur.locator('tbody tr').first()).toBeVisible({ timeout: 30000 });
  const order = `const k=(await e.db.blocks.toArray()).filter(k=>k.activities.length>3)[0]; return k.activities.slice(0,4).map(a=>a.id).join(',')`;
  const before = await q(a, order);
  await cur.getByRole('button', { name: /Move.*down/i }).first().click(); await b.waitForTimeout(1200);
  const afterB = await q(a, order); expect(afterB).not.toBe(before);
  const f = a.getByLabel('Weekday annual service days'); await f.fill('256'); await f.press('Enter'); await a.waitForTimeout(1500);
  expect(await q(a, order)).toBe(afterB); // observed: reverted to the pre-B order
});

test('B1-03 Runtime profile: a band value saved in tab B survives a different band value saved in stale tab A', async ({ browser }) => {
  test.fail();
  const { a, b } = await twoTabs(browser);
  for (const p of [a, b]) { await p.getByRole('button', { name: 'Trips', exact: true }).click(); await expect(p.getByLabel('Time band 1 segment 1')).toBeVisible({ timeout: 20000 }); }
  const seg = `const p=(await e.db.runtimeProfiles.toArray()).filter(p=>p.name==='Weekday workbook runtimes')[3]; return p.bands[0].segmentRuntimeSeconds.slice(0,2).join(',')`;
  // The Trips tab opens the Southbound Wagon Road -> Evans profile; read its id from the UI-independent store by value change instead of index: compare all profiles.
  const all = `return (await e.db.runtimeProfiles.toArray()).filter(p=>p.name==='Weekday workbook runtimes').map(p=>p.id+':'+p.bands[0].segmentRuntimeSeconds.join(',')).sort().join('|')`;
  const before = await q(a, all);
  const f = b.getByLabel('Time band 1 segment 1'); await f.fill(':09'); await f.press('Enter'); await b.getByRole('button', { name: 'Save', exact: true }).click(); await b.waitForTimeout(1500);
  const afterB = await q(a, all); expect(afterB).not.toBe(before);
  const g = a.getByLabel('Time band 1 segment 2'); await g.fill(':03'); await g.press('Enter'); await a.getByRole('button', { name: 'Save', exact: true }).click(); await a.waitForTimeout(1500);
  const afterA = await q(a, all);
  expect(afterA).toContain('540'); // B's :09 segment 1 (540 s) must still be stored; observed: reverted to 300 while A's segment 2 change was kept
  void seg;
});

test('B1-04 Costing assumptions: a rate saved in tab B survives an inflation edit saved in stale tab A', async ({ browser }) => {
  test.fail();
  const { a, b } = await twoTabs(browser);
  await a.getByRole('button', { name: 'Costing', exact: true }).click(); await expect(a.getByLabel('Operating cost per Revenue Hour in USD')).toBeVisible({ timeout: 20000 });
  await a.getByLabel('Operating cost per Revenue Hour in USD').fill('100'); await a.getByRole('button', { name: 'Save', exact: true }).click(); await a.waitForTimeout(1000);
  for (const p of [a, b]) { await p.reload(); await p.getByRole('button', { name: 'Costing', exact: true }).click(); await expect(p.getByLabel('Operating cost per Revenue Hour in USD')).toHaveValue('100', { timeout: 20000 }); }
  await b.getByLabel('Operating cost per Revenue Hour in USD').fill('200'); await b.getByRole('button', { name: 'Save', exact: true }).click(); await b.waitForTimeout(1000);
  await a.getByLabel('Inflation Rate (%)').fill('5'); await a.getByRole('button', { name: 'Save', exact: true }).click(); await a.waitForTimeout(1000);
  expect(await q(a, `return (await e.db.costingAssumptions.toArray())[0].enteredRate`)).toBe(200); // observed: 100
});

test('control: a Blocking edit from a stale tab is refused (source signature)', async ({ browser }) => {
  const { a, b } = await twoTabs(browser);
  for (const p of [a, b]) { await p.getByRole('button', { name: 'Blocking', exact: true }).click(); await expect(p.getByLabel('Current Block').locator('tbody tr').first()).toBeVisible({ timeout: 30000 }); }
  const order = `const k=(await e.db.blocks.toArray()).filter(k=>k.activities.length>3)[0]; return k.activities.slice(0,4).map(a=>a.id).join(',')`;
  await b.getByLabel('Current Block').getByRole('button', { name: /Move.*down/i }).first().click(); await b.waitForTimeout(1200);
  const afterB = await q(a, order);
  await a.getByLabel('Current Block').getByRole('button', { name: /Move.*down/i }).nth(2).click(); await a.waitForTimeout(1500);
  expect(await q(a, order)).toBe(afterB);
  await expect(a.getByText('Blocking Scenario changed since the operation was reviewed')).toBeVisible();
});
