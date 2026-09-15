import type { Block, DurationSeconds, GenerateTripsRequest, RoutePattern, RuntimeProfile, ScheduledPoint, ServiceSeconds, Trip, TripGenerationSet, ValidationFinding } from './types';
import { metadata, newId, withUpdatedAt } from './ids';
import { propagatePatternTimes } from './runtime';

export class TripGenerationError extends Error {
  constructor(readonly findings: ValidationFinding[]) { super(findings.map((item) => item.messageKey).join('; ') || 'Trip generation failed'); this.name = 'TripGenerationError'; }
}

export interface GenerateTripsPreview {
  request: GenerateTripsRequest;
  trips: Trip[];
  warnings: ValidationFinding[];
}

function requestFinding(request: GenerateTripsRequest, ruleId: string, messageKey: string, field?: string, parameters?: Record<string, string | number>): ValidationFinding {
  return { ruleId, severity: 'error', entityType: 'generateTrips', entityId: `${request.serviceDayId}:${request.patternId}`, ...(field ? { field } : {}), messageKey, ...(parameters ? { parameters } : {}) };
}

/** Validate the transient Generate Trips form without creating a persistence record. */
export function validateGenerateTripsRequest(request: GenerateTripsRequest): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!request.scenarioId.trim()) findings.push(requestFinding(request, 'tripGeneration.scenarioRequired', 'tripGeneration.scenarioRequired', 'scenarioId'));
  if (!request.routeId.trim()) findings.push(requestFinding(request, 'tripGeneration.routeRequired', 'tripGeneration.routeRequired', 'routeId'));
  if (!request.serviceDayId.trim()) findings.push(requestFinding(request, 'tripGeneration.serviceDayRequired', 'tripGeneration.serviceDayRequired', 'serviceDayId'));
  if (!request.patternId.trim()) findings.push(requestFinding(request, 'tripGeneration.patternRequired', 'tripGeneration.patternRequired', 'patternId'));
  if (!Number.isInteger(request.firstTrip) || request.firstTrip < 0) findings.push(requestFinding(request, 'tripGeneration.firstTripInvalid', 'tripGeneration.firstTripInvalid', 'firstTrip'));
  if (!Number.isInteger(request.headwaySeconds) || request.headwaySeconds <= 0) findings.push(requestFinding(request, 'tripGeneration.headwayInvalid', 'tripGeneration.headwayInvalid', 'headwaySeconds'));
  if (!Number.isInteger(request.lastTrip) || request.lastTrip < 0) findings.push(requestFinding(request, 'tripGeneration.lastTripInvalid', 'tripGeneration.lastTripInvalid', 'lastTrip'));
  if (Number.isInteger(request.firstTrip) && Number.isInteger(request.lastTrip) && request.lastTrip < request.firstTrip) findings.push(requestFinding(request, 'tripGeneration.lastBeforeFirst', 'tripGeneration.lastBeforeFirst', 'lastTrip'));
  return findings;
}

export function generateRequestDepartures(request: GenerateTripsRequest): ServiceSeconds[] {
  const findings = validateGenerateTripsRequest(request);
  if (findings.length) throw new TripGenerationError(findings);
  const departures: ServiceSeconds[] = [];
  for (let departure = request.firstTrip; departure <= request.lastTrip; departure += request.headwaySeconds) departures.push(departure);
  return departures;
}

function authoritativeTrip(request: GenerateTripsRequest, pattern: RoutePattern, profile: RuntimeProfile, stopTimes: ScheduledPoint[], creationMethod: 'generated' | 'manual', id = newId(), now = new Date().toISOString(), sequence?: number): Trip {
  const revision = profile.calculationRevision ?? 0;
  return {
    id,
    scenarioId: request.scenarioId,
    routeId: request.routeId,
    serviceDayId: request.serviceDayId,
    patternId: pattern.id,
    tripProfileId: request.tripProfileId,
    stopTimes,
    provenance: {
      kind: creationMethod,
      creationMethod,
      ...(sequence === undefined ? {} : { generationSequence: sequence }),
      manuallyChangedFields: [],
      runtimeProfileId: profile.id,
      runtimeCalculationRevision: revision,
      calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision },
    },
    ...metadata(now),
  };
}

/** Generate an additive group of authoritative trips. No records are written here. */
export function generateAuthoritativeTrips(request: GenerateTripsRequest, pattern: RoutePattern, profile: RuntimeProfile, now = new Date().toISOString()): Trip[] {
  const departures = generateRequestDepartures(request);
  const findings: ValidationFinding[] = [];
  const trips: Trip[] = [];
  departures.forEach((departure, sequence) => {
    const propagated = propagatePatternTimes(pattern, departure, profile);
    if ('finding' in propagated) {
      findings.push({ ...propagated.finding, entityType: 'generateTrips', entityId: `${request.serviceDayId}:${request.patternId}`, field: 'firstTrip', parameters: { departure } });
    } else {
      trips.push(authoritativeTrip(request, pattern, profile, propagated.stopTimes, 'generated', newId(), now, sequence));
    }
  });
  if (findings.length) throw new TripGenerationError(findings);
  return trips;
}

export const generateTripsFromRequest = generateAuthoritativeTrips;

/** Possible duplicates are warnings: additive generation never rejects them. */
export function findExactTripDuplicates(proposed: Trip[], existing: Trip[]): ValidationFinding[] {
  const existingKeys = new Set(existing.map((trip) => `${trip.serviceDayId}:${trip.patternId}:${trip.stopTimes[0]?.time ?? ''}`));
  const seen = new Set<string>();
  const warnings: ValidationFinding[] = [];
  for (const trip of proposed) {
    const key = `${trip.serviceDayId}:${trip.patternId}:${trip.stopTimes[0]?.time ?? ''}`;
    if (!existingKeys.has(key) && !seen.has(key)) { seen.add(key); continue; }
    warnings.push({ ruleId: 'trip.possibleExactDuplicate', severity: 'warning', entityType: 'trip', entityId: trip.id, field: 'stopTimes', messageKey: 'trip.possibleExactDuplicate', parameters: { patternId: trip.patternId, departure: trip.stopTimes[0]?.time ?? -1 } });
    seen.add(key);
  }
  return warnings;
}

export function previewGenerateAuthoritativeTrips(request: GenerateTripsRequest, pattern: RoutePattern, profile: RuntimeProfile, existing: Trip[] = [], now = new Date().toISOString()): GenerateTripsPreview {
  const trips = generateAuthoritativeTrips(request, pattern, profile, now);
  return { request, trips, warnings: findExactTripDuplicates(trips, existing) };
}

/** Create one authoritative trip using the same propagation rules as generation. */
export function createAuthoritativeTrip(request: Omit<GenerateTripsRequest, 'headwaySeconds' | 'lastTrip'>, pattern: RoutePattern, profile: RuntimeProfile, now = new Date().toISOString()): Trip {
  const findings = validateGenerateTripsRequest({ ...request, headwaySeconds: 1, lastTrip: request.firstTrip });
  if (findings.length) throw new TripGenerationError(findings);
  const propagated = propagatePatternTimes(pattern, request.firstTrip, profile);
  if ('finding' in propagated) throw new TripGenerationError([{ ...propagated.finding, entityType: 'trip', entityId: `${request.serviceDayId}:${request.patternId}`, field: 'firstTrip' }]);
  return authoritativeTrip(request as GenerateTripsRequest, pattern, profile, propagated.stopTimes, 'manual', newId(), now);
}

export interface RecalculationImpact {
  tripIds: string[];
  manualTimeShiftTripIds: string[];
  manualPatternChangeTripIds: string[];
  blockIds: string[];
  requiresConfirmation: boolean;
}

export interface RecalculationPreview {
  trips: Trip[];
  impact: RecalculationImpact;
}

export function calculateRecalculationImpact(trips: Trip[], blocks: Block[]): RecalculationImpact {
  const selected = new Set(trips.map((trip) => trip.id));
  const manualTimeShiftTripIds = trips.filter((trip) => trip.provenance.manuallyChangedFields.includes('times')).map((trip) => trip.id);
  const manualPatternChangeTripIds = trips.filter((trip) => trip.provenance.manuallyChangedFields.includes('patternId')).map((trip) => trip.id);
  const blockIds = blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && selected.has(activity.tripId))).map((block) => block.id);
  return { tripIds: trips.map((trip) => trip.id), manualTimeShiftTripIds, manualPatternChangeTripIds, blockIds, requiresConfirmation: manualTimeShiftTripIds.length > 0 || manualPatternChangeTripIds.length > 0 || blockIds.length > 0 };
}

export function markTripRecalculated(trip: Trip, pattern: RoutePattern, profile: RuntimeProfile, now = new Date().toISOString()): Trip {
  const departure = trip.stopTimes[0]?.time;
  if (departure === undefined) throw new TripGenerationError([tripFinding(trip, 'trip.departureMissing', 'trip.departureMissing')]);
  const propagated = propagatePatternTimes(pattern, departure, profile);
  if ('finding' in propagated) throw new TripGenerationError([{ ...propagated.finding, entityType: 'trip', entityId: trip.id }]);
  const revision = profile.calculationRevision ?? 0;
  return withUpdatedAt({ ...trip, patternId: pattern.id, stopTimes: propagated.stopTimes, provenance: { ...trip.provenance, runtimeProfileId: profile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision }, manuallyChangedFields: [], manualTimeShiftSeconds: undefined } }, now);
}

function generationFinding(set: TripGenerationSet, ruleId: string, messageKey: string, field?: string, parameters?: Record<string, string | number>): ValidationFinding {
  return { ruleId, severity: 'error', entityType: 'tripGenerationSet', entityId: set.id, ...(field ? { field } : {}), messageKey, ...(parameters ? { parameters } : {}) };
}
function tripFinding(trip: Trip, ruleId: string, messageKey: string, field?: string, parameters?: Record<string, string | number>): ValidationFinding {
  return { ruleId, severity: 'error', entityType: 'trip', entityId: trip.id, ...(field ? { field } : {}), messageKey, ...(parameters ? { parameters } : {}) };
}

export function validateTripGenerationSet(set: TripGenerationSet): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!set.name.trim()) findings.push(generationFinding(set, 'tripGeneration.nameRequired', 'tripGeneration.nameRequired', 'name'));
  if (!Number.isInteger(set.firstDeparture) || set.firstDeparture < 0) findings.push(generationFinding(set, 'tripGeneration.firstDepartureInvalid', 'tripGeneration.firstDepartureInvalid', 'firstDeparture'));
  if (!Number.isInteger(set.headwaySeconds) || set.headwaySeconds <= 0) findings.push(generationFinding(set, 'tripGeneration.headwayInvalid', 'tripGeneration.headwayInvalid', 'headwaySeconds'));
  if (set.limit.mode === 'tripCount') {
    if (!Number.isInteger(set.limit.tripCount) || set.limit.tripCount <= 0) findings.push(generationFinding(set, 'tripGeneration.tripCountInvalid', 'tripGeneration.tripCountInvalid', 'limit.tripCount'));
  } else if (!Number.isInteger(set.limit.endTime) || set.limit.endTime < 0) {
    findings.push(generationFinding(set, 'tripGeneration.endTimeInvalid', 'tripGeneration.endTimeInvalid', 'limit.endTime'));
  } else if (Number.isInteger(set.firstDeparture) && set.limit.endTime < set.firstDeparture) {
    findings.push(generationFinding(set, 'tripGeneration.endBeforeStart', 'tripGeneration.endBeforeStart', 'limit.endTime'));
  }
  if (!Number.isInteger(set.generationRevision) || set.generationRevision < 0) findings.push(generationFinding(set, 'tripGeneration.revisionInvalid', 'tripGeneration.revisionInvalid', 'generationRevision'));
  return findings;
}

export function generationDepartures(set: TripGenerationSet): ServiceSeconds[] {
  const findings = validateTripGenerationSet(set);
  if (findings.length) throw new TripGenerationError(findings);
  if (set.limit.mode === 'tripCount') return Array.from({ length: set.limit.tripCount }, (_, index) => set.firstDeparture + index * set.headwaySeconds);
  const departures: ServiceSeconds[] = [];
  for (let departure = set.firstDeparture; departure <= set.limit.endTime; departure += set.headwaySeconds) departures.push(departure);
  return departures;
}

export function tripLogicalKey(generationSetId: string, generationSequence: number): string { return `${generationSetId}:${generationSequence}`; }

function generatedTrip(set: TripGenerationSet, pattern: RoutePattern, profile: RuntimeProfile, sequence: number, stopTimes: ScheduledPoint[], id = newId(), now = new Date().toISOString()): Trip {
  const revision = profile.calculationRevision ?? 0;
  return { id, scenarioId: set.scenarioId, routeId: set.routeId, serviceDayId: set.serviceDayId, patternId: pattern.id, stopTimes, provenance: { kind: 'generated', creationMethod: 'generated', generationSetId: set.id, generationRevision: set.generationRevision, generationSequence: sequence, manuallyChangedFields: [], runtimeProfileId: profile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision } }, ...metadata(now) };
}

/** Generate historical or authoritative trips. Each departure independently selects its runtime band. */
export function generateTrips(request: GenerateTripsRequest, pattern: RoutePattern, profile: RuntimeProfile, now?: string): Trip[];
/** @deprecated Historical generation-set overload. */
export function generateTrips(set: TripGenerationSet, pattern: RoutePattern, profile: RuntimeProfile, now?: string): Trip[];
export function generateTrips(input: GenerateTripsRequest | TripGenerationSet, pattern: RoutePattern, profile: RuntimeProfile, now = new Date().toISOString()): Trip[] {
  if ('firstTrip' in input) return generateAuthoritativeTrips(input, pattern, profile, now);
  const set = input;
  const departures = generationDepartures(set);
  const findings: ValidationFinding[] = [];
  const trips: Trip[] = [];
  departures.forEach((departure, sequence) => {
    const propagated = propagatePatternTimes(pattern, departure, profile);
    if ('finding' in propagated) {
      findings.push({ ...propagated.finding, entityType: 'tripGenerationSet', entityId: set.id, field: 'firstDeparture', parameters: { departure } });
      return;
    }
    trips.push(generatedTrip(set, pattern, profile, sequence, propagated.stopTimes, newId(), now));
  });
  if (findings.length) throw new TripGenerationError(findings);
  return trips;
}

export function validateTrip(trip: Trip, pattern: RoutePattern): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (trip.patternId !== pattern.id) findings.push(tripFinding(trip, 'trip.patternMismatch', 'trip.patternMismatch', 'patternId'));
  if (trip.stopTimes.length !== pattern.points.length) findings.push(tripFinding(trip, 'trip.pointCountMismatch', 'trip.pointCountMismatch', 'stopTimes'));
  pattern.points.forEach((point, sequence) => {
    const scheduled = trip.stopTimes[sequence];
    if (!scheduled || scheduled.patternPointId !== point.id || scheduled.sequence !== sequence) findings.push(tripFinding(trip, 'trip.patternPointMismatch', 'trip.patternPointMismatch', 'stopTimes', { sequence }));
  });
  for (let index = 1; index < trip.stopTimes.length; index += 1) if (trip.stopTimes[index].time < trip.stopTimes[index - 1].time) findings.push(tripFinding(trip, 'trip.timesNotMonotonic', 'trip.timesNotMonotonic', 'stopTimes', { sequence: index }));
  return findings;
}

function changedFields(provenance: Trip['provenance'], field: 'patternId' | 'times'): Trip['provenance'] {
  return { ...provenance, manuallyChangedFields: provenance.manuallyChangedFields.includes(field) ? provenance.manuallyChangedFields : [...provenance.manuallyChangedFields, field] };
}

export function shiftTrips(trips: Trip[], tripIds: string[], offsetSeconds: DurationSeconds, now = new Date().toISOString()): Trip[] {
  if (!Number.isInteger(offsetSeconds)) throw new Error('Trip shift must be an integer number of seconds');
  const selected = new Set(tripIds);
  return trips.map((trip) => {
    if (!selected.has(trip.id)) return trip;
    const stopTimes = trip.stopTimes.map((point) => ({ ...point, time: point.time + offsetSeconds }));
    return withUpdatedAt({ ...trip, stopTimes, provenance: { ...changedFields(trip.provenance, 'times'), manualTimeShiftSeconds: (trip.provenance.manualTimeShiftSeconds ?? 0) + offsetSeconds } }, now);
  });
}

export interface PatternChangePreview { tripId: string; sourcePatternId: string; targetPatternId: string; oldStopTimes: ScheduledPoint[]; newStopTimes?: ScheduledPoint[]; finding?: ValidationFinding; /** Blocks referencing the trip require follow-up validation after a timing/pattern change. */ affectedBlockIds?: string[]; }
export function previewPatternChange(trip: Trip, targetPattern: RoutePattern, profile: RuntimeProfile): PatternChangePreview {
  const departure = trip.stopTimes[0]?.time;
  if (departure === undefined) return { tripId: trip.id, sourcePatternId: trip.patternId, targetPatternId: targetPattern.id, oldStopTimes: [...trip.stopTimes], finding: tripFinding(trip, 'trip.departureMissing', 'trip.departureMissing') };
  const propagated = propagatePatternTimes(targetPattern, departure, profile);
  if ('finding' in propagated) return { tripId: trip.id, sourcePatternId: trip.patternId, targetPatternId: targetPattern.id, oldStopTimes: [...trip.stopTimes], finding: { ...propagated.finding, entityType: 'trip', entityId: trip.id } };
  return { tripId: trip.id, sourcePatternId: trip.patternId, targetPatternId: targetPattern.id, oldStopTimes: [...trip.stopTimes], newStopTimes: propagated.stopTimes };
}
export function applyPatternChange(trip: Trip, targetPattern: RoutePattern, preview: PatternChangePreview, now = new Date().toISOString()): Trip {
  if (preview.tripId !== trip.id || preview.targetPatternId !== targetPattern.id) throw new Error('Pattern-change preview does not match the selected trip');
  if (preview.finding || !preview.newStopTimes) throw new TripGenerationError(preview.finding ? [preview.finding] : [tripFinding(trip, 'trip.patternChangeUnavailable', 'trip.patternChangeUnavailable')]);
  return withUpdatedAt({ ...trip, patternId: targetPattern.id, stopTimes: preview.newStopTimes.map((point) => ({ ...point })), provenance: changedFields(trip.provenance, 'patternId') }, now);
}

export interface BlockReferenceAdjustment { blockId: string; removedTripIds: string[]; survivingTripIds: string[]; }
export interface AdjustedBlocks { blocks: Block[]; adjustments: BlockReferenceAdjustment[]; }
export function adjustBlockReferences(blocks: Block[], removedTripIds: string[], survivingTripIds: string[] = []): AdjustedBlocks {
  const removed = new Set(removedTripIds); const surviving = new Set(survivingTripIds); const adjustments: BlockReferenceAdjustment[] = [];
  const adjusted = blocks.map((block) => {
    const referenced = block.activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => activity.tripId);
    const removedHere = referenced.filter((tripId) => removed.has(tripId)); const survivingHere = referenced.filter((tripId) => surviving.has(tripId));
    // A block is affected only when a referenced activity is removed. Surviving
    // IDs are reported for that same block, but do not create a spurious update.
    if (!removedHere.length) return block;
    adjustments.push({ blockId: block.id, removedTripIds: [...new Set(removedHere)], survivingTripIds: [...new Set(survivingHere)] });
    return withUpdatedAt({ ...block, activities: block.activities.filter((activity) => activity.type !== 'revenueTrip' || !removed.has(activity.tripId)).map((activity, sequence) => ({ ...activity, sequence })) });
  });
  return { blocks: adjusted, adjustments };
}

/** Ensure a block never mixes Trips from different timetable profiles. Legacy
 * records may omit ownership until migration, so comparison is enforced when
 * both records carry a profile ID. */
export function assertTripProfileReferences(trips: Trip[], blocks: Block[]): void {
  const tripById = new Map(trips.map((trip) => [trip.id, trip]));
  for (const block of blocks) {
    for (const activity of block.activities) {
      if (activity.type !== 'revenueTrip') continue;
      const trip = tripById.get(activity.tripId);
      if (!trip) continue;
      if (block.scenarioId !== trip.scenarioId || block.serviceDayId !== trip.serviceDayId) throw new Error(`Block ${block.id} references a Trip from another service context.`);
      if (block.tripProfileId && trip.tripProfileId && block.tripProfileId !== trip.tripProfileId) throw new Error(`Block ${block.id} cannot reference a Trip from another Trip profile.`);
    }
  }
}

export interface RegenerationPreview {
  /** The authoritative generation input used for this preview. It is retained so an initial create can commit the set with its trips. */
  generationSet: TripGenerationSet;
  generationSetId: string; serviceDayId: string; generatedTrips: Trip[]; added: number[]; removed: string[]; changed: string[]; unchanged: string[];
  manualTimeShiftsOverwritten: string[]; manualPatternChangesOverwritten: string[]; affectedBlockIds: string[];
  removedBlockReferences: Array<{ blockId: string; tripId: string }>;
}
function sequenceOf(trip: Trip): number | undefined { return trip.provenance.generationSequence; }

export function previewRegeneration(set: TripGenerationSet, pattern: RoutePattern, profile: RuntimeProfile, existingTrips: Trip[], blocks: Block[] = []): RegenerationPreview {
  const generatedTrips = generateTrips(set, pattern, profile);
  const oldBySequence = new Map(existingTrips.filter((trip) => trip.provenance.generationSetId === set.id && sequenceOf(trip) !== undefined).map((trip) => [sequenceOf(trip)!, trip]));
  const newSequences = new Set(generatedTrips.map((trip) => sequenceOf(trip)!)); const removedTrips = [...oldBySequence.values()].filter((trip) => !newSequences.has(sequenceOf(trip)!));
  const added = generatedTrips.filter((trip) => !oldBySequence.has(sequenceOf(trip)!)).map((trip) => sequenceOf(trip)!); const changed: string[] = []; const unchanged: string[] = []; const manualTimeShiftsOverwritten: string[] = []; const manualPatternChangesOverwritten: string[] = [];
  for (const generated of generatedTrips) {
    const existing = oldBySequence.get(sequenceOf(generated)!); if (!existing) continue;
    const oldTimes = existing.stopTimes.map((point) => point.time); const newTimes = generated.stopTimes.map((point) => point.time);
    if (existing.patternId !== generated.patternId || oldTimes.some((time, index) => time !== newTimes[index])) changed.push(existing.id); else unchanged.push(existing.id);
    if (existing.provenance.manuallyChangedFields.includes('times')) manualTimeShiftsOverwritten.push(existing.id);
    if (existing.provenance.manuallyChangedFields.includes('patternId')) manualPatternChangesOverwritten.push(existing.id);
  }
  const removedIds = new Set(removedTrips.map((trip) => trip.id));
  const removedBlockReferences = blocks.flatMap((block) => block.activities.flatMap((activity) => activity.type === 'revenueTrip' && removedIds.has(activity.tripId) ? [{ blockId: block.id, tripId: activity.tripId }] : []));
  return { generationSet: set, generationSetId: set.id, serviceDayId: set.serviceDayId, generatedTrips, added, removed: removedTrips.map((trip) => trip.id), changed, unchanged, manualTimeShiftsOverwritten, manualPatternChangesOverwritten, affectedBlockIds: [...new Set(removedBlockReferences.map((item) => item.blockId))], removedBlockReferences };
}

export interface RegenerationResult { trips: Trip[]; blocks: Block[]; adjustments: BlockReferenceAdjustment[]; }
export function applyRegeneration(preview: RegenerationPreview, existingTrips: Trip[], blocks: Block[] = [], now = new Date().toISOString()): RegenerationResult {
  const oldBySequence = new Map(existingTrips.filter((trip) => trip.provenance.generationSetId === preview.generationSetId && sequenceOf(trip) !== undefined).map((trip) => [sequenceOf(trip)!, trip]));
  const materialized = preview.generatedTrips.map((trip) => { const existing = oldBySequence.get(sequenceOf(trip)!); return existing ? withUpdatedAt({ ...trip, id: existing.id }, now) : withUpdatedAt(trip, now); });
  const removedIds = new Set(preview.removed); const others = existingTrips.filter((trip) => trip.provenance.generationSetId !== preview.generationSetId && !removedIds.has(trip.id));
  const adjusted = adjustBlockReferences(blocks, preview.removed, materialized.map((trip) => trip.id));
  return { trips: [...others, ...materialized], blocks: adjusted.blocks, adjustments: adjusted.adjustments };
}
