import { describe, expect, it } from 'vitest';
import { clock, baselineSide, direction, pattern, trip, serviceDay } from './compareFixture';
import { HEADWAY_PERIODS, headwaysByPeriod, routeDayMeasures } from './routeMeasures';

const [EARLY, AM, MIDDAY, PM, EVENING, NIGHT] = [0, 1, 2, 3, 4, 5];

describe('headwaysByPeriod (Decision 0091 item 11)', () => {
  it('has the six periods of item 11, in order, with the card\'s boundaries', () => {
    expect(HEADWAY_PERIODS.map((period) => period.key)).toEqual(['early', 'amPeak', 'midday', 'pmPeak', 'evening', 'night']);
  });

  it('gives the README AM and midday headways for the baseline outbound departures', () => {
    const departures = [clock('06:00'), clock('06:30'), clock('07:00'), clock('09:00'), clock('10:00')];
    const headways = headwaysByPeriod(departures);
    expect(headways[AM]).toBe(30);
    expect(headways[MIDDAY]).toBe(60);
    expect([headways[EARLY], headways[PM], headways[EVENING], headways[NIGHT]]).toEqual([undefined, undefined, undefined, undefined]);
  });

  it('gives the proposed AM headway of 20 for four departures from 06:00 to 07:00', () => {
    expect(headwaysByPeriod([clock('06:00'), clock('06:20'), clock('06:40'), clock('07:00')])[AM]).toBe(20);
  });

  it('is undefined with fewer than two departures in a period', () => {
    expect(headwaysByPeriod([clock('06:00')])[AM]).toBeUndefined();
    expect(headwaysByPeriod([])[AM]).toBeUndefined();
  });

  it('rounds to the nearest half minute', () => {
    // 100 seconds over two gaps is 50 seconds, or 0.83 minutes, which is 1.0 minute to the nearest half.
    expect(headwaysByPeriod([clock('06:00'), clock('06:00') + 50, clock('06:00') + 100])[AM]).toBe(1);
    // 21 minutes over one gap is exactly 21.
    expect(headwaysByPeriod([clock('06:00'), clock('06:21')])[AM]).toBe(21);
  });

  it('places a departure at a boundary in the period that starts there', () => {
    const headways = headwaysByPeriod([clock('05:50'), clock('05:55'), clock('06:00'), clock('06:30')]);
    expect(headways[EARLY]).toBe(5);
    expect(headways[AM]).toBe(30);
  });

  it('puts times past 24:00 in Night, which has no end (item 11)', () => {
    // 21:00 to 24:30 is 210 minutes over two gaps: 105 minutes.
    const headways = headwaysByPeriod([clock('21:00'), clock('22:30'), clock('24:30')]);
    expect(headways[NIGHT]).toBe(105);
    expect(headways[EVENING]).toBeUndefined();
    // 24:00 and 25:00 are both Night: one gap of 60 minutes.
    expect(headwaysByPeriod([clock('24:00'), clock('25:00')])[NIGHT]).toBe(60);
  });

  it('puts a departure after midnight but before 06:00 in Early, the period of "before 6:00"', () => {
    expect(headwaysByPeriod([clock('00:30'), clock('01:00')])[EARLY]).toBe(30);
  });
});

describe('routeDayMeasures (Decision 0091 items 9 and 10)', () => {
  const side = baselineSide();
  const weekday = serviceDay('scn-existing', 'b-wd', 'weekday', 'Weekday', 251, 1);

  it('counts the trips of the Route on the day and sums the revenue miles of its pattern', () => {
    const measures = routeDayMeasures({ routeId: 'b-r1', serviceDayId: weekday.id, trips: side.trips, patterns: side.patterns, directions: side.directions });
    expect(measures.trips).toBe(7);
    expect(measures.revenueMiles).toBe(42);
  });

  it('keeps each direction\'s sorted departures and its span (earliest first departure to latest last arrival)', () => {
    const measures = routeDayMeasures({ routeId: 'b-r1', serviceDayId: weekday.id, trips: side.trips, patterns: side.patterns, directions: side.directions });
    const [outbound, inbound] = measures.directions;
    expect(outbound).toMatchObject({ key: 'outbound', name: 'Outbound' });
    expect(outbound.departures).toEqual([clock('06:00'), clock('06:30'), clock('07:00'), clock('09:00'), clock('10:00')]);
    expect(outbound.span).toEqual({ start: clock('06:00'), end: clock('10:30') });
    expect(inbound).toMatchObject({ key: 'inbound', name: 'Inbound' });
    expect(inbound.span).toEqual({ start: clock('06:45'), end: clock('08:15') });
  });

  it('lists a Route with no trips on the day with zero trips and no directions', () => {
    const measures = routeDayMeasures({ routeId: 'b-r1', serviceDayId: 'b-sat', trips: side.trips, patterns: side.patterns, directions: side.directions });
    expect(measures).toEqual({ trips: 0, revenueMiles: 0, directions: [] });
  });

  it('keys a direction without a group by its name, and uses the name in the display', () => {
    const eastbound = { ...direction('scn-x', 'x-r', 'outbound', 1), id: 'x-east', name: 'Eastbound', group: undefined };
    const patternEast = { ...pattern('scn-x', 'x-east-pat', 'x-r', 'outbound', [['A', 0], ['B', 4]]), directionId: 'x-east' };
    const trips = [trip('scn-x', 'x-trip', patternEast, 'x-day', '07:00', 20)];
    const measures = routeDayMeasures({ routeId: 'x-r', serviceDayId: 'x-day', trips, patterns: [patternEast], directions: [eastbound] });
    expect(measures.directions).toEqual([{ key: 'name:eastbound', name: 'Eastbound', departures: [clock('07:00')], span: { start: clock('07:00'), end: clock('07:20') } }]);
  });

  it('leaves the revenue miles undefined when a Trip\'s pattern cannot be found', () => {
    const measures = routeDayMeasures({ routeId: 'b-r1', serviceDayId: weekday.id, trips: side.trips, patterns: [], directions: side.directions });
    expect(measures.revenueMiles).toBeUndefined();
    expect(measures.trips).toBe(7);
  });
});
