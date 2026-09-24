import type { AddTripRequest, Block, BlockingBlock, BlockingScenario, CostingAssumptions, GenerateTripsRequest, Project, ProjectSnapshot, RouteDefinitionAggregate, RouteDirection, RoutePattern, RuntimeAssignment, RuntimeProfile, Scenario, ServiceSeconds, Trip, TripGenerationSet, TripProfile, ValidationFinding } from '../domain/types';
import type { BatchPatternChangePreview, BatchPatternChangeRequest, RuntimeCopyPreview, RuntimeCopyRequest, TripCopyPreview, TripCopyRequest } from '../domain/serviceDayCopy';
import type { GenerateTripsPreview, PatternChangePreview, RecalculationPreview, RegenerationPreview, RegenerationResult } from '../domain/trips';
import type { TripShiftPreview, TripShiftRequest } from '../domain/tripShift';
import type { ScenarioRecords } from '../domain/project';
import type { BlockSummary, BlockingAssignmentRequest, BlockingCompatibility, BlockingScenarioCreateRequest, BlockingScenarioDeletionImpact, BlockingActivityEditRequest, BlockingTripsAssignmentRequest } from '../domain/blocking';
import type { CostingAssumptionsInput, CostingCalculationContext, CostingCalculationResult } from '../domain/costing';

export interface RouteDefinitionRepository {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  saveProject(project: Project): Promise<void>;
  listScenarios(projectId: string): Promise<Scenario[]>;
  saveScenario(scenario: Scenario): Promise<void>;
  getScenarioRecords(scenarioId: string): Promise<ScenarioRecords | undefined>;
  saveScenarioRecords(records: ScenarioRecords): Promise<void>;
  /** Writes a reviewed route edit and all affected runtimes, trips, and blocks atomically. */
  commitRouteEdit(records: ScenarioRecords): Promise<void>;
  getRouteDefinition(routeId: string): Promise<RouteDefinitionAggregate | undefined>;
  saveRouteDefinition(aggregate: RouteDefinitionAggregate): Promise<void>;
  getPattern(id: string): Promise<RoutePattern | undefined>;
  listDirections(routeId: string): Promise<RouteDirection[]>;
  getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | undefined>;
  saveProjectSnapshot(snapshot: ProjectSnapshot): Promise<void>;
  getRuntimeProfile(id: string): Promise<RuntimeProfile | undefined>;
  listRuntimeProfiles(routeId: string, patternId?: string): Promise<RuntimeProfile[]>;
  saveRuntimeProfile(profile: RuntimeProfile): Promise<void>;
  deleteRuntimeProfile(profileId: string, replacementProfileId?: string): Promise<void>;
  listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string): Promise<RuntimeAssignment[]>;
  saveRuntimeAssignment(assignment: RuntimeAssignment): Promise<void>;
}

export type BackupImportMode = 'replace' | 'copy' | 'reject';

export interface BackupPort {
  exportProject(projectId: string): Promise<string>;
  importProject(payload: string, mode?: BackupImportMode): Promise<Project>;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStatus {
  state: SaveState;
  updatedAt?: string;
  errorMessage?: string;
}

/** UI-facing ports describe behavior, not a particular page or table layout. */
export interface RouteDefinitionCommands {
  saveRouteDefinition(aggregate: RouteDefinitionAggregate): Promise<void>;
  reversePattern(patternId: string): Promise<RouteDefinitionAggregate>;
  assignPatternDirection(aggregate: RouteDefinitionAggregate, patternId: string, directionId: string): Promise<RouteDefinitionAggregate>;
}

export interface RouteDefinitionQueries {
  loadRouteDefinition(routeId: string): Promise<RouteDefinitionAggregate | undefined>;
  validateRouteDefinition(routeId: string): Promise<ValidationFinding[]>;
  getSaveStatus(): SaveStatus;
  subscribeToSaveStatus(listener: (status: SaveStatus) => void): () => void;
}

/** Runtime ports describe behavior required by the Trips workflow, not a visual layout. */
export interface RuntimeCommands {
  saveRuntimeProfile(profile: RuntimeProfile): Promise<void>;
  renameRuntimeProfile(profileId: string, name: string): Promise<RuntimeProfile>;
  saveRuntimeAssignment(assignment: RuntimeAssignment): Promise<void>;
  copyRuntimeProfile(profileId: string, target: { patternId?: string; routeId?: string; scenarioId?: string; name: string }): Promise<RuntimeProfile>;
  reverseCopyRuntimeProfile(profileId: string, sourcePatternId: string, targetPatternId: string, name: string): Promise<RuntimeProfile>;
  ensureDefaultRuntimeProfile(pattern: RoutePattern): Promise<{ profile: RuntimeProfile; assignments: RuntimeAssignment[] }>;
  deleteRuntimeProfile(profileId: string, replacementProfileId?: string): Promise<void>;
}

export interface RuntimeQueries {
  listRuntimeProfiles(routeId: string, patternId?: string): Promise<RuntimeProfile[]>;
  listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string): Promise<RuntimeAssignment[]>;
  resolveRuntimeBand(profileId: string, departure: ServiceSeconds): Promise<{ band?: RuntimeProfile['bands'][number]; finding?: ValidationFinding }>;
  validateRuntimeProfile(profileId: string, patternId: string): Promise<ValidationFinding[]>;
  validateRuntimeAssignments(scenarioId: string): Promise<ValidationFinding[]>;
  getRuntimePattern(patternId: string): Promise<RoutePattern | undefined>;
}

/** Historical generation-set ports retained only while the pre-2R UI is running. */
export interface TripGenerationRepository {
  getGenerationSet(id: string): Promise<TripGenerationSet | undefined>;
  listGenerationSets(serviceDayId: string, routeId?: string, patternId?: string): Promise<TripGenerationSet[]>;
  saveGenerationSet(set: TripGenerationSet): Promise<void>;
  listTrips(serviceDayId: string, generationSetId?: string): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | undefined>;
  saveTrips(trips: Trip[]): Promise<void>;
  listBlocks(serviceDayId: string): Promise<Block[]>;
  saveBlocks(blocks: Block[]): Promise<void>;
  /** Historical atomic generation-set replacement. */
  replaceGenerationSet(set: TripGenerationSet, trips: Trip[], blocks: Block[]): Promise<void>;
  listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string): Promise<RuntimeAssignment[]>;
  getPattern(id: string): Promise<RoutePattern | undefined>;
  getRuntimeProfile(id: string): Promise<RuntimeProfile | undefined>;
  /** Added by the authoritative trip workflow; optional only for historical test doubles. */
  insertTripsAtomically?(trips: Trip[]): Promise<void>;
  saveTripChangesAtomically?(trips: Trip[], blocks?: Block[]): Promise<void>;
  /** Atomically removes trips and updates blocks from which their activities were removed. */
  deleteTripsAtomically?(tripIds: string[], blocks?: Block[]): Promise<void>;
  listTripProfiles?(scenarioId: string): Promise<import('../domain/types').TripProfile[]>;
  getTripProfile?(id: string): Promise<import('../domain/types').TripProfile | undefined>;
  saveTripProfile?(profile: import('../domain/types').TripProfile): Promise<void>;
  /** Atomically creates a Trip profile and its copied Trips. */
  copyTripProfileAtomically?(profile: import('../domain/types').TripProfile, trips: Trip[]): Promise<void>;
  deleteTripProfile?(profileId: string): Promise<void>;
  listTripsForProfile?(tripProfileId: string): Promise<Trip[]>;
  listBlocksForProfile?(tripProfileId: string): Promise<Block[]>;
  /** Package 3A structural service-day operations. Optional for historical test doubles. */
  getScenarioRecords?(scenarioId: string): Promise<ScenarioRecords | undefined>;
  commitRuntimeCopyAtomically?(preview: RuntimeCopyPreview): Promise<void>;
  replaceTripsForDayAtomically?(preview: TripCopyPreview): Promise<void>;
}

/** Persistence boundary for the authoritative trip workflow. Generation requests are transient. */
export interface AuthoritativeTripRepository {
  listTrips(serviceDayId: string, tripProfileId?: string): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | undefined>;
  listBlocks(serviceDayId: string, tripProfileId?: string): Promise<Block[]>;
  insertTripsAtomically(trips: Trip[]): Promise<void>;
  saveTripChangesAtomically(trips: Trip[], blocks?: Block[]): Promise<void>;
  deleteTripsAtomically(tripIds: string[], blocks?: Block[]): Promise<void>;
  listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string): Promise<RuntimeAssignment[]>;
  getPattern(id: string): Promise<RoutePattern | undefined>;
  getRuntimeProfile(id: string): Promise<RuntimeProfile | undefined>;
}

export interface TripGenerationCommands {
  previewTripGeneration(set: TripGenerationSet, profileId: string): Promise<RegenerationPreview>;
  applyTripGeneration(preview: RegenerationPreview): Promise<RegenerationResult>;
  previewTripShift(tripIds: string[], offsetSeconds: ServiceSeconds): Promise<Trip[]>;
  applyTripShift(tripIds: string[], offsetSeconds: ServiceSeconds): Promise<Trip[]>;
  previewPatternChange(tripId: string, targetPatternId: string, profileId: string): Promise<PatternChangePreview>;
  applyPatternChange(preview: PatternChangePreview): Promise<Trip>;
}

export interface AuthoritativeTripCommands {
  previewGenerateTrips(request: GenerateTripsRequest): Promise<GenerateTripsPreview>;
  generateTrips(request: GenerateTripsRequest): Promise<GenerateTripsPreview>;
  addTrip(request: AddTripRequest): Promise<{ trip: Trip; warnings: ValidationFinding[] }>;
  previewTripPatternChange(tripId: string, targetPatternId: string, directionId: string): Promise<PatternChangePreview>;
  changeTripPattern(preview: PatternChangePreview): Promise<Trip>;
  previewRecalculateTrips(tripIds: string[]): Promise<RecalculationPreview>;
  recalculateTrips(tripIds: string[], confirm?: boolean): Promise<{ trips: Trip[]; impact: RecalculationPreview['impact'] }>;
  previewTripDeletion(tripIds: string[]): Promise<{ deletedTripIds: string[]; affectedBlockIds: string[] }>;
  deleteTrips(tripIds: string[]): Promise<{ deletedTripIds: string[]; affectedBlockIds: string[] }>;
  listStaleTrips(serviceDayId: string, tripProfileId?: string): Promise<Trip[]>;
  previewRuntimeCopy(request: RuntimeCopyRequest): Promise<RuntimeCopyPreview>;
  applyRuntimeCopy(preview: RuntimeCopyPreview): Promise<RuntimeCopyPreview>;
  previewTripCopy(request: TripCopyRequest): Promise<TripCopyPreview>;
  applyTripCopy(preview: TripCopyPreview): Promise<TripCopyPreview>;
  previewBatchPatternChange(request: BatchPatternChangeRequest): Promise<BatchPatternChangePreview>;
  applyBatchPatternChange(preview: BatchPatternChangePreview): Promise<BatchPatternChangePreview>;
  previewStagedTripShift(request: TripShiftRequest): Promise<TripShiftPreview>;
  applyStagedTripShift(preview: TripShiftPreview): Promise<TripShiftPreview>;
}

export interface AuthoritativeTripQueries {
  listScheduleTrips(serviceDayId: string, directionId?: string, tripProfileId?: string): Promise<Trip[]>;
  listStaleTrips(serviceDayId: string, tripProfileId?: string): Promise<Trip[]>;
}

export interface TripGenerationQueries {
  listServiceDayTrips(serviceDayId: string): Promise<Trip[]>;
  validateTrip(tripId: string): Promise<ValidationFinding[]>;
}

/** Persistence contract for normalized Phase 4 Blocking records implemented by Package 4B repositories. */
export interface BlockingRepository {
  listBlockingScenarios(scenarioId: string): Promise<BlockingScenario[]>;
  getBlockingScenario(id: string): Promise<BlockingScenario | undefined>;
  saveBlockingScenario(scenario: BlockingScenario): Promise<void>;
  saveBlockingScenarioGraphAtomically(scenario: BlockingScenario, blocks: BlockingBlock[], expectedSourceSignature?: string, sourceBlockingScenarioId?: string): Promise<void>;
  deleteBlockingScenarioAtomically(scenarioId: string, sourceSignature: string): Promise<BlockingScenarioDeletionImpact>;
  listBlockingBlocks(blockingScenarioId: string, serviceDayId?: string): Promise<BlockingBlock[]>;
  getBlockingBlock(id: string): Promise<BlockingBlock | undefined>;
  saveBlockingBlocksAtomically(blocks: BlockingBlock[], sourceSignature: string, blockingScenarioId?: string): Promise<void>;
}

/** Behavior-oriented command contract consumed by the future Blocking workspace. */
export interface BlockingCommands {
  createBlockingScenario(request: BlockingScenarioCreateRequest): Promise<BlockingScenario>;
  renameBlockingScenario(blockingScenarioId: string, name: string, sourceSignature: string): Promise<BlockingScenario>;
  duplicateBlockingScenario(blockingScenarioId: string, targetName: string, sourceSignature: string): Promise<BlockingScenario>;
  deleteBlockingScenario(blockingScenarioId: string, sourceSignature: string): Promise<BlockingScenarioDeletionImpact>;
  createBlock(blockingScenarioId: string, serviceDayId: string, label: string, sourceSignature: string): Promise<BlockingBlock>;
  updateBlock(block: BlockingBlock, sourceSignature: string): Promise<BlockingBlock>;
  deleteBlock(blockingScenarioId: string, blockId: string, sourceSignature: string): Promise<void>;
  assignTrip(request: BlockingAssignmentRequest): Promise<{ blocks: BlockingBlock[]; findings: ValidationFinding[] }>;
  reassignTrips(request: import('../domain/blocking').BlockingBulkAssignmentRequest): Promise<{ blocks: BlockingBlock[]; findings: ValidationFinding[] }>;
  assignTripsToBlock(request: BlockingTripsAssignmentRequest): Promise<{ blocks: BlockingBlock[]; findings: ValidationFinding[] }>;
  removeTrip(blockingScenarioId: string, serviceDayId: string, tripId: string, sourceSignature: string): Promise<{ blocks: BlockingBlock[] }>;
  removeTrips(blockingScenarioId: string, serviceDayId: string, tripIds: string[], sourceSignature: string): Promise<{ blocks: BlockingBlock[] }>;
  editActivity(request: BlockingActivityEditRequest): Promise<BlockingBlock>;
  previewBulkBoundaryActivities(request: import('../domain/blocking').BulkBoundaryRequest): Promise<import('../domain/blocking').BulkBoundaryPreview>;
  applyBulkBoundaryActivities(request: import('../domain/blocking').BulkBoundaryRequest): Promise<import('../domain/blocking').BulkBoundaryPreview>;
  reorderActivities(blockingScenarioId: string, blockId: string, activityIds: string[], sourceSignature: string): Promise<BlockingBlock>;
}

/** Query contract exposes derived results without prescribing layout or interaction design. */
export interface BlockingQueries {
  listBlockingScenarios(scenarioId: string): Promise<BlockingScenario[]>;
  listBlockingBlocks(blockingScenarioId: string, serviceDayId?: string): Promise<BlockingBlock[]>;
  getBlockSummary(blockingScenarioId: string, blockId: string): Promise<BlockSummary | undefined>;
  getScenarioSummary(blockingScenarioId: string, serviceDayId?: string): Promise<import('../domain/blocking').BlockingSummary | undefined>;
  validateBlock(blockingScenarioId: string, blockId: string): Promise<ValidationFinding[]>;
  classifyInsertion(blockingScenarioId: string, blockId: string, tripId: string, insertAt?: number, minimumLayover?: import('../domain/blocking').MinimumLayoverRule): Promise<BlockingCompatibility>;
  getTripBlockingContext(tripId: string, blockingScenarioId: string): Promise<{ block?: BlockingBlock; blockingScenario?: BlockingScenario; tripProfile?: TripProfile }>;
  exportBlockingScenarioCsv(blockingScenarioId: string): Promise<Array<{ suffix: 'blocking-scenarios' | 'blocking-blocks' | 'blocking-activities' | 'blocking-summaries'; contents: string }>>;
}

/** Read source contract needed to assemble a calculation without persisting derived costs. */
export interface CostingCalculationContextQueries {
  listBlockingScenarios(scenarioId: string): Promise<BlockingScenario[]>;
  getCostingCalculationContext(scenarioId: string, blockingScenarioId: string): Promise<CostingCalculationContext | undefined>;
}

/** Persistence boundary for one editable assumption set owned by a Scenario. */
export interface CostingAssumptionsRepository {
  getCostingAssumptions(scenarioId: string): Promise<CostingAssumptions | undefined>;
  saveCostingAssumptions(assumptions: CostingAssumptions): Promise<void>;
}

/** Application commands for the single Scenario-owned Costing assumptions record. */
export interface CostingCommands {
  loadAssumptions(scenarioId: string): Promise<CostingAssumptions | undefined>;
  saveAssumptions(scenarioId: string, assumptions: CostingAssumptionsInput): Promise<CostingAssumptions>;
}

/** Application query surface for the selected Blocking Scenario's derived cost estimate. */
export interface CostingQueries {
  listBlockingScenarios(scenarioId: string): Promise<BlockingScenario[]>;
  calculateEstimate(request: {
    scenarioId: string;
    blockingScenarioId: string;
    assumptions: CostingAssumptionsInput;
  }): Promise<CostingCalculationResult | undefined>;
  exportEstimateCsv(request: {
    scenarioId: string;
    blockingScenarioId: string;
    assumptions: CostingAssumptionsInput;
  }): Promise<Array<{ suffix: string; contents: string }> | undefined>;
}
