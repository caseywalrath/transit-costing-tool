import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { createManagedDirections } from './directions';
import { propagatePatternTimes } from './runtime';
import { rebalanceRuntimeProfile, rebalanceTripForPattern, reconcileRouteTimetables } from './safeRouteEditing';
import type { Node, RouteDefinitionAggregate, RoutePattern, RuntimeProfile, Trip } from './types';

const now = '2026-09-13T00:00:00.000Z';
const nodes: Node[] = ['a', 'b', 'c'].map((id, index) => ({ id, scenarioId: 'scenario', routeId: 'route', name: id.toUpperCase(), kind: index === 0 ? 'terminal' : 'timepoint', ...metadata(now) }));
const directions = createManagedDirections('scenario', 'route', now);
const outbound = directions[0];
const pattern = (id: string, name: string, nodeIds: string[], pointIds = nodeIds.map((nodeId, index) => `${id}-${nodeId}-${index}`)): RoutePattern => ({
  id, scenarioId: 'scenario', routeId: 'route', name, directionId: outbound.id,
  points: nodeIds.map((nodeId, sequence) => ({ id: pointIds[sequence], nodeId, sequence, cumulativeMiles: sequence })),
  ...metadata(now),
});
const aggregate = (patterns: RoutePattern[], columns = []): RouteDefinitionAggregate => ({ route: { id: 'route', scenarioId: 'scenario', name: 'Route', ...metadata(now) }, nodes, patterns, directions: [{ ...outbound, columns }, directions[1]] });

describe('safe route editing', () => {
  it('reconciles compatible full and short patterns into one stable timetable order', () => {
    const full = pattern('full', 'Full', ['a', 'b', 'c']);
    const short = pattern('short', 'Short', ['b', 'c']);
    const result = reconcileRouteTimetables(aggregate([full, short]), [full, short], now);
    expect(result.conflict).toBeUndefined();
    expect(result.directions[0].columns.map((column) => column.nodeId)).toEqual(['a', 'b', 'c']);
    expect(result.patterns.find((candidate) => candidate.id === short.id)?.points.map((point) => point.directionColumnId)).toEqual(result.directions[0].columns.slice(1).map((column) => column.id));
  });

  it('gives loop visits distinct timetable columns', () => {
    const loop = pattern('loop', 'Loop', ['a', 'b', 'a']);
    const result = reconcileRouteTimetables(aggregate([loop]), [loop], now);
    expect(result.conflict).toBeUndefined();
    expect(result.directions[0].columns.map((column) => column.nodeId)).toEqual(['a', 'b', 'a']);
    expect(new Set(result.patterns[0].points.map((point) => point.directionColumnId)).size).toBe(3);
  });

  it('blocks contradictory orders with named patterns and timepoints', () => {
    const first = pattern('first', 'Southbound 1', ['a', 'b']);
    const second = pattern('second', 'Southbound 2', ['b', 'a']);
    const result = reconcileRouteTimetables(aggregate([first, second]), [first, second], now);
    expect(result.conflict?.patternNames).toEqual(expect.arrayContaining(['Southbound 1', 'Southbound 2']));
    expect(result.conflict?.message).toContain('A');
    expect(result.conflict?.message).toContain('B');
  });

  it('uses zero minutes before an inserted point and preserves the former following segment', () => {
    const saved = pattern('p', 'Pattern', ['a', 'c'], ['a-point', 'c-point']);
    const proposed = pattern('p', 'Pattern', ['a', 'b', 'c'], ['a-point', 'b-point', 'c-point']);
    const profile: RuntimeProfile = { id: 'profile', scenarioId: 'scenario', routeId: 'route', patternId: saved.id, name: 'Default', calculationRevision: 2, bands: [{ id: 'band', label: 'All day', sequence: 0, startTime: 0, endTime: 86400, segmentRuntimeSeconds: [600] }], ...metadata(now) };
    const rebalanced = rebalanceRuntimeProfile(profile, saved, proposed, now);
    expect(rebalanced.bands[0].segmentRuntimeSeconds).toEqual([0, 600]);
    expect(rebalanced.calculationRevision).toBe(3);
  });

  it('merges adjoining runtimes when a middle point is removed', () => {
    const saved = pattern('p', 'Pattern', ['a', 'b', 'c'], ['a-point', 'b-point', 'c-point']);
    const proposed = pattern('p', 'Pattern', ['a', 'c'], ['a-point', 'c-point']);
    const profile: RuntimeProfile = { id: 'profile', scenarioId: 'scenario', routeId: 'route', patternId: saved.id, name: 'Default', bands: [{ id: 'band', label: 'All day', sequence: 0, startTime: 0, endTime: 86400, segmentRuntimeSeconds: [300, 600] }], ...metadata(now) };
    expect(rebalanceRuntimeProfile(profile, saved, proposed, now).bands[0].segmentRuntimeSeconds).toEqual([900]);
  });

  it('keeps retained trip times and manual shifts while inserting a point', () => {
    const saved = pattern('p', 'Pattern', ['a', 'c'], ['a-point', 'c-point']);
    const proposed = pattern('p', 'Pattern', ['a', 'b', 'c'], ['a-point', 'b-point', 'c-point']);
    // The profile is the rebalanced one (revision 4): a zero-minute segment into the inserted point, then the former 10 minutes.
    const profile: RuntimeProfile = { id: 'profile', scenarioId: 'scenario', routeId: 'route', patternId: saved.id, name: 'Default', calculationRevision: 4, bands: [{ id: 'band', label: 'All day', sequence: 0, startTime: 0, endTime: 86400, segmentRuntimeSeconds: [0, 600] }], ...metadata(now) };
    const trip: Trip = { id: 'trip', scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: saved.id, stopTimes: [{ patternPointId: 'a-point', sequence: 0, time: 21600 }, { patternPointId: 'c-point', sequence: 1, time: 22200 }], provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: ['times'], manualTimeShiftSeconds: 120, runtimeProfileId: profile.id, runtimeCalculationRevision: 3, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: 3 } }, ...metadata(now) };
    const result = rebalanceTripForPattern(trip, saved, proposed, new Map([[profile.id, profile]]), now);
    expect(result.id).toBe('trip');
    expect(result.stopTimes.map((point) => point.time)).toEqual([21600, 21600, 22200]);
    expect(result.provenance.manualTimeShiftSeconds).toBe(120);
    expect(result.provenance.calculationSource?.runtimeCalculationRevision).toBe(4);
  });

  describe('Trip revisions after a deterministic route edit (I-014: 2-004 and 2-005)', () => {
    const abc = pattern('p', 'Pattern', ['a', 'b', 'c'], ['a-point', 'b-point', 'c-point']);
    const ac = pattern('p', 'Pattern', ['a', 'c'], ['a-point', 'c-point']);
    const tripOn = (source: RoutePattern, times: number[], revision: number): Trip => ({
      id: 'trip', scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: source.id,
      stopTimes: times.map((time, sequence) => ({ patternPointId: source.points[sequence].id, sequence, time })),
      provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [], runtimeProfileId: 'profile', runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: 'profile', runtimeCalculationRevision: revision } },
      ...metadata(now),
    });
    const profileOf = (calculationMethod: RuntimeProfile['calculationMethod'], revision: number): RuntimeProfile => ({
      id: 'profile', scenarioId: 'scenario', routeId: 'route', patternId: 'p', name: 'Default', calculationRevision: revision, ...(calculationMethod ? { calculationMethod } : {}),
      bands: [
        { id: 'am', label: 'AM', sequence: 0, startTime: 0, endTime: 3600, segmentRuntimeSeconds: [600, 600] },
        { id: 'pm', label: 'PM', sequence: 1, startTime: 3600, endTime: 7200, segmentRuntimeSeconds: [1200, 1200] },
      ],
      ...metadata(now),
    });
    const recordedRevision = (trip: Trip) => trip.provenance.calculationSource?.runtimeCalculationRevision;

    it('keeps the previous revision when the merged profile no longer reproduces a Trip that crossed two bands', () => {
      const profile = rebalanceRuntimeProfile(profileOf('segmentStart', 3), abc, ac, now);
      expect(profile.calculationRevision).toBe(4);
      expect(profile.bands.map((band) => band.segmentRuntimeSeconds)).toEqual([[1200], [2400]]);
      const trip = rebalanceTripForPattern(tripOn(abc, [3000, 3600, 4800], 3), abc, ac, new Map([[profile.id, profile]]), now);
      expect(trip.stopTimes.map((point) => point.time)).toEqual([3000, 4800]);
      // The profile now gives 4200, not the saved 4800, so the Trip must stay one revision behind and be reported stale.
      const reproduced = propagatePatternTimes(ac, 3000, profile);
      expect('finding' in reproduced ? [] : reproduced.stopTimes.map((point) => point.time)).toEqual([3000, 4200]);
      expect(recordedRevision(trip)).toBe(3);
      expect(trip.provenance.runtimeCalculationRevision).toBe(3);
    });

    it('advances the revision when the rebalanced profile reproduces the Trip, for every calculation method', () => {
      for (const method of [undefined, 'singleBand', 'segmentStart', 'blendSegments'] as const) {
        const before = profileOf(method, 3);
        const inserted = pattern('p', 'Pattern', ['a', 'd', 'b', 'c'], ['a-point', 'd-point', 'b-point', 'c-point']);
        const profile = rebalanceRuntimeProfile(before, abc, inserted, now);
        // Zero minutes into the new point; the Trip gets the predecessor's time there. 600 s segments all in the AM band.
        const trip = rebalanceTripForPattern(tripOn(abc, [1000, 1600, 2200], 3), abc, inserted, new Map([[profile.id, profile]]), now);
        expect(trip.stopTimes.map((point) => point.time)).toEqual([1000, 1000, 1600, 2200]);
        expect(recordedRevision(trip)).toBe(4);
      }
    });

    it('leaves a Trip that was already stale stale: its revision does not move', () => {
      const inserted = pattern('p', 'Pattern', ['a', 'd', 'b', 'c'], ['a-point', 'd-point', 'b-point', 'c-point']);
      const profile = rebalanceRuntimeProfile(profileOf(undefined, 3), abc, inserted, now);
      // Recorded at revision 1 against a profile that was at 3: stale before the edit, and its times differ from the profile's.
      const staleTrip = tripOn(abc, [1000, 1700, 2400], 1);
      const rebalanced = rebalanceTripForPattern(staleTrip, abc, inserted, new Map([[profile.id, profile]]), now);
      expect(recordedRevision(rebalanced)).toBe(1);
      const reproduced = propagatePatternTimes(inserted, 1000, profile);
      expect('finding' in reproduced ? [] : reproduced.stopTimes.map((point) => point.time)).not.toEqual(rebalanced.stopTimes.map((point) => point.time));
    });

    it('leaves a stale Trip stale even when its times happen to match the rebalanced profile', () => {
      const inserted = pattern('p', 'Pattern', ['a', 'd', 'b', 'c'], ['a-point', 'd-point', 'b-point', 'c-point']);
      const profile = rebalanceRuntimeProfile(profileOf(undefined, 3), abc, inserted, now);
      const rebalanced = rebalanceTripForPattern(tripOn(abc, [1000, 1600, 2200], 1), abc, inserted, new Map([[profile.id, profile]]), now);
      expect(recordedRevision(rebalanced)).toBe(1);
    });

    it('keeps a manually shifted Trip current while the profile still calculates its shifted times', () => {
      const inserted = pattern('p', 'Pattern', ['a', 'd', 'b', 'c'], ['a-point', 'd-point', 'b-point', 'c-point']);
      const profile = rebalanceRuntimeProfile(profileOf('segmentStart', 3), abc, inserted, now);
      // Shifted two minutes later by hand, still inside the AM band, so the profile calculates exactly these times.
      const shifted = { ...tripOn(abc, [1120, 1720, 2320], 3), provenance: { ...tripOn(abc, [], 3).provenance, manuallyChangedFields: ['times' as const], manualTimeShiftSeconds: 120 } };
      const rebalanced = rebalanceTripForPattern(shifted, abc, inserted, new Map([[profile.id, profile]]), now);
      expect(rebalanced.provenance.manualTimeShiftSeconds).toBe(120);
      expect(recordedRevision(rebalanced)).toBe(4);
    });

    it('makes a Trip with a hand-edited time stale when the profile cannot calculate it', () => {
      const inserted = pattern('p', 'Pattern', ['a', 'd', 'b', 'c'], ['a-point', 'd-point', 'b-point', 'c-point']);
      const profile = rebalanceRuntimeProfile(profileOf('segmentStart', 3), abc, inserted, now);
      // The middle time was edited by hand to 1700; the profile calculates 1600.
      const edited = tripOn(abc, [1000, 1700, 2200], 3);
      expect(recordedRevision(rebalanceTripForPattern(edited, abc, inserted, new Map([[profile.id, profile]]), now))).toBe(3);
    });

    it('does not stamp a Trip that records no revision', () => {
      const inserted = pattern('p', 'Pattern', ['a', 'd', 'b', 'c'], ['a-point', 'd-point', 'b-point', 'c-point']);
      const profile = rebalanceRuntimeProfile(profileOf(undefined, 3), abc, inserted, now);
      const legacy = { ...tripOn(abc, [1000, 1600, 2200], 3), provenance: { kind: 'manual' as const, manuallyChangedFields: [] } };
      expect(rebalanceTripForPattern(legacy, abc, inserted, new Map([[profile.id, profile]]), now).provenance).toEqual(legacy.provenance);
    });
  });
});
