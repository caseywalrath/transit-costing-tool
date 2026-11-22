import { describe, expect, it } from 'vitest';
import { summarizeBlock } from '../blocking';
import type { BlockingBlock, RoutePattern, Trip } from '../types';
import { baselineSide, block, clock, pattern, proposedSide, serviceDay, trip } from './compareFixture';
import { peakByRoute, type PeakBlock } from './peaks';

const S = 'scn-peaks';

/** Each Block with its summary, as the caller passes them to peakByRoute. */
function withSummaries(blocks: BlockingBlock[], trips: Trip[], patterns: RoutePattern[]): PeakBlock[] {
  return blocks.map((item) => ({ block: item, summary: summarizeBlock(item, { trips, patterns }) }));
}

/** A Block with its revenue Trips only, so its interval comes from those Trips (no pull-out or pull-in). */
const tripsOnly = (item: BlockingBlock): BlockingBlock => ({ ...item, activities: item.activities.filter((activity) => activity.type === 'revenueTrip') });

describe('peakByRoute (Decision 0091 item 12)', () => {
  it('reproduces the README peaks: baseline system 2 (R1 2, R2 1); proposed system 3 (R1 2, Unattributed 1)', () => {
    const baseline = baselineSide();
    const proposed = proposedSide();
    const base = peakByRoute(withSummaries(baseline.blocks, baseline.trips, baseline.patterns), baseline.trips);
    const prop = peakByRoute(withSummaries(proposed.blocks, proposed.trips, proposed.patterns), proposed.trips);
    expect(base.system).toBe(2);
    expect(base.byRoute.get('b-r1')).toBe(2);
    expect(base.byRoute.get('b-r2')).toBe(1);
    expect(base.byRoute.get(null)).toBe(0);
    expect(prop.system).toBe(3);
    expect(prop.byRoute.get('p-r1')).toBe(2);
    expect(prop.byRoute.get(null)).toBe(1);
    // Route 3's only Block is interlined with Route 1, so Route 3 has no vehicles of its own.
    expect(prop.byRoute.has('p-r3')).toBe(false);
  });

  it('uses the pull-out start and the pull-in end of a Block when its summary has them', () => {
    const baseline = baselineSide();
    const [x1] = withSummaries([baseline.blocks[0]], baseline.trips, baseline.patterns);
    expect(x1.summary.platformStartSeconds).toBe(clock('05:50'));
    expect(x1.summary.platformEndSeconds).toBe(clock('07:25'));
  });

  it('two intervals that meet, one ending as the other starts, do not overlap', () => {
    const day = serviceDay(S, 'd', 'weekday', 'Weekday', 251, 1);
    const pat = pattern(S, 'pat', 'ra', 'outbound', [['X', 0], ['Y', 5]]);
    const first = trip(S, 't1', pat, day.id, '06:00', 30);
    const second = trip(S, 't2', pat, day.id, '07:30', 30);
    const blocks = [
      block(S, 'bs', day.id, 'b1', 'B1', ['05:00', '06:00'], [first], ['06:30', '07:25']),
      block(S, 'bs', day.id, 'b2', 'B2', ['07:25', '07:30'], [second], ['08:00', '08:10']),
    ];
    const result = peakByRoute(withSummaries(blocks, [first, second], [pat]), [first, second]);
    expect(result.system).toBe(1);
    expect(result.byRoute.get('ra')).toBe(1);
  });

  it('a second Block that starts one minute before the first one ends does overlap it', () => {
    const day = serviceDay(S, 'd', 'weekday', 'Weekday', 251, 1);
    const pat = pattern(S, 'pat', 'ra', 'outbound', [['X', 0], ['Y', 5]]);
    const first = trip(S, 't1', pat, day.id, '06:00', 30);
    const second = trip(S, 't2', pat, day.id, '07:30', 30);
    const blocks = [
      block(S, 'bs', day.id, 'b1', 'B1', ['05:00', '06:00'], [first], ['06:30', '07:25']),
      block(S, 'bs', day.id, 'b2', 'B2', ['07:24', '07:30'], [second], ['08:00', '08:10']),
    ];
    expect(peakByRoute(withSummaries(blocks, [first, second], [pat]), [first, second]).system).toBe(2);
  });

  it('a Block without pull-out and pull-in runs from its first revenue departure to its last revenue arrival', () => {
    const day = serviceDay(S, 'd', 'weekday', 'Weekday', 251, 1);
    const pat = pattern(S, 'pat', 'ra', 'outbound', [['X', 0], ['Y', 5]]);
    const earlier = trip(S, 't1', pat, day.id, '06:00', 30);
    const later = trip(S, 't2', pat, day.id, '06:20', 30);
    // The first Block runs [06:00, 06:30) and the second [06:20, 06:50), so they overlap for ten minutes.
    const blocks = [tripsOnly(block(S, 'bs', day.id, 'b1', 'B1', ['05:00', '06:00'], [earlier], ['06:30', '06:30'])), tripsOnly(block(S, 'bs', day.id, 'b2', 'B2', ['06:20', '06:20'], [later], ['06:50', '06:50']))];
    expect(withSummaries(blocks, [earlier, later], [pat])[0].summary.platformStartSeconds).toBeUndefined();
    expect(peakByRoute(withSummaries(blocks, [earlier, later], [pat]), [earlier, later]).system).toBe(2);
  });

  it('a Block whose revenue Trips are all on one Route counts for that Route; one on two Routes counts as Unattributed', () => {
    const day = serviceDay(S, 'd', 'weekday', 'Weekday', 251, 1);
    const patA = pattern(S, 'pat-a', 'ra', 'outbound', [['X', 0], ['Y', 5]]);
    const patB = pattern(S, 'pat-b', 'rb', 'outbound', [['X', 0], ['Y', 5]]);
    const onA = trip(S, 'ta', patA, day.id, '06:00', 30);
    const onB = trip(S, 'tb', patB, day.id, '08:00', 30);
    const blocks = [
      block(S, 'bs', day.id, 'single', 'Single', ['05:50', '06:00'], [onA], ['06:30', '06:35']),
      block(S, 'bs', day.id, 'mixed', 'Mixed', ['07:50', '08:00'], [onA, onB], ['08:30', '08:35']),
    ];
    const result = peakByRoute(withSummaries(blocks, [onA, onB], [patA, patB]), [onA, onB]);
    expect(result.byRoute.get('ra')).toBe(1);
    expect(result.byRoute.has('rb')).toBe(false);
    expect(result.byRoute.get(null)).toBe(1);
  });

  it('a Block with no revenue Trip is Unattributed, since it belongs to no one Route (Decision 0077)', () => {
    const day = serviceDay(S, 'd', 'weekday', 'Weekday', 251, 1);
    const blocks = [block(S, 'bs', day.id, 'empty', 'Empty', ['05:00', '05:10'], [], ['05:20', '05:30'])];
    const result = peakByRoute(withSummaries(blocks, [], []), []);
    expect(result.system).toBe(1);
    expect(result.byRoute.get(null)).toBe(1);
  });

  it('a day with no Blocks has no vehicles', () => {
    expect(peakByRoute([], []).system).toBe(0);
  });
});
