import { describe, expect, it } from 'vitest';
import { COMPARE_PREFERENCE_KEY, readComparePreference, writeComparePreference } from '../preferences';

const store = (value: unknown) => ({ getItem: () => (typeof value === 'string' || value === null ? value : JSON.stringify(value)) });

describe('readComparePreference (Decision 0091 item 3)', () => {
  it('reads what is remembered for the Project, "None" included', () => {
    const preference = {
      baseline: { scenarioId: 's1', tripProfileId: 'p1', blockingScenarioId: 'b1' },
      proposed: { scenarioId: 's2', tripProfileId: 'p2', blockingScenarioId: null },
      day: 'custom:holiday 2', rates: 'own', counts: 'proposed', show: 'changed', sort: 'route',
    };
    expect(readComparePreference('project', store({ project: preference }))).toEqual(preference);
  });
  it('keeps each Project\'s choices apart', () => {
    const stored = { one: { day: 'saturday' }, two: { day: 'annual' } };
    expect(readComparePreference('one', store(stored)).day).toBe('saturday');
    expect(readComparePreference('two', store(stored)).day).toBe('annual');
    expect(readComparePreference('three', store(stored))).toEqual({});
  });
  it.each([null, 'null', '[]', '5', '{broken', '{"project":null}', '{"project":[1]}', '{"project":"x"}'])('reads %s as nothing remembered', (stored) => {
    expect(readComparePreference('project', store(stored))).toEqual({});
  });
  it('drops a wrong-shaped field and keeps the good ones', () => {
    expect(readComparePreference('project', store({ project: { baseline: 'x', proposed: { scenarioId: 5, tripProfileId: '', blockingScenarioId: 7 }, day: '', rates: 'neither', counts: 'own', show: 'everything', sort: 'hours' } })))
      .toEqual({ proposed: {}, counts: 'own', sort: 'hours' });
  });
  it('reads a missing or throwing storage as nothing remembered', () => {
    expect(readComparePreference('project', undefined)).toEqual({});
    expect(readComparePreference('project', { getItem: () => { throw new Error('blocked'); } })).toEqual({});
  });
});

describe('writeComparePreference', () => {
  it('writes under the Project and keeps the other Projects\' choices', () => {
    const data = new Map<string, string>([[COMPARE_PREFERENCE_KEY, JSON.stringify({ other: { day: 'sunday' } })]]);
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } } });
    try {
      writeComparePreference('project', { day: 'annual', rates: 'own' });
      expect(JSON.parse(data.get(COMPARE_PREFERENCE_KEY)!)).toEqual({ other: { day: 'sunday' }, project: { day: 'annual', rates: 'own' } });
    } finally {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original });
    }
  });
});
