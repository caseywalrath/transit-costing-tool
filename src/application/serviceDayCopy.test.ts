import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { Block, ProjectSnapshot, RoutePattern, RuntimeProfile, Trip } from '../domain/types';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { TripGenerationService, ServiceDayCopyStalePreviewError, ServiceDayCopyValidationError } from './tripGenerationService';

const time = '2026-09-14T00:00:00.000Z';
const project = { id: 'project', name: 'Project', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata(time) };
const scenario = { id: 'scenario', projectId: project.id, name: 'Scenario', ...metadata(time) };
const days = [
  { id: 'weekday', scenarioId: scenario.id, kind: 'weekday' as const, name: 'Weekday', annualServiceDays: 260, sequence: 0, ...metadata(time) },
  { id: 'saturday', scenarioId: scenario.id, kind: 'saturday' as const, name: 'Saturday', annualServiceDays: 52, sequence: 1, ...metadata(time) },
  { id: 'holiday', scenarioId: scenario.id, kind: 'holiday' as const, name: 'Holiday', annualServiceDays: 0, sequence: 3, ...metadata(time) },
];
const route = { id: 'route', scenarioId: scenario.id, name: 'Route', ...metadata(time) };
const otherRoute = { id: 'other-route', scenarioId: scenario.id, name: 'Other', ...metadata(time) };

function pattern(id: string, directionId: string, routeId = route.id): RoutePattern {
  return { id, scenarioId: scenario.id, routeId, name: id, directionId, points: [{ id: `${id}-a`, nodeId: `${id}-a`, sequence: 0, cumulativeMiles: 0 }, { id: `${id}-b`, nodeId: `${id}-b`, sequence: 1, cumulativeMiles: 1 }], ...metadata(time) };
}

function profile(id: string, patternId: string, routeId = route.id): RuntimeProfile {
  return { id, scenarioId: scenario.id, routeId, patternId, name: 'All day', calculationRevision: 4, bands: [{ id: `${id}-band`, label: 'All day', sequence: 0, startTime: 0, endTime: 100000, segmentRuntimeSeconds: [600] }], ...metadata(time) };
}

function trip(id: string, serviceDayId: string, patternId: string, tripProfileId = 'trip-profile', routeId = route.id, timeValue = 1000): Trip {
  return { id, scenarioId: scenario.id, routeId, serviceDayId, patternId, tripProfileId, stopTimes: [{ patternPointId: `${patternId}-a`, sequence: 0, time: timeValue }, { patternPointId: `${patternId}-b`, sequence: 1, time: timeValue + 600 }], provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [], calculationSource: { runtimeProfileId: `${patternId}-profile`, runtimeCalculationRevision: 4 }, runtimeProfileId: `${patternId}-profile`, runtimeCalculationRevision: 4 }, ...metadata(time) };
}

function block(id: string, serviceDayId: string, tripId: string): Block {
  return { id, scenarioId: scenario.id, serviceDayId, tripProfileId: 'trip-profile', label: id, activities: [{ id: `${id}-activity`, type: 'revenueTrip', sequence: 0, tripId }], ...metadata(time) };
}

function sourceSnapshot(): ProjectSnapshot {
  const outbound = pattern('outbound', 'outbound');
  const inbound = pattern('inbound', 'inbound');
  const other = pattern('other', 'outbound', otherRoute.id);
  const profiles = [profile('outbound-profile', outbound.id), profile('inbound-profile', inbound.id), profile('other-profile', other.id, otherRoute.id)];
  return {
    project,
    scenarios: [scenario],
    serviceDays: days,
    routes: [route, otherRoute],
    nodes: [],
    patterns: [outbound, inbound, other],
    runtimeProfiles: profiles,
    runtimeAssignments: [
      { id: 'weekday-outbound', scenarioId: scenario.id, patternId: outbound.id, serviceDayId: 'weekday', runtimeProfileId: 'outbound-profile', ...metadata(time) },
      { id: 'weekday-inbound', scenarioId: scenario.id, patternId: inbound.id, serviceDayId: 'weekday', runtimeProfileId: 'inbound-profile', ...metadata(time) },
      { id: 'saturday-outbound', scenarioId: scenario.id, patternId: outbound.id, serviceDayId: 'saturday', runtimeProfileId: 'outbound-profile', ...metadata(time) },
    ],
    tripProfiles: [{ id: 'trip-profile', scenarioId: scenario.id, name: 'Default', ...metadata(time) }],
    generationSets: [],
    trips: [trip('source-outbound', 'weekday', outbound.id), trip('source-inbound', 'weekday', inbound.id), trip('target-outbound', 'saturday', outbound.id)],
    blocks: [block('target-block', 'saturday', 'target-outbound')],
  };
}

async function setup() {
  const repository = new InMemoryRouteDefinitionRepository();
  await repository.saveProjectSnapshot(sourceSnapshot());
  return { repository, service: new TripGenerationService(repository, () => '2026-09-15T00:00:00.000Z') };
}

describe('Package 3A service-day copy commands', () => {
  it('copies independent Runtime profiles, preserves Trips, and creates deterministic target assignments', async () => {
    const { repository, service } = await setup();
    const request = { scenarioId: scenario.id, routeId: route.id, sourceServiceDayId: 'weekday', targetServiceDayId: 'saturday', mode: 'independent' as const };
    const preview = await service.previewRuntimeCopy(request);
    expect(preview.impact.profilesCreated).toBe(2);
    expect(preview.impact.targetAssignmentsReplaced).toBe(1);
    await service.applyRuntimeCopy(preview);
    const assignments = await repository.listRuntimeAssignments(scenario.id, 'saturday');
    expect(assignments.map((item) => item.patternId).sort()).toEqual(['inbound', 'outbound']);
    expect(assignments.every((item) => item.runtimeProfileId !== 'outbound-profile' && item.runtimeProfileId !== 'inbound-profile')).toBe(true);
    expect((await repository.getTrip('target-outbound'))?.stopTimes[0].time).toBe(1000);
    expect((await repository.listRuntimeProfiles(route.id)).filter((item) => item.name.includes('Saturday'))).toHaveLength(2);
  });

  it('shares Runtime profiles only when requested', async () => {
    const { repository, service } = await setup();
    const preview = await service.previewRuntimeCopy({ scenarioId: scenario.id, routeId: route.id, sourceServiceDayId: 'weekday', targetServiceDayId: 'saturday', mode: 'shared' });
    expect(preview.profiles).toEqual([]);
    await service.applyRuntimeCopy(preview);
    expect((await repository.listRuntimeAssignments(scenario.id, 'saturday')).map((item) => item.runtimeProfileId).sort()).toEqual(['inbound-profile', 'outbound-profile']);
  });

  it('rejects an unresolved source Pattern without partial Runtime writes', async () => {
    const { repository, service } = await setup();
    const before = await repository.getScenarioRecords(scenario.id);
    const preview = await service.previewRuntimeCopy({ scenarioId: scenario.id, routeId: route.id, sourceServiceDayId: 'saturday', targetServiceDayId: 'weekday', mode: 'independent' });
    expect(preview.impact.unresolvedPatternIds).toContain('inbound');
    await expect(service.applyRuntimeCopy(preview)).rejects.toBeInstanceOf(ServiceDayCopyValidationError);
    expect(await repository.getScenarioRecords(scenario.id)).toEqual(before);
  });

  it('copies both Directions, replaces only target scope, and cleans target Block activities', async () => {
    const { repository, service } = await setup();
    const preview = await service.previewTripCopy({ scenarioId: scenario.id, routeId: route.id, tripProfileId: 'trip-profile', sourceServiceDayId: 'weekday', targetServiceDayId: 'saturday', allowEmptySource: false });
    expect(preview.impact.sourceTripCount).toBe(2);
    expect(preview.impact.targetTripCount).toBe(1);
    expect(preview.impact.affectedBlockIds).toEqual(['target-block']);
    await service.applyTripCopy(preview);
    const targetTrips = (await repository.listTrips('saturday', 'trip-profile')).filter((item) => item.routeId === route.id);
    expect(targetTrips).toHaveLength(2);
    expect(targetTrips.map((item) => item.id)).not.toContain('source-outbound');
    expect(targetTrips.map((item) => item.id)).not.toContain('target-outbound');
    expect((await repository.getTrip('source-outbound'))?.serviceDayId).toBe('weekday');
    expect((await repository.blocks.get('target-block'))?.activities).toEqual([]);
  });

  it('requires explicit empty-source clearing and supports reviewed clearing', async () => {
    const { repository, service } = await setup();
    const request = { scenarioId: scenario.id, routeId: route.id, tripProfileId: 'trip-profile', sourceServiceDayId: 'holiday', targetServiceDayId: 'weekday' };
    const rejected = await service.previewTripCopy({ ...request, allowEmptySource: false });
    await expect(service.applyTripCopy(rejected)).rejects.toBeInstanceOf(ServiceDayCopyValidationError);
    const clear = await service.previewTripCopy({ ...request, allowEmptySource: true });
    expect(clear.impact.requiresExplicitEmptySourceReview).toBe(true);
    await service.applyTripCopy(clear);
    expect((await repository.listTrips('weekday', 'trip-profile')).filter((item) => item.routeId === route.id)).toEqual([]);
  });

  it('rejects stale previews and applies batch Pattern changes all-or-nothing', async () => {
    const { repository, service } = await setup();
    const first = await service.previewTripCopy({ scenarioId: scenario.id, routeId: route.id, tripProfileId: 'trip-profile', sourceServiceDayId: 'weekday', targetServiceDayId: 'saturday', allowEmptySource: false });
    await repository.saveTrips([{ ...(await repository.getTrip('target-outbound'))!, updatedAt: '2026-09-15T00:01:00.000Z' }]);
    await expect(service.applyTripCopy(first)).rejects.toBeInstanceOf(ServiceDayCopyStalePreviewError);

    const batch = await service.previewBatchPatternChange({ tripIds: ['source-outbound', 'source-inbound'], targetPatternId: 'outbound' });
    expect(batch.eligibleTripIds).toEqual(['source-outbound']);
    expect(batch.ineligibleTripIds).toEqual(['source-inbound']);
    await expect(service.applyBatchPatternChange(batch)).rejects.toBeInstanceOf(ServiceDayCopyValidationError);
    expect((await repository.getTrip('source-inbound'))?.patternId).toBe('inbound');
  });

  it('handles the Package 3A capacity targets for 20 Patterns and 500 source Trips', async () => {
    const base = sourceSnapshot();
    const extraPatterns = Array.from({ length: 18 }, (_, index) => pattern(`capacity-${index}`, index % 2 ? 'inbound' : 'outbound'));
    const extraProfiles = extraPatterns.map((item) => profile(`${item.id}-profile`, item.id));
    const extraAssignments = extraPatterns.map((item) => ({ id: `${item.id}-weekday`, scenarioId: scenario.id, patternId: item.id, serviceDayId: 'weekday', runtimeProfileId: `${item.id}-profile`, ...metadata(time) }));
    const capacityTrips = Array.from({ length: 500 }, (_, index) => trip(`capacity-trip-${index}`, 'weekday', index % 20 === 0 ? 'outbound' : index % 20 === 1 ? 'inbound' : extraPatterns[(index - 2) % extraPatterns.length].id));
    const repository = new InMemoryRouteDefinitionRepository();
    await repository.saveProjectSnapshot({ ...base, patterns: [...base.patterns, ...extraPatterns], runtimeProfiles: [...base.runtimeProfiles, ...extraProfiles], runtimeAssignments: [...base.runtimeAssignments, ...extraAssignments], trips: capacityTrips, blocks: [] });
    const service = new TripGenerationService(repository, () => '2026-09-15T00:00:00.000Z');
    const runtime = await service.previewRuntimeCopy({ scenarioId: scenario.id, routeId: route.id, sourceServiceDayId: 'weekday', targetServiceDayId: 'saturday', mode: 'independent' });
    expect(runtime.impact.profilesCreated).toBe(20);
    await service.applyRuntimeCopy(runtime);
    const trips = await service.previewTripCopy({ scenarioId: scenario.id, routeId: route.id, tripProfileId: 'trip-profile', sourceServiceDayId: 'weekday', targetServiceDayId: 'saturday', allowEmptySource: false });
    expect(trips.impact.sourceTripCount).toBe(500);
    expect(trips.copiedTrips).toHaveLength(500);
  });
});
