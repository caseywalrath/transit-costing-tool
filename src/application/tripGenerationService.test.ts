import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { Block, RoutePattern, RuntimeAssignment, RuntimeProfile, Trip, TripGenerationSet } from '../domain/types';
import { TripGenerationService } from './tripGenerationService';
import type { TripGenerationRepository } from './ports';

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
  it('previews and applies generation through behavior-only repository ports', async () => {
    const repository = new FakeTripRepository(pattern, profile); const service = new TripGenerationService(repository, () => '2026-09-11T00:00:00.000Z');
    const preview = await service.previewTripGeneration(set, profile.id);
    expect(preview.added).toEqual([0, 1]);
    const result = await service.applyTripGeneration(preview);
    expect(result.trips).toHaveLength(2);
    expect((await service.listServiceDayTrips('weekday')).map((trip) => trip.stopTimes[0].time)).toEqual([0, 300]);
    expect(repository.sets.get(set.id)).toEqual(set);
    expect(repository.atomicWrites).toHaveLength(1);
  });

  it('lists generation sets and resolves the assigned runtime profile for the Trips workflow', async () => {
    const repository = new FakeTripRepository(pattern, profile);
    repository.sets.set(set.id, set);
    repository.assignments.push({ id: 'assignment', scenarioId: 's', patternId: pattern.id, serviceDayId: 'weekday', runtimeProfileId: profile.id, ...metadata() });
    const service = new TripGenerationService(repository);
    expect(await service.listGenerationSets('weekday', 'r', 'p')).toEqual([set]);
    expect(await service.resolveRuntimeProfile('s', 'weekday', 'p')).toEqual({ assignment: repository.assignments[0], profile });
  });

  it('uses the supplied revision and preserves surviving trip IDs during regeneration', async () => {
    const repository = new FakeTripRepository(pattern, profile);
    const service = new TripGenerationService(repository, () => '2026-09-11T00:00:00.000Z');
    const initial = await service.applyTripGeneration(await service.previewTripGeneration(set, profile.id));
    const revisedSet = { ...set, generationRevision: 2, limit: { mode: 'tripCount' as const, tripCount: 1 } };
    const revised = await service.applyTripGeneration(await service.previewTripGeneration(revisedSet, profile.id));
    expect(revised.trips).toHaveLength(1);
    expect(revised.trips[0].id).toBe(initial.trips[0].id);
    expect(revised.trips[0].provenance.generationRevision).toBe(2);
    expect(repository.sets.get(set.id)?.generationRevision).toBe(2);
    expect((await service.listServiceDayTrips('weekday')).map((trip) => trip.id)).toEqual([initial.trips[0].id]);
  });
});
