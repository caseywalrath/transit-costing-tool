import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { RoutePattern, Trip } from '../domain/types';
import { parseTripTableCsv, tripTableCsv } from './tripTableCsv';

describe('Trips table CSV interchange', () => {
  it('round trips IDs, labels, timepoints, and second-level schedule times', () => {
    const pattern: RoutePattern = { ...metadata(), id: 'pattern', scenarioId: 'scenario', routeId: 'route', name: 'Outbound', points: [
      { id: 'p1', nodeId: 'n1', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'n2', sequence: 1, cumulativeMiles: 2 },
    ] };
    const trip: Trip = { ...metadata(), id: 'trip', scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', tripProfileId: 'profile', patternId: pattern.id, publicLabel: 'Trip, A', stopTimes: [
      { patternPointId: 'p1', sequence: 0, time: 18000 }, { patternPointId: 'p2', sequence: 1, time: 18435 },
    ], provenance: { kind: 'generated', manuallyChangedFields: [] } };
    const parsed = parseTripTableCsv(tripTableCsv([trip], [pattern], (nodeId) => nodeId === 'n1' ? 'Central' : 'Airport'));
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toEqual([{ tripId: 'trip', patternId: 'pattern', publicLabel: 'Trip, A', stopTimes: [
      { patternPointId: 'p1', time: 18000 }, { patternPointId: 'p2', time: 18435 },
    ] }]);
  });
});
