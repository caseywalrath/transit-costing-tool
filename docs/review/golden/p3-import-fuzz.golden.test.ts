// Phase 3 reproduction for task 3.3 (import validation strength, lead L-08).
// Backs finding 3-005. Each case mutates the golden backup and records whether
// parseProjectBackup rejects it. Cases marked expect:'reject' assert EXPECTED
// behaviour from Decision 0006 ("Import validation must check cross-entity
// references") and the data-schema Block rules; the failing ones are the defects.
// Defect tests use it.fails: they assert the expected behaviour, fail on the reviewed code,
// and are reported as passing so the golden suite stays green. Change it.fails to it to see the failure.
// Cases listed in KNOWN_DEFECTS are the accepted-but-should-reject cases (finding 3-005).
// Run: pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p3-import-fuzz.golden.test.ts
import { describe, it, expect } from 'vitest';
import { exportProjectJson, importProjectJson } from '../../../src/persistence/backup';
import { ProjectBackupService } from '../../../src/persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../../../src/persistence/inMemoryRepository';
import { duplicateScenario, projectSnapshotWithScenario, snapshotForScenario } from '../../../src/domain/project';
import { goldenRaw, goldenText } from './p3-fixture';

/** Golden plus a duplicated second Scenario, so cross-scenario references can be injected. */
function twoScenarios(): any {
  const snap = importProjectJson(goldenText());
  const copy = duplicateScenario(snapshotForScenario(snap, snap.scenarios[0].id)!, 'Second');
  const both = projectSnapshotWithScenario(snap, copy);
  both.scenarios = [snap.scenarios[0], copy.scenario];
  return JSON.parse(exportProjectJson(both));
}
const s2 = (b: any) => b.scenarios[1].id;
const firstOf = (b: any, key: string, scenarioIndex = 0) => b[key].find((r: any) => r.scenarioId === b.scenarios[scenarioIndex].id);
const pullOut = (b: any) => b.blocks.flatMap((k: any) => k.activities).find((a: any) => a.type === 'pullOut');

const KNOWN_DEFECTS = new Set([
  'missing ref: pull-out toNodeId unknown', 'missing ref: trip.provenance missing reaches import-as-copy as a raw TypeError', 'duplicate id: two block activities',
  'duplicate: same Trip assigned in two Blocks of one Blocking Scenario/day', 'duplicate: Block label repeated in one Blocking Scenario/day', 'duplicate: trip stopTimes repeat one pattern point',
  'cross-scenario: trip.routeId from Scenario 2', 'cross-scenario: trip.patternId from Scenario 2', 'cross-scenario: pull-out node from Scenario 2', 'cross-scenario: empty block serviceDayId from Scenario 2',
  'cross-profile: Blocking Scenario on profile A assigns a Trip of profile B', 'wrong type: block.activities[].type unknown', 'wrong type: pull-out minutesBeforeFirstTrip as string',
  'negative: pull-out minutesBeforeFirstTrip -30', 'negative: deadhead explicit startTime -100', 'negative: block activity miles -5',
]);
type Case = { name: string; base?: () => any; mutate: (b: any) => void; expect: 'reject' | 'accept' };
const cases: Case[] = [
  { name: 'missing ref: trip.patternId unknown', mutate: (b) => { b.trips[0].patternId = 'nope'; }, expect: 'reject' },
  { name: 'missing ref: block revenue tripId unknown', mutate: (b) => { b.blocks[0].activities.find((a: any) => a.type === 'revenueTrip').tripId = 'nope'; }, expect: 'reject' },
  { name: 'missing ref: pull-out toNodeId unknown', mutate: (b) => { pullOut(b).toNodeId = 'nope'; }, expect: 'reject' },
  { name: 'missing ref: runtime assignment profile unknown', mutate: (b) => { b.runtimeAssignments[0].runtimeProfileId = 'nope'; }, expect: 'reject' },
  { name: 'missing ref: blockingScenario.tripProfileId unknown', mutate: (b) => { b.blockingScenarios[0].tripProfileId = 'nope'; }, expect: 'reject' },
  { name: 'missing ref: direction column nodeId unknown (by design: recovered from Pattern points, commit 4fc88ba)', mutate: (b) => { b.directions[0].columns[0].nodeId = 'nope'; }, expect: 'accept' },
  { name: 'missing ref: trip.provenance missing reaches import-as-copy as a raw TypeError', mutate: (b) => { delete b.trips[0].provenance; }, expect: 'reject' },
  { name: 'duplicate id: two nodes', mutate: (b) => { b.nodes[1].id = b.nodes[0].id; }, expect: 'reject' },
  { name: 'duplicate id: two trips', mutate: (b) => { b.trips[1].id = b.trips[0].id; }, expect: 'reject' },
  { name: 'duplicate id: two runtime assignments', mutate: (b) => { b.runtimeAssignments[1].id = b.runtimeAssignments[0].id; }, expect: 'reject' },
  { name: 'duplicate id: two block activities', mutate: (b) => { b.blocks[0].activities[1].id = b.blocks[0].activities[0].id; }, expect: 'reject' },
  { name: 'duplicate id: pattern point id reused in another pattern', mutate: (b) => { b.patterns[1].points[0].id = b.patterns[0].points[0].id; }, expect: 'reject' },
  { name: 'duplicate: same Trip assigned in two Blocks of one Blocking Scenario/day', mutate: (b) => { const t = b.blocks[0].activities.find((a: any) => a.type === 'revenueTrip').tripId; const other = b.blocks.find((k: any, i: number) => i > 0 && k.serviceDayId === b.blocks[0].serviceDayId); other.activities.push({ id: 'dup-act', type: 'revenueTrip', sequence: 99, tripId: t }); }, expect: 'reject' },
  { name: 'duplicate: Block label repeated in one Blocking Scenario/day', mutate: (b) => { const other = b.blocks.find((k: any, i: number) => i > 0 && k.serviceDayId === b.blocks[0].serviceDayId); other.label = b.blocks[0].label; }, expect: 'reject' },
  { name: 'duplicate: trip stopTimes repeat one pattern point', mutate: (b) => { b.trips[0].stopTimes[1].patternPointId = b.trips[0].stopTimes[0].patternPointId; }, expect: 'reject' },
  { name: 'cross-scenario: trip.serviceDayId from Scenario 2', base: twoScenarios, mutate: (b) => { firstOf(b, 'trips').serviceDayId = firstOf(b, 'serviceDays', 1).id; }, expect: 'reject' },
  { name: 'cross-scenario: trip.routeId from Scenario 2', base: twoScenarios, mutate: (b) => { firstOf(b, 'trips').routeId = firstOf(b, 'routes', 1).id; }, expect: 'reject' },
  { name: 'cross-scenario: trip.patternId from Scenario 2', base: twoScenarios, mutate: (b) => { const t = firstOf(b, 'trips'); const p2 = b.patterns.find((p: any) => p.scenarioId === s2(b) && p.points.length === t.stopTimes.length); t.patternId = p2.id; t.stopTimes = t.stopTimes.map((st: any, i: number) => ({ ...st, patternPointId: p2.points[i].id })); }, expect: 'reject' },
  { name: 'cross-scenario: pull-out node from Scenario 2', base: twoScenarios, mutate: (b) => { const k = firstOf(b, 'blocks'); k.activities.find((a: any) => a.type === 'pullOut').toNodeId = firstOf(b, 'nodes', 1).id; }, expect: 'reject' },
  { name: 'cross-scenario: empty block serviceDayId from Scenario 2', base: twoScenarios, mutate: (b) => { const k = firstOf(b, 'blocks'); k.activities = []; k.serviceDayId = firstOf(b, 'serviceDays', 1).id; }, expect: 'reject' },
  { name: 'cross-profile: Blocking Scenario on profile A assigns a Trip of profile B', mutate: (b) => { b.tripProfiles.push({ id: 'p3-b', scenarioId: b.scenarios[0].id, name: 'B', createdAt: b.exportedAt, updatedAt: b.exportedAt }); const tid = b.blocks[0].activities.find((a: any) => a.type === 'revenueTrip').tripId; b.trips.find((t: any) => t.id === tid).tripProfileId = 'p3-b'; }, expect: 'reject' },
  { name: 'wrong type: stop time as string', mutate: (b) => { b.trips[0].stopTimes[0].time = String(b.trips[0].stopTimes[0].time); }, expect: 'reject' },
  { name: 'wrong type: annualServiceDays as string', mutate: (b) => { b.serviceDays[0].annualServiceDays = '255'; }, expect: 'reject' },
  { name: 'wrong type: block.activities[].type unknown', mutate: (b) => { b.blocks[0].activities[0].type = 'teleport'; }, expect: 'reject' },
  { name: 'wrong type: pull-out minutesBeforeFirstTrip as string', mutate: (b) => { pullOut(b).minutesBeforeFirstTrip = 'thirty'; }, expect: 'reject' },
  { name: 'wrong type: generationSets[0].limit missing', mutate: (b) => { b.generationSets = [{ id: 'g', scenarioId: b.scenarios[0].id, routeId: b.routes[0].id, serviceDayId: b.serviceDays[0].id, patternId: b.patterns[0].id, name: 'g', firstDeparture: 0, headwaySeconds: 600, generationRevision: 0, createdAt: b.exportedAt, updatedAt: b.exportedAt }]; }, expect: 'reject' },
  { name: 'negative: stop time -60', mutate: (b) => { b.trips[0].stopTimes[0].time = -60; }, expect: 'reject' },
  { name: 'negative: pull-out minutesBeforeFirstTrip -30', mutate: (b) => { pullOut(b).minutesBeforeFirstTrip = -30; }, expect: 'reject' },
  { name: 'negative: deadhead explicit startTime -100', mutate: (b) => { b.blocks[0].activities.splice(2, 0, { id: 'dh', type: 'deadhead', sequence: 2, startTime: -100, endTime: 50, fromNodeId: b.nodes[0].id, toNodeId: b.nodes[1].id }); }, expect: 'reject' },
  { name: 'negative: block activity miles -5', mutate: (b) => { pullOut(b).miles = -5; }, expect: 'reject' },
  { name: 'costing: enteredRate -1', mutate: (b) => { b.costingAssumptions = [{ id: 'c', scenarioId: b.scenarios[0].id, currencyCode: 'USD', enteredRate: -1, rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: 0.03, createdAt: b.exportedAt, updatedAt: b.exportedAt }]; }, expect: 'reject' },
  { name: 'costing: futureYearCount 11', mutate: (b) => { b.costingAssumptions = [{ id: 'c', scenarioId: b.scenarios[0].id, currencyCode: 'USD', enteredRate: 1, rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 11, annualEscalation: 0.03, createdAt: b.exportedAt, updatedAt: b.exportedAt }]; }, expect: 'reject' },
  { name: 'costing: annualEscalation -1', mutate: (b) => { b.costingAssumptions = [{ id: 'c', scenarioId: b.scenarios[0].id, currencyCode: 'USD', enteredRate: 1, rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: -1, createdAt: b.exportedAt, updatedAt: b.exportedAt }]; }, expect: 'reject' },
  { name: 'costing: rateYear after baseServiceYear', mutate: (b) => { b.costingAssumptions = [{ id: 'c', scenarioId: b.scenarios[0].id, currencyCode: 'USD', enteredRate: 1, rateYear: 2026, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: 0, createdAt: b.exportedAt, updatedAt: b.exportedAt }]; }, expect: 'reject' },
  { name: 'costing: annualServiceDays sum 400 (documented as preserved)', mutate: (b) => { b.serviceDays[0].annualServiceDays = 400; }, expect: 'accept' },
  { name: 'extra field on a trip (kept? see log)', mutate: (b) => { b.trips[0].evil = 'x'; }, expect: 'accept' },
];

describe('3.3 malformed backup case table', () => {
  for (const c of cases) {
    (KNOWN_DEFECTS.has(c.name) ? it.fails : it)(`${c.expect === 'reject' ? 'EXPECTED reject' : 'accept'}: ${c.name}`, () => {
      const b = (c.base ?? goldenRaw)();
      c.mutate(b);
      let result = 'accepted';
      try { importProjectJson(JSON.stringify(b)); } catch (e) { result = `rejected: ${(e as Error).message}`; }
      console.log(`[3.3] ${c.name} -> ${result}`);
      expect(result.startsWith('rejected') ? 'reject' : 'accept').toBe(c.expect);
    });
  }
  it.fails('rejection messages are user-safe (no raw TypeError)', () => {
    const b = goldenRaw(); b.generationSets = [{ id: 'g', scenarioId: b.scenarios[0].id, routeId: b.routes[0].id, serviceDayId: b.serviceDays[0].id, patternId: b.patterns[0].id, name: 'g', firstDeparture: 0, headwaySeconds: 600, generationRevision: 0, createdAt: b.exportedAt, updatedAt: b.exportedAt }];
    let message = ''; try { importProjectJson(JSON.stringify(b)); } catch (e) { message = (e as Error).message; }
    console.log('[3.3] missing limit message:', message);
    expect(message.startsWith('Invalid project backup')).toBe(true);
  });
});

describe('3.3 prototype keys, extra fields, size, write ordering', () => {
  it('__proto__ keys do not pollute Object.prototype through import-as-copy', async () => {
    const b = goldenRaw();
    const text = JSON.stringify(b).replace('"trips":[{', '"trips":[{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}},');
    const repository = new InMemoryRouteDefinitionRepository();
    const service = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (s) => repository.saveProjectSnapshot(s));
    let result = 'ok'; try { await service.importProject(text, 'copy'); } catch (e) { result = (e as Error).message; }
    console.log('[3.3] __proto__ import result:', result, 'polluted:', ({} as any).polluted, ({} as any).polluted2);
    expect(({} as any).polluted).toBeUndefined();
    expect(({} as any).polluted2).toBeUndefined();
  });
  it('CURRENT: unknown fields on records survive import-as-copy and are persisted', async () => {
    const b = goldenRaw(); b.trips[0].evil = 'x'; b.blocks[0].activities[0].evil = 'y'; b.unknownTopLevel = 1;
    const repository = new InMemoryRouteDefinitionRepository();
    const service = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (s) => repository.saveProjectSnapshot(s));
    const project = await service.importProject(JSON.stringify(b), 'copy');
    const snap = (await repository.getProjectSnapshot(project.id))!;
    const kept = { trip: snap.trips.some((t: any) => t.evil === 'x'), activity: snap.blocks.some((k) => k.activities.some((a: any) => a.evil === 'y')) };
    console.log('[3.3] unknown fields kept after copy import:', JSON.stringify(kept));
    expect(kept).toEqual({ trip: true, activity: true });
  });
  it('large file: golden with trips x20 parses within budget', () => {
    const b = goldenRaw(); const base = b.trips;
    for (let i = 1; i < 20; i++) b.trips = b.trips.concat(base.map((t: any) => ({ ...t, id: `${t.id}-${i}` })));
    const text = JSON.stringify(b);
    const start = performance.now(); importProjectJson(text); const ms = performance.now() - start;
    console.log(`[3.3] ${b.trips.length} trips, ${(text.length / 1e6).toFixed(1)} MB parsed+validated in ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(10000);
  });
  it('invalid payload: no repository write happens', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const service = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (s) => repository.saveProjectSnapshot(s));
    const b = goldenRaw(); b.trips[983].stopTimes[0].time = -1;
    await expect(service.importProject(JSON.stringify(b), 'copy')).rejects.toThrow();
    expect(repository.projects.size + repository.trips.size + repository.nodes.size).toBe(0);
  });
});
