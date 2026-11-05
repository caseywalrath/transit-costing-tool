import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import type { GenerateTripsRequest, RoutePattern, RuntimeBand, RuntimeProfile, Trip } from './types';
import { generateAuthoritativeTrips, generateRequestDepartures, generateTrips, recalculateTripWithAnchor, TripGenerationError, validateGenerateTripsRequest } from './trips';

// Decision 0058 item 7 (PF6): Build trips can place each time at a measure node instead of the first stop.
const stamp = '2026-11-05T09:00:00.000Z';
const pattern: RoutePattern = { id: 'p', scenarioId: 's', routeId: 'r', name: 'A-B-C', directionId: 'd', points: [{ id: 'pa', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'pb', nodeId: 'B', sequence: 1, cumulativeMiles: 1 }, { id: 'pc', nodeId: 'C', sequence: 2, cumulativeMiles: 2 }], ...metadata(stamp) };
const band = (id: string, startTime: number, endTime: number, segmentRuntimeSeconds: number[]): RuntimeBand => ({ id, label: id, sequence: 0, startTime, endTime, segmentRuntimeSeconds });
// 8:00 is the band boundary: 10 + 15 minutes before it, 12 + 18 minutes after it.
const bands = [band('am', 0, 28800, [600, 900]), band('pm', 28800, 90000, [720, 1080])];
const profile = (calculationMethod?: RuntimeProfile['calculationMethod']): RuntimeProfile => ({ id: 'rp', scenarioId: 's', routeId: 'r', patternId: 'p', name: 'Runtime', bands, ...(calculationMethod ? { calculationMethod } : {}), ...metadata(stamp) });
const base = { scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', patternId: 'p', tripProfileId: 'tp' };
const times = (trips: Trip[]) => trips.map((trip) => trip.stopTimes.map((point) => point.time));
const ruleIds = (run: () => unknown) => { try { run(); } catch (error) { if (error instanceof TripGenerationError) return error.findings.map((finding) => finding.ruleId); throw error; } return []; };
/** A trip without the fields that differ between two runs (ids and save times). */
const comparable = (trip: Trip) => ({ patternId: trip.patternId, tripProfileId: trip.tripProfileId, stopTimes: trip.stopTimes, provenance: trip.provenance });

describe('generation without an anchor (unchanged)', () => {
  it('gives the times it gave before Decision 0058 (pinned values)', () => {
    const request: GenerateTripsRequest = { ...base, firstTrip: 27000, headwaySeconds: 1800, tripCount: 3 };
    expect(times(generateAuthoritativeTrips(request, pattern, profile(), stamp))).toEqual([[27000, 27600, 28500], [28800, 29520, 30600], [30600, 31320, 32400]]);
    expect(times(generateTrips(request, pattern, profile(), stamp))).toEqual([[27000, 27600, 28500], [28800, 29520, 30600], [30600, 31320, 32400]]);
  });

  it('with the anchor at the first stop gives exactly the same trips', () => {
    for (const method of [undefined, 'segmentStart', 'blendSegments'] as const) {
      const request: GenerateTripsRequest = { ...base, firstTrip: 25200, headwaySeconds: 900, lastTrip: 32400 };
      const plain = generateAuthoritativeTrips(request, pattern, profile(method), stamp).map(comparable);
      const anchored = generateAuthoritativeTrips({ ...request, anchorNodeId: 'A' }, pattern, profile(method), stamp).map(comparable);
      expect(anchored).toEqual(plain);
    }
  });
});

describe('generation at a mid-route anchor', () => {
  it('places each slot at the anchor and calculates both sides like Regenerate', () => {
    const trips = generateAuthoritativeTrips({ ...base, slots: [25200, 28000], anchorNodeId: 'B' }, pattern, profile(), stamp);
    expect(times(trips)).toEqual([[24600, 25200, 26100], [27400, 28000, 28900]]);
    for (const trip of trips) {
      expect(trip.provenance).toMatchObject({ kind: 'generated', creationMethod: 'generated', runtimeProfileId: 'rp' });
      expect('manualTimeShiftSeconds' in trip.provenance).toBe(false);
      expect(recalculateTripWithAnchor(trip, pattern, profile(), stamp, 'pb').trip.stopTimes).toEqual(trip.stopTimes);
    }
    expect(trips.map((trip) => trip.provenance.generationSequence)).toEqual([0, 1]);
  });

  it('under segmentStart, a slot just after the band boundary takes the earlier band before it and the later band after it', () => {
    const [trip] = generateAuthoritativeTrips({ ...base, slots: [29100], anchorNodeId: 'B' }, pattern, profile('segmentStart'), stamp);
    expect(trip.stopTimes.map((point) => point.time)).toEqual([28500, 29100, 30180]);
    expect(recalculateTripWithAnchor(trip, pattern, profile('segmentStart'), stamp, 'pb').trip.stopTimes).toEqual(trip.stopTimes);
  });

  it('under blendSegments, matches Regenerate with the same anchor', () => {
    const trips = generateAuthoritativeTrips({ ...base, slots: [28500, 29400], anchorNodeId: 'B' }, pattern, profile('blendSegments'), stamp);
    for (const trip of trips) {
      expect(trip.stopTimes[1].time).toBe(trip === trips[0] ? 28500 : 29400);
      expect(recalculateTripWithAnchor(trip, pattern, profile('blendSegments'), stamp, 'pb').trip.stopTimes).toEqual(trip.stopTimes);
    }
  });

  it('uses the first visit of a node the Pattern visits twice', () => {
    const loop: RoutePattern = { ...pattern, points: [...pattern.points, { id: 'pb2', nodeId: 'B', sequence: 3, cumulativeMiles: 3 }] };
    const loopProfile: RuntimeProfile = { ...profile(), bands: [band('all', 0, 90000, [600, 900, 300])] };
    const [trip] = generateAuthoritativeTrips({ ...base, slots: [28000], anchorNodeId: 'B' }, loop, loopProfile, stamp);
    expect(trip.stopTimes.map((point) => point.time)).toEqual([27400, 28000, 28900, 29200]);
  });

  it('refuses a Pattern that does not serve the anchor node', () => {
    expect(ruleIds(() => generateAuthoritativeTrips({ ...base, slots: [28000], anchorNodeId: 'Z' }, pattern, profile(), stamp))).toEqual(['tripGeneration.anchorNodeNotServed']);
  });

  it('reports a slot the runtimes cannot reach as a finding with its time', () => {
    try {
      generateAuthoritativeTrips({ ...base, slots: [300, 28000], anchorNodeId: 'B' }, pattern, profile(), stamp);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TripGenerationError);
      const findings = (error as TripGenerationError).findings;
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ entityType: 'generateTrips', field: 'anchorNodeId', parameters: { departure: 300 } });
    }
  });
});

describe('the slot form', () => {
  it('builds exactly the given times at the first stop when there is no anchor', () => {
    expect(generateRequestDepartures({ ...base, slots: [21600, 23400, 24300] })).toEqual([21600, 23400, 24300]);
    expect(times(generateAuthoritativeTrips({ ...base, slots: [21600] }, pattern, profile(), stamp))).toEqual([[21600, 22200, 23100]]);
  });

  it('is exclusive with the headway form and must be increasing whole seconds', () => {
    expect(validateGenerateTripsRequest({ ...base, slots: [21600], firstTrip: 21600 }).map((finding) => finding.ruleId)).toEqual(['tripGeneration.slotsExclusive']);
    expect(validateGenerateTripsRequest({ ...base, slots: [21600], tripCount: 1 }).map((finding) => finding.ruleId)).toEqual(['tripGeneration.slotsExclusive']);
    expect(validateGenerateTripsRequest({ ...base, slots: [] }).map((finding) => finding.ruleId)).toEqual(['tripGeneration.slotsInvalid']);
    expect(validateGenerateTripsRequest({ ...base, slots: [23400, 21600] }).map((finding) => finding.ruleId)).toEqual(['tripGeneration.slotsInvalid']);
    expect(validateGenerateTripsRequest({ ...base, slots: [21600, 21600] }).map((finding) => finding.ruleId)).toEqual(['tripGeneration.slotsInvalid']);
    expect(validateGenerateTripsRequest({ ...base, slots: [21600.5] }).map((finding) => finding.ruleId)).toEqual(['tripGeneration.slotsInvalid']);
    expect(validateGenerateTripsRequest({ ...base, slots: Array.from({ length: 501 }, (_, index) => index * 60) }).map((finding) => finding.ruleId)).toEqual(['tripGeneration.tripCountTooLarge']);
  });

  it('leaves the headway form refusing a missing first trip or headway as before', () => {
    expect(validateGenerateTripsRequest({ ...base, tripCount: 2 }).map((finding) => finding.ruleId)).toEqual(['tripGeneration.firstTripInvalid', 'tripGeneration.headwayInvalid']);
  });
});
