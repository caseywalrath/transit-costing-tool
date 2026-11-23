// The Federal BRT project (output/federal-brt-import) exported as one Scenario (Decision 0090, card E2). The backup has no stop IDs and no
// stop locations, so the export refuses every timepoint as unlocated (Decision 0090 item 19). Once every timepoint has a location (a test
// placement, one per Node), the export is written and holds the Scenario's Trips and Blocks.
import { describe, expect, it } from 'vitest';
import { goldenRaw } from '../../testSupport/goldenBackup';
import { buildGtfsExport, type BuildGtfsExportInput } from './feed';
import type { RouteStopSet } from '../types';

const SETTINGS = {
  startDate: '2027-01-04',
  endDate: '2027-01-31',
  holidays: [] as Array<{ date: string; serviceDayId: string }>,
  agencyName: 'Federal Test Agency',
  agencyUrl: 'https://example.org',
  agencyTimezone: 'America/Denver',
  mapLines: 'straight' as const,
};

/**
 * The golden Scenario's export input. With `locate`, every timepoint of every pattern gets a location, placed by its Node (the same Node,
 * the same place), so no stop is unlocated.
 */
function federalInput(locate: boolean): { input: BuildGtfsExportInput; tripCount: number; pointCount: number; blockedTripCount: number } {
  const backup = goldenRaw();
  const route = backup.routes[0];
  const profile = backup.tripProfiles[0];
  const blockingScenario = backup.blockingScenarios[0];
  const nodes = backup.nodes.filter((node: { routeId: string }) => node.routeId === route.id);
  const nodeIndex = new Map<string, number>(nodes.map((node: { id: string }, index: number) => [node.id, index]));
  const patterns = backup.patterns.filter((pattern: { routeId: string }) => pattern.routeId === route.id);
  const directions = backup.directions.filter((direction: { routeId: string }) => direction.routeId === route.id);
  const trips = backup.trips.filter((trip: { routeId: string; tripProfileId?: string }) => trip.routeId === route.id && trip.tripProfileId === profile.id);
  const usedPatternIds = new Set(trips.map((trip: { patternId: string }) => trip.patternId));
  const blocks = backup.blocks.filter((block: { blockingScenarioId?: string }) => block.blockingScenarioId === blockingScenario.id);
  const blockedTripIds = new Set(blocks.flatMap((block: { activities: Array<{ type: string; tripId?: string }> }) =>
    block.activities.flatMap((activity) => (activity.type === 'revenueTrip' && activity.tripId ? [activity.tripId] : []))));

  const routeStopSet: RouteStopSet = {
    id: 'stop-set-federal',
    scenarioId: route.scenarioId,
    routeId: route.id,
    roundingSeconds: 60,
    stops: [],
    placementsByPatternId: {},
    timepointLocationsByPatternId: Object.fromEntries(patterns.map((pattern: { id: string; points: Array<{ id: string; nodeId: string }> }) => [
      pattern.id,
      Object.fromEntries(pattern.points.map((point) => [point.id, { latitude: 39.7 + (nodeIndex.get(point.nodeId) ?? 0) * 0.001, longitude: -105 }])),
    ])),
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
  };

  const input: BuildGtfsExportInput = {
    routes: [{ route, nodes, patterns, directions }],
    routeStopSets: locate ? [routeStopSet] : [],
    trips,
    tripProfileId: profile.id,
    serviceDays: backup.serviceDays,
    blocks,
    settings: { ...SETTINGS, holidays: [{ date: '2027-01-18', serviceDayId: backup.serviceDays.find((day: { kind: string }) => day.kind === 'holiday').id }] },
    exportDate: '2027-01-01',
  };
  const usedPatterns = patterns.filter((pattern: { id: string }) => usedPatternIds.has(pattern.id));
  return {
    input,
    tripCount: trips.length,
    pointCount: usedPatterns.reduce((sum: number, pattern: { points: unknown[] }) => sum + pattern.points.length, 0),
    blockedTripCount: trips.filter((trip: { id: string }) => blockedTripIds.has(trip.id)).length,
  };
}

describe('buildGtfsExport: the Federal BRT golden Scenario', () => {
  it('refuses every timepoint as unlocated and writes nothing while the stops have no locations (Decision 0090 item 19)', () => {
    const { input, pointCount } = federalInput(false);

    const result = buildGtfsExport(input);

    expect(result.files).toEqual([]);
    expect(result.report).toEqual([]);
    expect(result.refusals.length).toBe(pointCount);
    expect(new Set(result.refusals.map((issue) => issue.code))).toEqual(new Set(['gtfsExport.stopUnlocated']));
  });

  it('exports with no refusal once every timepoint has a location, and writes every Trip of the profile and its block_ids', () => {
    const { input, tripCount, blockedTripCount } = federalInput(true);

    const result = buildGtfsExport(input);

    expect(result.refusals).toEqual([]);
    expect(result.files.map((file) => file.name)).toEqual([
      'agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt', 'shapes.txt', 'feed_info.txt',
    ]);
    const tripsText = result.files.find((file) => file.name === 'trips.txt')?.text ?? '';
    const tripRows = tripsText.trimEnd().split('\n').slice(1);
    expect(tripRows.length).toBe(tripCount);
    expect(tripRows.filter((row) => row.split(',')[5] !== '').length).toBe(blockedTripCount);
    expect(result.report.filter((row) => row.kind === 'serviceDay').reduce((sum, row) => sum + (row.kind === 'serviceDay' ? row.trips : 0), 0)).toBe(tripCount);
  });
});
