export type CsvArchiveFile = { filename: string; contents: string };

const encoder = new TextEncoder();
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function u16(value: number) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
function u32(value: number) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

/** Creates a dependency-free ZIP archive using stored (uncompressed) CSV entries. */
export function createCsvArchive(files: CsvArchiveFile[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.filename);
    const contents = encoder.encode(file.contents);
    const checksum = crc32(contents);
    const localHeader = join([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(checksum), u32(contents.length), u32(contents.length), u16(name.length), u16(0), name,
    ]);
    localParts.push(localHeader, contents);
    const centralHeader = join([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(checksum), u32(contents.length), u32(contents.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(localOffset), name,
    ]);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + contents.length;
  }
  const centralDirectory = join(centralParts);
  const localDirectory = join(localParts);
  const end = join([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralDirectory.length), u32(localDirectory.length), u16(0)]);
  return new Blob([localDirectory, centralDirectory, end], { type: 'application/zip' });
}
