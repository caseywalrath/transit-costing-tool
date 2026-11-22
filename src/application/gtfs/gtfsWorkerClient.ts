// Runs a feed job (gtfsImportService.ts) in a Web Worker when the browser allows it, and on the main thread otherwise (Decision 0089 item 9).
// The result is the same either way: both paths run runFeedJob, and the job and its result are plain data.

import { type FeedJob, type FeedJobResult, runFeedJob } from './gtfsImportService';

/** The message the client posts. The file bytes are a copy whose buffer is transferred, so the caller's bytes stay usable. */
export interface GtfsWorkerRequest {
  id: number;
  job: Omit<FeedJob, 'bytes'> & { bytes: ArrayBuffer };
}

/** What the worker posts back: one progress message per file read, then a result or an error. */
export type GtfsWorkerResponse =
  | { id: number; type: 'progress'; file: string }
  | { id: number; type: 'result'; result: FeedJobResult }
  | { id: number; type: 'error'; message: string; name: string };

/** The part of a Worker the client uses, so that a test can supply its own. */
export interface FeedWorkerLike {
  onmessage: ((event: MessageEvent<GtfsWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: GtfsWorkerRequest, transfer: Transferable[]): void;
  terminate(): void;
}

export interface GtfsFeedJobClient {
  run(job: FeedJob, onFile?: (file: string) => void): Promise<FeedJobResult>;
  dispose(): void;
}

interface PendingRequest {
  resolve(result: FeedJobResult): void;
  reject(error: Error): void;
  onFile?: (file: string) => void;
}

/** A new worker from gtfsWorker.ts, or undefined where the browser has no Worker. */
export function createBrowserFeedWorker(): FeedWorkerLike | undefined {
  if (typeof Worker === 'undefined') return undefined;
  return new Worker(new URL('./gtfsWorker.ts', import.meta.url), { type: 'module' });
}

/**
 * `createWorker` is called once, when the first job runs. When it returns nothing, or throws, every job runs on the main thread. A worker
 * that reports an error is dropped, and the jobs after it run on the main thread too.
 */
export function createGtfsFeedJobClient(createWorker: () => FeedWorkerLike | undefined = createBrowserFeedWorker): GtfsFeedJobClient {
  let worker: FeedWorkerLike | undefined;
  let attempted = false;
  let nextId = 1;
  const pending = new Map<number, PendingRequest>();

  const failAll = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const dropWorker = () => {
    worker?.terminate();
    worker = undefined;
  };

  const receive = (response: GtfsWorkerResponse) => {
    const request = pending.get(response.id);
    if (!request) return;
    if (response.type === 'progress') {
      request.onFile?.(response.file);
      return;
    }
    pending.delete(response.id);
    if (response.type === 'result') {
      request.resolve(response.result);
    } else {
      const error = new Error(response.message);
      error.name = response.name;
      request.reject(error);
    }
  };

  const ensureWorker = (): FeedWorkerLike | undefined => {
    if (!attempted) {
      attempted = true;
      try {
        worker = createWorker();
      } catch {
        worker = undefined;
      }
      if (worker) {
        worker.onmessage = (event) => receive(event.data);
        worker.onerror = (event) => {
          failAll(new Error(event.message || 'The feed worker stopped unexpectedly.'));
          dropWorker();
        };
      }
    }
    return worker;
  };

  return {
    run(job, onFile) {
      const active = ensureWorker();
      if (!active) return runFeedJob(job, onFile);
      const id = nextId;
      nextId += 1;
      // A copy of the bytes is what moves; the caller keeps its own buffer.
      const buffer = new ArrayBuffer(job.bytes.byteLength);
      new Uint8Array(buffer).set(job.bytes);
      const request: GtfsWorkerRequest = { id, job: { ...job, bytes: buffer } };
      return new Promise<FeedJobResult>((resolve, reject) => {
        pending.set(id, { resolve, reject, ...(onFile ? { onFile } : {}) });
        try {
          active.postMessage(request, [buffer]);
        } catch (error) {
          pending.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    dispose() {
      failAll(new Error('The feed import was cancelled.'));
      dropWorker();
      attempted = false;
    },
  };
}
