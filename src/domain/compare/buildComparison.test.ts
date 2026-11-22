import { describe, expect, it } from 'vitest';
import { buildComparison } from './buildComparison';
import { baselineSide, clock, prepareComparison, proposedSide, route, serviceDay, workedExample, type ExampleSide } from './compareFixture';
import type { Comparison, ComparisonRow } from './types';

// Every figure of tests/fixtures/scenario-compare/README.md "Worked answers" is checked here. Trips, miles, hours and cost are given in
// the README's units (miles to one decimal, hours to two, cost in dollars); the tests compare with the rounding the README uses.

const UNATTRIBUTED = 'Unattributed';
const example = workedExample();
const prepared = prepareComparison(example.baseline, example.proposed, 'baseline');
const compare = (day: string): Comparison => buildComparison({ ...prepared, day });

function rowOf(comparison: Comparison, code: string): ComparisonRow {
  const found = code === UNATTRIBUTED ? comparison.rows.find((row) => row.unattributed) : comparison.rows.find((row) => row.routeCode === code);
  if (!found) throw new Error(`no row for ${code}`);
  return found;
}

const names = (comparison: Comparison) => comparison.rows.map((row) => row.name);

describe('worked example: matching (README "Matching")', () => {
  const weekday = compare('weekday');

  it('matches R1 by its GTFS route ID and shows the Proposed name "1 Main St"', () => {
    const row = rowOf(weekday, '1');
    expect(row.name).toBe('1 Main St');
    expect(row.status).toBe('changed');
  });

  it('matches R5 by its short name', () => {
    expect(rowOf(weekday, '5').status).toBe('unchanged');
  });

  it('shows R2 as Discontinued and R3 as New', () => {
    expect(rowOf(weekday, '2').status).toBe('discontinued');
    expect(rowOf(weekday, '3').status).toBe('new');
  });

  it('raises no warnings for this example', () => {
    expect(weekday.warnings).toEqual([]);
  });
});

describe('worked example: weekday, by route (README "Weekday, by route")', () => {
  const weekday = compare('weekday');

  it('orders 1 and 2 (tie on 0.40, route order), then 3, then 5, then Unattributed (Decision 0091 item 17)', () => {
    expect(names(weekday)).toEqual(['1 Main St', '2 Crosstown', '3 Airport', '5 Loop', 'Unattributed (multi-route blocks)']);
  });

  it('1 Main St: trips 7 to 8, miles 42.0 to 57.0, hours 3.50 to 3.10, peak 2 to 2, cost 87,850 to 77,810', () => {
    const row = rowOf(weekday, '1');
    expect(row.trips).toMatchObject({ baseline: 7, proposed: 8, change: 1 });
    expect(row.revenueMiles.baseline).toBeCloseTo(42, 6);
    expect(row.revenueMiles.proposed).toBeCloseTo(57, 6);
    expect(row.revenueMiles.change).toBeCloseTo(15, 6);
    expect(row.revenueHours.baseline).toBeCloseTo(3.5, 6);
    expect(row.revenueHours.proposed).toBeCloseTo(3.1, 6);
    expect(row.revenueHours.change).toBeCloseTo(-0.4, 6);
    expect(row.revenueHours.percent).toBe(-11.4);
    expect(row.peakVehicles).toMatchObject({ baseline: 2, proposed: 2, change: 0 });
    expect(row.cost.baseline).toBeCloseTo(87850, 4);
    expect(row.cost.proposed).toBeCloseTo(77810, 4);
    expect(row.cost.change).toBeCloseTo(-10040, 4);
  });

  it('2 Crosstown is Discontinued: its proposed figures are "—", and its hour change is -0.40 with no percentage', () => {
    const row = rowOf(weekday, '2');
    expect(row.status).toBe('discontinued');
    expect(row.trips).toMatchObject({ baseline: 1, proposed: undefined, change: -1 });
    expect(row.revenueMiles.baseline).toBeCloseTo(4, 6);
    expect(row.revenueMiles.proposed).toBeUndefined();
    expect(row.revenueHours.baseline).toBeCloseTo(0.4, 6);
    expect(row.revenueHours.proposed).toBeUndefined();
    expect(row.revenueHours.change).toBeCloseTo(-0.4, 6);
    expect(row.revenueHours.percent).toBeUndefined();
    expect(row.peakVehicles).toMatchObject({ baseline: 1, proposed: undefined });
    expect(row.cost.baseline).toBeCloseTo(10040, 4);
    expect(row.cost.proposed).toBeUndefined();
  });

  it('3 Airport is New: trips "—" to 1, hours "—" to 0.00, peak "—" to 0, cost "—" to 0', () => {
    const row = rowOf(weekday, '3');
    expect(row.status).toBe('new');
    expect(row.trips).toMatchObject({ baseline: undefined, proposed: 1 });
    expect(row.revenueMiles.proposed).toBeCloseTo(12, 6);
    expect(row.revenueHours).toMatchObject({ baseline: undefined, proposed: 0 });
    expect(row.revenueHours.change).toBe(0);
    expect(row.peakVehicles).toMatchObject({ baseline: undefined, proposed: 0 });
    expect(row.cost).toMatchObject({ baseline: undefined, proposed: 0 });
  });

  it('5 Loop is Unchanged and folds: 1 to 1 trip, 3.0 to 3.0 miles, 0.25 to 0.25 hours, cost 6,275 to 6,275', () => {
    const row = rowOf(weekday, '5');
    expect(row.status).toBe('unchanged');
    expect(row.foldable).toBe(true);
    expect(row.trips).toMatchObject({ baseline: 1, proposed: 1, change: 0 });
    expect(row.revenueMiles).toMatchObject({ baseline: 3, proposed: 3, change: 0 });
    expect(row.revenueHours).toMatchObject({ baseline: 0.25, proposed: 0.25, change: 0, percent: 0 });
    expect(row.peakVehicles).toMatchObject({ baseline: 0, proposed: 0 });
    expect(row.cost.baseline).toBeCloseTo(6275, 4);
    expect(row.cost.proposed).toBeCloseTo(6275, 4);
  });

  it('Unattributed is Changed: trips 0 to 0, miles "—", hours 0.00 to 1.50, peak 0 to 1, cost 0 to 37,650, and is never folded', () => {
    const row = rowOf(weekday, UNATTRIBUTED);
    expect(row.status).toBe('changed');
    expect(row.foldable).toBe(false);
    expect(row.trips).toMatchObject({ baseline: 0, proposed: 0 });
    expect(row.revenueMiles).toMatchObject({ baseline: undefined, proposed: undefined });
    expect(row.revenueHours.baseline).toBeCloseTo(0, 6);
    expect(row.revenueHours.proposed).toBeCloseTo(1.5, 6);
    expect(row.revenueHours.change).toBeCloseTo(1.5, 6);
    expect(row.revenueHours.percent).toBeUndefined();
    expect(row.peakVehicles).toMatchObject({ baseline: 0, proposed: 1, change: 1 });
    expect(row.cost.baseline).toBeCloseTo(0, 4);
    expect(row.cost.proposed).toBeCloseTo(37650, 4);
  });
});

describe('worked example: weekday totals (README "Weekday totals")', () => {
  const { totals } = compare('weekday');

  it('trips 9 to 10 (+1, +11.1%)', () => {
    expect(totals.trips).toMatchObject({ baseline: 9, proposed: 10, change: 1, percent: 11.1 });
  });

  it('miles 49.0 to 72.0 (+23.0, +46.9%)', () => {
    expect(totals.revenueMiles.baseline).toBeCloseTo(49, 6);
    expect(totals.revenueMiles.proposed).toBeCloseTo(72, 6);
    expect(totals.revenueMiles.change).toBeCloseTo(23, 6);
    expect(totals.revenueMiles.percent).toBe(46.9);
  });

  it('revenue hours 4.15 to 4.85 (+0.70, +16.9%)', () => {
    expect(totals.revenueHours.baseline).toBeCloseTo(4.15, 6);
    expect(totals.revenueHours.proposed).toBeCloseTo(4.85, 6);
    expect(totals.revenueHours.change).toBeCloseTo(0.7, 6);
    expect(totals.revenueHours.percent).toBe(16.9);
  });

  it('peak 2 to 3 (+1): the system counts all Blocks, so it is not the sum of the Routes', () => {
    expect(totals.peakVehicles).toMatchObject({ baseline: 2, proposed: 3, change: 1 });
  });

  it('cost $104,165 to $121,735 (+$17,570, +16.9%)', () => {
    expect(totals.cost.baseline).toBeCloseTo(104165, 4);
    expect(totals.cost.proposed).toBeCloseTo(121735, 4);
    expect(totals.cost.change).toBeCloseTo(17570, 4);
    expect(totals.cost.percent).toBe(16.9);
  });
});

describe('worked example: span and headways, 1 Main St, Weekday (README "Span and headways")', () => {
  const row = rowOf(compare('weekday'), '1');
  const outbound = row.directions?.find((direction) => direction.key === 'outbound');
  const inbound = row.directions?.find((direction) => direction.key === 'inbound');
  const headway = (direction: typeof outbound, period: string) => direction?.headways.find((item) => item.period === period);

  it('outbound span 06:00-10:30 to 06:00-10:36 (changed)', () => {
    expect(outbound?.span.baseline).toEqual({ start: clock('06:00'), end: clock('10:30') });
    expect(outbound?.span.proposed).toEqual({ start: clock('06:00'), end: clock('10:36') });
    expect(outbound?.changed).toBe(true);
  });

  it('outbound AM peak 30 to 20 (deps 06:00 to 07:00: 60 / 2 and 60 / 3)', () => {
    expect(headway(outbound, 'amPeak')).toMatchObject({ baseline: 30, proposed: 20 });
  });

  it('outbound midday 60 to 60, and every other period "—"', () => {
    expect(headway(outbound, 'midday')).toMatchObject({ baseline: 60, proposed: 60 });
    for (const period of ['early', 'pmPeak', 'evening', 'night']) {
      expect(headway(outbound, period)).toMatchObject({ baseline: undefined, proposed: undefined });
    }
  });

  it('inbound span 06:45-08:15 on both sides, inbound AM peak 60 to 60, unchanged', () => {
    expect(inbound?.span.baseline).toEqual({ start: clock('06:45'), end: clock('08:15') });
    expect(inbound?.span.proposed).toEqual({ start: clock('06:45'), end: clock('08:15') });
    expect(headway(inbound, 'amPeak')).toMatchObject({ baseline: 60, proposed: 60 });
    expect(inbound?.changed).toBe(false);
  });

  it('the Route is Changed (its outbound span and trips differ)', () => {
    expect(row.status).toBe('changed');
  });
});

describe('worked example: Saturday (README "Saturday")', () => {
  const saturday = compare('saturday');

  it('1 Main St Changed: 0 to 1 trip, 0 to 7.5 miles', () => {
    const row = rowOf(saturday, '1');
    expect(row.status).toBe('changed');
    expect(row.trips).toMatchObject({ baseline: 0, proposed: 1 });
    expect(row.revenueMiles).toMatchObject({ baseline: 0, proposed: 7.5 });
  });

  it('2 Crosstown Discontinued (1 to "—"), 3 Airport New (— to 0 trips), 5 Loop Unchanged (0 to 0)', () => {
    expect(rowOf(saturday, '2')).toMatchObject({ status: 'discontinued' });
    expect(rowOf(saturday, '2').trips).toMatchObject({ baseline: 1, proposed: undefined });
    expect(rowOf(saturday, '3')).toMatchObject({ status: 'new' });
    expect(rowOf(saturday, '3').trips).toMatchObject({ baseline: undefined, proposed: 0 });
    expect(rowOf(saturday, '5')).toMatchObject({ status: 'unchanged' });
    expect(rowOf(saturday, '5').trips).toMatchObject({ baseline: 0, proposed: 0 });
  });

  it('has no Unattributed row (no Saturday Unattributed on either side), and peak 0 to 0', () => {
    expect(saturday.rows.some((row) => row.unattributed)).toBe(false);
    expect(saturday.totals.peakVehicles).toMatchObject({ baseline: 0, proposed: 0 });
  });

  it('orders the rows by the revenue-hours change (item 17): 1 (0.60), 2 (0.40), 3, 5', () => {
    expect(names(saturday)).toEqual(['1 Main St', '2 Crosstown', '3 Airport', '5 Loop']);
  });
});

describe('worked example: Annual (README "Annual")', () => {
  const annual = compare('annual');

  it('trips 2,311 to 2,562 (+251, +10.9%)', () => {
    expect(annual.totals.trips).toMatchObject({ baseline: 2311, proposed: 2562, change: 251, percent: 10.9 });
  });

  it('miles 12,507.0 to 18,462.0 (+5,955.0, +47.6%)', () => {
    expect(annual.totals.revenueMiles.baseline).toBeCloseTo(12507, 4);
    expect(annual.totals.revenueMiles.proposed).toBeCloseTo(18462, 4);
    expect(annual.totals.revenueMiles.change).toBeCloseTo(5955, 4);
    expect(annual.totals.revenueMiles.percent).toBe(47.6);
  });

  it('revenue hours 1,062.45 to 1,248.55 (+186.10, +17.5%)', () => {
    expect(annual.totals.revenueHours.baseline).toBeCloseTo(1062.45, 6);
    expect(annual.totals.revenueHours.proposed).toBeCloseTo(1248.55, 6);
    expect(annual.totals.revenueHours.change).toBeCloseTo(186.1, 6);
    expect(annual.totals.revenueHours.percent).toBe(17.5);
  });

  it('cost $106,245 to $124,855 (+$18,610, +17.5%)', () => {
    expect(annual.totals.cost.baseline).toBeCloseTo(106245, 4);
    expect(annual.totals.cost.proposed).toBeCloseTo(124855, 4);
    expect(annual.totals.cost.change).toBeCloseTo(18610, 4);
    expect(annual.totals.cost.percent).toBe(17.5);
  });

  it('peak 2 to 3, on Weekday', () => {
    expect(annual.totals.peakVehicles).toMatchObject({ baseline: 2, proposed: 3, change: 1 });
    expect(annual.totals.peakVehicles.dayName).toEqual({ baseline: 'Weekday', proposed: 'Weekday' });
  });

  it('has the route statuses of the day views (a Route is Changed when any day is)', () => {
    expect(rowOf(annual, '1').status).toBe('changed');
    expect(rowOf(annual, '2').status).toBe('discontinued');
    expect(rowOf(annual, '3').status).toBe('new');
    expect(rowOf(annual, '5').status).toBe('unchanged');
    expect(rowOf(annual, UNATTRIBUTED).status).toBe('changed');
  });

  it('shows no span or headways in the Annual view', () => {
    expect(annual.rows.every((row) => row.directions === undefined)).toBe(true);
  });

  it('orders by the annual revenue-hours change: 2 (121.2), 1 (69.2), 3, 5, Unattributed last', () => {
    expect(names(annual)).toEqual(['2 Crosstown', '1 Main St', '3 Airport', '5 Loop', 'Unattributed (multi-route blocks)']);
  });

  it('the Annual peak is the highest day\'s system peak, not the sum of the days', () => {
    expect(annual.totals.peakVehicles.proposed).toBe(3);
  });
});

describe('the sides can be swapped (sign of every change flips)', () => {
  const forward = compare('weekday');
  const swapped = buildComparison({ ...prepareComparison(example.proposed, example.baseline, 'own'), day: 'weekday' });

  it('flips the change of every measure on every row, including Unattributed', () => {
    for (const row of forward.rows) {
      const twin = row.unattributed ? swapped.rows.find((item) => item.unattributed) : swapped.rows.find((item) => item.routeCode === row.routeCode);
      expect(twin, row.name).toBeDefined();
      for (const measure of ['trips', 'revenueMiles', 'revenueHours', 'peakVehicles', 'cost'] as const) {
        const change = row[measure].change;
        const flipped = twin?.[measure].change;
        if (change === undefined) expect(flipped, `${row.name} ${measure}`).toBeUndefined();
        else expect(flipped, `${row.name} ${measure}`).toBeCloseTo(-change, 6);
      }
    }
  });

  it('flips the change of every total', () => {
    const left = forward.totals;
    const right = swapped.totals;
    expect(right.trips.change).toBe(-(left.trips.change ?? NaN));
    expect(right.revenueHours.change).toBeCloseTo(-(left.revenueHours.change ?? NaN), 6);
    expect(right.cost.change).toBeCloseTo(-(left.cost.change ?? NaN), 4);
    expect(right.peakVehicles.change).toBe(-(left.peakVehicles.change ?? NaN));
  });

  it('turns a Discontinued Route into a New one', () => {
    expect(swapped.rows.find((row) => row.routeCode === '2')?.status).toBe('new');
  });
});

describe('a custom day, a day only one side has, and a Route with its own counts', () => {
  it('a custom day matched by name ignoring case compares the two sides of that day', () => {
    const base: ExampleSide = { ...baselineSide(), serviceDays: [...baselineSide().serviceDays, serviceDay('scn-existing', 'b-event', 'custom', 'Special Event', 10, 3)] };
    const proposedWithEvent: ExampleSide = { ...proposedSide(), serviceDays: [...proposedSide().serviceDays, serviceDay('scn-redesign', 'p-event', 'custom', 'special event', 12, 3)] };
    const withEvent = prepareComparison(base, proposedWithEvent, 'baseline');
    expect(withEvent.dayPairs.map((pair) => pair.key)).toContain('custom:special event');
    const event = buildComparison({ ...withEvent, day: 'custom:special event' });
    expect(rowOf(event, '1').status).toBe('unchanged');
  });

  it('a day only the Proposed has shows "—" on the Baseline', () => {
    const proposedWithHoliday: ExampleSide = { ...proposedSide(), serviceDays: [...proposedSide().serviceDays, serviceDay('scn-redesign', 'p-hol', 'custom', 'Holiday Monday', 5, 3)] };
    const withHoliday = prepareComparison(baselineSide(), proposedWithHoliday, 'baseline');
    const holiday = buildComparison({ ...withHoliday, day: 'custom:holiday monday' });
    // The Baseline has no such day, so every Route shows "—" there; the Routes the Proposed has show its zero trips for the day.
    expect(holiday.rows.every((row) => row.trips.baseline === undefined)).toBe(true);
    expect(holiday.rows.filter((row) => row.status !== 'discontinued').every((row) => row.trips.proposed === 0)).toBe(true);
  });

  it('the Baseline count replaces the Proposed count on a matched day, and the Route own count moves with its switch', () => {
    const baseline = baselineSide();
    const r1 = baseline.routes[0];
    const ownBaseline: ExampleSide = { ...baseline, routes: [{ ...r1, ownAnnualServiceDays: { enabled: true, countsByServiceDayId: { 'b-wd': 240 } } }, ...baseline.routes.slice(1)] };
    const withCounts = prepareComparison(ownBaseline, proposedSide(), 'baseline');
    const weekdayWithCounts = buildComparison({ ...withCounts, day: 'weekday' });
    // The weekday count of Proposed R1 is now 240 (the Baseline's own count), so its hours and cost use 240.
    const row = rowOf(weekdayWithCounts, '1');
    expect(row.cost.proposed).toBeCloseTo(3.1 * 240 * 100, 4);
    expect(row.cost.baseline).toBeCloseTo(3.5 * 240 * 100, 4);
  });
});

describe('warnings (Decision 0091 item 4)', () => {
  it('an ambiguous short name gives no match and one compare.ambiguousRoute warning', () => {
    const baseline: ExampleSide = { ...baselineSide(), routes: [route('scn-existing', 'b-s', 'Alpha', 'S')] };
    const proposed: ExampleSide = { ...proposedSide(), routes: [route('scn-redesign', 'p-1', 'Beta', 'S'), route('scn-redesign', 'p-2', 'Gamma', 'S')] };
    const ambiguous = buildComparison({ ...prepareComparison(baseline, proposed, 'baseline'), day: 'weekday' });
    // No Route matched: the one Baseline Route is Discontinued and the two Proposed Routes are New.
    expect(ambiguous.rows.filter((row) => !row.unattributed).map((row) => row.status)).toEqual(['discontinued', 'new', 'new']);
    expect(ambiguous.warnings).toEqual([{ code: 'compare.ambiguousRoute', side: 'proposed', key: 'S', routeIds: ['p-1', 'p-2'] }]);
  });

  it('raises no warning when no key repeats', () => {
    expect(compare('weekday').warnings).toEqual([]);
  });
});

describe('the inputs are not changed by a comparison', () => {
  it('builds the same comparison twice from the same inputs', () => {
    const first = compare('weekday');
    const second = compare('weekday');
    expect(second).toEqual(first);
  });
});
