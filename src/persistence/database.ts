import Dexie, { type Table } from 'dexie';
import type { DatabaseRecordMap } from '../domain/types';
import { metadata, newId } from '../domain/ids';
import { recoverScenarioCopyNodeReferences } from '../domain/scenarioCopyRecovery';
import { unifyRouteRuntimeCalculationMethods } from '../domain/runtime';
import type { WriteGuard } from './tabGuard';
export class TransitDatabase extends Dexie {
  projects!: Table<DatabaseRecordMap['projects'], string>; scenarios!: Table<DatabaseRecordMap['scenarios'], string>; serviceDays!: Table<DatabaseRecordMap['serviceDays'], string>; routes!: Table<DatabaseRecordMap['routes'], string>; nodes!: Table<DatabaseRecordMap['nodes'], string>; patterns!: Table<DatabaseRecordMap['patterns'], string>; directions!: Table<DatabaseRecordMap['directions'], string>; runtimeProfiles!: Table<DatabaseRecordMap['runtimeProfiles'], string>; runtimeAssignments!: Table<DatabaseRecordMap['runtimeAssignments'], string>; generationSets!: Table<DatabaseRecordMap['generationSets'], string>; tripProfiles!: Table<DatabaseRecordMap['tripProfiles'], string>; blockingScenarios!: Table<DatabaseRecordMap['blockingScenarios'], string>; trips!: Table<DatabaseRecordMap['trips'], string>; tripRegenerationUndo!: Table<DatabaseRecordMap['tripRegenerationUndo'], string>; blocks!: Table<DatabaseRecordMap['blocks'], string>; costingAssumptions!: Table<DatabaseRecordMap['costingAssumptions'], string>; /** @deprecated Kept untyped and unused so the upgrade does not discard any data in the preliminary table. */ costPlans!: Table<Record<string, unknown>, string>; appMetadata!: Table<DatabaseRecordMap['appMetadata'], string>;
  /**
   * With a `guard`, every write to every table is checked against it, and a database upgrade in another tab closes this
   * connection and leaves the tab read-only (Decision 0037). Without one, the database behaves as before.
   */
  constructor(name = 'transit-costing-tool', guard?: WriteGuard) {
    super(name);
    if (guard) this.installWriteGuard(guard);
    this.version(1).stores({ projects: 'id,name,updatedAt', scenarios: 'id,projectId,[projectId+name],updatedAt', serviceDays: 'id,scenarioId,[scenarioId+kind],sequence', routes: 'id,scenarioId,[scenarioId+name],updatedAt', nodes: 'id,scenarioId,routeId,[routeId+name]', patterns: 'id,scenarioId,routeId,[routeId+name]', directions: 'id,scenarioId,routeId,[routeId+name]', runtimeProfiles: 'id,scenarioId,routeId,patternId', runtimeAssignments: 'id,scenarioId,patternId,[patternId+serviceDayId]', generationSets: 'id,scenarioId,routeId,serviceDayId,patternId', trips: 'id,scenarioId,routeId,serviceDayId,patternId,provenance.generationSetId,provenance.runtimeProfileId', blocks: 'id,scenarioId,serviceDayId,[serviceDayId+label]', costPlans: 'id,scenarioId,[scenarioId+name]', appMetadata: 'key' });
    // Version 2 adds the lookup required by runtime-profile lifecycle commands.
    // Existing version 1 databases are upgraded automatically by Dexie.
    this.version(2).stores({ runtimeAssignments: 'id,scenarioId,patternId,runtimeProfileId,[patternId+serviceDayId]' });
    this.version(3).stores({
      tripProfiles: 'id,scenarioId,[scenarioId+name],updatedAt',
      trips: 'id,scenarioId,tripProfileId,routeId,serviceDayId,patternId,[tripProfileId+routeId],[tripProfileId+serviceDayId],provenance.generationSetId,provenance.runtimeProfileId',
      blocks: 'id,scenarioId,tripProfileId,serviceDayId,[tripProfileId+serviceDayId],[serviceDayId+label]',
    }).upgrade(async (tx) => {
      const scenarios = await tx.table('scenarios').toArray();
      for (const scenario of scenarios) {
        const profile = { id: newId(), scenarioId: scenario.id, name: 'Default', ...metadata() };
        await tx.table('tripProfiles').add(profile);
        const trips = await tx.table('trips').where('scenarioId').equals(scenario.id).toArray();
        for (const trip of trips) await tx.table('trips').put({ ...trip, tripProfileId: profile.id });
        const blocks = await tx.table('blocks').where('scenarioId').equals(scenario.id).toArray();
        for (const block of blocks) await tx.table('blocks').put({ ...block, tripProfileId: profile.id });
      }
    });
    // Version 4 introduces normalized Blocking Scenario ownership. Existing
    // Phase 3 placeholder Blocks are intentionally discarded; Trips and Trip
    // Profiles remain authoritative and are not touched by this migration.
    this.version(4).stores({
      blockingScenarios: 'id,scenarioId,tripProfileId,[scenarioId+name],[tripProfileId+name],updatedAt',
      blocks: 'id,scenarioId,blockingScenarioId,serviceDayId,[blockingScenarioId+serviceDayId],[serviceDayId+label]',
    }).upgrade(async (tx) => {
      await tx.table('blocks').clear();
    });
    // Version 5 adds Scenario-owned assumptions. Records are created lazily
    // when a user first saves costing inputs; no rate is inferred for old data.
    this.version(5).stores({ costingAssumptions: 'id,scenarioId' });
    // Version 6 adds one local, one-step undo record for trip regeneration.
    // It is operational state and is intentionally excluded from project backups.
    this.version(6).stores({ tripRegenerationUndo: 'id,scenarioId,tripProfileId' });
    // Version 7 changes no store. It repairs Scenarios that were duplicated before duplication remapped the Node references of
    // pull-out, deadhead, and pull-in activities (Decision 0038). It writes only Blocks of Scenario copies, once, and runs in
    // whichever tab opens the database first, including a read-only one (the write guard lets upgrades through).
    this.version(7).stores({}).upgrade(async (tx) => {
      const scenarios = await tx.table('scenarios').toArray();
      if (!scenarios.some((scenario) => scenario.sourceScenarioId)) return;
      const [routes, nodes, patterns, trips, blocks] = await Promise.all(['routes', 'nodes', 'patterns', 'trips', 'blocks'].map((name) => tx.table(name).toArray()));
      let recovery: ReturnType<typeof recoverScenarioCopyNodeReferences>;
      try {
        recovery = recoverScenarioCopyNodeReferences({ scenarios, routes, nodes, patterns, trips, blocks });
      } catch (error) {
        // A repair that cannot run must not stop the database from opening; the Scenarios stay as they were.
        console.warn('Scenario copy recovery was skipped.', error);
        return;
      }
      if (recovery.changedBlockIds.length) {
        const changed = new Set(recovery.changedBlockIds);
        await tx.table('blocks').bulkPut(recovery.blocks.filter((block) => changed.has(block.id)));
      }
    });
    // Version 8 adds the compound index `[scenarioId+tripProfileId]` to `trips` (every earlier index stays), so the Trips of one Trip
    // Profile are read without loading the Scenario's other Trips, and deletes the placeholder Blocks that imports of version 3 and 4
    // backup files stored without a Blocking Scenario before package P04. A Block that belongs to a Blocking Scenario always has
    // `blockingScenarioId`. Nothing else is written, and a failure leaves the data as it was (as in version 7).
    this.version(8).stores({
      trips: 'id,scenarioId,tripProfileId,routeId,serviceDayId,patternId,[tripProfileId+routeId],[tripProfileId+serviceDayId],provenance.generationSetId,provenance.runtimeProfileId,[scenarioId+tripProfileId]',
    }).upgrade(async (tx) => {
      try {
        const blocks: Array<{ id: string; blockingScenarioId?: string | null }> = await tx.table('blocks').toArray();
        const placeholderIds = blocks.filter((block) => !block.blockingScenarioId).map((block) => block.id);
        if (placeholderIds.length) await tx.table('blocks').bulkDelete(placeholderIds);
      } catch (error) {
        console.warn('Placeholder Block clean-up was skipped.', error);
      }
    });
    // Version 9 changes no store. Every Runtime profile of a Route now uses one calculation method (Decision 0045): a Route whose profiles
    // disagree takes the method most of them use (a tie goes to segment start). Only profiles whose method changes are written; each gets
    // the next calculation revision, so its Trips show as having changed runtimes. Trip times are not rewritten. A failure leaves the
    // data as it was (as in version 7).
    this.version(9).stores({}).upgrade(async (tx) => {
      try {
        const profiles = await tx.table('runtimeProfiles').toArray();
        const unified = unifyRouteRuntimeCalculationMethods(profiles, new Date().toISOString());
        if (unified.changedProfileIds.length) {
          const changed = new Set(unified.changedProfileIds);
          await tx.table('runtimeProfiles').bulkPut(unified.profiles.filter((profile) => changed.has(profile.id)));
        }
      } catch (error) {
        console.warn('Runtime calculation method unification was skipped.', error);
      }
    });
  }

  private installWriteGuard(guard: WriteGuard): void {
    this.use({
      stack: 'dbcore',
      name: 'tabWriteGuard',
      create: (down) => ({
        ...down,
        table: (tableName) => {
          const table = down.table(tableName);
          return {
            ...table,
            mutate: (request) => {
              // A schema upgrade is not a user edit and must run in whichever tab opens the database first.
              const upgrading = (request.trans as unknown as { mode?: string }).mode === 'versionchange';
              if (!upgrading) {
                try { guard.assertWritable(); } catch (error) { return Dexie.Promise.reject(error); }
              }
              return table.mutate(request);
            },
          };
        },
      }),
    });
    // A newer version of the app in another tab needs to upgrade the database: close this connection so the upgrade can run.
    this.on('versionchange', () => {
      guard.markReadOnly('databaseUpgraded');
      this.close({ disableAutoOpen: true });
      return false;
    });
  }
}
