// Review package P04 (issues I-003, I-010, I-017): the Import JSON control restores a backup with Blocking Scenarios on two Trip
// Profiles with Block ownership unchanged, discards pre-Phase-4 placeholder Blocks, and refuses malformed Block data with a
// readable message and no write. Real IndexedDB, Federal BRT golden project.
import { expect, test, type Page } from '@playwright/test';
import { goldenRaw } from './support/goldenFixture';
import { runInPage, seedSnapshot } from './support/dexieEnv';

test.setTimeout(120000);

const STAMP = '2026-10-22T00:00:00.000Z';

/** The golden project plus a second Trip Profile and a Blocking Scenario on it. */
function withSecondBlockingScenario(): any {
  const backup = goldenRaw();
  const scenarioId = backup.scenarios[0].id;
  const weekday = backup.serviceDays.find((day: any) => day.kind === 'weekday').id;
  backup.tripProfiles.push({ id: 'alt-profile', scenarioId, name: 'Alt', createdAt: STAMP, updatedAt: STAMP });
  backup.trips.push(...backup.trips.filter((trip: any) => trip.serviceDayId === weekday).map((trip: any) => ({ ...trip, id: `alt-${trip.id}`, tripProfileId: 'alt-profile' })));
  backup.blockingScenarios.push({ id: 'alt-blocking', scenarioId, tripProfileId: 'alt-profile', name: 'Alt Blocks', createdAt: STAMP, updatedAt: STAMP });
  backup.blocks.push(...backup.blocks.filter((block: any) => block.serviceDayId === weekday).map((block: any) => ({
    ...block,
    id: `alt-${block.id}`,
    blockingScenarioId: 'alt-blocking',
    activities: block.activities.map((activity: any) => ({ ...activity, id: `alt-${activity.id}`, ...(activity.type === 'revenueTrip' ? { tripId: `alt-${activity.tripId}` } : {}) })),
  })));
  return backup;
}

/** The golden project as a version 4 file: Blocks are placeholders with a Trip Profile and no Blocking Scenario. */
function asVersion4(): any {
  const backup = goldenRaw();
  backup.exportSchemaVersion = 4;
  delete backup.blockingScenarios;
  delete backup.costingAssumptions;
  backup.blocks = backup.blocks.map(({ blockingScenarioId: _owner, ...rest }: any) => ({ ...rest, tripProfileId: backup.tripProfiles[0].id }));
  return backup;
}

async function openApp(page: Page) {
  await seedSnapshot(page, { ...goldenRaw(), generationSets: [] });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Weekday name' })).toBeVisible({ timeout: 30000 });
}

async function importFile(page: Page, backup: unknown) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
}

const projectCount = (page: Page) => runInPage(page, 'return await e.db.projects.count()');

test('restores a backup with a Blocking Scenario on each of two Trip Profiles, Block ownership unchanged', async ({ page }) => {
  await openApp(page);
  const original = withSecondBlockingScenario();
  await importFile(page, original);
  await expect(page.locator('.notice.success')).toContainText('as an independent project', { timeout: 30000 });

  const stored = await runInPage(page, `
    const projects = await e.db.projects.toArray();
    const imported = projects.find((project) => project.name.endsWith(' Copy'));
    const scenarioIds = (await e.db.scenarios.where('projectId').equals(imported.id).toArray()).map((scenario) => scenario.id);
    const blockingScenarios = (await e.db.blockingScenarios.toArray()).filter((scenario) => scenarioIds.includes(scenario.scenarioId));
    const profiles = new Map((await e.db.tripProfiles.toArray()).map((profile) => [profile.id, profile.name]));
    const blocks = (await e.db.blocks.toArray()).filter((block) => scenarioIds.includes(block.scenarioId));
    const perScenario = {};
    for (const scenario of blockingScenarios) perScenario[scenario.name + ' on ' + profiles.get(scenario.tripProfileId)] = blocks.filter((block) => block.blockingScenarioId === scenario.id).length;
    return { perScenario, withTripProfile: blocks.filter((block) => block.tripProfileId).length };`);
  const expected: Record<string, number> = {};
  for (const scenario of original.blockingScenarios) expected[`${scenario.name} on ${original.tripProfiles.find((profile: any) => profile.id === scenario.tripProfileId).name}`] = original.blocks.filter((block: any) => block.blockingScenarioId === scenario.id).length;
  expect(stored.perScenario).toEqual(expected);
  expect(stored.withTripProfile).toBe(0);
});

test('imports a version 4 backup without its placeholder Blocks', async ({ page }) => {
  await openApp(page);
  await importFile(page, asVersion4());
  await expect(page.locator('.notice.success')).toContainText('as an independent project', { timeout: 30000 });
  const stored = await runInPage(page, `
    const imported = (await e.db.projects.toArray()).find((project) => project.name.endsWith(' Copy'));
    const scenarioIds = (await e.db.scenarios.where('projectId').equals(imported.id).toArray()).map((scenario) => scenario.id);
    return { blocks: (await e.db.blocks.toArray()).filter((block) => scenarioIds.includes(block.scenarioId)).length, trips: (await e.db.trips.toArray()).filter((trip) => scenarioIds.includes(trip.scenarioId)).length };`);
  expect(stored.blocks).toBe(0);
  expect(stored.trips).toBeGreaterThan(0);
});

test('refuses a backup that assigns one Trip to two Blocks, with a readable message and nothing written', async ({ page }) => {
  await openApp(page);
  const before = await projectCount(page);
  const backup = goldenRaw();
  const tripId = backup.blocks[0].activities.find((activity: any) => activity.type === 'revenueTrip').tripId;
  const other = backup.blocks.find((block: any, index: number) => index > 0 && block.serviceDayId === backup.blocks[0].serviceDayId);
  other.activities.push({ id: 'duplicate-assignment', type: 'revenueTrip', sequence: other.activities.length, tripId });
  await importFile(page, backup);
  await expect(page.locator('.notice.error')).toContainText('Invalid project backup', { timeout: 15000 });
  await expect(page.locator('.notice.error')).toContainText('assigns a Trip that is already assigned');
  await expect(page.locator('.notice.error')).not.toContainText(/TypeError|Cannot read|undefined/);
  expect(await projectCount(page)).toBe(before);
});

test('refuses a backup with a pull-out Node that is not in its Scenario, naming the Block', async ({ page }) => {
  await openApp(page);
  const before = await projectCount(page);
  const backup = goldenRaw();
  const block = backup.blocks.find((candidate: any) => candidate.activities.some((activity: any) => activity.type === 'pullOut'));
  block.activities.find((activity: any) => activity.type === 'pullOut').toNodeId = 'node-that-does-not-exist';
  await importFile(page, backup);
  await expect(page.locator('.notice.error')).toContainText(`block "${block.label}" has a pull-out that references a Node that is not in its Scenario`, { timeout: 15000 });
  expect(await projectCount(page)).toBe(before);
});
