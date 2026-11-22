// Test support for the comparison service: in-memory sources over plain records, the worked example and the Federal BRT golden backup as
// records, a copy of a Scenario, and a direct Costing estimate for the equality tests. Tests only; nothing here is imported by the app.

import { baselineSide, proposedSide, type ExampleSide } from '../../domain/compare/compareFixture';
import type { CostingAssumptionsInput } from '../../domain/costing';
import type { BlockingBlock, BlockingScenario, CostingAssumptions, Route, RouteDirection, RoutePattern, Scenario, ServiceDayDefinition, Trip, TripProfile } from '../../domain/types';
import { goldenRaw } from '../../testSupport/goldenBackup';
import { createCostingContextQueries } from '../costingContext';
import { CostingApplicationService } from '../costingService';
import type { CostBasis } from '../ports';
import type { CompareSources } from './compareService';

export interface TestRecords {
  scenarios: Scenario[];
  serviceDays: ServiceDayDefinition[];
  routes: Route[];
  tripProfiles: TripProfile[];
  blockingScenarios: BlockingScenario[];
  blocks: BlockingBlock[];
  trips: Trip[];
  patterns: RoutePattern[];
  directions: RouteDirection[];
  costingAssumptions: CostingAssumptions[];
}

const STAMP = { createdAt: '2026-11-22T00:00:00.000Z', updatedAt: '2026-11-22T00:00:00.000Z' };

/** How many times each expensive read ran, so a test can see what was and was not read again. */
export interface ReadCounts { listTrips: number; listBlockingBlocks: number }

export function memorySources(records: TestRecords, counts: ReadCounts = { listTrips: 0, listBlockingBlocks: 0 }): CompareSources {
  return {
    getScenario: async (id) => records.scenarios.find((item) => item.id === id),
    listServiceDays: async (scenarioId) => records.serviceDays.filter((item) => item.scenarioId === scenarioId),
    listBlockingScenarios: async (scenarioId) => records.blockingScenarios.filter((item) => item.scenarioId === scenarioId),
    listTripProfiles: async (scenarioId) => records.tripProfiles.filter((item) => item.scenarioId === scenarioId),
    getTripProfile: async (id) => records.tripProfiles.find((item) => item.id === id),
    listTrips: async (scenarioId, tripProfileId) => { counts.listTrips += 1; return records.trips.filter((item) => item.scenarioId === scenarioId && item.tripProfileId === tripProfileId); },
    listPatterns: async (scenarioId) => records.patterns.filter((item) => item.scenarioId === scenarioId),
    listBlockingBlocks: async (id) => { counts.listBlockingBlocks += 1; return records.blocks.filter((item) => item.blockingScenarioId === id); },
    listRoutes: async (scenarioId) => records.routes.filter((item) => item.scenarioId === scenarioId),
    listDirections: async (scenarioId) => records.directions.filter((item) => item.scenarioId === scenarioId),
    getCostingAssumptions: async (scenarioId) => records.costingAssumptions.find((item) => item.scenarioId === scenarioId),
  };
}

/** Saved assumptions of a Scenario: $100 per revenue hour, first service year 2027, no future years, and typed layover and deadhead factors. */
export function assumptionsRecord(scenarioId: string, tripProfileId: string, overrides: Partial<CostingAssumptions> = {}): CostingAssumptions {
  return {
    id: `assumptions-${scenarioId}`, scenarioId, currencyCode: 'USD', enteredRate: 100, rateYear: 2027, sourceType: 'user', baseServiceYear: 2027, futureYearCount: 0, annualEscalation: 0.03,
    tripProfileEstimateFactors: [{ tripProfileId, factors: { allDays: { layoverFraction: 0.182, deadheadFraction: 0.056 }, serviceDays: [] } }],
    ...STAMP, ...overrides,
  };
}

/**
 * The example's Blocks have no deadhead between two Trips that end and start at different nodes (the proposed R1 now ends at F), which Costing
 * rightly treats as an incomplete connection. A one-minute deadhead is added there so that Costing can cost the Block. The Block's pull-out and
 * pull-in times, and so its peak interval, do not change.
 */
function withDeadheads(side: ExampleSide): BlockingBlock[] {
  const pattern = (tripId: string) => side.patterns.find((candidate) => candidate.id === side.trips.find((trip) => trip.id === tripId)!.patternId)!;
  return side.blocks.map((block) => {
    const ordered = [...block.activities].sort((left, right) => left.sequence - right.sequence);
    const activities: BlockingBlock['activities'] = [];
    ordered.forEach((activity, index) => {
      activities.push(activity);
      const next = ordered[index + 1];
      if (activity.type !== 'revenueTrip' || next?.type !== 'revenueTrip') return;
      const from = pattern(activity.tripId).points.at(-1)!.nodeId;
      const to = pattern(next.tripId).points[0].nodeId;
      if (from !== to) activities.push({ id: `${block.id}-dh-${index}`, type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: 1, fromNodeId: from, toNodeId: to });
    });
    return { ...block, activities: activities.map((activity, index) => ({ ...activity, sequence: index })) };
  });
}

function exampleScenarioRecords(side: ExampleSide, scenarioId: string, blockingScenarioId: string): TestRecords {
  const tripProfileId = `profile-${scenarioId}`;
  return {
    scenarios: [{ id: scenarioId, projectId: 'project', name: scenarioId, ...STAMP }],
    serviceDays: side.serviceDays,
    routes: side.routes,
    tripProfiles: [{ id: tripProfileId, scenarioId, name: 'Default', ...STAMP }],
    blockingScenarios: [{ id: blockingScenarioId, scenarioId, tripProfileId, name: blockingScenarioId, ...STAMP }],
    blocks: withDeadheads(side),
    trips: side.trips.map((trip) => ({ ...trip, tripProfileId })),
    patterns: side.patterns,
    directions: side.directions,
    costingAssumptions: [assumptionsRecord(scenarioId, tripProfileId)],
  };
}

const concat = (parts: TestRecords[]): TestRecords => ({
  scenarios: parts.flatMap((part) => part.scenarios),
  serviceDays: parts.flatMap((part) => part.serviceDays),
  routes: parts.flatMap((part) => part.routes),
  tripProfiles: parts.flatMap((part) => part.tripProfiles),
  blockingScenarios: parts.flatMap((part) => part.blockingScenarios),
  blocks: parts.flatMap((part) => part.blocks),
  trips: parts.flatMap((part) => part.trips),
  patterns: parts.flatMap((part) => part.patterns),
  directions: parts.flatMap((part) => part.directions),
  costingAssumptions: parts.flatMap((part) => part.costingAssumptions),
});

/** The worked example of Decision 0091 as stored records: Scenarios `scn-existing` (Baseline) and `scn-redesign` (Proposed). */
export function exampleRecords(): TestRecords {
  return concat([
    exampleScenarioRecords(baselineSide(), 'scn-existing', 'base-blocks'),
    exampleScenarioRecords(proposedSide(), 'scn-redesign', 'draft-blocks'),
  ]);
}

export const EXAMPLE = {
  baseline: { scenarioId: 'scn-existing', tripProfileId: 'profile-scn-existing', blockingScenarioId: 'base-blocks' as string | null },
  proposed: { scenarioId: 'scn-redesign', tripProfileId: 'profile-scn-redesign', blockingScenarioId: 'draft-blocks' as string | null },
};

/** The Federal BRT golden backup as stored records, with $100 assumptions and typed factors (the backup stores none). */
export function goldenRecords(): TestRecords {
  const backup = goldenRaw();
  const scenario: Scenario = backup.scenarios[0];
  const profile: TripProfile = backup.tripProfiles[0];
  return {
    scenarios: backup.scenarios,
    serviceDays: backup.serviceDays,
    routes: backup.routes,
    tripProfiles: backup.tripProfiles,
    blockingScenarios: backup.blockingScenarios,
    blocks: backup.blocks,
    trips: backup.trips,
    patterns: backup.patterns,
    directions: backup.directions,
    costingAssumptions: [assumptionsRecord(scenario.id, profile.id, { rateYear: 2024, baseServiceYear: 2026, futureYearCount: 2, sourceType: 'ntd' })],
  };
}

export function goldenSide(records: TestRecords, scenarioId = records.scenarios[0].id, blocked = true) {
  const profile = records.tripProfiles.find((item) => item.scenarioId === scenarioId)!;
  const blocking = records.blockingScenarios.find((item) => item.scenarioId === scenarioId && item.tripProfileId === profile.id)!;
  return { scenarioId, tripProfileId: profile.id, blockingScenarioId: blocked ? blocking.id : null };
}

/**
 * Adds a copy of a Scenario's records under `toId`: the same record IDs (they only have to be unique within a Scenario), retagged. `change`
 * edits the copy's records before they are added. The Scenario's saved assumptions are copied too.
 */
export function withScenarioCopy(records: TestRecords, fromId: string, toId: string, change?: (copy: TestRecords) => void): TestRecords {
  const retag = <T extends { scenarioId: string }>(items: T[]): T[] => items.filter((item) => item.scenarioId === fromId).map((item) => ({ ...item, scenarioId: toId }));
  const copy: TestRecords = {
    scenarios: records.scenarios.filter((item) => item.id === fromId).map((item) => ({ ...item, id: toId, name: `${item.name} copy` })),
    serviceDays: retag(records.serviceDays),
    routes: retag(records.routes),
    // Trip profiles and Blocking scenarios are looked up by ID alone, so their IDs are new; everything else is read by Scenario.
    tripProfiles: retag(records.tripProfiles).map((item) => ({ ...item, id: `${item.id}@${toId}` })),
    blockingScenarios: retag(records.blockingScenarios).map((item) => ({ ...item, id: `${item.id}@${toId}`, tripProfileId: `${item.tripProfileId}@${toId}` })),
    blocks: retag(records.blocks).map((item) => ({ ...item, blockingScenarioId: `${item.blockingScenarioId}@${toId}` })),
    trips: retag(records.trips).map((item) => ({ ...item, tripProfileId: `${item.tripProfileId}@${toId}` })),
    patterns: retag(records.patterns),
    directions: retag(records.directions),
    costingAssumptions: retag(records.costingAssumptions).map((item) => ({
      ...item,
      id: `${item.id}-copy`,
      ...(item.tripProfileEstimateFactors ? { tripProfileEstimateFactors: item.tripProfileEstimateFactors.map((entry) => ({ ...entry, tripProfileId: `${entry.tripProfileId}@${toId}` })) } : {}),
    })),
  };
  change?.(copy);
  return concat([records, copy]);
}

/** A direct Costing estimate of one Scenario, the way the Costing tab asks for it: `CostingApplicationService.calculateEstimate`. */
export async function directEstimate(records: TestRecords, scenarioId: string, basis: CostBasis, assumptions: CostingAssumptionsInput) {
  const service = new CostingApplicationService(createCostingContextQueries(memorySources(records)));
  const result = await service.calculateEstimate({ scenarioId, basis, assumptions });
  if (!result) throw new Error('Costing returned no result.');
  return result;
}
