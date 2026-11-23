// The Web Worker entry for a feed job (gtfsWorkerClient.ts). It runs the same function the main thread runs for the job (runFeedJob for a
// plan, readRouteStopTimes for a stop-times task), and posts one progress message per file read, then the result or the error. The
// messages are plain data, so they cross the boundary by structured clone.

import { runFeedJob } from './gtfsImportService';
import { type GtfsWorkerRequest, type GtfsWorkerResponse, readFeedOverview, readRouteStopTimes } from './gtfsWorkerClient';

function post(message: GtfsWorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<GtfsWorkerRequest>) => {
  const { id, task, job } = event.data;
  const bytes = new Uint8Array(job.bytes);
  const onFile = (file: string) => post({ id, type: 'progress', file });
  const running = task === 'stopTimes'
    ? readRouteStopTimes(bytes, job.routeIds, onFile)
    : task === 'overview'
      ? readFeedOverview(bytes, job.now, onFile)
      : runFeedJob({ ...job, bytes }, onFile);
  running
    .then((result) => post({ id, type: 'result', result }))
    .catch((error: unknown) => {
      const failure = error instanceof Error ? error : new Error(String(error));
      post({ id, type: 'error', message: failure.message, name: failure.name });
    });
};
