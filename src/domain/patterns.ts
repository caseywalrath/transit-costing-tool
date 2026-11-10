import type { Node, PatternPoint, RouteDirection, RoutePattern, ValidationFinding } from './types';
import { newId } from './ids';
import { validatePatternDirection } from './directions';
export function normalizePattern(pattern: RoutePattern): RoutePattern { return { ...pattern, points: pattern.points.map((point, sequence) => ({ ...point, sequence })) }; }
/** A Pattern's total distance (its last cumulative mile), or undefined when it has none. A total of 0 means the distance was never entered (P12, Blocking). */
export function patternTotalMiles(pattern: RoutePattern): number | undefined {
  const end = pattern.points.at(-1)?.cumulativeMiles;
  return end !== undefined && Number.isFinite(end) && end > 0 ? end : undefined;
}
export function getSegmentMiles(pattern: RoutePattern, pointIndex: number): number {
  const point = pattern.points[pointIndex];
  if (!point) return Number.NaN;
  if (pointIndex === 0) return 0;
  const previous = pattern.points[pointIndex - 1];
  return previous ? point.cumulativeMiles - previous.cumulativeMiles : Number.NaN;
}
const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Decision 0065. Shifts every point's cumulative miles so the first point (by array order) is at 0. Moving or removing points keeps each
 * point's cumulative value, so a point moved to the top could keep a nonzero start that segment entry cannot reach. Returns the same
 * points when the first is already 0 or not finite.
 */
export function rebaseCumulativeMiles(points: PatternPoint[]): PatternPoint[] {
  const start = points[0]?.cumulativeMiles;
  if (start === undefined || start === 0 || !Number.isFinite(start)) return points;
  return points.map((point) => ({ ...point, cumulativeMiles: round6(point.cumulativeMiles - start) }));
}

/**
 * Decision 0065. Sets the miles of segment `segmentIndex` (point `segmentIndex` to point `segmentIndex + 1`, by `sequence`) and shifts
 * the cumulative miles of every later point by the difference. Values are rounded to 6 decimal places. Returns a new Pattern.
 * Throws if `segmentIndex` is out of range or `miles` is not a finite, non-negative number.
 */
export function setSegmentMiles(pattern: RoutePattern, segmentIndex: number, miles: number): RoutePattern {
  const sorted = [...pattern.points].sort((left, right) => left.sequence - right.sequence);
  // The integer test is added beyond the plan's wording: a fractional index would otherwise read undefined points.
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= sorted.length - 1) throw new Error('Segment not found.');
  if (!Number.isFinite(miles) || miles < 0) throw new Error('Enter a non-negative number.');
  const delta = miles - (sorted[segmentIndex + 1].cumulativeMiles - sorted[segmentIndex].cumulativeMiles);
  const later = new Set(sorted.slice(segmentIndex + 1));
  return { ...pattern, points: pattern.points.map((point) => later.has(point) ? { ...point, cumulativeMiles: round6(point.cumulativeMiles + delta) } : point) };
}

export function validatePattern(pattern: RoutePattern, nodes: Node[], direction?: RouteDirection): ValidationFinding[] { const findings: ValidationFinding[] = []; const nodeIds = new Set(nodes.map(n => n.id)); const ids = new Set<string>(); if (!pattern.name.trim()) findings.push({ ruleId: 'pattern.nameRequired', severity: 'error', entityType: 'pattern', entityId: pattern.id, field: 'name', messageKey: 'pattern.nameRequired' }); if (pattern.points.length < 2) findings.push({ ruleId: 'pattern.minPoints', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.requiresTwoPoints' }); pattern.points.forEach((point, index) => { if (ids.has(point.id)) findings.push({ ruleId: 'pattern.uniquePointIds', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.duplicatePointId', parameters: { sequence: point.sequence } }); ids.add(point.id); if (point.sequence !== index) findings.push({ ruleId: 'pattern.contiguousSequence', severity: 'warning', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.sequenceNormalized' }); if (!nodeIds.has(point.nodeId)) findings.push({ ruleId: 'pattern.nodeExists', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.missingNode', parameters: { sequence: point.sequence } }); if (!Number.isFinite(point.cumulativeMiles) || point.cumulativeMiles < 0) findings.push({ ruleId: 'pattern.distanceValid', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.invalidDistance', parameters: { sequence: point.sequence } }); if (index === 0 && point.cumulativeMiles !== 0) findings.push({ ruleId: 'pattern.startsAtZero', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.firstDistanceNotZero' }); if (index > 0 && point.cumulativeMiles < pattern.points[index - 1].cumulativeMiles) findings.push({ ruleId: 'pattern.nonDecreasingDistance', severity: 'error', entityType: 'pattern', entityId: pattern.id, messageKey: 'pattern.distanceDecreases', parameters: { sequence: point.sequence } }); }); if (direction) findings.push(...validatePatternDirection(pattern, direction, nodes)); return findings; }
export function reversePattern(source: RoutePattern, now = new Date().toISOString()): RoutePattern { const reversed = [...source.points].reverse(); const segments = source.points.slice(1).map((p, i) => p.cumulativeMiles - source.points[i].cumulativeMiles).reverse(); let cumulative = 0; const points: PatternPoint[] = reversed.map((p, i) => { const out = { id: newId(), nodeId: p.nodeId, sequence: i, cumulativeMiles: cumulative, ...(p.directionColumnId ? { directionColumnId: p.directionColumnId } : {}) }; cumulative += segments[i] ?? 0; return out; }); return { ...source, id: newId(), name: `${source.name} Reverse`, directionLabel: undefined,points, createdAt: now, updatedAt: now }; }

/** Create an independently editable copy of a pattern while retaining its ordered points. The short name (`directionLabel`) is not copied, so the copy does not show the source's name in the tables. */
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
    directionLabel: undefined,
    points,
    createdAt: now,
    updatedAt: now,
  };
}
