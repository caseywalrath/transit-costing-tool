import { describe, expect, it, vi } from 'vitest';
import { metadata } from '../domain/ids';
import type { CostingCalculationContext } from '../domain/costing';
import type { BlockingScenario, CostingAssumptions } from '../domain/types';
import { CostingApplicationService } from './costingService';
import type { CostingCalculationContextQueries } from './ports';

const scenarioId = 'scenario';
const selected: BlockingScenario = {
  id: 'blocking-a',
  scenarioId,
  tripProfileId: 'profile',
  name: 'Plan A',
  ...metadata('2026-01-01T00:00:00.000Z'),
};
const other: BlockingScenario = {
  id: 'blocking-other-scenario',
  scenarioId: 'another-scenario',
  tripProfileId: 'other-profile',
  name: 'Plan B',
  ...metadata('2026-01-01T00:00:00.000Z'),
};

describe('CostingApplicationService', () => {
  it('loads the calculation context only for an explicitly selected Blocking Scenario in the Scenario', async () => {
    const context = {
      scenario: { id: scenarioId },
      serviceDays: [],
      blockingScenario: selected,
      tripProfile: { id: 'profile', scenarioId },
      trips: [],
      blocks: [],
      blockSummaries: [],
    } as unknown as CostingCalculationContext;
    const queries: CostingCalculationContextQueries = {
      listBlockingScenarios: vi.fn().mockResolvedValue([selected, other]),
      getCostingCalculationContext: vi.fn().mockResolvedValue(context),
    };
    const service = new CostingApplicationService(queries);
    const assumptions = {
      rateYear: 2024,
      sourceType: 'user' as const,
      baseServiceYear: 2026,
      futureYearCount: 0,
      annualEscalation: 0.03,
    };

    const missing = await service.calculateEstimate({ scenarioId, blockingScenarioId: other.id, assumptions });
    const result = await service.calculateEstimate({ scenarioId, blockingScenarioId: selected.id, assumptions });
    const files = await service.exportEstimateCsv({ scenarioId, blockingScenarioId: selected.id, assumptions });

    expect(missing).toBeUndefined();
    expect(queries.getCostingCalculationContext).toHaveBeenCalledTimes(2);
    expect(queries.getCostingCalculationContext).toHaveBeenCalledWith(scenarioId, selected.id);
    expect(result?.state).toBe('noEstimate');
    expect(result?.noEstimateReason).toBe('noEligibleBlocks');
    expect(files?.map((file) => file.suffix)).toEqual(['costing-assumptions', 'costing-results', 'costing-exclusions']);
    expect(files?.[1].contents).toContain('noEstimate');
  });

  it('creates and updates the one Scenario-owned assumptions record without replacing its identity', async () => {
    let stored: CostingAssumptions | undefined;
    const repository = {
      getCostingAssumptions: vi.fn(async () => stored),
      saveCostingAssumptions: vi.fn(async (value: CostingAssumptions) => { stored = value; }),
    };
    const queries: CostingCalculationContextQueries = {
      listBlockingScenarios: vi.fn().mockResolvedValue([]),
      getCostingCalculationContext: vi.fn().mockResolvedValue(undefined),
    };
    const service = new CostingApplicationService(queries, repository, () => '2026-09-23T12:00:00.000Z');
    const input = { enteredRate: 155.25, rateYear: 2025, sourceType: 'ntd' as const, sourceNote: '2025 report', baseServiceYear: 2026, futureYearCount: 10, annualEscalation: 0.03 };

    const created = await service.saveAssumptions(scenarioId, input);
    const updated = await service.saveAssumptions(scenarioId, { ...input, enteredRate: 160 });

    expect(created.scenarioId).toBe(scenarioId);
    expect(created.currencyCode).toBe('USD');
    expect(updated.id).toBe(created.id);
    expect(updated.enteredRate).toBe(160);
    expect(await service.loadAssumptions(scenarioId)).toEqual(updated);
  });
});
