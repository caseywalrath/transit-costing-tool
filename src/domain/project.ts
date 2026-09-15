import type {
  Node,
  PatternPoint,
  Project,
  ProjectSnapshot,
  Route,
  RouteDirection,
  RoutePattern,
  RuntimeAssignment,
  RuntimeProfile,
  Trip,
  TripProfile,
  TripGenerationSet,
  Block,
  Scenario,
  ServiceDayDefinition,
} from './types';
import { metadata, newId } from './ids';
import { createStandardServiceDays } from './serviceDays';

export function createProject(name: string, now = new Date().toISOString()): Project {
  if (!name.trim()) throw new Error('Project name is required');
  return { id: newId(), name: name.trim(), distanceUnit: 'miles', currencyCode: 'USD', ...metadata(now) };
}

export function createScenario(projectId: string, name: string, now = new Date().toISOString()): Scenario {
  if (!projectId.trim()) throw new Error('Project id is required');
  if (!name.trim()) throw new Error('Scenario name is required');
  return { id: newId(), projectId, name: name.trim(), ...metadata(now) };
}

export interface ScenarioRecords {
  scenario: Scenario;
  serviceDays: ServiceDayDefinition[];
  routes: Route[];
  nodes: Node[];
  patterns: RoutePattern[];
  directions?: RouteDirection[];
  runtimeProfiles: RuntimeProfile[];
  runtimeAssignments: RuntimeAssignment[];
  tripProfiles?: TripProfile[];
  /** Historical Phase 2 records; authoritative trip workflows leave this empty. */
  generationSets: TripGenerationSet[];
  trips: Trip[];
  blocks: Block[];
}

export function createScenarioRecords(projectId: string, name: string, now = new Date().toISOString()): ScenarioRecords {
  const scenario = createScenario(projectId, name, now);
  return { scenario, serviceDays: createStandardServiceDays(scenario.id, undefined, now), routes: [], nodes: [], patterns: [], directions: [], runtimeProfiles: [], runtimeAssignments: [], tripProfiles: [{ id: newId(), scenarioId: scenario.id, name: 'Default', ...metadata(now) }], generationSets: [], trips: [], blocks: [] };
}

/** Clone all Phase 1 records owned by a scenario with remapped references. */
export function duplicateScenario(source: ScenarioRecords, targetName: string, now = new Date().toISOString()): ScenarioRecords {
  if (!targetName.trim()) throw new Error('Scenario name is required');

  const scenario = { ...source.scenario, id: newId(), name: targetName.trim(), sourceScenarioId: source.scenario.id, ...metadata(now) };
  const serviceDays = source.serviceDays.map((day, sequence) => ({ ...day, id: newId(), scenarioId: scenario.id, sequence, ...metadata(now) }));

  const routeIds = new Map<string, string>();
  const routes = source.routes.map((route) => {
    const id = newId();
    routeIds.set(route.id, id);
    return { ...route, id, scenarioId: scenario.id, ...metadata(now) };
  });

  const nodeIds = new Map<string, string>();
  const nodes = source.nodes.map((node) => {
    const id = newId();
    nodeIds.set(node.id, id);
    return { ...node, id, scenarioId: scenario.id, routeId: routeIds.get(node.routeId) ?? node.routeId, ...metadata(now) };
  });

  const patterns = source.patterns.map((pattern) => {
    const points: PatternPoint[] = pattern.points.map((point, sequence) => ({
      ...point,
      id: newId(),
      nodeId: nodeIds.get(point.nodeId) ?? point.nodeId,
      sequence,
    }));
    return { ...pattern, id: newId(), scenarioId: scenario.id, routeId: routeIds.get(pattern.routeId) ?? pattern.routeId, points, ...metadata(now) };
  });

  const directionIds = new Map((source.directions ?? []).map((direction) => [direction.id, newId()]));
  const directions = (source.directions ?? []).map((direction) => ({
    ...direction,
    id: directionIds.get(direction.id)!,
    scenarioId: scenario.id,
    routeId: routeIds.get(direction.routeId) ?? direction.routeId,
    columns: direction.columns.map((column) => ({ ...column, id: newId() })),
    ...metadata(now),
  }));
  const columnIds = new Map<string, string>();
  (source.directions ?? []).forEach((direction, directionIndex) => direction.columns.forEach((column, columnIndex) => columnIds.set(column.id, directions[directionIndex].columns[columnIndex].id)));
  const copiedPatterns = patterns.map((pattern, index) => ({
    ...pattern,
    directionId: pattern.directionId ? directionIds.get(pattern.directionId) : undefined,
    points: pattern.points.map((point, pointIndex) => ({ ...point, directionColumnId: point.directionColumnId ? columnIds.get(point.directionColumnId) : undefined, id: point.id })),
  }));

  const patternIds = new Map(source.patterns.map((pattern, index) => [pattern.id, patterns[index].id]));
  const serviceDayIds = new Map(source.serviceDays.map((day, index) => [day.id, serviceDays[index].id]));
  const tripProfileIds = new Map((source.tripProfiles ?? []).map((profile) => [profile.id, newId()]));
  const tripProfiles = (source.tripProfiles?.length ? source.tripProfiles : [{ id: newId(), scenarioId: source.scenario.id, name: 'Default', ...metadata(now) }]).map((profile) => ({ ...profile, id: tripProfileIds.get(profile.id) ?? newId(), scenarioId: scenario.id, sourceTripProfileId: profile.id, ...metadata(now) }));
  const profileIds = new Map(source.runtimeProfiles.map((profile) => [profile.id, newId()]));
  const runtimeProfiles = source.runtimeProfiles.map((profile) => ({
    ...profile,
    id: profileIds.get(profile.id)!,
    scenarioId: scenario.id,
    routeId: routeIds.get(profile.routeId) ?? profile.routeId,
    patternId: patternIds.get(profile.patternId) ?? profile.patternId,
    bands: profile.bands.map((band) => ({ ...band, id: newId(), segmentRuntimeSeconds: [...band.segmentRuntimeSeconds] })),
    ...metadata(now),
  }));
  const runtimeAssignments = source.runtimeAssignments.map((assignment) => ({
    ...assignment,
    id: newId(),
    scenarioId: scenario.id,
    patternId: patternIds.get(assignment.patternId) ?? assignment.patternId,
    serviceDayId: serviceDayIds.get(assignment.serviceDayId) ?? assignment.serviceDayId,
    runtimeProfileId: profileIds.get(assignment.runtimeProfileId) ?? assignment.runtimeProfileId,
    ...metadata(now),
  }));

  const generationSetIds = new Map(source.generationSets.map((set) => [set.id, newId()]));
  const tripIds = new Map(source.trips.map((trip) => [trip.id, newId()]));
  const blockIds = new Map(source.blocks.map((block) => [block.id, newId()]));
  const pointIds = new Map<string, string>();
  source.patterns.forEach((sourcePattern, patternIndex) => sourcePattern.points.forEach((point, pointIndex) => pointIds.set(point.id, patterns[patternIndex].points[pointIndex].id)));
  const generationSets = source.generationSets.map((set) => ({ ...set, id: generationSetIds.get(set.id)!, scenarioId: scenario.id, routeId: routeIds.get(set.routeId) ?? set.routeId, serviceDayId: serviceDayIds.get(set.serviceDayId) ?? set.serviceDayId, patternId: patternIds.get(set.patternId) ?? set.patternId, ...metadata(now) }));
  const defaultProfileId = tripProfiles[0]?.id;
  const trips = source.trips.map((trip) => ({ ...trip, id: tripIds.get(trip.id)!, scenarioId: scenario.id, routeId: routeIds.get(trip.routeId) ?? trip.routeId, serviceDayId: serviceDayIds.get(trip.serviceDayId) ?? trip.serviceDayId, patternId: patternIds.get(trip.patternId) ?? trip.patternId, tripProfileId: trip.tripProfileId ? tripProfileIds.get(trip.tripProfileId) ?? defaultProfileId : defaultProfileId, provenance: { ...trip.provenance, generationSetId: trip.provenance.generationSetId ? generationSetIds.get(trip.provenance.generationSetId) : undefined, runtimeProfileId: trip.provenance.runtimeProfileId ? profileIds.get(trip.provenance.runtimeProfileId) : undefined, calculationSource: trip.provenance.calculationSource ? { ...trip.provenance.calculationSource, runtimeProfileId: profileIds.get(trip.provenance.calculationSource.runtimeProfileId) ?? trip.provenance.calculationSource.runtimeProfileId } : undefined }, stopTimes: trip.stopTimes.map((point) => ({ ...point, patternPointId: pointIds.get(point.patternPointId) ?? point.patternPointId })), ...metadata(now) }));
  const blocks = source.blocks.map((block) => ({ ...block, id: blockIds.get(block.id)!, scenarioId: scenario.id, serviceDayId: serviceDayIds.get(block.serviceDayId) ?? block.serviceDayId, tripProfileId: block.tripProfileId ? tripProfileIds.get(block.tripProfileId) ?? defaultProfileId : defaultProfileId, activities: block.activities.map((activity) => activity.type === 'revenueTrip' ? { ...activity, id: newId(), tripId: tripIds.get(activity.tripId) ?? activity.tripId } : { ...activity, id: newId() }), ...metadata(now) }));

  return { scenario, serviceDays, routes, nodes, patterns: copiedPatterns, ...(source.directions ? { directions } : {}), runtimeProfiles, runtimeAssignments, tripProfiles, generationSets, trips, blocks };
}

export function snapshotForScenario(snapshot: ProjectSnapshot, scenarioId: string): ScenarioRecords | undefined {
  const scenario = snapshot.scenarios.find((candidate) => candidate.id === scenarioId);
  if (!scenario) return undefined;
  const routeIds = new Set(snapshot.routes.filter((route) => route.scenarioId === scenarioId).map((route) => route.id));
  return {
    scenario,
    serviceDays: snapshot.serviceDays.filter((day) => day.scenarioId === scenarioId),
    routes: snapshot.routes.filter((route) => route.scenarioId === scenarioId),
    nodes: snapshot.nodes.filter((node) => routeIds.has(node.routeId)),
    patterns: snapshot.patterns.filter((pattern) => routeIds.has(pattern.routeId)),
    ...(snapshot.directions ? { directions: snapshot.directions.filter((direction) => routeIds.has(direction.routeId)) } : {}),
    runtimeProfiles: snapshot.runtimeProfiles.filter((profile) => routeIds.has(profile.routeId)),
    runtimeAssignments: snapshot.runtimeAssignments.filter((assignment) => assignment.scenarioId === scenarioId),
    tripProfiles: (snapshot.tripProfiles ?? []).filter((profile) => profile.scenarioId === scenarioId),
    generationSets: snapshot.generationSets.filter((set) => set.scenarioId === scenarioId),
    trips: snapshot.trips.filter((trip) => trip.scenarioId === scenarioId),
    blocks: snapshot.blocks.filter((block) => block.scenarioId === scenarioId),
  };
}

export function projectSnapshotWithScenario(snapshot: ProjectSnapshot, records: ScenarioRecords): ProjectSnapshot {
  const otherScenarioIds = new Set(snapshot.scenarios.filter((candidate) => candidate.id !== records.scenario.id).map((candidate) => candidate.id));
  const otherRouteIds = new Set(snapshot.routes.filter((route) => otherScenarioIds.has(route.scenarioId)).map((route) => route.id));
  return {
    project: snapshot.project,
    scenarios: [...snapshot.scenarios.filter((candidate) => candidate.id !== records.scenario.id), records.scenario],
    serviceDays: [...snapshot.serviceDays.filter((day) => otherScenarioIds.has(day.scenarioId)), ...records.serviceDays],
    routes: [...snapshot.routes.filter((route) => otherScenarioIds.has(route.scenarioId) || otherRouteIds.has(route.id)), ...records.routes],
    nodes: [...snapshot.nodes.filter((node) => otherRouteIds.has(node.routeId)), ...records.nodes],
    patterns: [...snapshot.patterns.filter((pattern) => otherRouteIds.has(pattern.routeId)), ...records.patterns],
    ...(snapshot.directions || records.directions ? { directions: [...(snapshot.directions ?? []).filter((direction) => otherRouteIds.has(direction.routeId)), ...(records.directions ?? [])] } : {}),
    runtimeProfiles: [...snapshot.runtimeProfiles.filter((profile) => otherRouteIds.has(profile.routeId)), ...records.runtimeProfiles],
    runtimeAssignments: [...snapshot.runtimeAssignments.filter((assignment) => otherScenarioIds.has(assignment.scenarioId)), ...records.runtimeAssignments],
    tripProfiles: [...(snapshot.tripProfiles ?? []).filter((profile) => otherScenarioIds.has(profile.scenarioId)), ...(records.tripProfiles ?? [])],
    generationSets: [...snapshot.generationSets.filter((set) => otherScenarioIds.has(set.scenarioId)), ...records.generationSets],
    trips: [...snapshot.trips.filter((trip) => otherScenarioIds.has(trip.scenarioId)), ...records.trips],
    blocks: [...snapshot.blocks.filter((block) => otherScenarioIds.has(block.scenarioId)), ...records.blocks],
  };
}

export { createStandardServiceDays };
