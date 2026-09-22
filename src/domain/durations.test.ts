import { describe, expect, it } from 'vitest';
import { formatRuntimeDuration, parseRuntimeDuration } from './durations';

describe('runtime duration values', () => {
  it.each([
    ['5', 300, ':05'],
    ['07', 420, ':07'],
    ['7', 420, ':07'],
    [':07', 420, ':07'],
    ['5.5', 330, ':05:30'],
    ['5:30', 330, ':05:30'],
    [':05:30', 330, ':05:30'],
    ['12', 720, ':12'],
    ['75:15', 4515, ':75:15'],
  ])('converts %s', (entry, seconds, display) => {
    expect(parseRuntimeDuration(entry)).toBe(seconds);
    expect(formatRuntimeDuration(seconds)).toBe(display);
  });

  it('keeps blank distinct from zero', () => {
    expect(parseRuntimeDuration('')).toBeUndefined();
    expect(parseRuntimeDuration('0')).toBe(0);
    expect(formatRuntimeDuration(undefined)).toBe('');
    expect(formatRuntimeDuration(0)).toBe(':00');
  });

  it.each(['-1', 'abc', '1:60', '1:2:3', '1:', '::30', ':07:60'])('rejects invalid value %s', (entry) => {
    expect(() => parseRuntimeDuration(entry)).toThrow(/Invalid runtime duration/);
  });
});
