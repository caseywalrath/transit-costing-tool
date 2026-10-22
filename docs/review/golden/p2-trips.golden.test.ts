// Phase 2 review reproduction tests: tasks 2.3 (trip generation), 2.4 (regeneration anchors), 2.5 (trip shift).
// Backs findings 2-001 (code side of Phase 1 finding 1-009: 500-trip limit not applied to Last Trip mode), 2-002 (shift below 0:00 accepted),
// 2-003 (code side of Phase 1 finding 1-005: segmentStart and blend anchors silently choose among multiple departures), 2-010 (net-zero shift marks Trips changed).
// Tests named "DEFECT ..." assert the CURRENT defective behaviour; their comments state the expected behaviour.
// All other tests assert documented behaviour.
import { describe, expect, it } from 'vitest';
import { calculateRecalculationConnections, calculateRecalculationImpact, generateAuthoritativeTrips, generateRequestDepartures, MAX_TRIPS_PER_GENERATION, recalculateTripWithAnchor, shiftTrips, TripGenerationError, validateGenerateTripsRequest } from '../../../src/domain/trips';
import { buildTripShiftPreview } from '../../../src/domain/tripShift';
import { formatServiceTime } from '../../../src/domain/time';
import type { Block, GenerateTripsRequest, RoutePattern, RuntimeBand, RuntimeProfile, Trip } from '../../../src/domain/types';

const meta = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const twoPoint: RoutePattern = { ...meta, id: 'p2', scenarioId: 's', routeId: 'r', name: 'Two', directionId: 'out', points: [
  { id: 'a', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'z', nodeId: 'Z', sequence: 1, cumulativeMiles: 5 },
] };
const back: RoutePattern = { ...twoPoint, id: 'p2b', points: [{ id: 'z2', nodeId: 'Z', sequence: 0, cumulativeMiles: 0 }, { id: 'a2', nodeId: 'A', sequence: 1, cumulativeMiles: 5 }] };
const band = (id: string, startTime: number, endTime: number, segs: number[]): RuntimeBand => ({ id, label: id, sequence: 0, startTime, endTime, segmentRuntimeSeconds: segs });
const profile = (bands: RuntimeBand[], calculationMethod?: RuntimeProfile['calculationMethod'], patternId = 'p2'): RuntimeProfile => ({ ...meta, id: `rp-${patternId}`, scenarioId: 's', routeId: 'r', patternId, name: 'W', bands, calculationRevision: 3, ...(calculationMethod ? { calculationMethod } : {}) });
const request = (patch: Partial<GenerateTripsRequest>): GenerateTripsRequest => ({ scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId: 'p2', tripProfileId: 'tp', firstTrip: 21600, headwaySeconds: 600, ...patch });
const trip = (id: string, times: number[], pattern = twoPoint, extra: Partial<Trip['provenance']> = {}): Trip => ({ ...meta, id, scenarioId: 's', routeId: 'r', serviceDayId: 'wk', patternId: pattern.id, tripProfileId: 'tp', stopTimes: times.map((time, sequence) => ({ patternPointId: pattern.points[sequence].id, sequence, time })), provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [], runtimeProfileId: 'rp-p2', runtimeCalculationRevision: 3, calculationSource: { runtimeProfileId: 'rp-p2', runtimeCalculationRevision: 3 }, ...extra } });
const findingIds = (fn: () => unknown) => { try { fn(); return []; } catch (error) { return (error as TripGenerationError).findings.map((item) => item.ruleId); } };

describe('2.3 trip generation', () => {
  it('Last Trip on the headway sequence is included; off the sequence it is not', () => {
    expect(generateRequestDepartures(request({ lastTrip: 22800 }))).toEqual([21600, 22200, 22800]);
    expect(generateRequestDepartures(request({ lastTrip: 22799 }))).toEqual([21600, 22200]);
    expect(generateRequestDepartures(request({ lastTrip: 21600 }))).toEqual([21600]);
  });
  it('Number of Trips mode generates exactly N; 500 accepted, 501 rejected', () => {
    expect(generateRequestDepartures(request({ tripCount: 3 }))).toEqual([21600, 22200, 22800]);
    expect(generateRequestDepartures(request({ tripCount: MAX_TRIPS_PER_GENERATION, headwaySeconds: 60 }))).toHaveLength(500);
    expect(validateGenerateTripsRequest(request({ tripCount: 501 })).map((item) => item.ruleId)).toContain('tripGeneration.tripCountTooLarge');
  });
  it('rejects zero, negative, and fractional headway, both or neither limit, and Last Trip before First Trip', () => {
    for (const headwaySeconds of [0, -600, 1.5]) expect(validateGenerateTripsRequest(request({ headwaySeconds, lastTrip: 30000 })).map((item) => item.ruleId)).toContain('tripGeneration.headwayInvalid');
    expect(validateGenerateTripsRequest(request({ lastTrip: 30000, tripCount: 2 })).map((item) => item.ruleId)).toContain('tripGeneration.limitRequired');
    expect(validateGenerateTripsRequest(request({})).map((item) => item.ruleId)).toContain('tripGeneration.limitRequired');
    expect(validateGenerateTripsRequest(request({ lastTrip: 21000 })).map((item) => item.ruleId)).toContain('tripGeneration.lastBeforeFirst');
  });
  // 2-001. Decision 0010: "A single request is limited to 500 trips." Expected: a Last Trip request producing more than 500 departures is rejected.
  it('DEFECT 2-001: a Last Trip request is not limited to 500 trips', () => {
    const req = request({ firstTrip: 0, headwaySeconds: 60, lastTrip: 86340 });
    expect(validateGenerateTripsRequest(req)).toEqual([]);
    expect(generateRequestDepartures(req)).toHaveLength(1440);
    const p = profile([band('all', 0, 86400, [600])], 'segmentStart');
    expect(generateAuthoritativeTrips(req, twoPoint, p, meta.createdAt)).toHaveLength(1440);
  });
  it('generates across 24:00 without wrapping', () => {
    const p = profile([band('late', 82800, 93600, [900])], 'segmentStart');
    const trips = generateAuthoritativeTrips(request({ firstTrip: 85800, headwaySeconds: 1200, lastTrip: 88200 }), twoPoint, p, meta.createdAt);
    expect(trips.map((item) => item.stopTimes.map((point) => formatServiceTime(point.time)))).toEqual([['23:50', '24:05'], ['24:10', '24:25'], ['24:30', '24:45']]);
  });
  it('a departure in a band gap fails the whole request with a finding per failing departure (no partial insert)', () => {
    const p = profile([band('am', 21600, 22200, [600]), band('pm', 22800, 30000, [600])], 'segmentStart');
    expect(findingIds(() => generateAuthoritativeTrips(request({ lastTrip: 22800 }), twoPoint, p, meta.createdAt))).toEqual(['runtime.noApplicableBand']);
  });
  it('records the profile and revision as calculation source', () => {
    const [first] = generateAuthoritativeTrips(request({ tripCount: 1 }), twoPoint, profile([band('all', 0, 86400, [600])], 'segmentStart'), meta.createdAt);
    expect(first.provenance.calculationSource).toEqual({ runtimeProfileId: 'rp-p2', runtimeCalculationRevision: 3 });
  });
});

describe('2.4 regeneration anchors', () => {
  const single = profile([band('am', 0, 3600, [600]), band('pm', 4200, 7200, [300])]);
  it('single-band: anchor at the last timepoint resolves the band from the implied first departure', () => {
    const result = recalculateTripWithAnchor(trip('t', [3000, 3600]), twoPoint, single, meta.createdAt, 'z');
    expect(result.trip.stopTimes.map((point) => point.time)).toEqual([3000, 3600]);
    expect(result.bandSelection).toBeUndefined();
  });
  it('single-band: implied departure exactly 10 minutes before the nearest band is selected automatically; 10:01 is rejected', () => {
    // pm candidate first = anchor - 300; am candidate first = anchor - 600.
    const ok = recalculateTripWithAnchor(trip('t', [3000, 3900]), twoPoint, single, meta.createdAt, 'z'); // am first 3300 (in am) -> exact
    expect(ok.trip.stopTimes[0].time).toBe(3300);
    const atLimit = recalculateTripWithAnchor(trip('t', [7500, 8100]), twoPoint, single, meta.createdAt, 'z'); // pm first 7800 = 600 s after pm end
    expect(atLimit.trip.stopTimes.map((point) => point.time)).toEqual([7800, 8100]);
    expect(atLimit.bandSelection).toMatchObject({ bandLabel: 'pm', distanceSeconds: 600, side: 'after', selection: 'automatic' });
    expect(findingIds(() => recalculateTripWithAnchor(trip('t', [7500, 8101]), twoPoint, single, meta.createdAt, 'z'))).toEqual(['trip.anchorNoRuntime']);
  });
  it('single-band: equidistant nearest bands require a choice (anchorNearestTie)', () => {
    // am [0,3600) seg 600; pm [4200,7200) seg 600 -> both imply first = anchor - 600 = 3900, 300 s from each band.
    const tie = profile([band('am', 0, 3600, [600]), band('pm', 4200, 7200, [600])]);
    expect(findingIds(() => recalculateTripWithAnchor(trip('t', [3900, 4500]), twoPoint, tie, meta.createdAt, 'z'))).toEqual(['trip.anchorNearestTie']);
  });
  // 2-003. Decision 0031: "When a later anchor cannot be preserved or resolves to multiple departures, the review dialog identifies the
  // affected trip, fixed timepoint, and reason." Expected: two valid first departures produce a choice/error, as single-band does (trip.anchorAmbiguous).
  it('DEFECT 2-003: segmentStart anchor with two valid departures silently picks the one nearest the saved departure', () => {
    const seg = profile([band('a', 0, 3600, [600]), band('b', 3600, 7200, [300])], 'segmentStart');
    // Anchor 3900 at Z: departure 3300 (band a, 600 s) and departure 3600 (band b, 300 s) both reproduce it.
    const fromSaved3500 = recalculateTripWithAnchor(trip('t', [3500, 3900]), twoPoint, seg, meta.createdAt, 'z');
    expect(fromSaved3500.trip.stopTimes.map((point) => point.time)).toEqual([3600, 3900]);
    expect(fromSaved3500.bandSelection).toBeUndefined();
    const fromSaved3350 = recalculateTripWithAnchor(trip('t', [3350, 3900]), twoPoint, seg, meta.createdAt, 'z');
    expect(fromSaved3350.trip.stopTimes.map((point) => point.time)).toEqual([3300, 3900]);
    // The single-band method with the same bands requires a choice:
    expect(findingIds(() => recalculateTripWithAnchor(trip('t', [3500, 3900]), twoPoint, profile(seg.bands), meta.createdAt, 'z'))).toEqual(['trip.anchorAmbiguous']);
  });
  it('DEFECT 2-003: blendSegments anchor with two valid departures silently picks one', () => {
    const blend = profile([band('a', 0, 3600, [600]), band('b', 3600, 7200, [300])], 'blendSegments');
    // Departure 3599 blends to 3899.5 -> rounds to 3900; departure 3600 -> 3900.
    const result = recalculateTripWithAnchor(trip('t', [3000, 3900]), twoPoint, blend, meta.createdAt, 'z');
    expect(result.trip.stopTimes.map((point) => point.time)).toEqual([3599, 3900]);
  });
  it('anchor unreachable for segmentStart is rejected with trip.anchorNoRuntime', () => {
    const seg = profile([band('a', 3600, 7200, [600])], 'segmentStart');
    expect(findingIds(() => recalculateTripWithAnchor(trip('t', [0, 3700]), twoPoint, seg, meta.createdAt, 'z'))).toEqual(['trip.anchorNoRuntime']);
  });
  it('layover change after an assigned relative deadhead, and newly negative gap warning', () => {
    const t1 = trip('t1', [1000, 2000]); const t2 = trip('t2', [3000, 4000], back);
    const block: Block = { ...meta, id: 'b', scenarioId: 's', serviceDayId: 'wk', blockingScenarioId: 'bs', label: '1', activities: [
      { id: 'r1', type: 'revenueTrip', sequence: 0, tripId: 't1' },
      { id: 'd', type: 'deadhead', sequence: 1, minutesAfterPreviousTrip: 5, fromNodeId: 'Z', toNodeId: 'Z' },
      { id: 'r2', type: 'revenueTrip', sequence: 2, tripId: 't2' },
    ] };
    const later = { ...t1, stopTimes: [{ ...t1.stopTimes[0], time: 1600 }, { ...t1.stopTimes[1], time: 3100 }] };
    const result = calculateRecalculationConnections([t1], [later], [t1, t2], [block], [twoPoint, back]);
    expect(result.connections[0]).toMatchObject({ currentGapSeconds: 1000, revisedGapSeconds: -100, currentLayoverSeconds: 700, revisedLayoverSeconds: -400 });
    expect(result.findings.map((item) => item.ruleId)).toEqual(['trip.regenerationBlockOverlap']);
  });
  it('layover is unavailable when terminal nodes differ and no deadhead is assigned', () => {
    const t1 = trip('t1', [1000, 2000]); const t2 = trip('t2', [3000, 4000]); // ends at Z, next starts at A
    const block: Block = { ...meta, id: 'b', scenarioId: 's', serviceDayId: 'wk', label: '1', activities: [{ id: 'r1', type: 'revenueTrip', sequence: 0, tripId: 't1' }, { id: 'r2', type: 'revenueTrip', sequence: 1, tripId: 't2' }] };
    const result = calculateRecalculationConnections([t1], [t1], [t1, t2], [block], [twoPoint]);
    expect(result.connections[0].currentLayoverSeconds).toBeUndefined();
  });
  it('legacy Trips without a calculation source require confirmation (Decision 0030 item 4)', () => {
    const legacy = trip('t', [0, 600], twoPoint, { runtimeProfileId: undefined, runtimeCalculationRevision: undefined, calculationSource: undefined });
    expect(calculateRecalculationImpact([legacy], []).requiresConfirmation).toBe(true);
    expect(calculateRecalculationImpact([trip('t', [0, 600])], []).requiresConfirmation).toBe(false);
  });
});

describe('2.5 trip shift', () => {
  const shiftRequest = (offsetSeconds: number) => ({ scenarioId: 's', routeId: 'r', serviceDayId: 'wk', directionId: 'out', tripProfileId: 'tp', tripIds: ['t'], offsetSeconds });
  it('cumulative shifts equal one shift of the net offset and accumulate manualTimeShiftSeconds', () => {
    const base = trip('t', [21600, 22200]);
    const twice = shiftTrips(shiftTrips([base], ['t'], -60), ['t'], 180);
    const once = shiftTrips([base], ['t'], 120);
    expect(twice[0].stopTimes).toEqual(once[0].stopTimes);
    expect(twice[0].provenance.manualTimeShiftSeconds).toBe(120);
  });
  it('staged previews of different offsets keep one source signature (stale protection is offset-independent)', () => {
    const base = trip('t', [21600, 22200]);
    expect(buildTripShiftPreview(shiftRequest(60), [base], meta.createdAt).sourceSignature).toEqual(buildTripShiftPreview(shiftRequest(-300), [base], meta.createdAt).sourceSignature);
  });
  // 2-002. Decision 0002: "Store schedule times as non-negative integer seconds from service-day midnight." Expected: a shift that moves
  // any scheduled point below 0:00 is rejected with a finding. Actual: the preview contains negative times and no finding, and the
  // shared formatter used by the Trips table throws on them.
  it('DEFECT 2-002: staged shift below 0:00 yields negative times with no finding', () => {
    const early = trip('t', [300, 900]);
    const preview = buildTripShiftPreview(shiftRequest(-600), [early], meta.createdAt);
    expect(preview.findings).toEqual([]);
    expect(preview.shiftedTrips[0].stopTimes.map((point) => point.time)).toEqual([-300, 300]);
    expect(() => formatServiceTime(preview.shiftedTrips[0].stopTimes[0].time)).toThrow();
  });
  // 2-010. Expected: a net-zero shift is a no-op (the Shift drawer treats it as a discard, src/ui/App.tsx:1010).
  it('DEFECT 2-010: a zero-second shift is accepted and marks the Trip as manually time-changed', () => {
    const preview = buildTripShiftPreview(shiftRequest(0), [trip('t', [21600, 22200])], meta.createdAt);
    expect(preview.findings).toEqual([]);
    expect(preview.shiftedTrips[0].provenance.manuallyChangedFields).toEqual(['times']);
  });
});
