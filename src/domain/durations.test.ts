import { describe, expect, it } from 'vitest';
import { formatRuntimeDuration, parseRuntimeDuration } from './durations';

// P16 (I-062, finding 2-008): a decimal-minute entry is converted to whole seconds exactly, rounding a half second away from zero. The old
// conversion (`Math.round(minutes * 60)`) went through binary floating point: 1.025 minutes is 61.5 seconds, but 1.025 * 60 is 61.49999999999999.
describe('decimal-minute entries round half away from zero exactly', () => {
  it.each([['0.025', 2], ['1.025', 62], ['4.225', 254], ['0.5', 30], ['0.0083', 0], ['0.00834', 1], ['2.5', 150], ['0.000', 0]])('parses %s minutes to %d seconds', (text, seconds) => expect(parseRuntimeDuration(text)).toBe(seconds));
  it('rounds every exact half second up, for 2,000 entries of the form (2j + 1) / 40 minutes', () => {
    const wrong: string[] = [];
    for (let j = 0; j < 2000; j += 1) {
      const thousandths = 25 * (2 * j + 1); // (2j + 1) / 40 minutes written as a decimal with three places
      const text = `${Math.floor(thousandths / 1000)}.${String(thousandths % 1000).padStart(3, '0')}`;
      const expected = Math.ceil((2 * j + 1) * 1.5); // (2j + 1) * 1.5 seconds, always a half second
      if (parseRuntimeDuration(text) !== expected) wrong.push(`${text}: ${parseRuntimeDuration(text)} not ${expected}`);
    }
    expect(wrong).toEqual([]);
  });
  it('still rejects a decimal that is not a number of minutes', () => {
    for (const text of ['1.', '.5', '1..5', '1.2.3', '-1.5', '1e3', 'abc']) expect(() => parseRuntimeDuration(text)).toThrow();
  });
});

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
