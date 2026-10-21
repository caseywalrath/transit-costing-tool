import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import type { Block, GenerateTripsRequest, RoutePattern, RuntimeProfile, Trip, TripGenerationSet } from './types';
import { adjustBlockReferences, applyPatternChange, applyRegeneration, generateRequestDepartures, generateTrips, markTripRecalculated, MAX_TRIPS_PER_GENERATION, previewPatternChange, previewRegeneration, recalculateTripWithAnchor, shiftTrips, TripGenerationError, validateGenerateTripsRequest, validateTrip, validateTripGenerationSet } from './trips';

const pattern: RoutePattern = { ...metadata(), id: 'p1', scenarioId: 's1', routeId: 'r1', name: 'Outbound', points: [
  { id: 'a', nodeId: 'na', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'nb', sequence: 1, cumulativeMiles: 1 }, { id: 'c', nodeId: 'nc', sequence: 2, cumulativeMiles: 2 },
] };
const profile: RuntimeProfile = { ...metadata(), id: 'rp1', scenarioId: 's1', routeId: 'r1', patternId: 'p1', name: 'Weekday', bands: [
  { id: 'am', label: 'AM', sequence: 0, startTime: 0, endTime: 3600, segmentRuntimeSeconds: [60, 120] },
  { id: 'pm', label: 'PM', sequence: 1, startTime: 3600, endTime: 9000, segmentRuntimeSeconds: [120, 180] },
] };
const set = (limit: TripGenerationSet['limit']): TripGenerationSet => ({ ...metadata(), id: 'gs1', scenarioId: 's1', routeId: 'r1', serviceDayId: 'weekday', patternId: 'p1', name: 'All day', firstDeparture: 3500, headwaySeconds: 600, limit, generationRevision: 1 });

describe('trip generation and overrides', () => {
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
