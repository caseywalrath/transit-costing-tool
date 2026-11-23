// Runs the per-side comparison work (sideCompute.ts) in a Web Worker when the browser allows it, and on the main thread otherwise (card V2,
// shaped like gtfsExportWorkerClient.ts). The result is the same either way: both paths run the same function.
//
// Every request keeps its input until it is answered, so a worker that cannot start, cannot take the message, or crashes mid-run
// costs nothing: that request and every later one run on the main thread with the same input (the phase E review fix). An error the
// computation itself throws is not retried: the main thread would throw it again.

import type { CompareProgress, SideComputation, SideComputeInput } from './compareTypes';
import { computeSide } from './sideCompute';

export interface CompareWorkerRequest { id: number; type: 'computeSide'; input: SideComputeInput }

export type CompareWorkerResponse =
  | { id: number; type: 'progress'; progress: CompareProgress }
  | { id: number; type: 'computed'; result: SideComputation }
  | { id: number; type: 'error'; message: string };

/** The part of a Worker the client uses, so that a test can supply its own. */
export interface CompareWorkerLike {
  onmessage: ((event: MessageEvent<CompareWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: CompareWorkerRequest): void;
  terminate(): void;
}

export interface CompareEngine {
  /** Costs and measures one side, reporting progress as it goes. */
  computeSide(input: SideComputeInput, onProgress?: (progress: CompareProgress) => void): Promise<SideComputation>;
  dispose(): void;
}

/** A new worker from compareWorker.ts, or undefined where the browser has no Worker. */
export function createBrowserCompareWorker(): CompareWorkerLike | undefined {
  if (typeof Worker === 'undefined') return undefined;
  return new Worker(new URL('./compareWorker.ts', import.meta.url), { type: 'module' });
}

/** The worker stopped or could not take the message; the request is run again on the main thread. */
class WorkerUnavailable extends Error {}

interface Pending {
  onProgress?: (progress: CompareProgress) => void;
  resolve(result: SideComputation): void;
  reject(error: Error): void;
}

/** `createWorker` is called once, when the first request is sent. When it returns nothing or throws, everything runs on the main thread. */
export function createCompareEngine(createWorker: () => CompareWorkerLike | undefined = createBrowserCompareWorker): CompareEngine {
  let worker: CompareWorkerLike | undefined;
  let attempted = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const failAll = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const ensureWorker = (): CompareWorkerLike | undefined => {
    if (!attempted) {
      attempted = true;
      try {
        worker = createWorker();
      } catch {
        worker = undefined;
      }
      if (worker) {
        worker.onmessage = (event) => {
          const response = event.data;
          const request = pending.get(response.id);
          if (!request) return;
          if (response.type === 'progress') {
            request.onProgress?.(response.progress);
            return;
          }
          pending.delete(response.id);
          if (response.type === 'error') request.reject(new Error(response.message));
          else request.resolve(response.result);
        };
        worker.onerror = (event) => {
          failAll(new WorkerUnavailable(event.message || 'The comparison worker stopped unexpectedly.'));
          worker?.terminate();
          worker = undefined;
        };
      }
    }
    return worker;
  };

  const viaWorker = (active: CompareWorkerLike, input: SideComputeInput, onProgress?: (progress: CompareProgress) => void): Promise<SideComputation> => {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      pending.set(id, { onProgress, resolve, reject });
      try {
        active.postMessage({ id, type: 'computeSide', input });
      } catch (error) {
        pending.delete(id);
        reject(new WorkerUnavailable(error instanceof Error ? error.message : String(error)));
      }
    });
  };

  return {
    async computeSide(input, onProgress) {
      const active = ensureWorker();
      if (active) {
        try {
          return await viaWorker(active, input, onProgress);
        } catch (error) {
          if (!(error instanceof WorkerUnavailable)) throw error;
          if (worker === active) { worker.terminate(); worker = undefined; }
        }
      }
      // Let the page paint the "Costing…" state before the long run starts.
      await new Promise((resolve) => setTimeout(resolve));
      return computeSide(input, onProgress);
    },
    dispose() {
      failAll(new Error('The comparison was cancelled.'));
      worker?.terminate();
      worker = undefined;
      attempted = false;
    },
  };
}
