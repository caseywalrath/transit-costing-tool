import type {
  Node,
  PatternPoint,
  Project,
  ProjectSnapshot,
  Route,
  RouteDirection,
  RoutePattern,
  Scenario,
  ServiceDayDefinition,
  RuntimeAssignment,
  RuntimeProfile,
  TripGenerationSet,
  Trip,
  Block,
  TripProfile,
  BlockingScenario,
  CostingAssumptions,
} from '../domain/types';
import { metadata, newId } from '../domain/ids';
import { validatePattern } from '../domain/patterns';
import { validateDirection, validatePatternDirection } from '../domain/directions';
import { assertRuntimeGraph } from './runtimePersistence';
import { assertTripProfileReferences } from '../domain/trips';
import { MAX_COSTING_FUTURE_YEARS, MAX_COSTING_YEAR, MIN_COSTING_YEAR, validatePersistedCostingAssumptions } from '../domain/costing';

export const PROJECT_BACKUP_FORMAT = 'transit-costing-tool.project' as const;
export const PROJECT_BACKUP_SCHEMA_VERSION = 6 as const;
export const LEGACY_PROJECT_BACKUP_SCHEMA_VERSION = 1 as const;
export const RUNTIME_PROJECT_BACKUP_SCHEMA_VERSION = 2 as const;

function validateBlockingScenarios(values: unknown[], scenarioIds: Set<string>, tripProfiles: TripProfile[]): BlockingScenario[] {
  const ids = new Set<string>();
  const names = new Set<string>();
  const profiles = new Map(tripProfiles.map((profile) => [profile.id, profile]));
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: blockingScenarios[${index}] must be an object`);
    const scenario = value as unknown as BlockingScenario;
    requiredString(scenario.id, `blockingScenarios[${index}].id`);
    requiredString(scenario.scenarioId, `blockingScenarios[${index}].scenarioId`);
    requiredString(scenario.tripProfileId, `blockingScenarios[${index}].tripProfileId`);
    requiredString(scenario.name, `blockingScenarios[${index}].name`);
    assertMetadata(value, `blockingScenarios[${index}]`);
    if (ids.has(scenario.id)) throw new Error(`Invalid project backup: duplicate blocking scenario id ${scenario.id}`);
    if (!scenarioIds.has(scenario.scenarioId)) throw new Error(`Invalid project backup: blocking scenario ${scenario.id} references a missing Scenario`);
    const profile = profiles.get(scenario.tripProfileId);
    if (!profile || profile.scenarioId !== scenario.scenarioId) throw new Error(`Invalid project backup: blocking scenario ${scenario.id} references an invalid Trip Profile`);
    const nameKey = `${scenario.scenarioId}:${scenario.name.trim().toLowerCase()}`;
    if (names.has(nameKey)) throw new Error(`Invalid project backup: duplicate Blocking Scenario name in scenario ${scenario.scenarioId}`);
    ids.add(scenario.id); names.add(nameKey);
    return scenario;
  });
}

function validateCostingAssumptions(values: unknown[], scenarioIds: Set<string>): CostingAssumptions[] {
  const ids = new Set<string>();
  const owners = new Set<string>();
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: costingAssumptions[${index}] must be an object`);
    const assumptions = value as unknown as CostingAssumptions;
    requiredString(assumptions.id, `costingAssumptions[${index}].id`);
    requiredString(assumptions.scenarioId, `costingAssumptions[${index}].scenarioId`);
    if (!scenarioIds.has(assumptions.scenarioId)) throw new Error(`Invalid project backup: costing assumptions ${assumptions.id} references a missing Scenario`);
    if (ids.has(assumptions.id)) throw new Error(`Invalid project backup: duplicate costing assumptions id ${assumptions.id}`);
    if (owners.has(assumptions.scenarioId)) throw new Error(`Invalid project backup: Scenario ${assumptions.scenarioId} has more than one costing assumptions record`);
    if (assumptions.currencyCode !== 'USD') throw new Error(`Invalid project backup: costingAssumptions[${index}].currencyCode must be USD`);
    if (assumptions.enteredRate !== undefined && (typeof assumptions.enteredRate !== 'number' || !Number.isFinite(assumptions.enteredRate) || assumptions.enteredRate < 0)) {
      throw new Error(`Invalid project backup: costingAssumptions[${index}].enteredRate`);
    }
    if (!Number.isInteger(assumptions.rateYear) || assumptions.rateYear < MIN_COSTING_YEAR || assumptions.rateYear > MAX_COSTING_YEAR) {
      throw new Error(`Invalid project backup: costingAssumptions[${index}].rateYear`);
    }
    if (!Number.isInteger(assumptions.baseServiceYear) || assumptions.baseServiceYear < MIN_COSTING_YEAR || assumptions.baseServiceYear > MAX_COSTING_YEAR) {
      throw new Error(`Invalid project backup: costingAssumptions[${index}].baseServiceYear`);
    }
    if (assumptions.rateYear > assumptions.baseServiceYear) throw new Error(`Invalid project backup: costingAssumptions[${index}].rateYear is after baseServiceYear`);
    if (!Number.isInteger(assumptions.futureYearCount) || assumptions.futureYearCount < 0 || assumptions.futureYearCount > MAX_COSTING_FUTURE_YEARS
      || assumptions.baseServiceYear + assumptions.futureYearCount > MAX_COSTING_YEAR) {
      throw new Error(`Invalid project backup: costingAssumptions[${index}].futureYearCount`);
    }
    if (typeof assumptions.annualEscalation !== 'number' || !Number.isFinite(assumptions.annualEscalation) || assumptions.annualEscalation <= -1) {
      throw new Error(`Invalid project backup: costingAssumptions[${index}].annualEscalation`);
    }
    if (assumptions.sourceType !== 'user' && assumptions.sourceType !== 'ntd') throw new Error(`Invalid project backup: costingAssumptions[${index}].sourceType`);
    if (assumptions.sourceNote !== undefined && typeof assumptions.sourceNote !== 'string') throw new Error(`Invalid project backup: costingAssumptions[${index}].sourceNote`);
    assertMetadata(value, `costingAssumptions[${index}]`);
    if (validatePersistedCostingAssumptions(assumptions).some((finding) => finding.severity === 'error')) {
      throw new Error(`Invalid project backup: costingAssumptions[${index}] failed validation`);
    }
    ids.add(assumptions.id);
    owners.add(assumptions.scenarioId);
    return assumptions;
  });
}

export interface ProjectBackup extends Omit<ProjectSnapshot, 'generationSets' | 'tripProfiles'> {
  /** Historical field; omitted for authoritative exports. */
  generationSets?: TripGenerationSet[];
  tripProfiles?: TripProfile[];
  format: typeof PROJECT_BACKUP_FORMAT;
  exportSchemaVersion: typeof PROJECT_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  applicationVersion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid project backup: ${field} must be a non-empty string`);
  return value;
}

function requiredArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid project backup: ${field} must be an array`);
  return value;
}

function assertMetadata(value: Record<string, unknown>, field: string): void {
  requiredString(value.createdAt, `${field}.createdAt`);
  requiredString(value.updatedAt, `${field}.updatedAt`);
}

function validateProject(value: unknown): Project {
  if (!isRecord(value)) throw new Error('Invalid project backup: project must be an object');
  const project = value as unknown as Project;
  requiredString(project.id, 'project.id');
  requiredString(project.name, 'project.name');
  requiredString(project.currencyCode, 'project.currencyCode');
  if (project.distanceUnit !== 'miles') throw new Error('Invalid project backup: unsupported distance unit');
  assertMetadata(value, 'project');
  return project;
}

function validateScenarios(values: unknown[], projectId: string): Scenario[] {
  const ids = new Set<string>();
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: scenarios[${index}] must be an object`);
    const scenario = value as unknown as Scenario;
    requiredString(scenario.id, `scenarios[${index}].id`);
    if (ids.has(scenario.id)) throw new Error(`Invalid project backup: duplicate scenario id ${scenario.id}`);
    ids.add(scenario.id);
    if (scenario.projectId !== projectId) throw new Error(`Invalid project backup: scenarios[${index}] references another project`);
    requiredString(scenario.name, `scenarios[${index}].name`);
    assertMetadata(value, `scenarios[${index}]`);
    return scenario;
  });
}

function validateServiceDays(values: unknown[], scenarioIds: Set<string>): ServiceDayDefinition[] {
  const ids = new Set<string>();
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: serviceDays[${index}] must be an object`);
    const day = value as unknown as ServiceDayDefinition;
    requiredString(day.id, `serviceDays[${index}].id`);
    if (ids.has(day.id)) throw new Error(`Invalid project backup: duplicate service day id ${day.id}`);
    ids.add(day.id);
    if (!scenarioIds.has(day.scenarioId)) throw new Error(`Invalid project backup: serviceDays[${index}] references a missing scenario`);
    if (!['weekday', 'saturday', 'sunday', 'holiday', 'custom'].includes(day.kind)) throw new Error(`Invalid project backup: serviceDays[${index}].kind`);
    requiredString(day.name, `serviceDays[${index}].name`);
    if (!Number.isInteger(day.annualServiceDays) || day.annualServiceDays < 0) throw new Error(`Invalid project backup: serviceDays[${index}].annualServiceDays`);
    if (!Number.isInteger(day.sequence) || day.sequence < 0) throw new Error(`Invalid project backup: serviceDays[${index}].sequence`);
    assertMetadata(value, `serviceDays[${index}]`);
    return day;
  });
}

function validateRoutes(values: unknown[], scenarioIds: Set<string>): Route[] {
  const ids = new Set<string>();
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: routes[${index}] must be an object`);
    const route = value as unknown as Route;
    requiredString(route.id, `routes[${index}].id`);
    if (ids.has(route.id)) throw new Error(`Invalid project backup: duplicate route id ${route.id}`);
    ids.add(route.id);
    if (!scenarioIds.has(route.scenarioId)) throw new Error(`Invalid project backup: routes[${index}] references a missing scenario`);
    requiredString(route.name, `routes[${index}].name`);
    assertMetadata(value, `routes[${index}]`);
    return route;
  });
}

function validateNodes(values: unknown[], routes: Map<string, Route>): Node[] {
  const ids = new Set<string>();
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: nodes[${index}] must be an object`);
    const node = value as unknown as Node;
    requiredString(node.id, `nodes[${index}].id`);
    if (ids.has(node.id)) throw new Error(`Invalid project backup: duplicate node id ${node.id}`);
    ids.add(node.id);
    const route = routes.get(node.routeId);
    if (!route || route.scenarioId !== node.scenarioId) throw new Error(`Invalid project backup: nodes[${index}] references an invalid route`);
    requiredString(node.scenarioId, `nodes[${index}].scenarioId`);
    requiredString(node.name, `nodes[${index}].name`);
    if (!['timepoint', 'terminal', 'garage', 'other'].includes(node.kind)) throw new Error(`Invalid project backup: nodes[${index}].kind`);
    assertMetadata(value, `nodes[${index}]`);
    return node;
  });
}

function validateDirections(values: unknown[], routes: Map<string, Route>, nodes: Node[]): RouteDirection[] {
  const ids = new Set<string>();
  const columnIds = new Set<string>();
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: directions[${index}] must be an object`);
    const direction = value as unknown as RouteDirection;
    requiredString(direction.id, `directions[${index}].id`);
    if (ids.has(direction.id)) throw new Error(`Invalid project backup: duplicate direction id ${direction.id}`);
    ids.add(direction.id);
    const route = routes.get(direction.routeId);
    if (!route || route.scenarioId !== direction.scenarioId) throw new Error(`Invalid project backup: directions[${index}] references an invalid route`);
    requiredString(direction.name, `directions[${index}].name`);
    if (!Number.isInteger(direction.sequence) || direction.sequence < 0) throw new Error(`Invalid project backup: directions[${index}].sequence`);
    if (!Array.isArray(direction.columns)) throw new Error(`Invalid project backup: directions[${index}].columns must be an array`);
    assertMetadata(value, `directions[${index}]`);
    for (const column of direction.columns) {
      requiredString(column.id, `directions[${index}].columns.id`);
      if (columnIds.has(column.id)) throw new Error(`Invalid project backup: duplicate direction column id ${column.id}`);
      columnIds.add(column.id);
    }
    const findings = validateDirection(direction, route.id, nodes.filter((node) => node.routeId === route.id));
    if (findings.some((finding) => finding.severity === 'error')) throw new Error(`Invalid project backup: direction ${direction.id} failed validation`);
    return direction;
  });
}

function validatePatterns(values: unknown[], routes: Map<string, Route>, nodes: Node[], directions?: RouteDirection[]): RoutePattern[] {
  const ids = new Set<string>();
  const nodeByRoute = new Map<string, Node[]>();
  for (const node of nodes) nodeByRoute.set(node.routeId, [...(nodeByRoute.get(node.routeId) ?? []), node]);
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: patterns[${index}] must be an object`);
    const pattern = value as unknown as RoutePattern;
    requiredString(pattern.id, `patterns[${index}].id`);
    if (ids.has(pattern.id)) throw new Error(`Invalid project backup: duplicate pattern id ${pattern.id}`);
    ids.add(pattern.id);
    const route = routes.get(pattern.routeId);
    if (!route || route.scenarioId !== pattern.scenarioId) throw new Error(`Invalid project backup: patterns[${index}] references an invalid route`);
    requiredString(pattern.name, `patterns[${index}].name`);
    if (!Array.isArray(pattern.points)) throw new Error(`Invalid project backup: patterns[${index}].points must be an array`);
    assertMetadata(value, `patterns[${index}]`);
    const findings = [...validatePattern(pattern, nodeByRoute.get(pattern.routeId) ?? [])];
    if (directions) findings.push(...validatePatternDirection(pattern, directions.find((direction) => direction.id === pattern.directionId), nodeByRoute.get(pattern.routeId) ?? []));
    if (findings.some((finding) => finding.severity === 'error')) throw new Error(`Invalid project backup: pattern ${pattern.id} failed validation`);
    const pointIds = new Set<string>();
    for (const point of pattern.points as PatternPoint[]) {
      if (pointIds.has(point.id)) throw new Error(`Invalid project backup: duplicate pattern point id ${point.id}`);
      pointIds.add(point.id);
    }
    return pattern;
  });
}

function validateRuntimeProfiles(values: unknown[], patterns: RoutePattern[]): RuntimeProfile[] {
  const profiles = values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: runtimeProfiles[${index}] must be an object`);
    const profile = value as unknown as RuntimeProfile;
    requiredString(profile.id, `runtimeProfiles[${index}].id`);
    requiredString(profile.scenarioId, `runtimeProfiles[${index}].scenarioId`);
    requiredString(profile.routeId, `runtimeProfiles[${index}].routeId`);
    requiredString(profile.patternId, `runtimeProfiles[${index}].patternId`);
    requiredString(profile.name, `runtimeProfiles[${index}].name`);
    if (!Array.isArray(profile.bands)) throw new Error(`Invalid project backup: runtimeProfiles[${index}].bands must be an array`);
    assertMetadata(value, `runtimeProfiles[${index}]`);
    return profile;
  });
  return profiles;
}

function validateRuntimeAssignments(values: unknown[]): RuntimeAssignment[] {
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: runtimeAssignments[${index}] must be an object`);
    const assignment = value as unknown as RuntimeAssignment;
    requiredString(assignment.id, `runtimeAssignments[${index}].id`);
    requiredString(assignment.scenarioId, `runtimeAssignments[${index}].scenarioId`);
    requiredString(assignment.patternId, `runtimeAssignments[${index}].patternId`);
    requiredString(assignment.serviceDayId, `runtimeAssignments[${index}].serviceDayId`);
    requiredString(assignment.runtimeProfileId, `runtimeAssignments[${index}].runtimeProfileId`);
    assertMetadata(value, `runtimeAssignments[${index}]`);
    return assignment;
  });
}

function validateTripProfiles(values: unknown[], scenarioIds: Set<string>): TripProfile[] {
  const ids = new Set<string>();
  const names = new Set<string>();
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: tripProfiles[${index}] must be an object`);
    const profile = value as unknown as TripProfile;
    requiredString(profile.id, `tripProfiles[${index}].id`); requiredString(profile.scenarioId, `tripProfiles[${index}].scenarioId`); requiredString(profile.name, `tripProfiles[${index}].name`); assertMetadata(value, `tripProfiles[${index}]`);
    const nameKey = `${profile.scenarioId}:${profile.name.trim().toLowerCase()}`;
    if (ids.has(profile.id) || !scenarioIds.has(profile.scenarioId)) throw new Error(`Invalid project backup: tripProfiles[${index}] references an invalid scenario or duplicate id`);
    if (names.has(nameKey)) throw new Error(`Invalid project backup: duplicate Trip profile name in scenario ${profile.scenarioId}`);
    ids.add(profile.id); names.add(nameKey); return profile;
  });
}

function validateGenerationSets(values: unknown[], scenarioIds: Set<string>, routes: Map<string, Route>, patterns: RoutePattern[], serviceDays: ServiceDayDefinition[]): TripGenerationSet[] {
  const ids = new Set<string>(); const patternIds = new Set(patterns.map((pattern) => pattern.id)); const dayIds = new Set(serviceDays.map((day) => day.id));
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: generationSets[${index}] must be an object`);
    const set = value as unknown as TripGenerationSet;
    requiredString(set.id, `generationSets[${index}].id`); if (ids.has(set.id)) throw new Error(`Invalid project backup: duplicate generation set id ${set.id}`); ids.add(set.id);
    if (!scenarioIds.has(set.scenarioId) || !routes.has(set.routeId) || !patternIds.has(set.patternId) || !dayIds.has(set.serviceDayId)) throw new Error(`Invalid project backup: generationSets[${index}] references a missing record`);
    requiredString(set.name, `generationSets[${index}].name`); if (!Number.isInteger(set.firstDeparture) || set.firstDeparture < 0 || !Number.isInteger(set.headwaySeconds) || set.headwaySeconds <= 0) throw new Error(`Invalid project backup: generationSets[${index}] has invalid timing`);
    if (set.limit.mode === 'endTime') { if (!Number.isInteger(set.limit.endTime) || set.limit.endTime < set.firstDeparture) throw new Error(`Invalid project backup: generationSets[${index}].limit`); }
    else if (set.limit.mode !== 'tripCount' || !Number.isInteger(set.limit.tripCount) || set.limit.tripCount <= 0) throw new Error(`Invalid project backup: generationSets[${index}].limit`);
    if (!Number.isInteger(set.generationRevision) || set.generationRevision < 0) throw new Error(`Invalid project backup: generationSets[${index}].generationRevision`);
    assertMetadata(value, `generationSets[${index}]`); return set;
  });
}

function validateTrips(values: unknown[], scenarioIds: Set<string>, routes: Map<string, Route>, patterns: RoutePattern[], serviceDays: ServiceDayDefinition[], generationSets: TripGenerationSet[], runtimeProfiles: RuntimeProfile[]): Trip[] {
  const ids = new Set<string>(); const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern])); const setIds = new Set(generationSets.map((set) => set.id)); const profileIds = new Set(runtimeProfiles.map((profile) => profile.id)); const dayIds = new Set(serviceDays.map((day) => day.id));
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: trips[${index}] must be an object`);
    const trip = value as unknown as Trip; requiredString(trip.id, `trips[${index}].id`); if (ids.has(trip.id)) throw new Error(`Invalid project backup: duplicate trip id ${trip.id}`); ids.add(trip.id);
    const pattern = patternById.get(trip.patternId); if (!scenarioIds.has(trip.scenarioId) || !routes.has(trip.routeId) || !pattern || !dayIds.has(trip.serviceDayId)) throw new Error(`Invalid project backup: trips[${index}] references a missing record`);
    if (trip.provenance?.generationSetId && !setIds.has(trip.provenance.generationSetId)) throw new Error(`Invalid project backup: trips[${index}] references a missing generation set`);
    const source = trip.provenance?.calculationSource;
    const sourceProfileId = source?.runtimeProfileId ?? trip.provenance?.runtimeProfileId;
    const sourceRevision = source?.runtimeCalculationRevision ?? trip.provenance?.runtimeCalculationRevision;
    if (sourceProfileId && !profileIds.has(sourceProfileId)) throw new Error(`Invalid project backup: trips[${index}] references a missing runtime profile`);
    const sourceProfile = sourceProfileId ? runtimeProfiles.find((profile) => profile.id === sourceProfileId) : undefined;
    if (sourceProfile && sourceProfile.patternId !== trip.patternId) throw new Error(`Invalid project backup: trips[${index}] runtime profile does not belong to the trip pattern`);
    if (sourceRevision !== undefined && (!Number.isInteger(sourceRevision) || sourceRevision < 0)) throw new Error(`Invalid project backup: trips[${index}] has an invalid runtime calculation revision`);
    if (!Array.isArray(trip.stopTimes) || trip.stopTimes.length !== pattern.points.length) throw new Error(`Invalid project backup: trips[${index}].stopTimes`);
    const pointIds = new Set(pattern.points.map((point) => point.id));
    for (const point of trip.stopTimes) { requiredString(point.patternPointId, `trips[${index}].stopTimes.patternPointId`); if (!pointIds.has(point.patternPointId) || !Number.isInteger(point.sequence) || !Number.isInteger(point.time) || point.time < 0) throw new Error(`Invalid project backup: trips[${index}].stopTimes`); }
    assertMetadata(value, `trips[${index}]`); return trip;
  });
}

function validateBlocks(values: unknown[], scenarioIds: Set<string>, serviceDays: ServiceDayDefinition[], trips: Trip[], blockingScenarios: BlockingScenario[] = []): Block[] {
  const ids = new Set<string>(); const tripIds = new Set(trips.map((trip) => trip.id)); const dayIds = new Set(serviceDays.map((day) => day.id));
  const blockingScenarioById = new Map(blockingScenarios.map((scenario) => [scenario.id, scenario]));
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: blocks[${index}] must be an object`);
    const block = value as unknown as Block; requiredString(block.id, `blocks[${index}].id`); if (ids.has(block.id)) throw new Error(`Invalid project backup: duplicate block id ${block.id}`); ids.add(block.id);
    if (!scenarioIds.has(block.scenarioId) || !dayIds.has(block.serviceDayId)) throw new Error(`Invalid project backup: blocks[${index}] references a missing record`); requiredString(block.label, `blocks[${index}].label`); if (!Array.isArray(block.activities)) throw new Error(`Invalid project backup: blocks[${index}].activities`);
    if (block.blockingScenarioId) {
      const owner = blockingScenarioById.get(block.blockingScenarioId);
      if (!owner || owner.scenarioId !== block.scenarioId) throw new Error(`Invalid project backup: block ${block.id} references an invalid Blocking Scenario`);
      if (block.tripProfileId && block.tripProfileId !== owner.tripProfileId) throw new Error(`Invalid project backup: normalized block ${block.id} duplicates mismatched Trip Profile ownership`);
    }
    for (const activity of block.activities) { if (activity.type === 'revenueTrip' && !tripIds.has(activity.tripId)) throw new Error(`Invalid project backup: block ${block.id} references a missing trip`); }
    assertMetadata(value, `blocks[${index}]`); return block;
  });
}

export function parseProjectBackup(payload: string): ProjectSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('Invalid project backup: malformed JSON');
  }
  if (!isRecord(parsed)) throw new Error('Invalid project backup: root must be an object');
  if (parsed.format !== PROJECT_BACKUP_FORMAT || ![1, 2, 3, 4, 5, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number)) {
    throw new Error('Unsupported project backup format or schema version');
  }
  requiredString(parsed.exportedAt, 'exportedAt');
  const project = validateProject(parsed.project);
  const scenarios = validateScenarios(requiredArray(parsed.scenarios, 'scenarios'), project.id);
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  const serviceDays = validateServiceDays(requiredArray(parsed.serviceDays, 'serviceDays'), scenarioIds);
  const routes = validateRoutes(requiredArray(parsed.routes, 'routes'), scenarioIds);
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const nodes = validateNodes(requiredArray(parsed.nodes, 'nodes'), routeById);
  const directions = parsed.directions === undefined ? undefined : validateDirections(requiredArray(parsed.directions, 'directions'), routeById, nodes);
  const patterns = validatePatterns(requiredArray(parsed.patterns, 'patterns'), routeById, nodes, directions);
  const runtimeProfiles = parsed.exportSchemaVersion === LEGACY_PROJECT_BACKUP_SCHEMA_VERSION
    ? []
    : validateRuntimeProfiles(requiredArray(parsed.runtimeProfiles, 'runtimeProfiles'), patterns);
  const runtimeAssignments = parsed.exportSchemaVersion === LEGACY_PROJECT_BACKUP_SCHEMA_VERSION
    ? []
    : validateRuntimeAssignments(requiredArray(parsed.runtimeAssignments, 'runtimeAssignments'));
  assertRuntimeGraph(runtimeProfiles, runtimeAssignments, patterns, serviceDays);
  // Current authoritative backups omit generationSets. A non-empty collection is
  // still accepted so historical Phase 2 files can be inspected and copied.
  const suppliedTripProfiles = [4, 5, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number) ? validateTripProfiles(requiredArray(parsed.tripProfiles ?? [], 'tripProfiles'), scenarioIds) : [];
  const generationSets = [3, 4, 5, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number)
    ? (parsed.generationSets === undefined ? [] : validateGenerationSets(requiredArray(parsed.generationSets, 'generationSets'), scenarioIds, routeById, patterns, serviceDays))
    : [];
  const trips = [3, 4, 5, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number) ? validateTrips(requiredArray(parsed.trips, 'trips'), scenarioIds, routeById, patterns, serviceDays, generationSets, runtimeProfiles) : [];
  const provisionalTripProfiles = suppliedTripProfiles.length ? suppliedTripProfiles : scenarios.map((scenario) => ({ id: newId(), scenarioId: scenario.id, name: 'Default', ...metadata() }));
  const blockingScenarios = [5, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number)
    ? validateBlockingScenarios(requiredArray(parsed.blockingScenarios ?? [], 'blockingScenarios'), scenarioIds, provisionalTripProfiles)
    : [];
  const costingAssumptions = parsed.exportSchemaVersion === PROJECT_BACKUP_SCHEMA_VERSION
    ? validateCostingAssumptions(requiredArray(parsed.costingAssumptions, 'costingAssumptions'), scenarioIds)
    : [];
  const blocks = [3, 4, 5, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number) ? validateBlocks(requiredArray(parsed.blocks, 'blocks'), scenarioIds, serviceDays, trips, blockingScenarios) : [];
  assertTripProfileReferences(trips, blocks);
  const tripProfiles = provisionalTripProfiles;
  const defaultProfileByScenario = new Map(tripProfiles.map((profile) => [profile.scenarioId, profile.id]));
  const tripProfileById = new Map(tripProfiles.map((profile) => [profile.id, profile]));
  for (const trip of trips) {
    if (trip.tripProfileId) {
      const profile = tripProfileById.get(trip.tripProfileId);
      if (!profile || profile.scenarioId !== trip.scenarioId) throw new Error(`Invalid project backup: trips contains an invalid Trip profile reference`);
    }
  }
  for (const block of blocks) {
    if (block.tripProfileId) {
      const profile = tripProfileById.get(block.tripProfileId);
      if (!profile || profile.scenarioId !== block.scenarioId) throw new Error(`Invalid project backup: blocks contains an invalid Trip profile reference`);
    }
  }
  const normalizedTrips = trips.map((trip) => ({ ...trip, tripProfileId: trip.tripProfileId ?? defaultProfileByScenario.get(trip.scenarioId) }));
  const normalizedBlocks = blocks.map((block) => ({ ...block, tripProfileId: block.tripProfileId ?? defaultProfileByScenario.get(block.scenarioId) }));
  return { project, scenarios, serviceDays, routes, nodes, patterns, ...(directions ? { directions } : {}), runtimeProfiles, runtimeAssignments, tripProfiles, ...(blockingScenarios.length ? { blockingScenarios } : {}), ...(costingAssumptions.length ? { costingAssumptions } : {}), generationSets, trips: normalizedTrips, blocks: normalizedBlocks };
}

export function exportProjectJson(snapshot: ProjectSnapshot, applicationVersion?: string): string {
  const backup: ProjectBackup = {
    format: PROJECT_BACKUP_FORMAT,
    exportSchemaVersion: PROJECT_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...(applicationVersion ? { applicationVersion } : {}),
    project: snapshot.project,
    scenarios: snapshot.scenarios,
    serviceDays: snapshot.serviceDays,
    routes: snapshot.routes,
    nodes: snapshot.nodes,
    patterns: snapshot.patterns,
    ...(snapshot.directions ? { directions: snapshot.directions } : {}),
    runtimeProfiles: snapshot.runtimeProfiles,
    runtimeAssignments: snapshot.runtimeAssignments,
    ...(snapshot.tripProfiles?.length ? { tripProfiles: snapshot.tripProfiles } : {}),
    ...(snapshot.blockingScenarios?.length ? { blockingScenarios: snapshot.blockingScenarios } : {}),
    costingAssumptions: snapshot.costingAssumptions ?? [],
    ...(snapshot.generationSets.length ? { generationSets: snapshot.generationSets } : {}),
    trips: snapshot.trips,
    blocks: snapshot.blocks,
  };
  return JSON.stringify(backup, null, 2);
}

export function importProjectJson(payload: string): ProjectSnapshot {
  return parseProjectBackup(payload);
}

/** Create an import-as-copy graph with fresh identifiers and independent references. */
export function cloneProjectSnapshot(source: ProjectSnapshot, now = new Date().toISOString()): ProjectSnapshot {
  const projectId = newId();
  const scenarioIds = new Map(source.scenarios.map((scenario) => [scenario.id, newId()]));
  const routeIds = new Map(source.routes.map((route) => [route.id, newId()]));
  const nodeIds = new Map(source.nodes.map((node) => [node.id, newId()]));
  const patternIds = new Map(source.patterns.map((pattern) => [pattern.id, newId()]));
  const directionIds = new Map((source.directions ?? []).map((direction) => [direction.id, newId()]));
  const directionColumnIds = new Map((source.directions ?? []).flatMap((direction) => direction.columns.map((column) => [column.id, newId()] as const)));
  const profileIds = new Map(source.runtimeProfiles.map((profile) => [profile.id, newId()]));
  const sourceTripProfiles = source.tripProfiles?.length ? source.tripProfiles : source.scenarios.map((scenario) => ({ id: `legacy-${scenario.id}`, scenarioId: scenario.id, name: 'Default', ...metadata(now) }));
  const tripProfileIds = new Map(sourceTripProfiles.map((profile) => [profile.id, newId()]));
  const blockingScenarioIds = new Map((source.blockingScenarios ?? []).map((scenario) => [scenario.id, newId()]));
  const costingAssumptions = (source.costingAssumptions ?? []).map((assumptions) => ({
    ...assumptions,
    id: newId(),
    scenarioId: scenarioIds.get(assumptions.scenarioId)!,
    ...metadata(now),
  }));

  const project: Project = { ...source.project, id: projectId, name: `${source.project.name} Copy`, ...metadata(now) };
  const scenarios = source.scenarios.map((scenario) => ({ ...scenario, id: scenarioIds.get(scenario.id)!, projectId, sourceScenarioId: scenarioIds.get(scenario.sourceScenarioId ?? ''), ...metadata(now) }));
  const serviceDays = source.serviceDays.map((day) => ({ ...day, id: newId(), scenarioId: scenarioIds.get(day.scenarioId)!, ...metadata(now) }));
  const serviceDayIds = new Map(source.serviceDays.map((day, index) => [day.id, serviceDays[index].id]));
  const routes = source.routes.map((route) => ({ ...route, id: routeIds.get(route.id)!, scenarioId: scenarioIds.get(route.scenarioId)!, ...metadata(now) }));
  const nodes = source.nodes.map((node) => ({ ...node, id: nodeIds.get(node.id)!, scenarioId: scenarioIds.get(node.scenarioId)!, routeId: routeIds.get(node.routeId)!, ...metadata(now) }));
  const directions = (source.directions ?? []).map((direction) => ({
    ...direction,
    id: directionIds.get(direction.id)!,
    scenarioId: scenarioIds.get(direction.scenarioId)!,
    routeId: routeIds.get(direction.routeId)!,
    columns: direction.columns.map((column) => ({ ...column, id: directionColumnIds.get(column.id)! })),
    ...metadata(now),
  }));
  const patterns = source.patterns.map((pattern) => ({
    ...pattern,
    id: patternIds.get(pattern.id)!,
    scenarioId: scenarioIds.get(pattern.scenarioId)!,
    routeId: routeIds.get(pattern.routeId)!,
    directionId: pattern.directionId ? directionIds.get(pattern.directionId) : undefined,
    points: pattern.points.map((point, sequence) => ({ ...point, id: newId(), nodeId: nodeIds.get(point.nodeId)!, sequence, directionColumnId: point.directionColumnId ? directionColumnIds.get(point.directionColumnId) : undefined })),
    ...metadata(now),
  }));
  const runtimeProfiles = source.runtimeProfiles.map((profile) => ({
    ...profile,
    id: profileIds.get(profile.id)!,
    scenarioId: scenarioIds.get(profile.scenarioId)!,
    routeId: routeIds.get(profile.routeId)!,
    patternId: patternIds.get(profile.patternId)!,
    bands: profile.bands.map((band) => ({ ...band, id: newId(), segmentRuntimeSeconds: [...band.segmentRuntimeSeconds] })),
    ...metadata(now),
  }));
  const runtimeAssignments = source.runtimeAssignments.map((assignment) => ({
    ...assignment,
    id: newId(),
    scenarioId: scenarioIds.get(assignment.scenarioId)!,
    patternId: patternIds.get(assignment.patternId)!,
    serviceDayId: serviceDayIds.get(assignment.serviceDayId)!,
    runtimeProfileId: profileIds.get(assignment.runtimeProfileId)!,
    ...metadata(now),
  }));
  const tripProfiles = sourceTripProfiles.map((profile) => ({ ...profile, id: tripProfileIds.get(profile.id)!, scenarioId: scenarioIds.get(profile.scenarioId)!, sourceTripProfileId: profile.id, ...metadata(now) }));
  const generationSetIds = new Map(source.generationSets.map((set) => [set.id, newId()]));
  const tripIds = new Map(source.trips.map((trip) => [trip.id, newId()]));
  const blockIds = new Map(source.blocks.map((block) => [block.id, newId()]));
  const pointIds = new Map<string, string>();
  source.patterns.forEach((pattern, patternIndex) => pattern.points.forEach((point, pointIndex) => pointIds.set(point.id, patterns[patternIndex].points[pointIndex].id)));
  const generationSets = source.generationSets.map((set) => ({ ...set, id: generationSetIds.get(set.id)!, scenarioId: scenarioIds.get(set.scenarioId)!, routeId: routeIds.get(set.routeId)!, serviceDayId: serviceDayIds.get(set.serviceDayId)!, patternId: patternIds.get(set.patternId)!, ...metadata(now) }));
  const trips = source.trips.map((trip) => ({ ...trip, id: tripIds.get(trip.id)!, scenarioId: scenarioIds.get(trip.scenarioId)!, routeId: routeIds.get(trip.routeId)!, serviceDayId: serviceDayIds.get(trip.serviceDayId)!, patternId: patternIds.get(trip.patternId)!, tripProfileId: trip.tripProfileId ? tripProfileIds.get(trip.tripProfileId) : tripProfileIds.get(sourceTripProfiles.find((profile) => profile.scenarioId === trip.scenarioId)?.id ?? ''), stopTimes: trip.stopTimes.map((point) => ({ ...point, patternPointId: pointIds.get(point.patternPointId) ?? point.patternPointId })), provenance: { ...trip.provenance, generationSetId: trip.provenance.generationSetId ? generationSetIds.get(trip.provenance.generationSetId) : undefined, runtimeProfileId: trip.provenance.runtimeProfileId ? profileIds.get(trip.provenance.runtimeProfileId) : undefined, calculationSource: trip.provenance.calculationSource ? { ...trip.provenance.calculationSource, runtimeProfileId: profileIds.get(trip.provenance.calculationSource.runtimeProfileId) ?? trip.provenance.calculationSource.runtimeProfileId } : undefined }, ...metadata(now) }));
  const blockingScenarios = (source.blockingScenarios ?? []).map((scenario) => ({ ...scenario, id: blockingScenarioIds.get(scenario.id)!, scenarioId: scenarioIds.get(scenario.scenarioId)!, tripProfileId: tripProfileIds.get(scenario.tripProfileId)!, ...metadata(now) }));
  const blocks = source.blocks.map((block) => ({ ...block, id: blockIds.get(block.id)!, scenarioId: scenarioIds.get(block.scenarioId)!, serviceDayId: serviceDayIds.get(block.serviceDayId)!, ...(block.blockingScenarioId ? { blockingScenarioId: blockingScenarioIds.get(block.blockingScenarioId) } : {}), tripProfileId: block.tripProfileId ? tripProfileIds.get(block.tripProfileId) : (block.blockingScenarioId ? undefined : tripProfileIds.get(sourceTripProfiles.find((profile) => profile.scenarioId === block.scenarioId)?.id ?? '')), activities: block.activities.map((activity) => {
    const remapped = activity.type === 'revenueTrip' ? { ...activity, tripId: tripIds.get(activity.tripId) ?? activity.tripId } : { ...activity };
    return { ...remapped, id: newId(), ...(('fromNodeId' in remapped && remapped.fromNodeId) ? { fromNodeId: nodeIds.get(remapped.fromNodeId) ?? remapped.fromNodeId } : {}), ...(('toNodeId' in remapped && remapped.toNodeId) ? { toNodeId: nodeIds.get(remapped.toNodeId) ?? remapped.toNodeId } : {}) };
  }), ...metadata(now) }));
  return { project, scenarios, serviceDays, routes, nodes, patterns, ...(source.directions ? { directions } : {}), runtimeProfiles, runtimeAssignments, tripProfiles, ...(blockingScenarios.length ? { blockingScenarios } : {}), costingAssumptions, generationSets, trips, blocks };
}
