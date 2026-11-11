import type { DurationSeconds, EntityId, RoutePattern, RuntimeAssignment, RuntimeBand, RuntimeProfile } from './types';

/** Decision 0049. Matching is derived from stored profiles and is never stored. */
export type SegmentKey = string; // `${fromNodeId}>${toNodeId}`
export type SegmentSkipReason = 'ambiguous' | 'bandMismatch' | 'noMatchingSegment' | 'unassigned' | 'conflict' | 'otherServiceDays' | 'emptySource' | 'bandShared';
/** Decision 0074 item 1. Other profile id to open band id to the paired band of that profile, or `null` for none. */
export type BandPairs = Record<EntityId /* other profile id */, Record<EntityId /* open band id */, EntityId | null /* other band id, null = none */>>;

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
  /** Decision 0074 item 3. Without it the default pairing is used. */
  bandPairs?: BandPairs;
}

function orderedPoints(pattern: RoutePattern) { return [...pattern.points].sort((left, right) => left.sequence - right.sequence); }

function orderedBands(profile: RuntimeProfile): RuntimeBand[] { return [...profile.bands].sort((left, right) => left.startTime - right.startTime || left.endTime - right.endTime || left.sequence - right.sequence); }

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

/**
 * Decision 0074 item 1. For each band of `open`, the partner in each other profile is the identical band if there is one; otherwise
 * the band with the longest overlap, when that overlap is more than half of the open band's length and no other band ties it.
 */
export function defaultBandPairs(open: RuntimeProfile, others: RuntimeProfile[]): BandPairs {
  const pairs: BandPairs = {};
  for (const other of others) {
    const row: Record<EntityId, EntityId | null> = {};
    for (const band of open.bands) {
      const identical = other.bands.find((candidate) => sameBand(band, candidate));
      if (identical) { row[band.id] = identical.id; continue; }
      const overlaps = other.bands.map((candidate) => ({ id: candidate.id, overlap: Math.max(0, Math.min(band.endTime, candidate.endTime) - Math.max(band.startTime, candidate.startTime)) }));
      const longest = Math.max(0, ...overlaps.map((item) => item.overlap));
      const leaders = overlaps.filter((item) => item.overlap === longest);
      row[band.id] = longest * 2 > band.endTime - band.startTime && leaders.length === 1 ? leaders[0].id : null;
    }
    pairs[other.id] = row;
  }
  return pairs;
}

interface PairMatch {
  /** Segment index pairs `[open, other]` that match and are not ambiguous. */
  segments: Array<[number, number]>;
  /** Band pairs `[open, other]` from the band pairing. */
  bands: Array<[RuntimeBand, RuntimeBand]>;
  skips: SegmentSkip[];
}

/** Matches the open profile against one other profile. `skipProfile` names the profile the skips are reported on. */
function matchPair(open: RuntimeProfile, openPattern: RoutePattern, other: RuntimeProfile, otherPattern: RoutePattern, skipProfile: RuntimeProfile, bandPairs?: BandPairs, oneTargetPerBand = false): PairMatch {
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
  if (!segments.length) {
    skips.push({ profileId: skipProfile.id, patternId: skipProfile.patternId, reason: 'noMatchingSegment' });
  } else {
    const otherById = new Map(other.bands.map((band) => [band.id, band]));
    const pairs = (bandPairs ?? defaultBandPairs(open, [other]))[other.id];
    for (const band of orderedBands(open)) {
      const counterpart = otherById.get(pairs?.[band.id] ?? '');
      if (counterpart) bands.push([band, counterpart]); else skips.push({ profileId: skipProfile.id, patternId: skipProfile.patternId, reason: 'bandMismatch', bandId: band.id });
    }
    // Copy writes into the other band, so two open bands paired with one target band would each write the same cells and the last would win.
    // Such a target band is left out and reported. Fill reads from the other band, so several open bands may share one source band.
    if (oneTargetPerBand) {
      const claims = new Map<EntityId, number>();
      for (const [, counterpart] of bands) claims.set(counterpart.id, (claims.get(counterpart.id) ?? 0) + 1);
      const shared = new Set([...claims].filter(([, count]) => count > 1).map(([id]) => id));
      if (shared.size) {
        for (let index = bands.length - 1; index >= 0; index -= 1) if (shared.has(bands[index][1].id)) bands.splice(index, 1);
        for (const id of shared) skips.push({ profileId: other.id, patternId: other.patternId, reason: 'bandShared', bandId: id });
      }
    }
  }
  return { segments, bands, skips };
}

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

/** Decision 0074 item 4: assigned profiles that share no Service day with the open profile. */
function otherServiceDaySkips(input: SegmentRuntimePlanInput, candidates: RuntimeProfile[], qualifying: RuntimeProfile[]): SegmentSkip[] {
  const qualifyingIds = new Set(qualifying.map((profile) => profile.id));
  return candidates.filter((profile) => !qualifyingIds.has(profile.id) && input.assignments.some((assignment) => assignment.runtimeProfileId === profile.id))
    .map((profile) => ({ profileId: profile.id, patternId: profile.patternId, reason: 'otherServiceDays' as const }));
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
  const qualifying = qualifyingProfiles(openProfile, others, input.assignments);
  skips.push(...otherServiceDaySkips(input, others, qualifying));
  for (const target of qualifying) {
    const targetPattern = ctx.patternById.get(target.patternId);
    if (!targetPattern) continue;
    const match = matchPair(openProfile, openPattern, target, targetPattern, target, input.bandPairs, true);
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
  const qualifying = qualifyingProfiles(openProfile, others, input.assignments);
  skips.push(...otherServiceDaySkips(input, others, qualifying));
  // key `${openBandId}:${openSegmentIndex}` -> value -> source profiles
  const found = new Map<string, { bandId: EntityId; segmentIndex: number; values: Map<DurationSeconds, EntityId[]> }>();
  // Decision 0074 item 4: open `0` cells whose matched sources all hold `:00`.
  const zeroSourced = new Map<string, { bandId: EntityId; segmentIndex: number }>();
  for (const source of qualifying) {
    const sourcePattern = ctx.patternById.get(source.patternId);
    if (!sourcePattern) continue;
    const match = matchPair(openProfile, openPattern, source, sourcePattern, source, input.bandPairs);
    skips.push(...match.skips);
    for (const [openBand, sourceBand] of match.bands) {
      for (const [openIndex, sourceIndex] of match.segments) {
        const seconds = sourceBand.segmentRuntimeSeconds[sourceIndex];
        if (openBand.segmentRuntimeSeconds[openIndex] !== 0) continue;
        const key = `${openBand.id}:${openIndex}`;
        if (!seconds) { zeroSourced.set(key, { bandId: openBand.id, segmentIndex: openIndex }); continue; }
        const entry = found.get(key) ?? { bandId: openBand.id, segmentIndex: openIndex, values: new Map() };
        entry.values.set(seconds, [...(entry.values.get(seconds) ?? []), source.id]);
        found.set(key, entry);
      }
    }
  }
  for (const [key, cell] of zeroSourced) {
    if (!found.has(key)) skips.push({ profileId: openProfile.id, patternId: openProfile.patternId, reason: 'emptySource', bandId: cell.bandId, segmentIndex: cell.segmentIndex });
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
