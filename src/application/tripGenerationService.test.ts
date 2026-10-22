import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { Block, RoutePattern, RuntimeAssignment, RuntimeProfile, Trip, TripGenerationSet } from '../domain/types';
import { TripGenerationService } from './tripGenerationService';
import type { TripGenerationRepository } from './ports';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { rebalanceRuntimeProfile, rebalanceTripForPattern } from '../domain/safeRouteEditing';

class FakeTripRepository implements TripGenerationRepository {
  sets = new Map<string, TripGenerationSet>(); trips = new Map<string, Trip>(); blocks = new Map<string, Block>();
  assignments: RuntimeAssignment[] = [];
  atomicWrites: Array<{ set: TripGenerationSet; trips: Trip[]; blocks: Block[] }> = [];
  constructor(readonly pattern: RoutePattern, readonly profile: RuntimeProfile) {}
  async getGenerationSet(id: string) { return this.sets.get(id); }
  async listGenerationSets(serviceDayId: string, routeId?: string, patternId?: string) { return [...this.sets.values()].filter((candidate) => candidate.serviceDayId === serviceDayId && (!routeId || candidate.routeId === routeId) && (!patternId || candidate.patternId === patternId)); }
  async saveGenerationSet(set: TripGenerationSet) { this.sets.set(set.id, set); }
  async listTrips(serviceDayId: string, generationSetId?: string) { return [...this.trips.values()].filter((trip) => trip.serviceDayId === serviceDayId && (!generationSetId || trip.provenance.generationSetId === generationSetId)); }
  async getTrip(id: string) { return this.trips.get(id); }
  async saveTrips(trips: Trip[]) { for (const trip of trips) this.trips.set(trip.id, trip); }
  async listBlocks(serviceDayId: string) { return [...this.blocks.values()].filter((block) => block.serviceDayId === serviceDayId); }
  async saveBlocks(blocks: Block[]) { for (const block of blocks) this.blocks.set(block.id, block); }
  async replaceGenerationSet(set: TripGenerationSet, trips: Trip[], blocks: Block[]) {
    this.atomicWrites.push({ set, trips, blocks });
    for (const [id, trip] of this.trips) if (trip.provenance.generationSetId === set.id && !trips.some((candidate) => candidate.id === id)) this.trips.delete(id);
    await this.saveGenerationSet(set); await this.saveTrips(trips); await this.saveBlocks(blocks);
  }
  async listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string) { return this.assignments.filter((assignment) => assignment.scenarioId === scenarioId && (!serviceDayId || assignment.serviceDayId === serviceDayId) && (!patternId || assignment.patternId === patternId)); }
  async getPattern(id: string) { return id === this.pattern.id ? this.pattern : undefined; }
  async getRuntimeProfile(id: string) { return id === this.profile.id ? this.profile : undefined; }
}

const pattern: RoutePattern = { ...metadata(), id: 'p', scenarioId: 's', routeId: 'r', name: 'Outbound', points: [{ id: 'a', nodeId: 'a', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'b', sequence: 1, cumulativeMiles: 1 }] };
const profile: RuntimeProfile = { ...metadata(), id: 'profile', scenarioId: 's', routeId: 'r', patternId: 'p', name: 'Runtime', bands: [{ id: 'band', label: 'All', sequence: 0, startTime: 0, endTime: 10000, segmentRuntimeSeconds: [60] }] };
const set: TripGenerationSet = { ...metadata(), id: 'set', scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', patternId: 'p', name: 'Set', firstDeparture: 0, headwaySeconds: 300, limit: { mode: 'tripCount', tripCount: 2 }, generationRevision: 1 };

describe('TripGenerationService', () => {
  it('lists generation sets and resolves the assigned runtime profile for the Trips workflow', async () => {
    const repository = new FakeTripRepository(pattern, profile);
    repository.sets.set(set.id, set);
    repository.assignments.push({ id: 'assignment', scenarioId: 's', patternId: pattern.id, serviceDayId: 'weekday', runtimeProfileId: profile.id, ...metadata() });
    const service = new TripGenerationService(repository);
    expect(await service.listGenerationSets('weekday', 'r', 'p')).toEqual([set]);
    expect(await service.resolveRuntimeProfile('s', 'weekday', 'p')).toEqual({ assignment: repository.assignments[0], profile });
  });
});

describe('Trip generation validates the Trip profile inside the write', () => {
  const stamp = metadata('2026-09-14T00:00:00.000Z');
  const storedPattern: RoutePattern = { ...stamp, id: 'p', scenarioId: 's', routeId: 'r', name: 'Outbound', directionId: 'outbound', points: [{ id: 'a', nodeId: 'a', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'b', sequence: 1, cumulativeMiles: 1 }] };
  const storedProfile: RuntimeProfile = { ...stamp, id: 'profile', scenarioId: 's', routeId: 'r', patternId: 'p', name: 'Runtime', bands: [{ id: 'band', label: 'All', sequence: 0, startTime: 0, endTime: 86400, segmentRuntimeSeconds: [600] }] };
  async function setup() {
    const repository = new InMemoryRouteDefinitionRepository();
    await repository.saveProjectSnapshot({
      project: { id: 'project', name: 'Project', distanceUnit: 'miles', currencyCode: 'USD', ...stamp },
      scenarios: [{ id: 's', projectId: 'project', name: 'Scenario', ...stamp }],
      serviceDays: [{ id: 'weekday', scenarioId: 's', kind: 'weekday', name: 'Weekday', annualServiceDays: 260, sequence: 0, ...stamp }],
      routes: [{ id: 'r', scenarioId: 's', name: 'Route', ...stamp }], nodes: [], patterns: [storedPattern], runtimeProfiles: [storedProfile],
      runtimeAssignments: [{ id: 'assignment', scenarioId: 's', patternId: 'p', serviceDayId: 'weekday', runtimeProfileId: 'profile', ...stamp }],
      tripProfiles: [{ id: 'trip-profile', scenarioId: 's', name: 'Default', ...stamp }], generationSets: [], trips: [], blocks: [],
    });
    return { repository, service: new TripGenerationService(repository, () => '2026-09-15T00:00:00.000Z') };
  }
  const request = { scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', patternId: 'p', firstTrip: 3 * 3600, headwaySeconds: 600, tripCount: 3 };

  it('rejects Build Trips for a Trip profile that no longer exists and stores no Trip', async () => {
    const { repository, service } = await setup();
    await expect(service.generateTrips({ ...request, tripProfileId: 'deleted-profile' })).rejects.toThrow('Trip profile is no longer available');
    expect(await repository.listTrips('weekday')).toEqual([]);
  });

  it('rejects Add Trip for a Trip profile that no longer exists', async () => {
    const { repository, service } = await setup();
    await expect(service.addTrip({ scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', patternId: 'p', directionId: 'outbound', firstTrip: 3 * 3600, tripProfileId: 'deleted-profile' })).rejects.toThrow('Trip profile is no longer available');
    expect(await repository.listTrips('weekday')).toEqual([]);
  });

  it('still stores Trips for an existing Trip profile', async () => {
    const { repository, service } = await setup();
    await service.generateTrips({ ...request, tripProfileId: 'trip-profile' });
    expect(await repository.listTrips('weekday')).toHaveLength(3);
  });
});

describe('stale-source checks on Pattern changes and Trips CSV imports, and the stale Trip query', () => {
  const day = '2026-09-14T00:00:00.000Z';
  const stamp = metadata(day);
  const pattern = (id: string, directionId: string, pointCount = 2): RoutePattern => ({ id, scenarioId: 's', routeId: 'r', name: id, directionId, points: Array.from({ length: pointCount }, (_, index) => ({ id: `${id}-${'abcd'[index]}`, nodeId: `${id}-${'abcd'[index]}`, sequence: index, cumulativeMiles: index })), ...stamp });
  const profile = (id: string, patternId: string, revision = 4, extra: Partial<RuntimeProfile> = {}): RuntimeProfile => ({ id, scenarioId: 's', routeId: 'r', patternId, name: 'All day', calculationRevision: revision, bands: [{ id: `${id}-band`, label: 'All day', sequence: 0, startTime: 0, endTime: 86400, segmentRuntimeSeconds: [600] }], ...stamp, ...extra });
  const trip = (id: string, source: RoutePattern, firstTime = 1000, extra: Partial<Trip> = {}): Trip => ({
    id, scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', patternId: source.id, tripProfileId: 'trip-profile',
    stopTimes: source.points.map((point, index) => ({ patternPointId: point.id, sequence: index, time: firstTime + 600 * index })),
    provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [], runtimeProfileId: `${source.id}-profile`, runtimeCalculationRevision: 4, calculationSource: { runtimeProfileId: `${source.id}-profile`, runtimeCalculationRevision: 4 } },
    ...stamp, ...extra,
  });
  const legacyTrip = (id: string, source: RoutePattern, firstTime: number, lastTime?: number): Trip => ({ ...trip(id, source, firstTime), provenance: { kind: 'manual', manuallyChangedFields: [] }, ...(lastTime === undefined ? {} : { stopTimes: [{ patternPointId: source.points[0].id, sequence: 0, time: firstTime }, { patternPointId: source.points[1].id, sequence: 1, time: lastTime }] }) });
  const outbound = pattern('outbound', 'outbound'); const inbound = pattern('inbound', 'inbound'); const outbound2 = pattern('outbound2', 'outbound');
  async function setup(extra: { trips?: Trip[]; profiles?: RuntimeProfile[] } = {}) {
    const repository = new InMemoryRouteDefinitionRepository();
    const assignment = (id: string, patternId: string) => ({ id, scenarioId: 's', patternId, serviceDayId: 'weekday', runtimeProfileId: `${patternId}-profile`, ...stamp });
    await repository.saveProjectSnapshot({
      project: { id: 'project', name: 'Project', distanceUnit: 'miles', currencyCode: 'USD', ...stamp },
      scenarios: [{ id: 's', projectId: 'project', name: 'Scenario', ...stamp }],
      serviceDays: [{ id: 'weekday', scenarioId: 's', kind: 'weekday', name: 'Weekday', annualServiceDays: 260, sequence: 0, ...stamp }],
      routes: [{ id: 'r', scenarioId: 's', name: 'Route', ...stamp }], nodes: [], patterns: [outbound, inbound, outbound2],
      runtimeProfiles: extra.profiles ?? [profile('outbound-profile', 'outbound'), profile('inbound-profile', 'inbound'), profile('outbound2-profile', 'outbound2', 7)],
      runtimeAssignments: [assignment('wd-out', 'outbound'), assignment('wd-in', 'inbound'), assignment('wd-out2', 'outbound2')],
      tripProfiles: [{ id: 'trip-profile', scenarioId: 's', name: 'Default', ...stamp }], generationSets: [],
      trips: extra.trips ?? [trip('out-1', outbound), trip('in-1', inbound, 1200)], blocks: [],
    });
    return { repository, service: new TripGenerationService(repository, () => '2026-09-15T00:00:00.000Z') };
  }

  describe('changing the Pattern of one Trip (I-021, 4-003)', () => {
    it('applies a review that nothing has changed since', async () => {
      const { repository, service } = await setup();
      const changed = await service.changeTripPattern(await service.previewTripPatternChange('out-1', 'outbound2', 'outbound'));
      expect(changed.patternId).toBe('outbound2');
      expect((await repository.getTrip('out-1'))?.patternId).toBe('outbound2');
      expect(changed.provenance.calculationSource).toEqual({ runtimeProfileId: 'outbound2-profile', runtimeCalculationRevision: 7 });
    });

    it('rejects a review after the Trip was shifted, and keeps the shift', async () => {
      const { repository, service } = await setup();
      const review = await service.previewTripPatternChange('out-1', 'outbound2', 'outbound');
      const stored = (await repository.getTrip('out-1'))!;
      await repository.saveTrips([{ ...stored, stopTimes: stored.stopTimes.map((point) => ({ ...point, time: point.time + 600 })), updatedAt: '2026-09-15T00:00:00.000Z' }]);
      await expect(service.changeTripPattern(review)).rejects.toThrow('The Pattern change review is out of date');
      const after = (await repository.getTrip('out-1'))!;
      expect(after.patternId).toBe('outbound');
      expect(after.stopTimes[0].time).toBe(1600);
    });

    it('rejects a review after the target profile changed, so the Trip is never stamped with a revision that gives other times', async () => {
      const { repository, service } = await setup();
      const review = await service.previewTripPatternChange('out-1', 'outbound2', 'outbound');
      const target = (await repository.getRuntimeProfile('outbound2-profile'))!;
      await repository.saveRuntimeProfile({ ...target, calculationRevision: 8, bands: [{ ...target.bands[0], segmentRuntimeSeconds: [900] }] });
      await expect(service.changeTripPattern(review)).rejects.toThrow('The Pattern change review is out of date');
      expect((await repository.getTrip('out-1'))?.patternId).toBe('outbound');
    });

    it('rejects a review after the target Pattern gained a point', async () => {
      const { repository, service } = await setup();
      const review = await service.previewTripPatternChange('out-1', 'outbound2', 'outbound');
      await repository.saveRouteDefinition({ ...(await repository.getRouteDefinition('r'))!, patterns: [outbound, inbound, pattern('outbound2', 'outbound', 3)] });
      await expect(service.changeTripPattern(review)).rejects.toThrow('The Pattern change review is out of date');
    });

    it('refuses a review that carries no source signature', async () => {
      const { repository, service } = await setup();
      const { sourceSignature: _signature, ...unsigned } = await service.previewTripPatternChange('out-1', 'outbound2', 'outbound');
      await expect(service.changeTripPattern(unsigned)).rejects.toThrow('The Pattern change review is out of date');
      expect((await repository.getTrip('out-1'))?.patternId).toBe('outbound');
    });
  });

  describe('Trips CSV import (I-022, 4-004; I-028, 4-019)', () => {
    const context = { scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', directionId: 'outbound', tripProfileId: 'trip-profile' };
    const row = (patternId: string, first: number, tripId?: string) => ({ ...(tripId ? { tripId } : {}), patternId, stopTimes: [{ patternPointId: `${patternId}-a`, time: first }, { patternPointId: `${patternId}-b`, time: first + 600 }] });

    it('rejects a row whose Trip ID belongs to the other Direction, and the Trip keeps its Pattern', async () => {
      const { repository, service } = await setup();
      const preview = await service.previewTripTableImport(context, [row('outbound', 2000, 'in-1')]);
      expect(preview.findings.filter((finding) => finding.severity === 'error').map((finding) => [finding.ruleId, finding.entityId])).toEqual([['trip.csvTripInvalid', 'in-1']]);
      await expect(service.applyTripTableImport(preview)).rejects.toThrow('Fix the CSV issues');
      const stored = (await repository.getTrip('in-1'))!;
      expect(stored.patternId).toBe('inbound');
      expect(stored.stopTimes.map((point) => point.time)).toEqual([1200, 1800]);
    });

    it('still updates a Trip of the displayed Direction and creates a new one', async () => {
      const { repository, service } = await setup();
      const preview = await service.previewTripTableImport(context, [row('outbound', 2000, 'out-1'), row('outbound', 3000)]);
      expect(preview.findings).toEqual([]);
      expect([preview.updatedCount, preview.createdCount]).toEqual([1, 1]);
      await service.applyTripTableImport(preview);
      expect((await repository.getTrip('out-1'))?.stopTimes[0].time).toBe(2000);
      expect(await repository.listTrips('weekday', 'trip-profile')).toHaveLength(3);
    });

    it('rejects an import reviewed before its Pattern gained a point', async () => {
      const { repository, service } = await setup();
      const preview = await service.previewTripTableImport(context, [row('outbound', 3000)]);
      await repository.saveRouteDefinition({ ...(await repository.getRouteDefinition('r'))!, patterns: [pattern('outbound', 'outbound', 3), inbound, outbound2] });
      await expect(service.applyTripTableImport(preview)).rejects.toThrow('The schedule changed while the CSV was being reviewed');
      expect(await repository.listTrips('weekday', 'trip-profile')).toHaveLength(2);
    });

    it('rejects an import reviewed before the Pattern of another Trip in the schedule changed', async () => {
      const { repository, service } = await setup();
      const preview = await service.previewTripTableImport(context, [row('outbound', 3000)]);
      await repository.saveRouteDefinition({ ...(await repository.getRouteDefinition('r'))!, patterns: [outbound, pattern('inbound', 'inbound', 3), outbound2] });
      await expect(service.applyTripTableImport(preview)).rejects.toThrow('The schedule changed while the CSV was being reviewed');
    });

    it('applies an import that nothing has changed since', async () => {
      const { repository, service } = await setup();
      await service.applyTripTableImport(await service.previewTripTableImport(context, [row('outbound', 3000)]));
      expect(await repository.listTrips('weekday', 'trip-profile')).toHaveLength(3);
    });
  });

  describe('listStaleTrips (I-081, 4-024)', () => {
    const segmentStart = (id: string, patternId: string): RuntimeProfile => profile(id, patternId, 4, { calculationMethod: 'segmentStart', bands: [{ id: 'am', label: 'AM', sequence: 0, startTime: 0, endTime: 3600, segmentRuntimeSeconds: [600] }, { id: 'pm', label: 'PM', sequence: 1, startTime: 3600, endTime: 7200, segmentRuntimeSeconds: [1200] }] });
    const profiles = [segmentStart('outbound-profile', 'outbound'), segmentStart('inbound-profile', 'inbound'), segmentStart('outbound2-profile', 'outbound2')];

    it('with a segmentStart profile, a Trip that records no source is stale only when its times differ from the profile', async () => {
      const { service } = await setup({ profiles, trips: [legacyTrip('match-am', outbound, 1000, 1600), legacyTrip('match-pm', outbound, 4000, 5200), legacyTrip('differs', outbound, 1000, 1700)] });
      expect((await service.listStaleTrips('weekday')).map((item) => item.id)).toEqual(['differs']);
    });

    it('reports a Trip that no band can calculate as stale, with the reason as a finding', async () => {
      const { service } = await setup({ profiles, trips: [legacyTrip('after-service', outbound, 90000, 90600), legacyTrip('fine', outbound, 1000, 1600)] });
      const report = await service.inspectStaleTrips('weekday');
      expect(report.trips.map((item) => item.id)).toEqual(['after-service']);
      expect(report.findings.map((finding) => [finding.ruleId, finding.entityType, finding.entityId])).toEqual([['trip.anchorNoRuntime', 'trip', 'after-service']]);
      expect((await service.listStaleTrips('weekday')).map((item) => item.id)).toEqual(['after-service']);
    });

    it('does not hide a programming error as a stale Trip', async () => {
      const { repository, service } = await setup({ profiles, trips: [legacyTrip('legacy', outbound, 1000, 1600)] });
      repository.runtimeProfiles.set('outbound-profile', { ...profiles[0], bands: undefined as never });
      await expect(service.listStaleTrips('weekday')).rejects.toThrow(TypeError);
    });

    it('reports a Trip that a route edit could not carry to the new revision', async () => {
      const abc = pattern('abc', 'outbound', 3); const ac: RoutePattern = { ...abc, points: [abc.points[0], { ...abc.points[2], sequence: 1 }] };
      const crossing: RuntimeProfile = { ...segmentStart('abc-profile', 'abc'), calculationRevision: 3, bands: [{ id: 'am', label: 'AM', sequence: 0, startTime: 0, endTime: 3600, segmentRuntimeSeconds: [600, 600] }, { id: 'pm', label: 'PM', sequence: 1, startTime: 3600, endTime: 7200, segmentRuntimeSeconds: [1200, 1200] }] };
      const rebalancedProfile = rebalanceRuntimeProfile(crossing, abc, ac, '2026-09-15T00:00:00.000Z');
      const before: Trip = { ...trip('crossing', abc, 3000), stopTimes: [3000, 3600, 4800].map((time, sequence) => ({ patternPointId: abc.points[sequence].id, sequence, time })), provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [], runtimeProfileId: 'abc-profile', runtimeCalculationRevision: 3, calculationSource: { runtimeProfileId: 'abc-profile', runtimeCalculationRevision: 3 } } };
      const after = rebalanceTripForPattern(before, abc, ac, new Map([[rebalancedProfile.id, rebalancedProfile]]), '2026-09-15T00:00:00.000Z');
      const repository = new InMemoryRouteDefinitionRepository();
      await repository.saveProjectSnapshot({
        project: { id: 'project', name: 'Project', distanceUnit: 'miles', currencyCode: 'USD', ...stamp }, scenarios: [{ id: 's', projectId: 'project', name: 'Scenario', ...stamp }],
        serviceDays: [{ id: 'weekday', scenarioId: 's', kind: 'weekday', name: 'Weekday', annualServiceDays: 260, sequence: 0, ...stamp }],
        routes: [{ id: 'r', scenarioId: 's', name: 'Route', ...stamp }], nodes: [], patterns: [ac], runtimeProfiles: [rebalancedProfile],
        runtimeAssignments: [{ id: 'a', scenarioId: 's', patternId: 'abc', serviceDayId: 'weekday', runtimeProfileId: 'abc-profile', ...stamp }],
        tripProfiles: [{ id: 'trip-profile', scenarioId: 's', name: 'Default', ...stamp }], generationSets: [], trips: [after], blocks: [],
      });
      expect((await new TripGenerationService(repository).listStaleTrips('weekday')).map((item) => item.id)).toEqual(['crossing']);
    });
  });
});
