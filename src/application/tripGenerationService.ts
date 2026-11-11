import type { TripGenerationRepository } from './ports';
import type { GenerateTripsPreview, PatternChangePreview, RecalculationPreview, RecalculationReview, RecalculationReviewInputs, TripReviewRow } from '../domain/trips';
import { adjustBlockReferences, ANCHOR_DIAGNOSIS_RULE_IDS, AnchorBandChoiceError, applyPatternChange, calculateRecalculationConnections, calculateRecalculationImpact, createAuthoritativeTrip, findExactTripDuplicates, generateAuthoritativeTrips, generateTrips, markTripRecalculated, previewPatternChange, recalculateTripWithAnchor, sharedAnchorNodes, shiftTrips, TripGenerationError, validateGenerateTripsRequest, validateTrip, type RecalculationBandSelection } from '../domain/trips';
import { diagnoseAnchor, type AnchorDiagnosis } from '../domain/anchorDiagnosis';
import type { AddTripRequest, Block, BlockingScenario, GenerateTripsRequest, ServiceSeconds, RuntimeAssignment, RuntimeProfile, RoutePattern, Trip, TripGenerationSet, TripProfile, TripRegenerationUndo, TripTableImportRow, ValidationFinding } from '../domain/types';
import type { TripTableImportPreview } from './ports';
import { assertReviewCurrent, fingerprint } from './reviewToken';
import { publishWrites, SaveStatusPublisher } from './saveStatus';
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
  /** Blocking Scenarios built on the profile. They are deleted with it, together with their Blocks. */
  blockingScenarioCount: number;
  isLastProfile: boolean;
  /** Fingerprint of everything this review covers; `deleteTripProfile` requires it. */
  previewToken: string;
}

/** The review covers the profile, the other profiles (whether it is the last), and every Trip, Block, and Blocking Scenario that the deletion removes. */
function tripProfileDeletionToken(profile: TripProfile, profiles: TripProfile[], trips: Trip[], blocks: Block[], blockingScenarios: BlockingScenario[], staleTripIds: string[]): string {
  return fingerprint({ profile: [profile], profiles, trips, blocks, blockingScenarios, staleTrips: staleTripIds.map((id) => ({ id })) });
}

function hasSameScheduledPoints(trip: Trip, recalculated: Trip): boolean {
  return trip.stopTimes.length === recalculated.stopTimes.length
    && trip.stopTimes.every((point, index) => {
      const next = recalculated.stopTimes[index];
      return point.patternPointId === next.patternPointId
        && point.sequence === next.sequence
        && point.time === next.time;
    });
}

/** A single-Trip Pattern change review. `sourceSignature` records what the review read; the commit recomputes it and rejects a mismatch. The anchor and band choice are review inputs (Decision 0067), not stored on the Trip. */
export interface TripPatternChangeReview extends PatternChangePreview { anchorNodeId?: string; chosenBandId?: string; /** The planner's time at the anchor node. Named apart from `PatternChangePreview.anchorTime`, which is the kept time. */ anchorTimeInput?: ServiceSeconds; sourceSignature?: string }

/** One Trip's result from `recalculateEach`: either a recalculated Trip or a Trip-generation error (Decision 0071). */
interface RecalculationOutcome { trip: Trip; result?: ReturnType<typeof recalculateTripWithAnchor>; error?: TripGenerationError; profile?: RuntimeProfile; /** The Trip as recalculated: the saved Trip, or with the planner's anchor time at the anchor point. Set once the Pattern is read (Decision 0072). */ seed?: Trip; pattern?: RoutePattern }

/** The review inputs that choose the anchor node and the band (Decision 0067). */
export interface TripPatternChangeInputs { anchorNodeId?: string; chosenBandId?: string; anchorTime?: ServiceSeconds }

/** What a Pattern change review depends on: the Trip, the source Pattern's node ids, the target Pattern's shape, the profile that will calculate it, and the review inputs. */
function tripPatternChangeSignature(trip: Trip, source: RoutePattern | undefined, target: RoutePattern, assignment: RuntimeAssignment, profile: RuntimeProfile, inputs: TripPatternChangeInputs): string {
  return JSON.stringify({
    trip,
    source: source ? source.points.map((point) => [point.id, point.nodeId, point.sequence]) : null,
    target: [target.id, target.routeId, target.directionId, target.points.map((point) => [point.id, point.sequence])],
    assignment: [assignment.id, assignment.runtimeProfileId],
    profile,
    anchorNodeId: inputs.anchorNodeId ?? null,
    chosenBandId: inputs.chosenBandId ?? null,
    anchorTime: inputs.anchorTime ?? null,
  });
}

/** What a Trips CSV review depends on: every Trip of the schedule and every Pattern those Trips or the CSV rows use. */
function tripTableImportSignature(trips: Trip[], patterns: Map<string, RoutePattern | undefined>): string {
  const byId = (left: unknown[], right: unknown[]) => String(left[0]).localeCompare(String(right[0]));
  return JSON.stringify({
    trips: trips.map((trip) => [trip.id, trip.updatedAt, trip.patternId, trip.stopTimes]).sort(byId),
    patterns: [...patterns.values()].filter((pattern): pattern is RoutePattern => Boolean(pattern)).map((pattern) => [pattern.id, pattern.routeId, pattern.directionId, pattern.points.map((point) => [point.id, point.sequence])]).sort(byId),
  });
}

/** The `TripGenerationRepository` methods that write. Every call to one is published through the save-status publisher. */
export const TRIP_GENERATION_WRITE_METHODS: readonly string[] = [
  'saveGenerationSet', 'saveTrips', 'replaceGenerationSet', 'insertTripsAtomically', 'saveTripChangesAtomically',
  'saveRegeneratedTripsWithUndo', 'restoreLastTripRegenerationUndo', 'deleteTripsAtomically', 'saveTripProfile', 'copyTripProfileAtomically',
  'deleteTripProfile', 'commitRuntimeCopyAtomically', 'replaceTripsForDayAtomically',
];

/** Application coordinator for the historical and authoritative trip workflows. */
export class TripGenerationService {
  private readonly repository: TripGenerationRepository;

  /** `saveStatus` is the one publisher of the visible save status, shared with the other services that write (Decision 0001, amendment). */
  constructor(repository: TripGenerationRepository, private readonly now: () => string = () => new Date().toISOString(), saveStatus: SaveStatusPublisher = new SaveStatusPublisher(now)) {
    this.repository = publishWrites(repository, saveStatus, TRIP_GENERATION_WRITE_METHODS);
  }

  async listTripProfiles(scenarioId: string): Promise<TripProfile[]> { return this.repository.listTripProfiles ? this.repository.listTripProfiles(scenarioId) : []; }
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
    const staleTripIds = new Set<string>();
    for (const serviceDayId of new Set(trips.map((trip) => trip.serviceDayId))) {
      for (const staleTrip of await this.listStaleTrips(serviceDayId, profileId)) staleTripIds.add(staleTrip.id);
    }
    const staleTripCount = staleTripIds.size;
    const records = this.repository.getScenarioRecords ? await this.repository.getScenarioRecords(profile.scenarioId) : undefined;
    const blockingScenarios = (records?.blockingScenarios ?? []).filter((blockingScenario) => blockingScenario.tripProfileId === profileId);
    const preview = { profileId, tripCount: trips.length, manuallyAdjustedTripCount: trips.filter((trip) => trip.provenance.manuallyChangedFields.length > 0).length, staleTripCount, blockCount: blocks.length, blockActivityCount: blocks.reduce((sum, block) => sum + block.activities.length, 0), blockingScenarioCount: blockingScenarios.length, isLastProfile: profiles.length <= 1 };
    return { ...preview, previewToken: tripProfileDeletionToken(profile, profiles, trips, blocks, blockingScenarios, [...staleTripIds]) };
  }
  /** Deletes the profile only if the stored data still matches the review (`previewTripProfileDeletion`) that `previewToken` came from. */
  async deleteTripProfile(profileId: string, previewToken: string): Promise<void> {
    const preview = await this.previewTripProfileDeletion(profileId); assertReviewCurrent('Trip profile', previewToken, preview.previewToken); if (preview.isLastProfile) throw new Error('Create another Trip profile before deleting the only profile.'); if (!this.repository.deleteTripProfile) throw new Error('Trip profile persistence is unavailable.'); await this.repository.deleteTripProfile(profileId);
  }
  private async findTripProfile(profileId: string): Promise<TripProfile> { const profile = this.repository.getTripProfile ? await this.repository.getTripProfile(profileId) : undefined; if (profile) return profile; throw new Error('The selected Trip profile is no longer available.'); }

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
  /** The saved Trips of one Route on one service day in one Trip Profile, both directions (Decision 0051: the Trips table's day totals). */
  async listRouteDayTrips(routeId: string, serviceDayId: string, tripProfileId?: string): Promise<Trip[]> { return (await this.repository.listTrips(serviceDayId, tripProfileId)).filter((trip) => trip.routeId === routeId); }

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

  /** Writes Trips and the one-step undo snapshot together (Decision 0070): a regeneration or a pattern change replaces the saved undo. */
  private async persistWithUndo(beforeTrips: Trip[], afterTrips: Trip[], kind: NonNullable<TripRegenerationUndo['kind']>): Promise<void> {
    if (!this.repository.saveRegeneratedTripsWithUndo) { await this.atomicChanges()(afterTrips); return; }
    const firstTrip = beforeTrips[0];
    if (!firstTrip?.tripProfileId) { await this.atomicChanges()(afterTrips); return; }
    const snapshot: TripRegenerationUndo = { id: 'last', scenarioId: firstTrip.scenarioId, tripProfileId: firstTrip.tripProfileId, createdAt: this.now(), beforeTrips, afterTrips, kind };
    await this.repository.saveRegeneratedTripsWithUndo(beforeTrips, afterTrips, snapshot);
  }

  async getLastTripRegenerationUndo(): Promise<TripRegenerationUndo | undefined> {
    return this.repository.getLastTripRegenerationUndo?.();
  }

  async undoLastTripRegeneration(): Promise<Trip[]> {
    if (!this.repository.restoreLastTripRegenerationUndo) throw new Error('Regeneration undo is unavailable in this storage provider.');
    return this.repository.restoreLastTripRegenerationUndo();
  }

  async previewTripTableImport(context: TripTableImportPreview['context'], rows: TripTableImportRow[]): Promise<TripTableImportPreview> {
    if (!rows.length) throw new Error('The CSV contains no Trip rows.');
    const source = await this.readTripTableImportSource(context, rows.map((row) => row.patternId));
    // Only Trips of the displayed Direction can be updated; a Trip ID from the other Direction is not part of this schedule.
    const existingById = new Map(source.contextTrips.filter((trip) => source.patterns.get(trip.patternId)?.directionId === context.directionId).map((trip) => [trip.id, trip]));
    const usedIds = new Set<string>();
    const findings: ValidationFinding[] = [];
    const imported: Trip[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    for (const row of rows) {
      if (row.tripId && usedIds.has(row.tripId)) {
        findings.push({ ruleId: 'trip.csvDuplicateId', severity: 'error', entityType: 'trip', entityId: row.tripId, field: 'id', messageKey: 'trip.csvDuplicateId' });
        continue;
      }
      if (row.tripId) usedIds.add(row.tripId);
      const pattern = source.patterns.get(row.patternId);
      if (!pattern || pattern.scenarioId !== context.scenarioId || pattern.routeId !== context.routeId || pattern.directionId !== context.directionId) {
        findings.push({ ruleId: 'trip.csvPatternInvalid', severity: 'error', entityType: 'trip', entityId: row.tripId ?? row.patternId, field: 'patternId', messageKey: 'trip.csvPatternInvalid' });
        continue;
      }
      const existing = row.tripId ? existingById.get(row.tripId) : undefined;
      if (row.tripId && !existing) {
        findings.push({ ruleId: 'trip.csvTripInvalid', severity: 'error', entityType: 'trip', entityId: row.tripId, field: 'id', messageKey: 'trip.csvTripInvalid' });
        continue;
      }
      const timesByPoint = new Map(row.stopTimes.map((point) => [point.patternPointId, point.time]));
      const stopTimes = pattern.points.map((point, sequence) => ({ patternPointId: point.id, sequence, time: timesByPoint.get(point.id) ?? Number.NaN }));
      if (timesByPoint.size !== pattern.points.length || row.stopTimes.some((point) => !pattern.points.some((candidate) => candidate.id === point.patternPointId))) {
        findings.push({ ruleId: 'trip.csvPointSetInvalid', severity: 'error', entityType: 'trip', entityId: row.tripId ?? row.patternId, field: 'stopTimes', messageKey: 'trip.csvPointSetInvalid' });
        continue;
      }
      const base: Trip = existing ?? {
        id: row.tripId ?? newId(), scenarioId: context.scenarioId, routeId: context.routeId, serviceDayId: context.serviceDayId,
        patternId: pattern.id, tripProfileId: context.tripProfileId, stopTimes: [],
        provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...metadata(this.now()),
      };
      const trip: Trip = {
        ...base, patternId: pattern.id, publicLabel: row.publicLabel?.trim() || undefined, stopTimes,
        provenance: existing ? {
          ...existing.provenance,
          manuallyChangedFields: [...new Set([...existing.provenance.manuallyChangedFields,
            ...(existing.patternId !== pattern.id ? ['patternId' as const] : []),
            ...(JSON.stringify(existing.stopTimes) !== JSON.stringify(stopTimes) ? ['times' as const] : []),
          ])],
          manualTimeShiftSeconds: undefined,
        } : base.provenance,
        createdAt: existing?.createdAt ?? base.createdAt,
        updatedAt: this.now(),
      };
      const tripFindings = validateTrip(trip, pattern);
      findings.push(...tripFindings);
      imported.push(trip);
      if (existing) updatedCount += 1; else createdCount += 1;
    }
    return { context, rows, trips: imported, createdCount, updatedCount, findings, sourceSignature: source.signature };
  }

  private async readTripTableImportSource(context: TripTableImportPreview['context'], rowPatternIds: string[]) {
    const allContextTrips = await this.repository.listTrips(context.serviceDayId, context.tripProfileId);
    const contextTrips = allContextTrips.filter((trip) => trip.routeId === context.routeId && trip.scenarioId === context.scenarioId);
    const patterns = new Map<string, RoutePattern | undefined>();
    for (const id of new Set([...contextTrips.map((trip) => trip.patternId), ...rowPatternIds])) patterns.set(id, await this.repository.getPattern(id));
    return { contextTrips, patterns, signature: tripTableImportSignature(contextTrips, patterns) };
  }

  async applyTripTableImport(preview: TripTableImportPreview): Promise<TripTableImportPreview> {
    if (preview.findings.some((finding) => finding.severity === 'error') || !preview.trips.length) throw new Error('Fix the CSV issues before importing Trips.');
    const current = await this.readTripTableImportSource(preview.context, preview.rows.map((row) => row.patternId));
    if (current.signature !== preview.sourceSignature) throw new Error('The schedule changed while the CSV was being reviewed. Import it again.');
    await this.atomicChanges()(preview.trips);
    return preview;
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

  /** Preview a same-direction pattern change using the target pattern's assignment. `anchorNodeId` keeps that node's time (Decision 0067); `chosenBandId` resolves a single-band ambiguity. */
  async previewTripPatternChange(tripId: string, targetPatternId: string, directionId: string, options: TripPatternChangeInputs = {}): Promise<TripPatternChangeReview> {
    const trip = await this.repository.getTrip(tripId);
    if (!trip) throw new Error('The selected trip is no longer available.');
    const source = await this.repository.getPattern(trip.patternId);
    const target = await this.repository.getPattern(targetPatternId);
    if (!target) throw new Error('The selected pattern is no longer available.');
    const blocks = await this.repository.listBlocks(trip.serviceDayId);
    const affectedBlockIds = blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === trip.id)).map((block) => block.id);
    if ((source?.directionId !== undefined && source.directionId !== directionId) || target.directionId !== directionId) return { tripId, sourcePatternId: trip.patternId, targetPatternId, oldStopTimes: [...trip.stopTimes], affectedBlockIds, finding: { ruleId: 'trip.patternDirectionMismatch', severity: 'error', entityType: 'trip', entityId: trip.id, field: 'patternId', messageKey: 'trip.patternDirectionMismatch' } };
    const inputs: TripPatternChangeInputs = { anchorNodeId: options.anchorNodeId, chosenBandId: options.chosenBandId, anchorTime: options.anchorTime };
    const { assignment, profile } = await this.resolveAuthoritativeProfile({ scenarioId: trip.scenarioId, serviceDayId: trip.serviceDayId, patternId: targetPatternId });
    const preview = previewPatternChange(trip, target, profile, { sourcePattern: source, ...inputs, now: this.now() });
    // The review records the inputs it was built with, so the commit signature covers them even when the domain returns a finding.
    return { ...preview, ...(inputs.anchorNodeId === undefined ? {} : { anchorNodeId: inputs.anchorNodeId }), ...(inputs.chosenBandId === undefined ? {} : { chosenBandId: inputs.chosenBandId }), ...(inputs.anchorTime === undefined ? {} : { anchorTimeInput: inputs.anchorTime }), affectedBlockIds, sourceSignature: tripPatternChangeSignature(trip, source, target, assignment, profile, inputs) };
  }

  async changeTripPattern(preview: TripPatternChangeReview): Promise<Trip> {
    const trip = await this.repository.getTrip(preview.tripId);
    const target = await this.repository.getPattern(preview.targetPatternId);
    if (!trip || !target) throw new Error('The selected trip or pattern is no longer available.');
    const source = await this.repository.getPattern(trip.patternId);
    if (target.routeId !== trip.routeId) throw new TripGenerationError([{ ruleId: 'trip.patternRouteMismatch', severity: 'error', entityType: 'trip', entityId: trip.id, field: 'patternId', messageKey: 'trip.patternRouteMismatch' }]);
    if (source?.directionId !== undefined && target.directionId !== source.directionId) throw new TripGenerationError([{ ruleId: 'trip.patternDirectionMismatch', severity: 'error', entityType: 'trip', entityId: trip.id, field: 'patternId', messageKey: 'trip.patternDirectionMismatch' }]);
    const { assignment, profile } = await this.resolveAuthoritativeProfile({ scenarioId: trip.scenarioId, serviceDayId: trip.serviceDayId, patternId: target.id });
    // The review was built from the Trip, the source and target Patterns, the target profile, and its anchor and band choice as they were then. Commit only if they still are.
    const inputs: TripPatternChangeInputs = { anchorNodeId: preview.anchorNodeId, chosenBandId: preview.chosenBandId, anchorTime: preview.anchorTimeInput };
    if (!preview.sourceSignature || preview.sourceSignature !== tripPatternChangeSignature(trip, source, target, assignment, profile, inputs)) throw new TripPatternChangeStalePreviewError();
    // Recalculate with the review's anchor and band against the Trip's current source Pattern. A finding here throws in applyPatternChange.
    const recalculated = previewPatternChange(trip, target, profile, { sourcePattern: source, ...inputs, now: this.now() });
    const updated = applyPatternChange(trip, target, recalculated, this.now());
    const revision = profile.calculationRevision ?? 0;
    const sourced = { ...updated, provenance: { ...updated.provenance, creationMethod: updated.provenance.creationMethod ?? updated.provenance.kind, runtimeProfileId: profile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: profile.id, runtimeCalculationRevision: revision } } };
    await this.persistWithUndo([trip], [sourced], 'patternChange');
    return sourced;
  }

  /** Nodes that the Trip's current Pattern and the target Pattern both serve, in the target's order, each at its first visit (Decision 0067 item 2). Names come from the Scenario's Nodes. */
  async listSharedAnchorNodes(tripId: string, targetPatternId: string): Promise<{ nodeId: string; name: string }[]> {
    const trip = await this.repository.getTrip(tripId);
    if (!trip) throw new Error('The selected trip is no longer available.');
    const source = await this.repository.getPattern(trip.patternId);
    const target = await this.repository.getPattern(targetPatternId);
    if (!source || !target) throw new Error('The selected pattern is no longer available.');
    const records = this.repository.getScenarioRecords ? await this.repository.getScenarioRecords(trip.scenarioId) : undefined;
    if (!records) throw new Error('The selected Scenario is no longer available.');
    const names = new Map(records.nodes.map((node) => [node.id, node.name]));
    // A node with no record is listed by its id, so a data gap does not hide the anchor choice.
    return sharedAnchorNodes(source, target).map((nodeId) => ({ nodeId, name: names.get(nodeId) ?? nodeId }));
  }

  /**
   * Recalculates each Trip and keeps one outcome per Trip (Decision 0071). A Trip-generation error, including an anchor band choice, is kept on the
   * Trip's outcome; any other error is thrown. With `stopAtBandChoice`, the loop ends at the first anchor band choice, so the single-result review
   * reports exactly what it reported before the outcomes existed.
   */
  private async recalculateEach(trips: Trip[], anchorByTripId: Record<string, string>, bandOverrideByTripId: Record<string, string>, anchorTimeByTripId: Record<string, number>, stopAtBandChoice: boolean): Promise<{ sources: unknown[]; outcomes: RecalculationOutcome[] }> {
    const sources: unknown[] = [];
    const outcomes: RecalculationOutcome[] = [];
    // One read of the Pattern, assignment, and profile per Pattern and service day, not per Trip: at 500 Trips the reads one after another
    // took most of a second (U08, I-096). A failed read fails each of its Trips as before.
    const resolved = new Map<string, ReturnType<TripGenerationService['resolveAuthoritativeProfile']>>();
    for (const trip of trips) {
      let runtimeProfile: RuntimeProfile | undefined;
      let runtimePattern: RoutePattern | undefined;
      let runtimeSeed: Trip | undefined;
      try {
        const key = JSON.stringify([trip.scenarioId, trip.serviceDayId, trip.patternId]);
        if (!resolved.has(key)) resolved.set(key, this.resolveAuthoritativeProfile({ scenarioId: trip.scenarioId, serviceDayId: trip.serviceDayId, patternId: trip.patternId }));
        const resolution = await resolved.get(key)!;
        const { pattern, profile, assignment } = resolution;
        runtimeProfile = profile;
        runtimePattern = pattern;
        sources.push([trip, pattern, profile, assignment]);
        // A new anchor time replaces the Trip's time at the anchor point, and the other points are calculated around it, as when adding a Trip.
        const newAnchorTime = anchorTimeByTripId[trip.id];
        const anchorPointId = anchorByTripId[trip.id];
        const seed = newAnchorTime === undefined || !anchorPointId ? trip : { ...trip, stopTimes: trip.stopTimes.map((point) => point.patternPointId === anchorPointId ? { ...point, time: newAnchorTime } : point) };
        runtimeSeed = seed;
        const result = recalculateTripWithAnchor(seed, pattern, profile, this.now(), anchorPointId, bandOverrideByTripId[trip.id]);
        outcomes.push({ trip, result, profile, seed, pattern });
      } catch (error) {
        if (!(error instanceof TripGenerationError)) throw error;
        outcomes.push({ trip, error, profile: runtimeProfile, seed: runtimeSeed, pattern: runtimePattern });
        if (stopAtBandChoice && error instanceof AnchorBandChoiceError) break;
      }
    }
    return { sources, outcomes };
  }

  async previewRecalculateTrips(tripIds: string[], anchorByTripId: Record<string, string> = {}, bandOverrideByTripId: Record<string, string> = {}, anchorTimeByTripId: Record<string, number> = {}): Promise<RecalculationPreview> {
    const trips = (await Promise.all(tripIds.map((id) => this.repository.getTrip(id)))).filter((trip): trip is Trip => Boolean(trip));
    if (trips.length !== tripIds.length) throw new Error('One or more selected trips are no longer available.');
    const blocksByDay = new Map<string, Block[]>();
    for (const trip of trips) if (!blocksByDay.has(trip.serviceDayId)) blocksByDay.set(trip.serviceDayId, await this.repository.listBlocks(trip.serviceDayId));
    const blocks = [...blocksByDay.values()].flat();
    const { sources, outcomes } = await this.recalculateEach(trips, anchorByTripId, bandOverrideByTripId, anchorTimeByTripId, true);
    // The first anchor band choice in Trip order is thrown as before; other Trip-generation errors are collected in Trip order.
    const bandChoice = outcomes.find((outcome) => outcome.error instanceof AnchorBandChoiceError);
    if (bandChoice) throw bandChoice.error;
    const findings = outcomes.flatMap((outcome) => outcome.error ? outcome.error.findings.map((finding) => ({ ...finding, entityType: 'trip' as const, entityId: outcome.trip.id })) : []);
    if (findings.length) throw new TripGenerationError(findings);
    const recalculated = outcomes.flatMap((outcome) => outcome.result ? [outcome.result.trip] : []);
    const bandSelections: RecalculationBandSelection[] = outcomes.flatMap((outcome) => outcome.result?.bandSelection ? [outcome.result.bandSelection] : []);
    const selectedIds = new Set(tripIds);
    const relevantBlocks = blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && selectedIds.has(activity.tripId)));
    const connectedIds = [...new Set(relevantBlocks.flatMap((block) => block.activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => activity.tripId)))].filter((id) => !selectedIds.has(id));
    const connectedTrips = (await Promise.all(connectedIds.map((id) => this.repository.getTrip(id)))).filter((trip): trip is Trip => Boolean(trip));
    const connectionTrips = [...trips, ...connectedTrips];
    const connectionPatternIds = [...new Set(connectionTrips.map((trip) => trip.patternId))];
    const connectionPatterns = (await Promise.all(connectionPatternIds.map((id) => this.repository.getPattern(id)))).filter((pattern): pattern is RoutePattern => Boolean(pattern));
    const connectionReview = calculateRecalculationConnections(trips, recalculated, connectionTrips, relevantBlocks, connectionPatterns);
    return { trips: recalculated, impact: calculateRecalculationImpact(trips, blocks), connections: connectionReview.connections, findings: connectionReview.findings, bandSelections, anchorByTripId: { ...anchorByTripId }, bandOverrideByTripId: { ...bandOverrideByTripId }, anchorTimeByTripId: { ...anchorTimeByTripId }, sourceSignature: JSON.stringify([sources, blocks, connectedTrips, connectionPatterns]) };
  }

  async applyRecalculationPreview(preview: RecalculationPreview, confirm = false): Promise<RecalculationPreview> {
    if (!preview.sourceSignature || !preview.trips.length) throw new Error('Review the selected trips before regenerating.');
    const current = await this.previewRecalculateTrips(preview.impact.tripIds, preview.anchorByTripId, preview.bandOverrideByTripId, preview.anchorTimeByTripId);
    if (current.sourceSignature !== preview.sourceSignature) throw new Error('Trips or runtimes changed. Review regeneration again.');
    if (current.findings.some((finding) => finding.severity === 'error')) throw new TripGenerationError(current.findings);
    if (current.impact.requiresConfirmation && !confirm) throw new TripRecalculationConfirmationError(current);
    const beforeTrips = (await Promise.all(current.trips.map((trip) => this.repository.getTrip(trip.id)))).filter((trip): trip is Trip => Boolean(trip));
    if (beforeTrips.length !== current.trips.length) throw new Error('A selected Trip changed. Review regeneration again.');
    await this.persistWithUndo(beforeTrips, current.trips, 'regeneration');
    return current;
  }

  /** Decision 0072 item 2: the diagnosis of a failed anchor, from the seed this review recalculated. Undefined when the failure is not an anchor failure. */
  private anchorDiagnosisOf(outcome: RecalculationOutcome, anchorPointId: string | undefined): AnchorDiagnosis | undefined {
    if (!anchorPointId || !outcome.seed || !outcome.pattern || !outcome.profile || !outcome.error) return undefined;
    if (!outcome.error.findings.some((finding) => ANCHOR_DIAGNOSIS_RULE_IDS.has(finding.ruleId))) return undefined;
    return diagnoseAnchor(outcome.seed, outcome.pattern, outcome.profile, anchorPointId, this.now());
  }

  /**
   * Reviews a recalculation Trip by Trip (Decision 0071). Each requested Trip gets one row: `ready`, `needsChoice` (an anchor band choice the planner can pick),
   * `error`, or `skipped`. Only a request-level problem (a missing Trip) throws. The result's `trips`, `impact`, `connections`, and `findings` cover the ready Trips.
   */
  async reviewRecalculation(tripIds: string[], inputs: RecalculationReviewInputs = {}): Promise<RecalculationReview> {
    const trips = (await Promise.all(tripIds.map((id) => this.repository.getTrip(id)))).filter((trip): trip is Trip => Boolean(trip));
    if (trips.length !== tripIds.length) throw new Error('One or more selected trips are no longer available.');
    const blocksByDay = new Map<string, Block[]>();
    for (const trip of trips) if (!blocksByDay.has(trip.serviceDayId)) blocksByDay.set(trip.serviceDayId, await this.repository.listBlocks(trip.serviceDayId));
    const blocks = [...blocksByDay.values()].flat();
    const anchorByTripId = inputs.anchorByTripId ?? {};
    const bandOverrideByTripId = inputs.bandOverrideByTripId ?? {};
    const anchorTimeByTripId = inputs.anchorTimeByTripId ?? {};
    const skippedIds = new Set(inputs.skipTripIds ?? []);
    const { sources, outcomes } = await this.recalculateEach(trips.filter((trip) => !skippedIds.has(trip.id)), anchorByTripId, bandOverrideByTripId, anchorTimeByTripId, false);
    const outcomeByTripId = new Map(outcomes.map((outcome) => [outcome.trip.id, outcome]));
    const rows: TripReviewRow[] = trips.map((trip): TripReviewRow => {
      if (skippedIds.has(trip.id)) return { tripId: trip.id, status: 'skipped', findings: [] };
      const outcome = outcomeByTripId.get(trip.id)!;
      if (outcome.result) return { tripId: trip.id, status: 'ready', revisedTrip: outcome.result.trip, findings: [], ...(outcome.result.bandSelection ? { bandSelection: outcome.result.bandSelection } : {}) };
      const error = outcome.error!;
      const findings = error.findings.map((finding) => ({ ...finding, entityType: 'trip' as const, entityId: trip.id }));
      const diagnosis = this.anchorDiagnosisOf(outcome, anchorByTripId[trip.id]);
      if (error instanceof AnchorBandChoiceError) {
        const bandPickable = outcome.profile !== undefined && (outcome.profile.calculationMethod === undefined || outcome.profile.calculationMethod === 'singleBand');
        return { tripId: trip.id, status: bandPickable ? 'needsChoice' : 'error', findings, bandChoices: error.choices, bandPickable, ...(diagnosis ? { diagnosis } : {}) };
      }
      return { tripId: trip.id, status: 'error', findings, ...(diagnosis ? { diagnosis } : {}) };
    });
    const readyIds = new Set(rows.filter((row) => row.status === 'ready').map((row) => row.tripId));
    const readyTrips = trips.filter((trip) => readyIds.has(trip.id));
    const revisedTrips = rows.flatMap((row) => row.status === 'ready' && row.revisedTrip ? [row.revisedTrip] : []);
    const bandSelections = rows.flatMap((row) => row.bandSelection ? [row.bandSelection] : []);
    const skippedTrips = trips.filter((trip) => skippedIds.has(trip.id));
    // Skipped and failed Trips stay in the connection check as unchanged neighbors: their saved times are read, and they are not revised.
    const selectedIds = new Set(tripIds);
    const relevantBlocks = blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && selectedIds.has(activity.tripId)));
    const connectedIds = [...new Set(relevantBlocks.flatMap((block) => block.activities.filter((activity) => activity.type === 'revenueTrip').map((activity) => activity.tripId)))].filter((id) => !selectedIds.has(id));
    const connectedTrips = (await Promise.all(connectedIds.map((id) => this.repository.getTrip(id)))).filter((trip): trip is Trip => Boolean(trip));
    const connectionTrips = [...trips, ...connectedTrips];
    const connectionPatternIds = [...new Set(connectionTrips.map((trip) => trip.patternId))];
    const connectionPatterns = (await Promise.all(connectionPatternIds.map((id) => this.repository.getPattern(id)))).filter((pattern): pattern is RoutePattern => Boolean(pattern));
    const connectionReview = calculateRecalculationConnections(readyTrips, revisedTrips, connectionTrips, relevantBlocks, connectionPatterns);
    return {
      trips: revisedTrips,
      impact: calculateRecalculationImpact(readyTrips, blocks),
      connections: connectionReview.connections,
      findings: connectionReview.findings,
      bandSelections,
      anchorByTripId: { ...anchorByTripId },
      bandOverrideByTripId: { ...bandOverrideByTripId },
      anchorTimeByTripId: { ...anchorTimeByTripId },
      // The skipped Trips' stored records are part of the signature: they are neighbors in the connection check, so an edit to one changes the review.
      sourceSignature: JSON.stringify([sources, blocks, connectedTrips, connectionPatterns, skippedTrips, [...skippedIds].sort(), rows.map((row) => [row.tripId, row.status])]),
      rows,
      requestedTripIds: tripIds,
      inputs: { ...inputs },
    };
  }

  /** Writes the ready Trips that are not skipped, with the undo snapshot in one transaction (Decision 0071). Refused when the review is stale or no Trip is ready. */
  async applyRecalculationReview(review: RecalculationReview, confirm = false): Promise<RecalculationReview> {
    const current = await this.reviewRecalculation(review.requestedTripIds, review.inputs);
    if (current.sourceSignature !== review.sourceSignature) throw new Error('Trips or runtimes changed. Review regeneration again.');
    if (!current.trips.length) throw new Error('No trips are ready to regenerate.');
    if (current.impact.requiresConfirmation && !confirm) throw new TripRecalculationConfirmationError(current);
    const beforeTrips = (await Promise.all(current.trips.map((trip) => this.repository.getTrip(trip.id)))).filter((trip): trip is Trip => Boolean(trip));
    if (beforeTrips.length !== current.trips.length) throw new Error('A selected Trip changed. Review regeneration again.');
    await this.persistWithUndo(beforeTrips, current.trips, 'regeneration');
    return current;
  }

  async recalculateTrips(tripIds: string[], confirm = false): Promise<{ trips: Trip[]; impact: RecalculationPreview['impact'] }> {
    const preview = await this.previewRecalculateTrips(tripIds);
    if (preview.findings.some((finding) => finding.severity === 'error')) throw new TripGenerationError(preview.findings);
    if (preview.impact.requiresConfirmation && !confirm) throw new TripRecalculationConfirmationError(preview);
    const beforeTrips = (await Promise.all(preview.trips.map((trip) => this.repository.getTrip(trip.id)))).filter((trip): trip is Trip => Boolean(trip));
    if (beforeTrips.length !== preview.trips.length) throw new Error('A selected Trip changed. Review regeneration again.');
    await this.persistWithUndo(beforeTrips, preview.trips, 'regeneration');
    return preview;
  }

  /** Report trip and block impact before the user confirms deletion. `reviewToken` covers the Trips and every Block that would change. */
  async previewTripDeletion(tripIds: string[]): Promise<{ deletedTripIds: string[]; affectedBlockIds: string[]; reviewToken: string }> {
    const uniqueIds = [...new Set(tripIds)];
    if (!uniqueIds.length) return { deletedTripIds: [], affectedBlockIds: [], reviewToken: fingerprint({}) };
    const trips = await Promise.all(uniqueIds.map((id) => this.repository.getTrip(id)));
    if (trips.some((trip) => !trip)) throw new Error('One or more selected trips are no longer available.');
    const serviceDayIds = new Set((trips as Trip[]).map((trip) => trip.serviceDayId));
    if (serviceDayIds.size !== 1) throw new Error('Trips from different service days must be deleted separately.');
    const blocks = await this.repository.listBlocks((trips[0] as Trip).serviceDayId);
    const adjusted = adjustBlockReferences(blocks, uniqueIds);
    const affectedBlockIds = adjusted.adjustments.map((adjustment) => adjustment.blockId);
    return { deletedTripIds: uniqueIds, affectedBlockIds, reviewToken: fingerprint({ trips: trips as Trip[], blocks: blocks.filter((block) => affectedBlockIds.includes(block.id)) }) };
  }

  /** Delete one or more saved trips and remove their revenue activities from affected blocks, only if the stored data still matches the review that `reviewToken` came from. */
  async deleteTrips(tripIds: string[], reviewToken: string): Promise<{ deletedTripIds: string[]; affectedBlockIds: string[]; reviewToken: string }> {
    const preview = await this.previewTripDeletion(tripIds);
    assertReviewCurrent('Trip', reviewToken, preview.reviewToken);
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
    // Skipped Trips and Trips with a finding are not written (Decision 0071 item 2). A finding on an unskipped Trip has already refused the apply above.
    const writable = context.preview.changes.filter((change) => !change.skipped && !change.finding && change.newStopTimes);
    if (!writable.length) throw new Error('No trips are ready to change.');
    const updated = writable.map((change) => {
      const trip = currentById.get(change.tripId)!;
      const targetProfile = context.profilesByTripId.get(change.tripId)!;
      const changed = applyPatternChange(trip, context.targetPattern, change, this.now());
      const revision = targetProfile.calculationRevision ?? 0;
      return { ...changed, provenance: { ...changed.provenance, creationMethod: changed.provenance.creationMethod ?? changed.provenance.kind, runtimeProfileId: targetProfile.id, runtimeCalculationRevision: revision, calculationSource: { runtimeProfileId: targetProfile.id, runtimeCalculationRevision: revision } } };
    });
    const befores = updated.map((trip) => currentById.get(trip.id)!);
    await this.persistWithUndo(befores, updated, 'patternChange');
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
    // Block connections of the eligible Trips. The Trips in those Blocks are the neighbors; a skipped or ineligible neighbor keeps its saved times.
    const eligibleIds = new Set(preview.eligibleTripIds);
    const newTimesById = new Map(preview.changes.flatMap((change) => change.newStopTimes && eligibleIds.has(change.tripId) ? [[change.tripId, change.newStopTimes] as const] : []));
    const eligibleOriginals = trips.filter((trip) => eligibleIds.has(trip.id));
    const eligibleChanged = eligibleOriginals.map((trip) => ({ ...trip, patternId: targetPattern.id, stopTimes: newTimesById.get(trip.id)! }));
    const blockTripIds = new Set(blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && eligibleIds.has(activity.tripId))).flatMap((block) => block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : [])));
    const tripsById = new Map(records.trips.map((trip) => [trip.id, trip] as const));
    for (const trip of trips) tripsById.set(trip.id, trip);
    const connectionTrips = [...tripsById.values()].filter((trip) => blockTripIds.has(trip.id));
    const connectionReview = calculateRecalculationConnections(eligibleOriginals, eligibleChanged, connectionTrips, blocks, records.patterns);
    // The domain signature covers the request (which carries anchorNodeId), the Trips, and the target. Add each source Pattern's node ids, so an edit to a source Pattern makes the review stale (Decision 0067 item 8).
    const sourceRows = trips.map((trip) => [trip.id, sourcePatternsByTripId.get(trip.id)?.points.map((point) => [point.id, point.nodeId, point.sequence]) ?? null]).sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    const sourceSignature = { ...preview.sourceSignature, value: JSON.stringify([preview.sourceSignature.value, sourceRows]) };
    return { preview: { ...preview, sourceSignature, findings: [...findings, ...preview.findings], connections: connectionReview.connections, connectionFindings: connectionReview.findings }, trips, targetPattern, profilesByTripId };
  }

  async listStaleTrips(serviceDayId: string, tripProfileId?: string): Promise<Trip[]> {
    return (await this.inspectStaleTrips(serviceDayId, tripProfileId)).trips;
  }

  /**
   * The stale Trips of a service day, and why a Trip could not be checked. A stale Trip that its assigned profile cannot calculate (no band
   * for its departure, for example) carries the finding that says so, whether or not it recorded the runtime it was built from. Any other error is a defect and is not reported
   * as a stale Trip: it surfaces to the caller.
   */
  async inspectStaleTrips(serviceDayId: string, tripProfileId?: string): Promise<{ trips: Trip[]; findings: ValidationFinding[] }> {
    const trips = await this.repository.listTrips(serviceDayId, tripProfileId);
    const stale: Trip[] = [];
    const findings: ValidationFinding[] = [];
    const assignmentsByKey = new Map<string, RuntimeAssignment | undefined>();
    const profilesById = new Map<string, RuntimeProfile | undefined>();
    const patternsById = new Map<string, RoutePattern | undefined>();
    for (const trip of trips) {
      const sourceProfileId = trip.provenance.calculationSource?.runtimeProfileId ?? trip.provenance.runtimeProfileId;
      const sourceRevision = trip.provenance.calculationSource?.runtimeCalculationRevision ?? trip.provenance.runtimeCalculationRevision;
      const assignmentKey = `${trip.scenarioId}:${trip.serviceDayId}:${trip.patternId}`;
      if (!assignmentsByKey.has(assignmentKey)) {
        const assignments = await this.repository.listRuntimeAssignments(trip.scenarioId, trip.serviceDayId, trip.patternId);
        assignmentsByKey.set(assignmentKey, assignments[0]);
      }
      const assignment = assignmentsByKey.get(assignmentKey);
      if (!assignment) continue;
      if (!profilesById.has(assignment.runtimeProfileId)) profilesById.set(assignment.runtimeProfileId, await this.repository.getRuntimeProfile(assignment.runtimeProfileId));
      const profile = profilesById.get(assignment.runtimeProfileId);

      if (sourceProfileId && sourceRevision !== undefined) {
        if (!profile || assignment.runtimeProfileId !== sourceProfileId || (profile.calculationRevision ?? 0) !== sourceRevision) {
          stale.push(trip);
          // A Trip that the profile cannot calculate cannot be recalculated either, and the planner is told why (U09).
          if (profile) {
            if (!patternsById.has(trip.patternId)) patternsById.set(trip.patternId, await this.repository.getPattern(trip.patternId));
            const pattern = patternsById.get(trip.patternId);
            if (pattern && profile.patternId === pattern.id && profile.routeId === pattern.routeId && profile.scenarioId === pattern.scenarioId) {
              try {
                markTripRecalculated(trip, pattern, profile, this.now());
              } catch (error) {
                if (!(error instanceof TripGenerationError)) throw error;
                findings.push(...error.findings.map((finding): ValidationFinding => ({ ...finding, entityType: 'trip', entityId: trip.id })));
              }
            }
          }
        }
        continue;
      }

      // Older imports may not record which runtime produced their saved times.
      // Compare them with the current assignment so changed results are still surfaced.
      if (sourceProfileId && assignment.runtimeProfileId !== sourceProfileId) {
        stale.push(trip);
        continue;
      }
      if (!profile) {
        stale.push(trip);
        continue;
      }
      if (!patternsById.has(trip.patternId)) patternsById.set(trip.patternId, await this.repository.getPattern(trip.patternId));
      const pattern = patternsById.get(trip.patternId);
      if (!pattern || profile.patternId !== pattern.id || profile.routeId !== pattern.routeId || profile.scenarioId !== pattern.scenarioId) {
        stale.push(trip);
        continue;
      }
      try {
        if (!hasSameScheduledPoints(trip, markTripRecalculated(trip, pattern, profile, this.now()))) stale.push(trip);
      } catch (error) {
        if (!(error instanceof TripGenerationError)) throw error;
        stale.push(trip);
        findings.push(...error.findings.map((finding): ValidationFinding => ({ ...finding, entityType: 'trip', entityId: trip.id })));
      }
    }
    return { trips: stale, findings };
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
  constructor(readonly preview: RecalculationPreview) { super('Recalculation requires confirmation because trip times may be unverified, manually changed, or referenced by Blocks.'); this.name = 'TripRecalculationConfirmationError'; }
}

export class ServiceDayCopyStalePreviewError extends Error {
  constructor() { super('The service-day review is out of date. Review the impact again.'); this.name = 'ServiceDayCopyStalePreviewError'; }
}

export class ServiceDayCopyValidationError extends Error {
  constructor(readonly findings: ValidationFinding[]) { super('The service-day operation has validation errors.'); this.name = 'ServiceDayCopyValidationError'; }
}

export class TripPatternChangeStalePreviewError extends Error {
  constructor() { super('The Pattern change review is out of date. Review the change again.'); this.name = 'TripPatternChangeStalePreviewError'; }
}

export class TripShiftStalePreviewError extends Error {
  constructor() { super('The Trip shift review is out of date. Review the selected Trips again.'); this.name = 'TripShiftStalePreviewError'; }
}

// Keep the historical application surface while exposing the authoritative trip commands.
export type TripGenerationApplication = Pick<TripGenerationService, 'getGenerationSet' | 'listGenerationSets' | 'previewTripShift' | 'previewStagedTripShift' | 'applyStagedTripShift' | 'previewPatternChange' | 'applyPatternChange' | 'listServiceDayTrips' | 'listRouteDayTrips' | 'resolveRuntimeProfile' | 'previewGenerateTrips' | 'generateTrips' | 'addTrip' | 'previewTripPatternChange' | 'changeTripPattern' | 'listSharedAnchorNodes' | 'previewRecalculateTrips' | 'applyRecalculationPreview' | 'reviewRecalculation' | 'applyRecalculationReview' | 'recalculateTrips' | 'getLastTripRegenerationUndo' | 'undoLastTripRegeneration' | 'previewTripTableImport' | 'applyTripTableImport' | 'previewTripDeletion' | 'deleteTrips' | 'listStaleTrips' | 'inspectStaleTrips' | 'listScheduleTrips' | 'listTripProfiles' | 'renameTripProfile' | 'copyTripProfile' | 'previewTripProfileDeletion' | 'deleteTripProfile' | 'previewRuntimeCopy' | 'applyRuntimeCopy' | 'previewTripCopy' | 'applyTripCopy' | 'previewBatchPatternChange' | 'applyBatchPatternChange'>;
