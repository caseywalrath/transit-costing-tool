import { describe, expect, it } from 'vitest';
import { goldenRaw } from '../testSupport/goldenBackup';
import { metadata } from './ids';
import { applySegmentRuntimePlan, defaultBandPairs, planCopyToOthers, planFillFromOthers, planValueCopy, qualifyingProfiles, segmentKeys } from './segmentRuntimeMatching';
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

  it('6. a band is paired with the band that overlaps it most, if by more than half', () => {
    // [6, 10] overlaps [6, 9] for 3 of its 4 hours, so the two are paired and the five segments are copied.
    const odd = profile('PB', 'B', 7, () => 0, {}, [[4, 6], [6, 9], [10, 18], [18, 22], [22, 26]]);
    const plan = planCopyToOthers(input(profileA, [odd]));
    expect(plan.changes).toHaveLength(25);
    expect(plan.changes.filter((change) => change.bandId === 'PB-b1')).toHaveLength(5);
    expect(plan.skips).toEqual([]);
  });

  it('6a. a band whose best overlap is not more than half of it is a band mismatch', () => {
    // [6, 10] overlaps [6, 8] and [8, 18] for 2 hours each, which is not more than half of 4 hours, so it has no partner.
    const split = profile('PB', 'B', 7, () => 0, {}, [[4, 6], [6, 8], [8, 18], [18, 22], [22, 26]]);
    const plan = planCopyToOthers(input(profileA, [split]));
    expect(plan.skips).toEqual([{ profileId: 'PB', patternId: 'B', reason: 'bandMismatch', bandId: 'PA-b1' }]);
    expect(plan.changes).toHaveLength(20);
    expect(plan.changes.some((change) => change.bandId === 'PB-b1')).toBe(false);
  });

  it('6b. fill uses the bands that match even when the open profile has fewer bands', () => {
    const twoBands = profile('PB', 'B', 7, () => 0, {}, [[4, 6], [6, 10]]);
    const plan = planFillFromOthers(input(twoBands, [profileA]));
    expect(plan.changes).toHaveLength(10);
    expect(new Set(plan.changes.map((change) => change.bandId))).toEqual(new Set(['PB-b0', 'PB-b1']));
    // Pairing is one-sided (Decision 0074 item 4): the source's bands that have no open band are not reported.
    expect(plan.skips.filter((skip) => skip.reason === 'bandMismatch')).toEqual([]);
  });

  it('6c. defaultBandPairs: an identical band wins, a tie or an under-half overlap gives null', () => {
    const open = profile('PO', 'A', 8, () => 0, {}, [[4, 8], [8, 10]]);
    const other = profile('PQ', 'B', 7, () => 0, {}, [[4, 6], [6, 8], [8, 10]]);
    expect(defaultBandPairs(open, [other])).toEqual({ PQ: { 'PO-b0': null, 'PO-b1': 'PQ-b2' } });
  });

  it('6d. an explicit bandPairs input replaces the default pairing', () => {
    const plan = planCopyToOthers(input(profileA, [emptyB], { bandPairs: { PB: { 'PA-b0': null, 'PA-b1': null, 'PA-b2': null, 'PA-b3': null, 'PA-b4': null } } }));
    expect(plan.changes).toEqual([]);
    expect(plan.skips.filter((skip) => skip.reason === 'bandMismatch')).toHaveLength(5);
  });

  it('6e. a pair with no shared segment is reported as noMatchingSegment', () => {
    const C = pattern('C', ['Q', 'R'], 2);
    const pc = profile('PC', 'C', 1, () => 0);
    const plan = planCopyToOthers({ ...input(profileA, [pc]), patterns: [A, C], assignments: [assign('PA', 'A'), assign('PC', 'C')] });
    expect(plan.changes).toEqual([]);
    expect(plan.skips).toEqual([{ profileId: 'PC', patternId: 'C', reason: 'noMatchingSegment' }]);
  });

  it('6f. a profile assigned only to other Service days is reported as otherServiceDays', () => {
    const plan = planCopyToOthers({ ...input(profileA, [emptyB]), assignments: [assign('PA', 'A'), assign('PB', 'B', 'saturday')] });
    expect(plan.skips).toEqual([{ profileId: 'PB', patternId: 'B', reason: 'otherServiceDays' }]);
  });

  it('6g. fill reports a cell whose matched sources are all :00 as emptySource', () => {
    const zeroA = profile('PZ', 'A', 8, () => 0);
    const plan = planFillFromOthers({ ...input(emptyB, [zeroA]), assignments: [assign('PB', 'B'), assign('PZ', 'A')] });
    expect(plan.changes).toEqual([]);
    expect(plan.skips.filter((skip) => skip.reason === 'emptySource')).toHaveLength(25);
    expect(plan.skips.find((skip) => skip.reason === 'emptySource')).toMatchObject({ profileId: 'PB', bandId: 'PB-b0', segmentIndex: 0 });
  });

  it('7. golden: a Westminster Weekday profile with every segment at :00 has fill changes', () => {
    const backup = goldenRaw();
    const westminster = backup.patterns.find((pattern: RoutePattern) => pattern.name === 'Southbound: Westminster Station to Englewood');
    const routeProfiles: RuntimeProfile[] = backup.runtimeProfiles.filter((profile: RuntimeProfile) => profile.routeId === westminster.routeId);
    const open = routeProfiles.find((profile) => profile.patternId === westminster.id && profile.name.startsWith('Weekday'))!;
    for (const band of open.bands) band.segmentRuntimeSeconds = band.segmentRuntimeSeconds.map(() => 0);
    const plan = planFillFromOthers({ openProfile: open, patterns: backup.patterns.filter((pattern: RoutePattern) => pattern.routeId === westminster.routeId), profiles: routeProfiles, assignments: backup.runtimeAssignments });
    expect(plan.changes.length).toBeGreaterThan(0);
  });

  it('7b. golden: copy never writes one target cell twice, and a target band claimed by two open bands is reported', () => {
    const backup = goldenRaw();
    const routeId = backup.patterns[0].routeId;
    const routeProfiles: RuntimeProfile[] = backup.runtimeProfiles.filter((profile: RuntimeProfile) => profile.routeId === routeId);
    const patterns = backup.patterns.filter((pattern: RoutePattern) => pattern.routeId === routeId);
    let shared = 0;
    for (const open of routeProfiles) {
      const plan = planCopyToOthers({ openProfile: open, patterns, profiles: routeProfiles, assignments: backup.runtimeAssignments });
      const cells = plan.changes.map((change) => `${change.profileId}:${change.bandId}:${change.segmentIndex}`);
      expect(new Set(cells).size).toBe(cells.length);
      shared += plan.skips.filter((skip) => skip.reason === 'bandShared').length;
    }
    expect(shared).toBeGreaterThan(0);
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

describe('planValueCopy (Decision 0075 item 5)', () => {
  it('writes one band value of one segment into the chosen target bands only, and skips equal values and targets without the segment', () => {
    const targetB = profile('PB', 'B', 7, () => 100);
    const C = pattern('C', ['X', 'Y'], 2);
    const profileC = profile('PC', 'C', 1, () => 50);
    // WSTMNST>CCR-FED is segment 3 of A (value 60 * 4 + band) and segment 0 of B.
    const plan = planValueCopy({ request: { sourceProfileId: 'PA', sourceBandId: 'PA-b1', segmentKey: 'WSTMNST>CCR-FED', targets: [{ profileId: 'PB', bandId: 'PB-b1' }, { profileId: 'PB', bandId: 'PB-b2' }, { profileId: 'PC', bandId: 'PC-b1' }] }, patterns: [A, B, C], profiles: [profileA, targetB, profileC] });
    expect(plan.mode).toBe('valueCopy');
    expect(plan.changes).toEqual([
      { profileId: 'PB', patternId: 'B', bandId: 'PB-b1', segmentIndex: 0, previousSeconds: 100, nextSeconds: 241, sourceProfileId: 'PA' },
      { profileId: 'PB', patternId: 'B', bandId: 'PB-b2', segmentIndex: 0, previousSeconds: 100, nextSeconds: 241, sourceProfileId: 'PA' },
    ]);
    expect(planValueCopy({ request: { sourceProfileId: 'PA', sourceBandId: 'PA-b1', segmentKey: 'WSTMNST>CCR-FED', targets: [{ profileId: 'PB', bandId: 'PB-b1' }] }, patterns: [A, B], profiles: [profileA, profile('PB', 'B', 7, () => 241)] }).changes).toEqual([]);
  });
});

