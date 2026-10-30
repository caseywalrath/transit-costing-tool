import {
  costingAppliedRates,
  validateAnnualServiceDays,
  validateCostingAssumptions,
  type CostingAssumptionsInput,
  type CostingDailyYearResult,
  type CostingEstimateState,
  type CostingFinding,
} from './costing';
import { sortServiceDays } from './serviceDays';
import { tripRunTimeSeconds } from './trips';
import type { CostingEstimateFactors, CostingFactorPair, Scenario, ServiceDayDefinition, Trip, TripProfile } from './types';

/**
 * Estimated cost basis (Decision 0051): Revenue Hours and Platform Hours estimated from the running hours of a Trip Profile's Trips and
 * typed layover and deadhead factors, then costed exactly as the blocked basis is. Pure; nothing here is stored.
 *
 *   Revenue = Running ÷ (1 − layover)        Platform = Revenue ÷ (1 − deadhead)
 */

export type CostingFactorSource = 'serviceDay' | 'allDays';
export interface ResolvedDayFactors {
  layoverFraction?: number; layoverSource?: CostingFactorSource;
  deadheadFraction?: number; deadheadSource?: CostingFactorSource;
}

/** Each factor comes from the day's own row, else from All days, independently of the other factor. */
export function resolveDayFactors(factors: CostingEstimateFactors | undefined, serviceDayId: string): ResolvedDayFactors {
  const row = factors?.serviceDays?.find((candidate) => candidate.serviceDayId === serviceDayId);
  const resolved: ResolvedDayFactors = {};
  if (row?.layoverFraction !== undefined) { resolved.layoverFraction = row.layoverFraction; resolved.layoverSource = 'serviceDay'; }
  else if (factors?.allDays?.layoverFraction !== undefined) { resolved.layoverFraction = factors.allDays.layoverFraction; resolved.layoverSource = 'allDays'; }
  if (row?.deadheadFraction !== undefined) { resolved.deadheadFraction = row.deadheadFraction; resolved.deadheadSource = 'serviceDay'; }
  else if (factors?.allDays?.deadheadFraction !== undefined) { resolved.deadheadFraction = factors.allDays.deadheadFraction; resolved.deadheadSource = 'allDays'; }
  return resolved;
}

function definedPair(pair: CostingFactorPair | undefined): CostingFactorPair {
  return {
    ...(pair?.layoverFraction !== undefined ? { layoverFraction: pair.layoverFraction } : {}),
    ...(pair?.deadheadFraction !== undefined ? { deadheadFraction: pair.deadheadFraction } : {}),
  };
}

/**
 * Drops rows with no value and rows of days not in `serviceDays`, and sorts the rows in service-day order. Returns `undefined` when nothing
 * is left. Values are not judged here: an invalid value stays so that validation can report it. Used before every save.
 */
export function normalizeEstimateFactors(factors: CostingEstimateFactors | undefined, serviceDays: ServiceDayDefinition[]): CostingEstimateFactors | undefined {
  if (!factors) return undefined;
  const order = new Map(sortServiceDays(serviceDays).map((day, index) => [day.id, index]));
  const rows = (Array.isArray(factors.serviceDays) ? factors.serviceDays : [])
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => order.has(row.serviceDayId) && (row.layoverFraction !== undefined || row.deadheadFraction !== undefined))
    .sort((left, right) => order.get(left.row.serviceDayId)! - order.get(right.row.serviceDayId)! || left.index - right.index)
    .map(({ row }) => ({ serviceDayId: row.serviceDayId, ...definedPair(row) }));
  const allDays = definedPair(factors.allDays);
  if (rows.length === 0 && Object.keys(allDays).length === 0) return undefined;
  return { allDays, serviceDays: rows };
}

export interface EstimatedCostingContext { scenario: Scenario; serviceDays: ServiceDayDefinition[]; tripProfile: TripProfile; trips: Trip[] }
export interface EstimatedCostingInput extends EstimatedCostingContext { assumptions: CostingAssumptionsInput }

export interface EstimatedCostingDailyResult {
  serviceDayId: string; serviceDayName: string; serviceDayKind: ServiceDayDefinition['kind']; annualServiceDays: number;
  tripCount: number; tripsWithoutRunTimeCount: number;
  runningHoursPerDay: number; annualRunningHours: number;
  factors: ResolvedDayFactors;
  revenueHoursPerDay?: number; platformHoursPerDay?: number;
  annualRevenueHours?: number; annualPlatformHours?: number;
  yearCosts: CostingDailyYearResult[]; // empty without a rate or without revenue hours
}
export interface EstimatedCostingYearResult {
  serviceYear: number; appliedRateUsdPerRevenueHour: number;
  annualRunningHours: number; annualRevenueHours: number; annualPlatformHours?: number; annualCostUsd: number;
}
export type EstimatedCostingNoEstimateReason = 'noTrips' | 'layoverFactorMissing' | 'rateMissing';
export interface EstimatedCostingCalculationResult {
  basis: 'estimated'; tripProfileId: string;
  state: CostingEstimateState; noEstimateReason?: EstimatedCostingNoEstimateReason;
  sourceRate?: number; sourceRateYear: number; annualEscalation: number;
  tripCount: number; tripsWithoutRunTimeCount: number;
  findings: CostingFinding[];
  dailyRows: EstimatedCostingDailyResult[]; yearRows: EstimatedCostingYearResult[];
}

function finding(
  ruleId: string,
  severity: CostingFinding['severity'],
  entityType: string,
  entityId: string,
  field?: string,
  parameters?: CostingFinding['parameters'],
): CostingFinding {
  return { ruleId, severity, entityType, entityId, ...(field ? { field } : {}), messageKey: ruleId, ...(parameters ? { parameters } : {}) };
}

export function calculateEstimatedCosting(input: EstimatedCostingInput): EstimatedCostingCalculationResult {
  const { scenario, serviceDays, tripProfile, trips, assumptions } = input;
  const findings = [
    ...validateCostingAssumptions(assumptions, scenario.id),
    ...validateAnnualServiceDays(serviceDays, scenario.id),
  ];
  if (tripProfile.scenarioId !== scenario.id) findings.push(finding('costing.tripProfileMismatch', 'error', 'tripProfile', tripProfile.id));
  const serviceDayIds = new Set(serviceDays.map((day) => day.id));
  const tripIds = new Set<string>();
  for (const trip of trips) {
    if (tripIds.has(trip.id)) findings.push(finding('costing.duplicateTrip', 'error', 'trip', trip.id));
    tripIds.add(trip.id);
    if (trip.scenarioId !== scenario.id || trip.tripProfileId !== tripProfile.id || !serviceDayIds.has(trip.serviceDayId)) {
      findings.push(finding('costing.tripSourceMismatch', 'error', 'trip', trip.id, undefined, { serviceDayId: trip.serviceDayId }));
    }
  }

  const result = (state: CostingEstimateState, dailyRows: EstimatedCostingDailyResult[], yearRows: EstimatedCostingYearResult[], reason?: EstimatedCostingNoEstimateReason): EstimatedCostingCalculationResult => ({
    basis: 'estimated',
    tripProfileId: tripProfile.id,
    state,
    ...(reason ? { noEstimateReason: reason } : {}),
    ...(assumptions.enteredRate !== undefined && Number.isFinite(assumptions.enteredRate) ? { sourceRate: assumptions.enteredRate } : {}),
    sourceRateYear: assumptions.rateYear,
    annualEscalation: assumptions.annualEscalation,
    tripCount: trips.length,
    tripsWithoutRunTimeCount: dailyRows.reduce((sum, row) => sum + row.tripsWithoutRunTimeCount, 0),
    findings,
    dailyRows,
    yearRows,
  });
  if (findings.some((item) => item.severity === 'error')) return result('invalid', [], []);

  for (const row of assumptions.estimateFactors?.serviceDays ?? []) {
    if (!serviceDayIds.has(row.serviceDayId)) {
      findings.push(finding('costing.estimateFactorUnknownDay', 'warning', 'costingAssumptions', scenario.id, 'estimateFactors', { serviceDayId: row.serviceDayId }));
    }
  }

  // Whole seconds are added per day and converted to hours once, so hours stay exact (as the blocked basis does).
  const sortedDays = sortServiceDays(serviceDays);
  const perDay = new Map(sortedDays.map((day) => [day.id, { seconds: 0, tripCount: 0, withoutRunTime: 0 }]));
  let tripsWithRunTime = 0;
  for (const trip of trips) {
    const day = perDay.get(trip.serviceDayId)!;
    day.tripCount += 1;
    const seconds = tripRunTimeSeconds(trip);
    if (seconds === undefined) { day.withoutRunTime += 1; continue; }
    day.seconds += seconds;
    tripsWithRunTime += 1;
  }

  const dailyRows: EstimatedCostingDailyResult[] = sortedDays.map((day) => {
    const quantities = perDay.get(day.id)!;
    const runningHoursPerDay = quantities.seconds / 3600;
    const factors = resolveDayFactors(assumptions.estimateFactors, day.id);
    const row: EstimatedCostingDailyResult = {
      serviceDayId: day.id,
      serviceDayName: day.name,
      serviceDayKind: day.kind,
      annualServiceDays: day.annualServiceDays,
      tripCount: quantities.tripCount,
      tripsWithoutRunTimeCount: quantities.withoutRunTime,
      runningHoursPerDay,
      annualRunningHours: runningHoursPerDay * day.annualServiceDays,
      factors,
      yearCosts: [],
    };
    if (quantities.seconds === 0) {
      row.revenueHoursPerDay = 0;
      row.platformHoursPerDay = 0;
    } else if (factors.layoverFraction !== undefined) {
      row.revenueHoursPerDay = runningHoursPerDay / (1 - factors.layoverFraction);
      if (factors.deadheadFraction !== undefined) row.platformHoursPerDay = row.revenueHoursPerDay / (1 - factors.deadheadFraction);
    } else {
      findings.push(finding('costing.layoverFactorMissing', 'warning', 'serviceDay', day.id, 'estimateFactors', { serviceDayId: day.id }));
    }
    if (quantities.seconds > 0 && factors.deadheadFraction === undefined) {
      findings.push(finding('costing.deadheadFactorMissing', 'warning', 'serviceDay', day.id, 'estimateFactors', { serviceDayId: day.id }));
    }
    if (row.revenueHoursPerDay !== undefined) row.annualRevenueHours = row.revenueHoursPerDay * day.annualServiceDays;
    if (row.platformHoursPerDay !== undefined) row.annualPlatformHours = row.platformHoursPerDay * day.annualServiceDays;
    return row;
  });

  if (tripsWithRunTime === 0) {
    findings.push(finding('costing.noTrips', 'warning', 'tripProfile', tripProfile.id));
    return result('noEstimate', dailyRows, [], 'noTrips');
  }
  if (dailyRows.some((row) => row.revenueHoursPerDay === undefined)) return result('noEstimate', dailyRows, [], 'layoverFactorMissing');
  if (assumptions.enteredRate === undefined) {
    findings.push(finding('costing.rateMissing', 'warning', 'costingAssumptions', scenario.id, 'enteredRate'));
    return result('noEstimate', dailyRows, [], 'rateMissing');
  }

  const appliedRates = costingAppliedRates(assumptions);
  if (appliedRates.some(({ rate }) => !Number.isFinite(rate) || rate < 0)) {
    findings.push(finding('costing.adjustedRateInvalid', 'error', 'costingAssumptions', scenario.id, 'annualEscalation'));
    return result('invalid', [], []);
  }

  const costedRows = dailyRows.map((row) => ({
    ...row,
    yearCosts: appliedRates.map(({ serviceYear, rate }) => ({
      serviceYear,
      costPerDayUsd: row.revenueHoursPerDay! * rate,
      annualCostUsd: row.revenueHoursPerDay! * rate * row.annualServiceDays,
    })),
  }));
  const platformKnown = costedRows.every((row) => row.annualPlatformHours !== undefined);
  const yearRows: EstimatedCostingYearResult[] = appliedRates.map(({ serviceYear, rate }) => ({
    serviceYear,
    appliedRateUsdPerRevenueHour: rate,
    annualRunningHours: costedRows.reduce((sum, row) => sum + row.annualRunningHours, 0),
    annualRevenueHours: costedRows.reduce((sum, row) => sum + row.annualRevenueHours!, 0),
    ...(platformKnown ? { annualPlatformHours: costedRows.reduce((sum, row) => sum + row.annualPlatformHours!, 0) } : {}),
    annualCostUsd: costedRows.reduce((sum, row) => sum + row.yearCosts.find((cost) => cost.serviceYear === serviceYear)!.annualCostUsd, 0),
  }));
  const finiteNumbers = [
    ...costedRows.flatMap((row) => [row.runningHoursPerDay, row.annualRunningHours, row.revenueHoursPerDay!, row.annualRevenueHours!, ...(row.platformHoursPerDay !== undefined ? [row.platformHoursPerDay, row.annualPlatformHours!] : []), ...row.yearCosts.flatMap((cost) => [cost.costPerDayUsd, cost.annualCostUsd])]),
    ...yearRows.flatMap((row) => [row.annualRunningHours, row.annualRevenueHours, row.annualCostUsd, ...(row.annualPlatformHours !== undefined ? [row.annualPlatformHours] : [])]),
  ];
  if (!finiteNumbers.every(Number.isFinite)) {
    findings.push(finding('costing.calculationOverflow', 'error', 'scenario', scenario.id));
    return result('invalid', [], []);
  }

  const tripsWithoutRunTime = costedRows.reduce((sum, row) => sum + row.tripsWithoutRunTimeCount, 0);
  return result(tripsWithoutRunTime > 0 ? 'partial' : 'complete', costedRows, yearRows);
}
