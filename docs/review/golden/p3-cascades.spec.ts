// Phase 3 browser reproduction. Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p3-playwright.config.ts p3-cascades
// Backs task 3.5 counts and finding 3-006 (A-004 hypothesis 4). The Scenario-deletion test is marked
// test.fail: it asserts EXPECTED behaviour (copy keeps valid Node references after source deletion).
// Phase 3 task 3.5: deletion cascades on the shipped Dexie store in Chromium.
// Seed: Federal BRT golden plus an "Alt" Trip Profile/Blocking Scenario, Costing
// assumptions, a deadhead, a historical generation set (docs/review/golden/p3-fixture.ts).
import { expect, test } from '@playwright/test';
import { goldenAugmented, goldenRaw } from './p3-fixture.ts';
import { SETUP } from './p3-env';

async function run(page: any, body: string, args: any) {
  await page.goto('/src/styles.css');
  return page.evaluate(async ({ SETUP, body, args }: any) => {
    const env = await new Function(SETUP)();
    return new Function('env', 'args', `return (async () => { ${body} })();`)(env, args);
  }, { SETUP, body, args });
}

const PRELUDE = `
  const name = 'p3-cascade-' + Math.random().toString(36).slice(2);
  const e = env.make(name);
  const raw = args.raw;
  await e.repository.saveProjectSnapshot({ ...raw, generationSets: raw.generationSets ?? [] });
  const sid = raw.scenarios[0].id;
  const activityStats = async () => { const blocks = await e.db.blocks.toArray(); const nodes = new Set((await e.db.nodes.toArray()).map((n) => n.id)); const trips = new Set((await e.db.trips.toArray()).map((t) => t.id)); const acts = blocks.flatMap((b) => b.activities); return { blocks: blocks.length, emptyBlocks: blocks.filter((b) => b.activities.length === 0).length, revenue: acts.filter((a) => a.type === 'revenueTrip').length, nonRevenue: acts.filter((a) => a.type !== 'revenueTrip').length, danglingTripRefs: acts.filter((a) => a.type === 'revenueTrip' && !trips.has(a.tripId)).length, danglingNodeRefs: acts.filter((a) => (a.fromNodeId && !nodes.has(a.fromNodeId)) || (a.toNodeId && !nodes.has(a.toNodeId))).length }; };
  const before = { counts: await e.counts(), acts: await activityStats() };
  const finish = async (extra = {}) => { const after = { counts: await e.counts(), acts: await activityStats() }; e.db.close(); await env.Dexie.delete(name); return { before, after, ...extra }; };
`;

test('3.5 Project deletion', async ({ page }) => {
  const r = await run(page, PRELUDE + `
    const other = await e.service.createProject('Other');
    await e.db.tripRegenerationUndo.put({ id: 'last', scenarioId: sid, tripProfileId: raw.tripProfiles[0].id, createdAt: raw.exportedAt, beforeTrips: [], afterTrips: [] });
    await e.db.costPlans.put({ id: 'cp', scenarioId: sid, name: 'Legacy' });
    await e.service.deleteProject(raw.project.id);
    return finish({ otherProjectKept: Boolean(await e.repository.getProject(other.project.id)), otherScenarioKept: (await e.repository.listScenarios(other.project.id)).length });
  `, { raw: goldenAugmented() });
  console.log('[3.5] project', JSON.stringify(r));
  expect(r.after.counts.projects).toBe(1);
  for (const k of ['routes', 'nodes', 'patterns', 'directions', 'runtimeProfiles', 'runtimeAssignments', 'blockingScenarios', 'costingAssumptions', 'generationSets', 'trips', 'blocks', 'tripRegenerationUndo', 'costPlans']) expect(r.after.counts[k], k).toBe(0);
  expect(r.otherProjectKept).toBe(true);
});

test('3.5 Scenario deletion (and A-004 hypothesis 4: copy after source deletion)', async ({ page }) => {
  test.fail(true, 'A-004 hypothesis 4 / finding 3-006: copied boundary activities reference deleted Nodes');
  const r = await run(page, PRELUDE + `
    const records = await e.repository.getScenarioRecords(sid);
    const copy = await e.service.duplicateScenario(records, 'Copy');
    const mid = { counts: await e.counts(), acts: await activityStats() };
    await e.db.tripRegenerationUndo.put({ id: 'last', scenarioId: sid, tripProfileId: raw.tripProfiles[0].id, createdAt: raw.exportedAt, beforeTrips: [], afterTrips: [] });
    await e.service.deleteScenario(sid);
    const copyRecords = await e.repository.getScenarioRecords(copy.scenario.id);
    const copyNodeIds = new Set(copyRecords.nodes.map((n) => n.id));
    const copyActs = copyRecords.blocks.flatMap((b) => b.activities).filter((a) => a.type !== 'revenueTrip');
    return finish({ mid, copyNonRevenue: copyActs.length, copyNonRevenueWithMissingNode: copyActs.filter((a) => (a.fromNodeId && !copyNodeIds.has(a.fromNodeId)) || (a.toNodeId && !copyNodeIds.has(a.toNodeId))).length });
  `, { raw: goldenRaw() });
  console.log('[3.5] scenario', JSON.stringify(r));
  for (const k of ['scenarios', 'serviceDays', 'routes', 'nodes', 'patterns', 'directions', 'runtimeProfiles', 'runtimeAssignments', 'tripProfiles', 'blockingScenarios', 'trips', 'blocks']) expect(r.after.counts[k], k).toBe(r.mid.counts[k] / 2);
  expect(r.after.counts.tripRegenerationUndo).toBe(0);
  expect(r.copyNonRevenueWithMissingNode, 'A-004 hypothesis 4').toBe(0);
});

test('3.5 Route deletion', async ({ page }) => {
  const r = await run(page, PRELUDE + `
    const impact = await e.service.getRouteDeletionImpact(raw.routes[0].id);
    await e.service.deleteRoute(raw.routes[0].id);
    return finish({ impact });
  `, { raw: goldenAugmented() });
  console.log('[3.5] route', JSON.stringify(r));
  for (const k of ['routes', 'nodes', 'patterns', 'directions', 'runtimeProfiles', 'runtimeAssignments', 'generationSets', 'trips']) expect(r.after.counts[k], k).toBe(0);
  for (const k of ['scenarios', 'serviceDays', 'tripProfiles', 'blockingScenarios', 'costingAssumptions', 'blocks']) expect(r.after.counts[k], k).toBe(r.before.counts[k]);
  expect(r.after.acts.revenue).toBe(0); expect(r.after.acts.nonRevenue).toBe(0); expect(r.after.acts.emptyBlocks).toBe(r.before.acts.blocks);
});

test('3.5 Pattern deletion', async ({ page }) => {
  const r = await run(page, PRELUDE + `
    const patternId = raw.patterns[0].id;
    const tripCount = raw.trips.filter((t) => t.patternId === patternId).length;
    const impact = await e.service.getPatternDeletionImpact(patternId);
    await e.service.deletePattern(patternId);
    const left = await e.db.trips.where('patternId').equals(patternId).count();
    const leftProfiles = await e.db.runtimeProfiles.where('patternId').equals(patternId).count();
    const leftAssignments = (await e.db.runtimeAssignments.toArray()).filter((a) => a.patternId === patternId).length;
    return finish({ impact, tripCount, left, leftProfiles, leftAssignments });
  `, { raw: goldenAugmented() });
  console.log('[3.5] pattern', JSON.stringify(r));
  expect(r.left + r.leftProfiles + r.leftAssignments).toBe(0);
  expect(r.after.counts.trips).toBe(r.before.counts.trips - r.tripCount);
  expect(r.after.counts.blocks).toBe(r.before.counts.blocks);
  expect(r.after.acts.danglingTripRefs).toBe(0);
});

test('3.5 Runtime profile deletion with replacement', async ({ page }) => {
  const r = await run(page, PRELUDE + `
    const used = new Set(raw.trips.flatMap((t) => [t.provenance.runtimeProfileId, t.provenance.calculationSource?.runtimeProfileId]).filter(Boolean));
    const assigned = raw.runtimeAssignments.find((a) => !used.has(a.runtimeProfileId));
    const replacement = raw.runtimeProfiles.find((p) => p.patternId === assigned.patternId && p.id !== assigned.runtimeProfileId);
    const referenced = [...used][0];
    let referencedError = 'none'; try { await e.service.deleteRuntimeProfile(referenced); } catch (x) { referencedError = x.constructor.name + ': ' + x.message; }
    await e.service.deleteRuntimeProfile(assigned.runtimeProfileId, replacement.id);
    const moved = (await e.db.runtimeAssignments.where('runtimeProfileId').equals(replacement.id).count());
    return finish({ referencedError, moved, deleted: !(await e.db.runtimeProfiles.get(assigned.runtimeProfileId)) });
  `, { raw: goldenAugmented() });
  console.log('[3.5] runtime profile', JSON.stringify(r));
  expect(r.after.counts.runtimeProfiles).toBe(r.before.counts.runtimeProfiles - 1);
  expect(r.after.counts.runtimeAssignments).toBe(r.before.counts.runtimeAssignments);
  expect(r.referencedError).not.toBe('none');
});

test('3.5 Trip profile deletion', async ({ page }) => {
  const r = await run(page, PRELUDE + `
    await e.db.tripRegenerationUndo.put({ id: 'last', scenarioId: sid, tripProfileId: 'p3-alt-profile', createdAt: raw.exportedAt, beforeTrips: [], afterTrips: [raw.trips.find((t) => t.tripProfileId === 'p3-alt-profile')] });
    const preview = await e.trips.previewTripProfileDeletion('p3-alt-profile');
    await e.trips.deleteTripProfile('p3-alt-profile', preview.previewToken);
    return finish({ preview: { tripCount: preview.tripCount, blockCount: preview.blockCount }, altTrips: raw.trips.filter((t) => t.tripProfileId === 'p3-alt-profile').length, altBlocks: raw.blocks.filter((b) => b.blockingScenarioId === 'p3-alt-blocking').length });
  `, { raw: goldenAugmented() });
  console.log('[3.5] trip profile', JSON.stringify(r));
  expect(r.after.counts.trips).toBe(r.before.counts.trips - r.altTrips);
  expect(r.after.counts.blocks).toBe(r.before.counts.blocks - r.altBlocks);
  expect(r.after.counts.blockingScenarios).toBe(r.before.counts.blockingScenarios - 1);
  expect(r.after.counts.tripProfiles).toBe(r.before.counts.tripProfiles - 1);
  expect(r.after.counts.tripRegenerationUndo).toBe(0);
  expect(r.preview.blockCount).toBe(r.altBlocks);
});

test('3.5 Blocking Scenario deletion', async ({ page }) => {
  const r = await run(page, PRELUDE + `
    const { createBlockingScenarioSourceSignature } = await import('/src/domain/blocking.ts');
    const scenario = await e.blockingRepository.getBlockingScenario('p3-alt-blocking');
    const blocks = await e.blockingRepository.listBlockingBlocks('p3-alt-blocking');
    const impact = await e.blocking.deleteBlockingScenario('p3-alt-blocking', createBlockingScenarioSourceSignature(scenario, blocks));
    return finish({ impactBlocks: impact.blockCount });
  `, { raw: goldenAugmented() });
  console.log('[3.5] blocking scenario', JSON.stringify(r));
  expect(r.after.counts.blocks).toBe(r.before.counts.blocks - r.impactBlocks);
  expect(r.after.counts.trips).toBe(r.before.counts.trips);
  expect(r.after.counts.tripProfiles).toBe(r.before.counts.tripProfiles);
  expect(r.after.counts.costingAssumptions).toBe(r.before.counts.costingAssumptions);
});

test('3.5 Trip deletion keeps empty Blocks', async ({ page }) => {
  const r = await run(page, PRELUDE + `
    const block = raw.blocks.find((b) => b.blockingScenarioId !== 'p3-alt-blocking' && b.activities.some((a) => a.id === 'p3-deadhead'));
    const tripIds = block.activities.filter((a) => a.type === 'revenueTrip').map((a) => a.tripId);
    const preview = await e.trips.previewTripDeletion(tripIds);
    await e.trips.deleteTrips(tripIds);
    const stored = await e.db.blocks.get(block.id);
    return finish({ deleted: tripIds.length, affected: preview.affectedBlockIds.length, blockKept: Boolean(stored), remainingActivities: stored?.activities.map((a) => a.type) });
  `, { raw: goldenAugmented() });
  console.log('[3.5] trip', JSON.stringify(r));
  expect(r.after.counts.trips).toBe(r.before.counts.trips - r.deleted);
  expect(r.after.counts.blocks).toBe(r.before.counts.blocks);
  expect(r.blockKept).toBe(true);
  expect(r.after.acts.danglingTripRefs).toBe(0);
});
