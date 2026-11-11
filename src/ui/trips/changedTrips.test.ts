// Decision 0073: changed-trip marks. Flash for 1 to 5 marked Trips, steady for 6 or more; the flash class alternates so a repeat replays it.
import { describe, expect, it } from 'vitest';
import { markedRowClass, markStrength, markTrips, NO_MARKS } from './changedTrips';

const ids = (count: number) => Array.from({ length: count }, (_, index) => `trip-${index}`);

describe('markStrength', () => {
  it('is none for 0 marks, flash for 1 and 5, steady for 6', () => {
    expect(markStrength(markTrips(NO_MARKS, []))).toBe('none');
    expect(markStrength(markTrips(NO_MARKS, ids(1)))).toBe('flash');
    expect(markStrength(markTrips(NO_MARKS, ids(5)))).toBe('flash');
    expect(markStrength(markTrips(NO_MARKS, ids(6)))).toBe('steady');
  });
});

describe('markTrips and markedRowClass', () => {
  it('advances the tick on every mark so the flash class alternates', () => {
    const first = markTrips(NO_MARKS, ['a']);
    const second = markTrips(first, ['a']);
    const third = markTrips(second, ['a']);
    expect(first.tick).toBe(1);
    expect(markedRowClass(first, 'a')).toBe('row-moved row-moved--1');
    expect(markedRowClass(second, 'a')).toBe('row-moved row-moved--0');
    expect(markedRowClass(third, 'a')).toBe('row-moved row-moved--1');
  });

  it('gives only marked Trips a class', () => {
    const marks = markTrips(NO_MARKS, ['a']);
    expect(markedRowClass(marks, 'b')).toBeUndefined();
    expect(markedRowClass(NO_MARKS, 'a')).toBeUndefined();
  });

  it('uses plain row-moved for steady marks, with no flash suffix', () => {
    const marks = markTrips(NO_MARKS, ids(6));
    expect(markedRowClass(marks, 'trip-0')).toBe('row-moved');
    expect(markedRowClass(marks, 'trip-5')).toBe('row-moved');
  });
});
