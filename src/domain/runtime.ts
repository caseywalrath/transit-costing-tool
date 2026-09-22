import type {
  DurationSeconds,
  EntityId,
  RoutePattern,
  RuntimeAssignment,
  RuntimeBand,
  RuntimeProfile,
  ScheduledPoint,
  ServiceSeconds,
  ValidationFinding,
} from './types';
import { metadata, newId } from './ids';
export { formatRuntimeDuration, parseRuntimeDuration, RuntimeDurationError, formatRuntimeDurationSeconds, parseRuntimeDurationSeconds } from './durations';

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
  return JSON.stringify(orderedBands(profile).map((band) => ({ id: band.id, label: band.label, startTime: band.startTime, endTime: band.endTime, segmentRuntimeSeconds: band.segmentRuntimeSeconds })));
}

/** Apply the revision rule: band or segment changes increment, rename does not. */
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

/** Return segment miles derived from cumulative pattern miles. */
export function patternSegmentMiles(pattern: RoutePattern): number[] {
  return pattern.points.slice(1).map((point, index) => point.cumulativeMiles - pattern.points[index].cumulativeMiles);
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
): { stopTimes: ScheduledPoint[]; band: RuntimeBand } | { finding: ValidationFinding } {
  const resolution = resolveRuntimeForDeparture(profile, pattern, departure);
  if (!resolution.band || !resolution.segmentRuntimeSeconds) return { finding: resolution.finding! };
  let elapsed = 0;
  const stopTimes = pattern.points.map((point, sequence) => {
    if (sequence > 0) elapsed += resolution.segmentRuntimeSeconds![sequence - 1];
    return { patternPointId: point.id, sequence, time: departure + elapsed };
  });
  return { stopTimes, band: resolution.band };
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
  const sourceNodes = sourcePattern.points.map((point) => point.nodeId);
  const targetNodes = targetPattern.points.map((point) => point.nodeId);
  if (sourceNodes.length !== targetNodes.length || sourceNodes.some((nodeId, index) => nodeId !== targetNodes[targetNodes.length - index - 1])) {
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
