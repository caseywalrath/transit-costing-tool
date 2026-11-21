import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readCsvRecords } from './csvStream';

const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures/gtfs/', import.meta.url));
const load = (path: string): Uint8Array => new Uint8Array(readFileSync(FIXTURES + path));

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of source) out.push(item);
  return out;
}

async function* pieces(parts: string[]): AsyncGenerator<string> {
  for (const part of parts) yield part;
}

function streamOf(parts: string[]): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

const CHUNKING_SAMPLE = 'a,b\r\n"x,""y""\r\nz",2\r\n,\r\n3,4';
const CHUNKING_EXPECTED = [
  { a: 'x,"y"\r\nz', b: '2' },
  { a: '3', b: '4' },
];

// The BOM is kept when decoding so that the reader's own BOM removal is what the test exercises.
function textOf(path: string): string {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(load(path));
}

describe('readCsvRecords on the mini feed', () => {
  it('reads calendar.txt (CRLF), stops.txt (BOM, quoted comma) and routes.txt (quoted comma)', async () => {
    const calendar = await collect(readCsvRecords(streamOf([textOf('mini/calendar.txt')])));
    expect(calendar).toHaveLength(3);
    expect(calendar.map((record) => record.service_id)).toEqual(['WKDY', 'SAT', 'SUN']);

    const stops = await collect(readCsvRecords(streamOf([textOf('mini/stops.txt')])));
    expect(stops).toHaveLength(7);
    expect(stops[0].stop_id).toBe('S1');
    expect(stops[0].stop_name).toBe('Main St & 1st Ave, Shared');
    expect(stops.find((record) => record.stop_id === 'P1')?.platform_note).toBe('north end');

    const routes = await collect(readCsvRecords(streamOf([textOf('mini/routes.txt')])));
    expect(routes.find((record) => record.route_id === 'B1')?.route_long_name).toBe('Main St, Crosstown');
  });
});

describe('readCsvRecords chunking', () => {
  it('gives the same records for every split of the sample into two chunks', async () => {
    for (let i = 0; i <= CHUNKING_SAMPLE.length; i++) {
      const records = await collect(readCsvRecords(pieces([CHUNKING_SAMPLE.slice(0, i), CHUNKING_SAMPLE.slice(i)])));
      expect(records, `split at ${i}`).toEqual(CHUNKING_EXPECTED);
    }
  });

  it('gives the same records when every character is its own chunk', async () => {
    const chars = [...CHUNKING_SAMPLE];
    expect(await collect(readCsvRecords(pieces(chars)))).toEqual(CHUNKING_EXPECTED);
    expect(await collect(readCsvRecords(streamOf(chars)))).toEqual(CHUNKING_EXPECTED);
  });
});
