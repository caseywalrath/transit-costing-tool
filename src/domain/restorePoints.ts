// Decision 0081. Pure rules of restore points: the difference one command made to one Scenario's records, how to put it back, the names a
// restore point keeps, and which restore points to drop. No React, no IndexedDB.
import type { ScenarioRecords } from './project';
import type { RecordChange, RecordCollection, RestorePointCounts, RestorePointKind, RestorePointNames, RestorePointRefs, RestorePointSummary } from './types';

type Row = { id: string };

export const RECORD_COLLECTIONS: readonly RecordCollection[] = ['scenario', 'serviceDays', 'routes', 'nodes', 'patterns', 'directions', 'runtimeProfiles', 'runtimeAssignments', 'tripProfiles', 'blockingScenarios', 'costingAssumptions', 'generationSets', 'trips', 'blocks', 'plannedFrequencies', 'routeStopSets'];

/** The rows of one collection. The single records `scenario` and `costingAssumptions` read as lists of 0 or 1. */
export function collectionRows(records: ScenarioRecords | undefined, collection: RecordCollection): Row[] {
  if (!records) return [];
  if (collection === 'scenario') return [records.scenario];
  if (collection === 'costingAssumptions') return records.costingAssumptions ? [records.costingAssumptions] : [];
  return (records[collection] ?? []) as Row[];
}

/** A short stable stamp of one row: cyrb53 over its JSON, with the JSON length (the method of `fingerprint` in `src/application/reviewToken.ts`). */
export function rowStamp(row: unknown): string {
  const text = JSON.stringify(row) ?? '';
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    high = Math.imul(high ^ code, 2654435761);
    low = Math.imul(low ^ code, 1597334677);
  }
  high = Math.imul(high ^ (high >>> 16), 2246822507) ^ Math.imul(low ^ (low >>> 13), 3266489909);
  low = Math.imul(low ^ (low >>> 16), 2246822507) ^ Math.imul(high ^ (high >>> 13), 3266489909);
  return `${text.length.toString(36)}-${(4294967296 * (2097151 & low) + (high >>> 0)).toString(36)}`;
}

/** What changed between `before` and `after`, matched by `id` per collection. `after` undefined (the Scenario was deleted) removes every row. */
export function diffScenarioRecords(before: ScenarioRecords | undefined, after: ScenarioRecords | undefined): RecordChange {
  const change: RecordChange = { removed: {}, changedBefore: {}, added: {}, writtenStamps: {} };
  for (const collection of RECORD_COLLECTIONS) {
    const beforeRows = new Map(collectionRows(before, collection).map((row) => [row.id, row]));
    const afterRows = new Map(collectionRows(after, collection).map((row) => [row.id, row]));
    const removed: Row[] = [];
    const changed: Row[] = [];
    const added: string[] = [];
    const stamps: Record<string, string> = {};
    for (const [id, row] of beforeRows) {
      const next = afterRows.get(id);
      if (!next) removed.push(row);
      else if (JSON.stringify(next) !== JSON.stringify(row)) { changed.push(row); stamps[id] = rowStamp(next); }
    }
    for (const [id, row] of afterRows) if (!beforeRows.has(id)) { added.push(id); stamps[id] = rowStamp(row); }
    if (removed.length) change.removed[collection] = removed;
    if (changed.length) change.changedBefore[collection] = changed;
    if (added.length) change.added[collection] = added;
    if (Object.keys(stamps).length) change.writtenStamps[collection] = stamps;
  }
  return change;
}

export function isEmptyChange(change: RecordChange): boolean {
  return !Object.keys(change.removed).length && !Object.keys(change.changedBefore).length && !Object.keys(change.added).length;
}

/** Rows removed, changed, and added per collection; collections with none are left out. */
export function changeCounts(change: RecordChange): RestorePointCounts {
  const counts: RestorePointCounts = {};
  for (const collection of RECORD_COLLECTIONS) {
    const removed = change.removed[collection]?.length ?? 0;
    const changed = change.changedBefore[collection]?.length ?? 0;
    const added = change.added[collection]?.length ?? 0;
    if (removed || changed || added) counts[collection] = { removed, changed, added };
  }
  return counts;
}

export type RestoreConflictReason = 'changedSince' | 'recreated' | 'scenarioMissing' | 'scenarioExists' | 'cannotRemove';
export interface RestoreConflict { collection: RecordCollection; id: string; reason: RestoreConflictReason; }

/**
 * The Scenario records with `change` undone, or the conflicts that stop it. A changed row that differs from what the command wrote, or was
 * deleted since, is `changedSince`; an added row that differs is `changedSince` (one deleted since is fine); a removed row whose id exists again
 * is `recreated`. A costing assumptions record that the command added cannot be removed by a Scenario write (`cannotRemove`).
 */
export function planRestore(current: ScenarioRecords | undefined, change: RecordChange): { next?: ScenarioRecords; conflicts: RestoreConflict[] } {
  const removedScenario = change.removed.scenario?.[0];
  if (!current && !removedScenario) return { conflicts: [{ collection: 'scenario', id: '', reason: 'scenarioMissing' }] };
  if (current && removedScenario) return { conflicts: [{ collection: 'scenario', id: current.scenario.id, reason: 'scenarioExists' }] };
  const rows = new Map<RecordCollection, Map<string, Row>>();
  for (const collection of RECORD_COLLECTIONS) rows.set(collection, new Map(collectionRows(current, collection).map((row) => [row.id, row])));
  const conflicts: RestoreConflict[] = [];
  for (const collection of RECORD_COLLECTIONS) {
    const present = rows.get(collection)!;
    const stamps = change.writtenStamps[collection] ?? {};
    for (const row of change.changedBefore[collection] ?? []) {
      const now = present.get(row.id);
      if (!now || rowStamp(now) !== stamps[row.id]) conflicts.push({ collection, id: row.id, reason: 'changedSince' });
    }
    for (const id of change.added[collection] ?? []) {
      const now = present.get(id);
      if (now && rowStamp(now) !== stamps[id]) conflicts.push({ collection, id, reason: 'changedSince' });
      else if (now && collection === 'costingAssumptions') conflicts.push({ collection, id, reason: 'cannotRemove' });
    }
    for (const row of change.removed[collection] ?? []) if (present.has(row.id)) conflicts.push({ collection, id: row.id, reason: 'recreated' });
  }
  if (conflicts.length) return { conflicts };
  for (const collection of RECORD_COLLECTIONS) {
    const present = rows.get(collection)!;
    for (const id of change.added[collection] ?? []) present.delete(id);
    for (const row of change.changedBefore[collection] ?? []) present.set(row.id, row);
    for (const row of change.removed[collection] ?? []) present.set(row.id, row);
  }
  const list = <T>(collection: RecordCollection): T[] => [...rows.get(collection)!.values()] as T[];
  const optional = <K extends 'directions' | 'tripProfiles' | 'blockingScenarios' | 'plannedFrequencies' | 'routeStopSets'>(key: K): Partial<Pick<ScenarioRecords, K>> => {
    const values = list<unknown>(key);
    return (values.length ? { [key]: values } : {}) as Partial<Pick<ScenarioRecords, K>>;
  };
  const costingAssumptions = list<NonNullable<ScenarioRecords['costingAssumptions']>>('costingAssumptions')[0];
  const next: ScenarioRecords = {
    scenario: list<ScenarioRecords['scenario']>('scenario')[0],
    serviceDays: list('serviceDays'),
    routes: list('routes'),
    nodes: list('nodes'),
    patterns: list('patterns'),
    ...optional('directions'),
    runtimeProfiles: list('runtimeProfiles'),
    runtimeAssignments: list('runtimeAssignments'),
    ...optional('tripProfiles'),
    generationSets: list('generationSets'),
    trips: list('trips'),
    blocks: list('blocks'),
    ...optional('blockingScenarios'),
    ...(costingAssumptions ? { costingAssumptions } : {}),
    ...optional('plannedFrequencies'),
    ...optional('routeStopSets'),
  };
  return { next, conflicts: [] };
}

/** The names a restore point keeps, read from the first of `sources` that has each record. `extra` names win. */
export function restorePointNames(projectName: string, sources: Array<ScenarioRecords | undefined>, refs: RestorePointRefs, extra: Partial<RestorePointNames> = {}): RestorePointNames {
  const records = sources.filter((source): source is ScenarioRecords => Boolean(source));
  const pick = <T extends { id: string }>(rowsOf: (source: ScenarioRecords) => T[] | undefined, id: string | undefined): T | undefined =>
    id === undefined ? undefined : records.flatMap((source) => rowsOf(source) ?? []).find((row) => row.id === id);
  const names: RestorePointNames = { project: projectName, scenario: records[0]?.scenario.name ?? '' };
  const route = pick((source) => source.routes, refs.routeId);
  if (route) names.route = route.shortName || route.name || 'Untitled route';
  const pattern = pick((source) => source.patterns, refs.patternId);
  if (pattern) names.pattern = pattern.name || 'Untitled pattern';
  const runtimeProfile = pick((source) => source.runtimeProfiles, refs.runtimeProfileId);
  if (runtimeProfile) names.runtimeProfile = runtimeProfile.name;
  const tripProfile = pick((source) => source.tripProfiles, refs.tripProfileId);
  if (tripProfile) names.tripProfile = tripProfile.name;
  const blockingScenario = pick((source) => source.blockingScenarios, refs.blockingScenarioId);
  if (blockingScenario) names.blockingScenario = blockingScenario.name;
  const serviceDay = pick((source) => source.serviceDays, refs.serviceDayId);
  if (serviceDay) names.serviceDay = serviceDay.name;
  const sourceServiceDay = pick((source) => source.serviceDays, refs.sourceServiceDayId);
  if (sourceServiceDay) names.sourceServiceDay = sourceServiceDay.name;
  const block = pick((source) => source.blocks, refs.blockId);
  if (block) names.block = block.label;
  for (const [key, value] of Object.entries(extra) as Array<[keyof RestorePointNames, string | undefined]>) if (value) names[key] = value;
  return names;
}

export const RESTORE_POINT_POLICY = { maxCount: 20, maxAgeDays: 30, maxTotalSize: 50_000_000 } as const;

/** FX8. The trip changes form their own retention group, so a run of trip edits cannot push other restore points out. */
export const TRIP_CHANGE_KINDS: ReadonlySet<RestorePointKind> = new Set<RestorePointKind>(['regenerateTrips', 'changeTripStartTime', 'changeTripPattern', 'shiftTrips']);
export const TRIP_CHANGE_POLICY = { maxCount: 10, maxAgeDays: 30, maxTotalSize: 50_000_000 } as const;

/** A recorded restore belongs to the group of the kind it restored. */
export function isTripChange(point: Pick<RestorePointSummary, 'kind' | 'restoredKind'>): boolean {
  return TRIP_CHANGE_KINDS.has(point.kind === 'restore' && point.restoredKind ? point.restoredKind : point.kind);
}

/** The ids to drop, each group pruned by its own policy. */
export function restorePointsToPruneByGroup(points: ReadonlyArray<Pick<RestorePointSummary, 'id' | 'createdAt' | 'sizeEstimate' | 'kind' | 'restoredKind'>>, now: string): string[] {
  return [
    ...restorePointsToPrune(points.filter((point) => !isTripChange(point)), now, RESTORE_POINT_POLICY),
    ...restorePointsToPrune(points.filter(isTripChange), now, TRIP_CHANGE_POLICY),
  ];
}

/** Newest first by `createdAt`, then by `id` descending, so the order is total. */
export function sortNewestFirst<T extends Pick<RestorePointSummary, 'id' | 'createdAt'>>(points: readonly T[]): T[] {
  return [...points].sort((left, right) => left.createdAt === right.createdAt ? (left.id < right.id ? 1 : left.id > right.id ? -1 : 0) : left.createdAt < right.createdAt ? 1 : -1);
}

/**
 * The ids to drop: points older than `maxAgeDays`, and, from the first point that would pass `maxCount` or `maxTotalSize` (counting from the
 * newest), that point and every older one. The newest point is always kept.
 */
export function restorePointsToPrune(points: ReadonlyArray<Pick<RestorePointSummary, 'id' | 'createdAt' | 'sizeEstimate'>>, now: string, policy: { maxCount: number; maxAgeDays: number; maxTotalSize: number } = RESTORE_POINT_POLICY): string[] {
  const oldestKept = Date.parse(now) - policy.maxAgeDays * 86_400_000;
  const drop: string[] = [];
  let kept = 0;
  let total = 0;
  let full = false;
  sortNewestFirst(points).forEach((point, index) => {
    if (index > 0 && !full && (kept >= policy.maxCount || total + point.sizeEstimate > policy.maxTotalSize)) full = true;
    if (index > 0 && (full || Date.parse(point.createdAt) < oldestKept)) { drop.push(point.id); return; }
    kept += 1;
    total += point.sizeEstimate;
  });
  return drop;
}
