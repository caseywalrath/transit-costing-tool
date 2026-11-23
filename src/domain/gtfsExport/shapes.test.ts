import { describe, expect, it } from 'vitest';
import type { Node, RoutePattern, RouteStopSet } from '../types';
import { patternShapePoints, shapesText } from './shapes';

const META = { createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' };

const pattern: RoutePattern = {
  id: 'pattern-ac', scenarioId: 's', routeId: 'r', name: 'A to C',
  points: [
    { id: 'pp-a', nodeId: 'n-a', sequence: 1, cumulativeMiles: 0 },
    { id: 'pp-c', nodeId: 'n-c', sequence: 2, cumulativeMiles: 4 },
  ],
  ...META,
};
const nodes: Node[] = [
  { id: 'n-a', scenarioId: 's', routeId: 'r', name: 'A', kind: 'terminal', ...META },
  { id: 'n-c', scenarioId: 's', routeId: 'r', name: 'C', kind: 'terminal', ...META },
];

describe('patternShapePoints (Decision 0090 item 17)', () => {
  it('runs straight through the located timepoints and Route stops, in pattern order, with the miles of their stop times', () => {
    const set: RouteStopSet = {
      id: 'set', scenarioId: 's', routeId: 'r', roundingSeconds: 60,
      stops: [{ id: 's1', name: 'Mid', latitude: 39.72, longitude: -105 }],
      placementsByPatternId: { 'pattern-ac': [{ id: 'p1', stopId: 's1', afterPatternPointId: 'pp-a', sequence: 1, timing: 'interpolate' }] },
      timepointLocationsByPatternId: { 'pattern-ac': { 'pp-a': { latitude: 39.7, longitude: -105 }, 'pp-c': { latitude: 39.74, longitude: -105 } } },
      ...META,
    };

    expect(patternShapePoints(pattern, nodes, set)).toEqual([
      { latitude: 39.7, longitude: -105, miles: 0 },
      { latitude: 39.72, longitude: -105, miles: 2 },
      { latitude: 39.74, longitude: -105, miles: 4 },
    ]);
  });

  it('throws for a point without a location, which E1 has already refused (an invariant)', () => {
    expect(() => patternShapePoints(pattern, nodes, undefined)).toThrow(/has no location/);
  });
});

describe('shapesText (Decision 0090 item 12)', () => {
  it('sorts the shapes by shape_id and the points by sequence, with miles to three decimals and coordinates to six', () => {
    const text = shapesText([
      { shapeId: 'T1-B', points: [{ latitude: 39.8, longitude: -105, miles: 1 }] },
      { shapeId: 'T1-A', points: [{ latitude: 39.7, longitude: -105, miles: 0 }, { latitude: 39.71, longitude: -105.5, miles: 1.25 }] },
    ]);

    expect(text).toBe([
      'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence,shape_dist_traveled',
      'T1-A,39.700000,-105.000000,1,0.000',
      'T1-A,39.710000,-105.500000,2,1.250',
      'T1-B,39.800000,-105.000000,1,1.000',
      '',
    ].join('\n'));
  });
});
