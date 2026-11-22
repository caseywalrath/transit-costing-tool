import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type FeedJob, runFeedJob } from './gtfsImportService';
import { loadFeedTables } from '../../domain/gtfs/testFeeds';
import { createGtfsFeedJobClient, type FeedWorkerLike, type GtfsWorkerRequest, type GtfsWorkerResponse, readRouteStopTimes } from './gtfsWorkerClient';

const NOW = '2026-11-22T09:00:00.000Z';
const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures/gtfs/', import.meta.url));
const ROUTE_IDS = ['B1', 'R1', 'F1'];

function miniJob(bytes: Uint8Array = new Uint8Array(readFileSync(join(FIXTURES, 'zips/mini-deflate.zip')))): FeedJob {
  return { bytes, fileName: 'mini.zip', routeIds: ROUTE_IDS, now: NOW, plan: {} };
}

/**
 * A worker that runs each job with the same runFeedJob and posts its messages asynchronously, as a real worker does. Each message is cloned,
 * as a structured clone would clone it, so the test sees what would cross the boundary.
 */
class LoopbackWorker implements FeedWorkerLike {
  onmessage: ((event: MessageEvent<GtfsWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly requests: GtfsWorkerRequest[] = [];
  terminated = false;

  postMessage(request: GtfsWorkerRequest, _transfer: Transferable[]): void {
    this.requests.push(request);
    const { id, job } = request;
    const send = (response: GtfsWorkerResponse) => {
      queueMicrotask(() => this.onmessage?.({ data: structuredClone(response) } as MessageEvent<GtfsWorkerResponse>));
    };
    runFeedJob({ ...job, bytes: new Uint8Array(job.bytes) }, (file) => send({ id, type: 'progress', file }))
      .then((result) => send({ id, type: 'result', result }))
      .catch((error: Error) => send({ id, type: 'error', message: error.message, name: error.name }));
  }

  terminate(): void {
    this.terminated = true;
  }
}

const NOT_A_ZIP = new Uint8Array(Array.from({ length: 22 }, (_, index) => index + 1));

describe('feed job client, main-thread fallback', () => {
  it('runs on the main thread when the creator returns no worker, and reports each file it reads', async () => {
    const read: string[] = [];
    const result = await createGtfsFeedJobClient(() => undefined).run(miniJob(), (file) => read.push(file));
    expect(read[0]).toBe('routes.txt');
    expect(read).toContain('stop_times.txt');
    expect(result.translation.routes).toHaveLength(ROUTE_IDS.length);
    expect(structuredClone(result)).toEqual(result);
  });

  it('finds no Worker in this environment by default, and so runs on the main thread', async () => {
    const result = await createGtfsFeedJobClient().run(miniJob());
    expect(result.translation.routes).toHaveLength(ROUTE_IDS.length);
  });

  it('refuses a file that is not a ZIP archive, with the reader\'s message', async () => {
    await expect(createGtfsFeedJobClient(() => undefined).run(miniJob(NOT_A_ZIP))).rejects.toMatchObject({
      name: 'ZipReadError',
      message: expect.stringContaining('not a ZIP archive'),
    });
  });
});

describe('feed job client, worker path', () => {
  it('gives the same report, counts and tables as the main thread, and forwards progress messages', async () => {
    const main = await createGtfsFeedJobClient(() => undefined).run(miniJob());
    const read: string[] = [];
    const result = await createGtfsFeedJobClient(() => new LoopbackWorker()).run(miniJob(), (file) => read.push(file));
    expect(read[0]).toBe('routes.txt');
    expect(read.at(-1)).toBe('stop_times.txt');
    expect(result.translation.report).toEqual(main.translation.report);
    expect(result.counts).toEqual(main.counts);
    expect(result.tables).toEqual(main.tables);
  });

  it('transfers a copy of the bytes, so the caller keeps its own buffer', async () => {
    const worker = new LoopbackWorker();
    const job = miniJob();
    await createGtfsFeedJobClient(() => worker).run(job);
    expect(worker.requests[0].job.bytes).toBeInstanceOf(ArrayBuffer);
    expect(worker.requests[0].job.bytes).not.toBe(job.bytes.buffer);
    expect(job.bytes.byteLength).toBeGreaterThan(0);
    expect(job.bytes[0]).toBe(0x50);
  });

  it('rejects with the worker\'s error, keeping its name and message', async () => {
    await expect(createGtfsFeedJobClient(() => new LoopbackWorker()).run(miniJob(NOT_A_ZIP))).rejects.toMatchObject({
      name: 'ZipReadError',
      message: expect.stringContaining('not a ZIP archive'),
    });
  });

  it('rejects the waiting job and stops using a worker that fails to load, so later jobs run on the main thread', async () => {
    const worker = new LoopbackWorker();
    let created = 0;
    const client = createGtfsFeedJobClient(() => {
      created += 1;
      return worker;
    });
    const waiting = client.run(miniJob());
    worker.onerror?.({ message: 'The worker failed to load.' } as ErrorEvent);
    await expect(waiting).rejects.toThrow('The worker failed to load.');
    expect(worker.terminated).toBe(true);
    const later = await client.run(miniJob());
    expect(later.translation.routes).toHaveLength(ROUTE_IDS.length);
    expect(created).toBe(1);
  });

  it('cancels a job still waiting when the client is disposed, and ends the worker', async () => {
    const worker = new LoopbackWorker();
    const client = createGtfsFeedJobClient(() => worker);
    const waiting = client.run(miniJob());
    client.dispose();
    await expect(waiting).rejects.toThrow('cancelled');
    expect(worker.terminated).toBe(true);
  });
});

describe('stop-times read (sub-plan I8, item 1)', () => {
  const bytes = new Uint8Array(readFileSync(join(FIXTURES, 'zips/mini-deflate.zip')));
  const selectedTripIds = new Set(loadFeedTables('mini').trips.filter((trip) => ROUTE_IDS.includes(trip.route_id)).map((trip) => trip.trip_id));
  const expected = loadFeedTables('mini').stopTimes.filter((row) => selectedTripIds.has(row.trip_id));

  /** A worker that answers a stop-times task the way gtfsWorker.ts does, so the test sees the same messages a browser worker would send. */
  class StopTimesWorker extends LoopbackWorker {
    override postMessage(request: GtfsWorkerRequest, transfer: Transferable[]): void {
      if (request.task !== 'stopTimes') return super.postMessage(request, transfer);
      this.requests.push(request);
      const { id, job } = request;
      const progress = (file: string) => queueMicrotask(() => this.onmessage?.({ data: { id, type: 'progress', file } } as MessageEvent<GtfsWorkerResponse>));
      readRouteStopTimes(new Uint8Array(job.bytes), job.routeIds, progress)
        .then((result) => queueMicrotask(() => this.onmessage?.({ data: structuredClone({ id, type: 'result', result }) } as MessageEvent<GtfsWorkerResponse>)))
        .catch((error: Error) => queueMicrotask(() => this.onmessage?.({ data: { id, type: 'error', message: error.message, name: error.name } } as MessageEvent<GtfsWorkerResponse>)));
      return undefined;
    }
  }

  it('reads the stop-time rows of the selected Routes on the main thread, the same rows the import reads', async () => {
    const result = await createGtfsFeedJobClient(() => undefined).readStopTimes({ bytes, routeIds: ROUTE_IDS });
    expect(result.stopTimes).toEqual(expected);
  });

  it('reads the same rows through a worker and reports the stop_times.txt read', async () => {
    const read: string[] = [];
    const result = await createGtfsFeedJobClient(() => new StopTimesWorker()).readStopTimes({ bytes, routeIds: ROUTE_IDS }, (file) => read.push(file));
    expect(result.stopTimes).toEqual(expected);
    expect(read).toContain('stop_times.txt');
  });
});

describe('feed overview (sub-plan I8, step 1)', () => {
  it('reads the tables without stop times and the summary, and never opens stop_times.txt', async () => {
    const read: string[] = [];
    const result = await createGtfsFeedJobClient(() => undefined).readOverview({ bytes: new Uint8Array(readFileSync(join(FIXTURES, 'zips/mini-deflate.zip'))), now: NOW }, (file) => read.push(file));
    expect(result.tables.stopTimes).toEqual([]);
    expect(read).not.toContain('stop_times.txt');
    expect(result.summary.agencies[0]?.name).toBe('Mini Test Transit');
    expect(result.summary.routes.map((row) => row.shortName).sort()).toEqual(['B1', 'F1', 'R1']);
  });
});
