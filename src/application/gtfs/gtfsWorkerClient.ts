// Runs a feed job (gtfsImportService.ts) in a Web Worker when the browser allows it, and on the main thread otherwise (Decision 0089 item 9).
// The result is the same either way: both paths run the same function for a job, and the job and its result are plain data.

import { type FeedJob, type FeedJobResult, readFeedTables, runFeedJob } from './gtfsImportService';
import type { GtfsTables, Row } from '../../domain/gtfs/feedTables';
import { feedSummary, type FeedSummary } from '../../domain/gtfs/summary';

/** The stop-time rows of the selected Routes' trips (sub-plan I8, item 1). The step-2 Patterns column waits for them. */
export interface StopTimesResult {
  stopTimes: Row[];
}

/** A feed's overview (sub-plan I8, step 1): its tables with no stop times, and the summary the Feed panel shows. */
export interface OverviewResult {
  tables: GtfsTables;
  summary: FeedSummary;
}

/**
 * The message the client posts. The file bytes are a copy whose buffer is transferred, so the caller's bytes stay usable. A `stopTimes`
 * task reads only `bytes` and `routeIds`; the other fields are sent empty.
 */
export interface GtfsWorkerRequest {
  id: number;
  task?: 'stopTimes' | 'overview';
  job: Omit<FeedJob, 'bytes'> & { bytes: ArrayBuffer };
}

/** What the worker posts back: one progress message per file read, then a result or an error. */
export type GtfsWorkerResponse =
  | { id: number; type: 'progress'; file: string }
  | { id: number; type: 'result'; result: FeedJobResult | StopTimesResult | OverviewResult }
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
  readStopTimes(job: { bytes: Uint8Array; routeIds: readonly string[] }, onFile?: (file: string) => void): Promise<StopTimesResult>;
  readOverview(job: { bytes: Uint8Array; now: string }, onFile?: (file: string) => void): Promise<OverviewResult>;
  dispose(): void;
}

interface PendingRequest {
  resolve(result: FeedJobResult | StopTimesResult | OverviewResult): void;
  reject(error: Error): void;
  onFile?: (file: string) => void;
}

/**
 * Reads only the stop-time rows of the selected Routes' trips. It is the same reading `readFeedTables` does, so the rows are the rows a
 * full import would read, and it runs both on the main thread and in the worker.
 */
export async function readRouteStopTimes(bytes: Uint8Array, routeIds: readonly string[], onFile?: (file: string) => void): Promise<StopTimesResult> {
  const tables = await readFeedTables(bytes, routeIds, onFile);
  return { stopTimes: tables.stopTimes };
}

/**
 * Reads a feed's overview: its tables without stop times (the large file waits for the Routes the planner chooses) and the summary. `now`
 * is the ISO time of the reading; its date is the day the summary judges expiry against.
 */
export async function readFeedOverview(bytes: Uint8Array, now: string, onFile?: (file: string) => void): Promise<OverviewResult> {
  const tables = await readFeedTables(bytes, [], onFile, { skipStopTimes: true });
  return { tables, summary: feedSummary(tables, now.slice(0, 10).replaceAll('-', '')) };
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

  // Sends one job to the worker. The caller narrows the result to the type its task returns.
  const submit = (active: FeedWorkerLike, job: Omit<FeedJob, 'bytes'>, bytes: Uint8Array, onFile?: (file: string) => void, task?: 'stopTimes' | 'overview') => {
    const id = nextId;
    nextId += 1;
    // A copy of the bytes is what moves; the caller keeps its own buffer.
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const message: GtfsWorkerRequest = { id, ...(task ? { task } : {}), job: { ...job, bytes: buffer } };
    return new Promise<FeedJobResult | StopTimesResult | OverviewResult>((resolve, reject) => {
      pending.set(id, { resolve, reject, ...(onFile ? { onFile } : {}) });
      try {
        active.postMessage(message, [buffer]);
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  return {
    run(job, onFile) {
      const active = ensureWorker();
      if (!active) return runFeedJob(job, onFile);
      const { bytes, ...wire } = job;
      // A plan job has no task marker, so the worker runs runFeedJob and returns a FeedJobResult.
      return submit(active, wire, bytes, onFile) as Promise<FeedJobResult>;
    },
    readStopTimes(job, onFile) {
      const active = ensureWorker();
      if (!active) return readRouteStopTimes(job.bytes, job.routeIds, onFile);
      const wire = { fileName: '', routeIds: [...job.routeIds], now: '', plan: {} };
      return submit(active, wire, job.bytes, onFile, 'stopTimes') as Promise<StopTimesResult>;
    },
    readOverview(job, onFile) {
      const active = ensureWorker();
      if (!active) return readFeedOverview(job.bytes, job.now, onFile);
      const wire = { fileName: '', routeIds: [], now: job.now, plan: {} };
      return submit(active, wire, job.bytes, onFile, 'overview') as Promise<OverviewResult>;
    },
    dispose() {
      failAll(new Error('The feed import was cancelled.'));
      dropWorker();
      attempted = false;
    },
  };
}
