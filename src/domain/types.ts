import type { AutoBlockingRecord } from './autoBlocking';
export type EntityId = string;
export type IsoTimestamp = string;
export type ServiceSeconds = number;
export type DurationSeconds = number;
export type Miles = number;
export type ServiceDayKind = 'weekday' | 'saturday' | 'sunday' | 'holiday' | 'custom';
export interface EntityMetadata { createdAt: IsoTimestamp; updatedAt: IsoTimestamp; }
export interface Project extends EntityMetadata { id: EntityId; name: string; description?: string; distanceUnit: 'miles'; currencyCode: string; }
export interface Scenario extends EntityMetadata { id: EntityId; projectId: EntityId; name: string; description?: string; sourceScenarioId?: EntityId; }
export interface TripProfile extends EntityMetadata { id: EntityId; scenarioId: EntityId; name: string; sourceTripProfileId?: EntityId; }
export type NodeKind = 'timepoint' | 'terminal' | 'garage' | 'other';
export interface ServiceDayDefinition extends EntityMetadata { id: EntityId; scenarioId: EntityId; kind: ServiceDayKind; name: string; annualServiceDays: number; sequence: number; /** Optional 1 to 3 character label for scope toggles (Decision 0059). When absent the label is derived, see `serviceDayAbbreviation`. */ abbreviation?: string; }
export interface Route extends EntityMetadata { id: EntityId; scenarioId: EntityId; name: string; shortName?: string; description?: string; }
export interface Node extends EntityMetadata { id: EntityId; scenarioId: EntityId; routeId: EntityId; name: string; shortName?: string; kind: NodeKind; notes?: string; }
export interface PatternPoint { id: EntityId; nodeId: EntityId; sequence: number; cumulativeMiles: Miles; directionColumnId?: EntityId; }
export interface RouteDirection extends EntityMetadata {
  id: EntityId;
  scenarioId: EntityId;
  routeId: EntityId;
  name: string;
  /** The two application-managed schedule groups available on every route. */
  group?: 'outbound' | 'inbound';
  sequence: number;
  columns: DirectionTimepointColumn[];
}
export interface DirectionTimepointColumn {
  id: EntityId;
  nodeId: EntityId;
  sequence: number;
  labelOverride?: string;
}
export interface RoutePattern extends EntityMetadata { id: EntityId; scenarioId: EntityId; routeId: EntityId; name: string; directionId?: EntityId; sequence?: number; directionLabel?: string; notes?: string; points: PatternPoint[]; }
export interface RouteDefinitionAggregate { route: Route; nodes: Node[]; patterns: RoutePattern[]; directions?: RouteDirection[]; }
export interface RuntimeBand { id: EntityId; label: string; sequence: number; startTime: ServiceSeconds; endTime: ServiceSeconds; segmentRuntimeSeconds: DurationSeconds[]; }
export interface RuntimeProfile extends EntityMetadata { id: EntityId; scenarioId: EntityId; routeId: EntityId; patternId: EntityId; name: string; bands: RuntimeBand[]; calculationMethod?: 'singleBand' | 'blendSegments' | 'segmentStart'; calculationRevision?: number; }
export interface RuntimeAssignment extends EntityMetadata { id: EntityId; scenarioId: EntityId; patternId: EntityId; serviceDayId: EntityId; runtimeProfileId: EntityId; }
/** One span of a planned-frequency plan: start inclusive, end exclusive (Decision 0058). */
export interface PlannedPeriod { id: EntityId; startTime: ServiceSeconds; endTime: ServiceSeconds; headwaySeconds: DurationSeconds; }
/** A Scenario-owned service plan for one Route and Service day. At most one per pair; a record with no periods is not stored. */
export interface PlannedFrequency extends EntityMetadata {
  id: EntityId;
  scenarioId: EntityId;
  routeId: EntityId;
  serviceDayId: EntityId;
  periods: PlannedPeriod[];
  /** Direction ID → node ID. A missing entry means the default measure node. */
  measureNodeIdByDirectionId: Record<EntityId, EntityId>;
}
/** Decision 0079. A passenger stop of one Route. Never a pattern point, timetable column, or runtime segment end. `id` is unique within its stop set. */
export interface RouteStop { id: EntityId; name: string; stopCode?: string; }
export type StopTimingRule = 'interpolate' | 'previous' | 'next';
/** Decision 0079. One stop on the segment from `afterPatternPointId` to the next point by sequence. `sequence` orders stops within the segment. `id` is unique within its pattern. */
export interface PatternStopPlacement { id: EntityId; stopId: EntityId; afterPatternPointId: EntityId; sequence: number; timing: StopTimingRule; }
export type StopTimeRoundingSeconds = 30 | 60;
/** Decision 0080. Pattern point ID → the stop ID of that timepoint on its pattern. A trimmed, non-blank string. */
export type TimepointStopCodes = Record<EntityId, string>;
/** Decision 0079. At most one per Route. Not stored when it has no stops and no timepoint stop IDs. */
export interface RouteStopSet extends EntityMetadata {
  id: EntityId; scenarioId: EntityId; routeId: EntityId;
  roundingSeconds: StopTimeRoundingSeconds;
  stops: RouteStop[];
  /** Pattern ID → its placements, ordered by segment, then `sequence`. A pattern with no stops has no entry. */
  placementsByPatternId: Record<EntityId, PatternStopPlacement[]>;
  /** Decision 0080. Pattern ID → its timepoints' stop IDs. A pattern with none has no entry. Absent in sets written before Decision 0080. */
  timepointStopCodesByPatternId?: Record<EntityId, TimepointStopCodes>;
}
/** A transient additive request. It is never persisted as a scheduling record. */
export interface GenerateTripsRequest {
  scenarioId: EntityId;
  routeId: EntityId;
  serviceDayId: EntityId;
  patternId: EntityId;
  /** Headway form: required unless `slots` is given. */
  firstTrip?: ServiceSeconds;
  /** Headway form: required unless `slots` is given. */
  headwaySeconds?: DurationSeconds;
  /** Inclusive final departure when building by time. Exactly one generation limit is required. */
  lastTrip?: ServiceSeconds;
  /** Requested generated-trip count when building by count. Exactly one generation limit is required. */
  tripCount?: number;
  /**
   * Slot form (Decision 0058 item 7): the exact times to build, in increasing order. When given, `firstTrip`, `headwaySeconds`, `lastTrip`
   * and `tripCount` must all be absent.
   */
  slots?: ServiceSeconds[];
  /**
   * Node whose time each departure or slot gives (the Pattern's first visit of it). Earlier and later stops are calculated with the anchor
   * method of Regenerate (Decision 0046). Absent: the time is the first stop's, exactly as before Decision 0058.
   */
  anchorNodeId?: EntityId;
  tripProfileId?: EntityId;
}
export interface AddTripRequest extends Omit<GenerateTripsRequest, 'headwaySeconds' | 'lastTrip' | 'tripCount' | 'slots' | 'anchorNodeId' | 'firstTrip'> {
  firstTrip: ServiceSeconds;
  directionId: EntityId;
}
export type GenerationLimit = { mode: 'endTime'; endTime: ServiceSeconds } | { mode: 'tripCount'; tripCount: number };
/** @deprecated Saved generation inputs are retained only for reading the historical Phase 2 implementation. */
export interface TripGenerationSet extends EntityMetadata { id: EntityId; scenarioId: EntityId; routeId: EntityId; serviceDayId: EntityId; patternId: EntityId; name: string; firstDeparture: ServiceSeconds; headwaySeconds: DurationSeconds; limit: GenerationLimit; generationRevision: number; }
export interface ScheduledPoint { patternPointId: EntityId; sequence: number; time: ServiceSeconds; }
export interface TripCalculationSource { runtimeProfileId: EntityId; runtimeCalculationRevision: number;
  /** Decision 0081 item 11 (FX7). `runtimeInputsSignature` of the profile when the Trip's times were calculated. Absent on older Trips, which keep the revision rule. */
  runtimeInputsSignature?: string; }
export type TripCreationMethod = 'generated' | 'manual';
export interface TripProvenance {
  kind: 'generated' | 'manual';
  /** Authoritative creation method for current and future trip records. */
  creationMethod?: TripCreationMethod;
  /** @deprecated Historical generation-set linkage; authoritative trips leave these unset. */
  generationSetId?: EntityId;
  /** @deprecated Historical generation-set revision. */
  generationRevision?: number;
  /** @deprecated Historical generation-set sequence. */
  generationSequence?: number;
  /** Fields changed after generation. A generated trip remains generated when edited. */
  manuallyChangedFields: Array<'patternId' | 'times'>;
  /** Net signed shift applied to the generated schedule, in seconds. */
  manualTimeShiftSeconds?: DurationSeconds;
  runtimeProfileId?: EntityId;
  runtimeCalculationRevision?: number;
  /** Explicit calculation source; the direct fields above remain readable for legacy records. */
  calculationSource?: TripCalculationSource;
}
export interface Trip extends EntityMetadata { id: EntityId; scenarioId: EntityId; routeId: EntityId; serviceDayId: EntityId; patternId: EntityId; /** Scenario-wide timetable alternative. Legacy records may omit this until normalized. */ tripProfileId?: EntityId; publicLabel?: string; stopTimes: ScheduledPoint[]; provenance: TripProvenance; }
/** One-step local undo state for the most recently applied trip regeneration or pattern change. */
export interface TripRegenerationUndo { id: 'last'; scenarioId: EntityId; tripProfileId: EntityId; createdAt: string; beforeTrips: Trip[]; afterTrips: Trip[];
  /** Absent means regeneration (Decision 0070). */
  kind?: 'regeneration' | 'patternChange'; }
export interface TripTableImportRow { tripId?: EntityId; patternId: EntityId; publicLabel?: string; stopTimes: Array<{ patternPointId: EntityId; time: ServiceSeconds }>; }
/** A named, scenario-wide blocking alternative. Its Trip Profile source is immutable after creation. */
export interface BlockingScenario extends EntityMetadata { id: EntityId; scenarioId: EntityId; tripProfileId: EntityId; name: string; description?: string; /** Decision 0055: present when the Blocking Scenario was generated by "Build blocks automatically". */ autoBlocking?: AutoBlockingRecord; }
/** A pull-out may use legacy explicit times or an offset from the first revenue Trip. */
export interface PullOutActivity { id: EntityId; type: 'pullOut'; sequence: number; startTime?: ServiceSeconds; endTime?: ServiceSeconds; minutesBeforeFirstTrip?: number; fromNodeId?: EntityId; toNodeId: EntityId; miles?: Miles; }
export interface RevenueTripActivity { id: EntityId; type: 'revenueTrip'; sequence: number; tripId: EntityId; }
/** A new or edited deadhead uses a whole-minute duration from its preceding revenue Trip.
 * Legacy imported activities may retain paired explicit times. */
export interface DeadheadActivity { id: EntityId; type: 'deadhead'; sequence: number; minutesAfterPreviousTrip?: number; startTime?: ServiceSeconds; endTime?: ServiceSeconds; fromNodeId: EntityId; toNodeId: EntityId; miles?: Miles; }
/** A pull-in may use legacy explicit times or an offset from the last revenue Trip. */
export interface PullInActivity { id: EntityId; type: 'pullIn'; sequence: number; startTime?: ServiceSeconds; endTime?: ServiceSeconds; minutesAfterLastTrip?: number; fromNodeId: EntityId; toNodeId?: EntityId; miles?: Miles; }
export type BlockActivity = PullOutActivity | RevenueTripActivity | DeadheadActivity | PullInActivity;
/** Phase 4 normalized Block ownership. Legacy `Block` remains readable at import/migration boundaries. */
export interface BlockingBlock extends EntityMetadata { id: EntityId; scenarioId: EntityId; blockingScenarioId: EntityId; serviceDayId: EntityId; label: string; activities: BlockActivity[]; notes?: string; }
export interface Block extends EntityMetadata { id: EntityId; scenarioId: EntityId; serviceDayId: EntityId; /** Phase 4 ownership. Legacy records may omit this until migration/import normalization. */ blockingScenarioId?: EntityId; /** Historical timetable ownership retained only at legacy boundaries. */ tripProfileId?: EntityId; label: string; activities: BlockActivity[]; notes?: string; }
export interface CostingAssumptions extends EntityMetadata {
  id: EntityId;
  scenarioId: EntityId;
  /** The first costing release is fixed to USD per Vehicle Revenue Hour. */
  currencyCode: 'USD';
  enteredRate?: number;
  rateYear: number;
  sourceType: 'user' | 'ntd';
  sourceNote?: string;
  baseServiceYear: number;
  futureYearCount: number;
  annualEscalation: number;
  /**
   * Decision 0051. The Scenario's shared layover and deadhead factors. Since Decision 0062 they are written no more; a Trip Profile with no
   * entry in `tripProfileEstimateFactors` still uses them.
   */
  estimateFactors?: CostingEstimateFactors;
  /** Decision 0062. Each Trip Profile's own factors, at most one entry per Trip Profile. An entry, even an empty one, replaces `estimateFactors`. */
  tripProfileEstimateFactors?: TripProfileEstimateFactors[];
  /** Decision 0077. At most one entry per Trip Profile × Route. */
  routeEstimateFactors?: RouteEstimateFactors[];
}
/** Decision 0062. The estimate factors of one Trip Profile of the Scenario. */
export interface TripProfileEstimateFactors { tripProfileId: EntityId; factors: CostingEstimateFactors }
/** Decision 0077. The estimate factors of one Route under one Trip Profile. Blank cells inherit the Trip Profile's resolved factors. */
export interface RouteEstimateFactors { tripProfileId: EntityId; routeId: EntityId; factors: CostingEstimateFactors }
/** Decision 0051. A value absent means "not entered". Fractions are in [0, 1). */
export interface CostingFactorPair { layoverFraction?: number; deadheadFraction?: number }
export interface CostingServiceDayFactors extends CostingFactorPair { serviceDayId: EntityId }
export interface CostingEstimateFactors { allDays: CostingFactorPair; serviceDays: CostingServiceDayFactors[] }
export type ValidationSeverity = 'error' | 'warning';
export type ValidationCategory = 'structural' | 'operational';
export interface ValidationFinding { ruleId: string; severity: ValidationSeverity; category?: ValidationCategory; entityType: string; entityId: EntityId; field?: string; messageKey: string; parameters?: Record<string, string | number>; }
export interface AppMetadata { key: string; value: string; }

/** Complete project graph used by the Phase 1 backup and restore workflow. */
export interface ProjectSnapshot {
  project: Project;
  scenarios: Scenario[];
  serviceDays: ServiceDayDefinition[];
  routes: Route[];
  nodes: Node[];
  patterns: RoutePattern[];
  directions?: RouteDirection[];
  runtimeProfiles: RuntimeProfile[];
  runtimeAssignments: RuntimeAssignment[];
  tripProfiles?: TripProfile[];
  /** Phase 4 normalized Blocking Scenario records. Legacy snapshots may omit this collection. */
  blockingScenarios?: BlockingScenario[];
  /** Scenario-owned costing inputs. Legacy snapshots and lazy-created scenarios may omit this collection. */
  costingAssumptions?: CostingAssumptions[];
  /** Scenario-owned planned frequencies (Decision 0058). Snapshots before backup schema 10 omit this collection. */
  plannedFrequencies?: PlannedFrequency[];
  /** Decision 0079. Snapshots before backup schema 13 omit this collection. */
  routeStopSets?: RouteStopSet[];
  /** @deprecated Historical Phase 2 collection; authoritative snapshots leave this empty. */
  generationSets: TripGenerationSet[];
  trips: Trip[];
  blocks: Block[];
}

/** Decision 0081. The commands that store a restore point, and `restore`, which records a restore of an existing Scenario. */
export type RestorePointKind =
  | 'deleteProject' | 'deleteScenario' | 'deleteRoute' | 'deletePattern' | 'resetPatternService' | 'rebalancePattern' | 'deleteNodes'
  | 'deleteRuntimeProfile' | 'deleteTrips' | 'copyTripsFromDay' | 'deleteTripProfile' | 'unassignTrips' | 'moveTripsToBlock'
  | 'deleteBlockingScenario' | 'deleteBlocks' | 'copyBlocksFromDay' | 'rebuildAutoBlocks' | 'replaceBoundaryActivities'
  | 'removeBlockActivity' | 'deleteDeadheads' | 'clearPlan' | 'copyPlanFromDay' | 'copyPlansFromScenario' | 'restore';
/** Decision 0081. One collection of `ScenarioRecords`. `scenario` and `costingAssumptions` are single records, read as lists of 0 or 1. */
export type RecordCollection = 'scenario' | 'serviceDays' | 'routes' | 'nodes' | 'patterns' | 'directions' | 'runtimeProfiles' | 'runtimeAssignments'
  | 'tripProfiles' | 'blockingScenarios' | 'costingAssumptions' | 'generationSets' | 'trips' | 'blocks' | 'plannedFrequencies' | 'routeStopSets';
/** Decision 0081. What one command did to one Scenario's records. */
export interface RecordChange {
  /** Full rows the command deleted. */
  removed: Partial<Record<RecordCollection, Array<{ id: EntityId }>>>;
  /** Full previous versions of the rows the command changed. */
  changedBefore: Partial<Record<RecordCollection, Array<{ id: EntityId }>>>;
  /** Ids the command created. */
  added: Partial<Record<RecordCollection, EntityId[]>>;
  /** Row id → stamp of the row as the command left it, for every changed and added row. */
  writtenStamps: Partial<Record<RecordCollection, Record<EntityId, string>>>;
}
/** Decision 0081. The records a restore point names; their names are stored with it. */
export interface RestorePointRefs { routeId?: EntityId; patternId?: EntityId; runtimeProfileId?: EntityId; tripProfileId?: EntityId; blockingScenarioId?: EntityId; serviceDayId?: EntityId; sourceServiceDayId?: EntityId; blockId?: EntityId; }
export interface RestorePointNames { project: string; scenario: string; route?: string; pattern?: string; runtimeProfile?: string; tripProfile?: string; blockingScenario?: string; serviceDay?: string; sourceServiceDay?: string; block?: string; sourceScenario?: string; }
export type RestorePointCounts = Partial<Record<RecordCollection, { removed: number; changed: number; added: number }>>;
/** Decision 0081. A restore point as listed. Its payload is a separate record. Local operational data, never in a backup. */
export interface RestorePointSummary {
  id: EntityId; kind: RestorePointKind; scope: 'scenario' | 'project';
  projectId: EntityId; scenarioId?: EntityId; createdAt: IsoTimestamp;
  names: RestorePointNames; counts: RestorePointCounts;
  /** A count the command was given, such as the number of selected trips. */
  quantity?: number;
  /** A word the label needs, such as 'pullOut' or 'pullIn'. */
  detail?: string;
  /** For kind 'restore': the kind of the point that was restored. */
  restoredKind?: RestorePointKind;
  /** JSON length of the payload at capture, for the size limit. */
  sizeEstimate: number;
}
export interface RestorePointPayload { id: EntityId; change?: RecordChange; projectSnapshot?: ProjectSnapshot; }

export interface DatabaseRecordMap { projects: Project; scenarios: Scenario; serviceDays: ServiceDayDefinition; routes: Route; nodes: Node; patterns: RoutePattern; directions: RouteDirection; runtimeProfiles: RuntimeProfile; runtimeAssignments: RuntimeAssignment; generationSets: TripGenerationSet; tripProfiles: TripProfile; blockingScenarios: BlockingScenario; trips: Trip; tripRegenerationUndo: TripRegenerationUndo; blocks: Block; costingAssumptions: CostingAssumptions; plannedFrequencies: PlannedFrequency; routeStopSets: RouteStopSet; appMetadata: AppMetadata; restorePoints: RestorePointSummary; restorePointPayloads: RestorePointPayload; }
