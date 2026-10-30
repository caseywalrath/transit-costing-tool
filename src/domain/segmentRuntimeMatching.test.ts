import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import { applySegmentRuntimePlan, planCopyToOthers, planFillFromOthers, qualifyingProfiles, segmentKeys } from './segmentRuntimeMatching';
import type { RoutePattern, RuntimeAssignment, RuntimeProfile } from './types';

const T = metadata('2026-01-01T00:00:00.000Z');
const hours = (h: number) => h * 3600;
const BANDS: Array<[number, number]> = [[4, 6], [6, 10], [10, 18], [18, 22], [22, 26]];

function pattern(id: string, nodes: string[], sequence: number): RoutePattern {
  return { ...T, id, scenarioId: 's', routeId: 'r', name: id, sequence, points: nodes.map((nodeId, index) => ({ id: `${id}-p${index}`, nodeId, sequence: index, cumulativeMiles: index })) };
}
function profile(id: string, patternId: string, segments: number, values: (band: number, segment: number) => number, overrides: Partial<RuntimeProfile> = {}, bands = BANDS): RuntimeProfile {
  return { ...T, id, scenarioId: 's', routeId: 'r', patternId, name: id, calculationRevision: 0, bands: bands.map(([start, end], band) => ({ id: `${id}-b${band}`, label: `${start}-${end}`, sequence: band, startTime: hours(start), endTime: hours(end), segmentRuntimeSeconds: Array.from({ length: segments }, (_, segment) => values(band, segment)) })), ...overrides };
}
const assign = (profileId: string, patternId: string, serviceDayId = 'weekday'): RuntimeAssignment => ({ ...T, id: `a-${profileId}-${serviceDayId}`, scenarioId: 's', patternId, serviceDayId, runtimeProfileId: profileId });

// The Federal Boulevard patterns: A is FRCC to EVANS; B is WSTMNST to ENGLWD. They share five segments.
const A = pattern('A', ['FRCC', '112AVE', '104AVE', 'WSTMNST', 'CCR-FED', 'FED-32D', 'DEC-FED', 'ALAMED', 'EVANS'], 0);
const B = pattern('B', ['WSTMNST', 'CCR-FED', 'FED-32D', 'DEC-FED', 'ALAMED', 'EVANS', 'YALE', 'ENGLWD'], 1);
const profileA = profile('PA', 'A', 8, (band, segment) => 60 * (segment + 1) + band);
const emptyB = profile('PB', 'B', 7, () => 0);
const route = { patterns: [A, B], assignments: [assign('PA', 'A'), assign('PB', 'B')] };
const input = (open: RuntimeProfile, profiles: RuntimeProfile[], extra: Partial<Parameters<typeof planCopyToOthers>[0]> = {}) => ({ openProfile: open, patterns: route.patterns, profiles: [open, ...profiles], assignments: route.assignments, ...extra });

describe('segment runtime matching', () => {
  it('keys a segment by its ordered node pair', () => {
    expect(segmentKeys(A)[3]).toBe('WSTMNST>CCR-FED');
    expect(segmentKeys(B)).toHaveLength(7);
  });

  it('1. copy changes only the shared segments in all five bands', () => {
    const existing = profile('PB', 'B', 7, (band, segment) => (segment < 5 ? 1 : 77));
    const plan = planCopyToOthers(input(profileA, [existing]));
    expect(plan.changes).toHaveLength(25);
    expect(new Set(plan.changes.map((change) => change.segmentIndex))).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(plan.changes.every((change) => change.profileId === 'PB' && change.sourceProfileId === 'PA')).toBe(true);
    // A segment 3 (WSTMNST>CCR-FED) is B segment 0.
    expect(plan.changes.find((change) => change.bandId === 'PB-b4' && change.segmentIndex === 0)).toMatchObject({ previousSeconds: 1, nextSeconds: 60 * 4 + 4 });
    expect(plan.affectedProfiles).toEqual([{ profileId: 'PB', patternId: 'B', changeCount: 25, overwriteCount: 25, fillCount: 0 }]);
    const [changed] = applySegmentRuntimePlan([existing], plan);
    expect(changed.bands[0].segmentRuntimeSeconds.slice(5)).toEqual([77, 77]);
    expect(changed.bands[0].segmentRuntimeSeconds[0]).toBe(60 * 4);
  });

  it('2. fill into a new profile gives the shared segments the open values', () => {
    const plan = planFillFromOthers(input(emptyB, [profileA]));
    expect(plan.changes).toHaveLength(25);
    const [filled] = applySegmentRuntimePlan([emptyB], plan);
    expect(filled.bands[0].segmentRuntimeSeconds).toEqual([60 * 4, 60 * 5, 60 * 6, 60 * 7, 60 * 8, 0, 0]);
    expect(plan.affectedProfiles[0]).toMatchObject({ profileId: 'PB', fillCount: 25, overwriteCount: 0 });
  });

  it('3. fill does not overwrite a non-zero cell', () => {
    const partly = profile('PB', 'B', 7, (band, segment) => (segment === 0 ? 999 : 0));
    const plan = planFillFromOthers(input(partly, [profileA]));
    expect(plan.changes.some((change) => change.segmentIndex === 0)).toBe(false);
    expect(plan.changes).toHaveLength(20);
  });

  it('4. a reversed direction does not match', () => {
    const reversed = pattern('B', [...B.points.map((point) => point.nodeId)].reverse(), 1);
    const plan = planCopyToOthers({ ...input(profileA, [emptyB]), patterns: [A, reversed] });
    expect(plan.changes).toEqual([]);
  });

  it('5. a repeated node pair is ambiguous and changes nothing for that pair', () => {
    const loop = pattern('B', ['WSTMNST', 'CCR-FED', 'WSTMNST', 'CCR-FED', 'FED-32D'], 1);
    const loopProfile = profile('PB', 'B', 4, () => 0);
    const plan = planCopyToOthers({ ...input(profileA, [loopProfile]), patterns: [A, loop] });
    expect(plan.skips.some((skip) => skip.reason === 'ambiguous' && skip.profileId === 'PB')).toBe(true);
    // WSTMNST>CCR-FED is repeated in the loop; CCR-FED>FED-32D is the only usable pair.
    expect(new Set(plan.changes.map((change) => change.segmentIndex))).toEqual(new Set([3]));
  });

  it('6. a band that overlaps but is not identical is a band mismatch', () => {
    const odd = profile('PB', 'B', 7, () => 0, {}, [[4, 6], [6, 9], [10, 18], [18, 22], [22, 26]]);
    const plan = planCopyToOthers(input(profileA, [odd]));
    expect(plan.changes).toHaveLength(20);
    expect(plan.skips.filter((skip) => skip.reason === 'bandMismatch').length).toBeGreaterThan(0);
  });

  it('7. matches only profiles that share a service day, and reports unassigned profiles', () => {
    const saturdayOnly = { ...route, assignments: [assign('PA', 'A'), assign('PB', 'B', 'saturday')] };
    expect(planCopyToOthers({ ...input(profileA, [emptyB]), assignments: saturdayOnly.assignments }).changes).toEqual([]);
    expect(qualifyingProfiles(profileA, [emptyB], saturdayOnly.assignments)).toEqual([]);
    const unassigned = planCopyToOthers({ ...input(profileA, [emptyB]), assignments: [assign('PA', 'A')] });
    expect(unassigned.changes).toEqual([]);
    expect(unassigned.skips).toContainEqual({ profileId: 'PB', patternId: 'B', reason: 'unassigned' });
  });

  it('8. fill reports a conflict when sources disagree and fills when they agree', () => {
    const C = pattern('C', ['WSTMNST', 'CCR-FED', 'X'], 2);
    const sourceB = profile('PB', 'B', 7, (band, segment) => (segment === 0 ? 100 : 0));
    const sourceC = (seconds: number) => profile('PC', 'C', 2, (band, segment) => (segment === 0 ? seconds : 0));
    const open = profile('PO', 'A', 8, () => 0);
    const base = { patterns: [A, B, C], assignments: [assign('PO', 'A'), assign('PB', 'B'), assign('PC', 'C')] };
    const disagree = planFillFromOthers({ openProfile: open, ...base, profiles: [open, sourceB, sourceC(200)] });
    const conflicts = disagree.skips.filter((skip) => skip.reason === 'conflict');
    expect(conflicts).toHaveLength(5);
    expect(conflicts[0].candidates).toEqual([{ seconds: 100, profileIds: ['PB'] }, { seconds: 200, profileIds: ['PC'] }]);
    expect(disagree.changes.some((change) => change.segmentIndex === 3)).toBe(false);
    const agree = planFillFromOthers({ openProfile: open, ...base, profiles: [open, sourceB, sourceC(100)] });
    expect(agree.skips.filter((skip) => skip.reason === 'conflict')).toEqual([]);
    expect(agree.changes.filter((change) => change.segmentIndex === 3 && change.nextSeconds === 100)).toHaveLength(5);
  });

  it('9. excluded profiles are left out of copy', () => {
    const plan = planCopyToOthers(input(profileA, [emptyB], { excludedProfileIds: ['PB'] }));
    expect(plan.changes).toEqual([]);
    expect(plan.skips).toEqual([]);
  });

  it('10. never uses other routes or the same pattern', () => {
    const otherRoute = { ...emptyB, id: 'PX', routeId: 'other' };
    const samePattern = profile('PA2', 'A', 8, () => 0);
    const plan = planCopyToOthers(input(profileA, [otherRoute, samePattern]));
    expect(plan.changes).toEqual([]);
    expect(planFillFromOthers(input(emptyB, [{ ...profileA, id: 'PY', routeId: 'other' }])).changes).toEqual([]);
  });

  it('11. equal values are not changes', () => {
    const matching = profile('PB', 'B', 7, (band, segment) => (segment < 5 ? 60 * (segment + 4) + band : 0));
    expect(planCopyToOthers(input(profileA, [matching])).changes).toEqual([]);
  });
});
