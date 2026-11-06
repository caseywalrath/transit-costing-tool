// Review package U03 (I-026, finding 4-010): a stored value of the wrong shape must read as "nothing stored".
import { describe, expect, it } from 'vitest';
import { readRateHistory, readStoredRecord, rememberRate, storedText, storedTextMap } from './preferences';

const store = (value: string | null) => ({ getItem: () => value });

describe('readStoredRecord', () => {
  it('reads a stored object', () => { expect(readStoredRecord('k', store('{"projectId":"p1"}'))).toEqual({ projectId: 'p1' }); });
  it.each(['null', '[]', '[1,2]', '5', '"text"', 'true', '{broken', '', null])('reads %s as an empty record', (stored) => {
    expect(readStoredRecord('k', store(stored))).toEqual({});
  });
  it('reads a missing storage or a throwing storage as an empty record', () => {
    expect(readStoredRecord('k', undefined)).toEqual({});
    expect(readStoredRecord('k', { getItem: () => { throw new Error('blocked'); } })).toEqual({});
  });
});

describe('storedText and storedTextMap', () => {
  it('keep only non-empty strings', () => {
    expect(storedText('a')).toBe('a');
    for (const value of ['', 5, null, undefined, {}, ['a']]) expect(storedText(value)).toBeUndefined();
    expect(storedTextMap({ a: 'x', b: 5, c: '', d: null })).toEqual({ a: 'x' });
    for (const value of [null, [], 'a', 5, {}, { a: 1 }]) expect(storedTextMap(value)).toBeUndefined();
  });
});

describe('side-by-side Trips preference', () => {
  it('reads off when nothing or a wrong shape is stored', async () => {
    const { readSideBySidePreference } = await import('./preferences');
    const off = { on: false, leftDirectionId: undefined, rightDirectionId: undefined };
    expect(readSideBySidePreference(store(null))).toEqual(off);
    expect(readSideBySidePreference(store('[]'))).toEqual(off);
    expect(readSideBySidePreference(store('{"on":"yes","leftDirectionId":5}'))).toEqual(off);
    expect(readSideBySidePreference(store('{"on":true,"leftDirectionId":"d2","rightDirectionId":"d1"}'))).toEqual({ on: true, leftDirectionId: 'd2', rightDirectionId: 'd1' });
  });
  it('picks the stored left direction, or the first by sequence, and the first other direction on the right', async () => {
    const { sideBySideDirectionIds } = await import('./preferences');
    const directions = [{ id: 'b', sequence: 2 }, { id: 'a', sequence: 1 }, { id: 'c', sequence: 3 }];
    expect(sideBySideDirectionIds(directions, undefined)).toEqual(['a', 'b']);
    expect(sideBySideDirectionIds(directions, 'b')).toEqual(['b', 'a']);
    expect(sideBySideDirectionIds(directions, 'gone')).toEqual(['a', 'b']);
    expect(sideBySideDirectionIds([{ id: 'a', sequence: 1 }], 'a')).toBeUndefined();
    expect(sideBySideDirectionIds(directions, 'a', 'c')).toEqual(['a', 'c']);
    expect(sideBySideDirectionIds(directions, 'c', 'c')).toEqual(['c', 'a']);
  });
});

describe('recent operating cost rates (Decision 0061)', () => {
  const entry = (rate: number, rateYear = 2024, sourceType: 'user' | 'ntd' = 'user') => ({ rate, rateYear, sourceType });
  it('puts the newest first, moves an identical entry to the top, and keeps ten', () => {
    expect(rememberRate([entry(1), entry(2)], entry(2))).toEqual([entry(2), entry(1)]);
    expect(rememberRate([entry(1)], entry(1, 2025))).toEqual([entry(1, 2025), entry(1)]);
    const full = Array.from({ length: 10 }, (_, index) => entry(index + 1));
    const next = rememberRate(full, entry(99));
    expect(next).toHaveLength(10);
    expect(next[0]).toEqual(entry(99));
    expect(next).not.toContainEqual(entry(10));
  });
  it('reads well-formed entries and drops the rest', () => {
    const stored = JSON.stringify([entry(150.5), { rate: -1, rateYear: 2024, sourceType: 'user' }, { rate: 'x', rateYear: 2024, sourceType: 'user' }, { rate: 1, rateYear: 2024, sourceType: 'other' }, { rate: 1, rateYear: 0, sourceType: 'user' }, null, entry(150.5)]);
    expect(readRateHistory(store(stored))).toEqual([entry(150.5)]);
  });
  it.each(['{"a":1}', '5', '{broken', '', null])('reads %s as an empty list', (stored) => { expect(readRateHistory(store(stored))).toEqual([]); });
});
