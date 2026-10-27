// Review package P15 (issue I-074c, finding 4-014). The Trips and Runtime rules that App.tsx used to compute for itself, now in the
// domain, each with a test: Runtime band editing, the Route's one calculation method, reverse-copy candidates, trip band shading, shift minutes, duplicate
// departures, display rounding, headways, the usable-Pattern rule, and a Pattern's total distance.
import { beforeEach, describe, expect, it } from 'vitest';
import { setIdGenerator } from './ids';
import { metadata } from './ids';
import { isUsablePattern, orderDirections, usableDirectionPatterns } from './directions';
import { sortServiceDays } from './serviceDays';
import { patternTotalMiles } from './patterns';
import { addRuntimeBand, describeTripBandShading, duplicateRuntimeBand, removeRuntimeBand, reverseRuntimeCandidates, routeRuntimeCalculationMethod, unifyRouteRuntimeCalculationMethods, updateRuntimeBand } from './runtime';
import { formatNetShift, formatStagedShift, parseShiftSeconds } from './tripShift';
import { calculateTimepointHeadways, duplicateDepartureKeys, roundServiceTimeToMinute } from './trips';
import type { RouteDirection, RoutePattern, RuntimeBand, RuntimeProfile, ServiceDayDefinition, Trip } from './types';

const stamp = metadata('2026-10-23T00:00:00.000Z');
const point = (id: string, nodeId: string, sequence: number, cumulativeMiles = 0, directionColumnId?: string) => ({ id, nodeId, sequence, cumulativeMiles, ...(directionColumnId ? { directionColumnId } : {}) });
const pattern = (id: string, nodes: string[], overrides: Partial<RoutePattern> = {}): RoutePattern => ({
  ...stamp, id, scenarioId: 's', routeId: 'r', name: id, directionId: 'out', sequence: 0,
  points: nodes.map((nodeId, index) => point(`${id}-${index}`, nodeId, index, index, `col-${index}`)), ...overrides,
});
const band = (id: string, sequence: number, startTime: number, endTime: number, segments: number[]): RuntimeBand => ({ id, label: `Band ${id}`, sequence, startTime, endTime, segmentRuntimeSeconds: segments });
const profile = (bands: RuntimeBand[], calculationMethod?: RuntimeProfile['calculationMethod']): RuntimeProfile => ({ ...stamp, id: 'rp', scenarioId: 's', routeId: 'r', patternId: 'a', name: 'Default', bands, ...(calculationMethod ? { calculationMethod } : {}) });
const trip = (id: string, patternId: string, times: number[], overrides: Partial<Trip> = {}): Trip => ({
  ...stamp, id, scenarioId: 's', routeId: 'r', serviceDayId: 'wd', patternId, tripProfileId: 'tp',
  stopTimes: times.map((time, index) => ({ patternPointId: `${patternId}-${index}`, sequence: index, time })),
  provenance: { kind: 'generated', creationMethod: 'generated', manuallyChangedFields: [] }, ...overrides,
});

let nextId = 0;
beforeEach(() => { nextId = 0; setIdGenerator(() => `id-${++nextId}`); });

describe('Runtime band editing', () => {
  const base = profile([band('b1', 0, 0, 3600, [60, 120]), band('b2', 1, 3600, 7200, [90, 150])]);

  it('adds a zero-length band with one zero runtime per segment, numbered after the last band', () => {
    const next = addRuntimeBand(base, 2);
    expect(next.bands).toHaveLength(3);
    expect(next.bands[2]).toEqual({ id: 'id-1', label: 'Time period', sequence: 2, startTime: 0, endTime: 0, segmentRuntimeSeconds: [0, 0] });
    expect(base.bands).toHaveLength(2);
  });

  it('updates one band and leaves the others and the original untouched', () => {
    const next = updateRuntimeBand(base, 1, { endTime: 9000 });
    expect(next.bands.map((item) => item.endTime)).toEqual([3600, 9000]);
    expect(base.bands[1].endTime).toBe(7200);
  });

  it('duplicates a band right after it with a new id, its own runtimes, and renumbered sequences', () => {
    const next = duplicateRuntimeBand(base, 0);
    expect(next.bands.map((item) => [item.id, item.sequence])).toEqual([['b1', 0], ['id-1', 1], ['b2', 2]]);
    expect(next.bands[1].segmentRuntimeSeconds).toEqual([60, 120]);
    expect(next.bands[1].segmentRuntimeSeconds).not.toBe(base.bands[0].segmentRuntimeSeconds);
    expect(duplicateRuntimeBand(base, 9)).toBe(base);
  });

  it('removes a band and renumbers the rest', () => {
    const next = removeRuntimeBand(base, 0);
    expect(next.bands.map((item) => [item.id, item.sequence])).toEqual([['b2', 0]]);
  });
});

describe('one calculation method per Route (Decision 0045)', () => {
  const withMethod = (id: string, routeId: string, method?: RuntimeProfile['calculationMethod']): RuntimeProfile => ({ ...profile([band(`${id}-b`, 0, 0, 3600, [60])], method), id, routeId, calculationRevision: 2 });

  it('takes the method most profiles use, counts a missing method as single band, and breaks a tie toward segment start', () => {
    expect(routeRuntimeCalculationMethod([])).toBe('segmentStart');
    expect(routeRuntimeCalculationMethod([withMethod('a', 'r', undefined), withMethod('b', 'r', 'singleBand'), withMethod('c', 'r', 'segmentStart')])).toBe('singleBand');
    expect(routeRuntimeCalculationMethod([withMethod('a', 'r', 'singleBand'), withMethod('b', 'r', 'segmentStart')])).toBe('segmentStart');
    expect(routeRuntimeCalculationMethod([withMethod('a', 'r', 'blendSegments')])).toBe('blendSegments');
  });

  it('unifies each Route separately and raises the calculation revision only of profiles whose method changes', () => {
    const profiles = [withMethod('a', 'r1', 'singleBand'), withMethod('b', 'r1', 'singleBand'), withMethod('c', 'r1', 'segmentStart'), withMethod('d', 'r2', 'segmentStart')];
    const result = unifyRouteRuntimeCalculationMethods(profiles, '2026-10-27T00:00:00.000Z');
    expect(result.changedProfileIds).toEqual(['c']);
    expect(result.profiles.map((item) => [item.id, item.calculationMethod, item.calculationRevision])).toEqual([['a', 'singleBand', 2], ['b', 'singleBand', 2], ['c', 'singleBand', 3], ['d', 'segmentStart', 2]]);
    expect(result.profiles[0]).toBe(profiles[0]);
  });

  it('sets a chosen method on every profile and leaves a missing single-band method as it is', () => {
    const profiles = [withMethod('a', 'r', undefined), withMethod('b', 'r', 'segmentStart')];
    expect(unifyRouteRuntimeCalculationMethods(profiles, '2026-10-27T00:00:00.000Z', 'singleBand').changedProfileIds).toEqual(['b']);
    expect(unifyRouteRuntimeCalculationMethods(profiles, '2026-10-27T00:00:00.000Z', 'segmentStart').changedProfileIds).toEqual(['a']);
  });
});

describe('reverse-copy candidates', () => {
  const selected = pattern('a', ['n1', 'n2', 'n3']);
  it('lists the other Patterns that run the same nodes in the opposite order', () => {
    const reverse = pattern('b', ['n3', 'n2', 'n1']);
    const sameDirection = pattern('c', ['n1', 'n2', 'n3']);
    const shorter = pattern('d', ['n2', 'n1']);
    const mixed = pattern('e', ['n3', 'n1', 'n2']);
    expect(reverseRuntimeCandidates(selected, [selected, reverse, sameDirection, shorter, mixed]).map((item) => item.id)).toEqual(['b']);
    expect(reverseRuntimeCandidates(undefined, [reverse])).toEqual([]);
  });
  it('is not its own candidate, even when its nodes read the same both ways', () => {
    const palindrome = pattern('p', ['n1', 'n2', 'n1']);
    expect(reverseRuntimeCandidates(palindrome, [palindrome])).toEqual([]);
    expect(reverseRuntimeCandidates(palindrome, [palindrome, { ...palindrome, id: 'q' }]).map((item) => item.id)).toEqual(['q']);
  });
});

describe('trip band shading (render-time Runtime calls)', () => {
  const two = pattern('a', ['n1', 'n2', 'n3']);
  const bands = [band('b1', 0, 0, 3600, [600, 600]), band('b2', 1, 3600, 7200, [300, 300])];
  const single = profile(bands, 'singleBand');
  const segmentStart = profile(bands, 'segmentStart');
  const blend = profile(bands, 'blendSegments');

  it('names the band that holds a single-band Trip’s departure', () => {
    expect(describeTripBandShading(trip('t', 'a', [100, 700, 1300]), two, single, false).singleBand?.id).toBe('b1');
    expect(describeTripBandShading(trip('t', 'a', [3700, 4000, 4300]), two, single, false).singleBand?.id).toBe('b2');
  });

  it('gives segment contributions for a segment-start Trip whose stored times match the calculation', () => {
    const matching = trip('t', 'a', [100, 700, 1300]);
    const shading = describeTripBandShading(matching, two, segmentStart, false);
    expect(shading.singleBand).toBeUndefined();
    expect(shading.segments?.map((segment) => segment.contributions.map((part) => part.bandId))).toEqual([['b1'], ['b1']]);
  });

  it('shows no segment shading when the stored times differ from the calculation, when the Trip is marked changed, or when nothing is shown', () => {
    expect(describeTripBandShading(trip('t', 'a', [100, 705, 1300]), two, segmentStart, false)).toEqual({});
    expect(describeTripBandShading(trip('t', 'a', [100, 700, 1300]), two, segmentStart, true)).toEqual({});
    expect(describeTripBandShading(trip('t', 'a', [100, 700, 1300]), two, undefined, false)).toEqual({});
    expect(describeTripBandShading(trip('t', 'a', []), two, blend, false)).toEqual({});
  });
});

describe('Shift minutes', () => {
  it('turns a whole positive number of minutes into seconds and refuses anything else', () => {
    expect(parseShiftSeconds('1')).toBe(60);
    expect(parseShiftSeconds(' 15 ')).toBe(900);
    for (const bad of ['', '0', '-3', '1.5', 'abc', '1e1x']) expect(parseShiftSeconds(bad), bad).toBeUndefined();
  });
  it('labels the net Shift and the staged Shift in minutes, earlier or later', () => {
    expect(formatNetShift(0)).toBe('No net shift');
    expect(formatNetShift(60)).toBe('1 minute later');
    expect(formatNetShift(-120)).toBe('2 minutes earlier');
    expect(formatStagedShift(undefined)).toBeUndefined();
    expect(formatStagedShift(0)).toBeUndefined();
    expect(formatStagedShift(60)).toBe('Staged 1 minute later');
    expect(formatStagedShift(-300)).toBe('Staged 5 minutes earlier');
  });
});

describe('duplicate departures and display rounding', () => {
  it('flags a Pattern and first time that more than one Trip uses', () => {
    const trips = [trip('t1', 'a', [600, 900]), trip('t2', 'a', [600, 950]), trip('t3', 'a', [660, 900]), trip('t4', 'b', [600, 900])];
    expect([...duplicateDepartureKeys(trips)]).toEqual(['a:600']);
    expect(duplicateDepartureKeys([])).toEqual(new Set());
  });
  it('never calls a Trip with no times a duplicate departure', () => {
    expect([...duplicateDepartureKeys([trip('t1', 'a', []), trip('t2', 'a', [])])]).toEqual([]);
  });
  it('rounds a clock time to the nearest minute, exactly 30 seconds up (Decision 0033)', () => {
    expect([29, 30, 31, 89, 90, 0].map(roundServiceTimeToMinute)).toEqual([0, 60, 60, 60, 120, 0]);
    expect(roundServiceTimeToMinute(86399)).toBe(86400);
  });
});

describe('timepoint headways', () => {
  const a = pattern('a', ['n1', 'n2']);
  it('gives each Trip the previous time at every column it serves, in time order', () => {
    const trips = [trip('t2', 'a', [660, 900]), trip('t1', 'a', [600, 840]), trip('t3', 'a', [720, 960])];
    const headways = calculateTimepointHeadways(trips, [a]);
    expect([...headways.get('col-0')!].map(([id, value]) => [id, value.time, value.previousTime])).toEqual([['t1', 600, undefined], ['t2', 660, 600], ['t3', 720, 660]]);
    expect(headways.get('col-1')!.get('t3')).toEqual({ time: 960, previousTime: 900 });
  });
  it('breaks a tie in the order the Trips were given, and skips a Pattern that is not known', () => {
    const headways = calculateTimepointHeadways([trip('x', 'a', [600, 800]), trip('y', 'a', [600, 800]), trip('z', 'missing', [100, 200])], [a]);
    expect(headways.get('col-0')!.get('y')).toEqual({ time: 600, previousTime: 600 });
    expect([...headways.get('col-0')!.keys()]).toEqual(['x', 'y']);
  });
});

describe('the usable-Pattern rule and a Pattern’s total distance', () => {
  it('a Pattern needs at least two points', () => {
    expect(isUsablePattern(pattern('a', ['n1']))).toBe(false);
    expect(isUsablePattern(pattern('a', ['n1', 'n2']))).toBe(true);
    expect(isUsablePattern(pattern('a', []))).toBe(false);
  });
  it('lists the usable Patterns of one Direction in sequence order, ties by id', () => {
    const list = [pattern('z', ['n1', 'n2'], { sequence: 1 }), pattern('y', ['n1', 'n2'], { sequence: 0 }), pattern('x', ['n1', 'n2'], { sequence: 0 }), pattern('w', ['n1'], { sequence: 0 }), pattern('v', ['n1', 'n2'], { directionId: 'in' })];
    expect(usableDirectionPatterns(list, 'out').map((item) => item.id)).toEqual(['x', 'y', 'z']);
  });
  it('a total of 0, or no total, is no distance (incomplete mileage, P12)', () => {
    expect(patternTotalMiles(pattern('a', ['n1', 'n2']))).toBe(1);
    expect(patternTotalMiles({ ...pattern('a', ['n1', 'n2']), points: [point('p0', 'n1', 0, 0), point('p1', 'n2', 1, 0)] })).toBeUndefined();
    expect(patternTotalMiles({ ...pattern('a', ['n1', 'n2']), points: [] })).toBeUndefined();
    expect(patternTotalMiles({ ...pattern('a', ['n1', 'n2']), points: [point('p0', 'n1', 0, 0), point('p1', 'n2', 1, Number.NaN)] })).toBeUndefined();
  });
});

describe('ordering of Service days and Directions on the screens', () => {
  const day = (id: string, kind: ServiceDayDefinition['kind'], sequence: number): ServiceDayDefinition => ({ ...stamp, id, scenarioId: 's', kind, name: id, annualServiceDays: 0, sequence });
  it('lists Service days Weekday, Saturday, Sunday, Holiday, custom, then by sequence and by id', () => {
    const days = [day('z', 'custom', 0), day('h', 'holiday', 0), day('b', 'weekday', 1), day('a', 'weekday', 1), day('s', 'sunday', 0), day('w', 'weekday', 0), day('sa', 'saturday', 0)];
    expect(sortServiceDays(days).map((item) => item.id)).toEqual(['w', 'a', 'b', 'sa', 's', 'h', 'z']);
  });
  const direction = (id: string, sequence: number, columns: string[]): RouteDirection => ({ ...stamp, id, scenarioId: 's', routeId: 'r', name: id, sequence, columns: columns.map((column, index) => ({ id: column, nodeId: `n-${column}`, sequence: 5 - index })) } as RouteDirection);
  it('lists Directions by sequence, then id, and a Direction’s columns by their sequence', () => {
    const ordered = orderDirections([direction('in', 1, ['x']), direction('b', 0, ['c1', 'c2']), direction('a', 0, ['c3'])]);
    expect(ordered.map((item) => item.id)).toEqual(['a', 'b', 'in']);
    expect(ordered[1].columns.map((column) => column.id)).toEqual(['c2', 'c1']);
  });
});
