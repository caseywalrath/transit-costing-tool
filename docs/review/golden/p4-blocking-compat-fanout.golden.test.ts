// Backs finding R5-04 (UI issues one classifyInsertion per unassigned Trip; each call re-reads every Trip and Pattern of the scenario).
// Run: pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p4-blocking-compat-fanout.golden.test.ts
// Defect test (it.fails): expected behaviour is a bounded number of context reads for classifying N candidate Trips.
import { describe, expect, it } from 'vitest';
import { metadata } from '../../../src/domain/ids';
import type { RoutePattern, Trip } from '../../../src/domain/types';
import { BlockingApplicationService } from '../../../src/application/blockingService';
import { InMemoryBlockingRepository } from '../../../src/persistence/blockingRepository';

const pattern: RoutePattern = { id: 'p', scenarioId: 's', routeId: 'r', name: 'A-B', points: [{ id: 'a', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'B', sequence: 1, cumulativeMiles: 1 }], ...metadata() };
const mk = (i: number): Trip => ({ id: `t${i}`, scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId: 'p', tripProfileId: 'tp', stopTimes: [{ patternPointId: 'a', sequence: 0, time: 21600 + i * 600 }, { patternPointId: 'b', sequence: 1, time: 22200 + i * 600 }], provenance: { kind: 'manual', manuallyChangedFields: [] }, ...metadata() });

describe('Blocking compatibility fan-out (R5-04)', () => {
  it.fails('classifying 250 candidate Trips performs a bounded number of full Trip-list reads', async () => {
    const trips = Array.from({ length: 250 }, (_, i) => mk(i));
    const bs = { id: 'bs', scenarioId: 's', tripProfileId: 'tp', name: 'B', ...metadata() };
    const blk = { id: 'blk', scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'wk', label: '1', activities: [], ...metadata() };
    let listTripsCalls = 0; let listPatternsCalls = 0;
    const service = new BlockingApplicationService(new InMemoryBlockingRepository([bs], [blk]), {
      getTrip: async (id) => trips.find((t) => t.id === id),
      listTrips: async () => { listTripsCalls += 1; return trips; },
      getTripProfile: async () => undefined,
      listPatterns: async () => { listPatternsCalls += 1; return [pattern]; },
    });
    // This is exactly what BlockingWorkspace.tsx:197-200 does: one call per unassigned Trip.
    await Promise.all(trips.map((t) => service.classifyInsertion('bs', 'blk', t.id)));
    expect(listTripsCalls).toBeLessThanOrEqual(1);
    expect(listPatternsCalls).toBeLessThanOrEqual(1);
  });
});
