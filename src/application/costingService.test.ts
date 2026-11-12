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
  countBlocks: async () => 1,
  getCostingCalculationContext: async () => undefined,
  getEstimatedCostingContext: async () => undefined,
  listRoutes: async () => [],
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
    expect(files?.map((file) => file.suffix)).toEqual(['costing-assumptions', 'costing-results', 'costing-exclusions', 'costing-routes']);
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

    it('omits a Blocking Scenario that has no Blocks', async () => {
      const options = await new CostingApplicationService(queries({ countBlocks: async (id: string) => id === 'blocking-a' ? 0 : 2 })).listCostBases(scenarioId);
      expect(options.filter((option) => option.kind === 'blocked').map((option) => option.id)).toEqual(['blocking-other-scenario']);
    });

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

    it('exports the estimated basis as the three Costing CSV files, and nothing for a Trip Profile outside the Scenario', async () => {
      const service = new CostingApplicationService(queries());
      const estimateFactors = { allDays: { layoverFraction: 0.2, deadheadFraction: 0.2 }, serviceDays: [] };
      const files = await service.exportEstimateCsv({ scenarioId, basis: { kind: 'estimated', tripProfileId: 'p-alpha' }, assumptions: { ...input, estimateFactors } });
      expect(files?.map((file) => file.suffix)).toEqual(['costing-assumptions', 'costing-results', 'costing-exclusions', 'costing-routes']);
      expect(files?.[0].contents).toContain(',estimated,');
      expect(files?.[1].contents).toContain('10.0000');
      expect(await service.exportEstimateCsv({ scenarioId, basis: { kind: 'estimated', tripProfileId: 'p-zeta' }, assumptions: input })).toBeUndefined();
    });

    it('creates the record from the given assumptions when saving factors for a Scenario that has none, and normalizes them', async () => {
      const repository = memoryRepository();
      const service = new CostingApplicationService(queries(), repository, at);
      const saved = await service.saveEstimateFactors(scenarioId, 'p-alpha', { allDays: { layoverFraction: 0.18 }, serviceDays: [{ serviceDayId: 'saturday' }, { serviceDayId: 'weekday', deadheadFraction: 0.05 }] }, input);
      expect(saved).toMatchObject({ scenarioId, currencyCode: 'USD', enteredRate: 100, createdAt: at(), updatedAt: at() });
      expect(saved.estimateFactors).toBeUndefined();
      expect(saved.tripProfileEstimateFactors).toEqual([{ tripProfileId: 'p-alpha', factors: { allDays: { layoverFraction: 0.18 }, serviceDays: [{ serviceDayId: 'weekday', deadheadFraction: 0.05 }] } }]);
    });

    it('saves each Trip Profile separately, keeps the shared Scenario factors, and saves all-blank factors as an empty set (Decision 0062)', async () => {
      const repository = memoryRepository();
      const service = new CostingApplicationService(queries(), repository, at);
      const created = await service.saveAssumptions(scenarioId, { ...input, sourceNote: 'kept' });
      const shared = { allDays: { layoverFraction: 0.3 }, serviceDays: [] };
      await repository.saveCostingAssumptions({ ...created, estimateFactors: shared });
      const alpha = await service.saveEstimateFactors(scenarioId, 'p-alpha', { allDays: { layoverFraction: 0.2 }, serviceDays: [] }, { ...input, enteredRate: 999 });
      expect(alpha).toEqual({ ...created, estimateFactors: shared, tripProfileEstimateFactors: [{ tripProfileId: 'p-alpha', factors: { allDays: { layoverFraction: 0.2 }, serviceDays: [] } }], updatedAt: at() });
      const zeta = await service.saveEstimateFactors(scenarioId, 'p-zeta', { allDays: { layoverFraction: 0.25 }, serviceDays: [] }, input);
      expect(zeta.tripProfileEstimateFactors?.map((entry) => [entry.tripProfileId, entry.factors.allDays.layoverFraction])).toEqual([['p-alpha', 0.2], ['p-zeta', 0.25]]);
      const cleared = await service.saveEstimateFactors(scenarioId, 'p-alpha', { allDays: {}, serviceDays: [{ serviceDayId: 'weekday' }] }, input);
      expect(cleared.id).toBe(created.id);
      expect(cleared.tripProfileEstimateFactors?.[0]).toEqual({ tripProfileId: 'p-alpha', factors: { allDays: {}, serviceDays: [] } });
      expect(cleared.estimateFactors).toEqual(shared);
    });

    it('drops the entries of Trip Profiles that no longer exist when it saves', async () => {
      const repository = memoryRepository();
      const service = new CostingApplicationService(queries(), repository, at);
      const created = await service.saveAssumptions(scenarioId, input);
      await repository.saveCostingAssumptions({ ...created, tripProfileEstimateFactors: [{ tripProfileId: 'gone', factors: { allDays: { layoverFraction: 0.1 }, serviceDays: [] } }] });
      const saved = await service.saveEstimateFactors(scenarioId, 'p-alpha', { allDays: { layoverFraction: 0.2 }, serviceDays: [] }, input);
      expect(saved.tripProfileEstimateFactors?.map((entry) => entry.tripProfileId)).toEqual(['p-alpha']);
    });

    it('refuses a Trip Profile outside the Scenario, a factor row of a day outside the Scenario, and invalid factors, and writes nothing', async () => {
      const repository = memoryRepository();
      const service = new CostingApplicationService(queries(), repository, at);
      await expect(service.saveEstimateFactors(scenarioId, 'elsewhere', { allDays: { layoverFraction: 0.1 }, serviceDays: [] }, input))
        .rejects.toThrow('The trip profile of the estimate factors is not in this scenario.');
      await expect(service.saveEstimateFactors(scenarioId, 'p-alpha', { allDays: {}, serviceDays: [{ serviceDayId: 'elsewhere', layoverFraction: 0.1 }] }, input))
        .rejects.toThrow('A service day of the estimate factors is not in this scenario.');
      await expect(service.saveEstimateFactors(scenarioId, 'p-alpha', { allDays: { layoverFraction: 1 }, serviceDays: [] }, input)).rejects.toThrow('costing.estimateFactorInvalid');
      await expect(service.saveEstimateFactors(scenarioId, 'p-alpha', { allDays: {}, serviceDays: [{ serviceDayId: 'weekday', layoverFraction: 0.1 }, { serviceDayId: 'weekday', layoverFraction: 0.2 }] }, input)).rejects.toThrow('costing.estimateFactorDuplicateDay');
      expect(repository.saveCostingAssumptions).not.toHaveBeenCalled();
    });

    it('keeps the stored factors when the assumptions are saved, whatever the caller holds', async () => {
      const repository = memoryRepository();
      const service = new CostingApplicationService(queries(), repository, at);
      const factors = { allDays: { layoverFraction: 0.2 }, serviceDays: [] };
      await service.saveEstimateFactors(scenarioId, 'p-alpha', factors, input);
      const resaved = await service.saveAssumptions(scenarioId, { ...input, enteredRate: 120, estimateFactors: { allDays: { layoverFraction: 0.9 }, serviceDays: [] } });
      expect(resaved.enteredRate).toBe(120);
      expect(resaved.estimateFactors).toBeUndefined();
      expect(resaved.tripProfileEstimateFactors).toEqual([{ tripProfileId: 'p-alpha', factors }]);
      const fresh = await new CostingApplicationService(queries(), memoryRepository(), at).saveAssumptions(scenarioId, { ...input, estimateFactors: factors });
      expect(fresh.estimateFactors).toBeUndefined();
    });

    describe('Route estimate factors (Decision 0077)', () => {
      const routes = [{ id: 'r', scenarioId, name: 'Route', ...stamp }, { id: 'foreign', scenarioId: 'other-scenario', name: 'Foreign', ...stamp }];
      const routeQueries = () => queries({ listRoutes: async () => routes });

      it('creates the record from the given assumptions when the Scenario has none, strips its factor fields, and normalizes the Route factors', async () => {
        const repository = memoryRepository();
        const service = new CostingApplicationService(routeQueries(), repository, at);
        const saved = await service.saveRouteEstimateFactors(scenarioId, 'p-alpha', 'r', { allDays: { layoverFraction: 0.31 }, serviceDays: [{ serviceDayId: 'saturday' }, { serviceDayId: 'weekday', deadheadFraction: 0.05 }] }, {
          ...input, estimateFactors: { allDays: { layoverFraction: 0.9 }, serviceDays: [] }, routeEstimateFactors: [{ routeId: 'r', factors: { allDays: { layoverFraction: 0.5 }, serviceDays: [] } }],
        });
        expect(saved).toMatchObject({ scenarioId, currencyCode: 'USD', enteredRate: 100, createdAt: at(), updatedAt: at() });
        expect(saved.estimateFactors).toBeUndefined();
        expect(saved.routeEstimateFactors).toEqual([{ tripProfileId: 'p-alpha', routeId: 'r', factors: { allDays: { layoverFraction: 0.31 }, serviceDays: [{ serviceDayId: 'weekday', deadheadFraction: 0.05 }] } }]);
        expect(saved.tripProfileEstimateFactors).toBeUndefined();
      });

      it('replaces the entry of one Trip Profile and Route, keeps the others, and removes the entry when the factors are all blank', async () => {
        const repository = memoryRepository();
        const service = new CostingApplicationService(routeQueries(), repository, at);
        await service.saveRouteEstimateFactors(scenarioId, 'p-alpha', 'r', { allDays: { layoverFraction: 0.31 }, serviceDays: [] }, input);
        const other = await service.saveRouteEstimateFactors(scenarioId, 'p-zeta', 'r', { allDays: { layoverFraction: 0.2 }, serviceDays: [] }, input);
        expect(other.routeEstimateFactors?.map((entry) => entry.tripProfileId)).toEqual(['p-alpha', 'p-zeta']);
        const replaced = await service.saveRouteEstimateFactors(scenarioId, 'p-alpha', 'r', { allDays: { layoverFraction: 0.35 }, serviceDays: [] }, input);
        expect(replaced.id).toBe(other.id);
        expect(replaced.routeEstimateFactors?.map((entry) => [entry.tripProfileId, entry.routeId, entry.factors.allDays.layoverFraction])).toEqual([['p-alpha', 'r', 0.35], ['p-zeta', 'r', 0.2]]);
        const removed = await service.saveRouteEstimateFactors(scenarioId, 'p-alpha', 'r', { allDays: {}, serviceDays: [] }, input);
        expect(removed.routeEstimateFactors?.map((entry) => entry.tripProfileId)).toEqual(['p-zeta']);
      });

      it('drops the entries of Trip Profiles and Routes that no longer exist when it saves', async () => {
        const repository = memoryRepository();
        const service = new CostingApplicationService(routeQueries(), repository, at);
        const created = await service.saveAssumptions(scenarioId, input);
        const factors = { allDays: { layoverFraction: 0.1 }, serviceDays: [] };
        await repository.saveCostingAssumptions({ ...created, routeEstimateFactors: [{ tripProfileId: 'gone', routeId: 'r', factors }, { tripProfileId: 'p-alpha', routeId: 'gone-route', factors }] });
        const saved = await service.saveRouteEstimateFactors(scenarioId, 'p-alpha', 'r', { allDays: { layoverFraction: 0.2 }, serviceDays: [] }, input);
        expect(saved.routeEstimateFactors).toEqual([{ tripProfileId: 'p-alpha', routeId: 'r', factors: { allDays: { layoverFraction: 0.2 }, serviceDays: [] } }]);
      });

      it('refuses a Route outside the Scenario, a Trip Profile outside the Scenario, a day outside the Scenario, and invalid factors, and writes nothing', async () => {
        const repository = memoryRepository();
        const service = new CostingApplicationService(routeQueries(), repository, at);
        const factors = { allDays: { layoverFraction: 0.1 }, serviceDays: [] };
        await expect(service.saveRouteEstimateFactors(scenarioId, 'p-alpha', 'elsewhere', factors, input))
          .rejects.toThrow('The route of the route estimate factors is not in this scenario.');
        await expect(service.saveRouteEstimateFactors(scenarioId, 'p-alpha', 'foreign', factors, input))
          .rejects.toThrow('The route of the route estimate factors is not in this scenario.');
        await expect(service.saveRouteEstimateFactors(scenarioId, 'elsewhere', 'r', factors, input))
          .rejects.toThrow('The trip profile of the route estimate factors is not in this scenario.');
        await expect(service.saveRouteEstimateFactors(scenarioId, 'p-alpha', 'r', { allDays: {}, serviceDays: [{ serviceDayId: 'elsewhere', layoverFraction: 0.1 }] }, input))
          .rejects.toThrow('A service day of the route estimate factors is not in this scenario.');
        await expect(service.saveRouteEstimateFactors(scenarioId, 'p-alpha', 'r', { allDays: { layoverFraction: 1 }, serviceDays: [] }, input)).rejects.toThrow('costing.estimateFactorInvalid');
        expect(repository.saveCostingAssumptions).not.toHaveBeenCalled();
      });
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
