import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import {
  blendSegmentTimes,
  copyRuntimeProfile,
  normalizeRuntimeProfile,
  propagatePatternTimes,
  reverseCopyRuntimeProfile,
  runtimeBandTotalSeconds,
  resolveRuntimeForDeparture,
  resolveSegmentStartBand,
  segmentStartTimes,
  selectRuntimeBand,
  validateRuntimeAssignments,
  validateRuntimeProfile,
  withRuntimeCalculationRevision,
} from './runtime';
import type { RoutePattern, RuntimeAssignment, RuntimeBand, RuntimeProfile } from './types';

const pattern: RoutePattern = {
  ...metadata('2026-01-01T00:00:00.000Z'),
  id: 'pattern-a', scenarioId: 'scenario-a', routeId: 'route-a', name: 'Outbound',
  points: [
    { id: 'point-a', nodeId: 'node-a', sequence: 0, cumulativeMiles: 0 },
    { id: 'point-b', nodeId: 'node-b', sequence: 1, cumulativeMiles: 4.5 },
    { id: 'point-c', nodeId: 'node-c', sequence: 2, cumulativeMiles: 8.25 },
  ],
};

const reversePattern: RoutePattern = {
  ...pattern,
  id: 'pattern-b', name: 'Inbound',
  points: [
    { id: 'point-c-reverse', nodeId: 'node-c', sequence: 0, cumulativeMiles: 0 },
    { id: 'point-b-reverse', nodeId: 'node-b', sequence: 1, cumulativeMiles: 3.75 },
    { id: 'point-a-reverse', nodeId: 'node-a', sequence: 2, cumulativeMiles: 8.25 },
  ],
};

const profile: RuntimeProfile = {
  ...metadata('2026-01-01T00:00:00.000Z'),
  id: 'profile-a', scenarioId: 'scenario-a', routeId: 'route-a', patternId: 'pattern-a', name: 'Weekday',
  bands: [
    { id: 'band-pm', label: 'PM', sequence: 1, startTime: 43200, endTime: 93600, segmentRuntimeSeconds: [480, 420] },
    { id: 'band-am', label: 'AM', sequence: 0, startTime: 21600, endTime: 43200, segmentRuntimeSeconds: [360, 300] },
  ],
};

describe('runtime profiles', () => {
  it('totals a band’s segment runtimes', () => {
    expect(runtimeBandTotalSeconds(profile.bands[0])).toBe(900);
  });

  it('selects half-open bands and supports extended service time', () => {
    expect(selectRuntimeBand(profile, 21600)?.id).toBe('band-am');
    expect(selectRuntimeBand(profile, 43199)?.id).toBe('band-am');
    expect(selectRuntimeBand(profile, 43200)?.id).toBe('band-pm');
    expect(selectRuntimeBand(profile, 93600)).toBeUndefined();
  });

  it('normalizes by time while preserving band IDs', () => {
    const normalized = normalizeRuntimeProfile(profile);
    expect(normalized.bands.map((band) => [band.id, band.sequence])).toEqual([['band-am', 0], ['band-pm', 1]]);
    expect(profile.bands.map((band) => band.id)).toEqual(['band-pm', 'band-am']);
  });

  it('validates complete segment runtimes, bounds, and overlaps', () => {
    expect(validateRuntimeProfile(profile, pattern)).toEqual([]);
    const invalid = { ...profile, bands: [{ ...profile.bands[0], endTime: 50000, segmentRuntimeSeconds: [1] }, { ...profile.bands[1], endTime: 45000 }] };
    const findings = validateRuntimeProfile(invalid, pattern);
    expect(findings.map((item) => item.messageKey)).toEqual(expect.arrayContaining(['runtime.segmentCountMismatch', 'runtime.bandOverlap']));
  });

  it('reports a missing band and propagates the selected band through the pattern', () => {
    expect(resolveRuntimeForDeparture(profile, pattern, 1000).finding?.messageKey).toBe('runtime.noApplicableBand');
    const result = propagatePatternTimes(pattern, 21600, profile);
    expect('stopTimes' in result ? result.stopTimes.map((point) => point.time) : []).toEqual([21600, 21960, 22260]);
  });

  it('blends each segment by progress across its own band boundary', () => {
    const blended = { ...profile, calculationMethod: 'blendSegments' as const, bands: [
      { ...profile.bands[1], startTime: 0, endTime: 3600, segmentRuntimeSeconds: [60, 120] },
      { ...profile.bands[0], startTime: 3600, endTime: 9000, segmentRuntimeSeconds: [120, 180] },
    ] };
    const result = blendSegmentTimes(pattern, 3550, blended);
    expect('stopTimes' in result && result.stopTimes.map((point) => point.time)).toEqual([3550, 3620, 3800]);
    if ('segments' in result) expect(result.segments[0].contributions.map((part) => [part.bandLabel, part.seconds])).toEqual([['AM', 50], ['PM', 20]]);
    expect(withRuntimeCalculationRevision({ ...blended, calculationMethod: 'singleBand' }, blended).calculationRevision).toBe(1);
  });

  it('creates independent copies and reverses segment runtimes', () => {
    const copy = copyRuntimeProfile(profile, { name: 'Copied profile' });
    expect(copy.id).not.toBe(profile.id);
    expect(copy.bands.map((band) => band.id)).not.toEqual(profile.bands.map((band) => band.id));
    copy.bands[0].segmentRuntimeSeconds[0] = 1;
    expect(profile.bands[0].segmentRuntimeSeconds[0]).toBe(480);
    const reverse = reverseCopyRuntimeProfile(profile, pattern, reversePattern, 'Reversed profile');
    expect(reverse.patternId).toBe(reversePattern.id);
    expect(reverse.bands.map((band) => band.segmentRuntimeSeconds)).toEqual([[420, 480], [300, 360]]);
  });

  it('rejects an incompatible reverse target', () => {
    expect(() => reverseCopyRuntimeProfile(profile, pattern, { ...reversePattern, points: reversePattern.points.slice(0, 2) }, 'Rejected')).toThrow(/incompatible/);
  });

  it('flags duplicate assignment for one pattern and service day', () => {
    const assignment = (id: string, profileId: string): RuntimeAssignment => ({ ...metadata(), id, scenarioId: 'scenario-a', patternId: 'pattern-a', serviceDayId: 'weekday', runtimeProfileId: profileId });
    const findings = validateRuntimeAssignments([assignment('assignment-a', 'profile-a'), assignment('assignment-b', 'profile-b')]);
    expect(findings).toHaveLength(1);
    expect(findings[0].messageKey).toBe('runtime.assignmentNotUnique');
  });

  it('increments calculation revision for runtime edits but not renames', () => {
    const base = { ...profile, calculationRevision: 4 };
    expect(withRuntimeCalculationRevision(base, { ...base, name: 'Renamed' }).calculationRevision).toBe(4);
    expect(withRuntimeCalculationRevision(base, { ...base, bands: [{ ...base.bands[0], segmentRuntimeSeconds: [481, 420] }, base.bands[1]] }).calculationRevision).toBe(5);
  });

  // I-065 (2-011): a band label is shown to the planner and is not an input to any calculated time.
  it('does not increment the calculation revision when only a band label changes', () => {
    const base = { ...profile, calculationRevision: 4 };
    const relabeled = { ...base, bands: [{ ...base.bands[0], label: 'Evening' }, base.bands[1]] };
    expect(withRuntimeCalculationRevision(base, relabeled).calculationRevision).toBe(4);
    expect(withRuntimeCalculationRevision(base, { ...relabeled, bands: [{ ...relabeled.bands[0], endTime: relabeled.bands[0].endTime + 60 }, relabeled.bands[1]] }).calculationRevision).toBe(5);
    expect(withRuntimeCalculationRevision(base, { ...relabeled, calculationMethod: 'blendSegments' }).calculationRevision).toBe(5);
  });
});

// Ported from the review's p2-time-runtime golden test (A-007, I-047): `segmentStart` is the default method for every new
// Runtime profile, and its boundary behavior had no calculation test. Decisions 0033 and 0035 item 1 govern.
describe('segmentStart boundary matrix', () => {
  const abc: RoutePattern = { ...metadata('2026-01-01T00:00:00.000Z'), id: 'p', scenarioId: 's', routeId: 'r', name: 'P', points: [
    { id: 'a', nodeId: 'A', sequence: 0, cumulativeMiles: 0 },
    { id: 'b', nodeId: 'B', sequence: 1, cumulativeMiles: 1 },
    { id: 'c', nodeId: 'C', sequence: 2, cumulativeMiles: 2 },
  ] };
  const band = (id: string, startTime: number, endTime: number, segmentRuntimeSeconds: number[], sequence = 0): RuntimeBand => ({ id, label: id.toUpperCase(), sequence, startTime, endTime, segmentRuntimeSeconds });
  const segmentStartProfile = (bands: RuntimeBand[]): RuntimeProfile => ({ ...metadata('2026-01-01T00:00:00.000Z'), id: 'rp', scenarioId: 's', routeId: 'r', patternId: 'p', name: 'Weekday', bands, calculationMethod: 'segmentStart' });
  // AM 6:00-9:00, MID 9:00-15:00, gap 15:00-16:00, PM 16:00-20:00. The bands are deliberately listed out of order.
  const bands = [band('pm', 57600, 72000, [1200, 1200], 2), band('am', 21600, 32400, [600, 900], 0), band('mid', 32400, 54000, [2100, 300], 1)];
  const profileWithGap = segmentStartProfile(bands);
  const times = (result: ReturnType<typeof propagatePatternTimes>) => ('finding' in result ? result.finding.ruleId : result.stopTimes.map((point) => point.time));

  it.each<[string, number, number[] | string]>([
    ['departure at first band start', 21600, [21600, 22200, 23100]],
    ['segment crossing a band end keeps its start band; next segment uses the new band', 32399, [32399, 32999, 33299]],
    ['departure exactly at band end belongs to the next band (half-open)', 32400, [32400, 34500, 34800]],
    ['segment starting inside a gap uses the nearest band (MID, 100 s away)', 52000, [52000, 54100, 54400]],
    ['segment starting after the last band uses the last band', 71900, [71900, 73100, 74300]],
    ['departure inside a gap is rejected', 55000, 'runtime.noApplicableBand'],
    ['departure before the first band is rejected', 21599, 'runtime.noApplicableBand'],
    ['departure at the last band end is rejected', 72000, 'runtime.noApplicableBand'],
  ])('%s', (_label, departure, expected) => expect(times(propagatePatternTimes(abc, departure, profileWithGap))).toEqual(expected));

  it('segment contributions name the band used at each segment start', () => {
    const result = segmentStartTimes(abc, 32399, profileWithGap);
    if ('finding' in result) throw new Error('unexpected finding');
    expect(result.segments.map((segment) => segment.contributions.map((part) => part.bandId))).toEqual([['am'], ['mid']]);
  });

  it('a single-band profile extends beyond its own end for later segments', () => {
    expect(times(propagatePatternTimes(abc, 32000, segmentStartProfile([band('am', 21600, 32400, [600, 900])])))).toEqual([32000, 32600, 33500]);
  });

  it('orders unsorted band input by start time before resolution', () => {
    expect(resolveSegmentStartBand(profileWithGap, 40000)?.id).toBe('mid');
  });

  it('overlapping bands: the earlier-starting band wins and validation reports runtime.bandOverlap', () => {
    const overlapping = segmentStartProfile([band('x', 0, 3600, [60, 60]), band('y', 1800, 5400, [120, 120])]);
    expect(selectRuntimeBand(overlapping, 2000)?.id).toBe('x');
    expect(validateRuntimeProfile(overlapping, abc).map((finding) => finding.ruleId)).toContain('runtime.bandOverlap');
  });

  it('a zero-length band is invalid and never contains a departure', () => {
    const zero = segmentStartProfile([band('z', 3600, 3600, [60, 60])]);
    expect(selectRuntimeBand(zero, 3600)).toBeUndefined();
    expect(validateRuntimeProfile(zero, abc).map((finding) => finding.ruleId)).toContain('runtime.bandBoundsInvalid');
  });
});
