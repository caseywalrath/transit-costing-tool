import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { trimmedGoldenFixture } from '../testSupport/trimmedGolden';
import { exportProjectJson } from './backup';
import { DexieBlockingRepository } from './blockingRepository';
import { TransitDatabase } from './database';
import { DexieRouteDefinitionRepository } from './dexieRepository';
import { DexieRestorePoints } from './restorePointPersistence';

const BASE_TIME = Date.parse('2026-11-17T12:00:00.000Z');
const isoAt = (minutes: number) => new Date(BASE_TIME + minutes * 60_000).toISOString();

let counter = 0;

/** A new database seeded with the trimmed golden project, and the recorder under test. `state.minutes` sets the time of each stored point. */
async function open() {
  const name = `transit-restore-points-${Date.now()}-${(counter += 1)}`;
  const db = new TransitDatabase(name);
  const repository = new DexieRouteDefinitionRepository(db);
  const blocking = new DexieBlockingRepository(db);
  const state = { minutes: 0 };
  const restorePoints = new DexieRestorePoints(db, repository, () => isoAt(state.minutes));
  const { snapshot, scenarioId } = trimmedGoldenFixture();
  await repository.saveProjectSnapshot(snapshot);
  return {
    db, repository, blocking, restorePoints, state, scenarioId, projectId: snapshot.project.id,
    close: async () => { db.close(); await Dexie.delete(name); },
  };
}
type Harness = Awaited<ReturnType<typeof open>>;

/** One Scenario-level command that renames the Scenario. */
const rename = (h: Harness, name: string) => h.restorePoints.recordScenarioChange({ kind: 'deleteRoute', scenarioId: h.scenarioId }, () => h.repository.updateScenarioRecords(h.scenarioId, (current) => ({ ...current, scenario: { ...current.scenario, name } })));

describe('restore points in IndexedDB', () => {
  it('rolls the write back and stores no restore point when the command throws', async () => {
    const h = await open();
    try {
      const [blockingScenario] = await h.blocking.listBlockingScenarios(h.scenarioId);
      const oldName = (await h.repository.getScenarioRecords(h.scenarioId))!.scenario.name;
      await expect(h.restorePoints.recordScenarioChange({ kind: 'deleteRoute', scenarioId: h.scenarioId }, async () => {
        await h.repository.updateScenarioRecords(h.scenarioId, (current) => ({ ...current, scenario: { ...current.scenario, name: 'Changed' } }));
        await h.blocking.saveBlockingScenario({ ...blockingScenario, name: 'Renamed' });
        throw new Error('stop');
      })).rejects.toThrow('stop');
      expect((await h.repository.getScenarioRecords(h.scenarioId))!.scenario.name).toBe(oldName);
      expect((await h.blocking.getBlockingScenario(blockingScenario.id))!.name).toBe(blockingScenario.name);
      expect(await h.restorePoints.listRestorePoints()).toEqual([]);
    } finally {
      await h.close();
    }
  });

  it('stores one restore point, with the names and counts of the change, when the command succeeds', async () => {
    const h = await open();
    try {
      const [blockingScenario] = await h.blocking.listBlockingScenarios(h.scenarioId);
      const oldName = (await h.repository.getScenarioRecords(h.scenarioId))!.scenario.name;
      await h.restorePoints.recordScenarioChange({ kind: 'deleteRoute', scenarioId: h.scenarioId }, async () => {
        await h.repository.updateScenarioRecords(h.scenarioId, (current) => ({ ...current, scenario: { ...current.scenario, name: 'Changed' } }));
        await h.blocking.saveBlockingScenario({ ...blockingScenario, name: 'Renamed' });
      });
      const points = await h.restorePoints.listRestorePoints();
      expect(points).toHaveLength(1);
      expect(points[0]).toMatchObject({
        kind: 'deleteRoute', scope: 'scenario', names: { scenario: oldName },
        counts: { scenario: { removed: 0, changed: 1, added: 0 }, blockingScenarios: { removed: 0, changed: 1, added: 0 } },
      });
      const payload = await h.restorePoints.getRestorePointPayload(points[0].id);
      expect(payload!.change!.changedBefore.scenario![0]).toMatchObject({ name: oldName });
    } finally {
      await h.close();
    }
  });

  it('stores no restore point for a write that changes nothing', async () => {
    const h = await open();
    try {
      await h.restorePoints.recordScenarioChange({ kind: 'deleteRoute', scenarioId: h.scenarioId }, async () => {});
      expect(await h.restorePoints.listRestorePoints()).toEqual([]);
    } finally {
      await h.close();
    }
  });

  it('stores no restore point when keep declines the change, and keeps the write', async () => {
    const h = await open();
    try {
      await h.restorePoints.recordScenarioChange({ kind: 'deleteRoute', scenarioId: h.scenarioId, keep: () => false }, () =>
        h.repository.updateScenarioRecords(h.scenarioId, (current) => ({ ...current, scenario: { ...current.scenario, name: 'Kept' } })));
      expect(await h.restorePoints.listRestorePoints()).toEqual([]);
      expect((await h.repository.getScenarioRecords(h.scenarioId))!.scenario.name).toBe('Kept');
    } finally {
      await h.close();
    }
  });

  it('returns the value of the write', async () => {
    const h = await open();
    try {
      await expect(h.restorePoints.recordScenarioChange({ kind: 'deleteRoute', scenarioId: h.scenarioId }, async () => 42)).resolves.toBe(42);
    } finally {
      await h.close();
    }
  });

  it('stores a project restore point whose payload is the snapshot read before the deletion', async () => {
    const h = await open();
    try {
      const before = (await h.repository.getProjectSnapshot(h.projectId))!;
      await h.restorePoints.recordProjectDeletion(h.projectId, () => h.repository.deleteProject(h.projectId));
      expect(await h.repository.getProject(h.projectId)).toBeUndefined();
      const points = await h.restorePoints.listRestorePoints();
      expect(points).toHaveLength(1);
      expect(points[0].scope).toBe('project');
      expect((await h.restorePoints.getRestorePointPayload(points[0].id))!.projectSnapshot).toEqual(before);
    } finally {
      await h.close();
    }
  });

  it('keeps the newest twenty restore points and their payloads', async () => {
    const h = await open();
    try {
      for (let index = 0; index < 21; index += 1) {
        h.state.minutes = index;
        await rename(h, `Name ${index}`);
      }
      const points = await h.restorePoints.listRestorePoints();
      expect(points).toHaveLength(20);
      expect(await h.db.restorePointPayloads.count()).toBe(20);
      expect(points.map((point) => point.createdAt)).not.toContain(isoAt(0));
      expect(points[0].createdAt).toBe(isoAt(20));
    } finally {
      await h.close();
    }
    // 21 full-snapshot writes take about 4.5 s locally, so the 5 s default timed out on a slower CI runner.
  }, 20_000);

  it('keepNewest leaves the newest points and removes their payloads', async () => {
    const h = await open();
    try {
      for (let index = 0; index < 7; index += 1) {
        h.state.minutes = index;
        await rename(h, `Name ${index}`);
      }
      await h.restorePoints.keepNewest(5);
      const points = await h.restorePoints.listRestorePoints();
      expect(points.map((point) => point.createdAt)).toEqual([isoAt(6), isoAt(5), isoAt(4), isoAt(3), isoAt(2)]);
      expect(await h.db.restorePointPayloads.count()).toBe(5);
    } finally {
      await h.close();
    }
  });

  it('calls a listener once after a commit and not after a rollback', async () => {
    const h = await open();
    try {
      const heard: string[] = [];
      const unsubscribe = h.restorePoints.subscribeToRestorePoints((point) => heard.push(point.id));
      await rename(h, 'Listened');
      expect(heard).toHaveLength(1);
      await expect(h.restorePoints.recordScenarioChange({ kind: 'deleteRoute', scenarioId: h.scenarioId }, async () => {
        await h.repository.updateScenarioRecords(h.scenarioId, (current) => ({ ...current, scenario: { ...current.scenario, name: 'Rolled back' } }));
        throw new Error('stop');
      })).rejects.toThrow('stop');
      expect(heard).toHaveLength(1);
      unsubscribe();
    } finally {
      await h.close();
    }
  });

  it('is not part of a project backup', async () => {
    const h = await open();
    try {
      await rename(h, 'Changed');
      expect(await h.restorePoints.listRestorePoints()).toHaveLength(1);
      expect(exportProjectJson((await h.repository.getProjectSnapshot(h.projectId))!)).not.toContain('restorePoint');
    } finally {
      await h.close();
    }
  });
});
