import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import type { Block, GenerateTripsRequest, RoutePattern, RuntimeProfile, Trip, TripGenerationSet } from './types';
import { AnchorBandChoiceError, adjustBlockReferences, applyPatternChange, applyRegeneration, generateAuthoritativeTrips, generateRequestDepartures, generateTrips, markTripRecalculated, MAX_TRIPS_PER_GENERATION, previewPatternChange, previewRegeneration, recalculateTripWithAnchor, shiftTrips, TripGenerationError, tripRunTimeSeconds, validateGenerateTripsRequest, validateTrip, validateTripGenerationSet } from './trips';

const pattern: RoutePattern = { ...metadata(), id: 'p1', scenarioId: 's1', routeId: 'r1', name: 'Outbound', points: [
  { id: 'a', nodeId: 'na', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'nb', sequence: 1, cumulativeMiles: 1 }, { id: 'c', nodeId: 'nc', sequence: 2, cumulativeMiles: 2 },
] };
const profile: RuntimeProfile = { ...metadata(), id: 'rp1', scenarioId: 's1', routeId: 'r1', patternId: 'p1', name: 'Weekday', bands: [
  { id: 'am', label: 'AM', sequence: 0, startTime: 0, endTime: 3600, segmentRuntimeSeconds: [60, 120] },
  { id: 'pm', label: 'PM', sequence: 1, startTime: 3600, endTime: 9000, segmentRuntimeSeconds: [120, 180] },
] };
const set = (limit: TripGenerationSet['limit']): TripGenerationSet => ({ ...metadata(), id: 'gs1', scenarioId: 's1', routeId: 'r1', serviceDayId: 'weekday', patternId: 'p1', name: 'All day', firstDeparture: 3500, headwaySeconds: 600, limit, generationRevision: 1 });

describe('trip generation and overrides', () => {
  it('calculates the displayed run time from a trip’s first and last scheduled points', () => {
    const trip: Trip = {
      ...metadata(), id: 'trip1', scenarioId: 's1', routeId: 'r1', serviceDayId: 'weekday', patternId: 'p1',
      stopTimes: [
        { patternPointId: 'a', sequence: 0, time: 4 * 3600 + 60 },
        { patternPointId: 'b', sequence: 1, time: 4 * 3600 + 8 * 60 },
        { patternPointId: 'c', sequence: 2, time: 4 * 3600 + 45 * 60 },
      ],
      provenance: { kind: 'manual', manuallyChangedFields: [] },
    };
    expect(tripRunTimeSeconds(trip)).toBe(44 * 60);
    expect(tripRunTimeSeconds({ ...trip, stopTimes: [
      { patternPointId: 'c', sequence: 2, time: 5 * 3600 + 21 * 60 },
      { patternPointId: 'b', sequence: 1, time: 4 * 3600 + 27 * 60 },
    ] })).toBe(54 * 60);
    expect(tripRunTimeSeconds({ ...trip, stopTimes: [trip.stopTimes[0]] })).toBeUndefined();
  });

  it('preserves a later anchor when segment blending crosses a boundary', () => {
    const blended = { ...profile, calculationMethod: 'blendSegments' as const };
    const trip = generateTrips(set({ mode: 'tripCount', tripCount: 1 }), pattern, blended)[0];
    const changed = { ...blended, bands: blended.bands.map((band) => ({ ...band, segmentRuntimeSeconds: band.id === 'am' ? [90, 120] : [180, 180] })) };
    const result = recalculateTripWithAnchor(trip, pattern, changed, undefined, 'c');
    expect(result.trip.stopTimes[2].time).toBe(trip.stopTimes[2].time);
    expect(result.bandSelection).toBeUndefined();
  });
  it('preserves a chosen timepoint and resolves the band from the resulting first departure', () => {
    const trip = generateTrips(set({ mode: 'tripCount', tripCount: 1 }), pattern, profile)[0];
    const changed = { ...profile, bands: profile.bands.map((band) => ({ ...band, segmentRuntimeSeconds: band.id === 'am' ? [120, 240] : [180, 240] })) };
    expect(markTripRecalculated(trip, pattern, changed, undefined, 'a').stopTimes.map((point) => point.time)).toEqual([3500, 3620, 3860]);
    expect(markTripRecalculated(trip, pattern, changed, undefined, 'b').stopTimes.map((point) => point.time)).toEqual([3440, 3560, 3800]);
    expect(markTripRecalculated(trip, pattern, changed, undefined, 'c').stopTimes.map((point) => point.time)).toEqual([3320, 3440, 3680]);
    expect(() => markTripRecalculated(trip, pattern, changed, undefined, 'missing')).toThrow(TripGenerationError);
  });

  it('rejects an anchor with two consistent departure bands', () => {
    const trip = generateTrips(set({ mode: 'tripCount', tripCount: 1 }), pattern, profile)[0];
    const ambiguous = { ...profile, bands: [{ ...profile.bands[0], segmentRuntimeSeconds: [60, 120] }, { ...profile.bands[1], segmentRuntimeSeconds: [30, 30] }] };
    expect(() => markTripRecalculated(trip, pattern, ambiguous, undefined, 'c')).toThrow(TripGenerationError);
    expect(recalculateTripWithAnchor(trip, pattern, ambiguous, undefined, 'c', 'pm')).toMatchObject({
      trip: { stopTimes: [{ time: 3620 }, { time: 3650 }, { time: 3680 }] },
      bandSelection: { bandLabel: 'PM', departure: 3620, selection: 'manual' },
    });
  });
  it('uses the uniquely nearest band within ten minutes when no band contains its implied departure', () => {
    const trip = generateTrips(set({ mode: 'tripCount', tripCount: 1 }), pattern, profile)[0];
    const anchored = { ...trip, stopTimes: trip.stopTimes.map((point, index) => index === 2 ? { ...point, time: 3860 } : point) };
    const result = recalculateTripWithAnchor(anchored, pattern, profile, undefined, 'c');
    expect(result.trip.stopTimes.map((point) => point.time)).toEqual([3560, 3680, 3860]);
    expect(result.bandSelection).toMatchObject({ tripId: trip.id, bandLabel: 'PM', departure: 3560, distanceSeconds: 40, side: 'before', selection: 'automatic' });
  });
  it('requires a choice for equally near bands and rejects distant bands', () => {
    const trip = generateTrips(set({ mode: 'tripCount', tripCount: 1 }), pattern, profile)[0];
    const anchored = (time: number) => ({ ...trip, stopTimes: trip.stopTimes.map((point, index) => index === 2 ? { ...point, time } : point) });
    expect(() => recalculateTripWithAnchor(anchored(3840), pattern, profile, undefined, 'c')).toThrow(/trip.anchorNearestTie/);
    expect(recalculateTripWithAnchor(anchored(3840), pattern, profile, undefined, 'c', 'pm').bandSelection).toMatchObject({ departure: 3540, selection: 'manual' });
    const separated = { ...profile, bands: profile.bands.map((band) => band.id === 'pm' ? { ...band, startTime: 4800 } : band) };
    expect(recalculateTripWithAnchor(anchored(4500), pattern, separated, undefined, 'c').bandSelection).toMatchObject({ bandLabel: 'PM', distanceSeconds: 600, selection: 'automatic' });
    expect(() => recalculateTripWithAnchor(anchored(4499), pattern, separated, undefined, 'c')).toThrow(/trip.anchorNoRuntime/);
    expect(recalculateTripWithAnchor(anchored(4499), pattern, separated, undefined, 'c', 'pm').trip.stopTimes[2].time).toBe(4499);
  });
  it('validates controls and includes an end-time departure', () => {
    expect(validateTripGenerationSet(set({ mode: 'endTime', endTime: 4700 }))).toEqual([]);
    expect(generateTrips(set({ mode: 'endTime', endTime: 4700 }), pattern, profile).map((trip) => trip.stopTimes[0].time)).toEqual([3500, 4100, 4700]);
    expect(validateTripGenerationSet({ ...set({ mode: 'tripCount', tripCount: 0 }), headwaySeconds: 0 }).length).toBeGreaterThan(1);
  });

  it('generates an inclusive Last Trip or an exact requested trip count', () => {
    const common = { scenarioId: 's1', routeId: 'r1', serviceDayId: 'weekday', patternId: 'p1', firstTrip: 5 * 60 * 60, headwaySeconds: 15 * 60 };
    const byLastTrip: GenerateTripsRequest = { ...common, lastTrip: 6 * 60 * 60 };
    const byTripCount: GenerateTripsRequest = { ...common, tripCount: 4 };
    expect(generateRequestDepartures(byLastTrip)).toEqual([18000, 18900, 19800, 20700, 21600]);
    expect(generateRequestDepartures(byTripCount)).toEqual([18000, 18900, 19800, 20700]);
    expect(validateGenerateTripsRequest({ ...common })).toHaveLength(1);
    expect(validateGenerateTripsRequest({ ...common, lastTrip: 21600, tripCount: 4 })).toHaveLength(1);
    expect(validateGenerateTripsRequest({ ...common, tripCount: MAX_TRIPS_PER_GENERATION + 1 }).map((finding) => finding.messageKey)).toContain('tripGeneration.tripCountTooLarge');
  });

  it('selects runtime bands for each departure and rejects gaps', () => {
    const trips = generateTrips(set({ mode: 'tripCount', tripCount: 2 }), pattern, profile);
    expect(trips.map((trip) => trip.stopTimes.map((point) => point.time))).toEqual([[3500, 3560, 3680], [4100, 4220, 4400]]);
    expect(() => generateTrips(set({ mode: 'tripCount', tripCount: 1 }), pattern, { ...profile, bands: [{ ...profile.bands[0], endTime: 100 }] })).toThrow(/noApplicableBand/);
  });

  it('supports signed shifts and tracks net override', () => {
    const trip = generateTrips(set({ mode: 'tripCount', tripCount: 1 }), pattern, profile)[0];
    const shifted = shiftTrips([trip], [trip.id], 120)[0];
    const restored = shiftTrips([shifted], [trip.id], -60)[0];
    expect(restored.stopTimes[0].time).toBe(trip.stopTimes[0].time + 60);
    expect(restored.provenance.manualTimeShiftSeconds).toBe(60);
    expect(restored.provenance.manuallyChangedFields).toContain('times');
  });

  it('recalculates a changed pattern only after preview', () => {
    const trip = generateTrips(set({ mode: 'tripCount', tripCount: 1 }), pattern, profile)[0];
    const target = { ...pattern, id: 'p2', name: 'Inbound', points: [...pattern.points].reverse().map((point, sequence) => ({ ...point, id: `${point.id}-r`, sequence })) };
    const targetProfile = { ...profile, id: 'rp2', patternId: 'p2' };
    const preview = previewPatternChange(trip, target, targetProfile);
    expect(preview.newStopTimes?.[0].patternPointId).toBe('c-r');
    const changed = applyPatternChange(trip, target, preview);
    expect(changed.patternId).toBe('p2');
    expect(changed.provenance.manuallyChangedFields).toContain('patternId');
  });

  it('previews regeneration and preserves surviving IDs while removing block references', () => {
    const original = generateTrips(set({ mode: 'tripCount', tripCount: 3 }), pattern, profile);
    const edited = shiftTrips(original, [original[1].id], 60);
    const blocks: Block[] = [{ ...metadata(), id: 'b1', scenarioId: 's1', serviceDayId: 'weekday', label: '1', activities: [
      { id: 'a1', type: 'revenueTrip', sequence: 0, tripId: original[2].id },
    ] }];
    const changedSet = { ...set({ mode: 'tripCount', tripCount: 2 }), generationRevision: 2 };
    const preview = previewRegeneration(changedSet, pattern, profile, edited, blocks);
    expect(preview.added).toEqual([]); expect(preview.removed).toEqual([original[2].id]);
    expect(preview.manualTimeShiftsOverwritten).toEqual([original[1].id]);
    expect(preview.removedBlockReferences).toEqual([{ blockId: 'b1', tripId: original[2].id }]);
    const result = applyRegeneration(preview, edited, blocks);
    expect(result.trips.map((trip) => trip.id)).toEqual([original[0].id, original[1].id]);
    expect(result.blocks[0].activities).toEqual([]);
    expect(validateTrip(result.trips[0], pattern)).toEqual([]);
  });

  it('removes a connection deadhead when either adjacent revenue Trip is removed', () => {
    const blocks: Block[] = [{ ...metadata(), id: 'b1', scenarioId: 's1', serviceDayId: 'weekday', label: '1', activities: [
      { id: 'first', type: 'revenueTrip', sequence: 0, tripId: 'first' },
      { id: 'deadhead', type: 'deadhead', sequence: 1, minutesAfterPreviousTrip: 8, fromNodeId: 'nb', toNodeId: 'na' },
      { id: 'last', type: 'revenueTrip', sequence: 2, tripId: 'last' },
    ] }];
    const adjusted = adjustBlockReferences(blocks, ['last']);
    expect(adjusted.blocks[0].activities.map((activity) => activity.id)).toEqual(['first']);
  });

  it('generates the Phase 2 capacity target of 500 trips', () => {
    const capacityProfile = { ...profile, bands: [{ ...profile.bands[0], endTime: 40000 }] };
    const trips = generateTrips({ ...set({ mode: 'tripCount', tripCount: 500 }), headwaySeconds: 60 }, pattern, capacityProfile);
    expect(trips).toHaveLength(500);
    expect(trips[499].provenance.generationSequence).toBe(499);
  });
});

describe('generation and shift bounds (P08)', () => {
  const stamp = metadata('2026-01-01T00:00:00.000Z');
  const twoPoint: RoutePattern = { ...stamp, id: 'p2', scenarioId: 's', routeId: 'r', name: 'Two', directionId: 'out', points: [{ id: 'a', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'z', nodeId: 'Z', sequence: 1, cumulativeMiles: 5 }] };
  const band = (id: string, startTime: number, endTime: number, segmentRuntimeSeconds: number[]) => ({ id, label: id.toUpperCase(), sequence: 0, startTime, endTime, segmentRuntimeSeconds });
  const profileOf = (bands: RuntimeProfile['bands'], calculationMethod?: RuntimeProfile['calculationMethod']): RuntimeProfile => ({ ...stamp, id: 'rp', scenarioId: 's', routeId: 'r', patternId: 'p2', name: 'W', bands, calculationRevision: 3, ...(calculationMethod ? { calculationMethod } : {}) });
  const tripOf = (id: string, times: number[]): Trip => ({ ...stamp, id, scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId: 'p2', tripProfileId: 'tp', stopTimes: times.map((time, sequence) => ({ patternPointId: twoPoint.points[sequence].id, sequence, time })), provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [], runtimeProfileId: 'rp', runtimeCalculationRevision: 3, calculationSource: { runtimeProfileId: 'rp', runtimeCalculationRevision: 3 } } });
  const request = (patch: Partial<GenerateTripsRequest>): GenerateTripsRequest => ({ scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId: 'p2', tripProfileId: 'tp', firstTrip: 0, headwaySeconds: 60, ...patch });
  const ruleIds = (fn: () => unknown) => { try { fn(); return []; } catch (error) { return (error as TripGenerationError).findings.map((item) => item.ruleId); } };

  describe('Last Trip is limited to 500 departures (I-011, 2-001)', () => {
    it('rejects a request that would produce 1,440 Trips, in the validation and in generation', () => {
      const tooMany = request({ lastTrip: 86340 });
      expect(validateGenerateTripsRequest(tooMany).map((finding) => [finding.ruleId, finding.field, finding.parameters])).toEqual([['tripGeneration.tripCountTooLarge', 'lastTrip', { maximum: 500 }]]);
      expect(ruleIds(() => generateRequestDepartures(tooMany))).toEqual(['tripGeneration.tripCountTooLarge']);
      expect(ruleIds(() => generateAuthoritativeTrips(tooMany, twoPoint, profileOf([band('all', 0, 90000, [600])], 'segmentStart'), stamp.createdAt))).toEqual(['tripGeneration.tripCountTooLarge']);
    });

    it('accepts exactly 500 departures and rejects 501, counting the Last Trip departure when it is on the headway sequence', () => {
      expect(validateGenerateTripsRequest(request({ lastTrip: 499 * 60 }))).toEqual([]);
      expect(generateRequestDepartures(request({ lastTrip: 499 * 60 }))).toHaveLength(500);
      expect(validateGenerateTripsRequest(request({ lastTrip: 500 * 60 })).map((finding) => finding.ruleId)).toEqual(['tripGeneration.tripCountTooLarge']);
      // A Last Trip between two departures does not add one.
      expect(validateGenerateTripsRequest(request({ lastTrip: 500 * 60 - 1 }))).toEqual([]);
      expect(MAX_TRIPS_PER_GENERATION).toBe(500);
    });

    it('still rejects more than 500 by count, and does not report the limit for an invalid request', () => {
      expect(validateGenerateTripsRequest(request({ tripCount: 501 })).map((finding) => finding.ruleId)).toEqual(['tripGeneration.tripCountTooLarge']);
      expect(validateGenerateTripsRequest(request({ lastTrip: 86340, headwaySeconds: 0 })).map((finding) => finding.ruleId)).toEqual(['tripGeneration.headwayInvalid']);
      expect(validateGenerateTripsRequest(request({ firstTrip: 600, lastTrip: 0 })).map((finding) => finding.ruleId)).toEqual(['tripGeneration.lastBeforeFirst']);
    });
  });

  describe('Trips may not have negative times (I-012, 2-002)', () => {
    it('validateTrip rejects a negative time', () => {
      expect(validateTrip(tripOf('t', [-300, 300]), twoPoint).map((finding) => [finding.ruleId, finding.field])).toEqual([['trip.timeBeforeServiceDay', 'stopTimes']]);
      expect(validateTrip(tripOf('t', [0, 300]), twoPoint)).toEqual([]);
    });
  });

  describe('an anchor with more than one valid departure is rejected and lists the candidates (I-013, 2-003, user decision 3)', () => {
    // Anchor 3900 at Z: departure 3300 (band a, 600 s) and departure 3600 (band b, 300 s) both reproduce it.
    const bands = [band('a', 0, 3600, [600]), band('b', 3600, 7200, [300])];
    const candidates = (error: unknown) => (error as AnchorBandChoiceError).choices.map((choice) => [choice.bandId, choice.departure]);
    const attempt = (profile: RuntimeProfile, saved: number[]) => { try { recalculateTripWithAnchor(tripOf('t', saved), twoPoint, profile, stamp.createdAt, 'z'); } catch (error) { return error; } throw new Error('expected the anchor to be rejected'); };

    it('segmentStart: raises trip.anchorAmbiguous with both departures, whichever is nearer the saved one', () => {
      for (const saved of [[3500, 3900], [3350, 3900]]) {
        const error = attempt(profileOf(bands, 'segmentStart'), saved);
        expect(error).toBeInstanceOf(AnchorBandChoiceError);
        expect((error as AnchorBandChoiceError).findings.map((finding) => finding.ruleId)).toEqual(['trip.anchorAmbiguous']);
        expect(candidates(error)).toEqual([['a', 3300], ['b', 3600]]);
      }
    });

    it('blendSegments: raises trip.anchorAmbiguous with both departures', () => {
      // Departures 3599 and 3600 both blend to 3900.
      const error = attempt(profileOf(bands, 'blendSegments'), [3000, 3900]);
      expect(error).toBeInstanceOf(AnchorBandChoiceError);
      expect((error as AnchorBandChoiceError).findings.map((finding) => finding.ruleId)).toEqual(['trip.anchorAmbiguous']);
      expect(candidates(error)).toEqual([['a', 3599], ['b', 3600]]);
    });

    it('single-band keeps raising it, and a unique anchor still recalculates', () => {
      expect(ruleIds(() => recalculateTripWithAnchor(tripOf('t', [3500, 3900]), twoPoint, profileOf(bands), stamp.createdAt, 'z'))).toEqual(['trip.anchorAmbiguous']);
      const unique = recalculateTripWithAnchor(tripOf('t', [1000, 1600]), twoPoint, profileOf(bands, 'segmentStart'), stamp.createdAt, 'z');
      expect(unique.trip.stopTimes.map((point) => point.time)).toEqual([1000, 1600]);
      const uniqueBlend = recalculateTripWithAnchor(tripOf('t', [1000, 1600]), twoPoint, profileOf(bands, 'blendSegments'), stamp.createdAt, 'z');
      expect(uniqueBlend.trip.stopTimes.map((point) => point.time)).toEqual([1000, 1600]);
    });
  });

  describe('a zero-second shift changes nothing (I-064, 2-010)', () => {
    it('returns the Trips untouched: same times, no manual-change flag, no new updatedAt', () => {
      const source = tripOf('t', [21600, 22200]);
      const [result] = shiftTrips([source], ['t'], 0, '2026-10-22T00:00:00.000Z');
      expect(result).toBe(source);
      expect(result.provenance.manuallyChangedFields).toEqual([]);
      expect(result.provenance.manualTimeShiftSeconds).toBeUndefined();
      expect(result.updatedAt).toBe(source.updatedAt);
    });

    it('still marks a non-zero shift', () => {
      const [result] = shiftTrips([tripOf('t', [21600, 22200])], ['t'], 60, '2026-10-22T00:00:00.000Z');
      expect(result.provenance.manuallyChangedFields).toEqual(['times']);
      expect(result.provenance.manualTimeShiftSeconds).toBe(60);
    });
  });
});
