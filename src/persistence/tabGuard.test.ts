import { describe, expect, it } from 'vitest';
import { ReadOnlySessionError, TabGuard, readOnlyMessage, type ChannelLike, type LockManagerLike } from './tabGuard';

/** One lock holder at a time; a request for a held lock waits until its signal aborts. */
class FakeLocks implements LockManagerLike {
  private held = new Set<string>();
  request(name: string, options: { signal?: AbortSignal }, callback: (lock: unknown) => Promise<unknown>): Promise<unknown> {
    if (!this.held.has(name)) { this.held.add(name); return callback({ name }).finally(() => this.held.delete(name)); }
    return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  }
  releaseAll() { this.held.clear(); }
}

/** Delivers each message to every other channel on the same bus, asynchronously. */
class FakeBus {
  private channels = new Set<FakeChannel>();
  create(): ChannelLike { const channel = new FakeChannel(this); this.channels.add(channel); return channel; }
  deliver(from: FakeChannel, data: unknown) { for (const channel of this.channels) if (channel !== from) setTimeout(() => channel.receive(data), 0); }
  drop(channel: FakeChannel) { this.channels.delete(channel); }
}
class FakeChannel implements ChannelLike {
  private listeners: Array<(event: { data: unknown }) => void> = [];
  constructor(private readonly bus: FakeBus) {}
  postMessage(message: unknown) { this.bus.deliver(this, message); }
  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void) { this.listeners.push(listener); }
  receive(data: unknown) { for (const listener of this.listeners) listener({ data }); }
  close() { this.bus.drop(this); }
}

describe('TabGuard with Web Locks', () => {
  it('lets the first tab write and makes a second tab read-only', async () => {
    const locks = new FakeLocks();
    const first = new TabGuard({ locks, waitMilliseconds: 20 });
    const second = new TabGuard({ locks, waitMilliseconds: 20 });
    expect((await first.acquire()).mode).toBe('active');
    expect(() => first.assertWritable()).not.toThrow();
    const status = await second.acquire();
    expect(status).toEqual({ mode: 'readOnly', reason: 'otherTab', message: readOnlyMessage('otherTab') });
    expect(() => second.assertWritable()).toThrow(ReadOnlySessionError);
    expect(() => second.assertWritable()).toThrow(/another tab/);
  });

  it('is read-only before the answer is known, so no write can run early', () => {
    expect(() => new TabGuard({ locks: new FakeLocks() }).assertWritable()).toThrow(ReadOnlySessionError);
  });

  it('does not promote a read-only tab after the active tab closes; a reload (a new guard) can', async () => {
    const locks = new FakeLocks();
    await new TabGuard({ locks, waitMilliseconds: 20 }).acquire();
    const waiting = new TabGuard({ locks, waitMilliseconds: 20 });
    await waiting.acquire();
    locks.releaseAll();
    expect(() => waiting.assertWritable()).toThrow(ReadOnlySessionError);
    const reloaded = new TabGuard({ locks, waitMilliseconds: 20 });
    expect((await reloaded.acquire()).mode).toBe('active');
  });

  it('releases the lock when it goes read-only, so a reloaded tab can become active', async () => {
    const locks = new FakeLocks();
    const guard = new TabGuard({ locks, waitMilliseconds: 20 });
    await guard.acquire();
    guard.markReadOnly('databaseUpgraded');
    await Promise.resolve();
    expect((await new TabGuard({ locks, waitMilliseconds: 20 }).acquire()).mode).toBe('active');
  });

  it('goes read-only with the upgrade reason and tells subscribers', async () => {
    const guard = new TabGuard({ locks: new FakeLocks(), waitMilliseconds: 20 });
    await guard.acquire();
    const seen: string[] = [];
    guard.subscribeToSessionStatus((status) => seen.push(`${status.mode}:${status.reason ?? ''}`));
    guard.markReadOnly('databaseUpgraded');
    expect(seen).toEqual(['active:', 'readOnly:databaseUpgraded']);
    expect(guard.getSessionStatus().message).toMatch(/upgraded/);
    expect(() => guard.assertWritable()).toThrow(/upgraded/);
  });
});

describe('TabGuard BroadcastChannel fallback', () => {
  const options = (bus: FakeBus, id: string) => ({ locks: undefined, createChannel: () => bus.create(), waitMilliseconds: 40, newTabId: () => id });

  it('makes a lone tab active', async () => {
    const guard = new TabGuard({ ...options(new FakeBus(), 'a'), locks: undefined });
    expect((await guard.acquire()).mode).toBe('active');
  });

  it('makes a later tab read-only when an active tab answers its claim', async () => {
    const bus = new FakeBus();
    const first = new TabGuard({ ...options(bus, 'a'), locks: undefined });
    await first.acquire();
    const second = new TabGuard({ ...options(bus, 'b'), locks: undefined });
    expect((await second.acquire()).mode).toBe('readOnly');
    expect(first.getSessionStatus().mode).toBe('active');
  });

  it('lets exactly one of two simultaneous claimants win, the lower id', async () => {
    const bus = new FakeBus();
    const low = new TabGuard({ ...options(bus, 'a'), locks: undefined });
    const high = new TabGuard({ ...options(bus, 'b'), locks: undefined });
    const [lowStatus, highStatus] = await Promise.all([low.acquire(), high.acquire()]);
    expect(lowStatus.mode).toBe('active');
    expect(highStatus.mode).toBe('readOnly');
  });
});
