// Review package U05 (I-088, finding 5-020): Blocking shows hours and miles with the Costing rounding, so a Block reads the same in both
// workspaces. Ported from the review's p5-blocking-costing-rounding reproduction (14 of 345 Block quantities differed).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { summarizeBlock } from '../../domain/blocking';
import { roundCostingDisplay } from '../../domain/costing';
import { formatHours, formatMiles, INCOMPLETE, withUnit } from '../format';

const BACKUP = fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url));
const snapshot = JSON.parse(readFileSync(BACKUP, 'utf8'));

describe('Blocking hours and miles', () => {
  it('round half away from zero on the decimal text, as Costing does', () => {
    expect(withUnit(formatHours(14.575, 'daily'), 'h')).toBe('14.58 h');
    expect(withUnit(formatHours(1.005, 'daily'), 'h')).toBe('1.01 h');
    expect(withUnit(formatHours(0, 'daily'), 'h')).toBe('0.00 h');
    expect(formatHours(undefined, 'daily')).toBe(INCOMPLETE);
    expect(withUnit(formatMiles(2.675), 'mi')).toBe('2.68 mi');
    expect(formatMiles(undefined)).toBe(INCOMPLETE);
  });

  it('show every golden Block quantity exactly as the Costing rule rounds it, including Block 22 (14.575 revenue hours)', () => {
    const blockingScenario = snapshot.blockingScenarios[0];
    const trips = snapshot.trips.filter((trip: { tripProfileId?: string }) => trip.tripProfileId === blockingScenario.tripProfileId);
    const differing: string[] = []; let checked = 0; let block22: string | undefined;
    for (const block of snapshot.blocks) {
      const summary = summarizeBlock(block, { scenario: snapshot.scenarios[0], blockingScenario, trips, patterns: snapshot.patterns });
      for (const key of ['revenueHours', 'platformHours', 'layoverHours', 'runningHours', 'deadheadHours'] as const) {
        const value = summary[key]; if (value === undefined) continue;
        checked += 1;
        expect(formatHours(value, 'daily')).toBe(roundCostingDisplay(value, 2).toFixed(2));
        if (value.toFixed(2) !== roundCostingDisplay(value, 2).toFixed(2)) differing.push(`${block.label} ${key}`);
        if (block.label === '22' && key === 'revenueHours' && value === 14.575) block22 = formatHours(value, 'daily');
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(differing.length).toBeGreaterThan(0); // the quantities where toFixed(2) used to differ
    expect(block22).toBe('14.58');
  });
});
