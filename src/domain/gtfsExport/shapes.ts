// Decision 0090 item 17 and G-E3: one shape per exported pattern, a straight line through its located stops and timepoints in order. The
// shape's miles are the miles of the stop time rows (`rowMiles` in ./stopTimes.ts), so a shape and its stop times agree. Pure.

import { stopTimeRows } from '../stopTimes';
import { hasCoordinates } from '../stops';
import type { Node, RoutePattern, RouteStopSet } from '../types';
import { compareCodeUnits, coordinateText, csvTable, milesText } from './csvText';
import { rowMiles } from './stopTimes';

/** One point of a shape: a located timepoint or Route stop, with its miles along the pattern. */
export interface ShapePoint {
  latitude: number;
  longitude: number;
  miles: number;
}

/** A shape as the feed holds it: its `shape_id` and its points in order (sequence 1 is the first). */
export interface ExportShape {
  shapeId: string;
  points: ShapePoint[];
}

/**
 * The points of a pattern's shape, in pattern order: each timepoint, then the Route stops of its segment. The caller has refused unlocated
 * stops (Decision 0090 item 7), so a point without a location here is an invariant failure and throws.
 */
export function patternShapePoints(pattern: RoutePattern, nodes: readonly Node[], set: RouteStopSet | undefined): ShapePoint[] {
  const rows = stopTimeRows({ pattern, set, nodes });
  const miles = rowMiles(rows, pattern, set);
  const locations = set?.timepointLocationsByPatternId?.[pattern.id] ?? {};
  const stopById = new Map((set?.stops ?? []).map((stop) => [stop.id, stop] as const));
  return rows.map((row, index) => {
    const location = row.kind === 'timepoint' ? locations[row.patternPointId] : stopById.get(row.stopId ?? '');
    if (!hasCoordinates(location)) {
      throw new Error(`gtfsExport: ${row.kind === 'timepoint' ? `timepoint ${row.patternPointId}` : `stop ${row.stopId}`} of pattern ${pattern.id} has no location.`);
    }
    return { latitude: location.latitude, longitude: location.longitude, miles: miles[index] };
  });
}

/** shapes.txt: shapes sorted by `shape_id`, then points by sequence (Decision 0090 item 12). Miles to three decimals, coordinates to six. */
export function shapesText(shapes: readonly ExportShape[]): string {
  const rows = [...shapes]
    .sort((left, right) => compareCodeUnits(left.shapeId, right.shapeId))
    .flatMap((shape) => shape.points.map((point, index) => ({
      shape_id: shape.shapeId,
      shape_pt_lat: coordinateText(point.latitude),
      shape_pt_lon: coordinateText(point.longitude),
      shape_pt_sequence: index + 1,
      shape_dist_traveled: milesText(point.miles),
    })));
  return csvTable(['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence', 'shape_dist_traveled'], rows);
}
