// The GTFS export service (Decision 0090, card E4): the dialog's context, the checks, the written files against the fixture, the one write of
// the remembered settings, and the worker client's rule that a newer check replaces a waiting older one.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { miniInput, MINI_SETTINGS } from '../../domain/gtfsExport/miniScenarioFixture';
import type { ScenarioRecords } from '../../domain/project';
import type { Scenario } from '../../domain/types';
import { buildFeed, exportContextOf, safeFileStem, type GtfsExportRequest } from './gtfsExportBuild';
import { GtfsExportService } from './gtfsExportService';
import { createGtfsExportEngine, type ExportWorkerLike, type GtfsExportWorkerRequest, type GtfsExportWorkerResponse } from './gtfsExportWorkerClient';

const EXPECTED_DIR = fileURLToPath(new URL('../../../tests/fixtures/gtfs-export/mini-export/', import.meta.url));
const META = { createdAt: '2027-01-01T00:00:00.000Z', updatedAt: '2027-01-01T00:00:00.000Z' };

/** The README Scenario as stored records: one Route, Trip profile "Base", Blocking scenario "Base blocks". */
function miniRecords(overrides: Partial<Scenario> = {}): ScenarioRecords {
  const input = miniInput();
  const scenario: Scenario = { id: 'scenario-mini', projectId: 'project-mini', name: 'Mini Scenario', ...META, ...overrides };
  return {
    scenario,
    serviceDays: input.serviceDays,
    routes: input.routes.map((aggregate) => aggregate.route),
    nodes: input.routes.flatMap((aggregate) => aggregate.nodes),
    patterns: input.routes.flatMap((aggregate) => aggregate.patterns),
    directions: input.routes.flatMap((aggregate) => aggregate.directions ?? []),
    runtimeProfiles: [],
    runtimeAssignments: [],
    tripProfiles: [{ id: 'profile-base', scenarioId: scenario.id, name: 'Base', ...META }],
    generationSets: [],
    trips: input.trips,
    blocks: input.blocks ?? [],
    blockingScenarios: [{ id: 'blocking-base', scenarioId: scenario.id, tripProfileId: 'profile-base', name: 'Base blocks', ...META }],
    routeStopSets: input.routeStopSets,
  };
}

const request = (change: Partial<GtfsExportRequest> = {}): GtfsExportRequest => ({
  routeIds: ['route-t1'],
  tripProfileId: 'profile-base',
  blockingScenarioId: 'blocking-base',
  settings: structuredClone(MINI_SETTINGS),
  exportDate: '2027-01-01',
  ...change,
});

describe('exportContextOf', () => {
  it('lists the Routes with their Trips per Trip profile, the choices and the remembered settings', () => {
    const context = exportContextOf(miniRecords({ gtfsExportSettings: structuredClone(MINI_SETTINGS) }));
    expect(context.scenarioName).toBe('Mini Scenario');
    expect(context.routes).toEqual([{ id: 'route-t1', name: 'Test Line', shortName: 'T1', tripsByProfileId: { 'profile-base': 5 } }]);
    expect(context.tripProfiles).toEqual([{ id: 'profile-base', name: 'Base' }]);
    expect(context.blockingScenarios).toEqual([{ id: 'blocking-base', name: 'Base blocks', tripProfileId: 'profile-base' }]);
    expect(context.serviceDays.map((day) => day.kind)).toEqual(['weekday', 'saturday', 'holiday']);
    expect(context.saved).toEqual(MINI_SETTINGS);
  });

  it('offers the latest import note\'s publisher and the range of its dates when nothing is remembered', () => {
    const note = { publisher: 'Mini Transit', fileName: 'mini.zip', datesByServiceDayId: { 'day-wkd': '2026-09-29', 'day-sat': '2026-10-03', 'day-hol': '2026-11-26' }, routeCount: 1, importedAt: '2026-11-22T00:00:00.000Z' };
    const context = exportContextOf(miniRecords({ importNotes: [note] }));
    expect(context.saved).toBeUndefined();
    expect(context.fromImportNote).toEqual({ startDate: '2026-09-29', endDate: '2026-11-26', agencyName: 'Mini Transit' });
  });
});

describe('buildFeed', () => {
  it('writes every file of the fixture byte for byte and counts it', () => {
    const built = buildFeed(miniRecords(), request(), true);
    expect(built.check.ready).toBe(true);
    for (const file of built.files) expect(file.text, file.name).toBe(readFileSync(`${EXPECTED_DIR}${file.name}`, 'utf8'));
    expect(built.files.map((file) => file.name)).toEqual(['agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt', 'shapes.txt', 'feed_info.txt']);
    expect(built.check.counts).toEqual({ routes: 1, stops: 5, trips: 5, serviceDays: 3, blocks: 1 });
    expect(built.reportCsv).toContain('service_day');
  });

  it('moves no files when it only checks', () => {
    const built = buildFeed(miniRecords(), request(), false);
    expect(built.check.ready).toBe(true);
    expect(built.files).toEqual([]);
    expect(built.reportCsv).toBe('');
  });

  it('writes no block_id when no Blocking scenario is chosen', () => {
    const built = buildFeed(miniRecords(), request({ blockingScenarioId: undefined }), true);
    expect(built.check.counts?.blocks).toBe(0);
  });

  it('refuses a blank agency name and writes nothing', () => {
    const built = buildFeed(miniRecords(), request({ settings: { ...structuredClone(MINI_SETTINGS), agencyName: '' } }), true);
    expect(built.check.ready).toBe(false);
    expect(built.check.refusals.map((issue) => issue.code)).toEqual(['gtfsExport.agencyNameBlank']);
    expect(built.files).toEqual([]);
  });

  it('reports a holiday outside the range as a settings problem instead of throwing', () => {
    const settings = { ...structuredClone(MINI_SETTINGS), holidays: [{ date: '2027-03-01', serviceDayId: 'day-hol' }] };
    const built = buildFeed(miniRecords(), request({ settings }), false);
    expect(built.check.ready).toBe(false);
    expect(built.check.settingsProblem).toMatch(/outside the export range/);
  });

  it('refuses a Trip profile that the Scenario does not hold', () => {
    expect(() => buildFeed(miniRecords(), request({ tripProfileId: 'missing' }), false)).not.toThrow();
    expect(buildFeed(miniRecords(), request({ tripProfileId: 'missing' }), false).check.settingsProblem).toMatch(/Trip profile/);
  });
});

describe('GtfsExportService', () => {
  function service(records: ScenarioRecords | undefined) {
    const saved: Scenario[] = [];
    const repository = {
      getScenarioRecords: async () => records,
      saveScenario: async (scenario: Scenario) => { saved.push(scenario); },
    };
    return { saved, service: new GtfsExportService(repository, undefined, undefined, () => '2027-02-02T00:00:00.000Z') };
  }

  it('writes the ZIP and the report, and saves the settings in one write', async () => {
    const { saved, service: exporter } = service(miniRecords());
    const outcome = await exporter.exportFeed('scenario-mini', request());
    expect(outcome.status).toBe('done');
    if (outcome.status !== 'done') return;
    expect(outcome.done.zipName).toBe('mini-scenario-gtfs.zip');
    expect(outcome.done.reportName).toBe('mini-scenario-gtfs-report.csv');
    expect(outcome.done.zip.size).toBeGreaterThan(0);
    expect(outcome.done.tripCount).toBe(5);
    expect(outcome.done.routeCount).toBe(1);
    expect(saved).toHaveLength(1);
    expect(saved[0].gtfsExportSettings).toEqual(MINI_SETTINGS);
    expect(saved[0].updatedAt).toBe('2027-02-02T00:00:00.000Z');
    expect(outcome.done.scenario).toEqual(saved[0]);
  });

  it('saves nothing when a refusal stands', async () => {
    const { saved, service: exporter } = service(miniRecords());
    const outcome = await exporter.exportFeed('scenario-mini', request({ settings: { ...structuredClone(MINI_SETTINGS), agencyUrl: '' } }));
    expect(outcome.status).toBe('refused');
    expect(saved).toEqual([]);
  });

  it('opens a session that checks without reading storage again', async () => {
    let reads = 0;
    const exporter = new GtfsExportService({ getScenarioRecords: async () => { reads += 1; return miniRecords(); }, saveScenario: async () => undefined });
    const session = await exporter.open('scenario-mini');
    const first = await session.check(request());
    const second = await session.check(request({ blockingScenarioId: undefined }));
    session.close();
    expect(reads).toBe(1);
    expect(first?.counts?.blocks).toBe(1);
    expect(second?.counts?.blocks).toBe(0);
  });

  it('says so when the Scenario is gone', async () => {
    await expect(service(undefined).service.open('scenario-mini')).rejects.toThrow(/no longer in this browser/);
  });
});

describe('safeFileStem', () => {
  it('keeps letters and digits, joins the rest with one dash, and lower-cases', () => {
    expect(safeFileStem('RTD Sep 2026')).toBe('rtd-sep-2026');
    expect(safeFileStem('  A/B: "C"  ')).toBe('a-b-c');
    expect(safeFileStem('???')).toBe('scenario');
  });
});

describe('the export engine with a worker', () => {
  /** A worker that answers only when the test says so. */
  function fakeWorker() {
    const posted: GtfsExportWorkerRequest[] = [];
    const worker: ExportWorkerLike = { onmessage: null, onerror: null, postMessage: (message) => { posted.push(message); }, terminate: () => undefined };
    const reply = (response: GtfsExportWorkerResponse) => worker.onmessage?.({ data: response } as MessageEvent<GtfsExportWorkerResponse>);
    return { worker, posted, reply };
  }
  const ready = { ready: true, refusals: [], warnings: [] };

  it('keeps one check in flight and lets the newest replace a waiting older one', async () => {
    const { worker, posted, reply } = fakeWorker();
    const engine = createGtfsExportEngine(() => worker);
    const first = engine.check(request());
    const second = engine.check(request({ routeIds: [] }));
    const third = engine.check(request({ blockingScenarioId: undefined }));
    await expect(second).resolves.toBeUndefined();
    expect(posted).toHaveLength(1);
    reply({ id: posted[0].id, type: 'checked', check: ready });
    await expect(first).resolves.toEqual(ready);
    await new Promise((resolve) => setTimeout(resolve));
    expect(posted).toHaveLength(2);
    expect((posted[1] as { request: GtfsExportRequest }).request.blockingScenarioId).toBeUndefined();
    reply({ id: posted[1].id, type: 'checked', check: { ...ready, settingsProblem: 'x' } });
    await expect(third).resolves.toMatchObject({ settingsProblem: 'x' });
  });

  it('fails what is waiting when the worker reports an error', async () => {
    const { worker, posted, reply } = fakeWorker();
    const engine = createGtfsExportEngine(() => worker);
    const loading = engine.load(miniRecords());
    reply({ id: posted[0].id, type: 'error', message: 'broken' });
    await expect(loading).rejects.toThrow('broken');
  });

  it('falls back to the main thread with the loaded records after the worker crashes', async () => {
    const { worker, posted, reply } = fakeWorker();
    const engine = createGtfsExportEngine(() => worker);
    const loading = engine.load(miniRecords());
    reply({ id: posted[0].id, type: 'loaded' });
    await loading;
    worker.onerror?.({ message: 'crashed' } as ErrorEvent);
    await expect(engine.check(request())).resolves.toMatchObject({ ready: true });
    engine.dispose();
  });

  it('runs on the main thread when the browser has no worker', async () => {
    const engine = createGtfsExportEngine(() => undefined);
    await engine.load(miniRecords());
    await expect(engine.check(request())).resolves.toMatchObject({ ready: true });
    const built = await engine.build(miniRecords(), request());
    expect(built.files.length).toBeGreaterThan(0);
    engine.dispose();
  });
});
