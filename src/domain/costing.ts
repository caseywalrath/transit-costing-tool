import type { BlockSummary } from './blocking';
import { sortServiceDays } from './serviceDays';
import type { BlockingBlock, BlockingScenario, CostingAssumptions, Scenario, ServiceDayDefinition, Trip, TripProfile } from './types';

export const MAX_ANNUAL_SERVICE_DAYS = 365;
export const MAX_COSTING_FUTURE_YEARS = 10;
export const MIN_COSTING_YEAR = 1;
export const MAX_COSTING_YEAR = 9999;
export const DEFAULT_COSTING_ESCALATION = 0.03;

/** Editable, Scenario-wide calculation inputs. Persistence metadata is added by Package 5B. */
export interface CostingAssumptionsInput {
  /** Undefined means that the user has not entered a rate yet. */
  enteredRate?: number;
  rateYear: number;
  sourceType: 'user' | 'ntd';
  sourceNote?: string;
  baseServiceYear: number;
  futureYearCount: number;
  annualEscalation: number;
}

export interface CostingCalculationContext {
  scenario: Scenario;
  serviceDays: ServiceDayDefinition[];
  blockingScenario: BlockingScenario;
  tripProfile: TripProfile;
  /** Every saved Trip belonging to the selected Blocking Scenario's source Trip Profile. */
  trips: Trip[];
  blocks: BlockingBlock[];
  /** Derived summaries for these Blocks; summaries are never persisted by costing. */
  blockSummaries: BlockSummary[];
}

export interface CostingCalculationInput extends CostingCalculationContext {
  assumptions: CostingAssumptionsInput;
}

export type CostingFindingSeverity = 'error' | 'warning';
export interface CostingFinding {
  code: string;
  severity: CostingFindingSeverity;
  entityId?: string;
  serviceDayId?: string;
}

export type CostingBlockExclusionReason =
  | 'block.noRevenueTrips'
  | 'block.summaryMissing'
  | 'block.summaryAmbiguous'
  | 'block.sourceMismatch'
  | 'block.invalid'
  | 'block.connectionIncomplete'
  | 'block.connectionConflict'
  | 'block.connectionSummaryMissing'
  | 'block.platformBoundariesMissing'
  | 'block.platformBoundariesInvalid'
  | 'block.revenueHoursInvalid'
  | 'block.platformHoursInvalid';

export interface CostingBlockExclusion {
  blockId: string;
  blockLabel: string;
  reasonCodes: CostingBlockExclusionReason[];
}

export interface CostingDayExclusions {
  serviceDayId: string;
  serviceDayName: string;
  excludedBlockCount: number;
  unassignedTripCount: number;
  blocks: CostingBlockExclusion[];
}

export interface CostingDailyYearResult {
  serviceYear: number;
  costPerDayUsd: number;
  annualCostUsd: number;
}

export interface CostingDailyResult {
  serviceDayId: string;
  serviceDayName: string;
  serviceDayKind: ServiceDayDefinition['kind'];
  annualServiceDays: number;
  eligibleBlockCount: number;
  excludedBlockCount: number;
  unassignedTripCount: number;
  revenueHoursPerDay: number;
  platformHoursPerDay: number;
  annualRevenueHours: number;
  annualPlatformHours: number;
  /** Empty when the rate is not entered. Values retain full calculation precision. */
  yearCosts: CostingDailyYearResult[];
}

export interface CostingYearResult {
  serviceYear: number;
  appliedRateUsdPerRevenueHour: number;
  annualRevenueHours: number;
  annualPlatformHours: number;
  annualCostUsd: number;
}

export type CostingEstimateState = 'invalid' | 'noEstimate' | 'partial' | 'complete';
export type CostingNoEstimateReason = 'noEligibleBlocks' | 'rateMissing';

export interface CostingCalculationResult {
  state: CostingEstimateState;
  noEstimateReason?: CostingNoEstimateReason;
  sourceRate?: number;
  sourceRateYear: number;
  annualEscalation: number;
  eligibleBlockCount: number;
  excludedBlockCount: number;
  unassignedTripCount: number;
  findings: CostingFinding[];
  exclusions: CostingDayExclusions[];
  /** No rows are returned for a no-eligible-Block result. */
  dailyRows: CostingDailyResult[];
  yearRows: CostingYearResult[];
}

export interface BlockEligibilityResult {
  eligible: boolean;
  empty: boolean;
  reasonCodes: CostingBlockExclusionReason[];
}

export function selectCostingBlockingScenario(
  scenarioId: string,
  scenarios: BlockingScenario[],
  selectedBlockingScenarioId?: string,
): BlockingScenario | undefined {
  if (!selectedBlockingScenarioId) return undefined;
  const matches = scenarios.filter((scenario) => scenario.id === selectedBlockingScenarioId && scenario.scenarioId === scenarioId);
  return matches.length === 1 ? matches[0] : undefined;
}

export function validateCostingAssumptions(assumptions: CostingAssumptionsInput): CostingFinding[] {
  const findings: CostingFinding[] = [];
  if (assumptions.enteredRate !== undefined && (!Number.isFinite(assumptions.enteredRate) || assumptions.enteredRate < 0)) {
    findings.push({ code: 'costing.rateInvalid', severity: 'error' });
  }
  if (!isCostingYear(assumptions.rateYear)) findings.push({ code: 'costing.rateYearInvalid', severity: 'error' });
  if (!isCostingYear(assumptions.baseServiceYear)) findings.push({ code: 'costing.baseServiceYearInvalid', severity: 'error' });
  if (isCostingYear(assumptions.rateYear) && isCostingYear(assumptions.baseServiceYear) && assumptions.rateYear > assumptions.baseServiceYear) {
    findings.push({ code: 'costing.rateYearAfterBaseServiceYear', severity: 'error' });
  }
  if (!Number.isInteger(assumptions.futureYearCount) || assumptions.futureYearCount < 0 || assumptions.futureYearCount > MAX_COSTING_FUTURE_YEARS) {
    findings.push({ code: 'costing.futureYearCountInvalid', severity: 'error' });
  }
  if (isCostingYear(assumptions.baseServiceYear) && Number.isInteger(assumptions.futureYearCount)
    && assumptions.futureYearCount >= 0 && assumptions.baseServiceYear + assumptions.futureYearCount > MAX_COSTING_YEAR) {
    findings.push({ code: 'costing.projectionYearOutOfRange', severity: 'error' });
  }
  if (!Number.isFinite(assumptions.annualEscalation) || assumptions.annualEscalation <= -1) {
    findings.push({ code: 'costing.annualEscalationInvalid', severity: 'error' });
  }
  if (assumptions.sourceType !== 'user' && assumptions.sourceType !== 'ntd') {
    findings.push({ code: 'costing.sourceTypeInvalid', severity: 'error' });
  }
  if (assumptions.sourceNote !== undefined && typeof assumptions.sourceNote !== 'string') {
    findings.push({ code: 'costing.sourceNoteInvalid', severity: 'error' });
  }
  return findings;
}

export function validatePersistedCostingAssumptions(
  assumptions: CostingAssumptions,
  expectedScenarioId?: string,
): CostingFinding[] {
  const findings = validateCostingAssumptions(assumptions);
  if (typeof assumptions.id !== 'string' || !assumptions.id.trim()) findings.push({ code: 'costing.assumptionsIdInvalid', severity: 'error' });
  if (typeof assumptions.scenarioId !== 'string' || !assumptions.scenarioId.trim()
    || (expectedScenarioId !== undefined && assumptions.scenarioId !== expectedScenarioId)) {
    findings.push({ code: 'costing.assumptionsScenarioInvalid', severity: 'error' });
  }
  if (assumptions.currencyCode !== 'USD') findings.push({ code: 'costing.currencyInvalid', severity: 'error' });
  if (typeof assumptions.createdAt !== 'string' || !assumptions.createdAt.trim()
    || typeof assumptions.updatedAt !== 'string' || !assumptions.updatedAt.trim()) {
    findings.push({ code: 'costing.assumptionsMetadataInvalid', severity: 'error' });
  }
  return findings;
}

export function validateAnnualServiceDays(serviceDays: ServiceDayDefinition[], scenarioId?: string): CostingFinding[] {
  const findings: CostingFinding[] = [];
  const ids = new Set<string>();
  let total = 0;
  for (const day of serviceDays) {
    if (ids.has(day.id)) findings.push({ code: 'costing.duplicateServiceDay', severity: 'error', entityId: day.id });
    ids.add(day.id);
    if (scenarioId !== undefined && day.scenarioId !== scenarioId) {
      findings.push({ code: 'costing.serviceDayScenarioMismatch', severity: 'error', entityId: day.id, serviceDayId: day.id });
    }
    if (!Number.isInteger(day.annualServiceDays) || day.annualServiceDays < 0) {
      findings.push({ code: 'costing.annualServiceDaysInvalid', severity: 'error', entityId: day.id, serviceDayId: day.id });
      continue;
    }
    total += day.annualServiceDays;
  }
  if (total > MAX_ANNUAL_SERVICE_DAYS) findings.push({ code: 'costing.annualServiceDaysExceed365', severity: 'error' });
  return findings;
}

export function evaluateBlockEligibility(
  block: BlockingBlock,
  summary: BlockSummary | undefined,
  scenario: Scenario,
  blockingScenario: BlockingScenario,
  serviceDayIds: ReadonlySet<string>,
  matchingSummaryCount = summary ? 1 : 0,
): BlockEligibilityResult {
  if (block.activities.length === 0) return { eligible: false, empty: true, reasonCodes: [] };

  const reasonCodes = new Set<CostingBlockExclusionReason>();
  const revenueActivities = block.activities.filter((activity) => activity.type === 'revenueTrip');
  if (revenueActivities.length === 0) reasonCodes.add('block.noRevenueTrips');
  if (block.scenarioId !== scenario.id || block.blockingScenarioId !== blockingScenario.id || !serviceDayIds.has(block.serviceDayId)) {
    reasonCodes.add('block.sourceMismatch');
  }
  if (matchingSummaryCount === 0 || !summary) reasonCodes.add('block.summaryMissing');
  if (matchingSummaryCount > 1) reasonCodes.add('block.summaryAmbiguous');

  if (summary && matchingSummaryCount === 1) {
    if (!summary.valid) reasonCodes.add('block.invalid');

    const pullOuts = block.activities.filter((activity) => activity.type === 'pullOut');
    const pullIns = block.activities.filter((activity) => activity.type === 'pullIn');
    if (pullOuts.length !== 1 || pullIns.length !== 1) {
      reasonCodes.add(pullOuts.length === 0 || pullIns.length === 0 ? 'block.platformBoundariesMissing' : 'block.platformBoundariesInvalid');
    } else {
      const pullOutTiming = summary.activityTimings.find((timing) => timing.activityId === pullOuts[0].id);
      const pullInTiming = summary.activityTimings.find((timing) => timing.activityId === pullIns[0].id);
      if (pullOutTiming?.startTime === undefined || pullInTiming?.endTime === undefined) {
        reasonCodes.add('block.platformBoundariesInvalid');
      } else if (pullOutTiming.startTime < 0 || pullInTiming.endTime < pullOutTiming.startTime) {
        reasonCodes.add('block.platformBoundariesInvalid');
      }
    }

    const expectedConnectionCount = Math.max(0, revenueActivities.length - 1);
    if (summary.connections.length < expectedConnectionCount) reasonCodes.add('block.connectionSummaryMissing');
    if (summary.connections.some((connection) => connection.status === 'incomplete')) reasonCodes.add('block.connectionIncomplete');
    if (summary.connections.some((connection) => connection.status === 'conflict')) reasonCodes.add('block.connectionConflict');

    if (!Number.isFinite(summary.revenueHours) || summary.revenueHours < 0) reasonCodes.add('block.revenueHoursInvalid');
    if (summary.platformHours === undefined || !Number.isFinite(summary.platformHours) || summary.platformHours < 0) {
      reasonCodes.add('block.platformHoursInvalid');
    }
  }

  return {
    eligible: reasonCodes.size === 0 && revenueActivities.length > 0 && Boolean(summary),
    empty: false,
    reasonCodes: [...reasonCodes],
  };
}

export function calculateCosting(input: CostingCalculationInput): CostingCalculationResult {
  const { scenario, blockingScenario, tripProfile, serviceDays, blocks, trips, blockSummaries, assumptions } = input;
  const findings = [
    ...validateCostingAssumptions(assumptions),
    ...validateAnnualServiceDays(serviceDays, scenario.id),
  ];
  if (blockingScenario.scenarioId !== scenario.id) findings.push({ code: 'costing.blockingScenarioMismatch', severity: 'error', entityId: blockingScenario.id });
  if (tripProfile.scenarioId !== scenario.id || tripProfile.id !== blockingScenario.tripProfileId) {
    findings.push({ code: 'costing.tripProfileMismatch', severity: 'error', entityId: tripProfile.id });
  }

  const serviceDayIds = new Set(serviceDays.map((day) => day.id));
  const tripIds = new Set<string>();
  for (const trip of trips) {
    if (tripIds.has(trip.id)) findings.push({ code: 'costing.duplicateTrip', severity: 'error', entityId: trip.id });
    tripIds.add(trip.id);
    if (trip.scenarioId !== scenario.id || trip.tripProfileId !== tripProfile.id || !serviceDayIds.has(trip.serviceDayId)) {
      findings.push({ code: 'costing.tripSourceMismatch', severity: 'error', entityId: trip.id, serviceDayId: trip.serviceDayId });
    }
  }

  const seenBlockIds = new Set<string>();
  for (const block of blocks) {
    if (seenBlockIds.has(block.id)) findings.push({ code: 'costing.duplicateBlock', severity: 'error', entityId: block.id });
    seenBlockIds.add(block.id);
    if (block.scenarioId !== scenario.id || block.blockingScenarioId !== blockingScenario.id || !serviceDayIds.has(block.serviceDayId)) {
      findings.push({ code: 'costing.blockSourceMismatch', severity: 'error', entityId: block.id, serviceDayId: block.serviceDayId });
    }
  }

  const coverage = buildCoverage(input, serviceDayIds);
  if (findings.some((finding) => finding.severity === 'error')) {
    return makeResult(input, 'invalid', findings, coverage, [], []);
  }

  const eligibleBlockCount = coverage.eligibleBlockCount;
  if (eligibleBlockCount === 0) {
    findings.push({ code: 'costing.noEligibleBlocks', severity: 'warning' });
    return makeResult(input, 'noEstimate', findings, coverage, [], [], 'noEligibleBlocks');
  }

  const dailyQuantities = sortServiceDays(serviceDays).map((day) => {
    const row = coverage.days.get(day.id)!;
    const annualRevenueHours = row.revenueHoursPerDay * day.annualServiceDays;
    const annualPlatformHours = row.platformHoursPerDay * day.annualServiceDays;
    return {
      serviceDayId: day.id,
      serviceDayName: day.name,
      serviceDayKind: day.kind,
      annualServiceDays: day.annualServiceDays,
      eligibleBlockCount: row.eligibleBlockCount,
      excludedBlockCount: row.excludedBlocks.length,
      unassignedTripCount: row.unassignedTripCount,
      revenueHoursPerDay: row.revenueHoursPerDay,
      platformHoursPerDay: row.platformHoursPerDay,
      annualRevenueHours,
      annualPlatformHours,
      yearCosts: [] as CostingDailyYearResult[],
    };
  });

  if (assumptions.enteredRate === undefined) {
    findings.push({ code: 'costing.rateMissing', severity: 'warning' });
    return makeResult(input, 'noEstimate', findings, coverage, dailyQuantities, [], 'rateMissing');
  }

  const years = Array.from({ length: assumptions.futureYearCount + 1 }, (_, index) => assumptions.baseServiceYear + index);
  const appliedRates = years.map((serviceYear) => ({
    serviceYear,
    rate: assumptions.enteredRate! * Math.pow(1 + assumptions.annualEscalation, serviceYear - assumptions.rateYear),
  }));
  if (appliedRates.some(({ rate }) => !Number.isFinite(rate) || rate < 0)) {
    findings.push({ code: 'costing.adjustedRateInvalid', severity: 'error' });
    return makeResult(input, 'invalid', findings, coverage, [], []);
  }

  const dayCosts = dailyQuantities.map((row) => ({
    ...row,
    yearCosts: appliedRates.map(({ serviceYear, rate }) => ({
      serviceYear,
      costPerDayUsd: row.revenueHoursPerDay * rate,
      annualCostUsd: row.revenueHoursPerDay * rate * row.annualServiceDays,
    })),
  }));
  const yearRows = appliedRates.map(({ serviceYear, rate }) => {
    const annualRevenueHours = dayCosts.reduce((sum, row) => sum + row.annualRevenueHours, 0);
    const annualPlatformHours = dayCosts.reduce((sum, row) => sum + row.annualPlatformHours, 0);
    const annualCostUsd = dayCosts.reduce((sum, row) => sum + row.yearCosts.find((cost) => cost.serviceYear === serviceYear)!.annualCostUsd, 0);
    return { serviceYear, appliedRateUsdPerRevenueHour: rate, annualRevenueHours, annualPlatformHours, annualCostUsd };
  });
  if (dayCosts.some((row) => ![row.revenueHoursPerDay, row.platformHoursPerDay, row.annualRevenueHours, row.annualPlatformHours, ...row.yearCosts.flatMap((cost) => [cost.costPerDayUsd, cost.annualCostUsd])].every(Number.isFinite))
    || yearRows.some((row) => ![row.annualRevenueHours, row.annualPlatformHours, row.annualCostUsd].every(Number.isFinite))) {
    findings.push({ code: 'costing.calculationOverflow', severity: 'error' });
    return makeResult(input, 'invalid', findings, coverage, [], []);
  }

  const hasExclusions = coverage.excludedBlockCount > 0 || coverage.unassignedTripCount > 0;
  return makeResult(input, hasExclusions ? 'partial' : 'complete', findings, coverage, dayCosts, yearRows);
}

/** Round a displayed number using decimal half-away-from-zero rules. */
export function roundCostingDisplay(value: number, decimalPlaces: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Costing display values must be finite.');
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 20) throw new RangeError('Decimal places must be an integer from 0 through 20.');
  const negative = value < 0;
  const [coefficient, exponentText] = Math.abs(value).toString().toLowerCase().split('e');
  const exponent = exponentText ? Number(exponentText) : 0;
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = BigInt(`${whole}${fraction}`);
  const shift = exponent - fraction.length + decimalPlaces;
  let rounded: bigint;
  if (shift >= 0) {
    rounded = digits * (10n ** BigInt(shift));
  } else {
    const divisor = 10n ** BigInt(-shift);
    const quotient = digits / divisor;
    const remainder = digits % divisor;
    rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  }
  const result = Number(rounded) / (10 ** decimalPlaces);
  return negative ? -result : result;
}

interface DayCoverage {
  eligibleBlockCount: number;
  revenueHoursPerDay: number;
  platformHoursPerDay: number;
  excludedBlocks: CostingBlockExclusion[];
  unassignedTripCount: number;
}

interface Coverage {
  days: Map<string, DayCoverage>;
  exclusions: CostingDayExclusions[];
  eligibleBlockCount: number;
  excludedBlockCount: number;
  unassignedTripCount: number;
}

function buildCoverage(input: CostingCalculationInput, serviceDayIds: ReadonlySet<string>): Coverage {
  const days = new Map<string, DayCoverage>(input.serviceDays.map((day) => [day.id, {
    eligibleBlockCount: 0,
    revenueHoursPerDay: 0,
    platformHoursPerDay: 0,
    excludedBlocks: [],
    unassignedTripCount: 0,
  }]));
  const summariesByBlock = new Map<string, BlockSummary[]>();
  for (const summary of input.blockSummaries) summariesByBlock.set(summary.blockId, [...(summariesByBlock.get(summary.blockId) ?? []), summary]);
  const assignedTripIds = new Set(input.blocks.flatMap((block) => block.activities.flatMap((activity) => activity.type === 'revenueTrip' ? [activity.tripId] : [])));

  for (const block of input.blocks) {
    const day = days.get(block.serviceDayId);
    if (!day) continue;
    const matchingSummaries = summariesByBlock.get(block.id) ?? [];
    const eligibility = evaluateBlockEligibility(block, matchingSummaries[0], input.scenario, input.blockingScenario, serviceDayIds, matchingSummaries.length);
    if (eligibility.empty) continue;
    if (!eligibility.eligible) {
      day.excludedBlocks.push({ blockId: block.id, blockLabel: block.label, reasonCodes: eligibility.reasonCodes });
      continue;
    }
    const summary = matchingSummaries[0];
    day.eligibleBlockCount += 1;
    day.revenueHoursPerDay += summary.revenueHours;
    day.platformHoursPerDay += summary.platformHours!;
  }

  for (const trip of input.trips) {
    if (assignedTripIds.has(trip.id)) continue;
    const day = days.get(trip.serviceDayId);
    if (day) day.unassignedTripCount += 1;
  }

  const exclusions = sortServiceDays(input.serviceDays).map((day) => {
    const row = days.get(day.id)!;
    return {
      serviceDayId: day.id,
      serviceDayName: day.name,
      excludedBlockCount: row.excludedBlocks.length,
      unassignedTripCount: row.unassignedTripCount,
      blocks: row.excludedBlocks,
    };
  });
  return {
    days,
    exclusions,
    eligibleBlockCount: [...days.values()].reduce((sum, day) => sum + day.eligibleBlockCount, 0),
    excludedBlockCount: [...days.values()].reduce((sum, day) => sum + day.excludedBlocks.length, 0),
    unassignedTripCount: [...days.values()].reduce((sum, day) => sum + day.unassignedTripCount, 0),
  };
}

function makeResult(
  input: CostingCalculationInput,
  state: CostingEstimateState,
  findings: CostingFinding[],
  coverage: Coverage,
  dailyRows: CostingDailyResult[],
  yearRows: CostingYearResult[],
  noEstimateReason?: CostingNoEstimateReason,
): CostingCalculationResult {
  return {
    state,
    ...(noEstimateReason ? { noEstimateReason } : {}),
    ...(input.assumptions.enteredRate !== undefined && Number.isFinite(input.assumptions.enteredRate) ? { sourceRate: input.assumptions.enteredRate } : {}),
    sourceRateYear: input.assumptions.rateYear,
    annualEscalation: input.assumptions.annualEscalation,
    eligibleBlockCount: coverage.eligibleBlockCount,
    excludedBlockCount: coverage.excludedBlockCount,
    unassignedTripCount: coverage.unassignedTripCount,
    findings,
    exclusions: coverage.exclusions,
    dailyRows,
    yearRows,
  };
}

function isCostingYear(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_COSTING_YEAR && value <= MAX_COSTING_YEAR;
}
