// The Web Worker entry for the GTFS export (gtfsExportWorkerClient.ts). It keeps the records of `load` for the checks and runs the same
// functions the main thread runs. Messages are plain data and cross the boundary by structured clone.

import type { ScenarioRecords } from '../../domain/project';
import { buildFeed } from './gtfsExportBuild';
import type { GtfsExportWorkerRequest, GtfsExportWorkerResponse } from './gtfsExportWorkerClient';

let loaded: ScenarioRecords | undefined;

function post(message: GtfsExportWorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<GtfsExportWorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === 'load') {
      loaded = message.records;
      post({ id: message.id, type: 'loaded' });
    } else if (message.type === 'check') {
      if (!loaded) throw new Error('The export worker has no Scenario loaded.');
      post({ id: message.id, type: 'checked', check: buildFeed(loaded, message.request, false).check });
    } else {
      post({ id: message.id, type: 'built', built: buildFeed(message.records, message.request, true) });
    }
  } catch (error) {
    post({ id: message.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
