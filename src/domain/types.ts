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
export interface ServiceDayDefinition extends EntityMetadata { id: EntityId; scenarioId: EntityId; kind: ServiceDayKind; name: string; annualServiceDays: number; sequence: number; }
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
export interface RuntimeProfile extends EntityMetadata { id: EntityId; scenarioId: EntityId; routeId: EntityId; patternId: EntityId; name: string; bands: RuntimeBand[]; calculationRevision?: number; }
export interface RuntimeAssignment extends EntityMetadata { id: EntityId; scenarioId: EntityId; patternId: EntityId; serviceDayId: EntityId; runtimeProfileId: EntityId; }
/** A transient additive request. It is never persisted as a scheduling record. */
export interface GenerateTripsRequest {
  scenarioId: EntityId;
  routeId: EntityId;
  serviceDayId: EntityId;
  patternId: EntityId;
  firstTrip: ServiceSeconds;
  headwaySeconds: DurationSeconds;
  lastTrip: ServiceSeconds;
  tripProfileId?: EntityId;
}
export interface AddTripRequest extends Omit<GenerateTripsRequest, 'headwaySeconds' | 'lastTrip'> {
  directionId: EntityId;
}
export type GenerationLimit = { mode: 'endTime'; endTime: ServiceSeconds } | { mode: 'tripCount'; tripCount: number };
/** @deprecated Saved generation inputs are retained only for reading the historical Phase 2 implementation. */
export interface TripGenerationSet extends EntityMetadata { id: EntityId; scenarioId: EntityId; routeId: EntityId; serviceDayId: EntityId; patternId: EntityId; name: string; firstDeparture: ServiceSeconds; headwaySeconds: DurationSeconds; limit: GenerationLimit; generationRevision: number; }
export interface ScheduledPoint { patternPointId: EntityId; sequence: number; time: ServiceSeconds; }
export interface TripCalculationSource { runtimeProfileId: EntityId; runtimeCalculationRevision: number; }
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
export interface PullOutActivity { id: EntityId; type: 'pullOut'; sequence: number; startTime: ServiceSeconds; endTime: ServiceSeconds; fromNodeId?: EntityId; toNodeId: EntityId; }
export interface RevenueTripActivity { id: EntityId; type: 'revenueTrip'; sequence: number; tripId: EntityId; }
export interface DeadheadActivity { id: EntityId; type: 'deadhead'; sequence: number; startTime: ServiceSeconds; endTime: ServiceSeconds; fromNodeId: EntityId; toNodeId: EntityId; miles?: Miles; }
export interface PullInActivity { id: EntityId; type: 'pullIn'; sequence: number; startTime: ServiceSeconds; endTime: ServiceSeconds; fromNodeId: EntityId; toNodeId?: EntityId; }
export type BlockActivity = PullOutActivity | RevenueTripActivity | DeadheadActivity | PullInActivity;
export interface Block extends EntityMetadata { id: EntityId; scenarioId: EntityId; serviceDayId: EntityId; /** Timetable alternative that this block serves. */ tripProfileId?: EntityId; label: string; activities: BlockActivity[]; notes?: string; }
export type CostBasis = 'revenueHours' | 'platformHours' | 'revenueMiles' | 'platformMiles';
export interface CostSource { type: 'user' | 'ntd'; sourceYear?: number; note?: string; }
export interface InflationAssumption { year: number; rate: number; }
export interface CostEstimate { id: EntityId; name: string; basis: CostBasis; rate: number; baseYear: number; source: CostSource; }
export interface CostPlan extends EntityMetadata { id: EntityId; scenarioId: EntityId; name: string; currencyCode: string; estimates: CostEstimate[]; inflation: InflationAssumption[]; }
export type ValidationSeverity = 'error' | 'warning';
export interface ValidationFinding { ruleId: string; severity: ValidationSeverity; entityType: string; entityId: EntityId; field?: string; messageKey: string; parameters?: Record<string, string | number>; }
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
  /** @deprecated Historical Phase 2 collection; authoritative snapshots leave this empty. */
  generationSets: TripGenerationSet[];
  trips: Trip[];
  blocks: Block[];
}

export interface DatabaseRecordMap { projects: Project; scenarios: Scenario; serviceDays: ServiceDayDefinition; routes: Route; nodes: Node; patterns: RoutePattern; directions: RouteDirection; runtimeProfiles: RuntimeProfile; runtimeAssignments: RuntimeAssignment; generationSets: TripGenerationSet; tripProfiles: TripProfile; trips: Trip; blocks: Block; costPlans: CostPlan; appMetadata: AppMetadata; }
