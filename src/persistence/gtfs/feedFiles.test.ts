import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findFeedFiles, readFeedTable } from './feedFiles';
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

describe('readFeedTable', () => {
  it('keeps only the trips of route B1 (8 rows) when a keep rule is given', async () => {
    const zip = load('zips/mini-deflate.zip');
    const trips = entryNamed(readZipEntries(zip), 'trips.txt');
    const rows = await readFeedTable(zip, trips, (row) => row.route_id === 'B1');
    expect(rows).toHaveLength(8);
    expect(rows.every((row) => row.route_id === 'B1')).toBe(true);
  });
});
