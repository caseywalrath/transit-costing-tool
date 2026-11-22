import { describe, expect, it } from 'vitest';
import type { RoutePattern, Trip } from '../types';
import { type BlockMember, blockFromFeed } from './blocksFromFeed';

const NOW = '2026-11-21T00:00:00.000Z';

// One pattern runs from node-a to node-b; the other runs back from node-b to node-a.
const outbound: RoutePattern = {
  id: 'pattern-1',
  scenarioId: 'scenario-1',
  routeId: 'route-1',
  name: 'Out',
  points: [
    { id: 'p0', nodeId: 'node-a', sequence: 0, cumulativeMiles: 0 },
    { id: 'p1', nodeId: 'node-b', sequence: 1, cumulativeMiles: 1 },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

const inbound: RoutePattern = {
  ...outbound,
  id: 'pattern-2',
  name: 'Back',
  points: [
    { id: 'q0', nodeId: 'node-b', sequence: 0, cumulativeMiles: 0 },
    { id: 'q1', nodeId: 'node-a', sequence: 1, cumulativeMiles: 1 },
  ],
};

function tripOn(id: string, patternId: string, start: number): Trip {
  return {
    id,
    scenarioId: 'scenario-1',
    routeId: 'route-1',
    serviceDayId: 'sd-weekday',
    patternId,
    stopTimes: [
      { patternPointId: 'x', sequence: 0, time: start },
      { patternPointId: 'y', sequence: 1, time: start + 600 },
    ],
    provenance: { kind: 'generated', creationMethod: 'feed', manuallyChangedFields: [] },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const outTrip1 = tripOn('trip-out-1', 'pattern-1', 21600);
const outTrip2 = tripOn('trip-out-2', 'pattern-1', 25200);
const backTrip = tripOn('trip-back-1', 'pattern-2', 23400);

const trips = new Map([outTrip1, outTrip2, backTrip].map((trip) => [trip.id, trip] as const));
const patterns = new Map([outbound, inbound].map((pattern) => [pattern.id, pattern] as const));

function member(trip: Trip, feedTripId: string, startNodeId: string, endNodeId: string): BlockMember {
  return { trip, feedTripId, startNodeId, endNodeId };
}

function build(members: BlockMember[], minutes: { pullOutMinutes?: number; pullInMinutes?: number } = {}) {
  return blockFromFeed({
    scenarioId: 'scenario-1',
    blockingScenarioId: 'blocking-1',
    serviceDayId: 'sd-weekday',
    label: '42',
    members,
    trips,
    patterns,
    now: NOW,
    ...minutes,
  });
}

describe('blockFromFeed (Decision 0089 items 34 and 35)', () => {
  it('orders the trips in time, and puts a zero-minute deadhead where a trip ends at a different Node from the next start', () => {
    const result = build(
      [member(outTrip2, 'C', 'node-a', 'node-b'), member(outTrip1, 'A', 'node-a', 'node-b')],
      { pullOutMinutes: 10, pullInMinutes: 10 },
    );
    if (!('block' in result)) throw new Error('expected a block');
    expect(result.block).toMatchObject({ label: '42', scenarioId: 'scenario-1', blockingScenarioId: 'blocking-1', serviceDayId: 'sd-weekday' });
    expect(result.block.activities).toEqual([
      expect.objectContaining({ type: 'pullOut', sequence: 0, toNodeId: 'node-a', minutesBeforeFirstTrip: 10 }),
      expect.objectContaining({ type: 'revenueTrip', sequence: 1, tripId: 'trip-out-1' }),
      expect.objectContaining({ type: 'deadhead', sequence: 2, fromNodeId: 'node-b', toNodeId: 'node-a', minutesAfterPreviousTrip: 0 }),
      expect.objectContaining({ type: 'revenueTrip', sequence: 3, tripId: 'trip-out-2' }),
      expect.objectContaining({ type: 'pullIn', sequence: 4, fromNodeId: 'node-b', minutesAfterLastTrip: 10 }),
    ]);
  });

  it('adds no deadhead when one trip ends at the Node the next one starts from', () => {
    const result = build([member(outTrip1, 'A', 'node-a', 'node-b'), member(backTrip, 'B', 'node-b', 'node-a')], { pullOutMinutes: 10, pullInMinutes: 10 });
    if (!('block' in result)) throw new Error('expected a block');
    expect(result.block.activities.map((activity) => activity.type)).toEqual(['pullOut', 'revenueTrip', 'revenueTrip', 'pullIn']);
  });

  it('puts the pull-out at the first trip\'s start Node and the pull-in at the last trip\'s end Node', () => {
    const result = build([member(outTrip1, 'A', 'node-a', 'node-b')], { pullOutMinutes: 15, pullInMinutes: 5 });
    if (!('block' in result)) throw new Error('expected a block');
    expect(result.block.activities).toEqual([
      expect.objectContaining({ type: 'pullOut', toNodeId: 'node-a', minutesBeforeFirstTrip: 15 }),
      expect.objectContaining({ type: 'revenueTrip', tripId: 'trip-out-1' }),
      expect.objectContaining({ type: 'pullIn', fromNodeId: 'node-b', minutesAfterLastTrip: 5 }),
    ]);
  });

  it('refuses a Block whose pull-out has no minutes, with the existing validation rule (Decision 0089 item 35)', () => {
    const result = build([member(outTrip1, 'A', 'node-a', 'node-b')], { pullInMinutes: 5 });
    expect(result).toEqual({ findings: [expect.objectContaining({ ruleId: 'block.boundaryTiming', severity: 'error' })] });
  });

  it('refuses a Block with no trips', () => {
    expect(() => build([])).toThrow(/has no trips/);
  });
});
