import type {
  DurationSeconds,
  EntityId,
  RoutePattern,
  RuntimeAssignment,
  RuntimeBand,
  RuntimeProfile,
  ScheduledPoint,
  ServiceSeconds,
  Trip,
  ValidationFinding,
} from './types';
import { metadata, newId } from './ids';
export { formatRuntimeDuration, parseRuntimeDuration, RuntimeDurationError } from './durations';

export interface RuntimeResolution {
  band?: RuntimeBand;
  segmentRuntimeSeconds?: DurationSeconds[];
  finding?: ValidationFinding;
}

export interface RuntimeProfileCopyTarget {
  scenarioId?: EntityId;
  routeId?: EntityId;
  patternId?: EntityId;
  name: string;
}

export class RuntimeProfileDeletionError extends Error {
  constructor(readonly profileId: EntityId, readonly assignmentIds: EntityId[], readonly serviceDayIds: EntityId[]) {
    super('Runtime profile is assigned to one or more service days; choose a replacement profile first.');
    this.name = 'RuntimeProfileDeletionError';
  }
}

/** Return the calculation revision used when no explicit revision was saved. */
export function runtimeCalculationRevision(profile: RuntimeProfile): number { return profile.calculationRevision ?? 0; }

function calculationShape(profile: RuntimeProfile): string {
  return JSON.stringify({ method: profile.calculationMethod ?? 'singleBand', bands: orderedBands(profile).map((band) => ({ id: band.id, startTime: band.startTime, endTime: band.endTime, segmentRuntimeSeconds: band.segmentRuntimeSeconds })) });
}

/** Apply the revision rule: band bound, segment, or method changes increment; a profile rename or a band label change does not (neither is a calculation input). */
export function withRuntimeCalculationRevision(previous: RuntimeProfile | undefined, next: RuntimeProfile): RuntimeProfile {
  if (!previous) return { ...next, calculationRevision: next.calculationRevision ?? 0 };
  const revision = runtimeCalculationRevision(previous) + (calculationShape(previous) === calculationShape(next) ? 0 : 1);
  return { ...next, calculationRevision: revision };
}

function finding(
  profile: RuntimeProfile,
  ruleId: string,
  messageKey: string,
  field?: string,
  parameters?: Record<string, string | number>,
): ValidationFinding {
  return {
    ruleId,
    severity: 'error',
    entityType: 'runtimeProfile',
    entityId: profile.id,
    ...(field ? { field } : {}),
    messageKey,
    ...(parameters ? { parameters } : {}),
  };
}

function compareBands(left: RuntimeBand, right: RuntimeBand): number {
  return left.startTime - right.startTime || left.endTime - right.endTime || left.sequence - right.sequence;
}

function orderedBands(profile: RuntimeProfile): RuntimeBand[] {
  return profile.bands
    .map((band, index) => ({ band, index }))
    .sort((left, right) => compareBands(left.band, right.band) || left.index - right.index)
    .map(({ band }) => band);
}

/** Return a stable ordering for bands and normalize their display sequence values. */
export function normalizeRuntimeProfile(profile: RuntimeProfile): RuntimeProfile {
  return {
    ...profile,
    bands: orderedBands(profile).map((band, sequence) => ({ ...band, sequence })),
  };
}

/** Select the half-open runtime band containing a trip's initial departure. */
export function selectRuntimeBand(profile: RuntimeProfile, departure: ServiceSeconds): RuntimeBand | undefined {
  return orderedBands(profile).find((band) => departure >= band.startTime && departure < band.endTime);
}

export interface SegmentBandContribution { bandId: string; bandLabel: string; seconds: number }
export interface BlendedSegment { segmentIndex: number; durationSeconds: number; contributions: SegmentBandContribution[] }

/** Resolve a segment-start band, including the nearest band at gaps and outer edges. */
export function resolveSegmentStartBand(profile: RuntimeProfile, time: ServiceSeconds): RuntimeBand | undefined {
  const bands = orderedBands(profile);
  return selectRuntimeBand(profile, time) ?? bands.reduce<RuntimeBand | undefined>((best, candidate) => {
    if (!best) return candidate;
    const distance = time < candidate.startTime ? candidate.startTime - time : time >= candidate.endTime ? time - candidate.endTime : 0;
    const bestDistance = time < best.startTime ? best.startTime - time : time >= best.endTime ? time - best.endTime : 0;
    // A tie (the exact midpoint of a gap) goes to the later band, as in the blend fallback (Decision 0033 item 1).
    return distance <= bestDistance ? candidate : best;
  }, undefined);
}

/** Use one band's duration for each segment, selected when that segment begins. */
export function segmentStartTimes(pattern: RoutePattern, departure: ServiceSeconds, profile: RuntimeProfile): { stopTimes: ScheduledPoint[]; segments: BlendedSegment[] } | { finding: ValidationFinding } {
  const bands = orderedBands(profile);
  if (!selectRuntimeBand(profile, departure)) return { finding: finding(profile, 'runtime.noApplicableBand', 'runtime.noApplicableBand', 'bands', { departure }) };
  if (bands.some((band) => band.segmentRuntimeSeconds.length !== pattern.points.length - 1)) return { finding: finding(profile, 'runtime.segmentCountMismatch', 'runtime.segmentCountMismatch', 'bands') };
  let time = departure;
  const stopTimes: ScheduledPoint[] = [{ patternPointId: pattern.points[0].id, sequence: 0, time }];
  const segments: BlendedSegment[] = [];
  for (let index = 0; index < pattern.points.length - 1; index += 1) {
    const band = resolveSegmentStartBand(profile, time)!;
    const durationSeconds = band.segmentRuntimeSeconds[index];
    if (!Number.isInteger(durationSeconds) || durationSeconds < 0) return { finding: finding(profile, 'runtime.segmentDurationInvalid', 'runtime.segmentDurationInvalid', 'bands') };
    time += durationSeconds;
    segments.push({ segmentIndex: index, durationSeconds, contributions: [{ bandId: band.id, bandLabel: band.label, seconds: durationSeconds }] });
    stopTimes.push({ patternPointId: pattern.points[index + 1].id, sequence: index + 1, time });
  }
  return { stopTimes, segments };
}

/** Integrate segment progress at each band's rate. At a gap, use the nearer band; outside the profile, use its edge band. */
export function blendSegmentTimes(pattern: RoutePattern, departure: ServiceSeconds, profile: RuntimeProfile): { stopTimes: ScheduledPoint[]; segments: BlendedSegment[] } | { finding: ValidationFinding } {
  const bands = orderedBands(profile);
  if (!selectRuntimeBand(profile, departure)) return { finding: finding(profile, 'runtime.noApplicableBand', 'runtime.noApplicableBand', 'bands', { departure }) };
  if (bands.some((band) => band.segmentRuntimeSeconds.length !== pattern.points.length - 1)) return { finding: finding(profile, 'runtime.segmentCountMismatch', 'runtime.segmentCountMismatch', 'bands') };
  const boundaries = [...new Set(bands.flatMap((band, index) => index === 0 ? [band.startTime, band.endTime] : [band.startTime, band.endTime, (bands[index - 1].endTime + band.startTime) / 2]))].sort((a, b) => a - b);
  const bandAt = (time: number): RuntimeBand => bands.find((band) => time >= band.startTime && time < band.endTime) ?? bands.reduce((best, band) => {
    const distance = time < band.startTime ? band.startTime - time : time >= band.endTime ? time - band.endTime : 0;
    const bestDistance = time < best.startTime ? best.startTime - time : time >= best.endTime ? time - best.endTime : 0;
    return distance < bestDistance ? band : best;
  });
  let time = departure;
  const stopTimes: ScheduledPoint[] = [{ patternPointId: pattern.points[0].id, sequence: 0, time: departure }];
  const segments: BlendedSegment[] = [];
  for (let index = 0; index < pattern.points.length - 1; index += 1) {
    const start = time;
    let progress = 0;
    const contributions: SegmentBandContribution[] = [];
    while (progress < 1 - 1e-10) {
      const band = bandAt(time + 1e-7);
      const runtime = band.segmentRuntimeSeconds[index];
      if (!Number.isFinite(runtime) || runtime < 0) return { finding: finding(profile, 'runtime.segmentDurationInvalid', 'runtime.segmentDurationInvalid', 'bands') };
      if (runtime === 0) break;
      const boundary = boundaries.find((value) => value > time + 1e-6) ?? Number.POSITIVE_INFINITY;
      const elapsed = Math.min((1 - progress) * runtime, boundary - time);
      const prior = contributions.at(-1);
      if (prior?.bandId === band.id) prior.seconds += elapsed;
      else contributions.push({ bandId: band.id, bandLabel: band.label, seconds: elapsed });
      time += elapsed;
      progress += elapsed / runtime;
    }
    time = Math.round(time);
    let assignedSeconds = 0;
    contributions.forEach((part, contributionIndex) => {
      part.seconds = contributionIndex === contributions.length - 1 ? time - start - assignedSeconds : Math.round(part.seconds);
      assignedSeconds += part.seconds;
    });
    segments.push({ segmentIndex: index, durationSeconds: time - start, contributions });
    stopTimes.push({ patternPointId: pattern.points[index + 1].id, sequence: index + 1, time });
  }
  return { stopTimes, segments };
}

/** Return the total runtime represented by one band’s segment durations. */
export function runtimeBandTotalSeconds(band: RuntimeBand): DurationSeconds {
  return band.segmentRuntimeSeconds.reduce((total, duration) => total + duration, 0);
}

/** Validate a complete pattern-specific runtime profile. */
export function validateRuntimeProfile(profile: RuntimeProfile, pattern: RoutePattern): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const expectedSegments = Math.max(0, pattern.points.length - 1);
  const bandIds = new Set<string>();

  if (!profile.name.trim()) findings.push(finding(profile, 'runtime.profileNameRequired', 'runtime.profileNameRequired', 'name'));
  if (profile.scenarioId !== pattern.scenarioId) findings.push(finding(profile, 'runtime.profileScenarioMismatch', 'runtime.profileScenarioMismatch', 'scenarioId'));
  if (profile.routeId !== pattern.routeId) findings.push(finding(profile, 'runtime.profileRouteMismatch', 'runtime.profileRouteMismatch', 'routeId'));
  if (profile.patternId !== pattern.id) findings.push(finding(profile, 'runtime.profilePatternMismatch', 'runtime.profilePatternMismatch', 'patternId'));
  if (profile.calculationRevision !== undefined && (!Number.isInteger(profile.calculationRevision) || profile.calculationRevision < 0)) findings.push(finding(profile, 'runtime.calculationRevisionInvalid', 'runtime.calculationRevisionInvalid', 'calculationRevision'));
  if (profile.calculationMethod !== undefined && profile.calculationMethod !== 'singleBand' && profile.calculationMethod !== 'blendSegments' && profile.calculationMethod !== 'segmentStart') findings.push(finding(profile, 'runtime.calculationMethodInvalid', 'runtime.calculationMethodInvalid', 'calculationMethod'));
  if (profile.bands.length === 0) findings.push(finding(profile, 'runtime.noBands', 'runtime.noBands', 'bands'));

  for (const band of profile.bands) {
    if (bandIds.has(band.id)) findings.push(finding(profile, 'runtime.duplicateBandId', 'runtime.duplicateBandId', 'bands'));
    bandIds.add(band.id);
    if (!band.label.trim()) findings.push(finding(profile, 'runtime.bandLabelRequired', 'runtime.bandLabelRequired', 'bands'));
    if (!Number.isInteger(band.sequence) || band.sequence < 0) findings.push(finding(profile, 'runtime.bandSequenceInvalid', 'runtime.bandSequenceInvalid', 'bands'));
    if (!Number.isInteger(band.startTime) || band.startTime < 0 || !Number.isInteger(band.endTime) || band.endTime <= band.startTime) {
      findings.push(finding(profile, 'runtime.bandBoundsInvalid', 'runtime.bandBoundsInvalid', 'bands'));
    }
    if (band.segmentRuntimeSeconds.length !== expectedSegments) {
      findings.push(finding(profile, 'runtime.segmentCountMismatch', 'runtime.segmentCountMismatch', 'bands', { expected: expectedSegments, actual: band.segmentRuntimeSeconds.length }));
    }
    band.segmentRuntimeSeconds.forEach((duration) => {
      if (!Number.isInteger(duration) || duration < 0) findings.push(finding(profile, 'runtime.segmentDurationInvalid', 'runtime.segmentDurationInvalid', 'bands'));
    });
  }

  const bandsByTime = orderedBands(profile);
  for (let index = 1; index < bandsByTime.length; index += 1) {
    const previous = bandsByTime[index - 1];
    const current = bandsByTime[index];
    if (previous.endTime > current.startTime) {
      findings.push(finding(profile, 'runtime.bandOverlap', 'runtime.bandOverlap', 'bands', { previousBandId: previous.id, bandId: current.id }));
    }
  }
  return findings;
}

/** Validate assignment ownership and uniqueness for a set of assignments. */
export function validateRuntimeAssignments(assignments: RuntimeAssignment[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const keys = new Map<string, RuntimeAssignment>();
  const ids = new Set<string>();
  for (const assignment of assignments) {
    if (ids.has(assignment.id)) {
      findings.push({ ruleId: 'runtime.assignmentDuplicateId', severity: 'error', entityType: 'runtimeAssignment', entityId: assignment.id, messageKey: 'runtime.assignmentDuplicateId' });
    }
    ids.add(assignment.id);
    const key = `${assignment.patternId}:${assignment.serviceDayId}`;
    const existing = keys.get(key);
    if (existing) {
      findings.push({ ruleId: 'runtime.assignmentNotUnique', severity: 'error', entityType: 'runtimeAssignment', entityId: assignment.id, field: 'runtimeProfileId', messageKey: 'runtime.assignmentNotUnique', parameters: { existingAssignmentId: existing.id } });
    } else {
      keys.set(key, assignment);
    }
  }
  return findings;
}

/** Validate one assignment against the pattern and profile it references. */
export function validateRuntimeAssignment(
  assignment: RuntimeAssignment,
  pattern: RoutePattern,
  profile: RuntimeProfile,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (assignment.scenarioId !== pattern.scenarioId || assignment.scenarioId !== profile.scenarioId) {
    findings.push({ ruleId: 'runtime.assignmentScenarioMismatch', severity: 'error', entityType: 'runtimeAssignment', entityId: assignment.id, field: 'scenarioId', messageKey: 'runtime.assignmentScenarioMismatch' });
  }
  if (assignment.patternId !== pattern.id || profile.patternId !== pattern.id) {
    findings.push({ ruleId: 'runtime.assignmentPatternMismatch', severity: 'error', entityType: 'runtimeAssignment', entityId: assignment.id, field: 'patternId', messageKey: 'runtime.assignmentPatternMismatch' });
  }
  if (assignment.runtimeProfileId !== profile.id) {
    findings.push({ ruleId: 'runtime.assignmentProfileMismatch', severity: 'error', entityType: 'runtimeAssignment', entityId: assignment.id, field: 'runtimeProfileId', messageKey: 'runtime.assignmentProfileMismatch' });
  }
  return findings;
}

/** Resolve the runtime band and segment values for one trip departure. */
export function resolveRuntimeForDeparture(
  profile: RuntimeProfile,
  pattern: RoutePattern,
  departure: ServiceSeconds,
): RuntimeResolution {
  const band = selectRuntimeBand(profile, departure);
  if (!band) {
    return {
      finding: finding(profile, 'runtime.noApplicableBand', 'runtime.noApplicableBand', 'bands', { departure }),
    };
  }
  if (band.segmentRuntimeSeconds.length !== Math.max(0, pattern.points.length - 1)) {
    return {
      band,
      finding: finding(profile, 'runtime.segmentCountMismatch', 'runtime.segmentCountMismatch', 'bands', { expected: Math.max(0, pattern.points.length - 1), actual: band.segmentRuntimeSeconds.length }),
    };
  }
  return { band, segmentRuntimeSeconds: [...band.segmentRuntimeSeconds] };
}

/** Propagate a departure through a pattern using the resolved segment runtimes. */
export function propagatePatternTimes(
  pattern: RoutePattern,
  departure: ServiceSeconds,
  profile: RuntimeProfile,
): { stopTimes: ScheduledPoint[]; band: RuntimeBand; segments?: BlendedSegment[] } | { finding: ValidationFinding } {
  if (profile.calculationMethod === 'segmentStart') {
    const segmented = segmentStartTimes(pattern, departure, profile);
    if ('finding' in segmented) return segmented;
    return { ...segmented, band: selectRuntimeBand(profile, departure)! };
  }
  if (profile.calculationMethod === 'blendSegments') {
    const blended = blendSegmentTimes(pattern, departure, profile);
    if ('finding' in blended) return blended;
    return { ...blended, band: selectRuntimeBand(profile, departure)! };
  }
  const resolution = resolveRuntimeForDeparture(profile, pattern, departure);
  if (!resolution.band || !resolution.segmentRuntimeSeconds) return { finding: resolution.finding! };
  return { stopTimes: propagatePatternTimesWithBand(pattern, departure, resolution.band), band: resolution.band };
}

/** Propagate times using a band selected by an anchored-regeneration exception. */
export function propagatePatternTimesWithBand(pattern: RoutePattern, departure: ServiceSeconds, band: RuntimeBand): ScheduledPoint[] {
  let elapsed = 0;
  return pattern.points.map((point, sequence) => {
    if (sequence > 0) elapsed += band.segmentRuntimeSeconds[sequence - 1];
    return { patternPointId: point.id, sequence, time: departure + elapsed };
  });
}

/** Create an independent profile copy with new profile and band identifiers. */
export function copyRuntimeProfile(
  profile: RuntimeProfile,
  target: RuntimeProfileCopyTarget,
  now = new Date().toISOString(),
): RuntimeProfile {
  if (!target.name.trim()) throw new Error('Runtime profile name is required');
  return {
    ...profile,
    ...metadata(now),
    id: newId(),
    scenarioId: target.scenarioId ?? profile.scenarioId,
    routeId: target.routeId ?? profile.routeId,
    patternId: target.patternId ?? profile.patternId,
    name: target.name.trim(),
    calculationRevision: 0,
    calculationMethod: profile.calculationMethod ?? 'singleBand',
    bands: profile.bands.map((band) => ({ ...band, id: newId(), segmentRuntimeSeconds: [...band.segmentRuntimeSeconds] })),
  };
}

/** Create an independent profile for a reverse-compatible pattern. */
export function reverseCopyRuntimeProfile(
  profile: RuntimeProfile,
  sourcePattern: RoutePattern,
  targetPattern: RoutePattern,
  name?: string,
  now = new Date().toISOString(),
): RuntimeProfile {
  if (!name?.trim()) throw new Error('Runtime profile name is required');
  if (!patternsMirrorNodes(sourcePattern, targetPattern)) {
    throw new Error('Cannot reverse-copy runtime profile to an incompatible pattern');
  }
  const copied = copyRuntimeProfile(profile, {
    scenarioId: targetPattern.scenarioId,
    routeId: targetPattern.routeId,
    patternId: targetPattern.id,
    name: name.trim(),
  }, now);
  return { ...copied, bands: copied.bands.map((band) => ({ ...band, segmentRuntimeSeconds: [...band.segmentRuntimeSeconds].reverse() })) };
}

/** True when the two Patterns visit the same nodes in opposite order, which is what a reverse copy of a Runtime profile needs. */
function patternsMirrorNodes(source: RoutePattern, target: RoutePattern): boolean {
  return source.points.length === target.points.length && source.points.every((point, index) => point.nodeId === target.points[target.points.length - index - 1].nodeId);
}

/** The other Patterns that a Runtime profile of `selected` can be reverse-copied to. A Pattern is never its own candidate. */
export function reverseRuntimeCandidates(selected: RoutePattern | undefined, patterns: RoutePattern[]): RoutePattern[] {
  return selected ? patterns.filter((candidate) => candidate.id !== selected.id && patternsMirrorNodes(selected, candidate)) : [];
}

/** Adds an empty band (no time span, a zero runtime for each of `segmentCount` segments) after the last one. */
export function addRuntimeBand(profile: RuntimeProfile, segmentCount: number): RuntimeProfile {
  const band: RuntimeBand = { id: newId(), label: 'Time period', sequence: profile.bands.length, startTime: 0, endTime: 0, segmentRuntimeSeconds: Array(Math.max(0, segmentCount)).fill(0) };
  return { ...profile, bands: [...profile.bands, band] };
}

export function updateRuntimeBand(profile: RuntimeProfile, index: number, patch: Partial<RuntimeBand>): RuntimeProfile {
  return { ...profile, bands: profile.bands.map((band, bandIndex) => bandIndex === index ? { ...band, ...patch } : band) };
}

/** Copies a band to the position after it, with a new id and its own runtimes, and renumbers the bands. */
export function duplicateRuntimeBand(profile: RuntimeProfile, index: number): RuntimeProfile {
  const source = profile.bands[index];
  if (!source) return profile;
  const copy: RuntimeBand = { ...source, id: newId(), segmentRuntimeSeconds: [...source.segmentRuntimeSeconds] };
  const bands = [...profile.bands.slice(0, index + 1), copy, ...profile.bands.slice(index + 1)];
  return { ...profile, bands: bands.map((band, sequence) => ({ ...band, sequence })) };
}

export function removeRuntimeBand(profile: RuntimeProfile, index: number): RuntimeProfile {
  return { ...profile, bands: profile.bands.filter((_, bandIndex) => bandIndex !== index).map((band, sequence) => ({ ...band, sequence })) };
}

/** One parsed row of pasted runtimes. */
export interface PastedRuntimeRow { bandLabel?: string; startTime: ServiceSeconds; endTime: ServiceSeconds; segmentRuntimeSeconds: DurationSeconds[]; calculationMethod?: RuntimeProfile['calculationMethod'] }

/**
 * The profile that applying pasted rows gives. Replace turns the rows into the complete profile (a row keeps the id of the band at its
 * position, so a later save updates that band) and takes the calculation method the rows name, else keeps the profile's. Append adds the
 * rows after the current bands and never changes the method (finding 4-025). `bands` are the pasted bands; `pastedMethod` is the method
 * the rows named, which Append ignores.
 */
export function applyPastedRuntimeRows(base: RuntimeProfile, rows: PastedRuntimeRow[], mode: 'replace' | 'append'): { profile: RuntimeProfile; bands: RuntimeBand[]; pastedMethod?: RuntimeProfile['calculationMethod'] } {
  const firstSequence = mode === 'append' ? base.bands.length : 0;
  const bands = rows.map((row, index): RuntimeBand => {
    const sequence = firstSequence + index;
    const existing = mode === 'replace' ? base.bands[index] : undefined;
    return { id: existing?.id ?? newId(), label: row.bandLabel ?? existing?.label ?? `Time period ${sequence + 1}`, sequence, startTime: row.startTime, endTime: row.endTime, segmentRuntimeSeconds: [...row.segmentRuntimeSeconds] };
  });
  const pastedMethod = rows.find((row) => row.calculationMethod)?.calculationMethod;
  const calculationMethod = mode === 'replace' ? pastedMethod ?? base.calculationMethod : base.calculationMethod;
  const profile: RuntimeProfile = { ...base, ...(calculationMethod ? { calculationMethod } : {}), bands: mode === 'append' ? [...base.bands, ...bands] : bands };
  return { profile, bands: mode === 'append' ? bands : profile.bands, ...(pastedMethod ? { pastedMethod } : {}) };
}

/**
 * What the Trips table shades a Trip's run-time cells with when "Show runtime bands" is on. A single-band profile names the band that
 * holds the departure. A segment-start or blended profile gives each segment's band contributions, but only when the Trip's stored times
 * are the ones the profile calculates and the Trip is not marked as having changed runtimes; otherwise there is nothing to shade.
 */
export function describeTripBandShading(trip: Trip, pattern: RoutePattern | undefined, profile: RuntimeProfile | undefined, runtimeChanged: boolean): { singleBand?: RuntimeBand; segments?: BlendedSegment[] } {
  const departure = trip.stopTimes[0]?.time;
  if (!profile || departure === undefined) return {};
  if (profile.calculationMethod !== 'blendSegments' && profile.calculationMethod !== 'segmentStart') {
    const singleBand = selectRuntimeBand(profile, departure);
    return singleBand ? { singleBand } : {};
  }
  if (!pattern || runtimeChanged) return {};
  const calculated = profile.calculationMethod === 'segmentStart' ? segmentStartTimes(pattern, departure, profile) : blendSegmentTimes(pattern, departure, profile);
  return 'segments' in calculated && calculated.stopTimes.every((point, index) => point.time === trip.stopTimes[index]?.time) ? { segments: calculated.segments } : {};
}
