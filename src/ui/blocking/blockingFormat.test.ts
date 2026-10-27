// Review package U05 (I-088, finding 5-020): Blocking shows hours and miles with the Costing rounding, so a Block reads the same in both
// workspaces. Ported from the review's p5-blocking-costing-rounding reproduction (14 of 345 Block quantities differed).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { summarizeBlock } from '../../domain/blocking';
import { roundCostingDisplay } from '../../domain/costing';
import { formatBlockingHours, formatBlockingMiles } from './BlockingWorkspace';

const BACKUP = fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url));
const snapshot = JSON.parse(readFileSync(BACKUP, 'utf8'));

describe('Blocking hours and miles', () => {
  it('round half away from zero on the decimal text, as Costing does', () => {
    expect(formatBlockingHours(14.575)).toBe('14.58 h');
    expect(formatBlockingHours(1.005)).toBe('1.01 h');
    expect(formatBlockingHours(0)).toBe('0.00 h');
    expect(formatBlockingHours(undefined)).toBe('Incomplete');
    expect(formatBlockingMiles(2.675)).toBe('2.68 mi');
    expect(formatBlockingMiles(undefined)).toBe('Incomplete');
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
        expect(formatBlockingHours(value)).toBe(`${roundCostingDisplay(value, 2).toFixed(2)} h`);
        if (value.toFixed(2) !== roundCostingDisplay(value, 2).toFixed(2)) differing.push(`${block.label} ${key}`);
        if (block.label === '22' && key === 'revenueHours' && value === 14.575) block22 = formatBlockingHours(value);
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(differing.length).toBeGreaterThan(0); // the quantities where toFixed(2) used to differ
    expect(block22).toBe('14.58 h');
  });
});
