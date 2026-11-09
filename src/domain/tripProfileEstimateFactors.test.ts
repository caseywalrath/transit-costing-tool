import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import {
  assumptionsAfterTripProfileCopy,
  assumptionsAfterTripProfileDeletion,
  calculateEstimatedCosting,
  deriveImpliedService,
  estimateFactorsForTripProfile,
  setTripProfileEstimateFactors,
} from './estimatedCosting';
import type { CostingAssumptions, CostingEstimateFactors, RoutePattern, Trip } from './types';

const stamp = metadata('2026-01-01T00:00:00.000Z');
const scenarioId = 's';
const pattern = (id: string, directionId: string | undefined, routeId = 'r'): RoutePattern => ({ id, scenarioId, routeId, name: id, ...(directionId ? { directionId } : {}), points: [], ...stamp });
let tripNumber = 0;
const trip = (patternId: string, departure: number, runSeconds: number, routeId = 'r', serviceDayId = 'sat'): Trip => ({
  id: `t${++tripNumber}`, scenarioId, routeId, serviceDayId, patternId, tripProfileId: 'tp',
  stopTimes: [{ patternPointId: 'a', sequence: 0, time: departure }, { patternPointId: 'b', sequence: 1, time: departure + runSeconds }],
  provenance: { kind: 'manual' }, ...stamp,
} as Trip);
/** `count` trips every `headway` minutes from 9:00, each `run` minutes long. */
const series = (patternId: string, count: number, headway: number, run: number, routeId = 'r') =>
  Array.from({ length: count }, (_, index) => trip(patternId, 9 * 3600 + index * headway * 60, run * 60, routeId));

const factors = (layoverFraction: number): CostingEstimateFactors => ({ allDays: { layoverFraction }, serviceDays: [] });
const assumptions = (extra: Partial<CostingAssumptions> = {}): CostingAssumptions => ({
  id: 'cost', scenarioId, currencyCode: 'USD', enteredRate: 100, rateYear: 2026, sourceType: 'user', baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0, ...stamp, ...extra,
});

describe('deriveImpliedService (Decision 0062)', () => {
  const patterns = [pattern('out', 'outbound'), pattern('in', 'inbound')];

  it('shows the cycle and vehicles a layover % implies: the Westracks Dinosaur Lot case', () => {
    // 38 minutes out and 41 back every 15 minutes. 15.6% layover implies a 93.6-minute cycle and 6.24 vehicles, not the 90 and 6 planned.
    const trips = [...series('out', 29, 15, 38), ...series('in', 29, 15, 41)];
    const [route] = deriveImpliedService(trips, patterns, 0.156);
    expect(route.roundTripRunSeconds).toBe(79 * 60);
    expect(route.directions.map((direction) => direction.headwaySeconds)).toEqual([900, 900]);
    expect(route.roundTripWithLayoverSeconds! / 60).toBeCloseTo(93.6, 1);
    expect(route.impliedVehicles).toBeCloseTo(6.24, 2);
    // The layover % that matches a 90-minute cycle gives back 6 vehicles.
    expect(deriveImpliedService(trips, patterns, 1 - 79 / 90)[0].impliedVehicles).toBeCloseTo(6, 9);
  });

  it('adds each direction at its own headway, so two loop directions at 30 minutes need 2.5 vehicles each', () => {
    const loops = [pattern('cw', 'outbound'), pattern('ccw', 'inbound')];
    const [route] = deriveImpliedService([...series('cw', 16, 30, 60), ...series('ccw', 15, 30, 60)], loops, 0.2);
    expect(route.impliedVehicles).toBeCloseTo(5, 9);
    expect(route.roundTripWithLayoverSeconds).toBe(150 * 60);
  });

  it('merges the Patterns of one direction and takes the median gap, so a late extra trip does not move the headway', () => {
    const alternating = [pattern('east', 'outbound'), pattern('west', 'outbound')];
    const east = Array.from({ length: 5 }, (_, index) => trip('east', 9 * 3600 + index * 1800, 29 * 60));
    const west = Array.from({ length: 5 }, (_, index) => trip('west', 9 * 3600 + 900 + index * 1800, 35 * 60));
    const extra = trip('west', 20 * 3600, 35 * 60);
    const [route] = deriveImpliedService([...east, ...west, extra], alternating, 0.2);
    expect(route.directions).toHaveLength(1);
    expect(route.directions[0].headwaySeconds).toBe(900);
    expect(route.directions[0].tripCount).toBe(11);
    expect(route.roundTripRunSeconds).toBeCloseTo((5 * 29 + 6 * 35) * 60 / 11, 9);
  });

  it('gives no vehicles without a headway in every direction, and no cycle with layover without a usable layover', () => {
    const single = deriveImpliedService([trip('out', 32400, 2100), ...series('in', 3, 15, 35)], patterns, 0.2)[0];
    expect(single.directions.find((direction) => direction.directionKey === 'outbound')!.headwaySeconds).toBeUndefined();
    expect(single.roundTripWithLayoverSeconds).toBeCloseTo(70 * 60 / 0.8, 9);
    expect(single.impliedVehicles).toBeUndefined();
    for (const layover of [undefined, 1, -0.1, Number.NaN]) {
      const route = deriveImpliedService(series('out', 3, 15, 35), patterns, layover)[0];
      expect(route.roundTripWithLayoverSeconds).toBeUndefined();
      expect(route.impliedVehicles).toBeUndefined();
    }
  });

  it('lists Routes by name and groups a legacy Pattern without a Direction on its own', () => {
    const routes = [{ id: 'r2', scenarioId, name: 'Alpha', ...stamp }, { id: 'r', scenarioId, name: 'Beta', ...stamp }];
    const result = deriveImpliedService([...series('out', 2, 15, 35), ...series('legacy', 2, 20, 30, 'r2')], [...patterns, pattern('legacy', undefined, 'r2')], 0.2, routes);
    expect(result.map((route) => route.routeName)).toEqual(['Alpha', 'Beta']);
    expect(result[0].directions[0].directionKey).toBe('legacy');
  });

  it('is part of each daily row of an estimated basis when the context carries the Patterns', () => {
    const serviceDays = [{ id: 'sat', scenarioId, kind: 'saturday' as const, name: 'Saturday', annualServiceDays: 18, sequence: 0, ...stamp }];
    const base = { scenario: { id: scenarioId, projectId: 'p', name: 'Base', ...stamp }, serviceDays, tripProfile: { id: 'tp', scenarioId, name: 'Default', ...stamp }, trips: series('out', 4, 15, 35) };
    const input = { enteredRate: 100, rateYear: 2026, sourceType: 'user' as const, baseServiceYear: 2026, futureYearCount: 0, annualEscalation: 0, estimateFactors: factors(0.2) };
    expect(calculateEstimatedCosting({ ...base, patterns, assumptions: input }).dailyRows[0].impliedService?.[0].roundTripRunSeconds).toBe(2100);
    expect(calculateEstimatedCosting({ ...base, assumptions: input }).dailyRows[0].impliedService).toBeUndefined();
  });
});

describe('Trip-Profile-owned estimate factors (Decision 0062)', () => {
  it('uses a Trip Profile’s own factors, even empty ones, else the Scenario’s shared factors', () => {
    const record = assumptions({ estimateFactors: factors(0.222), tripProfileEstimateFactors: [{ tripProfileId: 'a', factors: factors(0.122) }, { tripProfileId: 'b', factors: { allDays: {}, serviceDays: [] } }] });
    expect(estimateFactorsForTripProfile(record, 'a')).toEqual({ factors: factors(0.122), owner: 'tripProfile' });
    expect(estimateFactorsForTripProfile(record, 'b')).toEqual({ factors: { allDays: {}, serviceDays: [] }, owner: 'tripProfile' });
    expect(estimateFactorsForTripProfile(record, 'c')).toEqual({ factors: factors(0.222), owner: 'scenario' });
    expect(estimateFactorsForTripProfile(assumptions(), 'c')).toEqual({ owner: 'none' });
    expect(estimateFactorsForTripProfile(undefined, 'c')).toEqual({ owner: 'none' });
  });

  it('replaces or appends one entry, saves blank as an empty set, and drops entries of missing Trip Profiles', () => {
    const ids = new Set(['a', 'b']);
    const first = setTripProfileEstimateFactors(undefined, 'a', factors(0.1), ids);
    expect(first).toEqual([{ tripProfileId: 'a', factors: factors(0.1) }]);
    const second = setTripProfileEstimateFactors([...first, { tripProfileId: 'gone', factors: factors(0.3) }], 'b', undefined, ids);
    expect(second).toEqual([{ tripProfileId: 'a', factors: factors(0.1) }, { tripProfileId: 'b', factors: { allDays: {}, serviceDays: [] } }]);
    expect(setTripProfileEstimateFactors(second, 'a', factors(0.2), ids)[0].factors).toEqual(factors(0.2));
  });

  it('gives a copied Trip Profile the source’s own factors, and changes nothing when the source has none', () => {
    const record = assumptions({ tripProfileEstimateFactors: [{ tripProfileId: 'a', factors: factors(0.1) }] });
    const copied = assumptionsAfterTripProfileCopy(record, 'a', 'a2', '2026-02-01T00:00:00.000Z')!;
    expect(copied.tripProfileEstimateFactors).toEqual([{ tripProfileId: 'a', factors: factors(0.1) }, { tripProfileId: 'a2', factors: factors(0.1) }]);
    expect(copied.tripProfileEstimateFactors![1].factors).not.toBe(copied.tripProfileEstimateFactors![0].factors);
    expect(copied.updatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(assumptionsAfterTripProfileCopy(record, 'other', 'x', 'now')).toBeUndefined();
    expect(assumptionsAfterTripProfileCopy(undefined, 'a', 'x', 'now')).toBeUndefined();
  });

  it('removes a deleted Trip Profile’s entry, and changes nothing when it had none', () => {
    const record = assumptions({ tripProfileEstimateFactors: [{ tripProfileId: 'a', factors: factors(0.1) }, { tripProfileId: 'b', factors: factors(0.2) }] });
    expect(assumptionsAfterTripProfileDeletion(record, 'a', 'now')!.tripProfileEstimateFactors).toEqual([{ tripProfileId: 'b', factors: factors(0.2) }]);
    expect(assumptionsAfterTripProfileDeletion(record, 'c', 'now')).toBeUndefined();
  });
});
