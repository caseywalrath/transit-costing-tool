// The pure part of the comparison service (card V2): costs one side with Costing itself, then reads the measures and peaks of Decision
// 0091 for each Route and service day. It runs in the worker (compareWorker.ts) or on the main thread (compareWorkerClient.ts); both run
// this function. No Costing arithmetic is repeated here: hours and first-year cost are read from Costing's Route rows (plan V-D2).

import { calculateCosting, ownOrScenarioCount, type CostingCalculationResult } from '../../domain/costing';
import { calculateEstimatedCosting, type EstimatedCostingCalculationResult } from '../../domain/estimatedCosting';
import { peakByRoute, type PeakBlock } from '../../domain/compare/peaks';
import { routeDayMeasures } from '../../domain/compare/routeMeasures';
import type { SideDay, SideRouteFigures } from '../../domain/compare/types';
import type { BlockingBlock, EntityId, Route, ServiceDayDefinition, Trip } from '../../domain/types';
import type { CompareProgress, SideComputation, SideComputeInput } from './compareTypes';

type Progress = (progress: CompareProgress) => void;

/** Costing's result for the side, on its basis. */
function costSide(input: SideComputeInput): CostingCalculationResult | EstimatedCostingCalculationResult {
  return input.basis.kind === 'blocked'
    ? calculateCosting({ ...input.basis.context, assumptions: input.assumptions })
    : calculateEstimatedCosting({ ...input.basis.context, assumptions: input.assumptions });
}

/** Trips grouped by Route and service day, so the measures of a Route read only its own Trips. */
function groupTrips(trips: Trip[]): Map<string, Trip[]> {
  const groups = new Map<string, Trip[]>();
  for (const trip of trips) {
    const key = `${trip.routeId}\u0000${trip.serviceDayId}`;
    const group = groups.get(key);
    if (group) group.push(trip);
    else groups.set(key, [trip]);
  }
  return groups;
}

/** Decision 0091 item 12. The valid Blocks of the day with their summaries. A Block without a summary is not counted. */
function validBlocksOf(blocks: BlockingBlock[], summaries: Map<EntityId, PeakBlock['summary']>, dayId: EntityId): PeakBlock[] {
  const result: PeakBlock[] = [];
  for (const block of blocks) {
    if (block.serviceDayId !== dayId) continue;
    const summary = summaries.get(block.id);
    if (summary?.valid) result.push({ block, summary });
  }
  return result;
}

/**
 * Costs one side and measures it. A side Costing cannot estimate returns its findings as an error (not a throw): `invalid` for a result
 * with errors, `noEstimate` for no rate, no eligible Blocks, no Trips or a missing layover factor. Otherwise returns, for each of the
 * side's service days, the figures of every Route of the side (a Route Costing has no row for has 0 hours and 0 cost) and the
 * Unattributed row when the day has Blocks that serve more than one Route.
 */
export function computeSide(input: SideComputeInput, onProgress?: Progress): SideComputation {
  const label = input.side;
  onProgress?.({ stage: 'costing', side: label, done: 0, total: 1, message: `Costing ${label}…` });
  const result = costSide(input);
  onProgress?.({ stage: 'costing', side: label, done: 1, total: 1, message: `Costing ${label}…` });

  if (result.state === 'invalid') return { status: 'error', error: { code: 'compare.costingInvalid', findings: result.findings } };
  if (result.state === 'noEstimate') {
    return { status: 'error', error: { code: 'compare.costingNoEstimate', findings: result.findings, ...(result.noEstimateReason ? { detail: result.noEstimateReason } : {}) } };
  }

  const context = input.basis.context;
  const routes: Route[] = context.routes ?? [];
  const serviceDays: ServiceDayDefinition[] = context.serviceDays;
  const trips = context.trips;
  const tripGroups = groupTrips(trips);
  const rowsByRoute = new Map(result.routeRows.map((row) => [row.routeId, row] as const));
  const blocked = input.basis.kind === 'blocked' ? input.basis.context : undefined;
  const summaries = new Map((blocked?.blockSummaries ?? []).map((summary) => [summary.blockId, summary] as const));

  const days = new Map<EntityId, SideDay>(serviceDays.map((day) => [day.id, { routes: new Map<EntityId | null, SideRouteFigures>(), peaks: 'notBlocked' }]));

  routes.forEach((route, index) => {
    const costingRow = rowsByRoute.get(route.id);
    for (const day of serviceDays) {
      const costingDay = costingRow?.days.find((candidate) => candidate.serviceDayId === day.id);
      const measures = routeDayMeasures({ routeId: route.id, serviceDayId: day.id, trips: tripGroups.get(`${route.id}\u0000${day.id}`) ?? [], patterns: input.patterns, directions: input.directions });
      days.get(day.id)!.routes.set(route.id, {
        annualServiceDays: costingDay?.annualServiceDays ?? ownOrScenarioCount(route, day).count,
        revenueHoursPerDay: costingDay?.revenueHoursPerDay ?? 0,
        platformHoursPerDay: costingDay?.platformHoursPerDay ?? (costingRow ? undefined : 0),
        // The first service year's cost is the first entry of the Route day's year costs (Decision 0091 item 9).
        firstYearCost: costingDay ? costingDay.yearCosts[0]?.annualCostUsd : 0,
        measures,
      });
    }
    onProgress?.({ stage: 'measuring', side: label, done: index + 1, total: routes.length, message: `Measuring ${label}… ${index + 1} of ${routes.length} routes` });
  });

  // Decision 0077: the Unattributed row. It is shown on a day only when the day has something in it.
  const unattributed = rowsByRoute.get(null);
  if (unattributed) {
    for (const day of serviceDays) {
      const costingDay = unattributed.days.find((candidate) => candidate.serviceDayId === day.id);
      if (!costingDay) continue;
      const present = (costingDay.blockCount ?? 0) > 0 || (costingDay.revenueHoursPerDay ?? 0) > 0 || (costingDay.platformHoursPerDay ?? 0) > 0;
      if (!present) continue;
      days.get(day.id)!.routes.set(null, {
        annualServiceDays: costingDay.annualServiceDays,
        revenueHoursPerDay: costingDay.revenueHoursPerDay ?? 0,
        platformHoursPerDay: costingDay.platformHoursPerDay,
        firstYearCost: costingDay.yearCosts[0]?.annualCostUsd,
        measures: { trips: 0, directions: [] },
      });
    }
  }

  // Decision 0091 item 12: peaks from the valid Blocks only; a side with no Blocking scenario is "not blocked".
  if (blocked) {
    for (const day of serviceDays) days.get(day.id)!.peaks = peakByRoute(validBlocksOf(blocked.blocks, summaries, day.id), trips);
  }

  return { status: 'ok', info: { basis: input.basis.kind, state: result.state, findings: result.findings }, days };
}
