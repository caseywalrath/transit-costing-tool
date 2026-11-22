import { describe, expect, it } from 'vitest';
import type { ServiceDayDefinition } from '../../domain/types';
import { NO_OWN_COUNTS, ownCountsOf, ownCountsTotal, withOwnCount } from './ownCounts';

const day = (id: string, annualServiceDays: number): ServiceDayDefinition => ({ id, scenarioId: 's', kind: 'custom', name: id, annualServiceDays, sequence: 1, createdAt: 't', updatedAt: 't' });

describe('own annual counts of a Route', () => {
  it('reads a Route with no counts as switched off and empty', () => {
    expect(ownCountsOf({})).toBe(NO_OWN_COUNTS);
    expect(ownCountsOf({ ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { a: 3 } } }).countsByServiceDayId).toEqual({ a: 3 });
  });

  it('sets a count, keeps the others and the switch, and clears a day without touching the rest', () => {
    const on = { enabled: true, countsByServiceDayId: { a: 62 } };
    expect(withOwnCount(on, 'b', 0)).toEqual({ enabled: true, countsByServiceDayId: { a: 62, b: 0 } });
    expect(withOwnCount(on, 'a', undefined)).toEqual({ enabled: true, countsByServiceDayId: {} });
    expect(on.countsByServiceDayId).toEqual({ a: 62 });
  });

  it('totals the Route column with the Scenario count standing in for a blank day, and ignores a day that is gone', () => {
    const days = [day('a', 255), day('b', 52), day('c', 58)];
    expect(ownCountsTotal(days, NO_OWN_COUNTS)).toBe(365);
    expect(ownCountsTotal(days, { enabled: true, countsByServiceDayId: { a: 62, gone: 300 } })).toBe(62 + 52 + 58);
    expect(ownCountsTotal(days, { enabled: false, countsByServiceDayId: { a: 0 } })).toBe(110);
  });
});
