import { describe, expect, it } from 'vitest';
import { gtfsDateFromIso, planCalendar } from './calendar';

const RANGE = { start: '20270104', end: '20270131' };
const SERVICES = [
  { serviceId: 'WKD', kind: 'weekday' as const },
  { serviceId: 'SAT', kind: 'saturday' as const },
  { serviceId: 'HOL', kind: 'holiday' as const },
];

describe('planCalendar (Decision 0090 items 13 to 15)', () => {
  it('gives each kind its weekday flags: Monday to Friday, Saturday, Sunday, and none for a holiday or custom day', () => {
    const plan = planCalendar({
      range: RANGE,
      services: [
        { serviceId: 'WKD', kind: 'weekday' },
        { serviceId: 'SAT', kind: 'saturday' },
        { serviceId: 'SUN', kind: 'sunday' },
        { serviceId: 'HOL', kind: 'holiday' },
        { serviceId: 'CUS', kind: 'custom' },
      ],
      holidays: [],
    });

    expect(plan.calendar.map((row) => [row.serviceId, row.weekdays.map(Number).join('')])).toEqual([
      ['CUS', '0000000'],
      ['HOL', '0000000'],
      ['SAT', '0000010'],
      ['SUN', '0000001'],
      ['WKD', '1111100'],
    ]);
    expect(plan.calendar[0]).toMatchObject({ start: '20270104', end: '20270131' });
  });

  it('adds a holiday to its service and removes each weekday-kind service that runs that day (exceptions 1 and 2)', () => {
    const plan = planCalendar({ range: RANGE, services: SERVICES, holidays: [{ date: '20270118', serviceId: 'HOL' }] });

    expect(plan.calendarDates).toEqual([
      { serviceId: 'HOL', date: '20270118', exceptionType: 1 },
      { serviceId: 'WKD', date: '20270118', exceptionType: 2 },
    ]);
    expect(plan.runsOn('WKD', '20270118')).toBe(false);
    expect(plan.runsOn('HOL', '20270118')).toBe(true);
  });

  it('removes the Saturday and the Sunday service for a holiday on a Saturday or a Sunday, and no weekday service', () => {
    const services = [...SERVICES, { serviceId: 'SUN', kind: 'sunday' as const }];
    const saturday = planCalendar({ range: RANGE, services, holidays: [{ date: '20270109', serviceId: 'HOL' }] });
    const sunday = planCalendar({ range: RANGE, services, holidays: [{ date: '20270110', serviceId: 'HOL' }] });

    expect(saturday.calendarDates).toEqual([
      { serviceId: 'HOL', date: '20270109', exceptionType: 1 },
      { serviceId: 'SAT', date: '20270109', exceptionType: 2 },
    ]);
    expect(saturday.runsOn('SAT', '20270109')).toBe(false);
    expect(sunday.calendarDates).toEqual([
      { serviceId: 'HOL', date: '20270110', exceptionType: 1 },
      { serviceId: 'SUN', date: '20270110', exceptionType: 2 },
    ]);
  });

  it('keeps a holiday\'s own service when it is a Saturday service on a Saturday', () => {
    const plan = planCalendar({ range: RANGE, services: SERVICES, holidays: [{ date: '20270109', serviceId: 'SAT' }] });

    expect(plan.calendarDates).toEqual([{ serviceId: 'SAT', date: '20270109', exceptionType: 1 }]);
  });

  it('counts the dates of the range on which each service runs', () => {
    const plan = planCalendar({ range: RANGE, services: SERVICES, holidays: [{ date: '20270118', serviceId: 'HOL' }] });

    expect([plan.datesInRange('WKD'), plan.datesInRange('SAT'), plan.datesInRange('HOL')]).toEqual([19, 4, 1]);
  });

  it('writes no calendar_dates row for a holiday whose service is not in use, but still removes the weekday service', () => {
    const plan = planCalendar({ range: RANGE, services: [{ serviceId: 'WKD', kind: 'weekday' }], holidays: [{ date: '20270118', serviceId: 'HOL' }] });

    expect(plan.calendarDates).toEqual([{ serviceId: 'WKD', date: '20270118', exceptionType: 2 }]);
  });

  it('throws when two holidays on one date disagree on a service (a date appears once)', () => {
    expect(() => planCalendar({
      range: RANGE,
      services: SERVICES,
      holidays: [{ date: '20270118', serviceId: 'HOL' }, { date: '20270118', serviceId: 'WKD' }],
    })).toThrow(/two calendar exceptions on 20270118/);
  });
});

describe('gtfsDateFromIso', () => {
  it('turns a YYYY-MM-DD date into YYYYMMDD and refuses anything that is not a real date', () => {
    expect(gtfsDateFromIso('2027-01-04')).toBe('20270104');
    expect(gtfsDateFromIso('2027-02-30')).toBeUndefined();
    expect(gtfsDateFromIso('2027/01/04')).toBeUndefined();
    expect(gtfsDateFromIso('')).toBeUndefined();
  });
});
