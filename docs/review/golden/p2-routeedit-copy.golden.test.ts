// Phase 2 review reproduction tests: tasks 2.6 (directions and safe route editing) and 2.7 (service-day copy).
// Backs findings 2-004 (point removal under segmentStart leaves Trips marked current although the profile no longer
// reproduces them), 2-005 (rebalancing clears the stale flag of an already-stale Trip), 2-009 (direction-order conflict message
// does not name the Direction).
// Tests named "DEFECT ..." assert the CURRENT defective behaviour; their comments state the expected behaviour.
import { describe, expect, it } from 'vitest';
import { classifyPatternEdit, rebalanceRuntimeProfile, rebalanceTripForPattern, reconcileDirectionTimetable } from '../../../src/domain/safeRouteEditing';
import { propagatePatternTimes } from '../../../src/domain/runtime';
import { buildRuntimeCopyPreview, buildTripCopyPreview } from '../../../src/domain/serviceDayCopy';
import type { Block, Node, RouteDirection, RoutePattern, RuntimeAssignment, RuntimeProfile, ServiceDayDefinition, Trip } from '../../../src/domain/types';

const meta = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const pt = (id: string, nodeId: string, sequence: number, directionColumnId?: string) => ({ id, nodeId, sequence, cumulativeMiles: sequence, ...(directionColumnId ? { directionColumnId } : {}) });
const pattern = (id: string, points: RoutePattern['points'], name = id): RoutePattern => ({ ...meta, id, scenarioId: 's', routeId: 'r', name, directionId: 'out', points });
const nodes: Node[] = ['A', 'B', 'C', 'D'].map((id) => ({ ...meta, id, scenarioId: 's', routeId: 'r', name: `Node ${id}`, kind: 'timepoint' }));
const direction: RouteDirection = { ...meta, id: 'out', scenarioId: 's', routeId: 'r', name: 'Outbound', group: 'outbound', sequence: 0, columns: [] };
const abc = pattern('abc', [pt('a', 'A', 0), pt('b', 'B', 1), pt('c', 'C', 2)]);
const ac = pattern('abc', [pt('a', 'A', 0), pt('c', 'C', 1)]);
const segProfile: RuntimeProfile = { ...meta, id: 'rp', scenarioId: 's', routeId: 'r', patternId: 'abc', name: 'W', calculationMethod: 'segmentStart', calculationRevision: 3, bands: [
  { id: 'am', label: 'AM', sequence: 0, startTime: 0, endTime: 3600, segmentRuntimeSeconds: [600, 600] },
  { id: 'pm', label: 'PM', sequence: 1, startTime: 3600, endTime: 7200, segmentRuntimeSeconds: [1200, 1200] },
] };
const tripOn = (id: string, p: RoutePattern, times: number[], revision = 3, extra: Partial<Trip> = {}): Trip => ({ ...meta, id, scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId: p.id, tripProfileId: 'tp', stopTimes: times.map((time, sequence) => ({ patternPointId: p.points[sequence].id, sequence, time })), provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [], runtimeProfileId: 'rp', runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: 'rp', runtimeCalculationRevision: revision } }, ...extra });
const times = (r: ReturnType<typeof propagatePatternTimes>) => ('finding' in r ? r.finding.ruleId : r.stopTimes.map((p) => p.time));

describe('2.6 direction reconciliation', () => {
  it('loop with a repeated node gets distinct columns; adding a short-turn keeps existing column IDs', () => {
    const loop = pattern('loop', [pt('l1', 'A', 0), pt('l2', 'B', 1), pt('l3', 'C', 2), pt('l4', 'A', 3)]);
    const first = reconcileDirectionTimetable(direction, [loop], nodes, meta.createdAt);
    expect(first.conflict).toBeUndefined();
    const columns = first.directions[0].columns;
    expect(columns.map((column) => column.nodeId)).toEqual(['A', 'B', 'C', 'A']);
    const mappedLoop = first.patterns[0];
    const short = pattern('short', [pt('s1', 'B', 0), pt('s2', 'C', 1)]);
    const second = reconcileDirectionTimetable(first.directions[0], [mappedLoop, short], nodes, meta.createdAt);
    expect(second.directions[0].columns.map((column) => column.id)).toEqual(columns.map((column) => column.id));
    expect(second.patterns.find((item) => item.id === 'short')!.points.map((point) => point.directionColumnId)).toEqual([columns[1].id, columns[2].id]);
  });
  it('offset pattern inserting a new node between existing columns is ordered topologically', () => {
    const base = reconcileDirectionTimetable(direction, [abc], nodes, meta.createdAt);
    const offset = pattern('off', [pt('o1', 'A', 0), pt('o2', 'D', 1), pt('o3', 'C', 2)]);
    const result = reconcileDirectionTimetable(base.directions[0], [base.patterns[0], offset], nodes, meta.createdAt);
    const order = result.directions[0].columns.map((column) => column.nodeId);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('D'));
    expect(order.indexOf('D')).toBeLessThan(order.indexOf('C'));
  });
  // 2-009. Decision 0014 item 4: "The message names the Direction, Patterns, and timepoints."
  it('DEFECT 2-009: cycle conflict message names Patterns and timepoints but not the Direction', () => {
    const forward = pattern('f', [pt('f1', 'A', 0), pt('f2', 'B', 1)], 'Forward');
    const backward = pattern('g', [pt('g1', 'B', 0), pt('g2', 'A', 1)], 'Backward');
    const result = reconcileDirectionTimetable(direction, [forward, backward], nodes, meta.createdAt);
    expect(result.conflict?.patternNames.sort()).toEqual(['Backward', 'Forward']);
    expect(result.conflict?.message).toContain('Node A');
    expect(result.conflict?.message).toContain('Node B');
    expect(result.conflict?.directionName).toBe('Outbound');
    expect(result.conflict?.message).not.toContain('Outbound');
  });
  it('reordering retained points requires reset; insertion/removal is deterministic; full replacement requires reset', () => {
    expect(classifyPatternEdit(abc, pattern('abc', [pt('b', 'B', 0), pt('a', 'A', 1), pt('c', 'C', 2)]))).toBe('reset');
    expect(classifyPatternEdit(abc, ac)).toBe('deterministic');
    expect(classifyPatternEdit(abc, pattern('abc', [pt('a', 'A', 0), pt('d', 'D', 1), pt('b', 'B', 2), pt('c', 'C', 3)]))).toBe('deterministic');
    expect(classifyPatternEdit(abc, pattern('abc', [pt('x', 'A', 0), pt('y', 'C', 1)]))).toBe('reset');
  });
});

describe('2.6 deterministic rebalance (Decision 0014 items 5-6)', () => {
  it('insertion: predecessor-to-new is zero and new-to-successor keeps the former runtime; Trip gets the predecessor time', () => {
    const inserted = pattern('abc', [pt('a', 'A', 0), pt('d', 'D', 1), pt('b', 'B', 2), pt('c', 'C', 3)]);
    const profile = rebalanceRuntimeProfile(segProfile, abc, inserted, meta.createdAt);
    expect(profile.bands.map((band) => band.segmentRuntimeSeconds)).toEqual([[0, 600, 600], [0, 1200, 1200]]);
    const trip = rebalanceTripForPattern(tripOn('t', abc, [3000, 3600, 4800]), abc, inserted, new Map([[profile.id, profile]]), meta.createdAt);
    expect(trip.stopTimes.map((point) => point.time)).toEqual([3000, 3000, 3600, 4800]);
    expect(times(propagatePatternTimes(inserted, 3000, profile))).toEqual([3000, 3000, 3600, 4800]);
  });
  // 2-004. Overview Runtime Model: "Existing trips record the profile and revision used for their current times." Expected: after a
  // point removal, a Trip is recorded at the new revision only if the rebalanced profile reproduces its saved times; otherwise it remains
  // stale. Actual (segmentStart, the default method): the merged segment uses only the start band, the saved time at C came from two bands,
  // and the Trip is still stamped with the new revision, so it is not flagged stale.
  it('DEFECT 2-004: point removal under segmentStart stamps the Trip current although the profile no longer reproduces it', () => {
    const profile = rebalanceRuntimeProfile(segProfile, abc, ac, meta.createdAt);
    expect(profile.calculationRevision).toBe(4);
    expect(profile.bands.map((band) => band.segmentRuntimeSeconds)).toEqual([[1200], [2400]]);
    const trip = rebalanceTripForPattern(tripOn('t', abc, [3000, 3600, 4800]), abc, ac, new Map([[profile.id, profile]]), meta.createdAt);
    expect(trip.stopTimes.map((point) => point.time)).toEqual([3000, 4800]);
    expect(trip.provenance.calculationSource).toEqual({ runtimeProfileId: 'rp', runtimeCalculationRevision: 4 });
    expect(times(propagatePatternTimes(ac, 3000, profile))).toEqual([3000, 4200]); // profile now gives 4200, saved Trip says 4800
  });
  // 2-005. Expected: a Trip whose revision was already older than the profile stays stale after a rebalance.
  it('DEFECT 2-005: rebalancing an already-stale Trip stamps it with the new revision and clears its stale state', () => {
    const singleBand: RuntimeProfile = { ...segProfile, calculationMethod: undefined };
    const inserted = pattern('abc', [pt('a', 'A', 0), pt('d', 'D', 1), pt('b', 'B', 2), pt('c', 'C', 3)]);
    const profile = rebalanceRuntimeProfile(singleBand, abc, inserted, meta.createdAt);
    const staleTrip = tripOn('t', abc, [1000, 1700, 2400], 1); // revision 1 < profile revision 3: stale before the edit (times do not match 600 s segments)
    const rebalanced = rebalanceTripForPattern(staleTrip, abc, inserted, new Map([[profile.id, profile]]), meta.createdAt);
    expect(rebalanced.provenance.calculationSource?.runtimeCalculationRevision).toBe(profile.calculationRevision);
    expect(times(propagatePatternTimes(inserted, 1000, profile))).not.toEqual(rebalanced.stopTimes.map((point) => point.time));
  });
});

describe('2.7 service-day copy', () => {
  const day = (id: string, name: string): ServiceDayDefinition => ({ ...meta, id, scenarioId: 's', kind: id === 'wk' ? 'weekday' : 'saturday', name, annualServiceDays: 52, sequence: 0 });
  const wk = day('wk', 'Weekday'); const sa = day('sa', 'Saturday');
  const assign = (id: string, serviceDayId: string, runtimeProfileId: string): RuntimeAssignment => ({ ...meta, id, scenarioId: 's', patternId: 'abc', serviceDayId, runtimeProfileId });
  it('independent copy creates a new profile and assignment; shared copy reuses the source profile; target assignment is replaced', () => {
    const request = { scenarioId: 's', routeId: 'r', sourceServiceDayId: 'wk', targetServiceDayId: 'sa' };
    const independent = buildRuntimeCopyPreview({ ...request, mode: 'independent' }, wk, sa, [abc], [assign('w', 'wk', 'rp')], [assign('old', 'sa', 'rp-old')], [segProfile], [], meta.createdAt);
    expect(independent.profiles).toHaveLength(1);
    expect(independent.profiles[0].id).not.toBe('rp');
    expect(independent.profiles[0].name).toBe('W (Saturday)');
    expect(independent.assignments[0].runtimeProfileId).toBe(independent.profiles[0].id);
    expect(independent.replaceAssignmentIds).toEqual(['old']);
    const shared = buildRuntimeCopyPreview({ ...request, mode: 'shared' }, wk, sa, [abc], [assign('w', 'wk', 'rp')], [], [segProfile], [], meta.createdAt);
    expect(shared.profiles).toEqual([]);
    expect(shared.assignments[0].runtimeProfileId).toBe('rp');
  });
  it('Trip copy replaces target Trips, removes their revenue activities and adjacent deadheads, keeps boundaries, and keeps provenance', () => {
    const request = { scenarioId: 's', routeId: 'r', tripProfileId: 'tp', sourceServiceDayId: 'wk', targetServiceDayId: 'sa', allowEmptySource: false };
    const source = tripOn('src', abc, [3000, 3600, 4800]);
    const target1 = tripOn('t1', abc, [100, 200, 300], 3, { serviceDayId: 'sa' });
    const target2 = tripOn('t2', abc, [400, 500, 600], 3, { serviceDayId: 'sa' });
    const block: Block = { ...meta, id: 'b', scenarioId: 's', serviceDayId: 'sa', blockingScenarioId: 'bs', label: '1', activities: [
      { id: 'o', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A' },
      { id: 'r1', type: 'revenueTrip', sequence: 1, tripId: 't1' },
      { id: 'd', type: 'deadhead', sequence: 2, minutesAfterPreviousTrip: 1, fromNodeId: 'C', toNodeId: 'A' },
      { id: 'r2', type: 'revenueTrip', sequence: 3, tripId: 't2' },
      { id: 'i', type: 'pullIn', sequence: 4, minutesAfterLastTrip: 10, fromNodeId: 'C' },
    ] };
    const preview = buildTripCopyPreview(request, wk, sa, [abc], [source], [target1, target2], [block], [], [], meta.createdAt);
    expect(preview.removedTripIds).toEqual(['t1', 't2']);
    expect(preview.adjustedBlocks[0].activities.map((activity) => activity.type)).toEqual(['pullOut', 'pullIn']);
    expect(preview.impact.removedBlockActivityCount).toBe(2);
    expect(preview.copiedTrips[0]).toMatchObject({ serviceDayId: 'sa', tripProfileId: 'tp' });
    expect(preview.copiedTrips[0].id).not.toBe('src');
    expect(preview.copiedTrips[0].provenance.calculationSource).toEqual(source.provenance.calculationSource); // Decision 0017 item 7
    expect(preview.impact.missingTargetRuntimeAssignmentPatternIds).toEqual(['abc']);
  });
  it('empty source requires explicit clear; with allowEmptySource it previews a full clear', () => {
    const request = { scenarioId: 's', routeId: 'r', tripProfileId: 'tp', sourceServiceDayId: 'wk', targetServiceDayId: 'sa', allowEmptySource: false };
    const target = tripOn('t1', abc, [100, 200, 300], 3, { serviceDayId: 'sa' });
    expect(buildTripCopyPreview(request, wk, sa, [abc], [], [target], [], [], [], meta.createdAt).findings.map((item) => item.ruleId)).toContain('tripCopy.emptySourceRequiresExplicitClear');
    const clear = buildTripCopyPreview({ ...request, allowEmptySource: true }, wk, sa, [abc], [], [target], [], [], [], meta.createdAt);
    expect(clear.findings).toEqual([]);
    expect(clear.removedTripIds).toEqual(['t1']);
    expect(clear.impact.requiresExplicitEmptySourceReview).toBe(true);
  });
  it('source signature changes when a target Trip changes', () => {
    const request = { scenarioId: 's', routeId: 'r', tripProfileId: 'tp', sourceServiceDayId: 'wk', targetServiceDayId: 'sa', allowEmptySource: false };
    const source = tripOn('src', abc, [3000, 3600, 4800]);
    const target = tripOn('t1', abc, [100, 200, 300], 3, { serviceDayId: 'sa' });
    const before = buildTripCopyPreview(request, wk, sa, [abc], [source], [target], [], [], [], meta.createdAt).sourceSignature;
    const after = buildTripCopyPreview(request, wk, sa, [abc], [source], [{ ...target, updatedAt: '2026-01-02T00:00:00.000Z' }], [], [], [], meta.createdAt).sourceSignature;
    expect(after).not.toEqual(before);
  });
});
