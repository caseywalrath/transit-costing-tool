import { describe, expect, it } from 'vitest';
import { metadata, setIdGenerator } from './ids';
import type { BlockActivity, BlockingBlock, BlockingScenario, RoutePattern, Trip } from './types';
import {
  applyTripAssignment,
  assertStructurallyValidBlock,
  BlockingValidationError,
  classifyBlockingInsertion,
  duplicateBlockingScenario,
  planBulkBoundaryActivities,
  renameBlockingScenario,
  summarizeBlock,
} from './blocking';
import * as validation from './validation';

// Package P12 (review issues I-015, I-060, I-066): placement of explicit-time activities, zero-mile Patterns, typed Blocking rejections.
// Expected values were computed by hand from Decisions 0020, 0022 and 0023, as in the review reproductions S14 to S16.
const H = 3600; const M = 60;
const scenario: BlockingScenario = { id: 'bs', scenarioId: 'scenario', tripProfileId: 'profile', name: 'Plan', ...metadata() };
const pattern: RoutePattern = { id: 'pattern', scenarioId: 'scenario', routeId: 'route', name: 'AZ', points: [{ id: 'p1', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'Z', sequence: 1, cumulativeMiles: 10 }], ...metadata() };
const reverse: RoutePattern = { ...pattern, id: 'reverse', name: 'ZA', points: [{ id: 'q1', nodeId: 'Z', sequence: 0, cumulativeMiles: 0 }, { id: 'q2', nodeId: 'A', sequence: 1, cumulativeMiles: 10 }] };
const noMiles: RoutePattern = { ...pattern, id: 'no-miles', name: 'No miles', points: pattern.points.map((point) => ({ ...point, cumulativeMiles: 0 })) };
function trip(id: string, start: number, end: number, source = pattern): Trip {
  return { id, scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: source.id, tripProfileId: 'profile', stopTimes: [{ patternPointId: source.points[0].id, sequence: 0, time: start }, { patternPointId: source.points[1].id, sequence: 1, time: end }], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...metadata() };
}
const rev = (tripId: string): BlockActivity => ({ id: `r-${tripId}`, type: 'revenueTrip', sequence: 0, tripId });
function block(activities: BlockActivity[]): BlockingBlock { return { id: 'b', scenarioId: 'scenario', blockingScenarioId: 'bs', serviceDayId: 'weekday', label: 'B', activities: activities.map((activity, sequence) => ({ ...activity, sequence })), ...metadata() }; }
const patterns = [pattern, reverse, noMiles];
const summarize = (value: BlockingBlock, trips: Trip[]) => summarizeBlock(value, { blockingScenario: scenario, trips, patterns });
const ruleIds = (value: BlockingBlock, trips: Trip[]) => summarize(value, trips).findings.map((item) => item.ruleId);
const explicitDeadhead = (startTime: number, endTime: number): BlockActivity => ({ id: 'dh', type: 'deadhead', sequence: 0, startTime, endTime, fromNodeId: 'Z', toNodeId: 'A', miles: 1 });

describe('P12: explicit-time deadhead placement (I-015, review S14)', () => {
  // t1 runs 6:00-7:00 from A to Z; t2 runs 7:30-8:30 from A to Z, so the connection needs a Z to A deadhead inside the 7:00-7:30 gap.
  const t1 = trip('t1', 6 * H, 7 * H);
  const t2 = trip('t2', 7 * H + 30 * M, 8 * H + 30 * M);
  const fitting = block([rev('t1'), explicitDeadhead(7 * H + 5 * M, 7 * H + 15 * M), rev('t2')]);

  it('keeps a deadhead placed inside the connection gap valid, with its layover', () => {
    const summary = summarize(fitting, [t1, t2]);
    expect(summary.valid).toBe(true);
    expect(summary.connections[0]).toMatchObject({ status: 'valid', usableLayoverSeconds: 20 * M });
    expect(summary.findings.map((item) => item.ruleId)).not.toContain('block.deadheadOutsideGap');
  });

  it.each([
    ['after the next Trip starts', 9 * H, 9 * H + 10 * M],
    ['before the previous Trip ends', 6 * H + 30 * M, 6 * H + 40 * M],
    ['starting before the previous Trip ends and finishing inside the gap', 6 * H + 55 * M, 7 * H + 5 * M],
    ['starting inside the gap and finishing after the next Trip starts', 7 * H + 25 * M, 7 * H + 35 * M],
  ])('reports a placement finding and an invalid Block for a deadhead %s', (_label, start, end) => {
    const value = block([rev('t1'), explicitDeadhead(start, end), rev('t2')]);
    const summary = summarize(value, [t1, t2]);
    expect(summary.findings).toContainEqual(expect.objectContaining({ ruleId: 'block.deadheadOutsideGap', entityType: 'block', entityId: 'b', category: 'operational' }));
    expect(summary.connections[0].status).toBe('conflict');
    expect(summary.connections[0].usableLayoverSeconds).toBeUndefined();
    expect(summary.layoverHours).toBe(0);
    expect(summary.valid).toBe(false);
    expect(summary.status).toBe('invalid');
  });

  it('does not report a relative deadhead as misplaced, because it is placed after the previous Trip by construction', () => {
    const relative = block([rev('t1'), { id: 'dh', type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: 20, fromNodeId: 'Z', toNodeId: 'A' }, rev('t2')]);
    expect(ruleIds(relative, [t1, t2])).not.toContain('block.deadheadOutsideGap');
    const tooLong = block([rev('t1'), { id: 'dh', type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: 40, fromNodeId: 'Z', toNodeId: 'A' }, rev('t2')]);
    expect(ruleIds(tooLong, [t1, t2])).toEqual(expect.arrayContaining(['block.deadheadDoesNotFit']));
    expect(ruleIds(tooLong, [t1, t2])).not.toContain('block.deadheadOutsideGap');
  });

  it('classifies an insertion next to a misplaced explicit deadhead as a conflict', () => {
    const inserted = trip('t3', 7 * H + 30 * M, 8 * H);
    const misplaced = block([rev('t1'), explicitDeadhead(9 * H, 9 * H + 10 * M)]);
    const result = classifyBlockingInsertion({ block: misplaced, trip: inserted, trips: [t1, inserted], patterns });
    expect(result.status).toBe('conflict');
    expect(result.findings.map((item) => item.ruleId)).toContain('block.deadheadOutsideGap');
    const placed = block([rev('t1'), explicitDeadhead(7 * H + 5 * M, 7 * H + 15 * M)]);
    expect(classifyBlockingInsertion({ block: placed, trip: inserted, trips: [t1, inserted], patterns }).status).toBe('compatible');
  });
});

describe('P12: explicit-time boundary overlap (I-015, review S16)', () => {
  const t1 = trip('t1', 6 * H, 7 * H);
  const t2 = trip('t2', 7 * H + 30 * M, 8 * H + 30 * M, reverse);

  it('reports a pull-out that ends after the first Trip starts', () => {
    const value = block([{ id: 'out', type: 'pullOut', sequence: 0, startTime: 6 * H + 30 * M, endTime: 6 * H + 40 * M, toNodeId: 'A' }, rev('t1'), { id: 'in', type: 'pullIn', sequence: 0, minutesAfterLastTrip: 30, fromNodeId: 'Z' }]);
    const summary = summarize(value, [t1]);
    expect(summary.findings).toContainEqual(expect.objectContaining({ ruleId: 'block.boundaryOverlap', entityType: 'block', entityId: 'b', parameters: { sequence: 0 } }));
    expect(summary.valid).toBe(false);
    expect(summary.status).toBe('invalid');
  });

  it('reports a pull-in that starts before the last Trip ends', () => {
    const value = block([{ id: 'out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 15, toNodeId: 'A' }, rev('t1'), rev('t2'), { id: 'in', type: 'pullIn', sequence: 0, startTime: 8 * H, endTime: 8 * H + 45 * M, fromNodeId: 'A' }]);
    const summary = summarize(value, [t1, t2]);
    expect(summary.findings).toContainEqual(expect.objectContaining({ ruleId: 'block.boundaryOverlap', parameters: { sequence: 3 } }));
    expect(summary.valid).toBe(false);
  });

  it('accepts explicit boundaries that touch the Trips and relative boundaries', () => {
    const touching = block([{ id: 'out', type: 'pullOut', sequence: 0, startTime: 5 * H + 45 * M, endTime: 6 * H, toNodeId: 'A' }, rev('t1'), { id: 'in', type: 'pullIn', sequence: 0, startTime: 7 * H, endTime: 7 * H + 15 * M, fromNodeId: 'Z' }]);
    expect(ruleIds(touching, [t1])).not.toContain('block.boundaryOverlap');
    expect(summarize(touching, [t1]).valid).toBe(true);
    const relative = block([{ id: 'out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 15, toNodeId: 'A' }, rev('t1'), { id: 'in', type: 'pullIn', sequence: 0, minutesAfterLastTrip: 15, fromNodeId: 'Z' }]);
    expect(ruleIds(relative, [t1])).not.toContain('block.boundaryOverlap');
  });
});

describe('P12: a Pattern with 0 total miles has incomplete mileage (I-066, decision 8, review S15)', () => {
  const zero = trip('zero', 6 * H, 7 * H, noMiles);
  const boundaries = (middle: BlockActivity[]) => block([{ id: 'out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 15, toNodeId: 'A', miles: 0 }, ...middle, { id: 'in', type: 'pullIn', sequence: 0, minutesAfterLastTrip: 15, fromNodeId: 'Z', miles: 0 }]);

  it('reports revenue miles as unknown instead of 0 and keeps the Block incomplete', () => {
    const summary = summarize(boundaries([rev('zero')]), [zero]);
    expect(summary.revenueMiles).toBeUndefined();
    expect(summary.platformMiles).toBeUndefined();
    expect(summary.complete).toBe(false);
    expect(summary.status).toBe('incomplete');
    expect(summary.findings.map((item) => item.ruleId)).toEqual(expect.arrayContaining(['block.revenueMilesIncomplete', 'block.platformMilesIncomplete']));
  });

  it('makes a Block incomplete when any one of its Trips has a 0-mile Pattern', () => {
    const entered = trip('entered', 7 * H + 30 * M, 8 * H + 30 * M, reverse);
    const summary = summarize(boundaries([rev('zero'), rev('entered')]), [zero, entered]);
    expect(summary.revenueMiles).toBeUndefined();
    expect(summary.complete).toBe(false);
  });

  it('still counts a Pattern with entered miles', () => {
    const summary = summarize(boundaries([rev('t1')]), [trip('t1', 6 * H, 7 * H)]);
    expect(summary.revenueMiles).toBe(10);
    expect(summary.platformMiles).toBe(10);
    expect(summary.complete).toBe(true);
  });
});

describe('P12: Blocking structural rejections carry findings (I-060, finding 2-015)', () => {
  const t1 = trip('t1', 6 * H, 7 * H);
  const caught = (action: () => unknown): BlockingValidationError => {
    try { action(); } catch (error) { expect(error).toBeInstanceOf(BlockingValidationError); return error as BlockingValidationError; }
    throw new Error('Expected the call to throw.');
  };

  it('throws the structural findings of an invalid Block, with the same message as before', () => {
    const invalid = block([{ id: 'dh', type: 'deadhead', sequence: 0, fromNodeId: 'Z', toNodeId: 'A', minutesAfterPreviousTrip: 5 }, rev('t1')]);
    const error = caught(() => assertStructurallyValidBlock(invalid, { blockingScenario: scenario, trips: [t1], patterns }));
    expect(error.name).toBe('BlockingValidationError');
    expect(error.findings.map((item) => item.ruleId)).toContain('block.deadheadPlacement');
    expect(error.findings.every((item) => item.category === 'structural' && item.entityType === 'block' && item.entityId === 'b')).toBe(true);
    expect(error.message).toBe(error.findings.map((item) => item.messageKey).join(', '));
  });

  it('throws a finding for a Trip outside the Blocking Scenario service context', () => {
    const other = { ...t1, id: 'other', tripProfileId: 'another-profile' };
    const error = caught(() => applyTripAssignment({ blockingScenarioId: 'bs', serviceDayId: 'weekday', tripId: 'other', destinationBlockId: 'b' }, scenario, [block([])], [other]));
    expect(error.message).toBe('Trip is outside the Blocking Scenario service context.');
    expect(error.findings).toEqual([expect.objectContaining({ ruleId: 'block.tripContext', severity: 'error', category: 'structural', entityType: 'trip', entityId: 'other' })]);
  });

  it('throws findings for a duplicate assignment, an unavailable Block, and a second Route', () => {
    const a = block([rev('t1')]);
    const b: BlockingBlock = { ...block([]), id: 'b2', label: 'B2' };
    const duplicate = caught(() => applyTripAssignment({ blockingScenarioId: 'bs', serviceDayId: 'weekday', tripId: 't1', destinationBlockId: 'b2', sourceBlockId: 'missing' }, scenario, [a, b], [t1]));
    expect(duplicate.findings[0]).toMatchObject({ ruleId: 'block.tripAlreadyAssigned', entityType: 'trip', entityId: 't1' });
    const unavailable = caught(() => applyTripAssignment({ blockingScenarioId: 'bs', serviceDayId: 'weekday', tripId: 't1', destinationBlockId: 'gone' }, scenario, [a], [t1]));
    expect(unavailable.findings[0]).toMatchObject({ ruleId: 'block.destinationUnavailable', entityType: 'block', entityId: 'gone' });
    const otherRoute = { ...trip('t9', 8 * H, 9 * H), routeId: 'other-route' };
    const crossRoute = caught(() => applyTripAssignment({ blockingScenarioId: 'bs', serviceDayId: 'weekday', tripId: 't9', destinationBlockId: 'b' }, scenario, [a], [t1, otherRoute]));
    expect(crossRoute.findings[0]).toMatchObject({ ruleId: 'block.assignmentRoute', entityType: 'trip', entityId: 't9' });
  });

  it('throws name findings for a Blocking Scenario rename and duplicate', () => {
    const blank = caught(() => renameBlockingScenario(scenario, ' ', []));
    expect(blank.findings[0]).toMatchObject({ ruleId: 'blockingScenario.nameRequired', entityType: 'blockingScenario', entityId: 'bs', field: 'name' });
    const taken = caught(() => renameBlockingScenario(scenario, 'other', [{ ...scenario, id: 'bs2', name: 'Other' }]));
    expect(taken.findings[0].ruleId).toBe('blockingScenario.nameUnique');
    const copy = caught(() => duplicateBlockingScenario({ scenario, blocks: [] }, ''));
    expect(copy.findings[0].ruleId).toBe('blockingScenario.nameRequired');
  });

  it('throws findings for a bulk boundary request whose Block or Node is unavailable', () => {
    const boundary = { id: 'out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A' } as const;
    const missing = caught(() => planBulkBoundaryActivities({ blockingScenarioId: 'bs', serviceDayId: 'weekday', sourceBlockId: 'gone', activity: boundary, replaceExisting: false, sourceSignature: 's' }, [block([rev('t1')])], [t1], patterns));
    expect(missing.findings[0]).toMatchObject({ ruleId: 'block.unavailable', entityType: 'block', entityId: 'gone' });
    const noNode = caught(() => planBulkBoundaryActivities({ blockingScenarioId: 'bs', serviceDayId: 'weekday', sourceBlockId: 'b', activity: { ...boundary, toNodeId: '' }, replaceExisting: false, sourceSignature: 's' }, [block([rev('t1')])], [t1], patterns));
    expect(noNode.findings[0]).toMatchObject({ ruleId: 'block.boundaryNode', entityType: 'block', entityId: 'b', field: 'toNodeId' });
  });
});

describe('P16: planBulkBoundaryActivities takes the time and uses injectable identifiers (I-068, finding 2-014)', () => {
  const t1 = trip('t1', 6 * H, 7 * H);
  const other = { ...block([rev('t1')]), id: 'other', label: 'O', activities: [{ ...rev('t1'), id: 'r-other' }] };
  const request = { blockingScenarioId: 'bs', serviceDayId: 'weekday', sourceBlockId: 'b', activity: { id: 'out', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A' } as const, replaceExisting: false, sourceSignature: 's' };

  it('stamps every changed Block with the given time and draws new activity ids from the injected generator', () => {
    const stamp = '2030-05-06T07:08:09.000Z';
    let counter = 0;
    const restore = setIdGenerator(() => `id-${++counter}`);
    try {
      const planned = planBulkBoundaryActivities(request, [block([rev('t1')]), other], [t1], patterns, stamp);
      expect(planned.blocks.map((item) => item.updatedAt)).toEqual([stamp, stamp]);
      expect(planned.blocks[1].activities.find((activity) => activity.type === 'pullOut')?.id).toBe('id-1');
      expect(planned.blocks[0].activities.find((activity) => activity.type === 'pullOut')?.id).toBe('out');
    } finally { restore(); }
  });
});

describe('P12: the legacy validateBlock is removed (finding 2-015)', () => {
  it('leaves the Blocking `validateBlockingBlock` as the one Block validator', () => {
    expect(Object.keys(validation)).not.toContain('validateBlock');
  });
});
