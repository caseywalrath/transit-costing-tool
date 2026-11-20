import { normalizeStopLocation } from './stops';
import type { EntityId, PatternStopPlacement, RoutePattern, RouteStop, RouteStopSet } from './types';

/** Decision 0087. Where one Route stop record is used, by pattern and by direction. */
export interface RouteStopUsage {
  stopId: EntityId;
  patternIds: EntityId[];
  /** Direction ID → number of patterns of that direction placing the stop. A pattern without a direction counts under ''. */
  countByDirectionId: Record<string, number>;
  sharedAcrossDirections: boolean;
}

/** The editable fields of a Route stop record (Decision 0087 item 2). */
export type RouteStopFields = Pick<RouteStop, 'name' | 'stopCode' | 'latitude' | 'longitude' | 'speedLimitMph'>;

export type RouteStopCommandErrorCode = 'stopMissing' | 'nothingToSplit' | 'mergeNeedsTwo';

/** A refused stop command. The code names the refusal; the service maps it to a message. */
export class RouteStopCommandError extends Error {
  constructor(readonly code: RouteStopCommandErrorCode) {
    super(code);
  }
}

/** Decision 0087 item 2. Usage of every stop of the set, by the patterns of the set's Route. */
export function routeStopUsage(set: RouteStopSet, patterns: readonly RoutePattern[]): Map<EntityId, RouteStopUsage> {
  const usage = new Map<EntityId, RouteStopUsage>();
  for (const stop of set.stops) {
    const patternIds: EntityId[] = [];
    const countByDirectionId: Record<string, number> = {};
    for (const pattern of patterns) {
      if (!placesStop(set, pattern.id, stop.id)) continue;
      patternIds.push(pattern.id);
      const key = pattern.directionId ?? '';
      countByDirectionId[key] = (countByDirectionId[key] ?? 0) + 1;
    }
    const directionCount = Object.keys(countByDirectionId).filter((key) => key !== '').length;
    usage.set(stop.id, { stopId: stop.id, patternIds, countByDirectionId, sharedAcrossDirections: directionCount >= 2 });
  }
  return usage;
}

/**
 * Decision 0087 item 2. Replaces the five fields of each edited stop. Keeps the stop's ID and position. Does not validate; the service does.
 * Throws `stopMissing` when an edit names a stop that is not in the set.
 */
export function applyRouteStopEdits(set: RouteStopSet, edits: ReadonlyArray<{ id: EntityId } & RouteStopFields>): RouteStopSet {
  const editById = new Map<EntityId, { id: EntityId } & RouteStopFields>();
  for (const edit of edits) {
    if (!set.stops.some((stop) => stop.id === edit.id)) throw new RouteStopCommandError('stopMissing');
    editById.set(edit.id, edit);
  }
  return {
    ...set,
    stops: set.stops.map((stop) => {
      const edit = editById.get(stop.id);
      return edit ? stopFromFields(stop.id, edit) : stop;
    }),
  };
}

/**
 * Decision 0087 item 4. Moves the placements of one stop in the patterns of one direction to a new stop record. The new stop goes right after
 * the original. Refused when no pattern of that direction places the stop, or when no other direction places it.
 */
export function splitRouteStop(
  set: RouteStopSet,
  patterns: readonly RoutePattern[],
  input: { stopId: EntityId; directionId: EntityId; newStop: { id: EntityId } & RouteStopFields },
): RouteStopSet {
  const index = set.stops.findIndex((stop) => stop.id === input.stopId);
  if (index < 0) throw new RouteStopCommandError('stopMissing');
  const moved = patterns.filter((pattern) => pattern.directionId === input.directionId && placesStop(set, pattern.id, input.stopId));
  const kept = patterns.filter((pattern) => pattern.directionId !== undefined && pattern.directionId !== input.directionId && placesStop(set, pattern.id, input.stopId));
  if (moved.length === 0 || kept.length === 0) throw new RouteStopCommandError('nothingToSplit');
  const newStop = stopFromFields(input.newStop.id, input.newStop);
  return {
    ...set,
    stops: [...set.stops.slice(0, index + 1), newStop, ...set.stops.slice(index + 1)],
    placementsByPatternId: movePlacements(set.placementsByPatternId, patterns, input.stopId, input.directionId, newStop.id),
  };
}

/**
 * Decision 0087 item 5. Splits every stop used by more than one direction. The keeper direction keeps the original record: `keepDirectionId`
 * when it uses the stop, otherwise the first direction of `directionOrder` that uses it. Every other direction that uses the stop gets a new record
 * named with its suffix, with no stop ID and no location. Patterns without a direction keep the original.
 */
export function splitSharedRouteStops(
  set: RouteStopSet,
  patterns: readonly RoutePattern[],
  input: {
    directionOrder: readonly EntityId[];
    keepDirectionId: EntityId;
    suffixByDirectionId: Readonly<Record<EntityId, string>>;
    renameKept: boolean;
    newId: () => EntityId;
  },
): { set: RouteStopSet; created: Array<{ fromStopId: EntityId; stopId: EntityId; directionId: EntityId }> } {
  const usage = routeStopUsage(set, patterns);
  const created: Array<{ fromStopId: EntityId; stopId: EntityId; directionId: EntityId }> = [];
  let placementsByPatternId = set.placementsByPatternId;
  const stops: RouteStop[] = [];

  for (const stop of set.stops) {
    const stopUsage = usage.get(stop.id);
    if (!stopUsage?.sharedAcrossDirections) {
      stops.push(stop);
      continue;
    }
    const usedDirections = input.directionOrder.filter((directionId) => (stopUsage.countByDirectionId[directionId] ?? 0) > 0);
    const keeperDirectionId = usedDirections.includes(input.keepDirectionId) ? input.keepDirectionId : usedDirections[0];
    if (keeperDirectionId === undefined) {
      stops.push(stop);
      continue;
    }

    const keeperSuffix = suffixLabel(input.suffixByDirectionId[keeperDirectionId]);
    stops.push(input.renameKept && keeperSuffix ? { ...stop, name: `${stop.name} ${keeperSuffix}` } : stop);

    for (const directionId of usedDirections) {
      if (directionId === keeperDirectionId) continue;
      const newStopId = input.newId();
      const suffix = suffixLabel(input.suffixByDirectionId[directionId]);
      stops.push({ id: newStopId, name: suffix ? `${stop.name} ${suffix}` : stop.name });
      placementsByPatternId = movePlacements(placementsByPatternId, patterns, stop.id, directionId, newStopId);
      created.push({ fromStopId: stop.id, stopId: newStopId, directionId });
    }
  }

  return { set: { ...set, stops, placementsByPatternId }, created };
}

/**
 * Decision 0087 item 6. Removes the stops and every placement of them. A pattern left with no placements loses its entry. Unknown IDs are
 * ignored. Timepoint stop IDs and locations are not changed.
 */
export function deleteRouteStops(set: RouteStopSet, stopIds: readonly EntityId[]): RouteStopSet {
  const removed = new Set(stopIds);
  const placementsByPatternId: Record<EntityId, PatternStopPlacement[]> = {};
  for (const [patternId, placements] of Object.entries(set.placementsByPatternId)) {
    const kept = placements.filter((placement) => !removed.has(placement.stopId));
    if (kept.length > 0) placementsByPatternId[patternId] = kept;
  }
  return { ...set, stops: set.stops.filter((stop) => !removed.has(stop.id)), placementsByPatternId };
}

/**
 * Decision 0087 item 7. Points the placements of the merged stops to the kept stop, then removes the merged stops. The kept stop's fields are
 * unchanged. Repeats are not checked here; `validateRouteStopSet` reports them.
 */
export function mergeRouteStops(set: RouteStopSet, input: { keepStopId: EntityId; mergeStopIds: readonly EntityId[] }): RouteStopSet {
  if (input.mergeStopIds.length === 0 || input.mergeStopIds.includes(input.keepStopId)) throw new RouteStopCommandError('mergeNeedsTwo');
  const ids = [input.keepStopId, ...input.mergeStopIds];
  if (ids.some((id) => !set.stops.some((stop) => stop.id === id))) throw new RouteStopCommandError('stopMissing');
  const merged = new Set(input.mergeStopIds);
  const placementsByPatternId: Record<EntityId, PatternStopPlacement[]> = {};
  for (const [patternId, placements] of Object.entries(set.placementsByPatternId)) {
    placementsByPatternId[patternId] = placements.map((placement) => (merged.has(placement.stopId) ? { ...placement, stopId: input.keepStopId } : placement));
  }
  return { ...set, stops: set.stops.filter((stop) => !merged.has(stop.id)), placementsByPatternId };
}

function placesStop(set: RouteStopSet, patternId: EntityId, stopId: EntityId): boolean {
  return (set.placementsByPatternId[patternId] ?? []).some((placement) => placement.stopId === stopId);
}

/** A new placement map where each placement of the stop in a pattern of the direction points to the new stop. Input is not changed. */
function movePlacements(
  placementsByPatternId: Record<EntityId, PatternStopPlacement[]>,
  patterns: readonly RoutePattern[],
  stopId: EntityId,
  directionId: EntityId,
  newStopId: EntityId,
): Record<EntityId, PatternStopPlacement[]> {
  const next = { ...placementsByPatternId };
  for (const pattern of patterns) {
    if (pattern.directionId !== directionId || !(next[pattern.id] ?? []).some((placement) => placement.stopId === stopId)) continue;
    next[pattern.id] = (next[pattern.id] ?? []).map((placement) => (placement.stopId === stopId ? { ...placement, stopId: newStopId } : placement));
  }
  return next;
}

/** A stop record with its fields trimmed and its location normalized (Decision 0087 item 2). */
function stopFromFields(id: EntityId, fields: RouteStopFields): RouteStop {
  const stopCode = fields.stopCode?.trim();
  const location = normalizeStopLocation({ latitude: fields.latitude, longitude: fields.longitude, speedLimitMph: fields.speedLimitMph });
  return {
    id,
    name: fields.name.trim(),
    ...(stopCode ? { stopCode } : {}),
    ...(location ?? {}),
  };
}

function suffixLabel(suffix: string | undefined): string {
  return (suffix ?? '').trim();
}
