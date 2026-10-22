// Phase 6 helper check: the capacity fixture passes the app import validation. Run:
//   pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts p6-capacity-validate
import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { importProjectJson } from '../../../src/persistence/backup';
import { capacityBackup } from './p6-capacity-fixture';
const SCRATCH = process.env.P6_SCRATCH ?? '';
it('capacity fixture imports', () => {
  for (const [name, o] of [['capacity-full', {}], ['capacity-unassigned', { tripsPerBlock: 2 }]] as const) {
    const b = capacityBackup(o); const text = JSON.stringify(b);
    const snap = importProjectJson(text);
    expect(snap.trips.length).toBe(2000);
    expect(snap.blocks.length).toBe(name === 'capacity-full' ? 400 : 400);
    if (SCRATCH) { mkdirSync(SCRATCH, { recursive: true }); writeFileSync(`${SCRATCH}/${name}.json`, text); }
    console.log(name, text.length, 'bytes');
  }
});
it('capacity variants import', () => {
  for (const [name, o] of [['capacity-oneDir-blend', { allOutbound: true, calculationMethod: 'blendSegments' }], ['capacity-unassigned', { tripsPerBlock: 2 }]] as const) {
    const text = JSON.stringify(capacityBackup(o as any));
    importProjectJson(text);
    if (SCRATCH) writeFileSync(`${SCRATCH}/${name}.json`, text);
  }
});

it('capacity 100-unassigned variant imports', () => {
  const text = JSON.stringify(capacityBackup({ tripsPerBlock: 4 }));
  importProjectJson(text);
  if (SCRATCH) writeFileSync(`${SCRATCH}/capacity-unassigned100.json`, text);
});
