import type { LocalDataProtection, LocalDataProtectionStore } from '../application/ports';

export const LOCAL_DATA_PROTECTION_KEY = 'transit-costing-tool.local-data-protection.v1';

const ANSWERS: ReadonlySet<unknown> = new Set(['granted', 'denied', 'unavailable']);

/**
 * Keeps the local-data protection facts in the browser's `localStorage`, like the selection preferences. It is a convenience record:
 * a missing, unreadable, or malformed value reads as empty, and a failed write is ignored (private windows and blocked site data
 * make `localStorage` throw).
 */
export class LocalStorageDataProtectionStore implements LocalDataProtectionStore {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage) {}

  load(): LocalDataProtection {
    try {
      const value: unknown = JSON.parse(this.storage?.getItem(LOCAL_DATA_PROTECTION_KEY) ?? 'null');
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      const record = value as Record<string, unknown>;
      const state: LocalDataProtection = {};
      if (typeof record.lastBackupExportedAt === 'string' && !Number.isNaN(Date.parse(record.lastBackupExportedAt))) state.lastBackupExportedAt = record.lastBackupExportedAt;
      if (ANSWERS.has(record.persistentStorage)) state.persistentStorage = record.persistentStorage as LocalDataProtection['persistentStorage'];
      if (typeof record.persistentStorageCheckedAt === 'string' && !Number.isNaN(Date.parse(record.persistentStorageCheckedAt))) state.persistentStorageCheckedAt = record.persistentStorageCheckedAt;
      return state;
    } catch {
      return {};
    }
  }

  save(state: LocalDataProtection): void {
    try { this.storage?.setItem(LOCAL_DATA_PROTECTION_KEY, JSON.stringify(state)); } catch { /* Convenience record only. */ }
  }
}
