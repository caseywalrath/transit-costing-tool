import { summarizeBlockingScenario } from '../domain/blocking';
import type { CostingCalculationContext } from '../domain/costing';
import type { CostingCalculationContextQueries, CostingContextSources } from './ports';

/**
 * Builds the context of one Costing estimate: the Scenario and its service days, the selected Blocking Scenario with its Trip Profile, Trips,
 * and Blocks, and a summary of every Block (review issues I-044 and I-080, findings 6-002 and 4-023).
 *
 * The Trips and the Patterns are read once, and every Block is summarized from that one read (`summarizeBlockingScenario`). The summaries
 * are the same as summarizing each Block on its own, which re-read every Trip and Pattern once per Block and took about 31 seconds at
 * 400 Blocks and 2,000 Trips. Nothing outside the selected Blocking Scenario's Scenario and Trip Profile reaches the context.
 * Returns `undefined` when the Blocking Scenario does not belong to the Scenario or its Scenario or Trip Profile is gone.
 */
export async function buildCostingCalculationContext(sources: CostingContextSources, scenarioId: string, blockingScenarioId: string): Promise<CostingCalculationContext | undefined> {
  const [scenario, serviceDays, blockingScenarios] = await Promise.all([sources.getScenario(scenarioId), sources.listServiceDays(scenarioId), sources.listBlockingScenarios(scenarioId)]);
  const blockingScenario = blockingScenarios.find((candidate) => candidate.id === blockingScenarioId && candidate.scenarioId === scenarioId);
  if (!scenario || !blockingScenario) return undefined;
  const [tripProfile, trips, patterns, blocks] = await Promise.all([
    sources.getTripProfile(blockingScenario.tripProfileId),
    sources.listTrips(scenarioId, blockingScenario.tripProfileId),
    sources.listPatterns(scenarioId),
    sources.listBlockingBlocks(blockingScenario.id),
  ]);
  if (!tripProfile) return undefined;
  const { blockSummaries } = summarizeBlockingScenario(blockingScenario, blocks, { scenario: { id: scenario.id }, trips, patterns });
  return { scenario, serviceDays, blockingScenario, tripProfile, trips, blocks, blockSummaries };
}

/** The read side `CostingApplicationService` needs, over the given sources. */
export function createCostingContextQueries(sources: CostingContextSources): CostingCalculationContextQueries {
  return {
    listBlockingScenarios: (scenarioId) => sources.listBlockingScenarios(scenarioId),
    getCostingCalculationContext: (scenarioId, blockingScenarioId) => buildCostingCalculationContext(sources, scenarioId, blockingScenarioId),
  };
}
