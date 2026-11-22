// The application side of a GTFS export (Decision 0090; card E4): reads one Scenario's stored records, checks the planner's choices as they
// are edited, and writes the ZIP and the report. The building runs in a worker where the browser allows it (gtfsExportWorkerClient.ts). The
// only thing written to the Scenario is the remembered export settings (item 16).

import { createCsvArchive } from '../csvDownload';
import type { ScenarioRecords } from '../../domain/project';
import type { EntityId, Scenario } from '../../domain/types';
import type { RouteDefinitionRepository } from '../ports';
import { SaveStatusPublisher } from '../saveStatus';
import { exportContextOf, safeFileStem, type GtfsExportCheck, type GtfsExportContext, type GtfsExportRequest } from './gtfsExportBuild';
import { createGtfsExportEngine, type GtfsExportEngine } from './gtfsExportWorkerClient';

export type { GtfsExportCheck, GtfsExportContext, GtfsExportRequest, GtfsExportRouteInfo } from './gtfsExportBuild';

/** A written export, ready to download. */
export interface GtfsExportDone {
  zip: Blob;
  zipName: string;
  reportCsv: string;
  reportName: string;
  routeCount: number;
  tripCount: number;
  /** The Scenario as saved with the remembered settings, so the application can replace its copy. */
  scenario: Scenario;
}

export type GtfsExportOutcome = { status: 'done'; done: GtfsExportDone } | { status: 'refused'; check: GtfsExportCheck };

/** An open dialog's view of one Scenario: it checks choices without reading storage again. Close it when the dialog closes. */
export interface GtfsExportSession {
  context: GtfsExportContext;
  /** The check of one request, or undefined when a newer check replaced it. */
  check(request: GtfsExportRequest): Promise<GtfsExportCheck | undefined>;
  close(): void;
}

/** The calls the dialog makes. The application passes the one service. */
export interface GtfsExportCommands {
  open(scenarioId: EntityId): Promise<GtfsExportSession>;
  exportFeed(scenarioId: EntityId, request: GtfsExportRequest): Promise<GtfsExportOutcome>;
}

export class GtfsExportService implements GtfsExportCommands {
  constructor(
    private readonly repository: Pick<RouteDefinitionRepository, 'getScenarioRecords' | 'saveScenario'>,
    private readonly saveStatus: SaveStatusPublisher = new SaveStatusPublisher(),
    private readonly createEngine: () => GtfsExportEngine = () => createGtfsExportEngine(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private async records(scenarioId: EntityId): Promise<ScenarioRecords> {
    const records = await this.repository.getScenarioRecords(scenarioId);
    if (!records) throw new Error('The Scenario to export is no longer in this browser.');
    return records;
  }

  /** Reads the Scenario once and hands it to an engine; the session then checks choices without another read. */
  async open(scenarioId: EntityId): Promise<GtfsExportSession> {
    const records = await this.records(scenarioId);
    const engine = this.createEngine();
    try {
      await engine.load(records);
    } catch (error) {
      engine.dispose();
      throw error;
    }
    return { context: exportContextOf(records), check: (request) => engine.check(request), close: () => engine.dispose() };
  }

  /**
   * Reads the Scenario again, builds the feed, and (when nothing is refused) remembers the settings on the Scenario in one write and
   * returns the ZIP and the report. Nothing else in the Scenario changes.
   */
  async exportFeed(scenarioId: EntityId, request: GtfsExportRequest): Promise<GtfsExportOutcome> {
    const records = await this.records(scenarioId);
    const engine = this.createEngine();
    try {
      const built = await engine.build(records, request);
      if (!built.check.ready) return { status: 'refused', check: built.check };
      const scenario: Scenario = { ...records.scenario, gtfsExportSettings: request.settings, updatedAt: this.now() };
      await this.saveStatus.run(() => this.repository.saveScenario(scenario));
      const stem = safeFileStem(records.scenario.name);
      return {
        status: 'done',
        done: {
          zip: createCsvArchive(built.files.map((file) => ({ filename: file.name, contents: file.text }))),
          zipName: `${stem}-gtfs.zip`,
          reportCsv: built.reportCsv,
          reportName: `${stem}-gtfs-report.csv`,
          routeCount: built.check.counts?.routes ?? 0,
          tripCount: built.check.counts?.trips ?? 0,
          scenario,
        },
      };
    } finally {
      engine.dispose();
    }
  }
}
