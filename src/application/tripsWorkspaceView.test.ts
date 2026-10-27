// Review package P15 (issue I-074c, finding 4-014). What the Trips screen derives from its data (rows, headways, shading, impact counts,
// the Build Trips form) is computed here, not in App.tsx.
import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { BlockActivity, BlockingBlock, RoutePattern, RuntimeBand, RuntimeProfile, Trip, TripRegenerationUndo } from '../domain/types';
import { buildTripTableView, buildTripsFieldProblems, parseBuildTripsForm, regenerationUndoApplies, runtimeBandTotalRange, tripPatternChipText, tripBlockAssignmentImpact, tripBlockUnassignmentImpact, type BuildTripsFormValues } from './tripsWorkspaceView';

const stamp = metadata('2026-10-23T00:00:00.000Z');
const pattern = (id: string): RoutePattern => ({ ...stamp, id, scenarioId: 's', routeId: 'r', name: id, directionId: 'out', points: [0, 1].map((index) => ({ id: `${id}-${index}`, nodeId: `n${index}`, sequence: index, cumulativeMiles: index, directionColumnId: `col-${index}` })) });
const trip = (id: string, patternId: string, times: number[]): Trip => ({
  ...stamp, id, scenarioId: 's', routeId: 'r', serviceDayId: 'wd', patternId, tripProfileId: 'tp',
  stopTimes: times.map((time, index) => ({ patternPointId: `${patternId}-${index}`, sequence: index, time })),
  provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [] },
});
const band = (id: string, startTime: number, endTime: number, seconds: number): RuntimeBand => ({ id, label: id, sequence: 0, startTime, endTime, segmentRuntimeSeconds: [seconds] });
const profile = (method: RuntimeProfile['calculationMethod']): RuntimeProfile => ({ ...stamp, id: 'rp', scenarioId: 's', routeId: 'r', patternId: 'a', name: 'Default', calculationMethod: method, bands: [band('b1', 0, 3600, 600), band('b2', 3600, 7200, 300)] });

describe('the Trips table view', () => {
  const a = pattern('a');
  const trips = [trip('t1', 'a', [100, 700]), trip('t2', 'a', [100, 710]), trip('t3', 'a', [3700, 4000])];
  const input = { savedTrips: trips, patterns: [a], runtimeProfiles: new Map([['a', profile('singleBand')]]), changedRuntimeTripIds: new Set<string>(), showRuntimeBands: false, showHeadways: false };

  it('gives each row its run time and flags the two Trips that leave at the same time', () => {
    const view = buildTripTableView(input);
    expect(trips.map((item) => view.rows.get(item.id)?.runTimeSeconds)).toEqual([600, 610, 300]);
    expect(trips.map((item) => view.rows.get(item.id)?.duplicate)).toEqual([true, true, false]);
    expect(view.rows.get('t1')?.singleBand).toBeUndefined();
    expect(view.headways.size).toBe(0);
  });

  it('names a single-band Trip’s band only when the bands are shown', () => {
    const view = buildTripTableView({ ...input, showRuntimeBands: true });
    expect(trips.map((item) => view.rows.get(item.id)?.singleBand?.id)).toEqual(['b1', 'b1', 'b2']);
  });

  it('gives segment contributions for a segment-start Trip whose times match, and none for a Trip marked changed', () => {
    const segmentInput = { ...input, runtimeProfiles: new Map([['a', profile('segmentStart')]]), showRuntimeBands: true };
    const view = buildTripTableView(segmentInput);
    expect(view.rows.get('t1')?.segments?.[0].contributions[0].bandId).toBe('b1');
    expect(view.rows.get('t2')?.segments).toBeUndefined();
    const changed = buildTripTableView({ ...segmentInput, changedRuntimeTripIds: new Set(['t1']) });
    expect(changed.rows.get('t1')?.segments).toBeUndefined();
  });

  it('shows the staged Shift’s times in the row, finds duplicates from the saved times, and computes headways from the shown times', () => {
    const shifted = [{ ...trips[0], stopTimes: trips[0].stopTimes.map((point) => ({ ...point, time: point.time + 60 })) }];
    const view = buildTripTableView({ ...input, previewTrips: shifted, showHeadways: true });
    expect(view.rows.get('t1')?.runTimeSeconds).toBe(600);
    expect(view.rows.get('t1')?.duplicate).toBe(true);
    const column = view.headways.get('col-0')!;
    expect([...column].map(([id, value]) => [id, value.time, value.previousTime])).toEqual([['t2', 100, undefined], ['t1', 160, 100], ['t3', 3700, 160]]);
  });
});

describe('headway change markers (UR-8)', () => {
  // Pattern b serves only col-0, so it skips the col-1 timepoint.
  const a = pattern('a');
  const b: RoutePattern = { ...pattern('b'), points: [{ id: 'b-0', nodeId: 'n0', sequence: 0, cumulativeMiles: 0, directionColumnId: 'col-0' }] };
  const base = { patterns: [a, b], runtimeProfiles: new Map(), changedRuntimeTripIds: new Set<string>(), showRuntimeBands: false, showHeadways: true };
  const changedIn = (trips: Trip[], columnId: string) => [...buildTripTableView({ ...base, savedTrips: trips }).headways.get(columnId)!].map(([id, cell]) => [id, cell.changed]);

  it('marks a cell whose headway differs from the previous headway, and never the first two cells', () => {
    const trips = [trip('t1', 'a', [0, 100]), trip('t2', 'a', [900, 1000]), trip('t3', 'a', [1800, 1900]), trip('t4', 'a', [2400, 2500]), trip('t5', 'a', [3000, 3100])];
    expect(changedIn(trips, 'col-0')).toEqual([['t1', false], ['t2', false], ['t3', false], ['t4', true], ['t5', false]]);
  });

  it('compares headways within one column, so a Trip that skips a timepoint does not count there', () => {
    const trips = [trip('t1', 'a', [0, 100]), trip('s1', 'b', [300]), trip('t2', 'a', [600, 700]), trip('t3', 'a', [1200, 1300])];
    // col-0 headways: 300, 300, 600 → t3 changed. col-1 (no s1): 600, 600 → nothing changed.
    expect(changedIn(trips, 'col-0')).toEqual([['t1', false], ['s1', false], ['t2', false], ['t3', true]]);
    expect(changedIn(trips, 'col-1')).toEqual([['t1', false], ['t2', false], ['t3', false]]);
  });

  it('does not mark when headways are equal, including a zero headway that repeats', () => {
    const trips = [trip('t1', 'a', [600, 700]), trip('t2', 'a', [600, 700]), trip('t3', 'a', [600, 700])];
    expect(changedIn(trips, 'col-0')).toEqual([['t1', false], ['t2', false], ['t3', false]]);
  });
});

describe('the Build Trips form', () => {
  const context = { scenarioId: 's', routeId: 'r', serviceDayId: 'wd', tripProfileId: 'tp' };
  const values = (overrides: Partial<BuildTripsFormValues> = {}): BuildTripsFormValues => ({ patternId: 'a', firstTrip: '6:00', headway: '10', tripCount: '', lastTrip: '7:00', ...overrides });

  it('builds a request from times and a headway in minutes, by Last Trip or by count', () => {
    expect(parseBuildTripsForm(values(), context)).toEqual({ ok: true, request: { ...context, patternId: 'a', firstTrip: 21600, headwaySeconds: 600, lastTrip: 25200 } });
    expect(parseBuildTripsForm(values({ lastTrip: '', tripCount: '4', headway: '7:30' }), context)).toEqual({ ok: true, request: { ...context, patternId: 'a', firstTrip: 21600, headwaySeconds: 450, tripCount: 4 } });
    expect(parseBuildTripsForm(values({ lastTrip: '25:30' }), context)).toMatchObject({ ok: true, request: { lastTrip: 91800 } });
  });

  it('says what is missing, and which entry cannot be read', () => {
    expect(parseBuildTripsForm(values({ patternId: '' }), context)).toEqual({ ok: false, reason: 'missingFields' });
    expect(parseBuildTripsForm(values({ firstTrip: ' ' }), context)).toEqual({ ok: false, reason: 'missingFields' });
    expect(parseBuildTripsForm(values({ headway: '' }), context)).toEqual({ ok: false, reason: 'missingFields' });
    expect(parseBuildTripsForm(values({ lastTrip: '', tripCount: '' }), context)).toEqual({ ok: false, reason: 'missingFields' });
    expect(parseBuildTripsForm(values({ headway: '0' }), context)).toEqual({ ok: false, reason: 'headwayNotPositive' });
    expect(parseBuildTripsForm(values({ headway: 'ten' }), context)).toEqual({ ok: false, reason: 'headwayFormat' });
    expect(parseBuildTripsForm(values({ firstTrip: '6.30' }), context)).toEqual({ ok: false, reason: 'timeFormat' });
    expect(parseBuildTripsForm(values({ lastTrip: 'late' }), context)).toEqual({ ok: false, reason: 'timeFormat' });
  });

  it('applies the domain’s own rules: a Last Trip before the First Trip, and a count outside 1 to 500', () => {
    expect(parseBuildTripsForm(values({ lastTrip: '5:00' }), context)).toEqual({ ok: false, reason: 'lastBeforeFirst' });
    for (const count of ['0', '501', '2.5', '-1']) expect(parseBuildTripsForm(values({ lastTrip: '', tripCount: count }), context), count).toEqual({ ok: false, reason: 'tripCountRange', maximum: 500 });
    expect(parseBuildTripsForm(values({ lastTrip: '', tripCount: '500' }), context)).toMatchObject({ ok: true });
  });

  it('leaves a Last Trip that would build more than 500 Trips for the service to refuse, as before', () => {
    expect(parseBuildTripsForm(values({ firstTrip: '0:00', headway: '1', lastTrip: '23:59' }), context)).toMatchObject({ ok: true });
  });

  it('marks the entries that cannot be used', () => {
    expect(buildTripsFieldProblems(values())).toEqual({ pattern: false, firstTrip: false, headway: false, tripCount: false, lastTrip: false });
    expect(buildTripsFieldProblems(values({ patternId: '', firstTrip: 'x', headway: '0', lastTrip: 'x' }))).toEqual({ pattern: true, firstTrip: true, headway: true, tripCount: false, lastTrip: true });
    expect(buildTripsFieldProblems(values({ lastTrip: '', tripCount: '501' }))).toMatchObject({ tripCount: true, lastTrip: false });
    expect(buildTripsFieldProblems(values({ lastTrip: '', tripCount: '' }))).toMatchObject({ tripCount: true, lastTrip: true });
  });
});

describe('Block assignment impact counts', () => {
  const at = (id: string, sequence: number, type: 'revenueTrip' | 'deadhead', tripId = ''): BlockActivity => type === 'revenueTrip'
    ? { id, type, sequence, tripId }
    : { id, type, sequence, fromNodeId: 'n1', toNodeId: 'n0', minutesAfterPreviousTrip: 5 };
  const block = (id: string, label: string, activities: BlockActivity[]): BlockingBlock => ({ ...stamp, id, scenarioId: 's', blockingScenarioId: 'bs', serviceDayId: 'wd', label, activities });
  const source = block('src', '1', [at('a1', 0, 'revenueTrip', 't1'), at('d1', 1, 'deadhead'), at('a2', 2, 'revenueTrip', 't2'), at('d2', 3, 'deadhead'), at('a3', 4, 'revenueTrip', 't3')]);
  const destination = block('dst', '2', [at('b1', 0, 'revenueTrip', 't4')]);
  const blocks = [source, destination];
  const assignments = new Map([['t1', source], ['t2', source], ['t3', source], ['t4', destination]]);

  it('counts moved, unassigned, and already-there Trips, and the deadheads removed from the source Blocks', () => {
    const impact = tripBlockAssignmentImpact(['t2', 't4', 't9'], 'dst', blocks, assignments);
    expect(impact).toMatchObject({ assignedElsewhereCount: 1, unassignedCount: 1, alreadyThereCount: 1 });
    expect([...impact.movedIds].sort()).toEqual(['t2', 't9']);
    expect(impact.deadheadCount).toBe(2);
  });

  it('counts a deadhead once when both of its Trips move, and none when the Trips are not next to one', () => {
    expect(tripBlockAssignmentImpact(['t1', 't2'], 'dst', blocks, assignments).deadheadCount).toBe(2);
    expect(tripBlockAssignmentImpact(['t3'], 'dst', blocks, assignments).deadheadCount).toBe(1);
    expect(tripBlockAssignmentImpact(['t4'], 'dst', blocks, assignments).deadheadCount).toBe(0);
  });

  it('counts the Trips an unassignment removes, the Blocks they leave, and the deadheads next to them', () => {
    const impact = tripBlockUnassignmentImpact(['t1', 't9'], blocks, assignments);
    expect(impact.assignedTripIds).toEqual(['t1']);
    expect(impact.alreadyUnassignedCount).toBe(1);
    expect(impact.sourceBlockLabels).toEqual(['1']);
    expect(impact.deadheadCount).toBe(1);
    expect(tripBlockUnassignmentImpact(['t2'], blocks, assignments).deadheadCount).toBe(2);
  });
});

describe('when the regeneration undo applies to the schedule on screen (Decision 0046)', () => {
  const shown = [trip('t1', 'a', [100, 700]), trip('t2', 'a', [200, 800])];
  const undo = (overrides: Partial<TripRegenerationUndo> = {}): TripRegenerationUndo => ({ id: 'last', scenarioId: 's', tripProfileId: 'tp', createdAt: stamp.createdAt, beforeTrips: [shown[0]], afterTrips: [shown[0]], ...overrides });

  it('applies when it belongs to the Scenario and Trip Profile and every Trip it covers is shown', () => {
    expect(regenerationUndoApplies(undo(), 's', 'tp', shown)).toBe(true);
    expect(regenerationUndoApplies(undo({ afterTrips: shown }), 's', 'tp', shown)).toBe(true);
  });

  it.each([
    ['there is none', undefined, 's', 'tp'],
    ['it belongs to another Scenario', undo(), 'other', 'tp'],
    ['it belongs to another Trip Profile', undo(), 's', 'other'],
    ['it covers no Trip', undo({ afterTrips: [] }), 's', 'tp'],
    ['a Trip it covers is not shown', undo({ afterTrips: [...shown, trip('t3', 'a', [300, 900])] }), 's', 'tp'],
  ])('does not apply when %s', (_label, snapshot, scenarioId, tripProfileId) => {
    expect(regenerationUndoApplies(snapshot, scenarioId, tripProfileId, shown)).toBe(false);
  });
});

describe('runtimeBandTotalRange', () => {
  it('returns the shortest and longest band totals', () => {
    expect(runtimeBandTotalRange({ bands: [band('a', 0, 100, 3180), band('b', 100, 200, 3900), band('c', 200, 300, 3300)] })).toEqual({ minSeconds: 3180, maxSeconds: 3900 });
  });
  it('returns nothing when there are no bands', () => {
    expect(runtimeBandTotalRange({ bands: [] })).toBeUndefined();
    expect(runtimeBandTotalRange(undefined)).toBeUndefined();
  });
});

describe('tripPatternChipText', () => {
  it('prefers the Pattern Label', () => {
    expect(tripPatternChipText({ name: 'Southbound: Wagon Rd–Evans', directionLabel: 'Full' }, 'Southbound')).toBe('Full');
  });
  it('removes a leading direction name, whatever its case', () => {
    expect(tripPatternChipText({ name: 'Southbound: Wagon Rd–Evans' }, 'Southbound')).toBe('Wagon Rd–Evans');
    expect(tripPatternChipText({ name: 'southbound: Wagon Rd–Evans', directionLabel: '  ' }, 'Southbound')).toBe('Wagon Rd–Evans');
  });
  it('keeps the name when it has no such prefix or would become empty', () => {
    expect(tripPatternChipText({ name: 'Wagon Rd–Evans' }, 'Southbound')).toBe('Wagon Rd–Evans');
    expect(tripPatternChipText({ name: 'Southbound:' }, 'Southbound')).toBe('Southbound:');
    expect(tripPatternChipText(undefined, 'Southbound')).toBe('Unnamed pattern');
  });
});
