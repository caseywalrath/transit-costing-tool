// Selection preferences kept in `localStorage` (Decision 0021 item 8): non-authoritative convenience state that must never stop the
// app from loading. Whatever is stored, a reader gets either valid values or nothing, so a `null`, an array, or a wrong-shaped value
// falls back to the default selection (review issue I-026, finding 4-010).

type StorageReader = Pick<Storage, 'getItem'>;

/** The stored JSON object, or an empty object when the key is missing, unreadable, or not a plain object (`null`, an array, a number). */
export function readStoredRecord(key: string, storage: StorageReader | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key) ?? 'null');
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

/** A non-empty string, or `undefined`. */
export function storedText(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined; }

/** An object whose values are all non-empty strings (identifier maps), with every other entry dropped. */
export function storedTextMap(value: unknown): Record<string, string> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '');
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// Recent operating cost rates (Decision 0061): per-viewer convenience state, never Scenario data and never in backups.
export const RATE_HISTORY_KEY = 'transit-costing-tool.costing-rate-history.v1';
export const RATE_HISTORY_LIMIT = 10;
export type RateHistoryEntry = { rate: number; rateYear: number; sourceType: 'user' | 'ntd' };

/** Stored entries that are well formed, newest first, at most the limit. Anything else in storage is dropped. */
export function readRateHistory(storage: StorageReader | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): RateHistoryEntry[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(RATE_HISTORY_KEY) ?? 'null');
    if (!Array.isArray(value)) return [];
    const entries = value.filter((item): item is RateHistoryEntry => item !== null && typeof item === 'object'
      && typeof item.rate === 'number' && Number.isFinite(item.rate) && item.rate >= 0
      && Number.isInteger(item.rateYear) && item.rateYear >= 1 && item.rateYear <= 9999
      && (item.sourceType === 'user' || item.sourceType === 'ntd'));
    return withoutDuplicates(entries).slice(0, RATE_HISTORY_LIMIT);
  } catch { return []; }
}

const sameEntry = (a: RateHistoryEntry, b: RateHistoryEntry) => a.rate === b.rate && a.rateYear === b.rateYear && a.sourceType === b.sourceType;
function withoutDuplicates(entries: RateHistoryEntry[]) { return entries.filter((entry, index) => entries.findIndex((other) => sameEntry(entry, other)) === index); }

/** The history with `entry` first and any identical earlier entry removed; the list keeps the newest ten. */
export function rememberRate(history: readonly RateHistoryEntry[], entry: RateHistoryEntry): RateHistoryEntry[] {
  return [entry, ...history.filter((item) => !sameEntry(item, entry))].slice(0, RATE_HISTORY_LIMIT);
}

export function writeRateHistory(history: readonly RateHistoryEntry[]) {
  try { localStorage.setItem(RATE_HISTORY_KEY, JSON.stringify(history)); } catch { /* Storage is a convenience only. */ }
}

// Side-by-side Trips (Decision 0060 item 5): per-viewer convenience state, never Scenario data and never in backups.
export const SIDE_BY_SIDE_PREFERENCE_KEY = 'transit-costing-tool.trips-side-by-side.v1';
export type SideBySidePreference = { on: boolean; leftDirectionId?: string; rightDirectionId?: string };

export function readSideBySidePreference(storage?: StorageReader): SideBySidePreference {
  const stored = readStoredRecord(SIDE_BY_SIDE_PREFERENCE_KEY, storage);
  return { on: stored.on === true, leftDirectionId: storedText(stored.leftDirectionId), rightDirectionId: storedText(stored.rightDirectionId) };
}

export function writeSideBySidePreference(preference: SideBySidePreference) {
  try { localStorage.setItem(SIDE_BY_SIDE_PREFERENCE_KEY, JSON.stringify(preference)); } catch { /* Storage is a convenience only. */ }
}

/** The two directions to show, left then right, by `sequence`. A stored direction is used while it still exists and differs from the other side; otherwise the left is the first direction and the right the first other one. Fewer than two directions gives `undefined`. */
export function sideBySideDirectionIds(directions: ReadonlyArray<{ id: string; sequence: number }>, leftDirectionId: string | undefined, rightDirectionId?: string): [string, string] | undefined {
  const ordered = [...directions].sort((a, b) => a.sequence - b.sequence);
  if (ordered.length < 2) return undefined;
  const left = ordered.find((direction) => direction.id === leftDirectionId) ?? ordered[0]!;
  const right = ordered.find((direction) => direction.id === rightDirectionId && direction.id !== left.id) ?? ordered.find((direction) => direction.id !== left.id)!;
  return [left.id, right.id];
}

// Working context (Decision 0081 item 6): per-device convenience state, never Scenario data and never in backups.
/** Decision 0081 (D5): Costing costs the working Blocking scenario (blocked) or the working Trip profile (estimated), chosen per Scenario. */
export type CostBasisKind = 'blocked' | 'estimated';
export const COST_BASIS_KIND_KEY = 'transit-costing-tool.costing-basis.v1';
/** The kind remembered for a Scenario. A value stored before Decision 0081 ("estimated:{id}" or "blocked:{id}") keeps its kind. */
export function rememberedCostBasisKind(scenarioId: string): CostBasisKind {
  return storedText(readStoredRecord(COST_BASIS_KIND_KEY)[scenarioId])?.startsWith('estimated') ? 'estimated' : 'blocked';
}
export function rememberCostBasisKind(scenarioId: string, kind: CostBasisKind) {
  try { localStorage.setItem(COST_BASIS_KIND_KEY, JSON.stringify({ ...readStoredRecord(COST_BASIS_KIND_KEY), [scenarioId]: kind })); } catch { /* UI preference only. */ }
}

// The Compare tab's choices (Decision 0091 item 3): per-device convenience state kept for each Project, never Scenario data and never in
// backups. A stored side may name a Scenario, Trip profile or Blocking scenario that no longer exists; the Compare tab checks every id.
export const COMPARE_PREFERENCE_KEY = 'transit-costing-tool.compare.v1';
/** `blockingScenarioId` is `null` for "None (estimate)" and undefined when nothing is remembered. */
export type CompareSidePreference = { scenarioId?: string; tripProfileId?: string; blockingScenarioId?: string | null };
export type CompareChoicePreference = 'baseline' | 'proposed' | 'own';
export type CompareShowPreference = 'all' | 'changed' | 'new' | 'discontinued' | 'unchanged';
export type CompareSortPreference = 'hours' | 'route';
export type ComparePreference = {
  baseline?: CompareSidePreference;
  proposed?: CompareSidePreference;
  day?: string;
  rates?: CompareChoicePreference;
  counts?: CompareChoicePreference;
  show?: CompareShowPreference;
  sort?: CompareSortPreference;
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => allowed.find((item) => item === value);

function readSidePreference(value: unknown): CompareSidePreference | undefined {
  const entry = storedObject(value);
  if (!entry) return undefined;
  const scenarioId = storedText(entry.scenarioId);
  const tripProfileId = storedText(entry.tripProfileId);
  const blockingScenarioId = entry.blockingScenarioId === null ? null : storedText(entry.blockingScenarioId);
  return { ...(scenarioId ? { scenarioId } : {}), ...(tripProfileId ? { tripProfileId } : {}), ...(blockingScenarioId !== undefined ? { blockingScenarioId } : {}) };
}

/** The Compare choices remembered for a Project. A wrong-shaped entry or field reads as not stored. */
export function readComparePreference(projectId: string, storage?: StorageReader): ComparePreference {
  const entry = storedObject(storedObject(readStoredRecord(COMPARE_PREFERENCE_KEY, storage))?.[projectId] ?? undefined);
  if (!entry) return {};
  const baseline = readSidePreference(entry.baseline);
  const proposed = readSidePreference(entry.proposed);
  const day = storedText(entry.day);
  const rates = oneOf(entry.rates, ['baseline', 'proposed', 'own'] as const);
  const counts = oneOf(entry.counts, ['baseline', 'proposed', 'own'] as const);
  const show = oneOf(entry.show, ['all', 'changed', 'new', 'discontinued', 'unchanged'] as const);
  const sort = oneOf(entry.sort, ['hours', 'route'] as const);
  return { ...(baseline ? { baseline } : {}), ...(proposed ? { proposed } : {}), ...(day ? { day } : {}), ...(rates ? { rates } : {}), ...(counts ? { counts } : {}), ...(show ? { show } : {}), ...(sort ? { sort } : {}) };
}

export function writeComparePreference(projectId: string, preference: ComparePreference) {
  try { localStorage.setItem(COMPARE_PREFERENCE_KEY, JSON.stringify({ ...readStoredRecord(COMPARE_PREFERENCE_KEY), [projectId]: preference })); } catch { /* Storage is a convenience only. */ }
}

export const WORKING_CONTEXT_KEY ='transit-costing-tool.working-context.v1';
export type WorkingContext = { scenarios: Record<string, { tripProfileId?: string; serviceDayId?: string }>; routes: Record<string, { directionId?: string }> };

const storedObject = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** The remembered Trip profile and Day of each Scenario and Direction of each Route. A wrong-shaped entry or field reads as not stored. */
export function readWorkingContext(storage?: StorageReader): WorkingContext {
  const stored = readStoredRecord(WORKING_CONTEXT_KEY, storage);
  const scenarios: WorkingContext['scenarios'] = {};
  for (const [id, value] of Object.entries(storedObject(stored.scenarios) ?? {})) {
    const entry = storedObject(value);
    const tripProfileId = storedText(entry?.tripProfileId);
    const serviceDayId = storedText(entry?.serviceDayId);
    if (tripProfileId || serviceDayId) scenarios[id] = { ...(tripProfileId ? { tripProfileId } : {}), ...(serviceDayId ? { serviceDayId } : {}) };
  }
  const routes: WorkingContext['routes'] = {};
  for (const [id, value] of Object.entries(storedObject(stored.routes) ?? {})) {
    const directionId = storedText(storedObject(value)?.directionId);
    if (directionId) routes[id] = { directionId };
  }
  return { scenarios, routes };
}

export function writeWorkingContext(context: WorkingContext) {
  try { localStorage.setItem(WORKING_CONTEXT_KEY, JSON.stringify(context)); } catch { /* Storage is a convenience only. */ }
}
