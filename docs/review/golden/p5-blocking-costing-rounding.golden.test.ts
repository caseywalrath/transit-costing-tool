// Backs finding B3-07 (Blocking hours display uses toFixed(2), Costing uses half-away-from-zero). Run: pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p5-blocking-costing-rounding.golden.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { importProjectJson } from '../../../src/persistence/backup';
import { summarizeBlock } from '../../../src/domain/blocking';
import { roundCostingDisplay } from '../../../src/domain/costing';

const BACKUP = fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url));
const snap = importProjectJson(readFileSync(BACKUP, 'utf8'));

// BlockingWorkspace.tsx:81 formats hours as value.toFixed(2). Expected: the same 2-decimal text as the Costing rule (half away from zero).
it.fails('Blocking 2-decimal hours text equals the Costing half-away rounding for every golden Block quantity', () => {
  const blockingScenario = snap.blockingScenarios![0];
  const trips = snap.trips.filter((trip) => trip.tripProfileId === blockingScenario.tripProfileId);
  const mismatches: string[] = [];
  for (const block of snap.blocks as any[]) {
    const summary: any = summarizeBlock(block, { scenario: snap.scenarios[0], blockingScenario, trips, patterns: snap.patterns });
    for (const key of ['revenueHours', 'platformHours', 'layoverHours', 'runningHours', 'deadheadHours']) {
      const value = summary[key] as number;
      if (value.toFixed(2) !== roundCostingDisplay(value, 2).toFixed(2)) mismatches.push(`${block.label} ${key} ${value}: ${value.toFixed(2)} vs ${roundCostingDisplay(value, 2).toFixed(2)}`);
    }
  }
  expect(mismatches).toEqual([]); // currently 14 mismatches, e.g. Block 22 revenueHours 14.575 shows 14.57
});
