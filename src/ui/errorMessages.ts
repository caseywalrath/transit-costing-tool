// The one place that decides which error text reaches a planner (review issue I-072, findings 3-015 and 4-017; Decision 0012 item 4:
// key paths, object-store names, and index terms must not be shown). Every UI catch site calls this instead of reading `error.message`.

/** Wording that comes from the browser, Dexie, or the JavaScript runtime rather than from the application. */
const TECHNICAL_ERROR = /(?:KeyPath|object store|not indexed|Dexie|IndexedDB|IDBDatabase|ConstraintError|DataError|TransactionInactiveError|InvalidStateError|NotFoundError|AbortError|QuotaExceededError|VersionError|UnknownError|DOMException|failed to execute|database is closed|has been closed|DatabaseClosedError|OpenFailedError|BulkError|ModifyError|UpgradeError|SchemaError|PrimaryKeyError|MissingAPIError|InvalidTableError|InvalidArgumentError|SubTransactionError|VersionChangeError|not part of transaction|TypeError|Cannot read propert|is not a function|is not defined)/i;

/** A refusal that carries only message keys (`block.deadheadRequired, block.multiplePullIn`) is a code, not a sentence. */
const MESSAGE_KEY_LIST = /^[a-z]+\.[A-Za-z]+(?:, [a-z]+\.[A-Za-z]+)*$/;

/**
 * The text to show for a failed action: the error's own message when it is application wording, otherwise `fallback`.
 * The error name is checked as well, because a DOMException keeps its technical name there.
 */
export function userFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const text = error.message.trim();
  if (!text || MESSAGE_KEY_LIST.test(text) || TECHNICAL_ERROR.test(text) || TECHNICAL_ERROR.test(error.name)) return fallback;
  return text;
}
