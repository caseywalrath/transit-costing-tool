// Review package U03 (I-026, finding 4-010): a stored value of the wrong shape must read as "nothing stored".
import { describe, expect, it } from 'vitest';
import { readStoredRecord, storedText, storedTextMap } from './preferences';

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
    expect(readSideBySidePreference(store(null))).toEqual({ on: false, leftDirectionId: undefined });
    expect(readSideBySidePreference(store('[]'))).toEqual({ on: false, leftDirectionId: undefined });
    expect(readSideBySidePreference(store('{"on":"yes","leftDirectionId":5}'))).toEqual({ on: false, leftDirectionId: undefined });
    expect(readSideBySidePreference(store('{"on":true,"leftDirectionId":"d2"}'))).toEqual({ on: true, leftDirectionId: 'd2' });
  });
  it('picks the stored left direction, or the first by sequence, and the first other direction on the right', async () => {
    const { sideBySideDirectionIds } = await import('./preferences');
    const directions = [{ id: 'b', sequence: 2 }, { id: 'a', sequence: 1 }, { id: 'c', sequence: 3 }];
    expect(sideBySideDirectionIds(directions, undefined)).toEqual(['a', 'b']);
    expect(sideBySideDirectionIds(directions, 'b')).toEqual(['b', 'a']);
    expect(sideBySideDirectionIds(directions, 'gone')).toEqual(['a', 'b']);
    expect(sideBySideDirectionIds([{ id: 'a', sequence: 1 }], 'a')).toBeUndefined();
  });
});
