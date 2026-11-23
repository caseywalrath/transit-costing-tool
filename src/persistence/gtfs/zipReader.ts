// Reads ZIP archives that are already in memory: the central directory, and the bytes of one entry.
// Hand-written because the project adds no libraries. Features the feed import does not handle are
// refused with a code that names the problem, so the caller can show a plain message.

export type ZipErrorCode = 'notZip' | 'zip64' | 'encrypted' | 'multiPart' | 'unsupportedMethod' | 'corrupt';

export class ZipReadError extends Error {
  constructor(readonly code: ZipErrorCode, message: string) {
    super(message);
    this.name = 'ZipReadError';
  }
}

export interface ZipEntry {
  name: string;
  method: 0 | 8;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
}

const END_RECORD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const END_RECORD_SIZE = 22;
// The record is followed by a comment of up to 65,535 bytes, so it starts no further back than this.
const END_RECORD_SEARCH_SIZE = END_RECORD_SIZE + 0xffff;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const ENCRYPTED_FLAG = 0x0001;

const utf8 = new TextDecoder('utf-8');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function corrupt(message: string): ZipReadError {
  return new ZipReadError('corrupt', message);
}

// ZIP64 writes 0xFFFF or 0xFFFFFFFF where the real value is stored elsewhere, so such a value means
// the archive cannot be read with the fields at their normal places.
function hasZip64Marker(view: DataView, offset: number, size: 2 | 4): boolean {
  return size === 2 ? view.getUint16(offset, true) === 0xffff : view.getUint32(offset, true) === 0xffffffff;
}

function findEndRecord(view: DataView, length: number): number {
  const lowest = Math.max(0, length - END_RECORD_SEARCH_SIZE);
  for (let p = length - END_RECORD_SIZE; p >= lowest; p--) {
    if (view.getUint32(p, true) === END_RECORD_SIGNATURE) return p;
  }
  throw new ZipReadError('notZip', 'This file is not a ZIP archive, so it cannot be read as a GTFS feed.');
}

/** Reads the central directory from the end-of-central-directory record. */
export function readZipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = viewOf(bytes);
  const end = findEndRecord(view, bytes.length);
  const diskNumber = view.getUint16(end + 4, true);
  const centralDisk = view.getUint16(end + 6, true);
  const totalEntries = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);

  const hasLocator = end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR_SIGNATURE;
  const hasMarker =
    hasZip64Marker(view, end + 4, 2) ||
    hasZip64Marker(view, end + 6, 2) ||
    hasZip64Marker(view, end + 8, 2) ||
    hasZip64Marker(view, end + 10, 2) ||
    hasZip64Marker(view, end + 12, 4) ||
    hasZip64Marker(view, end + 16, 4);
  // Checked before the disk numbers: a ZIP64 archive writes 0xFFFF there, which would otherwise look like a split archive.
  if (hasLocator || hasMarker) {
    throw new ZipReadError('zip64', 'This ZIP uses the ZIP64 format, which this import cannot read. Save the feed again as a standard ZIP.');
  }
  if (diskNumber !== 0 || centralDisk !== 0) {
    throw new ZipReadError('multiPart', 'This ZIP is split across several files. Import a single ZIP file that holds the whole feed.');
  }
  if (centralOffset + centralSize > bytes.length) {
    throw corrupt('The ZIP directory of files runs past the end of the file, so the file is damaged.');
  }

  const entries: ZipEntry[] = [];
  let p = centralOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (p + CENTRAL_HEADER_SIZE > bytes.length || view.getUint32(p, true) !== CENTRAL_SIGNATURE) {
      throw corrupt(`The ZIP file list is damaged at entry ${i + 1}.`);
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc32 = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const uncompressedSize = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const nameStart = p + CENTRAL_HEADER_SIZE;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (next > bytes.length) {
      throw corrupt(`The ZIP file list is damaged at entry ${i + 1}.`);
    }
    const name = utf8.decode(bytes.subarray(nameStart, nameStart + nameLength));

    if (flags & ENCRYPTED_FLAG) {
      throw new ZipReadError('encrypted', `"${name}" is password protected. Import an unprotected copy of the feed.`);
    }
    if (method !== 0 && method !== 8) {
      throw new ZipReadError('unsupportedMethod', `"${name}" uses compression method ${method}. Only stored and deflated files can be read.`);
    }
    if (
      hasZip64Marker(view, p + 20, 4) ||
      hasZip64Marker(view, p + 24, 4) ||
      hasZip64Marker(view, p + 42, 4) ||
      hasZip64Marker(view, p + 34, 2)
    ) {
      throw new ZipReadError('zip64', `"${name}" uses the ZIP64 format, which this import cannot read. Save the feed again as a standard ZIP.`);
    }

    entries.push({ name, method: method as 0 | 8, compressedSize, uncompressedSize, crc32, localHeaderOffset });
    p = next;
  }
  return entries;
}

/** The stored bytes of an entry, as they sit in the file (before any decompression). */
function packedBytes(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  const view = viewOf(bytes);
  const header = entry.localHeaderOffset;
  if (header + LOCAL_HEADER_SIZE > bytes.length || view.getUint32(header, true) !== LOCAL_SIGNATURE) {
    throw corrupt(`"${entry.name}" is damaged: its local header is missing where the file list says it starts.`);
  }
  // The local header's name and extra lengths can differ from the central directory's, so the data
  // position is read from the local header itself.
  const start = header + LOCAL_HEADER_SIZE + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.length) {
    throw corrupt(`"${entry.name}" is damaged: its data runs past the end of the file.`);
  }
  return bytes.subarray(start, end);
}

function updateCrc(crc: number, chunk: Uint8Array): number {
  let c = crc;
  for (let i = 0; i < chunk.length; i++) c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  return c;
}

function singleChunk(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

// Passes the decompressed bytes through, and fails the stream when their size or CRC-32 differs from the
// central directory. The check runs as the bytes are read, so a damaged file is never fully buffered.
function verifiedStream(source: ReadableStream<Uint8Array>, entry: ZipEntry): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let seen = 0;
  let crc = 0xffffffff;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await reader.read();
      } catch (error) {
        if (error instanceof ZipReadError) throw error;
        throw corrupt(`"${entry.name}" is damaged: its compressed data cannot be decompressed.`);
      }
      if (next.done) {
        if (seen !== entry.uncompressedSize || (crc ^ 0xffffffff) >>> 0 !== entry.crc32) {
          throw corrupt(`"${entry.name}" is damaged: its contents do not match the checksum in the file list.`);
        }
        controller.close();
        return;
      }
      seen += next.value.byteLength;
      if (seen > entry.uncompressedSize) {
        throw corrupt(`"${entry.name}" is damaged: it is longer than the file list says.`);
      }
      crc = updateCrc(crc, next.value);
      controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

// lib.dom types the writable side of DecompressionStream as BufferSource; the runtime accepts a Uint8Array
// stream, so the pair is narrowed here rather than casting at each call site.
function inflate(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const inflater = new DecompressionStream('deflate-raw');
  return source.pipeThrough({ writable: inflater.writable as WritableStream<Uint8Array>, readable: inflater.readable });
}

/** The entry's bytes, decompressed for method 8 with DecompressionStream('deflate-raw'). Checks size and CRC-32; a mismatch throws ZipReadError('corrupt'). */
export function openZipEntry(bytes: Uint8Array, entry: ZipEntry): ReadableStream<Uint8Array> {
  const packed = singleChunk(packedBytes(bytes, entry));
  return verifiedStream(entry.method === 8 ? inflate(packed) : packed, entry);
}
