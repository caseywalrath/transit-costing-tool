// Phase 3 browser reproduction. Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p3-playwright.config.ts p3-atomicity
// Backs task 3.7 and finding 3-008 (RouteDefinitionService.deleteNode commits its first write when the
// second fails). Marked test.fail: it asserts EXPECTED behaviour (no operation leaks a partial write).
// Phase 3 task 3.7: inject a failure at the last write of each multi-table repository
// operation on the shipped Dexie store and check that nothing persists.
import { expect, test } from '@playwright/test';
import { goldenAugmented } from './p3-fixture.ts';
import { SETUP } from './p3-env';

test('3.7 transaction atomicity with injected failures', async ({ page }) => {
  test.fail(true, 'Finding 3-008: RouteDefinitionService.deleteNode leaks its first transaction');
  await page.goto('/src/styles.css');
  const results = await page.evaluate(async ({ SETUP, raw }: any) => {
    const env = await new Function(SETUP)();
    const { createBlockingScenarioSourceSignature, duplicateBlockingScenario } = await import('/src/domain/blocking.ts');
    const { duplicateScenario } = await import('/src/domain/project.ts');
    const { exportProjectJson, importProjectJson, cloneProjectSnapshot } = await import('/src/persistence/backup.ts');
    const out: any[] = [];
    async function check(label: string, table: string, method: string, op: (e: any) => Promise<unknown>) {
      const name = 'p3-atom-' + Math.random().toString(36).slice(2);
      const e = env.make(name);
      await e.repository.saveProjectSnapshot({ ...raw, generationSets: raw.generationSets ?? [] });
      await e.db.tripRegenerationUndo.put({ id: 'last', scenarioId: raw.scenarios[0].id, tripProfileId: raw.tripProfiles[0].id, createdAt: raw.exportedAt, beforeTrips: [raw.trips[0]], afterTrips: [raw.trips[0]] });
      const dump = async () => { const o: any = {}; for (const t of e.db.tables) o[t.name] = JSON.stringify(await t.toArray()); return o; };
      const before = await dump();
      const target = (e.db as any)[table]; const original = target[method];
      let called = 0;
      target[method] = function () { called += 1; throw new Error('p3 injected failure'); };
      let error = 'none';
      try { await op(e); } catch (x: any) { error = x.message; }
      target[method] = original;
      const after = await dump();
      const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
      out.push({ label, injectedAt: `${table}.${method}`, injectionReached: called > 0, error, changedTables: changed });
      e.db.close(); await env.Dexie.delete(name);
    }
    const sid = raw.scenarios[0].id; const weekday = raw.serviceDays.find((d: any) => d.kind === 'weekday').id;
    const newTrip = (id: string) => ({ ...raw.trips[0], id });
    await check('insertTripsAtomically (additive generated group)', 'trips', 'bulkAdd', (e) => e.repository.insertTripsAtomically([newTrip('n1'), newTrip('n2')]));
    await check('insertTripsAtomically with a duplicate ID mid-batch (no injection)', 'appMetadata', 'put', (e) => e.repository.insertTripsAtomically([newTrip('n1'), raw.trips[1], newTrip('n2')]));
    await check('saveRegeneratedTripsWithUndo (recalculation)', 'tripRegenerationUndo', 'put', (e) => e.repository.saveRegeneratedTripsWithUndo([raw.trips[0]], [{ ...raw.trips[0], publicLabel: 'X' }], { id: 'last', scenarioId: sid, tripProfileId: raw.trips[0].tripProfileId, createdAt: 'now', beforeTrips: [raw.trips[0]], afterTrips: [{ ...raw.trips[0], publicLabel: 'X' }] }));
    await check('saveTripChangesAtomically (shift with Blocks)', 'tripRegenerationUndo', 'get', (e) => e.repository.saveTripChangesAtomically([{ ...raw.trips[0], publicLabel: 'X' }], [{ ...raw.blocks[0], label: 'changed' }]));
    await check('deleteTripsAtomically', 'blocks', 'bulkPut', (e) => e.repository.deleteTripsAtomically([raw.trips[0].id], [{ ...raw.blocks[0], label: 'changed' }]));
    await check('replaceTripsForDayAtomically (copy Trips from day)', 'blocks', 'bulkPut', (e) => e.repository.replaceTripsForDayAtomically({ request: {}, removedTripIds: raw.trips.filter((t: any) => t.serviceDayId === weekday).slice(0, 3).map((t: any) => t.id), copiedTrips: [newTrip('c1')], adjustedBlocks: [{ ...raw.blocks[0], label: 'changed' }] }));
    await check('saveBlockingBlocksAtomically (two-Block reassignment)', 'blocks', 'bulkPut', async (e) => { const bs = await e.blockingRepository.getBlockingScenario(raw.blockingScenarios[0].id); const blocks = await e.blockingRepository.listBlockingBlocks(bs.id); await e.blockingRepository.saveBlockingBlocksAtomically(blocks.slice(1).map((b: any, i: number) => i === 0 ? { ...b, label: 'changed' } : b), createBlockingScenarioSourceSignature(bs, blocks), bs.id); });
    await check('saveBlockingScenarioGraphAtomically (Blocking Scenario duplicate)', 'blocks', 'bulkPut', async (e) => { const bs = await e.blockingRepository.getBlockingScenario(raw.blockingScenarios[0].id); const blocks = await e.blockingRepository.listBlockingBlocks(bs.id); const copy = duplicateBlockingScenario({ scenario: bs, blocks }, 'Dup'); await e.blockingRepository.saveBlockingScenarioGraphAtomically(copy.scenario, copy.blocks, createBlockingScenarioSourceSignature(bs, blocks), bs.id); });
    await check('deleteBlockingScenarioAtomically', 'blockingScenarios', 'delete', async (e) => { const bs = await e.blockingRepository.getBlockingScenario(raw.blockingScenarios[0].id); const blocks = await e.blockingRepository.listBlockingBlocks(bs.id); await e.blockingRepository.deleteBlockingScenarioAtomically(bs.id, createBlockingScenarioSourceSignature(bs, blocks)); });
    await check('saveProjectSnapshot (project import-as-copy)', 'blocks', 'bulkPut', (e) => e.repository.saveProjectSnapshot(importProjectJson(exportProjectJson(cloneProjectSnapshot({ ...raw, blocks: raw.blocks.filter((b: any) => b.blockingScenarioId !== 'p3-alt-blocking'), blockingScenarios: raw.blockingScenarios.slice(0, 1) })))));
    await check('saveProjectSnapshot (Scenario deletion path)', 'projects', 'put', async (e) => { const snap = await e.repository.getProjectSnapshot(raw.project.id); await e.repository.saveProjectSnapshot({ ...snap, trips: snap.trips.slice(1) }); });
    await check('saveScenarioRecords (Scenario duplication)', 'blocks', 'bulkPut', async (e) => { const r = await e.repository.getScenarioRecords(sid); const single = { ...r, tripProfiles: r.tripProfiles.filter((p: any) => p.id !== 'p3-alt-profile'), trips: r.trips.filter((t: any) => t.tripProfileId !== 'p3-alt-profile'), blockingScenarios: r.blockingScenarios.slice(0, 1), blocks: r.blocks.filter((b: any) => b.blockingScenarioId !== 'p3-alt-blocking') }; await e.repository.saveScenarioRecords(duplicateScenario(single, 'Dup')); });
    await check('saveScenarioRecords (Route deletion / commitRouteEdit)', 'blocks', 'bulkPut', async (e) => { const r = await e.repository.getScenarioRecords(sid); await e.repository.commitRouteEdit({ ...r, trips: r.trips.slice(5) }); });
    await check('deleteProject', 'projects', 'delete', (e) => e.repository.deleteProject(raw.project.id));
    await check('deleteTripProfile', 'blocks', 'bulkDelete', (e) => e.repository.deleteTripProfile('p3-alt-profile'));
    await check('copyTripProfileAtomically', 'trips', 'bulkAdd', (e) => e.repository.copyTripProfileAtomically({ id: 'np', scenarioId: sid, name: 'Copy', createdAt: 'x', updatedAt: 'x' }, [newTrip('cp1')]));
    await check('deleteRuntimeProfile with replacement', 'runtimeProfiles', 'delete', (e) => e.repository.deleteRuntimeProfile(raw.runtimeAssignments[0].runtimeProfileId, raw.runtimeProfiles.find((p: any) => p.patternId === raw.runtimeAssignments[0].patternId && p.id !== raw.runtimeAssignments[0].runtimeProfileId).id));
    await check('commitRuntimeCopyAtomically', 'runtimeAssignments', 'bulkAdd', (e) => e.repository.commitRuntimeCopyAtomically({ request: { scenarioId: sid }, replaceAssignmentIds: [raw.runtimeAssignments[0].id], profiles: [], assignments: [{ ...raw.runtimeAssignments[0], id: 'ra-new' }] }));
    await check('RouteDefinitionService.deleteNode (two transactions)', 'blocks', 'bulkPut', async (e) => { const agg = await e.repository.getRouteDefinition(raw.routes[0].id); const used = new Set(raw.patterns.flatMap((p: any) => p.points.map((pt: any) => pt.nodeId))); const node = agg.nodes.find((n: any) => !used.has(n.id)) ?? agg.nodes[0]; await e.service.deleteNode(agg, node.id); });
    return out;
  }, { SETUP, raw: goldenAugmented() });
  for (const r of results) console.log('[3.7]', JSON.stringify(r));
  const leaks = results.filter((r: any) => r.changedTables.length > 0);
  expect(leaks.map((r: any) => r.label)).toEqual([]);
});
