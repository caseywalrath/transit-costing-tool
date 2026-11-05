import type {
  DurationSeconds,
  EntityId,
  PlannedFrequency,
  PlannedPeriod,
  RouteDirection,
  RoutePattern,
  ServiceSeconds,
  ValidationFinding,
} from './types';

/** Shortest headway a period may use, in seconds (Decision 0058 item 3). */
export const MIN_PLANNED_HEADWAY_SECONDS = 60;

export interface PlannedFrequencyValidationContext {
  directions: RouteDirection[];
  patterns: RoutePattern[];
}

function finding(
  record: PlannedFrequency,
  ruleId: string,
  field: string,
  parameters?: Record<string, string | number>,
): ValidationFinding {
  return {
    ruleId,
    severity: 'error',
    entityType: 'plannedFrequency',
    entityId: record.id,
    field,
    messageKey: ruleId,
    ...(parameters ? { parameters } : {}),
  };
}

/** Sort periods by start time (then end time), keeping every ID. Returns a new array. */
export function normalizePeriods(periods: PlannedPeriod[]): PlannedPeriod[] {
  return periods
    .map((period, index) => ({ period, index }))
    .sort((a, b) => a.period.startTime - b.period.startTime || a.period.endTime - b.period.endTime || a.index - b.index)
    .map(({ period }) => period);
}

/** Planned times of a period: `startTime + k × headway` for every whole k ≥ 0 with the result before `endTime`. */
export function plannedSlots(period: Pick<PlannedPeriod, 'startTime' | 'endTime' | 'headwaySeconds'>): ServiceSeconds[] {
  const { startTime, endTime, headwaySeconds } = period;
  if (!Number.isFinite(headwaySeconds) || headwaySeconds <= 0 || !(endTime > startTime)) return [];
  const slots: ServiceSeconds[] = [];
  for (let time = startTime; time < endTime; time += headwaySeconds) slots.push(time);
  return slots;
}

/** Trips per hour at the period's headway (3600 ÷ headway). Zero for an invalid headway. */
export function tripsPerHour(period: Pick<PlannedPeriod, 'headwaySeconds'>): number {
  return period.headwaySeconds > 0 ? 3600 / period.headwaySeconds : 0;
}

/** The node ids that at least one pattern of the direction visits. */
function servedNodeIds(direction: Pick<RouteDirection, 'id'>, patterns: RoutePattern[]): Set<EntityId> {
  const served = new Set<EntityId>();
  for (const pattern of patterns) {
    if (pattern.directionId !== direction.id) continue;
    for (const point of pattern.points) served.add(point.nodeId);
  }
  return served;
}

/**
 * The node of the direction's first timepoint column that some pattern of the direction serves.
 * Columns are read in sequence order. Returns undefined when the direction has no usable column.
 */
export function defaultMeasureNodeId(direction: RouteDirection, patterns: RoutePattern[]): EntityId | undefined {
  const served = servedNodeIds(direction, patterns);
  const columns = [...direction.columns].sort((a, b) => a.sequence - b.sequence);
  return columns.find((column) => served.has(column.nodeId))?.nodeId;
}

export interface ResolvedMeasureNode { nodeId?: EntityId; fellBack: boolean; }

/**
 * The measure node for a direction. A stored node that no pattern of the direction serves falls back to the
 * default and reports `fellBack`; the stored value is never changed here (Decision 0058 item 4).
 */
export function resolveMeasureNodeId(record: Pick<PlannedFrequency, 'measureNodeIdByDirectionId'>, direction: RouteDirection, patterns: RoutePattern[]): ResolvedMeasureNode {
  const stored = record.measureNodeIdByDirectionId[direction.id];
  if (stored === undefined) return { nodeId: defaultMeasureNodeId(direction, patterns), fellBack: false };
  if (servedNodeIds(direction, patterns).has(stored)) return { nodeId: stored, fellBack: false };
  return { nodeId: defaultMeasureNodeId(direction, patterns), fellBack: true };
}

/**
 * Check a plan against Decision 0058 item 3 and 4. Period findings carry the period id in `parameters.periodId`.
 * `measureNodeNotServed` reports a stored node that no pattern of its direction serves (the plan still resolves to the default).
 */
export function validatePlannedFrequency(record: PlannedFrequency, context: PlannedFrequencyValidationContext): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const periods = normalizePeriods(record.periods);
  for (const period of periods) {
    const length = period.endTime - period.startTime;
    if (!Number.isFinite(period.startTime) || !Number.isFinite(period.endTime) || period.endTime <= period.startTime) {
      findings.push(finding(record, 'plannedFrequency.periodEndNotAfterStart', 'periods', { periodId: period.id }));
      continue;
    }
    if (!Number.isInteger(period.headwaySeconds) || period.headwaySeconds < MIN_PLANNED_HEADWAY_SECONDS) {
      findings.push(finding(record, 'plannedFrequency.headwayTooShort', 'periods', { periodId: period.id, headwaySeconds: period.headwaySeconds }));
    } else if (period.headwaySeconds > length) {
      findings.push(finding(record, 'plannedFrequency.headwayLongerThanPeriod', 'periods', { periodId: period.id, headwaySeconds: period.headwaySeconds as DurationSeconds }));
    }
  }
  // Compare each valid period with the latest end seen so far, so one long period overlapping several others is caught.
  let latestEnd = Number.NEGATIVE_INFINITY;
  let latestId: EntityId | undefined;
  for (const period of periods) {
    if (!(period.endTime > period.startTime)) continue;
    if (latestId !== undefined && period.startTime < latestEnd) {
      findings.push(finding(record, 'plannedFrequency.periodsOverlap', 'periods', { periodId: period.id, otherPeriodId: latestId }));
    }
    if (period.endTime > latestEnd) { latestEnd = period.endTime; latestId = period.id; }
  }
  for (const direction of context.directions) {
    const stored = record.measureNodeIdByDirectionId[direction.id];
    if (stored !== undefined && !servedNodeIds(direction, context.patterns).has(stored)) {
      findings.push(finding(record, 'plannedFrequency.measureNodeNotServed', 'measureNodeIdByDirectionId', { directionId: direction.id, nodeId: stored }));
    }
  }
  return findings;
}
