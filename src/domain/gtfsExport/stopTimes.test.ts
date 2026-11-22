import { describe, expect, it } from 'vitest';
import { stopTimeRows } from '../stopTimes';
import type { Node, RoutePattern, RouteStopSet, Trip } from '../types';
import { rowMiles } from './stopTimes';

const META = { createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' };

/** A one-segment pattern: timepoints A and B, `miles` apart. Each timepoint is its own Node. */
function segmentPattern(miles: number): { pattern: RoutePattern; nodes: Node[] } {
  const pattern: RoutePattern = {
    id: 'pattern-ab', scenarioId: 's', routeId: 'r', name: 'A to B',
    points: [
      { id: 'pp-a', nodeId: 'n-a', sequence: 1, cumulativeMiles: 0 },
      { id: 'pp-b', nodeId: 'n-b', sequence: 2, cumulativeMiles: miles },
    ],
    ...META,
  };
  const nodes: Node[] = [
    { id: 'n-a', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal', ...META },
    { id: 'n-b', scenarioId: 's', routeId: 'r', name: 'B', kind: 'terminal', ...META },
  ];
  return { pattern, nodes };
}

/** A Trip with A at 06:00 and B at 06:10 (600 seconds). */
function trip(): Trip {
  return {
    id: 'trip-1', scenarioId: 's', routeId: 'r', serviceDayId: 'd', patternId: 'pattern-ab',
    stopTimes: [{ patternPointId: 'pp-a', sequence: 1, time: 21600 }, { patternPointId: 'pp-b', sequence: 2, time: 22200 }],
    provenance: { kind: 'manual', manuallyChangedFields: [] },
    ...META,
  };
}

function setWith(stops: RouteStopSet['stops'], placements: RouteStopSet['placementsByPatternId']['pattern-ab'], extra: Partial<RouteStopSet> = {}): RouteStopSet {
  return {
    id: 'set', scenarioId: 's', routeId: 'r', roundingSeconds: 1, stops,
    placementsByPatternId: { 'pattern-ab': placements },
    ...META,
    ...extra,
  };
}

describe('rowMiles (Decision 0090 item 11)', () => {
  it('places interpolated Route stops by equal spacing: the j-th of m stops at j / (m + 1) of the segment', () => {
    const { pattern, nodes } = segmentPattern(6);
    const stops = [{ id: 's1', name: 'S1' }, { id: 's2', name: 'S2' }, { id: 's3', name: 'S3' }];
    const set = setWith(stops, [
      { id: 'p1', stopId: 's1', afterPatternPointId: 'pp-a', sequence: 1, timing: 'interpolate' },
      { id: 'p2', stopId: 's2', afterPatternPointId: 'pp-a', sequence: 2, timing: 'interpolate' },
      { id: 'p3', stopId: 's3', afterPatternPointId: 'pp-a', sequence: 3, timing: 'interpolate' },
    ]);

    const rows = stopTimeRows({ pattern, set, nodes, trip: trip() });
    const miles = rowMiles(rows, pattern, set);

    expect(miles.map((value) => Number(value.toFixed(9)))).toEqual([0, 1.5, 3, 4.5, 6]);
  });

  it('places a previous stop at the start of its segment and a next stop at the end', () => {
    const { pattern, nodes } = segmentPattern(6);
    const set = setWith(
      [{ id: 's1', name: 'Before' }, { id: 's2', name: 'Middle' }, { id: 's3', name: 'After' }],
      [
        { id: 'p1', stopId: 's1', afterPatternPointId: 'pp-a', sequence: 1, timing: 'previous' },
        { id: 'p2', stopId: 's2', afterPatternPointId: 'pp-a', sequence: 2, timing: 'interpolate' },
        { id: 'p3', stopId: 's3', afterPatternPointId: 'pp-a', sequence: 3, timing: 'next' },
      ],
    );

    const rows = stopTimeRows({ pattern, set, nodes, trip: trip() });

    expect(rowMiles(rows, pattern, set)).toEqual([0, 0, 3, 6, 6]);
  });

  it('places an interpolated stop under distance spacing at its great-circle share of the segment, and its time agrees (Decision 0086)', () => {
    // Along the equator one degree of longitude is the same distance everywhere, so the stop at 0.05 of 0.2 degrees is a quarter of the way.
    const pattern: RoutePattern = {
      id: 'pattern-ab', scenarioId: 's', routeId: 'r', name: 'A to B',
      points: [{ id: 'pp-a', nodeId: 'n-a', sequence: 1, cumulativeMiles: 0 }, { id: 'pp-b', nodeId: 'n-b', sequence: 2, cumulativeMiles: 10 }],
      ...META,
    };
    const nodes: Node[] = [
      { id: 'n-a', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal', ...META },
      { id: 'n-b', scenarioId: 's', routeId: 'r', name: 'B', kind: 'terminal', ...META },
    ];
    const set = setWith(
      [{ id: 's1', name: 'S1', latitude: 0, longitude: 0.05 }],
      [{ id: 'p1', stopId: 's1', afterPatternPointId: 'pp-a', sequence: 1, timing: 'interpolate' }],
      {
        interpolation: 'distance',
        timepointLocationsByPatternId: { 'pattern-ab': { 'pp-a': { latitude: 0, longitude: 0 }, 'pp-b': { latitude: 0, longitude: 0.2 } } },
      },
    );

    const rows = stopTimeRows({ pattern, set, nodes, trip: trip() });
    const miles = rowMiles(rows, pattern, set);

    expect(rows[1]).toMatchObject({ kind: 'stop', spacing: 'distance', time: 21750 });
    expect(miles[1]).toBeCloseTo(2.5, 9);
  });

  it('falls back to equal spacing, as stop times do, when a point under distance spacing has no location', () => {
    const { pattern, nodes } = segmentPattern(10);
    const set = setWith(
      [{ id: 's1', name: 'S1', latitude: 0, longitude: 0.05 }],
      [{ id: 'p1', stopId: 's1', afterPatternPointId: 'pp-a', sequence: 1, timing: 'interpolate' }],
      { interpolation: 'distance' },
    );

    const rows = stopTimeRows({ pattern, set, nodes, trip: trip() });

    expect(rows[1]).toMatchObject({ kind: 'stop', spacing: 'equal' });
    expect(rowMiles(rows, pattern, set)[1]).toBeCloseTo(5, 9);
  });

  it('gives a timepoint its cumulative miles and needs no stop set', () => {
    const { pattern, nodes } = segmentPattern(4.25);
    const rows = stopTimeRows({ pattern, nodes, trip: trip() });

    expect(rowMiles(rows, pattern, undefined)).toEqual([0, 4.25]);
  });
});
