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

  // P11 (review issues I-074b, finding 4-014): the rules the Costing screen used to hold itself.
  describe('assumption and service-day rules the screen reads from the service', () => {
    const service = new CostingApplicationService({ listBlockingScenarios: async () => [], getCostingCalculationContext: async () => undefined });
    const valid = { enteredRate: 150, rateYear: 2025, sourceType: 'user' as const, baseServiceYear: 2026, futureYearCount: 3, annualEscalation: 0.03 };
    const day = (annualServiceDays: number, id = `day-${annualServiceDays}`) => ({ id, scenarioId, kind: 'custom' as const, name: id, annualServiceDays, sequence: 0, ...metadata('2026-01-01T00:00:00.000Z') });

    it('validates assumptions as the domain does', () => {
      expect(service.validateAssumptions(valid)).toEqual([]);
      expect(service.validateAssumptions({ ...valid, rateYear: 2030 }).map((finding) => finding.ruleId)).toEqual(['costing.rateYearAfterBaseServiceYear']);
      expect(service.validateAssumptions({ ...valid, enteredRate: -1, futureYearCount: 11 }).map((finding) => finding.ruleId)).toEqual(['costing.rateInvalid', 'costing.futureYearCountInvalid']);
      expect(service.validateAssumptions({ ...valid, enteredRate: undefined })).toEqual([]);
    });

    it('totals the annual service days against the 365-day limit', () => {
      expect(service.summarizeServiceDays([day(255, 'a'), day(52, 'b'), day(52, 'c'), day(6, 'd')])).toEqual({ total: 365, maximum: 365, exceedsMaximum: false });
      expect(service.summarizeServiceDays([day(260, 'a'), day(52, 'b'), day(52, 'c'), day(2, 'd')])).toEqual({ total: 366, maximum: 365, exceedsMaximum: true });
      expect(service.summarizeServiceDays([])).toEqual({ total: 0, maximum: 365, exceedsMaximum: false });
    });

    it('lists the service years from the first year of service, one more than the number of future years', () => {
      expect(service.listServiceYears({ baseServiceYear: 2026, futureYearCount: 3 })).toEqual([2026, 2027, 2028, 2029]);
      expect(service.listServiceYears({ baseServiceYear: 2026, futureYearCount: 0 })).toEqual([2026]);
      expect(service.listServiceYears({ baseServiceYear: 2026, futureYearCount: -2 })).toEqual([2026]);
    });

    it('clamps the number of future years to a whole number from 0 to 10', () => {
      expect([-3, 0, 4.9, 10, 11, 99].map((value) => service.normalizeFutureYearCount(value))).toEqual([0, 0, 4, 10, 10, 10]);
      expect(service.normalizeFutureYearCount(Number.NaN)).toBe(0);
    });
  });
});
