import type { Block, Node, Route, RouteDefinitionAggregate, RoutePattern, Trip, ValidationFinding } from './types';
import { validatePattern } from './patterns';
import { validateDirection, validatePatternDirection } from './directions';

export function validateRoute(route: Route): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!route.name.trim()) findings.push({ ruleId: 'route.nameRequired', severity: 'error', entityType: 'route', entityId: route.id, field: 'name', messageKey: 'route.nameRequired' });
  if (!route.scenarioId.trim()) findings.push({ ruleId: 'route.scenarioRequired', severity: 'error', entityType: 'route', entityId: route.id, field: 'scenarioId', messageKey: 'route.scenarioRequired' });
  return findings;
}

export function validateNode(node: Node, route?: Route): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  if (!node.name.trim()) findings.push({ ruleId: 'node.nameRequired', severity: 'error', entityType: 'node', entityId: node.id, field: 'name', messageKey: 'node.nameRequired' });
  if (!node.scenarioId.trim() || (route && route.scenarioId !== node.scenarioId)) findings.push({ ruleId: 'node.scenarioRequired', severity: 'error', entityType: 'node', entityId: node.id, field: 'scenarioId', messageKey: 'node.scenarioRequired' });
  if (!node.routeId.trim() || (route && route.id !== node.routeId)) findings.push({ ruleId: 'node.routeRequired', severity: 'error', entityType: 'node', entityId: node.id, field: 'routeId', messageKey: 'node.routeRequired' });
  return findings;
}

export function validateRouteDefinition(aggregate: RouteDefinitionAggregate): ValidationFinding[] {
  const findings = validateRoute(aggregate.route);
  const nodeIds = new Set<string>();
  for (const node of aggregate.nodes) {
    findings.push(...validateNode(node, aggregate.route));
    if (nodeIds.has(node.id)) findings.push({ ruleId: 'node.uniqueId', severity: 'error', entityType: 'node', entityId: node.id, messageKey: 'node.duplicateId' });
    nodeIds.add(node.id);
  }
  const directions = aggregate.directions ?? [];
  const patternIds = new Set<string>();
  const directionIds = new Set<string>();
  const directionColumnIds = new Set<string>();
  directions.forEach((direction) => {
    findings.push(...validateDirection(direction, aggregate.route.id, aggregate.nodes));
    if (direction.scenarioId !== aggregate.route.scenarioId) findings.push({ ruleId: 'direction.scenarioMismatch', severity: 'error', entityType: 'direction', entityId: direction.id, field: 'scenarioId', messageKey: 'direction.scenarioMismatch' });
    if (directionIds.has(direction.id)) findings.push({ ruleId: 'direction.uniqueId', severity: 'error', entityType: 'direction', entityId: direction.id, messageKey: 'direction.duplicateId' });
    directionIds.add(direction.id);
    for (const column of direction.columns) {
      if (directionColumnIds.has(column.id)) findings.push({ ruleId: 'direction.columnUniqueId', severity: 'error', entityType: 'direction', entityId: direction.id, field: 'columns', messageKey: 'direction.duplicateColumnId' });
      directionColumnIds.add(column.id);
    }
  });
  if (aggregate.directions) {
    for (const pattern of aggregate.patterns) {
      if (patternIds.has(pattern.id)) findings.push({ ruleId: 'pattern.uniqueId', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.duplicateId' });
      patternIds.add(pattern.id);
      findings.push(...validatePattern(pattern, aggregate.nodes));
      const direction = directions.find((candidate) => candidate.id === pattern.directionId);
      findings.push(...validatePatternDirection(pattern, direction, aggregate.nodes));
    }
  } else {
    // Pre-2R fixtures may omit directions. New route records always include the
    // collection and are validated against it above.
    for (const pattern of aggregate.patterns) {
      if (patternIds.has(pattern.id)) findings.push({ ruleId: 'pattern.uniqueId', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.duplicateId' });
      patternIds.add(pattern.id);
      findings.push(...validatePattern(pattern, aggregate.nodes));
      if (pattern.directionId) findings.push({ ruleId: 'pattern.directionMissing', severity: 'error', entityType: 'pattern', entityId: pattern.id, field: 'directionId', messageKey: 'pattern.directionMissing' });
    }
  }
  return findings;
}

export function validateNodeDeletion(nodeId: string, patterns: RoutePattern[]): ValidationFinding[] {
  const references = patterns.filter((pattern) => pattern.points.some((point) => point.nodeId === nodeId));
  if (references.length === 0) return [];
  return [{
    ruleId: 'node.referencedBeforeDelete',
    severity: 'warning',
    entityType: 'node',
    entityId: nodeId,
    messageKey: 'node.referencedBeforeDelete',
    parameters: { patternCount: references.length },
  }];
}

export function validateBlock(block: Block, trips: Map<string, Trip>): ValidationFinding[] { const findings: ValidationFinding[] = []; let previousEnd: number | undefined; for (const activity of [...block.activities].sort((a, b) => a.sequence - b.sequence)) { let start: number | undefined; let end: number | undefined; if (activity.type === 'revenueTrip') { const trip = trips.get(activity.tripId); if (!trip) { findings.push({ ruleId: 'block.tripExists', severity: 'error', entityType: 'block', entityId: block.id, messageKey: 'block.missingTrip' }); continue; } start = trip.stopTimes[0]?.time; end = trip.stopTimes.at(-1)?.time; } else { start = activity.startTime; end = activity.endTime; } if (start === undefined || end === undefined) continue; if (end < start) findings.push({ ruleId: 'block.activityOrder', severity: 'error', entityType: 'block', entityId: block.id, messageKey: 'block.activityEndsBeforeStart', parameters: { sequence: activity.sequence } }); if (previousEnd !== undefined && start < previousEnd) findings.push({ ruleId: 'block.noOverlap', severity: 'error', entityType: 'block', entityId: block.id, messageKey: 'block.overlap', parameters: { sequence: activity.sequence } }); previousEnd = end; } return findings; }
