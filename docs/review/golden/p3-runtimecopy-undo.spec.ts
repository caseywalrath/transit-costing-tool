// Phase 3 browser reproduction. Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p3-playwright.config.ts p3-runtimecopy-undo
// Backs finding 3-009 (Runtime copy from day always fails on Dexie; marked test.fail, asserts EXPECTED)
// and task 3.8 undo lifecycle (asserts CURRENT behaviour; passes).
// Phase 3: Runtime "Copy from day" on the shipped Dexie store (finding 3-009) and the
// regeneration-undo lifecycle (task 3.8, Decision 0035 item 3).
import { expect, test } from '@playwright/test';
import { goldenRaw } from './p3-fixture.ts';
import { SETUP } from './p3-env';

test('3-009 Runtime copy from day commits through Dexie', async ({ page }) => {
  test.fail(true, 'Finding 3-009: commitRuntimeCopyAtomically reads tables outside its transaction scope');
  await page.goto('/src/styles.css');
  const r = await page.evaluate(async ({ SETUP, raw }: any) => {
    const env = await new Function(SETUP)();
    const out: any = {};
    for (const mode of ['independent', 'shared']) {
      const name = 'p3-rcopy-' + Math.random().toString(36).slice(2); const e = env.make(name);
      await e.repository.saveProjectSnapshot({ ...raw, generationSets: [] });
      const day = (k: string) => raw.serviceDays.find((d: any) => d.kind === k).id;
      const request = { scenarioId: raw.scenarios[0].id, routeId: raw.routes[0].id, sourceServiceDayId: day('weekday'), targetServiceDayId: day('saturday'), mode };
      const preview = await e.trips.previewRuntimeCopy(request);
      let error = 'none'; try { await e.trips.applyRuntimeCopy(preview); } catch (x: any) { error = x.message; }
      const mem = env.makeMemory(); await mem.repository.saveProjectSnapshot({ ...raw, generationSets: [] });
      let memError = 'none'; try { await mem.trips.applyRuntimeCopy(await mem.trips.previewRuntimeCopy(request)); } catch (x: any) { memError = x.message; }
      out[mode] = { findings: preview.findings.length, profiles: preview.profiles.length, assignments: preview.assignments.length, dexieError: error, inMemoryError: memError };
      e.db.close(); await env.Dexie.delete(name);
    }
    return out;
  }, { SETUP, raw: goldenRaw() });
  console.log('[3-009]', JSON.stringify(r));
  expect(r.independent.dexieError).toBe('none');
  expect(r.shared.dexieError).toBe('none');
});

test('3.8 regeneration undo lifecycle on Dexie', async ({ page }) => {
  await page.goto('/src/styles.css');
  const name = 'p3-undo-' + Date.now();
  const step1 = await page.evaluate(async ({ SETUP, raw, name }: any) => {
    const env = await new Function(SETUP)(); const e = env.make(name);
    await e.repository.saveProjectSnapshot({ ...raw, generationSets: [] });
    const weekdayTrips = raw.trips.filter((t: any) => t.serviceDayId === raw.serviceDays.find((d: any) => d.kind === 'weekday').id);
    const ids = weekdayTrips.slice(0, 2).map((t: any) => t.id);
    // Make the saved times differ from the calculated times so the recalculation changes them.
    for (const id of ids) { const t = await e.db.trips.get(id); await e.db.trips.put({ ...t, stopTimes: t.stopTimes.map((p: any) => ({ ...p, time: p.time + 60 })) }); }
    let error = 'none'; try { await e.trips.recalculateTrips(ids, true); } catch (x: any) { error = x.message; }
    const undo = await e.trips.getLastTripRegenerationUndo();
    e.db.close();
    return { error, ids, undoAfterIds: undo?.afterTrips.map((t: any) => t.id), changed: undo ? JSON.stringify(undo.beforeTrips) !== JSON.stringify(undo.afterTrips) : null };
  }, { SETUP, raw: goldenRaw(), name });
  await page.reload();
  const step2 = await page.evaluate(async ({ SETUP, raw, name, ids }: any) => {
    const env = await new Function(SETUP)(); const e = env.make(name);
    const log: any = {};
    log.survivesReload = Boolean(await e.trips.getLastTripRegenerationUndo());
    const exported = await e.backup.exportProject(raw.project.id);
    log.absentFromBackup = !/beforeTrips|tripRegenerationUndo/.test(exported);
    const weekday = raw.serviceDays.find((d: any) => d.kind === 'weekday').id;
    const others = raw.trips.filter((t: any) => t.serviceDayId === weekday).slice(2, 4).map((t: any) => t.id);
    for (const id of others) { const t = await e.db.trips.get(id); await e.db.trips.put({ ...t, stopTimes: t.stopTimes.map((p: any) => ({ ...p, time: p.time + 60 })) }); }
    await e.trips.recalculateTrips(others, true);
    log.replacedByNext = JSON.stringify((await e.trips.getLastTripRegenerationUndo())?.afterTrips.map((t: any) => t.id)) === JSON.stringify(others);
    await e.trips.applyTripShift([others[0]], 60);
    log.invalidatedByTripChange = !(await e.trips.getLastTripRegenerationUndo());
    const recalc = async (list: string[]) => { for (const id of list) { const t = await e.db.trips.get(id); await e.db.trips.put({ ...t, stopTimes: t.stopTimes.map((p: any) => ({ ...p, time: p.time + 60 })) }); } await e.trips.recalculateTrips(list, true); };
    await recalc(ids); await e.trips.deleteTrips([ids[0]]);
    log.invalidatedByDeletion = !(await e.trips.getLastTripRegenerationUndo());
    await recalc([others[1]]);
    const t = await e.db.trips.get(others[1]); await e.db.trips.put({ ...t, publicLabel: 'edited outside' });
    let staleError = 'none'; try { await e.trips.undoLastTripRegeneration(); } catch (x: any) { staleError = x.message; }
    log.rejectedOnMismatch = staleError; log.removedAfterMismatch = !(await e.trips.getLastTripRegenerationUndo());
    await recalc([others[1]]);
    const restored = await e.trips.undoLastTripRegeneration();
    log.undoRestores = restored.length === 1 && (await e.db.trips.get(others[1])).stopTimes[0].time === restored[0].stopTimes[0].time;
    await recalc([others[1]]);
    await e.service.importProject(exported);
    log.keptAfterUnrelatedImport = Boolean(await e.trips.getLastTripRegenerationUndo());
    const records = await e.repository.getScenarioRecords(raw.scenarios[0].id);
    await e.service.renameScenario(records, 'Renamed');
    log.keptAfterUnrelatedScenarioSave = Boolean(await e.trips.getLastTripRegenerationUndo());
    const dup = await e.service.duplicateScenario(await e.repository.getScenarioRecords(raw.scenarios[0].id), 'Copy');
    await e.service.deleteScenario(raw.scenarios[0].id);
    log.clearedOnScenarioDeletion = !(await e.trips.getLastTripRegenerationUndo());
    const copyTrip = dup.trips[0];
    const ct = await e.db.trips.get(copyTrip.id); await e.db.trips.put({ ...ct, stopTimes: ct.stopTimes.map((p: any) => ({ ...p, time: p.time + 60 })) });
    await e.trips.recalculateTrips([copyTrip.id], true);
    await e.service.deleteProject(raw.project.id);
    log.clearedOnProjectDeletion = !(await e.trips.getLastTripRegenerationUndo());
    e.db.close(); await env.Dexie.delete(name);
    return log;
  }, { SETUP, raw: goldenRaw(), name, ids: step1.ids });
  console.log('[3.8]', JSON.stringify({ step1, step2 }));
  expect(step1.error).toBe('none');
  expect(step1.changed).toBe(true);
  expect(step2).toEqual({ survivesReload: true, absentFromBackup: true, replacedByNext: true, invalidatedByTripChange: true, invalidatedByDeletion: true, rejectedOnMismatch: 'The regenerated Trips changed. The undo is no longer available.', removedAfterMismatch: true, undoRestores: true, keptAfterUnrelatedImport: true, keptAfterUnrelatedScenarioSave: true, clearedOnScenarioDeletion: true, clearedOnProjectDeletion: true });
});
