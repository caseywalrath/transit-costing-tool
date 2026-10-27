import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { TransitDatabase } from './database';

describe('application database schema', () => {
  it('includes scenario assumptions and local regeneration undo', () => {
    const db = new TransitDatabase('transit-costing-schema-contract');
    expect(db.verno).toBe(9);
    expect(db.tables.map((table) => table.name)).toContain('costingAssumptions');
    expect(db.tables.map((table) => table.name)).toContain('tripRegenerationUndo');
    expect(db.tables.map((table) => table.name)).toContain('costPlans');
    db.close();
  });
});

// The store definitions of every released schema version, copied from the history in `database.ts`. A seeded database is
// written by Dexie itself, so the stored IndexedDB version is the Dexie version times ten, exactly as in a user's browser.
const HISTORY: Record<string, string>[] = [
  { projects: 'id,name,updatedAt', scenarios: 'id,projectId,[projectId+name],updatedAt', serviceDays: 'id,scenarioId,[scenarioId+kind],sequence', routes: 'id,scenarioId,[scenarioId+name],updatedAt', nodes: 'id,scenarioId,routeId,[routeId+name]', patterns: 'id,scenarioId,routeId,[routeId+name]', directions: 'id,scenarioId,routeId,[routeId+name]', runtimeProfiles: 'id,scenarioId,routeId,patternId', runtimeAssignments: 'id,scenarioId,patternId,[patternId+serviceDayId]', generationSets: 'id,scenarioId,routeId,serviceDayId,patternId', trips: 'id,scenarioId,routeId,serviceDayId,patternId,provenance.generationSetId,provenance.runtimeProfileId', blocks: 'id,scenarioId,serviceDayId,[serviceDayId+label]', costPlans: 'id,scenarioId,[scenarioId+name]', appMetadata: 'key' },
  { runtimeAssignments: 'id,scenarioId,patternId,runtimeProfileId,[patternId+serviceDayId]' },
  { tripProfiles: 'id,scenarioId,[scenarioId+name],updatedAt', trips: 'id,scenarioId,tripProfileId,routeId,serviceDayId,patternId,[tripProfileId+routeId],[tripProfileId+serviceDayId],provenance.generationSetId,provenance.runtimeProfileId', blocks: 'id,scenarioId,tripProfileId,serviceDayId,[tripProfileId+serviceDayId],[serviceDayId+label]' },
  { blockingScenarios: 'id,scenarioId,tripProfileId,[scenarioId+name],[tripProfileId+name],updatedAt', blocks: 'id,scenarioId,blockingScenarioId,serviceDayId,[blockingScenarioId+serviceDayId],[serviceDayId+label]' },
  { costingAssumptions: 'id,scenarioId' },
  { tripRegenerationUndo: 'id,scenarioId,tripProfileId' },
  {},
  { trips: 'id,scenarioId,tripProfileId,routeId,serviceDayId,patternId,[tripProfileId+routeId],[tripProfileId+serviceDayId],provenance.generationSetId,provenance.runtimeProfileId,[scenarioId+tripProfileId]' },
];

const stamp = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const SCENARIOS = ['s1', 's2'];

/** Seeds two Scenarios as the app stored them at `seedVersion`: placeholder Blocks before version 4, normalized Blocks after. */
async function seed(name: string, seedVersion: number) {
  const legacy = new Dexie(name);
  for (let version = 1; version <= seedVersion; version += 1) legacy.version(version).stores(HISTORY[version - 1]);
  await legacy.open();
  const table = (tableName: string) => legacy.table(tableName);
  await table('projects').put({ id: 'p', name: 'P', distanceUnit: 'miles', currencyCode: 'USD', ...stamp });
  for (const s of SCENARIOS) {
    await table('scenarios').put({ id: s, projectId: 'p', name: s, ...stamp });
    await table('serviceDays').put({ id: `${s}-wd`, scenarioId: s, kind: 'weekday', name: 'Weekday', annualServiceDays: 255, sequence: 0, ...stamp });
    await table('routes').put({ id: `${s}-r`, scenarioId: s, name: 'R', ...stamp });
    await table('nodes').bulkPut(['a', 'b'].map((node) => ({ id: `${s}-${node}`, scenarioId: s, routeId: `${s}-r`, name: node.toUpperCase(), kind: 'terminal', ...stamp })));
    await table('patterns').put({ id: `${s}-p`, scenarioId: s, routeId: `${s}-r`, name: 'A-B', points: [{ id: `${s}-pa`, nodeId: `${s}-a`, sequence: 0, cumulativeMiles: 0 }, { id: `${s}-pb`, nodeId: `${s}-b`, sequence: 1, cumulativeMiles: 2 }], ...stamp });
    await table('runtimeProfiles').put({ id: `${s}-rp`, scenarioId: s, routeId: `${s}-r`, patternId: `${s}-p`, name: 'Base', bands: [{ id: `${s}-band`, label: 'All', sequence: 0, startTime: 0, endTime: 100000, segmentRuntimeSeconds: [600] }], ...stamp });
    await table('runtimeAssignments').put({ id: `${s}-ra`, scenarioId: s, patternId: `${s}-p`, serviceDayId: `${s}-wd`, runtimeProfileId: `${s}-rp`, ...stamp });
    if (seedVersion >= 3) await table('tripProfiles').put({ id: `${s}-tp`, scenarioId: s, name: 'Default', ...stamp });
    await table('trips').bulkPut([0, 1].map((i) => ({ id: `${s}-t${i}`, scenarioId: s, routeId: `${s}-r`, serviceDayId: `${s}-wd`, patternId: `${s}-p`, ...(seedVersion >= 3 ? { tripProfileId: `${s}-tp` } : {}), stopTimes: [{ patternPointId: `${s}-pa`, sequence: 0, time: 21600 + i * 3600 }, { patternPointId: `${s}-pb`, sequence: 1, time: 22200 + i * 3600 }], provenance: { kind: 'manual', manuallyChangedFields: [] }, ...stamp })));
    if (seedVersion >= 4) {
      await table('blockingScenarios').put({ id: `${s}-bs`, scenarioId: s, tripProfileId: `${s}-tp`, name: 'Blocks', ...stamp });
      await table('blocks').put({ id: `${s}-blk`, scenarioId: s, blockingScenarioId: `${s}-bs`, serviceDayId: `${s}-wd`, label: '1', activities: [{ id: `${s}-act`, type: 'revenueTrip', sequence: 0, tripId: `${s}-t0` }], ...stamp });
    } else {
      await table('blocks').bulkPut([1, 2].map((i) => ({ id: `${s}-ph${i}`, scenarioId: s, serviceDayId: `${s}-wd`, ...(seedVersion === 3 ? { tripProfileId: `${s}-tp` } : {}), label: String(i), activities: [{ id: `${s}-pha${i}`, type: 'revenueTrip', sequence: 0, tripId: `${s}-t0` }], ...stamp })));
    }
    if (seedVersion >= 5) await table('costingAssumptions').put({ id: `${s}-ca`, scenarioId: s, currencyCode: 'USD', enteredRate: 100, rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: 0.03, ...stamp });
  }
  await table('generationSets').put({ id: 'g', scenarioId: 's1', routeId: 's1-r', serviceDayId: 's1-wd', patternId: 's1-p', name: 'G', firstDeparture: 0, headwaySeconds: 600, limit: { mode: 'tripCount', tripCount: 1 }, generationRevision: 0, ...stamp });
  await table('costPlans').put({ id: 'cp', scenarioId: 's1', name: 'Legacy draft' });
  await table('appMetadata').put({ key: 'k', value: 'v' });
  if (seedVersion >= 6) await table('tripRegenerationUndo').put({ id: 'last', scenarioId: 's1', tripProfileId: 's1-tp', createdAt: stamp.createdAt, beforeTrips: [], afterTrips: [] });
  const before: Record<string, number> = {};
  for (const stored of legacy.tables) before[stored.name] = await stored.count();
  const seededIdbVersion = (await indexedDB.databases()).find((database) => database.name === name)?.version;
  legacy.close();
  return { before, seededIdbVersion };
}

describe('database upgrades from every earlier schema version', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('upgrades a Dexie version %i database to version 9 and keeps every record', async (seedVersion) => {
    const name = `transit-costing-upgrade-v${seedVersion}-${Date.now()}`;
    const { before, seededIdbVersion } = await seed(name, seedVersion);
    expect(seededIdbVersion).toBe(seedVersion * 10);
    const db = new TransitDatabase(name);
    try {
      await db.open();
      const after: Record<string, number> = {};
      for (const table of db.tables) after[table.name] = await table.count();
      expect(db.verno).toBe(9);
      expect((await indexedDB.databases()).find((database) => database.name === name)?.version).toBe(90);

      // Scheduling records are untouched.
      for (const kept of ['projects', 'scenarios', 'serviceDays', 'routes', 'nodes', 'patterns', 'runtimeProfiles', 'runtimeAssignments', 'trips', 'generationSets', 'costPlans', 'appMetadata'] as const) expect(after[kept]).toBe(before[kept]);
      expect(after.trips).toBe(4);
      expect(JSON.stringify((await db.trips.get('s1-t1'))?.stopTimes)).toBe(JSON.stringify([{ patternPointId: 's1-pa', sequence: 0, time: 25200 }, { patternPointId: 's1-pb', sequence: 1, time: 25800 }]));
      expect(await db.costPlans.get('cp')).toEqual({ id: 'cp', scenarioId: 's1', name: 'Legacy draft' });

      // Version 3 gives every Scenario a Default Trip profile and stamps every Trip with it.
      const profiles = await db.tripProfiles.toArray();
      expect(Object.fromEntries(SCENARIOS.map((s) => [s, profiles.filter((profile) => profile.scenarioId === s).map((profile) => profile.name)]))).toEqual({ s1: ['Default'], s2: ['Default'] });
      const trips = await db.trips.toArray();
      expect(trips.every((trip) => profiles.some((profile) => profile.id === trip.tripProfileId && profile.scenarioId === trip.scenarioId))).toBe(true);

      // The indexes the later versions add are usable on the upgraded data.
      expect(await db.runtimeAssignments.where('runtimeProfileId').equals('s1-rp').count()).toBe(1);
      const s1Profile = profiles.find((profile) => profile.scenarioId === 's1')!;
      expect(await db.trips.where('[tripProfileId+serviceDayId]').equals([s1Profile.id, 's1-wd']).count()).toBe(2);
      expect(await db.trips.where('[scenarioId+tripProfileId]').equals(['s1', s1Profile.id]).count()).toBe(2);

      // Version 4 discards the placeholder Blocks of earlier versions and reports how many (Decision 0019 item 12).
      const discardedPlaceholderBlocks = before.blocks - after.blocks;
      expect(discardedPlaceholderBlocks).toBe(seedVersion >= 4 ? 0 : 4);
      console.info(`Dexie version ${seedVersion} upgrade: ${discardedPlaceholderBlocks} of ${before.blocks} Blocks discarded`);
      if (seedVersion >= 4) {
        expect(after.blocks).toBe(2);
        expect(after.blockingScenarios).toBe(2);
        expect(await db.blocks.where('blockingScenarioId').equals('s1-bs').count()).toBe(1);
      } else {
        expect(after.blocks).toBe(0);
        expect(after.blockingScenarios).toBe(0);
      }

      // Versions 5 and 6 add stores. Existing assumptions and the stored undo record are kept; new stores start empty.
      expect(after.costingAssumptions).toBe(seedVersion >= 5 ? 2 : 0);
      expect(after.tripRegenerationUndo).toBe(seedVersion >= 6 ? 1 : 0);
    } finally {
      db.close();
      await Dexie.delete(name);
    }
  });
});

describe('database version 8: Trip Profile index and placeholder Block clean-up', () => {
  const placeholder = (id: string, extra: Record<string, unknown> = {}) => ({ id, scenarioId: 's1', serviceDayId: 's1-wd', label: id, activities: [{ id: `${id}-act`, type: 'revenueTrip', sequence: 0, tripId: 's1-t0' }], ...extra, ...stamp });

  it('deletes Blocks without a Blocking Scenario, keeps every other record byte for byte, and makes the new index usable', async () => {
    const name = `transit-costing-upgrade-v8-${Date.now()}`;
    await seed(name, 7);
    // A version 7 database can hold placeholder Blocks that an import of a version 3 or 4 backup stored before package P04.
    const legacy = new Dexie(name);
    for (let version = 1; version <= 7; version += 1) legacy.version(version).stores(HISTORY[version - 1]);
    await legacy.open();
    await legacy.table('blocks').bulkPut([placeholder('ph-absent'), placeholder('ph-null', { blockingScenarioId: null }), placeholder('ph-empty', { blockingScenarioId: '' })]);
    const kept = await legacy.table('blocks').where('blockingScenarioId').anyOf(['s1-bs', 's2-bs']).toArray();
    const keptJson = JSON.stringify(kept.sort((a, b) => a.id.localeCompare(b.id)));
    const tripsJson = JSON.stringify((await legacy.table('trips').toArray()).sort((a, b) => a.id.localeCompare(b.id)));
    const counts: Record<string, number> = {};
    for (const table of legacy.tables) counts[table.name] = await table.count();
    legacy.close();
    expect(kept).toHaveLength(2);
    expect(counts.blocks).toBe(5);

    const db = new TransitDatabase(name);
    try {
      await db.open();
      expect(db.verno).toBe(9);
      expect((await db.blocks.toArray()).map((block) => block.id).sort()).toEqual(['s1-blk', 's2-blk']);
      expect(JSON.stringify((await db.blocks.toArray()).sort((a, b) => a.id.localeCompare(b.id)))).toBe(keptJson);
      expect(JSON.stringify((await db.trips.toArray()).sort((a, b) => a.id.localeCompare(b.id)))).toBe(tripsJson);
      for (const table of db.tables) if (table.name !== 'blocks') expect(await table.count()).toBe(counts[table.name]);

      // The index returns only the Trips of that Trip Profile of that Scenario.
      expect(db.trips.schema.indexes.map((index) => index.name)).toEqual(expect.arrayContaining(['tripProfileId', 'routeId', 'serviceDayId', 'patternId', '[tripProfileId+routeId]', '[tripProfileId+serviceDayId]', '[scenarioId+tripProfileId]']));
      expect((await db.trips.where('[scenarioId+tripProfileId]').equals(['s1', 's1-tp']).toArray()).map((trip) => trip.id).sort()).toEqual(['s1-t0', 's1-t1']);
      expect(await db.trips.where('[scenarioId+tripProfileId]').equals(['s1', 's2-tp']).count()).toBe(0);
    } finally {
      db.close();
      await Dexie.delete(name);
    }
  });

  it('version 9 gives every Runtime profile of a Route the method most of them use and raises the revision only of the changed ones', async () => {
    const name = `transit-costing-upgrade-v9-${Date.now()}`;
    await seed(name, 8);
    const legacy = new Dexie(name);
    for (let version = 1; version <= 8; version += 1) legacy.version(version).stores(HISTORY[version - 1]);
    await legacy.open();
    const base = await legacy.table('runtimeProfiles').get('s1-rp');
    // Route s1-r: two single-band profiles (one without a stored method) and one segment-start profile. Route s2-r keeps its one profile.
    await legacy.table('runtimeProfiles').bulkPut([{ ...base, id: 's1-rp2', calculationMethod: 'singleBand', calculationRevision: 1 }, { ...base, id: 's1-rp3', calculationMethod: 'segmentStart', calculationRevision: 4 }]);
    const tripsJson = JSON.stringify((await legacy.table('trips').toArray()).sort((a, b) => a.id.localeCompare(b.id)));
    legacy.close();

    const db = new TransitDatabase(name);
    try {
      await db.open();
      expect(db.verno).toBe(9);
      const profiles = Object.fromEntries((await db.runtimeProfiles.toArray()).map((profile) => [profile.id, [profile.calculationMethod, profile.calculationRevision]]));
      expect(profiles).toEqual({ 's1-rp': [undefined, undefined], 's1-rp2': ['singleBand', 1], 's1-rp3': ['singleBand', 5], 's2-rp': [undefined, undefined] });
      expect(JSON.stringify((await db.trips.toArray()).sort((a, b) => a.id.localeCompare(b.id)))).toBe(tripsJson);
    } finally {
      db.close();
      await Dexie.delete(name);
    }
  });

  it('opens a database that has no placeholder Block and changes no Block', async () => {
    const name = `transit-costing-upgrade-v8-clean-${Date.now()}`;
    await seed(name, 7);
    const db = new TransitDatabase(name);
    try {
      await db.open();
      expect(await db.blocks.count()).toBe(2);
    } finally {
      db.close();
      await Dexie.delete(name);
    }
  });
});
