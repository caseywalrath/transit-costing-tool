import { MAX_ANNUAL_SERVICE_DAYS } from '../domain/costing';
import { metadata, newId, withUpdatedAt } from '../domain/ids';
import { createProject, createScenarioRecords, duplicateRouteRecords, duplicateScenario, renameProject as renameProjectRecord, type ScenarioRecords } from '../domain/project';
import { duplicatePattern, getSegmentMiles, normalizePattern, reversePattern, validatePattern } from '../domain/patterns';
import { createManagedDirections, ensureManagedDirections, oppositeDirectionGroup } from '../domain/directions';
import { classifyPatternEdit, describePatternPointChange, getPatternServiceImpact, rebalanceRuntimeProfile, rebalanceTripForPattern, reconcileRouteTimetables, resetPatternService, type DirectionOrderConflict, type PatternServiceImpact, type RouteEditClassification, type RouteEditMode } from '../domain/safeRouteEditing';
import { sortServiceDays } from '../domain/serviceDays';
import { copyRuntimeProfile, normalizeRuntimeProfile, reverseCopyRuntimeProfile, validateRuntimeProfile, withRuntimeCalculationRevision, RuntimeProfileDeletionError } from '../domain/runtime';
import type { Block, BlockActivity, Node, Project, ProjectSnapshot, Route, RouteDefinitionAggregate, RouteDirection, RoutePattern, RuntimeAssignment, RuntimeProfile, Scenario, ServiceDayDefinition, ValidationFinding } from '../domain/types';
import { validateNodeDeletion, validateRouteDefinition } from '../domain/validation';
import { adjustBlockReferences } from '../domain/trips';
import { authoritativeTripsCsv, blockActivitiesCsv, blocksCsv, directionColumnsCsv, directionsCsv, generationSetsCsv, nodesCsv, patternPointsCsv, patternsCsv, routeCsv, runtimeBandsCsv, scheduledPointsCsv, tripsCsv } from '../persistence/csv';
import type { BackupPort, LocalDataProtection, RouteDefinitionRepository, SaveStatus } from './ports';
import { assertReviewCurrent, fingerprint } from './reviewToken';
import { SaveStatusPublisher, type LocalDataProtectionService } from './saveStatus';

export interface RouteWorkspaceSelection {
  projects: Project[];
  project?: Project;
  scenarios: Scenario[];
  records?: ScenarioRecords;
  aggregate?: RouteDefinitionAggregate;
}

export interface CsvFile {
  suffix: 'routes' | 'nodes' | 'directions' | 'direction-columns' | 'patterns' | 'pattern-points' | 'runtime-bands' | 'generation-sets' | 'trips' | 'scheduled-points' | 'blocks' | 'block-activities';
  contents: string;
}

export interface PatternDeletionImpact {
  patternId: string;
  runtimeProfileCount: number;
  runtimeAssignmentCount: number;
  tripCount: number;
  affectedBlockCount: number;
  /** Fingerprint of the records this review covers; `deletePattern` requires it. */
  reviewToken: string;
}

export interface DirectionDeletionImpact {
  directionId: string;
  patternIds: string[];
}

export interface RuntimeProfileDeletionImpact {
  profileId: string;
  assignmentCount: number;
  tripCount: number;
  /** Fingerprint of the records this review covers; `deleteRuntimeProfile` requires it. */
  reviewToken: string;
}

/** Records removed with one Route and the block activities that must be detached. */
export interface RouteDeletionImpact {
  routeId: string;
  /** Fingerprint of the records this review covers; `deleteRoute` requires it. */
  reviewToken: string;
  nodeCount: number;
  directionCount: number;
  patternCount: number;
  runtimeProfileCount: number;
  runtimeAssignmentCount: number;
  generationSetCount: number;
  tripCount: number;
  affectedBlockCount: number;
  removedBlockActivityCount: number;
  removedNonRevenueActivityCount: number;
}

export interface NodeDeletionImpact {
  nodeId: string;
  patternCount: number;
  affectedBlockCount: number;
  removedNonRevenueActivityCount: number;
}

/** A Scenario owns all listed records; blocks themselves are deleted with it. */
export interface ScenarioDeletionImpact {
  scenarioId: string;
  /** Fingerprint of the records this review covers; `deleteScenario` requires it. */
  reviewToken: string;
  remainingScenarioCount: number;
  routeCount: number;
  nodeCount: number;
  directionCount: number;
  patternCount: number;
  runtimeProfileCount: number;
  runtimeAssignmentCount: number;
  tripProfileCount: number;
  generationSetCount: number;
  tripCount: number;
  blockCount: number;
}

export interface ProjectDeletionImpact {
  projectId: string;
  /** Fingerprint of the records this review covers; `deleteProject` requires it. */
  reviewToken: string;
  scenarioCount: number;
  routeCount: number;
  patternCount: number;
  tripCount: number;
  blockCount: number;
}

function nonRevenueActivityReferencesAnyNode(activity: BlockActivity, nodeIds: Set<string>): boolean {
  return activity.type !== 'revenueTrip' && ((activity.fromNodeId !== undefined && nodeIds.has(activity.fromNodeId)) || (activity.toNodeId !== undefined && nodeIds.has(activity.toNodeId)));
}

function removeNonRevenueActivitiesForNodes(blocks: Block[], nodeIds: Set<string>): { blocks: Block[]; affectedBlockIds: string[]; affectedBlockCount: number; removedActivityCount: number } {
  const affectedBlockIds: string[] = [];
  let removedActivityCount = 0;
  const updated = blocks.map((block) => {
    const activities = block.activities.filter((activity) => !nonRevenueActivityReferencesAnyNode(activity, nodeIds));
    const removed = block.activities.length - activities.length;
    if (!removed) return block;
    affectedBlockIds.push(block.id);
    removedActivityCount += removed;
    return { ...block, activities: activities.map((activity, sequence) => ({ ...activity, sequence })) };
  });
  return { blocks: updated, affectedBlockIds, affectedBlockCount: affectedBlockIds.length, removedActivityCount };
}

const SERVICE_DAY_MESSAGES: Record<string, (finding: ValidationFinding) => string> = {
  'serviceDay.nameRequired': () => 'Enter a service day name.',
  'serviceDay.annualServiceDaysInvalid': () => 'Annual service days must be a whole number of 0 or more.',
  'serviceDay.annualServiceDaysExceed365': (finding) => `Annual service days cannot total more than ${finding.parameters?.maximum ?? MAX_ANNUAL_SERVICE_DAYS}. This change would make the total ${finding.parameters?.total}.`,
};

/** The plain-language text for one Service day finding, so a screen can show it beside the field the finding names. */
export function serviceDayFindingMessage(finding: ValidationFinding): string {
  return SERVICE_DAY_MESSAGES[finding.messageKey]?.(finding) ?? 'Review this service day.';
}

/** A Service day edit was refused. `findings` name the Service day and the field, so a screen can show each message beside its field. */
export class ServiceDayValidationError extends Error {
  constructor(readonly findings: ValidationFinding[]) {
    super(findings.map(serviceDayFindingMessage).join(' '));
    this.name = 'ServiceDayValidationError';
  }
}

/**
 * Findings for one Service day edit against the Service days of its Scenario. A name must not be blank. A count must be a whole number
 * of 0 or more, and the counts of all Service days must not total more than 365 (Phase 5 plan, PL05-07). A total that is already
 * above 365 (saved before this check) may be reduced in steps but not raised, so a planner can always correct it.
 */
type ServiceDayEdit = Partial<Pick<ServiceDayDefinition, 'name' | 'annualServiceDays'>>;

function serviceDayFindings(days: ServiceDayDefinition[], id: string, patch: ServiceDayEdit): ValidationFinding[] {
  const finding = (messageKey: string, field: string, parameters?: Record<string, string | number>): ValidationFinding => ({ ruleId: messageKey, severity: 'error', entityType: 'serviceDay', entityId: id, field, messageKey, ...(parameters ? { parameters } : {}) });
  const findings: ValidationFinding[] = [];
  if (patch.name !== undefined && !patch.name.trim()) findings.push(finding('serviceDay.nameRequired', 'name'));
  if (patch.annualServiceDays !== undefined) {
    const count = patch.annualServiceDays;
    if (!Number.isInteger(count) || count < 0) findings.push(finding('serviceDay.annualServiceDaysInvalid', 'annualServiceDays'));
    else {
      const stored = days.reduce((sum, day) => sum + day.annualServiceDays, 0);
      const total = days.reduce((sum, day) => sum + (day.id === id ? count : day.annualServiceDays), 0);
      if (total > MAX_ANNUAL_SERVICE_DAYS && total > stored) findings.push(finding('serviceDay.annualServiceDaysExceed365', 'annualServiceDays', { total, maximum: MAX_ANNUAL_SERVICE_DAYS }));
    }
  }
  return findings;
}

/** Everything a Scenario deletion removes, as one fingerprint. */
function scenarioDeletionToken(records: ScenarioRecords): string {
  return fingerprint({
    scenario: records.scenario, serviceDays: records.serviceDays, routes: records.routes, nodes: records.nodes, directions: records.directions,
    patterns: records.patterns, runtimeProfiles: records.runtimeProfiles, runtimeAssignments: records.runtimeAssignments, tripProfiles: records.tripProfiles,
    blockingScenarios: records.blockingScenarios, costingAssumptions: records.costingAssumptions ? [records.costingAssumptions] : [],
    generationSets: records.generationSets, trips: records.trips, blocks: records.blocks,
  });
}

/** Everything a Project deletion removes, as one fingerprint. */
function projectDeletionToken(snapshot: ProjectSnapshot): string {
  return fingerprint({
    project: snapshot.project, scenarios: snapshot.scenarios, serviceDays: snapshot.serviceDays, routes: snapshot.routes, nodes: snapshot.nodes, directions: snapshot.directions,
    patterns: snapshot.patterns, runtimeProfiles: snapshot.runtimeProfiles, runtimeAssignments: snapshot.runtimeAssignments, tripProfiles: snapshot.tripProfiles,
    blockingScenarios: snapshot.blockingScenarios, costingAssumptions: snapshot.costingAssumptions, generationSets: snapshot.generationSets, trips: snapshot.trips, blocks: snapshot.blocks,
  });
}

export interface RouteEditCommitResult {
  aggregate: RouteDefinitionAggregate;
  records: ScenarioRecords;
}

export interface PatternChangePreview {
  kind: 'pattern';
  previewToken: string;
  classification: RouteEditClassification;
  proposedPattern: RoutePattern;
  addedPointIds: string[];
  removedPointIds: string[];
  nodeChangedPointIds: string[];
  affectedColumns: number;
  impact: PatternServiceImpact;
  requiresReset: boolean;
  conflict?: DirectionOrderConflict;
  findings: ValidationFinding[];
}

export interface NodeChangePreview {
  kind: 'nodes';
  previewToken: string;
  classification: RouteEditClassification;
  addedNodeIds: string[];
  deletedNodeIds: string[];
  affectedPatternIds: string[];
  patternsBelowMinimum: string[];
  impact: PatternServiceImpact;
  /** Pull-out, pull-in, and deadhead activities that name a deleted Node. Committing the edit removes them; the Blocks stay. */
  nonRevenueImpact: { blockIds: string[]; removedActivityCount: number };
  requiresReset: boolean;
  conflict?: DirectionOrderConflict;
  findings: ValidationFinding[];
}

type StoredRouteEditPreview = {
  sourceSignature: string;
  routeId: string;
  scenarioId: string;
  kind: 'pattern' | 'nodes';
  proposedPattern?: RoutePattern;
  savedPatternId?: string;
  proposedNodes?: Node[];
};

export class RouteEditPreviewExpiredError extends Error {
  constructor() {
    super('Route or service data changed after this review. Review the impacts again.');
    this.name = 'RouteEditPreviewExpiredError';
  }
}

export class RouteEditValidationError extends Error {
  constructor(readonly findings: ValidationFinding[], message = 'Resolve the highlighted route changes before saving.') {
    super(message);
    this.name = 'RouteEditValidationError';
  }
}

export class DirectionDeletionError extends Error {
  constructor(readonly impact: DirectionDeletionImpact) {
    super('Reassign or delete the patterns in this direction before deleting it.');
    this.name = 'DirectionDeletionError';
  }
}

export class RuntimeProfileTripReferenceError extends Error {
  constructor(readonly profileId: string, readonly tripIds: string[]) {
    super('Delete or recalculate the saved trips that use this runtime profile before deleting it.');
    this.name = 'RuntimeProfileTripReferenceError';
  }
}

/**
 * The `RouteDefinitionRepository` methods that write. This service publishes each of them through its save-status publisher
 * (`save` below); the list lets a test check that no write-like repository method is left unclassified.
 */
export const ROUTE_DEFINITION_WRITE_METHODS: readonly string[] = [
  'saveProject', 'deleteProject', 'saveScenario', 'saveScenarioRecords', 'updateScenarioRecords', 'commitRouteEdit', 'saveRouteDefinition',
  'saveProjectSnapshot', 'saveRuntimeProfile', 'deleteRuntimeProfile', 'saveRuntimeAssignment',
];

export class RouteDefinitionService {
  private readonly routeEditPreviews = new Map<string, StoredRouteEditPreview>();

  /**
   * `saveStatus` is the one publisher of the visible save status; the application passes the same instance to every service that writes
   * (Decision 0001, amendment). `protection` records the time of a JSON backup export.
   */
  constructor(
    private readonly repository: RouteDefinitionRepository,
    private readonly backup: BackupPort,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly saveStatus: SaveStatusPublisher = new SaveStatusPublisher(now),
    private readonly protection?: LocalDataProtectionService,
  ) {}

  getSaveStatus(): SaveStatus { return this.saveStatus.getSaveStatus(); }
  subscribeToSaveStatus(listener: (status: SaveStatus) => void): () => void { return this.saveStatus.subscribeToSaveStatus(listener); }
  getLocalDataProtection(): LocalDataProtection { return this.protection?.getLocalDataProtection() ?? {}; }
  subscribeToLocalDataProtection(listener: (state: LocalDataProtection) => void): () => void {
    if (!this.protection) { listener({}); return () => {}; }
    return this.protection.subscribeToLocalDataProtection(listener);
  }

  async loadWorkspace(projectId?: string, scenarioId?: string, routeId?: string): Promise<RouteWorkspaceSelection> {
    const projects = await this.repository.listProjects();
    const project = projects.find((item) => item.id === projectId) ?? projects[0];
    if (!project) return { projects, scenarios: [] };
    const scenarios = await this.repository.listScenarios(project.id);
    const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
    if (!scenario) return { projects, project, scenarios };
    const records = await this.repository.getScenarioRecords(scenario.id);
    const route = records?.routes.find((item) => item.id === routeId) ?? records?.routes[0];
    const aggregate = route ? await this.repository.getRouteDefinition(route.id) : undefined;
    return { projects, project, scenarios, records, aggregate };
  }

  /** Build a local-only Node edit preview. No route data is written here. */
  async previewNodeChanges(routeId: string, proposedNodes: Node[]): Promise<NodeChangePreview> {
    const records = await this.recordsForRoute(routeId);
    const result = this.buildNodePreview(records, routeId, proposedNodes);
    const previewToken = newId();
    this.routeEditPreviews.set(previewToken, {
      sourceSignature: this.routeEditSignature(records, routeId), routeId, scenarioId: records.scenario.id, kind: 'nodes', proposedNodes: proposedNodes.map((node) => ({ ...node })),
    });
    return { ...result, previewToken };
  }

  /** Commit a previously reviewed Node draft as one scenario transaction. */
  async commitNodeChanges(previewToken: string, mode: RouteEditMode = 'rebalance'): Promise<RouteEditCommitResult> {
    const preview = this.takePreview(previewToken, 'nodes');
    const records = await this.recordsForRoute(preview.routeId);
    if (this.routeEditSignature(records, preview.routeId) !== preview.sourceSignature) throw new RouteEditPreviewExpiredError();
    const checked = this.buildNodePreview(records, preview.routeId, preview.proposedNodes ?? []);
    if (checked.findings.some((finding) => finding.severity === 'error') || checked.conflict) throw new RouteEditValidationError(checked.findings, checked.conflict?.message ?? undefined);
    if (checked.requiresReset && mode !== 'reset') throw new Error('Review the service reset before saving these Node changes.');
    const next = this.applyNodeChanges(records, preview.routeId, preview.proposedNodes ?? [], mode);
    await this.save(() => this.repository.commitRouteEdit(next));
    return { records: next, aggregate: this.aggregateFromRecords(next, preview.routeId) };
  }

  /** Build a Pattern impact preview and reconcile timetable columns without writing. */
  async previewPatternChange(routeId: string, savedPatternId: string | undefined, proposedPattern: RoutePattern): Promise<PatternChangePreview> {
    const records = await this.recordsForRoute(routeId);
    const result = this.buildPatternPreview(records, routeId, savedPatternId, proposedPattern);
    const previewToken = newId();
    this.routeEditPreviews.set(previewToken, {
      sourceSignature: this.routeEditSignature(records, routeId), routeId, scenarioId: records.scenario.id, kind: 'pattern', savedPatternId, proposedPattern: { ...proposedPattern, points: proposedPattern.points.map((point) => ({ ...point })) },
    });
    return { ...result, previewToken };
  }

  /** Commit a reviewed Pattern draft. Rebalance and reset are both atomic. */
  async commitPatternChange(previewToken: string, mode: RouteEditMode = 'rebalance'): Promise<RouteEditCommitResult> {
    const preview = this.takePreview(previewToken, 'pattern');
    const records = await this.recordsForRoute(preview.routeId);
    if (this.routeEditSignature(records, preview.routeId) !== preview.sourceSignature) throw new RouteEditPreviewExpiredError();
    const checked = this.buildPatternPreview(records, preview.routeId, preview.savedPatternId, preview.proposedPattern!);
    if (checked.findings.some((finding) => finding.severity === 'error') || checked.conflict) throw new RouteEditValidationError(checked.findings, checked.conflict?.message ?? undefined);
    if (checked.requiresReset && mode !== 'reset') throw new Error('Review the service reset before saving this Pattern.');
    const next = this.applyPatternChange(records, preview.routeId, preview.savedPatternId, preview.proposedPattern!, mode);
    await this.save(() => this.repository.commitRouteEdit(next));
    return { records: next, aggregate: this.aggregateFromRecords(next, preview.routeId) };
  }

  /** Draft helpers intentionally return data only. They do not update route state. */
  createPatternDraft(aggregate: RouteDefinitionAggregate): RoutePattern {
    const directions = ensureManagedDirections(aggregate.directions ?? [], aggregate.route.scenarioId, aggregate.route.id, this.now());
    return { id: newId(), routeId: aggregate.route.id, scenarioId: aggregate.route.scenarioId, name: 'New pattern', directionId: directions[0]?.id, sequence: aggregate.patterns.filter((pattern) => pattern.directionId === directions[0]?.id).length, points: [], ...metadata(this.now()) };
  }

  duplicatePatternDraft(aggregate: RouteDefinitionAggregate, patternId: string): RoutePattern {
    const source = aggregate.patterns.find((pattern) => pattern.id === patternId);
    if (!source) throw new Error('Pattern not found.');
    return duplicatePattern(source, `${source.name || 'New pattern'} Copy`, this.now());
  }

  reversePatternDraft(aggregate: RouteDefinitionAggregate, patternId: string): RoutePattern {
    const source = aggregate.patterns.find((pattern) => pattern.id === patternId);
    if (!source) throw new Error('Pattern not found.');
    const directions = ensureManagedDirections(aggregate.directions ?? [], aggregate.route.scenarioId, aggregate.route.id, this.now());
    const sourceDirection = directions.find((direction) => direction.id === source.directionId) ?? directions[0];
    const targetDirection = directions.find((direction) => direction.group === oppositeDirectionGroup(sourceDirection.group ?? 'outbound')) ?? directions[0];
    return { ...reversePattern(source, this.now()), name: `${source.name || 'New pattern'} Reverse`, directionId: targetDirection.id, sequence: aggregate.patterns.filter((pattern) => pattern.directionId === targetDirection.id).length };
  }

  async createProject(name: string): Promise<{ project: Project; records: ScenarioRecords }> {
    const project = createProject(name, this.now());
    const records = createScenarioRecords(project.id, 'Scenario 1', this.now());
    await this.save(() => this.repository.saveProjectSnapshot({ project, scenarios: [records.scenario], serviceDays: records.serviceDays, routes: [], nodes: [], patterns: [], runtimeProfiles: [], runtimeAssignments: [], tripProfiles: records.tripProfiles, generationSets: [], trips: [], blocks: [] }));
    return { project, records };
  }

  async renameProject(projectId: string, name: string): Promise<Project> {
    const project = await this.repository.getProject(projectId);
    if (!project) throw new Error('Project not found.');
    const renamed = renameProjectRecord(project, name, this.now());
    await this.save(() => this.repository.saveProject(renamed));
    return renamed;
  }

  async getProjectDeletionImpact(projectId: string): Promise<ProjectDeletionImpact> {
    const snapshot = await this.repository.getProjectSnapshot(projectId);
    if (!snapshot) throw new Error('Project not found.');
    return { projectId, reviewToken: projectDeletionToken(snapshot), scenarioCount: snapshot.scenarios.length, routeCount: snapshot.routes.length, patternCount: snapshot.patterns.length, tripCount: snapshot.trips.length, blockCount: snapshot.blocks.length };
  }

  /** Deletes the Project only if the stored data still matches the review (`getProjectDeletionImpact`) that `reviewToken` came from. */
  async deleteProject(projectId: string, reviewToken: string): Promise<void> {
    const snapshot = await this.repository.getProjectSnapshot(projectId);
    if (!snapshot) throw new Error('Project not found.');
    assertReviewCurrent('project', reviewToken, projectDeletionToken(snapshot));
    await this.save(() => this.repository.deleteProject(projectId));
  }

  async createScenario(projectId: string, name: string): Promise<ScenarioRecords> {
    return this.saveScenarioRecords(createScenarioRecords(projectId, name, this.now()));
  }
  async renameScenario(records: ScenarioRecords, name: string): Promise<ScenarioRecords> {
    if (!name.trim()) throw new Error('Scenario name is required');
    return this.updateScenarioRecords(records.scenario.id, (current) => ({ ...current, scenario: withUpdatedAt({ ...current.scenario, name: name.trim() }, this.now()) }));
  }
  async duplicateScenario(records: ScenarioRecords, name: string): Promise<ScenarioRecords> {
    const stored = await this.repository.getScenarioRecords(records.scenario.id);
    if (!stored) throw new Error('Scenario not found.');
    return this.saveScenarioRecords(duplicateScenario(stored, name, this.now()));
  }
  async getScenarioDeletionImpact(scenarioId: string): Promise<ScenarioDeletionImpact> {
    const records = await this.repository.getScenarioRecords(scenarioId);
    if (!records) throw new Error('Scenario not found.');
    const scenarios = await this.repository.listScenarios(records.scenario.projectId);
    return {
      scenarioId,
      reviewToken: scenarioDeletionToken(records),
      remainingScenarioCount: Math.max(0, scenarios.length - 1),
      routeCount: records.routes.length,
      nodeCount: records.nodes.length,
      directionCount: records.directions?.length ?? 0,
      patternCount: records.patterns.length,
      runtimeProfileCount: records.runtimeProfiles.length,
      runtimeAssignmentCount: records.runtimeAssignments.length,
      tripProfileCount: records.tripProfiles?.length ?? 0,
      generationSetCount: records.generationSets.length,
      tripCount: records.trips.length,
      blockCount: records.blocks.length,
    };
  }
  /** Deletes the Scenario only if the stored data still matches the review (`getScenarioDeletionImpact`) that `reviewToken` came from. */
  async deleteScenario(scenarioId: string, reviewToken: string): Promise<void> {
    const records = await this.repository.getScenarioRecords(scenarioId);
    if (!records) throw new Error('Scenario not found.');
    assertReviewCurrent('scenario', reviewToken, scenarioDeletionToken(records));
    const scenarios = await this.repository.listScenarios(records.scenario.projectId);
    if (scenarios.length <= 1) throw new Error('Create another scenario before deleting the only scenario in this project.');
    const snapshot = await this.repository.getProjectSnapshot(records.scenario.projectId);
    if (!snapshot) throw new Error('Project not found.');
    const removedRouteIds = new Set(records.routes.map((route) => route.id));
    await this.save(() => this.repository.saveProjectSnapshot({
      ...snapshot,
      scenarios: snapshot.scenarios.filter((scenario) => scenario.id !== scenarioId),
      serviceDays: snapshot.serviceDays.filter((day) => day.scenarioId !== scenarioId),
      routes: snapshot.routes.filter((route) => route.scenarioId !== scenarioId),
      nodes: snapshot.nodes.filter((node) => !removedRouteIds.has(node.routeId)),
      patterns: snapshot.patterns.filter((pattern) => !removedRouteIds.has(pattern.routeId)),
      ...(snapshot.directions ? { directions: snapshot.directions.filter((direction) => !removedRouteIds.has(direction.routeId)) } : {}),
      runtimeProfiles: snapshot.runtimeProfiles.filter((profile) => !removedRouteIds.has(profile.routeId)),
      runtimeAssignments: snapshot.runtimeAssignments.filter((assignment) => assignment.scenarioId !== scenarioId),
      tripProfiles: (snapshot.tripProfiles ?? []).filter((profile) => profile.scenarioId !== scenarioId),
      blockingScenarios: (snapshot.blockingScenarios ?? []).filter((blockingScenario) => blockingScenario.scenarioId !== scenarioId),
      costingAssumptions: (snapshot.costingAssumptions ?? []).filter((assumptions) => assumptions.scenarioId !== scenarioId),
      generationSets: snapshot.generationSets.filter((set) => set.scenarioId !== scenarioId),
      trips: snapshot.trips.filter((trip) => trip.scenarioId !== scenarioId),
      blocks: snapshot.blocks.filter((block) => block.scenarioId !== scenarioId),
    }));
  }
  async addRoute(records: ScenarioRecords): Promise<{ records: ScenarioRecords; route: Route }> {
    const route: Route = { id: newId(), scenarioId: records.scenario.id, name: '', ...metadata(this.now()) };
    const directions = createManagedDirections(records.scenario.id, route.id, this.now());
    const saved = await this.updateScenarioRecords(records.scenario.id, (current) => ({ ...current, routes: [...current.routes, route], directions: [...(current.directions ?? []), ...directions] }));
    return { records: saved, route };
  }
  async duplicateRoute(records: ScenarioRecords, routeId: string, name: string): Promise<{ records: ScenarioRecords; route: Route }> {
    let route: Route | undefined;
    const saved = await this.updateScenarioRecords(records.scenario.id, (current) => {
      const duplicate = duplicateRouteRecords(current, routeId, name, this.now());
      route = duplicate.route;
      return duplicate.records;
    });
    return { records: saved, route: route! };
  }
  async getRouteDeletionImpact(routeId: string): Promise<RouteDeletionImpact> {
    return this.planRouteDeletion(await this.recordsForRoute(routeId), routeId).impact;
  }
  /** Deletes the Route only if the stored data still matches the review (`getRouteDeletionImpact`) that `reviewToken` came from. */
  async deleteRoute(routeId: string, reviewToken: string): Promise<ScenarioRecords> {
    const plan = this.planRouteDeletion(await this.recordsForRoute(routeId), routeId);
    assertReviewCurrent('route', reviewToken, plan.impact.reviewToken);
    return this.saveScenarioRecords(plan.next);
  }
  /** Edits the name or the annual count of one Service day. Other fields of the Service day are not editable here and are ignored. */
  async updateServiceDay(records: ScenarioRecords, id: string, patch: ServiceDayEdit): Promise<ScenarioRecords> {
    const stored = await this.repository.getScenarioRecords(records.scenario.id);
    if (!stored) throw new Error('Scenario not found.');
    const day = stored.serviceDays.find((candidate) => candidate.id === id);
    if (!day) throw new Error('Service day not found.');
    const change: ServiceDayEdit = {};
    if (patch.name !== undefined) change.name = patch.name.trim();
    if (patch.annualServiceDays !== undefined) change.annualServiceDays = patch.annualServiceDays;
    if ((Object.keys(change) as Array<keyof ServiceDayEdit>).every((key) => day[key] === change[key])) return stored;
    const findings = serviceDayFindings(stored.serviceDays, id, change);
    if (findings.length) throw new ServiceDayValidationError(findings);
    return this.updateScenarioRecords(records.scenario.id, (current) => {
      const recheck = serviceDayFindings(current.serviceDays, id, change);
      if (recheck.length) throw new ServiceDayValidationError(recheck);
      return { ...current, serviceDays: current.serviceDays.map((candidate) => candidate.id === id ? withUpdatedAt({ ...candidate, ...change }, this.now()) : candidate) };
    });
  }

  async updateRoute(aggregate: RouteDefinitionAggregate, patch: Partial<Route>): Promise<RouteDefinitionAggregate> {
    return this.saveAggregate({ ...aggregate, route: withUpdatedAt({ ...aggregate.route, ...patch }, this.now()) });
  }

  async getDirectionDeletionImpact(aggregate: RouteDefinitionAggregate, directionId: string): Promise<DirectionDeletionImpact> {
    if (!(aggregate.directions ?? []).some((direction) => direction.id === directionId)) throw new Error('Direction not found.');
    const records = await this.repository.getScenarioRecords(aggregate.route.scenarioId);
    return { directionId, patternIds: (records?.patterns ?? aggregate.patterns).filter((pattern) => pattern.directionId === directionId).map((pattern) => pattern.id) };
  }
  async getNodeDeletionImpact(aggregate: RouteDefinitionAggregate, nodeId: string): Promise<NodeDeletionImpact> {
    const records = await this.repository.getScenarioRecords(aggregate.route.scenarioId);
    const nonRevenueAdjusted = records ? removeNonRevenueActivitiesForNodes(records.blocks, new Set([nodeId])) : { blocks: [], affectedBlockCount: 0, removedActivityCount: 0 };
    return {
      nodeId,
      patternCount: validateNodeDeletion(nodeId, aggregate.patterns)[0]?.parameters?.patternCount as number ?? 0,
      affectedBlockCount: nonRevenueAdjusted.affectedBlockCount,
      removedNonRevenueActivityCount: nonRevenueAdjusted.removedActivityCount,
    };
  }


  async getPatternDeletionImpact(patternId: string): Promise<PatternDeletionImpact> {
    return this.planPatternDeletion(await this.recordsForPattern(patternId), patternId).impact;
  }

  /** Confirmed pattern deletion removes only records that cannot remain valid without that pattern. It runs only if the stored data still matches the review (`getPatternDeletionImpact`) that `reviewToken` came from. */
  async deletePattern(patternId: string, reviewToken: string): Promise<{ aggregate: RouteDefinitionAggregate; impact: PatternDeletionImpact }> {
    const records = await this.recordsForPattern(patternId);
    const plan = this.planPatternDeletion(records, patternId);
    assertReviewCurrent('pattern', reviewToken, plan.impact.reviewToken);
    await this.saveScenarioRecords(plan.next);
    const aggregate = await this.repository.getRouteDefinition(plan.routeId);
    if (!aggregate) throw new Error('Route not found after deleting pattern.');
    return { aggregate, impact: plan.impact };
  }

  private async recordsForPattern(patternId: string): Promise<ScenarioRecords> {
    const pattern = await this.repository.getPattern(patternId);
    if (!pattern) throw new Error('Pattern not found.');
    const records = await this.repository.getScenarioRecords(pattern.scenarioId);
    if (!records) throw new Error('The selected scenario is no longer available.');
    return records;
  }

  private planPatternDeletion(records: ScenarioRecords, patternId: string): { impact: PatternDeletionImpact; next: ScenarioRecords; routeId: string } {
    const pattern = records.patterns.find((candidate) => candidate.id === patternId);
    if (!pattern) throw new Error('Pattern not found.');
    const profiles = records.runtimeProfiles.filter((profile) => profile.patternId === patternId);
    const assignments = records.runtimeAssignments.filter((assignment) => assignment.patternId === patternId);
    const generationSets = records.generationSets.filter((set) => set.patternId === patternId);
    const trips = records.trips.filter((trip) => trip.patternId === patternId);
    const tripIds = new Set(trips.map((trip) => trip.id));
    const affectedBlocks = records.blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && tripIds.has(activity.tripId)));
    const impact: PatternDeletionImpact = {
      patternId,
      runtimeProfileCount: profiles.length,
      runtimeAssignmentCount: assignments.length,
      tripCount: trips.length,
      affectedBlockCount: affectedBlocks.length,
      reviewToken: fingerprint({ pattern, profiles, assignments, generationSets, trips, blocks: affectedBlocks }),
    };
    const next: ScenarioRecords = {
      ...records,
      patterns: records.patterns.filter((candidate) => candidate.id !== patternId),
      runtimeProfiles: records.runtimeProfiles.filter((profile) => profile.patternId !== patternId),
      runtimeAssignments: records.runtimeAssignments.filter((assignment) => assignment.patternId !== patternId),
      generationSets: records.generationSets.filter((set) => set.patternId !== patternId),
      trips: records.trips.filter((trip) => trip.patternId !== patternId),
      blocks: adjustBlockReferences(records.blocks, [...tripIds]).blocks,
    };
    return { impact, next, routeId: pattern.routeId };
  }

  validate(aggregate: RouteDefinitionAggregate): ValidationFinding[] { return validateRouteDefinition(aggregate); }
  getSegmentMiles(pattern: RoutePattern, pointIndex: number): number { return getSegmentMiles(pattern, pointIndex); }
  /** Produces the project JSON backup and records that a backup was exported now, so the screen can say when the last one was made. */
  async exportProject(projectId: string): Promise<string> {
    const payload = await this.backup.exportProject(projectId);
    this.protection?.recordBackupExported();
    return payload;
  }
  async importProject(payload: string): Promise<Project> { return this.save(() => this.backup.importProject(payload, 'copy')); }
  /**
   * Exports route-level records for the route currently open in the workspace.
   * Blocks are included only when they reference one of the selected route's
   * trips, so a future multi-route scenario does not export unrelated blocks.
   */
  exportCsv(aggregate: RouteDefinitionAggregate, records?: ScenarioRecords): CsvFile[] {
    const routeId = aggregate.route.id;
    const profiles = records?.runtimeProfiles.filter((profile) => profile.routeId === routeId) ?? [];
    const generationSets = records?.generationSets.filter((set) => set.routeId === routeId) ?? [];
    const trips = records?.trips.filter((trip) => trip.routeId === routeId) ?? [];
    const tripIds = new Set(trips.map((trip) => trip.id));
    const blocks = records?.blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && tripIds.has(activity.tripId))) ?? [];
    return [
      { suffix: 'routes', contents: routeCsv(aggregate.route) },
      { suffix: 'nodes', contents: nodesCsv(aggregate.nodes) },
      { suffix: 'patterns', contents: patternsCsv(aggregate.patterns) },
      { suffix: 'pattern-points', contents: patternPointsCsv(aggregate.patterns) },
      { suffix: 'runtime-bands', contents: runtimeBandsCsv(profiles) },
      { suffix: 'generation-sets', contents: generationSetsCsv(generationSets) },
      { suffix: 'trips', contents: tripsCsv(trips, records?.tripProfiles ?? []) },
      { suffix: 'scheduled-points', contents: scheduledPointsCsv(trips) },
      { suffix: 'blocks', contents: blocksCsv(blocks, records?.tripProfiles ?? []) },
      { suffix: 'block-activities', contents: blockActivitiesCsv(blocks) },
    ];
  }

  /** Current authoritative export surface for the revised Trips workflow. */
  exportAuthoritativeCsv(aggregate: RouteDefinitionAggregate, records?: ScenarioRecords): CsvFile[] {
    const routeId = aggregate.route.id;
    const profiles = records?.runtimeProfiles.filter((profile) => profile.routeId === routeId) ?? [];
    const trips = records?.trips.filter((trip) => trip.routeId === routeId) ?? [];
    const tripIds = new Set(trips.map((trip) => trip.id));
    const blocks = records?.blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && tripIds.has(activity.tripId))) ?? [];
    const directions = (aggregate.directions ?? []).filter((direction) => direction.routeId === routeId);
    return [
      { suffix: 'routes', contents: routeCsv(aggregate.route) },
      { suffix: 'nodes', contents: nodesCsv(aggregate.nodes) },
      { suffix: 'directions', contents: directionsCsv(directions) },
      { suffix: 'direction-columns', contents: directionColumnsCsv(directions) },
      { suffix: 'patterns', contents: patternsCsv(aggregate.patterns) },
      { suffix: 'pattern-points', contents: patternPointsCsv(aggregate.patterns) },
      { suffix: 'runtime-bands', contents: runtimeBandsCsv(profiles) },
      { suffix: 'trips', contents: authoritativeTripsCsv(trips, records?.tripProfiles ?? []) },
      { suffix: 'scheduled-points', contents: scheduledPointsCsv(trips) },
      { suffix: 'blocks', contents: blocksCsv(blocks, records?.tripProfiles ?? []) },
      { suffix: 'block-activities', contents: blockActivitiesCsv(blocks) },
    ];
  }

  async listRuntimeProfiles(routeId: string, patternId?: string): Promise<RuntimeProfile[]> {
    return this.repository.listRuntimeProfiles(routeId, patternId);
  }
  async listDirections(routeId: string): Promise<RouteDirection[]> { return this.repository.listDirections(routeId); }
  async listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string): Promise<RuntimeAssignment[]> {
    return this.repository.listRuntimeAssignments(scenarioId, serviceDayId, patternId);
  }
  async createDefaultRuntimeProfile(pattern: RoutePattern, name = 'Default'): Promise<RuntimeProfile> {
    const profile: RuntimeProfile = {
      id: newId(), scenarioId: pattern.scenarioId, routeId: pattern.routeId, patternId: pattern.id, name: name.trim(),
      calculationMethod: 'segmentStart',
      calculationRevision: 0,
      bands: [{ id: newId(), label: 'All service', sequence: 0, startTime: 0, endTime: 30 * 60 * 60, segmentRuntimeSeconds: Array(Math.max(0, pattern.points.length - 1)).fill(0) }],
      ...metadata(this.now()),
    };
    return this.save(async () => { await this.repository.saveRuntimeProfile(profile); return profile; });
  }
  async saveRuntimeProfile(profile: RuntimeProfile): Promise<RuntimeProfile> {
    const aggregate = await this.repository.getRouteDefinition(profile.routeId);
    const pattern = aggregate?.patterns.find((item) => item.id === profile.patternId);
    if (!pattern) throw new Error('The selected pattern is no longer available.');
    const previous = await this.repository.getRuntimeProfile(profile.id);
    const normalized = withRuntimeCalculationRevision(previous, withUpdatedAt(normalizeRuntimeProfile(profile), this.now()));
    const errors = validateRuntimeProfile(normalized, pattern).filter((finding) => finding.severity === 'error');
    if (errors.length) throw new Error('Review the runtime profile before saving it.');
    return this.save(async () => { await this.repository.saveRuntimeProfile(normalized); return normalized; });
  }
  async renameRuntimeProfile(profileId: string, name: string): Promise<RuntimeProfile> {
    const profile = await this.repository.getRuntimeProfile(profileId);
    if (!profile) throw new Error('The selected runtime profile is no longer available.');
    return this.saveRuntimeProfile({ ...profile, name: name.trim() });
  }
  async assignRuntimeProfile(scenarioId: string, patternId: string, serviceDayId: string, runtimeProfileId: string): Promise<RuntimeAssignment> {
    const existing = (await this.repository.listRuntimeAssignments(scenarioId, serviceDayId, patternId))[0];
    const assignment: RuntimeAssignment = existing
      ? withUpdatedAt({ ...existing, runtimeProfileId }, this.now())
      : { id: newId(), scenarioId, patternId, serviceDayId, runtimeProfileId, ...metadata(this.now()) };
    return this.save(async () => { await this.repository.saveRuntimeAssignment(assignment); return assignment; });
  }
  async copyRuntimeProfile(profileId: string, name: string): Promise<RuntimeProfile> {
    const source = await this.repository.getRuntimeProfile(profileId);
    if (!source) throw new Error('The selected runtime profile is no longer available.');
    const copy = copyRuntimeProfile(source, { name }, this.now());
    return this.save(async () => { await this.repository.saveRuntimeProfile(copy); return copy; });
  }

  /**
   * Provision an initial Default profile only when no profile exists for the pattern, and one assignment for each standard Service day
   * that has none. The check and the writes happen in one repository transaction, so two calls at once (the Trips tab loads twice on
   * its first visit) cannot both create a profile or an assignment. A call that finds everything in place writes nothing and
   * publishes no save status.
   */
  async ensureDefaultRuntimeProfile(pattern: RoutePattern): Promise<{ profile: RuntimeProfile; assignments: RuntimeAssignment[] }> {
    const stored = await this.repository.getScenarioRecords(pattern.scenarioId);
    if (!stored) throw new Error('The selected scenario is no longer available.');
    const unchanged = this.provisionDefaultRuntime(stored, pattern);
    if (unchanged.records === stored) return { profile: unchanged.profile, assignments: unchanged.assignments };
    let provisioned = unchanged;
    await this.updateScenarioRecords(pattern.scenarioId, (current) => { provisioned = this.provisionDefaultRuntime(current, pattern); return provisioned.records; });
    return { profile: provisioned.profile, assignments: provisioned.assignments };
  }

  /** The records after the Default profile and standard-day assignments of one Pattern are in place; the same object when they already are. */
  private provisionDefaultRuntime(records: ScenarioRecords, pattern: RoutePattern): { records: ScenarioRecords; profile: RuntimeProfile; assignments: RuntimeAssignment[] } {
    const now = this.now();
    const expected = Math.max(0, pattern.points.length - 1);
    const profiles = records.runtimeProfiles.filter((candidate) => candidate.routeId === pattern.routeId && candidate.patternId === pattern.id);
    let profile = profiles.find((candidate) => candidate.name.trim().toLowerCase() === 'default') ?? profiles[0];
    let runtimeProfiles = records.runtimeProfiles;
    if (!profile) {
      profile = {
        id: newId(), scenarioId: pattern.scenarioId, routeId: pattern.routeId, patternId: pattern.id, name: 'Default',
        calculationMethod: 'segmentStart',
        calculationRevision: 0,
        bands: [{ id: newId(), label: 'All service', sequence: 0, startTime: 0, endTime: 30 * 60 * 60, segmentRuntimeSeconds: Array(expected).fill(0) }],
        ...metadata(now),
      };
      runtimeProfiles = [...runtimeProfiles, profile];
    } else if (profile.bands.some((band) => band.segmentRuntimeSeconds.length !== expected)) {
      const storedPattern = records.patterns.find((candidate) => candidate.id === pattern.id);
      if (!storedPattern) throw new Error('The selected pattern is no longer available.');
      const resized = withRuntimeCalculationRevision(profile, withUpdatedAt(normalizeRuntimeProfile({ ...profile, bands: profile.bands.map((band) => ({ ...band, segmentRuntimeSeconds: [...band.segmentRuntimeSeconds.slice(0, expected), ...Array(Math.max(0, expected - band.segmentRuntimeSeconds.length)).fill(0)] })) }), now));
      if (validateRuntimeProfile(resized, storedPattern).some((finding) => finding.severity === 'error')) throw new Error('Review the runtime profile before saving it.');
      const resizedId = profile.id;
      profile = resized;
      runtimeProfiles = runtimeProfiles.map((candidate) => candidate.id === resizedId ? resized : candidate);
    }
    const assignments: RuntimeAssignment[] = [];
    const created: RuntimeAssignment[] = [];
    for (const day of sortServiceDays(records.serviceDays).filter((candidate) => candidate.kind === 'weekday' || candidate.kind === 'saturday' || candidate.kind === 'sunday' || candidate.kind === 'holiday')) {
      const existing = records.runtimeAssignments.find((assignment) => assignment.patternId === pattern.id && assignment.serviceDayId === day.id);
      if (existing) { assignments.push(existing); continue; }
      const assignment: RuntimeAssignment = { id: newId(), scenarioId: pattern.scenarioId, patternId: pattern.id, serviceDayId: day.id, runtimeProfileId: profile.id, ...metadata(now) };
      assignments.push(assignment);
      created.push(assignment);
    }
    if (runtimeProfiles === records.runtimeProfiles && !created.length) return { records, profile, assignments };
    return { records: { ...records, runtimeProfiles, runtimeAssignments: [...records.runtimeAssignments, ...created] }, profile, assignments };
  }

  /** Deletes the profile only if the stored data still matches the review (`getRuntimeProfileDeletionImpact`) that `reviewToken` came from. */
  async deleteRuntimeProfile(profileId: string, replacementProfileId: string | undefined, reviewToken: string): Promise<void> {
    const review = await this.runtimeProfileDeletionReview(profileId);
    assertReviewCurrent('runtime profile', reviewToken, review.reviewToken);
    if (review.referencingTrips.length) throw new RuntimeProfileTripReferenceError(profileId, review.referencingTrips.map((trip) => trip.id));
    if (review.assigned.length && !replacementProfileId) throw new RuntimeProfileDeletionError(profileId, review.assigned.map((assignment) => assignment.id), review.assigned.map((assignment) => assignment.serviceDayId));
    if (replacementProfileId) {
      if (replacementProfileId === profileId) throw new Error('Choose a different replacement runtime profile.');
      const replacement = await this.repository.getRuntimeProfile(replacementProfileId);
      if (!replacement || replacement.scenarioId !== review.profile.scenarioId || replacement.routeId !== review.profile.routeId || replacement.patternId !== review.profile.patternId) throw new Error('Replacement runtime profile must belong to the same pattern.');
    }
    await this.save(() => this.repository.deleteRuntimeProfile(profileId, replacementProfileId));
  }
  async getRuntimeProfileDeletionImpact(profileId: string): Promise<RuntimeProfileDeletionImpact> {
    const review = await this.runtimeProfileDeletionReview(profileId);
    return { profileId, assignmentCount: review.assigned.length, tripCount: review.referencingTrips.length, reviewToken: review.reviewToken };
  }
  /** The profile, the assignments that name it, and the Trips that record it as their source: what a deletion of the profile touches. */
  private async runtimeProfileDeletionReview(profileId: string) {
    const profile = await this.repository.getRuntimeProfile(profileId);
    if (!profile) throw new Error('The selected runtime profile is no longer available.');
    const [assignments, records] = await Promise.all([
      this.repository.listRuntimeAssignments(profile.scenarioId, undefined, profile.patternId),
      this.repository.getScenarioRecords(profile.scenarioId),
    ]);
    const assigned = assignments.filter((assignment) => assignment.runtimeProfileId === profileId);
    const referencingTrips = (records?.trips ?? []).filter((trip) => trip.provenance.runtimeProfileId === profileId || trip.provenance.calculationSource?.runtimeProfileId === profileId);
    return { profile, assigned, referencingTrips, reviewToken: fingerprint({ profile: [profile], assignments: assigned, trips: referencingTrips }) };
  }
  /** Every Service day that uses the profile, in the canonical Weekday, Saturday, Sunday, Holiday order (02R-AC18). */
  async listRuntimeProfileServiceDays(profileId: string): Promise<ServiceDayDefinition[]> {
    const profile = await this.repository.getRuntimeProfile(profileId);
    if (!profile) throw new Error('The selected runtime profile is no longer available.');
    const [assignments, records] = await Promise.all([
      this.repository.listRuntimeAssignments(profile.scenarioId, undefined, profile.patternId),
      this.repository.getScenarioRecords(profile.scenarioId),
    ]);
    const dayIds = new Set(assignments.filter((assignment) => assignment.runtimeProfileId === profileId).map((assignment) => assignment.serviceDayId));
    return sortServiceDays((records?.serviceDays ?? []).filter((day) => dayIds.has(day.id)));
  }
  async reverseCopyRuntimeProfile(profileId: string, sourcePatternId: string, targetPatternId: string, name: string): Promise<RuntimeProfile> {
    const source = await this.repository.getRuntimeProfile(profileId);
    if (!source) throw new Error('The selected runtime profile is no longer available.');
    const aggregate = await this.repository.getRouteDefinition(source.routeId);
    const sourcePattern = aggregate?.patterns.find((pattern) => pattern.id === sourcePatternId);
    const targetPattern = aggregate?.patterns.find((pattern) => pattern.id === targetPatternId);
    if (!sourcePattern || !targetPattern) throw new Error('Select an available source and reverse pattern.');
    const copy = reverseCopyRuntimeProfile(source, sourcePattern, targetPattern, name, this.now());
    return this.save(async () => { await this.repository.saveRuntimeProfile(copy); return copy; });
  }
  async validateRuntimeProfile(profile: RuntimeProfile, pattern: RoutePattern): Promise<ValidationFinding[]> {
    return validateRuntimeProfile(profile, pattern);
  }

  /**
   * What deleting a Route removes and changes, computed once for the review and for the deletion so the two cannot disagree.
   * The Route's Trips leave the Blocks that used them, and the Route's Nodes leave the pull-out, pull-in, and deadhead activities
   * that name them; the Blocks stay. The review token covers the Route's own records and every Block that changes.
   */
  private planRouteDeletion(records: ScenarioRecords, routeId: string): { impact: RouteDeletionImpact; next: ScenarioRecords } {
    const patternIds = new Set(records.patterns.filter((pattern) => pattern.routeId === routeId).map((pattern) => pattern.id));
    const profileIds = new Set(records.runtimeProfiles.filter((profile) => profile.routeId === routeId).map((profile) => profile.id));
    const removedTrips = records.trips.filter((trip) => trip.routeId === routeId);
    const nodeIds = new Set(records.nodes.filter((node) => node.routeId === routeId).map((node) => node.id));
    const revenueAdjusted = adjustBlockReferences(records.blocks, removedTrips.map((trip) => trip.id));
    const nonRevenueAdjusted = removeNonRevenueActivitiesForNodes(revenueAdjusted.blocks, nodeIds);
    const removedConnectionActivityCount = records.blocks.reduce((count, block, index) => count + block.activities.filter((activity) => activity.type !== 'revenueTrip').length - revenueAdjusted.blocks[index].activities.filter((activity) => activity.type !== 'revenueTrip').length, 0);
    const changedBlockIds = new Set([...revenueAdjusted.adjustments.map((adjustment) => adjustment.blockId), ...nonRevenueAdjusted.affectedBlockIds]);
    const removed = {
      route: records.routes.filter((route) => route.id === routeId),
      nodes: records.nodes.filter((node) => node.routeId === routeId),
      directions: (records.directions ?? []).filter((direction) => direction.routeId === routeId),
      patterns: records.patterns.filter((pattern) => pattern.routeId === routeId),
      runtimeProfiles: records.runtimeProfiles.filter((profile) => profile.routeId === routeId),
      runtimeAssignments: records.runtimeAssignments.filter((assignment) => patternIds.has(assignment.patternId) || profileIds.has(assignment.runtimeProfileId)),
      generationSets: records.generationSets.filter((set) => set.routeId === routeId),
      trips: removedTrips,
      changedBlocks: records.blocks.filter((block) => changedBlockIds.has(block.id)),
    };
    const impact: RouteDeletionImpact = {
      routeId,
      reviewToken: fingerprint(removed),
      nodeCount: nodeIds.size,
      directionCount: removed.directions.length,
      patternCount: patternIds.size,
      runtimeProfileCount: profileIds.size,
      runtimeAssignmentCount: removed.runtimeAssignments.length,
      generationSetCount: removed.generationSets.length,
      tripCount: removedTrips.length,
      affectedBlockCount: changedBlockIds.size,
      removedBlockActivityCount: revenueAdjusted.adjustments.reduce((count, adjustment) => count + adjustment.removedTripIds.length, 0),
      removedNonRevenueActivityCount: removedConnectionActivityCount + nonRevenueAdjusted.removedActivityCount,
    };
    const next: ScenarioRecords = {
      ...records,
      routes: records.routes.filter((route) => route.id !== routeId),
      nodes: records.nodes.filter((node) => node.routeId !== routeId),
      patterns: records.patterns.filter((pattern) => pattern.routeId !== routeId),
      directions: (records.directions ?? []).filter((direction) => direction.routeId !== routeId),
      runtimeProfiles: records.runtimeProfiles.filter((profile) => profile.routeId !== routeId),
      runtimeAssignments: records.runtimeAssignments.filter((assignment) => !patternIds.has(assignment.patternId) && !profileIds.has(assignment.runtimeProfileId)),
      generationSets: records.generationSets.filter((set) => set.routeId !== routeId),
      trips: records.trips.filter((trip) => trip.routeId !== routeId),
      blocks: nonRevenueAdjusted.blocks,
    };
    return { impact, next };
  }

  private async recordsForRoute(routeId: string): Promise<ScenarioRecords> {
    const aggregate = await this.repository.getRouteDefinition(routeId);
    if (!aggregate) throw new Error('The selected route is no longer available.');
    const records = await this.repository.getScenarioRecords(aggregate.route.scenarioId);
    if (!records) throw new Error('The selected scenario is no longer available.');
    return records;
  }

  private aggregateFromRecords(records: ScenarioRecords, routeId: string): RouteDefinitionAggregate {
    const route = records.routes.find((candidate) => candidate.id === routeId);
    if (!route) throw new Error('The selected route is no longer available.');
    const directions = (records.directions ?? []).filter((direction) => direction.routeId === routeId);
    return {
      route,
      nodes: records.nodes.filter((node) => node.routeId === routeId),
      patterns: records.patterns.filter((pattern) => pattern.routeId === routeId),
      ...(directions.length ? { directions } : {}),
    };
  }

  private routeEditSignature(records: ScenarioRecords, routeId: string) {
    const aggregate = this.aggregateFromRecords(records, routeId);
    const profileIds = new Set(records.runtimeProfiles.filter((profile) => profile.routeId === routeId).map((profile) => profile.id));
    const tripIds = new Set(records.trips.filter((trip) => trip.routeId === routeId).map((trip) => trip.id));
    const nodeIds = new Set(aggregate.nodes.map((node) => node.id));
    const namesRouteNode = (activity: BlockActivity) => activity.type !== 'revenueTrip' && ((activity.fromNodeId !== undefined && nodeIds.has(activity.fromNodeId)) || (activity.toNodeId !== undefined && nodeIds.has(activity.toNodeId)));
    return JSON.stringify({
      aggregate,
      profiles: records.runtimeProfiles.filter((profile) => profileIds.has(profile.id)),
      assignments: records.runtimeAssignments.filter((assignment) => profileIds.has(assignment.runtimeProfileId) || aggregate.patterns.some((pattern) => pattern.id === assignment.patternId)),
      trips: records.trips.filter((trip) => tripIds.has(trip.id)),
      // Blocks that a Node edit can change: those with this Route's Trips and those with a pull-out, pull-in, or deadhead at this Route's Nodes.
      blocks: records.blocks.filter((block) => block.activities.some((activity) => (activity.type === 'revenueTrip' && tripIds.has(activity.tripId)) || namesRouteNode(activity))),
      generationSets: records.generationSets.filter((set) => set.routeId === routeId),
    });
  }

  private takePreview(token: string, kind: StoredRouteEditPreview['kind']) {
    const preview = this.routeEditPreviews.get(token);
    this.routeEditPreviews.delete(token);
    if (!preview || preview.kind !== kind) throw new RouteEditPreviewExpiredError();
    return preview;
  }

  private mergeImpacts(impacts: PatternServiceImpact[]): PatternServiceImpact {
    const unique = (values: string[]) => [...new Set(values)];
    return {
      profileIds: unique(impacts.flatMap((impact) => impact.profileIds)),
      assignmentIds: unique(impacts.flatMap((impact) => impact.assignmentIds)),
      tripIds: unique(impacts.flatMap((impact) => impact.tripIds)),
      blockIds: unique(impacts.flatMap((impact) => impact.blockIds)),
      generationSetIds: unique(impacts.flatMap((impact) => impact.generationSetIds)),
    };
  }

  private managedAggregate(records: ScenarioRecords, routeId: string) {
    const aggregate = this.aggregateFromRecords(records, routeId);
    return { ...aggregate, directions: ensureManagedDirections(aggregate.directions ?? [], aggregate.route.scenarioId, aggregate.route.id, this.now()) };
  }

  private basicPatternFindings(pattern: RoutePattern, aggregate: RouteDefinitionAggregate): ValidationFinding[] {
    const findings = validatePattern(normalizePattern(pattern), aggregate.nodes);
    if (!pattern.directionId || !(aggregate.directions ?? []).some((direction) => direction.id === pattern.directionId)) {
      findings.push({ ruleId: 'pattern.directionRequired', severity: 'error', entityType: 'pattern', entityId: pattern.id, field: 'directionId', messageKey: 'pattern.directionRequired' });
    }
    return findings;
  }

  private buildPatternPreview(records: ScenarioRecords, routeId: string, savedPatternId: string | undefined, proposedPattern: RoutePattern): Omit<PatternChangePreview, 'previewToken'> {
    const aggregate = this.managedAggregate(records, routeId);
    const saved = savedPatternId ? aggregate.patterns.find((pattern) => pattern.id === savedPatternId) : undefined;
    if (savedPatternId && !saved) throw new Error('The selected Pattern is no longer available.');
    const proposed = normalizePattern({ ...proposedPattern, routeId, scenarioId: aggregate.route.scenarioId });
    const findings = this.basicPatternFindings(proposed, aggregate);
    const candidatePatterns = saved
      ? aggregate.patterns.map((pattern) => pattern.id === saved.id ? proposed : pattern)
      : [...aggregate.patterns, proposed];
    const reconciled = reconcileRouteTimetables(aggregate, candidatePatterns, this.now());
    const points = describePatternPointChange(saved, proposed);
    const classification = reconciled.conflict ? 'invalid' : findings.some((finding) => finding.severity === 'error') ? 'invalid' : classifyPatternEdit(saved, proposed);
    const impact = getPatternServiceImpact(saved?.id ?? proposed.id, records.runtimeProfiles, records.runtimeAssignments, records.trips, records.blocks, records.generationSets);
    return {
      kind: 'pattern',
      classification,
      proposedPattern: reconciled.patterns.find((pattern) => pattern.id === proposed.id) ?? proposed,
      addedPointIds: points.added,
      removedPointIds: points.removed,
      nodeChangedPointIds: points.nodeChanged,
      affectedColumns: reconciled.directions.reduce((count, direction) => count + direction.columns.length, 0),
      impact,
      requiresReset: classification === 'reset',
      ...(reconciled.conflict ? { conflict: reconciled.conflict } : {}),
      findings,
    };
  }

  private buildNodePreview(records: ScenarioRecords, routeId: string, proposedNodes: Node[]): Omit<NodeChangePreview, 'previewToken'> {
    const aggregate = this.managedAggregate(records, routeId);
    const normalizedNodes = proposedNodes.map((node) => ({ ...node, routeId, scenarioId: aggregate.route.scenarioId }));
    const currentIds = new Set(aggregate.nodes.map((node) => node.id));
    const proposedIds = new Set(normalizedNodes.map((node) => node.id));
    const deletedNodeIds = aggregate.nodes.filter((node) => !proposedIds.has(node.id)).map((node) => node.id);
    const addedNodeIds = normalizedNodes.filter((node) => !currentIds.has(node.id)).map((node) => node.id);
    const nodeFindings: ValidationFinding[] = normalizedNodes.flatMap((node) => !node.name.trim() ? [{ ruleId: 'node.nameRequired', severity: 'error' as const, entityType: 'node', entityId: node.id, field: 'name', messageKey: 'node.nameRequired' }] : []);
    const candidatePatterns = aggregate.patterns.map((pattern) => normalizePattern({ ...pattern, points: pattern.points.filter((point) => !deletedNodeIds.includes(point.nodeId)) }));
    const affected = aggregate.patterns.filter((pattern) => pattern.points.some((point) => deletedNodeIds.includes(point.nodeId)));
    const patternsBelowMinimum = candidatePatterns.filter((pattern) => pattern.points.length < 2).map((pattern) => pattern.id);
    const findings = [
      ...nodeFindings,
      ...candidatePatterns.flatMap((pattern) => patternsBelowMinimum.includes(pattern.id)
        ? [{ ruleId: 'node.deleteLeavesPatternTooShort', severity: 'error' as const, entityType: 'pattern', entityId: pattern.id, field: 'points', messageKey: 'node.deleteLeavesPatternTooShort' }]
        : this.basicPatternFindings(pattern, { ...aggregate, nodes: normalizedNodes })),
    ];
    const reconciled = reconcileRouteTimetables({ ...aggregate, nodes: normalizedNodes }, candidatePatterns, this.now());
    const impacts = affected.map((pattern) => getPatternServiceImpact(pattern.id, records.runtimeProfiles, records.runtimeAssignments, records.trips, records.blocks, records.generationSets));
    const nonRevenue = removeNonRevenueActivitiesForNodes(records.blocks, new Set(deletedNodeIds));
    return {
      kind: 'nodes',
      classification: findings.some((finding) => finding.severity === 'error') || reconciled.conflict ? 'invalid' : deletedNodeIds.length ? 'deterministic' : 'metadata',
      addedNodeIds,
      deletedNodeIds,
      affectedPatternIds: affected.map((pattern) => pattern.id),
      patternsBelowMinimum,
      impact: this.mergeImpacts(impacts),
      nonRevenueImpact: { blockIds: nonRevenue.affectedBlockIds, removedActivityCount: nonRevenue.removedActivityCount },
      requiresReset: false,
      ...(reconciled.conflict ? { conflict: reconciled.conflict } : {}),
      findings,
    };
  }

  private rebalanceDependentService(records: ScenarioRecords, savedById: Map<string, RoutePattern>, nextById: Map<string, RoutePattern>) {
    const structuralPatternIds = [...savedById.keys()].filter((id) => {
      const saved = savedById.get(id)!;
      const next = nextById.get(id)!;
      const change = describePatternPointChange(saved, next);
      return change.added.length > 0 || change.removed.length > 0;
    });
    const profiles = records.runtimeProfiles.map((profile) => structuralPatternIds.includes(profile.patternId)
      ? rebalanceRuntimeProfile(profile, savedById.get(profile.patternId)!, nextById.get(profile.patternId)!, this.now())
      : profile);
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const trips = records.trips.map((trip) => structuralPatternIds.includes(trip.patternId)
      ? rebalanceTripForPattern(trip, savedById.get(trip.patternId)!, nextById.get(trip.patternId)!, profileById, this.now())
      : trip);
    return { runtimeProfiles: profiles, trips };
  }

  private applyPatternChange(records: ScenarioRecords, routeId: string, savedPatternId: string | undefined, proposedPattern: RoutePattern, mode: RouteEditMode): ScenarioRecords {
    const aggregate = this.managedAggregate(records, routeId);
    const saved = savedPatternId ? aggregate.patterns.find((pattern) => pattern.id === savedPatternId) : undefined;
    const proposed = normalizePattern({ ...proposedPattern, routeId, scenarioId: aggregate.route.scenarioId });
    const candidates = saved ? aggregate.patterns.map((pattern) => pattern.id === saved.id ? proposed : pattern) : [...aggregate.patterns, proposed];
    const reconciled = reconcileRouteTimetables(aggregate, candidates, this.now());
    if (reconciled.conflict) throw new RouteEditValidationError([], reconciled.conflict.message);
    const nextPatterns = records.patterns.map((pattern) => pattern.routeId === routeId ? reconciled.patterns.find((candidate) => candidate.id === pattern.id) ?? pattern : pattern);
    if (!saved) nextPatterns.push(reconciled.patterns.find((pattern) => pattern.id === proposed.id) ?? proposed);
    let next: ScenarioRecords = { ...records, patterns: nextPatterns, directions: [...(records.directions ?? []).filter((direction) => direction.routeId !== routeId), ...reconciled.directions] };
    if (saved) {
      const nextPattern = reconciled.patterns.find((pattern) => pattern.id === saved.id)!;
      const classification = classifyPatternEdit(saved, nextPattern);
      if (classification === 'reset' && mode === 'reset') {
        const reset = resetPatternService(saved.id, next.runtimeProfiles, next.runtimeAssignments, next.trips, next.blocks, next.generationSets);
        next = { ...next, runtimeProfiles: reset.runtimeProfiles, runtimeAssignments: reset.runtimeAssignments, trips: reset.trips, blocks: reset.blocks, generationSets: reset.generationSets };
      } else {
        const rebalanced = this.rebalanceDependentService(next, new Map([[saved.id, saved]]), new Map([[saved.id, nextPattern]]));
        next = { ...next, ...rebalanced };
      }
    }
    return next;
  }

  private applyNodeChanges(records: ScenarioRecords, routeId: string, proposedNodes: Node[], _mode: RouteEditMode): ScenarioRecords {
    const aggregate = this.managedAggregate(records, routeId);
    const nodes = proposedNodes.map((node) => ({ ...node, routeId, scenarioId: aggregate.route.scenarioId }));
    const kept = new Set(nodes.map((node) => node.id));
    const deleted = new Set(aggregate.nodes.filter((node) => !kept.has(node.id)).map((node) => node.id));
    const candidates = aggregate.patterns.map((pattern) => normalizePattern({ ...pattern, points: pattern.points.filter((point) => !deleted.has(point.nodeId)) }));
    const reconciled = reconcileRouteTimetables({ ...aggregate, nodes }, candidates, this.now());
    if (reconciled.conflict) throw new RouteEditValidationError([], reconciled.conflict.message);
    const savedById = new Map(aggregate.patterns.filter((pattern) => candidates.some((candidate) => candidate.id === pattern.id && candidate.points.length !== pattern.points.length)).map((pattern) => [pattern.id, pattern]));
    const nextById = new Map(reconciled.patterns.filter((pattern) => savedById.has(pattern.id)).map((pattern) => [pattern.id, pattern]));
    const nextPatterns = records.patterns.map((pattern) => pattern.routeId === routeId ? reconciled.patterns.find((candidate) => candidate.id === pattern.id) ?? pattern : pattern);
    const rebalanced = this.rebalanceDependentService(records, savedById, nextById);
    // A pull-out, pull-in, or deadhead that names a deleted Node cannot stay; its Block does.
    const blocks = removeNonRevenueActivitiesForNodes(records.blocks, deleted).blocks;
    return {
      ...records,
      blocks,
      nodes: [...records.nodes.filter((node) => node.routeId !== routeId), ...nodes],
      patterns: nextPatterns,
      directions: [...(records.directions ?? []).filter((direction) => direction.routeId !== routeId), ...reconciled.directions],
      ...rebalanced,
    };
  }

  /** Applies a change to the stored Scenario records inside the write, so a caller's older copy is never written back. */
  private async updateScenarioRecords(scenarioId: string, change: (current: ScenarioRecords) => ScenarioRecords): Promise<ScenarioRecords> {
    return this.save(() => this.repository.updateScenarioRecords(scenarioId, change));
  }
  private async saveScenarioRecords(records: ScenarioRecords): Promise<ScenarioRecords> {
    await this.save(() => this.repository.saveScenarioRecords(records));
    return records;
  }
  private async saveAggregate(aggregate: RouteDefinitionAggregate): Promise<RouteDefinitionAggregate> {
    await this.save(() => this.repository.saveRouteDefinition(aggregate));
    return aggregate;
  }
  private async save<T>(operation: () => Promise<T>): Promise<T> {
    return this.saveStatus.run(operation);
  }
}

export type RouteDefinitionApplication = Pick<RouteDefinitionService,
  | 'getSaveStatus'
  | 'subscribeToSaveStatus'
  | 'getLocalDataProtection'
  | 'subscribeToLocalDataProtection'
  | 'loadWorkspace'
  | 'createProject'
  | 'renameProject'
  | 'getProjectDeletionImpact'
  | 'deleteProject'
  | 'createScenario'
  | 'renameScenario'
  | 'duplicateScenario'
  | 'getScenarioDeletionImpact'
  | 'deleteScenario'
  | 'addRoute'
  | 'duplicateRoute'
  | 'getRouteDeletionImpact'
  | 'deleteRoute'
  | 'updateServiceDay'
  | 'updateRoute'
  | 'previewNodeChanges'
  | 'commitNodeChanges'
  | 'previewPatternChange'
  | 'commitPatternChange'
  | 'createPatternDraft'
  | 'duplicatePatternDraft'
  | 'reversePatternDraft'
  | 'getNodeDeletionImpact'
  | 'getPatternDeletionImpact'
  | 'deletePattern'
  | 'validate'
  | 'getSegmentMiles'
  | 'exportProject'
  | 'importProject'
  | 'exportCsv'
  | 'exportAuthoritativeCsv'
  | 'listRuntimeProfiles'
  | 'listDirections'
  | 'listRuntimeAssignments'
  | 'createDefaultRuntimeProfile'
  | 'renameRuntimeProfile'
  | 'ensureDefaultRuntimeProfile'
  | 'saveRuntimeProfile'
  | 'assignRuntimeProfile'
  | 'copyRuntimeProfile'
  | 'reverseCopyRuntimeProfile'
  | 'deleteRuntimeProfile'
  | 'getRuntimeProfileDeletionImpact'
  | 'listRuntimeProfileServiceDays'
  | 'validateRuntimeProfile'
>;

export type { ScenarioRecords } from '../domain/project';
export type { RouteEditMode } from '../domain/safeRouteEditing';
