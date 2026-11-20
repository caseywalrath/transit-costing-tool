// Decision 0081. Which service commands store a restore point, and the proxy that applies them at the composition root. The covered service
// methods are not changed: the proxy resolves the Scenario and the named records, then runs the command inside the recorder and the
// shared save-status publisher.
import type { RestorePointRecorder, RestorePointStore, ScenarioChangeRequest } from './ports';
import { isQuotaExceeded, type SaveStatusPublisher } from './saveStatus';
import type { RecordChange, RecordCollection, RestorePointKind } from '../domain/types';

/** Reads the coverage needs to find a command's Scenario. Each is a single-row read. */
export interface RestorePointLookup {
  getTrip(id: string): Promise<{ scenarioId: string; routeId: string; serviceDayId: string; tripProfileId?: string } | undefined>;
  getTripProfile(id: string): Promise<{ scenarioId: string } | undefined>;
  getRuntimeProfile(id: string): Promise<{ scenarioId: string; routeId: string; patternId: string } | undefined>;
  getPattern(id: string): Promise<{ scenarioId: string; routeId: string } | undefined>;
  getRoute(id: string): Promise<{ scenarioId: string } | undefined>;
  getBlockingScenario(id: string): Promise<{ scenarioId: string; tripProfileId: string } | undefined>;
  getBlock(id: string): Promise<{ scenarioId: string; serviceDayId: string; activities: Array<{ id: string; type: string }> } | undefined>;
  getScenario(id: string): Promise<{ name: string } | undefined>;
  routeEditPreviewScope(previewToken: string): { scenarioId: string; routeId: string; kind: 'pattern' | 'nodes'; patternId?: string } | undefined;
}

export type CoverageTarget = { scope: 'project'; projectId: string } | ({ scope: 'scenario'; kind?: RestorePointKind } & Omit<ScenarioChangeRequest, 'kind' | 'keep'>);
export interface CoverageSpec {
  kind: RestorePointKind;
  /** The Scenario and named records of one call, or undefined to run the command without a restore point. */
  resolve(args: readonly unknown[], lookup: RestorePointLookup): Promise<CoverageTarget | undefined>;
  keep?: (change: RecordChange) => boolean;
}
export type Coverage = Readonly<Record<string, CoverageSpec>>;

/** Returns `service` with each method named in `coverage` recorded. Other methods are returned bound to the service, as `publishWrites` does. */
export function withRestorePoints<T extends object>(service: T, coverage: Coverage, recorder: RestorePointRecorder, store: Pick<RestorePointStore, 'keepNewest'>, publisher: SaveStatusPublisher, lookup: RestorePointLookup): T {
  return new Proxy(service, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      const method = (value as (...args: unknown[]) => Promise<unknown>).bind(target);
      const spec = typeof property === 'string' && Object.prototype.hasOwnProperty.call(coverage, property) ? coverage[property] : undefined;
      if (!spec) return method;
      return async (...args: unknown[]) => {
        const destination = await spec.resolve(args, lookup);
        if (!destination) return method(...args);
        try {
          if (destination.scope === 'project') return await publisher.run(() => recorder.recordProjectDeletion(destination.projectId, () => method(...args)));
          const { scope: _scope, kind, ...request } = destination;
          return await publisher.run(() => recorder.recordScenarioChange({ ...request, kind: kind ?? spec.kind, ...(spec.keep ? { keep: spec.keep } : {}) }, () => method(...args)));
        } catch (error) {
          // Decision 0081 item 4: when storage is full, keep the newest 5 restore points and report the command's error unchanged.
          if (isQuotaExceeded(error)) await store.keepNewest(5).catch(() => undefined);
          throw error;
        }
      };
    },
  });
}

/** Runs every write directly. For tests and in-memory repositories. */
export class PassThroughRestorePointRecorder implements RestorePointRecorder {
  recordScenarioChange<T>(_request: ScenarioChangeRequest, write: () => Promise<T>): Promise<T> { return write(); }
  recordProjectDeletion<T>(_projectId: string, write: () => Promise<T>): Promise<T> { return write(); }
}

const SERVICE_COLLECTIONS: readonly RecordCollection[] = ['trips', 'runtimeProfiles', 'runtimeAssignments', 'blocks'];
/** A pattern save is recorded only when it removed or changed trips, runtime profiles, runtime assignments, or blocks. */
export const touchesService = (change: RecordChange): boolean => SERVICE_COLLECTIONS.some((collection) => Boolean(change.removed[collection]?.length || change.changedBefore[collection]?.length));
const size = (ids: unknown): number => new Set(ids as string[]).size;

export const ROUTE_DEFINITION_COVERAGE: Coverage = {
  deleteProject: { kind: 'deleteProject', resolve: async ([projectId]) => ({ scope: 'project', projectId: projectId as string }) },
  deleteScenario: { kind: 'deleteScenario', resolve: async ([scenarioId]) => ({ scope: 'scenario', scenarioId: scenarioId as string }) },
  deleteRoute: { kind: 'deleteRoute', resolve: async ([routeId], lookup) => {
    const route = await lookup.getRoute(routeId as string);
    return route && { scope: 'scenario', scenarioId: route.scenarioId, refs: { routeId: routeId as string } };
  } },
  deletePattern: { kind: 'deletePattern', resolve: async ([patternId], lookup) => {
    const pattern = await lookup.getPattern(patternId as string);
    return pattern && { scope: 'scenario', scenarioId: pattern.scenarioId, refs: { routeId: pattern.routeId, patternId: patternId as string } };
  } },
  commitPatternChange: { kind: 'rebalancePattern', keep: touchesService, resolve: async ([previewToken, mode], lookup) => {
    const scope = lookup.routeEditPreviewScope(previewToken as string);
    if (!scope || scope.kind !== 'pattern') return undefined;
    return { scope: 'scenario', scenarioId: scope.scenarioId, kind: mode === 'reset' ? 'resetPatternService' : 'rebalancePattern', refs: { routeId: scope.routeId, ...(scope.patternId ? { patternId: scope.patternId } : {}) } };
  } },
  commitNodeChanges: { kind: 'deleteNodes', keep: (change) => Boolean(change.removed.nodes?.length), resolve: async ([previewToken], lookup) => {
    const scope = lookup.routeEditPreviewScope(previewToken as string);
    if (!scope || scope.kind !== 'nodes') return undefined;
    return { scope: 'scenario', scenarioId: scope.scenarioId, refs: { routeId: scope.routeId } };
  } },
  deleteRuntimeProfile: { kind: 'deleteRuntimeProfile', resolve: async ([profileId], lookup) => {
    const profile = await lookup.getRuntimeProfile(profileId as string);
    return profile && { scope: 'scenario', scenarioId: profile.scenarioId, refs: { routeId: profile.routeId, patternId: profile.patternId, runtimeProfileId: profileId as string } };
  } },
  splitRouteStop: { kind: 'splitRouteStops', resolve: async ([input], lookup) => routeStopTarget(lookup, input) },
  splitSharedRouteStops: { kind: 'splitRouteStops', resolve: async ([input], lookup) => routeStopTarget(lookup, input) },
  deleteRouteStops: { kind: 'deleteRouteStops', resolve: async ([input], lookup) => routeStopTarget(lookup, input) },
  mergeRouteStops: { kind: 'mergeRouteStops', resolve: async ([input], lookup) => routeStopTarget(lookup, input) },
};

/** Decision 0087. A stop-list command takes `{ routeId, … }`; its Scenario is the Route's. `saveRouteStopRecords` is not covered. */
async function routeStopTarget(lookup: RestorePointLookup, input: unknown): Promise<CoverageTarget | undefined> {
  const routeId = (input as { routeId: string }).routeId;
  const route = await lookup.getRoute(routeId);
  return route && { scope: 'scenario', scenarioId: route.scenarioId, refs: { routeId } };
}

/** FX8. A trip change: the Scenario, Route, Day, and Trip profile of its first Trip, and the number of Trips. Nothing is recorded without Trips. */
async function tripChange(lookup: RestorePointLookup, tripIds: readonly string[], kind: RestorePointKind): Promise<CoverageTarget | undefined> {
  const first = tripIds[0];
  const trip = first === undefined ? undefined : await lookup.getTrip(first);
  return trip && { scope: 'scenario', kind, separate: true, scenarioId: trip.scenarioId, quantity: tripIds.length, refs: { routeId: trip.routeId, serviceDayId: trip.serviceDayId, ...(trip.tripProfileId ? { tripProfileId: trip.tripProfileId } : {}) } };
}

export const TRIP_GENERATION_COVERAGE: Coverage = {
  deleteTrips: { kind: 'deleteTrips', resolve: async ([tripIds], lookup) => {
    const first = (tripIds as string[])[0];
    const trip = first === undefined ? undefined : await lookup.getTrip(first);
    return trip && { scope: 'scenario', scenarioId: trip.scenarioId, quantity: size(tripIds), refs: { routeId: trip.routeId, serviceDayId: trip.serviceDayId, ...(trip.tripProfileId ? { tripProfileId: trip.tripProfileId } : {}) } };
  } },
  applyTripCopy: { kind: 'copyTripsFromDay', resolve: async ([preview]) => {
    const request = (preview as { request: { scenarioId: string; routeId: string; tripProfileId: string; sourceServiceDayId: string; targetServiceDayId: string } }).request;
    return { scope: 'scenario', scenarioId: request.scenarioId, refs: { routeId: request.routeId, tripProfileId: request.tripProfileId, serviceDayId: request.targetServiceDayId, sourceServiceDayId: request.sourceServiceDayId } };
  } },
  applyRecalculationPreview: { kind: 'regenerateTrips', resolve: async ([preview], lookup) => {
    const value = preview as { trips: Array<{ id: string }>; anchorTimeByTripId?: Record<string, number> };
    const startTime = Object.keys(value.anchorTimeByTripId ?? {}).length > 0;
    return tripChange(lookup, value.trips.map((trip) => trip.id), startTime ? 'changeTripStartTime' : 'regenerateTrips');
  } },
  applyRecalculationReview: { kind: 'regenerateTrips', resolve: async ([review], lookup) => tripChange(lookup, (review as { trips: Array<{ id: string }> }).trips.map((trip) => trip.id), 'regenerateTrips') },
  recalculateTrips: { kind: 'regenerateTrips', resolve: async ([tripIds], lookup) => tripChange(lookup, tripIds as string[], 'regenerateTrips') },
  changeTripPattern: { kind: 'changeTripPattern', resolve: async ([review], lookup) => tripChange(lookup, [(review as { tripId: string }).tripId], 'changeTripPattern') },
  applyBatchPatternChange: { kind: 'changeTripPattern', resolve: async ([preview], lookup) => tripChange(lookup, (preview as { eligibleTripIds: string[] }).eligibleTripIds, 'changeTripPattern') },
  applyStagedTripShift: { kind: 'shiftTrips', resolve: async ([preview], lookup) => tripChange(lookup, (preview as { selectedTripIds: string[] }).selectedTripIds, 'shiftTrips') },
  deleteTripProfile: { kind: 'deleteTripProfile', resolve: async ([profileId], lookup) => {
    const profile = await lookup.getTripProfile(profileId as string);
    return profile && { scope: 'scenario', scenarioId: profile.scenarioId, refs: { tripProfileId: profileId as string } };
  } },
};

/** The Scenario and Trip profile of a Blocking scenario, as refs. */
async function blockingTarget(lookup: RestorePointLookup, blockingScenarioId: string, extra: Omit<ScenarioChangeRequest, 'kind' | 'keep' | 'scenarioId'> & { kind?: RestorePointKind } = {}): Promise<CoverageTarget | undefined> {
  const blockingScenario = await lookup.getBlockingScenario(blockingScenarioId);
  if (!blockingScenario) return undefined;
  return { ...extra, scope: 'scenario', scenarioId: blockingScenario.scenarioId, refs: { tripProfileId: blockingScenario.tripProfileId, blockingScenarioId, ...(extra.refs ?? {}) } };
}

export const BLOCKING_COVERAGE: Coverage = {
  deleteBlockingScenario: { kind: 'deleteBlockingScenario', resolve: async ([blockingScenarioId], lookup) => blockingTarget(lookup, blockingScenarioId as string) },
  deleteBlock: { kind: 'deleteBlocks', resolve: async ([blockingScenarioId, blockId], lookup) => {
    const block = await lookup.getBlock(blockId as string);
    return blockingTarget(lookup, blockingScenarioId as string, { quantity: 1, refs: block ? { serviceDayId: block.serviceDayId } : {} });
  } },
  deleteBlocks: { kind: 'deleteBlocks', resolve: async ([blockingScenarioId, blockIds], lookup) => {
    const first = (blockIds as string[])[0];
    const block = first === undefined ? undefined : await lookup.getBlock(first);
    return blockingTarget(lookup, blockingScenarioId as string, { quantity: size(blockIds), refs: block ? { serviceDayId: block.serviceDayId } : {} });
  } },
  applyBlockingDayCopy: { kind: 'copyBlocksFromDay', resolve: async ([review], lookup) => {
    const request = (review as { preview: { request: { blockingScenarioId: string; sourceServiceDayId: string; targetServiceDayId: string } } }).preview.request;
    return blockingTarget(lookup, request.blockingScenarioId, { refs: { serviceDayId: request.targetServiceDayId, sourceServiceDayId: request.sourceServiceDayId } });
  } },
  createAutoBlockingScenario: { kind: 'rebuildAutoBlocks', resolve: async ([request], lookup) => {
    const replaceId = (request as { replaceBlockingScenarioId?: string }).replaceBlockingScenarioId;
    return replaceId ? blockingTarget(lookup, replaceId) : undefined;
  } },
  // Decision 0083: adds Blocks only. Undo deletes the added Blocks.
  fillUnassignedTrips: { kind: 'autoBlockUnassigned', resolve: async ([request], lookup) => blockingTarget(lookup, (request as { blockingScenarioId: string }).blockingScenarioId) },
  applyBulkBoundaryActivities: { kind: 'replaceBoundaryActivities', resolve: async ([request], lookup) => {
    const bulk = request as { blockingScenarioId: string; serviceDayId: string; activity: { type: string } };
    return blockingTarget(lookup, bulk.blockingScenarioId, { detail: bulk.activity.type, refs: { serviceDayId: bulk.serviceDayId } });
  } },
  removeTrip: { kind: 'unassignTrips', resolve: async ([blockingScenarioId, serviceDayId], lookup) => blockingTarget(lookup, blockingScenarioId as string, { quantity: 1, refs: { serviceDayId: serviceDayId as string } }) },
  removeTrips: { kind: 'unassignTrips', resolve: async ([blockingScenarioId, serviceDayId, tripIds], lookup) => blockingTarget(lookup, blockingScenarioId as string, { quantity: size(tripIds), refs: { serviceDayId: serviceDayId as string } }) },
  reassignTrips: { kind: 'moveTripsToBlock', resolve: async ([request], lookup) => {
    const move = request as { blockingScenarioId: string; serviceDayId: string; tripIds: string[]; destinationBlockId: string };
    return blockingTarget(lookup, move.blockingScenarioId, { quantity: size(move.tripIds), refs: { serviceDayId: move.serviceDayId, blockId: move.destinationBlockId } });
  } },
  assignTripsToBlock: { kind: 'moveTripsToBlock', keep: (change) => (change.changedBefore.blocks?.length ?? 0) >= 2, resolve: async ([request], lookup) => {
    const move = request as { blockingScenarioId: string; serviceDayId: string; tripIds: string[]; destinationBlockId: string };
    return blockingTarget(lookup, move.blockingScenarioId, { quantity: size(move.tripIds), refs: { serviceDayId: move.serviceDayId, blockId: move.destinationBlockId } });
  } },
  removeBoundaryActivity: { kind: 'removeBlockActivity', resolve: async ([blockingScenarioId, blockId, activityId], lookup) => {
    const block = await lookup.getBlock(blockId as string);
    const activity = block?.activities.find((candidate) => candidate.id === activityId);
    return blockingTarget(lookup, blockingScenarioId as string, { ...(activity ? { detail: activity.type } : {}), refs: { blockId: blockId as string, ...(block ? { serviceDayId: block.serviceDayId } : {}) } });
  } },
  removeDeadheads: { kind: 'deleteDeadheads', resolve: async ([blockingScenarioId, blockId, activityIds], lookup) => {
    const block = await lookup.getBlock(blockId as string);
    return blockingTarget(lookup, blockingScenarioId as string, { quantity: size(activityIds), refs: { blockId: blockId as string, ...(block ? { serviceDayId: block.serviceDayId } : {}) } });
  } },
};

export const PLANNED_FREQUENCY_COVERAGE: Coverage = {
  clearPlan: { kind: 'clearPlan', resolve: async ([routeId, serviceDayId], lookup) => {
    const route = await lookup.getRoute(routeId as string);
    return route && { scope: 'scenario', scenarioId: route.scenarioId, refs: { routeId: routeId as string, serviceDayId: serviceDayId as string } };
  } },
  applyCopyFromDay: { kind: 'copyPlanFromDay', resolve: async ([preview]) => {
    const copy = preview as { scenarioId: string; routeId: string; sourceServiceDayId: string; targetServiceDayId: string };
    return { scope: 'scenario', scenarioId: copy.scenarioId, refs: { routeId: copy.routeId, serviceDayId: copy.targetServiceDayId, sourceServiceDayId: copy.sourceServiceDayId } };
  } },
  applyCopyFromScenario: { kind: 'copyPlansFromScenario', resolve: async ([preview], lookup) => {
    const copy = preview as { scenarioId: string; sourceScenarioId: string; targetRouteId: string };
    const source = await lookup.getScenario(copy.sourceScenarioId);
    return { scope: 'scenario', scenarioId: copy.scenarioId, refs: { routeId: copy.targetRouteId }, ...(source ? { extraNames: { sourceScenario: source.name } } : {}) };
  } },
};
