// Phase 3 browser reproduction. Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p3-playwright.config.ts p3-migrations
// Backs task 3.1 verdicts (no defect). Asserts CURRENT behaviour; passes.
// Phase 3 task 3.1: real Dexie upgrades in Chromium from seeded v1-v5 databases.
// Seeds use Dexie itself (taken from TransitDatabase's prototype chain) with the exact
// historical store definitions from src/persistence/database.ts, so the stored
// IndexedDB version is N*10 as Dexie writes it.
import { expect, test } from '@playwright/test';

const HISTORY = `
  const v1 = { projects: 'id,name,updatedAt', scenarios: 'id,projectId,[projectId+name],updatedAt', serviceDays: 'id,scenarioId,[scenarioId+kind],sequence', routes: 'id,scenarioId,[scenarioId+name],updatedAt', nodes: 'id,scenarioId,routeId,[routeId+name]', patterns: 'id,scenarioId,routeId,[routeId+name]', directions: 'id,scenarioId,routeId,[routeId+name]', runtimeProfiles: 'id,scenarioId,routeId,patternId', runtimeAssignments: 'id,scenarioId,patternId,[patternId+serviceDayId]', generationSets: 'id,scenarioId,routeId,serviceDayId,patternId', trips: 'id,scenarioId,routeId,serviceDayId,patternId,provenance.generationSetId,provenance.runtimeProfileId', blocks: 'id,scenarioId,serviceDayId,[serviceDayId+label]', costPlans: 'id,scenarioId,[scenarioId+name]', appMetadata: 'key' };
  const v2 = { runtimeAssignments: 'id,scenarioId,patternId,runtimeProfileId,[patternId+serviceDayId]' };
  const v3 = { tripProfiles: 'id,scenarioId,[scenarioId+name],updatedAt', trips: 'id,scenarioId,tripProfileId,routeId,serviceDayId,patternId,[tripProfileId+routeId],[tripProfileId+serviceDayId],provenance.generationSetId,provenance.runtimeProfileId', blocks: 'id,scenarioId,tripProfileId,serviceDayId,[tripProfileId+serviceDayId],[serviceDayId+label]' };
  const v4 = { blockingScenarios: 'id,scenarioId,tripProfileId,[scenarioId+name],[tripProfileId+name],updatedAt', blocks: 'id,scenarioId,blockingScenarioId,serviceDayId,[blockingScenarioId+serviceDayId],[serviceDayId+label]' };
  const v5 = { costingAssumptions: 'id,scenarioId' };
`;

async function runMigration(page: import('@playwright/test').Page, seedVersion: number) {
  return page.evaluate(async ({ seedVersion, HISTORY }) => {
    const { TransitDatabase } = await import('/src/persistence/database.ts');
    const Dexie: any = Object.getPrototypeOf(TransitDatabase);
    // eslint-disable-next-line no-new-func
    const defs = new Function(`${HISTORY}; return [v1, v2, v3, v4, v5];`)();
    const name = `p3-migration-v${seedVersion}-${Date.now()}`;
    const legacy = new Dexie(name);
    for (let v = 1; v <= seedVersion; v += 1) legacy.version(v).stores(defs[v - 1]);
    await legacy.open();
    const now = '2026-01-01T00:00:00.000Z'; const m = { createdAt: now, updatedAt: now };
    const t = (n: string) => legacy.table(n);
    await t('projects').put({ id: 'p', name: 'P', distanceUnit: 'miles', currencyCode: 'USD', ...m });
    for (const s of ['s1', 's2']) {
      await t('scenarios').put({ id: s, projectId: 'p', name: s, ...m });
      await t('serviceDays').put({ id: `${s}-wd`, scenarioId: s, kind: 'weekday', name: 'Weekday', annualServiceDays: 255, sequence: 0, ...m });
      await t('routes').put({ id: `${s}-r`, scenarioId: s, name: 'R', ...m });
      await t('nodes').bulkPut([{ id: `${s}-a`, scenarioId: s, routeId: `${s}-r`, name: 'A', kind: 'terminal', ...m }, { id: `${s}-b`, scenarioId: s, routeId: `${s}-r`, name: 'B', kind: 'terminal', ...m }]);
      await t('patterns').put({ id: `${s}-p`, scenarioId: s, routeId: `${s}-r`, name: 'A-B', points: [{ id: `${s}-pa`, nodeId: `${s}-a`, sequence: 0, cumulativeMiles: 0 }, { id: `${s}-pb`, nodeId: `${s}-b`, sequence: 1, cumulativeMiles: 2 }], ...m });
      await t('runtimeProfiles').put({ id: `${s}-rp`, scenarioId: s, routeId: `${s}-r`, patternId: `${s}-p`, name: 'Base', bands: [{ id: `${s}-band`, label: 'All', sequence: 0, startTime: 0, endTime: 100000, segmentRuntimeSeconds: [600] }], ...m });
      await t('runtimeAssignments').put({ id: `${s}-ra`, scenarioId: s, patternId: `${s}-p`, serviceDayId: `${s}-wd`, runtimeProfileId: `${s}-rp`, ...m });
      if (seedVersion >= 3) await t('tripProfiles').put({ id: `${s}-tp`, scenarioId: s, name: 'Default', ...m });
      await t('trips').bulkPut([0, 1].map((i) => ({ id: `${s}-t${i}`, scenarioId: s, routeId: `${s}-r`, serviceDayId: `${s}-wd`, patternId: `${s}-p`, ...(seedVersion >= 3 ? { tripProfileId: `${s}-tp` } : {}), stopTimes: [{ patternPointId: `${s}-pa`, sequence: 0, time: 21600 + i * 3600 }, { patternPointId: `${s}-pb`, sequence: 1, time: 22200 + i * 3600 }], provenance: { kind: 'manual', manuallyChangedFields: [] }, ...m })));
      if (seedVersion >= 4) {
        await t('blockingScenarios').put({ id: `${s}-bs`, scenarioId: s, tripProfileId: `${s}-tp`, name: 'Blocks', ...m });
        await t('blocks').put({ id: `${s}-blk`, scenarioId: s, blockingScenarioId: `${s}-bs`, serviceDayId: `${s}-wd`, label: '1', activities: [{ id: `${s}-act`, type: 'revenueTrip', sequence: 0, tripId: `${s}-t0` }], ...m });
      } else {
        await t('blocks').bulkPut([1, 2].map((i) => ({ id: `${s}-ph${i}`, scenarioId: s, serviceDayId: `${s}-wd`, ...(seedVersion === 3 ? { tripProfileId: `${s}-tp` } : {}), label: String(i), activities: [{ id: `${s}-pha${i}`, type: 'revenueTrip', sequence: 0, tripId: `${s}-t0` }], ...m })));
      }
      if (seedVersion >= 5) await t('costingAssumptions').put({ id: `${s}-ca`, scenarioId: s, currencyCode: 'USD', enteredRate: 100, rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: 0.03, ...m });
    }
    await t('generationSets').put({ id: 'g', scenarioId: 's1', routeId: 's1-r', serviceDayId: 's1-wd', patternId: 's1-p', name: 'G', firstDeparture: 0, headwaySeconds: 600, limit: { mode: 'tripCount', tripCount: 1 }, generationRevision: 0, ...m });
    await t('costPlans').put({ id: 'cp', scenarioId: 's1', name: 'Legacy draft' });
    await t('appMetadata').put({ key: 'k', value: 'v' });
    const before: Record<string, number> = {};
    for (const table of legacy.tables) before[table.name] = await table.count();
    const seededIdbVersion = legacy.verno * 10;
    legacy.close();

    const db = new TransitDatabase(name);
    await db.open();
    const after: Record<string, number> = {};
    for (const table of db.tables) after[table.name] = await table.count();
    const profiles = await db.tripProfiles.toArray();
    const trips = await db.trips.toArray();
    const result = {
      seededIdbVersion, idbVersionAfter: db.backendDB().version, verno: db.verno, before, after,
      profilesPerScenario: Object.fromEntries(['s1', 's2'].map((s) => [s, profiles.filter((p: any) => p.scenarioId === s).map((p: any) => p.name)])),
      tripsWithoutProfile: trips.filter((x: any) => !x.tripProfileId).length,
      tripProfileRefsValid: trips.every((x: any) => profiles.some((p: any) => p.id === x.tripProfileId && p.scenarioId === x.scenarioId)),
      byRuntimeProfileIndex: await db.runtimeAssignments.where('runtimeProfileId').equals('s1-rp').count(),
      blocksByBlockingScenarioIndex: seedVersion >= 4 ? await db.blocks.where('blockingScenarioId').equals('s1-bs').count() : null,
      tripsByProfileIndex: await db.trips.where('[tripProfileId+serviceDayId]').equals([profiles.find((p: any) => p.scenarioId === 's1')?.id ?? '', 's1-wd']).count(),
      tripPayloadIntact: JSON.stringify((await db.trips.get('s1-t1'))?.stopTimes),
      costPlan: await db.costPlans.get('cp'),
      undoStoreExists: db.tables.some((x: any) => x.name === 'tripRegenerationUndo'),
    };
    db.close();
    await Dexie.delete(name);
    return result;
  }, { seedVersion, HISTORY });
}

for (const seedVersion of [1, 2, 3, 4, 5]) {
  test(`3.1 upgrade from Dexie v${seedVersion} to v6`, async ({ page }) => {
    await page.goto('/src/styles.css');
    const r = await runMigration(page, seedVersion);
    console.log(`[3.1] v${seedVersion}`, JSON.stringify(r));
    expect(r.verno).toBe(6);
    expect(r.after.projects).toBe(r.before.projects);
    expect(r.after.scenarios).toBe(2);
    expect(r.after.trips).toBe(4);
    expect(r.tripsWithoutProfile).toBe(0);
    expect(r.tripProfileRefsValid).toBe(true);
    expect(r.profilesPerScenario).toEqual({ s1: ['Default'], s2: ['Default'] });
    expect(r.after.runtimeAssignments).toBe(2);
    expect(r.byRuntimeProfileIndex).toBe(1);
    expect(r.tripsByProfileIndex).toBe(2);
    expect(r.after.costPlans).toBe(1);
    expect(r.after.generationSets).toBe(1);
    expect(r.after.appMetadata).toBe(1);
    expect(r.after.tripRegenerationUndo).toBe(0);
    expect(r.after.costingAssumptions).toBe(seedVersion >= 5 ? 2 : 0);
    // Placeholder Blocks (pre-v4) are discarded; normalized Blocks (v4+) are kept.
    expect(r.after.blocks).toBe(seedVersion >= 4 ? 2 : 0);
    if (seedVersion >= 4) { expect(r.after.blockingScenarios).toBe(2); expect(r.blocksByBlockingScenarioIndex).toBe(1); }
  });
}
