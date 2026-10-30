import { describe, expect, it } from 'vitest';
import { summarizeBlock } from '../domain/blocking';
import { metadata } from '../domain/ids';
import type { BlockingBlock, BlockingScenario, RoutePattern, Scenario, ServiceDayDefinition, Trip, TripProfile } from '../domain/types';
import { InMemoryBlockingRepository } from '../persistence/blockingRepository';
import { BlockingApplicationService } from './blockingService';
import { createCostingContextQueries } from './costingContext';
import type { CostingContextSources } from './ports';

// Two Scenarios, each with two Trip Profiles, one Route with one Pattern, and a Blocking Scenario on each Trip Profile. The data of one
// Scenario or Trip Profile must never reach the context of another (review issue I-080, finding 4-023).
const stamp = metadata('2026-10-23T00:00:00.000Z');
const scenarioOf = (id: string): Scenario => ({ id, projectId: 'project', name: id, ...stamp });
const dayOf = (scenarioId: string, kind: ServiceDayDefinition['kind'], count: number): ServiceDayDefinition => ({ id: `${scenarioId}-${kind}`, scenarioId, kind, name: kind, annualServiceDays: count, sequence: kind === 'weekday' ? 0 : 1, ...stamp });
const profileOf = (scenarioId: string, name: string): TripProfile => ({ id: `${scenarioId}-${name}`, scenarioId, name, ...stamp });
const patternOf = (scenarioId: string): RoutePattern => ({ id: `${scenarioId}-pattern`, scenarioId, routeId: `${scenarioId}-route`, name: 'A-B', directionId: 'outbound', points: [{ id: `${scenarioId}-a`, nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: `${scenarioId}-b`, nodeId: 'B', sequence: 1, cumulativeMiles: 2 }], ...stamp });
const tripOf = (scenarioId: string, profileId: string, id: string, start: number, serviceDay = 'weekday'): Trip => ({
  id, scenarioId, routeId: `${scenarioId}-route`, serviceDayId: `${scenarioId}-${serviceDay}`, patternId: `${scenarioId}-pattern`, tripProfileId: profileId,
  stopTimes: [{ patternPointId: `${scenarioId}-a`, sequence: 0, time: start }, { patternPointId: `${scenarioId}-b`, sequence: 1, time: start + 1800 }],
  provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...stamp,
});

function world(blocksPerScenario = 2) {
  const scenarios = [scenarioOf('s1'), scenarioOf('s2')];
  const days = scenarios.flatMap((scenario) => [dayOf(scenario.id, 'weekday', 255), dayOf(scenario.id, 'saturday', 52)]);
  const profiles = scenarios.flatMap((scenario) => [profileOf(scenario.id, 'plan-a'), profileOf(scenario.id, 'plan-b')]);
  const patterns = scenarios.map((scenario) => patternOf(scenario.id));
  const trips: Trip[] = [];
  const blocks: BlockingBlock[] = [];
  const blockingScenarios: BlockingScenario[] = profiles.map((profile) => ({ id: `bs-${profile.id}`, scenarioId: profile.scenarioId, tripProfileId: profile.id, name: `Blocks on ${profile.name}`, ...stamp }));
  for (const profile of profiles) {
    const blockingScenarioId = `bs-${profile.id}`;
    for (let index = 0; index < blocksPerScenario; index += 1) {
      const first = tripOf(profile.scenarioId, profile.id, `${profile.id}-t${index}a`, 21600 + index * 7200);
      const second = tripOf(profile.scenarioId, profile.id, `${profile.id}-t${index}b`, 21600 + index * 7200 + 3600);
      trips.push(first, second);
      blocks.push({
        id: `${blockingScenarioId}-block${index}`, scenarioId: profile.scenarioId, blockingScenarioId, serviceDayId: `${profile.scenarioId}-weekday`, label: `${index + 1}`,
        activities: [
          { id: `${blockingScenarioId}-${index}-out`, type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A' },
          { id: `${blockingScenarioId}-${index}-1`, type: 'revenueTrip', sequence: 1, tripId: first.id },
          { id: `${blockingScenarioId}-${index}-2`, type: 'revenueTrip', sequence: 2, tripId: second.id },
          { id: `${blockingScenarioId}-${index}-in`, type: 'pullIn', sequence: 3, minutesAfterLastTrip: 10, fromNodeId: 'B' },
        ], ...stamp,
      });
    }
    trips.push(tripOf(profile.scenarioId, profile.id, `${profile.id}-unassigned`, 50000));
  }
  const reads = { listTrips: 0, listPatterns: 0, listBlockingBlocks: 0 };
  const sources: CostingContextSources = {
    getScenario: async (id) => scenarios.find((item) => item.id === id),
    listServiceDays: async (scenarioId) => days.filter((day) => day.scenarioId === scenarioId),
    listBlockingScenarios: async (scenarioId) => blockingScenarios.filter((item) => item.scenarioId === scenarioId),
    listTripProfiles: async (scenarioId) => profiles.filter((item) => item.scenarioId === scenarioId),
    getTripProfile: async (id) => profiles.find((item) => item.id === id),
    listTrips: async (scenarioId, tripProfileId) => { reads.listTrips += 1; return trips.filter((item) => item.scenarioId === scenarioId && item.tripProfileId === tripProfileId); },
    listPatterns: async (scenarioId) => { reads.listPatterns += 1; return patterns.filter((item) => item.scenarioId === scenarioId); },
    listBlockingBlocks: async (blockingScenarioId) => { reads.listBlockingBlocks += 1; return blocks.filter((item) => item.blockingScenarioId === blockingScenarioId); },
  };
  return { scenarios, days, profiles, patterns, trips, blocks, blockingScenarios, sources, reads };
}

describe('Estimated costing context', () => {
  it('holds the Scenario, its service days, the Trip Profile, and that Profile’s Trips, reading the Trips once', async () => {
    const { sources, reads } = world();
    const context = (await createCostingContextQueries(sources).getEstimatedCostingContext('s1', 's1-plan-b'))!;
    expect(context.scenario.id).toBe('s1');
    expect(context.serviceDays.map((day) => day.id).sort()).toEqual(['s1-saturday', 's1-weekday']);
    expect(context.tripProfile.id).toBe('s1-plan-b');
    expect(context.trips.every((item) => item.scenarioId === 's1' && item.tripProfileId === 's1-plan-b')).toBe(true);
    expect(context.trips).toHaveLength(5);
    expect(reads).toEqual({ listTrips: 1, listPatterns: 0, listBlockingBlocks: 0 });
  });

  it('is undefined for a Trip Profile of another Scenario, an unknown Trip Profile, or an unknown Scenario, and reads no Trips then', async () => {
    const { sources, reads } = world();
    const queries = createCostingContextQueries(sources);
    expect(await queries.getEstimatedCostingContext('s1', 's2-plan-a')).toBeUndefined();
    expect(await queries.getEstimatedCostingContext('s1', 'missing')).toBeUndefined();
    expect(await queries.getEstimatedCostingContext('none', 's1-plan-a')).toBeUndefined();
    expect(reads.listTrips).toBe(0);
  });
});

describe('Costing calculation context', () => {
  it('holds only the selected Blocking Scenario, its Trip Profile, its Trips and Blocks, and its Scenario', async () => {
    const { sources } = world();
    const queries = createCostingContextQueries(sources);
    const context = (await queries.getCostingCalculationContext('s1', 'bs-s1-plan-b'))!;
    expect(context.scenario.id).toBe('s1');
    expect(context.serviceDays.map((day) => day.id).sort()).toEqual(['s1-saturday', 's1-weekday']);
    expect(context.blockingScenario.id).toBe('bs-s1-plan-b');
    expect(context.tripProfile.id).toBe('s1-plan-b');
    expect(context.trips.map((item) => item.id).sort()).toEqual(['s1-plan-b-t0a', 's1-plan-b-t0b', 's1-plan-b-t1a', 's1-plan-b-t1b', 's1-plan-b-unassigned']);
    expect(context.trips.every((item) => item.scenarioId === 's1' && item.tripProfileId === 's1-plan-b')).toBe(true);
    expect(context.blocks.map((block) => block.id).sort()).toEqual(['bs-s1-plan-b-block0', 'bs-s1-plan-b-block1']);
    expect(context.blockSummaries.map((summary) => summary.blockId).sort()).toEqual(context.blocks.map((block) => block.id).sort());
  });

  it('gives each of the four Blocking Scenarios its own data', async () => {
    const { sources, profiles, blockingScenarios } = world();
    const queries = createCostingContextQueries(sources);
    for (const blockingScenario of blockingScenarios) {
      const context = (await queries.getCostingCalculationContext(blockingScenario.scenarioId, blockingScenario.id))!;
      expect(context.tripProfile).toEqual(profiles.find((item) => item.id === blockingScenario.tripProfileId));
      expect(context.trips.every((item) => item.tripProfileId === blockingScenario.tripProfileId && item.scenarioId === blockingScenario.scenarioId)).toBe(true);
      expect(context.blocks.every((block) => block.blockingScenarioId === blockingScenario.id)).toBe(true);
      expect(context.blocks).toHaveLength(2);
    }
  });

  it('summarizes each Block exactly as the Blocking service does for that Block', async () => {
    const { sources, scenarios, trips, patterns, blocks, blockingScenarios } = world();
    const repository = new InMemoryBlockingRepository(blockingScenarios, blocks);
    const blocking = new BlockingApplicationService(repository, {
      getTrip: async (id) => trips.find((item) => item.id === id),
      listTrips: async (scenarioId, tripProfileId) => trips.filter((item) => item.scenarioId === scenarioId && item.tripProfileId === tripProfileId),
      getTripProfile: async () => undefined,
      listPatterns: async (scenarioId) => patterns.filter((item) => item.scenarioId === scenarioId),
    });
    const queries = createCostingContextQueries(sources);
    for (const blockingScenario of blockingScenarios) {
      const context = (await queries.getCostingCalculationContext(blockingScenario.scenarioId, blockingScenario.id))!;
      for (const block of context.blocks) expect(context.blockSummaries.find((summary) => summary.blockId === block.id)).toEqual(await blocking.getBlockSummary(blockingScenario.id, block.id));
    }
    expect(scenarios).toHaveLength(2);
    const context = (await queries.getCostingCalculationContext('s2', 'bs-s2-plan-a'))!;
    const expected = summarizeBlock(context.blocks[0], { scenario: { id: 's2' }, blockingScenario: context.blockingScenario, trips: context.trips, patterns: patterns.filter((item) => item.scenarioId === 's2') });
    expect(context.blockSummaries[0]).toEqual(expected);
    expect(context.blockSummaries[0].revenueHours).toBeGreaterThan(0);
  });

  it('reads the Trips and Patterns once per build, however many Blocks there are', async () => {
    for (const blocksPerScenario of [2, 150]) {
      const { sources, reads } = world(blocksPerScenario);
      const context = (await createCostingContextQueries(sources).getCostingCalculationContext('s2', 'bs-s2-plan-b'))!;
      expect(context.blockSummaries).toHaveLength(blocksPerScenario);
      expect(reads).toEqual({ listTrips: 1, listPatterns: 1, listBlockingBlocks: 1 });
    }
  });

  it('builds nothing for a Blocking Scenario of another Scenario, an unknown one, or one whose Scenario or Trip Profile is gone', async () => {
    const { sources } = world();
    const queries = createCostingContextQueries(sources);
    expect(await queries.getCostingCalculationContext('s1', 'bs-s2-plan-a')).toBeUndefined();
    expect(await queries.getCostingCalculationContext('s1', 'missing')).toBeUndefined();
    expect(await queries.getCostingCalculationContext('missing', 'bs-s1-plan-a')).toBeUndefined();
    expect(await createCostingContextQueries({ ...sources, getTripProfile: async () => undefined }).getCostingCalculationContext('s1', 'bs-s1-plan-a')).toBeUndefined();
    expect(await createCostingContextQueries({ ...sources, getScenario: async () => undefined }).getCostingCalculationContext('s1', 'bs-s1-plan-a')).toBeUndefined();
  });

  it('ignores a Blocking Scenario of another Scenario even if a source returns it', async () => {
    const { sources, blockingScenarios } = world();
    const leaky = createCostingContextQueries({ ...sources, listBlockingScenarios: async () => blockingScenarios });
    expect(await leaky.getCostingCalculationContext('s1', 'bs-s2-plan-a')).toBeUndefined();
    expect((await leaky.getCostingCalculationContext('s1', 'bs-s1-plan-a'))?.blockingScenario.id).toBe('bs-s1-plan-a');
  });

  it('lists the Blocking Scenarios of one Scenario only', async () => {
    const { sources } = world();
    const queries = createCostingContextQueries(sources);
    expect((await queries.listBlockingScenarios('s1')).map((item) => item.id).sort()).toEqual(['bs-s1-plan-a', 'bs-s1-plan-b']);
    expect(await queries.listBlockingScenarios('none')).toEqual([]);
  });
});
