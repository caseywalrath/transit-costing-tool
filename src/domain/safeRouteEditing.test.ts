import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { createManagedDirections } from './directions';
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
    const profile: RuntimeProfile = { id: 'profile', scenarioId: 'scenario', routeId: 'route', patternId: saved.id, name: 'Default', calculationRevision: 4, bands: [], ...metadata(now) };
    const trip: Trip = { id: 'trip', scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: saved.id, stopTimes: [{ patternPointId: 'a-point', sequence: 0, time: 21600 }, { patternPointId: 'c-point', sequence: 1, time: 22200 }], provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: ['times'], manualTimeShiftSeconds: 120, runtimeProfileId: profile.id, runtimeCalculationRevision: 3, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: 3 } }, ...metadata(now) };
    const result = rebalanceTripForPattern(trip, saved, proposed, new Map([[profile.id, profile]]), now);
    expect(result.id).toBe('trip');
    expect(result.stopTimes.map((point) => point.time)).toEqual([21600, 21600, 22200]);
    expect(result.provenance.manualTimeShiftSeconds).toBe(120);
    expect(result.provenance.calculationSource?.runtimeCalculationRevision).toBe(4);
  });
});
