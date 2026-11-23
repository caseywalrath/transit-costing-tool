import { type ZipEntry, openZipEntry } from './zipReader';

// Splits CSV text into fields one character at a time, so a chunk may end anywhere: inside a quoted
// field, between a CR and its LF, or between the two quotes of an escaped quote.
class CsvRowParser {
  private field = '';
  private fields: string[] = [];
  private fieldStarted = false;
  private inQuotes = false;
  private pendingQuote = false;
  private skipLineFeed = false;
  private atStart = true;

  push(chunk: string): string[][] {
    const rows: string[][] = [];
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      const first = this.atStart;
      this.atStart = false;
      if (first && c === '﻿') continue;
      if (this.skipLineFeed) {
        this.skipLineFeed = false;
        if (c === '\n') continue;
      }
      if (this.inQuotes) {
        if (this.pendingQuote) {
          this.pendingQuote = false;
          if (c === '"') {
            this.field += '"';
            continue;
          }
          this.inQuotes = false;
        } else if (c === '"') {
          this.pendingQuote = true;
          continue;
        } else {
          this.field += c;
          continue;
        }
      }
      if (c === '"' && !this.fieldStarted) {
        this.inQuotes = true;
        this.fieldStarted = true;
        continue;
      }
      if (c === ',') {
        this.endField();
      } else if (c === '\r' || c === '\n') {
        this.endField();
        rows.push(this.fields);
        this.fields = [];
        this.skipLineFeed = c === '\r';
      } else {
        this.field += c;
        this.fieldStarted = true;
      }
    }
    return rows;
  }

  finish(): string[][] {
    this.pendingQuote = false;
    this.inQuotes = false;
    if (!this.fieldStarted && this.field === '' && this.fields.length === 0) return [];
    this.endField();
    const last = this.fields;
    this.fields = [];
    return [last];
  }

  private endField(): void {
    this.fields.push(this.field);
    this.field = '';
    this.fieldStarted = false;
  }
}

async function* chunksOf(text: ReadableStream<string> | AsyncIterable<string>): AsyncGenerator<string> {
  if ('getReader' in text) {
    const reader = text.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    yield* text;
  }
}

/** Yields one record per data row, keyed by trimmed header name. */
export async function* readCsvRecords(text: ReadableStream<string> | AsyncIterable<string>): AsyncGenerator<Record<string, string>> {
  const parser = new CsvRowParser();
  let header: string[] | undefined;

  // A row whose fields are all empty is a blank line or a row of commas; it is skipped. The first
  // non-blank row is the header.
  const toRecord = (row: string[]): Record<string, string> | undefined => {
    if (row.every((field) => field === '')) return undefined;
    if (!header) {
      header = row.map((name) => name.trim());
      return undefined;
    }
    const record: Record<string, string> = {};
    header.forEach((name, index) => {
      record[name] = index < row.length ? row[index] : '';
    });
    return record;
  };

  for await (const chunk of chunksOf(text)) {
    for (const row of parser.push(chunk)) {
      const record = toRecord(row);
      if (record) yield record;
    }
  }
  for (const row of parser.finish()) {
    const record = toRecord(row);
    if (record) yield record;
  }
}

/** UTF-8 text of an entry, as a stream of strings (TextDecoderStream). */
export function zipEntryText(bytes: Uint8Array, entry: ZipEntry): ReadableStream<string> {
  // Same narrowing as the inflate step in zipReader.ts: lib.dom types this writable as BufferSource.
  const decoder = new TextDecoderStream('utf-8');
  return openZipEntry(bytes, entry).pipeThrough({ writable: decoder.writable as WritableStream<Uint8Array>, readable: decoder.readable });
}
