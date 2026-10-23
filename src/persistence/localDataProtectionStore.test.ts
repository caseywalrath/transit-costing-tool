import { describe, expect, it } from 'vitest';
import { LocalStorageDataProtectionStore } from './localDataProtectionStore';

const at = '2026-10-23T09:00:00.000Z';

describe('LocalStorageDataProtectionStore', () => {
  const fakeStorage = (initial?: string) => { const data = new Map<string, string>(initial === undefined ? [] : [['transit-costing-tool.local-data-protection.v1', initial]]); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; };

  it('round-trips the record', () => {
    const storage = fakeStorage();
    const store = new LocalStorageDataProtectionStore(storage);
    expect(store.load()).toEqual({});
    store.save({ lastBackupExportedAt: at, persistentStorage: 'denied', persistentStorageCheckedAt: at });
    expect(new LocalStorageDataProtectionStore(storage).load()).toEqual({ lastBackupExportedAt: at, persistentStorage: 'denied', persistentStorageCheckedAt: at });
  });

  it.each([['not json'], ['null'], ['[]'], ['"text"'], ['{"lastBackupExportedAt":5,"persistentStorage":"maybe","persistentStorageCheckedAt":"yesterday"}']])('reads %s as empty', (stored) => {
    expect(new LocalStorageDataProtectionStore(fakeStorage(stored)).load()).toEqual({});
  });

  it('keeps the valid fields of a partly valid record and survives a storage that throws or is missing', () => {
    expect(new LocalStorageDataProtectionStore(fakeStorage(JSON.stringify({ lastBackupExportedAt: at, persistentStorage: 'nope' }))).load()).toEqual({ lastBackupExportedAt: at });
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const store = new LocalStorageDataProtectionStore(throwing);
    expect(store.load()).toEqual({});
    expect(() => store.save({ lastBackupExportedAt: at })).not.toThrow();
    expect(new LocalStorageDataProtectionStore(undefined).load()).toEqual({});
  });
});
