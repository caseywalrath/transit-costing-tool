import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { compareWithPlan, gapToleranceSeconds } from './plannedFrequencyComparison';
import type { PlannedFrequency, PlannedPeriod, RouteDirection, RoutePattern, Trip } from './types';

const MIN = 60;
const H = 3600;
const meta = metadata('2026-01-01T00:00:00.000Z');
const period = (id: string, startTime: number, endTime: number, headwaySeconds: number): PlannedPeriod => ({ id, startTime, endTime, headwaySeconds });
const plan = (periods: PlannedPeriod[], measure: Record<string, string> = {}): PlannedFrequency => ({
  ...meta, id: 'plan', scenarioId: 's', routeId: 'r', serviceDayId: 'd', periods, measureNodeIdByDirectionId: measure,
});
const direction: RouteDirection = {
  ...meta, id: 'out', scenarioId: 's', routeId: 'r', name: 'Out', group: 'outbound', sequence: 0,
  columns: [{ id: 'c1', nodeId: 'FRCC', sequence: 0 }, { id: 'c2', nodeId: 'WSTMNST', sequence: 1 }, { id: 'c3', nodeId: 'EVANS', sequence: 2 }],
};
const pattern = (id: string, nodeIds: string[], directionId = 'out'): RoutePattern => ({
  ...meta, id, scenarioId: 's', routeId: 'r', name: id, directionId,
  points: nodeIds.map((nodeId, sequence) => ({ id: `${id}-p${sequence}`, nodeId, sequence, cumulativeMiles: sequence })),
});
const main = pattern('main', ['FRCC', 'WSTMNST', 'EVANS']);
let tripSeq = 0;
/** A trip whose first stop departs at `departure`, 10 minutes per segment. */
const trip = (p: RoutePattern, departure: number): Trip => ({
  ...meta, id: `t${String(tripSeq++).padStart(4, '0')}`, scenarioId: 's', routeId: 'r', serviceDayId: 'd', patternId: p.id,
  stopTimes: p.points.map((point, index) => ({ patternPointId: point.id, sequence: index, time: departure + index * 10 * MIN })),
  provenance: { kind: 'generated', manuallyChangedFields: [] },
});
const series = (p: RoutePattern, from: number, to: number, headway: number): Trip[] => {
  const out: Trip[] = [];
  for (let time = from; time < to; time += headway) out.push(trip(p, time));
  return out;
};
const run = (record: PlannedFrequency, trips: Trip[], patterns: RoutePattern[] = [main]) => compareWithPlan({ plan: record, direction, patterns, trips });

describe('compareWithPlan', () => {
  const peak = plan([period('p', 6 * H, 8 * H, 15 * MIN)]);

  it('matches when every trip is on plan', () => {
    const result = run(peak, series(main, 6 * H, 8 * H, 15 * MIN));
    expect(result.periods[0]).toMatchObject({ status: 'matches', reasons: [], plannedTrips: 8, builtTrips: 8, firstTime: 6 * H, lastTime: 7.75 * H });
    expect(result.periods[0].gaps.every((gap) => gap.withinTolerance && gap.seconds === 15 * MIN)).toBe(true);
    expect(result).toMatchObject({ outsidePlan: 0, notMeasured: 0, measureNodeId: 'FRCC', measureNodeFellBack: false });
  });

  it('matches when service starts at 5:55 instead of 6:00 (start edge within half a headway)', () => {
    const result = run(peak, series(main, 5 * H + 55 * MIN, 8 * H - 5 * MIN, 15 * MIN));
    expect(result.periods[0]).toMatchObject({ status: 'matches', builtTrips: 8, firstTime: 5 * H + 55 * MIN });
    expect(result.outsidePlan).toBe(0);
  });

  it('a trip more than half a headway before the start is outside the plan, not in the period', () => {
    const result = run(peak, [trip(main, 5 * H + 50 * MIN), ...series(main, 6 * H, 8 * H, 15 * MIN)]);
    expect(result.outsidePlan).toBe(1);
    expect(result.periods[0].status).toBe('matches');
  });

  it('differs on startEdge when service starts more than half a headway late', () => {
    // 6:10 … 7:40: first trip 10 minutes late, last trip within tolerance of 7:45.
    const result = run(peak, series(main, 6 * H + 10 * MIN, 7 * H + 50 * MIN, 15 * MIN));
    expect(result.periods[0].reasons).toEqual(['startEdge']);
    expect(result.periods[0].status).toBe('differs');
  });

  it('half a headway exactly counts as within', () => {
    const late = series(main, 6 * H + 7.5 * MIN, 8 * H, 15 * MIN);
    expect(run(peak, late).periods[0].reasons).not.toContain('startEdge');
  });

  it('differs on endEdge when service ends early', () => {
    // 6:00 … 7:30: seven trips (within count tolerance), last trip 15 minutes before the 7:45 slot.
    const result = run(peak, series(main, 6 * H, 7 * H + 35 * MIN, 15 * MIN));
    expect(result.periods[0].reasons).toEqual(['endEdge']);
  });

  it('one extra trip within count tolerance shows as gapsOff; two extra trips add extraTrips', () => {
    const base = series(main, 6 * H, 8 * H, 15 * MIN);
    expect(run(peak, [...base, trip(main, 6 * H + 7 * MIN)]).periods[0].reasons).toEqual(['gapsOff']);
    expect(run(peak, [...base, trip(main, 6 * H + 7 * MIN), trip(main, 7 * H + 7 * MIN)]).periods[0].reasons).toEqual(['extraTrips', 'gapsOff']);
  });

  it('one missing trip shows as gapsOff; two missing trips add missingTrips', () => {
    const base = series(main, 6 * H, 8 * H, 15 * MIN);
    const one = base.filter((_, index) => index !== 3);
    expect(run(peak, one).periods[0]).toMatchObject({ reasons: ['gapsOff'], builtTrips: 7 });
    const two = base.filter((_, index) => index !== 3 && index !== 5);
    expect(run(peak, two).periods[0].reasons).toEqual(['missingTrips', 'gapsOff']);
  });

  it('gap tolerance on a 7:30 headway is 60 seconds: 59 off is inside, 61 off is outside', () => {
    expect(gapToleranceSeconds(450)).toBe(60);
    expect(gapToleranceSeconds(30 * MIN)).toBe(180);
    const record = plan([period('p', 6 * H, 7 * H, 450)]);
    const times = (offset: number) => [0, 450, 900 + offset, 1350, 1800, 2250, 2700, 3150].map((t) => trip(main, 6 * H + t));
    const inside = run(record, times(59)).periods[0];
    expect(inside.status).toBe('matches');
    const outside = run(record, times(61)).periods[0];
    expect(outside.reasons).toEqual(['gapsOff']);
    expect(outside.gaps.filter((gap) => !gap.withinTolerance).map((gap) => gap.seconds)).toEqual([511, 389]);
  });

  it('merges two patterns at a mid-route measure node (Federal case)', () => {
    const short = pattern('short', ['WSTMNST', 'EVANS']);
    const record = plan([period('p', 6 * H, 8 * H, 15 * MIN)], { out: 'WSTMNST' });
    // main reaches WSTMNST 10 minutes after FRCC; short starts at WSTMNST. Alternating every 15 at WSTMNST.
    const trips = [
      ...series(main, 5 * H + 50 * MIN, 7 * H + 50 * MIN, 30 * MIN),
      ...series(short, 6 * H + 15 * MIN, 8 * H, 30 * MIN),
    ];
    const result = run(record, trips, [main, short]);
    expect(result.measureNodeId).toBe('WSTMNST');
    expect(result.periods[0]).toMatchObject({ status: 'matches', builtTrips: 8, firstTime: 6 * H, lastTime: 7.75 * H });
    // Each pattern alone would be every 30 and differ.
    expect(run(record, trips.filter((t) => t.patternId === 'short'), [main, short]).periods[0].status).toBe('differs');
  });

  it('counts trips outside every period and trips that do not serve the measure node', () => {
    const elsewhere = pattern('elsewhere', ['EVANS', 'FRCC']);
    const record = plan([period('p', 6 * H, 7 * H, 15 * MIN)], { out: 'WSTMNST' });
    const trips = [...series(main, 5 * H + 50 * MIN, 6 * H + 50 * MIN, 15 * MIN), trip(main, 12 * H), trip(elsewhere, 6 * H)];
    const result = run(record, trips, [main, elsewhere]);
    expect(result.outsidePlan).toBe(1);
    expect(result.notMeasured).toBe(1);
    expect(result.periods[0].status).toBe('matches');
  });

  it('ignores trips of patterns in another direction', () => {
    const inbound = pattern('in', ['EVANS', 'FRCC'], 'in');
    const result = run(peak, [...series(main, 6 * H, 8 * H, 15 * MIN), trip(inbound, 6 * H)], [main, inbound]);
    expect(result).toMatchObject({ outsidePlan: 0, notMeasured: 0 });
  });

  it('an empty period is noTrips', () => {
    const record = plan([period('a', 6 * H, 7 * H, 15 * MIN), period('b', 20 * H, 21 * H, 30 * MIN)]);
    const result = run(record, series(main, 6 * H, 7 * H, 15 * MIN));
    expect(result.periods.map((p) => p.status)).toEqual(['matches', 'noTrips']);
    expect(result.periods[1]).toMatchObject({ reasons: [], builtTrips: 0, plannedTrips: 2, gaps: [] });
  });

  it('does not judge the gap that crosses a period boundary', () => {
    const record = plan([period('a', 6 * H, 8 * H, 30 * MIN), period('b', 8 * H, 9 * H, 15 * MIN)]);
    const trips = [...series(main, 6 * H, 8 * H, 30 * MIN), ...series(main, 8 * H, 9 * H, 15 * MIN)];
    const result = run(record, trips);
    expect(result.periods.map((p) => p.status)).toEqual(['matches', 'matches']);
    expect(result.periods[0].gaps.at(-1)?.toTripId).toBe(result.periods[0].tripIds.at(-1));
  });

  it('a whole timetable shifted 5 minutes earlier still matches across adjacent periods', () => {
    const record = plan([period('a', 6 * H, 8 * H, 30 * MIN), period('b', 8 * H, 19 * H, 15 * MIN), period('c', 19 * H, 24 * H, 30 * MIN)]);
    const shift = -5 * MIN;
    const trips = [
      ...series(main, 6 * H + shift, 8 * H + shift, 30 * MIN),
      ...series(main, 8 * H + shift, 19 * H + shift, 15 * MIN),
      ...series(main, 19 * H + shift, 24 * H + shift, 30 * MIN),
    ];
    const result = run(record, trips);
    expect(result.periods.map((p) => [p.status, p.builtTrips, p.plannedTrips])).toEqual([['matches', 4, 4], ['matches', 44, 44], ['matches', 10, 10]]);
    expect(result.outsidePlan).toBe(0);
  });

  it('works past 24:00', () => {
    const record = plan([period('late', 24 * H, 26 * H, 30 * MIN)]);
    expect(run(record, series(main, 24 * H, 26 * H, 30 * MIN)).periods[0].status).toBe('matches');
  });

  it('uses the first visit of a pattern that passes the node twice and reports it as ambiguous', () => {
    const loop = pattern('loop', ['FRCC', 'WSTMNST', 'FRCC']);
    const record = plan([period('p', 6 * H, 7 * H, 15 * MIN)]);
    const result = run(record, series(loop, 6 * H, 7 * H, 15 * MIN), [loop]);
    expect(result.ambiguousPatternIds).toEqual(['loop']);
    expect(result.periods[0]).toMatchObject({ status: 'matches', firstTime: 6 * H });
  });

  it('falls back to the default node when the stored node is no longer served', () => {
    const result = run(plan([period('p', 6 * H, 8 * H, 15 * MIN)], { out: 'GONE' }), series(main, 6 * H, 8 * H, 15 * MIN));
    expect(result).toMatchObject({ measureNodeId: 'FRCC', measureNodeFellBack: true });
    expect(result.periods[0].status).toBe('matches');
  });

  it('counts trips with no time at the node as not measured', () => {
    const t = trip(main, 6 * H);
    t.stopTimes = t.stopTimes.filter((stop) => stop.patternPointId !== 'main-p0');
    expect(run(peak, [t]).notMeasured).toBe(1);
  });
});
