import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { storedZip } from '../../testSupport/storedZip';
import { findFeedFiles, readFeedHeader, readFeedTable } from './feedFiles';
import { readZipEntries, type ZipEntry } from './zipReader';

const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures/gtfs/', import.meta.url));
const load = (path: string): Uint8Array => new Uint8Array(readFileSync(FIXTURES + path));

function entryNamed(entries: ZipEntry[], name: string): ZipEntry {
  const found = entries.find((entry) => entry.name === name);
  if (!found) throw new Error(`fixture has no ${name}`);
  return found;
}

/** A directory listing built by hand: only names matter to findFeedFiles. */
function listing(...names: string[]): ZipEntry[] {
  return names.map((name): ZipEntry => ({ name, method: 8, compressedSize: 0, uncompressedSize: 0, crc32: 0, localHeaderOffset: 0 }));
}

describe('findFeedFiles', () => {
  it('maps files inside one folder to their paths in that folder', () => {
    const files = findFeedFiles(readZipEntries(load('zips/mini-in-folder-deflate.zip')));
    expect(files.get('stops.txt')?.name).toBe('mini-feed/stops.txt');
    expect(files.size).toBe(9);
  });

  it('maps only root files when entries sit in two different folders, and ignores directories and __MACOSX', () => {
    const files = findFeedFiles(
      listing('stops.txt', 'routes.txt', 'a/', 'a/stops.txt', 'b/trips.txt', '__MACOSX/._stops.txt', '__MACOSX/a/._stops.txt'),
    );
    expect([...files.keys()].sort()).toEqual(['routes.txt', 'stops.txt']);
    expect(files.get('stops.txt')?.name).toBe('stops.txt');
  });

  it('maps nothing when the feed files sit in two folders and none at the root', () => {
    expect(findFeedFiles(listing('a/stops.txt', 'b/trips.txt')).size).toBe(0);
  });
});

/** The header of the one file in a stored ZIP, read through the same entry the feed import uses. */
async function headerOf(text: string): Promise<string[]> {
  const zip = storedZip({ 'table.txt': text });
  return readFeedHeader(zip, entryNamed(readZipEntries(zip), 'table.txt'));
}

describe('readFeedHeader', () => {
  it('reads the names of a table that has data rows, in file order', async () => {
    const zip = load('zips/mini-deflate.zip');
    const stopTimes = entryNamed(readZipEntries(zip), 'stop_times.txt');
    expect(await readFeedHeader(zip, stopTimes)).toEqual(['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'timepoint']);
  });

  it('reads the names of a table with a header and no data rows', async () => {
    expect(await headerOf('route_id,service_id,trip_id\n')).toEqual(['route_id', 'service_id', 'trip_id']);
  });

  it('reads a header that ends without a line break, and a table with a blank line after its header', async () => {
    expect(await headerOf('route_id,service_id')).toEqual(['route_id', 'service_id']);
    expect(await headerOf('route_id,service_id\r\n\r\n')).toEqual(['route_id', 'service_id']);
  });

  it('removes the byte-order mark, trims names, and keeps a quoted name with a comma', async () => {
    expect(await headerOf('﻿ route_id ,"stop, name"\nB1,x\n')).toEqual(['route_id', 'stop, name']);
  });

  it('has no names for an empty file', async () => {
    expect(await headerOf('')).toEqual([]);
  });
});

describe('readFeedTable', () => {
  it('keeps only the trips of route B1 (8 rows) when a keep rule is given', async () => {
    const zip = load('zips/mini-deflate.zip');
    const trips = entryNamed(readZipEntries(zip), 'trips.txt');
    const rows = await readFeedTable(zip, trips, (row) => row.route_id === 'B1');
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.route_id === 'B1')).toBe(true);
  });
});
