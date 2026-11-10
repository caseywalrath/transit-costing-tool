/**
 * Plain text for a table on the clipboard (Decision 0066 item 11): cells are joined with tabs and rows with newlines. A tab or a newline
 * inside a cell becomes one space, and leading and trailing spaces are removed, so each cell stays one field.
 */
export function tableToTsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => cell.replace(/\t|\r\n|\r|\n/g, ' ').trim()).join('\t')).join('\n');
}
