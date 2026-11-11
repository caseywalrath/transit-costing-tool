import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { propagatePatternTimes } from './runtime';
import { buildBatchPatternChangePreview, type BatchPatternChangeRequest } from './serviceDayCopy';
import { previewPatternChange } from './trips';
import type { RoutePattern, RuntimeBand, RuntimeProfile, ScheduledPoint, Trip } from './types';

// Decision 0071 items 2 to 4 (skip, per-Trip inputs). Both Patterns serve route r1 and direction d1, so the anchor decides eligibility.
const stamp = '2026-11-11T09:00:00.000Z';
const pattern = (id: string, nodes: string[]): RoutePattern => ({ ...metadata(stamp), id, scenarioId: 's1', routeId: 'r1', name: id, directionId: 'd1', points: nodes.map((nodeId, sequence) => ({ id: `${id}-${sequence}`, nodeId, sequence, cumulativeMiles: sequence })) });
const full = pattern('full', ['A', 'B', 'C', 'D']);
const short = pattern('short', ['B', 'C', 'D']);
const band = (id: string, startTime: number, endTime: number, segmentRuntimeSeconds: number[]): RuntimeBand => ({ id, label: id, sequence: 0, startTime, endTime, segmentRuntimeSeconds });
const profile = (patternId: string, bands: RuntimeBand[]): RuntimeProfile => ({ ...metadata(stamp), id: `rp-${patternId}`, scenarioId: 's1', routeId: 'r1', patternId, name: 'Runtime', bands });
const fullProfile = profile('full', [band('all', 0, 90000, [600, 900, 300])]);
const shortProfile = profile('short', [band('all', 0, 90000, [900, 300])]);
const provenance = (runtimeProfileId: string): Trip['provenance'] => ({ kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [], runtimeProfileId, runtimeCalculationRevision: 0, calculationSource: { runtimeProfileId, runtimeCalculationRevision: 0 } });
function tripOn(id: string, source: RoutePattern, departure: number, runtime: RuntimeProfile): Trip {
  const result = propagatePatternTimes(source, departure, runtime);
  if (!('stopTimes' in result)) throw new Error(`Propagation failed: ${result.finding.ruleId}`);
  const stopTimes: ScheduledPoint[] = result.stopTimes;
  return { ...metadata(stamp), id, scenarioId: 's1', routeId: 'r1', serviceDayId: 'weekday', patternId: source.id, tripProfileId: 'tp1', stopTimes, provenance: provenance(runtime.id) };
}
const times = (points: ScheduledPoint[] | undefined) => points?.map((point) => point.time);
const profilesFor = (ids: string[]) => new Map(ids.map((id) => [id, shortProfile] as const));
const sourcesFor = (ids: string[]) => new Map(ids.map((id) => [id, full] as const));

describe('batch Change pattern: skipped Trips (Decision 0071 item 2)', () => {
  it('leaves a skipped Trip with no finding, no times, and in neither the eligible nor the ineligible list', () => {
    const ok = tripOn('t-ok', full, 25200, fullProfile);
    const skip = tripOn('t-skip', full, 25200, fullProfile);
    const request: BatchPatternChangeRequest = { tripIds: ['t-ok', 't-skip'], targetPatternId: 'short', anchorNodeId: 'C', skipTripIds: ['t-skip'] };
    const preview = buildBatchPatternChangePreview(request, [ok, skip], short, profilesFor(['t-ok', 't-skip']), [], [], [shortProfile], sourcesFor(['t-ok', 't-skip']));
    expect(preview.eligibleTripIds).toEqual(['t-ok']);
    expect(preview.ineligibleTripIds).toEqual([]);
    expect(preview.skippedTripIds).toEqual(['t-skip']);
    expect(preview.findings).toEqual([]);
    const skipped = preview.changes.find((change) => change.tripId === 't-skip');
    expect(skipped).toMatchObject({ skipped: true, oldStopTimes: skip.stopTimes });
    expect(skipped).not.toHaveProperty('newStopTimes');
    expect(skipped).not.toHaveProperty('finding');
  });

  it('gives no finding to a skipped Trip whose Pattern would otherwise be refused', () => {
    const far = tripOn('t-far', full, 25200, fullProfile);
    const request: BatchPatternChangeRequest = { tripIds: ['t-far'], targetPatternId: 'short', anchorNodeId: 'A', skipTripIds: ['t-far'] };
    const preview = buildBatchPatternChangePreview(request, [far], short, profilesFor(['t-far']), [], [], [shortProfile], sourcesFor(['t-far']));
    expect(preview.findings).toEqual([]);
    expect(preview.ineligibleTripIds).toEqual([]);
    expect(preview.skippedTripIds).toEqual(['t-far']);
  });
});

describe('batch Change pattern: per-Trip inputs (Decision 0071 item 4, Decision 0072 item 2)', () => {
  it('uses a per-Trip anchor node in place of the shared one', () => {
    const t1 = tripOn('t1', full, 25200, fullProfile);
    const t2 = tripOn('t2', full, 25200, fullProfile);
    const request: BatchPatternChangeRequest = { tripIds: ['t1', 't2'], targetPatternId: 'short', anchorNodeId: 'C', anchorNodeIdByTripId: { t2: 'B' } };
    const preview = buildBatchPatternChangePreview(request, [t1, t2], short, profilesFor(['t1', 't2']), [], [], [shortProfile], sourcesFor(['t1', 't2']));
    expect(preview.changes.find((change) => change.tripId === 't1')?.anchorNodeId).toBe('C');
    const second = preview.changes.find((change) => change.tripId === 't2');
    expect(second?.anchorNodeId).toBe('B');
    expect(second?.newStopTimes).toEqual(previewPatternChange(t2, short, shortProfile, { sourcePattern: full, anchorNodeId: 'B' }).newStopTimes);
  });

  it('treats an empty per-Trip anchor node as the first stop', () => {
    const t2 = tripOn('t2', full, 25200, fullProfile);
    const request: BatchPatternChangeRequest = { tripIds: ['t2'], targetPatternId: 'short', anchorNodeId: 'C', anchorNodeIdByTripId: { t2: '' } };
    const preview = buildBatchPatternChangePreview(request, [t2], short, profilesFor(['t2']), [], [], [shortProfile], sourcesFor(['t2']));
    const change = preview.changes[0];
    expect(change).not.toHaveProperty('anchorNodeId');
    expect(change.newStopTimes).toEqual(previewPatternChange(t2, short, shortProfile).newStopTimes);
  });

  it('calculates a Trip from its own anchor time', () => {
    const t1 = tripOn('t1', full, 25200, fullProfile);
    const request: BatchPatternChangeRequest = { tripIds: ['t1'], targetPatternId: 'short', anchorNodeId: 'C', anchorTimeByTripId: { t1: 26000 } };
    const preview = buildBatchPatternChangePreview(request, [t1], short, profilesFor(['t1']), [], [], [shortProfile], sourcesFor(['t1']));
    expect(preview.changes[0].anchorTime).toBe(26000);
    expect(times(preview.changes[0].newStopTimes)).toEqual([25100, 26000, 26300]);
  });

  it('starts the connection fields empty; the application fills them in', () => {
    const t1 = tripOn('t1', full, 25200, fullProfile);
    const preview = buildBatchPatternChangePreview({ tripIds: ['t1'], targetPatternId: 'short', anchorNodeId: 'C' }, [t1], short, profilesFor(['t1']), [], [], [shortProfile], sourcesFor(['t1']));
    expect(preview.connections).toEqual([]);
    expect(preview.connectionFindings).toEqual([]);
  });
});
