// The Web Worker entry of the comparison (compareWorkerClient.ts). It runs the same `computeSide` the main thread runs. Messages are
// plain data and cross the boundary by structured clone.

import type { CompareWorkerRequest, CompareWorkerResponse } from './compareWorkerClient';
import { computeSide } from './sideCompute';

function post(message: CompareWorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<CompareWorkerRequest>) => {
  const message = event.data;
  try {
    const result = computeSide(message.input, (progress) => post({ id: message.id, type: 'progress', progress }));
    post({ id: message.id, type: 'computed', result });
  } catch (error) {
    post({ id: message.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
