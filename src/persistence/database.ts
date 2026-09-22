import Dexie, { type Table } from 'dexie';
import type { DatabaseRecordMap } from '../domain/types';
import { metadata, newId } from '../domain/ids';
export class TransitDatabase extends Dexie {
  projects!: Table<DatabaseRecordMap['projects'], string>; scenarios!: Table<DatabaseRecordMap['scenarios'], string>; serviceDays!: Table<DatabaseRecordMap['serviceDays'], string>; routes!: Table<DatabaseRecordMap['routes'], string>; nodes!: Table<DatabaseRecordMap['nodes'], string>; patterns!: Table<DatabaseRecordMap['patterns'], string>; directions!: Table<DatabaseRecordMap['directions'], string>; runtimeProfiles!: Table<DatabaseRecordMap['runtimeProfiles'], string>; runtimeAssignments!: Table<DatabaseRecordMap['runtimeAssignments'], string>; generationSets!: Table<DatabaseRecordMap['generationSets'], string>; tripProfiles!: Table<DatabaseRecordMap['tripProfiles'], string>; blockingScenarios!: Table<DatabaseRecordMap['blockingScenarios'], string>; trips!: Table<DatabaseRecordMap['trips'], string>; blocks!: Table<DatabaseRecordMap['blocks'], string>; costPlans!: Table<DatabaseRecordMap['costPlans'], string>; appMetadata!: Table<DatabaseRecordMap['appMetadata'], string>;
  constructor(name = 'transit-costing-tool') {
    super(name);
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
  }
}
