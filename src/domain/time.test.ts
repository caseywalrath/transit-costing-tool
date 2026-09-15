import { describe, expect, it } from 'vitest';
import { formatServiceTime, parseServiceTime } from './time';

describe('service time', () => {
  it.each([
    ['00:00', 0],
    ['23:59', 23 * 3600 + 59 * 60],
    ['24:00', 24 * 3600],
    ['25:00', 25 * 3600],
    ['127:05', 127 * 3600 + 5 * 60],
  ])('parses %s without wrapping', (value, expected) => expect(parseServiceTime(value)).toBe(expected));

  it('formats extended hours and optional seconds', () => {
    expect(formatServiceTime(99000)).toBe('27:30');
    expect(formatServiceTime(99005, true)).toBe('27:30:05');
  });

  it.each(['12:60', '12:01:60', '-01:00', '1:2', 'noon', ''])('rejects malformed time %s', (value) => expect(() => parseServiceTime(value)).toThrow());
});
