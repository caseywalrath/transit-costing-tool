// Tests only. An RFC 4180 reader that shows what a spreadsheet would see: CR, LF, and CRLF outside quotes end a row.
export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; } else if (character === '"') quoted = false; else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\r' || character === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; if (character === '\r' && text[index + 1] === '\n') index += 1; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
