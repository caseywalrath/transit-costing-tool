import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { Block, ProjectSnapshot, Trip, TripProfile } from '../domain/types';
import { TripGenerationService } from './tripGenerationService';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { assertTripProfileReferences } from '../domain/trips';

const project = { id: 'project', name: 'Project', distanceUnit: 'miles' as const, currencyCode: 'USD', ...metadata('2026-01-01T00:00:00.000Z') };
const scenario = { id: 'scenario', projectId: project.id, name: 'Scenario 1', ...metadata('2026-01-01T00:00:00.000Z') };
const sourceProfile: TripProfile = { id: 'profile-default', scenarioId: scenario.id, name: 'Default', ...metadata('2026-01-01T00:00:00.000Z') };

function trip(id: string, routeId: string, serviceDayId: string): Trip {
  return {
    id,
    scenarioId: scenario.id,
    routeId,
    serviceDayId,
    patternId: `pattern-${routeId}`,
    tripProfileId: sourceProfile.id,
    stopTimes: [],
    provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] },
    ...metadata('2026-01-01T00:00:00.000Z'),
  };
}

const snapshot: ProjectSnapshot = {
  project,
  scenarios: [scenario],
  serviceDays: [],
  routes: [],
  nodes: [],
  patterns: [],
  runtimeProfiles: [],
  runtimeAssignments: [],
  tripProfiles: [sourceProfile],
  generationSets: [],
  trips: [trip('trip-a', 'route-a', 'weekday'), trip('trip-b', 'route-b', 'saturday')],
  blocks: [],
};

describe('Trip profile lifecycle', () => {
  it('rejects a Block that references a Trip from another profile', () => {
    const otherTrip = { ...trip('other-trip', 'route-a', 'weekday'), tripProfileId: 'other-profile' };
    const block: Block = { id: 'block', scenarioId: scenario.id, serviceDayId: 'weekday', tripProfileId: sourceProfile.id, label: '1', activities: [{ id: 'activity', type: 'revenueTrip', sequence: 0, tripId: otherTrip.id }], ...metadata('2026-01-01T00:00:00.000Z') };
    expect(() => assertTripProfileReferences([otherTrip], [block])).toThrow(/another Trip profile/);
  });

  it('copies all source Trips with independent IDs and no Blocks', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    await repository.saveProjectSnapshot(snapshot);
    const service = new TripGenerationService(repository, () => '2026-02-01T00:00:00.000Z');

    const copied = await service.copyTripProfile(sourceProfile.id, 'Alternative');
    expect(copied.name).toBe('Alternative');
    expect(copied.sourceTripProfileId).toBe(sourceProfile.id);
    const copiedTrips = await repository.listTripsForProfile(copied.id);
    expect(copiedTrips).toHaveLength(2);
    expect(copiedTrips.map((item) => item.id)).not.toEqual(['trip-a', 'trip-b']);
    expect(copiedTrips.every((item) => item.tripProfileId === copied.id)).toBe(true);
    expect(await repository.listBlocksForProfile(copied.id)).toEqual([]);
  });

  it('renames profiles without changing their owned Trips and rejects duplicate names', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    await repository.saveProjectSnapshot(snapshot);
    const service = new TripGenerationService(repository);
    await service.renameTripProfile(sourceProfile.id, 'Weekday plan');
    expect((await repository.listTripsForProfile(sourceProfile.id)).map((item) => item.id)).toEqual(['trip-a', 'trip-b']);
    await expect(service.copyTripProfile(sourceProfile.id, ' weekday PLAN ')).rejects.toThrow(/already exists/);
  });

  it('reports impact, deletes one complete profile branch, and blocks last-profile deletion', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const block: Block = { id: 'block', scenarioId: scenario.id, serviceDayId: 'weekday', tripProfileId: sourceProfile.id, label: '1', activities: [], ...metadata('2026-01-01T00:00:00.000Z') };
    await repository.saveProjectSnapshot({ ...snapshot, blocks: [block] });
    const service = new TripGenerationService(repository);
    const copied = await service.copyTripProfile(sourceProfile.id, 'Alternative');
    const copiedBlock: Block = { ...block, id: 'copied-block', tripProfileId: copied.id };
    await repository.saveBlocks([copiedBlock]);
    const impact = await service.previewTripProfileDeletion(copied.id);
    expect(impact.tripCount).toBe(2);
    expect(impact.blockCount).toBe(1);
    await service.deleteTripProfile(copied.id);
    expect(await repository.getTripProfile(copied.id)).toBeUndefined();
    expect(await repository.listBlocksForProfile(copied.id)).toEqual([]);
    await expect(service.deleteTripProfile(sourceProfile.id)).rejects.toThrow(/only profile/);
    expect(await repository.getTripProfile(sourceProfile.id)).toEqual(sourceProfile);
  });

  it('rejects a stale deletion review without changing the profile branch', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    await repository.saveProjectSnapshot(snapshot);
    const service = new TripGenerationService(repository);
    const copied = await service.copyTripProfile(sourceProfile.id, 'Alternative');
    const preview = await service.previewTripProfileDeletion(copied.id);
    const copiedTrip = (await repository.listTripsForProfile(copied.id))[0];
    await repository.saveTrips([{ ...copiedTrip, updatedAt: '2026-03-01T00:00:00.000Z' }]);
    await expect(service.deleteTripProfile(copied.id, preview.previewToken)).rejects.toThrow(/out of date/);
    expect(await repository.getTripProfile(copied.id)).toEqual(copied);
  });
});
