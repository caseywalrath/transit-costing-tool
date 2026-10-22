// Phase 2 review reproduction tests: task 2.8 (Blocking calculations), 15 hand-computed Block shapes.
// Expected values were computed by hand from Decisions 0020, 0022, 0023, 0026 and phase-04-manual-blocking.md "Fixed calculations",
// not from summarizeBlock. Backs findings 2-006 (legacy explicit deadhead placement outside the connection gap is not validated) and
// 2-012 (Pattern distance has no "missing" state; zero is treated as complete), and covers the cross-Trip-Profile rejection lead.
// Tests named "DEFECT ..." assert the CURRENT defective behaviour; their comments state the expected behaviour.
import { describe, expect, it } from 'vitest';
import { applyTripAssignment, summarizeBlock, validateBlockingBlock } from '../../../src/domain/blocking';
import { evaluateBlockEligibility } from '../../../src/domain/costing';
import type { BlockActivity, BlockingBlock, BlockingScenario, RoutePattern, Scenario, Trip } from '../../../src/domain/types';

const meta = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const H = 3600; const M = 60;
const az: RoutePattern = { ...meta, id: 'az', scenarioId: 's', routeId: 'r', name: 'AZ', points: [{ id: 'az0', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'az1', nodeId: 'Z', sequence: 1, cumulativeMiles: 10 }] };
const za: RoutePattern = { ...az, id: 'za', name: 'ZA', points: [{ id: 'za0', nodeId: 'Z', sequence: 0, cumulativeMiles: 0 }, { id: 'za1', nodeId: 'A', sequence: 1, cumulativeMiles: 10 }] };
const zeroMiles: RoutePattern = { ...az, id: 'nomiles', points: az.points.map((point) => ({ ...point, cumulativeMiles: 0 })) };
const patterns = [az, za, zeroMiles];
const scenario: Scenario = { ...meta, id: 's', projectId: 'p', name: 'S' };
const bs: BlockingScenario = { ...meta, id: 'bs', scenarioId: 's', tripProfileId: 'tp', name: 'Plan' };
let trips: Trip[] = [];
function trip(id: string, start: number, end: number, pattern = az, extra: Partial<Trip> = {}): Trip {
  const created: Trip = { ...meta, id, scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId: pattern.id, tripProfileId: 'tp', stopTimes: [{ patternPointId: pattern.points[0].id, sequence: 0, time: start }, { patternPointId: pattern.points[1].id, sequence: 1, time: end }], provenance: { kind: 'manual', manuallyChangedFields: [] }, ...extra };
  trips.push(created); return created;
}
const rev = (tripId: string): BlockActivity => ({ id: `r-${tripId}`, type: 'revenueTrip', sequence: 0, tripId });
const out = (minutes: number, miles?: number): BlockActivity => ({ id: 'out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: minutes, toNodeId: 'A', ...(miles === undefined ? {} : { miles }) });
const inn = (minutes: number, miles?: number): BlockActivity => ({ id: 'in', type: 'pullIn', sequence: 0, minutesAfterLastTrip: minutes, fromNodeId: 'A', ...(miles === undefined ? {} : { miles }) });
const dh = (minutes: number, from = 'Z', to = 'A', miles?: number): BlockActivity => ({ id: 'dh', type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: minutes, fromNodeId: from, toNodeId: to, ...(miles === undefined ? {} : { miles }) });
const block = (activities: BlockActivity[]): BlockingBlock => ({ ...meta, id: 'b', scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'wk', label: 'B', activities: activities.map((activity, sequence) => ({ ...activity, sequence })) });
const summarize = (b: BlockingBlock) => summarizeBlock(b, { scenario, blockingScenario: bs, trips, patterns });
const ids = (b: BlockingBlock) => summarize(b).findings.map((item) => item.ruleId).sort();
const close = (actual: number | undefined, expected: number) => { expect(actual).toBeDefined(); expect(Math.abs(actual! - expected)).toBeLessThan(1e-12); };

describe('2.8 Block shapes (hand-computed)', () => {
  it('S1 empty Block: valid, no hours, platform incomplete; costing treats it as empty', () => {
    trips = [];
    const s = summarize(block([]));
    expect([s.valid, s.revenueHours, s.runningHours, s.platformHours, s.deadheadHours]).toEqual([true, 0, 0, undefined, 0]);
    expect(evaluateBlockEligibility(block([]), s, scenario, bs, new Set(['wk']))).toEqual({ eligible: false, empty: true, reasonCodes: [] });
  });
  it('S2 one Trip 6:00-7:00 with 30/30 relative boundaries: running 1, revenue 1, platform 2, deadhead 1', () => {
    trips = []; trip('t1', 6 * H, 7 * H);
    const s = summarize(block([out(30, 1), rev('t1'), inn(30, 1)]));
    close(s.runningHours, 1); close(s.revenueHours, 1); close(s.platformHours, 2); close(s.deadheadHours, 1); close(s.layoverHours, 0);
    expect(s.activityTimings.find((item) => item.activityId === 'out')).toEqual({ activityId: 'out', startTime: 5.5 * H, endTime: 6 * H });
    expect(s.revenueMiles).toBe(10); expect(s.platformMiles).toBe(12); expect(s.status).toBe('complete');
  });
  it('S3 same-terminal connection, 10-minute layover: revenue = running 2 h + 10 min', () => {
    trips = []; trip('t1', 6 * H, 7 * H); trip('t2', 7 * H + 10 * M, 8 * H + 10 * M, za);
    const s = summarize(block([out(15), rev('t1'), rev('t2'), inn(15)]));
    close(s.runningHours, 2); close(s.layoverHours, 10 / 60); close(s.revenueHours, 2 + 10 / 60); close(s.platformHours, (8 * H + 25 * M - (5 * H + 45 * M)) / H);
    expect(s.connections[0]).toMatchObject({ previousTripId: 't1', nextTripId: 't2', rawGapSeconds: 600, usableLayoverSeconds: 600, status: 'valid' });
  });
  it('S4 terminal mismatch without deadhead: connection incomplete, layover excluded, Block still valid but costing-ineligible', () => {
    trips = []; trip('t1', 6 * H, 7 * H); trip('t2', 7 * H + 30 * M, 8 * H + 30 * M); // Z then A
    const b = block([out(15), rev('t1'), rev('t2'), inn(15)]);
    const s = summarize(b);
    close(s.revenueHours, 2); expect(s.valid).toBe(true); expect(s.connections[0].status).toBe('incomplete');
    expect(evaluateBlockEligibility(b, s, scenario, bs, new Set(['wk'])).reasonCodes).toEqual(['block.connectionIncomplete']);
  });
  it('S5 relative deadhead 20 min in a 30-min gap: layover 10 min, deadhead hours include it', () => {
    trips = []; trip('t1', 6 * H, 7 * H); trip('t2', 7 * H + 30 * M, 8 * H + 30 * M);
    const s = summarize(block([out(15), rev('t1'), dh(20), rev('t2'), inn(15)]));
    close(s.layoverHours, 10 / 60); close(s.revenueHours, 2 + 10 / 60); close(s.deadheadHours, 50 / 60); close(s.platformHours, 3);
    expect(s.connections[0].status).toBe('valid'); expect(s.valid).toBe(true);
  });
  it('S6 deadhead longer than the gap: deadheadDoesNotFit, negative layover not counted, Block invalid', () => {
    trips = []; trip('t1', 6 * H, 7 * H); trip('t2', 7 * H + 10 * M, 8 * H + 10 * M);
    const s = summarize(block([out(15), rev('t1'), dh(20), rev('t2'), inn(15)]));
    close(s.layoverHours, 0); close(s.revenueHours, 2); expect(s.valid).toBe(false); expect(s.connections[0].usableLayoverSeconds).toBe(-600);
    expect(ids(block([out(15), rev('t1'), dh(20), rev('t2'), inn(15)]))).toContain('block.deadheadDoesNotFit');
  });
  it('S7 overlapping Trips: connectionOverlap marks the pair, Block invalid, no layover', () => {
    trips = []; trip('t1', 6 * H, 7 * H); trip('t2', 6 * H + 50 * M, 7 * H + 50 * M, za);
    const s = summarize(block([out(15), rev('t1'), rev('t2'), inn(15)]));
    expect(s.connections[0]).toMatchObject({ previousTripId: 't1', nextTripId: 't2', rawGapSeconds: -600, status: 'conflict' });
    expect(s.valid).toBe(false); close(s.layoverHours, 0);
  });
  it('S8 legacy explicit boundary times: platform from explicit pull-out start to explicit pull-in end', () => {
    trips = []; trip('t1', 6 * H, 7 * H);
    const s = summarize(block([{ id: 'out', type: 'pullOut', sequence: 0, startTime: 5 * H + 30 * M, endTime: 5 * H + 50 * M, toNodeId: 'A' }, rev('t1'), { id: 'in', type: 'pullIn', sequence: 0, startTime: 7 * H, endTime: 7 * H + 20 * M, fromNodeId: 'Z' }]));
    close(s.platformHours, (7 * H + 20 * M - (5 * H + 30 * M)) / H); close(s.deadheadHours, 40 / 60);
  });
  it('S9 both relative and explicit boundary timing present: structural rejection', () => {
    trips = []; trip('t1', 6 * H, 7 * H);
    const b = block([{ id: 'out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, startTime: 5 * H, endTime: 6 * H, toNodeId: 'A' }, rev('t1'), inn(10)]);
    expect(validateBlockingBlock(b, { trips, patterns }).filter((item) => item.category === 'structural').map((item) => item.ruleId)).toEqual(['block.boundaryTiming']);
    const both = block([out(10), rev('t1'), { id: 'd', type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: 5, startTime: 1, endTime: 2, fromNodeId: 'Z', toNodeId: 'A' }, rev('t1'), inn(10)]);
    expect(validateBlockingBlock(both, { trips, patterns }).map((item) => item.ruleId)).toContain('block.activityTime');
  });
  it('S10 multi-route Block (imported): summarized in full; assignment refuses to add another Route', () => {
    trips = []; trip('t1', 6 * H, 7 * H); trip('t2', 7 * H + 10 * M, 8 * H, za, { routeId: 'r2' }); trip('t3', 9 * H, 10 * H, az, { routeId: 'r2' });
    const s = summarize(block([out(10), rev('t1'), rev('t2'), inn(10)]));
    close(s.revenueHours, 2); expect(s.valid).toBe(true);
    const single = block([rev('t1')]);
    expect(() => applyTripAssignment({ blockingScenarioId: 'bs', serviceDayId: 'wk', tripId: 't3', destinationBlockId: 'b' }, bs, [single], trips)).toThrow(/another Route/);
  });
  it('S11 relative pull-out before 0:00: platform incomplete (platformBoundaryTimeInvalid), costing excludes', () => {
    trips = []; trip('t1', 10 * M, H);
    const b = block([out(20), rev('t1'), inn(10)]);
    const s = summarize(b);
    expect(s.platformHours).toBeUndefined(); expect(ids(b)).toContain('block.platformBoundaryTimeInvalid');
    expect(evaluateBlockEligibility(b, s, scenario, bs, new Set(['wk'])).eligible).toBe(false);
  });
  it('S12 missing deadhead miles: platform miles incomplete (never zero), Block still costing-eligible', () => {
    trips = []; trip('t1', 6 * H, 7 * H); trip('t2', 7 * H + 30 * M, 8 * H + 30 * M);
    const b = block([out(15, 1), rev('t1'), dh(20), rev('t2'), inn(15, 1)]);
    const s = summarize(b);
    expect(s.revenueMiles).toBe(20); expect(s.platformMiles).toBeUndefined(); expect(ids(b)).toContain('block.platformMilesIncomplete');
    expect(evaluateBlockEligibility(b, s, scenario, bs, new Set(['wk'])).eligible).toBe(true);
  });
  it('S13 cross-Trip-Profile Trip: assignment rejected and validation reports block.tripProfile', () => {
    trips = []; trip('t1', 6 * H, 7 * H); trip('other', 8 * H, 9 * H, az, { tripProfileId: 'tp2' });
    expect(() => applyTripAssignment({ blockingScenarioId: 'bs', serviceDayId: 'wk', tripId: 'other', destinationBlockId: 'b' }, bs, [block([rev('t1')])], trips)).toThrow(/outside the Blocking Scenario/);
    expect(validateBlockingBlock(block([rev('other')]), { trips, patterns, blockingScenario: bs }).map((item) => item.ruleId)).toContain('block.tripProfile');
  });
  // 2-006. Decision 0020 item 14: usable layover equals the gap minus deadhead duration "subject to explicit deadhead placement and
  // Node-continuity validation". Expected: a legacy explicit deadhead whose times lie outside the gap between its two Trips is reported.
  it('DEFECT 2-006 S14: legacy explicit deadhead placed outside the connection gap is accepted as fitting', () => {
    trips = []; trip('t1', 6 * H, 7 * H); trip('t2', 7 * H + 30 * M, 8 * H + 30 * M);
    const b = block([out(15), rev('t1'), { id: 'd', type: 'deadhead', sequence: 0, startTime: 9 * H, endTime: 9 * H + 10 * M, fromNodeId: 'Z', toNodeId: 'A' }, rev('t2'), inn(15)]);
    const s = summarize(b);
    expect(s.connections[0]).toMatchObject({ status: 'valid', usableLayoverSeconds: 20 * M });
    expect(s.valid).toBe(true);
    expect(evaluateBlockEligibility(b, s, scenario, bs, new Set(['wk'])).eligible).toBe(true);
  });
  // 2-012. Decision 0020 item 20: "missing mileage remains incomplete and is never treated as zero." Expected: a Pattern without entered
  // distances is reported as incomplete mileage. Actual: PatternPoint.cumulativeMiles is a required number defaulting to 0
  // (src/domain/commands.ts:4), so an un-entered Pattern contributes 0 revenue miles and is "complete".
  it('DEFECT 2-012 S15: a Pattern with all-zero cumulative miles yields 0 revenue miles reported as complete', () => {
    trips = []; trip('t1', 6 * H, 7 * H, zeroMiles);
    const b = block([out(15, 0), rev('t1'), inn(15, 0)]);
    const s = summarize(b);
    expect(s.revenueMiles).toBe(0); expect(s.platformMiles).toBe(0); expect(s.complete).toBe(true);
  });
  // 2-006 (second case). Expected: a legacy explicit pull-out that starts after the first revenue Trip has started is reported.
  it('DEFECT 2-006 S16: legacy explicit pull-out starting after the first Trip departs understates Platform hours with no finding', () => {
    trips = []; trip('t1', 6 * H, 7 * H);
    const b = block([{ id: 'out', type: 'pullOut', sequence: 0, startTime: 6 * H + 30 * M, endTime: 6 * H + 40 * M, toNodeId: 'A' }, rev('t1'), inn(30)]);
    const s = summarize(b);
    close(s.platformHours, 1); // 6:30 -> 7:30, while the Trip alone runs 6:00 -> 7:00 (Revenue 1 h; true span with boundaries >= 1.5 h)
    expect(s.findings.filter((item) => item.ruleId !== 'block.platformMilesIncomplete' && item.ruleId !== 'block.revenueMilesIncomplete')).toEqual([]);
    expect(evaluateBlockEligibility(b, s, scenario, bs, new Set(['wk'])).eligible).toBe(true);
  });
});

