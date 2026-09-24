import type { Block, BlockingScenario, CostingAssumptions, Project, ProjectSnapshot, RouteDefinitionAggregate, RouteDirection, RuntimeAssignment, RuntimeProfile, Scenario, Trip, TripGenerationSet, TripProfile } from '../domain/types';
import type { ScenarioRecords } from '../domain/project';
import type { CostingAssumptionsRepository, RouteDefinitionRepository } from '../application/ports';
import type { RuntimeCopyPreview, TripCopyPreview } from '../domain/serviceDayCopy';
import { TransitDatabase } from './database';
import { assertRuntimeGraph } from './runtimePersistence';
import { assertTripProfileReferences } from '../domain/trips';
import { sortServiceDays } from '../domain/serviceDays';
import { orderDirections } from '../domain/directions';
import { assertCostingAssumptions, assertCostingAssumptionsCollection } from './costingPersistence';

export class DexieRouteDefinitionRepository implements RouteDefinitionRepository, CostingAssumptionsRepository {
  constructor(readonly db = new TransitDatabase()) {}

  async listProjects(): Promise<Project[]> { return this.db.projects.toArray(); }
  async getProject(id: string): Promise<Project | undefined> { return this.db.projects.get(id); }
  async saveProject(project: Project): Promise<void> { await this.db.projects.put(project); }
  async listScenarios(projectId: string): Promise<Scenario[]> { return this.db.scenarios.where('projectId').equals(projectId).toArray(); }
  async saveScenario(scenario: Scenario): Promise<void> { await this.db.scenarios.put(scenario); }

  async getCostingAssumptions(scenarioId: string): Promise<CostingAssumptions | undefined> {
    const records = await this.db.costingAssumptions.where('scenarioId').equals(scenarioId).toArray();
    if (records.length > 1) throw new Error(`Scenario ${scenarioId} has more than one costing assumptions record.`);
    return records[0];
  }

  async saveCostingAssumptions(assumptions: CostingAssumptions): Promise<void> {
    assertCostingAssumptions(assumptions, assumptions.scenarioId);
    await this.db.transaction('rw', [this.db.scenarios, this.db.costingAssumptions], async () => {
      if (!await this.db.scenarios.get(assumptions.scenarioId)) throw new Error('Costing assumptions reference a missing Scenario.');
      const existing = await this.db.costingAssumptions.where('scenarioId').equals(assumptions.scenarioId).toArray();
      if (existing.some((candidate) => candidate.id !== assumptions.id)) throw new Error('Scenario already has a different costing assumptions record.');
      const sameId = await this.db.costingAssumptions.get(assumptions.id);
      if (sameId && sameId.scenarioId !== assumptions.scenarioId) throw new Error('Costing assumption ownership cannot be moved to another Scenario.');
      await this.db.costingAssumptions.put(assumptions);
    });
  }

  async getScenarioRecords(scenarioId: string): Promise<ScenarioRecords | undefined> {
    const scenario = await this.db.scenarios.get(scenarioId);
    if (!scenario) return undefined;
    const [serviceDays, routes] = await Promise.all([
      this.db.serviceDays.where('scenarioId').equals(scenarioId).toArray(),
      this.db.routes.where('scenarioId').equals(scenarioId).toArray(),
    ]);
    const routeIds = new Set(routes.map((route) => route.id));
    const [nodes, patterns, directions] = await Promise.all([
      this.db.nodes.toArray().then((values) => values.filter((node) => routeIds.has(node.routeId))),
      this.db.patterns.toArray().then((values) => values.filter((pattern) => routeIds.has(pattern.routeId))),
      this.db.directions.toArray().then((values) => orderDirections(values.filter((direction) => routeIds.has(direction.routeId)))),
    ]);
    const [runtimeProfiles, runtimeAssignments, tripProfiles, blockingScenarios, costingAssumptions, generationSets, trips, blocks] = await Promise.all([
      this.db.runtimeProfiles.toArray().then((values) => values.filter((profile) => routeIds.has(profile.routeId))),
      this.db.runtimeAssignments.where('scenarioId').equals(scenarioId).toArray(),
      this.db.tripProfiles.where('scenarioId').equals(scenarioId).toArray(),
      this.db.blockingScenarios.where('scenarioId').equals(scenarioId).toArray(),
      this.db.costingAssumptions.where('scenarioId').equals(scenarioId).toArray(),
      this.db.generationSets.where('scenarioId').equals(scenarioId).toArray(),
      this.db.trips.where('scenarioId').equals(scenarioId).toArray(),
      this.db.blocks.where('scenarioId').equals(scenarioId).toArray(),
    ]);
    if (costingAssumptions.length > 1) throw new Error(`Scenario ${scenarioId} has more than one costing assumptions record.`);
    return { scenario, serviceDays: sortServiceDays(serviceDays), routes, nodes, patterns, ...(directions.length ? { directions } : {}), runtimeProfiles, runtimeAssignments, ...(tripProfiles.length ? { tripProfiles } : {}), ...(blockingScenarios.length ? { blockingScenarios } : {}), ...(costingAssumptions[0] ? { costingAssumptions: costingAssumptions[0] } : {}), generationSets, trips, blocks };
  }

  async saveScenarioRecords(records: ScenarioRecords): Promise<void> {
    assertRuntimeGraph(records.runtimeProfiles, records.runtimeAssignments, records.patterns, records.serviceDays, records.scenario.id);
    assertTripProfileReferences(records.trips, records.blocks);
    if (records.costingAssumptions) assertCostingAssumptions(records.costingAssumptions, records.scenario.id);
    await this.db.transaction('rw', [this.db.scenarios, this.db.serviceDays, this.db.routes, this.db.nodes, this.db.patterns, this.db.directions, this.db.runtimeProfiles, this.db.runtimeAssignments, this.db.tripProfiles, this.db.blockingScenarios, this.db.costingAssumptions, this.db.generationSets, this.db.trips, this.db.blocks], async () => {
      const oldRoutes = await this.db.routes.where('scenarioId').equals(records.scenario.id).toArray();
      const oldRouteIds = new Set(oldRoutes.map((route) => route.id));
      const [oldNodes, oldPatterns] = await Promise.all([
        this.db.nodes.toArray().then((values) => values.filter((node) => oldRouteIds.has(node.routeId))),
        this.db.patterns.toArray().then((values) => values.filter((pattern) => oldRouteIds.has(pattern.routeId))),
      ]);
      const oldDirections = oldRouteIds.size ? await this.db.directions.where('routeId').anyOf([...oldRouteIds]).toArray() : [];
      const routeIds = new Set(records.routes.map((route) => route.id));
      const nodeIds = new Set(records.nodes.map((node) => node.id));
      const patternIds = new Set(records.patterns.map((pattern) => pattern.id));
      const directionIds = new Set((records.directions ?? []).map((direction) => direction.id));
      const serviceDayIds = new Set(records.serviceDays.map((day) => day.id));
      const oldServiceDays = await this.db.serviceDays.where('scenarioId').equals(records.scenario.id).toArray();
      const oldProfiles = await this.db.runtimeProfiles.where('scenarioId').equals(records.scenario.id).toArray();
      const oldAssignments = await this.db.runtimeAssignments.where('scenarioId').equals(records.scenario.id).toArray();
      const oldTripProfiles = await this.db.tripProfiles.where('scenarioId').equals(records.scenario.id).toArray();
      const oldBlockingScenarios = await this.db.blockingScenarios.where('scenarioId').equals(records.scenario.id).toArray();
      const oldCostingAssumptions = await this.db.costingAssumptions.where('scenarioId').equals(records.scenario.id).toArray();
      if (records.costingAssumptions && oldCostingAssumptions.some((candidate) => candidate.id !== records.costingAssumptions!.id)) {
        throw new Error('Scenario already has a different costing assumptions record.');
      }
      if (records.costingAssumptions) {
        const sameId = await this.db.costingAssumptions.get(records.costingAssumptions.id);
        if (sameId && sameId.scenarioId !== records.scenario.id) throw new Error('Costing assumption ownership cannot be moved to another Scenario.');
      }
      const oldGenerationSets = await this.db.generationSets.where('scenarioId').equals(records.scenario.id).toArray();
      const oldTrips = await this.db.trips.where('scenarioId').equals(records.scenario.id).toArray();
      const oldBlocks = await this.db.blocks.where('scenarioId').equals(records.scenario.id).toArray();
      await this.db.patterns.bulkDelete(oldPatterns.filter((pattern) => !patternIds.has(pattern.id)).map((pattern) => pattern.id));
      await this.db.directions.bulkDelete(oldDirections.filter((direction) => !directionIds.has(direction.id)).map((direction) => direction.id));
      await this.db.nodes.bulkDelete(oldNodes.filter((node) => !nodeIds.has(node.id)).map((node) => node.id));
      await this.db.routes.bulkDelete(oldRoutes.filter((route) => !routeIds.has(route.id)).map((route) => route.id));
      await this.db.serviceDays.bulkDelete(oldServiceDays.filter((day) => !serviceDayIds.has(day.id)).map((day) => day.id));
      const profileIds = new Set(records.runtimeProfiles.map((profile) => profile.id));
      const assignmentIds = new Set(records.runtimeAssignments.map((assignment) => assignment.id));
      await this.db.runtimeAssignments.bulkDelete(oldAssignments.filter((assignment) => !assignmentIds.has(assignment.id)).map((assignment) => assignment.id));
      await this.db.runtimeProfiles.bulkDelete(oldProfiles.filter((profile) => !profileIds.has(profile.id)).map((profile) => profile.id));
      const tripProfileIds = new Set((records.tripProfiles ?? []).map((profile) => profile.id));
      await this.db.tripProfiles.bulkDelete(oldTripProfiles.filter((profile) => !tripProfileIds.has(profile.id)).map((profile) => profile.id));
      const blockingScenarioIds = new Set((records.blockingScenarios ?? []).map((blockingScenario) => blockingScenario.id));
      await this.db.blockingScenarios.bulkDelete(oldBlockingScenarios.filter((blockingScenario) => !blockingScenarioIds.has(blockingScenario.id)).map((blockingScenario) => blockingScenario.id));
      const generationSetIds = new Set(records.generationSets.map((set) => set.id));
      const tripIds = new Set(records.trips.map((trip) => trip.id));
      const blockIds = new Set(records.blocks.map((block) => block.id));
      await this.db.generationSets.bulkDelete(oldGenerationSets.filter((set) => !generationSetIds.has(set.id)).map((set) => set.id));
      await this.db.trips.bulkDelete(oldTrips.filter((trip) => !tripIds.has(trip.id)).map((trip) => trip.id));
      await this.db.blocks.bulkDelete(oldBlocks.filter((block) => !blockIds.has(block.id)).map((block) => block.id));
      await this.db.scenarios.put(records.scenario);
      await this.db.serviceDays.bulkPut(records.serviceDays);
      await this.db.routes.bulkPut(records.routes);
      await this.db.nodes.bulkPut(records.nodes);
      await this.db.patterns.bulkPut(records.patterns);
      await this.db.directions.bulkPut(records.directions ?? []);
      await this.db.runtimeProfiles.bulkPut(records.runtimeProfiles);
      await this.db.runtimeAssignments.bulkPut(records.runtimeAssignments);
      await this.db.tripProfiles.bulkPut(records.tripProfiles ?? []);
      await this.db.blockingScenarios.bulkPut(records.blockingScenarios ?? []);
      if (records.costingAssumptions) await this.db.costingAssumptions.put(records.costingAssumptions);
      await this.db.generationSets.bulkPut(records.generationSets);
      await this.db.trips.bulkPut(records.trips);
      await this.db.blocks.bulkPut(records.blocks);
    });
  }

  /** Safe route edits use the existing scenario-wide transaction boundary. */
  async commitRouteEdit(records: ScenarioRecords): Promise<void> {
    await this.saveScenarioRecords(records);
  }

  async getRouteDefinition(routeId: string): Promise<RouteDefinitionAggregate | undefined> {
    const route = await this.db.routes.get(routeId);
    if (!route) return undefined;
    const [nodes, patterns, directions] = await Promise.all([
      this.db.nodes.where('routeId').equals(routeId).toArray(),
      this.db.patterns.where('routeId').equals(routeId).toArray(),
      this.db.directions.where('routeId').equals(routeId).toArray().then(orderDirections),
    ]);
    return { route, nodes, patterns, ...(directions.length ? { directions } : {}) };
  }
  async listDirections(routeId: string): Promise<RouteDirection[]> { return orderDirections(await this.db.directions.where('routeId').equals(routeId).toArray()); }

  async saveRouteDefinition(aggregate: RouteDefinitionAggregate): Promise<void> {
    await this.db.transaction('rw', [this.db.routes, this.db.nodes, this.db.patterns, this.db.directions], async () => {
      const [oldNodes, oldPatterns] = await Promise.all([
        this.db.nodes.where('routeId').equals(aggregate.route.id).toArray(),
        this.db.patterns.where('routeId').equals(aggregate.route.id).toArray(),
      ]);
      const oldDirections = await this.db.directions.where('routeId').equals(aggregate.route.id).toArray();
      const nodeIds = new Set(aggregate.nodes.map((node) => node.id));
      const patternIds = new Set(aggregate.patterns.map((pattern) => pattern.id));
      const directionIds = new Set((aggregate.directions ?? []).map((direction) => direction.id));
      await this.db.nodes.bulkDelete(oldNodes.filter((node) => !nodeIds.has(node.id)).map((node) => node.id));
      await this.db.patterns.bulkDelete(oldPatterns.filter((pattern) => !patternIds.has(pattern.id)).map((pattern) => pattern.id));
      await this.db.directions.bulkDelete(oldDirections.filter((direction) => !directionIds.has(direction.id)).map((direction) => direction.id));
      await this.db.routes.put(aggregate.route);
      await this.db.nodes.bulkPut(aggregate.nodes);
      await this.db.patterns.bulkPut(aggregate.patterns);
      await this.db.directions.bulkPut(aggregate.directions ?? []);
    });
  }

  async getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | undefined> {
    const project = await this.db.projects.get(projectId);
    if (!project) return undefined;
    const scenarios = await this.db.scenarios.where('projectId').equals(projectId).toArray();
    const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
    const [serviceDays, routes, nodes, patterns, directions, runtimeProfiles, runtimeAssignments, tripProfiles, blockingScenarios, costingAssumptions, generationSets, trips, blocks] = await Promise.all([
      this.db.serviceDays.toArray().then((values) => values.filter((day) => scenarioIds.has(day.scenarioId))),
      this.db.routes.toArray().then((values) => values.filter((route) => scenarioIds.has(route.scenarioId))),
      this.db.nodes.toArray().then((values) => values.filter((node) => scenarioIds.has(node.scenarioId))),
      this.db.patterns.toArray().then((values) => values.filter((pattern) => scenarioIds.has(pattern.scenarioId))),
      this.db.directions.toArray().then((values) => orderDirections(values.filter((direction) => scenarioIds.has(direction.scenarioId)))),
      this.db.runtimeProfiles.toArray().then((values) => values.filter((profile) => scenarioIds.has(profile.scenarioId))),
      this.db.runtimeAssignments.toArray().then((values) => values.filter((assignment) => scenarioIds.has(assignment.scenarioId))),
      this.db.tripProfiles.toArray().then((values) => values.filter((profile) => scenarioIds.has(profile.scenarioId))),
      this.db.blockingScenarios.toArray().then((values) => values.filter((blockingScenario) => scenarioIds.has(blockingScenario.scenarioId))),
      this.db.costingAssumptions.toArray().then((values) => values.filter((assumptions) => scenarioIds.has(assumptions.scenarioId))),
      this.db.generationSets.toArray().then((values) => values.filter((set) => scenarioIds.has(set.scenarioId))),
      this.db.trips.toArray().then((values) => values.filter((trip) => scenarioIds.has(trip.scenarioId))),
      this.db.blocks.toArray().then((values) => values.filter((block) => scenarioIds.has(block.scenarioId))),
    ]);
    return { project, scenarios, serviceDays: sortServiceDays(serviceDays), routes, nodes, patterns, ...(directions.length ? { directions } : {}), runtimeProfiles, runtimeAssignments, ...(tripProfiles.length ? { tripProfiles } : {}), ...(blockingScenarios.length ? { blockingScenarios } : {}), ...(costingAssumptions.length ? { costingAssumptions } : {}), generationSets, trips, blocks };
  }

  async saveProjectSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    assertRuntimeGraph(snapshot.runtimeProfiles, snapshot.runtimeAssignments, snapshot.patterns, snapshot.serviceDays);
    assertTripProfileReferences(snapshot.trips, snapshot.blocks);
    assertCostingAssumptionsCollection(snapshot.costingAssumptions ?? [], new Set(snapshot.scenarios.map((scenario) => scenario.id)));
    await this.db.transaction('rw', [this.db.projects, this.db.scenarios, this.db.serviceDays, this.db.routes, this.db.nodes, this.db.patterns, this.db.directions, this.db.runtimeProfiles, this.db.runtimeAssignments, this.db.tripProfiles, this.db.blockingScenarios, this.db.costingAssumptions, this.db.generationSets, this.db.trips, this.db.blocks], async () => {
      const currentScenarios = await this.db.scenarios.where('projectId').equals(snapshot.project.id).toArray();
      const currentScenarioIds = new Set(currentScenarios.map((scenario) => scenario.id));
      const currentRoutes = (await this.db.routes.toArray()).filter((route) => currentScenarioIds.has(route.scenarioId));
      const currentRouteIds = new Set(currentRoutes.map((route) => route.id));
      const [currentServiceDays, currentNodes, currentPatterns, currentDirections, currentProfiles, currentAssignments, currentTripProfiles, currentBlockingScenarios, storedCostingAssumptions, currentGenerationSets, currentTrips, currentBlocks] = await Promise.all([
        this.db.serviceDays.toArray().then((values) => values.filter((day) => currentScenarioIds.has(day.scenarioId))),
        this.db.nodes.toArray().then((values) => values.filter((node) => currentRouteIds.has(node.routeId))),
        this.db.patterns.toArray().then((values) => values.filter((pattern) => currentRouteIds.has(pattern.routeId))),
        this.db.directions.toArray().then((values) => values.filter((direction) => currentRouteIds.has(direction.routeId))),
        this.db.runtimeProfiles.toArray().then((values) => values.filter((profile) => currentScenarioIds.has(profile.scenarioId))),
        this.db.runtimeAssignments.toArray().then((values) => values.filter((assignment) => currentScenarioIds.has(assignment.scenarioId))),
        this.db.tripProfiles.toArray().then((values) => values.filter((profile) => currentScenarioIds.has(profile.scenarioId))),
        this.db.blockingScenarios.toArray().then((values) => values.filter((blockingScenario) => currentScenarioIds.has(blockingScenario.scenarioId))),
        this.db.costingAssumptions.toArray(),
        this.db.generationSets.toArray().then((values) => values.filter((set) => currentScenarioIds.has(set.scenarioId))),
        this.db.trips.toArray().then((values) => values.filter((trip) => currentScenarioIds.has(trip.scenarioId))),
        this.db.blocks.toArray().then((values) => values.filter((block) => currentScenarioIds.has(block.scenarioId))),
      ]);
      const currentCostingAssumptions = storedCostingAssumptions.filter((assumptions) => currentScenarioIds.has(assumptions.scenarioId));
      for (const assumptions of snapshot.costingAssumptions ?? []) {
        const sameId = storedCostingAssumptions.find((candidate) => candidate.id === assumptions.id);
        if (sameId && sameId.scenarioId !== assumptions.scenarioId) throw new Error('Costing assumption ownership cannot be moved to another Scenario.');
      }
      const incoming = {
        scenarios: new Set(snapshot.scenarios.map((scenario) => scenario.id)),
        serviceDays: new Set(snapshot.serviceDays.map((day) => day.id)),
        routes: new Set(snapshot.routes.map((route) => route.id)),
        nodes: new Set(snapshot.nodes.map((node) => node.id)),
        patterns: new Set(snapshot.patterns.map((pattern) => pattern.id)),
        directions: new Set((snapshot.directions ?? []).map((direction) => direction.id)),
        runtimeProfiles: new Set(snapshot.runtimeProfiles.map((profile) => profile.id)),
        runtimeAssignments: new Set(snapshot.runtimeAssignments.map((assignment) => assignment.id)),
        tripProfiles: new Set((snapshot.tripProfiles ?? []).map((profile) => profile.id)),
        blockingScenarios: new Set((snapshot.blockingScenarios ?? []).map((blockingScenario) => blockingScenario.id)),
        costingAssumptions: new Set((snapshot.costingAssumptions ?? []).map((assumptions) => assumptions.id)),
        generationSets: new Set(snapshot.generationSets.map((set) => set.id)),
        trips: new Set(snapshot.trips.map((trip) => trip.id)),
        blocks: new Set(snapshot.blocks.map((block) => block.id)),
      };
      await this.db.patterns.bulkDelete(currentPatterns.filter((pattern) => !incoming.patterns.has(pattern.id)).map((pattern) => pattern.id));
      await this.db.directions.bulkDelete(currentDirections.filter((direction) => !incoming.directions.has(direction.id)).map((direction) => direction.id));
      await this.db.nodes.bulkDelete(currentNodes.filter((node) => !incoming.nodes.has(node.id)).map((node) => node.id));
      await this.db.routes.bulkDelete(currentRoutes.filter((route) => !incoming.routes.has(route.id)).map((route) => route.id));
      await this.db.serviceDays.bulkDelete(currentServiceDays.filter((day) => !incoming.serviceDays.has(day.id)).map((day) => day.id));
      await this.db.scenarios.bulkDelete(currentScenarios.filter((scenario) => !incoming.scenarios.has(scenario.id)).map((scenario) => scenario.id));
      await this.db.runtimeAssignments.bulkDelete(currentAssignments.filter((assignment) => !incoming.runtimeAssignments.has(assignment.id)).map((assignment) => assignment.id));
      await this.db.runtimeProfiles.bulkDelete(currentProfiles.filter((profile) => !incoming.runtimeProfiles.has(profile.id)).map((profile) => profile.id));
      await this.db.tripProfiles.bulkDelete(currentTripProfiles.filter((profile) => !incoming.tripProfiles.has(profile.id)).map((profile) => profile.id));
      await this.db.blockingScenarios.bulkDelete(currentBlockingScenarios.filter((blockingScenario) => !incoming.blockingScenarios.has(blockingScenario.id)).map((blockingScenario) => blockingScenario.id));
      await this.db.costingAssumptions.bulkDelete(currentCostingAssumptions.filter((assumptions) => !incoming.costingAssumptions.has(assumptions.id)).map((assumptions) => assumptions.id));
      await this.db.generationSets.bulkDelete(currentGenerationSets.filter((set) => !incoming.generationSets.has(set.id)).map((set) => set.id));
      await this.db.trips.bulkDelete(currentTrips.filter((trip) => !incoming.trips.has(trip.id)).map((trip) => trip.id));
      await this.db.blocks.bulkDelete(currentBlocks.filter((block) => !incoming.blocks.has(block.id)).map((block) => block.id));
      await this.db.projects.put(snapshot.project);
      await this.db.scenarios.bulkPut(snapshot.scenarios);
      await this.db.serviceDays.bulkPut(snapshot.serviceDays);
      await this.db.routes.bulkPut(snapshot.routes);
      await this.db.nodes.bulkPut(snapshot.nodes);
      await this.db.patterns.bulkPut(snapshot.patterns);
      await this.db.directions.bulkPut(snapshot.directions ?? []);
      await this.db.runtimeProfiles.bulkPut(snapshot.runtimeProfiles);
      await this.db.runtimeAssignments.bulkPut(snapshot.runtimeAssignments);
      await this.db.tripProfiles.bulkPut(snapshot.tripProfiles ?? []);
      await this.db.blockingScenarios.bulkPut(snapshot.blockingScenarios ?? []);
      await this.db.costingAssumptions.bulkPut(snapshot.costingAssumptions ?? []);
      await this.db.generationSets.bulkPut(snapshot.generationSets);
      await this.db.trips.bulkPut(snapshot.trips);
      await this.db.blocks.bulkPut(snapshot.blocks);
    });
  }

  async getRuntimeProfile(id: string): Promise<RuntimeProfile | undefined> { return this.db.runtimeProfiles.get(id); }
  async listRuntimeProfiles(routeId: string, patternId?: string): Promise<RuntimeProfile[]> {
    const profiles = await this.db.runtimeProfiles.where('routeId').equals(routeId).toArray();
    return patternId ? profiles.filter((profile) => profile.patternId === patternId) : profiles;
  }
  async saveRuntimeProfile(profile: RuntimeProfile): Promise<void> {
    const pattern = await this.db.patterns.get(profile.patternId);
    const serviceDays = await this.db.serviceDays.where('scenarioId').equals(profile.scenarioId).toArray();
    const assignments = await this.db.runtimeAssignments.where('scenarioId').equals(profile.scenarioId).toArray();
    assertRuntimeGraph([profile], assignments.filter((assignment) => assignment.runtimeProfileId === profile.id), pattern ? [pattern] : [], serviceDays, profile.scenarioId);
    await this.db.runtimeProfiles.put(profile);
  }
  async deleteRuntimeProfile(profileId: string, replacementProfileId?: string): Promise<void> {
    await this.db.transaction('rw', [this.db.runtimeProfiles, this.db.runtimeAssignments, this.db.patterns, this.db.serviceDays], async () => {
      const assignments = await this.db.runtimeAssignments.where('runtimeProfileId').equals(profileId).toArray();
      if (assignments.length && !replacementProfileId) throw new Error('Runtime profile is still assigned.');
      if (replacementProfileId) await this.db.runtimeAssignments.bulkPut(assignments.map((assignment) => ({ ...assignment, runtimeProfileId: replacementProfileId })));
      await this.db.runtimeProfiles.delete(profileId);
    });
  }
  async listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string): Promise<RuntimeAssignment[]> {
    const assignments = await this.db.runtimeAssignments.where('scenarioId').equals(scenarioId).toArray();
    return assignments.filter((assignment) => (!serviceDayId || assignment.serviceDayId === serviceDayId) && (!patternId || assignment.patternId === patternId));
  }
  async saveRuntimeAssignment(assignment: RuntimeAssignment): Promise<void> {
    const pattern = await this.db.patterns.get(assignment.patternId);
    const profile = await this.db.runtimeProfiles.get(assignment.runtimeProfileId);
    const serviceDay = await this.db.serviceDays.get(assignment.serviceDayId);
    const existing = await this.db.runtimeAssignments.where('[patternId+serviceDayId]').equals([assignment.patternId, assignment.serviceDayId]).toArray();
    if (existing.some((candidate) => candidate.id !== assignment.id)) throw new Error(`Duplicate runtime assignment for ${assignment.patternId}:${assignment.serviceDayId}`);
    assertRuntimeGraph(profile ? [profile] : [], [assignment], pattern ? [pattern] : [], serviceDay ? [serviceDay] : [], assignment.scenarioId);
    await this.db.runtimeAssignments.put(assignment);
  }
  async commitRuntimeCopyAtomically(preview: RuntimeCopyPreview): Promise<void> {
    await this.db.transaction('rw', [this.db.runtimeProfiles, this.db.runtimeAssignments], async () => {
      const [profiles, assignments] = await Promise.all([this.db.runtimeProfiles.toArray(), this.db.runtimeAssignments.toArray()]);
      const profileIds = new Set(preview.profiles.map((profile) => profile.id));
      const assignmentIds = new Set(preview.assignments.map((assignment) => assignment.id));
      if ([...profileIds].some((id) => profiles.some((profile) => profile.id === id))) throw new Error('Runtime copy generated a duplicate profile identifier.');
      if ([...assignmentIds].some((id) => assignments.some((assignment) => assignment.id === id))) throw new Error('Runtime copy generated a duplicate assignment identifier.');
      const nextAssignments = assignments.filter((assignment) => !preview.replaceAssignmentIds.includes(assignment.id)).concat(preview.assignments);
      const [patterns, serviceDays] = await Promise.all([this.db.patterns.where('scenarioId').equals(preview.request.scenarioId).toArray(), this.db.serviceDays.where('scenarioId').equals(preview.request.scenarioId).toArray()]);
      assertRuntimeGraph(profiles.filter((profile) => profile.scenarioId === preview.request.scenarioId).concat(preview.profiles), nextAssignments.filter((assignment) => assignment.scenarioId === preview.request.scenarioId), patterns, serviceDays, preview.request.scenarioId);
      if (preview.replaceAssignmentIds.length) await this.db.runtimeAssignments.bulkDelete(preview.replaceAssignmentIds);
      if (preview.profiles.length) await this.db.runtimeProfiles.bulkAdd(preview.profiles);
      if (preview.assignments.length) await this.db.runtimeAssignments.bulkAdd(preview.assignments);
    });
  }
  async listTripProfiles(scenarioId: string): Promise<TripProfile[]> { return this.db.tripProfiles.where('scenarioId').equals(scenarioId).toArray(); }
  async getTripProfile(id: string): Promise<TripProfile | undefined> { return this.db.tripProfiles.get(id); }
  async saveTripProfile(profile: TripProfile): Promise<void> {
    if (!profile.name.trim()) throw new Error('Enter a trip profile name.');
    const existing = await this.db.tripProfiles.where('scenarioId').equals(profile.scenarioId).toArray();
    if (existing.some((candidate) => candidate.id !== profile.id && candidate.name.trim().toLowerCase() === profile.name.trim().toLowerCase())) throw new Error('A Trip profile with this name already exists.');
    await this.db.tripProfiles.put(profile);
  }
  async copyTripProfileAtomically(profile: TripProfile, trips: Trip[]): Promise<void> {
    await this.db.transaction('rw', [this.db.tripProfiles, this.db.trips], async () => {
      if (!profile.name.trim()) throw new Error('Enter a trip profile name.');
      const existing = await this.db.tripProfiles.where('scenarioId').equals(profile.scenarioId).toArray();
      if (existing.some((candidate) => candidate.name.trim().toLowerCase() === profile.name.trim().toLowerCase())) throw new Error('A Trip profile with this name already exists.');
      await this.db.tripProfiles.add(profile); if (trips.length) await this.db.trips.bulkAdd(trips);
    });
  }
  async deleteTripProfile(profileId: string): Promise<void> {
    await this.db.transaction('rw', [this.db.tripProfiles, this.db.blockingScenarios, this.db.trips, this.db.blocks], async () => {
      const blockingScenarios = await this.db.blockingScenarios.where('tripProfileId').equals(profileId).toArray();
      const blockingScenarioIds = blockingScenarios.map((scenario) => scenario.id);
      await this.db.tripProfiles.delete(profileId);
      if (blockingScenarioIds.length) await this.db.blockingScenarios.bulkDelete(blockingScenarioIds);
      await this.db.trips.where('tripProfileId').equals(profileId).delete();
      const blocks = await this.db.blocks.toArray();
      await this.db.blocks.bulkDelete(blocks.filter((block) => block.tripProfileId === profileId || (block.blockingScenarioId && blockingScenarioIds.includes(block.blockingScenarioId))).map((block) => block.id));
    });
  }

  async getGenerationSet(id: string): Promise<TripGenerationSet | undefined> { return this.db.generationSets.get(id); }
  async listGenerationSets(serviceDayId: string, routeId?: string, patternId?: string): Promise<TripGenerationSet[]> {
    const sets = await this.db.generationSets.where('serviceDayId').equals(serviceDayId).toArray();
    return sets.filter((set) => (!routeId || set.routeId === routeId) && (!patternId || set.patternId === patternId));
  }
  async saveGenerationSet(set: TripGenerationSet): Promise<void> { await this.db.generationSets.put(set); }
  async listTrips(serviceDayId: string, generationSetId?: string): Promise<Trip[]> {
    const trips = await this.db.trips.where('serviceDayId').equals(serviceDayId).toArray();
    return generationSetId ? trips.filter((trip) => trip.provenance.generationSetId === generationSetId || trip.tripProfileId === generationSetId) : trips;
  }
  async getTrip(id: string): Promise<Trip | undefined> { return this.db.trips.get(id); }
  async saveTrips(trips: Trip[]): Promise<void> { await this.db.trips.bulkPut(trips); }
  /** Atomically append authoritative trips without replacing any existing trip. */
  async insertTripsAtomically(trips: Trip[]): Promise<void> {
    await this.db.transaction('rw', [this.db.trips], async () => { await this.db.trips.bulkAdd(trips); });
  }
  /** Atomically update authoritative trips and affected block records. */
  async saveTripChangesAtomically(trips: Trip[], blocks: Block[] = []): Promise<void> {
    if (blocks.length) assertTripProfileReferences([...(await this.db.trips.toArray()), ...trips], blocks);
    await this.db.transaction('rw', [this.db.trips, this.db.blocks], async () => { await this.db.trips.bulkPut(trips); if (blocks.length) await this.db.blocks.bulkPut(blocks); });
  }
  /** Atomically delete trips and persist only blocks whose activities changed. */
  async deleteTripsAtomically(tripIds: string[], blocks: Block[] = []): Promise<void> {
    await this.db.transaction('rw', [this.db.trips, this.db.blocks], async () => { await this.db.trips.bulkDelete(tripIds); if (blocks.length) await this.db.blocks.bulkPut(blocks); });
  }
  async replaceTripsForDayAtomically(preview: TripCopyPreview): Promise<void> {
    await this.db.transaction('rw', [this.db.trips, this.db.blocks], async () => {
      const [trips, blocks] = await Promise.all([this.db.trips.toArray(), this.db.blocks.toArray()]);
      const copiedIds = new Set(preview.copiedTrips.map((trip) => trip.id));
      if ([...copiedIds].some((id) => trips.some((trip) => trip.id === id))) throw new Error('Trip copy generated a duplicate Trip identifier.');
      const nextTrips = trips.filter((trip) => !preview.removedTripIds.includes(trip.id)).concat(preview.copiedTrips);
      const adjustedById = new Map(preview.adjustedBlocks.map((block) => [block.id, block]));
      const nextBlocks = blocks.map((block) => adjustedById.get(block.id) ?? block);
      assertTripProfileReferences(nextTrips, nextBlocks);
      if (preview.removedTripIds.length) await this.db.trips.bulkDelete(preview.removedTripIds);
      if (preview.copiedTrips.length) await this.db.trips.bulkAdd(preview.copiedTrips);
      if (preview.adjustedBlocks.length) await this.db.blocks.bulkPut(preview.adjustedBlocks);
    });
  }
  async listBlocks(serviceDayId: string, tripProfileId?: string): Promise<Block[]> { const blocks = await this.db.blocks.where('serviceDayId').equals(serviceDayId).toArray(); return tripProfileId ? blocks.filter((block) => block.tripProfileId === tripProfileId) : blocks; }
  async listTripsForProfile(tripProfileId: string): Promise<Trip[]> { return this.db.trips.where('tripProfileId').equals(tripProfileId).toArray(); }
  async listBlocksForProfile(tripProfileId: string): Promise<Block[]> {
    const [blocks, blockingScenarios] = await Promise.all([this.db.blocks.toArray(), this.db.blockingScenarios.where('tripProfileId').equals(tripProfileId).toArray()]);
    const scenarioIds = new Set(blockingScenarios.map((scenario) => scenario.id));
    return blocks.filter((block) => block.tripProfileId === tripProfileId || (block.blockingScenarioId !== undefined && scenarioIds.has(block.blockingScenarioId)));
  }
  async saveBlocks(blocks: Block[]): Promise<void> { assertTripProfileReferences(await this.db.trips.toArray(), blocks); await this.db.blocks.bulkPut(blocks); }
  async getPattern(id: string) { return this.db.patterns.get(id); }
  /** Replace one generation set and related trips/blocks in one IndexedDB transaction. */
  async replaceGenerationSet(set: TripGenerationSet, trips: Trip[], blocks: Block[]): Promise<void> {
    if (blocks.length) assertTripProfileReferences([...(await this.db.trips.toArray()), ...trips], blocks);
    await this.db.transaction('rw', [this.db.generationSets, this.db.trips, this.db.blocks], async () => {
      const oldTrips = await this.db.trips.where('provenance.generationSetId').equals(set.id).toArray();
      const incomingTripIds = new Set(trips.map((trip) => trip.id));
      await this.db.trips.bulkDelete(oldTrips.filter((trip) => !incomingTripIds.has(trip.id)).map((trip) => trip.id));
      await this.db.generationSets.put(set);
      await this.db.trips.bulkPut(trips);
      await this.db.blocks.bulkPut(blocks);
    });
  }
}
