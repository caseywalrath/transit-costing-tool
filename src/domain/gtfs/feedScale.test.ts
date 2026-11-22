import { describe, expect, it } from 'vitest';
import type { GtfsTables, Row } from './feedTables';
import { scenarioFromFeed } from './scenarioFromFeed';

// Whole-feed scale (Decision 0089 item 44). The feed is generated, not read from a fixture, so the repository holds no large file: 150
// Routes, each with 60 trips in two directions over 30 stops, on one weekday service. The limit is far above what the translation takes
// on a developer machine. It exists to catch a return of work that repeats for every date and trip, such as scanning every stop time
// once per date, which costs many times the translation's own time at this size.

const ROUTES = 150;
const TRIPS_PER_ROUTE = 60;
const STOPS_PER_TRIP = 30;
const TIME_LIMIT_MS = 20_000;
const NOW = '2026-11-22T09:00:00.000Z';

function clock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':');
}

function syntheticTables(): GtfsTables {
  const routes: Row[] = [];
  const stops: Row[] = [];
  const trips: Row[] = [];
  const stopTimes: Row[] = [];
  for (let route = 0; route < ROUTES; route++) {
    const routeId = `R${route}`;
    routes.push({ route_id: routeId, agency_id: 'A', route_short_name: String(route), route_long_name: `Synthetic route ${route}`, route_type: '3' });
    for (let stop = 0; stop < STOPS_PER_TRIP; stop++) {
      stops.push({
        stop_id: `${routeId}-S${stop}`,
        stop_name: `Stop ${stop} of route ${route}`,
        stop_lat: String(39.6 + route * 0.002 + stop * 0.0008),
        stop_lon: String(-105.1 + stop * 0.0009 + route * 0.0002),
        location_type: '',
      });
    }
    for (let trip = 0; trip < TRIPS_PER_ROUTE; trip++) {
      const tripId = `${routeId}-T${trip}`;
      const direction = trip % 2;
      trips.push({ route_id: routeId, service_id: 'WK', trip_id: tripId, direction_id: String(direction), trip_headsign: `Route ${route}` });
      const start = 5 * 3600 + trip * 15 * 60;
      for (let index = 0; index < STOPS_PER_TRIP; index++) {
        // Outbound trips serve the stops in order, inbound trips the same stops in reverse.
        const stopNumber = direction === 0 ? index : STOPS_PER_TRIP - 1 - index;
        const time = clock(start + index * 90);
        stopTimes.push({
          trip_id: tripId,
          arrival_time: time,
          departure_time: time,
          stop_id: `${routeId}-S${stopNumber}`,
          stop_sequence: String(index + 1),
          // Every fifth stop and the last stop are timepoints; the rest become Route stops.
          timepoint: index % 5 === 0 || index === STOPS_PER_TRIP - 1 ? '1' : '0',
        });
      }
    }
  }
  return {
    agency: [{ agency_id: 'A', agency_name: 'Synthetic Transit Agency' }],
    routes,
    trips,
    stopTimes,
    stops,
    calendar: [
      { service_id: 'WK', monday: '1', tuesday: '1', wednesday: '1', thursday: '1', friday: '1', saturday: '0', sunday: '0', start_date: '20260105', end_date: '20260306' },
    ],
    calendarDates: [],
    frequencies: [],
    shapes: [],
    feedInfo: [],
    fileNames: ['agency.txt', 'calendar.txt', 'routes.txt', 'stop_times.txt', 'stops.txt', 'trips.txt'],
  };
}

describe('whole-feed scale', () => {
  it('translates 150 Routes of 60 trips over 30 stops within the limit, and imports every trip', () => {
    const tables = syntheticTables();
    const started = performance.now();
    const { records, translation } = scenarioFromFeed('synthetic-project', 'Existing service', {
      tables,
      routeIds: tables.routes.map((row) => row.route_id),
      fileName: 'synthetic-feed.zip',
      now: NOW,
    });
    const elapsed = performance.now() - started;

    expect(translation.skippedRoutes).toEqual([]);
    expect(translation.report.fidelityOk).toBe(true);
    expect(records.trips).toHaveLength(ROUTES * TRIPS_PER_ROUTE);
    expect(elapsed).toBeLessThan(TIME_LIMIT_MS);
  }, 120_000);
});
