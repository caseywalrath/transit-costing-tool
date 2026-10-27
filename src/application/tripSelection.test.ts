import { describe, expect, it } from 'vitest';
import { combineSelection, invertSelection, tripIdsMatching } from './tripSelection';

const trips = [
  { id: 't1', patternId: 'a' },
  { id: 't2', patternId: 'b' },
  { id: 't3', patternId: 'a' },
  { id: 't4', patternId: 'c' },
];

describe('tripIdsMatching', () => {
  it('matches by pattern in table order', () => {
    expect(tripIdsMatching(trips, { kind: 'pattern', patternId: 'a' })).toEqual(['t1', 't3']);
    expect(tripIdsMatching(trips, { kind: 'pattern', patternId: 'missing' })).toEqual([]);
  });

  it('matches trips that are not assigned to a block', () => {
    expect(tripIdsMatching(trips, { kind: 'unassigned', assignedTripIds: new Set(['t1', 't4']) })).toEqual(['t2', 't3']);
    expect(tripIdsMatching(trips, { kind: 'unassigned', assignedTripIds: new Set(trips.map((trip) => trip.id)) })).toEqual([]);
  });

  it('matches trips whose run times have changed', () => {
    expect(tripIdsMatching(trips, { kind: 'runtimeChanged', changedTripIds: new Set(['t2', 't4', 'other']) })).toEqual(['t2', 't4']);
  });
});

describe('invertSelection', () => {
  it('returns the unselected ids in the order of allIds', () => {
    expect(invertSelection(['t1', 't2', 't3', 't4'], ['t3', 't1'])).toEqual(['t2', 't4']);
  });

  it('selects everything when nothing is selected, and nothing when everything is', () => {
    expect(invertSelection(['t1', 't2'], [])).toEqual(['t1', 't2']);
    expect(invertSelection(['t1', 't2'], ['t1', 't2'])).toEqual([]);
  });

  it('ignores selected ids that are not in allIds', () => {
    expect(invertSelection(['t1', 't2'], ['gone'])).toEqual(['t1', 't2']);
  });
});

describe('combineSelection', () => {
  it('replaces the selection', () => {
    expect(combineSelection(['t1', 't2'], ['t3', 't3'], 'replace')).toEqual(['t3']);
  });

  it('adds without duplicates and keeps the existing order', () => {
    expect(combineSelection(['t2', 't1'], ['t1', 't3'], 'add')).toEqual(['t2', 't1', 't3']);
  });

  it('removes only the listed ids', () => {
    expect(combineSelection(['t1', 't2', 't3'], ['t2', 'absent'], 'remove')).toEqual(['t1', 't3']);
  });

  it('does not change the input arrays', () => {
    const current = ['t1'];
    combineSelection(current, ['t2'], 'add');
    expect(current).toEqual(['t1']);
  });
});
