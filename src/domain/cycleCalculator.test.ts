import { describe, expect, it } from 'vitest';
import { calculatorRevenueHours, solveCycle } from './cycleCalculator';

describe('solveCycle (Decision 0063): the Westracks Dinosaur Lot case', () => {
  it('solves vehicles from layover and headway, unrounded and rounded up', () => {
    const exact = solveCycle({ runningMinutes: 79, layoverFraction: 0.156, headwayMinutes: 15 }, 'vehicles');
    expect(exact.cycleMinutes).toBeCloseTo(93.60, 2);
    expect(exact.vehicles).toBeCloseTo(6.24, 2);
    const whole = solveCycle({ runningMinutes: 79, layoverFraction: 0.156, headwayMinutes: 15 }, 'vehicles', true);
    expect(whole).toMatchObject({ vehicles: 7, cycleMinutes: 105 });
    expect(whole.layoverFraction).toBeCloseTo(1 - 79 / 105, 12);
  });

  it('solves layover from vehicles and headway, and reports a cycle shorter than the running time', () => {
    expect(solveCycle({ runningMinutes: 79, headwayMinutes: 15, vehicles: 6 }, 'layover').layoverFraction).toBeCloseTo(1 - 79 / 90, 12);
    const short = solveCycle({ runningMinutes: 79, headwayMinutes: 15, vehicles: 5 }, 'layover');
    expect(short.problem).toBe('cycleShorterThanRunning');
    expect(short.layoverFraction).toBeUndefined();
  });

  it('solves headway from layover and vehicles, and ignores rounding when not solving vehicles', () => {
    expect(solveCycle({ runningMinutes: 70, layoverFraction: 0.2222, vehicles: 6 }, 'headway', true).headwayMinutes).toBeCloseTo(70 / 0.7778 / 6, 9);
  });

  it('reports missing or unusable inputs', () => {
    for (const [inputs, mode] of [
      [{ runningMinutes: 0, layoverFraction: 0.2, headwayMinutes: 15 }, 'vehicles'],
      [{ runningMinutes: 70, layoverFraction: 1, headwayMinutes: 15 }, 'vehicles'],
      [{ runningMinutes: 70, layoverFraction: 0.2 }, 'vehicles'],
      [{ runningMinutes: 70, headwayMinutes: 15, vehicles: 0 }, 'layover'],
      [{ runningMinutes: 70, layoverFraction: Number.NaN, vehicles: 6 }, 'headway'],
    ] as const) expect(solveCycle(inputs, mode).problem).toBe('inputMissing');
  });

  it('scales the schedule’s running hours to a typed running cycle and applies the layover', () => {
    const result = solveCycle({ runningMinutes: 79, headwayMinutes: 15, vehicles: 6 }, 'layover');
    expect(calculatorRevenueHours(38.1833, 79, result)).toBeCloseTo(38.1833 / (79 / 90), 6);
    const faster = solveCycle({ runningMinutes: 70, headwayMinutes: 15, vehicles: 6 }, 'layover');
    expect(calculatorRevenueHours(38.1833, 79, faster)).toBeCloseTo(38.1833 * 70 / 79 / (70 / 90), 6);
    expect(calculatorRevenueHours(38.1833, 79, { runningMinutes: 79, problem: 'inputMissing' })).toBeUndefined();
  });
});
