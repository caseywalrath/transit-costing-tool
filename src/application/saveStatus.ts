import type { LocalDataProtection, LocalDataProtectionQueries, LocalDataProtectionStore, SaveStatus, StorageManagerPort } from './ports';

/** The plain-language message for a full browser store (review issue I-045, user decision 16). */
export const STORAGE_FULL_MESSAGE = 'Browser storage is full. Export a backup, then free space.';

/** The browser refused a write because its storage quota is used up. */
export class StorageFullError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(STORAGE_FULL_MESSAGE, options);
    this.name = 'StorageFullError';
  }
}

/** True for a quota failure as IndexedDB, Dexie, or a wrapper of either reports it. Looks through `inner` and `cause`. */
export function isQuotaExceeded(error: unknown): boolean {
  const seen = new Set<unknown>();
  for (let current: unknown = error; current && typeof current === 'object' && !seen.has(current);) {
    seen.add(current);
    const candidate = current as { name?: unknown; code?: unknown; message?: unknown; inner?: unknown; cause?: unknown };
    if (candidate.name === 'QuotaExceededError' || candidate.code === 22 || (typeof candidate.message === 'string' && candidate.message.includes('QuotaExceededError'))) return true;
    current = candidate.inner ?? candidate.cause;
  }
  return false;
}

/**
 * The one publisher of the visible save status (review issue I-023, user decision 11). Every application service that writes runs its
 * writes through `run`, so the status reflects Route, Trips, Blocking, and Costing saves alike.
 *
 * The status is `saving` while any write is in flight. When the last one ends it is `error` if any write of that burst failed, and
 * `saved` otherwise; `error` stays until the next burst of successful writes. A quota failure is turned into `StorageFullError`
 * (message: "Browser storage is full. Export a backup, then free space.") before it is published and rethrown. Any other error is
 * rethrown unchanged.
 */
export class SaveStatusPublisher {
  private status: SaveStatus = { state: 'idle' };
  private readonly listeners = new Set<(status: SaveStatus) => void>();
  private inFlight = 0;
  private failure: string | undefined;

  constructor(private readonly now: () => string = () => new Date().toISOString(), private readonly onSaved?: () => void) {}

  getSaveStatus(): SaveStatus { return this.status; }

  subscribeToSaveStatus(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  async run<T>(write: () => Promise<T>): Promise<T> {
    if (this.inFlight === 0) this.failure = undefined;
    this.inFlight += 1;
    this.publish({ state: 'saving' });
    try {
      const result = await write();
      this.finish();
      return result;
    } catch (error) {
      const reported = isQuotaExceeded(error) && !(error instanceof StorageFullError) ? new StorageFullError({ cause: error }) : error;
      this.failure = reported instanceof Error ? reported.message : 'Unable to save locally.';
      this.finish();
      throw reported;
    }
  }

  private finish() {
    this.inFlight -= 1;
    if (this.inFlight > 0) return;
    if (this.failure !== undefined) { this.publish({ state: 'error', errorMessage: this.failure }); return; }
    this.publish({ state: 'saved', updatedAt: this.now() });
    this.onSaved?.();
  }

  private publish(status: SaveStatus) {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }
}

/**
 * Returns `repository` with each method named in `writes` run through `publisher`, so every call to it publishes saving, saved, or
 * failed. Used by the services whose writes are many and scattered (Trips, Blocking, Costing): no call site has to remember to publish,
 * and a write added later is covered once its name is listed. Methods not listed, and methods the repository lacks, are returned as
 * they are (bound to the repository, so calls it makes to itself are not published twice).
 */
export function publishWrites<T extends object>(repository: T, publisher: SaveStatusPublisher, writes: readonly string[]): T {
  const published = new Set(writes);
  return new Proxy(repository, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      const method = (value as (...args: unknown[]) => unknown).bind(target);
      if (typeof property !== 'string' || !published.has(property)) return method;
      return (...args: unknown[]) => publisher.run(async () => method(...args));
    },
  });
}

/**
 * Device-local facts about how well the local data is protected (review issue I-045, user decision 16): whether the browser agreed to keep
 * the store (`navigator.storage.persist()`), and when the planner last exported a JSON backup. They are not project data: they are kept
 * beside the selection preferences, never in a backup, and nothing is calculated from them.
 *
 * The persistence request is made once per browser profile, after the first successful save, and its answer is recorded. A refusal is
 * not repeated automatically; `requestPersistentStorage` can be called again on the planner's action.
 */
export class LocalDataProtectionService implements LocalDataProtectionQueries {
  private state: LocalDataProtection;
  private readonly listeners = new Set<(state: LocalDataProtection) => void>();
  private attempted = false;

  constructor(
    private readonly store: LocalDataProtectionStore,
    private readonly storage?: StorageManagerPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.state = store.load();
  }

  getLocalDataProtection(): LocalDataProtection { return this.state; }

  subscribeToLocalDataProtection(listener: (state: LocalDataProtection) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Called after each successful save; asks the browser to keep the store only the first time anything is saved on this profile. */
  afterSuccessfulSave(): void {
    if (this.attempted || this.state.persistentStorage !== undefined) return;
    this.attempted = true;
    void this.requestPersistentStorage();
  }

  /** Asks the browser to keep the store and records the answer. Never rejects. */
  async requestPersistentStorage(): Promise<NonNullable<LocalDataProtection['persistentStorage']>> {
    let answer: NonNullable<LocalDataProtection['persistentStorage']>;
    try {
      if (!this.storage?.persist) answer = 'unavailable';
      else if (await this.storage.persisted?.()) answer = 'granted';
      else answer = (await this.storage.persist()) ? 'granted' : 'denied';
    } catch {
      answer = 'unavailable';
    }
    this.update({ ...this.state, persistentStorage: answer, persistentStorageCheckedAt: this.now() });
    return answer;
  }

  /** Records that a JSON backup was exported now. */
  recordBackupExported(): void {
    this.update({ ...this.state, lastBackupExportedAt: this.now() });
  }

  private update(next: LocalDataProtection) {
    this.state = next;
    this.store.save(next);
    for (const listener of this.listeners) listener(next);
  }
}
