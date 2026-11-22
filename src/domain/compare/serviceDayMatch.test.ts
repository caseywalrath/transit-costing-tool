import { describe, expect, it } from 'vitest';
import { matchServiceDays } from './serviceDayMatch';
import { serviceDay } from './compareFixture';

const S = 'scn';

describe('matchServiceDays (Decision 0091 item 5)', () => {
  it('matches Weekday, Saturday, Sunday and Holiday by kind, in canonical order', () => {
    const baseline = [serviceDay(S, 'b-sat', 'saturday', 'Saturday', 52, 2), serviceDay(S, 'b-wd', 'weekday', 'Weekday', 251, 1)];
    const proposed = [serviceDay(S, 'p-wd', 'weekday', 'Weekday', 250, 1), serviceDay(S, 'p-sun', 'sunday', 'Sunday', 52, 3)];
    const pairs = matchServiceDays(baseline, proposed);
    expect(pairs.map((pair) => pair.key)).toEqual(['weekday', 'saturday', 'sunday']);
    expect(pairs[0]).toMatchObject({ key: 'weekday', name: 'Weekday', baseline: { id: 'b-wd' }, proposed: { id: 'p-wd' } });
    expect(pairs[1].proposed).toBeUndefined();
    expect(pairs[1].baseline?.id).toBe('b-sat');
    expect(pairs[2].baseline).toBeUndefined();
    expect(pairs[2].proposed?.id).toBe('p-sun');
  });

  it('uses the first day of a fixed kind in sequence order and leaves a second one out of the comparison', () => {
    const baseline = [serviceDay(S, 'b-wd-2', 'weekday', 'Weekday B', 10, 5), serviceDay(S, 'b-wd-1', 'weekday', 'Weekday', 251, 1)];
    const pairs = matchServiceDays(baseline, []);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].baseline?.id).toBe('b-wd-1');
  });

  it('matches custom days by name, ignoring case, and takes the Proposed name', () => {
    const pairs = matchServiceDays([serviceDay(S, 'b-ev', 'custom', 'Special Event', 4, 4)], [serviceDay(S, 'p-ev', 'custom', 'special EVENT', 6, 4)]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].key).toBe('custom:special event');
    expect(pairs[0].name).toBe('special EVENT');
    expect(pairs[0].baseline?.id).toBe('b-ev');
    expect(pairs[0].proposed?.id).toBe('p-ev');
  });

  it('a custom day that only one side has is shown with the other side missing', () => {
    const pairs = matchServiceDays([serviceDay(S, 'b-old', 'custom', 'Old Fair', 3, 3)], [serviceDay(S, 'p-new', 'custom', 'New Fair', 3, 4)]);
    expect(pairs.map((pair) => [pair.name, Boolean(pair.baseline), Boolean(pair.proposed)])).toEqual([
      ['Old Fair', true, false],
      ['New Fair', false, true],
    ]);
  });

  it('a custom day is never matched to a fixed kind, even with the same name', () => {
    const pairs = matchServiceDays([serviceDay(S, 'b-wd', 'weekday', 'Weekday', 251, 1)], [serviceDay(S, 'p-cu', 'custom', 'Weekday', 251, 1)]);
    expect(pairs).toHaveLength(2);
    expect(pairs.every((pair) => !(pair.baseline && pair.proposed))).toBe(true);
  });

  it('two custom days with one name on a side keep distinct keys', () => {
    const pairs = matchServiceDays([serviceDay(S, 'b-a', 'custom', 'Fair', 2, 3), serviceDay(S, 'b-b', 'custom', 'fair', 2, 4)], []);
    expect(new Set(pairs.map((pair) => pair.key)).size).toBe(2);
  });
});
