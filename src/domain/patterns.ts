import type { Node, PatternPoint, RouteDirection, RoutePattern, ValidationFinding } from './types';
import { newId } from './ids';
import { validatePatternDirection } from './directions';
export function normalizePattern(pattern: RoutePattern): RoutePattern { return { ...pattern, points: pattern.points.map((point, sequence) => ({ ...point, sequence })) }; }
export function getSegmentMiles(pattern: RoutePattern, pointIndex: number): number {
  const point = pattern.points[pointIndex];
  if (!point) return Number.NaN;
  if (pointIndex === 0) return 0;
  const previous = pattern.points[pointIndex - 1];
  return previous ? point.cumulativeMiles - previous.cumulativeMiles : Number.NaN;
}
export function validatePattern(pattern: RoutePattern, nodes: Node[], direction?: RouteDirection): ValidationFinding[] { const findings: ValidationFinding[] = []; const nodeIds = new Set(nodes.map(n => n.id)); const ids = new Set<string>(); if (!pattern.name.trim()) findings.push({ ruleId: 'pattern.nameRequired', severity: 'error', entityType: 'pattern', entityId: pattern.id, field: 'name', messageKey: 'pattern.nameRequired' }); if (pattern.points.length < 2) findings.push({ ruleId: 'pattern.minPoints', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.requiresTwoPoints' }); pattern.points.forEach((point, index) => { if (ids.has(point.id)) findings.push({ ruleId: 'pattern.uniquePointIds', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.duplicatePointId', parameters: { sequence: point.sequence } }); ids.add(point.id); if (point.sequence !== index) findings.push({ ruleId: 'pattern.contiguousSequence', severity: 'warning', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.sequenceNormalized' }); if (!nodeIds.has(point.nodeId)) findings.push({ ruleId: 'pattern.nodeExists', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.missingNode', parameters: { sequence: point.sequence } }); if (!Number.isFinite(point.cumulativeMiles) || point.cumulativeMiles < 0) findings.push({ ruleId: 'pattern.distanceValid', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.invalidDistance', parameters: { sequence: point.sequence } }); if (index === 0 && point.cumulativeMiles !== 0) findings.push({ ruleId: 'pattern.startsAtZero', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.firstDistanceNotZero' }); if (index > 0 && point.cumulativeMiles < pattern.points[index - 1].cumulativeMiles) findings.push({ ruleId: 'pattern.nonDecreasingDistance', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.distanceDecreases', parameters: { sequence: point.sequence } }); }); if (direction) findings.push(...validatePatternDirection(pattern, direction, nodes)); return findings; }
export function reversePattern(source: RoutePattern, now = new Date().toISOString()): RoutePattern { const reversed = [...source.points].reverse(); const segments = source.points.slice(1).map((p, i) => p.cumulativeMiles - source.points[i].cumulativeMiles).reverse(); let cumulative = 0; const points: PatternPoint[] = reversed.map((p, i) => { const out = { id: newId(), nodeId: p.nodeId, sequence: i, cumulativeMiles: cumulative, ...(p.directionColumnId ? { directionColumnId: p.directionColumnId } : {}) }; cumulative += segments[i] ?? 0; return out; }); return { ...source, id: newId(), name: `${source.name} Reverse`, directionLabel: source.directionLabel ? `Reverse ${source.directionLabel}` : undefined, points, createdAt: now, updatedAt: now }; }

/** Create an independently editable copy of a pattern while retaining its ordered points. */
export function duplicatePattern(source: RoutePattern, targetName: string, now = new Date().toISOString()): RoutePattern {
  if (!targetName.trim()) throw new Error('Pattern name is required');
  const points: PatternPoint[] = source.points.map((point, sequence) => ({
    ...point,
    id: newId(),
    sequence,
  }));
  return {
    ...source,
    id: newId(),
    name: targetName.trim(),
    points,
    createdAt: now,
    updatedAt: now,
  };
}
