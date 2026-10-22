// Phase 3 reproduction for task 3.2 (backup schema v1-v6). Backs findings 3-003
// (v3/v4 placeholder Blocks are kept on import, contrary to Decision 0019 item 13)
// and 3-004 (export -> import round trip is not stable: normalized Blocks gain tripProfileId).
// Per-version fixtures are derived from the golden v6 backup by removing the
// collections each historical version did not have.
// Tests named "EXPECTED:" assert documented behaviour and FAIL on the reviewed code;
// tests named "CURRENT:" record current behaviour and pass.
// Defect tests use it.fails: they assert the expected behaviour, fail on the reviewed code,
// and are reported as passing so the golden suite stays green. Change it.fails to it to see the failure.
// Run: pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p3-backup-versions.golden.test.ts
import { describe, it, expect } from 'vitest';
import { exportProjectJson, importProjectJson } from '../../../src/persistence/backup';
import { ProjectBackupService } from '../../../src/persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../../../src/persistence/inMemoryRepository';
import { counts, goldenRaw, goldenText } from './p3-fixture';

function asVersion(v: number): any {
  const b = goldenRaw();
  b.exportSchemaVersion = v;
  if (v < 6) delete b.costingAssumptions;
  if (v < 5) { delete b.blockingScenarios; b.blocks = b.blocks.map(({ blockingScenarioId, ...rest }: any) => ({ ...rest, ...(v === 4 ? { tripProfileId: b.tripProfiles[0].id } : {}) })); }
  if (v < 4) { delete b.tripProfiles; b.trips = b.trips.map(({ tripProfileId, ...rest }: any) => rest); }
  if (v < 3) { delete b.trips; delete b.blocks; }
  if (v < 2) { delete b.runtimeProfiles; delete b.runtimeAssignments; }
  return b;
}

async function importViaApp(payload: any) {
  const repository = new InMemoryRouteDefinitionRepository();
  const service = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (s) => repository.saveProjectSnapshot(s));
  const project = await service.importProject(JSON.stringify(payload), 'copy');
  return (await repository.getProjectSnapshot(project.id))!;
}

describe('3.2 per-version import', () => {
  for (const v of [1, 2, 3, 4, 5, 6]) {
    it(`CURRENT: v${v} imports through the app path and normalizes`, async () => {
      const snap = await importViaApp(asVersion(v));
      const c = counts(snap);
      const profilesPerScenario = snap.scenarios.map((s) => (snap.tripProfiles ?? []).filter((p) => p.scenarioId === s.id).map((p) => p.name));
      const tripsWithoutProfile = snap.trips.filter((t) => !t.tripProfileId).length;
      const legacyBlocks = snap.blocks.filter((b) => !b.blockingScenarioId).length;
      console.log(`v${v}`, JSON.stringify({ ...c, profilesPerScenario, tripsWithoutProfile, legacyBlocksWithoutBlockingScenario: legacyBlocks, hasDirections: Boolean(snap.directions?.length) }));
      expect(profilesPerScenario.every((names) => names.length >= 1)).toBe(true);
      expect(tripsWithoutProfile).toBe(0);
      expect(c.costingAssumptions).toBe(0);
    });
  }
  it('CURRENT: directions are optional (golden without directions still imports)', () => {
    const b = goldenRaw(); delete b.directions;
    for (const p of b.patterns) { delete p.directionId; for (const pt of p.points) delete pt.directionColumnId; }
    const snap = importProjectJson(JSON.stringify(b));
    expect(snap.directions).toBeUndefined();
  });
  it.fails('EXPECTED: v4 placeholder Blocks are discarded on import (Decision 0019 item 13)', async () => {
    const snap = await importViaApp(asVersion(4));
    expect(snap.blocks.filter((b) => !b.blockingScenarioId).length).toBe(0);
  });
  it.fails('EXPECTED: v3 placeholder Blocks are discarded on import (pre-Phase-4 placeholders; DB v4 migration discards them)', async () => {
    const snap = await importViaApp(asVersion(3));
    expect(snap.blocks.length).toBe(0);
  });
});

describe('3.2 effect of kept v4 placeholder Blocks (Phase 1 finding 1-010)', () => {
  it('CURRENT: kept Blocks have no blockingScenarioId, carry tripProfileId, and are counted by deletion impact', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (s) => repository.saveProjectSnapshot(s));
    const { RouteDefinitionService } = await import('../../../src/application/routeDefinitionService');
    const service = new RouteDefinitionService(repository, backup);
    const project = await service.importProject(JSON.stringify(asVersion(4)));
    const snap = (await repository.getProjectSnapshot(project.id))!;
    const impact = await service.getProjectDeletionImpact(project.id);
    const scenarioImpact = await service.getScenarioDeletionImpact(snap.scenarios[0].id);
    const shape = { blocks: snap.blocks.length, withBlockingScenarioId: snap.blocks.filter((b) => b.blockingScenarioId).length, withTripProfileId: snap.blocks.filter((b) => b.tripProfileId).length, blockingScenarios: snap.blockingScenarios?.length ?? 0, projectImpactBlockCount: impact.blockCount, scenarioImpactBlockCount: scenarioImpact.blockCount };
    console.log('[1-010 effect]', JSON.stringify(shape));
    expect(shape).toEqual({ blocks: 69, withBlockingScenarioId: 0, withTripProfileId: 69, blockingScenarios: 0, projectImpactBlockCount: 69, scenarioImpactBlockCount: 69 });
  });
});

describe('3.2 round trip', () => {
  it.fails('EXPECTED: export(import(golden)) equals golden except exportedAt', () => {
    const original = goldenRaw();
    const again = JSON.parse(exportProjectJson(importProjectJson(goldenText())));
    delete original.exportedAt; delete again.exportedAt;
    const diffs: string[] = [];
    for (const key of new Set([...Object.keys(original), ...Object.keys(again)])) if (JSON.stringify(original[key]) !== JSON.stringify(again[key])) diffs.push(key);
    const blockKeyAdds = again.blocks.filter((b: any, i: number) => !('tripProfileId' in original.blocks[i]) && 'tripProfileId' in b).length;
    console.log('round-trip differing top-level keys:', diffs, 'blocks gaining tripProfileId:', blockKeyAdds);
    expect(diffs).toEqual([]);
  });
  it('CURRENT: second round trip is a fixed point', () => {
    const once = exportProjectJson(importProjectJson(goldenText()));
    const twice = exportProjectJson(importProjectJson(once));
    const strip = (s: string) => { const o = JSON.parse(s); delete o.exportedAt; return JSON.stringify(o); };
    expect(strip(twice)).toBe(strip(once));
  });
});
