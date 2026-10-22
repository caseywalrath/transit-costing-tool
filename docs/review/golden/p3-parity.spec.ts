// Phase 3 browser reproduction. Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p3-playwright.config.ts p3-parity
// Backs finding 3-013 (repository parity). Marked test.fail: it asserts EXPECTED parity.
// Phase 3 task 3.6: run identical calls against DexieRouteDefinitionRepository and
// InMemoryRouteDefinitionRepository in Chromium and compare results.
import { expect, test } from '@playwright/test';
import { goldenAugmented, goldenRaw } from './p3-fixture.ts';
import { SETUP } from './p3-env';

test('3.6 repository parity', async ({ page }) => {
  test.fail(true, 'Finding 3-013: in-memory and Dexie repositories diverge');
  await page.goto('/src/styles.css');
  const r = await page.evaluate(async ({ SETUP, raw, single }: any) => {
    const env = await new Function(SETUP)();
    const name = 'p3-parity-' + Date.now();
    const dexie = env.make(name); const mem = env.makeMemory();
    const both = [['dexie', dexie], ['memory', mem]] as const;
    const out: any = {};
    const run = async (label: string, fn: (e: any) => Promise<unknown>) => {
      out[label] = {};
      for (const [k, e] of both) { try { out[label][k] = { ok: await fn(e) }; } catch (x: any) { out[label][k] = { error: `${x.name}: ${x.message}` }; } }
      out[label].same = JSON.stringify(out[label].dexie) === JSON.stringify(out[label].memory);
    };
    await run('saveProjectSnapshot(golden augmented)', (e) => e.repository.saveProjectSnapshot({ ...raw, generationSets: raw.generationSets }).then(() => 'ok'));
    const sid = raw.scenarios[0].id; const weekday = raw.serviceDays.find((d: any) => d.kind === 'weekday').id;
    await run('listTripProfiles order', async (e) => (await e.repository.listTripProfiles(sid)).map((p: any) => p.name));
    await run('getScenarioRecords keys', async (e) => Object.keys(await e.repository.getScenarioRecords(sid)).sort());
    await run('getScenarioRecords tripProfiles order', async (e) => (await e.repository.getScenarioRecords(sid)).tripProfiles.map((p: any) => p.name));
    await run('listTrips(day) count (all profiles)', async (e) => (await e.repository.listTrips(weekday)).length);
    await run('listTrips(day, profile) count', async (e) => (await e.repository.listTrips(weekday, 'p3-alt-profile')).length);
    await run('listTrips(day) first 3 ids (ordering)', async (e) => (await e.repository.listTrips(weekday)).slice(0, 3).map((t: any) => t.id));
    await run('listBlocks(day) count', async (e) => (await e.repository.listBlocks(weekday)).length);
    await run('listBlocksForProfile(alt) count', async (e) => (await e.repository.listBlocksForProfile('p3-alt-profile')).length);
    await run('listRuntimeProfiles(route) first id (ordering)', async (e) => (await e.repository.listRuntimeProfiles(raw.routes[0].id))[0].id);
    await run('saveRuntimeAssignment with missing profile', (e) => e.repository.saveRuntimeAssignment({ ...raw.runtimeAssignments[0], id: 'x', runtimeProfileId: 'missing' }).then(() => 'saved'));
    await run('saveRuntimeAssignment duplicate pattern/day', (e) => e.repository.saveRuntimeAssignment({ ...raw.runtimeAssignments[0], id: 'dup' }).then(() => 'saved'));
    await run('saveRegeneratedTripsWithUndo with stale before-state', async (e) => { const t = raw.trips[1]; await e.repository.saveRegeneratedTripsWithUndo([{ ...t, publicLabel: 'stale' }], [{ ...t, publicLabel: 'after' }], { id: 'last', scenarioId: sid, tripProfileId: t.tripProfileId, createdAt: 'x', beforeTrips: [{ ...t, publicLabel: 'stale' }], afterTrips: [{ ...t, publicLabel: 'after' }] }); return (await e.repository.getTrip(t.id)).publicLabel ?? null; });
    await run('restoreLastTripRegenerationUndo after that', async (e) => (await e.repository.restoreLastTripRegenerationUndo()).map((t: any) => t.publicLabel ?? null));
    await run('insertTripsAtomically duplicate id', async (e) => { await e.repository.insertTripsAtomically([{ ...raw.trips[0], id: 'new-1' }, raw.trips[2]]); return 'inserted'; });
    await run('trip new-1 present after failed insert', async (e) => Boolean(await e.repository.getTrip('new-1')));
    await run('copyTripProfileAtomically duplicate name', (e) => e.repository.copyTripProfileAtomically({ id: 'np', scenarioId: sid, name: ' alt ', createdAt: 'x', updatedAt: 'x' }, []).then(() => 'copied'));
    await run('saveTripProfile duplicate name', (e) => e.repository.saveTripProfile({ id: 'np2', scenarioId: sid, name: 'ALT', createdAt: 'x', updatedAt: 'x' }).then(() => 'saved'));
    await run('deleteRuntimeProfile still assigned', (e) => e.repository.deleteRuntimeProfile(raw.runtimeAssignments[0].runtimeProfileId).then(() => 'deleted'));
    await run('getCostingAssumptions', async (e) => (await e.repository.getCostingAssumptions(sid))?.id ?? null);
    await run('deleteProject missing', (e) => e.repository.deleteProject('nope').then(() => 'deleted'));
    // Scenario deletion path (RouteDefinitionService.deleteScenario -> saveProjectSnapshot without the Scenario).
    await run('reset to single-profile golden', async (e) => { await e.repository.deleteProject(raw.project.id); await e.repository.saveProjectSnapshot({ ...single, generationSets: [] }); return 'ok'; });
    await run('duplicateScenario then deleteScenario(source): leftover records of deleted Scenario', async (e) => {
      const copy = await e.service.duplicateScenario(await e.repository.getScenarioRecords(single.scenarios[0].id), 'Copy');
      await e.service.deleteScenario(single.scenarios[0].id);
      const srcId = single.scenarios[0].id;
      if (e.repository.db) { const db = e.repository.db; return { serviceDays: await db.serviceDays.where('scenarioId').equals(srcId).count(), routes: await db.routes.where('scenarioId').equals(srcId).count(), nodes: await db.nodes.where('scenarioId').equals(srcId).count(), trips: await db.trips.where('scenarioId').equals(srcId).count(), copyKept: Boolean(await db.scenarios.get(copy.scenario.id)) }; }
      const m = e.repository; const cnt = (map: Map<string, any>) => [...map.values()].filter((v) => v.scenarioId === srcId).length;
      return { serviceDays: cnt(m.serviceDays), routes: cnt(m.routes), nodes: cnt(m.nodes), trips: cnt(m.trips), copyKept: m.scenarios.has(copy.scenario.id) };
    });
    dexie.db.close(); await env.Dexie.delete(name);
    return out;
  }, { SETUP, raw: goldenAugmented(), single: goldenRaw() });
  for (const [k, v] of Object.entries(r)) console.log('[3.6]', k, JSON.stringify(v));
  expect(Object.entries(r).filter(([, v]: any) => !v.same).map(([k]) => k)).toEqual([]);
});
