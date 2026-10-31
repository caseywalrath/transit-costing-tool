import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { metadata } from '../domain/ids';
import type { BlockingScenario, RoutePattern, Trip, TripProfile } from '../domain/types';
import { ProjectBackupService } from '../persistence/backupRepository';
import { DexieBlockingRepository, InMemoryBlockingRepository } from '../persistence/blockingRepository';
import { TransitDatabase } from '../persistence/database';
import { DexieRouteDefinitionRepository } from '../persistence/dexieRepository';
import { InMemoryRouteDefinitionRepository } from '../persistence/inMemoryRepository';
import { BlockingApplicationService, BLOCKING_WRITE_METHODS } from './blockingService';
import { CostingApplicationService, COSTING_WRITE_METHODS } from './costingService';
import type { LocalDataProtection, LocalDataProtectionStore, SaveStatus } from './ports';
import { addTwoStopPattern } from '../testSupport/routeFixtures';
import { ROUTE_DEFINITION_WRITE_METHODS, RouteDefinitionService } from './routeDefinitionService';
import { isQuotaExceeded, LocalDataProtectionService, SaveStatusPublisher, STORAGE_FULL_MESSAGE, StorageFullError } from './saveStatus';
import { TRIP_GENERATION_WRITE_METHODS, TripGenerationService } from './tripGenerationService';

const at = '2026-10-23T09:00:00.000Z';
const quota = () => Object.assign(new Error('The current transaction exceeded its quota limitations.'), { name: 'QuotaExceededError' });
const record = (publisher: SaveStatusPublisher) => { const states: SaveStatus['state'][] = []; publisher.subscribeToSaveStatus((status) => states.push(status.state)); return states; };

describe('SaveStatusPublisher', () => {
  it('publishes saving, then saved with the time, around a write and returns its result', async () => {
    const publisher = new SaveStatusPublisher(() => at);
    const seen: SaveStatus[] = [];
    publisher.subscribeToSaveStatus((status) => seen.push(status));
    await expect(publisher.run(async () => 42)).resolves.toBe(42);
    expect(seen).toEqual([{ state: 'idle' }, { state: 'saving' }, { state: 'saved', updatedAt: at }]);
  });

  it('publishes the failure, rethrows the same error, and stays failed until a later write succeeds', async () => {
    const publisher = new SaveStatusPublisher(() => at);
    const failure = new Error('disk on fire');
    await expect(publisher.run(async () => { throw failure; })).rejects.toBe(failure);
    expect(publisher.getSaveStatus()).toEqual({ state: 'error', errorMessage: 'disk on fire' });
    await publisher.run(async () => undefined);
    expect(publisher.getSaveStatus()).toEqual({ state: 'saved', updatedAt: at });
  });

  it('stays saving while any write is in flight, and ends in error when one write of the burst failed', async () => {
    const publisher = new SaveStatusPublisher(() => at);
    const states = record(publisher);
    let finishSlow!: () => void;
    const slow = publisher.run(() => new Promise<void>((resolve) => { finishSlow = resolve; }));
    await expect(publisher.run(async () => { throw new Error('second failed'); })).rejects.toThrow('second failed');
    expect(publisher.getSaveStatus().state).toBe('saving');
    finishSlow();
    await slow;
    expect(publisher.getSaveStatus()).toEqual({ state: 'error', errorMessage: 'second failed' });
    expect(states).toEqual(['idle', 'saving', 'saving', 'error']);
    // A new burst starts clean.
    await publisher.run(async () => undefined);
    expect(publisher.getSaveStatus().state).toBe('saved');
  });

  it.each([
    ['a QuotaExceededError', quota()],
    ['a DOMException with the quota code', Object.assign(new Error('full'), { code: 22 })],
    ['a Dexie error that wraps one', Object.assign(new Error('Dexie wrapper'), { name: 'AbortError', inner: quota() })],
    ['an error caused by one', new Error('outer', { cause: quota() })],
    ['a message that names it', new Error('The current transaction exceeded its quota limitations. QuotaExceededError: x')],
  ])('turns %s into the plain storage-full error and keeps the original as its cause', async (_name, error) => {
    expect(isQuotaExceeded(error)).toBe(true);
    const publisher = new SaveStatusPublisher(() => at);
    const thrown = await publisher.run(async () => { throw error; }).then(() => undefined, (rejected: unknown) => rejected);
    expect(thrown).toBeInstanceOf(StorageFullError);
    expect((thrown as StorageFullError).message).toBe('Browser storage is full. Export a backup, then free space.');
    expect((thrown as StorageFullError).cause).toBe(error);
    expect(publisher.getSaveStatus()).toEqual({ state: 'error', errorMessage: STORAGE_FULL_MESSAGE });
  });

  it('leaves other errors alone and does not wrap a storage-full error twice', async () => {
    const publisher = new SaveStatusPublisher(() => at);
    const other = Object.assign(new Error('Not a quota problem'), { name: 'ConstraintError' });
    expect(isQuotaExceeded(other)).toBe(false);
    expect(isQuotaExceeded(undefined)).toBe(false);
    await expect(publisher.run(async () => { throw other; })).rejects.toBe(other);
    const full = new StorageFullError();
    await expect(publisher.run(async () => { throw full; })).rejects.toBe(full);
    const loop: { inner?: unknown } = {}; loop.inner = loop;
    expect(isQuotaExceeded(loop)).toBe(false);
  });

  it('calls the after-save hook once after each burst of successful writes, and not after a failed one', async () => {
    const onSaved = vi.fn();
    const publisher = new SaveStatusPublisher(() => at, onSaved);
    await publisher.run(async () => undefined);
    await publisher.run(async () => undefined);
    expect(onSaved).toHaveBeenCalledTimes(2);
    await publisher.run(async () => { throw new Error('no'); }).catch(() => undefined);
    expect(onSaved).toHaveBeenCalledTimes(2);
  });
});

describe('LocalDataProtectionService', () => {
  const memoryStore = (initial: LocalDataProtection = {}): LocalDataProtectionStore & { saved: LocalDataProtection[] } => {
    const saved: LocalDataProtection[] = [];
    let current = initial;
    return { saved, load: () => current, save: (state) => { current = state; saved.push(state); } };
  };
  const storage = (persist: () => Promise<boolean>, persisted?: () => Promise<boolean>) => ({ persist: vi.fn(persist), ...(persisted ? { persisted: vi.fn(persisted) } : {}) });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('asks the browser to keep the store once, after the first successful save, and records the answer', async () => {
    const manager = storage(async () => true, async () => false);
    const store = memoryStore();
    const protection = new LocalDataProtectionService(store, manager, () => at);
    const publisher = new SaveStatusPublisher(() => at, () => protection.afterSuccessfulSave());
    expect(manager.persist).not.toHaveBeenCalled();
    await publisher.run(async () => undefined);
    await flush();
    await publisher.run(async () => undefined);
    await publisher.run(async () => undefined);
    await flush();
    expect(manager.persist).toHaveBeenCalledTimes(1);
    expect(protection.getLocalDataProtection()).toEqual({ persistentStorage: 'granted', persistentStorageCheckedAt: at });
    expect(store.saved).toEqual([{ persistentStorage: 'granted', persistentStorageCheckedAt: at }]);
  });

  it('records a refusal and does not ask again on a later start of the same browser profile', async () => {
    const manager = storage(async () => false, async () => false);
    const store = memoryStore();
    const first = new LocalDataProtectionService(store, manager, () => at);
    first.afterSuccessfulSave();
    await flush();
    expect(first.getLocalDataProtection().persistentStorage).toBe('denied');
    const later = storage(async () => true);
    const second = new LocalDataProtectionService(store, later, () => at);
    second.afterSuccessfulSave();
    await flush();
    expect(later.persist).not.toHaveBeenCalled();
    expect(second.getLocalDataProtection().persistentStorage).toBe('denied');
    // An explicit request by the planner still asks.
    await expect(second.requestPersistentStorage()).resolves.toBe('granted');
  });

  it('does not ask when the store is already persistent, and reports unavailable when the browser cannot be asked or throws', async () => {
    const already = storage(async () => true, async () => true);
    const kept = new LocalDataProtectionService(memoryStore(), already, () => at);
    await expect(kept.requestPersistentStorage()).resolves.toBe('granted');
    expect(already.persist).not.toHaveBeenCalled();
    await expect(new LocalDataProtectionService(memoryStore(), undefined, () => at).requestPersistentStorage()).resolves.toBe('unavailable');
    await expect(new LocalDataProtectionService(memoryStore(), {}, () => at).requestPersistentStorage()).resolves.toBe('unavailable');
    const broken = storage(async () => { throw new Error('blocked'); });
    await expect(new LocalDataProtectionService(memoryStore(), broken, () => at).requestPersistentStorage()).resolves.toBe('unavailable');
  });

  it('records the time of a backup export, keeps the persistence answer, and tells subscribers', () => {
    const store = memoryStore({ persistentStorage: 'granted', persistentStorageCheckedAt: '2026-10-01T00:00:00.000Z' });
    const protection = new LocalDataProtectionService(store, undefined, () => at);
    const seen: LocalDataProtection[] = [];
    const stop = protection.subscribeToLocalDataProtection((state) => seen.push(state));
    protection.recordBackupExported();
    stop();
    protection.recordBackupExported();
    expect(seen).toEqual([
      { persistentStorage: 'granted', persistentStorageCheckedAt: '2026-10-01T00:00:00.000Z' },
      { persistentStorage: 'granted', persistentStorageCheckedAt: '2026-10-01T00:00:00.000Z', lastBackupExportedAt: at },
    ]);
    expect(store.load()).toMatchObject({ lastBackupExportedAt: at, persistentStorage: 'granted' });
  });
});

// Review issue I-023 (user decision 11): every write of the four services shows in the one save status.
describe('every write of the four services publishes through one publisher', () => {
  const profile: TripProfile = { id: 'profile', scenarioId: 'scenario', name: 'Default', ...metadata(at) };
  const pattern: RoutePattern = { id: 'pattern', scenarioId: 'scenario', routeId: 'route', name: 'A-B', directionId: 'outbound', points: [{ id: 'a', nodeId: 'A', sequence: 0, cumulativeMiles: 0 }, { id: 'b', nodeId: 'B', sequence: 1, cumulativeMiles: 1 }], ...metadata(at) };
  const trip: Trip = { id: 'trip', scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', patternId: pattern.id, tripProfileId: profile.id, stopTimes: [{ patternPointId: 'a', sequence: 0, time: 100 }, { patternPointId: 'b', sequence: 1, time: 700 }], provenance: { kind: 'manual', creationMethod: 'manual', manuallyChangedFields: [] }, ...metadata(at) };
  const blockingContext = { getTrip: async () => trip, listTrips: async () => [trip], getTripProfile: async () => profile, listPatterns: async () => [pattern] };
  const assumptions = { enteredRate: 100, rateYear: 2025, sourceType: 'user' as const, baseServiceYear: 2026, futureYearCount: 1, annualEscalation: 0.03 };

  async function setup() {
    const repository = new InMemoryRouteDefinitionRepository();
    const blockingRepository = new InMemoryBlockingRepository();
    const publisher = new SaveStatusPublisher(() => at);
    const states = record(publisher);
    const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
    const route = new RouteDefinitionService(repository, backup, () => at, publisher);
    const trips = new TripGenerationService(repository, () => at, publisher);
    const blocking = new BlockingApplicationService(blockingRepository, blockingContext, publisher);
    const costing = new CostingApplicationService({ listBlockingScenarios: async () => [], listServiceDays: async () => [], listTripProfiles: async () => [], getCostingCalculationContext: async () => undefined, getEstimatedCostingContext: async () => undefined }, repository, () => at, publisher);
    const created = await route.createProject('One publisher');
    return { repository, blockingRepository, publisher, states, route, trips, blocking, costing, created, scenarioId: created.records.scenario.id, tripProfileId: created.records.tripProfiles![0].id };
  }

  it('publishes saving and saved for one write in each service', async () => {
    const { states, trips, blocking, costing, scenarioId, tripProfileId } = await setup();
    states.length = 0;
    await trips.renameTripProfile(tripProfileId, 'Renamed');
    await blocking.createBlockingScenario({ scenarioId, tripProfileId, name: 'Plan A' });
    await costing.saveAssumptions(scenarioId, assumptions);
    expect(states).toEqual(['saving', 'saved', 'saving', 'saved', 'saving', 'saved']);
  });

  it('shows a failed write of each service as a storage-full error in the one status', async () => {
    const { repository, blockingRepository, publisher, route, trips, blocking, costing, created, scenarioId, tripProfileId } = await setup();
    const fail = (target: object, method: string) => vi.spyOn(target as Record<string, (...args: unknown[]) => unknown>, method).mockRejectedValueOnce(quota());
    const expectStorageFull = async (write: Promise<unknown>) => {
      await expect(write).rejects.toBeInstanceOf(StorageFullError);
      expect(publisher.getSaveStatus()).toEqual({ state: 'error', errorMessage: 'Browser storage is full. Export a backup, then free space.' });
    };
    fail(repository, 'saveProject'); await expectStorageFull(route.renameProject(created.project.id, 'Renamed'));
    fail(repository, 'saveTripProfile'); await expectStorageFull(trips.renameTripProfile(tripProfileId, 'Renamed too'));
    fail(blockingRepository, 'saveBlockingScenarioGraphAtomically'); await expectStorageFull(blocking.createBlockingScenario({ scenarioId, tripProfileId, name: 'Plan B' }));
    fail(repository, 'saveCostingAssumptions'); await expectStorageFull(costing.saveAssumptions(scenarioId, assumptions));
    await costing.saveAssumptions(scenarioId, assumptions);
    expect(publisher.getSaveStatus().state).toBe('saved');
  });

  it('records the time of a JSON backup export through the Route service, returns the backup unchanged, and exposes the record', async () => {
    const repository = new InMemoryRouteDefinitionRepository();
    const backup = new ProjectBackupService((id) => repository.getProjectSnapshot(id), (snapshot) => repository.saveProjectSnapshot(snapshot));
    const saved: LocalDataProtection[] = [];
    const protection = new LocalDataProtectionService({ load: () => ({}), save: (state) => { saved.push(state); } }, undefined, () => at);
    const route = new RouteDefinitionService(repository, backup, () => at, new SaveStatusPublisher(() => at), protection);
    const created = await route.createProject('Backup time');
    const seen: LocalDataProtection[] = [];
    route.subscribeToLocalDataProtection((state) => seen.push(state));
    expect(route.getLocalDataProtection()).toEqual({});
    const payload = await route.exportProject(created.project.id);
    expect(JSON.parse(payload).project.name).toBe('Backup time');
    expect(route.getLocalDataProtection()).toEqual({ lastBackupExportedAt: at });
    expect(seen).toEqual([{}, { lastBackupExportedAt: at }]);
    expect(saved).toEqual([{ lastBackupExportedAt: at }]);
    // A failed export is not recorded as a backup.
    await expect(route.exportProject('missing')).rejects.toThrow();
    expect(saved).toHaveLength(1);
    // Without a protection record the service still exports and reports an empty record.
    const plain = new RouteDefinitionService(repository, backup, () => at);
    await plain.exportProject(created.project.id);
    expect(plain.getLocalDataProtection()).toEqual({});
  });

  // Each repository method that writes must be classified. A new write-like method on a repository fails this test until it is
  // listed as published by one of the four services, so no write can be added without showing in the save status.
  it('classifies every write-like method of the four repositories', () => {
    const published = new Set<string>([...ROUTE_DEFINITION_WRITE_METHODS, ...TRIP_GENERATION_WRITE_METHODS, ...BLOCKING_WRITE_METHODS, ...COSTING_WRITE_METHODS]);
    const writeLike = /^(save|delete|insert|replace|commit|update|restore|copy)/;
    const methodsOf = (prototype: object) => Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor' && writeLike.test(name));
    const found = new Set([
      ...methodsOf(DexieRouteDefinitionRepository.prototype), ...methodsOf(InMemoryRouteDefinitionRepository.prototype),
      ...methodsOf(DexieBlockingRepository.prototype), ...methodsOf(InMemoryBlockingRepository.prototype),
    ]);
    expect([...found].filter((name) => !published.has(name)).sort()).toEqual([]);
  });

  // The Route service publishes each of its writes explicitly. Check it against a repository that fails the test when a write
  // runs while no save is in progress.
  describe('Route service writes', () => {
    let name = '';
    afterEach(async () => { if (name) await Dexie.delete(name); name = ''; });

    it('runs every repository write of a full Route workflow inside a published save, on the Dexie repository', async () => {
      name = `transit-costing-save-status-${Date.now()}`;
      const db = new TransitDatabase(name);
      await db.open();
      const real = new DexieRouteDefinitionRepository(db);
      const publisher = new SaveStatusPublisher(() => at);
      const outside: string[] = [];
      const guarded = new Proxy(real, { get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        if (typeof property !== 'string' || typeof value !== 'function' || !ROUTE_DEFINITION_WRITE_METHODS.includes(property)) return typeof value === 'function' ? value.bind(target) : value;
        return (...args: unknown[]) => { if (publisher.getSaveStatus().state !== 'saving') outside.push(property); return value.apply(target, args); };
      } });
      const backup = new ProjectBackupService((id) => real.getProjectSnapshot(id), (snapshot) => real.saveProjectSnapshot(snapshot));
      const service = new RouteDefinitionService(guarded, backup, () => at, publisher);
      const created = await service.createProject('Workflow');
      const copy = await service.duplicateScenario(created.records, 'Copy');
      await service.renameScenario(copy, 'Copy renamed');
      await service.updateServiceDay(created.records, created.records.serviceDays[0].id, { annualServiceDays: 200 });
      const added = await service.addRoute(created.records);
      let aggregate = (await service.loadWorkspace(created.project.id, created.records.scenario.id, added.route.id)).aggregate!;
      aggregate = await service.updateRoute(aggregate, { name: 'Route' });
      aggregate = (await addTwoStopPattern(service, aggregate)).aggregate;
      const runtime = await service.ensureDefaultRuntimeProfile(aggregate.patterns[0]);
      const alternative = await service.createDefaultRuntimeProfile(aggregate.patterns[0], 'Alternative');
      await service.assignRuntimeProfile(created.records.scenario.id, aggregate.patterns[0].id, created.records.serviceDays[0].id, alternative.id);
      await service.renameRuntimeProfile(alternative.id, 'Alternative renamed');
      await service.copyRuntimeProfile(alternative.id, 'Alternative copy');
      const preview = await service.previewNodeChanges(aggregate.route.id, aggregate.nodes.map((node, index) => ({ ...node, name: `Node ${index}` })));
      await service.commitNodeChanges(preview.previewToken);
      await service.deleteRuntimeProfile(runtime.profile.id, alternative.id, (await service.getRuntimeProfileDeletionImpact(runtime.profile.id)).reviewToken);
      await service.importProject(await service.exportProject(created.project.id));
      await service.deleteRoute(aggregate.route.id, (await service.getRouteDeletionImpact(aggregate.route.id)).reviewToken);
      await service.deleteScenario(copy.scenario.id, (await service.getScenarioDeletionImpact(copy.scenario.id)).reviewToken);
      await service.deleteProject(created.project.id, (await service.getProjectDeletionImpact(created.project.id)).reviewToken);
      db.close();
      expect(outside).toEqual([]);
      expect(publisher.getSaveStatus().state).toBe('saved');
    });
  });
});
