// Package P04 (issues I-003, I-010, I-017): backup import keeps Block ownership as exported, discards pre-Phase-4 placeholder Blocks,
// and rejects malformed Block and Trip data before any write, with messages a planner can read.
import { describe, expect, it, vi } from 'vitest';
import { RouteDefinitionService } from '../application/routeDefinitionService';
import { duplicateScenario, projectSnapshotWithScenario, snapshotForScenario } from '../domain/project';
import { goldenJson, goldenRaw, goldenWithAltBlocking } from '../testSupport/goldenBackup';
import { exportProjectJson, importProjectJson, parseProjectBackupWithReport } from './backup';
import { ProjectBackupService } from './backupRepository';
import { InMemoryRouteDefinitionRepository } from './inMemoryRepository';

const newBackupService = () => {
  const repository = new InMemoryRouteDefinitionRepository();
  const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
  return { repository, backup, service: new RouteDefinitionService(repository, backup) };
};

describe('3-001: Block ownership survives export and import', () => {
  it('parses a backup with two Trip Profiles without adding a Trip Profile to normalized Blocks', () => {
    const { snapshot } = parseProjectBackupWithReport(JSON.stringify(goldenWithAltBlocking()));
    expect(snapshot.blocks.length).toBeGreaterThan(0);
    expect(snapshot.blocks.filter((block) => block.blockingScenarioId && block.tripProfileId)).toHaveLength(0);
  });

  it('restores a backup with a Blocking Scenario on each of two Trip Profiles through the app import path, ownership unchanged', async () => {
    const { service, repository } = newBackupService();
    const original = goldenWithAltBlocking();
    const project = await service.importProject(JSON.stringify(original));
    const stored = (await repository.getProjectSnapshot(project.id))!;
    // Import-as-copy gives every record a new id, so compare ownership by name and by counts.
    const profileName = (blockingScenarioId: string) => {
      const blockingScenario = stored.blockingScenarios!.find((candidate) => candidate.id === blockingScenarioId)!;
      return `${blockingScenario.name} on ${stored.tripProfiles!.find((profile) => profile.id === blockingScenario.tripProfileId)!.name}`;
    };
    const ownership = (blocks: Array<{ blockingScenarioId?: string }>, name: (id: string) => string) => {
      const counts: Record<string, number> = {};
      for (const block of blocks) counts[name(block.blockingScenarioId!)] = (counts[name(block.blockingScenarioId!)] ?? 0) + 1;
      return counts;
    };
    const originalName = (id: string) => {
      const blockingScenario = original.blockingScenarios.find((candidate: any) => candidate.id === id);
      return `${blockingScenario.name} on ${original.tripProfiles.find((profile: any) => profile.id === blockingScenario.tripProfileId).name}`;
    };
    expect(ownership(stored.blocks, profileName)).toEqual(ownership(original.blocks, originalName));
    expect(Object.keys(ownership(stored.blocks, profileName)).sort()).toEqual(['Alt Blocks on Alt', 'Workbook Blocks on Default']);
    expect(stored.blocks.filter((block) => block.tripProfileId)).toHaveLength(0);
  });

  it('round trips the golden file: export(import(golden)) equals the original Blocks, with no Trip Profile added', () => {
    const original = goldenRaw();
    const again = JSON.parse(exportProjectJson(importProjectJson(goldenJson())));
    expect(again.blocks).toEqual(original.blocks);
    for (const key of new Set([...Object.keys(original), ...Object.keys(again)])) {
      if (key !== 'exportedAt') expect(again[key], key).toEqual(original[key]);
    }
  });

  it('removes a Trip Profile that an older export stamped on a normalized Block when it matches the Blocking Scenario', () => {
    const file = goldenRaw();
    const profileOf = new Map(file.blockingScenarios.map((scenario: any) => [scenario.id, scenario.tripProfileId]));
    file.blocks = file.blocks.map((block: any) => ({ ...block, tripProfileId: profileOf.get(block.blockingScenarioId) }));
    const { snapshot } = parseProjectBackupWithReport(JSON.stringify(file));
    expect(snapshot.blocks.filter((block) => block.tripProfileId)).toHaveLength(0);
  });

  it('still rejects a normalized Block whose stamped Trip Profile differs from its Blocking Scenario', () => {
    const file = goldenWithAltBlocking();
    file.blocks[0].tripProfileId = 'alt-profile';
    expect(() => importProjectJson(JSON.stringify(file))).toThrow(/Trip Profile/);
  });
});

/** The golden backup converted to an older schema by removing the collections that version did not have. */
function asVersion(version: number): any {
  const backup = goldenRaw();
  backup.exportSchemaVersion = version;
  if (version < 6) delete backup.costingAssumptions;
  if (version < 5) { delete backup.blockingScenarios; backup.blocks = backup.blocks.map(({ blockingScenarioId: _owner, ...rest }: any) => ({ ...rest, ...(version === 4 ? { tripProfileId: backup.tripProfiles[0].id } : {}) })); }
  if (version < 4) { delete backup.tripProfiles; backup.trips = backup.trips.map(({ tripProfileId: _profile, ...rest }: any) => rest); }
  if (version < 3) { delete backup.trips; delete backup.blocks; }
  if (version < 2) { delete backup.runtimeProfiles; delete backup.runtimeAssignments; }
  return backup;
}

describe('1-010: placeholder Blocks of version 3 and 4 backups are discarded (Decision 0019 item 13)', () => {
  it('discards the 69 placeholder Blocks of a version 4 backup and reports the count', () => {
    const { snapshot, report } = parseProjectBackupWithReport(JSON.stringify(asVersion(4)));
    expect(snapshot.blocks).toEqual([]);
    expect(snapshot.blockingScenarios).toBeUndefined();
    expect(report.discardedPlaceholderBlocks).toBe(69);
  });

  it('discards the 69 placeholder Blocks of a version 3 backup and reports the count', () => {
    const { snapshot, report } = parseProjectBackupWithReport(JSON.stringify(asVersion(3)));
    expect(snapshot.blocks).toEqual([]);
    expect(report.discardedPlaceholderBlocks).toBe(69);
  });

  it('stores no placeholder Blocks, so deletion counts match what the planner sees', async () => {
    const { service, repository } = newBackupService();
    const project = await service.importProject(JSON.stringify(asVersion(4)));
    expect((await repository.getProjectSnapshot(project.id))!.blocks).toEqual([]);
    expect((await service.getProjectDeletionImpact(project.id)).blockCount).toBe(0);
  });

  it('reports the count through the backup service', async () => {
    const { backup } = newBackupService();
    const { report } = await backup.importProjectWithReport(JSON.stringify(asVersion(4)), 'copy');
    expect(report.discardedPlaceholderBlocks).toBe(69);
  });

  it('also discards a Block without a Blocking Scenario in a current-version file and keeps the normalized Blocks', () => {
    const file = goldenRaw();
    const normalizedCount = file.blocks.length;
    file.blocks.push({ ...file.blocks[0], id: 'placeholder', blockingScenarioId: undefined, tripProfileId: file.tripProfiles[0].id, activities: [] });
    const { snapshot, report } = parseProjectBackupWithReport(JSON.stringify(file));
    expect(report.discardedPlaceholderBlocks).toBe(1);
    expect(snapshot.blocks).toHaveLength(normalizedCount);
  });

  it('reports zero for the golden backup', () => {
    expect(parseProjectBackupWithReport(goldenJson()).report.discardedPlaceholderBlocks).toBe(0);
  });
});

describe('versions 1 to 6 still import', () => {
  for (const version of [1, 2, 3, 4, 5, 6]) {
    it(`imports a version ${version} backup through the app path and normalizes it`, async () => {
      const { service, repository } = newBackupService();
      const project = await service.importProject(JSON.stringify(asVersion(version)));
      const stored = (await repository.getProjectSnapshot(project.id))!;
      expect(stored.tripProfiles!.length).toBeGreaterThanOrEqual(stored.scenarios.length);
      expect(stored.trips.filter((trip) => !trip.tripProfileId)).toHaveLength(0);
      expect(stored.blocks.filter((block) => !block.blockingScenarioId)).toHaveLength(0);
      expect(stored.blocks.length).toBe(version >= 5 ? 69 : 0);
    });
  }
});

/** The golden project plus a duplicated second Scenario, so a reference to another Scenario can be injected. */
function twoScenarios(): any {
  const snapshot = importProjectJson(goldenJson());
  const copy = duplicateScenario(snapshotForScenario(snapshot, snapshot.scenarios[0].id)!, 'Second');
  const both = projectSnapshotWithScenario(snapshot, copy);
  both.scenarios = [snapshot.scenarios[0], copy.scenario];
  return JSON.parse(exportProjectJson(both));
}
const scenarioTwo = (backup: any) => backup.scenarios[1].id;
const firstOf = (backup: any, key: string, scenarioIndex = 0) => backup[key].find((record: any) => record.scenarioId === backup.scenarios[scenarioIndex].id);
const pullOut = (backup: any) => backup.blocks.flatMap((block: any) => block.activities).find((activity: any) => activity.type === 'pullOut');
const stamp = (backup: any) => backup.exportedAt;
const generationSetWithoutLimit = (backup: any) => ({ id: 'g', scenarioId: backup.scenarios[0].id, routeId: backup.routes[0].id, serviceDayId: backup.serviceDays[0].id, patternId: backup.patterns[0].id, name: 'g', firstDeparture: 0, headwaySeconds: 600, generationRevision: 0, createdAt: stamp(backup), updatedAt: stamp(backup) });
const costing = (backup: any, changes: Record<string, unknown>) => ({ id: 'c', scenarioId: backup.scenarios[0].id, currencyCode: 'USD', enteredRate: 1, rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: 0.03, createdAt: stamp(backup), updatedAt: stamp(backup), ...changes });

interface Case { name: string; base?: () => any; mutate: (backup: any) => void; /** The rejection message must match this; omitted when the file must import. */ rejects?: RegExp }
const cases: Case[] = [
  // Rejected before this package.
  { name: 'trip.patternId unknown', mutate: (b) => { b.trips[0].patternId = 'nope'; }, rejects: /missing record/ },
  { name: 'revenue tripId unknown', mutate: (b) => { b.blocks[0].activities.find((a: any) => a.type === 'revenueTrip').tripId = 'nope'; }, rejects: /missing trip/ },
  { name: 'runtime assignment profile unknown', mutate: (b) => { b.runtimeAssignments[0].runtimeProfileId = 'nope'; }, rejects: /./ },
  { name: 'blockingScenario.tripProfileId unknown', mutate: (b) => { b.blockingScenarios[0].tripProfileId = 'nope'; }, rejects: /Trip Profile/ },
  { name: 'duplicate id: two nodes', mutate: (b) => { b.nodes[1].id = b.nodes[0].id; }, rejects: /duplicate node id/ },
  { name: 'duplicate id: two trips', mutate: (b) => { b.trips[1].id = b.trips[0].id; }, rejects: /duplicate trip id/ },
  { name: 'duplicate id: two runtime assignments', mutate: (b) => { b.runtimeAssignments[1].id = b.runtimeAssignments[0].id; }, rejects: /./ },
  { name: 'duplicate id: pattern point reused in another pattern', mutate: (b) => { b.patterns[1].points[0].id = b.patterns[0].points[0].id; }, rejects: /./ },
  { name: 'trip.serviceDayId from the other Scenario', base: twoScenarios, mutate: (b) => { firstOf(b, 'trips').serviceDayId = firstOf(b, 'serviceDays', 1).id; }, rejects: /./ },
  { name: 'stop time as a string', mutate: (b) => { b.trips[0].stopTimes[0].time = String(b.trips[0].stopTimes[0].time); }, rejects: /stopTimes/ },
  { name: 'annualServiceDays as a string', mutate: (b) => { b.serviceDays[0].annualServiceDays = '255'; }, rejects: /annualServiceDays/ },
  { name: 'negative stop time', mutate: (b) => { b.trips[0].stopTimes[0].time = -60; }, rejects: /stopTimes/ },
  { name: 'costing: enteredRate -1', mutate: (b) => { b.costingAssumptions = [costing(b, { enteredRate: -1 })]; }, rejects: /enteredRate/ },
  { name: 'costing: futureYearCount 11', mutate: (b) => { b.costingAssumptions = [costing(b, { futureYearCount: 11 })]; }, rejects: /futureYearCount/ },
  { name: 'costing: annualEscalation -1', mutate: (b) => { b.costingAssumptions = [costing(b, { annualEscalation: -1 })]; }, rejects: /annualEscalation/ },
  { name: 'costing: rateYear after baseServiceYear', mutate: (b) => { b.costingAssumptions = [costing(b, { rateYear: 2026 })]; }, rejects: /rateYear/ },

  // Accepted before this package although they should be rejected (finding 3-005).
  { name: 'pull-out toNodeId unknown', mutate: (b) => { pullOut(b).toNodeId = 'nope'; }, rejects: /Node/ },
  { name: 'pull-out Node from another Scenario', base: twoScenarios, mutate: (b) => { firstOf(b, 'blocks').activities.find((a: any) => a.type === 'pullOut').toNodeId = firstOf(b, 'nodes', 1).id; }, rejects: /Node/ },
  { name: 'trip.provenance missing', mutate: (b) => { delete b.trips[0].provenance; }, rejects: /^Invalid project backup: .*provenance/ },
  { name: 'duplicate id: two activities of one Block', mutate: (b) => { b.blocks[0].activities[1].id = b.blocks[0].activities[0].id; }, rejects: /activity id/ },
  { name: 'the same Trip in two Blocks of one Blocking Scenario and day', mutate: (b) => { const tripId = b.blocks[0].activities.find((a: any) => a.type === 'revenueTrip').tripId; const other = b.blocks.find((k: any, i: number) => i > 0 && k.serviceDayId === b.blocks[0].serviceDayId); other.activities.push({ id: 'dup-act', type: 'revenueTrip', sequence: other.activities.length, tripId }); }, rejects: /Trip/ },
  { name: 'Block label repeated in one Blocking Scenario and day', mutate: (b) => { const other = b.blocks.find((k: any, i: number) => i > 0 && k.serviceDayId === b.blocks[0].serviceDayId); other.label = b.blocks[0].label; }, rejects: /labeled/ },
  { name: 'trip stop times repeat one pattern point', mutate: (b) => { b.trips[0].stopTimes[1].patternPointId = b.trips[0].stopTimes[0].patternPointId; }, rejects: /repeats/ },
  { name: 'trip.routeId from the other Scenario', base: twoScenarios, mutate: (b) => { firstOf(b, 'trips').routeId = firstOf(b, 'routes', 1).id; }, rejects: /another Scenario/ },
  { name: 'trip.patternId from the other Scenario', base: twoScenarios, mutate: (b) => { const trip = firstOf(b, 'trips'); const other = b.patterns.find((p: any) => p.scenarioId === scenarioTwo(b) && p.points.length === trip.stopTimes.length); trip.patternId = other.id; trip.stopTimes = trip.stopTimes.map((stop: any, i: number) => ({ ...stop, patternPointId: other.points[i].id })); }, rejects: /another Scenario/ },
  { name: 'empty Block on a service day of another Scenario', base: twoScenarios, mutate: (b) => { const block = firstOf(b, 'blocks'); block.activities = []; block.serviceDayId = firstOf(b, 'serviceDays', 1).id; }, rejects: /service day/ },
  { name: 'Blocking Scenario on profile A assigns a Trip of profile B', mutate: (b) => { b.tripProfiles.push({ id: 'profile-b', scenarioId: b.scenarios[0].id, name: 'B', createdAt: stamp(b), updatedAt: stamp(b) }); const tripId = b.blocks[0].activities.find((a: any) => a.type === 'revenueTrip').tripId; b.trips.find((t: any) => t.id === tripId).tripProfileId = 'profile-b'; }, rejects: /Trip Profile/ },
  { name: 'unknown activity type', mutate: (b) => { b.blocks[0].activities[0].type = 'teleport'; }, rejects: /type/ },
  { name: 'pull-out minutesBeforeFirstTrip as a string', mutate: (b) => { pullOut(b).minutesBeforeFirstTrip = 'thirty'; }, rejects: /minutesBeforeFirstTrip/ },
  { name: 'pull-out minutesBeforeFirstTrip -30', mutate: (b) => { pullOut(b).minutesBeforeFirstTrip = -30; }, rejects: /time/ },
  { name: 'deadhead explicit startTime -100', mutate: (b) => { const block = b.blocks.find((k: any) => k.activities.filter((a: any) => a.type === 'revenueTrip').length >= 2); const ordered = [...block.activities].sort((x: any, y: any) => x.sequence - y.sequence); const at = ordered.findIndex((a: any) => a.type === 'revenueTrip') + 1; ordered.splice(at, 0, { id: 'dh', type: 'deadhead', sequence: at, startTime: -100, endTime: 50, fromNodeId: b.nodes[0].id, toNodeId: b.nodes[1].id }); block.activities = ordered.map((a: any, i: number) => ({ ...a, sequence: i })); }, rejects: /time/ },
  { name: 'block activity miles -5', mutate: (b) => { pullOut(b).miles = -5; }, rejects: /miles/ },
  { name: 'generation set without a limit', mutate: (b) => { b.generationSets = [generationSetWithoutLimit(b)]; }, rejects: /^Invalid project backup: generationSets\[0\]\.limit/ },

  // Accepted by design.
  { name: 'direction column with an unknown Node (recovered from Pattern points, commit 4fc88ba)', mutate: (b) => { b.directions[0].columns[0].nodeId = 'nope'; } },
  { name: 'service day total of 400 (documented as preserved)', mutate: (b) => { b.serviceDays[0].annualServiceDays = 400; } },
  { name: 'an unknown field on a trip', mutate: (b) => { b.trips[0].evil = 'x'; } },
];

describe('3-005: import validation rejects malformed Block and Trip data before any write', () => {
  for (const testCase of cases) {
    it(`${testCase.rejects ? 'rejects' : 'accepts'}: ${testCase.name}`, async () => {
      const backup = (testCase.base ?? goldenRaw)();
      testCase.mutate(backup);
      const text = JSON.stringify(backup);
      if (!testCase.rejects) { expect(() => importProjectJson(text)).not.toThrow(); return; }
      let message = '';
      try { importProjectJson(text); } catch (error) { message = (error as Error).message; }
      expect(message, 'the file must be rejected').not.toBe('');
      expect(message).toMatch(testCase.rejects);
      // A planner can read the message: no raw runtime error text.
      expect(message).not.toMatch(/Cannot read|is not iterable|is not a function|undefined/);
      // Through the app import path nothing is written.
      const { service, repository } = newBackupService();
      await expect(service.importProject(text)).rejects.toThrow();
      expect(repository.projects.size + repository.scenarios.size + repository.trips.size + repository.nodes.size + repository.blocks.size).toBe(0);
    });
  }

  it('gives import-as-copy a user-safe message for a Trip without provenance', async () => {
    const { backup } = newBackupService();
    const file = goldenRaw();
    delete file.trips[0].provenance;
    await expect(backup.importProject(JSON.stringify(file), 'copy')).rejects.toThrow(/^Invalid project backup: /);
  });

  it('keeps unknown fields and prototype keys inert', async () => {
    const text = goldenJson().replace(/"trips":\s*\[\s*\{/, '"trips":[{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted2":"yes"}},');
    expect(text).not.toBe(goldenJson());
    const { backup } = newBackupService();
    try { await backup.importProject(text, 'copy'); } catch { /* a rejection is also safe; only pollution matters here */ }
    expect(({} as any).polluted).toBeUndefined();
    expect(({} as any).polluted2).toBeUndefined();
  });

  it('parses and validates a 20-fold copy of the golden Trips within budget', () => {
    const backup = goldenRaw();
    const base = backup.trips;
    for (let copy = 1; copy < 20; copy += 1) backup.trips = backup.trips.concat(base.map((trip: any) => ({ ...trip, id: `${trip.id}-${copy}` })));
    const text = JSON.stringify(backup);
    const started = performance.now();
    importProjectJson(text);
    expect(performance.now() - started).toBeLessThan(10000);
  });
});

describe('recovery and validation work together', () => {
  /** The golden project, marked as a copy whose source Scenario is not in the file. */
  function copyOfDeletedSource(): any {
    const backup = goldenRaw();
    backup.scenarios[0].sourceScenarioId = 'deleted-source-scenario';
    return backup;
  }

  it('imports a copy whose pull-out Node was lost with its source, taking the Node from the first Trip (decision C8)', () => {
    const backup = copyOfDeletedSource();
    const original = pullOut(backup).toNodeId;
    pullOut(backup).toNodeId = 'node-of-the-deleted-source';
    const { snapshot, report } = parseProjectBackupWithReport(JSON.stringify(backup));
    expect(report.recoveredNodeReferences).toBe(1);
    expect(report.recoveryFindings).toEqual([]);
    expect(snapshot.blocks.flatMap((block) => block.activities).find((activity) => activity.type === 'pullOut' && activity.id === pullOut(backup).id)).toMatchObject({ toNodeId: original });
  });

  it('imports a copy whose garage Node was lost with its source, clears it, and reports a finding that names the Block', () => {
    const backup = copyOfDeletedSource();
    const block = backup.blocks.find((candidate: any) => candidate.activities.some((activity: any) => activity.type === 'pullOut'));
    block.activities.find((activity: any) => activity.type === 'pullOut').fromNodeId = 'garage-of-the-deleted-source';
    const { snapshot, report } = parseProjectBackupWithReport(JSON.stringify(backup));
    expect(report.recoveryFindings).toEqual([expect.objectContaining({ entityId: block.id, field: 'pullOut.fromNodeId', parameters: expect.objectContaining({ blockLabel: block.label }) })]);
    const stored = snapshot.blocks.find((candidate) => candidate.id === block.id)!;
    expect(stored.activities.find((activity) => activity.type === 'pullOut')).not.toHaveProperty('fromNodeId');
  });

  it('imports a copy whose required Node cannot be recovered, leaves it, and reports a finding that names the Block', () => {
    const backup = copyOfDeletedSource();
    const block = backup.blocks[0];
    block.activities = [{ id: 'only-activity', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 5, toNodeId: 'node-of-the-deleted-source' }];
    const { snapshot, report } = parseProjectBackupWithReport(JSON.stringify(backup));
    expect(report.recoveryFindings).toEqual([expect.objectContaining({ entityId: block.id, field: 'pullOut.toNodeId', parameters: expect.objectContaining({ blockLabel: block.label }) })]);
    expect(snapshot.blocks.find((candidate) => candidate.id === block.id)!.activities[0]).toMatchObject({ toNodeId: 'node-of-the-deleted-source' });
  });

  it('imports a Scenario copy whose Route was renamed, so its leaked Node references stay and are reported', () => {
    const backup = twoScenarios();
    const copyScenarioId = scenarioTwo(backup);
    backup.routes.find((route: any) => route.scenarioId === copyScenarioId).name = 'Renamed after copying';
    const block = backup.blocks.find((candidate: any) => candidate.scenarioId === copyScenarioId && candidate.activities.some((activity: any) => activity.type === 'pullOut'));
    block.activities.find((activity: any) => activity.type === 'pullOut').toNodeId = backup.nodes.find((node: any) => node.scenarioId === backup.scenarios[0].id).id;
    const { report } = parseProjectBackupWithReport(JSON.stringify(backup));
    expect(report.recoveryFindings).toEqual([expect.objectContaining({ entityId: block.id, field: 'pullOut.toNodeId' })]);
  });

  it('rejects, rather than discards, a Block whose blockingScenarioId is present but malformed', () => {
    for (const malformed of [7, { id: 'x' }, true]) {
      const backup = goldenRaw();
      backup.blocks[2].blockingScenarioId = malformed;
      expect(() => importProjectJson(JSON.stringify(backup))).toThrow(/Blocking Scenario/);
    }
  });

  it('names the position of a bad Block as it is in the file, even after placeholder Blocks are removed', () => {
    const backup = goldenRaw();
    backup.blocks.unshift({ ...backup.blocks[0], id: 'placeholder', blockingScenarioId: undefined, tripProfileId: backup.tripProfiles[0].id, activities: [] });
    backup.blocks[3] = 'not a block';
    expect(() => importProjectJson(JSON.stringify(backup))).toThrow('Invalid project backup: blocks[3] must be an object');
  });

  it('still imports a file whose activity sequence numbers have gaps', () => {
    const backup = goldenRaw();
    for (const block of backup.blocks) block.activities = block.activities.map((activity: any) => ({ ...activity, sequence: activity.sequence * 2 }));
    expect(() => importProjectJson(JSON.stringify(backup))).not.toThrow();
  });

  it('turns a field of an unexpected type that no check names into a readable message and keeps the cause', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const backup = goldenRaw();
    backup.patterns[0].points[1] = null;
    let failure: Error | undefined;
    try { importProjectJson(JSON.stringify(backup)); } catch (error) { failure = error as Error; }
    expect(failure?.message).toMatch(/^Invalid project backup: /);
    expect(failure?.cause).toBeInstanceOf(Error);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
