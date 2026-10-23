import { describe, expect, it } from 'vitest';
import { BlockingValidationError, createBlockingScenarioSourceSignature } from '../domain/blocking';
import { metadata } from '../domain/ids';
import type { BlockActivity, BlockingBlock, BlockingScenario, DeadheadActivity, RoutePattern, Trip, TripProfile } from '../domain/types';
import { InMemoryBlockingRepository } from '../persistence/blockingRepository';
import { BlockingApplicationService } from './blockingService';

// Package P14 (I-024, I-074a, I-077; Decision 0039): the Blocking rules the Blocking screen used to apply itself, as service calls.
const H = 3600; const M = 60;
const profile: TripProfile = { id: 'profile', scenarioId: 'scenario', name: 'Default', ...metadata() };
const scenario: BlockingScenario = { id: 'bs', scenarioId: 'scenario', tripProfileId: 'profile', name: 'Plan', ...metadata() };
const ab: RoutePattern = { id: 'ab', scenarioId: 'scenario', routeId: 'route', name: 'AB', points: [{ id: 'ab0', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'ab1', nodeId: 'B', sequence: 1, cumulativeMiles: 5 }], ...metadata() };
function trip(id: string, start: number, extra: Partial<Trip> = {}): Trip {
  return { id, scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: 'ab', tripProfileId: 'profile', stopTimes: [{ patternPointId: 'ab0', sequence: 0, time: start }, { patternPointId: 'ab1', sequence: 1, time: start + 30 * M }], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...metadata(), ...extra };
}
const rev = (tripId: string, id = `r-${tripId}`): BlockActivity => ({ id, type: 'revenueTrip', sequence: 0, tripId });
function block(id: string, label: string, activities: BlockActivity[] = [], extra: Partial<BlockingBlock> = {}): BlockingBlock { return { id, scenarioId: 'scenario', blockingScenarioId: 'bs', serviceDayId: 'weekday', label, activities: activities.map((activity, sequence) => ({ ...activity, sequence })), ...metadata(), ...extra }; }

function setup(blocks: BlockingBlock[], trips: Trip[] = []) {
  const repository = new InMemoryBlockingRepository([scenario], blocks);
  const service = new BlockingApplicationService(repository, { getTrip: async (id) => trips.find((item) => item.id === id), listTrips: async () => trips, getTripProfile: async () => profile, listPatterns: async () => [ab] });
  const signature = async () => createBlockingScenarioSourceSignature(scenario, await repository.listBlockingBlocks(scenario.id));
  return { repository, service, signature };
}
const caught = async (action: Promise<unknown>): Promise<BlockingValidationError> => {
  try { await action; } catch (error) { expect(error).toBeInstanceOf(BlockingValidationError); return error as BlockingValidationError; }
  throw new Error('Expected the call to throw.');
};
const deadhead: DeadheadActivity = { id: 'new-dh', type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: 10, fromNodeId: 'B', toNodeId: 'A', miles: 1 };

describe('Apply a deadhead to every matching connection (finding 4-007)', () => {
  const five = [1, 2, 3, 4, 5].map((n) => trip(`t${n}`, (5 + n) * H));

  it('adds a deadhead to each of the 4 connections of 5 matching Trips and saves the Block once', async () => {
    const { service, repository, signature } = setup([block('b', 'Block 1', five.map((item) => rev(item.id)))], five);
    const result = await service.applyDeadheadToMatchingConnections({ blockingScenarioId: 'bs', blockId: 'b', deadhead, sourceSignature: await signature() });
    expect(result.appliedCount).toBe(4);
    const saved = await repository.getBlockingBlock('b');
    expect(saved?.activities.map((activity) => activity.type)).toEqual(['revenueTrip', 'deadhead', 'revenueTrip', 'deadhead', 'revenueTrip', 'deadhead', 'revenueTrip', 'deadhead', 'revenueTrip']);
    expect(saved?.activities.map((activity) => activity.sequence)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.block.activities).toEqual(saved?.activities);
  });

  it('refuses a stale source, a missing Block, and a request that matches nothing, and saves nothing', async () => {
    const { service, repository, signature } = setup([block('b', 'Block 1', five.map((item) => rev(item.id)))], five);
    const stale = await signature();
    await service.updateBlock(block('b', 'Block 1', five.slice(0, 4).map((item) => rev(item.id))), stale);
    await expect(service.applyDeadheadToMatchingConnections({ blockingScenarioId: 'bs', blockId: 'b', deadhead, sourceSignature: stale })).rejects.toThrow('changed since the operation was reviewed');
    const current = await signature();
    await expect(service.applyDeadheadToMatchingConnections({ blockingScenarioId: 'bs', blockId: 'gone', deadhead, sourceSignature: current })).rejects.toThrow('Block not found.');
    const none = await caught(service.applyDeadheadToMatchingConnections({ blockingScenarioId: 'bs', blockId: 'b', deadhead: { ...deadhead, fromNodeId: 'X' }, sourceSignature: current }));
    expect(none.message).toBe('No consecutive Trips use the selected From and To Nodes.');
    expect((await repository.getBlockingBlock('b'))?.activities).toHaveLength(4);
  });
});

describe('Add and move activities (finding 4-014)', () => {
  const trips = [trip('t1', 6 * H), trip('t2', 7 * H), trip('t3', 8 * H)];

  it.each(['aaa', 'zzz'])('stores a pull-out first and a pull-in last, whatever ids such as %s sort like', async (id) => {
    const { service, repository, signature } = setup([block('b', 'Block 1', trips.map((item) => rev(item.id, `m-${item.id}`)))], trips);
    await service.addActivity({ blockingScenarioId: 'bs', blockId: 'b', activity: { id: `${id}-in`, type: 'pullIn', sequence: 0, minutesAfterLastTrip: 10, fromNodeId: 'B' }, sourceSignature: await signature() });
    await service.addActivity({ blockingScenarioId: 'bs', blockId: 'b', activity: { id: `${id}-out`, type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A' }, sourceSignature: await signature() });
    const saved = await repository.getBlockingBlock('b');
    expect(saved?.activities.map((activity) => activity.type)).toEqual(['pullOut', 'revenueTrip', 'revenueTrip', 'revenueTrip', 'pullIn']);
    expect(saved?.activities.map((activity) => activity.sequence)).toEqual([0, 1, 2, 3, 4]);
  });

  it('stores a deadhead after the named Trip and refuses one with no preceding Trip', async () => {
    const { service, repository, signature } = setup([block('b', 'Block 1', trips.map((item) => rev(item.id)))], trips);
    const saved = await service.addActivity({ blockingScenarioId: 'bs', blockId: 'b', activity: deadhead, afterTripId: 't2', sourceSignature: await signature() });
    expect(saved.activities.map((activity) => activity.id)).toEqual(['r-t1', 'r-t2', 'new-dh', 'r-t3']);
    expect((await repository.getBlockingBlock('b'))?.activities.map((activity) => activity.sequence)).toEqual([0, 1, 2, 3]);
    const missing = await caught(service.addActivity({ blockingScenarioId: 'bs', blockId: 'b', activity: { ...deadhead, id: 'other' }, sourceSignature: await signature() }));
    expect(missing.message).toBe('Select a preceding Trip for the deadhead.');
  });

  it('moves a Trip with its deadhead and stores the new order; a move that cannot happen changes nothing', async () => {
    const { service, repository, signature } = setup([block('b', 'Block 1', [rev('t1'), { ...deadhead, id: 'dh1' }, rev('t2'), rev('t3')])], trips);
    const moved = await service.moveTripGroup('bs', 'b', 'r-t2', -1, await signature());
    expect(moved.activities.map((activity) => activity.id)).toEqual(['r-t2', 'r-t1', 'dh1', 'r-t3']);
    expect((await repository.getBlockingBlock('b'))?.activities.map((activity) => activity.id)).toEqual(['r-t2', 'r-t1', 'dh1', 'r-t3']);
    const before = (await repository.getBlockingBlock('b'))!.updatedAt;
    const unchanged = await service.moveTripGroup('bs', 'b', 'r-t2', -1, await signature());
    expect(unchanged.activities.map((activity) => activity.id)).toEqual(['r-t2', 'r-t1', 'dh1', 'r-t3']);
    expect((await repository.getBlockingBlock('b'))!.updatedAt).toBe(before);
  });
});

describe('Unassigned Trips and Layover % (finding 4-014)', () => {
  it('lists the unassigned Trips of the Route and service day from the stored Blocks', async () => {
    const trips = [trip('a', 6 * H), trip('b', 7 * H), trip('c', 8 * H, { routeId: 'other' }), trip('d', 9 * H, { serviceDayId: 'saturday' })];
    const { service } = setup([block('b1', 'Block 1', [rev('a')])], trips);
    expect((await service.listUnassignedTrips('bs', 'weekday', 'route')).map((item) => item.id)).toEqual(['b']);
    expect((await service.listUnassignedTrips('bs', 'weekday', 'other')).map((item) => item.id)).toEqual(['c']);
    expect(await service.listUnassignedTrips('missing', 'weekday', 'route')).toEqual([]);
  });

  it('reports Layover % in the Block and Scenario summaries', async () => {
    const trips = [trip('a', 6 * H), trip('b', 7 * H)];
    const { service } = setup([block('b1', 'Block 1', [rev('a'), { ...deadhead, id: 'dh', minutesAfterPreviousTrip: 10 }, rev('b')])], trips);
    const summary = await service.getBlockSummary('bs', 'b1');
    expect(summary?.layoverPercent).toBeCloseTo(100 * (20 / 60) / (1 + 20 / 60));
    expect((await service.getScenarioSummary('bs', 'weekday'))?.layoverPercent).toBeCloseTo(summary!.layoverPercent!);
  });
});

describe('Input parsing is part of the service (finding 4-018)', () => {
  const { service } = setup([]);
  it('refuses blank minutes and a blank minimum-layover amount', () => {
    expect(service.parseActivityInput({ minutes: '', miles: '' }).findings.map((item) => item.ruleId)).toEqual(['block.minutesRequired']);
    expect(service.parseActivityInput({ minutes: '12', miles: '1.5' })).toEqual({ minutes: 12, miles: 1.5, findings: [] });
    expect(service.parseMinimumLayover('minutes', '').findings.map((item) => item.ruleId)).toEqual(['block.minimumLayoverAmountRequired']);
    expect(service.parseMinimumLayover('percent', '50').rule).toEqual({ mode: 'percent', value: 50 });
  });
});

describe('Block labels (Decision 0039)', () => {
  it('refuses to create a Block with a label already used on the same service day, and allows it on another day', async () => {
    const { service, repository, signature } = setup([block('b1', 'Block 1')]);
    const duplicate = await caught(service.createBlock('bs', 'weekday', ' Block 1 ', await signature()));
    expect(duplicate.message).toBe('Another Block on this service day already uses that label.');
    expect(duplicate.findings[0]).toMatchObject({ ruleId: 'block.labelUnique', entityType: 'block', field: 'label' });
    expect(await repository.listBlockingBlocks('bs')).toHaveLength(1);
    const saturday = await service.createBlock('bs', 'saturday', 'Block 1', await signature());
    expect(saturday.serviceDayId).toBe('saturday');
    expect(await repository.listBlockingBlocks('bs')).toHaveLength(2);
  });

  it('refuses a rename to a label another Block uses, accepts the Block\'s own label, and keeps a rename atomic', async () => {
    const { service, repository, signature } = setup([block('b1', 'Block 1'), block('b2', 'Block 2')]);
    const taken = await caught(service.updateBlock({ ...block('b2', 'Block 1') }, await signature()));
    expect(taken.findings[0].ruleId).toBe('block.labelUnique');
    expect((await repository.getBlockingBlock('b2'))?.label).toBe('Block 2');
    await service.updateBlock({ ...block('b2', 'Block 2'), notes: 'same label' }, await signature());
    await service.updateBlock({ ...block('b2', 'Express') }, await signature());
    expect((await repository.getBlockingBlock('b2'))?.label).toBe('Express');
  });

  it('does not block an edit of a Block whose label already repeats another (data saved before the rule)', async () => {
    const { service, repository, signature } = setup([block('b1', 'Block 1'), block('b2', 'Block 1')]);
    await service.updateBlock({ ...block('b2', 'Block 1'), notes: 'edited' }, await signature());
    expect((await repository.getBlockingBlock('b2'))?.notes).toBe('edited');
  });

  it('proposes the first free "Block <n>" of the service day from the stored Blocks', async () => {
    const { service, signature } = setup([block('b1', 'Block 1'), block('b3', 'Block 3'), block('s1', 'Block 1', [], { serviceDayId: 'saturday' }), block('s2', 'Block 2', [], { serviceDayId: 'saturday' })]);
    expect(await service.proposeBlockLabel('bs', 'weekday')).toBe('Block 2');
    expect(await service.proposeBlockLabel('bs', 'saturday')).toBe('Block 3');
    expect(await service.proposeBlockLabel('bs', 'sunday')).toBe('Block 1');
    const created = await service.createBlock('bs', 'weekday', await service.proposeBlockLabel('bs', 'weekday'), await signature());
    expect(created.label).toBe('Block 2');
    expect(await service.proposeBlockLabel('bs', 'weekday')).toBe('Block 4');
  });
});

describe('Deletion previews (I-035 port; finding 4-014)', () => {
  const trips = [trip('a', 6 * H), trip('b', 7 * H), trip('c', 8 * H)];
  const blocks = [block('b1', 'Block 1', [{ id: 'out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A' }, rev('a'), { ...deadhead, id: 'dh' }, rev('b')]), block('b2', 'Block 2', [rev('c')]), block('b3', 'Block 3', [], { serviceDayId: 'saturday' })];

  it('counts what deleting a Block would remove, with the source signature the deletion must carry', async () => {
    const { service, signature } = setup(blocks, trips);
    const impact = await service.previewDeleteBlock('bs', 'b1');
    expect(impact).toEqual({ blockId: 'b1', label: 'Block 1', serviceDayId: 'weekday', activityCount: 4, tripCount: 2, deadheadCount: 1, sourceSignature: await signature() });
    await expect(service.previewDeleteBlock('bs', 'missing')).rejects.toThrow('Block not found.');
    await expect(service.previewDeleteBlock('missing', 'b1')).rejects.toThrow('Blocking Scenario not found.');
    await service.deleteBlock('bs', 'b1', impact.sourceSignature);
    await expect(service.deleteBlock('bs', 'b2', impact.sourceSignature)).rejects.toThrow('changed since the operation was reviewed');
  });

  it('counts what deleting a Blocking Scenario would remove', async () => {
    const { service, repository, signature } = setup(blocks, trips);
    const impact = await service.previewDeleteBlockingScenario('bs');
    expect(impact).toMatchObject({ blockingScenarioId: 'bs', blockCount: 3, activityCount: 5, sourceSignature: await signature() });
    expect([...impact.blockIds].sort()).toEqual(['b1', 'b2', 'b3']);
    await expect(service.previewDeleteBlockingScenario('missing')).rejects.toThrow('Blocking Scenario not found.');
    expect(await repository.listBlockingBlocks('bs')).toHaveLength(3);
    await service.deleteBlockingScenario('bs', impact.sourceSignature);
    expect(await repository.listBlockingBlocks('bs')).toHaveLength(0);
  });

  it('writes nothing', async () => {
    const { service, repository } = setup(blocks, trips);
    const before = JSON.stringify(await repository.listBlockingBlocks('bs'));
    await service.previewDeleteBlock('bs', 'b1'); await service.previewDeleteBlockingScenario('bs');
    expect(JSON.stringify(await repository.listBlockingBlocks('bs'))).toBe(before);
  });
});
