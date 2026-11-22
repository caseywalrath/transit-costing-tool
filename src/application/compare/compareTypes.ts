// Shared shapes of the comparison service (Decision 0091; card V2). Plain data only: everything here crosses the worker boundary by
// structured clone, and the screen (card V4) reads it as it is.

import type { CostingAssumptionsInput, CostingCalculationContext, CostingFinding } from '../../domain/costing';
import type { EstimatedCostingContext } from '../../domain/estimatedCosting';
import type { Comparison, CompareSide, ServiceDayPair, SideChoice, SideDay } from '../../domain/compare/types';
import type { EntityId, RouteDirection, RoutePattern } from '../../domain/types';

/** Decision 0091 item 1. One side: a Scenario, a Trip profile of it, and a Blocking scenario of that profile or `null` ("None"). */
export interface CompareSideRequest { scenarioId: EntityId; tripProfileId: EntityId; blockingScenarioId: EntityId | null }

/** The request of one comparison. `day` is a `ServiceDayPair.key` (`weekday`, `saturday`, `custom:<name>`, ...) or `'annual'`. */
export interface CompareRequest {
  baseline: CompareSideRequest;
  proposed: CompareSideRequest;
  day: string | 'annual';
  /** Decision 0091 item 6. Which side's rate assumptions both sides use, or each side's own. */
  rates: SideChoice;
  /** Decision 0091 item 7. Which side's annual counts both sides use, or each side's own. */
  counts: SideChoice;
}

/** Progress of one comparison. `done` of `total` counts sides while costing and Routes while measuring. Never goes backwards within a stage. */
export interface CompareProgress {
  stage: 'reading' | 'costing' | 'measuring' | 'comparing';
  side?: CompareSide;
  done: number;
  total: number;
  /** Plain language, for example "Costing baseline…" or "Measuring proposed… 3 of 12 routes". */
  message: string;
}

/** The rate assumptions a side is costed with (Decision 0091 item 6). */
export interface CompareRateValues { enteredRate?: number; rateYear: number; baseServiceYear: number; futureYearCount: number; annualEscalation: number }

/** A Route's own counts as the comparison reads them: the switch and the count of each matched day, by day pair key. */
export interface CompareOwnCounts { enabled: boolean; byDay: Record<string, number> }

export type CompareBasisKind = 'blocked' | 'estimated';

/**
 * Decision 0091 item 8, the warning line. Each difference carries both sides' OWN values, whatever the menus say, so the screen can say
 * what differs and which side's value is in use (`applied`). Under `own` the screen offers "Use the baseline's for both".
 */
export type CompareDifference =
  | { code: 'compare.ratesDiffer'; applied: SideChoice; baseline: CompareRateValues; proposed: CompareRateValues }
  | { code: 'compare.countsDiffer'; applied: SideChoice; days: Array<{ key: string; name: string; baseline: number; proposed: number }>; routes: Array<{ name: string; baseline: CompareOwnCounts; proposed: CompareOwnCounts }> }
  | { code: 'compare.basisDiffers'; baseline: CompareBasisKind; proposed: CompareBasisKind };

/** Why a side or the request cannot be compared. `findings` are Costing's own findings, unchanged. */
export interface CompareError {
  side?: CompareSide;
  code: 'compare.sideMissing' | 'compare.costingInvalid' | 'compare.costingNoEstimate' | 'compare.dayMissing';
  findings: CostingFinding[];
  /** `rateMissing`, `noEligibleBlocks`, `noTrips` or `layoverFactorMissing` for `compare.costingNoEstimate`; plain text for the others. */
  detail?: string;
}

/** What the screen shows about a side beside the table: its basis and Costing's non-error findings (for example `costing.routeCountsInUse`). */
export interface CompareSideInfo { basis: CompareBasisKind; state: 'partial' | 'complete'; findings: CostingFinding[] }

export interface CompareSuccess {
  status: 'ok';
  comparison: Comparison;
  differences: CompareDifference[];
  /** Every matched service day, for the day menu. */
  dayPairs: ServiceDayPair[];
  sides: { baseline: CompareSideInfo; proposed: CompareSideInfo };
}

export interface CompareFailure { status: 'error'; errors: CompareError[] }

export type CompareOutcome = CompareSuccess | CompareFailure;

/** Everything the pure per-side computation needs: one side's context with the counts already applied, and its assumptions. */
export interface SideComputeInput {
  /** The name in progress messages. */
  side: CompareSide;
  /** The Blocked basis context, or the estimated one for a side with no Blocking scenario. */
  basis: { kind: 'blocked'; context: CostingCalculationContext } | { kind: 'estimated'; context: EstimatedCostingContext };
  assumptions: CostingAssumptionsInput;
  patterns: RoutePattern[];
  directions: RouteDirection[];
}

/** The result of costing and measuring one side: its figures for each of its own service days (keyed by service day ID), or why it cannot be costed. */
export type SideComputation =
  | { status: 'ok'; info: CompareSideInfo; days: Map<EntityId, SideDay> }
  | { status: 'error'; error: Omit<CompareError, 'side'> };
