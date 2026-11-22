// Runs the GTFS export's checks and build (gtfsExportBuild.ts) in a Web Worker when the browser allows it, and on the main thread otherwise
// (Decision 0090, card E4). A whole feed of 130 Routes takes 3 to 4 seconds to build in Node, so the dialog's live checks must not run on the
// page's own thread. The result is the same either way: both paths run the same functions.
//
// The worker keeps the Scenario's records from `load`, so a check sends only the planner's choices. At most one check is outstanding; a
// newer one replaces a waiting older one, whose promise resolves to undefined.

import type { ScenarioRecords } from '../../domain/project';
import { buildFeed, type BuiltFeed, type GtfsExportCheck, type GtfsExportRequest } from './gtfsExportBuild';

export type GtfsExportWorkerRequest =
  | { id: number; type: 'load'; records: ScenarioRecords }
  | { id: number; type: 'check'; request: GtfsExportRequest }
  | { id: number; type: 'build'; records: ScenarioRecords; request: GtfsExportRequest };

export type GtfsExportWorkerResponse =
  | { id: number; type: 'loaded' }
  | { id: number; type: 'checked'; check: GtfsExportCheck }
  | { id: number; type: 'built'; built: BuiltFeed }
  | { id: number; type: 'error'; message: string };

/** The part of a Worker the client uses, so that a test can supply its own. */
export interface ExportWorkerLike {
  onmessage: ((event: MessageEvent<GtfsExportWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: GtfsExportWorkerRequest): void;
  terminate(): void;
}

export interface GtfsExportEngine {
  /** Hands the Scenario's records to the engine for the checks that follow. */
  load(records: ScenarioRecords): Promise<void>;
  /** The check of one request, or undefined when a newer check replaced it before it ran. */
  check(request: GtfsExportRequest): Promise<GtfsExportCheck | undefined>;
  /** Builds the files for a request on freshly read records. */
  build(records: ScenarioRecords, request: GtfsExportRequest): Promise<BuiltFeed>;
  dispose(): void;
}

/** A new worker from gtfsExportWorker.ts, or undefined where the browser has no Worker. */
export function createBrowserExportWorker(): ExportWorkerLike | undefined {
  if (typeof Worker === 'undefined') return undefined;
  return new Worker(new URL('./gtfsExportWorker.ts', import.meta.url), { type: 'module' });
}

interface Pending {
  resolve(response: GtfsExportWorkerResponse): void;
  reject(error: Error): void;
}

/** `createWorker` is called once, when the first message is sent. When it returns nothing or throws, everything runs on the main thread. */
export function createGtfsExportEngine(createWorker: () => ExportWorkerLike | undefined = createBrowserExportWorker): GtfsExportEngine {
  let worker: ExportWorkerLike | undefined;
  let attempted = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  // The main-thread path keeps its own copy of the loaded records.
  let localRecords: ScenarioRecords | undefined;
  // Checks: one in flight, the newest waiting.
  let checking = false;
  let waiting: { request: GtfsExportRequest; resolve(check: GtfsExportCheck | undefined): void; reject(error: Error): void } | undefined;

  const failAll = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const ensureWorker = (): ExportWorkerLike | undefined => {
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
          pending.delete(response.id);
          if (response.type === 'error') request.reject(new Error(response.message));
          else request.resolve(response);
        };
        worker.onerror = (event) => {
          failAll(new Error(event.message || 'The export worker stopped unexpectedly.'));
          worker?.terminate();
          worker = undefined;
        };
      }
    }
    return worker;
  };

  const send = (active: ExportWorkerLike, message: DistributiveOmit<GtfsExportWorkerRequest, 'id'>): Promise<GtfsExportWorkerResponse> => {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        active.postMessage({ ...message, id } as GtfsExportWorkerRequest);
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  const runCheck = async (request: GtfsExportRequest): Promise<GtfsExportCheck> => {
    const active = ensureWorker();
    if (active) {
      const response = await send(active, { type: 'check', request });
      if (response.type !== 'checked') throw new Error('The export worker sent an unexpected answer.');
      return response.check;
    }
    if (!localRecords) throw new Error('The export engine has no Scenario loaded.');
    // Let the page paint the "Checking" state before the long run starts.
    await new Promise((resolve) => setTimeout(resolve));
    return buildFeed(localRecords, request, false).check;
  };

  const drain = async (): Promise<void> => {
    while (waiting) {
      const next = waiting;
      waiting = undefined;
      checking = true;
      try {
        next.resolve(await runCheck(next.request));
      } catch (error) {
        next.reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        checking = false;
      }
    }
  };

  return {
    async load(records) {
      const active = ensureWorker();
      if (!active) { localRecords = records; return; }
      const response = await send(active, { type: 'load', records });
      if (response.type !== 'loaded') throw new Error('The export worker sent an unexpected answer.');
    },
    check(request) {
      return new Promise<GtfsExportCheck | undefined>((resolve, reject) => {
        waiting?.resolve(undefined);
        waiting = { request, resolve, reject };
        if (!checking) void drain();
      });
    },
    async build(records, request) {
      const active = ensureWorker();
      if (!active) {
        await new Promise((resolve) => setTimeout(resolve));
        return buildFeed(records, request, true);
      }
      const response = await send(active, { type: 'build', records, request });
      if (response.type !== 'built') throw new Error('The export worker sent an unexpected answer.');
      return response.built;
    },
    dispose() {
      waiting?.resolve(undefined);
      waiting = undefined;
      failAll(new Error('The export was cancelled.'));
      worker?.terminate();
      worker = undefined;
      attempted = false;
      localRecords = undefined;
    },
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
