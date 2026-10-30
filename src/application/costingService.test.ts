import { describe, expect, it, vi } from 'vitest';
import { metadata } from '../domain/ids';
import type { CostingCalculationContext } from '../domain/costing';
import type { BlockingScenario, CostingAssumptions } from '../domain/types';
import { CostingApplicationService } from './costingService';
import type { CostingCalculationContextQueries } from './ports';

const scenarioId = 'scenario';
/** Queries that return nothing, for the tests that do not read a context. */
const emptyQueries = (overrides: Partial<CostingCalculationContextQueries> = {}): CostingCalculationContextQueries => ({
  listBlockingScenarios: async () => [],
  listServiceDays: async () => [],
  listTripProfiles: async () => [],
  getCostingCalculationContext: async () => undefined,
  getEstimatedCostingContext: async () => undefined,
  ...overrides,
});
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
    const queries = emptyQueries({
      listBlockingScenarios: vi.fn().mockResolvedValue([selected, other]),
      getCostingCalculationContext: vi.fn().mockResolvedValue(context),
    });
    const service = new CostingApplicationService(queries);
    const assumptions = {
      rateYear: 2024,
      sourceType: 'user' as const,
      baseServiceYear: 2026,
      futureYearCount: 0,
      annualEscalation: 0.03,
    };

    const missing = await service.calculateEstimate({ scenarioId, basis: { kind: 'blocked', blockingScenarioId: other.id }, assumptions });
    const result = await service.calculateEstimate({ scenarioId, basis: { kind: 'blocked', blockingScenarioId: selected.id }, assumptions });
    const files = await service.exportEstimateCsv({ scenarioId, basis: { kind: 'blocked', blockingScenarioId: selected.id }, assumptions });

    expect(missing).toBeUndefined();
    expect(queries.getCostingCalculationContext).toHaveBeenCalledTimes(2);
    expect(queries.getCostingCalculationContext).toHaveBeenCalledWith(scenarioId, selected.id);
    expect(result?.basis).toBe('blocked');
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
    const queries = emptyQueries();
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

  describe('estimated cost basis (Decision 0051)', () => {
    const stamp = metadata('2026-01-01T00:00:00.000Z');
    const profile = (id: string, name: string) => ({ id, scenarioId, name, ...stamp });
    const profiles = [profile('p-zeta', 'Zeta'), profile('p-alpha', 'Alpha'), profile('profile', 'Weekday')];
    const days = ['weekday', 'saturday'].map((kind, sequence) => ({ id: kind, scenarioId, kind: kind as 'weekday' | 'saturday', name: kind, annualServiceDays: kind === 'weekday' ? 255 : 52, sequence, ...stamp }));
    const input = { enteredRate: 100, rateYear: 2026, sourceType: 'user' as const, baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0.03 };
    const trip = { id: 't1', scenarioId, routeId: 'r', serviceDayId: 'weekday', patternId: 'p', tripProfileId: 'p-alpha', stopTimes: [{ patternPointId: 'a', sequence: 0, time: 0 }, { patternPointId: 'b', sequence: 1, time: 28800 }], provenance: { kind: 'manual' }, ...stamp };
    const estimatedContext = { scenario: { id: scenarioId }, serviceDays: days, tripProfile: profiles[1], trips: [trip] };
    const memoryRepository = () => {
      let stored: CostingAssumptions | undefined;
      return { getCostingAssumptions: vi.fn(async () => stored), saveCostingAssumptions: vi.fn(async (value: CostingAssumptions) => { stored = value; }) };
    };
    const queries = (overrides: Partial<CostingCalculationContextQueries> = {}) => emptyQueries({
      listBlockingScenarios: async () => [selected, other],
      listServiceDays: async () => days,
      listTripProfiles: async () => profiles,
      getEstimatedCostingContext: vi.fn(async (_scenario: string, tripProfileId: string) => tripProfileId === 'p-alpha' ? estimatedContext as never : undefined),
      ...overrides,
    });
    const at = () => '2026-10-30T12:00:00.000Z';

    it('lists the Blocking Scenarios first, then every Trip Profile in name order', async () => {
      const options = await new CostingApplicationService(queries()).listCostBases(scenarioId);
      expect(options).toEqual([
        { kind: 'blocked', id: 'blocking-a', name: 'Plan A', tripProfileId: 'profile', tripProfileName: 'Weekday' },
        { kind: 'blocked', id: 'blocking-other-scenario', name: 'Plan B', tripProfileId: 'other-profile', tripProfileName: '' },
        { kind: 'estimated', id: 'p-alpha', name: 'Alpha', tripProfileId: 'p-alpha', tripProfileName: 'Alpha' },
        { kind: 'estimated', id: 'profile', name: 'Weekday', tripProfileId: 'profile', tripProfileName: 'Weekday' },
        { kind: 'estimated', id: 'p-zeta', name: 'Zeta', tripProfileId: 'p-zeta', tripProfileName: 'Zeta' },
      ]);
    });

    it('calculates an estimated basis from the Trip Profile and returns undefined for one outside the Scenario', async () => {
      const service = new CostingApplicationService(queries());
      const estimateFactors = { allDays: { layoverFraction: 0.2, deadheadFraction: 0.2 }, serviceDays: [] };
      const result = await service.calculateEstimate({ scenarioId, basis: { kind: 'estimated', tripProfileId: 'p-alpha' }, assumptions: { ...input, estimateFactors } });
      expect(result?.basis).toBe('estimated');
      expect(result?.state).toBe('complete');
      expect(result?.yearRows[0].annualRevenueHours).toBeCloseTo(2550, 9);
      expect(await service.calculateEstimate({ scenarioId, basis: { kind: 'estimated', tripProfileId: 'p-zeta' }, assumptions: input })).toBeUndefined();
    });

    it('does not export the estimated basis CSV yet', async () => {
      const service = new CostingApplicationService(queries());
      await expect(service.exportEstimateCsv({ scenarioId, basis: { kind: 'estimated', tripProfileId: 'p-alpha' }, assumptions: input })).rejects.toThrow('Estimated cost basis CSV is not available yet.');
    });

    it('creates the record from the given assumptions when saving factors for a Scenario that has none, and normalizes them', async () => {
      const repository = memoryRepository();
      const service = new CostingApplicationService(queries(), repository, at);
      const saved = await service.saveEstimateFactors(scenarioId, { allDays: { layoverFraction: 0.18 }, serviceDays: [{ serviceDayId: 'saturday' }, { serviceDayId: 'weekday', deadheadFraction: 0.05 }] }, input);
      expect(saved).toMatchObject({ scenarioId, currencyCode: 'USD', enteredRate: 100, createdAt: at(), updatedAt: at() });
      expect(saved.estimateFactors).toEqual({ allDays: { layoverFraction: 0.18 }, serviceDays: [{ serviceDayId: 'weekday', deadheadFraction: 0.05 }] });
    });

    it('changes only the factors and the update time of an existing record, and removes the field when every factor is blank', async () => {
      const repository = memoryRepository();
      const service = new CostingApplicationService(queries(), repository, at);
      const created = await service.saveAssumptions(scenarioId, { ...input, sourceNote: 'kept' });
      const withFactors = await service.saveEstimateFactors(scenarioId, { allDays: { layoverFraction: 0.2 }, serviceDays: [] }, { ...input, enteredRate: 999 });
      expect(withFactors).toEqual({ ...created, estimateFactors: { allDays: { layoverFraction: 0.2 }, serviceDays: [] }, updatedAt: at() });
      const cleared = await service.saveEstimateFactors(scenarioId, { allDays: {}, serviceDays: [{ serviceDayId: 'weekday' }] }, input);
      expect('estimateFactors' in cleared).toBe(false);
      expect(cleared.id).toBe(created.id);
      expect((await service.saveEstimateFactors(scenarioId, undefined, input)).estimateFactors).toBeUndefined();
    });

    it('refuses a factor row of a day outside the Scenario and invalid factors, and writes nothing', async () => {
      const repository = memoryRepository();
      const service = new CostingApplicationService(queries(), repository, at);
      await expect(service.saveEstimateFactors(scenarioId, { allDays: {}, serviceDays: [{ serviceDayId: 'elsewhere', layoverFraction: 0.1 }] }, input))
        .rejects.toThrow('A service day of the estimate factors is not in this scenario.');
      await expect(service.saveEstimateFactors(scenarioId, { allDays: { layoverFraction: 1 }, serviceDays: [] }, input)).rejects.toThrow('costing.estimateFactorInvalid');
      await expect(service.saveEstimateFactors(scenarioId, { allDays: {}, serviceDays: [{ serviceDayId: 'weekday', layoverFraction: 0.1 }, { serviceDayId: 'weekday', layoverFraction: 0.2 }] }, input)).rejects.toThrow('costing.estimateFactorDuplicateDay');
      expect(repository.saveCostingAssumptions).not.toHaveBeenCalled();
    });

    it('keeps the stored factors when the assumptions are saved, whatever the caller holds', async () => {
      const repository = memoryRepository();
      const service = new CostingApplicationService(queries(), repository, at);
      const factors = { allDays: { layoverFraction: 0.2 }, serviceDays: [] };
      await service.saveEstimateFactors(scenarioId, factors, input);
      const resaved = await service.saveAssumptions(scenarioId, { ...input, enteredRate: 120, estimateFactors: { allDays: { layoverFraction: 0.9 }, serviceDays: [] } });
      expect(resaved.enteredRate).toBe(120);
      expect(resaved.estimateFactors).toEqual(factors);
      const fresh = await new CostingApplicationService(queries(), memoryRepository(), at).saveAssumptions(scenarioId, { ...input, estimateFactors: factors });
      expect(fresh.estimateFactors).toBeUndefined();
    });
  });

  // P11 (review issues I-074b, finding 4-014): the rules the Costing screen used to hold itself.
  describe('assumption and service-day rules the screen reads from the service', () => {
    const service = new CostingApplicationService(emptyQueries());
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
