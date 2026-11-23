// The round trip of Decision 0090 and plan E-D2 (card E5): a Scenario is exported with buildFeed, zipped, read back with the phase I reader
// (readFeedTables), and imported as a new Project (projectFromFeed, every Route, blocks on with 10 and 10 minutes). The imported Trips are
// compared with the exported Scenario's Trips, per Route, service day and direction: the trip count, the sorted timepoint times, the running
// seconds (last time minus first, summed over the Trips), and the blocks (their count, and the Trips in each). Patterns may differ in name,
// so Trips are compared by their timepoint sequence and times, never by pattern ID.
import { describe, expect, it } from 'vitest';
import { createCsvArchive } from '../csvDownload';
import { readFeedTables } from '../gtfs/gtfsImportService';
import { miniInput, MINI_SETTINGS } from '../../domain/gtfsExport/miniScenarioFixture';
import { projectFromFeed } from '../../domain/gtfs/scenarioFromFeed';
import { snapshotForScenario, type ScenarioRecords } from '../../domain/project';
import { serviceDayAbbreviation } from '../../domain/serviceDays';
import type { Route, RouteStopSet } from '../../domain/types';
import { asSnapshot, goldenRaw } from '../../testSupport/goldenBackup';
import { buildFeed, type GtfsExportRequest } from './gtfsExportBuild';

const META = { createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' } as const;
const IMPORT_NOW = '2027-01-01T00:00:00.000Z';

/** One exported or imported Trip, reduced to what the round trip keeps: its Route, service day, direction and times in pattern order. */
interface TripFact {
  id: string;
  route: string;
  service: string;
  direction: number;
  times: number[];
}

/** One block: its label, its service day and the Trips it holds, each as a canonical key. */
interface BlockFact {
  label: string;
  service: string;
  trips: string[];
}

/** The export's route_id: gtfsRouteId, else the short name, else the name (Decision 0090 item 9; duplicates are not used here). */
const exportRouteId = (route: Route): string => route.gtfsRouteId ?? route.shortName ?? route.name;

const tripKey = (fact: TripFact): string => `${fact.route} | ${fact.service} | ${fact.direction} | ${fact.times.join(',')}`;

/**
 * The Trips and blocks of a Scenario's records. A Trip profile or a Blocking scenario limits them to that one; without them every Trip and
 * every block is read (the imported Project holds one of each).
 */
function factsOf(
  records: ScenarioRecords,
  routeKeyOf: (route: Route) => string,
  options: { tripProfileId?: string; blockingScenarioId?: string } = {},
): { trips: TripFact[]; blocks: BlockFact[] } {
  const routeKey = new Map(records.routes.map((route) => [route.id, routeKeyOf(route)]));
  const serviceOf = new Map(records.serviceDays.map((day) => [day.id, serviceDayAbbreviation(day)]));
  const patternOf = new Map(records.patterns.map((pattern) => [pattern.id, pattern]));
  const groupOf = new Map((records.directions ?? []).map((direction) => [direction.id, direction.group]));
  const trips: TripFact[] = [];
  const factById = new Map<string, TripFact>();
  for (const trip of records.trips) {
    if (options.tripProfileId !== undefined && trip.tripProfileId !== options.tripProfileId) continue;
    const pattern = patternOf.get(trip.patternId);
    const group = pattern?.directionId ? groupOf.get(pattern.directionId) : undefined;
    const direction = group === 'outbound' ? 0 : group === 'inbound' ? 1 : undefined;
    const route = routeKey.get(trip.routeId);
    const service = serviceOf.get(trip.serviceDayId);
    if (direction === undefined || route === undefined || service === undefined) throw new Error(`Trip ${trip.id} has no Route, service day or Outbound/Inbound direction.`);
    const fact: TripFact = { id: trip.id, route, service, direction, times: [...trip.stopTimes].sort((a, b) => a.sequence - b.sequence).map((point) => point.time) };
    trips.push(fact);
    factById.set(trip.id, fact);
  }
  const blocks: BlockFact[] = records.blocks
    .filter((block) => options.blockingScenarioId === undefined || block.blockingScenarioId === options.blockingScenarioId)
    .map((block) => ({
      label: block.label,
      service: serviceOf.get(block.serviceDayId) ?? '',
      trips: block.activities.flatMap((activity) => {
        if (activity.type !== 'revenueTrip') return [];
        const fact = factById.get(activity.tripId);
        if (!fact) throw new Error(`Block ${block.label} holds Trip ${activity.tripId}, which is not in the compared profile.`);
        return [tripKey(fact)];
      }),
    }));
  return { trips, blocks };
}

/** Per Route, service day and direction: the trip count, the sorted timepoint times, and the running seconds summed over the Trips. */
function groupsOf(trips: TripFact[]): Record<string, { trips: number; timepointTimes: number[]; runningSeconds: number }> {
  const groups: Record<string, { trips: number; timepointTimes: number[]; runningSeconds: number }> = {};
  for (const fact of trips) {
    const key = `${fact.route} | ${fact.service} | ${fact.direction === 0 ? 'Outbound' : 'Inbound'}`;
    const group = (groups[key] ??= { trips: 0, timepointTimes: [], runningSeconds: 0 });
    group.trips += 1;
    group.timepointTimes.push(...fact.times);
    group.runningSeconds += (fact.times.at(-1) ?? 0) - (fact.times[0] ?? 0);
  }
  for (const group of Object.values(groups)) group.timepointTimes.sort((a, b) => a - b);
  return groups;
}

/** Each block as one line: its service day, its label and its Trips (sorted), so the lists compare as multisets. */
function blockLines(blocks: BlockFact[]): string[] {
  return blocks.map((block) => `${block.service} | ${block.label} | ${[...block.trips].sort().join(' ; ')}`).sort();
}

/** Blocks per service day. */
function blockCountsOf(blocks: BlockFact[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) counts[block.service] = (counts[block.service] ?? 0) + 1;
  return counts;
}

/** Exports the records, reads the ZIP back with the phase I reader and imports it as a new Project. Returns the imported records too. */
async function roundTrip(
  records: ScenarioRecords,
  request: GtfsExportRequest,
): Promise<{ exportedTrips: number; trips: number; imported: ScenarioRecords; importedRoutes: Route[]; exportRouteIds: string[] }> {
  const built = buildFeed(records, request, true);
  expect(built.check.refusals).toEqual([]);
  expect(built.check.ready).toBe(true);
  const zip = createCsvArchive(built.files.map((file) => ({ filename: file.name, contents: file.text })));
  const bytes = new Uint8Array(await zip.arrayBuffer());

  const routeIds = (await readFeedTables(bytes, [], undefined, { skipStopTimes: true })).routes.map((row) => row.route_id);
  const tables = await readFeedTables(bytes, routeIds);
  const snapshot = projectFromFeed({
    tables,
    routeIds,
    fileName: 'round-trip.zip',
    now: IMPORT_NOW,
    blocks: { import: true, pullOutMinutes: 10, pullInMinutes: 10 },
  });
  const imported = snapshotForScenario(snapshot, snapshot.scenarios[0]!.id);
  if (!imported) throw new Error('The imported Project holds no Scenario.');
  return { exportedTrips: built.check.counts?.trips ?? -1, trips: imported.trips.length, imported, importedRoutes: imported.routes, exportRouteIds: routeIds };
}

/**
 * Compares the exported Scenario's facts with the imported Project's facts (Decision 0090, plan E-D2). `withoutService` leaves one service
 * day out of the exported side; the caller then asserts that day's known difference itself.
 */
function expectSameSchedule(
  source: ScenarioRecords,
  sourceProfileId: string,
  sourceBlockingId: string,
  imported: ScenarioRecords,
  withoutService?: string,
): void {
  const exported = factsOf(source, exportRouteId, { tripProfileId: sourceProfileId, blockingScenarioId: sourceBlockingId });
  const expectedTrips = exported.trips.filter((fact) => fact.service !== withoutService);
  const expectedBlocks = exported.blocks.filter((block) => block.service !== withoutService);
  const read = factsOf(imported, (route) => route.gtfsRouteId ?? '');

  expect(groupsOf(read.trips)).toEqual(groupsOf(expectedTrips));
  expect(blockCountsOf(read.blocks)).toEqual(blockCountsOf(expectedBlocks));
  expect(blockLines(read.blocks)).toEqual(blockLines(expectedBlocks));
}

describe('GTFS export read-back: the mini Scenario (Decision 0090; plan E-D2)', () => {
  it('imports the export back with the same trips per Route, service day and direction, the same running seconds and the same blocks', async () => {
    const input = miniInput();
    const records: ScenarioRecords = {
      scenario: { id: 'scenario-mini', projectId: 'project-mini', name: 'Mini Scenario', ...META },
      serviceDays: input.serviceDays,
      routes: input.routes.map((aggregate) => aggregate.route),
      nodes: input.routes.flatMap((aggregate) => aggregate.nodes),
      patterns: input.routes.flatMap((aggregate) => aggregate.patterns),
      directions: input.routes.flatMap((aggregate) => aggregate.directions ?? []),
      runtimeProfiles: [],
      runtimeAssignments: [],
      generationSets: [],
      tripProfiles: [{ id: 'profile-base', scenarioId: 'scenario-mini', name: 'Base', ...META }],
      blockingScenarios: [{ id: 'blocking-base', scenarioId: 'scenario-mini', tripProfileId: 'profile-base', name: 'Base blocks', ...META }],
      trips: input.trips,
      blocks: input.blocks ?? [],
      routeStopSets: input.routeStopSets,
    };
    const request: GtfsExportRequest = {
      routeIds: ['route-t1'],
      tripProfileId: 'profile-base',
      blockingScenarioId: 'blocking-base',
      settings: structuredClone(MINI_SETTINGS),
      exportDate: '2027-01-01',
    };

    const result = await roundTrip(records, request);

    expect(result.exportRouteIds).toEqual(['T1']);
    expect(result.importedRoutes.map((route) => route.gtfsRouteId)).toEqual(['T1']);
    expect(result.exportedTrips).toBe(5);
    expect(result.trips).toBe(5);
    // Hand-worked (tests/fixtures/gtfs-export/README.md): one block of two Trips; the 06:30 Trip is unblocked.
    expect(blockCountsOf(factsOf(result.imported, (route) => route.gtfsRouteId ?? '').blocks)).toEqual({ WKD: 1 });
    expectSameSchedule(records, 'profile-base', 'blocking-base', result.imported);
  });
});

describe('GTFS export read-back: the Federal BRT golden Scenario (Decision 0090; plan E-D2)', () => {
  /**
   * The golden Scenario as stored records, with a location for every timepoint of every pattern (one per Node, as the golden export test
   * places them). Without locations the export refuses every timepoint as unlocated (Decision 0090 item 19).
   */
  function locatedFederal(): { records: ScenarioRecords; request: GtfsExportRequest } {
    const backup = goldenRaw();
    const base = snapshotForScenario(asSnapshot(backup), backup.scenarios[0].id);
    if (!base) throw new Error('The golden backup holds no Scenario.');
    const route = base.routes[0]!;
    const nodeIndex = new Map(base.nodes.filter((node) => node.routeId === route.id).map((node, index) => [node.id, index]));
    const routeStopSet: RouteStopSet = {
      id: 'stop-set-federal-roundtrip',
      scenarioId: route.scenarioId,
      routeId: route.id,
      roundingSeconds: 60,
      stops: [],
      placementsByPatternId: {},
      timepointLocationsByPatternId: Object.fromEntries(base.patterns.filter((pattern) => pattern.routeId === route.id).map((pattern) => [
        pattern.id,
        Object.fromEntries(pattern.points.map((point) => [point.id, { latitude: 39.7 + (nodeIndex.get(point.nodeId) ?? 0) * 0.001, longitude: -105 }])),
      ])),
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    };
    const profile = base.tripProfiles?.[0];
    const blocking = base.blockingScenarios?.[0];
    const holiday = base.serviceDays.find((day) => day.kind === 'holiday');
    if (!profile || !blocking || !holiday) throw new Error('The golden Scenario lacks a Trip profile, a Blocking scenario or a holiday service day.');
    return {
      records: { ...base, routeStopSets: [routeStopSet] },
      request: {
        routeIds: [route.id],
        tripProfileId: profile.id,
        blockingScenarioId: blocking.id,
        settings: {
          startDate: '2027-01-04',
          endDate: '2027-01-31',
          holidays: [{ date: '2027-01-18', serviceDayId: holiday.id }],
          agencyName: 'Federal Test Agency',
          agencyUrl: 'https://example.org',
          agencyTimezone: 'America/Denver',
          mapLines: 'straight',
        },
        exportDate: '2027-01-01',
      },
    };
  }

  it('counts the export\'s blocks by service day: 69 blocks, one per block of the Scenario', () => {
    const { records, request } = locatedFederal();

    expect(buildFeed(records, request, false).check.counts?.blocks).toBe(69);
  });

  // Known difference, import side (not fixed here; phase I code is not changed). In the golden Scenario the Holiday Trips have the same
  // directions and times as the Sunday Trips, so the import's holiday rule reads the holiday date as Sunday service (the date's Trips match
  // the Sunday reference) and keeps no Holiday service day. The 224 Holiday Trips and their 17 blocks are therefore not imported.
  it('imports the export back with the same trips, running seconds and blocks, except the Holiday day, whose Trips the import reads as Sunday', async () => {
    const { records, request } = locatedFederal();
    const exported = factsOf(records, exportRouteId, { tripProfileId: request.tripProfileId, blockingScenarioId: request.blockingScenarioId });
    const holidayTrips = exported.trips.filter((fact) => fact.service === 'HOL');
    const sundayTrips = exported.trips.filter((fact) => fact.service === 'SUN');
    const signature = (fact: TripFact) => `${fact.direction}|${fact.times.join(',')}`;
    expect(holidayTrips.length).toBe(224);
    expect(new Set(holidayTrips.map(signature))).toEqual(new Set(sundayTrips.map(signature)));
    expect(exported.blocks.filter((block) => block.service === 'HOL').length).toBe(17);

    const result = await roundTrip(records, request);

    expect(result.exportedTrips).toBe(984);
    expect(result.trips).toBe(984 - holidayTrips.length);
    expect(result.importedRoutes.length).toBe(1);
    expectSameSchedule(records, request.tripProfileId, request.blockingScenarioId!, result.imported, 'HOL');
  });
});
