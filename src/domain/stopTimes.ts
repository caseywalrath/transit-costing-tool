import type { EntityId, Node, PatternStopPlacement, RoutePattern, RouteStopSet, ServiceSeconds, StopInterpolation, StopLocation, StopTimeRoundingSeconds, StopTimingRule, Trip } from './types';
import { DEFAULT_STOP_ROUNDING_SECONDS, hasCoordinates, placementsBySegment, sortedPoints } from './stops';
import { greatCircleMiles } from './geo';

export interface StopTimeRow {
  kind: 'timepoint' | 'stop';
  /** The timepoint's point, or for a stop the point it follows. */
  patternPointId: EntityId;
  segmentIndex?: number;        // stops only
  placementId?: EntityId;       // stops only
  stopId?: EntityId;            // stops only
  nodeId?: EntityId;            // timepoints only
  name: string;                 // node name or stop name
  stopCode?: string;            // the timepoint's stop ID on this pattern (Decision 0080), or RouteStop.stopCode
  timing?: StopTimingRule;      // stops only
  /** Stops only. 'distance' when the segment's interpolated times were weighted by distance (Decision 0086), otherwise 'equal'. */
  spacing?: 'equal' | 'distance';
  time?: ServiceSeconds;        // undefined without a trip or a usable time
}

/**
 * Section 4.3 for one segment. Returns one entry per timing, in order. `a` and `b` are the times at the segment's first and second
 * points. Interpolated times are rounded down to `roundingSeconds` and never go below `a`. Each time is raised to at least the previous one.
 * `fractions`, when given, has one entry per timing: the share of the segment's time at which an interpolated stop falls (Decision 0086).
 * Without it, interpolated stops are equally spaced.
 */
export function segmentStopTimes(
  a: ServiceSeconds | undefined,
  b: ServiceSeconds | undefined,
  timings: readonly StopTimingRule[],
  roundingSeconds: StopTimeRoundingSeconds,
  fractions?: readonly number[],
): Array<ServiceSeconds | undefined> {
  if (a === undefined || b === undefined || b < a) return timings.map(() => undefined);
  const interpolatedCount = timings.filter((timing) => timing === 'interpolate').length;
  let interpolatedIndex = 0;
  const raw = timings.map((timing, position): ServiceSeconds => {
    if (timing === 'previous') return a;
    if (timing === 'next') return b;
    interpolatedIndex += 1;
    if (fractions) {
      const weighted = Math.floor((a + (b - a) * fractions[position]) / roundingSeconds + 1e-9) * roundingSeconds;
      return Math.max(a, weighted);
    }
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
 * Decision 0086 (section 4.11). The fraction of the segment's time at each stop, by cumulative great-circle distance along the chain
 * opening point, stops, closing point. Undefined (equal spacing) when any member lacks coordinates or the chain has no length.
 */
function distanceFractions(chain: Array<StopLocation | undefined>): number[] | undefined {
  const located: Array<{ latitude: number; longitude: number }> = [];
  for (const location of chain) {
    if (!hasCoordinates(location)) return undefined;
    located.push(location);
  }
  const cumulative = [0];
  for (let index = 1; index < located.length; index += 1) {
    cumulative.push(cumulative[index - 1] + greatCircleMiles(located[index - 1], located[index]));
  }
  const total = cumulative[cumulative.length - 1];
  if (!(total > 0)) return undefined;
  return cumulative.slice(1, -1).map((miles) => miles / total);
}

/**
 * Rows in pattern order: each timepoint, then the stops of its segment. Without `set`, only timepoints. Without `trip`, no times.
 * `placements` and `roundingSeconds`, when given, replace the set's placements for this pattern and its rounding. A placement whose
 * stop is missing from the set is skipped. `interpolation`, when given, replaces the set's interpolation (Decision 0086).
 */
export function stopTimeRows(input: {
  pattern: RoutePattern;
  set?: RouteStopSet;
  nodes: readonly Node[];
  trip?: Trip;
  placements?: readonly PatternStopPlacement[];
  roundingSeconds?: StopTimeRoundingSeconds;
  interpolation?: StopInterpolation;
}): StopTimeRow[] {
  const { pattern, set, nodes, trip } = input;
  const points = sortedPoints(pattern);
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const timeByPointId = new Map((trip?.stopTimes ?? []).map((item) => [item.patternPointId, item.time] as const));

  const timepointCodes = set?.timepointStopCodesByPatternId?.[pattern.id] ?? {};
  if (!set) {
    return points.map((point) => {
      const node = nodeById.get(point.nodeId);
      return { kind: 'timepoint', patternPointId: point.id, nodeId: point.nodeId, name: node?.name ?? '', time: timeByPointId.get(point.id) };
    });
  }

  const stopById = new Map(set.stops.map((stop) => [stop.id, stop] as const));
  const placements = input.placements ?? set.placementsByPatternId[pattern.id] ?? [];
  const rounding = input.roundingSeconds ?? set.roundingSeconds ?? DEFAULT_STOP_ROUNDING_SECONDS;
  const interpolation = input.interpolation ?? set.interpolation ?? 'equal';
  const locations = set.timepointLocationsByPatternId?.[pattern.id] ?? {};
  const segments = placementsBySegment(pattern, placements).map((segment) => segment.flatMap((placement) => {
    const stop = stopById.get(placement.stopId);
    return stop ? [{ placement, stop }] : [];
  }));

  const rows: StopTimeRow[] = [];
  points.forEach((point, index) => {
    const node = nodeById.get(point.nodeId);
    rows.push({ kind: 'timepoint', patternPointId: point.id, nodeId: point.nodeId, name: node?.name ?? '', stopCode: timepointCodes[point.id], time: timeByPointId.get(point.id) });
    if (index >= points.length - 1) return;
    const segment = segments[index];
    const fractions = interpolation === 'distance'
      ? distanceFractions([locations[point.id], ...segment.map((item) => item.stop), locations[points[index + 1].id]])
      : undefined;
    const times = segmentStopTimes(timeByPointId.get(point.id), timeByPointId.get(points[index + 1].id), segment.map((item) => item.placement.timing), rounding, fractions);
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
        spacing: fractions ? 'distance' : 'equal',
        time: times[position],
      });
    });
  });
  return rows;
}
