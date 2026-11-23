// The read-back preview of Decision 0090 (card E2): the feed is parsed with this tool's own phase I reader and translated by translateFeed,
// and the trips per service day and direction must match the export. The full read-back, with running hours and blocks, is card E5.
import { describe, expect, it } from 'vitest';
import type { GtfsTables, Row } from '../gtfs/feedTables';
import { translateFeed } from '../gtfs/translateFeed';
import { readCsvRecords } from '../../persistence/gtfs/csvStream';
import { buildGtfsExport } from './feed';
import { miniInput } from './miniScenarioFixture';
import type { GtfsExportFile } from './types';

async function recordsOf(text: string | undefined): Promise<Row[]> {
  if (text === undefined) return [];
  async function* chunk(): AsyncGenerator<string> {
    yield text as string;
  }
  const records: Row[] = [];
  for await (const record of readCsvRecords(chunk())) records.push(record);
  return records;
}

async function tablesOf(files: readonly GtfsExportFile[]): Promise<GtfsTables> {
  const text = (name: string) => files.find((file) => file.name === name)?.text;
  return {
    agency: await recordsOf(text('agency.txt')),
    routes: await recordsOf(text('routes.txt')),
    trips: await recordsOf(text('trips.txt')),
    stopTimes: await recordsOf(text('stop_times.txt')),
    stops: await recordsOf(text('stops.txt')),
    calendar: await recordsOf(text('calendar.txt')),
    calendarDates: await recordsOf(text('calendar_dates.txt')),
    frequencies: [],
    shapes: await recordsOf(text('shapes.txt')),
    feedInfo: await recordsOf(text('feed_info.txt')),
    fileNames: files.map((file) => file.name),
  };
}

describe('read-back preview (Decision 0090; the full read-back is card E5)', () => {
  it('reads the mini export with the phase I reader and translateFeed: the same trips per service day and direction', async () => {
    const result = buildGtfsExport(miniInput());
    const tables = await tablesOf(result.files);

    const translation = translateFeed({
      tables,
      routeIds: ['T1'],
      scenarioId: 'scenario-readback',
      tripProfileId: 'profile-readback',
      serviceDays: [
        { key: 'weekday', serviceDayId: 'day-wkd-readback', name: 'Weekday', date: '20270104' },
        { key: 'saturday', serviceDayId: 'day-sat-readback', name: 'Saturday', date: '20270109' },
        { key: 'holiday', serviceDayId: 'day-hol-readback', name: 'Holiday', date: '20270118' },
      ],
      blocks: { import: false },
      now: '2027-01-01T00:00:00.000Z',
    });

    expect(translation.skippedRoutes).toEqual([]);
    const [route] = translation.routes;
    const dayName = new Map([
      ['day-wkd-readback', 'WKD'],
      ['day-sat-readback', 'SAT'],
      ['day-hol-readback', 'HOL'],
    ]);
    const directionOf = (patternId: string): number | undefined => {
      const pattern = route.patterns.find((candidate) => candidate.id === patternId);
      const direction = route.directions.find((candidate) => candidate.id === pattern?.directionId);
      return direction?.group === 'outbound' ? 0 : direction?.group === 'inbound' ? 1 : undefined;
    };
    const imported = new Map<string, number>();
    for (const trip of route.trips) {
      const key = `${dayName.get(trip.serviceDayId) ?? trip.serviceDayId} ${directionOf(trip.patternId)}`;
      imported.set(key, (imported.get(key) ?? 0) + 1);
    }

    expect(Object.fromEntries([...imported].sort())).toEqual({ 'HOL 0': 1, 'SAT 0': 1, 'WKD 0': 2, 'WKD 1': 1 });
    expect(route.trips.length).toBe(5);
  });

  it('round trip (Decision 0092 item 9): a timepoint stop name that differs from its Node name is exported and stored on import', async () => {
    const input = miniInput();
    input.routeStopSets[0].timepointStopNamesByPatternId = { 'pattern-ac': { 'pp-ac-bravo': 'Union Gate B' } };
    const result = buildGtfsExport(input);
    expect(result.refusals).toEqual([]);
    const tables = await tablesOf(result.files);
    expect(tables.stops.find((row) => row.stop_id === '1002')?.stop_name).toBe('Union Gate B');

    const translation = translateFeed({
      tables,
      routeIds: ['T1'],
      scenarioId: 'scenario-readback',
      tripProfileId: 'profile-readback',
      serviceDays: [{ key: 'weekday', serviceDayId: 'day-wkd-readback', name: 'Weekday', date: '20270104' }],
      blocks: { import: false },
      now: '2027-01-01T00:00:00.000Z',
    });
    const [route] = translation.routes;
    // Every imported timepoint stores its feed stop_name (item 9): six timepoints on two patterns, one of them "Union Gate B".
    const storedNames = Object.values(route.stopSet?.timepointStopNamesByPatternId ?? {}).flatMap((names) => Object.values(names));
    expect(storedNames.sort()).toEqual(['Alpha', 'Alpha', 'Bravo', 'Charlie', 'Charlie', 'Union Gate B']);
  });
});
