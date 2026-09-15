import type { Block, Node, Project, ProjectSnapshot, Route, RouteDefinitionAggregate, RouteDirection, RoutePattern, RuntimeAssignment, RuntimeProfile, Scenario, ServiceDayDefinition, Trip, TripGenerationSet, TripProfile } from '../domain/types';
import type { ScenarioRecords } from '../domain/project';
import type { RouteDefinitionRepository } from '../application/ports';
import type { RuntimeCopyPreview, TripCopyPreview } from '../domain/serviceDayCopy';
import { assertRuntimeGraph } from './runtimePersistence';
import { assertTripProfileReferences } from '../domain/trips';
import { sortServiceDays } from '../domain/serviceDays';
import { orderDirections } from '../domain/directions';

export class InMemoryRouteDefinitionRepository implements RouteDefinitionRepository {
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
  generationSets = new Map<string, TripGenerationSet>();
  trips = new Map<string, Trip>();
  blocks = new Map<string, Block>();

  async listProjects(): Promise<Project[]> { return [...this.projects.values()]; }
  async getProject(id: string): Promise<Project | undefined> { return this.projects.get(id); }
  async saveProject(value: Project): Promise<void> { this.projects.set(value.id, value); }
  async listScenarios(projectId: string): Promise<Scenario[]> { return [...this.scenarios.values()].filter((value) => value.projectId === projectId); }
  async saveScenario(value: Scenario): Promise<void> { this.scenarios.set(value.id, value); }

  async getScenarioRecords(scenarioId: string): Promise<ScenarioRecords | undefined> {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) return undefined;
    const routes = [...this.routes.values()].filter((route) => route.scenarioId === scenarioId);
    const routeIds = new Set(routes.map((route) => route.id));
    return {
      scenario,
      serviceDays: sortServiceDays([...this.serviceDays.values()].filter((day) => day.scenarioId === scenarioId)),
      routes,
      nodes: [...this.nodes.values()].filter((node) => routeIds.has(node.routeId)),
      patterns: [...this.patterns.values()].filter((pattern) => routeIds.has(pattern.routeId)),
      directions: orderDirections([...this.directions.values()].filter((direction) => routeIds.has(direction.routeId))),
      runtimeProfiles: [...this.runtimeProfiles.values()].filter((profile) => routeIds.has(profile.routeId)),
      runtimeAssignments: [...this.runtimeAssignments.values()].filter((assignment) => assignment.scenarioId === scenarioId),
      ...((() => { const profiles = [...this.tripProfiles.values()].filter((profile) => profile.scenarioId === scenarioId); return profiles.length ? { tripProfiles: profiles } : {}; })()),
      generationSets: [...this.generationSets.values()].filter((set) => set.scenarioId === scenarioId),
      trips: [...this.trips.values()].filter((trip) => trip.scenarioId === scenarioId),
      blocks: [...this.blocks.values()].filter((block) => block.scenarioId === scenarioId),
    };
  }

  async saveScenarioRecords(records: ScenarioRecords): Promise<void> {
    const oldRoutes = [...this.routes.values()].filter((route) => route.scenarioId === records.scenario.id);
    const oldRouteIds = new Set(oldRoutes.map((route) => route.id));
    const routeIds = new Set(records.routes.map((route) => route.id));
    const nodeIds = new Set(records.nodes.map((node) => node.id));
    const patternIds = new Set(records.patterns.map((pattern) => pattern.id));
    const directionIds = new Set((records.directions ?? []).map((direction) => direction.id));
    const serviceDayIds = new Set(records.serviceDays.map((day) => day.id));
    assertRuntimeGraph(records.runtimeProfiles, records.runtimeAssignments, records.patterns, records.serviceDays, records.scenario.id);
    assertTripProfileReferences(records.trips, records.blocks);
    for (const [id, node] of this.nodes) if (oldRouteIds.has(node.routeId) && !nodeIds.has(id)) this.nodes.delete(id);
    for (const [id, pattern] of this.patterns) if (oldRouteIds.has(pattern.routeId) && !patternIds.has(id)) this.patterns.delete(id);
    for (const [id, direction] of this.directions) if (oldRouteIds.has(direction.routeId) && !directionIds.has(id)) this.directions.delete(id);
    for (const route of oldRoutes) if (!routeIds.has(route.id)) this.routes.delete(route.id);
    for (const [id, day] of this.serviceDays) if (day.scenarioId === records.scenario.id && !serviceDayIds.has(id)) this.serviceDays.delete(id);
    for (const [id, profile] of this.runtimeProfiles) if (profile.scenarioId === records.scenario.id && !records.runtimeProfiles.some((candidate) => candidate.id === id)) this.runtimeProfiles.delete(id);
    for (const [id, assignment] of this.runtimeAssignments) if (assignment.scenarioId === records.scenario.id && !records.runtimeAssignments.some((candidate) => candidate.id === id)) this.runtimeAssignments.delete(id);
    for (const [id, profile] of this.tripProfiles) if (profile.scenarioId === records.scenario.id && !(records.tripProfiles ?? []).some((candidate) => candidate.id === id)) this.tripProfiles.delete(id);
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
    for (const set of records.generationSets) this.generationSets.set(set.id, set);
    for (const trip of records.trips) this.trips.set(trip.id, trip);
    for (const block of records.blocks) this.blocks.set(block.id, block);
  }

  async commitRouteEdit(records: ScenarioRecords): Promise<void> {
    await this.saveScenarioRecords(records);
  }

  async getRouteDefinition(id: string): Promise<RouteDefinitionAggregate | undefined> {
    const route = this.routes.get(id);
    if (!route) return undefined;
    const directions = orderDirections([...this.directions.values()].filter((direction) => direction.routeId === id));
    return {
      route,
      nodes: [...this.nodes.values()].filter((node) => node.routeId === id),
      patterns: [...this.patterns.values()].filter((pattern) => pattern.routeId === id),
      ...(directions.length ? { directions } : {}),
    };
  }
  async listDirections(routeId: string): Promise<RouteDirection[]> { return orderDirections([...this.directions.values()].filter((direction) => direction.routeId === routeId)); }

  async saveRouteDefinition(value: RouteDefinitionAggregate): Promise<void> {
    for (const node of [...this.nodes.values()]) if (node.routeId === value.route.id && !value.nodes.some((candidate) => candidate.id === node.id)) this.nodes.delete(node.id);
    for (const pattern of [...this.patterns.values()]) if (pattern.routeId === value.route.id && !value.patterns.some((candidate) => candidate.id === pattern.id)) this.patterns.delete(pattern.id);
    for (const direction of [...this.directions.values()]) if (direction.routeId === value.route.id && !(value.directions ?? []).some((candidate) => candidate.id === direction.id)) this.directions.delete(direction.id);
    this.routes.set(value.route.id, value.route);
    for (const node of value.nodes) this.nodes.set(node.id, node);
    for (const pattern of value.patterns) this.patterns.set(pattern.id, pattern);
    for (const direction of value.directions ?? []) this.directions.set(direction.id, direction);
  }

  async getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | undefined> {
    const project = this.projects.get(projectId);
    if (!project) return undefined;
    const scenarios = [...this.scenarios.values()].filter((scenario) => scenario.projectId === projectId);
    const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
    const routes = [...this.routes.values()].filter((route) => scenarioIds.has(route.scenarioId));
    const routeIds = new Set(routes.map((route) => route.id));
    const directions = orderDirections([...this.directions.values()].filter((direction) => routeIds.has(direction.routeId)));
    return {
      project,
      scenarios,
      serviceDays: sortServiceDays([...this.serviceDays.values()].filter((day) => scenarioIds.has(day.scenarioId))),
      routes,
      nodes: [...this.nodes.values()].filter((node) => routeIds.has(node.routeId)),
      patterns: [...this.patterns.values()].filter((pattern) => routeIds.has(pattern.routeId)),
      ...(directions.length ? { directions } : {}),
      runtimeProfiles: [...this.runtimeProfiles.values()].filter((profile) => routeIds.has(profile.routeId)),
      runtimeAssignments: [...this.runtimeAssignments.values()].filter((assignment) => scenarioIds.has(assignment.scenarioId)),
      ...((() => { const profiles = [...this.tripProfiles.values()].filter((profile) => scenarioIds.has(profile.scenarioId)); return profiles.length ? { tripProfiles: profiles } : {}; })()),
      generationSets: [...this.generationSets.values()].filter((set) => scenarioIds.has(set.scenarioId)),
      trips: [...this.trips.values()].filter((trip) => scenarioIds.has(trip.scenarioId)),
      blocks: [...this.blocks.values()].filter((block) => scenarioIds.has(block.scenarioId)),
    };
  }

  async saveProjectSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    const ownedScenarioIds = new Set([...this.scenarios.values()].filter((scenario) => scenario.projectId === snapshot.project.id).map((scenario) => scenario.id));
    const ownedRouteIds = new Set([...this.routes.values()].filter((route) => ownedScenarioIds.has(route.scenarioId)).map((route) => route.id));
    assertRuntimeGraph(snapshot.runtimeProfiles, snapshot.runtimeAssignments, snapshot.patterns, snapshot.serviceDays);
    assertTripProfileReferences(snapshot.trips, snapshot.blocks);
    for (const [id, scenario] of this.scenarios) if (scenario.projectId === snapshot.project.id && !snapshot.scenarios.some((candidate) => candidate.id === id)) this.scenarios.delete(id);
    for (const [id, day] of this.serviceDays) if (snapshot.scenarios.some((scenario) => scenario.projectId === snapshot.project.id && scenario.id === day.scenarioId) && !snapshot.serviceDays.some((candidate) => candidate.id === id)) this.serviceDays.delete(id);
    for (const [id, route] of this.routes) if (snapshot.scenarios.some((scenario) => scenario.projectId === snapshot.project.id && scenario.id === route.scenarioId) && !snapshot.routes.some((candidate) => candidate.id === id)) this.routes.delete(id);
    const routeIds = new Set([...ownedRouteIds, ...snapshot.routes.map((route) => route.id)]);
    for (const [id, node] of this.nodes) if (routeIds.has(node.routeId) && !snapshot.nodes.some((candidate) => candidate.id === id)) this.nodes.delete(id);
    for (const [id, pattern] of this.patterns) if (routeIds.has(pattern.routeId) && !snapshot.patterns.some((candidate) => candidate.id === id)) this.patterns.delete(id);
    for (const [id, direction] of this.directions) if (routeIds.has(direction.routeId) && !(snapshot.directions ?? []).some((candidate) => candidate.id === id)) this.directions.delete(id);
    for (const [id, profile] of this.runtimeProfiles) if (ownedScenarioIds.has(profile.scenarioId) && !snapshot.runtimeProfiles.some((candidate) => candidate.id === id)) this.runtimeProfiles.delete(id);
    for (const [id, assignment] of this.runtimeAssignments) if (ownedScenarioIds.has(assignment.scenarioId) && !snapshot.runtimeAssignments.some((candidate) => candidate.id === id)) this.runtimeAssignments.delete(id);
    for (const [id, profile] of this.tripProfiles) if (ownedScenarioIds.has(profile.scenarioId) && !(snapshot.tripProfiles ?? []).some((candidate) => candidate.id === id)) this.tripProfiles.delete(id);
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
    for (const set of snapshot.generationSets) this.generationSets.set(set.id, set);
    for (const trip of snapshot.trips) this.trips.set(trip.id, trip);
    for (const block of snapshot.blocks) this.blocks.set(block.id, block);
  }

  async getRuntimeProfile(id: string): Promise<RuntimeProfile | undefined> { return this.runtimeProfiles.get(id); }
  async listRuntimeProfiles(routeId: string, patternId?: string): Promise<RuntimeProfile[]> { return [...this.runtimeProfiles.values()].filter((profile) => profile.routeId === routeId && (!patternId || profile.patternId === patternId)); }
  async saveRuntimeProfile(profile: RuntimeProfile): Promise<void> {
    const pattern = this.patterns.get(profile.patternId);
    const serviceDays = [...this.serviceDays.values()].filter((day) => day.scenarioId === profile.scenarioId);
    assertRuntimeGraph([profile], [...this.runtimeAssignments.values()].filter((assignment) => assignment.runtimeProfileId === profile.id), pattern ? [pattern] : [], serviceDays, profile.scenarioId);
    this.runtimeProfiles.set(profile.id, profile);
  }
  async deleteRuntimeProfile(profileId: string, replacementProfileId?: string): Promise<void> {
    const assignments = [...this.runtimeAssignments.values()].filter((assignment) => assignment.runtimeProfileId === profileId);
    if (assignments.length && !replacementProfileId) throw new Error('Runtime profile is still assigned.');
    if (replacementProfileId) for (const assignment of assignments) this.runtimeAssignments.set(assignment.id, { ...assignment, runtimeProfileId: replacementProfileId });
    this.runtimeProfiles.delete(profileId);
  }
  async listTripProfiles(scenarioId: string): Promise<TripProfile[]> { return [...this.tripProfiles.values()].filter((profile) => profile.scenarioId === scenarioId); }
  async getTripProfile(id: string): Promise<TripProfile | undefined> { return this.tripProfiles.get(id); }
  async saveTripProfile(profile: TripProfile): Promise<void> {
    if (!profile.name.trim()) throw new Error('Enter a trip profile name.');
    const duplicate = [...this.tripProfiles.values()].find((candidate) => candidate.id !== profile.id && candidate.scenarioId === profile.scenarioId && candidate.name.trim().toLowerCase() === profile.name.trim().toLowerCase());
    if (duplicate) throw new Error('A Trip profile with this name already exists.');
    this.tripProfiles.set(profile.id, profile);
  }
  async copyTripProfileAtomically(profile: TripProfile, trips: Trip[]): Promise<void> {
    const previousProfiles = new Map(this.tripProfiles); const previousTrips = new Map(this.trips);
    try {
      if (!profile.name.trim()) throw new Error('Enter a trip profile name.');
      if ([...this.tripProfiles.values()].some((candidate) => candidate.scenarioId === profile.scenarioId && candidate.name.trim().toLowerCase() === profile.name.trim().toLowerCase())) throw new Error('A Trip profile with this name already exists.');
      this.tripProfiles.set(profile.id, profile);
      for (const trip of trips) { if (this.trips.has(trip.id)) throw new Error(`Trip ${trip.id} already exists`); this.trips.set(trip.id, trip); }
    }
    catch (error) { this.tripProfiles = previousProfiles; this.trips = previousTrips; throw error; }
  }
  async deleteTripProfile(profileId: string): Promise<void> {
    const previousProfiles = new Map(this.tripProfiles); const previousTrips = new Map(this.trips); const previousBlocks = new Map(this.blocks);
    try { this.tripProfiles.delete(profileId); for (const [id, trip] of this.trips) if (trip.tripProfileId === profileId) this.trips.delete(id); for (const [id, block] of this.blocks) if (block.tripProfileId === profileId) this.blocks.delete(id); }
    catch (error) { this.tripProfiles = previousProfiles; this.trips = previousTrips; this.blocks = previousBlocks; throw error; }
  }
  async listRuntimeAssignments(scenarioId: string, serviceDayId?: string, patternId?: string): Promise<RuntimeAssignment[]> { return [...this.runtimeAssignments.values()].filter((assignment) => assignment.scenarioId === scenarioId && (!serviceDayId || assignment.serviceDayId === serviceDayId) && (!patternId || assignment.patternId === patternId)); }
  async saveRuntimeAssignment(assignment: RuntimeAssignment): Promise<void> {
    const pattern = this.patterns.get(assignment.patternId);
    const profile = this.runtimeProfiles.get(assignment.runtimeProfileId);
    const serviceDay = this.serviceDays.get(assignment.serviceDayId);
    const existing = [...this.runtimeAssignments.values()].find((candidate) => candidate.id !== assignment.id && candidate.patternId === assignment.patternId && candidate.serviceDayId === assignment.serviceDayId);
    if (existing) throw new Error(`Duplicate runtime assignment for ${assignment.patternId}:${assignment.serviceDayId}`);
    assertRuntimeGraph([profile!], [assignment], pattern ? [pattern] : [], serviceDay ? [serviceDay] : [], assignment.scenarioId);
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
      const nextAssignments = [...this.runtimeAssignments.values()].filter((assignment) => !preview.replaceAssignmentIds.includes(assignment.id)).concat(preview.assignments);
      assertRuntimeGraph(nextProfiles.filter((profile) => profile.scenarioId === preview.request.scenarioId), nextAssignments.filter((assignment) => assignment.scenarioId === preview.request.scenarioId), [...this.patterns.values()].filter((pattern) => pattern.scenarioId === preview.request.scenarioId), [...this.serviceDays.values()].filter((day) => day.scenarioId === preview.request.scenarioId), preview.request.scenarioId);
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
    return [...this.generationSets.values()].filter((set) => set.serviceDayId === serviceDayId && (!routeId || set.routeId === routeId) && (!patternId || set.patternId === patternId));
  }
  async saveGenerationSet(set: TripGenerationSet): Promise<void> { this.generationSets.set(set.id, set); }
  async listTrips(serviceDayId: string, generationSetIdOrProfileId?: string): Promise<Trip[]> { return [...this.trips.values()].filter((trip) => trip.serviceDayId === serviceDayId && (!generationSetIdOrProfileId || trip.provenance.generationSetId === generationSetIdOrProfileId || trip.tripProfileId === generationSetIdOrProfileId)); }
  async getTrip(id: string): Promise<Trip | undefined> { return this.trips.get(id); }
  async saveTrips(trips: Trip[]): Promise<void> { for (const trip of trips) this.trips.set(trip.id, trip); }
  /** Atomically append authoritative trips. Existing trips are never replaced. */
  async insertTripsAtomically(trips: Trip[]): Promise<void> {
    const previous = new Map(this.trips);
    try {
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
    try { for (const trip of trips) this.trips.set(trip.id, trip); for (const block of blocks) this.blocks.set(block.id, block); }
    catch (error) { this.trips = previousTrips; this.blocks = previousBlocks; throw error; }
  }
  /** Atomically delete trips and persist only blocks whose activities changed. */
  async deleteTripsAtomically(tripIds: string[], blocks: Block[] = []): Promise<void> {
    const previousTrips = new Map(this.trips); const previousBlocks = new Map(this.blocks);
    try { for (const tripId of tripIds) this.trips.delete(tripId); for (const block of blocks) this.blocks.set(block.id, block); }
    catch (error) { this.trips = previousTrips; this.blocks = previousBlocks; throw error; }
  }
  async listBlocks(serviceDayId: string, tripProfileId?: string): Promise<Block[]> { return [...this.blocks.values()].filter((block) => block.serviceDayId === serviceDayId && (!tripProfileId || block.tripProfileId === tripProfileId)); }
  async listTripsForProfile(tripProfileId: string): Promise<Trip[]> { return [...this.trips.values()].filter((trip) => trip.tripProfileId === tripProfileId); }
  async listBlocksForProfile(tripProfileId: string): Promise<Block[]> { return [...this.blocks.values()].filter((block) => block.tripProfileId === tripProfileId); }
  async saveBlocks(blocks: Block[]): Promise<void> { assertTripProfileReferences([...this.trips.values()], blocks); for (const block of blocks) this.blocks.set(block.id, block); }
  async replaceTripsForDayAtomically(preview: TripCopyPreview): Promise<void> {
    const previousTrips = new Map(this.trips);
    const previousBlocks = new Map(this.blocks);
    try {
      const copiedIds = new Set(preview.copiedTrips.map((trip) => trip.id));
      if ([...copiedIds].some((id) => this.trips.has(id))) throw new Error('Trip copy generated a duplicate Trip identifier.');
      const nextTrips = [...this.trips.values()].filter((trip) => !preview.removedTripIds.includes(trip.id)).concat(preview.copiedTrips);
      const nextBlocks = [...this.blocks.values()].map((block) => preview.adjustedBlocks.find((candidate) => candidate.id === block.id) ?? block);
      assertTripProfileReferences(nextTrips, nextBlocks);
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
      for (const [id, trip] of this.trips) if (trip.provenance.generationSetId === set.id && !trips.some((candidate) => candidate.id === id)) this.trips.delete(id);
      this.generationSets.set(set.id, set); for (const trip of trips) this.trips.set(trip.id, trip); for (const block of blocks) this.blocks.set(block.id, block);
    } catch (error) { this.generationSets = previousSets; this.trips = previousTrips; this.blocks = previousBlocks; throw error; }
  }
}
