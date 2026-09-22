import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import type { BlockingBlock, BlockingScenario, RoutePattern, Trip } from './types';
import { applyTripAssignment, assertStructurallyValidBlock, calculateBlockingScenarioDeletionImpact, classifyBlockingInsertion, createBlockingScenario, duplicateBlockingScenario, normalizeBlockActivities, suggestChronologicalInsertionIndex, summarizeBlock, summarizeBlockingScenario, validateBlockingAssignments, validateBlockingBlock } from './blocking';

const scenario: BlockingScenario = { id: 'bs1', scenarioId: 'scenario', tripProfileId: 'profile', name: 'Weekday blocks', ...metadata() };
const pattern: RoutePattern = { id: 'pattern', scenarioId: 'scenario', routeId: 'route', name: 'Full', points: [{ id: 'p1', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'B', sequence: 1, cumulativeMiles: 10 }], ...metadata() };
function trip(id: string, start: number, end: number, routeId = 'route'): Trip { return { id, scenarioId: 'scenario', routeId, serviceDayId: 'weekday', patternId: 'pattern', tripProfileId: 'profile', stopTimes: [{ patternPointId: 'p1', sequence: 0, time: start }, { patternPointId: 'p2', sequence: 1, time: end }], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...metadata() }; }
function block(id: string, activities: BlockingBlock['activities']): BlockingBlock { return { id, scenarioId: 'scenario', blockingScenarioId: 'bs1', serviceDayId: 'weekday', label: id, activities, ...metadata() }; }

describe('blocking domain contracts', () => {
  it('creates, normalizes, duplicates, and calculates deletion impact', () => {
    const created = createBlockingScenario({ scenarioId: 'scenario', tripProfileId: 'profile', name: '  Empty  ' });
    expect(created.name).toBe('Empty');
    const source = block('b1', [{ id: 'r', type: 'revenueTrip', sequence: 2, tripId: 't1' }, { id: 'po', type: 'pullOut', sequence: 0, startTime: 0, endTime: 60, toNodeId: 'A', miles: 1 }]);
    const normalized = normalizeBlockActivities(source);
    expect(normalized.activities.map((item) => [item.id, item.sequence])).toEqual([['po', 0], ['r', 1]]);
    const copy = duplicateBlockingScenario({ scenario, blocks: [normalized] }, 'Copy');
    expect(copy.scenario.id).not.toBe(scenario.id); expect(copy.scenario.tripProfileId).toBe(scenario.tripProfileId); expect(copy.blocks[0].activities[1].id).not.toBe(normalized.activities[1].id); expect(copy.blocks[0].activities[1].type).toBe('revenueTrip');
    const impact = calculateBlockingScenarioDeletionImpact(scenario, [source]);
    expect(impact).toMatchObject({ blockCount: 1, activityCount: 2, blockIds: ['b1'] });
  });

  it('enforces activity cardinality, placement, ownership, and duplicate assignment rules', () => {
    const trips = [trip('t1', 600, 1200), trip('t2', 1300, 1900)];
    const malformed = block('b1', [{ id: 'r', type: 'revenueTrip', sequence: 0, tripId: 't1' }, { id: 'po', type: 'pullOut', sequence: 1, startTime: 0, endTime: 60, toNodeId: 'A' }]);
    expect(validateBlockingBlock(malformed, { blockingScenario: scenario, trips, patterns: [pattern] }).map((item) => item.ruleId)).toContain('block.pullOutMustBeFirst');
    const duplicate = block('b2', [{ id: 'r2', type: 'revenueTrip', sequence: 0, tripId: 't1' }]);
    expect(validateBlockingAssignments(scenario, [malformed, duplicate], trips).map((item) => item.ruleId)).toContain('block.duplicateTripAssignment');
    expect(() => assertStructurallyValidBlock(malformed, { blockingScenario: scenario, trips, patterns: [pattern] })).toThrow();
  });

  it('derives same-terminal connections, hours, and complete miles', () => {
    const onward: RoutePattern = { ...pattern, id: 'onward', points: [{ id: 'q1', nodeId: 'B', sequence: 0, cumulativeMiles: 0 }, { id: 'q2', nodeId: 'C', sequence: 1, cumulativeMiles: 10 }] };
    const t1 = trip('t1', 600, 1200); const t2 = { ...trip('t2', 1300, 1900), patternId: onward.id, stopTimes: [{ patternPointId: 'q1', sequence: 0, time: 1300 }, { patternPointId: 'q2', sequence: 1, time: 1900 }] };
    const value = block('b1', [
      { id: 'po', type: 'pullOut', sequence: 0, startTime: 500, endTime: 600, toNodeId: 'A', miles: 1 },
      { id: 'r1', type: 'revenueTrip', sequence: 1, tripId: 't1' },
      { id: 'r2', type: 'revenueTrip', sequence: 2, tripId: 't2' },
      { id: 'pi', type: 'pullIn', sequence: 3, startTime: 1900, endTime: 2000, fromNodeId: 'B', miles: 2 },
    ]);
    const summary = summarizeBlock(value, { blockingScenario: scenario, trips: [t1, t2], patterns: [pattern, onward] });
    expect(summary.runningHours).toBeCloseTo((600 + 600) / 3600); expect(summary.layoverHours).toBeCloseTo(100 / 3600); expect(summary.revenueHours).toBeCloseTo((600 + 600 + 100) / 3600); expect(summary.platformHours).toBeCloseTo(1500 / 3600); expect(summary.revenueMiles).toBe(20); expect(summary.platformMiles).toBe(23); expect(summary.status).toBe('complete');
  });

  it('derives relative pull-out and pull-in timing from the adjacent revenue Trips', () => {
    const first = trip('t1', 600, 1200);
    const value = block('relative', [
      { id: 'po', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A', miles: 1 },
      { id: 'r', type: 'revenueTrip', sequence: 1, tripId: first.id },
      { id: 'pi', type: 'pullIn', sequence: 2, minutesAfterLastTrip: 20, fromNodeId: 'B', miles: 1 },
    ]);
    const summary = summarizeBlock(value, { blockingScenario: scenario, trips: [first], patterns: [pattern] });
    expect(summary.activityTimings).toEqual(expect.arrayContaining([{ activityId: 'po', startTime: 0, endTime: 600 }, { activityId: 'pi', startTime: 1200, endTime: 2400 }]));
    expect(summary.platformHours).toBeCloseTo(2400 / 3600);
    const shifted = summarizeBlock(value, { blockingScenario: scenario, trips: [{ ...first, stopTimes: [{ ...first.stopTimes[0], time: 900 }, { ...first.stopTimes[1], time: 1500 }] }], patterns: [pattern] });
    expect(shifted.activityTimings).toEqual(expect.arrayContaining([{ activityId: 'po', startTime: 300, endTime: 900 }, { activityId: 'pi', startTime: 1500, endTime: 2700 }]));
  });

  it('allows a relative boundary without a Trip but reports its platform timing as incomplete', () => {
    const value = block('empty-boundary', [{ id: 'po', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 10, toNodeId: 'A', miles: 1 }]);
    expect(validateBlockingBlock(value, { blockingScenario: scenario, trips: [], patterns: [pattern] })).toEqual([]);
    expect(summarizeBlock(value, { blockingScenario: scenario, trips: [], patterns: [pattern] }).findings.map((item) => item.ruleId)).toContain('block.platformBoundaryMissing');
  });

  it('reports missing deadhead and retains fitting legacy explicit deadhead timing', () => {
    const otherPattern: RoutePattern = { ...pattern, id: 'other', points: [{ id: 'q1', nodeId: 'C', sequence: 0, cumulativeMiles: 0 }, { id: 'q2', nodeId: 'D', sequence: 1, cumulativeMiles: 5 }] };
    const first = trip('t1', 600, 1200); const second = { ...trip('t2', 1300, 1900), patternId: 'other', stopTimes: [{ patternPointId: 'q1', sequence: 0, time: 1300 }, { patternPointId: 'q2', sequence: 1, time: 1900 }] };
    const missing = block('missing', [{ id: 'r1', type: 'revenueTrip', sequence: 0, tripId: first.id }, { id: 'r2', type: 'revenueTrip', sequence: 1, tripId: second.id }]);
    expect(summarizeBlock(missing, { blockingScenario: scenario, trips: [first, second], patterns: [pattern, otherPattern] }).findings.map((item) => item.ruleId)).toContain('block.deadheadMissing');
    const fitted = block('fitted', [{ id: 'r1', type: 'revenueTrip', sequence: 0, tripId: first.id }, { id: 'dh', type: 'deadhead', sequence: 1, startTime: 1200, endTime: 1260, fromNodeId: 'B', toNodeId: 'C', miles: 1 }, { id: 'r2', type: 'revenueTrip', sequence: 2, tripId: second.id }]);
    const summary = summarizeBlock(fitted, { blockingScenario: scenario, trips: [first, second], patterns: [pattern, otherPattern] });
    expect(summary.deadheadHours).toBeCloseTo(60 / 3600); expect(summary.connections[0].usableLayoverSeconds).toBe(40); expect(summary.runningHours).toBeCloseTo(1200 / 3600); expect(summary.revenueHours).toBeCloseTo(1240 / 3600);
  });

  it('derives a new deadhead immediately after its preceding Trip and leaves the remaining gap as layover', () => {
    const otherPattern: RoutePattern = { ...pattern, id: 'other', points: [{ id: 'q1', nodeId: 'C', sequence: 0, cumulativeMiles: 0 }, { id: 'q2', nodeId: 'D', sequence: 1, cumulativeMiles: 5 }] };
    const first = trip('t1', 600, 1200); const second = { ...trip('t2', 1300, 1900), patternId: 'other', stopTimes: [{ patternPointId: 'q1', sequence: 0, time: 1300 }, { patternPointId: 'q2', sequence: 1, time: 1900 }] };
    const value = block('relative-deadhead', [{ id: 'r1', type: 'revenueTrip', sequence: 0, tripId: first.id }, { id: 'dh', type: 'deadhead', sequence: 1, minutesAfterPreviousTrip: 1, fromNodeId: 'B', toNodeId: 'C', miles: 1 }, { id: 'r2', type: 'revenueTrip', sequence: 2, tripId: second.id }]);
    const summary = summarizeBlock(value, { blockingScenario: scenario, trips: [first, second], patterns: [pattern, otherPattern] });
    expect(summary.activityTimings).toContainEqual({ activityId: 'dh', startTime: 1200, endTime: 1260 });
    expect(summary.deadheadHours).toBeCloseTo(60 / 3600); expect(summary.connections[0].usableLayoverSeconds).toBe(40);
  });

  it('classifies both sides of an insertion without mutation', () => {
    const first = trip('t1', 600, 1200); const candidate = trip('candidate', 1250, 1800); const last = trip('t2', 1900, 2500);
    const value = block('b1', [{ id: 'r1', type: 'revenueTrip', sequence: 0, tripId: first.id }, { id: 'r2', type: 'revenueTrip', sequence: 1, tripId: last.id }]);
    const result = classifyBlockingInsertion({ block: value, insertAt: 1, trip: candidate, trips: [first, candidate, last], patterns: [pattern] });
    expect(result.status).toBe('deadheadRequired'); expect(value.activities).toHaveLength(2);
  });

  it('uses the proposed chronological position and includes a retained preceding deadhead in compatibility', () => {
    const onward: RoutePattern = { ...pattern, id: 'onward', points: [{ id: 'q1', nodeId: 'B', sequence: 0, cumulativeMiles: 0 }, { id: 'q2', nodeId: 'A', sequence: 1, cumulativeMiles: 5 }] };
    const first = trip('first', 600, 900);
    const candidate = trip('candidate', 1000, 1100);
    const last = { ...trip('last', 1200, 1500), patternId: onward.id, stopTimes: [{ patternPointId: 'q1', sequence: 0, time: 1200 }, { patternPointId: 'q2', sequence: 1, time: 1500 }] };
    const value = block('time-order', [{ id: 'r1', type: 'revenueTrip', sequence: 0, tripId: first.id }, { id: 'dh', type: 'deadhead', sequence: 1, minutesAfterPreviousTrip: 1, fromNodeId: 'B', toNodeId: 'A' }, { id: 'r2', type: 'revenueTrip', sequence: 2, tripId: last.id }]);
    expect(suggestChronologicalInsertionIndex(value, candidate, [first, candidate, last])).toBe(1);
    expect(classifyBlockingInsertion({ block: value, trip: candidate, trips: [first, candidate, last], patterns: [pattern, onward] }).status).toBe('compatible');
  });

  it('applies fixed and percentage minimum layover rules to the preceding Trip', () => {
    const onward: RoutePattern = { ...pattern, id: 'onward', points: [{ id: 'q1', nodeId: 'B', sequence: 0, cumulativeMiles: 0 }, { id: 'q2', nodeId: 'C', sequence: 1, cumulativeMiles: 5 }] };
    const first = trip('first', 600, 1200);
    const candidate = { ...trip('candidate', 1260, 1800), patternId: onward.id, stopTimes: [{ patternPointId: 'q1', sequence: 0, time: 1260 }, { patternPointId: 'q2', sequence: 1, time: 1800 }] };
    const value = block('minimum-layover', [{ id: 'r1', type: 'revenueTrip', sequence: 0, tripId: first.id }]);
    expect(classifyBlockingInsertion({ block: value, insertAt: 1, trip: candidate, trips: [first, candidate], patterns: [pattern, onward], minimumLayover: { mode: 'minutes', value: 2 } }).status).toBe('insufficientLayover');
    expect(classifyBlockingInsertion({ block: value, insertAt: 1, trip: candidate, trips: [first, candidate], patterns: [pattern, onward], minimumLayover: { mode: 'percent', value: 10 } }).status).toBe('compatible');
  });

  it('returns known valid subtotals and counts invalid or incomplete blocks', () => {
    const complete = block('complete', [{ id: 'po', type: 'pullOut', sequence: 0, startTime: 500, endTime: 600, toNodeId: 'A', miles: 1 }, { id: 'r', type: 'revenueTrip', sequence: 1, tripId: 't1' }, { id: 'pi', type: 'pullIn', sequence: 2, startTime: 1200, endTime: 1300, fromNodeId: 'B', miles: 1 }]);
    const empty = block('empty', []); const summary = summarizeBlockingScenario(scenario, [complete, empty], { trips: [trip('t1', 600, 1200)], patterns: [pattern] });
    expect(summary.validBlockCount).toBe(1); expect(summary.incompleteBlockCount).toBe(1); expect(summary.revenueHours).toBeCloseTo(600 / 3600); expect(summary.complete).toBe(false);
  });

  it('moves a Trip atomically and rejects a duplicate or cross-route assignment', () => {
    const selected = trip('move', 600, 1200); const source = block('source', [{ id: 'r', type: 'revenueTrip', sequence: 0, tripId: selected.id }]); const destination = block('destination', []);
    const moved = applyTripAssignment({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: selected.id, sourceBlockId: source.id, destinationBlockId: destination.id, destinationIndex: 0 }, scenario, [source, destination], [selected]);
    expect(moved.find((value) => value.id === source.id)?.activities).toEqual([]); expect(moved.find((value) => value.id === destination.id)?.activities[0]).toMatchObject({ type: 'revenueTrip', tripId: selected.id });
    const duplicate = block('duplicate', [{ id: 'r2', type: 'revenueTrip', sequence: 0, tripId: selected.id }]);
    expect(() => applyTripAssignment({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: selected.id, destinationBlockId: destination.id }, scenario, [source, duplicate, destination], [selected])).toThrow('already assigned');
  });

  it('inserts a Trip by revenue-Trip connection rather than by raw activity position', () => {
    const first = trip('first', 600, 900); const candidate = trip('candidate', 1000, 1100); const last = trip('last', 1200, 1500);
    const value = block('connection-insert', [{ id: 'po', type: 'pullOut', sequence: 0, minutesBeforeFirstTrip: 5, toNodeId: 'A' }, { id: 'r1', type: 'revenueTrip', sequence: 1, tripId: first.id }, { id: 'dh', type: 'deadhead', sequence: 2, minutesAfterPreviousTrip: 1, fromNodeId: 'B', toNodeId: 'A' }, { id: 'r2', type: 'revenueTrip', sequence: 3, tripId: last.id }, { id: 'pi', type: 'pullIn', sequence: 4, minutesAfterLastTrip: 5, fromNodeId: 'B' }]);
    const updated = applyTripAssignment({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: candidate.id, destinationBlockId: value.id, destinationIndex: 1 }, scenario, [value], [first, candidate, last]);
    expect(updated[0].activities.map((activity) => activity.id)).toEqual(['po', 'r1', 'dh', expect.any(String), 'r2', 'pi']);
  });

  it('preserves append and explicit insertion order when assigning Trips', () => {
    const first = trip('first', 600, 1200); const second = trip('second', 1300, 1800); const destination = block('ordered', []);
    const afterFirst = applyTripAssignment({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: first.id, destinationBlockId: destination.id }, scenario, [destination], [first, second]);
    const afterSecond = applyTripAssignment({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: second.id, destinationBlockId: destination.id }, scenario, afterFirst, [first, second]);
    expect(afterSecond[0].activities.map((activity) => activity.type === 'revenueTrip' ? activity.tripId : '')).toEqual(['first', 'second']);
    const inserted = applyTripAssignment({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: second.id, destinationBlockId: destination.id, destinationIndex: 0 }, scenario, afterFirst, [first, second]);
    expect(inserted[0].activities.map((activity) => activity.type === 'revenueTrip' ? activity.tripId : '')).toEqual(['second', 'first']);
  });

  it('automatically inserts new Trips by From Time without changing existing manual order', () => {
    const earliest = trip('earliest', 600, 900);
    const candidate = trip('candidate', 900, 1200);
    const latest = trip('latest', 1200, 1500);
    const chronological = block('chronological', [{ id: 'latest-activity', type: 'revenueTrip', sequence: 0, tripId: latest.id }]);
    const inserted = applyTripAssignment({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: candidate.id, destinationBlockId: chronological.id }, scenario, [chronological], [candidate, latest]);
    expect(inserted[0].activities.map((activity) => activity.type === 'revenueTrip' ? activity.tripId : '')).toEqual(['candidate', 'latest']);
    const manuallyOrdered = block('manual-order', [{ id: 'latest-activity', type: 'revenueTrip', sequence: 0, tripId: latest.id }, { id: 'earliest-activity', type: 'revenueTrip', sequence: 1, tripId: earliest.id }]);
    const manualInserted = applyTripAssignment({ blockingScenarioId: scenario.id, serviceDayId: 'weekday', tripId: candidate.id, destinationBlockId: manuallyOrdered.id }, scenario, [manuallyOrdered], [earliest, candidate, latest]);
    expect(manualInserted[0].activities.map((activity) => activity.type === 'revenueTrip' ? activity.tripId : '')).toEqual(['candidate', 'latest', 'earliest']);
  });

  it('handles a 100-Block, 500-Trip service day deterministically', () => {
    const trips = Array.from({ length: 500 }, (_, index) => trip(`trip-${index}`, index * 100, index * 100 + 60));
    const blocks = Array.from({ length: 100 }, (_, index) => block(`block-${index}`, []));
    const summary = summarizeBlockingScenario(scenario, blocks, { trips, patterns: [pattern] });
    expect(summary.blockSummaries).toHaveLength(100); expect(summary.incompleteBlockCount).toBe(100);
  });
});
