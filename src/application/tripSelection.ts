import type { Trip } from '../domain/types';

export type SelectionMode = 'replace' | 'add' | 'remove';
export type TripSelectionCriterion =
  | { kind: 'pattern'; patternId: string }
  | { kind: 'unassigned'; assignedTripIds: ReadonlySet<string> }
  | { kind: 'runtimeChanged'; changedTripIds: ReadonlySet<string> };

/** The ids of the trips that match one criterion, in table order. */
export function tripIdsMatching(trips: readonly Pick<Trip, 'id' | 'patternId'>[], criterion: TripSelectionCriterion): string[] {
  return trips.filter((trip) => {
    if (criterion.kind === 'pattern') return trip.patternId === criterion.patternId;
    if (criterion.kind === 'unassigned') return !criterion.assignedTripIds.has(trip.id);
    return criterion.changedTripIds.has(trip.id);
  }).map((trip) => trip.id);
}

/** Every id in `allIds` that is not selected, in `allIds` order. */
export function invertSelection(allIds: readonly string[], selectedIds: readonly string[]): string[] {
  const selected = new Set(selectedIds);
  return allIds.filter((id) => !selected.has(id));
}

/** Replaces, extends, or reduces the current selection. `add` and `remove` keep the order of `current`. */
export function combineSelection(current: readonly string[], ids: readonly string[], mode: SelectionMode): string[] {
  if (mode === 'replace') return [...new Set(ids)];
  if (mode === 'add') return [...new Set([...current, ...ids])];
  const removed = new Set(ids);
  return current.filter((id) => !removed.has(id));
}
