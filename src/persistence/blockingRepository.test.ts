import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import { createBlockingScenarioSourceSignature, createBlockingBlock } from '../domain/blocking';
import type { BlockingBlock, BlockingScenario, Trip, TripProfile } from '../domain/types';
import { InMemoryBlockingRepository } from './blockingRepository';

const profile: TripProfile = { id: 'profile', scenarioId: 'scenario', name: 'Weekday', ...metadata() };
const scenario: BlockingScenario = { id: 'blocking', scenarioId: 'scenario', tripProfileId: profile.id, name: 'Base blocks', ...metadata() };
const block: BlockingBlock = { ...createBlockingBlock(scenario, 'weekday', '1'), id: 'block' };

describe('Blocking persistence', () => {
  it('creates, duplicates, and deletes normalized graphs with stale protection', async () => {
    const repository = new InMemoryBlockingRepository([scenario], [block]);
    const current = await repository.listBlockingBlocks(scenario.id);
    const signature = createBlockingScenarioSourceSignature(scenario, current);
    await repository.saveBlockingScenarioGraphAtomically({ ...scenario, name: 'Renamed' }, current, signature);
    await expect(repository.deleteBlockingScenarioAtomically(scenario.id, signature)).rejects.toThrow(/changed/);
    const renamed = await repository.getBlockingScenario(scenario.id);
    expect(renamed?.name).toBe('Renamed');
  });

  it('rolls back a failed normalized block write', async () => {
    const repository = new InMemoryBlockingRepository([scenario], [block]);
    const signature = createBlockingScenarioSourceSignature(scenario, [block]);
    const invalid = { ...block, scenarioId: 'other' };
    await expect(repository.saveBlockingBlocksAtomically([invalid], signature, scenario.id)).rejects.toThrow(/outside/);
    expect(await repository.getBlockingBlock(block.id)).toEqual(block);
  });

  it('allows deleting the last Block while retaining the Blocking Scenario', async () => {
    const repository = new InMemoryBlockingRepository([scenario], [block]);
    const signature = createBlockingScenarioSourceSignature(scenario, [block]);
    await repository.saveBlockingBlocksAtomically([], signature, scenario.id);
    expect(await repository.listBlockingBlocks(scenario.id)).toEqual([]);
    expect(await repository.getBlockingScenario(scenario.id)).toEqual(scenario);
  });
});
