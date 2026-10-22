// Phase 1 reproduction (doc-vs-code): Decision 0019 item 13 says JSON version 4
// placeholder Blocks "are discarded when normalized into the Phase 4 schema".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { it, expect } from 'vitest';
import { importProjectJson, parseProjectBackup } from '../../../src/persistence/backup';

it('a version 4 backup with placeholder Blocks: are they discarded on import?', () => {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL('../../../output/federal-brt-import/federal-brt-project-backup.json', import.meta.url)), 'utf8'));
  const profileByScenario = new Map(raw.tripProfiles.map((p: any) => [p.scenarioId, p.id]));
  const v4 = { ...raw, exportSchemaVersion: 4 };
  delete v4.blockingScenarios; delete v4.costingAssumptions;
  v4.blocks = raw.blocks.map((b: any) => { const { blockingScenarioId, ...rest } = b; return { ...rest, tripProfileId: profileByScenario.get(b.scenarioId) }; });
  const parsed = parseProjectBackup(JSON.stringify(v4));
  const imported = importProjectJson(JSON.stringify(v4));
  console.log(JSON.stringify({ inputPlaceholderBlocks: v4.blocks.length, parsedBlocks: parsed.blocks.length, importedBlocks: imported.blocks.length, importedWithBlockingScenario: imported.blocks.filter((b: any) => b.blockingScenarioId).length, blockingScenarios: (imported as any).blockingScenarios?.length ?? 0 }));
  // Decision 0019 item 13 expectation:
  expect(imported.blocks.length).toBe(0);
});
