import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import {
  copyRuntimeProfile,
  normalizeRuntimeProfile,
  propagatePatternTimes,
  reverseCopyRuntimeProfile,
  runtimeBandTotalSeconds,
  resolveRuntimeForDeparture,
  selectRuntimeBand,
  validateRuntimeAssignments,
  validateRuntimeProfile,
  withRuntimeCalculationRevision,
} from './runtime';
import type { RoutePattern, RuntimeAssignment, RuntimeProfile } from './types';

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
});
