import type { Block, BlockingBlock, BlockingScenario, CostingAssumptions, Project, ProjectSnapshot, RouteDefinitionAggregate, RouteDirection, RoutePattern, RuntimeAssignment, RuntimeProfile, Scenario, ServiceDayDefinition, Trip, TripGenerationSet, TripProfile, ValidationFinding } from '../domain/types';
import type { RuntimeCopyPreview, TripCopyPreview } from '../domain/serviceDayCopy';
import type { ScenarioRecords } from '../domain/project';
import type { ActivityTextInput, BlockDeletionImpact, BlockSummary, BlockingActivityAddRequest, BlockingAssignmentRequest, BlockingCompatibility, BlockingScenarioCreateRequest, BlockingScenarioDeletionImpact, BlockingActivityEditRequest, BlockingTripsAssignmentRequest, BulkDeadheadRequest, MinimumLayoverRule, ParsedActivityInput, ParsedMinimumLayover } from '../domain/blocking';
import type { CostingAssumptionsInput, CostingCalculationContext, CostingCalculationResult, CostingFinding } from '../domain/costing';

export interface RouteDefinitionRepository {
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  saveProject(project: Project): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  listScenarios(projectId: string): Promise<Scenario[]>;
  saveScenario(scenario: Scenario): Promise<void>;
  getScenarioRecords(scenarioId: string): Promise<ScenarioRecords | undefined>;
  saveScenarioRecords(records: ScenarioRecords): Promise<void>;
  /**
   * Reads the stored records of one Scenario inside the write, applies `change` to them, and writes the result.
   * Callers use this instead of `saveScenarioRecords` when their own copy of the Scenario may be older than storage.
   * `change` must be synchronous. Returning the records it was given writes nothing. Rejects when the Scenario no longer exists.
   */
  updateScenarioRecords(scenarioId: string, change: (current: ScenarioRecords) => ScenarioRecords): Promise<ScenarioRecords>;
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

/** Why this tab may not write: another tab holds the write lock, or another tab upgraded the database under it. */
export type SessionReadOnlyReason = 'otherTab' | 'databaseUpgraded';

/** Only one browser tab at a time may write the local database. A read-only tab keeps reading but rejects every write. */
export interface SessionStatus {
  mode: 'active' | 'readOnly';
  reason?: SessionReadOnlyReason;
  /** Plain-language explanation, present when the tab is read-only. */
  message?: string;
}

export interface SessionStatusQueries {
  getSessionStatus(): SessionStatus;
  subscribeToSessionStatus(listener: (status: SessionStatus) => void): () => void;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface SaveStatus {
  state: SaveState;
  updatedAt?: string;
  errorMessage?: string;
}

/**
 * Device-local facts about how well the local data is protected (review issue I-045, user decision 16). They are not project data:
 * they live beside the selection preferences, are never part of a backup, and nothing is calculated from them.
 */
export interface LocalDataProtection {
  /** When the planner last exported a project JSON backup (ISO time). Absent until the first export on this browser profile. */
  lastBackupExportedAt?: string;
  /** The browser's answer to the persistent-storage request: kept, refused, or no such request in this browser. Absent until asked. */
  persistentStorage?: 'granted' | 'denied' | 'unavailable';
  /** When that answer was recorded (ISO time). */
  persistentStorageCheckedAt?: string;
}

/** Read side of the local-data protection facts, for the screen that presents them. */
export interface LocalDataProtectionQueries {
  getLocalDataProtection(): LocalDataProtection;
  subscribeToLocalDataProtection(listener: (state: LocalDataProtection) => void): () => void;
}

/** Where the protection facts are kept on this device. Reads never throw; a missing or malformed record reads as empty. */
export interface LocalDataProtectionStore {
  load(): LocalDataProtection;
  save(state: LocalDataProtection): void;
}

/** The part of `navigator.storage` the application uses. Absent in browsers without the persistent-storage request. */
export interface StorageManagerPort {
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
}

/** Historical generation-set ports. The pre-2R screens that used them are removed; the generationSets table and old backups still need them (decision 13). */
export interface TripGenerationRepository {
  getGenerationSet(id: string): Promise<TripGenerationSet | undefined>;
  listGenerationSets(serviceDayId: string, routeId?: string, patternId?: string): Promise<TripGenerationSet[]>;
  saveGenerationSet(set: TripGenerationSet): Promise<void>;
  listTrips(serviceDayId: string, generationSetId?: string): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip | undefined>;
  saveTrips(trips: Trip[]): Promise<void>;
  listBlocks(serviceDayId: string): Promise<Block[]>;
  /** Historical atomic generation-set replacement. */
  replaceGenerationSet(set: TripGenerationSet, trips: Trip[], blocks: Block[]): Promise<void>;
  listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string): Promise<RuntimeAssignment[]>;
  getPattern(id: string): Promise<RoutePattern | undefined>;
  getRuntimeProfile(id: string): Promise<RuntimeProfile | undefined>;
  /** Added by the authoritative trip workflow; optional only for historical test doubles. */
  insertTripsAtomically?(trips: Trip[]): Promise<void>;
  saveTripChangesAtomically?(trips: Trip[], blocks?: Block[]): Promise<void>;
  saveRegeneratedTripsWithUndo?(beforeTrips: Trip[], afterTrips: Trip[], snapshot: import('../domain/types').TripRegenerationUndo): Promise<void>;
  getLastTripRegenerationUndo?(): Promise<import('../domain/types').TripRegenerationUndo | undefined>;
  restoreLastTripRegenerationUndo?(): Promise<Trip[]>;
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

export interface TripTableImportPreview { context: { scenarioId: string; routeId: string; serviceDayId: string; directionId: string; tripProfileId: string }; rows: import('../domain/types').TripTableImportRow[]; trips: Trip[]; createdCount: number; updatedCount: number; findings: ValidationFinding[]; sourceSignature: string; }

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
  /** Adds a pull-out (first), a pull-in (last), or a deadhead (after `afterTripId`) to a Block. */
  addActivity(request: BlockingActivityAddRequest): Promise<BlockingBlock>;
  /** Gives every connection that ends at the deadhead's From Node and starts at its To Node the same deadhead. Refuses when no connection matches. */
  applyDeadheadToMatchingConnections(request: BulkDeadheadRequest): Promise<{ block: BlockingBlock; appliedCount: number }>;
  /** Moves a revenue Trip, with the deadhead after it, one Trip earlier (-1) or later (1). A move past either end changes nothing. */
  moveTripGroup(blockingScenarioId: string, blockId: string, activityId: string, movement: -1 | 1, sourceSignature: string): Promise<BlockingBlock>;
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
  classifyInsertion(blockingScenarioId: string, blockId: string, tripId: string, insertAt?: number, minimumLayover?: import('../domain/blocking').MinimumLayoverRule): Promise<BlockingCompatibility>;
  /** The compatibility of every listed Trip with one Block, from one read of the Trips and Patterns. Keyed by Trip id. */
  classifyInsertions(blockingScenarioId: string, blockId: string, tripIds: string[], insertAt?: number, minimumLayover?: import('../domain/blocking').MinimumLayoverRule): Promise<Map<string, BlockingCompatibility>>;
  /** The Trips of the Route and service day that no Block of the Blocking Scenario holds. */
  listUnassignedTrips(blockingScenarioId: string, serviceDayId: string, routeId: string): Promise<Trip[]>;
  /** The first free "Block <n>" on the service day of the Blocking Scenario. */
  proposeBlockLabel(blockingScenarioId: string, serviceDayId: string): Promise<string>;
  /** What deleting the Block would remove. `sourceSignature` is the review token that `deleteBlock` takes. */
  previewDeleteBlock(blockingScenarioId: string, blockId: string): Promise<BlockDeletionImpact>;
  /** What deleting the Blocking Scenario would remove. `sourceSignature` is the review token that `deleteBlockingScenario` takes. */
  previewDeleteBlockingScenario(blockingScenarioId: string): Promise<BlockingScenarioDeletionImpact>;
  /** Reads the minutes and miles typed for a pull-out, pull-in, or deadhead. Blank minutes are refused, not read as 0. */
  parseActivityInput(input: ActivityTextInput): ParsedActivityInput;
  /** Reads the minimum-layover rule typed in the dialog. A blank amount is refused, not read as 0. */
  parseMinimumLayover(mode: 'none' | MinimumLayoverRule['mode'], amount: string): ParsedMinimumLayover;
  exportBlockingScenarioCsv(blockingScenarioId: string): Promise<Array<{ suffix: 'blocking-scenarios' | 'blocking-blocks' | 'blocking-activities' | 'blocking-summaries'; contents: string }>>;
}

/**
 * Where the Costing calculation context is read from, one source per kind of record. `listTrips` and `listPatterns` are called once per
 * build, however many Blocks there are, so a build costs a fixed number of reads (review issue I-044).
 */
export interface CostingContextSources {
  getScenario(scenarioId: string): Promise<Scenario | undefined>;
  listServiceDays(scenarioId: string): Promise<ServiceDayDefinition[]>;
  listBlockingScenarios(scenarioId: string): Promise<BlockingScenario[]>;
  getTripProfile(tripProfileId: string): Promise<TripProfile | undefined>;
  /** Every saved Trip of the Scenario that belongs to the Trip Profile. */
  listTrips(scenarioId: string, tripProfileId: string): Promise<Trip[]>;
  listPatterns(scenarioId: string): Promise<RoutePattern[]>;
  listBlockingBlocks(blockingScenarioId: string): Promise<BlockingBlock[]>;
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
  /** The findings that make a set of assumptions unusable. Empty when they are valid. */
  validateAssumptions(assumptions: CostingAssumptionsInput): CostingFinding[];
  /** The total of the annual service-day counts and the limit it must stay within (Phase 5 plan, PL05-07). */
  summarizeServiceDays(serviceDays: ServiceDayDefinition[]): { total: number; maximum: number; exceedsMaximum: boolean };
  /** The service years the estimate covers: the first year of service and one more for each future year. */
  listServiceYears(assumptions: Pick<CostingAssumptionsInput, 'baseServiceYear' | 'futureYearCount'>): number[];
  /** A number of future years as the estimate accepts it: a whole number from 0 to the maximum. */
  normalizeFutureYearCount(value: number): number;
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
