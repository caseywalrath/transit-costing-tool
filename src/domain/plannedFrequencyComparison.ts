import { normalizePeriods, plannedSlots, resolveMeasureNodeId } from './plannedFrequencies';
import type { EntityId, PlannedFrequency, PlannedPeriod, RouteDirection, RoutePattern, ServiceSeconds, Trip } from './types';

export type PeriodComparisonStatus = 'matches' | 'differs' | 'noTrips';
export type PeriodDifferenceReason = 'extraTrips' | 'missingTrips' | 'gapsOff' | 'startEdge' | 'endEdge';

export interface PeriodGap { fromTripId: EntityId; toTripId: EntityId; seconds: number; withinTolerance: boolean; }

export interface PeriodComparison {
  periodId: EntityId;
  status: PeriodComparisonStatus;
  /** Empty unless status is `differs`. Always in the order extraTrips, missingTrips, gapsOff, startEdge, endEdge. */
  reasons: PeriodDifferenceReason[];
  plannedTrips: number;
  builtTrips: number;
  /** Trip IDs in time order at the measure node. */
  tripIds: EntityId[];
  firstTime?: ServiceSeconds;
  lastTime?: ServiceSeconds;
  gaps: PeriodGap[];
}

export interface PlanComparison {
  periods: PeriodComparison[];
  /** Trips at the measure node that belong to no period. Not a difference. */
  outsidePlan: number;
  /** Trips of the direction whose Pattern does not serve the measure node (or has no time there). */
  notMeasured: number;
  measureNodeId?: EntityId;
  measureNodeFellBack: boolean;
  /** Patterns that visit the measure node more than once; their first visit is used. */
  ambiguousPatternIds: EntityId[];
}

export interface ComparePlanInput {
  plan: PlannedFrequency;
  direction: RouteDirection;
  /** Patterns of the Route; only those of `direction` are used. */
  patterns: RoutePattern[];
  /** Trips of the Route, Service day and Trip Profile; only trips of `direction`'s Patterns are used. */
  trips: Trip[];
}

/** Gap tolerance: ± max(60 s, 10 % of the headway) (Decision 0058 item 6). */
export const gapToleranceSeconds = (headwaySeconds: number): number => Math.max(60, 0.1 * headwaySeconds);

interface PeriodFrame { period: PlannedPeriod; slots: ServiceSeconds[]; firstSlot: number; lastSlot: number; half: number; }

function frame(period: PlannedPeriod): PeriodFrame {
  const slots = plannedSlots(period);
  const firstSlot = period.startTime;
  return { period, slots, firstSlot, lastSlot: slots.length ? slots[slots.length - 1] : firstSlot, half: period.headwaySeconds / 2 };
}

/** Distance from a time to the nearest slot of the period (slots are evenly spaced). */
function distanceToNearestSlot(f: PeriodFrame, time: number): number {
  if (time <= f.firstSlot) return f.firstSlot - time;
  if (time >= f.lastSlot) return time - f.lastSlot;
  const offset = (time - f.firstSlot) % f.period.headwaySeconds;
  return Math.min(offset, f.period.headwaySeconds - offset);
}

/**
 * Period a trip belongs to. Candidates are the periods that contain the time (start inclusive, end exclusive) and
 * the periods whose edge tolerance reaches it (half a headway before the first slot or after the last slot).
 * The candidate with the nearest slot wins; a tie goes to the containing period, then the earlier period.
 * This lets a trip run up to half a headway early or late at an edge, also next to an adjacent period,
 * so a whole timetable shifted by a few minutes still matches.
 */
function periodFor(frames: PeriodFrame[], time: number): number | undefined {
  let best: { index: number; distance: number; contains: boolean } | undefined;
  frames.forEach((f, index) => {
    const contains = time >= f.period.startTime && time < f.period.endTime;
    const inEdge = time >= f.firstSlot - f.half && time <= f.lastSlot + f.half;
    if (!contains && !inEdge) return;
    const distance = distanceToNearestSlot(f, time);
    if (!best || distance < best.distance || (distance === best.distance && contains && !best.contains)) best = { index, distance, contains };
  });
  return best?.index;
}

/** Compare a direction's built trips with the plan at the measure node. Pure; never stores or changes anything. */
export function compareWithPlan({ plan, direction, patterns, trips }: ComparePlanInput): PlanComparison {
  const directionPatterns = patterns.filter((pattern) => pattern.directionId === direction.id);
  const { nodeId, fellBack } = resolveMeasureNodeId(plan, direction, directionPatterns);
  const frames = normalizePeriods(plan.periods).map(frame);

  const pointIdByPatternId = new Map<EntityId, EntityId | undefined>();
  const ambiguousPatternIds: EntityId[] = [];
  for (const pattern of directionPatterns) {
    const visits = [...pattern.points].sort((a, b) => a.sequence - b.sequence).filter((point) => point.nodeId === nodeId);
    pointIdByPatternId.set(pattern.id, visits[0]?.id);
    if (visits.length > 1) ambiguousPatternIds.push(pattern.id);
  }

  let notMeasured = 0;
  const measured: Array<{ tripId: EntityId; time: number }> = [];
  for (const trip of trips) {
    if (!pointIdByPatternId.has(trip.patternId)) continue;
    const pointId = pointIdByPatternId.get(trip.patternId);
    const time = pointId === undefined ? undefined : trip.stopTimes.find((stop) => stop.patternPointId === pointId)?.time;
    if (time === undefined) { notMeasured += 1; continue; }
    measured.push({ tripId: trip.id, time });
  }
  measured.sort((a, b) => a.time - b.time || a.tripId.localeCompare(b.tripId));

  const members: Array<Array<{ tripId: EntityId; time: number }>> = frames.map(() => []);
  let outsidePlan = 0;
  for (const entry of measured) {
    const index = periodFor(frames, entry.time);
    if (index === undefined) outsidePlan += 1;
    else members[index].push(entry);
  }

  const periods = frames.map((f, index): PeriodComparison => {
    const built = members[index];
    const headway = f.period.headwaySeconds;
    const tolerance = gapToleranceSeconds(headway);
    const gaps: PeriodGap[] = [];
    for (let i = 1; i < built.length; i += 1) {
      const seconds = built[i].time - built[i - 1].time;
      gaps.push({ fromTripId: built[i - 1].tripId, toTripId: built[i].tripId, seconds, withinTolerance: Math.abs(seconds - headway) <= tolerance });
    }
    const base = { periodId: f.period.id, plannedTrips: f.slots.length, builtTrips: built.length, tripIds: built.map((entry) => entry.tripId), gaps };
    if (built.length === 0) return { ...base, status: 'noTrips', reasons: [] };
    const firstTime = built[0].time;
    const lastTime = built[built.length - 1].time;
    const reasons: PeriodDifferenceReason[] = [];
    if (built.length > f.slots.length + 1) reasons.push('extraTrips');
    if (built.length < f.slots.length - 1) reasons.push('missingTrips');
    if (gaps.some((gap) => !gap.withinTolerance)) reasons.push('gapsOff');
    if (Math.abs(firstTime - f.firstSlot) > f.half) reasons.push('startEdge');
    if (Math.abs(lastTime - f.lastSlot) > f.half) reasons.push('endEdge');
    return { ...base, status: reasons.length ? 'differs' : 'matches', reasons, firstTime, lastTime };
  });

  return { periods, outsidePlan, notMeasured, measureNodeId: nodeId, measureNodeFellBack: fellBack, ambiguousPatternIds };
}
