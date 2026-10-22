// Phase 3 reproduction for A-004 consequences (finding 3-006). Asserts EXPECTED
// behaviour: a duplicated Scenario evaluates its Blocks exactly as the source
// does. FAILS on the reviewed code when a Block holds a deadhead, because the
// copied deadhead keeps the source Scenario's Node IDs (project.ts:222) while
// the copied Trips' Patterns use the copy's Nodes.
// Defect tests use it.fails: they assert the expected behaviour, fail on the reviewed code,
// and are reported as passing so the golden suite stays green. Change it.fails to it to see the failure.
// Run: pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p3-a004-consequences.golden.test.ts
import { describe, it, expect } from 'vitest';
import { importProjectJson } from '../../../src/persistence/backup';
import { duplicateScenario, snapshotForScenario } from '../../../src/domain/project';
import { summarizeBlock } from '../../../src/domain/blocking';
import { evaluateBlockEligibility } from '../../../src/domain/costing';
import { goldenAugmented } from './p3-fixture';

function measure(r: any) {
  const out: Record<string, { eligible: boolean; revenue?: number; findings: string[] }> = {};
  for (const bs of r.blockingScenarios) for (const b of r.blocks.filter((k: any) => k.blockingScenarioId === bs.id)) {
    const s: any = summarizeBlock(b, { scenario: r.scenario, blockingScenario: bs, trips: r.trips, patterns: r.patterns } as any);
    const e: any = evaluateBlockEligibility(b, s, r.scenario, bs, new Set(r.serviceDays.map((d: any) => d.id)) as any);
    out[`${bs.name}/${b.label}/${r.serviceDays.find((d: any) => d.id === b.serviceDayId).name}`] = { eligible: Boolean(e.eligible), revenue: s.revenueHours, findings: (s.findings ?? []).map((f: any) => f.ruleId).sort() };
  }
  return out;
}

describe('A-004 consequences (3-006)', () => {
  it.fails('EXPECTED: a duplicated Scenario keeps every Block finding and eligibility when a Block has a deadhead', () => {
    const raw = goldenAugmented();
    raw.blocks = raw.blocks.map((b: any) => { const { tripProfileId, ...rest } = b; return rest; });
    const snap = importProjectJson(JSON.stringify(raw));
    // Use stored-shape blocks (no stray tripProfileId) so the 3-001/3-002 defects do not interfere.
    const storedShape = { ...snap, blocks: raw.blocks } as any;
    const source = snapshotForScenario(storedShape, snap.scenarios[0].id)!;
    const copy = duplicateScenario({ ...source, blocks: source.blocks.filter((b: any) => b.blockingScenarioId !== 'p3-alt-blocking'), blockingScenarios: source.blockingScenarios!.filter((s) => s.id !== 'p3-alt-blocking') }, 'Copy');
    const a = measure({ ...source, blocks: source.blocks.filter((b: any) => b.blockingScenarioId !== 'p3-alt-blocking'), blockingScenarios: source.blockingScenarios!.filter((s) => s.id !== 'p3-alt-blocking') });
    const b = measure(copy);
    const changed = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    console.log('[A-004] blocks whose evaluation changed in the copy:', JSON.stringify(changed.map((k) => ({ block: k, source: a[k], copy: b[k] }))));
    expect(changed).toEqual([]);
  });
});
