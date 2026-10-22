// Phase 4 analyst A1 reproductions for findings A1-01 .. A1-09 (application-layer stale-source protection and validation).
// Defect tests use it.fails: they assert the EXPECTED behaviour, fail on the reviewed code, and are reported as passing so the golden suite stays green.
// Change it.fails to it to see the failure.
// Run: pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p4-stale-preview.golden.test.ts
// All tests use the in-memory repository. Dexie parity (finding 3-013): A1-01 is the same on Dexie by code read (dexieRepository.ts:92-142 deletes every
// Scenario row that is absent from the supplied records); A1-02 .. A1-04 have no repository-specific dependency (the application layer decides).
import { describe, expect, it } from 'vitest';
import { metadata } from '../../../src/domain/ids';
import type { Block, ProjectSnapshot, RoutePattern, RuntimeProfile, Trip } from '../../../src/domain/types';
import { InMemoryRouteDefinitionRepository } from '../../../src/persistence/inMemoryRepository';
import { ProjectBackupService } from '../../../src/persistence/backupRepository';
import { TripGenerationService } from '../../../src/application/tripGenerationService';
import { RouteDefinitionService } from '../../../src/application/routeDefinitionService';

const time = '2026-09-14T00:00:00.000Z';
const project = { id: 'project', name: 'Project', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata(time) };
const scenario = { id: 'scenario', projectId: project.id, name: 'Scenario', ...metadata(time) };
const days = [
  { id: 'weekday', scenarioId: scenario.id, kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...metadata(time) },
  { id: 'saturday', scenarioId: scenario.id, kind: 'saturday' as const, name: 'Saturday', annualServiceDays: 52, sequence: 1, ...metadata(time) },
];
const route = { id: 'route', scenarioId: scenario.id, name: 'Route', ...metadata(time) };

function pattern(id: string, directionId: string, pointCount = 2): RoutePattern {
  return { id, scenarioId: scenario.id, routeId: route.id, name: id, directionId, points: Array.from({ length: pointCount }, (_, index) => ({ id: `${id}-${'abcd'[index]}`, nodeId: `${id}-${'abcd'[index]}`, sequence: index, cumulativeMiles: index })), ...metadata(time) };
}
function profile(id: string, patternId: string, revision = 4): RuntimeProfile {
  return { id, scenarioId: scenario.id, routeId: route.id, patternId, name: 'All day', calculationRevision: revision, bands: [{ id: `${id}-band`, label: 'All day', sequence: 0, startTime: 0, endTime: 100000, segmentRuntimeSeconds: [600] }], ...metadata(time) };
}
function trip(id: string, serviceDayId: string, source: RoutePattern, firstTime = 1000): Trip {
  return {
    id, scenarioId: scenario.id, routeId: route.id, serviceDayId, patternId: source.id, tripProfileId: 'trip-profile',
    stopTimes: source.points.map((point, index) => ({ patternPointId: point.id, sequence: index, time: firstTime + 600 * index })),
    provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [], runtimeProfileId: `${source.id}-profile`, runtimeCalculationRevision: 4, calculationSource: { runtimeProfileId: `${source.id}-profile`, runtimeCalculationRevision: 4 } },
    ...metadata(time),
  } as Trip;
}
function snapshot(): ProjectSnapshot {
  const outbound = pattern('outbound', 'outbound'); const inbound = pattern('inbound', 'inbound'); const outbound2 = pattern('outbound2', 'outbound');
  const assignment = (id: string, patternId: string, serviceDayId: string, runtimeProfileId: string) => ({ id, scenarioId: scenario.id, patternId, serviceDayId, runtimeProfileId, ...metadata(time) });
  return {
    project, scenarios: [scenario], serviceDays: days, routes: [route], nodes: [], patterns: [outbound, inbound, outbound2],
    runtimeProfiles: [profile('outbound-profile', 'outbound'), profile('inbound-profile', 'inbound'), profile('outbound2-profile', 'outbound2', 7)],
    runtimeAssignments: [assignment('wd-out', 'outbound', 'weekday', 'outbound-profile'), assignment('wd-in', 'inbound', 'weekday', 'inbound-profile'), assignment('wd-out2', 'outbound2', 'weekday', 'outbound2-profile')],
    tripProfiles: [{ id: 'trip-profile', scenarioId: scenario.id, name: 'Default', ...metadata(time) }], generationSets: [],
    trips: [trip('out-1', 'weekday', outbound), trip('in-1', 'weekday', inbound, 1200)],
    blocks: [],
  };
}
async function setup() {
  const repository = new InMemoryRouteDefinitionRepository();
  await repository.saveProjectSnapshot(snapshot());
  const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (value) => repository.saveProjectSnapshot(value));
  return {
    repository,
    tripService: new TripGenerationService(repository, () => '2026-09-15T00:00:00.000Z'),
    routeService: new RouteDefinitionService(repository, backup, () => '2026-09-15T00:00:00.000Z'),
  };
}
const block = (tripId: string): Block => ({ id: 'b1', scenarioId: scenario.id, serviceDayId: 'weekday', tripProfileId: 'trip-profile', label: 'B1', activities: [{ id: 'b1-a', type: 'revenueTrip', sequence: 0, tripId }], ...metadata(time) });
const csvContext = { scenarioId: scenario.id, routeId: route.id, serviceDayId: 'weekday', directionId: 'outbound', tripProfileId: 'trip-profile' };

describe('A1-01 Scenario-wide writes from a caller-supplied snapshot', () => {
  it.fails('EXPECTED: updateServiceDay with a Scenario snapshot read before a Trip was added keeps that Trip', async () => {
    const { repository, tripService, routeService } = await setup();
    const stale = (await routeService.loadWorkspace(project.id, scenario.id)).records!;
    const added = await tripService.addTrip({ scenarioId: scenario.id, routeId: route.id, serviceDayId: 'weekday', patternId: 'outbound', directionId: 'outbound', tripProfileId: 'trip-profile', firstTrip: 5000 });
    await routeService.updateServiceDay(stale, 'weekday', { name: 'Weekday renamed' });
    expect(await repository.getTrip(added.trip.id)).toBeDefined();
  });
  it.fails('EXPECTED: renameScenario with an older snapshot keeps a Runtime profile created after the snapshot', async () => {
    const { repository, routeService } = await setup();
    const stale = (await routeService.loadWorkspace(project.id, scenario.id)).records!;
    const created = await routeService.createDefaultRuntimeProfile((await repository.getPattern('outbound'))!, 'Created later');
    await routeService.renameScenario(stale, 'Renamed');
    expect(await repository.getRuntimeProfile(created.id)).toBeDefined();
  });
});

describe('A1-02 changeTripPattern commits the preview payload', () => {
  it.fails('EXPECTED: a Trip shifted after the Pattern-change review keeps its shift or the commit is rejected', async () => {
    const { repository, tripService } = await setup();
    const preview = await tripService.previewTripPatternChange('out-1', 'outbound2', 'outbound');
    await tripService.applyTripShift(['out-1'], 600);
    let rejected = false;
    try { await tripService.changeTripPattern(preview); } catch { rejected = true; }
    expect(rejected || (await repository.getTrip('out-1'))!.stopTimes[0].time === 1600).toBe(true);
  });
  it.fails('EXPECTED: the committed Trip is not stamped with a revision whose profile would produce different times', async () => {
    const { repository, tripService } = await setup();
    const preview = await tripService.previewTripPatternChange('out-1', 'outbound2', 'outbound');
    const target = repository.runtimeProfiles.get('outbound2-profile')!;
    repository.runtimeProfiles.set(target.id, { ...target, calculationRevision: 8, bands: [{ ...target.bands[0], segmentRuntimeSeconds: [900] }] });
    let rejected = false;
    try { await tripService.changeTripPattern(preview); } catch { rejected = true; }
    const stale = (await tripService.listStaleTrips('weekday')).map((item) => item.id);
    expect(rejected || stale.includes('out-1')).toBe(true);
  });
});

describe('A1-03 and A1-04 Trips CSV import', () => {
  it.fails('A1-03 EXPECTED: a row whose tripId belongs to the other Direction is rejected', async () => {
    const { repository, tripService } = await setup();
    await repository.saveBlocks([block('in-1')]);
    const preview = await tripService.previewTripTableImport(csvContext, [{ tripId: 'in-1', patternId: 'outbound', stopTimes: [{ patternPointId: 'outbound-a', time: 2000 }, { patternPointId: 'outbound-b', time: 2600 }] }]);
    expect(preview.findings.some((finding) => finding.severity === 'error')).toBe(true);
  });
  it.fails('A1-04 EXPECTED: an import reviewed against an older Pattern is rejected after the Pattern gains a point', async () => {
    const { repository, tripService } = await setup();
    const preview = await tripService.previewTripTableImport(csvContext, [{ patternId: 'outbound', stopTimes: [{ patternPointId: 'outbound-a', time: 3000 }, { patternPointId: 'outbound-b', time: 3600 }] }]);
    repository.patterns.set('outbound', pattern('outbound', 'outbound', 3));
    await expect(tripService.applyTripTableImport(preview)).rejects.toThrow();
  });
});

describe('A1-05 updateServiceDay validation (A-005, application layer)', () => {
  it.fails('EXPECTED: an annual-day total above 365, a negative, and a non-integer count are rejected', async () => {
    const { routeService } = await setup();
    const records = (await routeService.loadWorkspace(project.id, scenario.id)).records!;
    for (const annualServiceDays of [400, -5, 1.5]) {
      await expect(routeService.updateServiceDay(records, 'weekday', { annualServiceDays })).rejects.toThrow();
    }
  });
});

describe('A1-06 .. A1-08 destructive commands that recompute their impact at commit', () => {
  it.fails('A1-06 EXPECTED: deleteTrips does not remove Block activities that the review it follows did not show', async () => {
    const { repository, tripService } = await setup();
    const review = await tripService.previewTripDeletion(['out-1']);
    await repository.saveBlocks([block('out-1')]);
    expect(review.affectedBlockIds).toEqual([]);
    let committed: string[] = [];
    try { committed = (await tripService.deleteTrips(['out-1'])).affectedBlockIds; } catch { committed = review.affectedBlockIds; }
    expect(committed).toEqual(review.affectedBlockIds);
  });
  it.fails('A1-07 EXPECTED: deleteTripProfile with a valid review token does not delete a Blocking Scenario created after the review', async () => {
    const { repository, tripService } = await setup();
    await tripService.ensureDefaultTripProfile(scenario.id);
    repository.tripProfiles.set('tp2', { id: 'tp2', scenarioId: scenario.id, name: 'Two', ...metadata(time) });
    const review = await tripService.previewTripProfileDeletion('tp2');
    repository.blockingScenarios.set('bs', { id: 'bs', scenarioId: scenario.id, tripProfileId: 'tp2', name: 'Created after review', ...metadata(time) } as never);
    try { await tripService.deleteTripProfile('tp2', review.previewToken); } catch { /* rejection is the expected outcome */ }
    expect(repository.blockingScenarios.has('bs')).toBe(true);
  });
  it.fails('A1-08 EXPECTED: renameScenario rejects a blank name as createScenario and duplicateScenario do', async () => {
    const { routeService } = await setup();
    const records = (await routeService.loadWorkspace(project.id, scenario.id)).records!;
    await expect(routeService.renameScenario(records, '   ')).rejects.toThrow();
  });
});

describe('A1-09 legacy per-field route mutators bypass preview/commit and Pattern validation', () => {
  it.fails('EXPECTED: updatePattern rejects a Pattern reduced to one point (DS-09 requires at least two)', async () => {
    const { routeService } = await setup();
    const aggregate = (await routeService.loadWorkspace(project.id, scenario.id, route.id)).aggregate!;
    const target = aggregate.patterns.find((item) => item.id === 'outbound')!;
    await expect(routeService.updatePattern(aggregate, 'outbound', { points: [target.points[0]] })).rejects.toThrow();
  });
});
