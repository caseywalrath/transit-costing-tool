import { describe, expect, it, vi } from 'vitest';
import { BLOCKING_COVERAGE, PLANNED_FREQUENCY_COVERAGE, ROUTE_DEFINITION_COVERAGE, TRIP_GENERATION_COVERAGE, touchesService, withRestorePoints, type Coverage, type RestorePointLookup } from './restorePointCoverage';
import { BlockingApplicationService } from './blockingService';
import { PlannedFrequencyService } from './plannedFrequencyService';
import { RouteDefinitionService } from './routeDefinitionService';
import { TripGenerationService } from './tripGenerationService';
import type { RestorePointRecorder, ScenarioChangeRequest } from './ports';
import { isQuotaExceeded, SaveStatusPublisher } from './saveStatus';
import type { RecordChange } from '../domain/types';

type Call = { type: 'scenario'; request: ScenarioChangeRequest } | { type: 'project'; projectId: string };

class FakeRecorder implements RestorePointRecorder {
  calls: Call[] = [];
  async recordScenarioChange<T>(request: ScenarioChangeRequest, write: () => Promise<T>): Promise<T> {
    this.calls.push({ type: 'scenario', request });
    return write();
  }
  async recordProjectDeletion<T>(projectId: string, write: () => Promise<T>): Promise<T> {
    this.calls.push({ type: 'project', projectId });
    return write();
  }
}

const trip = { scenarioId: 's1', routeId: 'r1', serviceDayId: 'd1', tripProfileId: 'tp1' };
const block = { scenarioId: 's1', serviceDayId: 'd1', activities: [{ id: 'a1', type: 'pullOut' }, { id: 'a2', type: 'deadhead' }, { id: 'a3', type: 'deadhead' }] };
const rows = {
  trips: { t1: trip },
  tripProfiles: { tp1: { scenarioId: 's1' } },
  runtimeProfiles: { rp1: { scenarioId: 's1', routeId: 'r1', patternId: 'p1' } },
  patterns: { p1: { scenarioId: 's1', routeId: 'r1' } },
  routes: { r1: { scenarioId: 's1' } },
  blockingScenarios: { bs1: { scenarioId: 's1', tripProfileId: 'tp1' } },
  blocks: { b1: block },
  scenarios: { s2: { name: 'Other scenario' } },
  previews: {
    'pattern-token': { scenarioId: 's1', routeId: 'r1', kind: 'pattern' as const, patternId: 'p1' },
    'nodes-token': { scenarioId: 's1', routeId: 'r1', kind: 'nodes' as const },
  },
};
const lookup: RestorePointLookup = {
  getTrip: async (id) => (rows.trips as Record<string, typeof trip>)[id],
  getTripProfile: async (id) => (rows.tripProfiles as Record<string, { scenarioId: string }>)[id],
  getRuntimeProfile: async (id) => (rows.runtimeProfiles as Record<string, { scenarioId: string; routeId: string; patternId: string }>)[id],
  getPattern: async (id) => (rows.patterns as Record<string, { scenarioId: string; routeId: string }>)[id],
  getRoute: async (id) => (rows.routes as Record<string, { scenarioId: string }>)[id],
  getBlockingScenario: async (id) => (rows.blockingScenarios as Record<string, { scenarioId: string; tripProfileId: string }>)[id],
  getBlock: async (id) => (rows.blocks as Record<string, typeof block>)[id],
  getScenario: async (id) => (rows.scenarios as Record<string, { name: string }>)[id],
  routeEditPreviewScope: (token) => (rows.previews as Record<string, { scenarioId: string; routeId: string; kind: 'pattern' | 'nodes'; patternId?: string }>)[token],
};

function harness(coverage: Coverage) {
  const recorder = new FakeRecorder();
  const store = { keepNewest: vi.fn(async (_count: number) => undefined) };
  const publisher = new SaveStatusPublisher(() => '2026-11-18T00:00:00.000Z');
  const service = Object.fromEntries(Object.keys(coverage).map((key) => [key, vi.fn(async (..._args: unknown[]) => `ran ${key}`)]));
  const wrapped = withRestorePoints(service, coverage, recorder, store, publisher, lookup) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  return { recorder, store, wrapped };
}

describe('coverage names', () => {
  it('every coverage key is a method of its service', () => {
    const pairs: Array<[Coverage, object]> = [
      [ROUTE_DEFINITION_COVERAGE, RouteDefinitionService.prototype],
      [TRIP_GENERATION_COVERAGE, TripGenerationService.prototype],
      [BLOCKING_COVERAGE, BlockingApplicationService.prototype],
      [PLANNED_FREQUENCY_COVERAGE, PlannedFrequencyService.prototype],
    ];
    for (const [coverage, prototype] of pairs) {
      for (const key of Object.keys(coverage)) expect(typeof (prototype as Record<string, unknown>)[key]).toBe('function');
    }
  });
});

const keepFn = expect.any(Function);
const trips = (...ids: string[]) => ids;

describe('each covered command requests its restore point', () => {
  const coverage: Coverage = { ...ROUTE_DEFINITION_COVERAGE, ...TRIP_GENERATION_COVERAGE, ...BLOCKING_COVERAGE, ...PLANNED_FREQUENCY_COVERAGE };
  const cases: Array<[string, unknown[], Call[] | 'none', Record<string, unknown> | undefined]> = [
    ['deleteProject', ['proj1'], [{ type: 'project', projectId: 'proj1' }], undefined],
    ['deleteScenario', ['s1'], [{ type: 'scenario', request: { kind: 'deleteScenario', scenarioId: 's1' } as ScenarioChangeRequest }], undefined],
    ['deleteRoute', ['r1'], [{ type: 'scenario', request: { kind: 'deleteRoute', scenarioId: 's1', refs: { routeId: 'r1' } } as ScenarioChangeRequest }], undefined],
    ['deletePattern', ['p1'], [{ type: 'scenario', request: { kind: 'deletePattern', scenarioId: 's1', refs: { routeId: 'r1', patternId: 'p1' } } as ScenarioChangeRequest }], undefined],
    ['commitPatternChange', ['pattern-token', 'rebalance'], [{ type: 'scenario', request: { kind: 'rebalancePattern', scenarioId: 's1', refs: { routeId: 'r1', patternId: 'p1' }, keep: keepFn } as unknown as ScenarioChangeRequest }], undefined],
    ['commitPatternChange', ['no-such-token', 'rebalance'], 'none', undefined],
    ['commitNodeChanges', ['nodes-token'], [{ type: 'scenario', request: { kind: 'deleteNodes', scenarioId: 's1', refs: { routeId: 'r1' }, keep: keepFn } as unknown as ScenarioChangeRequest }], undefined],
    ['deleteRuntimeProfile', ['rp1'], [{ type: 'scenario', request: { kind: 'deleteRuntimeProfile', scenarioId: 's1', refs: { routeId: 'r1', patternId: 'p1', runtimeProfileId: 'rp1' } } as ScenarioChangeRequest }], undefined],
    ['deleteTrips', [trips('t1', 't2', 't1')], [{ type: 'scenario', request: { kind: 'deleteTrips', scenarioId: 's1', quantity: 2, refs: { routeId: 'r1', serviceDayId: 'd1', tripProfileId: 'tp1' } } as ScenarioChangeRequest }], undefined],
    ['applyTripCopy', [{ request: { scenarioId: 's1', routeId: 'r1', tripProfileId: 'tp1', sourceServiceDayId: 'd0', targetServiceDayId: 'd1' } }], [{ type: 'scenario', request: { kind: 'copyTripsFromDay', scenarioId: 's1', refs: { routeId: 'r1', tripProfileId: 'tp1', serviceDayId: 'd1', sourceServiceDayId: 'd0' } } as ScenarioChangeRequest }], undefined],
    ['deleteTripProfile', ['tp1'], [{ type: 'scenario', request: { kind: 'deleteTripProfile', scenarioId: 's1', refs: { tripProfileId: 'tp1' } } as ScenarioChangeRequest }], undefined],
    ['deleteBlockingScenario', ['bs1'], [{ type: 'scenario', request: { kind: 'deleteBlockingScenario', scenarioId: 's1', refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1' } } as ScenarioChangeRequest }], undefined],
    ['deleteBlock', ['bs1', 'b1'], [{ type: 'scenario', request: { kind: 'deleteBlocks', scenarioId: 's1', quantity: 1, refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', serviceDayId: 'd1' } } as ScenarioChangeRequest }], undefined],
    ['deleteBlocks', ['bs1', ['b1', 'b2']], [{ type: 'scenario', request: { kind: 'deleteBlocks', scenarioId: 's1', quantity: 2, refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', serviceDayId: 'd1' } } as ScenarioChangeRequest }], undefined],
    ['applyBlockingDayCopy', [{ preview: { request: { blockingScenarioId: 'bs1', sourceServiceDayId: 'd0', targetServiceDayId: 'd1' } } }], [{ type: 'scenario', request: { kind: 'copyBlocksFromDay', scenarioId: 's1', refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', serviceDayId: 'd1', sourceServiceDayId: 'd0' } } as ScenarioChangeRequest }], undefined],
    ['createAutoBlockingScenario', [{ replaceBlockingScenarioId: 'bs1' }], [{ type: 'scenario', request: { kind: 'rebuildAutoBlocks', scenarioId: 's1', refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1' } } as ScenarioChangeRequest }], undefined],
    ['createAutoBlockingScenario', [{}], 'none', undefined],
    ['applyBulkBoundaryActivities', [{ blockingScenarioId: 'bs1', serviceDayId: 'd1', activity: { type: 'pullOut' } }], [{ type: 'scenario', request: { kind: 'replaceBoundaryActivities', scenarioId: 's1', detail: 'pullOut', refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', serviceDayId: 'd1' } } as ScenarioChangeRequest }], undefined],
    ['removeTrip', ['bs1', 'd1', 't1'], [{ type: 'scenario', request: { kind: 'unassignTrips', scenarioId: 's1', quantity: 1, refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', serviceDayId: 'd1' } } as ScenarioChangeRequest }], undefined],
    ['removeTrips', ['bs1', 'd1', ['t1', 't2']], [{ type: 'scenario', request: { kind: 'unassignTrips', scenarioId: 's1', quantity: 2, refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', serviceDayId: 'd1' } } as ScenarioChangeRequest }], undefined],
    ['reassignTrips', [{ blockingScenarioId: 'bs1', serviceDayId: 'd1', tripIds: ['t1', 't2'], destinationBlockId: 'b1' }], [{ type: 'scenario', request: { kind: 'moveTripsToBlock', scenarioId: 's1', quantity: 2, refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', serviceDayId: 'd1', blockId: 'b1' } } as ScenarioChangeRequest }], undefined],
    ['assignTripsToBlock', [{ blockingScenarioId: 'bs1', serviceDayId: 'd1', tripIds: ['t1', 't2'], destinationBlockId: 'b1' }], [{ type: 'scenario', request: { kind: 'moveTripsToBlock', scenarioId: 's1', quantity: 2, refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', serviceDayId: 'd1', blockId: 'b1' }, keep: keepFn } as unknown as ScenarioChangeRequest }], undefined],
    ['removeBoundaryActivity', ['bs1', 'b1', 'a1'], [{ type: 'scenario', request: { kind: 'removeBlockActivity', scenarioId: 's1', detail: 'pullOut', refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', blockId: 'b1', serviceDayId: 'd1' } } as ScenarioChangeRequest }], undefined],
    ['removeDeadheads', ['bs1', 'b1', ['a2', 'a3']], [{ type: 'scenario', request: { kind: 'deleteDeadheads', scenarioId: 's1', quantity: 2, refs: { tripProfileId: 'tp1', blockingScenarioId: 'bs1', blockId: 'b1', serviceDayId: 'd1' } } as ScenarioChangeRequest }], undefined],
    ['clearPlan', ['r1', 'd1'], [{ type: 'scenario', request: { kind: 'clearPlan', scenarioId: 's1', refs: { routeId: 'r1', serviceDayId: 'd1' } } as ScenarioChangeRequest }], undefined],
    ['applyCopyFromDay', [{ scenarioId: 's1', routeId: 'r1', sourceServiceDayId: 'd0', targetServiceDayId: 'd1' }], [{ type: 'scenario', request: { kind: 'copyPlanFromDay', scenarioId: 's1', refs: { routeId: 'r1', serviceDayId: 'd1', sourceServiceDayId: 'd0' } } as ScenarioChangeRequest }], undefined],
    ['applyCopyFromScenario', [{ scenarioId: 's1', sourceScenarioId: 's2', targetRouteId: 'r1' }], [{ type: 'scenario', request: { kind: 'copyPlansFromScenario', scenarioId: 's1', refs: { routeId: 'r1' }, extraNames: { sourceScenario: 'Other scenario' } } as ScenarioChangeRequest }], undefined],
  ];

  it.each(cases)('%s with %j', async (key, args, expected) => {
    const { recorder, wrapped } = harness(coverage);
    const result = await wrapped[key](...args);
    expect(result).toBe(`ran ${key}`);
    if (expected === 'none') expect(recorder.calls).toEqual([]);
    else expect(recorder.calls).toEqual(expected);
  });
});

describe('withRestorePoints', () => {
  it('runs a method that is not covered without the recorder and keeps this', async () => {
    class Service { value = 7; async plain() { return this.value; } }
    const recorder = new FakeRecorder();
    const wrapped = withRestorePoints(new Service(), {}, recorder, { keepNewest: async () => undefined }, new SaveStatusPublisher(), lookup);
    await expect(wrapped.plain()).resolves.toBe(7);
    expect(recorder.calls).toEqual([]);
  });

  it('publishes saving once and saved once for one covered call whose method runs its own publisher.run', async () => {
    const publisher = new SaveStatusPublisher(() => '2026-11-18T00:00:00.000Z');
    const states: string[] = [];
    publisher.subscribeToSaveStatus((status) => states.push(status.state));
    const service = { deleteRoute: async (_routeId: string) => publisher.run(async () => 'done') };
    const wrapped = withRestorePoints(service, ROUTE_DEFINITION_COVERAGE, new FakeRecorder(), { keepNewest: async () => undefined }, publisher, lookup);
    await wrapped.deleteRoute('r1');
    expect(states.filter((state) => state === 'saving').length).toBeGreaterThanOrEqual(1);
    expect(states.filter((state) => state === 'saved')).toHaveLength(1);
  });

  it('keeps the newest 5 restore points when a covered write fails for lack of storage, and rethrows', async () => {
    const store = { keepNewest: vi.fn(async (_count: number) => undefined) };
    const service = { deleteRoute: async (_routeId: string) => { throw { name: 'QuotaExceededError' }; } };
    const wrapped = withRestorePoints(service, ROUTE_DEFINITION_COVERAGE, new FakeRecorder(), store, new SaveStatusPublisher(), lookup);
    let caught: unknown;
    try { await wrapped.deleteRoute('r1'); } catch (error) { caught = error; }
    expect(isQuotaExceeded(caught)).toBe(true);
    expect(store.keepNewest).toHaveBeenCalledTimes(1);
    expect(store.keepNewest).toHaveBeenCalledWith(5);
  });
});

describe('touchesService', () => {
  it('is true for a change that removes a trip and false for one that changes only a pattern', () => {
    const removesTrip: RecordChange = { removed: { trips: [{ id: 't1' }] } as RecordChange['removed'], changedBefore: {}, added: {}, writtenStamps: {} };
    const changesPattern: RecordChange = { removed: {}, changedBefore: { patterns: [{ id: 'p1' }] } as RecordChange['changedBefore'], added: {}, writtenStamps: {} };
    expect(touchesService(removesTrip)).toBe(true);
    expect(touchesService(changesPattern)).toBe(false);
  });
});
