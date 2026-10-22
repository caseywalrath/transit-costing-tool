// Phase 3 reproduction. Backs findings 3-001 (backup import normalizes normalized
// Blocks with a stray Trip Profile ID, so restore fails) and 3-002 (Scenario
// duplication stamps every Block with the first Trip Profile).
// Asserts EXPECTED behaviour; these tests fail on the reviewed code.
// Defect tests use it.fails: they assert the expected behaviour, fail on the reviewed code,
// and are reported as passing so the golden suite stays green. Change it.fails to it to see the failure.
// Run: pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p3-multiprofile.golden.test.ts
import { describe, it, expect } from 'vitest';
import { importProjectJson } from '../../../src/persistence/backup';
import { ProjectBackupService } from '../../../src/persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../../../src/persistence/inMemoryRepository';
import { RouteDefinitionService } from '../../../src/application/routeDefinitionService';
import { goldenWithAltProfile } from './p3-fixture';

function setup() {
  const repository = new InMemoryRouteDefinitionRepository();
  const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (s) => repository.saveProjectSnapshot(s));
  return { repository, backup, service: new RouteDefinitionService(repository, backup) };
}

describe('3-001: backup restore with two Trip Profiles', () => {
  it.fails('parse leaves normalized Blocks without a duplicate tripProfileId (Decision 0019 item 9)', () => {
    const parsed = importProjectJson(JSON.stringify(goldenWithAltProfile()));
    const stamped = parsed.blocks.filter((b) => b.blockingScenarioId && b.tripProfileId);
    const wrong = parsed.blocks.filter((b) => b.blockingScenarioId && b.tripProfileId && b.tripProfileId !== parsed.blockingScenarios!.find((s) => s.id === b.blockingScenarioId)!.tripProfileId);
    console.log(JSON.stringify({ blocks: parsed.blocks.length, stampedWithTripProfileId: stamped.length, stampedWithWrongProfile: wrong.length }));
    expect(stamped.length).toBe(0);
  });
  it.fails('the app import path (mode copy, as used by RouteDefinitionService.importProject) restores the file', async () => {
    const { service, repository } = setup();
    let error: unknown;
    try { await service.importProject(JSON.stringify(goldenWithAltProfile())); } catch (e) { error = e; }
    console.log('importProject result:', error instanceof Error ? error.message : 'ok', 'projects stored:', repository.projects.size);
    expect(error).toBeUndefined();
  });
});

describe('3-002: Scenario duplication with two Trip Profiles', () => {
  it.fails('duplicates a Scenario whose Blocking Scenarios use different Trip Profiles', async () => {
    const { repository, service } = setup();
    // Seed as the running app stores it: normalized Blocks carry no tripProfileId.
    const raw = goldenWithAltProfile();
    await repository.saveProjectSnapshot({ ...raw, generationSets: [] });
    const records = (await repository.getScenarioRecords(raw.scenarios[0].id))!;
    let error: unknown; let copy: any;
    try { copy = await service.duplicateScenario(records, 'Copy'); } catch (e) { error = e; }
    console.log('duplicateScenario result:', error instanceof Error ? error.message : 'ok');
    if (copy) {
      const ownerProfile = new Map(copy.blockingScenarios.map((s: any) => [s.id, s.tripProfileId]));
      console.log('blocks with tripProfileId != owner profile:', copy.blocks.filter((b: any) => b.tripProfileId && b.tripProfileId !== ownerProfile.get(b.blockingScenarioId)).length);
    }
    expect(error).toBeUndefined();
  });
  it.fails('duplicate does not add tripProfileId to normalized Blocks', async () => {
    const { repository } = setup();
    const raw = goldenWithAltProfile();
    // Single-profile variant: only the Default profile's Blocking Scenario has Blocks
    raw.blocks = raw.blocks.filter((b: any) => b.blockingScenarioId !== 'p3-alt-blocking');
    await repository.saveProjectSnapshot({ ...raw, generationSets: [] });
    const records = (await repository.getScenarioRecords(raw.scenarios[0].id))!;
    const { duplicateScenario } = await import('../../../src/domain/project');
    const copy = duplicateScenario(records, 'Copy');
    const stamped = copy.blocks.filter((b) => b.blockingScenarioId && b.tripProfileId).length;
    console.log('copied normalized blocks stamped with tripProfileId:', stamped, 'of', copy.blocks.length);
    expect(stamped).toBe(0);
  });
});

describe('3.4 remap coverage: Trip Profile copy and Blocking Scenario duplication (CURRENT, passing)', () => {
  it('Trip Profile copy: new Trip IDs and profile, shared Scenario references, no Blocks copied', async () => {
    const { TripGenerationService } = await import('../../../src/application/tripGenerationService');
    const repository = new InMemoryRouteDefinitionRepository();
    const raw = goldenWithAltProfile();
    await repository.saveProjectSnapshot({ ...raw, generationSets: [] });
    const blocksBefore = repository.blocks.size;
    const copy = await new TripGenerationService(repository).copyTripProfile(raw.tripProfiles[0].id, 'Copied');
    const copied = [...repository.trips.values()].filter((t) => t.tripProfileId === copy.id);
    const source = raw.trips.filter((t: any) => t.tripProfileId === raw.tripProfiles[0].id);
    const sourceIds = new Set(source.map((t: any) => t.id));
    const patternIds = new Set(raw.patterns.map((p: any) => p.id));
    const pointIds = new Set(raw.patterns.flatMap((p: any) => p.points.map((pt: any) => pt.id)));
    const result = { copied: copied.length, source: source.length, reusedIds: copied.filter((t) => sourceIds.has(t.id)).length, foreignPatterns: copied.filter((t) => !patternIds.has(t.patternId)).length, foreignPoints: copied.flatMap((t) => t.stopTimes).filter((p) => !pointIds.has(p.patternPointId)).length, blocksAdded: repository.blocks.size - blocksBefore, sourceTripProfileId: copy.sourceTripProfileId === raw.tripProfiles[0].id };
    console.log('[3.4] trip profile copy', JSON.stringify(result));
    expect(result).toEqual({ copied: source.length, source: source.length, reusedIds: 0, foreignPatterns: 0, foreignPoints: 0, blocksAdded: 0, sourceTripProfileId: true });
  });
  it('Blocking Scenario duplication: new Scenario/Block/activity IDs, same Trip Profile and Trip references', async () => {
    const { duplicateBlockingScenario } = await import('../../../src/domain/blocking');
    const raw = goldenWithAltProfile();
    const bs = raw.blockingScenarios[0]; const blocks = raw.blocks.filter((b: any) => b.blockingScenarioId === bs.id);
    const copy = duplicateBlockingScenario({ scenario: bs, blocks }, 'Dup');
    const oldIds = new Set([bs.id, ...blocks.map((b: any) => b.id), ...blocks.flatMap((b: any) => b.activities.map((a: any) => a.id))]);
    const newIds = [copy.scenario.id, ...copy.blocks.map((b) => b.id), ...copy.blocks.flatMap((b) => b.activities.map((a) => a.id))];
    const tripRefs = (bb: any[]) => bb.flatMap((b) => b.activities).filter((a: any) => a.type === 'revenueTrip').map((a: any) => a.tripId).sort();
    const result = { reusedIds: newIds.filter((id) => oldIds.has(id)).length, sameProfile: copy.scenario.tripProfileId === bs.tripProfileId, sameTrips: JSON.stringify(tripRefs(copy.blocks)) === JSON.stringify(tripRefs(blocks)), ownership: copy.blocks.every((b) => b.blockingScenarioId === copy.scenario.id && b.scenarioId === bs.scenarioId), hasSourceBlockingScenarioId: 'sourceBlockingScenarioId' in copy.scenario };
    console.log('[3.4] blocking duplicate', JSON.stringify(result));
    expect(result).toEqual({ reusedIds: 0, sameProfile: true, sameTrips: true, ownership: true, hasSourceBlockingScenarioId: false });
  });
});
