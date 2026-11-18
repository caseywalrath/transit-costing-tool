import type { ScenarioRecords } from '../domain/project';
import { collectionRows, planRestore, type RestoreConflict } from '../domain/restorePoints';
import type { ProjectSnapshot, RecordCollection, RestorePointPayload, RestorePointSummary } from '../domain/types';
import type { RestorePointRecorder, RestorePointStore } from './ports';
import type { SaveStatusPublisher } from './saveStatus';

/** Decision 0081. A record that stops a restore, named for the planner. */
export interface NamedConflict { collection: RecordCollection; name: string; reason: RestoreConflict['reason']; }

export type RestorePointStatus =
  | { state: 'restorable' }
  | { state: 'conflict'; named: NamedConflict[]; more: number }
  | { state: 'projectMissing' }
  | { state: 'projectExists' };

export interface RestorePointListing extends RestorePointSummary { status: RestorePointStatus; }

export interface RestorePointQueries {
  listRestorePoints(): Promise<RestorePointListing[]>;
  /** The newest restore point that can be restored now, of `projectId` when given. */
  latestRestorable(projectId?: string): Promise<RestorePointListing | undefined>;
  subscribeToRestorePoints(listener: (point: RestorePointSummary) => void): () => void;
}

export interface RestorePointCommands {
  restore(id: string): Promise<{ projectId: string; scenarioId?: string }>;
}

export class RestoreConflictError extends Error {
  constructor(readonly status: Exclude<RestorePointStatus, { state: 'restorable' }>) {
    super(status.state === 'conflict'
      ? 'This action cannot be undone because records it changed have been edited since.'
      : status.state === 'projectMissing' ? 'This action cannot be undone because its project no longer exists.'
        : 'This project cannot be restored because a project with the same identity exists.');
    this.name = 'RestoreConflictError';
  }
}

export class RestorePointNotFoundError extends Error {
  constructor() { super('This restore point no longer exists.'); this.name = 'RestorePointNotFoundError'; }
}

/** The reads and writes a restore needs. All of them must use the database the recorder's transaction covers. */
export interface RestoreRepository {
  getScenarioRecords(scenarioId: string): Promise<ScenarioRecords | undefined>;
  saveScenarioRecords(records: ScenarioRecords): Promise<void>;
  getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | undefined>;
  saveProjectSnapshot(snapshot: ProjectSnapshot): Promise<void>;
  projectExists(projectId: string): Promise<boolean>;
}

const NAMED_CONFLICT_LIMIT = 3;

function rowName(row: unknown, collection: RecordCollection): string {
  const value = row as { name?: unknown; label?: unknown; tripNumber?: unknown } | undefined;
  for (const field of [value?.name, value?.label, value?.tripNumber]) if (typeof field === 'string' && field.trim()) return field;
  const nouns: Record<RecordCollection, string> = {
    scenario: 'the scenario', serviceDays: 'a service day', routes: 'a route', nodes: 'a node', patterns: 'a pattern', directions: 'a direction',
    runtimeProfiles: 'a runtime profile', runtimeAssignments: 'a runtime assignment', tripProfiles: 'a trip profile', blockingScenarios: 'a blocking scenario',
    costingAssumptions: 'the costing assumptions', generationSets: 'a trip generation set', trips: 'a trip', blocks: 'a block',
    plannedFrequencies: 'a planned frequency', routeStopSets: 'a stop list',
  };
  return nouns[collection];
}

function nameConflicts(conflicts: RestoreConflict[], current: ScenarioRecords | undefined, payload: RestorePointPayload): Extract<RestorePointStatus, { state: 'conflict' }> {
  const find = (collection: RecordCollection, id: string) =>
    collectionRows(current, collection).find((row) => row.id === id)
    ?? payload.change?.changedBefore[collection]?.find((row) => row.id === id)
    ?? payload.change?.removed[collection]?.find((row) => row.id === id);
  const named = conflicts.slice(0, NAMED_CONFLICT_LIMIT).map((conflict) => ({ collection: conflict.collection, reason: conflict.reason, name: rowName(find(conflict.collection, conflict.id), conflict.collection) }));
  return { state: 'conflict', named, more: Math.max(0, conflicts.length - NAMED_CONFLICT_LIMIT) };
}

/**
 * Decision 0081. Lists restore points with whether each can be restored now, and restores one. A Scenario restore is itself recorded (kind
 * `restore`), so it can be undone; a project restore is not, because deleting the project again is the undo.
 */
export class RestorePointService implements RestorePointQueries, RestorePointCommands {
  constructor(
    private readonly store: RestorePointStore,
    private readonly recorder: RestorePointRecorder,
    private readonly repository: RestoreRepository,
    private readonly saveStatus: SaveStatusPublisher,
    private readonly afterRestore: () => void = () => {},
  ) {}

  subscribeToRestorePoints(listener: (point: RestorePointSummary) => void): () => void { return this.store.subscribeToRestorePoints(listener); }

  async listRestorePoints(): Promise<RestorePointListing[]> {
    const points = await this.store.listRestorePoints();
    const records = new Map<string, Promise<ScenarioRecords | undefined>>();
    const recordsOf = (scenarioId: string) => {
      if (!records.has(scenarioId)) records.set(scenarioId, this.repository.getScenarioRecords(scenarioId));
      return records.get(scenarioId)!;
    };
    return Promise.all(points.map(async (point) => ({ ...point, status: await this.statusOf(point, recordsOf) })));
  }

  async latestRestorable(projectId?: string): Promise<RestorePointListing | undefined> {
    return (await this.listRestorePoints()).find((point) => point.status.state === 'restorable' && (projectId === undefined || point.projectId === projectId));
  }

  async restore(id: string): Promise<{ projectId: string; scenarioId?: string }> {
    const point = (await this.store.listRestorePoints()).find((candidate) => candidate.id === id);
    if (!point) throw new RestorePointNotFoundError();
    const result = await this.saveStatus.run(async () => {
      if (point.scope === 'project') return this.restoreProject(point);
      return this.recorder.recordScenarioChange(
        { kind: 'restore', scenarioId: point.scenarioId!, restoredKind: point.kind, extraNames: point.names, ...(point.quantity === undefined ? {} : { quantity: point.quantity }), ...(point.detail ? { detail: point.detail } : {}) },
        () => this.restoreScenario(point),
      );
    });
    this.afterRestore();
    return result;
  }

  private async restoreScenario(point: RestorePointSummary): Promise<{ projectId: string; scenarioId: string }> {
    const payload = await this.payloadOf(point);
    const status = await this.statusOf(point, (scenarioId) => this.repository.getScenarioRecords(scenarioId), payload);
    if (status.state !== 'restorable') throw new RestoreConflictError(status);
    const { next } = planRestore(await this.repository.getScenarioRecords(point.scenarioId!), payload.change!);
    await this.repository.saveScenarioRecords(next!);
    await this.store.deleteRestorePoint(point.id);
    return { projectId: point.projectId, scenarioId: point.scenarioId! };
  }

  private async restoreProject(point: RestorePointSummary): Promise<{ projectId: string }> {
    // One transaction over every table, so the status check and the write cannot be separated by another tab's write.
    return this.recorder.recordProjectDeletion(point.projectId, async () => {
      const payload = await this.payloadOf(point);
      if (await this.repository.projectExists(point.projectId)) throw new RestoreConflictError({ state: 'projectExists' });
      await this.repository.saveProjectSnapshot(payload.projectSnapshot!);
      await this.store.deleteRestorePoint(point.id);
      return { projectId: point.projectId };
    });
  }

  private async payloadOf(point: RestorePointSummary): Promise<RestorePointPayload> {
    const payload = await this.store.getRestorePointPayload(point.id);
    if (!payload) throw new RestorePointNotFoundError();
    return payload;
  }

  private async statusOf(point: RestorePointSummary, recordsOf: (scenarioId: string) => Promise<ScenarioRecords | undefined>, knownPayload?: RestorePointPayload): Promise<RestorePointStatus> {
    if (point.scope === 'project') return await this.repository.projectExists(point.projectId) ? { state: 'projectExists' } : { state: 'restorable' };
    if (!await this.repository.projectExists(point.projectId)) return { state: 'projectMissing' };
    const payload = knownPayload ?? await this.store.getRestorePointPayload(point.id);
    if (!payload?.change) return { state: 'conflict', named: [], more: 0 };
    const current = await recordsOf(point.scenarioId!);
    const { conflicts } = planRestore(current, payload.change);
    return conflicts.length ? nameConflicts(conflicts, current, payload) : { state: 'restorable' };
  }
}
