import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import type { Block, RoutePattern, RuntimeProfile, Trip, TripGenerationSet } from './types';
import { applyPatternChange, applyRegeneration, generateTrips, previewPatternChange, previewRegeneration, shiftTrips, validateTrip, validateTripGenerationSet } from './trips';

const pattern: RoutePattern = { ...metadata(), id: 'p1', scenarioId: 's1', routeId: 'r1', name: 'Outbound', points: [
  { id: 'a', nodeId: 'na', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'nb', sequence: 1, cumulativeMiles: 1 }, { id: 'c', nodeId: 'nc', sequence: 2, cumulativeMiles: 2 },
] };
const profile: RuntimeProfile = { ...metadata(), id: 'rp1', scenarioId: 's1', routeId: 'r1', patternId: 'p1', name: 'Weekday', bands: [
  { id: 'am', label: 'AM', sequence: 0, startTime: 0, endTime: 3600, segmentRuntimeSeconds: [60, 120] },
  { id: 'pm', label: 'PM', sequence: 1, startTime: 3600, endTime: 9000, segmentRuntimeSeconds: [120, 180] },
] };
const set = (limit: TripGenerationSet['limit']): TripGenerationSet => ({ ...metadata(), id: 'gs1', scenarioId: 's1', routeId: 'r1', serviceDayId: 'weekday', patternId: 'p1', name: 'All day', firstDeparture: 3500, headwaySeconds: 600, limit, generationRevision: 1 });

describe('trip generation and overrides', () => {
  it('validates controls and includes an end-time departure', () => {
    expect(validateTripGenerationSet(set({ mode: 'endTime', endTime: 4700 }))).toEqual([]);
    expect(generateTrips(set({ mode: 'endTime', endTime: 4700 }), pattern, profile).map((trip) => trip.stopTimes[0].time)).toEqual([3500, 4100, 4700]);
    expect(validateTripGenerationSet({ ...set({ mode: 'tripCount', tripCount: 0 }), headwaySeconds: 0 }).length).toBeGreaterThan(1);
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

  it('generates the Phase 2 capacity target of 500 trips', () => {
    const capacityProfile = { ...profile, bands: [{ ...profile.bands[0], endTime: 40000 }] };
    const trips = generateTrips({ ...set({ mode: 'tripCount', tripCount: 500 }), headwaySeconds: 60 }, pattern, capacityProfile);
    expect(trips).toHaveLength(500);
    expect(trips[499].provenance.generationSequence).toBe(499);
  });
});
