import type { EntityId, Miles, Route, ServiceDayDefinition, ServiceSeconds } from '../types';

// Shared shapes of the Scenario comparison (Decision 0091). Pure types; the rules live in the sibling modules.

/** Decision 0091 items 6, 7 and 13. A menu choice: Baseline's, Proposed's, or each side's own. */
export type SideChoice = 'baseline' | 'proposed' | 'own';

/** The two sides of a comparison (Decision 0091 item 1). */
export type CompareSide = 'baseline' | 'proposed';

/** Decision 0091 item 4. A matched pair of Routes; a missing side means the Route is New or Discontinued. */
export interface RoutePair { baseline?: Route; proposed?: Route; }

/** Decision 0091 item 4. A matching key that more than one Route on one side holds, so it matched none of them at that step. */
export interface AmbiguousRouteKey { side: CompareSide; key: string; routeIds: EntityId[]; }

export interface RouteMatch { pairs: RoutePair[]; ambiguous: AmbiguousRouteKey[]; }

/** Decision 0091 item 5. The Weekday, Saturday, Sunday and Holiday kinds, which are matched by kind. */
export type FixedServiceDayKind = 'weekday' | 'saturday' | 'sunday' | 'holiday';

/**
 * Decision 0091 item 5. A service day of each side that is compared with the other. `key` identifies the pair in the rest of the
 * comparison: the kind for a fixed day, `custom:<name>` for a custom day. A missing side means the day is shown with "—" on that side.
 */
export interface ServiceDayPair { key: string; name: string; baseline?: ServiceDayDefinition; proposed?: ServiceDayDefinition; }

/** A direction's span: the earliest first departure to the latest last arrival, in service seconds (Decision 0091 item 9). */
export interface DaySpan { start: ServiceSeconds; end: ServiceSeconds; }

/** One direction of one Route on one day. `departures` are the first stop times of its Trips, ascending. */
export interface DirectionDayMeasure { key: string; name: string; departures: ServiceSeconds[]; span?: DaySpan; }

/** Decision 0091 item 9. One Route's Trips, revenue miles and directions on one service day of one side. */
export interface RouteDayMeasures { trips: number; /** Undefined when a Trip's pattern lacks the miles of its first or last stop. */ revenueMiles?: Miles; directions: DirectionDayMeasure[]; }

/**
 * One Route's Costing figures and measures on one service day of one side. `null` in `SideDay.routes` is the Unattributed row (Decision
 * 0077). Hours are per service day; `firstYearCost` is the Costing row's first-year cost for the day, which already includes the count.
 */
export interface SideRouteFigures {
  /** The annual count in use for this Route on this day (Decision 0089 item 41). */
  annualServiceDays: number;
  revenueHoursPerDay: number;
  platformHoursPerDay?: number;
  firstYearCost?: number;
  measures: RouteDayMeasures;
}

/** Decision 0091 item 12. System peak and each Route's peak (`null` is Unattributed). */
export interface PeakResult { system: number; byRoute: Map<EntityId | null, number>; }

/** One side's figures on one service day. `peaks` is `'notBlocked'` when the side has no Blocking scenario (item 12). */
export interface SideDay { routes: Map<EntityId | null, SideRouteFigures>; peaks: PeakResult | 'notBlocked'; }

/** Input of `buildComparison`. `day` is a `ServiceDayPair.key` or `'annual'`. Both side maps are keyed by `ServiceDayPair.key`. */
export interface ComparisonInput {
  routeMatch: RouteMatch;
  dayPairs: ServiceDayPair[];
  day: string | 'annual';
  baseline: Map<string, SideDay>;
  proposed: Map<string, SideDay>;
}

/** Decision 0091 item 15. Changed, Unchanged, or New and Discontinued for an unmatched Route. */
export type RouteStatus = 'changed' | 'unchanged' | 'new' | 'discontinued';

/** Headway periods of Decision 0091 item 11, in table order. */
export type HeadwayPeriodKey = 'early' | 'amPeak' | 'midday' | 'pmPeak' | 'evening' | 'night';

/**
 * One measure of a row or of the totals. `baseline` and `proposed` are undefined where the value is "—": the Route is not on that side,
 * or the value is not measured. `change` is Proposed minus Baseline (an absent side counts as 0). `percent` is set only when item 14 allows it.
 * `dayName` names the day that gave an annual peak (item 13).
 */
export interface Measure { baseline?: number; proposed?: number; change?: number; percent?: number; dayName?: { baseline?: string; proposed?: string }; }

export interface HeadwayComparison { period: HeadwayPeriodKey; baseline?: number; proposed?: number; }

/** Decision 0091 items 9 to 11, one direction of a Route on one day. */
export interface DirectionComparison {
  key: string;
  name: string;
  span: { baseline?: DaySpan; proposed?: DaySpan };
  headways: HeadwayComparison[];
  changed: boolean;
}

export interface ComparisonRow {
  /** Unique within the comparison: the two Route ids joined, or `unattributed`. */
  key: string;
  /** The identifier the Route is listed by in the CSV: its GTFS route ID, else its short name. Empty for Unattributed. */
  routeCode: string;
  /** Proposed's display name when matched (item 1 and mock-up), else the one side's. */
  name: string;
  unattributed: boolean;
  status: RouteStatus;
  /** Decision 0091 item 17: an Unchanged Route is folded in the screen; Unattributed is never folded. */
  foldable: boolean;
  trips: Measure;
  revenueMiles: Measure;
  revenueHours: Measure;
  platformHours: Measure;
  peakVehicles: Measure;
  cost: Measure;
  /** Day view only, Routes only (item 15 uses these for Changed). */
  directions?: DirectionComparison[];
}

/** Decision 0091 item 4 and card section 5: every warning has a `compare.<name>` code. `compare.ambiguousRoute` is raised by matching. */
export type CompareWarning = { code: 'compare.ambiguousRoute'; side: CompareSide; key: string; routeIds: EntityId[] };

export interface ComparisonTotals { trips: Measure; revenueMiles: Measure; revenueHours: Measure; platformHours: Measure; peakVehicles: Measure; cost: Measure; }

export interface Comparison { totals: ComparisonTotals; rows: ComparisonRow[]; warnings: CompareWarning[]; }
