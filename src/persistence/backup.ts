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
  BlockingBlock,
  CostingAssumptions,
  ValidationFinding,
} from '../domain/types';
import { metadata, newId } from '../domain/ids';
import { validatePattern } from '../domain/patterns';
import { validateDirection, validatePatternDirection } from '../domain/directions';
import { assertRuntimeGraph } from './runtimePersistence';
import { assertTripProfileReferences } from '../domain/trips';
import { validateBlockingAssignments, validateBlockingBlock } from '../domain/blocking';
import { MAX_COSTING_FUTURE_YEARS, MAX_COSTING_YEAR, MIN_COSTING_YEAR, validatePersistedCostingAssumptions } from '../domain/costing';
import { recoverScenarioCopyNodeReferences } from '../domain/scenarioCopyRecovery';
import { unifyRouteRuntimeCalculationMethods } from '../domain/runtime';

export const PROJECT_BACKUP_FORMAT = 'transit-costing-tool.project' as const;
export const PROJECT_BACKUP_SCHEMA_VERSION = 7 as const;
export const LEGACY_PROJECT_BACKUP_SCHEMA_VERSION = 1 as const;

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

/** Decision 0051: the typed estimate factors of a Scenario's Costing assumptions (backup version 7). */
function validateEstimateFactors(value: unknown, path: string, scenarioId: string, serviceDays: ServiceDayDefinition[]): void {
  const fail = (problem: string): never => { throw new Error(`Invalid project backup: ${path} ${problem}`); };
  if (!isRecord(value)) return fail('must be an object');
  const checkFraction = (fraction: unknown, field: string) => {
    if (fraction !== undefined && (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction >= 1)) fail(`${field} must be a number from 0 up to but not including 1`);
  };
  if (!isRecord(value.allDays)) return fail('allDays must be an object');
  checkFraction(value.allDays.layoverFraction, 'allDays.layoverFraction');
  checkFraction(value.allDays.deadheadFraction, 'allDays.deadheadFraction');
  if (!Array.isArray(value.serviceDays)) return fail('serviceDays must be an array');
  const ownDays = new Set(serviceDays.filter((day) => day.scenarioId === scenarioId).map((day) => day.id));
  const seen = new Set<string>();
  value.serviceDays.forEach((row: unknown, rowIndex) => {
    if (!isRecord(row)) return fail(`serviceDays[${rowIndex}] must be an object`);
    if (typeof row.serviceDayId !== 'string' || !row.serviceDayId.trim()) return fail(`serviceDays[${rowIndex}].serviceDayId must be a non-empty string`);
    if (!ownDays.has(row.serviceDayId)) return fail(`serviceDays[${rowIndex}].serviceDayId names a service day that is not in this Scenario`);
    if (seen.has(row.serviceDayId)) return fail(`serviceDays[${rowIndex}] repeats service day ${row.serviceDayId}`);
    seen.add(row.serviceDayId);
    checkFraction(row.layoverFraction, `serviceDays[${rowIndex}].layoverFraction`);
    checkFraction(row.deadheadFraction, `serviceDays[${rowIndex}].deadheadFraction`);
  });
}

function validateCostingAssumptions(values: unknown[], scenarioIds: Set<string>, serviceDays: ServiceDayDefinition[]): CostingAssumptions[] {
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
    if (assumptions.estimateFactors !== undefined) validateEstimateFactors(assumptions.estimateFactors, `costingAssumptions[${index}].estimateFactors`, assumptions.scenarioId, serviceDays);
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

/** What parsing a backup repaired or could not repair. Parsing never rejects a file for it. Presenting it to the planner is the data-safety package (U02). */
export interface BackupImportReport {
  /** Pull-out, deadhead, and pull-in Node references of Scenario copies that were repointed to the copy's own Nodes. */
  recoveredNodeReferences: number;
  /** One finding per Node reference of a Scenario copy that could not be repaired, naming the Block. */
  recoveryFindings: ValidationFinding[];
  /** Pre-Phase-4 placeholder Blocks (no Blocking Scenario) that were left out of the import (Decision 0019 item 13). */
  discardedPlaceholderBlocks: number;
  /** Runtime profiles whose calculation method was changed to the method of their Route (Decision 0045). */
  unifiedRuntimeProfiles: number;
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

/** Recover columns from copies created before import-as-copy remapped their node references. */
function recoverCopiedDirectionColumnNodeReferences(values: unknown[], patterns: unknown[], routes: Map<string, Route>, nodes: Node[]): unknown[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return values.map((value) => {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.routeId !== 'string' || typeof value.scenarioId !== 'string' || !Array.isArray(value.columns)) return value;
    const route = routes.get(value.routeId);
    if (!route || route.scenarioId !== value.scenarioId) return value;
    const patternReferences = patterns.flatMap((patternValue) => {
      if (!isRecord(patternValue) || patternValue.directionId !== value.id || patternValue.routeId !== value.routeId || patternValue.scenarioId !== value.scenarioId || !Array.isArray(patternValue.points)) return [];
      return patternValue.points.filter(isRecord);
    });
    const columns = value.columns.map((columnValue) => {
      if (!isRecord(columnValue) || typeof columnValue.id !== 'string' || typeof columnValue.nodeId !== 'string') return columnValue;
      const currentNode = nodeById.get(columnValue.nodeId);
      if (currentNode?.routeId === route.id && currentNode.scenarioId === route.scenarioId) return columnValue;

      // A column is recoverable only when mapped pattern points identify one valid route node.
      const candidateNodeIds = new Set(patternReferences
        .filter((point) => point.directionColumnId === columnValue.id && typeof point.nodeId === 'string')
        .map((point) => point.nodeId as string)
        .filter((nodeId) => {
          const node = nodeById.get(nodeId);
          return node?.routeId === route.id && node.scenarioId === route.scenarioId;
        }));
      if (candidateNodeIds.size !== 1) return columnValue;
      return { ...columnValue, nodeId: candidateNodeIds.values().next().value };
    });
    return { ...value, columns };
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
    if (!isRecord(set.limit)) throw new Error(`Invalid project backup: generationSets[${index}].limit must be an object`);
    requiredString(set.name, `generationSets[${index}].name`); if (!Number.isInteger(set.firstDeparture) || set.firstDeparture < 0 || !Number.isInteger(set.headwaySeconds) || set.headwaySeconds <= 0) throw new Error(`Invalid project backup: generationSets[${index}] has invalid timing`);
    if (set.limit.mode === 'endTime') { if (!Number.isInteger(set.limit.endTime) || set.limit.endTime < set.firstDeparture) throw new Error(`Invalid project backup: generationSets[${index}].limit`); }
    else if (set.limit.mode !== 'tripCount' || !Number.isInteger(set.limit.tripCount) || set.limit.tripCount <= 0) throw new Error(`Invalid project backup: generationSets[${index}].limit`);
    if (!Number.isInteger(set.generationRevision) || set.generationRevision < 0) throw new Error(`Invalid project backup: generationSets[${index}].generationRevision`);
    assertMetadata(value, `generationSets[${index}]`); return set;
  });
}

function validateTrips(values: unknown[], scenarioIds: Set<string>, routes: Map<string, Route>, patterns: RoutePattern[], serviceDays: ServiceDayDefinition[], generationSets: TripGenerationSet[], runtimeProfiles: RuntimeProfile[]): Trip[] {
  const ids = new Set<string>(); const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern])); const setIds = new Set(generationSets.map((set) => set.id)); const profileIds = new Set(runtimeProfiles.map((profile) => profile.id)); const dayIds = new Set(serviceDays.map((day) => day.id));
  const dayScenario = new Map(serviceDays.map((day) => [day.id, day.scenarioId]));
  return values.map((value, index) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: trips[${index}] must be an object`);
    const trip = value as unknown as Trip; requiredString(trip.id, `trips[${index}].id`); if (ids.has(trip.id)) throw new Error(`Invalid project backup: duplicate trip id ${trip.id}`); ids.add(trip.id);
    const pattern = patternById.get(trip.patternId); if (!scenarioIds.has(trip.scenarioId) || !routes.has(trip.routeId) || !pattern || !dayIds.has(trip.serviceDayId)) throw new Error(`Invalid project backup: trips[${index}] references a missing record`);
    if (routes.get(trip.routeId)!.scenarioId !== trip.scenarioId || pattern.scenarioId !== trip.scenarioId || pattern.routeId !== trip.routeId || dayScenario.get(trip.serviceDayId) !== trip.scenarioId) throw new Error(`Invalid project backup: trips[${index}] references a Route, Pattern, or service day from another Scenario`);
    if (!isRecord(trip.provenance)) throw new Error(`Invalid project backup: trips[${index}].provenance must be an object`);
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
    if (new Set(trip.stopTimes.map((point) => point.patternPointId)).size !== trip.stopTimes.length) throw new Error(`Invalid project backup: trips[${index}].stopTimes repeats a Pattern point`);
    assertMetadata(value, `trips[${index}]`); return trip;
  });
}

const ACTIVITY_TYPES = ['pullOut', 'revenueTrip', 'deadhead', 'pullIn'];
const ACTIVITY_NUMBER_FIELDS = ['startTime', 'endTime', 'minutesBeforeFirstTrip', 'minutesAfterLastTrip', 'minutesAfterPreviousTrip', 'miles'];

/** A Block without a Blocking Scenario is a pre-Phase-4 placeholder; Decision 0019 item 13 discards it on import. A malformed value is not "absent": the Block is kept so validation rejects it. */
function isPlaceholderBlock(value: unknown): boolean {
  return isRecord(value) && (value.blockingScenarioId === undefined || value.blockingScenarioId === null || value.blockingScenarioId === '');
}

/** Checks the shape of one Block's activities, so the later checks can rely on it. */
function validateActivityShapes(block: Block, index: number): void {
  const ids = new Set<string>();
  block.activities.forEach((value, position) => {
    const where = `blocks[${index}].activities[${position}]`;
    if (!isRecord(value)) throw new Error(`Invalid project backup: ${where} must be an object`);
    const id = requiredString(value.id, `${where}.id`);
    if (ids.has(id)) throw new Error(`Invalid project backup: block "${block.label}" repeats activity id ${id}`);
    ids.add(id);
    if (typeof value.type !== 'string' || !ACTIVITY_TYPES.includes(value.type)) throw new Error(`Invalid project backup: ${where}.type is not a supported activity type`);
    if (!Number.isInteger(value.sequence) || (value.sequence as number) < 0) throw new Error(`Invalid project backup: ${where}.sequence must be a whole number`);
    if (value.type === 'revenueTrip') { requiredString(value.tripId, `${where}.tripId`); return; }
    const required = value.type === 'deadhead' ? ['fromNodeId', 'toNodeId'] : value.type === 'pullOut' ? ['toNodeId'] : ['fromNodeId'];
    for (const field of required) requiredString(value[field], `${where}.${field}`);
    for (const field of ['fromNodeId', 'toNodeId']) if (value[field] !== undefined && typeof value[field] !== 'string') throw new Error(`Invalid project backup: ${where}.${field} must be text`);
    for (const field of ACTIVITY_NUMBER_FIELDS) if (value[field] !== undefined && (typeof value[field] !== 'number' || !Number.isFinite(value[field]))) throw new Error(`Invalid project backup: ${where}.${field} must be a number`);
  });
}

/**
 * The refusal for a file that gives two Blocks of one Blocking Scenario the same label on one service day (Decision 0039). It says what is
 * wrong, how many labels repeat in the whole file, that nothing was imported, and the way out: the file is not repaired on import, so the
 * planner renames the repeated labels where the file was exported, exports again, and imports the new file (user decision, 2026-10-23).
 */
function repeatedBlockLabelsMessage(blockingScenarioName: string, label: string, serviceDayId: string, entries: Array<{ value: unknown; index: number }>, serviceDays: ServiceDayDefinition[]): string {
  const seen = new Set<string>(); const repeated = new Set<string>();
  for (const { value } of entries) {
    if (!isRecord(value) || typeof value.label !== 'string' || typeof value.blockingScenarioId !== 'string' || typeof value.serviceDayId !== 'string') continue;
    const key = `${value.blockingScenarioId}\u0000${value.serviceDayId}\u0000${value.label.trim()}`;
    if (seen.has(key)) repeated.add(key); else seen.add(key);
  }
  const others = Math.max(0, repeated.size - 1);
  const day = serviceDays.find((item) => item.id === serviceDayId)?.name ?? 'the same service day';
  return `Invalid project backup: Blocking Scenario "${blockingScenarioName}" has more than one Block labeled "${label}" on ${day}${others ? `, and ${others} other label${others === 1 ? '' : 's'} repeat${others === 1 ? 's' : ''} in this file` : ''}. Block labels must be different on each service day. Nothing was imported. Rename the repeated label${others ? 's' : ''} in the project where this file was exported, export it again, and import the new file.`;
}

/** `entries` carry each Block's position in the file, so a message names the right `blocks[n]` after placeholders are removed. */
function validateBlocks(entries: Array<{ value: unknown; index: number }>, scenarioIds: Set<string>, serviceDays: ServiceDayDefinition[], trips: Trip[], blockingScenarios: BlockingScenario[] = []): Block[] {
  const ids = new Set<string>(); const tripIds = new Set(trips.map((trip) => trip.id)); const dayIds = new Set(serviceDays.map((day) => day.id));
  const dayScenario = new Map(serviceDays.map((day) => [day.id, day.scenarioId]));
  const labels = new Set<string>();
  const blockingScenarioById = new Map(blockingScenarios.map((scenario) => [scenario.id, scenario]));
  return entries.map(({ value, index }) => {
    if (!isRecord(value)) throw new Error(`Invalid project backup: blocks[${index}] must be an object`);
    const block = value as unknown as Block; requiredString(block.id, `blocks[${index}].id`); if (ids.has(block.id)) throw new Error(`Invalid project backup: duplicate block id ${block.id}`); ids.add(block.id);
    if (!scenarioIds.has(block.scenarioId) || !dayIds.has(block.serviceDayId)) throw new Error(`Invalid project backup: blocks[${index}] references a missing record`); requiredString(block.label, `blocks[${index}].label`); if (!Array.isArray(block.activities)) throw new Error(`Invalid project backup: blocks[${index}].activities`);
    if (dayScenario.get(block.serviceDayId) !== block.scenarioId) throw new Error(`Invalid project backup: blocks[${index}] references a service day from another Scenario`);
    const owner = blockingScenarioById.get(block.blockingScenarioId as string);
    if (!owner || owner.scenarioId !== block.scenarioId) throw new Error(`Invalid project backup: block ${block.id} references an invalid Blocking Scenario`);
    // A normalized Block stores no Trip Profile of its own (Decision 0019 item 9). An older export may carry the one its Blocking Scenario has.
    if (block.tripProfileId && block.tripProfileId !== owner.tripProfileId) throw new Error(`Invalid project backup: normalized block ${block.id} duplicates mismatched Trip Profile ownership`);
    const labelKey = `${owner.id}\u0000${block.serviceDayId}\u0000${block.label.trim()}`;
    if (labels.has(labelKey)) throw new Error(repeatedBlockLabelsMessage(owner.name, block.label, block.serviceDayId, entries, serviceDays));
    labels.add(labelKey);
    validateActivityShapes(block, index);
    for (const activity of block.activities) { if (activity.type === 'revenueTrip' && !tripIds.has(activity.tripId)) throw new Error(`Invalid project backup: block ${block.id} references a missing trip`); }
    assertMetadata(value, `blocks[${index}]`); return block;
  });
}

const BLOCK_PROBLEMS: Record<string, string> = {
  'block.missingTrip': 'it references a Trip that is not in the file',
  'block.tripContextMismatch': 'it contains a Trip from another Scenario or service day',
  'block.tripProfileMismatch': 'it contains a Trip from a different Trip Profile than its Blocking Scenario',
  'block.missingPattern': 'a Trip in it has a Pattern that is not in the file',
  'block.multiplePullOut': 'it has more than one pull-out',
  'block.multiplePullIn': 'it has more than one pull-in',
  'block.pullOutMustBeFirst': 'its pull-out is not the first activity',
  'block.pullInMustBeLast': 'its pull-in is not the last activity',
  'block.multipleDeadheads': 'it has more than one deadhead between two Trips',
  'block.deadheadPlacement': 'a deadhead is not between two Trips',
  'block.invalidActivityTime': 'a deadhead has an invalid time',
  'block.invalidBoundaryTiming': 'a pull-out or pull-in has an invalid time',
  'block.invalidMiles': 'an activity has invalid miles',
  'block.deadheadNodesRequired': 'a deadhead is missing a Node',
  'block.pullOutNodeRequired': 'its pull-out is missing a Node',
  'block.pullInNodeRequired': 'its pull-in is missing a Node',
};

/** Checks that need the recovered Node references and the normalized Trips: Node ownership, Trip ownership, and the Blocking rules. */
function validateBlockContents(blocks: Block[], trips: Trip[], patterns: RoutePattern[], nodes: Node[], blockingScenarios: BlockingScenario[], reported: ReadonlySet<string>): void {
  const nodeScenario = new Map(nodes.map((node) => [node.id, node.scenarioId]));
  const tripById = new Map(trips.map((trip) => [trip.id, trip]));
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  const ownerById = new Map(blockingScenarios.map((scenario) => [scenario.id, scenario]));
  for (const block of blocks) {
    for (const activity of block.activities) {
      if (activity.type === 'revenueTrip') continue;
      for (const end of ['fromNodeId', 'toNodeId'] as const) {
        const nodeId = (activity as { fromNodeId?: string; toNodeId?: string })[end];
        // A reference of a Scenario copy that recovery could not repair is reported to the planner instead (Decision 0038); the file still imports.
        if (nodeId && nodeScenario.get(nodeId) !== block.scenarioId && !reported.has(`${block.id}\u0000${activity.id}\u0000${end}`)) throw new Error(`Invalid project backup: block "${block.label}" has a ${activity.type === 'pullOut' ? 'pull-out' : activity.type === 'pullIn' ? 'pull-in' : 'deadhead'} that references a Node that is not in its Scenario`);
      }
    }
  }
  for (const owner of blockingScenarios) {
    const assignments = validateBlockingAssignments(owner, blocks as BlockingBlock[], tripById).find((found) => found.severity === 'error');
    if (assignments) {
      const block = blocks.find((candidate) => candidate.id === assignments.entityId);
      throw new Error(`Invalid project backup: block "${block?.label ?? assignments.entityId}" assigns a Trip that is already assigned in Blocking Scenario "${owner.name}"`);
    }
  }
  for (const block of blocks) {
    const owner = ownerById.get(block.blockingScenarioId as string);
    // The sequence numbers of activities are renumbered by the next edit, so an older export that left gaps still imports.
    const problem = validateBlockingBlock(block as BlockingBlock, { scenario: { id: block.scenarioId }, blockingScenario: owner, trips: tripById, patterns: patternById })
      .find((found) => found.category === 'structural' && found.ruleId !== 'block.sequence');
    if (problem) throw new Error(`Invalid project backup: block "${block.label}" is not valid because ${BLOCK_PROBLEMS[problem.messageKey] ?? problem.messageKey}`);
  }
}

export function parseProjectBackup(payload: string): ProjectSnapshot {
  return parseProjectBackupWithReport(payload).snapshot;
}

/** Parses and validates a backup. Whatever is wrong with the file, the error is one a planner can read; no write has happened yet. */
export function parseProjectBackupWithReport(payload: string): { snapshot: ProjectSnapshot; report: BackupImportReport } {
  try {
    return parseValidatedBackup(payload);
  } catch (error) {
    // A field of the wrong type that no check above names would otherwise surface as a raw runtime error.
    if (error instanceof TypeError || error instanceof RangeError) {
      console.error('Backup import failed on unexpected data.', error);
      throw new Error('Invalid project backup: the file contains data in an unexpected form', { cause: error });
    }
    throw error;
  }
}

function parseValidatedBackup(payload: string): { snapshot: ProjectSnapshot; report: BackupImportReport } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('Invalid project backup: malformed JSON');
  }
  if (!isRecord(parsed)) throw new Error('Invalid project backup: root must be an object');
  if (parsed.format !== PROJECT_BACKUP_FORMAT || ![1, 2, 3, 4, 5, 6, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number)) {
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
  const rawPatterns = requiredArray(parsed.patterns, 'patterns');
  const directions = parsed.directions === undefined ? undefined : validateDirections(
    recoverCopiedDirectionColumnNodeReferences(requiredArray(parsed.directions, 'directions'), rawPatterns, routeById, nodes),
    routeById,
    nodes,
  );
  const patterns = validatePatterns(rawPatterns, routeById, nodes, directions);
  // Every Runtime profile of a Route uses one calculation method (Decision 0045). A file with mixed methods on a Route takes the method
  // most of that Route's profiles use; the profiles that change get the next calculation revision, and their Trips keep their times.
  const unifiedRuntime = unifyRouteRuntimeCalculationMethods(parsed.exportSchemaVersion === LEGACY_PROJECT_BACKUP_SCHEMA_VERSION
    ? []
    : validateRuntimeProfiles(requiredArray(parsed.runtimeProfiles, 'runtimeProfiles'), patterns), new Date().toISOString());
  const runtimeProfiles = unifiedRuntime.profiles;
  const runtimeAssignments = parsed.exportSchemaVersion === LEGACY_PROJECT_BACKUP_SCHEMA_VERSION
    ? []
    : validateRuntimeAssignments(requiredArray(parsed.runtimeAssignments, 'runtimeAssignments'));
  assertRuntimeGraph(runtimeProfiles, runtimeAssignments, patterns, serviceDays);
  // Current authoritative backups omit generationSets. A non-empty collection is
  // still accepted so historical Phase 2 files can be inspected and copied.
  const suppliedTripProfiles = [4, 5, 6, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number) ? validateTripProfiles(requiredArray(parsed.tripProfiles ?? [], 'tripProfiles'), scenarioIds) : [];
  const generationSets = [3, 4, 5, 6, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number)
    ? (parsed.generationSets === undefined ? [] : validateGenerationSets(requiredArray(parsed.generationSets, 'generationSets'), scenarioIds, routeById, patterns, serviceDays))
    : [];
  const trips = [3, 4, 5, 6, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number) ? validateTrips(requiredArray(parsed.trips, 'trips'), scenarioIds, routeById, patterns, serviceDays, generationSets, runtimeProfiles) : [];
  const provisionalTripProfiles = suppliedTripProfiles.length ? suppliedTripProfiles : scenarios.map((scenario) => ({ id: newId(), scenarioId: scenario.id, name: 'Default', ...metadata() }));
  const blockingScenarios = [5, 6, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number)
    ? validateBlockingScenarios(requiredArray(parsed.blockingScenarios ?? [], 'blockingScenarios'), scenarioIds, provisionalTripProfiles)
    : [];
  const costingAssumptions = [6, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number)
    ? validateCostingAssumptions(requiredArray(parsed.costingAssumptions, 'costingAssumptions'), scenarioIds, serviceDays)
    : [];
  // Blocks without a Blocking Scenario are pre-Phase-4 placeholders (version 3 and 4 files hold only those). They are discarded and counted.
  const blockValues = [3, 4, 5, 6, PROJECT_BACKUP_SCHEMA_VERSION].includes(parsed.exportSchemaVersion as number) ? requiredArray(parsed.blocks, 'blocks') : [];
  const keptBlockEntries = blockValues.map((value, index) => ({ value, index })).filter((entry) => !isPlaceholderBlock(entry.value));
  const validatedBlocks = validateBlocks(keptBlockEntries, scenarioIds, serviceDays, trips, blockingScenarios);
  // Files exported after a Scenario was duplicated by the older code name the source Scenario's Nodes in the copy's Blocks (Decision 0038).
  const recovery = recoverScenarioCopyNodeReferences({ scenarios, routes, nodes, patterns, trips, blocks: validatedBlocks });
  const blocks = recovery.blocks;
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
  const reportedReferences = new Set(recovery.findings.map((found) => `${found.entityId}\u0000${found.parameters?.activityId}\u0000${found.parameters?.end === 'from' ? 'fromNodeId' : 'toNodeId'}`));
  validateBlockContents(blocks, normalizedTrips, patterns, nodes, blockingScenarios, reportedReferences);
  // A normalized Block stores no Trip Profile of its own; it follows from its Blocking Scenario (Decision 0019 item 9).
  const normalizedBlocks = blocks.map(({ tripProfileId: _derivedFromBlockingScenario, ...block }) => block);
  return {
    snapshot: { project, scenarios, serviceDays, routes, nodes, patterns, ...(directions ? { directions } : {}), runtimeProfiles, runtimeAssignments, tripProfiles, ...(blockingScenarios.length ? { blockingScenarios } : {}), ...(costingAssumptions.length ? { costingAssumptions } : {}), generationSets, trips: normalizedTrips, blocks: normalizedBlocks },
    report: { recoveredNodeReferences: recovery.recoveredReferences, recoveryFindings: recovery.findings, discardedPlaceholderBlocks: blockValues.length - keptBlockEntries.length, unifiedRuntimeProfiles: unifiedRuntime.changedProfileIds.length },
  };
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
  const serviceDays = source.serviceDays.map((day) => ({ ...day, id: newId(), scenarioId: scenarioIds.get(day.scenarioId)!, ...metadata(now) }));
  const serviceDayIds = new Map(source.serviceDays.map((day, index) => [day.id, serviceDays[index].id]));
  const costingAssumptions = (source.costingAssumptions ?? []).map((assumptions) => ({
    ...assumptions,
    id: newId(),
    scenarioId: scenarioIds.get(assumptions.scenarioId)!,
    // The typed estimate factors name service days, which get new identifiers in the copy (Decision 0051).
    ...(assumptions.estimateFactors ? { estimateFactors: { ...assumptions.estimateFactors, serviceDays: assumptions.estimateFactors.serviceDays.map((row) => ({ ...row, serviceDayId: serviceDayIds.get(row.serviceDayId) ?? row.serviceDayId })) } } : {}),
    ...metadata(now),
  }));

  const project: Project = { ...source.project, id: projectId, name: `${source.project.name} Copy`, ...metadata(now) };
  const scenarios = source.scenarios.map((scenario) => ({ ...scenario, id: scenarioIds.get(scenario.id)!, projectId, sourceScenarioId: scenarioIds.get(scenario.sourceScenarioId ?? ''), ...metadata(now) }));
  const routes = source.routes.map((route) => ({ ...route, id: routeIds.get(route.id)!, scenarioId: scenarioIds.get(route.scenarioId)!, ...metadata(now) }));
  const nodes = source.nodes.map((node) => ({ ...node, id: nodeIds.get(node.id)!, scenarioId: scenarioIds.get(node.scenarioId)!, routeId: routeIds.get(node.routeId)!, ...metadata(now) }));
  const directions = (source.directions ?? []).map((direction) => ({
    ...direction,
    id: directionIds.get(direction.id)!,
    scenarioId: scenarioIds.get(direction.scenarioId)!,
    routeId: routeIds.get(direction.routeId)!,
    columns: direction.columns.map((column) => ({
      ...column,
      id: directionColumnIds.get(column.id)!,
      nodeId: nodeIds.get(column.nodeId) ?? column.nodeId,
    })),
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
