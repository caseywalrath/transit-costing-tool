import type {
  Block,
  EntityId,
  RoutePattern,
  RuntimeAssignment,
  RuntimeProfile,
  ServiceDayDefinition,
  Trip,
  TripCalculationSource,
  ValidationFinding,
} from './types';
import { metadata, newId } from './ids';
import { adjustBlockReferences, type PatternChangePreview, previewPatternChange } from './trips';

export type RuntimeCopyMode = 'independent' | 'shared';

export interface RuntimeCopyRequest {
  scenarioId: EntityId;
  routeId: EntityId;
  sourceServiceDayId: EntityId;
  targetServiceDayId: EntityId;
  mode: RuntimeCopyMode;
}

export interface TripCopyRequest {
  scenarioId: EntityId;
  routeId: EntityId;
  tripProfileId: EntityId;
  sourceServiceDayId: EntityId;
  targetServiceDayId: EntityId;
  /** Empty source schedules are destructive only when this is explicitly true. */
  allowEmptySource: boolean;
}

export interface BatchPatternChangeRequest {
  tripIds: EntityId[];
  targetPatternId: EntityId;
}

export interface CopySourceSignature {
  kind: 'runtime-copy' | 'trip-copy' | 'batch-pattern-change' | 'trip-shift';
  value: string;
}

export interface RuntimeCopyImpact {
  sourceAssignmentCount: number;
  targetAssignmentCount: number;
  targetAssignmentsReplaced: number;
  profilesCreated: number;
  profilesShared: number;
  unresolvedPatternIds: string[];
  targetTripIdsWithChangedCalculationSource: string[];
}

export interface RuntimeCopyPreview {
  request: RuntimeCopyRequest;
  sourceSignature: CopySourceSignature;
  profiles: RuntimeProfile[];
  assignments: RuntimeAssignment[];
  replaceAssignmentIds: string[];
  impact: RuntimeCopyImpact;
  findings: ValidationFinding[];
}

export interface TripCopyCount {
  directionId?: string;
  patternId: string;
  count: number;
}

export interface TripCopyImpact {
  sourceTripCount: number;
  targetTripCount: number;
  copiedTripCount: number;
  targetTripsReplaced: number;
  sourceCounts: TripCopyCount[];
  targetCounts: TripCopyCount[];
  manuallyAdjustedTargetTripIds: string[];
  staleTargetTripIds: string[];
  missingTargetRuntimeAssignmentPatternIds: string[];
  affectedBlockIds: string[];
  removedBlockActivityCount: number;
  requiresExplicitEmptySourceReview: boolean;
}

export interface TripCopyPreview {
  request: TripCopyRequest;
  sourceSignature: CopySourceSignature;
  copiedTrips: Trip[];
  removedTripIds: string[];
  adjustedBlocks: Block[];
  impact: TripCopyImpact;
  findings: ValidationFinding[];
}

export interface BatchPatternChangePreview {
  request: BatchPatternChangeRequest;
  sourceSignature: CopySourceSignature;
  changes: PatternChangePreview[];
  eligibleTripIds: string[];
  ineligibleTripIds: string[];
  affectedBlockIds: string[];
  findings: ValidationFinding[];
}

function finding(entityType: string, entityId: string, ruleId: string, messageKey: string, field?: string, parameters?: Record<string, string | number>): ValidationFinding {
  return { ruleId, severity: 'error', entityType, entityId, ...(field ? { field } : {}), messageKey, ...(parameters ? { parameters } : {}) };
}

function required(value: string, entityType: string, entityId: string, field: string, ruleId: string, messageKey: string): ValidationFinding | undefined {
  return value.trim() ? undefined : finding(entityType, entityId, ruleId, messageKey, field);
}

export function validateRuntimeCopyRequest(request: RuntimeCopyRequest): ValidationFinding[] {
  const findings = [
    required(request.scenarioId, 'runtimeCopy', request.routeId || 'runtime-copy', 'scenarioId', 'runtimeCopy.scenarioRequired', 'runtimeCopy.scenarioRequired'),
    required(request.routeId, 'runtimeCopy', request.routeId || 'runtime-copy', 'routeId', 'runtimeCopy.routeRequired', 'runtimeCopy.routeRequired'),
    required(request.sourceServiceDayId, 'runtimeCopy', request.routeId || 'runtime-copy', 'sourceServiceDayId', 'runtimeCopy.sourceDayRequired', 'runtimeCopy.sourceDayRequired'),
    required(request.targetServiceDayId, 'runtimeCopy', request.routeId || 'runtime-copy', 'targetServiceDayId', 'runtimeCopy.targetDayRequired', 'runtimeCopy.targetDayRequired'),
  ].filter((item): item is ValidationFinding => Boolean(item));
  if (request.sourceServiceDayId && request.sourceServiceDayId === request.targetServiceDayId) findings.push(finding('runtimeCopy', request.routeId || 'runtime-copy', 'runtimeCopy.sameDay', 'runtimeCopy.sameDay'));
  if (request.mode !== 'independent' && request.mode !== 'shared') findings.push(finding('runtimeCopy', request.routeId || 'runtime-copy', 'runtimeCopy.modeInvalid', 'runtimeCopy.modeInvalid', 'mode'));
  return findings;
}

export function validateTripCopyRequest(request: TripCopyRequest): ValidationFinding[] {
  const findings = [
    required(request.scenarioId, 'tripCopy', request.routeId || 'trip-copy', 'scenarioId', 'tripCopy.scenarioRequired', 'tripCopy.scenarioRequired'),
    required(request.routeId, 'tripCopy', request.routeId || 'trip-copy', 'routeId', 'tripCopy.routeRequired', 'tripCopy.routeRequired'),
    required(request.tripProfileId, 'tripCopy', request.routeId || 'trip-copy', 'tripProfileId', 'tripCopy.tripProfileRequired', 'tripCopy.tripProfileRequired'),
    required(request.sourceServiceDayId, 'tripCopy', request.routeId || 'trip-copy', 'sourceServiceDayId', 'tripCopy.sourceDayRequired', 'tripCopy.sourceDayRequired'),
    required(request.targetServiceDayId, 'tripCopy', request.routeId || 'trip-copy', 'targetServiceDayId', 'tripCopy.targetDayRequired', 'tripCopy.targetDayRequired'),
  ].filter((item): item is ValidationFinding => Boolean(item));
  if (request.sourceServiceDayId && request.sourceServiceDayId === request.targetServiceDayId) findings.push(finding('tripCopy', request.routeId || 'trip-copy', 'tripCopy.sameDay', 'tripCopy.sameDay'));
  return findings;
}

export function validateBatchPatternChangeRequest(request: BatchPatternChangeRequest): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!request.tripIds.length) findings.push(finding('batchPatternChange', 'batch-pattern-change', 'batchPatternChange.tripsRequired', 'batchPatternChange.tripsRequired', 'tripIds'));
  if (!request.targetPatternId.trim()) findings.push(finding('batchPatternChange', 'batch-pattern-change', 'batchPatternChange.patternRequired', 'batchPatternChange.patternRequired', 'targetPatternId'));
  return findings;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

export function createCopySourceSignature(kind: CopySourceSignature['kind'], value: unknown): CopySourceSignature {
  return { kind, value: JSON.stringify(canonicalize(value)) };
}

function profileCalculationSource(trip: Trip): TripCalculationSource | undefined {
  return trip.provenance.calculationSource ?? (trip.provenance.runtimeProfileId && trip.provenance.runtimeCalculationRevision !== undefined ? { runtimeProfileId: trip.provenance.runtimeProfileId, runtimeCalculationRevision: trip.provenance.runtimeCalculationRevision } : undefined);
}

function sorted<T extends { id: string }>(values: T[]): T[] { return [...values].sort((left, right) => left.id.localeCompare(right.id)); }

export function createRuntimeCopySignature(request: RuntimeCopyRequest, patterns: RoutePattern[], sourceAssignments: RuntimeAssignment[], targetAssignments: RuntimeAssignment[], profiles: RuntimeProfile[], targetTrips: Trip[]): CopySourceSignature {
  return createCopySourceSignature('runtime-copy', { request, patterns: sorted(patterns), sourceAssignments: sorted(sourceAssignments), targetAssignments: sorted(targetAssignments), profiles: sorted(profiles), targetTrips: sorted(targetTrips).map((trip) => ({ id: trip.id, patternId: trip.patternId, source: profileCalculationSource(trip), updatedAt: trip.updatedAt })) });
}

export function createTripCopySignature(request: TripCopyRequest, sourceTrips: Trip[], targetTrips: Trip[], targetBlocks: Block[], targetAssignments: RuntimeAssignment[], targetProfiles: RuntimeProfile[]): CopySourceSignature {
  return createCopySourceSignature('trip-copy', { request, sourceTrips: sorted(sourceTrips), targetTrips: sorted(targetTrips), targetBlocks: sorted(targetBlocks), targetAssignments: sorted(targetAssignments), targetProfiles: sorted(targetProfiles) });
}

export function createBatchPatternChangeSignature(request: BatchPatternChangeRequest, trips: Trip[], targetPattern: RoutePattern, assignments: RuntimeAssignment[], profiles: RuntimeProfile[]): CopySourceSignature {
  return createCopySourceSignature('batch-pattern-change', { request, trips: sorted(trips), targetPattern, assignments: sorted(assignments), profiles: sorted(profiles) });
}

export function copyRuntimeProfileForDay(source: RuntimeProfile, targetDay: ServiceDayDefinition, existingNames: Set<string>, now: string): RuntimeProfile {
  const base = `${source.name.trim() || 'Runtime'} (${targetDay.name.trim() || targetDay.kind})`;
  let name = base;
  let suffix = 2;
  while (existingNames.has(name.toLocaleLowerCase())) name = `${base} ${suffix++}`;
  existingNames.add(name.toLocaleLowerCase());
  return {
    ...source,
    id: newId(),
    name,
    bands: source.bands.map((band) => ({ ...band, id: newId(), segmentRuntimeSeconds: [...band.segmentRuntimeSeconds] })),
    ...metadata(now),
  };
}

export function buildRuntimeCopyPreview(
  request: RuntimeCopyRequest,
  sourceDay: ServiceDayDefinition,
  targetDay: ServiceDayDefinition,
  patterns: RoutePattern[],
  sourceAssignments: RuntimeAssignment[],
  targetAssignments: RuntimeAssignment[],
  profiles: RuntimeProfile[],
  targetTrips: Trip[],
  now: string,
): RuntimeCopyPreview {
  const findings = validateRuntimeCopyRequest(request);
  if (sourceDay.scenarioId !== request.scenarioId || targetDay.scenarioId !== request.scenarioId) findings.push(finding('runtimeCopy', request.routeId, 'runtimeCopy.dayScenarioMismatch', 'runtimeCopy.dayScenarioMismatch'));
  const usablePatterns = patterns.filter((pattern) => pattern.routeId === request.routeId && pattern.scenarioId === request.scenarioId && pattern.points.length >= 2).sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id));
  const sourceByPattern = new Map(sourceAssignments.map((assignment) => [assignment.patternId, assignment]));
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const unresolvedPatternIds: string[] = [];
  const resolved: Array<{ pattern: RoutePattern; assignment: RuntimeAssignment; profile: RuntimeProfile }> = [];
  for (const pattern of usablePatterns) {
    const assignment = sourceByPattern.get(pattern.id);
    const profile = assignment ? profileById.get(assignment.runtimeProfileId) : undefined;
    if (!assignment || !profile || profile.patternId !== pattern.id || profile.routeId !== request.routeId || profile.scenarioId !== request.scenarioId) {
      unresolvedPatternIds.push(pattern.id);
      findings.push(finding('pattern', pattern.id, 'runtimeCopy.sourceAssignmentUnresolved', 'runtimeCopy.sourceAssignmentUnresolved'));
      continue;
    }
    resolved.push({ pattern, assignment, profile });
  }
  const targetByPattern = new Map(targetAssignments.map((assignment) => [assignment.patternId, assignment]));
  const existingNames = new Set(profiles.filter((profile) => profile.scenarioId === request.scenarioId).map((profile) => profile.name.trim().toLocaleLowerCase()));
  const copiedProfiles: RuntimeProfile[] = [];
  const copiedAssignments = resolved.map(({ pattern, profile }) => {
    const copiedProfile = request.mode === 'independent' ? copyRuntimeProfileForDay(profile, targetDay, existingNames, now) : undefined;
    if (copiedProfile) copiedProfiles.push(copiedProfile);
    return { ...profileAssignment(pattern.id, request, copiedProfile?.id ?? profile.id, now) };
  });
  const targetProfileIds = new Map(copiedAssignments.map((assignment) => [assignment.patternId, assignment.runtimeProfileId]));
  const changedTripIds = targetTrips.filter((trip) => {
    const nextProfileId = targetProfileIds.get(trip.patternId);
    const source = profileCalculationSource(trip);
    return nextProfileId !== undefined && (source?.runtimeProfileId !== nextProfileId);
  }).map((trip) => trip.id);
  const sourceSignature = createRuntimeCopySignature(request, usablePatterns, sourceAssignments, targetAssignments, profiles, targetTrips);
  return {
    request,
    sourceSignature,
    profiles: copiedProfiles,
    assignments: copiedAssignments,
    replaceAssignmentIds: resolved.map(({ pattern }) => targetByPattern.get(pattern.id)?.id).filter((id): id is string => Boolean(id)),
    impact: {
      sourceAssignmentCount: sourceAssignments.length,
      targetAssignmentCount: targetAssignments.length,
      targetAssignmentsReplaced: resolved.filter(({ pattern }) => targetByPattern.has(pattern.id)).length,
      profilesCreated: copiedProfiles.length,
      profilesShared: request.mode === 'shared' ? resolved.length : 0,
      unresolvedPatternIds,
      targetTripIdsWithChangedCalculationSource: changedTripIds,
    },
    findings,
  };
}

function profileAssignment(patternId: string, request: RuntimeCopyRequest, runtimeProfileId: string, now: string): RuntimeAssignment {
  return { id: newId(), scenarioId: request.scenarioId, patternId, serviceDayId: request.targetServiceDayId, runtimeProfileId, ...metadata(now) };
}

function copyTrip(source: Trip, targetServiceDayId: string, now: string): Trip {
  return { ...source, id: newId(), serviceDayId: targetServiceDayId, stopTimes: source.stopTimes.map((point) => ({ ...point })), provenance: { ...source.provenance, manuallyChangedFields: [...source.provenance.manuallyChangedFields], ...(source.provenance.calculationSource ? { calculationSource: { ...source.provenance.calculationSource } } : {}) }, ...metadata(now) };
}

function tripCounts(trips: Trip[], patternsById: Map<string, RoutePattern>): TripCopyCount[] {
  const counts = new Map<string, TripCopyCount>();
  for (const trip of trips) {
    const directionId = patternsById.get(trip.patternId)?.directionId;
    const key = `${directionId ?? ''}:${trip.patternId}`;
    const current = counts.get(key) ?? { ...(directionId ? { directionId } : {}), patternId: trip.patternId, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()].sort((left, right) => (left.directionId ?? '').localeCompare(right.directionId ?? '') || left.patternId.localeCompare(right.patternId));
}

export function buildTripCopyPreview(
  request: TripCopyRequest,
  sourceDay: ServiceDayDefinition,
  targetDay: ServiceDayDefinition,
  patterns: RoutePattern[],
  sourceTrips: Trip[],
  targetTrips: Trip[],
  targetBlocks: Block[],
  targetAssignments: RuntimeAssignment[],
  targetProfiles: RuntimeProfile[],
  now: string,
): TripCopyPreview {
  const findings = validateTripCopyRequest(request);
  if (sourceDay.scenarioId !== request.scenarioId || targetDay.scenarioId !== request.scenarioId) findings.push(finding('tripCopy', request.routeId, 'tripCopy.dayScenarioMismatch', 'tripCopy.dayScenarioMismatch'));
  const routeSourceTrips = sourceTrips.filter((trip) => trip.routeId === request.routeId && trip.tripProfileId === request.tripProfileId && trip.scenarioId === request.scenarioId);
  const routeTargetTrips = targetTrips.filter((trip) => trip.routeId === request.routeId && trip.tripProfileId === request.tripProfileId && trip.scenarioId === request.scenarioId);
  if (!routeSourceTrips.length && !request.allowEmptySource) findings.push(finding('tripCopy', request.sourceServiceDayId, 'tripCopy.emptySourceRequiresExplicitClear', 'tripCopy.emptySourceRequiresExplicitClear'));
  const patternsById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const sourcePatternIds = new Set(routeSourceTrips.map((trip) => trip.patternId));
  const targetAssignmentByPattern = new Map(targetAssignments.map((assignment) => [assignment.patternId, assignment]));
  const targetProfilesById = new Map(targetProfiles.map((profile) => [profile.id, profile]));
  const missingTargetRuntimeAssignmentPatternIds = [...sourcePatternIds].filter((patternId) => !targetAssignmentByPattern.has(patternId)).sort();
  const staleTargetTripIds = routeTargetTrips.filter((trip) => {
    const assignment = targetAssignmentByPattern.get(trip.patternId);
    const profile = assignment ? targetProfilesById.get(assignment.runtimeProfileId) : undefined;
    const source = profileCalculationSource(trip);
    return Boolean(source && (!assignment || !profile || source.runtimeProfileId !== assignment.runtimeProfileId || source.runtimeCalculationRevision !== (profile.calculationRevision ?? 0)));
  }).map((trip) => trip.id);
  const adjusted = adjustBlockReferences(targetBlocks, routeTargetTrips.map((trip) => trip.id));
  const copiedTrips = routeSourceTrips.map((trip) => copyTrip(trip, request.targetServiceDayId, now));
  const sourceSignature = createTripCopySignature(request, routeSourceTrips, routeTargetTrips, targetBlocks, targetAssignments, targetProfiles);
  return {
    request,
    sourceSignature,
    copiedTrips,
    removedTripIds: routeTargetTrips.map((trip) => trip.id),
    adjustedBlocks: adjusted.blocks,
    impact: {
      sourceTripCount: routeSourceTrips.length,
      targetTripCount: routeTargetTrips.length,
      copiedTripCount: copiedTrips.length,
      targetTripsReplaced: routeTargetTrips.length,
      sourceCounts: tripCounts(routeSourceTrips, patternsById),
      targetCounts: tripCounts(routeTargetTrips, patternsById),
      manuallyAdjustedTargetTripIds: routeTargetTrips.filter((trip) => trip.provenance.manuallyChangedFields.length > 0).map((trip) => trip.id),
      staleTargetTripIds,
      missingTargetRuntimeAssignmentPatternIds,
      affectedBlockIds: adjusted.adjustments.map((adjustment) => adjustment.blockId),
      removedBlockActivityCount: adjusted.adjustments.reduce((sum, adjustment) => sum + adjustment.removedTripIds.length, 0),
      requiresExplicitEmptySourceReview: routeSourceTrips.length === 0,
    },
    findings,
  };
}

export function buildBatchPatternChangePreview(
  request: BatchPatternChangeRequest,
  trips: Trip[],
  targetPattern: RoutePattern,
  profilesByTripId: Map<string, RuntimeProfile>,
  blocks: Block[],
  assignments: RuntimeAssignment[],
  profiles: RuntimeProfile[],
  sourcePatternsByTripId: Map<string, RoutePattern> = new Map(),
): BatchPatternChangePreview {
  const findings = validateBatchPatternChangeRequest(request);
  const changes: PatternChangePreview[] = [];
  const affectedBlockIds = new Set<string>();
  for (const trip of trips) {
    const sourcePattern = sourcePatternsByTripId.get(trip.id);
    if (sourcePattern && (sourcePattern.routeId !== targetPattern.routeId || sourcePattern.directionId !== targetPattern.directionId || trip.routeId !== targetPattern.routeId)) {
      changes.push({ tripId: trip.id, sourcePatternId: trip.patternId, targetPatternId: targetPattern.id, oldStopTimes: [...trip.stopTimes], finding: finding('trip', trip.id, 'trip.patternDirectionMismatch', 'trip.patternDirectionMismatch', 'patternId') });
      continue;
    }
    const preview = profilesByTripId.get(trip.id) ? previewPatternChange(trip, targetPattern, profilesByTripId.get(trip.id)!) : { tripId: trip.id, sourcePatternId: trip.patternId, targetPatternId: targetPattern.id, oldStopTimes: [...trip.stopTimes], finding: finding('trip', trip.id, 'trip.targetRuntimeUnavailable', 'trip.targetRuntimeUnavailable', 'patternId') };
    const blockIds = blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === trip.id)).map((block) => block.id);
    for (const blockId of blockIds) affectedBlockIds.add(blockId);
    changes.push({ ...preview, affectedBlockIds: blockIds });
  }
  const eligibleTripIds = changes.filter((change) => !change.finding && Boolean(change.newStopTimes)).map((change) => change.tripId);
  const ineligibleTripIds = changes.filter((change) => Boolean(change.finding)).map((change) => change.tripId);
  for (const change of changes) if (change.finding) findings.push(change.finding);
  return { request, sourceSignature: createBatchPatternChangeSignature(request, trips, targetPattern, assignments, profiles), changes, eligibleTripIds, ineligibleTripIds, affectedBlockIds: [...affectedBlockIds].sort(), findings };
}
