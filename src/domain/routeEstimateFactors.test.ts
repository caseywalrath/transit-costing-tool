import { describe, expect, it } from 'vitest';
import { validateCostingAssumptions, type CostingAssumptionsInput } from './costing';
import {
  assumptionsAfterRouteDeletion,
  assumptionsAfterTripProfileCopy,
  assumptionsAfterTripProfileDeletion,
  estimateFactorsForTripProfile,
  remapRouteEstimateFactors,
  resolveDayFactors,
  resolveRouteDayFactors,
  routeEstimateFactorsForTripProfile,
  setRouteEstimateFactors,
} from './estimatedCosting';
import { metadata } from './ids';
import type { CostingAssumptions, CostingEstimateFactors, CostingFactorPair, CostingServiceDayFactors, RouteEstimateFactors } from './types';

const stamp = metadata('2026-01-01T00:00:00.000Z');
const later = '2026-02-01T00:00:00.000Z';
const scenarioId = 's';

const factors = (allDays: CostingFactorPair = {}, serviceDays: CostingServiceDayFactors[] = []): CostingEstimateFactors => ({ allDays, serviceDays });
const assumptions = (extra: Partial<CostingAssumptions> = {}): CostingAssumptions => ({
  id: 'cost', scenarioId, currencyCode: 'USD', enteredRate: 100, rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0, ...stamp, ...extra,
});
const entry = (tripProfileId: string, routeId: string, value: CostingEstimateFactors = factors({ layoverFraction: 0.1 })): RouteEstimateFactors => ({ tripProfileId, routeId, factors: value });

const profileFactors = factors({ layoverFraction: 0.1, deadheadFraction: 0.05 }, [{ serviceDayId: 'sat', layoverFraction: 0.2 }]);
const days = ['sat', 'sun', 'hol', 'wkd'];

describe('resolveRouteDayFactors (Decision 0077)', () => {
  it('equals resolveDayFactors for the Trip Profile when the Route has no entry', () => {
    for (const profile of [undefined, factors({}), profileFactors]) {
      for (const day of days) {
        expect(resolveRouteDayFactors(undefined, profile, day)).toEqual(resolveDayFactors(profile, day));
      }
    }
  });

  it('takes the Route day row first', () => {
    const route = factors({ layoverFraction: 0.3 }, [{ serviceDayId: 'sat', layoverFraction: 0.4 }]);
    expect(resolveRouteDayFactors(route, profileFactors, 'sat').layoverFraction).toBe(0.4);
    expect(resolveRouteDayFactors(route, profileFactors, 'sat').layoverSource).toBe('routeServiceDay');
  });

  it('takes the Route All days row when the Route has no row for the day', () => {
    const route = factors({ layoverFraction: 0.3 });
    expect(resolveRouteDayFactors(route, profileFactors, 'sun')).toMatchObject({ layoverFraction: 0.3, layoverSource: 'routeAllDays' });
  });

  it('falls back to the Trip Profile resolution, keeping its source, when the Route is blank for the factor', () => {
    expect(resolveRouteDayFactors(factors(), profileFactors, 'sat')).toMatchObject({ layoverFraction: 0.2, layoverSource: 'serviceDay' });
    expect(resolveRouteDayFactors(factors(), profileFactors, 'sun')).toMatchObject({ layoverFraction: 0.1, layoverSource: 'allDays' });
  });

  it('treats an empty Route entry as inheriting everything', () => {
    expect(resolveRouteDayFactors(factors(), profileFactors, 'sat')).toEqual(resolveDayFactors(profileFactors, 'sat'));
  });

  it('resolves each factor independently: layover from the Route day, deadhead from the Trip Profile All days in the same call', () => {
    const route = factors({}, [{ serviceDayId: 'sat', layoverFraction: 0.4 }]);
    expect(resolveRouteDayFactors(route, profileFactors, 'sat')).toEqual({
      layoverFraction: 0.4, layoverSource: 'routeServiceDay',
      deadheadFraction: 0.05, deadheadSource: 'allDays',
    });
  });

  it('resolves deadhead from the Route All days while layover comes from the Trip Profile day row', () => {
    const route = factors({ deadheadFraction: 0.07 });
    expect(resolveRouteDayFactors(route, profileFactors, 'sat')).toEqual({
      layoverFraction: 0.2, layoverSource: 'serviceDay',
      deadheadFraction: 0.07, deadheadSource: 'routeAllDays',
    });
  });

  it('inherits the Scenario shared factors when the Trip Profile has no entry of its own', () => {
    const shared = assumptions({ estimateFactors: factors({ layoverFraction: 0.12 }) });
    const { factors: inherited, owner } = estimateFactorsForTripProfile(shared, 'tp');
    expect(owner).toBe('scenario');
    expect(resolveRouteDayFactors(undefined, inherited, 'sat')).toEqual({ layoverFraction: 0.12, layoverSource: 'allDays' });
    expect(resolveRouteDayFactors(factors({ deadheadFraction: 0.07 }), inherited, 'sat')).toEqual({
      layoverFraction: 0.12, layoverSource: 'allDays', deadheadFraction: 0.07, deadheadSource: 'routeAllDays',
    });
  });
});

describe('setRouteEstimateFactors (Decision 0077)', () => {
  const tripProfileIds = new Set(['tp', 'tp2']);
  const routeIds = new Set(['r1', 'r2', 'r3']);

  it('replaces the pair entry in place', () => {
    const next = factors({ layoverFraction: 0.5 });
    const result = setRouteEstimateFactors([entry('tp', 'r1'), entry('tp', 'r2')], 'tp', 'r1', next, tripProfileIds, routeIds);
    expect(result).toEqual([{ tripProfileId: 'tp', routeId: 'r1', factors: next }, entry('tp', 'r2')]);
  });

  it('appends a new pair last', () => {
    const next = factors({ layoverFraction: 0.5 });
    const result = setRouteEstimateFactors([entry('tp', 'r1')], 'tp', 'r2', next, tripProfileIds, routeIds);
    expect(result).toEqual([entry('tp', 'r1'), { tripProfileId: 'tp', routeId: 'r2', factors: next }]);
  });

  it('removes the pair entry when factors are undefined', () => {
    expect(setRouteEstimateFactors([entry('tp', 'r1'), entry('tp', 'r2')], 'tp', 'r1', undefined, tripProfileIds, routeIds)).toEqual([entry('tp', 'r2')]);
  });

  it('drops entries of a Trip Profile that is not in the set', () => {
    const result = setRouteEstimateFactors([entry('gone', 'r1'), entry('tp', 'r2')], 'tp', 'r1', factors({ layoverFraction: 0.5 }), tripProfileIds, routeIds);
    expect(result.map((item) => [item.tripProfileId, item.routeId])).toEqual([['tp', 'r2'], ['tp', 'r1']]);
  });

  it('drops entries of a Route that is not in the set', () => {
    const result = setRouteEstimateFactors([entry('tp', 'gone')], 'tp', 'r1', factors({ layoverFraction: 0.5 }), tripProfileIds, routeIds);
    expect(result.map((item) => item.routeId)).toEqual(['r1']);
  });
});

describe('Route entries follow Trip Profile copy and deletion (Decision 0077)', () => {
  const ownFactors = factors({ layoverFraction: 0.2 });

  it('copies the source own factors and every Route entry, replacing the target Route entries', () => {
    const source = assumptions({
      tripProfileEstimateFactors: [{ tripProfileId: 'src', factors: ownFactors }],
      routeEstimateFactors: [entry('src', 'r1'), entry('src', 'r2'), entry('tgt', 'r3'), entry('other', 'r1')],
    });
    const result = assumptionsAfterTripProfileCopy(source, 'src', 'tgt', later);
    expect(result?.tripProfileEstimateFactors).toEqual([{ tripProfileId: 'src', factors: ownFactors }, { tripProfileId: 'tgt', factors: ownFactors }]);
    // The source's entries stay; the target's old entry (r3) is replaced by clones of the source's entries.
    expect(result?.routeEstimateFactors).toEqual([entry('src', 'r1'), entry('src', 'r2'), entry('other', 'r1'), entry('tgt', 'r1'), entry('tgt', 'r2')]);
    expect(result?.updatedAt).toBe(later);
  });

  it('copies Route entries only, and keeps the target own factors unchanged', () => {
    const source = assumptions({
      tripProfileEstimateFactors: [{ tripProfileId: 'tgt', factors: ownFactors }],
      routeEstimateFactors: [entry('src', 'r1', ownFactors)],
    });
    const result = assumptionsAfterTripProfileCopy(source, 'src', 'tgt', later);
    expect(result).toBeDefined();
    expect(result?.tripProfileEstimateFactors).toEqual([{ tripProfileId: 'tgt', factors: ownFactors }]);
    expect(result?.routeEstimateFactors).toEqual([entry('src', 'r1', ownFactors), { tripProfileId: 'tgt', routeId: 'r1', factors: ownFactors }]);
  });

  it('returns undefined when the source has neither own factors nor Route entries', () => {
    const source = assumptions({ tripProfileEstimateFactors: [{ tripProfileId: 'other', factors: ownFactors }], routeEstimateFactors: [entry('other', 'r1')] });
    expect(assumptionsAfterTripProfileCopy(source, 'src', 'tgt', later)).toBeUndefined();
  });

  it('removes the own factors and Route entries of a deleted Trip Profile, keeping other Profiles', () => {
    const source = assumptions({
      tripProfileEstimateFactors: [{ tripProfileId: 'tp', factors: ownFactors }, { tripProfileId: 'tp2', factors: ownFactors }],
      routeEstimateFactors: [entry('tp', 'r1'), entry('tp2', 'r1')],
    });
    const result = assumptionsAfterTripProfileDeletion(source, 'tp', later);
    expect(result?.tripProfileEstimateFactors).toEqual([{ tripProfileId: 'tp2', factors: ownFactors }]);
    expect(result?.routeEstimateFactors).toEqual([entry('tp2', 'r1')]);
  });

  it('handles a Trip Profile that has Route entries only', () => {
    const source = assumptions({ routeEstimateFactors: [entry('tp', 'r1'), entry('tp2', 'r1')] });
    const result = assumptionsAfterTripProfileDeletion(source, 'tp', later);
    expect(result?.routeEstimateFactors).toEqual([entry('tp2', 'r1')]);
    expect(result?.tripProfileEstimateFactors).toBeUndefined();
  });

  it('returns undefined when the deleted Trip Profile had neither', () => {
    expect(assumptionsAfterTripProfileDeletion(assumptions({ routeEstimateFactors: [entry('tp2', 'r1')] }), 'tp', later)).toBeUndefined();
    expect(assumptionsAfterTripProfileDeletion(undefined, 'tp', later)).toBeUndefined();
  });
});

describe('assumptionsAfterRouteDeletion (Decision 0077)', () => {
  it('drops entries of Routes that no longer exist', () => {
    const source = assumptions({ routeEstimateFactors: [entry('tp', 'r1'), entry('tp', 'r2')] });
    expect(assumptionsAfterRouteDeletion(source, new Set(['r1']), later)?.routeEstimateFactors).toEqual([entry('tp', 'r1')]);
  });

  it('returns undefined when nothing changes', () => {
    expect(assumptionsAfterRouteDeletion(assumptions({ routeEstimateFactors: [entry('tp', 'r1')] }), new Set(['r1', 'r2']), later)).toBeUndefined();
    expect(assumptionsAfterRouteDeletion(assumptions(), new Set(['r1']), later)).toBeUndefined();
    expect(assumptionsAfterRouteDeletion(undefined, new Set(['r1']), later)).toBeUndefined();
  });
});

describe('remapRouteEstimateFactors (Decision 0077)', () => {
  it('renames Trip Profile, Route and service-day IDs', () => {
    const value = factors({}, [{ serviceDayId: 'sat', layoverFraction: 0.3 }]);
    const result = remapRouteEstimateFactors(
      [entry('tp', 'r1', value)],
      new Map([['tp', 'tpNew']]),
      new Map([['r1', 'r1New']]),
      new Map([['sat', 'satNew']]),
    );
    expect(result).toEqual([{ tripProfileId: 'tpNew', routeId: 'r1New', factors: factors({}, [{ serviceDayId: 'satNew', layoverFraction: 0.3 }]) }]);
  });
});

describe('routeEstimateFactorsForTripProfile (Decision 0077)', () => {
  it('returns only the Trip Profile entries, in stored order', () => {
    const source = assumptions({ routeEstimateFactors: [entry('tp', 'r2'), entry('tp2', 'r1'), entry('tp', 'r1')] });
    expect(routeEstimateFactorsForTripProfile(source, 'tp')).toEqual([
      { routeId: 'r2', factors: factors({ layoverFraction: 0.1 }) },
      { routeId: 'r1', factors: factors({ layoverFraction: 0.1 }) },
    ]);
    expect(routeEstimateFactorsForTripProfile(undefined, 'tp')).toEqual([]);
  });
});

describe('validateCostingAssumptions for Route entries (Decision 0077)', () => {
  const base: CostingAssumptionsInput = { rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0 };

  it('reports no finding for unique, valid Route entries', () => {
    const findings = validateCostingAssumptions({ ...base, routeEstimateFactors: [{ routeId: 'r1', factors: factors({ layoverFraction: 0.1 }) }, { routeId: 'r2', factors: factors() }] }, scenarioId);
    expect(findings).toEqual([]);
  });

  it('reports a duplicate Route with its route ID', () => {
    const findings = validateCostingAssumptions({ ...base, routeEstimateFactors: [{ routeId: 'r1', factors: factors() }, { routeId: 'r1', factors: factors() }] }, scenarioId);
    expect(findings).toEqual([expect.objectContaining({
      ruleId: 'costing.routeEstimateFactorDuplicate', severity: 'error', entityType: 'costingAssumptions', entityId: scenarioId, field: 'routeEstimateFactors', parameters: { routeId: 'r1' },
    })]);
  });

  it('validates the factors of each Route entry', () => {
    const findings = validateCostingAssumptions({ ...base, routeEstimateFactors: [{ routeId: 'r1', factors: factors({ layoverFraction: 1 }) }] }, scenarioId);
    expect(findings.map((finding) => finding.ruleId)).toEqual(['costing.estimateFactorInvalid']);
  });
});
