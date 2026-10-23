import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteDefinitionService } from '../application/routeDefinitionService';
import { duplicateScenario, projectSnapshotWithScenario, snapshotForScenario } from '../domain/project';
import type { RuntimeCopyPreview, TripCopyPreview } from '../domain/serviceDayCopy';
import type { CostingAssumptions, ProjectSnapshot, Trip, TripGenerationSet, TripRegenerationUndo } from '../domain/types';
import { asSnapshot, goldenWithAltBlocking } from '../testSupport/goldenBackup';
import { ProjectBackupService } from './backupRepository';
import { TransitDatabase } from './database';
import { DexieRouteDefinitionRepository } from './dexieRepository';
import { InMemoryRouteDefinitionRepository } from './inMemoryRepository';

// One contract, two implementations (review findings A-002 and 3-013; parity table in phase-3.md Section 7). Every test runs
// against the in-memory repository that most unit tests use and against the Dexie repository on a real IndexedDB
// implementation (fake-indexeddb), so a difference between them fails here instead of in the browser.
//
// The public methods of the Dexie repository are the contract. The assignment below makes the compiler check that the
// in-memory repository offers every one of them.
type Repository = Omit<DexieRouteDefinitionRepository, 'db'>;

const SCENARIO_OWNED = ['serviceDays', 'routes', 'nodes', 'patterns', 'directions', 'runtimeProfiles', 'runtimeAssignments', 'tripProfiles', 'blockingScenarios', 'costingAssumptions', 'generationSets', 'trips', 'blocks'] as const;

interface Harness {
  repository: Repository;
  /** The IndexedDB handle, present for the Dexie implementation only. */
  db?: TransitDatabase;
  /** Number of stored records of each Scenario-owned kind that belong to one Scenario, read below the repository interface. */
  ownedCounts(scenarioId: string): Promise<Record<string, number>>;
  close(): Promise<void>;
}

let databaseCounter = 0;
const implementations: { name: string; create(): Promise<Harness> }[] = [
  {
    name: 'in-memory',
    create: async () => {
      const memory = new InMemoryRouteDefinitionRepository();
      const repository: Repository = memory;
      return {
        repository,
        ownedCounts: async (scenarioId) => Object.fromEntries(SCENARIO_OWNED.map((kind) => [kind, [...memory[kind].values()].filter((record) => record.scenarioId === scenarioId).length])),
        close: async () => {},
      };
    },
  },
  {
    name: 'Dexie',
    create: async () => {
      const name = `transit-costing-contract-${Date.now()}-${databaseCounter += 1}`;
      const db = new TransitDatabase(name);
      await db.open();
      return {
        repository: new DexieRouteDefinitionRepository(db),
        db,
        ownedCounts: async (scenarioId) => Object.fromEntries(await Promise.all(SCENARIO_OWNED.map(async (kind) => [kind, (await db.table(kind).toArray()).filter((record) => record.scenarioId === scenarioId).length] as const))),
        close: async () => { db.close(); await Dexie.delete(name); },
      };
    },
  },
];

const byId = (left: { id: string }, right: { id: string }) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
const expectKeyOrder = (rows: { id: string }[]) => { const ids = rows.map((row) => row.id); expect(ids.length).toBeGreaterThan(1); expect(ids).toEqual([...ids].sort()); };

/**
 * The Federal BRT project with a second Trip Profile ("Alt") and a second Blocking Scenario on it, cut down to four Blocks
 * per Blocking Scenario with the Trips they use, plus the first few Trips of every day and profile. fake-indexeddb is a
 * pure-JavaScript store whose overwrites slow down sharply with row count, so the full 1,100-Trip project makes one
 * Scenario write take seconds. All the structure (Nodes, Patterns, Runtime profiles and assignments, Directions) is kept.
 */
function fixture() {
  const backup = goldenWithAltBlocking();
  const scenarioId = backup.scenarios[0].id;
  const weekday = backup.serviceDays.find((day: any) => day.kind === 'weekday').id;
  const defaultBlockingId = backup.blockingScenarios.find((candidate: any) => candidate.name !== 'Alt Blocks').id;
  const sourceBlocks = backup.blocks.filter((block: any) => block.blockingScenarioId === defaultBlockingId && block.serviceDayId === weekday).slice(0, 4);
  const blocks = backup.blocks.filter((block: any) => sourceBlocks.some((source: any) => block.id === source.id || block.id === `alt-${source.id}`));
  const tripIds = new Set<string>(blocks.flatMap((block: any) => block.activities.filter((activity: any) => activity.type === 'revenueTrip').map((activity: any) => activity.tripId)));
  const perDay = new Map<string, number>();
  for (const trip of backup.trips) {
    const key = `${trip.tripProfileId}:${trip.serviceDayId}`;
    if ((perDay.get(key) ?? 0) < 5) { perDay.set(key, (perDay.get(key) ?? 0) + 1); tripIds.add(trip.id); }
  }
  const { format: _format, exportSchemaVersion: _version, exportedAt: _exportedAt, ...records } = backup;
  const snapshot = asSnapshot({ ...records, trips: backup.trips.filter((trip: any) => tripIds.has(trip.id)), blocks });
  const defaultProfile = snapshot.tripProfiles!.find((profile) => profile.name === 'Default')!;
  const altProfile = snapshot.tripProfiles!.find((profile) => profile.name === 'Alt')!;
  const trip = snapshot.trips.find((candidate) => candidate.tripProfileId === defaultProfile.id && candidate.serviceDayId === weekday)!;
  const assignment = snapshot.runtimeAssignments[0];
  return { snapshot, scenarioId, weekday, defaultProfile, altProfile, trip, assignment };
}

const undoFor = (scenarioId: string, before: Trip[], after: Trip[]): TripRegenerationUndo => ({ id: 'last', scenarioId, tripProfileId: before[0].tripProfileId!, createdAt: '2026-10-22T00:00:00.000Z', beforeTrips: before, afterTrips: after });
const relabel = (trip: Trip, publicLabel: string): Trip => ({ ...trip, publicLabel });

describe.each(implementations)('repository contract: $name', ({ create }) => {
  let harness: Harness;
  let repository: Repository;
  beforeEach(async () => { harness = await create(); repository = harness.repository; });
  afterEach(async () => { await harness.close(); });

  describe('reads', () => {
    it('lists the same stored data through every read method', async () => {
      const { snapshot, scenarioId, weekday, defaultProfile, altProfile } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      expect((await repository.listProjects()).map((project) => project.id)).toEqual([snapshot.project.id]);
      expect(await repository.getProject(snapshot.project.id)).toEqual(snapshot.project);
      expect((await repository.listScenarios(snapshot.project.id)).map((scenario) => scenario.id)).toEqual([scenarioId]);
      expect((await repository.listTripProfiles(scenarioId)).map((profile) => profile.name).sort()).toEqual(['Alt', 'Default']);
      const records = (await repository.getScenarioRecords(scenarioId))!;
      expect(Object.keys(records).sort()).toEqual(['blockingScenarios', 'blocks', 'directions', 'generationSets', 'nodes', 'patterns', 'routes', 'runtimeAssignments', 'runtimeProfiles', 'scenario', 'serviceDays', 'tripProfiles', 'trips']);
      const dayTrips = snapshot.trips.filter((trip) => trip.serviceDayId === weekday);
      expect((await repository.listTrips(weekday)).length).toBe(dayTrips.length);
      expect((await repository.listTrips(weekday, altProfile.id)).length).toBe(dayTrips.filter((trip) => trip.tripProfileId === altProfile.id).length);
      expect((await repository.listTrips(weekday, defaultProfile.id)).length).toBe(dayTrips.filter((trip) => trip.tripProfileId === defaultProfile.id).length);
      expect((await repository.listTripsForProfile(altProfile.id)).length).toBe(snapshot.trips.filter((trip) => trip.tripProfileId === altProfile.id).length);
      expect((await repository.listBlocks(weekday)).length).toBe(snapshot.blocks.filter((block) => block.serviceDayId === weekday).length);
      const altBlockingId = snapshot.blockingScenarios!.find((candidate) => candidate.tripProfileId === altProfile.id)!.id;
      expect((await repository.listBlocksForProfile(altProfile.id)).length).toBe(snapshot.blocks.filter((block) => block.blockingScenarioId === altBlockingId).length);
      expect(await repository.getCostingAssumptions(scenarioId)).toBeUndefined();
    });

    it('returns rows in primary-key order, like IndexedDB', async () => {
      const { snapshot, scenarioId, weekday } = fixture();
      // The seed is not in key order, so insertion order and key order differ.
      expect(snapshot.trips.map((trip) => trip.id)).not.toEqual(snapshot.trips.map((trip) => trip.id).sort());
      await repository.saveProjectSnapshot(snapshot);
      const routeId = snapshot.routes[0].id;
      expectKeyOrder(await repository.listTrips(weekday));
      expectKeyOrder(await repository.listRuntimeProfiles(routeId));
      expectKeyOrder(await repository.listRuntimeAssignments(scenarioId));
      expectKeyOrder(await repository.listTripProfiles(scenarioId));
      expectKeyOrder(await repository.listBlocks(weekday));
      expectKeyOrder(await repository.listTripsForProfile(snapshot.tripProfiles![0].id));
      const records = (await repository.getScenarioRecords(scenarioId))!;
      for (const rows of [records.nodes, records.patterns, records.runtimeProfiles, records.runtimeAssignments, records.tripProfiles!, records.blockingScenarios!, records.trips, records.blocks]) expectKeyOrder(rows);
      const stored = (await repository.getProjectSnapshot(snapshot.project.id))!;
      for (const rows of [stored.nodes, stored.patterns, stored.runtimeProfiles, stored.trips, stored.blocks]) expectKeyOrder(rows);
    });

    it('round-trips a project snapshot', async () => {
      const { snapshot } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const required = new Set(['scenarios', 'serviceDays', 'routes', 'nodes', 'patterns', 'runtimeProfiles', 'runtimeAssignments', 'generationSets', 'trips', 'blocks']);
      const normalize = (value: ProjectSnapshot) => Object.fromEntries(Object.entries(value).filter(([key, rows]) => !Array.isArray(rows) || rows.length || required.has(key)).map(([key, rows]) => [key, Array.isArray(rows) ? [...rows].sort(byId) : rows]));
      expect(normalize((await repository.getProjectSnapshot(snapshot.project.id))!)).toEqual(normalize(snapshot));
    });

    it('exports a JSON backup at schema 6 and restores it unchanged (Dexie version 8 changes no backup format)', async () => {
      const { snapshot } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (value) => repository.saveProjectSnapshot(value));
      const payload = await backup.exportProject(snapshot.project.id);
      expect(JSON.parse(payload).exportSchemaVersion).toBe(6);
      const before = JSON.stringify((await repository.getProjectSnapshot(snapshot.project.id))!, (_key, value) => Array.isArray(value) && value.every((row) => row && typeof row === 'object' && 'id' in row) ? [...value].sort(byId) : value);
      await backup.importProject(payload, 'replace');
      expect(JSON.stringify((await repository.getProjectSnapshot(snapshot.project.id))!, (_key, value) => Array.isArray(value) && value.every((row) => row && typeof row === 'object' && 'id' in row) ? [...value].sort(byId) : value)).toBe(before);
      // A copy import is a second, independent project with the same number of Trips.
      const copy = await backup.importProject(payload, 'copy');
      expect(copy.id).not.toBe(snapshot.project.id);
      expect((await repository.getProjectSnapshot(copy.id))!.trips).toHaveLength(snapshot.trips.length);
    });

    it('reads and writes a Route definition, and removes the Patterns and Directions a write no longer contains', async () => {
      const { snapshot } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const routeId = snapshot.routes[0].id;
      const aggregate = (await repository.getRouteDefinition(routeId))!;
      expect(aggregate.route.id).toBe(routeId);
      expect(aggregate.patterns).toHaveLength(snapshot.patterns.length);
      expect(aggregate.directions).toHaveLength(2);
      expect(await repository.listDirections(routeId)).toEqual(aggregate.directions);
      expect(await repository.getPattern(aggregate.patterns[0].id)).toEqual(aggregate.patterns[0]);
      expect(await repository.getRouteDefinition('missing')).toBeUndefined();
      const kept = aggregate.patterns.slice(1);
      await repository.saveRouteDefinition({ ...aggregate, patterns: kept, directions: aggregate.directions!.slice(0, 1) });
      expect((await repository.getRouteDefinition(routeId))!.patterns.map((pattern) => pattern.id).sort()).toEqual(kept.map((pattern) => pattern.id).sort());
      expect(await repository.getPattern(aggregate.patterns[0].id)).toBeUndefined();
      expect(await repository.listDirections(routeId)).toHaveLength(1);
    });

    it('omits directions from Scenario records when the Scenario has none', async () => {
      const { snapshot, scenarioId } = fixture();
      await repository.saveProjectSnapshot({ ...snapshot, directions: [] });
      expect('directions' in (await repository.getScenarioRecords(scenarioId))!).toBe(false);
      expect('directions' in (await repository.getProjectSnapshot(snapshot.project.id))!).toBe(false);
    });
  });

  describe('Trip Profile reads and the historical generation-set methods', () => {
    it('lists the Trips of one Trip Profile of one Scenario, in key order, and nothing for another Scenario or profile', async () => {
      const { snapshot, scenarioId, defaultProfile, altProfile } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      for (const profile of [defaultProfile, altProfile]) {
        const expected = snapshot.trips.filter((trip) => trip.scenarioId === scenarioId && trip.tripProfileId === profile.id).map((trip) => trip.id).sort();
        expect(expected.length).toBeGreaterThan(1);
        expect((await repository.listTripsForScenarioProfile(scenarioId, profile.id)).map((trip) => trip.id)).toEqual(expected);
      }
      expect(await repository.listTripsForScenarioProfile('another-scenario', defaultProfile.id)).toEqual([]);
      expect(await repository.listTripsForScenarioProfile(scenarioId, 'another-profile')).toEqual([]);
    });

    it('saves, reads, and filters generation sets (old backups still carry them, decision 13)', async () => {
      const { snapshot, scenarioId, weekday } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const route = snapshot.routes[0];
      const [patternA, patternB] = snapshot.patterns;
      const stamp = '2026-10-22T00:00:00.000Z';
      const set = (id: string, patternId: string, serviceDayId = weekday): TripGenerationSet => ({ id, scenarioId, routeId: route.id, serviceDayId, patternId, name: id, firstDeparture: 21600, headwaySeconds: 600, limit: { mode: 'tripCount', tripCount: 3 }, generationRevision: 0, createdAt: stamp, updatedAt: stamp });
      const otherDay = snapshot.serviceDays.find((day) => day.id !== weekday)!.id;
      await repository.saveGenerationSet(set('set-b', patternB.id));
      await repository.saveGenerationSet(set('set-a', patternA.id));
      await repository.saveGenerationSet(set('set-other-day', patternA.id, otherDay));
      expect(await repository.getGenerationSet('set-a')).toEqual(set('set-a', patternA.id));
      expect(await repository.getGenerationSet('missing')).toBeUndefined();
      expect((await repository.listGenerationSets(weekday)).map((item) => item.id)).toEqual(['set-a', 'set-b']);
      expect((await repository.listGenerationSets(weekday, route.id, patternA.id)).map((item) => item.id)).toEqual(['set-a']);
      expect(await repository.listGenerationSets(weekday, 'another-route')).toEqual([]);
      expect((await repository.listGenerationSets(otherDay)).map((item) => item.id)).toEqual(['set-other-day']);
      // Saving again with the same id replaces the set.
      await repository.saveGenerationSet({ ...set('set-a', patternA.id), name: 'renamed' });
      expect((await repository.getGenerationSet('set-a'))!.name).toBe('renamed');
      expect(await repository.listGenerationSets(weekday)).toHaveLength(2);
    });
  });

  describe('Scenario deletion and cascades', () => {
    async function seedTwoScenarios() {
      const { snapshot, scenarioId } = fixture();
      const copy = duplicateScenario(snapshotForScenario(snapshot, scenarioId)!, 'Copy');
      const two = projectSnapshotWithScenario(snapshot, copy);
      await repository.saveProjectSnapshot(two);
      return { two, sourceId: scenarioId, copyId: copy.scenario.id };
    }

    it('deleting a Scenario through the application removes every record it owned and keeps the other Scenario', async () => {
      const { sourceId, copyId } = await seedTwoScenarios();
      const before = await harness.ownedCounts(copyId);
      expect((await harness.ownedCounts(sourceId)).trips).toBeGreaterThan(0);
      const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
      const service = new RouteDefinitionService(repository, backup);
      await service.deleteScenario(sourceId, (await service.getScenarioDeletionImpact(sourceId)).reviewToken);
      expect(await harness.ownedCounts(sourceId)).toEqual(Object.fromEntries(SCENARIO_OWNED.map((kind) => [kind, 0])));
      expect(await harness.ownedCounts(copyId)).toEqual(before);
      expect(await repository.getScenarioRecords(sourceId)).toBeUndefined();
      expect((await repository.getScenarioRecords(copyId))!.serviceDays).toHaveLength(4);
    });

    it('saving a snapshot without a Scenario removes its service days, routes, nodes, and Trips', async () => {
      const { two, sourceId } = await seedTwoScenarios();
      const keep = (owner: { scenarioId: string }) => owner.scenarioId !== sourceId;
      const removedRouteIds = new Set(two.routes.filter((route) => !keep(route)).map((route) => route.id));
      await repository.saveProjectSnapshot({
        ...two,
        scenarios: two.scenarios.filter((scenario) => scenario.id !== sourceId),
        serviceDays: two.serviceDays.filter(keep),
        routes: two.routes.filter(keep),
        nodes: two.nodes.filter((node) => !removedRouteIds.has(node.routeId)),
        patterns: two.patterns.filter((pattern) => !removedRouteIds.has(pattern.routeId)),
        directions: (two.directions ?? []).filter((direction) => !removedRouteIds.has(direction.routeId)),
        runtimeProfiles: two.runtimeProfiles.filter((profile) => !removedRouteIds.has(profile.routeId)),
        runtimeAssignments: two.runtimeAssignments.filter(keep),
        tripProfiles: two.tripProfiles!.filter(keep),
        blockingScenarios: two.blockingScenarios!.filter(keep),
        generationSets: two.generationSets.filter(keep),
        trips: two.trips.filter(keep),
        blocks: two.blocks.filter(keep),
      });
      expect(await harness.ownedCounts(sourceId)).toEqual(Object.fromEntries(SCENARIO_OWNED.map((kind) => [kind, 0])));
    });

    it('deleting a Project removes everything it owned and rejects a Project that does not exist', async () => {
      const { snapshot, scenarioId } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      await repository.deleteProject(snapshot.project.id);
      expect(await repository.getProject(snapshot.project.id)).toBeUndefined();
      expect(await harness.ownedCounts(scenarioId)).toEqual(Object.fromEntries(SCENARIO_OWNED.map((kind) => [kind, 0])));
      await expect(repository.deleteProject('missing')).rejects.toThrow('Project not found.');
    });

    it('deleting a Project removes the regeneration undo of its Scenarios', async () => {
      const { snapshot, scenarioId, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      await repository.saveRegeneratedTripsWithUndo([trip], [relabel(trip, 'after')], undoFor(scenarioId, [trip], [relabel(trip, 'after')]));
      expect(await repository.getLastTripRegenerationUndo()).toBeDefined();
      await repository.deleteProject(snapshot.project.id);
      expect(await repository.getLastTripRegenerationUndo()).toBeUndefined();
    });
  });

  describe('Scenario record writes', () => {
    it('removes the records a write no longer contains and keeps the rest', async () => {
      const { snapshot, scenarioId, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const records = (await repository.getScenarioRecords(scenarioId))!;
      await repository.saveScenarioRecords({ ...records, trips: records.trips.filter((candidate) => candidate.id !== trip.id), scenario: { ...records.scenario, name: 'Renamed' } });
      expect(await repository.getTrip(trip.id)).toBeUndefined();
      expect((await repository.getScenarioRecords(scenarioId))!.scenario.name).toBe('Renamed');
      expect((await repository.getScenarioRecords(scenarioId))!.trips).toHaveLength(records.trips.length - 1);
    });

    it('updateScenarioRecords reads stored data, writes only a changed result, and rejects a missing Scenario', async () => {
      const { snapshot, scenarioId, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      await repository.saveTrips([relabel(trip, 'saved after the caller read')]);
      const result = await repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, scenario: { ...current.scenario, name: 'Renamed' } }));
      expect(result.trips.find((candidate) => candidate.id === trip.id)?.publicLabel).toBe('saved after the caller read');
      expect((await repository.getTrip(trip.id))?.publicLabel).toBe('saved after the caller read');
      const untouched = vi.fn((current: Awaited<ReturnType<Repository['updateScenarioRecords']>>) => current);
      await repository.updateScenarioRecords(scenarioId, untouched);
      expect(untouched).toHaveBeenCalledTimes(1);
      await expect(repository.updateScenarioRecords('missing', (current) => current)).rejects.toThrow('Scenario not found.');
    });

    it('overlapping updateScenarioRecords calls run one after the other, so none loses another\'s write (P09)', async () => {
      const { snapshot, scenarioId } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const original = snapshot.scenarios[0].name;
      const append = (suffix: string) => repository.updateScenarioRecords(scenarioId, (current) => ({ ...current, scenario: { ...current.scenario, name: `${current.scenario.name}${suffix}` } }));
      await Promise.all([append('+a'), append('+b'), append('+c')]);
      const name = (await repository.getScenarioRecords(scenarioId))!.scenario.name;
      expect(name.startsWith(original)).toBe(true);
      expect([...name.slice(original.length).matchAll(/\+[abc]/g)].map((match) => match[0]).sort()).toEqual(['+a', '+b', '+c']);
    });

    it('a write rejected for costing ownership leaves the regeneration undo in place', async () => {
      const { snapshot, scenarioId, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const assumptions = (id: string): CostingAssumptions => ({ id, scenarioId, currencyCode: 'USD', enteredRate: 100, rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: 0.03, createdAt: '2026-10-22T00:00:00.000Z', updatedAt: '2026-10-22T00:00:00.000Z' });
      await repository.saveCostingAssumptions(assumptions('first'));
      await repository.saveRegeneratedTripsWithUndo([trip], [relabel(trip, 'after')], undoFor(scenarioId, [trip], [relabel(trip, 'after')]));
      const records = (await repository.getScenarioRecords(scenarioId))!;
      // The Trip edit would invalidate the undo, but the write is rejected before it can happen.
      await expect(repository.saveScenarioRecords({ ...records, costingAssumptions: assumptions('second'), trips: records.trips.map((candidate) => candidate.id === trip.id ? relabel(candidate, 'changed') : candidate) }))
        .rejects.toThrow('Scenario already has a different costing assumptions record.');
      expect(await repository.getLastTripRegenerationUndo()).toBeDefined();
      expect((await repository.getTrip(trip.id))?.publicLabel).toBe('after');
    });
  });

  describe('Trip writes', () => {
    it('rejects a regeneration whose before-state is stale and stores nothing', async () => {
      const { snapshot, scenarioId, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const stale = relabel(trip, 'stale');
      await expect(repository.saveRegeneratedTripsWithUndo([stale], [relabel(trip, 'after')], undoFor(scenarioId, [stale], [relabel(trip, 'after')]))).rejects.toThrow('A selected Trip changed. Review regeneration again.');
      expect(await repository.getTrip(trip.id)).toEqual(trip);
      expect(await repository.getLastTripRegenerationUndo()).toBeUndefined();
      await expect(repository.restoreLastTripRegenerationUndo()).rejects.toThrow('There is no regeneration to undo.');
    });

    it('rejects a regeneration whose before-state Trip no longer exists', async () => {
      const { snapshot, scenarioId, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      await repository.deleteTripsAtomically([trip.id]);
      await expect(repository.saveRegeneratedTripsWithUndo([trip], [relabel(trip, 'after')], undoFor(scenarioId, [trip], [relabel(trip, 'after')]))).rejects.toThrow('A selected Trip changed. Review regeneration again.');
      expect(await repository.getTrip(trip.id)).toBeUndefined();
    });

    it('applies a regeneration, undoes it once, and refuses to undo after a later edit', async () => {
      const { snapshot, scenarioId, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const after = relabel(trip, 'after');
      await repository.saveRegeneratedTripsWithUndo([trip], [after], undoFor(scenarioId, [trip], [after]));
      expect((await repository.getTrip(trip.id))?.publicLabel).toBe('after');
      expect(await repository.restoreLastTripRegenerationUndo()).toEqual([trip]);
      expect(await repository.getTrip(trip.id)).toEqual(trip);
      expect(await repository.getLastTripRegenerationUndo()).toBeUndefined();

      await repository.saveRegeneratedTripsWithUndo([trip], [after], undoFor(scenarioId, [trip], [after]));
      await repository.saveTrips([relabel(trip, 'edited later')]);
      expect(await repository.getLastTripRegenerationUndo()).toBeUndefined();
      await expect(repository.restoreLastTripRegenerationUndo()).rejects.toThrow('There is no regeneration to undo.');
    });

    it('inserting a Trip with an existing id rejects and stores none of the batch', async () => {
      const { snapshot, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const existing = snapshot.trips.find((candidate) => candidate.id !== trip.id)!;
      // The two implementations word this error differently (Dexie reports its bulk-write failure); they agree that it rejects.
      await expect(repository.insertTripsAtomically([{ ...trip, id: 'new-first' }, existing])).rejects.toThrow();
      expect(await repository.getTrip('new-first')).toBeUndefined();
      await repository.insertTripsAtomically([{ ...trip, id: 'new-first' }]);
      expect(await repository.getTrip('new-first')).toBeDefined();
    });

    it('inserting a Trip for a missing or foreign Trip profile rejects with the same message', async () => {
      const { snapshot, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      await expect(repository.insertTripsAtomically([{ ...trip, id: 'orphan', tripProfileId: 'missing' }])).rejects.toThrow('The selected Trip profile is no longer available.');
      await expect(repository.insertTripsAtomically([{ ...trip, id: 'foreign', scenarioId: 'another-scenario' }])).rejects.toThrow('The selected Trip profile is no longer available.');
      expect(await repository.getTrip('orphan')).toBeUndefined();
      expect(await repository.getTrip('foreign')).toBeUndefined();
    });

    it('saves Trip changes and Blocks together and deletes Trips with the Block activities that used them', async () => {
      const { snapshot, scenarioId, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const block = snapshot.blocks.find((candidate) => candidate.activities.some((activity) => activity.type === 'revenueTrip'))!;
      const usedTripId = (block.activities.find((activity) => activity.type === 'revenueTrip') as { tripId: string }).tripId;
      const usedTrip = snapshot.trips.find((candidate) => candidate.id === usedTripId)!;
      await repository.saveTripChangesAtomically([relabel(usedTrip, 'changed')], [{ ...block, label: 'Renamed block' }]);
      expect((await repository.getTrip(usedTripId))?.publicLabel).toBe('changed');
      expect((await repository.listBlocks(block.serviceDayId)).find((candidate) => candidate.id === block.id)?.label).toBe('Renamed block');

      const after = relabel(trip, 'after');
      await repository.saveRegeneratedTripsWithUndo([trip], [after], undoFor(scenarioId, [trip], [after]));
      await repository.deleteTripsAtomically([usedTripId, trip.id], [{ ...block, activities: block.activities.filter((activity) => !(activity.type === 'revenueTrip' && activity.tripId === usedTripId)) }]);
      expect(await repository.getTrip(usedTripId)).toBeUndefined();
      expect(await repository.getTrip(trip.id)).toBeUndefined();
      expect((await repository.listBlocks(block.serviceDayId)).find((candidate) => candidate.id === block.id)?.activities.some((activity) => activity.type === 'revenueTrip' && activity.tripId === usedTripId)).toBe(false);
      expect(await repository.getLastTripRegenerationUndo()).toBeUndefined();
    });

    it('replaces the Trips of a day and rejects a copy that reuses a Trip identifier without writing', async () => {
      const { snapshot, weekday, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const removed = snapshot.trips.filter((candidate) => candidate.serviceDayId === weekday && candidate.tripProfileId === trip.tripProfileId).map((candidate) => candidate.id);
      const preview = (copiedTrips: Trip[]) => ({ copiedTrips, removedTripIds: removed, adjustedBlocks: [] }) as unknown as TripCopyPreview;
      await expect(repository.replaceTripsForDayAtomically(preview([{ ...trip, id: snapshot.trips.find((candidate) => !removed.includes(candidate.id))!.id }]))).rejects.toThrow('Trip copy generated a duplicate Trip identifier.');
      expect(await repository.getTrip(removed[0])).toBeDefined();
      await repository.replaceTripsForDayAtomically(preview([{ ...trip, id: 'copied-1' }, { ...trip, id: 'copied-2' }]));
      expect(await repository.getTrip(removed[0])).toBeUndefined();
      expect(await repository.getTrip('copied-2')).toBeDefined();
    });
  });

  describe('Runtime profiles and assignments', () => {
    it('rejects a second assignment for the same Pattern and day with the same message', async () => {
      const { snapshot, assignment } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      await expect(repository.saveRuntimeAssignment({ ...assignment, id: 'duplicate' })).rejects.toThrow(`Duplicate runtime assignment for ${assignment.patternId}:${assignment.serviceDayId}`);
    });

    it('rejects an assignment to a missing profile with a message that names the missing record, not a TypeError', async () => {
      const { snapshot, assignment } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      // The assignment keeps its own id and key, so the duplicate-assignment check does not answer first.
      const error = await repository.saveRuntimeAssignment({ ...assignment, runtimeProfileId: 'missing' }).then(() => undefined, (reason: unknown) => reason);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(TypeError);
      expect((error as Error).message).toBe(`Runtime assignment ${assignment.id} references a missing record`);
    });

    it('will not delete a profile that is still assigned, and moves the assignments to a replacement when asked', async () => {
      const { snapshot, assignment } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      await expect(repository.deleteRuntimeProfile(assignment.runtimeProfileId)).rejects.toThrow('Runtime profile is still assigned.');
      expect(await repository.getRuntimeProfile(assignment.runtimeProfileId)).toBeDefined();
      const replacement = snapshot.runtimeProfiles.find((profile) => profile.patternId === assignment.patternId && profile.id !== assignment.runtimeProfileId)!;
      await repository.deleteRuntimeProfile(assignment.runtimeProfileId, replacement.id);
      expect(await repository.getRuntimeProfile(assignment.runtimeProfileId)).toBeUndefined();
      expect((await repository.listRuntimeAssignments(assignment.scenarioId, assignment.serviceDayId, assignment.patternId))[0].runtimeProfileId).toBe(replacement.id);
    });

    it('commits a Runtime copy atomically and rejects a duplicate identifier without writing', async () => {
      const { snapshot, scenarioId, assignment } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const source = snapshot.runtimeProfiles.find((profile) => profile.id === assignment.runtimeProfileId)!;
      const day = snapshot.serviceDays.find((candidate) => candidate.id === assignment.serviceDayId)!;
      const otherDay = snapshot.serviceDays.find((candidate) => candidate.id !== day.id && !snapshot.runtimeAssignments.some((existing) => existing.patternId === assignment.patternId && existing.serviceDayId === candidate.id))
        ?? snapshot.serviceDays.find((candidate) => candidate.id !== day.id)!;
      const copy = { ...source, id: 'copied-profile', name: 'Copied profile' };
      const replaced = snapshot.runtimeAssignments.filter((existing) => existing.patternId === assignment.patternId && existing.serviceDayId === otherDay.id).map((existing) => existing.id);
      const copiedAssignment = { ...assignment, id: 'copied-assignment', serviceDayId: otherDay.id, runtimeProfileId: copy.id };
      const preview = (profile: typeof copy) => ({ request: { scenarioId }, profiles: [profile], assignments: [{ ...copiedAssignment, runtimeProfileId: profile.id }], replaceAssignmentIds: replaced }) as unknown as RuntimeCopyPreview;
      await expect(repository.commitRuntimeCopyAtomically(preview({ ...copy, id: source.id }))).rejects.toThrow('Runtime copy generated a duplicate profile identifier.');
      expect(await repository.getRuntimeProfile('copied-profile')).toBeUndefined();
      await repository.commitRuntimeCopyAtomically(preview(copy));
      expect(await repository.getRuntimeProfile('copied-profile')).toBeDefined();
      expect((await repository.listRuntimeAssignments(scenarioId, otherDay.id, assignment.patternId)).map((candidate) => candidate.id)).toEqual(['copied-assignment']);
    });
  });

  describe('Trip profiles', () => {
    it('rejects a name that collides with another profile of the Scenario, in either save path, with the same message', async () => {
      const { snapshot, scenarioId, altProfile, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const stamp = '2026-10-22T00:00:00.000Z';
      await expect(repository.saveTripProfile({ id: 'np', scenarioId, name: ` ${altProfile.name.toUpperCase()} `, createdAt: stamp, updatedAt: stamp })).rejects.toThrow('A Trip profile with this name already exists.');
      await expect(repository.copyTripProfileAtomically({ id: 'np2', scenarioId, name: ` ${altProfile.name.toLowerCase()} `, createdAt: stamp, updatedAt: stamp }, [{ ...trip, id: 'np2-trip', tripProfileId: 'np2' }])).rejects.toThrow('A Trip profile with this name already exists.');
      expect(await repository.getTripProfile('np2')).toBeUndefined();
      expect(await repository.getTrip('np2-trip')).toBeUndefined();
      await expect(repository.saveTripProfile({ id: 'np3', scenarioId, name: '   ', createdAt: stamp, updatedAt: stamp })).rejects.toThrow('Enter a trip profile name.');
    });

    it('copies a profile with its Trips in one write and rejects the whole copy when a Trip already exists', async () => {
      const { snapshot, scenarioId, trip } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      const stamp = '2026-10-22T00:00:00.000Z';
      const profile = { id: 'copied', scenarioId, name: 'Copied', createdAt: stamp, updatedAt: stamp };
      await expect(repository.copyTripProfileAtomically(profile, [{ ...trip, id: 'copied-trip', tripProfileId: 'copied' }, trip])).rejects.toThrow();
      expect(await repository.getTripProfile('copied')).toBeUndefined();
      expect(await repository.getTrip('copied-trip')).toBeUndefined();
      await repository.copyTripProfileAtomically(profile, [{ ...trip, id: 'copied-trip', tripProfileId: 'copied' }]);
      expect(await repository.getTripProfile('copied')).toBeDefined();
      expect(await repository.getTrip('copied-trip')).toBeDefined();
    });

    it('deleting a profile removes its Trips, its Blocking Scenarios, and their Blocks, and keeps the other profile', async () => {
      const { snapshot, altProfile, defaultProfile } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      await repository.deleteTripProfile(altProfile.id);
      expect(await repository.getTripProfile(altProfile.id)).toBeUndefined();
      expect(await repository.listTripsForProfile(altProfile.id)).toEqual([]);
      expect(await repository.listBlocksForProfile(altProfile.id)).toEqual([]);
      expect((await repository.listTripsForProfile(defaultProfile.id)).length).toBe(snapshot.trips.filter((trip) => trip.tripProfileId === defaultProfile.id).length);
      expect((await repository.listBlocksForProfile(defaultProfile.id)).length).toBeGreaterThan(0);
    });
  });

  describe('Costing assumptions', () => {
    const stamp = '2026-10-22T00:00:00.000Z';
    const assumptions = (id: string, scenarioId: string, enteredRate = 100): CostingAssumptions => ({ id, scenarioId, currencyCode: 'USD', enteredRate, rateYear: 2025, sourceType: 'user', baseServiceYear: 2025, futureYearCount: 0, annualEscalation: 0.03, createdAt: stamp, updatedAt: stamp });

    it('keeps one record per Scenario and rejects a second record, a missing Scenario, and invalid values', async () => {
      const { snapshot, scenarioId } = fixture();
      await repository.saveProjectSnapshot(snapshot);
      await repository.saveCostingAssumptions(assumptions('first', scenarioId));
      await repository.saveCostingAssumptions(assumptions('first', scenarioId, 120));
      expect((await repository.getCostingAssumptions(scenarioId))?.enteredRate).toBe(120);
      await expect(repository.saveCostingAssumptions(assumptions('second', scenarioId))).rejects.toThrow('Scenario already has a different costing assumptions record.');
      await expect(repository.saveCostingAssumptions(assumptions('orphan', 'missing'))).rejects.toThrow('Costing assumptions reference a missing Scenario.');
      await expect(repository.saveCostingAssumptions(assumptions('negative', scenarioId, -1))).rejects.toThrow(/Invalid costing assumptions/);
    });
  });
});

describe('Dexie repository: behavior the in-memory repository has no counterpart for', () => {
  let harness: Harness;
  let db: TransitDatabase;
  beforeEach(async () => {
    harness = await implementations[1].create();
    db = harness.db!;
  });
  afterEach(async () => { vi.restoreAllMocks(); await harness.close(); });

  const counts = async () => Object.fromEntries(await Promise.all(db.tables.map(async (table) => [table.name, await table.count()] as const)));

  it('deleting a Project also removes the rows of the unused costPlans table', async () => {
    const { snapshot, scenarioId } = fixture();
    await harness.repository.saveProjectSnapshot(snapshot);
    await db.costPlans.put({ id: 'legacy', scenarioId, name: 'Legacy draft' });
    await harness.repository.deleteProject(snapshot.project.id);
    expect(await db.costPlans.count()).toBe(0);
  });

  it('a failed Scenario write rolls every table back', async () => {
    const { snapshot, scenarioId, trip } = fixture();
    await harness.repository.saveProjectSnapshot(snapshot);
    const records = (await harness.repository.getScenarioRecords(scenarioId))!;
    const before = await counts();
    vi.spyOn(db.blocks, 'bulkPut').mockRejectedValue(new Error('injected failure'));
    await expect(harness.repository.saveScenarioRecords({ ...records, scenario: { ...records.scenario, name: 'Changed' }, trips: records.trips.filter((candidate) => candidate.id !== trip.id) })).rejects.toThrow('injected failure');
    expect(await counts()).toEqual(before);
    expect((await harness.repository.getScenarioRecords(scenarioId))!.scenario.name).toBe(records.scenario.name);
    expect(await harness.repository.getTrip(trip.id)).toBeDefined();
  });

  it('a failed regeneration write rolls the Trips back', async () => {
    const { snapshot, scenarioId, trip } = fixture();
    await harness.repository.saveProjectSnapshot(snapshot);
    vi.spyOn(db.tripRegenerationUndo, 'put').mockRejectedValue(new Error('injected failure'));
    await expect(harness.repository.saveRegeneratedTripsWithUndo([trip], [relabel(trip, 'after')], undoFor(scenarioId, [trip], [relabel(trip, 'after')]))).rejects.toThrow('injected failure');
    expect(await harness.repository.getTrip(trip.id)).toEqual(trip);
    expect(await db.tripRegenerationUndo.count()).toBe(0);
  });

  it('a failed Trip deletion rolls the Block write back', async () => {
    const { snapshot } = fixture();
    await harness.repository.saveProjectSnapshot(snapshot);
    const block = snapshot.blocks[0];
    const before = await counts();
    vi.spyOn(db.blocks, 'bulkPut').mockRejectedValue(new Error('injected failure'));
    await expect(harness.repository.deleteTripsAtomically([snapshot.trips[0].id], [{ ...block, label: 'Changed' }])).rejects.toThrow('injected failure');
    expect(await counts()).toEqual(before);
    expect(await harness.repository.getTrip(snapshot.trips[0].id)).toBeDefined();
  });
});
