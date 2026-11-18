import type { RestorePointRecorder, RestorePointStore, ScenarioChangeRequest } from '../application/ports';
import { newId } from '../domain/ids';
import type { ScenarioRecords } from '../domain/project';
import { changeCounts, diffScenarioRecords, isEmptyChange, restorePointNames, restorePointsToPruneByGroup, sortNewestFirst } from '../domain/restorePoints';
import type { RestorePointPayload, RestorePointSummary } from '../domain/types';
import type { TransitDatabase } from './database';
import type { DexieRouteDefinitionRepository } from './dexieRepository';

/**
 * Decision 0081. Runs a covered command and stores its restore point in one transaction over every table, so the command's own transactions
 * join it: a command that fails stores nothing, and a restore point never exists without its change.
 */
export class DexieRestorePoints implements RestorePointRecorder, RestorePointStore {
  private readonly listeners = new Set<(point: RestorePointSummary) => void>();

  constructor(
    private readonly db: TransitDatabase,
    private readonly repository: Pick<DexieRouteDefinitionRepository, 'getScenarioRecords' | 'getProjectSnapshot'>,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async recordScenarioChange<T>(request: ScenarioChangeRequest, write: () => Promise<T>): Promise<T> {
    let stored: RestorePointSummary | undefined;
    if (request.separate) {
      // FX8: the command runs in its own transactions; the restore point is stored only after it has succeeded.
      const before = await this.repository.getScenarioRecords(request.scenarioId);
      const value = await write();
      const after = await this.repository.getScenarioRecords(request.scenarioId);
      stored = await this.db.transaction('rw', [this.db.projects, this.db.restorePoints, this.db.restorePointPayloads], () => this.capture(request, before, after));
      if (stored) this.notify(stored);
      return value;
    }
    const result = await this.db.transaction('rw', this.db.tables, async () => {
      const before = await this.repository.getScenarioRecords(request.scenarioId);
      const value = await write();
      const after = await this.repository.getScenarioRecords(request.scenarioId);
      stored = await this.capture(request, before, after);
      return value;
    });
    if (stored) this.notify(stored);
    return result;
  }

  /** Stores the restore point of one Scenario change, inside the caller's transaction; nothing for an empty or unkept change. */
  private async capture(request: ScenarioChangeRequest, before: ScenarioRecords | undefined, after: ScenarioRecords | undefined): Promise<RestorePointSummary | undefined> {
      const change = diffScenarioRecords(before, after);
      const scenario = before?.scenario ?? after?.scenario;
      if (!scenario || isEmptyChange(change) || (request.keep && !request.keep(change))) return undefined;
      const project = await this.db.projects.get(scenario.projectId);
      const id = newId();
      const payload: RestorePointPayload = { id, change };
      const summary: RestorePointSummary = {
        id, kind: request.kind, scope: 'scenario', projectId: scenario.projectId, scenarioId: scenario.id, createdAt: this.now(),
        names: restorePointNames(project?.name ?? '', [before, after], request.refs ?? {}, request.extraNames),
        counts: changeCounts(change),
        ...(request.quantity === undefined ? {} : { quantity: request.quantity }),
        ...(request.detail ? { detail: request.detail } : {}),
        ...(request.restoredKind ? { restoredKind: request.restoredKind } : {}),
        ...(request.refs ? { refs: request.refs } : {}),
        sizeEstimate: JSON.stringify(payload).length,
      };
      await this.store(summary, payload);
      return summary;
  }

  async recordProjectDeletion<T>(projectId: string, write: () => Promise<T>): Promise<T> {
    let stored: RestorePointSummary | undefined;
    const result = await this.db.transaction('rw', this.db.tables, async () => {
      const snapshot = await this.repository.getProjectSnapshot(projectId);
      const value = await write();
      if (!snapshot || await this.db.projects.get(projectId)) return value;
      const id = newId();
      const payload: RestorePointPayload = { id, projectSnapshot: snapshot };
      const summary: RestorePointSummary = {
        id, kind: 'deleteProject', scope: 'project', projectId, createdAt: this.now(),
        names: { project: snapshot.project.name, scenario: '' }, counts: {}, quantity: snapshot.scenarios.length,
        sizeEstimate: JSON.stringify(payload).length,
      };
      await this.store(summary, payload);
      stored = summary;
      return value;
    });
    if (stored) this.notify(stored);
    return result;
  }

  async listRestorePoints(): Promise<RestorePointSummary[]> { return sortNewestFirst(await this.db.restorePoints.toArray()); }
  async getRestorePointPayload(id: string): Promise<RestorePointPayload | undefined> { return this.db.restorePointPayloads.get(id); }
  async deleteRestorePoint(id: string): Promise<void> { await this.drop([id]); }
  async keepNewest(count: number): Promise<void> { await this.drop(sortNewestFirst(await this.db.restorePoints.toArray()).slice(count).map((point) => point.id)); }
  subscribeToRestorePoints(listener: (point: RestorePointSummary) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private async store(summary: RestorePointSummary, payload: RestorePointPayload): Promise<void> {
    await this.db.restorePoints.put(summary);
    await this.db.restorePointPayloads.put(payload);
    const pruned = restorePointsToPruneByGroup(await this.db.restorePoints.toArray(), this.now());
    if (pruned.length) {
      await this.db.restorePoints.bulkDelete(pruned);
      await this.db.restorePointPayloads.bulkDelete(pruned);
    }
  }

  private async drop(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.db.transaction('rw', [this.db.restorePoints, this.db.restorePointPayloads], async () => {
      await this.db.restorePoints.bulkDelete(ids);
      await this.db.restorePointPayloads.bulkDelete(ids);
    });
  }

  private notify(point: RestorePointSummary): void { for (const listener of this.listeners) listener(point); }
}
