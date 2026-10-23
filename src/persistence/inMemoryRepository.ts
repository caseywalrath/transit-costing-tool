import type { Block, BlockingScenario, CostingAssumptions, Node, Project, ProjectSnapshot, Route, RouteDefinitionAggregate, RouteDirection, RoutePattern, RuntimeAssignment, RuntimeProfile, Scenario, ServiceDayDefinition, Trip, TripGenerationSet, TripProfile, TripRegenerationUndo } from '../domain/types';
import type { ScenarioRecords } from '../domain/project';
import type { CostingAssumptionsRepository, RouteDefinitionRepository } from '../application/ports';
import type { RuntimeCopyPreview, TripCopyPreview } from '../domain/serviceDayCopy';
import { assertRuntimeGraph } from './runtimePersistence';
import { assertTripProfileReferences } from '../domain/trips';
import { sortServiceDays } from '../domain/serviceDays';
import { orderDirections } from '../domain/directions';
import { assertCostingAssumptions, assertCostingAssumptionsCollection } from './costingPersistence';

/**
 * IndexedDB returns rows in primary-key order, compared as UTF-16 code units, and every Dexie read here is a whole-table read or an
 * equality query on one index, so it returns that order. The in-memory repository returns the same order, so code that depends on
 * "the first profile" or "the first Trip" behaves the same in a unit test as in the browser (review finding 3-013).
 */
function inKeyOrder<T extends { id: string }>(values: Iterable<T>): T[] {
  return [...values].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

export class InMemoryRouteDefinitionRepository implements RouteDefinitionRepository, CostingAssumptionsRepository {
  projects = new Map<string, Project>();
  scenarios = new Map<string, Scenario>();
  serviceDays = new Map<string, ServiceDayDefinition>();
  routes = new Map<string, Route>();
  nodes = new Map<string, Node>();
  patterns = new Map<string, RoutePattern>();
  directions = new Map<string, RouteDirection>();
  runtimeProfiles = new Map<string, RuntimeProfile>();
  runtimeAssignments = new Map<string, RuntimeAssignment>();
  tripProfiles = new Map<string, TripProfile>();
  blockingScenarios = new Map<string, BlockingScenario>();
  generationSets = new Map<string, TripGenerationSet>();
  trips = new Map<string, Trip>();
  tripRegenerationUndo?: TripRegenerationUndo;
  blocks = new Map<string, Block>();
  costingAssumptions = new Map<string, CostingAssumptions>();

  async listProjects(): Promise<Project[]> { return inKeyOrder(this.projects.values()); }
  async getProject(id: string): Promise<Project | undefined> { return this.projects.get(id); }
  async saveProject(value: Project): Promise<void> { this.projects.set(value.id, value); }
  async deleteProject(projectId: string): Promise<void> {
    if (!this.projects.has(projectId)) throw new Error('Project not found.');
    const scenarioIds = new Set(inKeyOrder(this.scenarios.values()).filter((scenario) => scenario.projectId === projectId).map((scenario) => scenario.id));
    if (this.tripRegenerationUndo && scenarioIds.has(this.tripRegenerationUndo.scenarioId)) this.tripRegenerationUndo = undefined;
    const removeScenarioOwned = <T extends { scenarioId: string }>(collection: Map<string, T>) => { for (const [id, value] of collection) if (scenarioIds.has(value.scenarioId)) collection.delete(id); };
    removeScenarioOwned(this.serviceDays); removeScenarioOwned(this.routes); removeScenarioOwned(this.nodes); removeScenarioOwned(this.patterns); removeScenarioOwned(this.directions); removeScenarioOwned(this.runtimeProfiles); removeScenarioOwned(this.runtimeAssignments); removeScenarioOwned(this.tripProfiles); removeScenarioOwned(this.blockingScenarios); removeScenarioOwned(this.generationSets); removeScenarioOwned(this.trips); removeScenarioOwned(this.blocks); removeScenarioOwned(this.costingAssumptions);
    for (const [id, scenario] of this.scenarios) if (scenarioIds.has(scenario.id)) this.scenarios.delete(id);
    this.projects.delete(projectId);
  }
  async listScenarios(projectId: string): Promise<Scenario[]> { return inKeyOrder(this.scenarios.values()).filter((value) => value.projectId === projectId); }
  async saveScenario(value: Scenario): Promise<void> { this.scenarios.set(value.id, value); }

  async getCostingAssumptions(scenarioId: string): Promise<CostingAssumptions | undefined> {
    const records = inKeyOrder(this.costingAssumptions.values()).filter((value) => value.scenarioId === scenarioId);
    if (records.length > 1) throw new Error(`Scenario ${scenarioId} has more than one costing assumptions record.`);
    return records[0];
  }

  async saveCostingAssumptions(value: CostingAssumptions): Promise<void> {
    assertCostingAssumptions(value, value.scenarioId);
    if (!this.scenarios.has(value.scenarioId)) throw new Error('Costing assumptions reference a missing Scenario.');
    const existing = inKeyOrder(this.costingAssumptions.values()).find((candidate) => candidate.scenarioId === value.scenarioId);
    if (existing && existing.id !== value.id) throw new Error('Scenario already has a different costing assumptions record.');
    const sameId = this.costingAssumptions.get(value.id);
    if (sameId && sameId.scenarioId !== value.scenarioId) throw new Error('Costing assumption ownership cannot be moved to another Scenario.');
    this.costingAssumptions.set(value.id, value);
  }

  async getScenarioRecords(scenarioId: string): Promise<ScenarioRecords | undefined> { return this.readScenarioRecords(scenarioId); }

  private readScenarioRecords(scenarioId: string): ScenarioRecords | undefined {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) return undefined;
    const routes = inKeyOrder(this.routes.values()).filter((route) => route.scenarioId === scenarioId);
    const routeIds = new Set(routes.map((route) => route.id));
    const directions = orderDirections(inKeyOrder(this.directions.values()).filter((direction) => routeIds.has(direction.routeId)));
    return {
      scenario,
      serviceDays: sortServiceDays(inKeyOrder(this.serviceDays.values()).filter((day) => day.scenarioId === scenarioId)),
      routes,
      nodes: inKeyOrder(this.nodes.values()).filter((node) => routeIds.has(node.routeId)),
      patterns: inKeyOrder(this.patterns.values()).filter((pattern) => routeIds.has(pattern.routeId)),
      ...(directions.length ? { directions } : {}),
      runtimeProfiles: inKeyOrder(this.runtimeProfiles.values()).filter((profile) => routeIds.has(profile.routeId)),
      runtimeAssignments: inKeyOrder(this.runtimeAssignments.values()).filter((assignment) => assignment.scenarioId === scenarioId),
      ...((() => { const profiles = inKeyOrder(this.tripProfiles.values()).filter((profile) => profile.scenarioId === scenarioId); return profiles.length ? { tripProfiles: profiles } : {}; })()),
      ...((() => { const scenarios = inKeyOrder(this.blockingScenarios.values()).filter((blockingScenario) => blockingScenario.scenarioId === scenarioId); return scenarios.length ? { blockingScenarios: scenarios } : {}; })()),
      ...((() => { const assumptions = inKeyOrder(this.costingAssumptions.values()).filter((value) => value.scenarioId === scenarioId); if (assumptions.length > 1) throw new Error(`Scenario ${scenarioId} has more than one costing assumptions record.`); return assumptions.length ? { costingAssumptions: assumptions[0] } : {}; })()),
      generationSets: inKeyOrder(this.generationSets.values()).filter((set) => set.scenarioId === scenarioId),
      trips: inKeyOrder(this.trips.values()).filter((trip) => trip.scenarioId === scenarioId),
      blocks: inKeyOrder(this.blocks.values()).filter((block) => block.scenarioId === scenarioId),
    };
  }

  async saveScenarioRecords(records: ScenarioRecords): Promise<void> { this.writeScenarioRecords(records); }

  private writeScenarioRecords(records: ScenarioRecords): void {
    const oldRoutes = inKeyOrder(this.routes.values()).filter((route) => route.scenarioId === records.scenario.id);
    const oldRouteIds = new Set(oldRoutes.map((route) => route.id));
    const routeIds = new Set(records.routes.map((route) => route.id));
    const nodeIds = new Set(records.nodes.map((node) => node.id));
    const patternIds = new Set(records.patterns.map((pattern) => pattern.id));
    const directionIds = new Set((records.directions ?? []).map((direction) => direction.id));
    const serviceDayIds = new Set(records.serviceDays.map((day) => day.id));
    assertRuntimeGraph(records.runtimeProfiles, records.runtimeAssignments, records.patterns, records.serviceDays, records.scenario.id);
    assertTripProfileReferences(records.trips, records.blocks);
    if (records.costingAssumptions) assertCostingAssumptions(records.costingAssumptions, records.scenario.id);
    const previousCostingAssumptions = inKeyOrder(this.costingAssumptions.values()).find((candidate) => candidate.scenarioId === records.scenario.id);
    if (records.costingAssumptions && previousCostingAssumptions && previousCostingAssumptions.id !== records.costingAssumptions.id) {
      throw new Error('Scenario already has a different costing assumptions record.');
    }
    if (records.costingAssumptions) {
      const sameId = this.costingAssumptions.get(records.costingAssumptions.id);
      if (sameId && sameId.scenarioId !== records.scenario.id) throw new Error('Costing assumption ownership cannot be moved to another Scenario.');
    }
    // Only after every check that can reject the write: a rejected write must not discard the undo.
    this.invalidateUndoWhenScenarioTripsChange(records.scenario.id, records.trips);
    for (const [id, node] of this.nodes) if (oldRouteIds.has(node.routeId) && !nodeIds.has(id)) this.nodes.delete(id);
    for (const [id, pattern] of this.patterns) if (oldRouteIds.has(pattern.routeId) && !patternIds.has(id)) this.patterns.delete(id);
    for (const [id, direction] of this.directions) if (oldRouteIds.has(direction.routeId) && !directionIds.has(id)) this.directions.delete(id);
    for (const route of oldRoutes) if (!routeIds.has(route.id)) this.routes.delete(route.id);
    for (const [id, day] of this.serviceDays) if (day.scenarioId === records.scenario.id && !serviceDayIds.has(id)) this.serviceDays.delete(id);
    for (const [id, profile] of this.runtimeProfiles) if (profile.scenarioId === records.scenario.id && !records.runtimeProfiles.some((candidate) => candidate.id === id)) this.runtimeProfiles.delete(id);
    for (const [id, assignment] of this.runtimeAssignments) if (assignment.scenarioId === records.scenario.id && !records.runtimeAssignments.some((candidate) => candidate.id === id)) this.runtimeAssignments.delete(id);
    for (const [id, profile] of this.tripProfiles) if (profile.scenarioId === records.scenario.id && !(records.tripProfiles ?? []).some((candidate) => candidate.id === id)) this.tripProfiles.delete(id);
    for (const [id, blockingScenario] of this.blockingScenarios) if (blockingScenario.scenarioId === records.scenario.id && !(records.blockingScenarios ?? []).some((candidate) => candidate.id === id)) this.blockingScenarios.delete(id);
    for (const [id, set] of this.generationSets) if (set.scenarioId === records.scenario.id && !records.generationSets.some((candidate) => candidate.id === id)) this.generationSets.delete(id);
    for (const [id, trip] of this.trips) if (trip.scenarioId === records.scenario.id && !records.trips.some((candidate) => candidate.id === id)) this.trips.delete(id);
    for (const [id, block] of this.blocks) if (block.scenarioId === records.scenario.id && !records.blocks.some((candidate) => candidate.id === id)) this.blocks.delete(id);
    this.scenarios.set(records.scenario.id, records.scenario);
    for (const day of records.serviceDays) this.serviceDays.set(day.id, day);
    for (const route of records.routes) this.routes.set(route.id, route);
    for (const node of records.nodes) this.nodes.set(node.id, node);
    for (const pattern of records.patterns) this.patterns.set(pattern.id, pattern);
    for (const direction of records.directions ?? []) this.directions.set(direction.id, direction);
    for (const profile of records.runtimeProfiles) this.runtimeProfiles.set(profile.id, profile);
    for (const assignment of records.runtimeAssignments) this.runtimeAssignments.set(assignment.id, assignment);
    for (const profile of records.tripProfiles ?? []) this.tripProfiles.set(profile.id, profile);
    for (const blockingScenario of records.blockingScenarios ?? []) this.blockingScenarios.set(blockingScenario.id, blockingScenario);
    if (records.costingAssumptions) this.costingAssumptions.set(records.costingAssumptions.id, records.costingAssumptions);
    for (const set of records.generationSets) this.generationSets.set(set.id, set);
    for (const trip of records.trips) this.trips.set(trip.id, trip);
    for (const block of records.blocks) this.blocks.set(block.id, block);
  }

  async updateScenarioRecords(scenarioId: string, change: (current: ScenarioRecords) => ScenarioRecords): Promise<ScenarioRecords> {
    // Read, change, and write without yielding, so overlapping calls run one after the other as Dexie's transaction makes them.
    const current = this.readScenarioRecords(scenarioId);
    if (!current) throw new Error('Scenario not found.');
    const next = change(current);
    if (next !== current) this.writeScenarioRecords(next);
    return next;
  }

  async commitRouteEdit(records: ScenarioRecords): Promise<void> {
    await this.saveScenarioRecords(records);
  }

  async getRouteDefinition(id: string): Promise<RouteDefinitionAggregate | undefined> {
    const route = this.routes.get(id);
    if (!route) return undefined;
    const directions = orderDirections(inKeyOrder(this.directions.values()).filter((direction) => direction.routeId === id));
    return {
      route,
      nodes: inKeyOrder(this.nodes.values()).filter((node) => node.routeId === id),
      patterns: inKeyOrder(this.patterns.values()).filter((pattern) => pattern.routeId === id),
      ...(directions.length ? { directions } : {}),
    };
  }
  async listDirections(routeId: string): Promise<RouteDirection[]> { return orderDirections(inKeyOrder(this.directions.values()).filter((direction) => direction.routeId === routeId)); }

  async saveRouteDefinition(value: RouteDefinitionAggregate): Promise<void> {
    for (const node of inKeyOrder(this.nodes.values())) if (node.routeId === value.route.id && !value.nodes.some((candidate) => candidate.id === node.id)) this.nodes.delete(node.id);
    for (const pattern of inKeyOrder(this.patterns.values())) if (pattern.routeId === value.route.id && !value.patterns.some((candidate) => candidate.id === pattern.id)) this.patterns.delete(pattern.id);
    for (const direction of inKeyOrder(this.directions.values())) if (direction.routeId === value.route.id && !(value.directions ?? []).some((candidate) => candidate.id === direction.id)) this.directions.delete(direction.id);
    this.routes.set(value.route.id, value.route);
    for (const node of value.nodes) this.nodes.set(node.id, node);
    for (const pattern of value.patterns) this.patterns.set(pattern.id, pattern);
    for (const direction of value.directions ?? []) this.directions.set(direction.id, direction);
  }

  async getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | undefined> {
    const project = this.projects.get(projectId);
    if (!project) return undefined;
    const scenarios = inKeyOrder(this.scenarios.values()).filter((scenario) => scenario.projectId === projectId);
    const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
    const routes = inKeyOrder(this.routes.values()).filter((route) => scenarioIds.has(route.scenarioId));
    const routeIds = new Set(routes.map((route) => route.id));
    const directions = orderDirections(inKeyOrder(this.directions.values()).filter((direction) => routeIds.has(direction.routeId)));
    return {
      project,
      scenarios,
      serviceDays: sortServiceDays(inKeyOrder(this.serviceDays.values()).filter((day) => scenarioIds.has(day.scenarioId))),
      routes,
      nodes: inKeyOrder(this.nodes.values()).filter((node) => routeIds.has(node.routeId)),
      patterns: inKeyOrder(this.patterns.values()).filter((pattern) => routeIds.has(pattern.routeId)),
      ...(directions.length ? { directions } : {}),
      runtimeProfiles: inKeyOrder(this.runtimeProfiles.values()).filter((profile) => routeIds.has(profile.routeId)),
      runtimeAssignments: inKeyOrder(this.runtimeAssignments.values()).filter((assignment) => scenarioIds.has(assignment.scenarioId)),
      ...((() => { const profiles = inKeyOrder(this.tripProfiles.values()).filter((profile) => scenarioIds.has(profile.scenarioId)); return profiles.length ? { tripProfiles: profiles } : {}; })()),
      ...((() => { const blockingScenarios = inKeyOrder(this.blockingScenarios.values()).filter((blockingScenario) => scenarioIds.has(blockingScenario.scenarioId)); return blockingScenarios.length ? { blockingScenarios } : {}; })()),
      ...((() => { const costingAssumptions = inKeyOrder(this.costingAssumptions.values()).filter((assumptions) => scenarioIds.has(assumptions.scenarioId)); return costingAssumptions.length ? { costingAssumptions } : {}; })()),
      generationSets: inKeyOrder(this.generationSets.values()).filter((set) => scenarioIds.has(set.scenarioId)),
      trips: inKeyOrder(this.trips.values()).filter((trip) => scenarioIds.has(trip.scenarioId)),
      blocks: inKeyOrder(this.blocks.values()).filter((block) => scenarioIds.has(block.scenarioId)),
    };
  }

  async saveProjectSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    const ownedScenarioIds = new Set(inKeyOrder(this.scenarios.values()).filter((scenario) => scenario.projectId === snapshot.project.id).map((scenario) => scenario.id));
    const ownedRouteIds = new Set(inKeyOrder(this.routes.values()).filter((route) => ownedScenarioIds.has(route.scenarioId)).map((route) => route.id));
    assertRuntimeGraph(snapshot.runtimeProfiles, snapshot.runtimeAssignments, snapshot.patterns, snapshot.serviceDays);
    assertTripProfileReferences(snapshot.trips, snapshot.blocks);
    assertCostingAssumptionsCollection(snapshot.costingAssumptions ?? [], new Set(snapshot.scenarios.map((scenario) => scenario.id)));
    for (const assumptions of snapshot.costingAssumptions ?? []) {
      const sameId = this.costingAssumptions.get(assumptions.id);
      if (sameId && sameId.scenarioId !== assumptions.scenarioId) throw new Error('Costing assumption ownership cannot be moved to another Scenario.');
    }
    if (this.tripRegenerationUndo && (ownedScenarioIds.has(this.tripRegenerationUndo.scenarioId) || snapshot.scenarios.some((scenario) => scenario.id === this.tripRegenerationUndo!.scenarioId))) {
      if (!snapshot.scenarios.some((scenario) => scenario.id === this.tripRegenerationUndo!.scenarioId)) this.tripRegenerationUndo = undefined;
      else this.invalidateUndoWhenScenarioTripsChange(this.tripRegenerationUndo.scenarioId, snapshot.trips);
    }
    for (const [id, scenario] of this.scenarios) if (scenario.projectId === snapshot.project.id && !snapshot.scenarios.some((candidate) => candidate.id === id)) this.scenarios.delete(id);
    // Service days and routes of a Scenario the snapshot no longer contains go too, as they do on Dexie.
    for (const [id, day] of this.serviceDays) if (ownedScenarioIds.has(day.scenarioId) && !snapshot.serviceDays.some((candidate) => candidate.id === id)) this.serviceDays.delete(id);
    for (const [id, route] of this.routes) if (ownedScenarioIds.has(route.scenarioId) && !snapshot.routes.some((candidate) => candidate.id === id)) this.routes.delete(id);
    const routeIds = new Set([...ownedRouteIds, ...snapshot.routes.map((route) => route.id)]);
    for (const [id, node] of this.nodes) if (routeIds.has(node.routeId) && !snapshot.nodes.some((candidate) => candidate.id === id)) this.nodes.delete(id);
    for (const [id, pattern] of this.patterns) if (routeIds.has(pattern.routeId) && !snapshot.patterns.some((candidate) => candidate.id === id)) this.patterns.delete(id);
    for (const [id, direction] of this.directions) if (routeIds.has(direction.routeId) && !(snapshot.directions ?? []).some((candidate) => candidate.id === id)) this.directions.delete(id);
    for (const [id, profile] of this.runtimeProfiles) if (ownedScenarioIds.has(profile.scenarioId) && !snapshot.runtimeProfiles.some((candidate) => candidate.id === id)) this.runtimeProfiles.delete(id);
    for (const [id, assignment] of this.runtimeAssignments) if (ownedScenarioIds.has(assignment.scenarioId) && !snapshot.runtimeAssignments.some((candidate) => candidate.id === id)) this.runtimeAssignments.delete(id);
    for (const [id, profile] of this.tripProfiles) if (ownedScenarioIds.has(profile.scenarioId) && !(snapshot.tripProfiles ?? []).some((candidate) => candidate.id === id)) this.tripProfiles.delete(id);
    for (const [id, blockingScenario] of this.blockingScenarios) if (ownedScenarioIds.has(blockingScenario.scenarioId) && !(snapshot.blockingScenarios ?? []).some((candidate) => candidate.id === id)) this.blockingScenarios.delete(id);
    for (const [id, assumptions] of this.costingAssumptions) if (ownedScenarioIds.has(assumptions.scenarioId) && !(snapshot.costingAssumptions ?? []).some((candidate) => candidate.id === id)) this.costingAssumptions.delete(id);
    for (const [id, set] of this.generationSets) if (ownedScenarioIds.has(set.scenarioId) && !snapshot.generationSets.some((candidate) => candidate.id === id)) this.generationSets.delete(id);
    for (const [id, trip] of this.trips) if (ownedScenarioIds.has(trip.scenarioId) && !snapshot.trips.some((candidate) => candidate.id === id)) this.trips.delete(id);
    for (const [id, block] of this.blocks) if (ownedScenarioIds.has(block.scenarioId) && !snapshot.blocks.some((candidate) => candidate.id === id)) this.blocks.delete(id);
    this.projects.set(snapshot.project.id, snapshot.project);
    for (const scenario of snapshot.scenarios) this.scenarios.set(scenario.id, scenario);
    for (const day of snapshot.serviceDays) this.serviceDays.set(day.id, day);
    for (const route of snapshot.routes) this.routes.set(route.id, route);
    for (const node of snapshot.nodes) this.nodes.set(node.id, node);
    for (const pattern of snapshot.patterns) this.patterns.set(pattern.id, pattern);
    for (const direction of snapshot.directions ?? []) this.directions.set(direction.id, direction);
    for (const profile of snapshot.runtimeProfiles) this.runtimeProfiles.set(profile.id, profile);
    for (const assignment of snapshot.runtimeAssignments) this.runtimeAssignments.set(assignment.id, assignment);
    for (const profile of snapshot.tripProfiles ?? []) this.tripProfiles.set(profile.id, profile);
    for (const blockingScenario of snapshot.blockingScenarios ?? []) this.blockingScenarios.set(blockingScenario.id, blockingScenario);
    for (const assumptions of snapshot.costingAssumptions ?? []) this.costingAssumptions.set(assumptions.id, assumptions);
    for (const set of snapshot.generationSets) this.generationSets.set(set.id, set);
    for (const trip of snapshot.trips) this.trips.set(trip.id, trip);
    for (const block of snapshot.blocks) this.blocks.set(block.id, block);
  }

  async getRuntimeProfile(id: string): Promise<RuntimeProfile | undefined> { return this.runtimeProfiles.get(id); }
  async listRuntimeProfiles(routeId: string, patternId?: string): Promise<RuntimeProfile[]> { return inKeyOrder(this.runtimeProfiles.values()).filter((profile) => profile.routeId === routeId && (!patternId || profile.patternId === patternId)); }
  async saveRuntimeProfile(profile: RuntimeProfile): Promise<void> {
    const pattern = this.patterns.get(profile.patternId);
    const serviceDays = inKeyOrder(this.serviceDays.values()).filter((day) => day.scenarioId === profile.scenarioId);
    assertRuntimeGraph([profile], inKeyOrder(this.runtimeAssignments.values()).filter((assignment) => assignment.runtimeProfileId === profile.id), pattern ? [pattern] : [], serviceDays, profile.scenarioId);
    this.runtimeProfiles.set(profile.id, profile);
  }
  async deleteRuntimeProfile(profileId: string, replacementProfileId?: string): Promise<void> {
    const assignments = inKeyOrder(this.runtimeAssignments.values()).filter((assignment) => assignment.runtimeProfileId === profileId);
    if (assignments.length && !replacementProfileId) throw new Error('Runtime profile is still assigned.');
    if (replacementProfileId) for (const assignment of assignments) this.runtimeAssignments.set(assignment.id, { ...assignment, runtimeProfileId: replacementProfileId });
    this.runtimeProfiles.delete(profileId);
  }
  async listTripProfiles(scenarioId: string): Promise<TripProfile[]> { return inKeyOrder(this.tripProfiles.values()).filter((profile) => profile.scenarioId === scenarioId); }
  async getTripProfile(id: string): Promise<TripProfile | undefined> { return this.tripProfiles.get(id); }
  async saveTripProfile(profile: TripProfile): Promise<void> {
    if (!profile.name.trim()) throw new Error('Enter a trip profile name.');
    const duplicate = inKeyOrder(this.tripProfiles.values()).find((candidate) => candidate.id !== profile.id && candidate.scenarioId === profile.scenarioId && candidate.name.trim().toLowerCase() === profile.name.trim().toLowerCase());
    if (duplicate) throw new Error('A Trip profile with this name already exists.');
    this.tripProfiles.set(profile.id, profile);
  }
  async copyTripProfileAtomically(profile: TripProfile, trips: Trip[]): Promise<void> {
    const previousProfiles = new Map(this.tripProfiles); const previousTrips = new Map(this.trips);
    try {
      if (!profile.name.trim()) throw new Error('Enter a trip profile name.');
      if (inKeyOrder(this.tripProfiles.values()).some((candidate) => candidate.scenarioId === profile.scenarioId && candidate.name.trim().toLowerCase() === profile.name.trim().toLowerCase())) throw new Error('A Trip profile with this name already exists.');
      this.tripProfiles.set(profile.id, profile);
      for (const trip of trips) { if (this.trips.has(trip.id)) throw new Error(`Trip ${trip.id} already exists`); this.trips.set(trip.id, trip); }
    }
    catch (error) { this.tripProfiles = previousProfiles; this.trips = previousTrips; throw error; }
  }
  async deleteTripProfile(profileId: string): Promise<void> {
    const previousProfiles = new Map(this.tripProfiles); const previousBlockingScenarios = new Map(this.blockingScenarios); const previousTrips = new Map(this.trips); const previousBlocks = new Map(this.blocks); const previousUndo = this.tripRegenerationUndo;
    try {
      this.tripProfiles.delete(profileId);
      const deletedTripIds = inKeyOrder(this.trips.values()).filter((trip) => trip.tripProfileId === profileId).map((trip) => trip.id);
      this.invalidateRegenerationUndo(deletedTripIds);
      for (const id of deletedTripIds) this.trips.delete(id);
      const ownedBlockingScenarioIds = new Set(inKeyOrder(this.blockingScenarios.values()).filter((scenario) => scenario.tripProfileId === profileId).map((scenario) => scenario.id));
      for (const id of ownedBlockingScenarioIds) this.blockingScenarios.delete(id);
      for (const [id, block] of this.blocks) if (block.tripProfileId === profileId || (block.blockingScenarioId && ownedBlockingScenarioIds.has(block.blockingScenarioId))) this.blocks.delete(id);
    }
    catch (error) { this.tripProfiles = previousProfiles; this.blockingScenarios = previousBlockingScenarios; this.trips = previousTrips; this.blocks = previousBlocks; this.tripRegenerationUndo = previousUndo; throw error; }
  }
  async listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string): Promise<RuntimeAssignment[]> { return inKeyOrder(this.runtimeAssignments.values()).filter((assignment) => assignment.scenarioId === scenarioId && (!serviceDayId || assignment.serviceDayId === serviceDayId) && (!patternId || assignment.patternId === patternId)); }
  async saveRuntimeAssignment(assignment: RuntimeAssignment): Promise<void> {
    const pattern = this.patterns.get(assignment.patternId);
    const profile = this.runtimeProfiles.get(assignment.runtimeProfileId);
    const serviceDay = this.serviceDays.get(assignment.serviceDayId);
    const existing = inKeyOrder(this.runtimeAssignments.values()).find((candidate) => candidate.id !== assignment.id && candidate.patternId === assignment.patternId && candidate.serviceDayId === assignment.serviceDayId);
    if (existing) throw new Error(`Duplicate runtime assignment for ${assignment.patternId}:${assignment.serviceDayId}`);
    assertRuntimeGraph(profile ? [profile] : [], [assignment], pattern ? [pattern] : [], serviceDay ? [serviceDay] : [], assignment.scenarioId);
    this.runtimeAssignments.set(assignment.id, assignment);
  }

  async commitRuntimeCopyAtomically(preview: RuntimeCopyPreview): Promise<void> {
    const previousProfiles = new Map(this.runtimeProfiles);
    const previousAssignments = new Map(this.runtimeAssignments);
    try {
      const profileIds = new Set(preview.profiles.map((profile) => profile.id));
      const assignmentIds = new Set(preview.assignments.map((assignment) => assignment.id));
      if ([...profileIds].some((id) => this.runtimeProfiles.has(id))) throw new Error('Runtime copy generated a duplicate profile identifier.');
      if ([...assignmentIds].some((id) => this.runtimeAssignments.has(id))) throw new Error('Runtime copy generated a duplicate assignment identifier.');
      const nextProfiles = [...this.runtimeProfiles.values(), ...preview.profiles];
      const nextAssignments = inKeyOrder(this.runtimeAssignments.values()).filter((assignment) => !preview.replaceAssignmentIds.includes(assignment.id)).concat(preview.assignments);
      assertRuntimeGraph(nextProfiles.filter((profile) => profile.scenarioId === preview.request.scenarioId), nextAssignments.filter((assignment) => assignment.scenarioId === preview.request.scenarioId), inKeyOrder(this.patterns.values()).filter((pattern) => pattern.scenarioId === preview.request.scenarioId), inKeyOrder(this.serviceDays.values()).filter((day) => day.scenarioId === preview.request.scenarioId), preview.request.scenarioId);
      for (const id of preview.replaceAssignmentIds) this.runtimeAssignments.delete(id);
      for (const profile of preview.profiles) this.runtimeProfiles.set(profile.id, profile);
      for (const assignment of preview.assignments) this.runtimeAssignments.set(assignment.id, assignment);
    } catch (error) {
      this.runtimeProfiles = previousProfiles;
      this.runtimeAssignments = previousAssignments;
      throw error;
    }
  }

  async getGenerationSet(id: string): Promise<TripGenerationSet | undefined> { return this.generationSets.get(id); }
  async listGenerationSets(serviceDayId: string, routeId?: string, patternId?: string): Promise<TripGenerationSet[]> {
    return inKeyOrder(this.generationSets.values()).filter((set) => set.serviceDayId === serviceDayId && (!routeId || set.routeId === routeId) && (!patternId || set.patternId === patternId));
  }
  async saveGenerationSet(set: TripGenerationSet): Promise<void> { this.generationSets.set(set.id, set); }
  async listTrips(serviceDayId: string, generationSetIdOrProfileId?: string): Promise<Trip[]> { return inKeyOrder(this.trips.values()).filter((trip) => trip.serviceDayId === serviceDayId && (!generationSetIdOrProfileId || trip.provenance.generationSetId === generationSetIdOrProfileId || trip.tripProfileId === generationSetIdOrProfileId)); }
  async getTrip(id: string): Promise<Trip | undefined> { return this.trips.get(id); }
  private invalidateRegenerationUndo(tripIds: string[]) { if (this.tripRegenerationUndo && tripIds.some((id) => this.tripRegenerationUndo!.afterTrips.some((trip) => trip.id === id))) this.tripRegenerationUndo = undefined; }
  private invalidateUndoWhenScenarioTripsChange(scenarioId: string, nextTrips: Trip[]) {
    const snapshot = this.tripRegenerationUndo;
    if (!snapshot || snapshot.scenarioId !== scenarioId) return;
    const nextById = new Map(nextTrips.map((trip) => [trip.id, trip]));
    if (snapshot.afterTrips.some((trip) => JSON.stringify(nextById.get(trip.id)) !== JSON.stringify(trip))) this.tripRegenerationUndo = undefined;
  }
  async saveTrips(trips: Trip[]): Promise<void> { for (const trip of trips) this.trips.set(trip.id, trip); this.invalidateRegenerationUndo(trips.map((trip) => trip.id)); }
  /** Atomically append authoritative trips. Existing trips are never replaced. */
  async insertTripsAtomically(trips: Trip[]): Promise<void> {
    const previous = new Map(this.trips);
    try {
      for (const trip of trips) {
        if (trip.tripProfileId !== undefined && this.tripProfiles.get(trip.tripProfileId)?.scenarioId !== trip.scenarioId) throw new Error('The selected Trip profile is no longer available.');
      }
      for (const trip of trips) {
        if (this.trips.has(trip.id)) throw new Error(`Trip ${trip.id} already exists`);
        this.trips.set(trip.id, trip);
      }
    } catch (error) { this.trips = previous; throw error; }
  }
  /** Atomically update trips and any affected block records. */
  async saveTripChangesAtomically(trips: Trip[], blocks: Block[] = []): Promise<void> {
    assertTripProfileReferences([...this.trips.values(), ...trips], blocks);
    const previousTrips = new Map(this.trips); const previousBlocks = new Map(this.blocks);
    try { for (const trip of trips) this.trips.set(trip.id, trip); for (const block of blocks) this.blocks.set(block.id, block); this.invalidateRegenerationUndo(trips.map((trip) => trip.id)); }
    catch (error) { this.trips = previousTrips; this.blocks = previousBlocks; throw error; }
  }
  /** Atomically delete trips and persist only blocks whose activities changed. */
  async deleteTripsAtomically(tripIds: string[], blocks: Block[] = []): Promise<void> {
    const previousTrips = new Map(this.trips); const previousBlocks = new Map(this.blocks);
    try { for (const tripId of tripIds) this.trips.delete(tripId); for (const block of blocks) this.blocks.set(block.id, block); this.invalidateRegenerationUndo(tripIds); }
    catch (error) { this.trips = previousTrips; this.blocks = previousBlocks; throw error; }
  }
  async saveRegeneratedTripsWithUndo(beforeTrips: Trip[], afterTrips: Trip[], snapshot: TripRegenerationUndo): Promise<void> {
    if (beforeTrips.some((trip) => JSON.stringify(this.trips.get(trip.id)) !== JSON.stringify(trip))) throw new Error('A selected Trip changed. Review regeneration again.');
    for (const trip of afterTrips) this.trips.set(trip.id, trip);
    this.tripRegenerationUndo = snapshot;
  }
  async getLastTripRegenerationUndo(): Promise<TripRegenerationUndo | undefined> { return this.tripRegenerationUndo; }
  async restoreLastTripRegenerationUndo(): Promise<Trip[]> {
    const snapshot = this.tripRegenerationUndo;
    if (!snapshot) throw new Error('There is no regeneration to undo.');
    if (snapshot.afterTrips.some((trip) => JSON.stringify(this.trips.get(trip.id)) !== JSON.stringify(trip))) { this.tripRegenerationUndo = undefined; throw new Error('The regenerated Trips changed. The undo is no longer available.'); }
    for (const trip of snapshot.beforeTrips) this.trips.set(trip.id, trip);
    this.tripRegenerationUndo = undefined;
    return snapshot.beforeTrips;
  }
  async listBlocks(serviceDayId: string, tripProfileId?: string): Promise<Block[]> { return inKeyOrder(this.blocks.values()).filter((block) => block.serviceDayId === serviceDayId && (!tripProfileId || block.tripProfileId === tripProfileId)); }
  async listTripsForProfile(tripProfileId: string): Promise<Trip[]> { return inKeyOrder(this.trips.values()).filter((trip) => trip.tripProfileId === tripProfileId); }
  async listBlocksForProfile(tripProfileId: string): Promise<Block[]> {
    const scenarioIds = new Set(inKeyOrder(this.blockingScenarios.values()).filter((scenario) => scenario.tripProfileId === tripProfileId).map((scenario) => scenario.id));
    return inKeyOrder(this.blocks.values()).filter((block) => block.tripProfileId === tripProfileId || (block.blockingScenarioId !== undefined && scenarioIds.has(block.blockingScenarioId)));
  }
  async saveBlocks(blocks: Block[]): Promise<void> { assertTripProfileReferences(inKeyOrder(this.trips.values()), blocks); for (const block of blocks) this.blocks.set(block.id, block); }
  async replaceTripsForDayAtomically(preview: TripCopyPreview): Promise<void> {
    const previousTrips = new Map(this.trips);
    const previousBlocks = new Map(this.blocks);
    try {
      const copiedIds = new Set(preview.copiedTrips.map((trip) => trip.id));
      if ([...copiedIds].some((id) => this.trips.has(id))) throw new Error('Trip copy generated a duplicate Trip identifier.');
      const nextTrips = inKeyOrder(this.trips.values()).filter((trip) => !preview.removedTripIds.includes(trip.id)).concat(preview.copiedTrips);
      const nextBlocks = inKeyOrder(this.blocks.values()).map((block) => preview.adjustedBlocks.find((candidate) => candidate.id === block.id) ?? block);
      assertTripProfileReferences(nextTrips, nextBlocks);
      this.invalidateRegenerationUndo(preview.removedTripIds);
      for (const id of preview.removedTripIds) this.trips.delete(id);
      for (const trip of preview.copiedTrips) this.trips.set(trip.id, trip);
      for (const block of preview.adjustedBlocks) this.blocks.set(block.id, block);
    } catch (error) {
      this.trips = previousTrips;
      this.blocks = previousBlocks;
      throw error;
    }
  }
  async getPattern(id: string): Promise<RoutePattern | undefined> { return this.patterns.get(id); }
  async replaceGenerationSet(set: TripGenerationSet, trips: Trip[], blocks: Block[]): Promise<void> {
    assertTripProfileReferences([...this.trips.values(), ...trips], blocks);
    const previousSets = new Map(this.generationSets); const previousTrips = new Map(this.trips); const previousBlocks = new Map(this.blocks);
    try {
      const removedTripIds = inKeyOrder(this.trips.values()).filter((trip) => trip.provenance.generationSetId === set.id && !trips.some((candidate) => candidate.id === trip.id)).map((trip) => trip.id);
      this.invalidateRegenerationUndo([...removedTripIds, ...trips.map((trip) => trip.id)]);
      for (const id of removedTripIds) this.trips.delete(id);
      this.generationSets.set(set.id, set); for (const trip of trips) this.trips.set(trip.id, trip); for (const block of blocks) this.blocks.set(block.id, block);
    } catch (error) { this.generationSets = previousSets; this.trips = previousTrips; this.blocks = previousBlocks; throw error; }
  }
}
