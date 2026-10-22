import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import type { Trip } from './types';
import { buildTripShiftPreview, createTripShiftSourceSignature, TripShiftValidationError, type TripShiftRequest } from './tripShift';

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

describe('staged Trip Shift bounds (I-012, 2-002; I-064, 2-010)', () => {
  const now = '2026-10-22T00:00:00.000Z';
  const rejection = (fn: () => unknown) => { try { fn(); } catch (error) { return error as TripShiftValidationError; } throw new Error('expected the Shift to be rejected'); };

  it('rejects a Shift that moves a time before 0:00, naming the Trip', () => {
    // A Trip departing 0:05 shifted six minutes earlier would depart at -0:01.
    const error = rejection(() => buildTripShiftPreview(request(-360), [trip('trip-1', 300)], now));
    expect(error).toBeInstanceOf(TripShiftValidationError);
    expect(error.findings.map((finding) => [finding.ruleId, finding.severity, finding.entityType, finding.entityId, finding.field])).toEqual([['tripShift.timeBeforeServiceDay', 'error', 'trip', 'trip-1', 'stopTimes']]);
    expect(error.message).toContain('before 0:00');
  });

  it('allows a Shift that lands exactly on 0:00', () => {
    const preview = buildTripShiftPreview(request(-300), [trip('trip-1', 300)], now);
    expect(preview.findings).toEqual([]);
    expect(preview.shiftedTrips[0].stopTimes.map((point) => point.time)).toEqual([0]);
  });

  it('checks every selected Trip and reports only the ones that would go below 0:00', () => {
    const error = rejection(() => buildTripShiftPreview({ ...request(-600), tripIds: ['trip-1', 'trip-2', 'trip-3'] }, [trip('trip-1', 300), trip('trip-2', 900), trip('trip-3', 599)], now));
    expect(error.findings.map((finding) => finding.entityId)).toEqual(['trip-1', 'trip-3']);
  });

  it('a Shift of zero seconds is a no-op: same Trips, no manual-change flag', () => {
    const source = trip('trip-1', 21600);
    const preview = buildTripShiftPreview(request(0), [source], now);
    expect(preview.findings).toEqual([]);
    expect(preview.netOffsetSeconds).toBe(0);
    expect(preview.shiftedTrips).toEqual([source]);
    expect(preview.shiftedTrips[0].provenance.manuallyChangedFields).toEqual([]);
    expect(preview.shiftedTrips[0].updatedAt).toBe(source.updatedAt);
  });
});
