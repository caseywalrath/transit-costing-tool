import type { EntityId, Node, PatternStopPlacement, RoutePattern, RouteStopSet, ServiceSeconds, StopTimeRoundingSeconds, StopTimingRule, Trip } from './types';
import { DEFAULT_STOP_ROUNDING_SECONDS, placementsBySegment, sortedPoints } from './stops';

export interface StopTimeRow {
  kind: 'timepoint' | 'stop';
  /** The timepoint's point, or for a stop the point it follows. */
  patternPointId: EntityId;
  segmentIndex?: number;        // stops only
  placementId?: EntityId;       // stops only
  stopId?: EntityId;            // stops only
  nodeId?: EntityId;            // timepoints only
  name: string;                 // node name or stop name
  stopCode?: string;            // Node.stopCode or RouteStop.stopCode
  timing?: StopTimingRule;      // stops only
  time?: ServiceSeconds;        // undefined without a trip or a usable time
}

/**
 * Section 4.3 for one segment. Returns one entry per timing, in order. `a` and `b` are the times at the segment's first and second
 * points. Interpolated times are rounded down to `roundingSeconds` and never go below `a`. Each time is raised to at least the previous one.
 */
export function segmentStopTimes(
  a: ServiceSeconds | undefined,
  b: ServiceSeconds | undefined,
  timings: readonly StopTimingRule[],
  roundingSeconds: StopTimeRoundingSeconds,
): Array<ServiceSeconds | undefined> {
  if (a === undefined || b === undefined || b < a) return timings.map(() => undefined);
  const interpolatedCount = timings.filter((timing) => timing === 'interpolate').length;
  let interpolatedIndex = 0;
  const raw = timings.map((timing): ServiceSeconds => {
    if (timing === 'previous') return a;
    if (timing === 'next') return b;
    interpolatedIndex += 1;
    const rounded = Math.floor((a * (interpolatedCount + 1) + (b - a) * interpolatedIndex) / ((interpolatedCount + 1) * roundingSeconds)) * roundingSeconds;
    return Math.max(a, rounded);
  });
  let previous: ServiceSeconds | undefined;
  return raw.map((time) => {
    previous = previous === undefined ? time : Math.max(previous, time);
    return previous;
  });
}

/**
 * Rows in pattern order: each timepoint, then the stops of its segment. Without `set`, only timepoints. Without `trip`, no times.
 * `placements` and `roundingSeconds`, when given, replace the set's placements for this pattern and its rounding. A placement whose
 * stop is missing from the set is skipped.
 */
export function stopTimeRows(input: {
  pattern: RoutePattern;
  set?: RouteStopSet;
  nodes: readonly Node[];
  trip?: Trip;
  placements?: readonly PatternStopPlacement[];
  roundingSeconds?: StopTimeRoundingSeconds;
}): StopTimeRow[] {
  const { pattern, set, nodes, trip } = input;
  const points = sortedPoints(pattern);
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const timeByPointId = new Map((trip?.stopTimes ?? []).map((item) => [item.patternPointId, item.time] as const));

  if (!set) {
    return points.map((point) => {
      const node = nodeById.get(point.nodeId);
      return { kind: 'timepoint', patternPointId: point.id, nodeId: point.nodeId, name: node?.name ?? '', stopCode: node?.stopCode, time: timeByPointId.get(point.id) };
    });
  }

  const stopById = new Map(set.stops.map((stop) => [stop.id, stop] as const));
  const placements = input.placements ?? set.placementsByPatternId[pattern.id] ?? [];
  const rounding = input.roundingSeconds ?? set.roundingSeconds ?? DEFAULT_STOP_ROUNDING_SECONDS;
  const segments = placementsBySegment(pattern, placements).map((segment) => segment.flatMap((placement) => {
    const stop = stopById.get(placement.stopId);
    return stop ? [{ placement, stop }] : [];
  }));

  const rows: StopTimeRow[] = [];
  points.forEach((point, index) => {
    const node = nodeById.get(point.nodeId);
    rows.push({ kind: 'timepoint', patternPointId: point.id, nodeId: point.nodeId, name: node?.name ?? '', stopCode: node?.stopCode, time: timeByPointId.get(point.id) });
    if (index >= points.length - 1) return;
    const segment = segments[index];
    const times = segmentStopTimes(timeByPointId.get(point.id), timeByPointId.get(points[index + 1].id), segment.map((item) => item.placement.timing), rounding);
    segment.forEach(({ placement, stop }, position) => {
      rows.push({
        kind: 'stop',
        patternPointId: point.id,
        segmentIndex: index,
        placementId: placement.id,
        stopId: stop.id,
        name: stop.name,
        stopCode: stop.stopCode,
        timing: placement.timing,
        time: times[position],
      });
    });
  });
  return rows;
}
