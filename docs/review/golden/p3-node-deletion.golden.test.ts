// Phase 3 reproduction for finding 3-007 (Node deletion leaves Block activities
// pointing at a deleted Node) and 3-008 (the unused RouteDefinitionService.deleteNode
// writes in two transactions and saves only one Route's Nodes/Patterns/Directions
// as the whole Scenario's). Asserts EXPECTED behaviour; both tests FAIL on the reviewed code.
// Defect tests use it.fails: they assert the expected behaviour, fail on the reviewed code,
// and are reported as passing so the golden suite stays green. Change it.fails to it to see the failure.
// Run: pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p3-node-deletion.golden.test.ts
import { describe, it, expect } from 'vitest';
import { ProjectBackupService } from '../../../src/persistence/backupRepository';
import { InMemoryRouteDefinitionRepository } from '../../../src/persistence/inMemoryRepository';
import { RouteDefinitionService } from '../../../src/application/routeDefinitionService';
import { goldenRaw } from './p3-fixture';

async function seeded(withGarage = true) {
  const raw = goldenRaw();
  const route = raw.routes[0];
  if (withGarage) {
    raw.nodes.push({ id: 'p3-garage', scenarioId: route.scenarioId, routeId: route.id, name: 'Garage', kind: 'garage', createdAt: raw.exportedAt, updatedAt: raw.exportedAt });
    for (const block of raw.blocks) for (const a of block.activities) { if (a.type === 'pullOut') a.fromNodeId = 'p3-garage'; if (a.type === 'pullIn') a.toNodeId = 'p3-garage'; }
  }
  const repository = new InMemoryRouteDefinitionRepository();
  await repository.saveProjectSnapshot({ ...raw, generationSets: [] });
  const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (s) => repository.saveProjectSnapshot(s));
  return { raw, repository, service: new RouteDefinitionService(repository, backup) };
}
const garageRefs = (blocks: any[]) => blocks.flatMap((b) => b.activities).filter((a: any) => a.fromNodeId === 'p3-garage' || a.toNodeId === 'p3-garage').length;

describe('Node deletion and Block activities', () => {
  it.fails('3-007 EXPECTED: deleting a Node through the reviewed Node editor removes (or reports) Block activities that reference it', async () => {
    const { raw, repository, service } = await seeded();
    const aggregate = (await repository.getRouteDefinition(raw.routes[0].id))!;
    const preview = await service.previewNodeChanges(aggregate.route.id, aggregate.nodes.filter((n) => n.id !== 'p3-garage'));
    console.log('[3-007] preview keys:', Object.keys(preview).join(','), 'impact.blockIds:', preview.impact.blockIds.length);
    await service.commitNodeChanges(preview.previewToken);
    const after = (await repository.getScenarioRecords(raw.scenarios[0].id))!;
    console.log('[3-007] node stored:', repository.nodes.has('p3-garage'), 'activities still referencing deleted node:', garageRefs(after.blocks));
    expect(garageRefs(after.blocks)).toBe(0);
  });
  it.fails('3-008 EXPECTED: RouteDefinitionService.deleteNode keeps other Routes intact and is atomic', async () => {
    const { raw, repository, service } = await seeded();
    const records = (await repository.getScenarioRecords(raw.scenarios[0].id))!;
    const dup = await service.duplicateRoute(records, raw.routes[0].id, 'Second route');
    const before = { nodes: repository.nodes.size, patterns: repository.patterns.size, otherRouteNodes: [...repository.nodes.values()].filter((n) => n.routeId === dup.route.id).length };
    const aggregate = (await repository.getRouteDefinition(raw.routes[0].id))!;
    let error = 'ok'; try { await service.deleteNode(aggregate, 'p3-garage'); } catch (e) { error = (e as Error).message; }
    const after = { nodes: repository.nodes.size, patterns: repository.patterns.size, otherRouteNodes: [...repository.nodes.values()].filter((n) => n.routeId === dup.route.id).length, garageStored: repository.nodes.has('p3-garage'), activitiesStillReferencing: garageRefs([...repository.blocks.values()]) };
    console.log('[3-008] deleteNode with two Routes:', error, JSON.stringify({ before, after }));
    expect(error).toBe('ok');
    expect(after.otherRouteNodes).toBe(before.otherRouteNodes);
  });
  it.fails('3-008 EXPECTED: deleteNode on a Route without runtime profiles in the other Route does not delete the other Route', async () => {
    const { raw, repository, service } = await seeded();
    const records = (await repository.getScenarioRecords(raw.scenarios[0].id))!;
    const dup = await service.duplicateRoute(records, raw.routes[0].id, 'Second route');
    // Remove the second Route's runtime data so assertRuntimeGraph does not stop the second write.
    const r2 = (await repository.getScenarioRecords(raw.scenarios[0].id))!;
    const r2Patterns = new Set(r2.patterns.filter((p) => p.routeId === dup.route.id).map((p) => p.id));
    await repository.saveScenarioRecords({ ...r2, runtimeProfiles: r2.runtimeProfiles.filter((p) => !r2Patterns.has(p.patternId)), runtimeAssignments: r2.runtimeAssignments.filter((a) => !r2Patterns.has(a.patternId)), trips: r2.trips.filter((t) => t.routeId !== dup.route.id) });
    const otherBefore = [...repository.nodes.values()].filter((n) => n.routeId === dup.route.id).length;
    const otherPatternsBefore = [...repository.patterns.values()].filter((p) => p.routeId === dup.route.id).length;
    const aggregate = (await repository.getRouteDefinition(raw.routes[0].id))!;
    let error = 'ok'; try { await service.deleteNode(aggregate, 'p3-garage'); } catch (e) { error = (e as Error).message; }
    const otherAfter = [...repository.nodes.values()].filter((n) => n.routeId === dup.route.id).length;
    const otherPatternsAfter = [...repository.patterns.values()].filter((p) => p.routeId === dup.route.id).length;
    console.log('[3-008] second Route nodes before/after:', otherBefore, otherAfter, 'patterns before/after:', otherPatternsBefore, otherPatternsAfter, 'route record kept:', repository.routes.has(dup.route.id), 'error:', error);
    expect(otherAfter).toBe(otherBefore);
  });
});
