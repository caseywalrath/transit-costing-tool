import type { SaveState } from '../../application/ports';
import type { Route } from '../../domain/types';

export type HeaderStatus = { kind: 'readOnly' | 'error' | 'saving' | 'saved'; text: string; backup?: { text: string; stale: boolean } };

const DAY_MS = 86_400_000;
export const STALE_BACKUP_DAYS = 7;

/** "backup 3 days old" or "no backup yet". `stale` is true for a missing backup or one older than seven days. Invalid dates count as missing. */
export function describeBackupAge(lastBackupExportedAt: string | undefined, now: number): { text: string; stale: boolean } {
  const exportedAt = lastBackupExportedAt ? Date.parse(lastBackupExportedAt) : Number.NaN;
  if (Number.isNaN(exportedAt)) return { text: 'no backup yet', stale: true };
  const days = Math.max(0, Math.floor((now - exportedAt) / DAY_MS));
  return { text: days === 0 ? 'backup from today' : `backup ${days} day${days === 1 ? '' : 's'} old`, stale: days > STALE_BACKUP_DAYS };
}

/** The header status, by priority: read-only, save failed, saving, then saved with the backup age. */
export function headerStatus({ readOnly, saveState, lastBackupExportedAt, now }: { readOnly: boolean; saveState: SaveState; lastBackupExportedAt?: string; now: number }): HeaderStatus {
  if (readOnly) return { kind: 'readOnly', text: 'Read-only: open in another tab' };
  if (saveState === 'error') return { kind: 'error', text: 'Local save failed' };
  if (saveState === 'saving') return { kind: 'saving', text: 'Saving locally…' };
  return { kind: 'saved', text: 'Saved locally', backup: describeBackupAge(lastBackupExportedAt, now) };
}

/**
 * The text of a route in a scope selector: the short name when it has one that no other route shares, otherwise "short — name".
 * The full name goes in the selector's title.
 */
export function routeOptionLabel(route: Pick<Route, 'id' | 'name' | 'shortName'>, routes: Pick<Route, 'id' | 'shortName'>[]): string {
  const short = route.shortName?.trim();
  if (!short) return route.name || 'Untitled route';
  const shared = routes.some((other) => other.id !== route.id && other.shortName?.trim() === short);
  return shared ? `${short} — ${route.name}` : short;
}
