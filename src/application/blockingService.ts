import type { BlockingCommands, BlockingQueries, BlockingRepository } from './ports';
import type { BlockingBlock, BlockingScenario, BlockActivity, RoutePattern, Trip, TripProfile, ValidationFinding } from '../domain/types';
import { applyTripAssignment, assertBlockingScenarioSourceUnchanged, classifyBlockingInsertion, createBlockingBlock, createBlockingScenario, createBlockingScenarioSourceSignature, duplicateBlockingScenario, normalizeBlockActivities, planBulkBoundaryActivities, renameBlockingScenario, summarizeBlock, summarizeBlockingScenario, validateBlockingAssignments, validateBlockingBlock, type BlockingScenarioGraph, type BulkBoundaryRequest, type BulkBoundaryPreview } from '../domain/blocking';
import type { BlockingActivityEditRequest, BlockingAssignmentRequest, BlockingBulkAssignmentRequest, BlockingScenarioCreateRequest, BlockingScenarioDeletionImpact, BlockingCompatibility, BlockSummary, BlockingSummary, BlockingTripsAssignmentRequest, MinimumLayoverRule } from '../domain/blocking';
import { newId, withUpdatedAt } from '../domain/ids';
import { blockingActivitiesCsv, blockingBlocksCsv, blockingScenariosCsv, blockingSummariesCsv } from '../persistence/csv';

export interface BlockingContextProvider {
  getTrip(id: string): Promise<Trip | undefined>;
  listTrips(scenarioId: string, tripProfileId: string): Promise<Trip[]>;
  getTripProfile(id: string): Promise<TripProfile | undefined>;
  listPatterns(scenarioId: string): Promise<RoutePattern[]>;
}

function removeSelectedTripsFromBlock(block: BlockingBlock, tripIds: Set<string>): BlockingBlock {
  const activities = [...block.activities].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
  const removeActivityIds = new Set<string>();
  activities.forEach((activity, index) => {
    if (activity.type === 'revenueTrip' && tripIds.has(activity.tripId)) removeActivityIds.add(activity.id);
    if (activity.type !== 'deadhead') return;
    const previous = [...activities.slice(0, index)].reverse().find((candidate) => candidate.type === 'revenueTrip');
    const next = activities.slice(index + 1).find((candidate) => candidate.type === 'revenueTrip');
    if ((previous?.type === 'revenueTrip' && tripIds.has(previous.tripId)) || (next?.type === 'revenueTrip' && tripIds.has(next.tripId))) removeActivityIds.add(activity.id);
  });
  if (!removeActivityIds.size) return block;
  return normalizeBlockActivities(withUpdatedAt({ ...block, activities: activities.filter((activity) => !removeActivityIds.has(activity.id)) }));
}

/** Application coordinator for lifecycle and transactional Blocking operations. */
export class BlockingApplicationService implements BlockingCommands, BlockingQueries {
  constructor(private readonly repository: BlockingRepository, private readonly context: BlockingContextProvider) {}

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
    const block = createBlockingBlock(scenario, serviceDayId, label); await this.repository.saveBlockingBlocksAtomically([...blocks, block], sourceSignature, scenario.id); return block;
  }

  async updateBlock(block: BlockingBlock, sourceSignature: string): Promise<BlockingBlock> {
    const scenario = await this.repository.getBlockingScenario(block.blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(scenario.id); assertBlockingScenarioSourceUnchanged(scenario, blocks, sourceSignature);
    const updated = normalizeBlockActivities(withUpdatedAt(block));
    await this.assertWriteValid(scenario, [...blocks.filter((candidate) => candidate.id !== block.id), updated]);
    await this.repository.saveBlockingBlocksAtomically([...blocks.filter((candidate) => candidate.id !== block.id), updated], sourceSignature, scenario.id); return updated;
  }

  async deleteBlock(blockingScenarioId: string, blockId: string, sourceSignature: string): Promise<void> {
    const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) throw new Error('Blocking Scenario not found.');
    const blocks = await this.repository.listBlockingBlocks(blockingScenarioId); assertBlockingScenarioSourceUnchanged(scenario, blocks, sourceSignature);
    if (!blocks.some((block) => block.id === blockId)) throw new Error('Block not found.');
    await this.repository.saveBlockingBlocksAtomically(blocks.filter((block) => block.id !== blockId), sourceSignature, scenario.id);
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
  async getBlockSummary(blockingScenarioId: string, blockId: string): Promise<BlockSummary | undefined> { const [scenario, block] = await Promise.all([this.repository.getBlockingScenario(blockingScenarioId), this.repository.getBlockingBlock(blockId)]); if (!scenario || !block) return undefined; const trips = await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId); return summarizeBlock(block, { scenario: { id: scenario.scenarioId }, blockingScenario: scenario, trips, patterns: await this.context.listPatterns(scenario.scenarioId) }); }
  async getScenarioSummary(blockingScenarioId: string, serviceDayId?: string): Promise<BlockingSummary | undefined> { const scenario = await this.repository.getBlockingScenario(blockingScenarioId); if (!scenario) return undefined; const blocks = await this.repository.listBlockingBlocks(blockingScenarioId, serviceDayId); return summarizeBlockingScenario(scenario, blocks, { trips: await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), patterns: await this.context.listPatterns(scenario.scenarioId) }); }
  async validateBlock(blockingScenarioId: string, blockId: string): Promise<ValidationFinding[]> { const [scenario, block] = await Promise.all([this.repository.getBlockingScenario(blockingScenarioId), this.repository.getBlockingBlock(blockId)]); if (!scenario || !block) return [{ ruleId: 'blocking.reference', severity: 'error', category: 'structural', entityType: 'block', entityId: blockId, messageKey: 'blocking.referenceMissing' }]; const trips = await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId); return validateBlockingBlock(block, { scenario: { id: scenario.scenarioId }, blockingScenario: scenario, trips, patterns: await this.context.listPatterns(scenario.scenarioId) }); }
  async classifyInsertion(blockingScenarioId: string, blockId: string, tripId: string, insertAt?: number, minimumLayover?: MinimumLayoverRule): Promise<BlockingCompatibility> { const [scenario, block, trip] = await Promise.all([this.repository.getBlockingScenario(blockingScenarioId), this.repository.getBlockingBlock(blockId), this.context.getTrip(tripId)]); if (!scenario || !block || !trip) return { status: 'incomplete', findings: [] }; return classifyBlockingInsertion({ block, insertAt, trip, trips: await this.context.listTrips(scenario.scenarioId, scenario.tripProfileId), patterns: await this.context.listPatterns(scenario.scenarioId), minimumLayover }); }
  async getTripBlockingContext(tripId: string, blockingScenarioId: string): Promise<{ block?: BlockingBlock; blockingScenario?: BlockingScenario; tripProfile?: TripProfile }> { const [trip, scenario] = await Promise.all([this.context.getTrip(tripId), this.repository.getBlockingScenario(blockingScenarioId)]); if (!scenario) return { ...(trip?.tripProfileId ? { tripProfile: await this.context.getTripProfile(trip.tripProfileId) } : {}) }; const blocks = await this.repository.listBlockingBlocks(scenario.id); return { blockingScenario: scenario, ...(trip?.tripProfileId ? { tripProfile: await this.context.getTripProfile(trip.tripProfileId) } : {}), block: blocks.find((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === tripId)) };
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
