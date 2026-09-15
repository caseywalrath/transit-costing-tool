import type { TripGenerationRepository } from './ports';
import type { GenerateTripsPreview, PatternChangePreview, RecalculationPreview, RegenerationPreview, RegenerationResult } from '../domain/trips';
import { adjustBlockReferences, applyPatternChange, applyRegeneration, calculateRecalculationImpact, createAuthoritativeTrip, findExactTripDuplicates, generateAuthoritativeTrips, generateTrips, markTripRecalculated, previewPatternChange, previewRegeneration, shiftTrips, TripGenerationError, validateGenerateTripsRequest, validateTrip } from '../domain/trips';
import type { AddTripRequest, Block, GenerateTripsRequest, RuntimeAssignment, RuntimeProfile, RoutePattern, Trip, TripGenerationSet, TripProfile, ValidationFinding } from '../domain/types';
import { metadata, newId, withUpdatedAt } from '../domain/ids';
import { buildBatchPatternChangePreview, buildRuntimeCopyPreview, buildTripCopyPreview, type BatchPatternChangePreview, type BatchPatternChangeRequest, type RuntimeCopyPreview, type RuntimeCopyRequest, type TripCopyPreview, type TripCopyRequest } from '../domain/serviceDayCopy';
import { buildTripShiftPreview, type TripShiftPreview, type TripShiftRequest, TripShiftValidationError } from '../domain/tripShift';

export interface TripProfileDeletionPreview {
  profileId: string;
  tripCount: number;
  manuallyAdjustedTripCount: number;
  staleTripCount: number;
  blockCount: number;
  blockActivityCount: number;
  isLastProfile: boolean;
  previewToken: string;
}

function tripProfileDeletionToken(profile: TripProfile, profiles: TripProfile[], trips: Trip[], blocks: Block[], staleTripCount: number): string {
  return JSON.stringify({
    profile: [profile.id, profile.updatedAt],
    profiles: profiles.map((item) => [item.id, item.updatedAt]).sort((left, right) => left[0].localeCompare(right[0])),
    trips: trips.map((trip) => [trip.id, trip.updatedAt]).sort((left, right) => left[0].localeCompare(right[0])),
    blocks: blocks.map((block) => [block.id, block.updatedAt]).sort((left, right) => left[0].localeCompare(right[0])),
    staleTripCount,
  });
}

/** Application coordinator for the historical and authoritative trip workflows. */
export class TripGenerationService {
  constructor(private readonly repository: TripGenerationRepository, private readonly now: () => string = () => new Date().toISOString()) {}

  async listTripProfiles(scenarioId: string): Promise<TripProfile[]> { return this.repository.listTripProfiles ? this.repository.listTripProfiles(scenarioId) : []; }
  async ensureDefaultTripProfile(scenarioId: string): Promise<TripProfile> {
    const profiles = await this.listTripProfiles(scenarioId);
    if (profiles.length) return profiles[0];
    const profile: TripProfile = { id: newId(), scenarioId, name: 'Default', ...metadata(this.now()) };
    if (!this.repository.saveTripProfile) throw new Error('Trip profile persistence is unavailable.'); await this.repository.saveTripProfile(profile); return profile;
  }
  async renameTripProfile(profileId: string, name: string): Promise<TripProfile> {
    const trimmed = name.trim(); if (!trimmed) throw new Error('Enter a trip profile name.');
    const existing = await this.listTripProfiles((await this.findTripProfile(profileId)).scenarioId);
    if (existing.some((profile) => profile.id !== profileId && profile.name.trim().toLowerCase() === trimmed.toLowerCase())) throw new Error('A Trip profile with this name already exists.');
    const updated = withUpdatedAt({ ...(await this.findTripProfile(profileId)), name: trimmed }, this.now()); if (!this.repository.saveTripProfile) throw new Error('Trip profile persistence is unavailable.'); await this.repository.saveTripProfile(updated); return updated;
  }
  async copyTripProfile(profileId: string, name: string): Promise<TripProfile> {
    const source = await this.findTripProfile(profileId); const trimmed = name.trim(); if (!trimmed) throw new Error('Enter a trip profile name.');
    const profiles = await this.listTripProfiles(source.scenarioId); if (profiles.some((profile) => profile.name.trim().toLowerCase() === trimmed.toLowerCase())) throw new Error('A Trip profile with this name already exists.');
    const target: TripProfile = { id: newId(), scenarioId: source.scenarioId, name: trimmed, sourceTripProfileId: source.id, ...metadata(this.now()) };
    const sourceTrips = this.repository.listTripsForProfile ? await this.repository.listTripsForProfile(profileId) : [];
    const tripIds = new Map(sourceTrips.map((trip) => [trip.id, newId()]));
    if (!this.repository.copyTripProfileAtomically) throw new Error('Trip profile persistence is unavailable.');
    const copiedTrips = sourceTrips.map((trip) => ({ ...trip, id: tripIds.get(trip.id)!, tripProfileId: target.id, ...metadata(this.now()), stopTimes: trip.stopTimes.map((point) => ({ ...point })) }));
    await this.repository.copyTripProfileAtomically(target, copiedTrips);
    return target;
  }
  async previewTripProfileDeletion(profileId: string): Promise<TripProfileDeletionPreview> {
    const profile = await this.findTripProfile(profileId); const profiles = await this.listTripProfiles(profile.scenarioId);
    const trips = this.repository.listTripsForProfile ? await this.repository.listTripsForProfile(profileId) : [];
    const blocks = this.repository.listBlocksForProfile ? await this.repository.listBlocksForProfile(profileId) : [];
    let staleTripCount = 0;
    for (const trip of trips) {
      const sourceProfileId = trip.provenance.calculationSource?.runtimeProfileId ?? trip.provenance.runtimeProfileId;
      const sourceRevision = trip.provenance.calculationSource?.runtimeCalculationRevision ?? trip.provenance.runtimeCalculationRevision;
      const assignment = (await this.repository.listRuntimeAssignments(trip.scenarioId, trip.serviceDayId, trip.patternId))[0];
      const runtime = assignment ? await this.repository.getRuntimeProfile(assignment.runtimeProfileId) : undefined;
      if (sourceProfileId && sourceRevision !== undefined && (!assignment || !runtime || assignment.runtimeProfileId !== sourceProfileId || (runtime.calculationRevision ?? 0) !== sourceRevision)) staleTripCount += 1;
    }
    const preview = { profileId, tripCount: trips.length, manuallyAdjustedTripCount: trips.filter((trip) => trip.provenance.manuallyChangedFields.length > 0).length, staleTripCount, blockCount: blocks.length, blockActivityCount: blocks.reduce((sum, block) => sum + block.activities.length, 0), isLastProfile: profiles.length <= 1 };
    return { ...preview, previewToken: tripProfileDeletionToken(profile, profiles, trips, blocks, staleTripCount) };
  }
  async deleteTripProfile(profileId: string, previewToken?: string): Promise<void> {
    const preview = await this.previewTripProfileDeletion(profileId); if (previewToken && preview.previewToken !== previewToken) throw new Error('The Trip profile deletion review is out of date. Review the impact again.'); if (preview.isLastProfile) throw new Error('Create another Trip profile before deleting the only profile.'); if (!this.repository.deleteTripProfile) throw new Error('Trip profile persistence is unavailable.'); await this.repository.deleteTripProfile(profileId);
  }
  private async findTripProfile(profileId: string): Promise<TripProfile> { const profile = this.repository.getTripProfile ? await this.repository.getTripProfile(profileId) : undefined; if (profile) return profile; throw new Error('The selected Trip profile is no longer available.'); }

  async previewTripGeneration(set: TripGenerationSet, profileId: string): Promise<RegenerationPreview> {
    const [pattern, profile, existingTrips, blocks] = await Promise.all([
      this.repository.getPattern(set.patternId),
      this.repository.getRuntimeProfile(profileId),
      this.repository.listTrips(set.serviceDayId, set.id),
      this.repository.listBlocks(set.serviceDayId),
    ]);
    if (!pattern) throw new Error('The selected pattern is no longer available.');
    if (!profile) throw new Error('The selected runtime profile is no longer available.');
    return previewRegeneration(set, pattern, profile, existingTrips, blocks);
  }

  async applyTripGeneration(preview: RegenerationPreview): Promise<RegenerationResult> {
    const [existingTrips, blocks] = await Promise.all([
      this.repository.listTrips(preview.serviceDayId, preview.generationSetId),
      this.repository.listBlocks(preview.serviceDayId),
    ]);
    const result = applyRegeneration(preview, existingTrips, blocks, this.now());
    // The preview carries the authoritative input, which is essential for an
    // initial create where no generation-set row exists yet. The repository
    // operation is atomic across the set, trips, and affected blocks.
    await this.repository.replaceGenerationSet(preview.generationSet, result.trips, result.blocks);
    return result;
  }

  async getGenerationSet(id: string): Promise<TripGenerationSet | undefined> { return this.repository.getGenerationSet(id); }
  async listGenerationSets(serviceDayId: string, routeId?: string, patternId?: string): Promise<TripGenerationSet[]> {
    return this.repository.listGenerationSets(serviceDayId, routeId, patternId);
  }

  async resolveRuntimeProfile(scenarioId: string, serviceDayId: string, patternId: string): Promise<{ assignment: RuntimeAssignment; profile: RuntimeProfile } | undefined> {
    const assignment = (await this.repository.listRuntimeAssignments(scenarioId, serviceDayId, patternId))[0];
    if (!assignment) return undefined;
    const profile = await this.repository.getRuntimeProfile(assignment.runtimeProfileId);
    return profile ? { assignment, profile } : undefined;
  }

  async previewTripShift(tripIds: string[], offsetSeconds: number): Promise<Trip[]> {
    const trips = await Promise.all(tripIds.map((id) => this.repository.getTrip(id)));
    if (trips.some((trip) => !trip)) throw new Error('One or more selected trips are no longer available.');
    return shiftTrips(trips as Trip[], tripIds, offsetSeconds, this.now());
  }

  async applyTripShift(tripIds: string[], offsetSeconds: number): Promise<Trip[]> {
    const shifted = await this.previewTripShift(tripIds, offsetSeconds);
    if (this.repository.saveTripChangesAtomically) await this.repository.saveTripChangesAtomically(shifted);
    else await this.repository.saveTrips(shifted);
    return shifted;
  }

  /** Build a scoped, transient Shift preview for the staged Shift drawer. */
  async previewStagedTripShift(request: TripShiftRequest): Promise<TripShiftPreview> {
    const trips = (await Promise.all(request.tripIds.map((id) => this.repository.getTrip(id)))).filter((trip): trip is Trip => Boolean(trip));
    if (trips.length !== new Set(request.tripIds).size) throw new Error('One or more selected trips are no longer available.');
    const findings = [] as ValidationFinding[];
    for (const trip of trips) {
      const pattern = await this.repository.getPattern(trip.patternId);
      if (!pattern) {
        findings.push({ ruleId: 'tripShift.patternUnavailable', severity: 'error', entityType: 'trip', entityId: trip.id, field: 'patternId', messageKey: 'tripShift.patternUnavailable' });
        continue;
      }
      if (trip.scenarioId !== request.scenarioId || trip.routeId !== request.routeId || trip.serviceDayId !== request.serviceDayId || (request.tripProfileId !== undefined && trip.tripProfileId !== request.tripProfileId) || pattern.directionId !== request.directionId) {
        findings.push({ ruleId: 'tripShift.scopeMismatch', severity: 'error', entityType: 'trip', entityId: trip.id, messageKey: 'tripShift.scopeMismatch' });
      }
    }
    if (findings.length) throw new TripShiftValidationError(findings);
    return buildTripShiftPreview(request, trips, this.now());
  }

  /** Recheck the scoped source before one atomic staged Shift commit. */
  async applyStagedTripShift(preview: TripShiftPreview): Promise<TripShiftPreview> {
    const current = await this.previewStagedTripShift(preview.request);
    if (current.sourceSignature.value !== preview.sourceSignature.value) throw new TripShiftStalePreviewError();
    await this.atomicChanges()(current.shiftedTrips);
    return current;
  }

  async previewPatternChange(tripId: string, targetPatternId: string, profileId: string): Promise<PatternChangePreview> {
    const trip = await this.repository.getTrip(tripId);
    const [pattern, profile] = await Promise.all([this.repository.getPattern(targetPatternId), this.repository.getRuntimeProfile(profileId)]);
    if (!trip) throw new Error('The selected trip is no longer available.');
    if (!pattern) throw new Error('The selected pattern is no longer available.');
    if (!profile) throw new Error('The selected runtime profile is no longer available.');
    return previewPatternChange(trip, pattern, profile);
  }

  async applyPatternChange(preview: PatternChangePreview): Promise<Trip> {
    const trip = await this.repository.getTrip(preview.tripId);
    const pattern = await this.repository.getPattern(preview.targetPatternId);
    if (!trip || !pattern) throw new Error('The selected trip or pattern is no longer available.');
    const updated = applyPatternChange(trip, pattern, preview, this.now());
    if (this.repository.saveTripChangesAtomically) await this.repository.saveTripChangesAtomically([updated]);
    else await this.repository.saveTrips([updated]);
    return updated;
  }

  async listServiceDayTrips(serviceDayId: string): Promise<Trip[]> { return this.repository.listTrips(serviceDayId); }

  async validateTrip(tripId: string) {
    const trip = await this.repository.getTrip(tripId);
    if (!trip) throw new Error('The selected trip is no longer available.');
    const pattern = await this.repository.getPattern(trip.patternId);
    if (!pattern) return [];
    return validateTrip(trip, pattern);
  }

  private async resolveAuthoritativeProfile(request: { scenarioId: string; serviceDayId: string; patternId: string }): Promise<{ pattern: RoutePattern; assignment: RuntimeAssignment; profile: RuntimeProfile }> {
    const pattern = await this.repository.getPattern(request.patternId);
    if (!pattern) throw new Error('The selected pattern is no longer available.');
    if (pattern.scenarioId !== request.scenarioId) throw new Error('The selected pattern belongs to another scenario.');
    const assignments = await this.repository.listRuntimeAssignments(request.scenarioId, request.serviceDayId, request.patternId);
    const assignment = assignments[0];
    if (!assignment) throw new Error('No runtime profile is assigned for the selected service day.');
    const profile = await this.repository.getRuntimeProfile(assignment.runtimeProfileId);
    if (!profile) throw new Error('The assigned runtime profile is no longer available.');
    if (profile.patternId !== pattern.id || profile.routeId !== pattern.routeId || profile.scenarioId !== pattern.scenarioId) throw new Error('The assigned runtime profile does not belong to the selected pattern.');
    return { pattern, assignment, profile };
  }

  private atomicInsert(): (trips: Trip[]) => Promise<void> {
    if (!this.repository.insertTripsAtomically) throw new Error('Authoritative trip persistence is unavailable.');
    return this.repository.insertTripsAtomically.bind(this.repository);
  }

  private atomicChanges(): (trips: Trip[], blocks?: Block[]) => Promise<void> {
    if (!this.repository.saveTripChangesAtomically) throw new Error('Authoritative trip persistence is unavailable.');
    return this.repository.saveTripChangesAtomically.bind(this.repository);
  }

  private atomicDelete(): (tripIds: string[], blocks?: Block[]) => Promise<void> {
    if (!this.repository.deleteTripsAtomically) throw new Error('Authoritative trip persistence is unavailable.');
    return this.repository.deleteTripsAtomically.bind(this.repository);
  }

  /** Validation-only preflight for the transient Generate Trips request. */
  async previewGenerateTrips(request: GenerateTripsRequest): Promise<GenerateTripsPreview> {
    const requestFindings = validateGenerateTripsRequest(request);
    if (requestFindings.length) throw new TripGenerationError(requestFindings);
    if (request.routeId.trim() === '') throw new Error('A route is required.');
    if (request.patternId.trim() === '') throw new Error('A pattern is required.');
    const { pattern, profile } = await this.resolveAuthoritativeProfile(request);
    if (pattern.routeId !== request.routeId) throw new Error('The selected pattern does not belong to the selected route.');
    const existing = await this.repository.listTrips(request.serviceDayId, request.tripProfileId);
    const trips = generateAuthoritativeTrips(request, pattern, profile, this.now());
    return { request, trips, warnings: findExactTripDuplicates(trips, existing) };
  }

  /** Additively persist a validated generated group. Existing trips and blocks remain unchanged. */
  async generateTrips(request: GenerateTripsRequest): Promise<GenerateTripsPreview> {
    const preview = await this.previewGenerateTrips(request);
    await this.atomicInsert()(preview.trips);
    return preview;
  }

  /** Add one trip directly to the authoritative schedule. */
  async addTrip(request: AddTripRequest): Promise<{ trip: Trip; warnings: ValidationFinding[] }> {
    const { pattern, profile } = await this.resolveAuthoritativeProfile(request);
    if (pattern.routeId !== request.routeId) throw new Error('The selected pattern does not belong to the selected route.');
    if (pattern.directionId !== request.directionId) throw new TripGenerationError([{ ruleId: 'trip.patternDirectionMismatch', severity: 'error', entityType: 'trip', entityId: `${request.serviceDayId}:${request.patternId}`, field: 'patternId', messageKey: 'trip.patternDirectionMismatch' }]);
    const trip = createAuthoritativeTrip(request, pattern, profile, this.now());
    const existing = await this.repository.listTrips(request.serviceDayId, request.tripProfileId);
    const warnings = findExactTripDuplicates([trip], existing);
    await this.atomicInsert()([trip]);
    return { trip, warnings };
  }

  /** Preview a same-direction pattern change using the target pattern's assignment. */
  async previewTripPatternChange(tripId: string, targetPatternId: string, directionId: string): Promise<PatternChangePreview> {
    const trip = await this.repository.getTrip(tripId);
    if (!trip) throw new Error('The selected trip is no longer available.');
    const source = await this.repository.getPattern(trip.patternId);
    const target = await this.repository.getPattern(targetPatternId);
    if (!target) throw new Error('The selected pattern is no longer available.');
    const blocks = await this.repository.listBlocks(trip.serviceDayId);
    const affectedBlockIds = blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === trip.id)).map((block) => block.id);
    if ((source?.directionId !== undefined && source.directionId !== directionId) || target.directionId !== directionId) return { tripId, sourcePatternId: trip.patternId, targetPatternId, oldStopTimes: [...trip.stopTimes], affectedBlockIds, finding: { ruleId: 'trip.patternDirectionMismatch', severity: 'error', entityType: 'trip', entityId: trip.id, field: 'patternId', messageKey: 'trip.patternDirectionMismatch' } };
    const { profile } = await this.resolveAuthoritativeProfile({ scenarioId: trip.scenarioId, serviceDayId: trip.serviceDayId, patternId: targetPatternId });
    return { ...previewPatternChange(trip, target, profile), affectedBlockIds };
  }

  async changeTripPattern(preview: PatternChangePreview): Promise<Trip> {
    const trip = await this.repository.getTrip(preview.tripId);
    const target = await this.repository.getPattern(preview.targetPatternId);
    if (!trip || !target) throw new Error('The selected trip or pattern is no longer available.');
    const source = await this.repository.getPattern(trip.patternId);
    if (target.routeId !== trip.routeId) throw new TripGenerationError([{ ruleId: 'trip.patternRouteMismatch', severity: 'error', entityType: 'trip', entityId: trip.id, field: 'patternId', messageKey: 'trip.patternRouteMismatch' }]);
    if (source?.directionId !== undefined && target.directionId !== source.directionId) throw new TripGenerationError([{ ruleId: 'trip.patternDirectionMismatch', severity: 'error', entityType: 'trip', entityId: trip.id, field: 'patternId', messageKey: 'trip.patternDirectionMismatch' }]);
    const { profile } = await this.resolveAuthoritativeProfile({ scenarioId: trip.scenarioId, serviceDayId: trip.serviceDayId, patternId: target.id });
    const updated = applyPatternChange(trip, target, preview, this.now());
    const revision = profile.calculationRevision ?? 0;
    const sourced = { ...updated, provenance: { ...updated.provenance, creationMethod: updated.provenance.creationMethod ?? updated.provenance.kind, runtimeProfileId: profile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision } } };
    await this.atomicChanges()([sourced]);
    return sourced;
  }

  async previewRecalculateTrips(tripIds: string[]): Promise<RecalculationPreview> {
    const trips = (await Promise.all(tripIds.map((id) => this.repository.getTrip(id)))).filter((trip): trip is Trip => Boolean(trip));
    if (trips.length !== tripIds.length) throw new Error('One or more selected trips are no longer available.');
    const blocksByDay = new Map<string, Block[]>();
    for (const trip of trips) if (!blocksByDay.has(trip.serviceDayId)) blocksByDay.set(trip.serviceDayId, await this.repository.listBlocks(trip.serviceDayId));
    const blocks = [...blocksByDay.values()].flat();
    const recalculated: Trip[] = [];
    for (const trip of trips) {
      const { pattern, profile } = await this.resolveAuthoritativeProfile({ scenarioId: trip.scenarioId, serviceDayId: trip.serviceDayId, patternId: trip.patternId });
      recalculated.push(markTripRecalculated(trip, pattern, profile, this.now()));
    }
    return { trips: recalculated, impact: calculateRecalculationImpact(trips, blocks) };
  }

  async recalculateTrips(tripIds: string[], confirm = false): Promise<{ trips: Trip[]; impact: RecalculationPreview['impact'] }> {
    const preview = await this.previewRecalculateTrips(tripIds);
    if (preview.impact.requiresConfirmation && !confirm) throw new TripRecalculationConfirmationError(preview);
    await this.atomicChanges()(preview.trips);
    return preview;
  }

  /** Report trip and block impact before the user confirms deletion. */
  async previewTripDeletion(tripIds: string[]): Promise<{ deletedTripIds: string[]; affectedBlockIds: string[] }> {
    const uniqueIds = [...new Set(tripIds)];
    if (!uniqueIds.length) return { deletedTripIds: [], affectedBlockIds: [] };
    const trips = await Promise.all(uniqueIds.map((id) => this.repository.getTrip(id)));
    if (trips.some((trip) => !trip)) throw new Error('One or more selected trips are no longer available.');
    const serviceDayIds = new Set((trips as Trip[]).map((trip) => trip.serviceDayId));
    if (serviceDayIds.size !== 1) throw new Error('Trips from different service days must be deleted separately.');
    const blocks = await this.repository.listBlocks((trips[0] as Trip).serviceDayId);
    const adjusted = adjustBlockReferences(blocks, uniqueIds);
    return { deletedTripIds: uniqueIds, affectedBlockIds: adjusted.adjustments.map((adjustment) => adjustment.blockId) };
  }

  /** Delete one or more saved trips and remove their revenue activities from affected blocks. */
  async deleteTrips(tripIds: string[]): Promise<{ deletedTripIds: string[]; affectedBlockIds: string[] }> {
    const preview = await this.previewTripDeletion(tripIds);
    if (!preview.deletedTripIds.length) return preview;
    const trips = await Promise.all(preview.deletedTripIds.map((id) => this.repository.getTrip(id)));
    const blocks = await this.repository.listBlocks((trips[0] as Trip).serviceDayId);
    const adjusted = adjustBlockReferences(blocks, preview.deletedTripIds);
    await this.atomicDelete()(preview.deletedTripIds, adjusted.blocks.filter((block) => adjusted.adjustments.some((adjustment) => adjustment.blockId === block.id)));
    return preview;
  }

  async previewRuntimeCopy(request: RuntimeCopyRequest): Promise<RuntimeCopyPreview> {
    const records = await this.copyRecords(request.scenarioId);
    const sourceDay = records.serviceDays.find((day) => day.id === request.sourceServiceDayId);
    const targetDay = records.serviceDays.find((day) => day.id === request.targetServiceDayId);
    if (!sourceDay || !targetDay) throw new Error('The selected source or target service day is no longer available.');
    const sourceAssignments = records.runtimeAssignments.filter((assignment) => assignment.scenarioId === request.scenarioId && assignment.serviceDayId === request.sourceServiceDayId && records.patterns.some((pattern) => pattern.id === assignment.patternId && pattern.routeId === request.routeId));
    const targetAssignments = records.runtimeAssignments.filter((assignment) => assignment.scenarioId === request.scenarioId && assignment.serviceDayId === request.targetServiceDayId && records.patterns.some((pattern) => pattern.id === assignment.patternId && pattern.routeId === request.routeId));
    const targetTrips = records.trips.filter((trip) => trip.serviceDayId === request.targetServiceDayId && trip.routeId === request.routeId);
    return buildRuntimeCopyPreview(request, sourceDay, targetDay, records.patterns, sourceAssignments, targetAssignments, records.runtimeProfiles, targetTrips, this.now());
  }

  async applyRuntimeCopy(preview: RuntimeCopyPreview): Promise<RuntimeCopyPreview> {
    const current = await this.previewRuntimeCopy(preview.request);
    this.assertFreshCopyPreview(preview.sourceSignature.value, current.sourceSignature.value);
    this.assertNoCopyErrors(current.findings);
    if (!this.repository.commitRuntimeCopyAtomically) throw new Error('Runtime-copy persistence is unavailable.');
    await this.repository.commitRuntimeCopyAtomically(preview);
    return preview;
  }

  async previewTripCopy(request: TripCopyRequest): Promise<TripCopyPreview> {
    const records = await this.copyRecords(request.scenarioId);
    const sourceDay = records.serviceDays.find((day) => day.id === request.sourceServiceDayId);
    const targetDay = records.serviceDays.find((day) => day.id === request.targetServiceDayId);
    if (!sourceDay || !targetDay) throw new Error('The selected source or target service day is no longer available.');
    const sourceTrips = records.trips.filter((trip) => trip.serviceDayId === request.sourceServiceDayId);
    const targetTrips = records.trips.filter((trip) => trip.serviceDayId === request.targetServiceDayId);
    const targetBlocks = records.blocks.filter((block) => block.serviceDayId === request.targetServiceDayId);
    const targetAssignments = records.runtimeAssignments.filter((assignment) => assignment.serviceDayId === request.targetServiceDayId);
    const targetProfileIds = new Set(targetAssignments.map((assignment) => assignment.runtimeProfileId));
    const targetProfiles = records.runtimeProfiles.filter((profile) => targetProfileIds.has(profile.id));
    return buildTripCopyPreview(request, sourceDay, targetDay, records.patterns, sourceTrips, targetTrips, targetBlocks, targetAssignments, targetProfiles, this.now());
  }

  async applyTripCopy(preview: TripCopyPreview): Promise<TripCopyPreview> {
    const current = await this.previewTripCopy(preview.request);
    this.assertFreshCopyPreview(preview.sourceSignature.value, current.sourceSignature.value);
    this.assertNoCopyErrors(current.findings);
    if (!this.repository.replaceTripsForDayAtomically) throw new Error('Trip-copy persistence is unavailable.');
    await this.repository.replaceTripsForDayAtomically(preview);
    return preview;
  }

  async previewBatchPatternChange(request: BatchPatternChangeRequest): Promise<BatchPatternChangePreview> {
    const context = await this.loadBatchPatternChange(request);
    return context.preview;
  }

  async applyBatchPatternChange(preview: BatchPatternChangePreview): Promise<BatchPatternChangePreview> {
    const context = await this.loadBatchPatternChange(preview.request);
    this.assertFreshCopyPreview(preview.sourceSignature.value, context.preview.sourceSignature.value);
    this.assertNoCopyErrors(context.preview.findings);
    const currentById = new Map(context.trips.map((trip) => [trip.id, trip]));
    const updated = context.preview.changes.map((change) => {
      const trip = currentById.get(change.tripId)!;
      const targetProfile = context.profilesByTripId.get(change.tripId)!;
      const changed = applyPatternChange(trip, context.targetPattern, change, this.now());
      const revision = targetProfile.calculationRevision ?? 0;
      return { ...changed, provenance: { ...changed.provenance, creationMethod: changed.provenance.creationMethod ?? changed.provenance.kind, runtimeProfileId: targetProfile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: targetProfile.id, runtimeCalculationRevision: revision } } };
    });
    await this.atomicChanges()(updated);
    return context.preview;
  }

  private async copyRecords(scenarioId: string) {
    if (!this.repository.getScenarioRecords) throw new Error('Service-day copy persistence is unavailable.');
    const records = await this.repository.getScenarioRecords(scenarioId);
    if (!records) throw new Error('The selected Scenario is no longer available.');
    return records;
  }

  private assertFreshCopyPreview(expected: string, current: string): void {
    if (expected !== current) throw new ServiceDayCopyStalePreviewError();
  }

  private assertNoCopyErrors(findings: ValidationFinding[]): void {
    const errors = findings.filter((finding) => finding.severity === 'error');
    if (errors.length) throw new ServiceDayCopyValidationError(errors);
  }

  private async loadBatchPatternChange(request: BatchPatternChangeRequest): Promise<{ preview: BatchPatternChangePreview; trips: Trip[]; targetPattern: RoutePattern; profilesByTripId: Map<string, RuntimeProfile> }> {
    const findings = [] as ValidationFinding[];
    const trips = (await Promise.all([...new Set(request.tripIds)].map((id) => this.repository.getTrip(id)))).filter((trip): trip is Trip => Boolean(trip));
    if (trips.length !== new Set(request.tripIds).size) throw new Error('One or more selected trips are no longer available.');
    const targetPattern = await this.repository.getPattern(request.targetPatternId);
    if (!targetPattern) throw new Error('The selected target pattern is no longer available.');
    const records = await this.copyRecords(trips[0]?.scenarioId ?? '');
    const sourcePatternsByTripId = new Map(trips.map((trip) => [trip.id, records.patterns.find((pattern) => pattern.id === trip.patternId)]).filter((entry): entry is [string, RoutePattern] => Boolean(entry[1])));
    const profilesByTripId = new Map<string, RuntimeProfile>();
    const assignments: RuntimeAssignment[] = [];
    for (const trip of trips) {
      const sourcePattern = sourcePatternsByTripId.get(trip.id);
      if (!sourcePattern || sourcePattern.routeId !== targetPattern.routeId || sourcePattern.directionId !== targetPattern.directionId || trip.routeId !== targetPattern.routeId) continue;
      const assignment = records.runtimeAssignments.find((candidate) => candidate.patternId === targetPattern.id && candidate.serviceDayId === trip.serviceDayId);
      const profile = assignment ? records.runtimeProfiles.find((candidate) => candidate.id === assignment.runtimeProfileId) : undefined;
      if (assignment) assignments.push(assignment);
      if (profile) profilesByTripId.set(trip.id, profile);
    }
    const blocks = records.blocks.filter((block) => trips.some((trip) => trip.serviceDayId === block.serviceDayId));
    const preview = buildBatchPatternChangePreview(request, trips, targetPattern, profilesByTripId, blocks, assignments, [...profilesByTripId.values()], sourcePatternsByTripId);
    return { preview: { ...preview, findings: [...findings, ...preview.findings] }, trips, targetPattern, profilesByTripId };
  }

  async listStaleTrips(serviceDayId: string, tripProfileId?: string): Promise<Trip[]> {
    const trips = await this.repository.listTrips(serviceDayId, tripProfileId);
    const stale: Trip[] = [];
    for (const trip of trips) {
      const sourceProfileId = trip.provenance.calculationSource?.runtimeProfileId ?? trip.provenance.runtimeProfileId;
      const sourceRevision = trip.provenance.calculationSource?.runtimeCalculationRevision ?? trip.provenance.runtimeCalculationRevision;
      if (!sourceProfileId || sourceRevision === undefined) continue;
      const assignments = await this.repository.listRuntimeAssignments(trip.scenarioId, trip.serviceDayId, trip.patternId);
      const assignment = assignments[0];
      if (!assignment) continue;
      const profile = await this.repository.getRuntimeProfile(assignment.runtimeProfileId);
      if (!profile || assignment.runtimeProfileId !== sourceProfileId || (profile.calculationRevision ?? 0) !== sourceRevision) stale.push(trip);
    }
    return stale;
  }

  async listScheduleTrips(serviceDayId: string, directionId?: string, tripProfileId?: string): Promise<Trip[]> {
    const trips = await this.repository.listTrips(serviceDayId, tripProfileId);
    const patterns = await Promise.all([...new Set(trips.map((trip) => trip.patternId))].map(async (id) => [id, await this.repository.getPattern(id)] as const));
    const patternById = new Map(patterns.filter(([, pattern]) => pattern).map(([id, pattern]) => [id, pattern!]));
    const directionPatterns = [...patternById.values()]
      .filter((pattern) => !directionId || pattern.directionId === directionId)
      .sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id));
    // When patterns are interlaced, use the earliest timetable column shared by
    // every pattern in the direction. This keeps short-turn/offset patterns
    // ordered at the point where they actually run together, rather than by
    // their potentially different first points.
    let firstCommonColumnId: string | undefined;
    if (directionPatterns.length > 1) {
      const common = new Set(directionPatterns[0].points.map((point) => point.directionColumnId).filter((id): id is string => Boolean(id)));
      for (const pattern of directionPatterns.slice(1)) {
        const columns = new Set(pattern.points.map((point) => point.directionColumnId).filter((id): id is string => Boolean(id)));
        for (const id of [...common]) if (!columns.has(id)) common.delete(id);
      }
      firstCommonColumnId = [...directionPatterns[0].points].sort((left, right) => left.sequence - right.sequence)
        .find((point) => point.directionColumnId && common.has(point.directionColumnId))?.directionColumnId;
    }
    const scheduleTime = (trip: Trip): number => {
      const pattern = patternById.get(trip.patternId);
      if (firstCommonColumnId && pattern) {
        const point = pattern.points.find((candidate) => candidate.directionColumnId === firstCommonColumnId);
        const time = point && trip.stopTimes.find((stopTime) => stopTime.patternPointId === point.id)?.time;
        if (time !== undefined) return time;
      }
      return trip.stopTimes[0]?.time ?? Number.MAX_SAFE_INTEGER;
    };
    return trips.filter((trip) => !directionId || patternById.get(trip.patternId)?.directionId === directionId).sort((a, b) => {
      const timeDelta = scheduleTime(a) - scheduleTime(b);
      if (timeDelta) return timeDelta;
      const sequenceDelta = (patternById.get(a.patternId)?.sequence ?? Number.MAX_SAFE_INTEGER) - (patternById.get(b.patternId)?.sequence ?? Number.MAX_SAFE_INTEGER);
      return sequenceDelta || a.id.localeCompare(b.id);
    });
  }
}

export class TripRecalculationConfirmationError extends Error {
  constructor(readonly preview: RecalculationPreview) { super('Recalculation requires confirmation because manual changes or block references would be affected.'); this.name = 'TripRecalculationConfirmationError'; }
}

export class ServiceDayCopyStalePreviewError extends Error {
  constructor() { super('The service-day review is out of date. Review the impact again.'); this.name = 'ServiceDayCopyStalePreviewError'; }
}

export class ServiceDayCopyValidationError extends Error {
  constructor(readonly findings: ValidationFinding[]) { super('The service-day operation has validation errors.'); this.name = 'ServiceDayCopyValidationError'; }
}

export class TripShiftStalePreviewError extends Error {
  constructor() { super('The Trip shift review is out of date. Review the selected Trips again.'); this.name = 'TripShiftStalePreviewError'; }
}

// Keep the historical application surface while exposing the authoritative trip commands.
export type TripGenerationApplication = Pick<TripGenerationService, 'getGenerationSet' | 'listGenerationSets' | 'previewTripGeneration' | 'applyTripGeneration' | 'previewTripShift' | 'applyTripShift' | 'previewStagedTripShift' | 'applyStagedTripShift' | 'previewPatternChange' | 'applyPatternChange' | 'listServiceDayTrips' | 'validateTrip' | 'resolveRuntimeProfile' | 'previewGenerateTrips' | 'generateTrips' | 'addTrip' | 'previewTripPatternChange' | 'changeTripPattern' | 'previewRecalculateTrips' | 'recalculateTrips' | 'previewTripDeletion' | 'deleteTrips' | 'listStaleTrips' | 'listScheduleTrips' | 'listTripProfiles' | 'ensureDefaultTripProfile' | 'renameTripProfile' | 'copyTripProfile' | 'previewTripProfileDeletion' | 'deleteTripProfile' | 'previewRuntimeCopy' | 'applyRuntimeCopy' | 'previewTripCopy' | 'applyTripCopy' | 'previewBatchPatternChange' | 'applyBatchPatternChange'>;
