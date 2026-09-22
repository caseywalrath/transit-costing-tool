import type { BlockingRepository } from '../application/ports';
import type { Block, BlockingBlock, BlockingScenario } from '../domain/types';
import { assertBlockingScenarioSourceUnchanged, calculateBlockingScenarioDeletionImpact, createBlockingScenarioSourceSignature, normalizeBlockActivities } from '../domain/blocking';
import { TransitDatabase } from './database';

function normalized(block: Block | BlockingBlock): BlockingBlock {
  if (!block.blockingScenarioId) throw new Error(`Block ${block.id} is not a normalized Phase 4 Block.`);
  return normalizeBlockActivities(block as BlockingBlock);
}

function assertScenarioNameUnique(scenarios: BlockingScenario[], candidate: BlockingScenario): void {
  const key = candidate.name.trim().toLowerCase();
  if (!key) throw new Error('Blocking Scenario name is required.');
  if (scenarios.some((scenario) => scenario.id !== candidate.id && scenario.scenarioId === candidate.scenarioId && scenario.name.trim().toLowerCase() === key)) {
    throw new Error('A Blocking Scenario with this name already exists.');
  }
}

/** In-memory implementation used by application and transaction tests. */
export class InMemoryBlockingRepository implements BlockingRepository {
  readonly scenarios = new Map<string, BlockingScenario>();
  readonly blocks = new Map<string, BlockingBlock>();

  constructor(scenarios: BlockingScenario[] = [], blocks: BlockingBlock[] = []) {
    scenarios.forEach((scenario) => this.scenarios.set(scenario.id, scenario));
    blocks.forEach((block) => this.blocks.set(block.id, normalized(block)));
  }

  async listBlockingScenarios(scenarioId: string): Promise<BlockingScenario[]> { return [...this.scenarios.values()].filter((scenario) => scenario.scenarioId === scenarioId); }
  async getBlockingScenario(id: string): Promise<BlockingScenario | undefined> { return this.scenarios.get(id); }
  async saveBlockingScenario(scenario: BlockingScenario): Promise<void> { assertScenarioNameUnique([...this.scenarios.values()], scenario); this.scenarios.set(scenario.id, scenario); }

  async saveBlockingScenarioGraphAtomically(scenario: BlockingScenario, blocks: BlockingBlock[], expectedSourceSignature?: string, sourceBlockingScenarioId?: string): Promise<void> {
    const previousScenarios = new Map(this.scenarios); const previousBlocks = new Map(this.blocks);
    try {
      const existing = this.scenarios.get(scenario.id);
      if (expectedSourceSignature) {
        const source = this.scenarios.get(sourceBlockingScenarioId ?? scenario.id);
        if (!source) throw new Error('Blocking Scenario source not found.');
        assertBlockingScenarioSourceUnchanged(source, [...this.blocks.values()], expectedSourceSignature);
      }
      assertScenarioNameUnique([...this.scenarios.values()], scenario);
      for (const block of blocks) {
        if (block.blockingScenarioId !== scenario.id || block.scenarioId !== scenario.scenarioId) throw new Error(`Block ${block.id} is outside the Blocking Scenario ownership boundary.`);
        this.blocks.set(block.id, normalized(block));
      }
      this.scenarios.set(scenario.id, scenario);
    } catch (error) { this.scenarios.clear(); previousScenarios.forEach((value, key) => this.scenarios.set(key, value)); this.blocks.clear(); previousBlocks.forEach((value, key) => this.blocks.set(key, value)); throw error; }
  }

  async deleteBlockingScenarioAtomically(scenarioId: string, sourceSignature: string) {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) throw new Error('Blocking Scenario not found.');
    const owned = [...this.blocks.values()].filter((block) => block.blockingScenarioId === scenarioId);
    assertBlockingScenarioSourceUnchanged(scenario, owned, sourceSignature);
    const impact = calculateBlockingScenarioDeletionImpact(scenario, owned);
    this.scenarios.delete(scenarioId); owned.forEach((block) => this.blocks.delete(block.id));
    return impact;
  }

  async listBlockingBlocks(blockingScenarioId: string, serviceDayId?: string): Promise<BlockingBlock[]> { return [...this.blocks.values()].filter((block) => block.blockingScenarioId === blockingScenarioId && (!serviceDayId || block.serviceDayId === serviceDayId)); }
  async getBlockingBlock(id: string): Promise<BlockingBlock | undefined> { const block = this.blocks.get(id); return block ? normalized(block) : undefined; }
  async saveBlockingBlocksAtomically(blocks: BlockingBlock[], sourceSignature: string, blockingScenarioId?: string): Promise<void> {
    const scenarioId = blockingScenarioId ?? blocks[0]?.blockingScenarioId;
    if (!scenarioId || blocks.some((block) => block.blockingScenarioId !== scenarioId)) throw new Error('A Block write must target one Blocking Scenario.');
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) throw new Error('Blocking Scenario not found.');
    assertBlockingScenarioSourceUnchanged(scenario, [...this.blocks.values()].filter((block) => block.blockingScenarioId === scenarioId), sourceSignature);
    const previous = new Map(this.blocks);
    try {
      const incomingIds = new Set(blocks.map((block) => block.id));
      for (const [id, existing] of this.blocks) if (existing.blockingScenarioId === scenarioId && !incomingIds.has(id)) this.blocks.delete(id);
      blocks.forEach((block) => { if (block.scenarioId !== scenario.scenarioId) throw new Error(`Block ${block.id} is outside the Scenario boundary.`); this.blocks.set(block.id, normalized(block)); });
    }
    catch (error) { this.blocks.clear(); previous.forEach((value, key) => this.blocks.set(key, value)); throw error; }
  }
}

/** Dexie implementation with IndexedDB transaction boundaries. */
export class DexieBlockingRepository implements BlockingRepository {
  constructor(readonly db = new TransitDatabase()) {}

  async listBlockingScenarios(scenarioId: string): Promise<BlockingScenario[]> { return this.db.blockingScenarios.where('scenarioId').equals(scenarioId).toArray(); }
  async getBlockingScenario(id: string): Promise<BlockingScenario | undefined> { return this.db.blockingScenarios.get(id); }
  async saveBlockingScenario(scenario: BlockingScenario): Promise<void> {
    const existing = await this.db.blockingScenarios.where('scenarioId').equals(scenario.scenarioId).toArray();
    assertScenarioNameUnique(existing, scenario); await this.db.blockingScenarios.put(scenario);
  }

  async saveBlockingScenarioGraphAtomically(scenario: BlockingScenario, blocks: BlockingBlock[], expectedSourceSignature?: string, sourceBlockingScenarioId?: string): Promise<void> {
    await this.db.transaction('rw', [this.db.blockingScenarios, this.db.blocks], async () => {
      const existing = await this.db.blockingScenarios.where('scenarioId').equals(scenario.scenarioId).toArray();
      const current = await this.db.blockingScenarios.get(scenario.id);
      if (expectedSourceSignature) {
        const source = await this.db.blockingScenarios.get(sourceBlockingScenarioId ?? scenario.id);
        if (!source) throw new Error('Blocking Scenario source not found.');
        assertBlockingScenarioSourceUnchanged(source, await this.db.blocks.where('blockingScenarioId').equals(source.id).toArray() as BlockingBlock[], expectedSourceSignature);
      }
      assertScenarioNameUnique(existing, scenario);
      for (const block of blocks) { if (block.blockingScenarioId !== scenario.id || block.scenarioId !== scenario.scenarioId) throw new Error(`Block ${block.id} is outside the Blocking Scenario ownership boundary.`); }
      await this.db.blockingScenarios.put(scenario); if (blocks.length) await this.db.blocks.bulkPut(blocks.map(normalized) as Block[]);
    });
  }

  async deleteBlockingScenarioAtomically(scenarioId: string, sourceSignature: string) {
    return this.db.transaction('rw', [this.db.blockingScenarios, this.db.blocks], async () => {
      const scenario = await this.db.blockingScenarios.get(scenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
      const owned = await this.db.blocks.where('blockingScenarioId').equals(scenarioId).toArray() as BlockingBlock[];
      assertBlockingScenarioSourceUnchanged(scenario, owned, sourceSignature);
      const impact = calculateBlockingScenarioDeletionImpact(scenario, owned);
      await this.db.blocks.bulkDelete(owned.map((block) => block.id)); await this.db.blockingScenarios.delete(scenarioId); return impact;
    });
  }

  async listBlockingBlocks(blockingScenarioId: string, serviceDayId?: string): Promise<BlockingBlock[]> {
    const blocks = await this.db.blocks.where('blockingScenarioId').equals(blockingScenarioId).toArray();
    return blocks.filter((block) => !serviceDayId || block.serviceDayId === serviceDayId).map(normalized);
  }
  async getBlockingBlock(id: string): Promise<BlockingBlock | undefined> { const block = await this.db.blocks.get(id); return block?.blockingScenarioId ? normalized(block) : undefined; }
  async saveBlockingBlocksAtomically(blocks: BlockingBlock[], sourceSignature: string, blockingScenarioId?: string): Promise<void> {
    const scenarioId = blockingScenarioId ?? blocks[0]?.blockingScenarioId; if (!scenarioId || blocks.some((block) => block.blockingScenarioId !== scenarioId)) throw new Error('A Block write must target one Blocking Scenario.');
    await this.db.transaction('rw', [this.db.blockingScenarios, this.db.blocks], async () => {
      const scenario = await this.db.blockingScenarios.get(scenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
      const existing = await this.db.blocks.where('blockingScenarioId').equals(scenarioId).toArray() as BlockingBlock[];
      assertBlockingScenarioSourceUnchanged(scenario, existing, sourceSignature);
      for (const block of blocks) { if (block.scenarioId !== scenario.scenarioId) throw new Error(`Block ${block.id} is outside the Scenario boundary.`); }
      const incomingIds = new Set(blocks.map((block) => block.id));
      const removed = existing.filter((block) => !incomingIds.has(block.id));
      if (removed.length) await this.db.blocks.bulkDelete(removed.map((block) => block.id));
      if (blocks.length) await this.db.blocks.bulkPut(blocks.map(normalized) as Block[]);
    });
  }
}
