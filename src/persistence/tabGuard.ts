import type { SessionReadOnlyReason, SessionStatus, SessionStatusQueries } from '../application/ports';

/** Raised by every write attempted from a tab that does not hold the active-tab lock. */
export class ReadOnlySessionError extends Error {
  constructor(readonly reason: SessionReadOnlyReason = 'otherTab', message = readOnlyMessage(reason)) {
    super(message);
    this.name = 'ReadOnlySessionError';
  }
}

export function readOnlyMessage(reason: SessionReadOnlyReason): string {
  return reason === 'databaseUpgraded'
    ? 'This tab is read-only because the database was upgraded in another tab. Reload this tab to continue editing.'
    : 'This tab is read-only because the Transit Costing Tool is open in another tab. Close the other tab and reload this one to edit here.';
}

/** What the database needs from the tab guard: a synchronous write check and a way to go read-only. */
export interface WriteGuard {
  /** Throws {@link ReadOnlySessionError} unless this tab may write. */
  assertWritable(): void;
  markReadOnly(reason: SessionReadOnlyReason): void;
}

/** Minimal Web Locks surface used by the guard, so tests can supply a fake. */
export interface LockManagerLike {
  request(name: string, options: { signal?: AbortSignal }, callback: (lock: unknown) => Promise<unknown>): Promise<unknown>;
}

/** Minimal BroadcastChannel surface used by the fallback election. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export interface TabGuardOptions {
  locks?: LockManagerLike;
  createChannel?: (name: string) => ChannelLike;
  /** How long to wait for the lock (or for another tab to answer a claim) before this tab becomes read-only. */
  waitMilliseconds?: number;
  newTabId?: () => string;
}

const LOCK_NAME = 'transit-costing-tool.active-tab';
const CHANNEL_NAME = 'transit-costing-tool.active-tab';

type ElectionMessage = { type: 'claim' | 'active'; id: string };

/**
 * Allows one tab at a time to write the local database (Decision 0037). The first tab to start holds a Web Locks lock for
 * its lifetime; later tabs become read-only. Where Web Locks is unavailable the tabs elect an active tab over a BroadcastChannel.
 * A read-only tab never promotes itself: its data may be older than storage, so the planner reloads it.
 */
export class TabGuard implements WriteGuard, SessionStatusQueries {
  private status: SessionStatus = { mode: 'readOnly', reason: 'otherTab', message: readOnlyMessage('otherTab') };
  private resolved = false;
  private readonly listeners = new Set<(status: SessionStatus) => void>();
  private readonly waitMilliseconds: number;
  private releaseLock?: () => void;

  constructor(private readonly options: TabGuardOptions = {}) {
    this.waitMilliseconds = options.waitMilliseconds ?? 1500;
  }

  /** Decides whether this tab is the active tab. Call once, before the application starts. */
  async acquire(): Promise<SessionStatus> {
    if (this.resolved) return this.status;
    const locks = this.options.locks ?? (typeof navigator !== 'undefined' ? (navigator as { locks?: LockManagerLike }).locks : undefined);
    if (locks) await this.acquireWithLock(locks);
    else await this.elect();
    this.resolved = true;
    return this.status;
  }

  assertWritable(): void {
    if (this.status.mode !== 'active') throw new ReadOnlySessionError(this.status.reason);
  }

  markReadOnly(reason: SessionReadOnlyReason): void {
    this.resolved = true;
    // Give up the lock, so that after the planner reloads any tab can become the active one.
    this.releaseLock?.();
    this.releaseLock = undefined;
    this.setStatus({ mode: 'readOnly', reason, message: readOnlyMessage(reason) });
  }

  getSessionStatus(): SessionStatus { return this.status; }

  subscribeToSessionStatus(listener: (status: SessionStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: SessionStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  /** Queues for the lock and keeps it for the life of the page. A tab that waits too long gives up and withdraws its request. */
  private acquireWithLock(locks: LockManagerLike): Promise<void> {
    return new Promise<void>((resolve) => {
      const abort = new AbortController();
      const giveUp = setTimeout(() => abort.abort(), this.waitMilliseconds);
      locks.request(LOCK_NAME, { signal: abort.signal }, () => {
        clearTimeout(giveUp);
        this.setStatus({ mode: 'active' });
        resolve();
        return new Promise<void>((release) => { this.releaseLock = release; /* otherwise held until the page closes */ });
      }).catch(() => {
        clearTimeout(giveUp);
        this.setStatus({ mode: 'readOnly', reason: 'otherTab', message: readOnlyMessage('otherTab') });
        resolve();
      });
    });
  }

  /** Fallback election: ask for an active tab; if none answers, claim. Of two simultaneous claimants the lower id wins. */
  private elect(): Promise<void> {
    const createChannel = this.options.createChannel ?? (typeof BroadcastChannel !== 'undefined' ? (name: string) => new BroadcastChannel(name) : undefined);
    if (!createChannel) {
      // Neither mechanism exists: nothing can coordinate tabs, so the only tab we can see is the one in front of the planner.
      this.setStatus({ mode: 'active' });
      return Promise.resolve();
    }
    const id = (this.options.newTabId ?? (() => Math.random().toString(36).slice(2) + Date.now().toString(36)))();
    const channel = createChannel(CHANNEL_NAME);
    let claiming = true;
    return new Promise<void>((resolve) => {
      const finish = (mode: 'active' | 'readOnly') => {
        if (!claiming) return;
        claiming = false;
        clearTimeout(timer);
        this.setStatus(mode === 'active' ? { mode: 'active' } : { mode: 'readOnly', reason: 'otherTab', message: readOnlyMessage('otherTab') });
        if (mode === 'readOnly') channel.close();
        resolve();
      };
      channel.addEventListener('message', (event) => {
        const message = event.data as ElectionMessage;
        if (!message || message.id === id) return;
        if (message.type === 'active') finish('readOnly');
        else if (message.type === 'claim') {
          if (claiming && message.id < id) finish('readOnly');
          else if (!claiming && this.status.mode === 'active') channel.postMessage({ type: 'active', id } satisfies ElectionMessage);
        }
      });
      const claimWindow = Math.min(this.waitMilliseconds, 250);
      const timer = setTimeout(() => finish('active'), claimWindow);
      // A channel only hears messages posted after it exists, so a tab that starts at the same moment misses the first claim. Repeat it.
      const claim = () => { if (claiming) channel.postMessage({ type: 'claim', id } satisfies ElectionMessage); };
      claim();
      setTimeout(claim, claimWindow / 2);
    });
  }
}
