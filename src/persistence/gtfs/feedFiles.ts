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

/**
 * The text of a table with one marker row added after its last line. readCsvRecords keys each record by the header, so a table with no data
 * rows yields nothing; the marker is that one record. It is read only when the table ends, and it is never returned to a caller.
 */
function withMarkerRow(text: ReadableStream<string>): ReadableStream<string> {
  const reader = text.getReader();
  let marked = false;
  return new ReadableStream<string>({
    async pull(controller) {
      const next = await reader.read();
      if (!next.done) {
        controller.enqueue(next.value);
        return;
      }
      if (!marked) {
        marked = true;
        controller.enqueue('\nx');
      }
      controller.close();
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

/**
 * The header names of one table, trimmed and in file order, whether or not the table has data rows. A table with no header line at all
 * has no names.
 */
export async function readFeedHeader(bytes: Uint8Array, entry: ZipEntry): Promise<string[]> {
  for await (const record of readCsvRecords(withMarkerRow(zipEntryText(bytes, entry)))) return Object.keys(record);
  return [];
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
