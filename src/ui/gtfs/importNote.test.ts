import { describe, expect, it } from 'vitest';
import type { ScenarioImportNote } from '../../domain/types';
import { importNoteText, latestImportNoteText } from './importNote';

const note = (extra: Partial<ScenarioImportNote> = {}): ScenarioImportNote => ({
  publisher: 'RTD',
  feedVersion: 'Sep26-37381',
  fileName: 'google_transit.zip',
  datesByServiceDayId: {},
  routeCount: 3,
  // Midday UTC, so the viewer's own date is the same in every time zone from UTC-12 to UTC+11.
  importedAt: '2026-11-22T12:00:00.000Z',
  ...extra,
});

describe('importNoteText', () => {
  it('names the publisher, the feed version, the day and the number of routes', () => {
    expect(importNoteText(note())).toBe('From RTD feed Sep26-37381 · imported 22 Nov 2026 · 3 routes');
  });

  it('leaves the version out when the feed names none, and says "1 route" for one', () => {
    expect(importNoteText(note({ feedVersion: undefined, routeCount: 1 }))).toBe('From RTD feed · imported 22 Nov 2026 · 1 route');
  });
});

describe('latestImportNoteText', () => {
  it('uses the last note, and nothing when there are none', () => {
    expect(latestImportNoteText({})).toBeUndefined();
    expect(latestImportNoteText({ importNotes: [] })).toBeUndefined();
    expect(latestImportNoteText({ importNotes: [note({ routeCount: 2 }), note({ routeCount: 5 })] })).toContain('5 routes');
  });
});
