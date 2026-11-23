import type { SaveStatus } from '../ports';

/**
 * A stamp that changes whenever the Project's save status changes (a write starts, ends or fails), for `CompareService`. A comparison read
 * while a write is in flight is dropped from the cache when that write ends, so a cached side is never older than the last save.
 * Wire it as `createSaveStamp(saveStatus)` with the `SaveStatusPublisher` the services share. Call the returned `stop` when finished.
 */
export function createSaveStamp(saveStatus: { subscribeToSaveStatus(listener: (status: SaveStatus) => void): () => void }): { stamp: () => string; stop: () => void } {
  let count = 0;
  let first = true;
  // The listener is called once at once with the current status; only later calls are changes.
  const stop = saveStatus.subscribeToSaveStatus(() => {
    if (first) { first = false; return; }
    count += 1;
  });
  return { stamp: () => String(count), stop };
}
