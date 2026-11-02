import { describe, expect, it } from 'vitest';
import { metadata, setIdGenerator } from './ids';
import type { BlockActivity, BlockingBlock, BlockingScenario, RoutePattern, ServiceDayDefinition, Trip } from './types';
import { buildBlockingDayCopyPreview, createBlockingDayCopySignature, matchTripsAcrossDays, type BlockingDayCopyInput, type BlockingDayCopyRequest } from './blockingDayCopy';

const H = 3600;
const bs: BlockingScenario = { id: 'bs', scenarioId: 'sc', tripProfileId: 'profile', name: 'Plan', ...metadata() };
const pattern: RoutePattern = { id: 'pat', scenarioId: 'sc', routeId: 'route', name: 'AZ', points: [{ id: 'p1', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'Z', sequence: 1, cumulativeMiles: 10 }], ...metadata() };
const day = (id: string, scenarioId = 'sc', sequence = 0): ServiceDayDefinition => ({ id, scenarioId, kind: 'custom', name: id, annualServiceDays: 100, sequence, ...metadata() });
const days = [day('wk'), day('sa', 'sc', 1), day('other', 'elsewhere', 2)];
function trip(id: string, serviceDayId: string, start: number, end = start + H, extra: Partial<Trip> = {}): Trip {
  return { id, scenarioId: 'sc', routeId: 'route', serviceDayId, patternId: 'pat', tripProfileId: 'profile', stopTimes: [{ patternPointId: 'p1', sequence: 0, time: start }, { patternPointId: 'p2', sequence: 1, time: end }], provenance: { kind: 'manual' } as Trip['provenance'], ...metadata(), ...extra };
}
const rev = (tripId: string): BlockActivity => ({ id: `r-${tripId}`, type: 'revenueTrip', sequence: 0, tripId });
const dead = (id: string): BlockActivity => ({ id, type: 'deadhead', sequence: 0, minutesAfterPreviousTrip: 5, fromNodeId: 'Z', toNodeId: 'A' });
function block(id: string, serviceDayId: string, activities: BlockActivity[], extra: Partial<BlockingBlock> = {}): BlockingBlock {
  return { id, scenarioId: 'sc', blockingScenarioId: 'bs', serviceDayId, label: id, activities: activities.map((activity, sequence) => ({ ...activity, sequence })), ...metadata(), ...extra };
}
const request: BlockingDayCopyRequest = { scenarioId: 'sc', blockingScenarioId: 'bs', sourceServiceDayId: 'sa', targetServiceDayId: 'wk' };
function input(over: Partial<BlockingDayCopyInput> = {}): BlockingDayCopyInput {
  return { request, blockingScenario: bs, serviceDays: days, sourceBlocks: [], targetBlocks: [], sourceTrips: [], targetTrips: [], patterns: [pattern], now: '2026-11-02T00:00:00.000Z', ...over };
}
const ids = (preview: ReturnType<typeof buildBlockingDayCopyPreview>) => preview.findings.map((item) => item.ruleId);
function counter() { let n = 0; return setIdGenerator(() => `new-${++n}`); }

// Source day: B1 holds s1, dead, s2. Target day holds the same times by default.
const srcTrips = [trip('s1', 'sa', 6 * H), trip('s2', 'sa', 8 * H), trip('s3', 'sa', 10 * H)];
const tgtTrips = [trip('t1', 'wk', 6 * H), trip('t2', 'wk', 8 * H), trip('t3', 'wk', 10 * H)];
const srcBlock = block('B1', 'sa', [rev('s1'), dead('d1'), rev('s2'), dead('d2'), rev('s3')], { notes: 'note' });

describe('matchTripsAcrossDays', () => {
  it('matches in two tiers and reports leftovers', () => {
    const result = matchTripsAcrossDays([trip('a', 'sa', H), trip('b', 'sa', 2 * H), trip('c', 'sa', 3 * H)], [trip('x', 'wk', H), trip('y', 'wk', 2 * H, 5 * H), trip('z', 'wk', 9 * H)]);
    expect(result.matches).toEqual([
      { sourceTripId: 'a', targetTripId: 'x', tier: 'exact', ambiguous: false },
      { sourceTripId: 'b', targetTripId: 'y', tier: 'firstDeparture', ambiguous: false },
    ]);
    expect(result.unmatchedSourceTripIds).toEqual(['c']);
    expect(result.unmatchedTargetTripIds).toEqual(['z']);
  });
  it('does not match across Patterns or Routes', () => {
    const result = matchTripsAcrossDays([trip('a', 'sa', H)], [trip('x', 'wk', H, undefined, { patternId: 'other' }), trip('y', 'wk', H, undefined, { routeId: 'r2' })]);
    expect(result.matches).toEqual([]);
  });
  it('is deterministic across input order', () => {
    const s = [trip('a', 'sa', H), trip('b', 'sa', H), trip('c', 'sa', 2 * H)]; const t = [trip('x', 'wk', H), trip('y', 'wk', H), trip('z', 'wk', 2 * H)];
    expect(matchTripsAcrossDays([...s].reverse(), [...t].reverse())).toEqual(matchTripsAcrossDays(s, t));
  });
});

describe('buildBlockingDayCopyPreview', () => {
  it('gives 100% exact with no acknowledgment for identical tables', () => {
    const restore = counter();
    try {
      const preview = buildBlockingDayCopyPreview(input({ sourceBlocks: [srcBlock], sourceTrips: srcTrips, targetTrips: tgtTrips }));
      expect(preview.findings).toEqual([]);
      expect(preview.impact).toMatchObject({ heldTripCount: 3, matchedTripCount: 3, exactCount: 3, firstDepartureCount: 0, matchRate: 1, requiresMismatchAcknowledgment: false, belowThreshold: false, copiedBlockCount: 1, unassignedTargetTripIds: [] });
      const copy = preview.blocks[0];
      expect(copy).toMatchObject({ serviceDayId: 'wk', label: 'B1', notes: 'note', blockingScenarioId: 'bs' });
      expect(copy.id).not.toBe('B1');
      expect(copy.activities.map((a) => a.type === 'revenueTrip' ? a.tripId : a.type)).toEqual(['t1', 'deadhead', 't2', 'deadhead', 't3']);
      expect(copy.activities.every((a) => a.id.startsWith('new-'))).toBe(true);
      expect(preview.impact.routes).toEqual([{ routeId: 'route', heldTripCount: 3, exactCount: 3, firstDepartureCount: 0, unmatchedCount: 0, unassignedTargetTripCount: 0 }]);
    } finally { restore(); }
  });

  it('flags a tier-2 match and requires acknowledgment', () => {
    const targets = [tgtTrips[0], trip('t2', 'wk', 8 * H, 9 * H + 1800), tgtTrips[2]];
    const preview = buildBlockingDayCopyPreview(input({ sourceBlocks: [srcBlock], sourceTrips: srcTrips, targetTrips: targets }));
    expect(preview.impact).toMatchObject({ exactCount: 2, firstDepartureCount: 1, requiresMismatchAcknowledgment: true });
    expect(ids(preview)).toEqual(['blockingDayCopy.mismatchRequiresAcknowledgment']);
    const acked = buildBlockingDayCopyPreview(input({ request: { ...request, acknowledgeMismatch: true }, sourceBlocks: [srcBlock], sourceTrips: srcTrips, targetTrips: targets }));
    expect(acked.findings).toEqual([]);
  });

  it('pairs duplicate Trips and flags them ambiguous', () => {
    const preview = buildBlockingDayCopyPreview(input({
      sourceBlocks: [block('B1', 'sa', [rev('s1')]), block('B2', 'sa', [rev('s2')])],
      sourceTrips: [trip('s1', 'sa', H), trip('s2', 'sa', H)], targetTrips: [trip('t1', 'wk', H), trip('t2', 'wk', H)],
    }));
    expect(preview.tripMatches.map((m) => [m.sourceTripId, m.targetTripId, m.ambiguous])).toEqual([['s1', 't1', true], ['s2', 't2', true]]);
    expect(preview.impact.ambiguousCount).toBe(2);
    expect(preview.impact.requiresMismatchAcknowledgment).toBe(true);
  });

  it('removes an unmatched Trip with both adjacent deadheads, and keeps the emptied Block', () => {
    const preview = buildBlockingDayCopyPreview(input({
      request: { ...request, acknowledgeMismatch: true },
      sourceBlocks: [srcBlock, block('B2', 'sa', [rev('s4')])],
      sourceTrips: [...srcTrips, trip('s4', 'sa', 12 * H)],
      targetTrips: [tgtTrips[0], tgtTrips[2], trip('t9', 'wk', 20 * H)],
    }));
    // s2 and s4 unmatched. B1 keeps s1 and s3 with both deadheads around s2 removed; B2 is emptied but kept.
    expect(preview.impact.unmatchedSourceTripIds).toEqual(['s2', 's4']);
    expect(preview.impact.removedDeadheadCount).toBe(2);
    expect(preview.blocks).toHaveLength(2);
    const b1 = preview.blocks.find((b) => b.label === 'B1')!;
    expect(b1.activities.map((a) => a.type === 'revenueTrip' ? a.tripId : a.type)).toEqual(['t1', 't3']);
    expect(b1.activities.map((a) => a.sequence)).toEqual([0, 1]);
    const b2 = preview.blocks.find((b) => b.label === 'B2')!;
    expect(b2.activities).toEqual([]);
    expect(preview.impact.emptiedBlockIds).toEqual([b2.id]);
    expect(preview.impact.unassignedTargetTripIds).toEqual(['t9']);
    expect(preview.impact.routes[0]).toMatchObject({ unmatchedCount: 2, unassignedTargetTripCount: 1 });
  });

  it('allows exactly 50% with acknowledgment and refuses 49%', () => {
    const sources = (n: number) => Array.from({ length: n }, (_, i) => trip(`s${i}`, 'sa', (i + 1) * H));
    const blockOf = (n: number) => block('B1', 'sa', Array.from({ length: n }, (_, i) => rev(`s${i}`)));
    const half = buildBlockingDayCopyPreview(input({ sourceBlocks: [blockOf(2)], sourceTrips: sources(2), targetTrips: [trip('t0', 'wk', H)] }));
    expect(half.impact.matchRate).toBe(0.5);
    expect(half.impact.belowThreshold).toBe(false);
    expect(ids(half)).toEqual(['blockingDayCopy.mismatchRequiresAcknowledgment']);
    const below = buildBlockingDayCopyPreview(input({ sourceBlocks: [blockOf(100)], sourceTrips: sources(100), targetTrips: sources(49).map((t) => ({ ...t, id: `t${t.id}`, serviceDayId: 'wk' })) }));
    expect(below.impact.matchRate).toBe(0.49);
    expect(below.impact.belowThreshold).toBe(true);
    expect(ids(below)).toContain('blockingDayCopy.matchBelowThreshold');
    expect(below.findings.find((f) => f.ruleId === 'blockingDayCopy.matchBelowThreshold')?.parameters).toEqual({ matched: 49, held: 100 });
    expect(below.blocks).toHaveLength(1);
  });

  it('requires allowEmptySource when the source day has no Blocks', () => {
    const target = block('T1', 'wk', [rev('t1')]);
    const refused = buildBlockingDayCopyPreview(input({ targetBlocks: [target], targetTrips: tgtTrips }));
    expect(ids(refused)).toEqual(['blockingDayCopy.emptySourceRequiresExplicitClear']);
    expect(refused.impact).toMatchObject({ requiresExplicitEmptySourceReview: true, copiedBlockCount: 0, replacedTargetBlockCount: 1 });
    expect(refused.removedTargetBlockIds).toEqual(['T1']);
    expect(refused.impact.unassignedTargetTripIds).toEqual(['t1', 't2', 't3']);
    expect(buildBlockingDayCopyPreview(input({ request: { ...request, allowEmptySource: true }, targetBlocks: [target], targetTrips: tgtTrips })).findings).toEqual([]);
  });

  it('applies no gate when source Blocks hold no Trips', () => {
    const preview = buildBlockingDayCopyPreview(input({ sourceBlocks: [block('B1', 'sa', [])] }));
    expect(preview.impact.matchRate).toBeUndefined();
    expect(preview.findings).toEqual([]);
    expect(preview.blocks).toHaveLength(1);
  });

  it('refuses the same day, unavailable days, and a mismatched Blocking Scenario', () => {
    expect(ids(buildBlockingDayCopyPreview(input({ request: { ...request, targetServiceDayId: 'sa' }, allowEmptySource: true } as Partial<BlockingDayCopyInput>)))).toContain('blockingDayCopy.sameDay');
    expect(ids(buildBlockingDayCopyPreview(input({ request: { ...request, targetServiceDayId: 'other', allowEmptySource: true } })))).toContain('blockingDayCopy.dayUnavailable');
    expect(ids(buildBlockingDayCopyPreview(input({ request: { ...request, targetServiceDayId: 'missing', allowEmptySource: true } })))).toContain('blockingDayCopy.dayUnavailable');
    expect(ids(buildBlockingDayCopyPreview(input({ blockingScenario: { ...bs, scenarioId: 'elsewhere' }, request: { ...request, allowEmptySource: true } })))).toContain('blockingDayCopy.scenarioMismatch');
  });

  it('ignores Trips of another Trip Profile and Blocks of other days or Blocking Scenarios', () => {
    const preview = buildBlockingDayCopyPreview(input({
      sourceBlocks: [srcBlock, block('X', 'sa', [], { blockingScenarioId: 'other-bs' }), block('Y', 'wk', [rev('s1')])],
      sourceTrips: srcTrips,
      targetTrips: [...tgtTrips, trip('foreign', 'wk', 6 * H, undefined, { tripProfileId: 'other-profile' }), trip('foreign2', 'wk', 6 * H, undefined, { scenarioId: 'elsewhere' })],
      targetBlocks: [block('T-other-bs', 'wk', [], { blockingScenarioId: 'other-bs' }), block('T-other-day', 'sa', []), block('T1', 'wk', [])],
    }));
    expect(preview.impact.sourceBlockCount).toBe(1);
    expect(preview.removedTargetBlockIds).toEqual(['T1']);
    expect(preview.impact.unassignedTargetTripIds).toEqual([]);
    expect(preview.impact.ambiguousCount).toBe(0);
    expect(preview.tripMatches.map((m) => m.targetTripId)).toEqual(['t1', 't2', 't3']);
  });

  it('is deterministic across input order', () => {
    const blocksIn = [srcBlock, block('B2', 'sa', [rev('s4')])]; const tripsIn = [...srcTrips, trip('s4', 'sa', 12 * H)];
    const run = (blocks: BlockingBlock[], trips: Trip[], targets: Trip[]) => { const restore = counter(); try { return buildBlockingDayCopyPreview(input({ sourceBlocks: blocks, sourceTrips: trips, targetTrips: targets })); } finally { restore(); } };
    expect(run([...blocksIn].reverse(), [...tripsIn].reverse(), [...tgtTrips].reverse())).toEqual(run(blocksIn, tripsIn, tgtTrips));
  });

  it('reports validation findings on proposed Blocks and the source count', () => {
    const preview = buildBlockingDayCopyPreview(input({ sourceBlocks: [srcBlock], sourceTrips: srcTrips, targetTrips: tgtTrips }));
    expect(Array.isArray(preview.blockFindings)).toBe(true);
    expect(preview.sourceBlockFindingCount).toBe(preview.blockFindings.length);
  });
});

describe('createBlockingDayCopySignature', () => {
  const base = () => { const { now, minimumLayover, patternDirections, serviceDays, patterns, ...rest } = input({ sourceBlocks: [srcBlock], sourceTrips: srcTrips, targetTrips: tgtTrips }); void now; void minimumLayover; void patternDirections; void serviceDays; void patterns; return rest; };
  it('is unchanged by the two flags and changed by a Trip time edit', () => {
    const original = createBlockingDayCopySignature(base());
    expect(createBlockingDayCopySignature({ ...base(), request: { ...request, allowEmptySource: true, acknowledgeMismatch: true } })).toBe(original);
    const edited = { ...base(), targetTrips: [trip('t1', 'wk', 6 * H + 60), tgtTrips[1], tgtTrips[2]] };
    expect(createBlockingDayCopySignature(edited)).not.toBe(original);
  });
  it('does not depend on input order', () => {
    expect(createBlockingDayCopySignature({ ...base(), sourceTrips: [...srcTrips].reverse(), targetTrips: [...tgtTrips].reverse() })).toBe(createBlockingDayCopySignature(base()));
  });
  it('matches the preview signature', () => {
    expect(buildBlockingDayCopyPreview(input({ sourceBlocks: [srcBlock], sourceTrips: srcTrips, targetTrips: tgtTrips })).sourceSignature).toBe(createBlockingDayCopySignature(base()));
  });
});
