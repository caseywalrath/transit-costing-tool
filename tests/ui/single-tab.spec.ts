// Review package P02 (issue I-002, findings 4-002 and 4-021; user decision 10): one tab at a time may write.
// The first tab to load is the active tab. A second tab opened in the same browser profile is read-only: its writes are
// rejected with a plain message and store nothing, so it can no longer overwrite or revert the active tab's work.
// Every test runs against real IndexedDB with the Federal BRT golden project.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { goldenRaw, goldenWithAltProfile } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';
import { editRuntimeCell, openRuntimes, runCommand, runtimeCell } from './support/ui';

test.setTimeout(120000);
test.use({ actionTimeout: 15000 });

const READ_ONLY = /read-only/i;
const ROUTE_SELECTION_KEY = 'transit-costing-tool.route-selection.v1';

async function load(page: Page) {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('/');
  await expect(page.getByLabel('Weekday annual service days')).toBeVisible({ timeout: 30000 });
}

/** `active` loads first and holds the lock; `readOnly` loads second, in the same browser profile, and sees the same data. */
async function twoTabs(browser: Browser, snapshot: unknown = goldenRaw()) {
  const context = await browser.newContext();
  const active = await context.newPage();
  await seedSnapshot(active, snapshot);
  await load(active);
  const readOnly = await context.newPage();
  await load(readOnly);
  return { context, active, readOnly };
}

async function expectRejected(page: Page) {
  await expect(page.locator('.notice.error').filter({ hasText: READ_ONLY })).toBeVisible({ timeout: 10000 });
}

test('a Node added in the active tab survives a Route edit attempted in the read-only tab', async ({ browser }) => {
  const { active, readOnly } = await twoTabs(browser);
  await active.getByRole('button', { name: 'New node', exact: true }).click();
  await active.getByLabel('Node name').last().fill('Active-added-node');
  await active.getByRole('button', { name: 'Save nodes', exact: true }).click();
  await expect.poll(() => runInPage(active, "return (await e.db.nodes.toArray()).some((node) => node.name === 'Active-added-node')")).toBe(true);

  const description = readOnly.getByLabel('Description').first();
  await description.fill('Read-only-description'); await description.blur();
  await expectRejected(readOnly);
  expect(await runInPage(active, "return (await e.db.nodes.toArray()).some((node) => node.name === 'Active-added-node')")).toBe(true);
  expect(await runInPage(active, "return (await e.db.routes.toArray()).some((route) => route.description === 'Read-only-description')")).toBe(false);
});

test('a Route rename in the active tab survives a Short name edit attempted in the read-only tab', async ({ browser }) => {
  const { active, readOnly } = await twoTabs(browser);
  const name = active.getByLabel('Route name'); await name.fill('Active-renamed'); await name.blur();
  await expect.poll(() => runInPage(active, 'return (await e.db.routes.toArray())[0].name')).toBe('Active-renamed');

  const shortName = readOnly.getByLabel('Short name', { exact: true }); await shortName.fill('RO'); await shortName.blur();
  await expectRejected(readOnly);
  const route = await runInPage(active, 'const route = (await e.db.routes.toArray())[0]; return { name: route.name, shortName: route.shortName }');
  expect(route.name).toBe('Active-renamed');
  expect(route.shortName).not.toBe('RO');
});

test('a Route added in the active tab survives an annual-count edit attempted in the read-only tab', async ({ browser }) => {
  const { active, readOnly } = await twoTabs(browser);
  await active.getByRole('button', { name: 'Route actions', exact: true }).click();
  await active.getByRole('menuitem', { name: 'New route', exact: true }).click();
  await expect.poll(() => runInPage(active, 'return await e.db.routes.count()')).toBe(2);

  const days = readOnly.getByLabel('Weekday annual service days'); await days.fill('254'); await days.press('Enter');
  await expectRejected(readOnly);
  expect(await runInPage(active, 'return await e.db.routes.count()')).toBe(2);
  expect(await runInPage(active, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').annualServiceDays")).not.toBe(254);
});

test('a Block reorder in the active tab survives an annual-count edit attempted in the read-only tab', async ({ browser }) => {
  const { active, readOnly } = await twoTabs(browser);
  await active.getByRole('button', { name: 'Blocking', exact: true }).click();
  const current = active.getByLabel('Current Block');
  await expect(current.locator('tbody tr').first()).toBeVisible({ timeout: 30000 });
  const order = "const block = (await e.db.blocks.toArray()).filter((candidate) => candidate.activities.length > 3)[0]; return block.activities.slice(0, 4).map((activity) => activity.id).join(',')";
  const before = await runInPage(active, order);
  await current.getByRole('button', { name: /Move.*down/i }).first().click();
  await expect.poll(() => runInPage(active, order)).not.toBe(before);
  const reordered = await runInPage(active, order);

  const days = readOnly.getByLabel('Weekday annual service days'); await days.fill('254'); await days.press('Enter');
  await expectRejected(readOnly);
  expect(await runInPage(active, order)).toBe(reordered);
});

test('a Runtime band value saved in the active tab survives a different band value saved in the read-only tab', async ({ browser }) => {
  const { active, readOnly } = await twoTabs(browser);
  for (const page of [active, readOnly]) {
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await openRuntimes(page);
    await expect(runtimeCell(page, 'Time band 1 segment 1')).toBeVisible({ timeout: 20000 });
  }
  const segments = "return (await e.db.runtimeProfiles.toArray()).filter((profile) => profile.name === 'Weekday workbook runtimes').map((profile) => profile.id + ':' + profile.bands[0].segmentRuntimeSeconds.join(',')).sort().join('|')";
  const before = await runInPage(active, segments);
  await editRuntimeCell(active, 'Time band 1 segment 1', ':09', 'Enter');
  await active.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => runInPage(active, segments)).not.toBe(before);
  const afterActive = await runInPage(active, segments);
  expect(afterActive).toContain('540');

  await editRuntimeCell(readOnly, 'Time band 1 segment 2', ':03', 'Enter');
  await readOnly.getByRole('button', { name: 'Save', exact: true }).click();
  await expectRejected(readOnly);
  expect(await runInPage(active, segments)).toBe(afterActive);
});

test('Costing assumptions saved in the active tab survive a save attempted in the read-only tab', async ({ browser }) => {
  const { active, readOnly } = await twoTabs(browser);
  for (const page of [active, readOnly]) {
    await page.getByRole('button', { name: 'Costing', exact: true }).click();
    await expect(page.getByLabel('Operating cost per Revenue Hour in USD')).toBeVisible({ timeout: 20000 });
  }
  await active.getByLabel('Operating cost per Revenue Hour in USD').fill('200');
  await active.getByRole('button', { name: 'Save assumptions', exact: true }).click();
  await expect.poll(() => runInPage(active, 'return (await e.db.costingAssumptions.toArray())[0]?.enteredRate')).toBe(200);

  await readOnly.getByLabel('Inflation rate (%)').fill('5');
  await readOnly.getByRole('button', { name: 'Save assumptions', exact: true }).click();
  await expectRejected(readOnly);
  const stored = await runInPage(active, 'const assumptions = (await e.db.costingAssumptions.toArray())[0]; return { rate: assumptions.enteredRate, escalation: assumptions.annualEscalation }');
  expect(stored.rate).toBe(200);
  expect(stored.escalation).not.toBe(0.05);
});

test('a Project deleted in the active tab is not resurrected by a Route edit in the read-only tab', async ({ browser }) => {
  const context = await browser.newContext();
  const active = await context.newPage();
  await seedSnapshot(active, goldenRaw());
  const ids = await runInPage(active, `
    const imported = await e.service.importProject(JSON.stringify(arg));
    const scenario = (await e.db.scenarios.where('projectId').equals(imported.id).toArray())[0];
    const route = (await e.db.routes.where('scenarioId').equals(scenario.id).toArray())[0];
    return { projectId: imported.id, scenarioId: scenario.id, routeId: route.id };`, goldenRaw());
  await active.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: ROUTE_SELECTION_KEY, value: ids });
  await load(active);
  const readOnly = await context.newPage();
  await load(readOnly);

  await active.getByRole('button', { name: /^Project: / }).click();
  await active.getByRole('menuitem', { name: 'Delete project…', exact: true }).click();
  await active.getByRole('button', { name: 'Delete project', exact: true }).last().click();
  await expect.poll(() => runInPage(active, 'return await e.db.projects.count()')).toBe(1);

  const description = readOnly.getByLabel('Description').first();
  await description.fill('After-delete'); await description.blur();
  await expectRejected(readOnly);
  const orphanRoutes = await runInPage(active, 'const scenarioIds = new Set((await e.db.scenarios.toArray()).map((scenario) => scenario.id)); return (await e.db.routes.toArray()).filter((route) => !scenarioIds.has(route.scenarioId)).length');
  expect(orphanRoutes).toBe(0);
});

async function buildThreeTrips(page: Page) {
  await runCommand(page, 'trips.build');
  const drawer = page.getByRole('complementary', { name: 'Build Trips' });
  await drawer.getByLabel('Pattern').selectOption({ index: 1 });
  await drawer.getByLabel('First Trip').fill('03:00');
  await drawer.getByLabel('Headway').fill('10');
  await drawer.getByLabel('Number of Trips').fill('3');
  await drawer.getByRole('button', { name: 'Build', exact: true }).click();
}

async function openTripsInBothTabs(active: Page, readOnly: Page) {
  for (const page of [active, readOnly]) {
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await openRuntimes(page);
    await expect(runtimeCell(page, 'Time band 1 segment 1')).toBeVisible({ timeout: 20000 });
  }
}

test('Build Trips in the read-only tab is rejected with a plain message and stores nothing', async ({ browser }) => {
  const { active, readOnly } = await twoTabs(browser);
  await openTripsInBothTabs(active, readOnly);
  const before = await runInPage(active, 'return await e.db.trips.count()');
  await buildThreeTrips(readOnly);
  await expect(readOnly.locator('.notice.error, [role="alert"]').filter({ hasText: READ_ONLY }).first()).toBeVisible({ timeout: 10000 });
  expect(await runInPage(active, 'return await e.db.trips.count()')).toBe(before);
});

test('Build Trips in the read-only tab stores nothing for a Trip profile the active tab deleted', async ({ browser }) => {
  const { active, readOnly } = await twoTabs(browser, goldenWithAltProfile());
  await openTripsInBothTabs(active, readOnly);
  const profileMenu = readOnly.locator('[aria-label="Trips section"] .menu-field').filter({ hasText: 'Profile' }).getByRole('button');
  await profileMenu.click(); await readOnly.getByRole('menuitemradio', { name: 'Alt' }).click();
  await runInPage(active, "await e.repository.deleteTripProfile('alt-profile')");
  const before = await runInPage(active, 'return await e.db.trips.count()');
  await buildThreeTrips(readOnly);
  await expect(readOnly.locator('.notice.error, [role="alert"]').filter({ hasText: /read-only|no longer available/i }).first()).toBeVisible({ timeout: 10000 });
  expect(await runInPage(active, 'return await e.db.trips.count()')).toBe(before);
  expect(await runInPage(active, "const ids = new Set((await e.db.tripProfiles.toArray()).map((profile) => profile.id)); return (await e.db.trips.toArray()).filter((trip) => !ids.has(trip.tripProfileId)).length")).toBe(0);
});

test('a tab on an older schema stops writing after another tab upgrades the database', async ({ page }) => {
  await seedSnapshot(page, goldenRaw());
  await load(page);
  const weekday = await runInPage(page, "return (await e.db.serviceDays.toArray()).find((day) => day.kind === 'weekday').name");

  // Another tab (newer code) opens the database at a higher version. The older connection must close so the upgrade can run.
  await page.evaluate(async () => {
    const request = indexedDB.open('transit-costing-tool');
    const current = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const next = current.version + 1;
    current.close();
    await new Promise<void>((resolve, reject) => {
      const upgrade = indexedDB.open('transit-costing-tool', next);
      upgrade.onsuccess = () => { upgrade.result.close(); resolve(); };
      upgrade.onerror = () => reject(upgrade.error);
      upgrade.onblocked = () => reject(new Error('The older connection did not close.'));
    });
  });

  const name = page.getByRole('textbox', { name: 'Weekday name' });
  await name.fill('Written after upgrade'); await name.blur();
  await page.waitForTimeout(1000);
  const stored = await page.evaluate(async () => {
    const request = indexedDB.open('transit-costing-tool');
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const days = await new Promise<any[]>((resolve, reject) => { const read = db.transaction('serviceDays').objectStore('serviceDays').getAll(); read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
    db.close();
    return days.find((day) => day.kind === 'weekday').name;
  });
  expect(stored).toBe(weekday);
  await expect(page.locator('.notice.error')).toBeVisible();
});

test('closing the active tab lets another open tab become active after reload, without data loss', async ({ browser }) => {
  const { active, readOnly } = await twoTabs(browser);
  const before = await runInPage(readOnly, 'return { trips: await e.db.trips.count(), blocks: await e.db.blocks.count() }');
  await active.close();
  await readOnly.reload();
  await expect(readOnly.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
  const name = readOnly.getByRole('textbox', { name: 'Weekday name' });
  await name.fill('Now active'); await name.blur();
  await expect.poll(() => runInPage(readOnly, "return (await e.db.serviceDays.toArray()).some((day) => day.name === 'Now active')")).toBe(true);
  expect(await runInPage(readOnly, 'return { trips: await e.db.trips.count(), blocks: await e.db.blocks.count() }')).toEqual(before);
});

test('the read-only tab can still open every workspace', async ({ browser }) => {
  const { readOnly } = await twoTabs(browser);
  for (const tab of ['Trips', 'Blocking', 'Costing', 'Route']) {
    await readOnly.getByRole('button', { name: tab, exact: true }).click();
    await expect(readOnly.getByRole('button', { name: tab, exact: true })).toBeVisible();
  }
  await expect(readOnly.getByLabel('Weekday annual service days')).toBeVisible();
});

test('control: a Blocking edit made from a stale view of the active tab is still refused by the source signature', async ({ page }) => {
  await seedSnapshot(page, goldenRaw());
  await load(page);
  await page.getByRole('button', { name: 'Blocking', exact: true }).click();
  const current = page.getByLabel('Current Block');
  await expect(current.locator('tbody tr').first()).toBeVisible({ timeout: 30000 });
  const order = "const block = (await e.db.blocks.toArray()).filter((candidate) => candidate.activities.length > 3)[0]; return block.activities.slice(0, 4).map((activity) => activity.id).join(',')";
  // A write that did not come through this tab's guarded connection changes the Blocking Scenario after the view was loaded.
  await runInPage(page, `
    const block = (await e.db.blocks.toArray()).filter((candidate) => candidate.activities.length > 3)[0];
    const [first, second, ...rest] = [...block.activities].sort((left, right) => left.sequence - right.sequence);
    await e.db.blocks.put({ ...block, activities: [second, first, ...rest].map((activity, index) => ({ ...activity, sequence: index })) });`);
  const changed = await runInPage(page, order);
  await current.getByRole('button', { name: /Move.*down/i }).nth(2).click();
  await expect(page.getByText('Blocking Scenario changed since the operation was reviewed')).toBeVisible({ timeout: 10000 });
  expect(await runInPage(page, order)).toBe(changed);
});

test('a read-only tab can still run a database upgrade', async ({ browser }) => {
  const context = await browser.newContext();
  const holder = await context.newPage();
  await holder.goto('/src/ui/styles/index.css');
  // Stand in for an active tab: hold the active-tab lock for the life of this page.
  await holder.evaluate(() => { void navigator.locks.request('transit-costing-tool.active-tab', () => new Promise(() => {})); });

  const page = await context.newPage();
  await page.goto('/src/ui/styles/index.css');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('transit-costing-tool', 4);
      request.onupgradeneeded = () => {
        const names = ['projects', 'scenarios', 'serviceDays', 'routes', 'nodes', 'patterns', 'directions', 'runtimeProfiles', 'runtimeAssignments', 'generationSets', 'tripProfiles', 'blockingScenarios', 'trips', 'blocks', 'costPlans', 'appMetadata'];
        for (const name of names) request.result.createObjectStore(name, { keyPath: name === 'appMetadata' ? 'key' : 'id' });
        const now = '2026-01-01T00:00:00.000Z';
        request.transaction!.objectStore('projects').put({ id: 'upgrade-project', name: 'Upgrade Project', distanceUnit: 'miles', currencyCode: 'USD', createdAt: now, updatedAt: now });
        request.transaction!.objectStore('scenarios').put({ id: 'upgrade-scenario', projectId: 'upgrade-project', name: 'Upgrade Scenario', createdAt: now, updatedAt: now });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Project: Upgrade Project', exact: true })).toBeVisible({ timeout: 30000 });
  const upgraded = await page.evaluate(async () => new Promise<{ version: number; tripProfiles: number }>((resolve, reject) => {
    const request = indexedDB.open('transit-costing-tool');
    request.onsuccess = () => {
      const database = request.result;
      const count = database.transaction('tripProfiles').objectStore('tripProfiles').count();
      count.onsuccess = () => { const version = database.version; database.close(); resolve({ version, tripProfiles: count.result }); };
      count.onerror = () => reject(count.error);
    };
    request.onerror = () => reject(request.error);
  }));
  expect(upgraded.version).toBeGreaterThanOrEqual(6);
  expect(upgraded.tripProfiles).toBe(1);
  // The tab is read-only: the upgrade was allowed, ordinary saves are not.
  await page.getByRole('button', { name: /^Project: / }).click();
  await page.getByRole('menuitem', { name: 'New project…', exact: true }).click();
  await page.locator('#dialog-name').fill('Should not save');
  await page.getByRole('button', { name: 'New Project', exact: true }).last().click();
  await expectRejected(page);
});
