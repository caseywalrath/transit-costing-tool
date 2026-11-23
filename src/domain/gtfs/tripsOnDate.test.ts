import { describe, expect, it } from 'vitest';
import { type FeedTrip, runningSeconds, tripsOnDate } from './tripsOnDate';
import { type Row } from './feedTables';
import { loadFeedTables, tablesWith } from './testFeeds';

const mini = loadFeedTables('mini');

function countsOn(date: string) {
  const { byRoute, invalid } = tripsOnDate(mini, date);
  return {
    B1: byRoute.get('B1')?.length ?? 0,
    R1: byRoute.get('R1')?.length ?? 0,
    F1: byRoute.get('F1')?.length ?? 0,
    invalid: invalid.length,
  };
}

function tripIdsOn(date: string, routeId: string): string[] {
  return (tripsOnDate(mini, date).byRoute.get(routeId) ?? []).map((trip) => trip.tripId);
}

// Hand-worked examples on the mini feed (answer sheet: tests/fixtures/gtfs/mini/ANALYSIS-APP-EXPECTED.md).
describe('tripsOnDate worked examples (mini feed)', () => {
  it.each([
    ['20260112', { B1: 5, R1: 2, F1: 18, invalid: 1 }],
    ['20260119', { B1: 1, R1: 0, F1: 0, invalid: 0 }],
    ['20260124', { B1: 1, R1: 2, F1: 4, invalid: 0 }],
    ['20260130', { B1: 6, R1: 3, F1: 22, invalid: 1 }],
  ])('on %s gives the trips and invalid count in the table', (date, expected) => {
    expect(countsOn(date)).toEqual(expected);
  });

  it('gives running seconds of B1 6000, R1 4440 and F1 16200 on 20260112', () => {
    const { byRoute } = tripsOnDate(mini, '20260112');
    const total = (routeId: string) => (byRoute.get(routeId) ?? []).reduce((sum, trip) => sum + runningSeconds(trip), 0);
    expect(total('B1')).toBe(6000);
    expect(total('R1')).toBe(4440);
    expect(total('F1')).toBe(16200);
  });

  it('gives F1 departures 23:00, 23:30, 24:00 and 24:30 on 20260124', () => {
    const departures = (tripsOnDate(mini, '20260124').byRoute.get('F1') ?? []).map((trip) => trip.stopTimes[0].departure);
    expect(departures).toEqual([82800, 84600, 86400, 88200]);
  });

  it('counts B1_W_OWL on Friday 20260123 and not on Saturday 20260124', () => {
    expect(tripIdsOn('20260123', 'B1')).toContain('B1_W_OWL');
    expect(tripIdsOn('20260124', 'B1')).not.toContain('B1_W_OWL');
  });

  it('names the invalid trip on 20260112 and its reason', () => {
    expect(tripsOnDate(mini, '20260112').invalid).toEqual([{ tripId: 'B1_W_BAD', routeId: 'B1', reason: 'blankFirstOrLastTime' }]);
  });
});

describe('tripsOnDate rules (mini feed)', () => {
  it('limits the result to the given routes', () => {
    const { byRoute, invalid } = tripsOnDate(mini, '20260112', new Set(['R1']));
    expect([...byRoute.keys()]).toEqual(['R1']);
    expect(invalid).toEqual([]);
  });

  it('orders each route by first departure, then trip ID', () => {
    expect(tripIdsOn('20260112', 'B1')).toEqual(['B1_W_0', 'B1_W_3', 'B1_W_1', 'B1_W_2', 'B1_W_OWL']);
  });

  it('sorts stop times by stop_sequence as a number and keeps a blank middle time', () => {
    const trip = tripsOnDate(mini, '20260112').byRoute.get('B1')?.find((t) => t.tripId === 'B1_W_2');
    expect(trip?.stopTimes).toEqual([
      { stopId: 'S1', sequence: 1, arrival: 28800, departure: 28800, timepoint: 1 },
      { stopId: 'S2', sequence: 5, arrival: undefined, departure: undefined, timepoint: 0 },
      { stopId: 'S3', sequence: 9, arrival: 30000, departure: 30000, timepoint: 1 },
    ]);
  });

  it('gives the direction from direction_id, and undefined when the column is absent', () => {
    const b1 = tripsOnDate(mini, '20260112').byRoute.get('B1') ?? [];
    expect(b1.find((t) => t.tripId === 'B1_W_0')?.directionId).toBe(0);
    expect(b1.find((t) => t.tripId === 'B1_W_1')?.directionId).toBe(1);
  });

  it('never returns a frequency template; its departures carry the template as sourceTripId', () => {
    const f1 = tripsOnDate(mini, '20260112').byRoute.get('F1') ?? [];
    expect(f1.map((t) => t.tripId)).not.toContain('F1_W_FREQ');
    const expansion = f1.find((t) => t.tripId === 'F1_W_FREQ@21600');
    expect(expansion).toMatchObject({ sourceTripId: 'F1_W_FREQ', frequency: { exact: false } });
    // The second departure moves the template's F2 time (06:15) by the 20-minute headway.
    expect(expansion?.stopTimes.map((s) => s.stopId)).toEqual(['S1', 'F2']);
    expect(f1.find((t) => t.tripId === 'F1_W_FREQ@22800')?.stopTimes[1].departure).toBe(23700);
  });

  it('gives an ordinary trip no frequency field', () => {
    const f1x = (tripsOnDate(mini, '20260112').byRoute.get('F1') ?? []).find((t) => t.tripId === 'F1_W_X');
    expect(f1x).toBeDefined();
    expect(f1x && 'frequency' in f1x).toBe(false);
  });

  it('keeps the dwell at a timepoint: arrival and departure differ (edge-loop-variants)', () => {
    const loop = tripsOnDate(loadFeedTables('edge-loop-variants'), '20260105');
    const full1 = loop.byRoute.get('L1')?.find((t) => t.tripId === 'L1_full_1');
    expect(full1?.stopTimes[2]).toEqual({ stopId: 'LC', sequence: 3, arrival: 22200, departure: 22260, timepoint: 1 });
  });
});

describe('tripsOnDate worked examples (other feeds)', () => {
  it('gives six trips of L1 on 20260105, the two from L1_freq approximate at 36000 and 37800 (edge-loop-variants)', () => {
    const { byRoute, invalid } = tripsOnDate(loadFeedTables('edge-loop-variants'), '20260105');
    const trips = byRoute.get('L1') ?? [];
    expect(trips).toHaveLength(6);
    expect(invalid).toEqual([]);
    const fromFreq = trips.filter((t) => t.sourceTripId === 'L1_freq');
    expect(fromFreq.map((t) => t.tripId)).toEqual(['L1_freq@36000', 'L1_freq@37800']);
    expect(fromFreq.map((t) => t.frequency)).toEqual([{ exact: false }, { exact: false }]);
    expect(fromFreq.map((t) => t.stopTimes[0].departure)).toEqual([36000, 37800]);
  });

  it('gives every trip an undefined direction when the feed has no direction_id (edge-no-direction)', () => {
    const { byRoute } = tripsOnDate(loadFeedTables('edge-no-direction'), '20260105');
    const trips: FeedTrip[] = byRoute.get('N1') ?? [];
    // Ordered by first departure: N1_c leaves at 06:30, before N1_b at 07:00.
    expect(trips.map((t) => t.tripId)).toEqual(['N1_a', 'N1_c', 'N1_b']);
    expect(trips.every((t) => t.directionId === undefined)).toBe(true);
    expect(trips[0].headsign).toBe('South Terminal');
  });
});

describe('tripsOnDate refusals and invalid trips (built tables)', () => {
  const calendar = [{ service_id: 'S', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '1', sunday: '1', start_date: '20260101', end_date: '20260131' }];
  const trip = (tripId: string): Row => ({ route_id: 'A', service_id: 'S', trip_id: tripId, direction_id: '', block_id: '', shape_id: '' });
  const stop = (tripId: string, sequence: string, arrival: string, departure: string, stopId = 'st'): Row => ({
    trip_id: tripId,
    stop_id: stopId,
    stop_sequence: sequence,
    arrival_time: arrival,
    departure_time: departure,
  });

  it('marks a trip with fewer than two stop rows as fewerThanTwoStops', () => {
    const tables = tablesWith({ calendar, trips: [trip('one')], stopTimes: [stop('one', '1', '06:00:00', '06:00:00')] });
    expect(tripsOnDate(tables, '20260105').invalid).toEqual([{ tripId: 'one', routeId: 'A', reason: 'fewerThanTwoStops' }]);
  });

  it('marks a trip with a repeated stop_sequence as repeatedSequence', () => {
    const tables = tablesWith({
      calendar,
      trips: [trip('dup')],
      stopTimes: [stop('dup', '1', '06:00:00', '06:00:00'), stop('dup', '1', '06:10:00', '06:10:00')],
    });
    expect(tripsOnDate(tables, '20260105').invalid).toEqual([{ tripId: 'dup', routeId: 'A', reason: 'repeatedSequence' }]);
  });

  it('marks a trip whose last stop has no time as blankFirstOrLastTime', () => {
    const tables = tablesWith({
      calendar,
      trips: [trip('end')],
      stopTimes: [stop('end', '1', '06:00:00', '06:00:00'), stop('end', '2', '', '')],
    });
    expect(tripsOnDate(tables, '20260105').invalid).toEqual([{ tripId: 'end', routeId: 'A', reason: 'blankFirstOrLastTime' }]);
  });

  it('marks only the trip with a stop_sequence that is not a whole number as badSequence', () => {
    const tables = tablesWith({
      calendar,
      trips: [trip('bad'), trip('good')],
      stopTimes: [
        stop('bad', 'first', '06:00:00', '06:00:00'),
        stop('bad', '2', '06:10:00', '06:10:00'),
        stop('good', '1', '07:00:00', '07:00:00'),
        stop('good', '2', '07:10:00', '07:10:00'),
      ],
    });
    const result = tripsOnDate(tables, '20260105');
    expect(result.invalid).toEqual([{ tripId: 'bad', routeId: 'A', reason: 'badSequence' }]);
    expect(result.byRoute.get('A')?.map((t) => t.tripId)).toEqual(['good']);
  });

  it('marks only the trip with an unparseable time as badTime, and keeps the others', () => {
    const tables = tablesWith({
      calendar,
      trips: [trip('clock'), trip('good')],
      stopTimes: [
        stop('clock', '1', '6:0:0', '06:00:00'),
        stop('clock', '2', '06:10:00', '06:10:00'),
        stop('good', '1', '07:00:00', '07:00:00'),
        stop('good', '2', '07:10:00', '07:10:00'),
      ],
    });
    const result = tripsOnDate(tables, '20260105');
    expect(result.invalid).toEqual([{ tripId: 'clock', routeId: 'A', reason: 'badTime' }]);
    expect(result.byRoute.get('A')?.map((t) => t.tripId)).toEqual(['good']);
  });

  it('lists a malformed frequency row for a template in scope, and produces no trip from it when none is usable', () => {
    const tables = tablesWith({
      calendar,
      trips: [trip('T1')],
      stopTimes: [stop('T1', '1', '06:00:00', '06:00:00'), stop('T1', '2', '06:15:00', '06:15:00')],
      frequencies: [{ trip_id: 'T1', start_time: '06:00:00', end_time: '07:00:00', headway_secs: '', exact_times: '0' }],
    });
    const result = tripsOnDate(tables, '20260105');
    expect(result.invalid).toEqual([{ tripId: 'T1', routeId: 'A', reason: 'badFrequencyRow' }]);
    // The template is not an ordinary trip either: it has a frequency row, so only its departures count.
    expect(result.byRoute.get('A')).toBeUndefined();
  });

  it('keeps the departures of a template with one usable window and reports its malformed one', () => {
    const tables = tablesWith({
      calendar,
      trips: [trip('T2')],
      stopTimes: [stop('T2', '1', '06:00:00', '06:00:00'), stop('T2', '2', '06:15:00', '06:15:00')],
      frequencies: [
        { trip_id: 'T2', start_time: '06:00:00', end_time: '06:30:00', headway_secs: '900', exact_times: '1' },
        { trip_id: 'T2', start_time: '07:00:00', end_time: '07:30:00', headway_secs: '0', exact_times: '1' },
      ],
    });
    const result = tripsOnDate(tables, '20260105');
    expect(result.byRoute.get('A')?.map((t) => t.tripId)).toEqual(['T2@21600', 'T2@22500']);
    expect(result.invalid).toEqual([{ tripId: 'T2', routeId: 'A', reason: 'badFrequencyRow' }]);
  });

  it('lists a malformed frequency row only for a template whose route is in scope', () => {
    const tables = tablesWith({
      calendar,
      trips: [trip('T3')],
      stopTimes: [stop('T3', '1', '06:00:00', '06:00:00'), stop('T3', '2', '06:15:00', '06:15:00')],
      frequencies: [{ trip_id: 'T3', start_time: '06:00:00', end_time: '07:00:00', headway_secs: '', exact_times: '0' }],
    });
    expect(tripsOnDate(tables, '20260105', new Set(['OTHER'])).invalid).toEqual([]);
  });
});
