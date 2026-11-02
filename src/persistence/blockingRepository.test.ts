import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TransitDatabase } from './database';
import { DexieBlockingRepository, InMemoryBlockingRepository } from './blockingRepository';
import type { BlockingRepository } from '../application/ports';
import { createBlockingScenarioSourceSignature } from '../domain/blocking';
import { metadata } from '../domain/ids';
import type { BlockingBlock, BlockingScenario } from '../domain/types';

const scenarioA: BlockingScenario = { id: 'bs-a', scenarioId: 'scenario', tripProfileId: 'profile', name: 'A', ...metadata() };
const scenarioB: BlockingScenario = { id: 'bs-b', scenarioId: 'scenario', tripProfileId: 'profile', name: 'B', ...metadata() };
const block = (id: string, blockingScenarioId: string, serviceDayId: string, extra: Partial<BlockingBlock> = {}): BlockingBlock => ({
  id, scenarioId: 'scenario', blockingScenarioId, serviceDayId, label: id,
  activities: [{ id: `${id}-t`, type: 'revenueTrip', sequence: 0, tripId: `trip-${id}` }], ...metadata(), ...extra,
});
const seed = () => [block('a-wk-1', 'bs-a', 'weekday'), block('a-wk-2', 'bs-a', 'weekday'), block('a-sat', 'bs-a', 'saturday'), block('b-wk', 'bs-b', 'weekday')];

interface Harness { repository: BlockingRepository; close: () => Promise<void> }
const implementations: Array<{ name: string; create: () => Promise<Harness> }> = [
  { name: 'in-memory', create: async () => { const repository = new InMemoryBlockingRepository([scenarioA, scenarioB], seed()); return { repository, close: async () => undefined }; } },
  { name: 'Dexie', create: async () => {
    const db = new TransitDatabase(`blocking-repo-${Math.random().toString(36).slice(2)}`); const repository = new DexieBlockingRepository(db);
    await repository.saveBlockingScenario(scenarioA); await repository.saveBlockingScenario(scenarioB);
    await db.blocks.bulkPut(seed() as never[]);
    return { repository, close: async () => { db.close(); await db.delete(); } };
  } },
];

describe.each(implementations)('replaceBlocksForDayAtomically: $name', ({ create }) => {
  let harness: Harness; let repository: BlockingRepository;
  beforeEach(async () => { harness = await create(); repository = harness.repository; });
  afterEach(async () => { await harness.close(); });
  const signature = async () => createBlockingScenarioSourceSignature(scenarioA, await repository.listBlockingBlocks('bs-a'));
  const ids = async (id: string, day?: string) => (await repository.listBlockingBlocks(id, day)).map((item) => item.id).sort();

  it('replaces only that day and leaves other days and other Blocking Scenarios', async () => {
    await repository.replaceBlocksForDayAtomically('bs-a', 'weekday', [block('new-1', 'bs-a', 'weekday')], await signature());
    expect(await ids('bs-a', 'weekday')).toEqual(['new-1']);
    expect(await ids('bs-a', 'saturday')).toEqual(['a-sat']);
    expect(await ids('bs-b')).toEqual(['b-wk']);
  });

  it('clears the day when given no Blocks', async () => {
    await repository.replaceBlocksForDayAtomically('bs-a', 'weekday', [], await signature());
    expect(await ids('bs-a')).toEqual(['a-sat']);
  });

  it('refuses a stale signature without writing', async () => {
    const stale = await signature();
    await repository.saveBlockingBlocksAtomically([...await repository.listBlockingBlocks('bs-a'), block('extra', 'bs-a', 'saturday')], stale, 'bs-a');
    await expect(repository.replaceBlocksForDayAtomically('bs-a', 'weekday', [block('new-1', 'bs-a', 'weekday')], stale)).rejects.toThrow('changed since the operation was reviewed');
    expect(await ids('bs-a', 'weekday')).toEqual(['a-wk-1', 'a-wk-2']);
  });

  it.each([
    ['another Blocking Scenario', block('x', 'bs-b', 'weekday')],
    ['another Scenario', block('x', 'bs-a', 'weekday', { scenarioId: 'other' })],
    ['another service day', block('x', 'bs-a', 'saturday')],
  ])('refuses a Block of %s without writing', async (_label, outside) => {
    await expect(repository.replaceBlocksForDayAtomically('bs-a', 'weekday', [block('new-1', 'bs-a', 'weekday'), outside], await signature())).rejects.toThrow('outside');
    expect(await ids('bs-a', 'weekday')).toEqual(['a-wk-1', 'a-wk-2']);
    expect(await ids('bs-a', 'saturday')).toEqual(['a-sat']);
  });
});
