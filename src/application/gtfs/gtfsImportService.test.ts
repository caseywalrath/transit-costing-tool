import Dexie from 'dexie';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadFeedTables, parseCsvText } from '../../domain/gtfs/testFeeds';
import { GtfsFeedError, type GtfsTables } from '../../domain/gtfs/feedTables';
import type { ScenarioFromFeedOptions } from '../../domain/gtfs/scenarioFromFeed';
import { ProjectBackupService } from '../../persistence/backupRepository';
import { TransitDatabase } from '../../persistence/database';
import { DexieRouteDefinitionRepository } from '../../persistence/dexieRepository';
import { DexieRestorePoints } from '../../persistence/restorePointPersistence';
import { storedZip } from '../../testSupport/storedZip';
import { GTFS_IMPORT_COVERAGE, withRestorePoints, type RestorePointLookup } from '../restorePointCoverage';
import { RestorePointService } from '../restorePointService';
import { RouteDefinitionService } from '../routeDefinitionService';
import { SaveStatusPublisher } from '../saveStatus';
import { GtfsImportService, readFeedTables, runFeedJob } from './gtfsImportService';

const NOW = '2026-11-22T09:00:00.000Z';
const FIXTURES = fileURLToPath(new URL('../../../tests/fixtures/gtfs/', import.meta.url));
const MINI_ROUTES = ['B1', 'R1', 'F1'];

const fixtureBytes = (path: string): Uint8Array => new Uint8Array(readFileSync(join(FIXTURES, path)));
const fixtureText = (file: string): string => readFileSync(join(FIXTURES, 'mini', file), 'utf8');

/** The mini feed's files as text, with some replaced (a string) or left out (null). */
function miniFiles(changes: Record<string, string | null> = {}): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(join(FIXTURES, 'mini')).filter((entry) => entry.endsWith('.txt')).sort()) {
    files[name] = fixtureText(name);
  }
  for (const [name, change] of Object.entries(changes)) {
    if (change === null) delete files[name];
    else files[name] = change;
  }
  return files;
}

/** Serializes CSV rows, quoting any field that holds a comma, a quote or a line break. */
function csvOf(rows: Record<string, string>[], columns: string[]): string {
  const cell = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return [columns.join(','), ...rows.map((row) => columns.map((column) => cell(row[column] ?? '')).join(','))].join('\n') + '\n';
}

/** The mini feed as a ZIP, with one column left out of one file. */
function miniZipWithout(file: string, column: string): Uint8Array {
  const rows = parseCsvText(fixtureText(file));
  const columns = Object.keys(rows[0]).filter((name) => name !== column);
  return storedZip(miniFiles({ [file]: csvOf(rows, columns) }));
}

function optionsFrom(tables: GtfsTables, extra: Partial<ScenarioFromFeedOptions> = {}): ScenarioFromFeedOptions {
  return { tables, routeIds: MINI_ROUTES, fileName: 'mini.zip', now: NOW, ...extra };
}

let counter = 0;
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
});

/** A new database, and the services as the application wires them (without the restore-point proxy). */
async function harness() {
  const name = `transit-gtfs-import-${Date.now()}-${(counter += 1)}`;
  const db = new TransitDatabase(name);
  await db.open();
  closers.push(async () => {
    db.close();
    await Dexie.delete(name);
  });
  const repository = new DexieRouteDefinitionRepository(db);
  const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
  const routeDefinition = new RouteDefinitionService(repository, backup, () => NOW);
  return { db, repository, routeDefinition, service: new GtfsImportService(repository, routeDefinition) };
}

const miniTables = async (): Promise<GtfsTables> => readFeedTables(fixtureBytes('zips/mini-deflate.zip'), MINI_ROUTES);

describe('readFeedTables', () => {
  it('reads the mini feed as the fixture folder reads it, from a ZIP with deflated entries', async () => {
    const fixture = loadFeedTables('mini');
    const tables = await miniTables();
    expect(tables.routes).toEqual(fixture.routes);
    expect(tables.trips).toEqual(fixture.trips);
    expect(tables.stopTimes).toEqual(fixture.stopTimes);
    expect(tables.stops).toEqual(fixture.stops);
    expect(tables.calendar).toEqual(fixture.calendar);
    expect(tables.calendarDates).toEqual(fixture.calendarDates);
    expect(tables.fileNames).toEqual(fixture.fileNames);
  });

  it('reads a feed whose files sit inside one folder', async () => {
    const tables = await readFeedTables(fixtureBytes('zips/mini-in-folder-deflate.zip'), MINI_ROUTES);
    expect(tables.routes).toEqual(loadFeedTables('mini').routes);
  });

  it('keeps stop_times rows only for the trips of the selected Routes', async () => {
    const fixture = loadFeedTables('mini');
    const selectedTrips = new Set(fixture.trips.filter((trip) => trip.route_id === 'R1').map((trip) => trip.trip_id));
    const tables = await readFeedTables(fixtureBytes('zips/mini-deflate.zip'), ['R1']);
    expect(tables.stopTimes.length).toBeGreaterThan(0);
    expect(tables.stopTimes).toEqual(fixture.stopTimes.filter((row) => selectedTrips.has(row.trip_id)));
  });

  it('reports each file as it reads it, routes and trips first and stop_times last', async () => {
    const read: string[] = [];
    await readFeedTables(fixtureBytes('zips/mini-deflate.zip'), MINI_ROUTES, (file) => read.push(file));
    expect(read[0]).toBe('routes.txt');
    expect(read[1]).toBe('trips.txt');
    expect(read.at(-1)).toBe('stop_times.txt');
    expect(read).toContain('stops.txt');
    expect(read).not.toContain('feed_info.txt');
  });
});

// Decision 0089 item 11, second bullet: a file the import needs, or both calendars, stops the read.
describe('missing files (Decision 0089 item 11)', () => {
  it.each(['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'])('refuses a feed with no %s, and names the file', async (file) => {
    await expect(readFeedTables(storedZip(miniFiles({ [file]: null })), MINI_ROUTES)).rejects.toMatchObject({
      name: 'GtfsFeedError',
      message: `${file} is missing from the feed, so the feed cannot be imported.`,
    });
  });

  it('refuses a feed with neither calendar file', async () => {
    await expect(readFeedTables(storedZip(miniFiles({ 'calendar.txt': null, 'calendar_dates.txt': null })), MINI_ROUTES)).rejects.toThrow(
      new GtfsFeedError('The feed has neither calendar.txt nor calendar_dates.txt, so the feed cannot be imported.'),
    );
  });

  it('accepts a feed with calendar_dates.txt alone', async () => {
    await expect(readFeedTables(storedZip(miniFiles({ 'calendar.txt': null })), MINI_ROUTES)).resolves.toMatchObject({
      calendarDates: expect.any(Array),
    });
  });
});

// Decision 0089 item 11, third bullet: each named column, in each named file, stops the read and names both.
describe('required columns (Decision 0089 item 11)', () => {
  it.each([
    ['routes.txt', 'route_id'],
    ['trips.txt', 'route_id'],
    ['trips.txt', 'service_id'],
    ['trips.txt', 'trip_id'],
    ['stop_times.txt', 'trip_id'],
    ['stop_times.txt', 'stop_id'],
    ['stop_times.txt', 'stop_sequence'],
    ['stop_times.txt', 'arrival_time'],
    ['stop_times.txt', 'departure_time'],
    ['stops.txt', 'stop_id'],
  ])('refuses a feed whose %s has no %s column, with a message that names both', async (file, column) => {
    await expect(readFeedTables(miniZipWithout(file, column), MINI_ROUTES)).rejects.toMatchObject({
      name: 'GtfsFeedError',
      message: `${file} has no ${column} column, so the feed cannot be imported.`,
    });
    await expect(readFeedTables(miniZipWithout(file, column), MINI_ROUTES)).rejects.toBeInstanceOf(GtfsFeedError);
  });

  it('checks stop_times.txt even when none of its rows belongs to a selected Route', async () => {
    await expect(readFeedTables(miniZipWithout('stop_times.txt', 'trip_id'), [])).rejects.toMatchObject({
      message: 'stop_times.txt has no trip_id column, so the feed cannot be imported.',
    });
  });

  it('checks the header of a table that has no data rows', async () => {
    const bytes = storedZip(miniFiles({ 'stop_times.txt': 'stop_id,stop_sequence,arrival_time,departure_time\n' }));
    await expect(readFeedTables(bytes, MINI_ROUTES)).rejects.toMatchObject({
      message: 'stop_times.txt has no trip_id column, so the feed cannot be imported.',
    });
  });

  it('reads a header-only table whose required columns are all present', async () => {
    const bytes = storedZip(miniFiles({ 'stop_times.txt': 'trip_id,stop_id,stop_sequence,arrival_time,departure_time\n' }));
    await expect(readFeedTables(bytes, MINI_ROUTES)).resolves.toMatchObject({ stopTimes: [] });
  });
});

describe('runFeedJob', () => {
  it('reads and plans the feed, with the counts the planning reports', async () => {
    const result = await runFeedJob({ bytes: fixtureBytes('zips/mini-deflate.zip'), fileName: 'mini.zip', routeIds: MINI_ROUTES, now: NOW, plan: {} });
    expect(result.tables.trips).toEqual(loadFeedTables('mini').trips);
    expect(result.counts.countsByKey.weekday).toBeGreaterThan(0);
    expect(result.translation.routes).toHaveLength(MINI_ROUTES.length);
  });
});

describe('level A (importAsProject)', () => {
  it('names the Project after the agency and the first date (Decision 0089 item 2)', async () => {
    const { service } = await harness();
    const project = await service.importAsProject(optionsFrom(await miniTables()));
    expect(project.name).toBe('Mini Test Transit (2026-01-05)');
  });

  it('creates one Scenario, "Existing service", whose Weekday holds the 25 mini trips', async () => {
    const { repository, service } = await harness();
    const project = await service.importAsProject(optionsFrom(await miniTables()));
    const scenarios = await repository.listScenarios(project.id);
    expect(scenarios.map((scenario) => scenario.name)).toEqual(['Existing service']);
    const records = await repository.getScenarioRecords(scenarios[0].id);
    const weekdayId = records?.serviceDays.find((day) => day.kind === 'weekday')?.id;
    expect(records?.trips.filter((trip) => trip.serviceDayId === weekdayId)).toHaveLength(25);
  });

  it('writes nothing when a required column is missing from the feed it reads', async () => {
    const { db, service } = await harness();
    const bytes = miniZipWithout('stops.txt', 'stop_id');
    await expect(readFeedTables(bytes, MINI_ROUTES).then((tables) => service.importAsProject(optionsFrom(tables)))).rejects.toThrow(
      'stops.txt has no stop_id column',
    );
    expect(await db.projects.count()).toBe(0);
    expect(await db.scenarios.count()).toBe(0);
  });
});

describe('level B (importAsScenario)', () => {
  it('adds a Scenario named for the feed, leaves the Project\'s other Scenarios unchanged, and names a clash with " 2"', async () => {
    const { db, repository, service } = await harness();
    const tables = await miniTables();
    const project = await service.importAsProject(optionsFrom(tables));
    const [existing] = await repository.listScenarios(project.id);
    const before = await repository.getScenarioRecords(existing.id);

    const first = await service.importAsScenario(project.id, optionsFrom(tables));
    expect(first.records.scenario.name).toBe('Existing service (2026-01-05)');
    expect(first.records.scenario.importNotes).toHaveLength(1);
    const second = await service.importAsScenario(project.id, optionsFrom(tables));
    expect(second.records.scenario.name).toBe('Existing service (2026-01-05) 2');

    // listScenarios returns rows in primary-key order, which is random for generated identifiers.
    const names = (await repository.listScenarios(project.id)).map((scenario) => scenario.name).sort();
    expect(names).toEqual(['Existing service', 'Existing service (2026-01-05)', 'Existing service (2026-01-05) 2']);
    expect(await repository.getScenarioRecords(existing.id)).toEqual(before);
    expect(await db.scenarios.count()).toBe(3);
  });

  it('refuses a Project that no longer exists, and writes nothing', async () => {
    const { db, service } = await harness();
    await expect(service.importAsScenario('no-such-project', optionsFrom(await miniTables()))).rejects.toThrow('no longer exists');
    expect(await db.scenarios.count()).toBe(0);
  });
});

describe('level C (addRoutes)', () => {
  /** A Project made from the mini feed, and its one Scenario with the Trip profile and records. */
  async function miniProject() {
    const env = await harness();
    const tables = await miniTables();
    const project = await env.service.importAsProject(optionsFrom(tables));
    const [scenario] = await env.repository.listScenarios(project.id);
    const records = (await env.repository.getScenarioRecords(scenario.id))!;
    return { ...env, tables, scenario, records, tripProfileId: records.tripProfiles![0].id };
  }
  const weekdayTripsOn = (records: { serviceDays: { id: string; kind: string }[]; trips: { serviceDayId: string; tripProfileId?: string }[] }, tripProfileId: string) => {
    const weekdayId = records.serviceDays.find((day) => day.kind === 'weekday')?.id;
    return records.trips.filter((trip) => trip.serviceDayId === weekdayId && trip.tripProfileId === tripProfileId).length;
  };

  it('adds the feed\'s Routes to the Scenario, named " (feed)" where a name is taken, with their trips on the chosen Trip profile', async () => {
    const { service, repository, scenario, tables, records, tripProfileId } = await miniProject();
    const report = await service.addRoutes(scenario.id, tripProfileId, undefined, optionsFrom(tables));
    expect(report.routeNames).toHaveLength(MINI_ROUTES.length);
    expect(report.routeNames.every((name) => name.endsWith(' (feed)'))).toBe(true);
    const after = (await repository.getScenarioRecords(scenario.id))!;
    expect(after.routes).toHaveLength(records.routes.length + MINI_ROUTES.length);
    expect(weekdayTripsOn(after, tripProfileId)).toBe(50);
  });

  it('leaves the Scenario\'s service days and annual counts unchanged, and appends one import note', async () => {
    const { service, repository, scenario, tables, records, tripProfileId } = await miniProject();
    await service.addRoutes(scenario.id, tripProfileId, undefined, optionsFrom(tables));
    const after = (await repository.getScenarioRecords(scenario.id))!;
    expect(after.serviceDays).toEqual(records.serviceDays);
    expect(after.scenario.importNotes).toHaveLength(2);
  });

  it('reports no count differences when the feed is the one the Scenario came from; its custom day is listed as not imported', async () => {
    const { service, scenario, tables, tripProfileId } = await miniProject();
    const report = await service.addRoutes(scenario.id, tripProfileId, undefined, optionsFrom(tables));
    expect(report.countDifferences).toEqual([]);
    expect(report.notImported.length).toBeGreaterThan(0);
    expect(report.notImported.every((day) => day.reason === 'customDay')).toBe(true);
  });

  it('passes the timepoint mode and overrides to the Routes it adds', async () => {
    const { service, repository, scenario, tables, tripProfileId } = await miniProject();
    const b1Trips = new Set(tables.trips.filter((trip) => trip.route_id === 'B1').map((trip) => trip.trip_id));
    const flagged = { ...tables, stopTimes: tables.stopTimes.map((row) => (b1Trips.has(row.trip_id) && row.stop_id === 'S2' ? { ...row, timepoint: '0' } : row)) };
    const nodesAdded = async (extra: Partial<ScenarioFromFeedOptions>): Promise<number> => {
      const before = (await repository.getScenarioRecords(scenario.id))!.nodes.length;
      await service.addRoutes(scenario.id, tripProfileId, undefined, optionsFrom(flagged, { routeIds: ['B1'], ...extra }));
      return (await repository.getScenarioRecords(scenario.id))!.nodes.length - before;
    };
    expect(await nodesAdded({})).toBe(2);
    expect(await nodesAdded({ timepointMode: 'suggested' })).toBe(3);
    expect(await nodesAdded({ timepointOverrides: { B1: { 'outbound:S1>S3': ['S1', 'S2', 'S3'] } } })).toBe(3);
  });

  it('does not import a feed custom day, and lists it with its proposed days', async () => {
    const tables = loadFeedTables('cal-holiday-unique');
    const options = optionsFrom(tables, { routeIds: tables.routes.map((route) => route.route_id), fileName: 'cal-holiday-unique.zip' });
    const { service, repository } = await harness();
    const project = await service.importAsProject(options);
    const [scenario] = await repository.listScenarios(project.id);
    const records = (await repository.getScenarioRecords(scenario.id))!;
    const tripProfileId = records.tripProfiles![0].id;
    const report = await service.addRoutes(scenario.id, tripProfileId, undefined, options);
    expect(report.notImported.some((day) => day.reason === 'customDay')).toBe(true);
    const after = (await repository.getScenarioRecords(scenario.id))!;
    expect(after.serviceDays).toEqual(records.serviceDays);
  });

  it('takes no blocks when no Blocking scenario is chosen, even when the planner asks for them', async () => {
    const { service, repository, scenario, tables, records, tripProfileId } = await miniProject();
    await service.addRoutes(scenario.id, tripProfileId, undefined, optionsFrom(tables, { blocks: { import: true, pullOutMinutes: 10, pullInMinutes: 10 } }));
    const after = (await repository.getScenarioRecords(scenario.id))!;
    expect(after.blocks).toHaveLength(records.blocks.length);
  });

  it('refuses a Trip profile that is not in the Scenario, and writes nothing', async () => {
    const { service, repository, scenario, tables, records } = await miniProject();
    await expect(service.addRoutes(scenario.id, 'no-such-profile', undefined, optionsFrom(tables))).rejects.toThrow('Trip profile');
    expect((await repository.getScenarioRecords(scenario.id))!.routes).toHaveLength(records.routes.length);
  });

  it('refuses a Scenario that no longer exists, and writes nothing', async () => {
    const { service, db, tables } = await miniProject();
    await expect(service.addRoutes('no-such-scenario', 'tp', undefined, optionsFrom(tables))).rejects.toThrow();
    expect(await db.routes.count()).toBe(MINI_ROUTES.length);
  });

  it('Undo of the import (its restore point) removes the added Routes and what they own, and nothing else', async () => {
    const { db, service, repository, scenario, tables, records, tripProfileId } = await miniProject();
    const restorePoints = new DexieRestorePoints(db, repository);
    const saveStatus = new SaveStatusPublisher();
    const lookup: RestorePointLookup = {
      getTrip: (id) => db.trips.get(id),
      getTripProfile: (id) => db.tripProfiles.get(id),
      getRuntimeProfile: (id) => db.runtimeProfiles.get(id),
      getPattern: (id) => db.patterns.get(id),
      getRoute: (id) => db.routes.get(id),
      getBlockingScenario: (id) => db.blockingScenarios.get(id),
      getBlock: (id) => db.blocks.get(id),
      getScenario: (id) => db.scenarios.get(id),
      routeEditPreviewScope: () => undefined,
    };
    const covered = withRestorePoints(service, GTFS_IMPORT_COVERAGE, restorePoints, restorePoints, saveStatus, lookup);
    await covered.addRoutes(scenario.id, tripProfileId, undefined, optionsFrom(tables));
    const point = (await restorePoints.listRestorePoints()).find((candidate) => candidate.kind === 'importGtfsRoutes');
    expect(point?.counts.routes?.added).toBe(MINI_ROUTES.length);

    const restore = new RestorePointService(restorePoints, restorePoints, {
      getScenarioRecords: (id) => repository.getScenarioRecords(id),
      saveScenarioRecords: (next) => repository.saveScenarioRecords(next),
      getProjectSnapshot: (id) => repository.getProjectSnapshot(id),
      saveProjectSnapshot: (snapshot) => repository.saveProjectSnapshot(snapshot),
      projectExists: async (id) => Boolean(await db.projects.get(id)),
    }, saveStatus);
    await restore.restore(point!.id);

    const undone = (await repository.getScenarioRecords(scenario.id))!;
    expect(undone.routes).toEqual(records.routes);
    expect(undone.trips).toEqual(records.trips);
    expect(undone.serviceDays).toEqual(records.serviceDays);
  });
});
