import type { RoutePattern } from './types';
import { newId } from './ids';
export function normalizePattern(pattern: RoutePattern): RoutePattern { return { ...pattern, points: pattern.points.map((point, sequence) => ({ ...point, sequence })) }; }
export const makePatternPoint = (nodeId: string, sequence: number, cumulativeMiles = 0) => ({ id: newId(), nodeId, sequence, cumulativeMiles });
export { createDirectionColumn, createRouteDirection, mapPatternPointsToDirection, normalizeDirection, normalizeDirections, normalizePatternSequences, orderDirections, orderPatterns } from './directions';
