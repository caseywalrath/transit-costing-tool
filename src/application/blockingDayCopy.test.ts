import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { BlockingBlock, RoutePattern, ServiceDayDefinition, Trip } from '../domain/types';
import { BlockingApplicationService } from './blockingService';
import { InMemoryBlockingRepository } from '../persistence/blockingRepository';

const blockingScenario = { id: 'bs', scenarioId: 'scenario', tripProfileId: 'profile', name: 'Base', ...metadata() };
const pattern: RoutePattern = { id: 'pattern', scenarioId: 'scenario', routeId: 'route', name: 'A-B', points: [{ id: 'a', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'B', sequence: 1, cumulativeMiles: 1 }], ...metadata() };
const days = ['weekday', 'saturday', 'sunday'].map((id): ServiceDayDefinition => ({ id, scenarioId: 'scenario', name: id, annualServiceDays: 100, ...metadata() } as ServiceDayDefinition));
const trip = (id: string, serviceDayId: string, start: number): Trip => ({ id, scenarioId: 'scenario', routeId: 'route', serviceDayId, patternId: pattern.id, tripProfileId: 'profile', stopTimes: [{ patternPointId: 'a', sequence: 0, time: start }, { patternPointId: 'b', sequence: 1, time: start + 100 }], provenance: { kind: 'manual', manuallyChangedFields: [] }, ...metadata() });
const block = (id: string, serviceDayId: string, tripId: string): BlockingBlock => ({ id, scenarioId: 'scenario', blockingScenarioId: 'bs', serviceDayId, label: id, activities: [{ id: `${id}-t`, type: 'revenueTrip', sequence: 0, tripId }], ...metadata() });

function setup(saturdayStarts: [number, number] = [100, 300]) {
  const trips = [trip('w1', 'weekday', 100), trip('w2', 'weekday', 300), trip('s1', 'saturday', saturdayStarts[0]), trip('s2', 'saturday', saturdayStarts[1]), trip('u1', 'sunday', 100)];
  const blocks = [block('Wk 1', 'weekday', 'w1'), block('Wk 2', 'weekday', 'w2'), block('Old Sat', 'saturday', 's1'), block('Sun', 'sunday', 'u1')];
  const repository = new InMemoryBlockingRepository([blockingScenario], blocks);
  const state = { trips };
  const service = new BlockingApplicationService(repository, {
    getTrip: async (id) => state.trips.find((item) => item.id === id), listTrips: async () => state.trips, getTripProfile: async () => undefined,
    listPatterns: async () => [pattern], listServiceDays: async () => days,
  });
  return { repository, service, state };
}
const request = { scenarioId: 'scenario', blockingScenarioId: 'bs', sourceServiceDayId: 'weekday', targetServiceDayId: 'saturday' };

describe('Blocking day copy application service', () => {
  it('round trips an exact copy and writes the target day only', async () => {
    const { repository, service } = setup();
    const review = await service.previewBlockingDayCopy(request);
    expect(review.preview.findings).toEqual([]);
    await service.applyBlockingDayCopy(review);
    const saturday = await repository.listBlockingBlocks('bs', 'saturday');
    expect(saturday.map((item) => item.label).sort()).toEqual(['Wk 1', 'Wk 2']);
    expect(saturday.flatMap((item) => item.activities.map((activity) => activity.type === 'revenueTrip' ? activity.tripId : '')).sort()).toEqual(['s1', 's2']);
    expect((await repository.listBlockingBlocks('bs', 'weekday')).map((item) => item.id).sort()).toEqual(['Wk 1', 'Wk 2']);
    expect((await repository.listBlockingBlocks('bs', 'sunday')).map((item) => item.id)).toEqual(['Sun']);
  });

  it('refuses a Trip edit made between preview and apply', async () => {
    const { repository, service, state } = setup();
    const review = await service.previewBlockingDayCopy(request);
    state.trips = state.trips.map((item) => item.id === 's2' ? { ...item, updatedAt: '2030-01-01T00:00:00.000Z' } : item);
    await expect(service.applyBlockingDayCopy(review)).rejects.toMatchObject({ name: 'BlockingValidationError', findings: [{ ruleId: 'blockingScenario.sourceChanged' }] });
    expect((await repository.listBlockingBlocks('bs', 'saturday')).map((item) => item.id)).toEqual(['Old Sat']);
  });

  it('refuses a Block edit made between preview and apply', async () => {
    const { repository, service } = setup();
    const review = await service.previewBlockingDayCopy(request);
    await repository.replaceBlocksForDayAtomically('bs', 'sunday', [], review.blockingScenarioSignature);
    await expect(service.applyBlockingDayCopy(review)).rejects.toThrow('changed since');
    expect((await repository.listBlockingBlocks('bs', 'saturday')).map((item) => item.id)).toEqual(['Old Sat']);
  });

  it('refuses a copy below the match threshold, even when acknowledged', async () => {
    const { repository, service } = setup([500, 700]);
    const review = await service.previewBlockingDayCopy({ ...request, acknowledgeMismatch: true });
    expect(review.preview.impact.belowThreshold).toBe(true);
    await expect(service.applyBlockingDayCopy(review)).rejects.toThrow('matchBelowThreshold');
    expect((await repository.listBlockingBlocks('bs', 'saturday')).map((item) => item.id)).toEqual(['Old Sat']);
  });

  it('refuses an unacknowledged mismatch and applies an acknowledged one', async () => {
    const { repository, service } = setup([100, 310]);
    const plain = await service.previewBlockingDayCopy(request);
    await expect(service.applyBlockingDayCopy(plain)).rejects.toThrow('mismatchRequiresAcknowledgment');
    const acknowledged = await service.previewBlockingDayCopy({ ...request, acknowledgeMismatch: true });
    await service.applyBlockingDayCopy(acknowledged);
    expect((await repository.listBlockingBlocks('bs', 'saturday')).length).toBe(2);
  });

  it('refuses an empty source unless explicitly allowed, then clears the target day', async () => {
    const { repository, service } = setup();
    const empty = { ...request, sourceServiceDayId: 'sunday', targetServiceDayId: 'weekday' };
    await repository.replaceBlocksForDayAtomically('bs', 'sunday', [], await service.previewBlockingDayCopy(empty).then((review) => review.blockingScenarioSignature));
    await expect(service.applyBlockingDayCopy(await service.previewBlockingDayCopy(empty))).rejects.toThrow('emptySourceRequiresExplicitClear');
    await service.applyBlockingDayCopy(await service.previewBlockingDayCopy({ ...empty, allowEmptySource: true }));
    expect(await repository.listBlockingBlocks('bs', 'weekday')).toEqual([]);
  });

  it('refuses to preview without listServiceDays', async () => {
    const repository = new InMemoryBlockingRepository([blockingScenario], []);
    const service = new BlockingApplicationService(repository, { getTrip: async () => undefined, listTrips: async () => [], getTripProfile: async () => undefined, listPatterns: async () => [] });
    await expect(service.previewBlockingDayCopy(request)).rejects.toThrow('not available');
  });
});
