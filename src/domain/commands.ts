import type { RoutePattern } from './types';
export function normalizePattern(pattern: RoutePattern): RoutePattern { return { ...pattern, points: pattern.points.map((point, sequence) => ({ ...point, sequence })) }; }
export { createDirectionColumn, createRouteDirection, mapPatternPointsToDirection, normalizeDirection, normalizeDirections, normalizePatternSequences, orderDirections, orderPatterns } from './directions';
