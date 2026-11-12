import type { CostingDailyYearResult } from './costing';
import type { ResolvedRouteDayFactors } from './estimatedCosting';

/**
 * Decision 0077. Costing grouped by Route. This module holds only the shared row types and the row order; it imports types only, so
 * `costing.ts` and `estimatedCosting.ts` can import it without a runtime cycle.
 */

/** One service day of one Route. Fields are present on the basis that derives them. */
export interface CostingRouteDayResult {
  serviceDayId: string;
  serviceDayName: string;
  annualServiceDays: number;
  /** Estimated basis. */
  tripCount?: number;
  /** Estimated basis. */
  tripsWithoutRunTimeCount?: number;
  /** Estimated basis. */
  runningHoursPerDay?: number;
  /** Blocked basis: eligible Blocks attributed to the Route on this day. */
  blockCount?: number;
  /** Blocked basis: Trips of the Route that are in no Block on this day. */
  unassignedTripCount?: number;
  revenueHoursPerDay?: number;
  platformHoursPerDay?: number;
  annualRevenueHours?: number;
  annualPlatformHours?: number;
  /** Estimated basis: where each factor of this Route day came from (Decision 0077 item 2.2). */
  factors?: ResolvedRouteDayFactors;
  /** Empty without a rate or without revenue hours. Same fields and expressions as the day rows of the result. */
  yearCosts: CostingDailyYearResult[];
}

/** One Route, or the Unattributed row (`routeId` null) for eligible Blocks whose revenue Trips belong to more than one Route. */
export interface CostingRouteResult {
  routeId: string | null;
  routeName?: string;
  /** One entry per service day, in the order of the result's daily rows. */
  days: CostingRouteDayResult[];
}

/**
 * Route rows by Route name (numeric-aware, case-insensitive first), then Route ID. The Unattributed row (`routeId` null) is last.
 * Returns a new array; the days inside each row keep their order.
 */
export function sortRouteResults(rows: CostingRouteResult[]): CostingRouteResult[] {
  return [...rows].sort((left, right) => {
    if (left.routeId === null || right.routeId === null) return Number(left.routeId === null) - Number(right.routeId === null);
    return (left.routeName ?? '').localeCompare(right.routeName ?? '', undefined, { numeric: true, sensitivity: 'base' })
      || left.routeId.localeCompare(right.routeId);
  });
}
