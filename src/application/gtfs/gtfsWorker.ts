// The Web Worker entry for a feed job (gtfsWorkerClient.ts). It runs the same runFeedJob the main thread runs, and posts one progress message
// per file read, then the result or the error. The messages are plain data, so they cross the boundary by structured clone.

import { runFeedJob } from './gtfsImportService';
import type { GtfsWorkerRequest, GtfsWorkerResponse } from './gtfsWorkerClient';

function post(message: GtfsWorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<GtfsWorkerRequest>) => {
  const { id, job } = event.data;
  runFeedJob({ ...job, bytes: new Uint8Array(job.bytes) }, (file) => post({ id, type: 'progress', file }))
    .then((result) => post({ id, type: 'result', result }))
    .catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      post({ id, type: 'error', message: failure.message, name: failure.name });
    });
};
