import { calculateCosting, selectCostingBlockingScenario, type CostingCalculationResult } from '../domain/costing';
import type { CostingAssumptionsInput } from '../domain/costing';
import type { CostingAssumptionsRepository, CostingCalculationContextQueries, CostingCommands, CostingQueries } from './ports';
import { costingCsvFiles } from '../persistence/csv';
import { metadata, newId } from '../domain/ids';
import { publishWrites, SaveStatusPublisher } from './saveStatus';

export interface CostingEstimateRequest {
  scenarioId: string;
  blockingScenarioId: string;
  assumptions: CostingAssumptionsInput;
}

/** The `CostingAssumptionsRepository` methods that write. Every call to one is published through the save-status publisher. */
export const COSTING_WRITE_METHODS: readonly string[] = ['saveCostingAssumptions'];

/** Coordinator for selected-scenario costing calculations (read-only) and the Scenario's one set of Costing assumptions (the only write). */
export class CostingApplicationService implements CostingQueries, CostingCommands {
  private readonly assumptionsRepository?: CostingAssumptionsRepository;

  /** `saveStatus` is the one publisher of the visible save status, shared with the other services that write (Decision 0001, amendment). */
  constructor(
    private readonly contextQueries: CostingCalculationContextQueries,
    assumptionsRepository?: CostingAssumptionsRepository,
    private readonly now = () => new Date().toISOString(),
    saveStatus: SaveStatusPublisher = new SaveStatusPublisher(now),
  ) {
    this.assumptionsRepository = assumptionsRepository && publishWrites(assumptionsRepository, saveStatus, COSTING_WRITE_METHODS);
  }

  async loadAssumptions(scenarioId: string) {
    return this.assumptionsRepository?.getCostingAssumptions(scenarioId);
  }

  async saveAssumptions(scenarioId: string, input: CostingAssumptionsInput) {
    if (!this.assumptionsRepository) throw new Error('Costing assumptions persistence is unavailable.');
    const existing = await this.assumptionsRepository.getCostingAssumptions(scenarioId);
    const timestamp = this.now();
    const assumptions = existing
      ? { ...existing, ...input, scenarioId, currencyCode: 'USD' as const, updatedAt: timestamp }
      : { id: newId(), scenarioId, currencyCode: 'USD' as const, ...input, ...metadata(timestamp) };
    await this.assumptionsRepository.saveCostingAssumptions(assumptions);
    return assumptions;
  }

  listBlockingScenarios(scenarioId: string) {
    return this.contextQueries.listBlockingScenarios(scenarioId);
  }

  async calculateEstimate(request: CostingEstimateRequest): Promise<CostingCalculationResult | undefined> {
    const resolved = await this.resolveCalculation(request);
    return resolved?.result;
  }

  async exportEstimateCsv(request: CostingEstimateRequest) {
    const resolved = await this.resolveCalculation(request);
    if (!resolved) return undefined;
    const { context, result } = resolved;
    return costingCsvFiles(context.scenario, context.blockingScenario, context.tripProfile, request.assumptions, result);
  }

  private async resolveCalculation(request: CostingEstimateRequest) {
    const blockingScenarios = await this.contextQueries.listBlockingScenarios(request.scenarioId);
    const selected = selectCostingBlockingScenario(request.scenarioId, blockingScenarios, request.blockingScenarioId);
    if (!selected) return undefined;

    const context = await this.contextQueries.getCostingCalculationContext(request.scenarioId, selected.id);
    if (!context) return undefined;
    if (context.scenario.id !== request.scenarioId || context.blockingScenario.id !== selected.id) return undefined;
    return { context, result: calculateCosting({ ...context, assumptions: request.assumptions }) };
  }
}
