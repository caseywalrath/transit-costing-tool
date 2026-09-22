import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import { createBlockingScenarioSourceSignature } from '../domain/blocking';
import type { BlockingBlock, RoutePattern, Trip, TripProfile } from '../domain/types';
import { BlockingApplicationService } from './blockingService';
import { InMemoryBlockingRepository } from '../persistence/blockingRepository';

const profile: TripProfile = { id: 'profile', scenarioId: 'scenario', name: 'Default', ...metadata() };
const pattern: RoutePattern = { id: 'pattern', scenarioId: 'scenario', routeId: 'route', name: 'A-B', points: [{ id: 'a', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'B', sequence: 1, cumulativeMiles: 1 }], ...metadata() };
const trip: Trip = { id: 'trip', scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: pattern.id, tripProfileId: profile.id, stopTimes: [{ patternPointId: 'a', sequence: 0, time: 100 }, { patternPointId: 'b', sequence: 1, time: 200 }], provenance: { kind: 'manual', manuallyChangedFields: [] }, ...metadata() };

describe('Blocking application service', () => {
  it('previews and atomically applies boundary values across matching Blocks while preserving overrides', async () => {
    const scenario = { id: 'blocking', scenarioId: 'scenario', tripProfileId: profile.id, name: 'Base', ...metadata() };
    const otherRoutePattern = { ...pattern, id: 'other-pattern', routeId: 'other-route', points: pattern.points.map((point) => ({ ...point })) };
    const otherTrip = { ...trip, id: 'other-trip', routeId: 'other-route', patternId: otherRoutePattern.id };
    const saturdayTrip = { ...trip, id: 'saturday-trip', serviceDayId: 'saturday' };
    const trips = [trip, otherTrip, saturdayTrip];
    const block = (id: string, tripId: string, day = 'weekday', pullOutMinutes?: number) => ({ id, scenarioId: scenario.scenarioId, blockingScenarioId: scenario.id, serviceDayId: day, label: id, activities: [
      ...(pullOutMinutes === undefined ? [] : [{ id: `${id}-out`, type: 'pullOut' as const, sequence: 0, minutesBeforeFirstTrip: pullOutMinutes, toNodeId: 'A', miles: 3 }]),
      { id: `${id}-trip`, type: 'revenueTrip' as const, sequence: pullOutMinutes === undefined ? 0 : 1, tripId },
    ], ...metadata() });
    const blocks = [block('source', trip.id), block('existing', otherTrip.id, 'weekday', 8), block('other-day', saturdayTrip.id, 'saturday'), { ...block('empty', trip.id), activities: [] }];
    const repository = new InMemoryBlockingRepository([scenario], blocks);
    const service = new BlockingApplicationService(repository, { getTrip: async (id) => trips.find((item) => item.id === id), listTrips: async () => trips, getTripProfile: async () => profile, listPatterns: async () => [pattern, otherRoutePattern] });
    const request = { blockingScenarioId: scenario.id, serviceDayId: 'weekday', sourceBlockId: 'source', activity: { id: 'new-out', type: 'pullOut' as const, sequence: 0, minutesBeforeFirstTrip: 12, fromNodeId: 'garage', toNodeId: 'A', miles: 2 }, replaceExisting: false, sourceSignature: createBlockingScenarioSourceSignature(scenario, blocks) };
    const preview = await service.previewBulkBoundaryActivities(request);
    expect(preview).toMatchObject({ matchingBlockCount: 2, addCount: 1, replaceCount: 0, skippedExistingCount: 1, skippedWithoutTripCount: 1 });
    otherRoutePattern.points[0].nodeId = 'C';
    await expect(service.applyBulkBoundaryActivities({ ...request, expectedEndpointSignature: preview.endpointSignature })).rejects.toThrow('Trip endpoints changed');
    otherRoutePattern.points[0].nodeId = 'A';
    await service.applyBulkBoundaryActivities({ ...request, expectedEndpointSignature: preview.endpointSignature });
    expect((await repository.getBlockingBlock('source'))?.activities[0]).toMatchObject({ id: 'new-out', minutesBeforeFirstTrip: 12, miles: 2 });
    expect((await repository.getBlockingBlock('existing'))?.activities[0]).toMatchObject({ id: 'existing-out', minutesBeforeFirstTrip: 8, miles: 3 });
    expect((await repository.getBlockingBlock('other-day'))?.activities).toHaveLength(1);
    await expect(service.applyBulkBoundaryActivities(request)).rejects.toThrow('changed since the operation was reviewed');
    const current = await repository.listBlockingBlocks(scenario.id);
    const replace = { ...request, replaceExisting: true, sourceSignature: createBlockingScenarioSourceSignature(scenario, current) };
    expect(await service.previewBulkBoundaryActivities(replace)).toMatchObject({ matchingBlockCount: 2, replaceCount: 2, skippedExistingCount: 0 });
    await service.applyBulkBoundaryActivities(replace);
    expect((await repository.getBlockingBlock('existing'))?.activities[0]).toMatchObject({ id: 'existing-out', minutesBeforeFirstTrip: 12, miles: 2 });

    const pullInRequest = { ...request, activity: { id: 'new-in', type: 'pullIn' as const, sequence: 0, minutesAfterLastTrip: 7, fromNodeId: 'B', toNodeId: 'garage', miles: 1 }, sourceSignature: createBlockingScenarioSourceSignature(scenario, await repository.listBlockingBlocks(scenario.id)) };
    const pullInPreview = await service.previewBulkBoundaryActivities(pullInRequest);
    expect(pullInPreview).toMatchObject({ matchingBlockCount: 2, addCount: 2 });
    await service.applyBulkBoundaryActivities({ ...pullInRequest, expectedEndpointSignature: pullInPreview.endpointSignature });
    expect((await repository.getBlockingBlock('existing'))?.activities.at(-1)).toMatchObject({ type: 'pullIn', minutesAfterLastTrip: 7, fromNodeId: 'B' });
  });

  it('creates a scenario, creates a Block, and atomically assigns a Trip', async () => {
    const repository = new InMemoryBlockingRepository();
    const service = new BlockingApplicationService(repository, { getTrip: async (id) => id === trip.id ? trip : undefined, listTrips: async () => [trip], getTripProfile: async () => profile, listPatterns: async () => [pattern] });
    const scenario = await service.createBlockingScenario({ scenarioId: profile.scenarioId, tripProfileId: profile.id, name: 'Base' });
    const emptySignature = createBlockingScenarioSourceSignature(scenario, []);
    const block = await service.createBlock(scenario.id, 'weekday', '1', emptySignature);
    const signature = createBlockingScenarioSourceSignature(scenario, [block]);
    const result = await service.assignTrip({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: trip.id, destinationBlockId: block.id, sourceSignature: signature });
    expect(result.blocks[0].activities[0]).toMatchObject({ type: 'revenueTrip', tripId: trip.id });
  });

  it('exports the selected Blocking Scenario as normalized report files', async () => {
    const repository = new InMemoryBlockingRepository();
    const service = new BlockingApplicationService(repository, { getTrip: async (id) => id === trip.id ? trip : undefined, listTrips: async () => [trip], getTripProfile: async () => profile, listPatterns: async () => [pattern] });
    const scenario = await service.createBlockingScenario({ scenarioId: profile.scenarioId, tripProfileId: profile.id, name: 'Base' });
    const block = await service.createBlock(scenario.id, 'weekday', '1', createBlockingScenarioSourceSignature(scenario, []));
    const files = await service.exportBlockingScenarioCsv(scenario.id);
    expect(files.map((file) => file.suffix)).toEqual(['blocking-scenarios', 'blocking-blocks', 'blocking-activities', 'blocking-summaries']);
    expect(files[0].contents).toContain('tripProfileName');
    expect(files[1].contents).toContain(block.id);
    expect(files[3].contents).toContain('blockingScenario');
  });

  it('persists explicit activity reordering instead of restoring the previous sequence', async () => {
    const repository = new InMemoryBlockingRepository();
    const secondTrip = { ...trip, id: 'trip-2', stopTimes: [{ patternPointId: 'a', sequence: 0, time: 300 }, { patternPointId: 'b', sequence: 1, time: 400 }] };
    const service = new BlockingApplicationService(repository, { getTrip: async (id) => id === trip.id ? trip : id === secondTrip.id ? secondTrip : undefined, listTrips: async () => [trip, secondTrip], getTripProfile: async () => profile, listPatterns: async () => [pattern] });
    const scenario = await service.createBlockingScenario({ scenarioId: profile.scenarioId, tripProfileId: profile.id, name: 'Order' });
    let signature = createBlockingScenarioSourceSignature(scenario, []);
    const block = await service.createBlock(scenario.id, 'weekday', '1', signature);
    signature = createBlockingScenarioSourceSignature(scenario, [block]);
    let result = await service.assignTrip({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: trip.id, destinationBlockId: block.id, sourceSignature: signature });
    signature = createBlockingScenarioSourceSignature(scenario, result.blocks);
    result = await service.assignTrip({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: secondTrip.id, destinationBlockId: block.id, sourceSignature: signature });
    const ordered = result.blocks[0];
    const reordered = await service.reorderActivities(scenario.id, ordered.id, [ordered.activities[1].id, ordered.activities[0].id], createBlockingScenarioSourceSignature(scenario, result.blocks));
    expect(reordered.activities.map((activity) => activity.type === 'revenueTrip' ? activity.tripId : '')).toEqual([secondTrip.id, trip.id]);
  });

  it('reassigns and removes multiple selected Trips in one reviewed write', async () => {
    const repository = new InMemoryBlockingRepository();
    const secondTrip = { ...trip, id: 'trip-2', stopTimes: [{ patternPointId: 'a', sequence: 0, time: 300 }, { patternPointId: 'b', sequence: 1, time: 400 }] };
    const service = new BlockingApplicationService(repository, { getTrip: async (id) => id === trip.id ? trip : id === secondTrip.id ? secondTrip : undefined, listTrips: async () => [trip, secondTrip], getTripProfile: async () => profile, listPatterns: async () => [pattern] });
    const scenario = await service.createBlockingScenario({ scenarioId: profile.scenarioId, tripProfileId: profile.id, name: 'Batch actions' });
    let blocks = [await service.createBlock(scenario.id, 'weekday', '1', createBlockingScenarioSourceSignature(scenario, []))];
    blocks = [...blocks, await service.createBlock(scenario.id, 'weekday', '2', createBlockingScenarioSourceSignature(scenario, blocks))];
    let result = await service.assignTrip({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: trip.id, destinationBlockId: blocks[0].id, sourceSignature: createBlockingScenarioSourceSignature(scenario, blocks) });
    result = await service.assignTrip({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: secondTrip.id, destinationBlockId: blocks[0].id, sourceSignature: createBlockingScenarioSourceSignature(scenario, result.blocks) });
    const sourceWithDeadhead = await service.updateBlock({ ...result.blocks[0], activities: [result.blocks[0].activities[0], { id: 'deadhead', type: 'deadhead', sequence: 1, minutesAfterPreviousTrip: 1, fromNodeId: 'B', toNodeId: 'A' }, { ...result.blocks[0].activities[1], sequence: 2 }] }, createBlockingScenarioSourceSignature(scenario, result.blocks));
    result = { ...result, blocks: [sourceWithDeadhead, result.blocks[1]] };
    const reassigned = await service.reassignTrips({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripIds: [trip.id, secondTrip.id], sourceBlockId: blocks[0].id, destinationBlockId: blocks[1].id, sourceSignature: createBlockingScenarioSourceSignature(scenario, result.blocks) });
    expect(reassigned.blocks.find((block) => block.id === blocks[0].id)?.activities).toEqual([]);
    expect(reassigned.blocks.find((block) => block.id === blocks[1].id)?.activities.map((activity) => activity.type === 'revenueTrip' ? activity.tripId : '')).toEqual([trip.id, secondTrip.id]);
    const removed = await service.removeTrips(scenario.id, 'weekday', [trip.id, secondTrip.id], createBlockingScenarioSourceSignature(scenario, reassigned.blocks));
    expect(removed.blocks.flatMap((block) => block.activities)).toEqual([]);
  });

  it('unassigns selected Trips from multiple Blocks and removes only their adjacent deadheads', async () => {
    const scenario = { id: 'blocking', scenarioId: 'scenario', tripProfileId: profile.id, name: 'Unassign', ...metadata() };
    const tripAt = (id: string, start: number) => ({ ...trip, id, stopTimes: [{ patternPointId: 'a', sequence: 0, time: start }, { patternPointId: 'b', sequence: 1, time: start + 100 }] });
    const first = tripAt('first', 100); const kept = tripAt('kept', 300); const second = tripAt('second', 500); const unassigned = tripAt('unassigned', 700);
    const block = (id: string, activities: BlockingBlock['activities']): BlockingBlock => ({ id, scenarioId: scenario.scenarioId, blockingScenarioId: scenario.id, serviceDayId: 'weekday', label: id, activities, ...metadata() });
    const sourceOne = block('source-one', [
      { id: 'pull-out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 2, toNodeId: 'A' },
      { id: 'first-trip', type: 'revenueTrip', sequence: 1, tripId: first.id },
      { id: 'adjacent-deadhead', type: 'deadhead', sequence: 2, minutesAfterPreviousTrip: 1, fromNodeId: 'B', toNodeId: 'A' },
      { id: 'kept-trip', type: 'revenueTrip', sequence: 3, tripId: kept.id },
      { id: 'pull-in', type: 'pullIn', sequence: 4, minutesAfterLastTrip: 2, fromNodeId: 'B' },
    ]);
    const sourceTwo = block('source-two', [{ id: 'second-trip', type: 'revenueTrip', sequence: 0, tripId: second.id }]);
    const blocks = [sourceOne, sourceTwo]; const repository = new InMemoryBlockingRepository([scenario], blocks);
    const trips = [first, kept, second, unassigned];
    const service = new BlockingApplicationService(repository, { getTrip: async (id) => trips.find((item) => item.id === id), listTrips: async () => trips, getTripProfile: async () => profile, listPatterns: async () => [pattern] });
    const result = await service.removeTrips(scenario.id, 'weekday', [first.id, second.id, unassigned.id, first.id], createBlockingScenarioSourceSignature(scenario, blocks));

    expect(result.blocks.find((item) => item.id === sourceOne.id)?.activities.map((activity) => activity.id)).toEqual(['pull-out', 'kept-trip', 'pull-in']);
    expect(result.blocks.find((item) => item.id === sourceTwo.id)?.activities).toEqual([]);
    expect((await repository.listBlockingBlocks(scenario.id)).flatMap((item) => item.activities).filter((activity) => activity.type === 'revenueTrip').map((activity) => activity.tripId)).toEqual([kept.id]);
  });

  it('rejects unassignment when a selected Trip is duplicated across Blocks', async () => {
    const scenario = { id: 'blocking', scenarioId: 'scenario', tripProfileId: profile.id, name: 'Duplicate assignment', ...metadata() };
    const duplicateBlocks: BlockingBlock[] = ['one', 'two'].map((id) => ({ id, scenarioId: scenario.scenarioId, blockingScenarioId: scenario.id, serviceDayId: 'weekday', label: id, activities: [{ id: `${id}-trip`, type: 'revenueTrip', sequence: 0, tripId: trip.id }], ...metadata() }));
    const repository = new InMemoryBlockingRepository([scenario], duplicateBlocks);
    const service = new BlockingApplicationService(repository, { getTrip: async () => trip, listTrips: async () => [trip], getTripProfile: async () => profile, listPatterns: async () => [pattern] });
    const sourceSignature = createBlockingScenarioSourceSignature(scenario, duplicateBlocks);

    await expect(service.removeTrips(scenario.id, 'weekday', [trip.id], sourceSignature)).rejects.toThrow('assigned more than once');
    expect(await repository.listBlockingBlocks(scenario.id)).toEqual(duplicateBlocks);
  });

  it('assigns Trips from several source Blocks and unassigned service into one destination atomically', async () => {
    const scenario = { id: 'blocking', scenarioId: 'scenario', tripProfileId: profile.id, name: 'Base', ...metadata() };
    const tripAt = (id: string, start: number) => ({ ...trip, id, stopTimes: [{ patternPointId: 'a', sequence: 0, time: start }, { patternPointId: 'b', sequence: 1, time: start + 100 }] });
    const first = tripAt('first', 100);
    const kept = tripAt('kept', 300);
    const movedFromSecond = tripAt('second-source', 250);
    const unassigned = tripAt('unassigned', 50);
    const block = (id: string, label: string, activities: BlockingBlock['activities']) => ({ id, scenarioId: scenario.scenarioId, blockingScenarioId: scenario.id, serviceDayId: 'weekday', label, activities, ...metadata() });
    const sourceOne = block('source-one', 'Source 1', [
      { id: 'first-activity', type: 'revenueTrip', sequence: 0, tripId: first.id },
      { id: 'source-deadhead', type: 'deadhead', sequence: 1, minutesAfterPreviousTrip: 1, fromNodeId: 'B', toNodeId: 'A' },
      { id: 'kept-activity', type: 'revenueTrip', sequence: 2, tripId: kept.id },
    ]);
    const sourceTwo = block('source-two', 'Source 2', [{ id: 'second-activity', type: 'revenueTrip', sequence: 0, tripId: movedFromSecond.id }]);
    const destination = block('destination', 'Destination', []);
    const repository = new InMemoryBlockingRepository([scenario], [sourceOne, sourceTwo, destination]);
    const trips = [first, kept, movedFromSecond, unassigned];
    const service = new BlockingApplicationService(repository, { getTrip: async (id) => trips.find((item) => item.id === id), listTrips: async () => trips, getTripProfile: async () => profile, listPatterns: async () => [pattern] });
    const result = await service.assignTripsToBlock({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripIds: [first.id, movedFromSecond.id, unassigned.id, first.id], destinationBlockId: destination.id, sourceSignature: createBlockingScenarioSourceSignature(scenario, [sourceOne, sourceTwo, destination]) });

    expect(result.blocks.find((item) => item.id === 'destination')?.activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => activity.tripId)).toEqual([unassigned.id, first.id, movedFromSecond.id]);
    expect(result.blocks.find((item) => item.id === 'source-one')?.activities).toEqual([{ id: 'kept-activity', type: 'revenueTrip', sequence: 0, tripId: kept.id }]);
    expect(result.blocks.find((item) => item.id === 'source-two')?.activities).toEqual([]);
    expect(result.blocks.flatMap((item) => item.activities).filter((activity) => activity.type === 'revenueTrip' && [first.id, movedFromSecond.id, unassigned.id].includes(activity.tripId))).toHaveLength(3);
  });

  it('rejects a multi-Trip assignment into a Block that would cross Route boundaries without saving', async () => {
    const scenario = { id: 'blocking', scenarioId: 'scenario', tripProfileId: profile.id, name: 'Base', ...metadata() };
    const otherRoutePattern = { ...pattern, id: 'other-pattern', routeId: 'other-route' };
    const otherRouteTrip = { ...trip, id: 'other-route-trip', routeId: 'other-route', patternId: otherRoutePattern.id };
    const destination: BlockingBlock = { id: 'destination', scenarioId: scenario.scenarioId, blockingScenarioId: scenario.id, serviceDayId: 'weekday', label: 'Destination', activities: [{ id: 'existing-trip', type: 'revenueTrip', sequence: 0, tripId: otherRouteTrip.id }], ...metadata() };
    const repository = new InMemoryBlockingRepository([scenario], [destination]);
    const trips = [trip, otherRouteTrip];
    const service = new BlockingApplicationService(repository, { getTrip: async (id) => trips.find((item) => item.id === id), listTrips: async () => trips, getTripProfile: async () => profile, listPatterns: async () => [pattern, otherRoutePattern] });
    const signature = createBlockingScenarioSourceSignature(scenario, [destination]);

    await expect(service.assignTripsToBlock({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripIds: [trip.id], destinationBlockId: destination.id, sourceSignature: signature })).rejects.toThrow('Phase 4 assignment cannot add another Route');
    expect(await repository.getBlockingBlock(destination.id)).toEqual(destination);
  });
});
