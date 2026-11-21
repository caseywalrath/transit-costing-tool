import { readCsvRecords, zipEntryText } from './csvStream';
import type { ZipEntry } from './zipReader';

// Folder part of an entry name, with its trailing slash; '' for the root of the archive.
function folderOf(name: string): string {
  return name.slice(0, name.lastIndexOf('/') + 1);
}

// macOS adds a '__MACOSX/' folder of metadata copies to archives made in Finder; they are not feed files.
function isMacMetadata(name: string): boolean {
  return name === '__MACOSX' || name.startsWith('__MACOSX/');
}

/** Maps 'stops.txt' etc. to entries. Files may be at the root or all inside one folder; directories and '__MACOSX/' entries are ignored. */
export function findFeedFiles(entries: ZipEntry[]): Map<string, ZipEntry> {
  const textFiles = entries.filter(
    (entry) => !entry.name.endsWith('/') && !isMacMetadata(entry.name) && entry.name.toLowerCase().endsWith('.txt'),
  );

  // The root wins when it holds any text file, so a stray folder beside the feed is ignored. Otherwise
  // the feed must sit in exactly one folder; several candidate folders are ambiguous, and nothing is mapped.
  const folders = new Set(textFiles.map((entry) => folderOf(entry.name)));
  let chosen: string;
  if (folders.has('')) {
    chosen = '';
  } else if (folders.size === 1) {
    chosen = [...folders][0];
  } else {
    return new Map();
  }

  const files = new Map<string, ZipEntry>();
  for (const entry of textFiles) {
    if (folderOf(entry.name) === chosen) files.set(entry.name.slice(chosen.length), entry);
  }
  return files;
}

/** Reads one table, keeping rows for which keep(row) is true (all rows when absent). */
export async function readFeedTable(
  bytes: Uint8Array,
  entry: ZipEntry,
  keep?: (row: Record<string, string>) => boolean,
): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for await (const row of readCsvRecords(zipEntryText(bytes, entry))) {
    if (!keep || keep(row)) rows.push(row);
  }
  return rows;
}
