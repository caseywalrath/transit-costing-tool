/**
 * Decision 0085. Reads CSV text into records of cells (RFC 4180). A leading byte-order mark is removed. Fields are separated by commas;
 * records end at CRLF, LF, or CR. A quoted field may hold commas, line breaks, and `""` for a quote. A trailing line break does not
 * make an empty record. Output only: this reader does not interpret any column.
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character !== '"') cell += character;
      else if (source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      record.push(cell);
      cell = '';
    } else if (character === '\r' || character === '\n') {
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
      if (character === '\r' && source[index + 1] === '\n') index += 1;
    } else cell += character;
  }
  if (cell !== '' || record.length > 0) {
    record.push(cell);
    records.push(record);
  }
  // Blank lines at the end of the text are not records (the importer counts skipped records, so they must not be counted).
  while (records.length > 0 && records[records.length - 1].length === 1 && records[records.length - 1][0] === '') records.pop();
  return records;
}
