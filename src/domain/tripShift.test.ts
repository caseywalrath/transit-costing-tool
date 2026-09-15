import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import type { Trip } from './types';
import { buildTripShiftPreview, createTripShiftSourceSignature, type TripShiftRequest } from './tripShift';

const trip = (id: string, time: number): Trip => ({
  ...metadata('2026-09-14T00:00:00.000Z'),
  id,
  scenarioId: 'scenario',
  routeId: 'route',
  serviceDayId: 'weekday',
  patternId: 'pattern',
  tripProfileId: 'profile',
  stopTimes: [{ patternPointId: `${id}-point`, sequence: 0, time }],
  provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [] },
});

const request = (offsetSeconds: number): TripShiftRequest => ({
  scenarioId: 'scenario',
  routeId: 'route',
  serviceDayId: 'weekday',
  directionId: 'outbound',
  tripProfileId: 'profile',
  tripIds: ['trip-1'],
  offsetSeconds,
});

describe('staged Trip Shift', () => {
  it('previews a signed shift without mutating the source Trip', () => {
    const source = trip('trip-1', 3600);
    const preview = buildTripShiftPreview(request(-120), [source], '2026-09-14T01:00:00.000Z');

    expect(preview.originalTrips[0].stopTimes[0].time).toBe(3600);
    expect(preview.shiftedTrips[0].stopTimes[0].time).toBe(3480);
    expect(source.stopTimes[0].time).toBe(3600);
    expect(preview.netOffsetSeconds).toBe(-120);
    expect(preview.shiftedTrips[0].provenance.manualTimeShiftSeconds).toBe(-120);
    expect(preview.shiftedTrips[0].provenance.manuallyChangedFields).toContain('times');
  });

  it('uses the same source signature for different staged offsets', () => {
    const source = trip('trip-1', 3600);
    expect(createTripShiftSourceSignature(request(-60), [source])).toEqual(createTripShiftSourceSignature(request(120), [source]));
  });

  it('rejects duplicate selections before calculating a preview', () => {
    expect(() => buildTripShiftPreview({ ...request(60), tripIds: ['trip-1', 'trip-1'] }, [trip('trip-1', 3600)], '2026-09-14T01:00:00.000Z')).toThrow('Trip shift request is invalid');
  });
});
