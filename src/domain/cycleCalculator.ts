/**
 * The Vehicle requirement calculator of the Costing screen (Decision 0063): vehicles = cycle with layover ÷ headway, and
 * cycle with layover = running cycle ÷ (1 − layover). Given the running cycle, one of layover, headway, and vehicles is solved from the
 * other two. Pure; nothing here is stored.
 */

export type CycleSolveFor = 'vehicles' | 'layover' | 'headway';

export interface CycleInputs {
  runningMinutes: number;
  /** A fraction from 0 up to but not including 1. Used unless it is solved for. */
  layoverFraction?: number;
  headwayMinutes?: number;
  vehicles?: number;
}

export type CycleProblem = 'inputMissing' | 'cycleShorterThanRunning';

export interface CycleResult {
  runningMinutes: number;
  layoverFraction?: number;
  cycleMinutes?: number;
  headwayMinutes?: number;
  vehicles?: number;
  problem?: CycleProblem;
}

const positive = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value > 0;
const fraction = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value >= 0 && value < 1;

/**
 * Solves one value from the others. With `roundVehicles` (only when solving for vehicles), vehicles round up to a whole number and the
 * layover grows to fill the longer cycle.
 */
export function solveCycle(inputs: CycleInputs, solveFor: CycleSolveFor, roundVehicles = false): CycleResult {
  const { runningMinutes: run, layoverFraction: layover, headwayMinutes: headway, vehicles } = inputs;
  const missing: CycleResult = { runningMinutes: run, problem: 'inputMissing' };
  if (!positive(run)) return missing;
  if (solveFor === 'vehicles') {
    if (!fraction(layover) || !positive(headway)) return missing;
    const cycle = run / (1 - layover);
    if (!roundVehicles) return { runningMinutes: run, layoverFraction: layover, cycleMinutes: cycle, headwayMinutes: headway, vehicles: cycle / headway };
    const whole = Math.ceil(cycle / headway - 1e-9);
    return { runningMinutes: run, layoverFraction: 1 - run / (whole * headway), cycleMinutes: whole * headway, headwayMinutes: headway, vehicles: whole };
  }
  if (solveFor === 'layover') {
    if (!positive(headway) || !positive(vehicles)) return missing;
    const cycle = vehicles * headway;
    if (cycle <= run) return { runningMinutes: run, cycleMinutes: cycle, headwayMinutes: headway, vehicles, problem: 'cycleShorterThanRunning' };
    return { runningMinutes: run, layoverFraction: 1 - run / cycle, cycleMinutes: cycle, headwayMinutes: headway, vehicles };
  }
  if (!fraction(layover) || !positive(vehicles)) return missing;
  const cycle = run / (1 - layover);
  return { runningMinutes: run, layoverFraction: layover, cycleMinutes: cycle, headwayMinutes: cycle / vehicles, vehicles };
}

/**
 * Revenue hours per day for a calculator row: the schedule's running hours, scaled when the planner types another running cycle, divided by
 * (1 − layover), as the estimated cost basis does. Undefined without a layover.
 */
export function calculatorRevenueHours(scheduleRunningHours: number, scheduleRunningMinutes: number, result: CycleResult): number | undefined {
  if (result.layoverFraction === undefined || !positive(scheduleRunningMinutes)) return undefined;
  return scheduleRunningHours * (result.runningMinutes / scheduleRunningMinutes) / (1 - result.layoverFraction);
}
