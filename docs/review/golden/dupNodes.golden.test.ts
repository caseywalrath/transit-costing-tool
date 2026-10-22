import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { it, expect } from 'vitest';
import { importProjectJson } from '../../../src/persistence/backup';
import { duplicateScenario, snapshotForScenario } from '../../../src/domain/project';
import { summarizeBlock } from '../../../src/domain/blocking';

it('scenario duplication remaps non-revenue activity Node references', () => {
  const snap = importProjectJson(readFileSync(fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url)), 'utf8'));
  const source = snapshotForScenario(snap as any, snap.scenarios[0].id)!;
  const copy = duplicateScenario(source, 'Copy');
  const copyNodeIds = new Set(copy.nodes.map((n) => n.id));
  const sourceNodeIds = new Set(source.nodes.map((n) => n.id));
  let total = 0, pointingAtSource = 0;
  for (const block of copy.blocks) for (const a of block.activities as any[]) for (const k of ['fromNodeId', 'toNodeId']) if (a[k]) { total++; if (sourceNodeIds.has(a[k]) && !copyNodeIds.has(a[k])) pointingAtSource++; }
  console.log(JSON.stringify({ nodeRefs: total, pointingAtSourceScenario: pointingAtSource }));
  expect(pointingAtSource).toBe(0);
});

import { evaluateBlockEligibility } from '../../../src/domain/costing';
it('duplicated Scenario keeps the source Block eligibility and hours', () => {
  const snap = importProjectJson(readFileSync(fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url)), 'utf8'));
  const measure = (r: any) => {
    const bs = r.blockingScenarios[0]; const dayIds = new Set(r.serviceDays.map((d: any) => d.id));
    let eligible = 0, rev = 0, findings = new Set<string>();
    for (const b of r.blocks) { const s = summarizeBlock(b, { scenario: r.scenario, blockingScenario: bs, trips: r.trips, patterns: r.patterns } as any); const e = evaluateBlockEligibility(b, s, r.scenario, bs, dayIds as any); if ((e as any).eligible) { eligible++; rev += s.revenueHours ?? 0; } for (const f of (s as any).findings ?? []) findings.add(f.ruleId); }
    return { eligible, rev: Math.round(rev * 100) / 100, findings: [...findings].sort() };
  };
  const source = snapshotForScenario(snap as any, snap.scenarios[0].id)!;
  const a = measure(source), b = measure(duplicateScenario(source, 'Copy'));
  console.log(JSON.stringify({ source: a, copy: b }));
  expect(b).toEqual(a);
});
