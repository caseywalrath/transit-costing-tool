import { calculateCosting, MAX_ANNUAL_SERVICE_DAYS, MAX_COSTING_FUTURE_YEARS, selectCostingBlockingScenario, validateCostingAssumptions, type CostingFinding } from '../domain/costing';
import type { CostingAssumptionsInput } from '../domain/costing';
import { calculateEstimatedCosting, normalizeEstimateFactors, setTripProfileEstimateFactors } from '../domain/estimatedCosting';
import type { CostingAssumptions, CostingEstimateFactors, ServiceDayDefinition } from '../domain/types';
import type { CostBasis, CostBasisOption, CostingAssumptionsRepository, CostingCalculationContextQueries, CostingCommands, CostingQueries, CostingResult } from './ports';
import { costingCsvFiles } from '../persistence/csv';
import { metadata, newId } from '../domain/ids';
import { publishWrites, SaveStatusPublisher } from './saveStatus';

export interface CostingEstimateRequest {
  scenarioId: string;
  basis: CostBasis;
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
    // The typed estimate factors are saved only by `saveEstimateFactors`; whatever the caller holds for them is ignored here.
    const { estimateFactors: _ignored, ...fields } = input;
    const assumptions: CostingAssumptions = existing
      ? { ...existing, ...fields, scenarioId, currencyCode: 'USD' as const, updatedAt: timestamp }
      : { id: newId(), scenarioId, currencyCode: 'USD' as const, ...fields, ...metadata(timestamp) };
    await this.assumptionsRepository.saveCostingAssumptions(assumptions);
    return assumptions;
  }

  async saveEstimateFactors(scenarioId: string, tripProfileId: string, factors: CostingEstimateFactors | undefined, assumptionsIfNew: CostingAssumptionsInput) {
    if (!this.assumptionsRepository) throw new Error('Costing assumptions persistence is unavailable.');
    const [serviceDays, tripProfiles] = await Promise.all([this.contextQueries.listServiceDays(scenarioId), this.contextQueries.listTripProfiles(scenarioId)]);
    const tripProfileIds = new Set(tripProfiles.filter((profile) => profile.scenarioId === scenarioId).map((profile) => profile.id));
    if (!tripProfileIds.has(tripProfileId)) throw new Error('The trip profile of the estimate factors is not in this scenario.');
    const dayIds = new Set(serviceDays.map((day) => day.id));
    if ((factors?.serviceDays ?? []).some((row) => !dayIds.has(row.serviceDayId))) {
      throw new Error('A service day of the estimate factors is not in this scenario.');
    }
    const invalid = validateCostingAssumptions({ ...assumptionsIfNew, estimateFactors: factors }, scenarioId).find((finding) => finding.field === 'estimateFactors');
    if (invalid) throw new Error(invalid.ruleId);
    const normalized = normalizeEstimateFactors(factors, serviceDays);
    const existing = await this.assumptionsRepository.getCostingAssumptions(scenarioId);
    const timestamp = this.now();
    // The Scenario's shared `estimateFactors` are kept as they are: they remain the fallback of every Trip Profile without an entry.
    const tripProfileEstimateFactors = setTripProfileEstimateFactors(existing?.tripProfileEstimateFactors, tripProfileId, normalized, tripProfileIds);
    let assumptions: CostingAssumptions;
    if (existing) {
      assumptions = { ...existing, tripProfileEstimateFactors, updatedAt: timestamp };
    } else {
      const { estimateFactors: _ignored, ...fields } = assumptionsIfNew;
      assumptions = { id: newId(), scenarioId, currencyCode: 'USD' as const, ...fields, tripProfileEstimateFactors, ...metadata(timestamp) };
    }
    await this.assumptionsRepository.saveCostingAssumptions(assumptions);
    return assumptions;
  }

  listBlockingScenarios(scenarioId: string) {
    return this.contextQueries.listBlockingScenarios(scenarioId);
  }

  async listCostBases(scenarioId: string): Promise<CostBasisOption[]> {
    const [blockingScenarios, tripProfiles] = await Promise.all([this.contextQueries.listBlockingScenarios(scenarioId), this.contextQueries.listTripProfiles(scenarioId)]);
    const profileNames = new Map(tripProfiles.map((profile) => [profile.id, profile.name]));
    // An empty Blocking Scenario has nothing to cost, so it is never offered as a cost basis.
    const blockCounts = await Promise.all(blockingScenarios.map((blockingScenario) => this.contextQueries.countBlocks(blockingScenario.id)));
    const blocked: CostBasisOption[] = blockingScenarios.filter((_, index) => blockCounts[index] > 0).map((blockingScenario) => ({
      kind: 'blocked', id: blockingScenario.id, name: blockingScenario.name,
      tripProfileId: blockingScenario.tripProfileId, tripProfileName: profileNames.get(blockingScenario.tripProfileId) ?? '',
    }));
    const estimated: CostBasisOption[] = [...tripProfiles]
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((profile) => ({ kind: 'estimated', id: profile.id, name: profile.name, tripProfileId: profile.id, tripProfileName: profile.name }));
    return [...blocked, ...estimated];
  }

  validateAssumptions(assumptions: CostingAssumptionsInput): CostingFinding[] {
    return validateCostingAssumptions(assumptions);
  }

  summarizeServiceDays(serviceDays: ServiceDayDefinition[]) {
    const total = serviceDays.reduce((sum, day) => sum + day.annualServiceDays, 0);
    return { total, maximum: MAX_ANNUAL_SERVICE_DAYS, exceedsMaximum: total > MAX_ANNUAL_SERVICE_DAYS };
  }

  listServiceYears(assumptions: Pick<CostingAssumptionsInput, 'baseServiceYear' | 'futureYearCount'>): number[] {
    return Array.from({ length: Math.max(0, assumptions.futureYearCount) + 1 }, (_, index) => assumptions.baseServiceYear + index);
  }

  normalizeFutureYearCount(value: number): number {
    return Number.isFinite(value) ? Math.min(MAX_COSTING_FUTURE_YEARS, Math.max(0, Math.trunc(value))) : 0;
  }

  async calculateEstimate(request: CostingEstimateRequest): Promise<CostingResult | undefined> {
    if (request.basis.kind === 'estimated') {
      const context = await this.contextQueries.getEstimatedCostingContext(request.scenarioId, request.basis.tripProfileId);
      if (!context || context.scenario.id !== request.scenarioId) return undefined;
      return calculateEstimatedCosting({ ...context, assumptions: request.assumptions });
    }
    const resolved = await this.resolveCalculation(request.scenarioId, request.basis.blockingScenarioId, request.assumptions);
    return resolved?.result;
  }

  async exportEstimateCsv(request: CostingEstimateRequest) {
    if (request.basis.kind === 'estimated') {
      const context = await this.contextQueries.getEstimatedCostingContext(request.scenarioId, request.basis.tripProfileId);
      if (!context || context.scenario.id !== request.scenarioId) return undefined;
      const result = calculateEstimatedCosting({ ...context, assumptions: request.assumptions });
      return costingCsvFiles(context.scenario, { kind: 'estimated', tripProfile: context.tripProfile }, request.assumptions, result);
    }
    const resolved = await this.resolveCalculation(request.scenarioId, request.basis.blockingScenarioId, request.assumptions);
    if (!resolved) return undefined;
    const { context, result } = resolved;
    return costingCsvFiles(context.scenario, { kind: 'blocked', blockingScenario: context.blockingScenario, tripProfile: context.tripProfile }, request.assumptions, result);
  }

  private async resolveCalculation(scenarioId: string, blockingScenarioId: string, assumptions: CostingAssumptionsInput) {
    const blockingScenarios = await this.contextQueries.listBlockingScenarios(scenarioId);
    const selected = selectCostingBlockingScenario(scenarioId, blockingScenarios, blockingScenarioId);
    if (!selected) return undefined;

    const context = await this.contextQueries.getCostingCalculationContext(scenarioId, selected.id);
    if (!context) return undefined;
    if (context.scenario.id !== scenarioId || context.blockingScenario.id !== selected.id) return undefined;
    return { context, result: calculateCosting({ ...context, assumptions }) };
  }
}
