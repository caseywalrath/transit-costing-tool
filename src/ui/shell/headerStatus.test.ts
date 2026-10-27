import { describe, expect, it } from 'vitest';
import { describeBackupAge, headerStatus, routeOptionLabel } from './headerStatus';

const now = Date.parse('2026-10-27T12:00:00Z');
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

describe('describeBackupAge', () => {
  it('reports missing or unreadable backups as stale', () => {
    expect(describeBackupAge(undefined, now)).toEqual({ text: 'no backup yet', stale: true });
    expect(describeBackupAge('not a date', now)).toEqual({ text: 'no backup yet', stale: true });
  });
  it('counts whole days and marks backups older than seven days', () => {
    expect(describeBackupAge(daysAgo(0), now)).toEqual({ text: 'backup from today', stale: false });
    expect(describeBackupAge(daysAgo(1), now)).toEqual({ text: 'backup 1 day old', stale: false });
    expect(describeBackupAge(daysAgo(7), now)).toEqual({ text: 'backup 7 days old', stale: false });
    expect(describeBackupAge(daysAgo(8), now)).toEqual({ text: 'backup 8 days old', stale: true });
  });
});

describe('headerStatus', () => {
  it('chooses by priority: read-only, failed, saving, saved', () => {
    expect(headerStatus({ readOnly: true, saveState: 'error', now }).text).toBe('Read-only: open in another tab');
    expect(headerStatus({ readOnly: false, saveState: 'error', now }).text).toBe('Local save failed');
    expect(headerStatus({ readOnly: false, saveState: 'saving', now }).text).toBe('Saving locally…');
    expect(headerStatus({ readOnly: false, saveState: 'idle', lastBackupExportedAt: daysAgo(3), now })).toMatchObject({ kind: 'saved', text: 'Saved locally', backup: { text: 'backup 3 days old' } });
  });
});

describe('routeOptionLabel', () => {
  const routes = [{ id: 'a', name: 'Federal Boulevard BRT', shortName: 'Federal BRT' }, { id: 'b', name: 'Colfax', shortName: '15' }, { id: 'c', name: 'Colfax Limited', shortName: '15' }, { id: 'd', name: 'Unnamed', shortName: '' }, { id: 'e', name: '', shortName: undefined }];
  it('uses the short name alone unless another route shares it', () => {
    expect(routeOptionLabel(routes[0], routes)).toBe('Federal BRT');
    expect(routeOptionLabel(routes[1], routes)).toBe('15 — Colfax');
    expect(routeOptionLabel(routes[3], routes)).toBe('Unnamed');
    expect(routeOptionLabel(routes[4], routes)).toBe('Untitled route');
  });
});
