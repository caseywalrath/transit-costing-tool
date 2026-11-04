import type { AutoBlockingPreview, AutoBlockingRequest, AutoBlockingSetup, AutoBlockingStatus, BlockingCommands, BlockingDayCopyReview, BlockingQueries, BlockingRepository } from './ports';
import { autoBlockingEditedCount, buildAutoBlocks, checkAgainstBuiltBlocks, defaultAutoBlockingRules, measureBuiltBlocks, summarizeAutoBlockingRules, validateAutoBlockingRules, type AutoBlockingCheck, type AutoBlockingContext, type AutoBlockingMeasurement, type AutoBlockingRules } from '../domain/autoBlocking';
import { patternTotalMiles } from '../domain/patterns';
import { sortServiceDays } from '../domain/serviceDays';
import { buildBlockingDayCopyPreview, type BlockingDayCopyPreview, type BlockingDayCopyRequest } from '../domain/blockingDayCopy';
import type { BlockingBlock, BlockingScenario, BlockActivity, Node, Route, RouteDirection, RoutePattern, Scenario, ServiceDayDefinition, Trip, TripProfile, ValidationFinding } from '../domain/types';
import { removeSelectedTripsFromBlock, weightedEstimateFactors } from '../domain/blocking';
import { assertStructurallyValidBlock, validateBlockingScenarioName, applyDeadheadToMatchingConnections, applyTripAssignment, assertBlockingScenarioSourceUnchanged, BlockingValidationError, assertBlockLabelAvailable, calculateBlockDeletionImpact, calculateBlocksDeletionImpact, calculateBlockingScenarioDeletionImpact, classifyBlockingInsertion, createBlockingBlock, createBlockingScenario, createBlockingScenarioSourceSignature, duplicateBlockingScenario, insertBlockActivity, moveRevenueTripGroup, normalizeBlockActivities, parseActivityInput, parseMinimumLayoverRule, parseMinimumLayoverRules, planBulkBoundaryActivities, proposeBlockLabel, renameBlockingScenario, summarizeBlock, summarizeBlockingScenario, unassignedRouteTrips, validateBlockingAssignments, validateBlockingBlock, type BlockingScenarioGraph, type BulkBoundaryRequest, type BulkBoundaryPreview } from '../domain/blocking';
import type { ActivityTextInput, BlockDeletionImpact, BlocksDeletionImpact, BlockingActivityAddRequest, BlockingActivityEditRequest, BlockingAssignmentRequest, BulkDeadheadRequest, ParsedActivityInput, ParsedMinimumLayover, BlockingBulkAssignmentRequest, BlockingScenarioCreateRequest, BlockingScenarioDeletionImpact, BlockingCompatibility, BlockSummary, BlockingSummary, BlockingTripsAssignmentRequest, MinimumLayoverRule, MinimumLayoverRowInput, MinimumLayoverRules, ParsedMinimumLayoverRules } from '../domain/blocking';
import { patternDirectionGroups, type DirectionGroup } from '../domain/directions';
import { newId, withUpdatedAt } from '../domain/ids';
import { blockingActivitiesCsv, blockingBlocksCsv, blockingScenariosCsv, blockingSummariesCsv } from '../persistence/csv';
import { publishWrites, SaveStatusPublisher } from './saveStatus';

export interface BlockingContextProvider {
  getTrip(id: string): Promise<Trip | undefined>;
  listTrips(scenarioId: string, tripProfileId: string): Promise<Trip[]>;
  getTripProfile(id: string): Promise<TripProfile | undefined>;
  listPatterns(scenarioId: string): Promise<RoutePattern[]>;
  /** The Scenario's Directions. Without it every Pattern's direction is unknown, and a minimum layover applies the larger of its two rules. */
  listDirections?(scenarioId: string): Promise<RouteDirection[]>;
  /** The Scenario's service days. Without it a Block day copy cannot be previewed. */
  listServiceDays?(scenarioId: string): Promise<ServiceDayDefinition[]>;
  /** The Scenario's Nodes. Automatic blocking (Decision 0055) is refused without it. */
  listNodes?(scenarioId: string): Promise<Node[]>;
  /** The Scenario's Routes. Automatic blocking is refused without it. */
  listRoutes?(scenarioId: string): Promise<Route[]>;
  /** Every Scenario of the same Project, including this one. Without it only this Scenario's Blocking Scenarios are offered as rule sources. */
  listProjectScenarios?(scenarioId: string): Promise<Scenario[]>;
}

export { removeSelectedTripsFromBlock };

/** The `BlockingRepository` methods that write. Every call to one is published through the save-status publisher. */
export const BLOCKING_WRITE_METHODS: readonly string[] = ['saveBlockingScenario', 'saveBlockingScenarioGraphAtomically', 'deleteBlockingScenarioAtomically', 'saveBlockingBlocksAtomically', 'replaceBlocksForDayAtomically'];

/** Application coordinator for lifecycle and transactional Blocking operations. */
export class BlockingApplicationService implements BlockingCommands, BlockingQueries {
  private readonly repository: BlockingRepository;

  /** `saveStatus` is the one publisher of the visible save status, shared with the other services that write (Decision 0001, amendment). */
  constructor(repository: BlockingRepository, private readonly context: BlockingContextProvider, saveStatus: SaveStatusPublisher = new SaveStatusPublisher()) {
    this.repository = publishWrites(repository, saveStatus, BLOCKING_WRITE_METHODS);
  }

  async createBlockingScenario(request: BlockingScenarioCreateRequest): Promise<BlockingScenario> {
    const siblings = await this.repository.listBlockingScenarios(request.scenarioId);
    if (request.duplicateScenarioId) {
      const source = await this.repository.getBlockingScenario(request.duplicateScenarioId); if (!source) throw new Error('Blocking Scenario not found.');
      if (source.scenarioId !== request.scenarioId || source.tripProfileId !== request.tripProfileId) throw new Error('A duplicate must use the source Blocking Scenario Scenario and Trip Profile.');
      const blocks = await this.repository.listBlockingBlocks(source.id);
      const copy = duplicateBlockingScenario({ scenario: source, blocks }, request.name);
      if (siblings.some((candidate) => candidate.name.trim().toLowerCase() === copy.scenario.name.trim().toLowerCase())) throw new Error('A Blocking Scenario with this name already exists.');
      await this.repository.saveBlockingScenarioGraphAtomically(copy.scenario, copy.blocks, createBlockingScenarioSourceSignature(source, blocks), source.id);
      return copy.scenario;
    }
    const scenario = createBlockingScenario(request);
    if (siblings.some((candidate) => candidate.name.trim().toLowerCase() === scenario.name.trim().toLowerCase())) throw new Error('A Blocking Scenario with this name already exists.');
    await this.repository.saveBlockingScenarioGraphAtomically(scenario, []);
    return scenario;
  }

  async ensureDefaultBlockingScenario(scenarioId: string, tripProfileId: string): Promise<BlockingScenario> {
    const siblings = await this.repository.listBlockingScenarios(scenarioId);
    const existing = siblings.find((candidate) => candidate.tripProfileId === tripProfileId);
    if (existing) return existing;
    const taken = new Set(siblings.map((sibling) => sibling.name.trim().toLowerCase()));
    let name = 'Default';
    for (let counter = 2; taken.has(name.toLowerCase()); counter += 1) name = `Default ${counter}`;
    return this.createBlockingScenario({ scenarioId, tripProfileId, name });
  }

  async renameBlockingScenario(blockingScenarioId: string, name: string, sourceSignature: string): Promise<BlockingScenario> {
    const source = await this.repository.getBlockingScenario(blockingScenarioId); if (!source) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(blockingScenarioId); assertBlockingScenarioSourceUnchanged(source, blocks, sourceSignature);
    const renamed = renameBlockingScenario(source, name, await this.repository.listBlockingScenarios(source.scenarioId));
    await this.repository.saveBlockingScenarioGraphAtomically(renamed, blocks, sourceSignature); return renamed;
  }

  async duplicateBlockingScenario(blockingScenarioId: string, targetName: string, sourceSignature: string): Promise<BlockingScenario> {
    const source = await this.repository.getBlockingScenario(blockingScenarioId); if (!source) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(blockingScenarioId); assertBlockingScenarioSourceUnchanged(source, blocks, sourceSignature);
    const copy = duplicateBlockingScenario({ scenario: source, blocks }, targetName);
    await this.repository.saveBlockingScenarioGraphAtomically(copy.scenario, copy.blocks, sourceSignature, source.id); return copy.scenario;
  }

  async deleteBlockingScenario(blockingScenarioId: string, sourceSignature: string): Promise<BlockingScenarioDeletionImpact> { return this.repository.deleteBlockingScenarioAtomically(blockingScenarioId, sourceSignature); }

  async createBlock(blockingScenarioId: string, serviceDayId: string, label: string, sourceSignature: string): Promise<BlockingBlock> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(blockingScenarioId); assertBlockingScenarioSourceUnchanged(scenario, blocks, sourceSignature);
    assertBlockLabelAvailable(label, serviceDayId, blocks);
    const block = createBlockingBlock(scenario, serviceDayId, label); await this.repository.saveBlockingBlocksAtomically([...blocks, block], sourceSignature, scenario.id); return block;
  }

  async updateBlock(block: BlockingBlock, sourceSignature: string): Promise<BlockingBlock> {
    const scenario = await this.repository.getBlockingScenario(block.blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(scenario.id); assertBlockingScenarioSourceUnchanged(scenario, blocks, sourceSignature);
    // A label is checked when it is new or changed. A Block saved with a repeated label before this rule can still be edited otherwise.
    const stored = blocks.find((candidate) => candidate.id === block.id); const renamed = !stored || stored.label.trim() !== block.label.trim();
    if (renamed) assertBlockLabelAvailable(block.label, block.serviceDayId, blocks, block.id);
    const updated = normalizeBlockActivities(withUpdatedAt(renamed ? { ...block, label: block.label.trim() } : block));
    await this.assertWriteValid(scenario, [...blocks.filter((candidate) => candidate.id !== block.id), updated]);
    await this.repository.saveBlockingBlocksAtomically([...blocks.filter((candidate) => candidate.id !== block.id), updated], sourceSignature, scenario.id); return updated;
  }

  async deleteBlock(blockingScenarioId: string, blockId: string, sourceSignature: string): Promise<void> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(blockingScenarioId); assertBlockingScenarioSourceUnchanged(scenario, blocks, sourceSignature);
    if (!blocks.some((block) => block.id === blockId)) throw new Error('Block not found.');
    await this.repository.saveBlockingBlocksAtomically(blocks.filter((block) => block.id !== blockId), sourceSignature, scenario.id);
  }

  /** Deletes every listed Block in one atomic write, only if the stored data still matches the review (`previewDeleteBlocks`) that `sourceSignature` came from (Decision 0053). */
  async deleteBlocks(blockingScenarioId: string, blockIds: string[], sourceSignature: string): Promise<void> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(blockingScenarioId); assertBlockingScenarioSourceUnchanged(scenario, blocks, sourceSignature);
    const impact = calculateBlocksDeletionImpact(scenario, blocks, blockIds); if (!impact) throw new Error('Block not found.');
    const removed = new Set(impact.blockIds);
    await this.repository.saveBlockingBlocksAtomically(blocks.filter((block) => !removed.has(block.id)), sourceSignature, scenario.id);
  }

  async assignTrip(request: BlockingAssignmentRequest): Promise<{ blocks: BlockingBlock[]; findings: ValidationFinding[] }> {
    const scenario = await this.repository.getBlockingScenario(request.blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(scenario.id); assertBlockingScenarioSourceUnchanged(scenario, blocks, request.sourceSignature);
    const trips = await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId);
    const next = applyTripAssignment(request, scenario, blocks, trips);
    const assignments = validateBlockingAssignments(scenario, next, trips); if (assignments.some((finding) => finding.category === 'structural')) throw new Error(assignments.map((finding) => finding.messageKey).join(', ')); await this.repository.saveBlockingBlocksAtomically(next, request.sourceSignature, scenario.id);
    return { blocks: next, findings: assignments };
  }

  async reassignTrips(request: BlockingBulkAssignmentRequest): Promise<{ blocks: BlockingBlock[]; findings: ValidationFinding[] }> {
    const scenario = await this.repository.getBlockingScenario(request.blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(scenario.id); assertBlockingScenarioSourceUnchanged(scenario, blocks, request.sourceSignature);
    const trips = await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId);
    const selected = new Set(request.tripIds);
    let next = blocks.map((block) => block.id === request.sourceBlockId ? removeSelectedTripsFromBlock(block, selected) : block);
    for (const tripId of [...new Set(request.tripIds)]) next = applyTripAssignment({ blockingScenarioId: request.blockingScenarioId, serviceDayId: request.serviceDayId, tripId, sourceBlockId: request.sourceBlockId, destinationBlockId: request.destinationBlockId }, scenario, next, trips);
    const assignments = validateBlockingAssignments(scenario, next, trips); if (assignments.some((finding) => finding.category === 'structural')) throw new Error(assignments.map((finding) => finding.messageKey).join(', '));
    await this.repository.saveBlockingBlocksAtomically(next, request.sourceSignature, scenario.id);
    return { blocks: next, findings: assignments };
  }

  async assignTripsToBlock(request: BlockingTripsAssignmentRequest): Promise<{ blocks: BlockingBlock[]; findings: ValidationFinding[] }> {
    const scenario = await this.repository.getBlockingScenario(request.blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(scenario.id); assertBlockingScenarioSourceUnchanged(scenario, blocks, request.sourceSignature);
    const destination = blocks.find((block) => block.id === request.destinationBlockId && block.blockingScenarioId === scenario.id && block.serviceDayId === request.serviceDayId);
    if (!destination) throw new Error('Choose a Block in the selected Blocking Scenario and service day.');
    const tripIds = [...new Set(request.tripIds)];
    if (!tripIds.length) throw new Error('Select at least one Trip to assign.');
    const trips = await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId);
    const selected = new Set(tripIds);
    const existingAssignmentCounts = new Map<string, number>();
    for (const block of blocks) for (const activity of block.activities) {
      if (block.serviceDayId === request.serviceDayId && activity.type === 'revenueTrip' && selected.has(activity.tripId)) existingAssignmentCounts.set(activity.tripId, (existingAssignmentCounts.get(activity.tripId) ?? 0) + 1);
    }
    if ([...existingAssignmentCounts.values()].some((count) => count > 1)) throw new Error('A selected Trip is already assigned more than once. Review its assignments in Blocking before moving it.');
    const movingIds = new Set(tripIds.filter((tripId) => !destination.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === tripId)));
    if (blocks.some((block) => block.serviceDayId !== request.serviceDayId && block.activities.some((activity) => activity.type === 'revenueTrip' && tripIds.includes(activity.tripId)))) {
      throw new Error('A selected Trip is referenced by a Block on a different service day. Review the Blocking Scenario before assigning it.');
    }
    let next = blocks.map((block) => block.serviceDayId === request.serviceDayId ? removeSelectedTripsFromBlock(block, movingIds) : block);
    for (const tripId of tripIds) {
      if (movingIds.has(tripId)) next = applyTripAssignment({ blockingScenarioId: scenario.id, serviceDayId: request.serviceDayId, tripId, destinationBlockId: destination.id }, scenario, next, trips);
    }
    const findings = validateBlockingAssignments(scenario, next, trips);
    if (findings.some((finding) => finding.category === 'structural')) throw new Error(findings.filter((finding) => finding.category === 'structural').map((finding) => finding.messageKey).join(', '));
    if (movingIds.size) await this.repository.saveBlockingBlocksAtomically(next, request.sourceSignature, scenario.id);
    return { blocks: next, findings };
  }

  async removeTrip(blockingScenarioId: string, serviceDayId: string, tripId: string, sourceSignature: string): Promise<{ blocks: BlockingBlock[] }> {
    return this.removeTrips(blockingScenarioId, serviceDayId, [tripId], sourceSignature);
  }

  async removeTrips(blockingScenarioId: string, serviceDayId: string, tripIds: string[], sourceSignature: string): Promise<{ blocks: BlockingBlock[] }> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(blockingScenarioId); assertBlockingScenarioSourceUnchanged(scenario, blocks, sourceSignature);
    const selectedIds = [...new Set(tripIds)];
    if (!selectedIds.length) throw new Error('Select at least one Trip to unassign.');
    const selected = new Set(selectedIds);
    const trips = await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId);
    const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
    if (selectedIds.some((id) => { const trip = tripsById.get(id); return !trip || trip.scenarioId !== scenario.scenarioId || trip.tripProfileId !== scenario.tripProfileId || trip.serviceDayId !== serviceDayId; })) {
      throw new Error('A selected Trip no longer belongs to this Blocking Scenario and service day. Reload Trips and try again.');
    }
    if (blocks.some((block) => block.serviceDayId !== serviceDayId && block.activities.some((activity) => activity.type === 'revenueTrip' && selected.has(activity.tripId)))) {
      throw new Error('A selected Trip is also referenced on a different service day. Review the Blocking Scenario before unassigning it.');
    }
    const assignmentCounts = new Map<string, number>();
    for (const block of blocks) if (block.serviceDayId === serviceDayId) for (const activity of block.activities) {
      if (activity.type === 'revenueTrip' && selected.has(activity.tripId)) assignmentCounts.set(activity.tripId, (assignmentCounts.get(activity.tripId) ?? 0) + 1);
    }
    if ([...assignmentCounts.values()].some((count) => count > 1)) throw new Error('A selected Trip is assigned more than once. Review its assignments in Blocking before unassigning it.');
    if (![...assignmentCounts.values()].some((count) => count > 0)) return { blocks: blocks.filter((block) => block.serviceDayId === serviceDayId) };
    const next = blocks.map((block) => block.serviceDayId === serviceDayId ? removeSelectedTripsFromBlock(block, selected) : block);
    await this.repository.saveBlockingBlocksAtomically(next, sourceSignature, scenario.id); return { blocks: next.filter((block) => block.serviceDayId === serviceDayId) };
  }

  async editActivity(request: BlockingActivityEditRequest): Promise<BlockingBlock> {
    const scenario = await this.repository.getBlockingScenario(request.blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(scenario.id); assertBlockingScenarioSourceUnchanged(scenario, blocks, request.sourceSignature);
    const block = blocks.find((candidate) => candidate.id === request.blockId); if (!block) throw new Error('Block not found.');
    const updated = normalizeBlockActivities(withUpdatedAt({ ...block, activities: [...block.activities.filter((activity) => activity.id !== request.activity.id), request.activity] }));
    await this.assertWriteValid(scenario, [...blocks.filter((candidate) => candidate.id !== block.id), updated]);
    await this.repository.saveBlockingBlocksAtomically([...blocks.filter((candidate) => candidate.id !== block.id), updated], request.sourceSignature, scenario.id); return updated;
  }

  async addActivity(request: BlockingActivityAddRequest): Promise<BlockingBlock> {
    const { scenario, blocks, block } = await this.loadBlock(request.blockingScenarioId, request.blockId, request.sourceSignature);
    return this.saveBlock(scenario, blocks, normalizeBlockActivities(withUpdatedAt(insertBlockActivity(block, request.activity, request.afterTripId))), request.sourceSignature);
  }

  async applyDeadheadToMatchingConnections(request: BulkDeadheadRequest): Promise<{ block: BlockingBlock; appliedCount: number }> {
    const { scenario, blocks, block } = await this.loadBlock(request.blockingScenarioId, request.blockId, request.sourceSignature);
    const [trips, patterns] = await Promise.all([this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), this.context.listPatterns(scenario.scenarioId)]);
    const planned = applyDeadheadToMatchingConnections(block, request.deadhead, trips, patterns);
    return { block: await this.saveBlock(scenario, blocks, normalizeBlockActivities(withUpdatedAt(planned.block)), request.sourceSignature), appliedCount: planned.appliedCount };
  }

  async moveTripGroup(blockingScenarioId: string, blockId: string, activityId: string, movement: -1 | 1, sourceSignature: string): Promise<BlockingBlock> {
    const { scenario, block } = await this.loadBlock(blockingScenarioId, blockId, sourceSignature);
    const order = moveRevenueTripGroup(block, activityId, movement);
    if (!order) return block;
    return this.reorderActivities(scenario.id, block.id, order, sourceSignature);
  }

  /** Reads the Blocking Scenario, its Blocks, and one Block, and refuses a source that changed since the screen read it. */
  private async loadBlock(blockingScenarioId: string, blockId: string, sourceSignature: string) {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(scenario.id); assertBlockingScenarioSourceUnchanged(scenario, blocks, sourceSignature);
    const block = blocks.find((candidate) => candidate.id === blockId); if (!block) throw new Error('Block not found.');
    return { scenario, blocks, block };
  }

  private async saveBlock(scenario: BlockingScenario, blocks: BlockingBlock[], updated: BlockingBlock, sourceSignature: string): Promise<BlockingBlock> {
    const next = [...blocks.filter((candidate) => candidate.id !== updated.id), updated];
    await this.assertWriteValid(scenario, next);
    await this.repository.saveBlockingBlocksAtomically(next, sourceSignature, scenario.id);
    return updated;
  }

  private async planBoundaryWrite(request: BulkBoundaryRequest) {
    const scenario = await this.repository.getBlockingScenario(request.blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(scenario.id);
    assertBlockingScenarioSourceUnchanged(scenario, blocks, request.sourceSignature);
    const [trips, patterns] = await Promise.all([this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), this.context.listPatterns(scenario.scenarioId)]);
    const planned = planBulkBoundaryActivities(request, blocks, trips, patterns);
    await this.assertWriteValid(scenario, planned.blocks);
    return { scenario, ...planned };
  }

  async previewBulkBoundaryActivities(request: BulkBoundaryRequest): Promise<BulkBoundaryPreview> {
    return (await this.planBoundaryWrite(request)).preview;
  }

  async applyBulkBoundaryActivities(request: BulkBoundaryRequest): Promise<BulkBoundaryPreview> {
    const { scenario, blocks, preview } = await this.planBoundaryWrite(request);
    await this.repository.saveBlockingBlocksAtomically(blocks, request.sourceSignature, scenario.id);
    return preview;
  }

  async previewBlockingDayCopy(request: BlockingDayCopyRequest): Promise<BlockingDayCopyReview> {
    const scenario = await this.repository.getBlockingScenario(request.blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    if (!this.context.listServiceDays) throw new Error('Copying Blocks between days is not available: the service days cannot be read.');
    const [blocks, trips, patterns, serviceDays, directions] = await Promise.all([
      this.repository.listBlockingBlocks(scenario.id), this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), this.context.listPatterns(scenario.scenarioId),
      this.context.listServiceDays(scenario.scenarioId), this.context.listDirections?.(scenario.scenarioId) ?? Promise.resolve([] as RouteDirection[]),
    ]);
    const preview = buildBlockingDayCopyPreview({
      request, blockingScenario: scenario, serviceDays, sourceBlocks: blocks, targetBlocks: blocks, sourceTrips: trips, targetTrips: trips, patterns,
      patternDirections: patternDirectionGroups(patterns, directions), now: new Date().toISOString(),
    });
    return { preview, blockingScenarioSignature: createBlockingScenarioSourceSignature(scenario, blocks) };
  }

  async applyBlockingDayCopy(review: BlockingDayCopyReview): Promise<BlockingDayCopyPreview> {
    const request = review.preview.request;
    const current = await this.previewBlockingDayCopy(request);
    if (current.preview.sourceSignature !== review.preview.sourceSignature) {
      throw new BlockingValidationError('Blocks or Trips changed since the copy was reviewed. Reload and review it again.', [{ ruleId: 'blockingScenario.sourceChanged', severity: 'error', category: 'structural', entityType: 'blockingScenario', entityId: request.blockingScenarioId, messageKey: 'blockingScenario.sourceChanged' }]);
    }
    const errors = current.preview.findings.filter((item) => item.severity === 'error');
    if (errors.length) throw new BlockingValidationError(errors.map((item) => item.messageKey).join(', '), errors);
    await this.repository.replaceBlocksForDayAtomically(request.blockingScenarioId, request.targetServiceDayId, current.preview.blocks, review.blockingScenarioSignature);
    return current.preview;
  }

  // --- Automatic blocking (Decision 0055) ---

  /** Reads everything the engine needs for one Scenario and Trip Profile. Refuses when the context cannot supply Nodes, Routes or service days. */
  private async loadAutoContext(scenarioId: string, tripProfileId: string): Promise<AutoBlockingContext> {
    const { listNodes, listRoutes, listServiceDays } = this.context;
    if (!listNodes || !listRoutes || !listServiceDays) throw new Error('Automatic blocking is not available: Nodes, Routes or service days cannot be read.');
    const profile = await this.context.getTripProfile(tripProfileId);
    if (!profile || profile.scenarioId !== scenarioId) throw new Error('Trip Profile not found in this Scenario.');
    const [trips, patterns, nodes, routes, serviceDays, directions] = await Promise.all([
      this.context.listTrips(scenarioId, tripProfileId), this.context.listPatterns(scenarioId), listNodes(scenarioId), listRoutes(scenarioId),
      listServiceDays(scenarioId), this.context.listDirections?.(scenarioId) ?? Promise.resolve([] as RouteDirection[]),
    ]);
    return { scenarioId, routes, patterns, nodes, directions, serviceDays, trips };
  }

  async getAutoBlockingSetup(scenarioId: string, tripProfileId: string, preference?: MinimumLayoverRules): Promise<AutoBlockingSetup> {
    const context = await this.loadAutoContext(scenarioId, tripProfileId);
    const trips = context.trips.filter((trip) => trip.scenarioId === scenarioId && trip.tripProfileId === tripProfileId);
    const patternTripCounts: Record<string, number> = {};
    trips.forEach((trip) => { patternTripCounts[trip.patternId] = (patternTripCounts[trip.patternId] ?? 0) + 1; });
    const patterns = context.patterns.filter((pattern) => patternTripCounts[pattern.id] !== undefined);
    const groups = patternDirectionGroups(context.patterns, context.directions);
    const siblings = await this.repository.listBlockingScenarios(scenarioId);
    const taken = new Set(siblings.map((sibling) => sibling.name.trim().toLowerCase()));
    let counter = 1;
    while (taken.has(`auto ${counter}`)) counter += 1;
    const defaultName = `Auto ${counter}`;
    const scenarios = (await this.context.listProjectScenarios?.(scenarioId)) ?? [];
    const ordered = [...scenarios.filter((scenario) => scenario.id === scenarioId), ...scenarios.filter((scenario) => scenario.id !== scenarioId)];
    const sources: AutoBlockingSetup['sources'] = [];
    for (const scenario of ordered.length ? ordered : [{ id: scenarioId, name: '' }]) {
      for (const blockingScenario of await this.repository.listBlockingScenarios(scenario.id)) {
        const blockCount = (await this.repository.listBlockingBlocks(blockingScenario.id)).length;
        if (blockCount > 0) sources.push({ blockingScenarioId: blockingScenario.id, scenarioName: scenario.name, name: blockingScenario.name, blockCount });
      }
    }
    return {
      routes: context.routes, patterns, nodes: context.nodes,
      patternGroups: Object.fromEntries(patterns.map((pattern) => [pattern.id, groups.get(pattern.id)])),
      patternTripCounts,
      serviceDays: sortServiceDays(context.serviceDays).map((day) => ({ day, tripCount: trips.filter((trip) => trip.serviceDayId === day.id).length })),
      milesIncompletePatternIds: patterns.filter((pattern) => patternTotalMiles(pattern) === undefined).map((pattern) => pattern.id),
      defaultRules: defaultAutoBlockingRules(context, tripProfileId, preference),
      defaultName, sources,
    };
  }

  /** Validates rules and name, then builds in memory. Used by both the preview and the create command. */
  private async buildAuto(request: AutoBlockingRequest, now: string) {
    const context = await this.loadAutoContext(request.scenarioId, request.tripProfileId);
    const siblings = await this.repository.listBlockingScenarios(request.scenarioId);
    const ruleFindings = validateAutoBlockingRules(request.rules, { patterns: context.patterns, nodes: context.nodes, serviceDayIds: context.serviceDays.map((day) => day.id) });
    const target = request.replaceBlockingScenarioId ? siblings.find((sibling) => sibling.id === request.replaceBlockingScenarioId) : undefined;
    if (request.replaceBlockingScenarioId && (!target || target.tripProfileId !== request.tripProfileId || !target.autoBlocking)) throw new Error('Only an automatically built Blocking Scenario of this Trip Profile can be rebuilt.');
    const nameFindings = validateBlockingScenarioName(request.name, siblings, target?.id);
    const scenario = target ? { ...target, name: request.name.trim() || target.name } : createBlockingScenario({ scenarioId: request.scenarioId, tripProfileId: request.tripProfileId, name: request.name.trim() || 'Auto' }, now);
    const result = buildAutoBlocks({ ...context, blockingScenario: scenario, rules: request.rules, now });
    return { context, scenario, result, ruleFindings, nameFindings };
  }

  async previewAutoBlocking(request: AutoBlockingRequest): Promise<AutoBlockingPreview> {
    const now = new Date().toISOString();
    const { context, result, ruleFindings, nameFindings } = await this.buildAuto(request, now);
    let check: AutoBlockingCheck | undefined;
    if (request.sourceBlockingScenarioId) {
      const source = await this.loadAutoSource(request.sourceBlockingScenarioId);
      check = checkAgainstBuiltBlocks({ source, rules: request.rules, now, target: context });
    }
    return { result, ruleFindings, nameFindings, ...(check ? { check } : {}) };
  }

  /** A Blocking Scenario of the Project with its Scenario's data, for measuring or checking. */
  private async loadAutoSource(blockingScenarioId: string) {
    const blockingScenario = await this.repository.getBlockingScenario(blockingScenarioId);
    if (!blockingScenario) throw new Error('Blocking Scenario not found.');
    const [context, blocks] = await Promise.all([this.loadAutoContext(blockingScenario.scenarioId, blockingScenario.tripProfileId), this.repository.listBlockingBlocks(blockingScenarioId)]);
    return { ...context, blockingScenario, blocks };
  }

  async measureAutoBlockingSource(scenarioId: string, tripProfileId: string, sourceBlockingScenarioId: string, draft: AutoBlockingRules): Promise<AutoBlockingMeasurement> {
    const target = await this.loadAutoContext(scenarioId, tripProfileId);
    const source = await this.loadAutoSource(sourceBlockingScenarioId);
    if (!source.blocks.length) throw new Error('The chosen Blocking Scenario has no Blocks to read.');
    return measureBuiltBlocks({ source, target, targetRules: draft });
  }

  async getAutoBlockingStatus(blockingScenarioId: string): Promise<AutoBlockingStatus | undefined> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId);
    const record = scenario?.autoBlocking;
    if (!scenario || !record) return undefined;
    const [blocks, patterns, nodes, serviceDays] = await Promise.all([
      this.repository.listBlockingBlocks(blockingScenarioId), this.context.listPatterns(scenario.scenarioId),
      this.context.listNodes?.(scenario.scenarioId) ?? Promise.resolve([] as Node[]), this.context.listServiceDays?.(scenario.scenarioId) ?? Promise.resolve([] as ServiceDayDefinition[]),
    ]);
    return { record, ...autoBlockingEditedCount(record, blocks), summary: summarizeAutoBlockingRules(record.rules, patterns, nodes, serviceDays) };
  }

  async createAutoBlockingScenario(request: AutoBlockingRequest): Promise<BlockingScenario> {
    const now = new Date().toISOString();
    const { context, scenario, result, ruleFindings, nameFindings } = await this.buildAuto(request, now);
    const refused = [...ruleFindings, ...nameFindings].filter((item) => item.severity === 'error');
    if (refused.length) throw new BlockingValidationError(refused.map((item) => item.messageKey).join(', '), refused);
    if (!result.blocks.length) throw new Error('The Trip Profile has no Trips on the chosen service days, so no Blocks can be built.');
    const patterns = new Map(context.patterns.map((pattern) => [pattern.id, pattern]));
    const trips = new Map(context.trips.map((trip) => [trip.id, trip]));
    result.blocks.forEach((block) => assertStructurallyValidBlock(block, { scenario: { id: request.scenarioId }, blockingScenario: scenario, trips, patterns }));
    const tripCount = result.days.reduce((sum, day) => sum + day.tripCount, 0);
    const record = { rules: request.rules, builtAt: now, tripCount, blockCount: result.blocks.length, ...(request.sourceBlockingScenarioId ? { sourceBlockingScenarioId: request.sourceBlockingScenarioId } : {}) };
    if (request.replaceBlockingScenarioId) {
      // Rebuild in place: Blocks on the chosen days are replaced, Blocks on other days are kept. The Blocks are written first, then the
      // Blocking Scenario with its new name and build record.
      const existing = await this.repository.listBlockingBlocks(scenario.id);
      const days = new Set(request.rules.serviceDayIds);
      const kept = existing.filter((block) => !days.has(block.serviceDayId));
      const blocks = [...kept, ...result.blocks];
      const stored = await this.repository.getBlockingScenario(scenario.id);
      if (!stored) throw new Error('Blocking Scenario not found.');
      await this.repository.saveBlockingBlocksAtomically(blocks, createBlockingScenarioSourceSignature(stored, existing), scenario.id);
      const saved: BlockingScenario = { ...withUpdatedAt(scenario, now), autoBlocking: { ...record, tripCount: kept.reduce((sum, block) => sum + block.activities.filter((activity) => activity.type === 'revenueTrip').length, tripCount), blockCount: blocks.length } };
      await this.repository.saveBlockingScenario(saved);
      return saved;
    }
    const saved: BlockingScenario = { ...scenario, autoBlocking: record };
    await this.repository.saveBlockingScenarioGraphAtomically(saved, result.blocks);
    return saved;
  }

  async reorderActivities(blockingScenarioId: string, blockId: string, activityIds: string[], sourceSignature: string): Promise<BlockingBlock> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(scenario.id); assertBlockingScenarioSourceUnchanged(scenario, blocks, sourceSignature);
    const block = blocks.find((candidate) => candidate.id === blockId); if (!block) throw new Error('Block not found.');
    const byId = new Map(block.activities.map((activity) => [activity.id, activity])); if (activityIds.length !== block.activities.length || activityIds.some((id) => !byId.has(id))) throw new Error('Activity ordering must include every activity exactly once.');
    const updated = normalizeBlockActivities(withUpdatedAt({ ...block, activities: activityIds.map((id, sequence) => ({ ...byId.get(id)!, sequence })) })); await this.assertWriteValid(scenario, [...blocks.filter((candidate) => candidate.id !== block.id), updated]); await this.repository.saveBlockingBlocksAtomically([...blocks.filter((candidate) => candidate.id !== block.id), updated], sourceSignature, scenario.id); return updated;
  }

  private async assertWriteValid(scenario: BlockingScenario, blocks: BlockingBlock[]): Promise<void> {
    const [trips, patterns] = await Promise.all([this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), this.context.listPatterns(scenario.scenarioId)]);
    const findings = blocks.flatMap((block) => validateBlockingBlock(block, { scenario: { id: scenario.scenarioId }, blockingScenario: scenario, trips, patterns })).concat(validateBlockingAssignments(scenario, blocks, trips));
    const structural = findings.filter((finding) => finding.category === 'structural');
    if (structural.length) throw new Error(structural.map((finding) => finding.messageKey).join(', '));
  }

  async listBlockingScenarios(scenarioId: string): Promise<BlockingScenario[]> { return this.repository.listBlockingScenarios(scenarioId); }
  async listBlockingBlocks(blockingScenarioId: string, serviceDayId?: string): Promise<BlockingBlock[]> { return this.repository.listBlockingBlocks(blockingScenarioId, serviceDayId); }
  async listUnassignedTrips(blockingScenarioId: string, serviceDayId: string, routeId: string): Promise<Trip[]> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) return [];
    const [blocks, trips] = await Promise.all([this.repository.listBlockingBlocks(scenario.id, serviceDayId), this.context.listTrips(scenario.scenarioId, scenario.tripProfileId)]);
    return unassignedRouteTrips(trips, blocks, serviceDayId, routeId);
  }
  async proposeBlockLabel(blockingScenarioId: string, serviceDayId: string): Promise<string> { return proposeBlockLabel(await this.repository.listBlockingBlocks(blockingScenarioId, serviceDayId)); }
  async previewDeleteBlock(blockingScenarioId: string, blockId: string): Promise<BlockDeletionImpact> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const impact = calculateBlockDeletionImpact(scenario, await this.repository.listBlockingBlocks(scenario.id), blockId); if (!impact) throw new Error('Block not found.');
    return impact;
  }
  async previewDeleteBlocks(blockingScenarioId: string, blockIds: string[]): Promise<BlocksDeletionImpact> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const impact = calculateBlocksDeletionImpact(scenario, await this.repository.listBlockingBlocks(scenario.id), blockIds); if (!impact) throw new Error('Block not found.');
    return impact;
  }
  async previewDeleteBlockingScenario(blockingScenarioId: string): Promise<BlockingScenarioDeletionImpact> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    return calculateBlockingScenarioDeletionImpact(scenario, await this.repository.listBlockingBlocks(scenario.id));
  }
  parseActivityInput(input: ActivityTextInput): ParsedActivityInput { return parseActivityInput(input); }
  parseMinimumLayover(mode: 'none' | MinimumLayoverRule['mode'], amount: string): ParsedMinimumLayover { return parseMinimumLayoverRule(mode, amount); }
  parseMinimumLayoverRules(input: Record<DirectionGroup, MinimumLayoverRowInput>): ParsedMinimumLayoverRules { return parseMinimumLayoverRules(input); }
  private async patternDirections(scenarioId: string, patterns: RoutePattern[]) { return patternDirectionGroups(patterns, await this.context.listDirections?.(scenarioId) ?? []); }
  async getBlockSummary(blockingScenarioId: string, blockId: string): Promise<BlockSummary | undefined> { const [scenario, block] = await Promise.all([this.repository.getBlockingScenario(blockingScenarioId), this.repository.getBlockingBlock(blockId)]); if (!scenario || !block) return undefined; const trips = await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId); return summarizeBlock(block, { scenario: { id: scenario.scenarioId }, blockingScenario: scenario, trips, patterns: await this.context.listPatterns(scenario.scenarioId) }); }
  async getScenarioSummary(blockingScenarioId: string, serviceDayId?: string): Promise<BlockingSummary | undefined> { const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) return undefined; const blocks = await this.repository.listBlockingBlocks(blockingScenarioId, serviceDayId); return summarizeBlockingScenario(scenario, blocks, { trips: await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), patterns: await this.context.listPatterns(scenario.scenarioId) }); }
  /**
   * The Layover % and Deadhead % of all the given service days together, weighted by annual service days (Decision 0051), for typing into
   * the estimate factors. The Blocks, Trips, and Patterns are read once and each service day is summarized from that one read.
   */
  async getEstimateFactorSummary(blockingScenarioId: string, serviceDays: ServiceDayDefinition[]): Promise<{ layoverPercent?: number; deadheadPercent?: number } | undefined> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId);
    if (!scenario) return undefined;
    const [blocks, trips, patterns] = await Promise.all([this.repository.listBlockingBlocks(blockingScenarioId), this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), this.context.listPatterns(scenario.scenarioId)]);
    return weightedEstimateFactors(serviceDays.map((day) => ({
      annualServiceDays: day.annualServiceDays,
      summary: summarizeBlockingScenario(scenario, blocks.filter((block) => block.serviceDayId === day.id), { trips, patterns }),
    })));
  }
  async classifyInsertion(blockingScenarioId: string, blockId: string, tripId: string, insertAt?: number, minimumLayover?: MinimumLayoverRules): Promise<BlockingCompatibility> { const [scenario, block, trip] = await Promise.all([this.repository.getBlockingScenario(blockingScenarioId), this.repository.getBlockingBlock(blockId), this.context.getTrip(tripId)]); if (!scenario || !block || !trip) return { status: 'incomplete', findings: [] }; const patterns = await this.context.listPatterns(scenario.scenarioId); return classifyBlockingInsertion({ block, insertAt, trip, trips: await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), patterns, minimumLayover, patternDirections: minimumLayover ? await this.patternDirections(scenario.scenarioId, patterns) : undefined }); }
  /**
   * Classifies every listed Trip against one Block, reading the Blocking Scenario, the Block, the Trips, and the Patterns once.
   * A Trip that is not in the Scenario's Trip Profile is looked up on its own, as `classifyInsertion` does; one that cannot be found is
   * incomplete. When the Blocking Scenario or the Block is gone, every Trip is incomplete and nothing else is read.
   */
  async classifyInsertions(blockingScenarioId: string, blockId: string, tripIds: string[], insertAt?: number, minimumLayover?: MinimumLayoverRules): Promise<Map<string, BlockingCompatibility>> {
    const ids = [...new Set(tripIds)];
    const incomplete = (): BlockingCompatibility => ({ status: 'incomplete', findings: [] });
    const [scenario, block] = await Promise.all([this.repository.getBlockingScenario(blockingScenarioId), this.repository.getBlockingBlock(blockId)]);
    if (!scenario || !block || !ids.length) return new Map(ids.map((id) => [id, incomplete()]));
    const [trips, patterns] = await Promise.all([this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), this.context.listPatterns(scenario.scenarioId)]);
    const patternDirections = minimumLayover ? await this.patternDirections(scenario.scenarioId, patterns) : undefined;
    const byId = new Map(trips.map((item) => [item.id, item]));
    const result = new Map<string, BlockingCompatibility>();
    for (const id of ids) {
      const trip = byId.get(id) ?? await this.context.getTrip(id);
      result.set(id, trip ? classifyBlockingInsertion({ block, insertAt, trip, trips, patterns, minimumLayover, patternDirections }) : incomplete());
    }
    return result;
  }
  async exportBlockingScenarioCsv(blockingScenarioId: string): Promise<Array<{ suffix: 'blocking-scenarios' | 'blocking-blocks' | 'blocking-activities' | 'blocking-summaries'; contents: string }>> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId);
    if (!scenario) throw new Error('Blocking Scenario not found.');
    const [blocks, tripProfile, trips, patterns] = await Promise.all([
      this.repository.listBlockingBlocks(scenario.id),
      this.context.getTripProfile(scenario.tripProfileId),
      this.context.listTrips(scenario.scenarioId, scenario.tripProfileId),
      this.context.listPatterns(scenario.scenarioId),
    ]);
    const summary = summarizeBlockingScenario(scenario, blocks, { trips, patterns });
    return [
      { suffix: 'blocking-scenarios', contents: blockingScenariosCsv([scenario], tripProfile ? [tripProfile] : []) },
      { suffix: 'blocking-blocks', contents: blockingBlocksCsv(blocks) },
      { suffix: 'blocking-activities', contents: blockingActivitiesCsv(blocks) },
      { suffix: 'blocking-summaries', contents: blockingSummariesCsv([summary, ...summary.blockSummaries]) },
    ];
  }
}
