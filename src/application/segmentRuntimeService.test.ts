import { describe, expect, it } from 'vitest';
import { ProjectBackupService } from '../persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { metadata } from '../domain/ids';
import type { RuntimeProfile, Trip } from '../domain/types';
import { addTwoStopPattern, savePatternDraft } from '../testSupport/routeFixtures';
import { RouteDefinitionService, SEGMENT_RUNTIME_UNDO_REFUSED } from './routeDefinitionService';

/** Decision 0049: copy and fill of matching segments between the Patterns of a Route. */
async function setup(patternCount = 2) {
  const repository = new InMemoryRouteDefinitionRepository();
  const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
  const service = new RouteDefinitionService(repository, backup, () => '2026-09-10T12:00:00.000Z');
  const created = await service.createProject('Segments');
  const addedRoute = await service.addRoute(created.records);
  let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, addedRoute.route.id)).aggregate!;
  aggregate = (await addTwoStopPattern(service, aggregate, { names: ['South', 'North'], patternName: 'Trunk' })).aggregate;
  for (let index = 1; index < patternCount; index += 1) {
    aggregate = (await savePatternDraft(service, aggregate, { ...service.duplicatePatternDraft(aggregate, aggregate.patterns[0].id), name: `Branch ${index}` })).aggregate;
  }
  const scenarioId = created.records.scenario.id;
  const weekday = created.records.serviceDays[0];
  const profiles: RuntimeProfile[] = [];
  for (const pattern of aggregate.patterns) {
    const profile = await service.createDefaultRuntimeProfile(pattern, `${pattern.name} runtimes`);
    await service.assignRuntimeProfile(scenarioId, pattern.id, weekday.id, profile.id);
    profiles.push(profile);
  }
  const setSeconds = async (index: number, seconds: number) => {
    const stored = (await service.listRuntimeProfiles(aggregate.route.id)).find((profile) => profile.id === profiles[index].id)!;
    return service.saveRuntimeProfile({ ...stored, bands: stored.bands.map((band) => ({ ...band, segmentRuntimeSeconds: [seconds] })) });
  };
  const stored = async (index: number) => (await service.listRuntimeProfiles(aggregate.route.id)).find((profile) => profile.id === profiles[index].id)!;
  return { repository, service, aggregate, profiles, scenarioId, weekday, setSeconds, stored };
}

describe('segment runtime copy and fill (service)', () => {
  it('preview then apply writes the cells and raises each changed revision by exactly one', async () => {
    const { service, profiles, setSeconds, stored } = await setup();
    await setSeconds(0, 600);
    const before = (await stored(1)).calculationRevision ?? 0;
    const preview = await service.previewSegmentRuntimeFill(profiles[1].id);
    expect(preview.changes).toHaveLength(1);
    expect(preview.segmentLabels[profiles[1].id]).toEqual(['South → North']);
    await service.applySegmentRuntimePlan(preview);
    const after = await stored(1);
    expect(after.bands[0].segmentRuntimeSeconds).toEqual([600]);
    expect(after.calculationRevision).toBe(before + 1);
    expect((await stored(0)).calculationRevision).toBe(1);
  });

  it('copy replaces other patterns and reports the Trips that will need regeneration', async () => {
    const { service, repository, profiles, scenarioId, aggregate, weekday, setSeconds, stored } = await setup();
    await setSeconds(0, 600);
    await setSeconds(1, 120);
    const trip = { id: 'trip-1', scenarioId, routeId: aggregate.route.id, serviceDayId: weekday.id, patternId: aggregate.patterns[1].id, stopTimes: [], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [], runtimeProfileId: profiles[1].id }, ...metadata('2026-09-10T00:00:00.000Z') } as unknown as Trip;
    await repository.saveTrips([trip]);
    const preview = await service.previewSegmentRuntimeCopy(profiles[0].id);
    expect(preview.staleTripCountByProfileId).toEqual({ [profiles[1].id]: 1 });
    expect(preview.copyCandidates).toEqual([{ profileId: profiles[1].id, patternId: aggregate.patterns[1].id, included: true }]);
    await service.applySegmentRuntimePlan(preview);
    expect((await stored(1)).bands[0].segmentRuntimeSeconds).toEqual([600]);
    expect((await service.previewSegmentRuntimeCopy(profiles[0].id, [profiles[1].id])).changes).toEqual([]);
  });

  it('refuses to apply when runtimes changed after the preview, and writes nothing', async () => {
    const { service, profiles, setSeconds, stored } = await setup();
    await setSeconds(0, 600);
    const preview = await service.previewSegmentRuntimeFill(profiles[1].id);
    await setSeconds(1, 300);
    await expect(service.applySegmentRuntimePlan(preview)).rejects.toThrow('Runtimes changed after the preview. Review the changes again.');
    expect((await stored(1)).bands[0].segmentRuntimeSeconds).toEqual([300]);
  });

  it('aborts the whole write when one target is invalid', async () => {
    const { service, repository, profiles, setSeconds, stored } = await setup(3);
    await setSeconds(0, 600);
    const preview = await service.previewSegmentRuntimeCopy(profiles[0].id);
    expect(preview.affectedProfiles).toHaveLength(2);
    // The repository refuses an invalid profile, so the stored profile is made invalid only for the service's read.
    const invalid = { ...(await stored(2)), name: '   ' };
    const read = repository.updateScenarioRecords.bind(repository);
    repository.updateScenarioRecords = (id, change) => read(id, (current) => change({ ...current, runtimeProfiles: current.runtimeProfiles.map((profile) => profile.id === invalid.id ? invalid : profile) }));
    await expect(service.applySegmentRuntimePlan(preview)).rejects.toThrow('Review the runtime profile before saving it.');
    expect((await stored(1)).bands[0].segmentRuntimeSeconds).toEqual([0]);
  });

  it('undo restores the previous values and raises the revisions again', async () => {
    const { service, profiles, setSeconds, stored } = await setup();
    await setSeconds(0, 600);
    expect(service.getSegmentRuntimeUndo()).toBeUndefined();
    await service.applySegmentRuntimePlan(await service.previewSegmentRuntimeFill(profiles[1].id));
    const revision = (await stored(1)).calculationRevision ?? 0;
    expect(service.getSegmentRuntimeUndo()).toEqual({ routeId: expect.any(String), profileCount: 1 });
    await service.undoSegmentRuntimePlan();
    const restored = await stored(1);
    expect(restored.bands[0].segmentRuntimeSeconds).toEqual([0]);
    expect(restored.calculationRevision).toBe(revision + 1);
    expect(service.getSegmentRuntimeUndo()).toBeUndefined();
  });

  it('makes undo unavailable after another runtime save', async () => {
    const { service, profiles, setSeconds } = await setup();
    await setSeconds(0, 600);
    await service.applySegmentRuntimePlan(await service.previewSegmentRuntimeFill(profiles[1].id));
    await setSeconds(0, 610);
    expect(service.getSegmentRuntimeUndo()).toBeUndefined();
  });

  it('refuses undo when a profile changed outside the service', async () => {
    const { service, repository, profiles, setSeconds, stored } = await setup();
    await setSeconds(0, 600);
    await service.applySegmentRuntimePlan(await service.previewSegmentRuntimeFill(profiles[1].id));
    const applied = await stored(1);
    await repository.saveRuntimeProfile({ ...applied, calculationRevision: (applied.calculationRevision ?? 0) + 1 });
    await expect(service.undoSegmentRuntimePlan()).rejects.toThrow(SEGMENT_RUNTIME_UNDO_REFUSED);
    expect((await stored(1)).bands[0].segmentRuntimeSeconds).toEqual([600]);
    expect(service.getSegmentRuntimeUndo()).toBeUndefined();
  });
});
