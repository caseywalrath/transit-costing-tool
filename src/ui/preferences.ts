// Selection preferences kept in `localStorage` (Decision 0021 item 8): non-authoritative convenience state that must never stop the
// app from loading. Whatever is stored, a reader gets either valid values or nothing, so a `null`, an array, or a wrong-shaped value
// falls back to the default selection (review issue I-026, finding 4-010).

type StorageReader = Pick<Storage, 'getItem'>;

/** The stored JSON object, or an empty object when the key is missing, unreadable, or not a plain object (`null`, an array, a number). */
export function readStoredRecord(key: string, storage: StorageReader | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(storage?.getItem(key) ?? 'null');
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
}

/** A non-empty string, or `undefined`. */
export function storedText(value: unknown): string | undefined { return typeof value === 'string' && value ? value : undefined; }

/** An object whose values are all non-empty strings (identifier maps), with every other entry dropped. */
export function storedTextMap(value: unknown): Record<string, string> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '');
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// Side-by-side Trips (Decision 0060 item 5): per-viewer convenience state, never Scenario data and never in backups.
export const SIDE_BY_SIDE_PREFERENCE_KEY = 'transit-costing-tool.trips-side-by-side.v1';
export type SideBySidePreference = { on: boolean; leftDirectionId?: string };

export function readSideBySidePreference(storage?: StorageReader): SideBySidePreference {
  const stored = readStoredRecord(SIDE_BY_SIDE_PREFERENCE_KEY, storage);
  return { on: stored.on === true, leftDirectionId: storedText(stored.leftDirectionId) };
}

export function writeSideBySidePreference(preference: SideBySidePreference) {
  try { localStorage.setItem(SIDE_BY_SIDE_PREFERENCE_KEY, JSON.stringify(preference)); } catch { /* Storage is a convenience only. */ }
}

/** The two directions to show, left then right, by `sequence`. The stored left direction is used when it still exists; the right one is the first other direction. Fewer than two directions gives `undefined`. */
export function sideBySideDirectionIds(directions: ReadonlyArray<{ id: string; sequence: number }>, leftDirectionId: string | undefined): [string, string] | undefined {
  const ordered = [...directions].sort((a, b) => a.sequence - b.sequence);
  if (ordered.length < 2) return undefined;
  const left = ordered.find((direction) => direction.id === leftDirectionId) ?? ordered[0]!;
  const right = ordered.find((direction) => direction.id !== left.id)!;
  return [left.id, right.id];
}
