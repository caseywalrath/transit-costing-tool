// Regression test on the Golden (Federal BRT) backup: with rules read from the hand-built Blocks, automatic blocking
// reproduces the hand-built block count and revenue time on every service day (Decision 0056).
import { describe, expect, it } from 'vitest';
import { goldenRaw } from '../testSupport/goldenBackup';
import { buildAutoBlocks, defaultAutoBlockingRules, measureBuiltBlocks, type AutoBlockingContext } from './autoBlocking';

describe('buildAutoBlocks on the Golden backup (Decision 0056)', () => {
  const backup = goldenRaw();
  const blockingScenario = backup.blockingScenarios.find((candidate: any) => backup.blocks.some((block: any) => block.blockingScenarioId === candidate.id));
  const builtBlocks = backup.blocks.filter((block: any) => block.blockingScenarioId === blockingScenario.id);
  const trips = backup.trips.filter((trip: any) => trip.scenarioId === blockingScenario.scenarioId && trip.tripProfileId === blockingScenario.tripProfileId);
  const routeIds = new Set(trips.map((trip: any) => trip.routeId));
  const context: AutoBlockingContext = {
    scenarioId: blockingScenario.scenarioId,
    routes: backup.routes.filter((route: any) => routeIds.has(route.id)),
    patterns: backup.patterns.filter((pattern: any) => routeIds.has(pattern.routeId)),
    nodes: backup.nodes, directions: backup.directions ?? [], serviceDays: backup.serviceDays, trips,
  };
  const rules = measureBuiltBlocks({ source: { ...context, blocks: builtBlocks }, target: context, targetRules: defaultAutoBlockingRules(context, blockingScenario.tripProfileId) }).rules;
  const result = buildAutoBlocks({ ...context, blockingScenario: { ...blockingScenario, id: 'golden-auto' }, rules, now: '2026-11-04T00:00:00.000Z' });

  const tripById = new Map(trips.map((trip: any) => [trip.id, trip]));
  const times = (tripId: string) => [...(tripById.get(tripId) as any).stopTimes].sort((left: any, right: any) => left.sequence - right.sequence).map((stop: any) => stop.time as number);
  /** Sum over the day's built Blocks of last revenue arrival minus first revenue departure. */
  const builtRevenueSeconds = (serviceDayId: string) => builtBlocks.filter((block: any) => block.serviceDayId === serviceDayId).reduce((sum: number, block: any) => {
    const ids = block.activities.filter((activity: any) => activity.type === 'revenueTrip').map((activity: any) => activity.tripId as string);
    return ids.length ? sum + times(ids.at(-1)).at(-1)! - times(ids[0])[0] : sum;
  }, 0);

  it('uses the Workbook Blocks and covers every service day with Trips', () => {
    expect(blockingScenario.name).toBe('Workbook Blocks');
    expect(result.days.map((day) => day.serviceDayId).sort()).toEqual([...new Set(builtBlocks.map((block: any) => block.serviceDayId as string))].sort());
    expect(result.days).toHaveLength(4);
  });

  for (const serviceDay of backup.serviceDays) {
    it(`${serviceDay.name}: matches the hand-built block count and revenue time`, () => {
      const summary = result.days.find((day) => day.serviceDayId === serviceDay.id);
      expect(summary).toBeDefined();
      expect(summary!.blockCount).toBe(builtBlocks.filter((block: any) => block.serviceDayId === serviceDay.id).length);
      expect(summary!.revenueSeconds).toBe(builtRevenueSeconds(serviceDay.id));
    });
  }
});
