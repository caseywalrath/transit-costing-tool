// The Costing assumptions of each side and the rate choice of Decision 0091 item 6. Nothing here calculates Costing: it only picks
// which stored values a side's Costing run is given, the way the Costing tab does for one Scenario.

import { DEFAULT_COSTING_ESCALATION, type CostingAssumptionsInput } from '../../domain/costing';
import { estimateFactorsForTripProfile, routeEstimateFactorsForTripProfile } from '../../domain/estimatedCosting';
import type { CostingAssumptions, EntityId } from '../../domain/types';
import type { CompareRateValues } from './compareTypes';
import type { SideChoice } from '../../domain/compare/types';

/** The assumptions of a Scenario that has none saved: no rate, so its side cannot be costed. */
function defaultAssumptions(year: number): CostingAssumptionsInput {
  return { rateYear: year, sourceType: 'user', baseServiceYear: year, futureYearCount: 10, annualEscalation: DEFAULT_COSTING_ESCALATION };
}

/**
 * One side's own assumptions as Costing is given them (as the Costing tab builds them). The estimate factors are those of the side's own
 * Trip Profile and are used only by the estimated basis; they always stay with their side (item 6).
 */
export function sideAssumptions(record: CostingAssumptions | undefined, tripProfileId: EntityId, estimated: boolean, year: number): CostingAssumptionsInput {
  if (!record) return defaultAssumptions(year);
  const input: CostingAssumptionsInput = {
    ...(record.enteredRate === undefined ? {} : { enteredRate: record.enteredRate }),
    rateYear: record.rateYear,
    sourceType: record.sourceType,
    ...(record.sourceNote === undefined ? {} : { sourceNote: record.sourceNote }),
    baseServiceYear: record.baseServiceYear,
    futureYearCount: record.futureYearCount,
    annualEscalation: record.annualEscalation,
  };
  if (!estimated) return input;
  const factors = estimateFactorsForTripProfile(record, tripProfileId).factors;
  return { ...input, ...(factors ? { estimateFactors: factors } : {}), routeEstimateFactors: routeEstimateFactorsForTripProfile(record, tripProfileId) };
}

/** The part of the assumptions that item 6 moves between sides: the entered rate, its year, the first service year, escalation and future years. */
export function rateValues(assumptions: CostingAssumptionsInput): CompareRateValues {
  return {
    ...(assumptions.enteredRate === undefined ? {} : { enteredRate: assumptions.enteredRate }),
    rateYear: assumptions.rateYear,
    baseServiceYear: assumptions.baseServiceYear,
    futureYearCount: assumptions.futureYearCount,
    annualEscalation: assumptions.annualEscalation,
  };
}

export function sameRates(left: CompareRateValues, right: CompareRateValues): boolean {
  return left.enteredRate === right.enteredRate && left.rateYear === right.rateYear && left.baseServiceYear === right.baseServiceYear
    && left.futureYearCount === right.futureYearCount && left.annualEscalation === right.annualEscalation;
}

/** Decision 0091 item 6. The chosen side's rate values replace the other side's; each side keeps its own estimate factors and rate source. */
export function applyRateChoice(choice: SideChoice, baseline: CostingAssumptionsInput, proposed: CostingAssumptionsInput): { baseline: CostingAssumptionsInput; proposed: CostingAssumptionsInput } {
  if (choice === 'own') return { baseline, proposed };
  const source = choice === 'baseline' ? baseline : proposed;
  const replace = (target: CostingAssumptionsInput): CostingAssumptionsInput => {
    const { enteredRate: _dropped, ...rest } = target;
    return { ...rest, ...(source.enteredRate === undefined ? {} : { enteredRate: source.enteredRate }), rateYear: source.rateYear, baseServiceYear: source.baseServiceYear, futureYearCount: source.futureYearCount, annualEscalation: source.annualEscalation };
  };
  return choice === 'baseline' ? { baseline, proposed: replace(proposed) } : { baseline: replace(baseline), proposed };
}
