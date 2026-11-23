import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ZipReadError, type ZipEntry, openZipEntry, readZipEntries } from './zipReader';

const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures/gtfs/', import.meta.url));
const load = (path: string): Uint8Array => new Uint8Array(readFileSync(FIXTURES + path));

const MINI_FILES = [
  'agency.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'frequencies.txt',
  'routes.txt',
  'shapes.txt',
  'stop_times.txt',
  'stops.txt',
  'trips.txt',
];

function entryNamed(entries: ZipEntry[], name: string): ZipEntry {
  const found = entries.find((entry) => entry.name === name);
  if (!found) throw new Error(`fixture has no ${name}`);
  return found;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** The error code the function throws, or undefined when it does not throw. */
function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof ZipReadError ? error.code : `not a ZipReadError: ${String(error)}`;
  }
  return undefined;
}

function findCentralHeader(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let p = 0; p + 4 <= bytes.length; p++) {
    if (view.getUint32(p, true) === 0x02014b50) return p;
  }
  throw new Error('no central directory entry in fixture');
}

function findEndRecord(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let p = bytes.length - 22; p >= 0; p--) {
    if (view.getUint32(p, true) === 0x06054b50) return p;
  }
  throw new Error('no end record in fixture');
}

/** A copy of a fixture with one header field changed, so the reader sees a damaged or unusual archive. */
function patchedCopy(path: string, edit: (bytes: Uint8Array, view: DataView) => void): Uint8Array {
  const copy = load(path).slice();
  edit(copy, new DataView(copy.buffer));
  return copy;
}

describe('readZipEntries', () => {
  it('lists the nine feed files with method 8 in the deflated ZIP and method 0 in the stored ZIP', () => {
    const deflated = readZipEntries(load('zips/mini-deflate.zip'));
    expect(deflated.map((entry) => entry.name).sort()).toEqual(MINI_FILES);
    expect(deflated.every((entry) => entry.method === 8)).toBe(true);

    const stored = readZipEntries(load('zips/mini-stored.zip'));
    expect(stored.map((entry) => entry.name).sort()).toEqual(MINI_FILES);
    expect(stored.every((entry) => entry.method === 0)).toBe(true);
  });
});

describe('openZipEntry', () => {
  it('returns stops.txt byte for byte, BOM included, from the stored and the deflated ZIP', async () => {
    const expected = load('mini/stops.txt');
    expect([...expected.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    for (const zip of ['zips/mini-deflate.zip', 'zips/mini-stored.zip']) {
      const bytes = load(zip);
      const entry = entryNamed(readZipEntries(bytes), 'stops.txt');
      expect(await readAll(openZipEntry(bytes, entry))).toEqual(expected);
    }
  });
});

describe('error codes', () => {
  it('refuses random bytes as notZip', () => {
    const bytes = new Uint8Array(4096);
    let seed = 12345;
    for (let i = 0; i < bytes.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      bytes[i] = (seed >>> 16) & 0xff;
    }
    expect(codeOf(() => readZipEntries(bytes))).toBe('notZip');
  });

  it('reports corrupt when one byte of a stored entry is flipped', async () => {
    const bytes = load('zips/mini-stored.zip').slice();
    const view = new DataView(bytes.buffer);
    const entry = entryNamed(readZipEntries(bytes), 'stops.txt');
    // The local header is 30 bytes plus the name and extra lengths; the data starts after them.
    const dataStart =
      entry.localHeaderOffset + 30 + view.getUint16(entry.localHeaderOffset + 26, true) + view.getUint16(entry.localHeaderOffset + 28, true);
    // Byte 3 is the 's' of "stop_id" after the BOM; 's' to 'r' keeps the text valid UTF-8 and changes the CRC.
    expect(bytes[dataStart + 3]).toBe(0x73);
    bytes[dataStart + 3] ^= 0x01;

    await expect(readAll(openZipEntry(bytes, entry))).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('reports encrypted when general-purpose flag bit 0 is set', () => {
    const bytes = patchedCopy('zips/mini-deflate.zip', (b, view) => {
      const p = findCentralHeader(b);
      view.setUint16(p + 8, view.getUint16(p + 8, true) | 0x0001, true);
    });
    expect(codeOf(() => readZipEntries(bytes))).toBe('encrypted');
  });

  it('reports unsupportedMethod for compression method 12', () => {
    const bytes = patchedCopy('zips/mini-deflate.zip', (b, view) => {
      view.setUint16(findCentralHeader(b) + 10, 12, true);
    });
    expect(codeOf(() => readZipEntries(bytes))).toBe('unsupportedMethod');
  });

  it('reports multiPart when the number of this disk is 1', () => {
    const bytes = patchedCopy('zips/mini-deflate.zip', (b, view) => {
      view.setUint16(findEndRecord(b) + 4, 1, true);
    });
    expect(codeOf(() => readZipEntries(bytes))).toBe('multiPart');
  });

  it('reports zip64 when the entry count is 0xFFFF', () => {
    const bytes = patchedCopy('zips/mini-deflate.zip', (b, view) => {
      view.setUint16(findEndRecord(b) + 10, 0xffff, true);
    });
    expect(codeOf(() => readZipEntries(bytes))).toBe('zip64');
  });
});
