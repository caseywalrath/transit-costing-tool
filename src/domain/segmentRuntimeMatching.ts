import type { DurationSeconds, EntityId, RoutePattern, RuntimeAssignment, RuntimeBand, RuntimeProfile } from './types';

/** Decision 0049. Matching is derived from stored profiles and is never stored. */
export type SegmentKey = string; // `${fromNodeId}>${toNodeId}`
export type SegmentSkipReason = 'ambiguous' | 'bandMismatch' | 'noMatchingSegment' | 'unassigned' | 'conflict';

export interface SegmentCellChange {
  profileId: EntityId; patternId: EntityId; bandId: EntityId; segmentIndex: number;
  previousSeconds: DurationSeconds; nextSeconds: DurationSeconds;
  sourceProfileId: EntityId;
}
export interface SegmentSkip {
  profileId: EntityId; patternId: EntityId; reason: SegmentSkipReason;
  bandId?: EntityId; segmentIndex?: number;
  /** For `conflict`: each distinct value and the profiles that hold it. */
  candidates?: { seconds: DurationSeconds; profileIds: EntityId[] }[];
}
export interface SegmentRuntimePlan {
  mode: 'copyToOthers' | 'fillFromOthers';
  sourceProfileId: EntityId; // the open profile in both modes
  changes: SegmentCellChange[];
  skips: SegmentSkip[];
  /** Profiles that would receive at least one change, with change counts, for the dialog. */
  affectedProfiles: { profileId: EntityId; patternId: EntityId; changeCount: number; overwriteCount: number; fillCount: number }[];
}

export interface SegmentRuntimePlanInput {
  openProfile: RuntimeProfile;
  /** The Route's Patterns. */
  patterns: RoutePattern[];
  /** The Route's Runtime profiles. */
  profiles: RuntimeProfile[];
  /** The Scenario's Runtime assignments. */
  assignments: RuntimeAssignment[];
  /** Copy only: profiles left out of the plan. */
  excludedProfileIds?: readonly EntityId[];
}

function orderedPoints(pattern: RoutePattern) { return [...pattern.points].sort((left, right) => left.sequence - right.sequence); }

/** One key per segment, in point order. */
export function segmentKeys(pattern: RoutePattern): SegmentKey[] {
  const points = orderedPoints(pattern);
  return points.slice(1).map((point, index) => `${points[index].nodeId}>${point.nodeId}`);
}

/** Rules 1 and 4: other Patterns' profiles of the Route that share at least one Service day assignment with the open profile. */
export function qualifyingProfiles(open: RuntimeProfile, profiles: RuntimeProfile[], assignments: RuntimeAssignment[]): RuntimeProfile[] {
  const days = new Set(assignments.filter((assignment) => assignment.runtimeProfileId === open.id).map((assignment) => assignment.serviceDayId));
  return profiles.filter((profile) => profile.id !== open.id && profile.routeId === open.routeId && profile.scenarioId === open.scenarioId && profile.patternId !== open.patternId
    && assignments.some((assignment) => assignment.runtimeProfileId === profile.id && days.has(assignment.serviceDayId)));
}

function keyIndexes(keys: SegmentKey[]): Map<SegmentKey, number[]> {
  const indexes = new Map<SegmentKey, number[]>();
  keys.forEach((key, index) => indexes.set(key, [...(indexes.get(key) ?? []), index]));
  return indexes;
}

function sameBand(left: RuntimeBand, right: RuntimeBand): boolean { return left.startTime === right.startTime && left.endTime === right.endTime; }

interface PairMatch {
  /** Segment index pairs `[open, other]` that match and are not ambiguous. */
  segments: Array<[number, number]>;
  /** Band pairs `[open, other]` with the same start and end time. */
  bands: Array<[RuntimeBand, RuntimeBand]>;
  skips: SegmentSkip[];
}

/** Matches the open profile against one other profile. `skipProfile` names the profile the skips are reported on. */
function matchPair(open: RuntimeProfile, openPattern: RoutePattern, other: RuntimeProfile, otherPattern: RoutePattern, skipProfile: RuntimeProfile): PairMatch {
  const openIndexes = keyIndexes(segmentKeys(openPattern));
  const otherIndexes = keyIndexes(segmentKeys(otherPattern));
  const segments: Array<[number, number]> = [];
  const skips: SegmentSkip[] = [];
  for (const [key, otherAt] of otherIndexes) {
    const openAt = openIndexes.get(key);
    if (!openAt) continue;
    if (openAt.length > 1 || otherAt.length > 1) { skips.push({ profileId: skipProfile.id, patternId: skipProfile.patternId, reason: 'ambiguous', segmentIndex: otherAt[0] }); continue; }
    segments.push([openAt[0], otherAt[0]]);
  }
  segments.sort((left, right) => left[1] - right[1]);
  const bands: Array<[RuntimeBand, RuntimeBand]> = [];
  if (segments.length) {
    const orderedBands = (profile: RuntimeProfile) => [...profile.bands].sort((left, right) => left.startTime - right.startTime || left.endTime - right.endTime || left.sequence - right.sequence);
    const otherBands = orderedBands(other);
    const matchedOther = new Set<EntityId>();
    for (const band of orderedBands(open)) {
      const counterpart = otherBands.find((candidate) => sameBand(band, candidate));
      if (counterpart) { bands.push([band, counterpart]); matchedOther.add(counterpart.id); } else skips.push({ profileId: skipProfile.id, patternId: skipProfile.patternId, reason: 'bandMismatch', bandId: band.id });
    }
    for (const band of otherBands) if (!matchedOther.has(band.id) && !openBandsCover(open, band)) skips.push({ profileId: other.id, patternId: other.patternId, reason: 'bandMismatch', bandId: band.id });
  }
  return { segments, bands, skips };
}

function openBandsCover(open: RuntimeProfile, band: RuntimeBand): boolean { return open.bands.some((candidate) => sameBand(candidate, band)); }

interface Context {
  patternById: Map<EntityId, RoutePattern>;
  patternRank: Map<EntityId, number>;
  profileById: Map<EntityId, RuntimeProfile>;
  bandStart: Map<EntityId, number>;
}

function context(input: SegmentRuntimePlanInput): Context {
  const patternRank = new Map<EntityId, number>();
  [...input.patterns].sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)).forEach((pattern, index) => patternRank.set(pattern.id, index));
  const bandStart = new Map<EntityId, number>();
  for (const profile of [input.openProfile, ...input.profiles]) for (const band of profile.bands) bandStart.set(band.id, band.startTime);
  return { patternById: new Map(input.patterns.map((pattern) => [pattern.id, pattern])), patternRank, profileById: new Map([input.openProfile, ...input.profiles].map((profile) => [profile.id, profile])), bandStart };
}

function finish(mode: SegmentRuntimePlan['mode'], input: SegmentRuntimePlanInput, changes: SegmentCellChange[], skips: SegmentSkip[]): SegmentRuntimePlan {
  const ctx = context(input);
  const rank = (patternId: EntityId) => ctx.patternRank.get(patternId) ?? Number.MAX_SAFE_INTEGER;
  const name = (profileId: EntityId) => ctx.profileById.get(profileId)?.name ?? '';
  const sortedChanges = [...changes].sort((left, right) => rank(left.patternId) - rank(right.patternId) || name(left.profileId).localeCompare(name(right.profileId)) || left.profileId.localeCompare(right.profileId) || (ctx.bandStart.get(left.bandId) ?? 0) - (ctx.bandStart.get(right.bandId) ?? 0) || left.segmentIndex - right.segmentIndex);
  const sortedSkips = [...skips].sort((left, right) => rank(left.patternId) - rank(right.patternId) || name(left.profileId).localeCompare(name(right.profileId)) || left.profileId.localeCompare(right.profileId) || left.reason.localeCompare(right.reason) || (ctx.bandStart.get(left.bandId ?? '') ?? 0) - (ctx.bandStart.get(right.bandId ?? '') ?? 0) || (left.segmentIndex ?? 0) - (right.segmentIndex ?? 0));
  const affected = new Map<EntityId, SegmentRuntimePlan['affectedProfiles'][number]>();
  for (const change of sortedChanges) {
    const entry = affected.get(change.profileId) ?? { profileId: change.profileId, patternId: change.patternId, changeCount: 0, overwriteCount: 0, fillCount: 0 };
    entry.changeCount += 1;
    if (change.previousSeconds === 0) entry.fillCount += 1; else entry.overwriteCount += 1;
    affected.set(change.profileId, entry);
  }
  return { mode, sourceProfileId: input.openProfile.id, changes: sortedChanges, skips: sortedSkips, affectedProfiles: [...affected.values()] };
}

function unassignedSkips(input: SegmentRuntimePlanInput, candidates: RuntimeProfile[]): SegmentSkip[] {
  return candidates.filter((profile) => !input.assignments.some((assignment) => assignment.runtimeProfileId === profile.id)).map((profile) => ({ profileId: profile.id, patternId: profile.patternId, reason: 'unassigned' as const }));
}

function otherPatternProfiles(input: SegmentRuntimePlanInput): RuntimeProfile[] {
  return input.profiles.filter((profile) => profile.id !== input.openProfile.id && profile.routeId === input.openProfile.routeId && profile.scenarioId === input.openProfile.scenarioId && profile.patternId !== input.openProfile.patternId);
}

/** Rules 2 to 9 for "Copy segments to other patterns": the open profile's values replace matching cells of other profiles. */
export function planCopyToOthers(input: SegmentRuntimePlanInput): SegmentRuntimePlan {
  const { openProfile } = input;
  const ctx = context(input);
  const openPattern = ctx.patternById.get(openProfile.patternId);
  const excluded = new Set(input.excludedProfileIds ?? []);
  const others = otherPatternProfiles(input).filter((profile) => !excluded.has(profile.id));
  const changes: SegmentCellChange[] = [];
  const skips: SegmentSkip[] = [];
  if (!openPattern) return finish('copyToOthers', input, changes, skips);
  skips.push(...unassignedSkips(input, others));
  for (const target of qualifyingProfiles(openProfile, others, input.assignments)) {
    const targetPattern = ctx.patternById.get(target.patternId);
    if (!targetPattern) continue;
    const match = matchPair(openProfile, openPattern, target, targetPattern, target);
    skips.push(...match.skips);
    for (const [openBand, targetBand] of match.bands) {
      for (const [openIndex, targetIndex] of match.segments) {
        const nextSeconds = openBand.segmentRuntimeSeconds[openIndex];
        const previousSeconds = targetBand.segmentRuntimeSeconds[targetIndex];
        if (nextSeconds === undefined || previousSeconds === undefined || nextSeconds === previousSeconds) continue;
        changes.push({ profileId: target.id, patternId: target.patternId, bandId: targetBand.id, segmentIndex: targetIndex, previousSeconds, nextSeconds, sourceProfileId: openProfile.id });
      }
    }
  }
  return finish('copyToOthers', input, changes, skips);
}

/** Rules 2 to 9 for "Fill from other patterns": only `0` cells of the open profile are written. */
export function planFillFromOthers(input: SegmentRuntimePlanInput): SegmentRuntimePlan {
  const { openProfile } = input;
  const ctx = context(input);
  const openPattern = ctx.patternById.get(openProfile.patternId);
  const changes: SegmentCellChange[] = [];
  const skips: SegmentSkip[] = [];
  if (!openPattern) return finish('fillFromOthers', input, changes, skips);
  const others = otherPatternProfiles(input);
  skips.push(...unassignedSkips(input, others));
  if (!input.assignments.some((assignment) => assignment.runtimeProfileId === openProfile.id)) skips.push({ profileId: openProfile.id, patternId: openProfile.patternId, reason: 'unassigned' });
  // key `${openBandId}:${openSegmentIndex}` -> value -> source profiles
  const found = new Map<string, { bandId: EntityId; segmentIndex: number; values: Map<DurationSeconds, EntityId[]> }>();
  for (const source of qualifyingProfiles(openProfile, others, input.assignments)) {
    const sourcePattern = ctx.patternById.get(source.patternId);
    if (!sourcePattern) continue;
    const match = matchPair(openProfile, openPattern, source, sourcePattern, source);
    skips.push(...match.skips);
    for (const [openBand, sourceBand] of match.bands) {
      for (const [openIndex, sourceIndex] of match.segments) {
        const seconds = sourceBand.segmentRuntimeSeconds[sourceIndex];
        if (openBand.segmentRuntimeSeconds[openIndex] !== 0 || !seconds) continue;
        const key = `${openBand.id}:${openIndex}`;
        const entry = found.get(key) ?? { bandId: openBand.id, segmentIndex: openIndex, values: new Map() };
        entry.values.set(seconds, [...(entry.values.get(seconds) ?? []), source.id]);
        found.set(key, entry);
      }
    }
  }
  for (const entry of found.values()) {
    if (entry.values.size === 1) {
      const [[nextSeconds, sourceIds]] = [...entry.values];
      changes.push({ profileId: openProfile.id, patternId: openProfile.patternId, bandId: entry.bandId, segmentIndex: entry.segmentIndex, previousSeconds: 0, nextSeconds, sourceProfileId: sourceIds[0] });
    } else {
      skips.push({ profileId: openProfile.id, patternId: openProfile.patternId, reason: 'conflict', bandId: entry.bandId, segmentIndex: entry.segmentIndex, candidates: [...entry.values].map(([seconds, profileIds]) => ({ seconds, profileIds })).sort((left, right) => left.seconds - right.seconds) });
    }
  }
  return finish('fillFromOthers', input, changes, skips);
}

/** The profiles the plan changes, with new segment arrays. Revisions and timestamps are set by the application layer. */
export function applySegmentRuntimePlan(profiles: RuntimeProfile[], plan: SegmentRuntimePlan): RuntimeProfile[] {
  const changedIds = new Set(plan.changes.map((change) => change.profileId));
  return profiles.filter((profile) => changedIds.has(profile.id)).map((profile) => ({
    ...profile,
    bands: profile.bands.map((band) => {
      const bandChanges = plan.changes.filter((change) => change.profileId === profile.id && change.bandId === band.id);
      if (!bandChanges.length) return band;
      const segmentRuntimeSeconds = [...band.segmentRuntimeSeconds];
      for (const change of bandChanges) segmentRuntimeSeconds[change.segmentIndex] = change.nextSeconds;
      return { ...band, segmentRuntimeSeconds };
    }),
  }));
}
