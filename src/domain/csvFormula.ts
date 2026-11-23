// Formula protection for free-text CSV cells. Pure, so the domain can use it (domain code imports nothing from persistence).
// `src/persistence/csv.ts` re-exports these two functions from their old place, so every existing caller is unchanged.

/**
 * Spreadsheets run a cell that begins with `=`, `+`, `-`, or `@` as a formula. A free-text value that begins that way, or that
 * already begins with apostrophes before one of those characters, gets one more apostrophe in front (decision 5). `restoreFormulaText`
 * removes it again on import, so a value round-trips exactly. Identifiers, times, and numbers are never passed through this.
 */
export function neutralizeFormulaText(text: string): string { return /^'*[=+\-@]/.test(text) ? `'${text}` : text; }
export function restoreFormulaText(text: string): string { return /^'+[=+\-@]/.test(text) ? text.slice(1) : text; }
