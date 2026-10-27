// Review package P03 (issues I-004, I-005; decision 4; decision C8): Scenario duplication remaps every reference, and Scenarios
// already duplicated by the older code are repaired by the Dexie version 7 upgrade. Real IndexedDB, Federal BRT golden project.
import { expect, test, type Page } from '@playwright/test';
import { duplicateScenario, snapshotForScenario } from '../../src/domain/project';
import { goldenRaw } from './support/goldenFixture';
import { SETUP } from './support/dexieEnv';

test.setTimeout(120000);

const STAMP = '2026-10-22T00:00:00.000Z';

/** The golden project plus a second Trip Profile and a Blocking Scenario on it: Copy Trip Profile, then New Blocking Scenario. */
function goldenWithAltBlocking(): any {
  const backup = goldenRaw();
  const scenarioId = backup.scenarios[0].id;
  const weekday = backup.serviceDays.find((day: any) => day.kind === 'weekday').id;
  backup.tripProfiles.push({ id: 'alt-profile', scenarioId, name: 'Alt', createdAt: STAMP, updatedAt: STAMP });
  backup.trips.push(...backup.trips.filter((trip: any) => trip.serviceDayId === weekday).map((trip: any) => ({ ...trip, id: `alt-${trip.id}`, tripProfileId: 'alt-profile' })));
  backup.blockingScenarios.push({ id: 'alt-blocking', scenarioId, tripProfileId: 'alt-profile', name: 'Alt Blocks', createdAt: STAMP, updatedAt: STAMP });
  backup.blocks.push(...backup.blocks.filter((block: any) => block.serviceDayId === weekday).map((block: any) => ({
    ...block,
    id: `alt-${block.id}`,
    blockingScenarioId: 'alt-blocking',
    activities: block.activities.map((activity: any) => ({ ...activity, id: `alt-${activity.id}`, ...(activity.type === 'revenueTrip' ? { tripId: `alt-${activity.tripId}` } : {}) })),
  })));
  return { ...backup, generationSets: backup.generationSets ?? [] };
}

test('Scenario duplication with Blocking Scenarios on two Trip Profiles succeeds on IndexedDB and in memory', async ({ page }) => {
  await page.goto('/src/styles.css');
  const result = await page.evaluate(async ({ SETUP, snapshot }) => {
    const env = await new Function(SETUP)();
    const dexie = env.make('p03-duplicate');
    const memory = env.makeMemory();
    const out: Record<string, any> = {};
    try {
      for (const [name, target] of [['dexie', dexie], ['memory', memory]] as const) {
        await target.repository.saveProjectSnapshot(snapshot);
        const records = await target.repository.getScenarioRecords(snapshot.scenarios[0].id);
        let error: string | undefined; let copy: any;
        try { copy = await target.service.duplicateScenario(records, 'Copy'); } catch (caught) { error = (caught as Error).message; }
        const stored = copy ? await target.repository.getScenarioRecords(copy.scenario.id) : undefined;
        out[name] = {
          error,
          blocks: stored?.blocks.length,
          blocksWithTripProfile: stored?.blocks.filter((block: any) => block.blockingScenarioId && block.tripProfileId).length,
          sourceBlocks: records.blocks.length,
        };
      }
    } finally { dexie.db.close(); }
    return out;
  }, { SETUP, snapshot: goldenWithAltBlocking() });
  for (const name of ['dexie', 'memory']) {
    expect(result[name].error, name).toBeUndefined();
    expect(result[name].blocksWithTripProfile, name).toBe(0);
    expect(result[name].blocks, name).toBe(result[name].sourceBlocks);
  }
});

/** The golden project with a Scenario copy as the code before P03 made it: the copy's pull-out, deadhead, and pull-in Nodes are the source's. */
function seedWithLeakyCopy(options: { removeSource?: boolean } = {}) {
  const snapshot = { ...goldenRaw(), generationSets: [] as any[] };
  const source = snapshotForScenario(snapshot, snapshot.scenarios[0].id)!;
  const copy = duplicateScenario(source, 'Copy');
  const toSource = new Map(copy.nodes.map((node, index) => [node.id, source.nodes[index].id]));
  const leaky = copy.blocks.map((block) => ({
    ...block,
    activities: block.activities.map((activity: any) => {
      if (activity.type === 'revenueTrip') return activity;
      const next = { ...activity };
      for (const end of ['fromNodeId', 'toNodeId']) if (next[end]) next[end] = toSource.get(next[end]) ?? next[end];
      return next;
    }),
  }));
  const scenarioRows: Record<string, any[]> = {
    scenarios: [copy.scenario], serviceDays: copy.serviceDays, routes: copy.routes, nodes: copy.nodes, patterns: copy.patterns,
    directions: copy.directions ?? [], runtimeProfiles: copy.runtimeProfiles, runtimeAssignments: copy.runtimeAssignments,
    tripProfiles: copy.tripProfiles ?? [], blockingScenarios: copy.blockingScenarios ?? [], generationSets: copy.generationSets,
    trips: copy.trips, blocks: leaky,
  };
  const sourceRows: Record<string, any[]> = {
    scenarios: snapshot.scenarios, serviceDays: snapshot.serviceDays, routes: snapshot.routes, nodes: snapshot.nodes, patterns: snapshot.patterns,
    directions: snapshot.directions ?? [], runtimeProfiles: snapshot.runtimeProfiles, runtimeAssignments: snapshot.runtimeAssignments,
    tripProfiles: snapshot.tripProfiles ?? [], blockingScenarios: snapshot.blockingScenarios ?? [], generationSets: snapshot.generationSets,
    trips: snapshot.trips, blocks: snapshot.blocks,
  };
  const rows: Record<string, any[]> = { projects: [snapshot.project] };
  for (const table of Object.keys(scenarioRows)) rows[table] = [...(options.removeSource ? [] : sourceRows[table]), ...scenarioRows[table]];
  return { rows, copyScenarioId: copy.scenario.id, sourceScenarioId: snapshot.scenarios[0].id, copyNodeIds: copy.nodes.map((node) => node.id), sourceNodeIds: source.nodes.map((node) => node.id), correctCopyBlocks: copy.blocks, projectId: snapshot.project.id };
}

/** Schema of Dexie version 6, declared as one version so an older database can be created without the app's migrations. */
const VERSION_6_STORES = `{
  projects: 'id,name,updatedAt', scenarios: 'id,projectId,[projectId+name],updatedAt', serviceDays: 'id,scenarioId,[scenarioId+kind],sequence',
  routes: 'id,scenarioId,[scenarioId+name],updatedAt', nodes: 'id,scenarioId,routeId,[routeId+name]', patterns: 'id,scenarioId,routeId,[routeId+name]',
  directions: 'id,scenarioId,routeId,[routeId+name]', runtimeProfiles: 'id,scenarioId,routeId,patternId',
  runtimeAssignments: 'id,scenarioId,patternId,runtimeProfileId,[patternId+serviceDayId]', generationSets: 'id,scenarioId,routeId,serviceDayId,patternId',
  tripProfiles: 'id,scenarioId,[scenarioId+name],updatedAt',
  trips: 'id,scenarioId,tripProfileId,routeId,serviceDayId,patternId,[tripProfileId+routeId],[tripProfileId+serviceDayId],provenance.generationSetId,provenance.runtimeProfileId',
  blocks: 'id,scenarioId,blockingScenarioId,serviceDayId,[blockingScenarioId+serviceDayId],[serviceDayId+label]',
  blockingScenarios: 'id,scenarioId,tripProfileId,[scenarioId+name],[tripProfileId+name],updatedAt', costingAssumptions: 'id,scenarioId',
  tripRegenerationUndo: 'id,scenarioId,tripProfileId', costPlans: 'id,scenarioId,[scenarioId+name]', appMetadata: 'key'
}`;

/** Creates a version 6 database holding `rows`, then opens it with the current schema and reads the result. */
async function upgradeFromVersion6(page: Page, name: string, rows: Record<string, any[]>, options: { readOnly?: boolean } = {}) {
  await page.goto('/src/styles.css');
  return page.evaluate(async ({ SETUP, name, rows, stores, readOnly }) => {
    const env = await new Function(SETUP)();
    const old = new env.Dexie(name);
    old.version(6).stores(new Function(`return ${stores}`)());
    await old.open();
    for (const [table, values] of Object.entries(rows)) await old.table(table).bulkPut(values);
    old.close();
    let upgraded: any;
    if (readOnly) {
      // A read-only tab must still run the upgrade; its ordinary writes stay rejected.
      const guard = { assertWritable() { throw new Error('This tab is read-only.'); }, markReadOnly() {} };
      const db = new env.TransitDatabase(name, guard);
      await db.open();
      let ordinaryWrite = 'accepted';
      try { await db.projects.put({ id: 'x', name: 'x' }); } catch (error) { ordinaryWrite = (error as Error).message; }
      const tables: Record<string, any[]> = {};
      for (const table of ['nodes', 'blocks']) tables[table] = await db.table(table).toArray();
      upgraded = { version: db.verno, tables, ordinaryWrite };
      db.close();
    } else {
      const e = env.make(name);
      const tables: Record<string, any[]> = {};
      for (const table of e.db.tables) tables[table.name] = await table.toArray();
      upgraded = { version: e.db.verno, tables };
      e.db.close();
    }
    return upgraded;
  }, { SETUP, name, rows, stores: VERSION_6_STORES, readOnly: options.readOnly ?? false });
}

const nodeReferenceIds = (blocks: any[]) => blocks.flatMap((block) => block.activities.flatMap((activity: any) => (activity.type === 'revenueTrip' ? [] : ['fromNodeId', 'toNodeId'].flatMap((end) => (activity[end] ? [activity[end] as string] : [])))));

test('the version 7 upgrade repairs a Scenario that was duplicated with 138 references to its source', async ({ page }) => {
  const seed = seedWithLeakyCopy();
  const sourceNodeIds = new Set(seed.sourceNodeIds);
  const leakedBefore = nodeReferenceIds(seed.rows.blocks.filter((block) => block.scenarioId === seed.copyScenarioId)).filter((id) => sourceNodeIds.has(id));
  expect(leakedBefore).toHaveLength(138);

  const result = await upgradeFromVersion6(page, 'p03-upgrade', seed.rows);

  expect(result.version).toBe(9);
  const copyBlocks = result.tables.blocks.filter((block: any) => block.scenarioId === seed.copyScenarioId);
  expect(nodeReferenceIds(copyBlocks).filter((id) => sourceNodeIds.has(id))).toHaveLength(0);
  expect(new Set(nodeReferenceIds(copyBlocks)).size).toBeGreaterThan(0);
  expect(nodeReferenceIds(copyBlocks).every((id) => new Set(seed.copyNodeIds).has(id))).toBe(true);
  // The repaired copy equals a correctly made copy, and no other table changed.
  expect([...copyBlocks].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...seed.correctCopyBlocks].sort((a, b) => a.id.localeCompare(b.id)));
  for (const table of Object.keys(seed.rows)) {
    if (table === 'blocks') continue;
    expect([...result.tables[table]].sort((a: any, b: any) => a.id.localeCompare(b.id))).toEqual([...seed.rows[table]].sort((a, b) => a.id.localeCompare(b.id)));
  }
  expect(result.tables.blocks.filter((block: any) => block.scenarioId !== seed.copyScenarioId).sort((a: any, b: any) => a.id.localeCompare(b.id)))
    .toEqual(seed.rows.blocks.filter((block) => block.scenarioId !== seed.copyScenarioId).sort((a, b) => a.id.localeCompare(b.id)));
});

test('the version 7 upgrade infers the Nodes of a copy whose source Scenario was deleted', async ({ page }) => {
  const seed = seedWithLeakyCopy({ removeSource: true });
  const result = await upgradeFromVersion6(page, 'p03-upgrade-orphan', seed.rows);
  const copyNodeIds = new Set(seed.copyNodeIds);
  expect(result.version).toBe(9);
  expect(result.tables.blocks).toHaveLength(seed.correctCopyBlocks.length);
  expect(nodeReferenceIds(result.tables.blocks).every((id) => copyNodeIds.has(id))).toBe(true);
  expect([...result.tables.blocks].sort((a: any, b: any) => a.id.localeCompare(b.id))).toEqual([...seed.correctCopyBlocks].sort((a, b) => a.id.localeCompare(b.id)));
});

test('a read-only tab still runs the version 7 upgrade, and its ordinary writes stay rejected', async ({ page }) => {
  const seed = seedWithLeakyCopy();
  const result = await upgradeFromVersion6(page, 'p03-upgrade-readonly', seed.rows, { readOnly: true });
  const sourceNodeIds = new Set(seed.sourceNodeIds);
  expect(result.version).toBe(9);
  expect(nodeReferenceIds(result.tables.blocks.filter((block: any) => block.scenarioId === seed.copyScenarioId)).filter((id) => sourceNodeIds.has(id))).toHaveLength(0);
  expect(result.ordinaryWrite).toContain('read-only');
});
