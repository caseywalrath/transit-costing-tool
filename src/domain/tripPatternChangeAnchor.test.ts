import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { propagatePatternTimes } from './runtime';
import { buildBatchPatternChangePreview, type BatchPatternChangeRequest } from './serviceDayCopy';
import { applyPatternChange, previewPatternChange, recalculateTripWithAnchor, sharedAnchorNodes } from './trips';
import type { RoutePattern, RuntimeBand, RuntimeProfile, ScheduledPoint, Trip } from './types';

// Decision 0067 (anchored Change pattern). Patterns share route r1 and direction d1 so batch eligibility is decided by the anchor alone.
const stamp = '2026-11-10T09:00:00.000Z';
const pattern = (id: string, nodes: string[]): RoutePattern => ({ ...metadata(stamp), id, scenarioId: 's1', routeId: 'r1', name: id, directionId: 'd1', points: nodes.map((nodeId, sequence) => ({ id: `${id}-${sequence}`, nodeId, sequence, cumulativeMiles: sequence })) });
const full = pattern('full', ['A', 'B', 'C', 'D']);
const short = pattern('short', ['B', 'C', 'D']);
const loop = pattern('loop', ['A', 'B', 'C', 'B', 'D']);
const far = pattern('far', ['X', 'Y']);
const reversed = pattern('rev', ['D', 'C', 'B', 'A']);
const band = (id: string, startTime: number, endTime: number, segmentRuntimeSeconds: number[]): RuntimeBand => ({ id, label: id, sequence: 0, startTime, endTime, segmentRuntimeSeconds });
const profile = (patternId: string, bands: RuntimeBand[], calculationMethod?: RuntimeProfile['calculationMethod']): RuntimeProfile => ({ ...metadata(stamp), id: `rp-${patternId}`, scenarioId: 's1', routeId: 'r1', patternId, name: 'Runtime', bands, ...(calculationMethod ? { calculationMethod } : {}) });
// Full pattern: 0:00-8:00 is 10 + 15 + 5 minutes; from 8:00 it is 12 + 18 + 6 minutes.
const fullBands = [band('am', 0, 28800, [600, 900, 300]), band('pm', 28800, 90000, [720, 1080, 360])];
const shortBands = [band('all', 0, 90000, [900, 300])];
const fullProfile = (method?: RuntimeProfile['calculationMethod']) => profile('full', fullBands, method);
const shortProfile = profile('short', shortBands);
const provenance = (runtimeProfileId: string): Trip['provenance'] => ({ kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [], runtimeProfileId, runtimeCalculationRevision: 0, calculationSource: { runtimeProfileId, runtimeCalculationRevision: 0 } });
const tripWithTimes = (id: string, source: RoutePattern, times: number[], runtimeProfileId = `rp-${source.id}`): Trip => ({ ...metadata(stamp), id, scenarioId: 's1', routeId: 'r1', serviceDayId: 'weekday', patternId: source.id, tripProfileId: 'tp1', stopTimes: source.points.map((point, sequence) => ({ patternPointId: point.id, sequence, time: times[sequence] })), provenance: provenance(runtimeProfileId) });
/** A trip whose times come from the source Pattern's own runtime calculation, so it is a realistic saved Trip. */
const tripOn = (id: string, source: RoutePattern, departure: number, sourceProfile: RuntimeProfile): Trip => tripWithTimes(id, source, propagated(source, departure, sourceProfile).map((point) => point.time), sourceProfile.id);
function propagated(target: RoutePattern, departure: number, runtime: RuntimeProfile): ScheduledPoint[] {
  const result = propagatePatternTimes(target, departure, runtime);
  if (!('stopTimes' in result)) throw new Error(`Propagation failed: ${result.finding.ruleId}`);
  return result.stopTimes;
}
const times = (points: ScheduledPoint[] | undefined) => points?.map((point) => point.time);

describe('Change pattern without an anchor (unchanged)', () => {
  it('keeps the first departure and matches the first-stop calculation', () => {
    const trip = tripOn('t1', full, 25200, fullProfile());
    const preview = previewPatternChange(trip, short, shortProfile);
    expect(preview.newStopTimes).toEqual(propagated(short, 25200, shortProfile));
    expect(preview).not.toHaveProperty('anchorNodeId');
    expect(preview).not.toHaveProperty('bandChoices');
    expect(previewPatternChange(trip, short, shortProfile, {})).toEqual(preview);
  });
});

describe('first stop as the anchor gives today\'s result', () => {
  it('for single-band, segment-start and blended profiles, at two departures', () => {
    for (const method of [undefined, 'segmentStart', 'blendSegments'] as const) {
      for (const departure of [25200, 29000]) {
        const trip = tripOn(`t-${method}-${departure}`, full, departure, fullProfile(method));
        const plain = previewPatternChange(trip, full, fullProfile(method));
        const anchored = previewPatternChange(trip, full, fullProfile(method), { sourcePattern: full, anchorNodeId: 'A' });
        expect(anchored.newStopTimes).toEqual(plain.newStopTimes);
        expect(anchored.finding).toEqual(plain.finding);
        expect(anchored.anchorTime).toBe(departure);
      }
    }
  });
});

describe('anchor at a mid-route node', () => {
  it('matches recalculateTripWithAnchor on the target and keeps the anchor time', () => {
    const trip = tripOn('t1', full, 25200, fullProfile());
    const preview = previewPatternChange(trip, short, shortProfile, { sourcePattern: full, anchorNodeId: 'C' });
    expect(times(preview.newStopTimes)).toEqual([25800, 26700, 27000]);
    expect(preview.anchorNodeId).toBe('C');
    expect(preview.anchorTime).toBe(26700);
    const seed: Trip = { ...trip, patternId: short.id, stopTimes: short.points.map((point, sequence) => ({ patternPointId: point.id, sequence, time: 26700 })) };
    expect(preview.newStopTimes).toEqual(recalculateTripWithAnchor(seed, short, shortProfile, stamp, 'short-1').trip.stopTimes);
    expect(preview.finding).toBeUndefined();
  });

  it('keeps the anchor time when the target starts at a later node', () => {
    const trip = tripOn('t1', full, 25200, fullProfile());
    const preview = previewPatternChange(trip, short, shortProfile, { sourcePattern: full, anchorNodeId: 'B' });
    expect(preview.newStopTimes?.[0]).toMatchObject({ patternPointId: 'short-0', time: 25800 });
    expect(times(preview.newStopTimes)).toEqual([25800, 26700, 27000]);
  });

  it('uses the first visit of a node the source or the target visits twice', () => {
    // The loop visits B at 25800 and again at 27300. Only the first visit's time is kept.
    const loopTrip = tripWithTimes('loop-trip', loop, [25200, 25800, 26700, 27300, 27600]);
    const preview = previewPatternChange(loopTrip, full, fullProfile(), { sourcePattern: loop, anchorNodeId: 'B' });
    expect(times(preview.newStopTimes)).toEqual([25200, 25800, 26700, 27000]);
    expect(preview.anchorTime).toBe(25800);
  });
});

describe('node served on one Pattern only', () => {
  it('gives anchorNodeNotServed when the source does not serve the node', () => {
    const trip = tripWithTimes('t1', short, [25800, 26700, 27000]);
    const preview = previewPatternChange(trip, full, fullProfile(), { sourcePattern: short, anchorNodeId: 'A' });
    expect(preview.finding).toMatchObject({ ruleId: 'trip.anchorNodeNotServed', messageKey: 'trip.anchorNodeNotServed', parameters: { nodeId: 'A' } });
    expect(preview.newStopTimes).toBeUndefined();
    expect(preview).not.toHaveProperty('anchorNodeId');
  });

  it('gives anchorNodeNotServed when the target does not serve the node', () => {
    const trip = tripOn('t1', full, 25200, fullProfile());
    const preview = previewPatternChange(trip, short, shortProfile, { sourcePattern: full, anchorNodeId: 'A' });
    expect(preview.finding).toMatchObject({ ruleId: 'trip.anchorNodeNotServed', parameters: { nodeId: 'A' } });
    expect(preview.newStopTimes).toBeUndefined();
  });

  it('gives anchorNodeNotServed when no source Pattern is supplied', () => {
    const trip = tripOn('t1', full, 25200, fullProfile());
    expect(previewPatternChange(trip, full, fullProfile(), { anchorNodeId: 'B' }).finding?.ruleId).toBe('trip.anchorNodeNotServed');
  });
});

describe('ambiguous band', () => {
  // Departures 28600 (am) and 28900 (pm) both give B at 29200, so B at 29200 has two single-band solutions.
  const ambiguousBands = [band('am', 0, 28800, [600, 900, 300]), band('pm', 28800, 90000, [300, 1080, 360])];
  const ambiguousTrip = tripWithTimes('t1', full, [28600, 29200, 30100, 30400]);

  it('lists the band choices for a single-band profile', () => {
    const preview = previewPatternChange(ambiguousTrip, full, profile('full', ambiguousBands), { sourcePattern: full, anchorNodeId: 'B' });
    expect(preview.finding?.ruleId).toBe('trip.anchorAmbiguous');
    expect(preview.bandChoices?.map((choice) => choice.bandId)).toEqual(['am', 'pm']);
    expect(preview.newStopTimes).toBeUndefined();
  });

  it('resolves to the chosen band', () => {
    const runtime = profile('full', ambiguousBands);
    const pm = previewPatternChange(ambiguousTrip, full, runtime, { sourcePattern: full, anchorNodeId: 'B', chosenBandId: 'pm' });
    expect(pm.finding).toBeUndefined();
    expect(pm.bandChoices).toBeUndefined();
    expect(times(pm.newStopTimes)).toEqual([28900, 29200, 30280, 30640]);
    const am = previewPatternChange(ambiguousTrip, full, runtime, { sourcePattern: full, anchorNodeId: 'B', chosenBandId: 'am' });
    expect(times(am.newStopTimes)).toEqual([28600, 29200, 30100, 30400]);
  });

  it('gives a finding with no picker under segment-start', () => {
    const preview = previewPatternChange(ambiguousTrip, full, profile('full', ambiguousBands, 'segmentStart'), { sourcePattern: full, anchorNodeId: 'B' });
    expect(preview.finding?.ruleId).toBe('trip.anchorAmbiguous');
    expect(preview.bandChoices).toBeUndefined();
    expect(preview.newStopTimes).toBeUndefined();
  });
});

describe('time before 0:00', () => {
  it('gives trip.timeBeforeServiceDay and no new times', () => {
    // Invalid runtime on purpose: a negative segment. Valid runtimes cannot give an earlier stop than the anchor's first departure.
    const negative = profile('full', [band('all', 0, 90000, [0, -2000, 300])]);
    const trip = tripWithTimes('t1', full, [1000, 1000, 1000, 1300]);
    const preview = previewPatternChange(trip, full, negative, { sourcePattern: full, anchorNodeId: 'B' });
    expect(preview.finding).toMatchObject({ ruleId: 'trip.timeBeforeServiceDay', parameters: { sequence: 2 } });
    expect(preview.newStopTimes).toBeUndefined();
  });
});

describe('applying an anchored change', () => {
  it('changes only the stop times and the patternId provenance, as an unanchored change does', () => {
    const trip: Trip = { ...tripOn('t1', full, 25200, fullProfile()), provenance: { ...provenance('rp-full'), manuallyChangedFields: ['times'], manualTimeShiftSeconds: 60 } };
    const anchored = previewPatternChange(trip, short, shortProfile, { sourcePattern: full, anchorNodeId: 'C' });
    const plain = previewPatternChange(trip, short, shortProfile);
    const appliedAnchored = applyPatternChange(trip, short, anchored, stamp);
    const appliedPlain = applyPatternChange(trip, short, plain, stamp);
    expect(appliedAnchored.provenance).toEqual(appliedPlain.provenance);
    expect(appliedAnchored.provenance.manuallyChangedFields).toEqual(['times', 'patternId']);
    expect(times(appliedAnchored.stopTimes)).not.toEqual(times(appliedPlain.stopTimes));
  });
});

describe('batch with an anchor', () => {
  it('leaves an ineligible Trip listed and the others eligible', () => {
    const eligible = tripOn('t-ok', full, 25200, fullProfile());
    const ineligible = tripOn('t-far', far, 25200, profile('far', [band('all', 0, 90000, [300])]));
    const request: BatchPatternChangeRequest = { tripIds: [eligible.id, ineligible.id], targetPatternId: short.id, anchorNodeId: 'C' };
    const preview = buildBatchPatternChangePreview(request, [eligible, ineligible], short, new Map([[eligible.id, shortProfile], [ineligible.id, shortProfile]]), [], [], [shortProfile], new Map([[eligible.id, full], [ineligible.id, far]]));
    expect(preview.eligibleTripIds).toEqual(['t-ok']);
    expect(preview.ineligibleTripIds).toEqual(['t-far']);
    expect(preview.findings.map((finding) => finding.ruleId)).toEqual(['trip.anchorNodeNotServed']);
    const okChange = preview.changes.find((change) => change.tripId === 't-ok');
    expect(okChange?.anchorNodeId).toBe('C');
    expect(okChange?.newStopTimes).toEqual(previewPatternChange(eligible, short, shortProfile, { sourcePattern: full, anchorNodeId: 'C' }).newStopTimes);
  });
});

describe('planner anchor time (Decision 0072 item 2)', () => {
  it('uses the planner time at the anchor node and calculates the other stops from it', () => {
    const trip = tripOn('t1', full, 25200, fullProfile());
    const preview = previewPatternChange(trip, short, shortProfile, { sourcePattern: full, anchorNodeId: 'C', anchorTime: 26000 });
    expect(preview.anchorTime).toBe(26000);
    expect(preview.newStopTimes?.find((point) => point.patternPointId === 'short-1')?.time).toBe(26000);
    expect(times(preview.newStopTimes)).toEqual([25100, 26000, 26300]);
  });

  it('gives today\'s result when the planner time equals the saved time', () => {
    const trip = tripOn('t1', full, 25200, fullProfile());
    const withSaved = previewPatternChange(trip, short, shortProfile, { sourcePattern: full, anchorNodeId: 'C', anchorTime: 26700 });
    expect(withSaved).toEqual(previewPatternChange(trip, short, shortProfile, { sourcePattern: full, anchorNodeId: 'C' }));
  });
});

describe('sharedAnchorNodes', () => {
  it('returns the nodes both Patterns serve, in the target order, once each', () => {
    expect(sharedAnchorNodes(full, short)).toEqual(['B', 'C', 'D']);
    expect(sharedAnchorNodes(full, reversed)).toEqual(['D', 'C', 'B', 'A']);
    expect(sharedAnchorNodes(full, loop)).toEqual(['A', 'B', 'C', 'D']);
    expect(sharedAnchorNodes(short, loop)).toEqual(['B', 'C', 'D']);
  });

  it('returns nothing when the Patterns share no node', () => {
    expect(sharedAnchorNodes(far, full)).toEqual([]);
  });
});
