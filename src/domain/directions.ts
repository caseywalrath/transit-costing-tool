import type { DirectionTimepointColumn, EntityId, Node, PatternPoint, RouteDirection, RoutePattern, ValidationFinding } from './types';
import { metadata, newId } from './ids';

export type DirectionGroup = 'outbound' | 'inbound';

export const MANAGED_DIRECTION_GROUPS: readonly DirectionGroup[] = ['outbound', 'inbound'];

export function directionGroupName(group: DirectionGroup): string {
  return group === 'outbound' ? 'Outbound' : 'Inbound';
}

export function oppositeDirectionGroup(group: DirectionGroup): DirectionGroup {
  return group === 'outbound' ? 'inbound' : 'outbound';
}

function directionFinding(direction: RouteDirection, ruleId: string, messageKey: string, field?: string, parameters?: Record<string, string | number>): ValidationFinding {
  return {
    ruleId,
    severity: 'error',
    entityType: 'direction',
    entityId: direction.id,
    ...(field ? { field } : {}),
    messageKey,
    ...(parameters ? { parameters } : {}),
  };
}

/** Normalize a direction and its columns without changing stable IDs. */
export function normalizeDirection(direction: RouteDirection): RouteDirection {
  const columns = direction.columns
    .map((column, index) => ({ column, index }))
    .sort((left, right) => left.column.sequence - right.column.sequence || left.column.id.localeCompare(right.column.id) || left.index - right.index)
    .map(({ column }, sequence) => ({ ...column, sequence }));
  return { ...direction, columns };
}

/** Normalize direction order and assign deterministic sequence values. */
export function normalizeDirections(directions: RouteDirection[]): RouteDirection[] {
  return directions
    .map((direction, index) => ({ direction, index }))
    .sort((left, right) => left.direction.sequence - right.direction.sequence || left.direction.id.localeCompare(right.direction.id) || left.index - right.index)
    .map(({ direction }, sequence) => ({ ...normalizeDirection(direction), sequence }));
}

/** Stable direction ordering for queries and timetable presentation. */
export function orderDirections(directions: RouteDirection[]): RouteDirection[] {
  return normalizeDirections(directions).map((direction) => ({ ...direction, columns: direction.columns.map((column) => ({ ...column })) }));
}

/** Stable pattern ordering within one direction. */
export function orderPatterns(patterns: RoutePattern[], directionId?: EntityId): RoutePattern[] {
  return patterns
    .filter((pattern) => directionId === undefined || pattern.directionId === directionId)
    .map((pattern, index) => ({ pattern, index }))
    .sort((left, right) => (left.pattern.sequence ?? left.index) - (right.pattern.sequence ?? right.index) || left.pattern.id.localeCompare(right.pattern.id) || left.index - right.index)
    .map(({ pattern }) => ({ ...pattern }));
}

/** Normalize stable pattern sequence values while preserving relative order. */
export function normalizePatternSequences(patterns: RoutePattern[]): RoutePattern[] {
  const directions = new Map<EntityId | undefined, number>();
  return patterns.map((pattern) => {
    const sequence = directions.get(pattern.directionId) ?? 0;
    directions.set(pattern.directionId, sequence + 1);
    return { ...pattern, sequence };
  });
}

export function createRouteDirection(scenarioId: EntityId, routeId: EntityId, name: string, sequence = 0, now = new Date().toISOString()): RouteDirection {
  if (!name.trim()) throw new Error('Direction name is required');
  return { id: newId(), scenarioId, routeId, name: name.trim(), sequence, columns: [], ...metadata(now) };
}

/** Creates the two route-managed schedule groups with stable IDs. */
export function createManagedDirections(scenarioId: EntityId, routeId: EntityId, now = new Date().toISOString()): RouteDirection[] {
  return MANAGED_DIRECTION_GROUPS.map((group, sequence) => ({
    ...createRouteDirection(scenarioId, routeId, directionGroupName(group), sequence, now),
    group,
  }));
}

/**
 * Normalizes legacy or incomplete route data into the two managed direction
 * groups. Existing first and second groups retain their IDs and columns.
 */
export function ensureManagedDirections(directions: RouteDirection[], scenarioId: EntityId, routeId: EntityId, now = new Date().toISOString()): RouteDirection[] {
  const existing = normalizeDirections(directions);
  const available = [...existing];
  const result: RouteDirection[] = [];
  for (const [sequence, group] of MANAGED_DIRECTION_GROUPS.entries()) {
    const matchedIndex = available.findIndex((direction) => direction.group === group);
    const legacyIndex = matchedIndex >= 0 ? matchedIndex : 0;
    const matched = available.splice(legacyIndex, 1)[0];
    result.push(matched
      ? { ...matched, scenarioId, routeId, name: directionGroupName(group), group, sequence, updatedAt: now }
      : { ...createRouteDirection(scenarioId, routeId, directionGroupName(group), sequence, now), group });
  }
  return result;
}

export function createDirectionColumn(nodeId: EntityId, sequence = 0, labelOverride?: string): DirectionTimepointColumn {
  return { id: newId(), nodeId, sequence, ...(labelOverride?.trim() ? { labelOverride: labelOverride.trim() } : {}) };
}

/**
 * Map pattern points to the direction's columns by node and occurrence. This
 * deliberately uses occurrence position so loops can map repeated visits to
 * distinct stable columns.
 */
export function mapPatternPointsToDirection(pattern: RoutePattern, direction: RouteDirection, now = new Date().toISOString()): { pattern: RoutePattern; direction: RouteDirection } {
  const normalizedDirection = normalizeDirection(direction);
  const columns = [...normalizedDirection.columns];
  const occurrences = new Map<EntityId, number>();
  const plannedColumns = pattern.points.map((point) => {
    const occurrence = occurrences.get(point.nodeId) ?? 0;
    occurrences.set(point.nodeId, occurrence + 1);
    const explicitlyMapped = point.directionColumnId ? columns.find((column) => column.id === point.directionColumnId && column.nodeId === point.nodeId) : undefined;
    const existing = explicitlyMapped ?? columns.filter((column) => column.nodeId === point.nodeId)[occurrence];
    return existing;
  });
  const knownIndexes = plannedColumns.map((column) => column ? columns.findIndex((candidate) => candidate.id === column.id) : undefined);
  for (let index = 1; index < knownIndexes.length; index += 1) {
    if (knownIndexes[index - 1] !== undefined && knownIndexes[index] !== undefined && knownIndexes[index - 1]! >= knownIndexes[index]!) {
      throw new Error('This pattern conflicts with the existing timetable order for its direction.');
    }
  }
  const points: PatternPoint[] = pattern.points.map((point, sequence) => {
    let column = plannedColumns[sequence];
    if (!column) {
      const previous = plannedColumns.slice(0, sequence).reverse().find((candidate): candidate is DirectionTimepointColumn => Boolean(candidate));
      const next = plannedColumns.slice(sequence + 1).find((candidate): candidate is DirectionTimepointColumn => Boolean(candidate));
      const previousIndex = previous ? columns.findIndex((candidate) => candidate.id === previous.id) : -1;
      const nextIndex = next ? columns.findIndex((candidate) => candidate.id === next.id) : -1;
      const insertionIndex = previousIndex >= 0 ? previousIndex + 1 : nextIndex >= 0 ? nextIndex : columns.length;
      column = createDirectionColumn(point.nodeId, insertionIndex);
      columns.splice(insertionIndex, 0, column);
      plannedColumns[sequence] = column;
    }
    return { ...point, sequence, directionColumnId: column.id };
  });
  return {
    pattern: { ...pattern, points, updatedAt: now },
    direction: { ...normalizedDirection, columns: columns.map((column, sequence) => ({ ...column, sequence })), updatedAt: now },
  };
}

/** Validate a direction and all of its route-owned column references. */
export function validateDirection(direction: RouteDirection, routeId: EntityId, nodes: Node[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const columnIds = new Set<string>();
  if (!direction.name.trim()) findings.push(directionFinding(direction, 'direction.nameRequired', 'direction.nameRequired', 'name'));
  if (direction.routeId !== routeId) findings.push(directionFinding(direction, 'direction.routeMismatch', 'direction.routeMismatch', 'routeId'));
  if (!Number.isInteger(direction.sequence) || direction.sequence < 0) findings.push(directionFinding(direction, 'direction.sequenceInvalid', 'direction.sequenceInvalid', 'sequence'));
  direction.columns.forEach((column, index) => {
    if (columnIds.has(column.id)) findings.push(directionFinding(direction, 'direction.duplicateColumnId', 'direction.duplicateColumnId', 'columns', { sequence: index }));
    columnIds.add(column.id);
    const node = nodeById.get(column.nodeId);
    if (!node || node.routeId !== routeId) findings.push(directionFinding(direction, 'direction.columnNodeMissing', 'direction.columnNodeMissing', 'columns', { sequence: index }));
    if (!Number.isInteger(column.sequence) || column.sequence < 0) findings.push(directionFinding(direction, 'direction.columnSequenceInvalid', 'direction.columnSequenceInvalid', 'columns', { sequence: index }));
  });
  return findings;
}

/** Validate pattern ownership and its optional directional timetable mappings. */
export function validatePatternDirection(pattern: RoutePattern, direction: RouteDirection | undefined, nodes: Node[]): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const patternFinding = (ruleId: string, messageKey: string, field?: string, parameters?: Record<string, string | number>): ValidationFinding => ({ ruleId, severity: 'error', entityType: 'pattern', entityId: pattern.id, ...(field ? { field } : {}), messageKey, ...(parameters ? { parameters } : {}) });
  if (!direction) {
    findings.push(patternFinding('pattern.directionRequired', 'pattern.directionRequired', 'directionId'));
    return findings;
  }
  if (direction.routeId !== pattern.routeId || direction.scenarioId !== pattern.scenarioId) findings.push(patternFinding('pattern.directionOwnershipMismatch', 'pattern.directionOwnershipMismatch', 'directionId'));
  if (pattern.directionId !== direction.id) findings.push(patternFinding('pattern.directionMismatch', 'pattern.directionMismatch', 'directionId'));
  const columns = new Map(direction.columns.map((column) => [column.id, column]));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const mapped = new Set<string>();
  for (const [index, point] of pattern.points.entries()) {
    if (!nodeIds.has(point.nodeId)) continue;
    if (!point.directionColumnId) {
      findings.push(patternFinding('pattern.directionColumnRequired', 'pattern.directionColumnRequired', 'points', { sequence: index }));
      continue;
    }
    const column = columns.get(point.directionColumnId);
    if (!column) {
      findings.push(patternFinding('pattern.directionColumnMissing', 'pattern.directionColumnMissing', 'points', { sequence: index }));
    } else {
      if (column.nodeId !== point.nodeId) findings.push(patternFinding('pattern.directionColumnNodeMismatch', 'pattern.directionColumnNodeMismatch', 'points', { sequence: index }));
      if (mapped.has(column.id)) findings.push(patternFinding('pattern.duplicateDirectionColumnMapping', 'pattern.duplicateDirectionColumnMapping', 'points', { sequence: index }));
      mapped.add(column.id);
    }
  }
  return findings;
}
