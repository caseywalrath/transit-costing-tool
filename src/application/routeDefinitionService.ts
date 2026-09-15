import { makePatternPoint } from '../domain/commands';
import { metadata, newId, withUpdatedAt } from '../domain/ids';
import { createProject, createScenarioRecords, duplicateScenario, type ScenarioRecords } from '../domain/project';
import { duplicatePattern, getSegmentMiles, normalizePattern, reversePattern, validatePattern } from '../domain/patterns';
import { createDirectionColumn, createManagedDirections, createRouteDirection, ensureManagedDirections, mapPatternPointsToDirection, normalizeDirections, oppositeDirectionGroup } from '../domain/directions';
import { classifyPatternEdit, describePatternPointChange, getPatternServiceImpact, rebalanceRuntimeProfile, rebalanceTripForPattern, reconcileRouteTimetables, resetPatternService, type DirectionOrderConflict, type PatternServiceImpact, type RouteEditClassification, type RouteEditMode } from '../domain/safeRouteEditing';
import { sortServiceDays } from '../domain/serviceDays';
import { copyRuntimeProfile, normalizeRuntimeProfile, resolveRuntimeForDeparture, reverseCopyRuntimeProfile, validateRuntimeAssignments, validateRuntimeProfile, withRuntimeCalculationRevision, RuntimeProfileDeletionError } from '../domain/runtime';
import type { DirectionTimepointColumn, Node, Project, Route, RouteDefinitionAggregate, RouteDirection, RoutePattern, RuntimeAssignment, RuntimeProfile, Scenario, ServiceDayDefinition, ValidationFinding } from '../domain/types';
import { validateNodeDeletion, validateRouteDefinition } from '../domain/validation';
import { adjustBlockReferences } from '../domain/trips';
import { authoritativeTripsCsv, blockActivitiesCsv, blocksCsv, directionColumnsCsv, directionsCsv, generationSetsCsv, nodesCsv, patternPointsCsv, patternsCsv, routeCsv, runtimeBandsCsv, scheduledPointsCsv, tripsCsv } from '../persistence/csv';
import type { BackupPort, RouteDefinitionRepository, SaveStatus } from './ports';

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
}

export interface DirectionDeletionImpact {
  directionId: string;
  patternIds: string[];
}

export interface RuntimeProfileDeletionImpact {
  profileId: string;
  assignmentCount: number;
  tripCount: number;
}

/** Records removed with one Route and the block activities that must be detached. */
export interface RouteDeletionImpact {
  routeId: string;
  nodeCount: number;
  directionCount: number;
  patternCount: number;
  runtimeProfileCount: number;
  runtimeAssignmentCount: number;
  generationSetCount: number;
  tripCount: number;
  affectedBlockCount: number;
  removedBlockActivityCount: number;
}

/** A Scenario owns all listed records; blocks themselves are deleted with it. */
export interface ScenarioDeletionImpact {
  scenarioId: string;
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

export class RouteDefinitionService {
  private saveStatus: SaveStatus = { state: 'idle' };
  private readonly listeners = new Set<(status: SaveStatus) => void>();
  private readonly routeEditPreviews = new Map<string, StoredRouteEditPreview>();

  constructor(
    private readonly repository: RouteDefinitionRepository,
    private readonly backup: BackupPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  getSaveStatus(): SaveStatus { return this.saveStatus; }
  subscribeToSaveStatus(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.saveStatus);
    return () => this.listeners.delete(listener);
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

  async createScenario(projectId: string, name: string): Promise<ScenarioRecords> {
    return this.saveScenarioRecords(createScenarioRecords(projectId, name, this.now()));
  }
  async renameScenario(records: ScenarioRecords, name: string): Promise<ScenarioRecords> {
    return this.saveScenarioRecords({ ...records, scenario: withUpdatedAt({ ...records.scenario, name: name.trim() }, this.now()) });
  }
  async duplicateScenario(records: ScenarioRecords, name: string): Promise<ScenarioRecords> {
    return this.saveScenarioRecords(duplicateScenario(records, name, this.now()));
  }
  async getScenarioDeletionImpact(scenarioId: string): Promise<ScenarioDeletionImpact> {
    const records = await this.repository.getScenarioRecords(scenarioId);
    if (!records) throw new Error('Scenario not found.');
    const scenarios = await this.repository.listScenarios(records.scenario.projectId);
    return {
      scenarioId,
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
  async deleteScenario(scenarioId: string): Promise<void> {
    const records = await this.repository.getScenarioRecords(scenarioId);
    if (!records) throw new Error('Scenario not found.');
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
      generationSets: snapshot.generationSets.filter((set) => set.scenarioId !== scenarioId),
      trips: snapshot.trips.filter((trip) => trip.scenarioId !== scenarioId),
      blocks: snapshot.blocks.filter((block) => block.scenarioId !== scenarioId),
    }));
  }
  async addRoute(records: ScenarioRecords): Promise<{ records: ScenarioRecords; route: Route }> {
    const route: Route = { id: newId(), scenarioId: records.scenario.id, name: '', ...metadata(this.now()) };
    const directions = createManagedDirections(records.scenario.id, route.id, this.now());
    return { records: await this.saveScenarioRecords({ ...records, routes: [...records.routes, route], directions: [...(records.directions ?? []), ...directions] }), route };
  }
  async getRouteDeletionImpact(routeId: string): Promise<RouteDeletionImpact> {
    const records = await this.recordsForRoute(routeId);
    const patternIds = new Set(records.patterns.filter((pattern) => pattern.routeId === routeId).map((pattern) => pattern.id));
    const profileIds = new Set(records.runtimeProfiles.filter((profile) => profile.routeId === routeId).map((profile) => profile.id));
    const tripIds = records.trips.filter((trip) => trip.routeId === routeId).map((trip) => trip.id);
    const blocks = adjustBlockReferences(records.blocks, tripIds);
    return {
      routeId,
      nodeCount: records.nodes.filter((node) => node.routeId === routeId).length,
      directionCount: (records.directions ?? []).filter((direction) => direction.routeId === routeId).length,
      patternCount: patternIds.size,
      runtimeProfileCount: profileIds.size,
      runtimeAssignmentCount: records.runtimeAssignments.filter((assignment) => patternIds.has(assignment.patternId) || profileIds.has(assignment.runtimeProfileId)).length,
      generationSetCount: records.generationSets.filter((set) => set.routeId === routeId).length,
      tripCount: tripIds.length,
      affectedBlockCount: blocks.adjustments.length,
      removedBlockActivityCount: blocks.adjustments.reduce((count, adjustment) => count + adjustment.removedTripIds.length, 0),
    };
  }
  async deleteRoute(routeId: string): Promise<ScenarioRecords> {
    const records = await this.recordsForRoute(routeId);
    const patternIds = new Set(records.patterns.filter((pattern) => pattern.routeId === routeId).map((pattern) => pattern.id));
    const profileIds = new Set(records.runtimeProfiles.filter((profile) => profile.routeId === routeId).map((profile) => profile.id));
    const removedTripIds = records.trips.filter((trip) => trip.routeId === routeId).map((trip) => trip.id);
    const adjustedBlocks = adjustBlockReferences(records.blocks, removedTripIds);
    return this.saveScenarioRecords({
      ...records,
      routes: records.routes.filter((route) => route.id !== routeId),
      nodes: records.nodes.filter((node) => node.routeId !== routeId),
      patterns: records.patterns.filter((pattern) => pattern.routeId !== routeId),
      directions: (records.directions ?? []).filter((direction) => direction.routeId !== routeId),
      runtimeProfiles: records.runtimeProfiles.filter((profile) => profile.routeId !== routeId),
      runtimeAssignments: records.runtimeAssignments.filter((assignment) => !patternIds.has(assignment.patternId) && !profileIds.has(assignment.runtimeProfileId)),
      generationSets: records.generationSets.filter((set) => set.routeId !== routeId),
      trips: records.trips.filter((trip) => trip.routeId !== routeId),
      blocks: adjustedBlocks.blocks,
    });
  }
  async updateServiceDay(records: ScenarioRecords, id: string, patch: Partial<ServiceDayDefinition>): Promise<ScenarioRecords> {
    return this.saveScenarioRecords({ ...records, serviceDays: records.serviceDays.map((day) => day.id === id ? withUpdatedAt({ ...day, ...patch }, this.now()) : day) });
  }

  async updateRoute(aggregate: RouteDefinitionAggregate, patch: Partial<Route>): Promise<RouteDefinitionAggregate> {
    return this.saveAggregate({ ...aggregate, route: withUpdatedAt({ ...aggregate.route, ...patch }, this.now()) });
  }

  async addDirection(aggregate: RouteDefinitionAggregate, name = `Direction ${(aggregate.directions?.length ?? 0) + 1}`): Promise<{ aggregate: RouteDefinitionAggregate; direction: RouteDirection }> {
    const directions = normalizeDirections(aggregate.directions ?? []);
    const direction = createRouteDirection(aggregate.route.scenarioId, aggregate.route.id, name, directions.length, this.now());
    const next = { ...aggregate, directions: [...directions, direction] };
    return { aggregate: await this.saveAggregate(next), direction };
  }
  async updateDirection(aggregate: RouteDefinitionAggregate, directionId: string, patch: Partial<Pick<RouteDirection, 'name' | 'sequence'>>): Promise<RouteDefinitionAggregate> {
    if (!(aggregate.directions ?? []).some((direction) => direction.id === directionId)) throw new Error('Direction not found.');
    const directions = normalizeDirections((aggregate.directions ?? []).map((direction) => direction.id === directionId ? withUpdatedAt({ ...direction, ...patch }, this.now()) : direction));
    return this.saveAggregate({ ...aggregate, directions });
  }
  async getDirectionDeletionImpact(aggregate: RouteDefinitionAggregate, directionId: string): Promise<DirectionDeletionImpact> {
    if (!(aggregate.directions ?? []).some((direction) => direction.id === directionId)) throw new Error('Direction not found.');
    const records = await this.repository.getScenarioRecords(aggregate.route.scenarioId);
    return { directionId, patternIds: (records?.patterns ?? aggregate.patterns).filter((pattern) => pattern.directionId === directionId).map((pattern) => pattern.id) };
  }
  async deleteDirection(aggregate: RouteDefinitionAggregate, directionId: string): Promise<RouteDefinitionAggregate> {
    const direction = (aggregate.directions ?? []).find((candidate) => candidate.id === directionId);
    if (direction?.group) throw new Error('Inbound and Outbound are managed automatically for every route.');
    const impact = await this.getDirectionDeletionImpact(aggregate, directionId);
    if (impact.patternIds.length) throw new DirectionDeletionError(impact);
    return this.saveAggregate({ ...aggregate, directions: normalizeDirections((aggregate.directions ?? []).filter((direction) => direction.id !== directionId)) });
  }
  async addDirectionColumn(aggregate: RouteDefinitionAggregate, directionId: string, nodeId: string, labelOverride?: string): Promise<RouteDefinitionAggregate> {
    const direction = (aggregate.directions ?? []).find((item) => item.id === directionId);
    if (!direction) throw new Error('Direction not found.');
    if (!aggregate.nodes.some((node) => node.id === nodeId)) throw new Error('Node not found.');
    const column = createDirectionColumn(nodeId, direction.columns.length, labelOverride);
    const directions = (aggregate.directions ?? []).map((item) => item.id === directionId ? withUpdatedAt({ ...item, columns: [...item.columns, column] }, this.now()) : item);
    return this.saveAggregate({ ...aggregate, directions: normalizeDirections(directions) });
  }
  async updateDirectionColumn(aggregate: RouteDefinitionAggregate, directionId: string, columnId: string, patch: Partial<Pick<DirectionTimepointColumn, 'nodeId' | 'sequence' | 'labelOverride'>>): Promise<RouteDefinitionAggregate> {
    const direction = (aggregate.directions ?? []).find((item) => item.id === directionId);
    if (!direction) throw new Error('Direction not found.');
    if (!direction.columns.some((column) => column.id === columnId)) throw new Error('Direction column not found.');
    if (patch.nodeId && !aggregate.nodes.some((node) => node.id === patch.nodeId)) throw new Error('Node not found.');
    const directions = (aggregate.directions ?? []).map((item) => item.id === directionId ? withUpdatedAt({ ...item, columns: item.columns.map((column) => column.id === columnId ? { ...column, ...patch } : column) }, this.now()) : item);
    return this.saveAggregate({ ...aggregate, directions: normalizeDirections(directions) });
  }
  async assignPatternDirection(aggregate: RouteDefinitionAggregate, patternId: string, directionId: string): Promise<RouteDefinitionAggregate> {
    const direction = (aggregate.directions ?? []).find((item) => item.id === directionId);
    const pattern = aggregate.patterns.find((item) => item.id === patternId);
    if (!direction) throw new Error('Direction not found.');
    if (!pattern) throw new Error('Pattern not found.');
    const nextSequence = aggregate.patterns.filter((item) => item.directionId === directionId && item.id !== patternId).length;
    const mapped = mapPatternPointsToDirection({ ...pattern, directionId, sequence: nextSequence }, direction, this.now());
    const patterns = aggregate.patterns.map((item) => item.id === patternId ? mapped.pattern : item);
    const directions = (aggregate.directions ?? []).map((item) => item.id === directionId ? mapped.direction : item);
    return this.saveAggregate({ ...aggregate, patterns, directions: normalizeDirections(directions) });
  }
  async addNode(aggregate: RouteDefinitionAggregate): Promise<RouteDefinitionAggregate> {
    const node: Node = { id: newId(), scenarioId: aggregate.route.scenarioId, routeId: aggregate.route.id, name: '', kind: 'timepoint', ...metadata(this.now()) };
    return this.saveAggregate({ ...aggregate, nodes: [...aggregate.nodes, node] });
  }
  async updateNode(aggregate: RouteDefinitionAggregate, id: string, patch: Partial<Node>): Promise<RouteDefinitionAggregate> {
    return this.saveAggregate({ ...aggregate, nodes: aggregate.nodes.map((node) => node.id === id ? withUpdatedAt({ ...node, ...patch }, this.now()) : node) });
  }
  getNodeDeletionFindings(aggregate: RouteDefinitionAggregate, nodeId: string): ValidationFinding[] {
    return validateNodeDeletion(nodeId, aggregate.patterns);
  }
  async deleteNode(aggregate: RouteDefinitionAggregate, nodeId: string): Promise<RouteDefinitionAggregate> {
    const nodes = aggregate.nodes.filter((node) => node.id !== nodeId);
    const directions = (aggregate.directions ?? []).map((direction) => withUpdatedAt({ ...direction, columns: direction.columns.filter((column) => column.nodeId !== nodeId).map((column, sequence) => ({ ...column, sequence })) }, this.now()));
    const patterns = aggregate.patterns.map((pattern) => {
      const filtered = normalizePattern({ ...pattern, points: pattern.points.filter((point) => point.nodeId !== nodeId) });
      const direction = directions.find((item) => item.id === filtered.directionId);
      return direction ? mapPatternPointsToDirection(filtered, direction, this.now()).pattern : filtered;
    });
    return this.saveAggregate({ ...aggregate, nodes, patterns, ...(aggregate.directions ? { directions: normalizeDirections(directions) } : {}) });
  }

  async addPattern(aggregate: RouteDefinitionAggregate): Promise<{ aggregate: RouteDefinitionAggregate; pattern: RoutePattern }> {
    const directions = ensureManagedDirections(aggregate.directions ?? [], aggregate.route.scenarioId, aggregate.route.id, this.now());
    const direction = directions[0];
    const pattern: RoutePattern = { id: newId(), routeId: aggregate.route.id, scenarioId: aggregate.route.scenarioId, name: 'New pattern', directionId: direction.id, sequence: aggregate.patterns.filter((item) => item.directionId === direction.id).length, points: [], ...metadata(this.now()) };
    return { aggregate: await this.saveAggregate({ ...aggregate, directions, patterns: [...aggregate.patterns, pattern] }), pattern };
  }
  async updatePattern(aggregate: RouteDefinitionAggregate, patternId: string, patch: Partial<RoutePattern>): Promise<RouteDefinitionAggregate> {
    const target = aggregate.patterns.find((pattern) => pattern.id === patternId);
    if (!target) throw new Error('Pattern not found.');
    const updated = withUpdatedAt(normalizePattern({ ...target, ...patch }), this.now());
    const directions = ensureManagedDirections(aggregate.directions ?? [], aggregate.route.scenarioId, aggregate.route.id, this.now());
    const direction = directions.find((item) => item.id === updated.directionId);
    if (direction && patch.directionId) {
      const mapped = mapPatternPointsToDirection(updated, direction, this.now());
      return this.saveAggregate({ ...aggregate, patterns: aggregate.patterns.map((pattern) => pattern.id === patternId ? mapped.pattern : pattern), directions: normalizeDirections(directions.map((item) => item.id === direction.id ? mapped.direction : item)) });
    }
    return this.saveAggregate({ ...aggregate, patterns: aggregate.patterns.map((pattern) => pattern.id === patternId ? updated : pattern) });
  }
  async addPatternPoint(aggregate: RouteDefinitionAggregate, patternId: string): Promise<RouteDefinitionAggregate> {
    const pattern = aggregate.patterns.find((item) => item.id === patternId);
    const firstNode = aggregate.nodes[0];
    if (!pattern) throw new Error('Pattern not found.');
    if (!firstNode) throw new Error('Add a node before adding a pattern point.');
    const point = makePatternPoint(firstNode.id, pattern.points.length, pattern.points.at(-1)?.cumulativeMiles ?? 0);
    const nextPattern = { ...pattern, points: [...pattern.points, point] };
    const direction = (aggregate.directions ?? []).find((item) => item.id === pattern.directionId);
    if (!direction) return this.updatePattern(aggregate, patternId, { points: nextPattern.points });
    const mapped = mapPatternPointsToDirection(nextPattern, direction, this.now());
    return this.saveAggregate({ ...aggregate, patterns: aggregate.patterns.map((item) => item.id === patternId ? mapped.pattern : item), directions: normalizeDirections((aggregate.directions ?? []).map((item) => item.id === direction.id ? mapped.direction : item)) });
  }
  async updatePatternPoint(aggregate: RouteDefinitionAggregate, patternId: string, index: number, patch: Partial<RoutePattern['points'][number]>): Promise<RouteDefinitionAggregate> {
    const pattern = aggregate.patterns.find((item) => item.id === patternId);
    if (!pattern) throw new Error('Pattern not found.');
    const nextPattern = { ...pattern, points: pattern.points.map((point, pointIndex) => pointIndex === index ? { ...point, ...patch } : point) };
    const direction = (aggregate.directions ?? []).find((item) => item.id === pattern.directionId);
    if (!direction || !patch.nodeId) return this.updatePattern(aggregate, patternId, { points: nextPattern.points });
    const mapped = mapPatternPointsToDirection(nextPattern, direction, this.now());
    return this.saveAggregate({ ...aggregate, patterns: aggregate.patterns.map((item) => item.id === patternId ? mapped.pattern : item), directions: normalizeDirections((aggregate.directions ?? []).map((item) => item.id === direction.id ? mapped.direction : item)) });
  }
  async movePatternPoint(aggregate: RouteDefinitionAggregate, patternId: string, index: number, direction: -1 | 1): Promise<RouteDefinitionAggregate> {
    const pattern = aggregate.patterns.find((item) => item.id === patternId);
    if (!pattern) throw new Error('Pattern not found.');
    const target = index + direction;
    if (target < 0 || target >= pattern.points.length) return aggregate;
    const points = [...pattern.points];
    [points[index], points[target]] = [points[target], points[index]];
    return this.updatePattern(aggregate, patternId, { points });
  }
  async removePatternPoint(aggregate: RouteDefinitionAggregate, patternId: string, index: number): Promise<RouteDefinitionAggregate> {
    const pattern = aggregate.patterns.find((item) => item.id === patternId);
    if (!pattern) throw new Error('Pattern not found.');
    return this.updatePattern(aggregate, patternId, { points: pattern.points.filter((_, pointIndex) => pointIndex !== index) });
  }
  async createReversePattern(aggregate: RouteDefinitionAggregate, patternId: string, name: string): Promise<{ aggregate: RouteDefinitionAggregate; pattern: RoutePattern }> {
    const source = aggregate.patterns.find((item) => item.id === patternId);
    if (!source) throw new Error('Pattern not found.');
    const directions = ensureManagedDirections(aggregate.directions ?? [], aggregate.route.scenarioId, aggregate.route.id, this.now());
    const sourceDirection = directions.find((direction) => direction.id === source.directionId) ?? directions[0];
    const targetGroup = oppositeDirectionGroup(sourceDirection.group ?? 'outbound');
    const targetDirection = directions.find((direction) => direction.group === targetGroup)!;
    const reversed = { ...reversePattern(source, this.now()), name: name.trim(), directionId: targetDirection.id, sequence: aggregate.patterns.filter((pattern) => pattern.directionId === targetDirection.id).length };
    const mapped = mapPatternPointsToDirection(reversed, targetDirection, this.now());
    return { aggregate: await this.saveAggregate({ ...aggregate, patterns: [...aggregate.patterns, mapped.pattern], directions: normalizeDirections(directions.map((direction) => direction.id === targetDirection.id ? mapped.direction : direction)) }), pattern: mapped.pattern };
  }
  async duplicatePattern(aggregate: RouteDefinitionAggregate, patternId: string, name: string): Promise<{ aggregate: RouteDefinitionAggregate; pattern: RoutePattern }> {
    const source = aggregate.patterns.find((item) => item.id === patternId);
    if (!source) throw new Error('Pattern not found.');
    const pattern = duplicatePattern(source, name, this.now());
    return { aggregate: await this.saveAggregate({ ...aggregate, patterns: [...aggregate.patterns, pattern] }), pattern };
  }

  async getPatternDeletionImpact(patternId: string): Promise<PatternDeletionImpact> {
    const pattern = await this.repository.getPattern(patternId);
    if (!pattern) throw new Error('Pattern not found.');
    const records = await this.repository.getScenarioRecords(pattern.scenarioId);
    if (!records) throw new Error('The selected scenario is no longer available.');
    const profiles = records.runtimeProfiles.filter((profile) => profile.patternId === patternId);
    const trips = records.trips.filter((trip) => trip.patternId === patternId);
    const tripIds = new Set(trips.map((trip) => trip.id));
    return {
      patternId,
      runtimeProfileCount: profiles.length,
      runtimeAssignmentCount: records.runtimeAssignments.filter((assignment) => assignment.patternId === patternId).length,
      tripCount: trips.length,
      affectedBlockCount: records.blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && tripIds.has(activity.tripId))).length,
    };
  }

  /** Confirmed pattern deletion removes only records that cannot remain valid without that pattern. */
  async deletePattern(patternId: string): Promise<{ aggregate: RouteDefinitionAggregate; impact: PatternDeletionImpact }> {
    const pattern = await this.repository.getPattern(patternId);
    if (!pattern) throw new Error('Pattern not found.');
    const records = await this.repository.getScenarioRecords(pattern.scenarioId);
    if (!records) throw new Error('The selected scenario is no longer available.');
    const impact = await this.getPatternDeletionImpact(patternId);
    const removedTripIds = records.trips.filter((trip) => trip.patternId === patternId).map((trip) => trip.id);
    const adjustedBlocks = adjustBlockReferences(records.blocks, removedTripIds).blocks;
    const next: ScenarioRecords = {
      ...records,
      patterns: records.patterns.filter((candidate) => candidate.id !== patternId),
      runtimeProfiles: records.runtimeProfiles.filter((profile) => profile.patternId !== patternId),
      runtimeAssignments: records.runtimeAssignments.filter((assignment) => assignment.patternId !== patternId),
      generationSets: records.generationSets.filter((set) => set.patternId !== patternId),
      trips: records.trips.filter((trip) => trip.patternId !== patternId),
      blocks: adjustedBlocks,
    };
    await this.saveScenarioRecords(next);
    const aggregate = await this.repository.getRouteDefinition(pattern.routeId);
    if (!aggregate) throw new Error('Route not found after deleting pattern.');
    return { aggregate, impact };
  }

  validate(aggregate: RouteDefinitionAggregate): ValidationFinding[] { return validateRouteDefinition(aggregate); }
  getSegmentMiles(pattern: RoutePattern, pointIndex: number): number { return getSegmentMiles(pattern, pointIndex); }
  exportProject(projectId: string): Promise<string> { return this.backup.exportProject(projectId); }
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

  /** Provision an initial Default profile only when no profile exists for the pattern. */
  async ensureDefaultRuntimeProfile(pattern: RoutePattern): Promise<{ profile: RuntimeProfile; assignments: RuntimeAssignment[] }> {
    const records = await this.repository.getScenarioRecords(pattern.scenarioId);
    if (!records) throw new Error('The selected scenario is no longer available.');
    const profiles = await this.repository.listRuntimeProfiles(pattern.routeId, pattern.id);
    let profile = profiles.find((candidate) => candidate.name.trim().toLowerCase() === 'default') ?? profiles[0];
    if (!profile) {
      profile = await this.createDefaultRuntimeProfile(pattern, 'Default');
    } else if (profile.bands.some((band) => band.segmentRuntimeSeconds.length !== Math.max(0, pattern.points.length - 1))) {
      const expected = Math.max(0, pattern.points.length - 1);
      profile = await this.saveRuntimeProfile({ ...profile, bands: profile.bands.map((band) => ({ ...band, segmentRuntimeSeconds: [...band.segmentRuntimeSeconds.slice(0, expected), ...Array(Math.max(0, expected - band.segmentRuntimeSeconds.length)).fill(0)] })) });
    }
    const assignments: RuntimeAssignment[] = [];
    const standardDays = sortServiceDays(records.serviceDays).filter((day) => day.kind === 'weekday' || day.kind === 'saturday' || day.kind === 'sunday' || day.kind === 'holiday');
    for (const day of standardDays) {
      const existing = (await this.repository.listRuntimeAssignments(pattern.scenarioId, day.id, pattern.id))[0];
      assignments.push(existing ?? await this.assignRuntimeProfile(pattern.scenarioId, pattern.id, day.id, profile.id));
    }
    return { profile, assignments };
  }
  async ensureDefaultProfile(pattern: RoutePattern): Promise<{ profile: RuntimeProfile; assignments: RuntimeAssignment[] }> {
    return this.ensureDefaultRuntimeProfile(pattern);
  }

  async deleteRuntimeProfile(profileId: string, replacementProfileId?: string): Promise<void> {
    const profile = await this.repository.getRuntimeProfile(profileId);
    if (!profile) throw new Error('The selected runtime profile is no longer available.');
    const assignments = await this.repository.listRuntimeAssignments(profile.scenarioId, undefined, profile.patternId);
    const assigned = assignments.filter((assignment) => assignment.runtimeProfileId === profileId);
    const records = await this.repository.getScenarioRecords(profile.scenarioId);
    const referencingTrips = (records?.trips ?? []).filter((trip) => trip.provenance.runtimeProfileId === profileId || trip.provenance.calculationSource?.runtimeProfileId === profileId);
    if (referencingTrips.length) throw new RuntimeProfileTripReferenceError(profileId, referencingTrips.map((trip) => trip.id));
    if (assigned.length && !replacementProfileId) throw new RuntimeProfileDeletionError(profileId, assigned.map((assignment) => assignment.id), assigned.map((assignment) => assignment.serviceDayId));
    if (replacementProfileId) {
      if (replacementProfileId === profileId) throw new Error('Choose a different replacement runtime profile.');
      const replacement = await this.repository.getRuntimeProfile(replacementProfileId);
      if (!replacement || replacement.scenarioId !== profile.scenarioId || replacement.routeId !== profile.routeId || replacement.patternId !== profile.patternId) throw new Error('Replacement runtime profile must belong to the same pattern.');
    }
    await this.save(() => this.repository.deleteRuntimeProfile(profileId, replacementProfileId));
  }
  async getRuntimeProfileDeletionImpact(profileId: string): Promise<RuntimeProfileDeletionImpact> {
    const profile = await this.repository.getRuntimeProfile(profileId);
    if (!profile) throw new Error('The selected runtime profile is no longer available.');
    const [assignments, records] = await Promise.all([
      this.repository.listRuntimeAssignments(profile.scenarioId, undefined, profile.patternId),
      this.repository.getScenarioRecords(profile.scenarioId),
    ]);
    return {
      profileId,
      assignmentCount: assignments.filter((assignment) => assignment.runtimeProfileId === profileId).length,
      tripCount: (records?.trips ?? []).filter((trip) => trip.provenance.runtimeProfileId === profileId || trip.provenance.calculationSource?.runtimeProfileId === profileId).length,
    };
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
  async validateRuntimeAssignments(scenarioId: string): Promise<ValidationFinding[]> {
    return validateRuntimeAssignments(await this.repository.listRuntimeAssignments(scenarioId));
  }
  async resolveRuntimeBand(profileId: string, pattern: RoutePattern, departure: number) {
    const profile = await this.repository.getRuntimeProfile(profileId);
    if (!profile) throw new Error('The selected runtime profile is no longer available.');
    return resolveRuntimeForDeparture(profile, pattern, departure);
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
    return JSON.stringify({
      aggregate,
      profiles: records.runtimeProfiles.filter((profile) => profileIds.has(profile.id)),
      assignments: records.runtimeAssignments.filter((assignment) => profileIds.has(assignment.runtimeProfileId) || aggregate.patterns.some((pattern) => pattern.id === assignment.patternId)),
      trips: records.trips.filter((trip) => tripIds.has(trip.id)),
      blocks: records.blocks.filter((block) => block.activities.some((activity) => activity.type === 'revenueTrip' && tripIds.has(activity.tripId))),
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
    return {
      kind: 'nodes',
      classification: findings.some((finding) => finding.severity === 'error') || reconciled.conflict ? 'invalid' : deletedNodeIds.length ? 'deterministic' : 'metadata',
      addedNodeIds,
      deletedNodeIds,
      affectedPatternIds: affected.map((pattern) => pattern.id),
      patternsBelowMinimum,
      impact: this.mergeImpacts(impacts),
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
    return {
      ...records,
      nodes: [...records.nodes.filter((node) => node.routeId !== routeId), ...nodes],
      patterns: nextPatterns,
      directions: [...(records.directions ?? []).filter((direction) => direction.routeId !== routeId), ...reconciled.directions],
      ...rebalanced,
    };
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
    this.publish({ state: 'saving' });
    try {
      const result = await operation();
      this.publish({ state: 'saved', updatedAt: this.now() });
      return result;
    } catch (error) {
      this.publish({ state: 'error', errorMessage: error instanceof Error ? error.message : 'Unable to save locally.' });
      throw error;
    }
  }
  private publish(status: SaveStatus) {
    this.saveStatus = status;
    for (const listener of this.listeners) listener(status);
  }
}

export type RouteDefinitionApplication = Pick<RouteDefinitionService,
  | 'getSaveStatus'
  | 'subscribeToSaveStatus'
  | 'loadWorkspace'
  | 'createProject'
  | 'createScenario'
  | 'renameScenario'
  | 'duplicateScenario'
  | 'getScenarioDeletionImpact'
  | 'deleteScenario'
  | 'addRoute'
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
  | 'addNode'
  | 'updateNode'
  | 'getNodeDeletionFindings'
  | 'deleteNode'
  | 'addPattern'
  | 'updatePattern'
  | 'addPatternPoint'
  | 'updatePatternPoint'
  | 'movePatternPoint'
  | 'removePatternPoint'
  | 'createReversePattern'
  | 'duplicatePattern'
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
  | 'ensureDefaultProfile'
  | 'saveRuntimeProfile'
  | 'assignRuntimeProfile'
  | 'copyRuntimeProfile'
  | 'reverseCopyRuntimeProfile'
  | 'deleteRuntimeProfile'
  | 'getRuntimeProfileDeletionImpact'
  | 'validateRuntimeProfile'
  | 'validateRuntimeAssignments'
  | 'resolveRuntimeBand'
>;

export type { ScenarioRecords } from '../domain/project';
export type { RouteEditMode } from '../domain/safeRouteEditing';
