import { describe, expect, it } from 'vitest';
import { metadata } from './ids';
import {
  RouteStopCommandError,
  applyRouteStopEdits,
  deleteRouteStops,
  mergeRouteStops,
  routeStopUsage,
  splitRouteStop,
  splitSharedRouteStops,
} from './routeStopManagement';
import { validateRouteStopSet } from './stops';
import type { PatternPoint, PatternStopPlacement, RoutePattern, RouteStop, RouteStopSet, StopTimingRule } from './types';

const T = metadata('2026-01-01T00:00:00.000Z');

const point = (id: string, nodeId: string, sequence: number): PatternPoint => ({ id, nodeId, sequence, cumulativeMiles: sequence });
const pattern = (id: string, directionId?: string): RoutePattern => ({
  ...T,
  id,
  scenarioId: 's',
  routeId: 'r',
  name: id,
  ...(directionId === undefined ? {} : { directionId }),
  points: [point('pA', 'A', 0), point('pB', 'B', 1), point('pC', 'C', 2), point('pD', 'D', 3)],
});
const placement = (id: string, stopId: string, afterPatternPointId: string, sequence: number, timing: StopTimingRule = 'interpolate'): PatternStopPlacement =>
  ({ id, stopId, afterPatternPointId, sequence, timing });
const stop = (id: string, name = id): RouteStop => ({ id, name });

// Fixture: directions D1, D2, D3. P1 and P2 in D1, P3 in D2, P4 with no direction, P5 in D3.
// Stops: S1 on P1, P2, P3 (shared D1/D2); S2 on P1 only; S3 on P3 and P4 (D2 and no direction); S4 on P1 and P5 (shared D1/D3).
const P1 = pattern('P1', 'D1');
const P2 = pattern('P2', 'D1');
const P3 = pattern('P3', 'D2');
const P4 = pattern('P4');
const P5 = pattern('P5', 'D3');
const PATTERNS = [P1, P2, P3, P4, P5];
const DIRECTION_ORDER = ['D1', 'D2', 'D3'];

const x1 = placement('x1', 'S1', 'pB', 0);
const x2 = placement('x2', 'S2', 'pB', 1);
const x3 = placement('x3', 'S4', 'pC', 0);
const x4 = placement('x4', 'S1', 'pA', 0);
const x5 = placement('x5', 'S1', 'pC', 0);
const x6 = placement('x6', 'S3', 'pC', 1, 'previous');
const x7 = placement('x7', 'S3', 'pA', 0);
const x8 = placement('x8', 'S4', 'pB', 0, 'next');

function setOf(overrides: Partial<RouteStopSet> = {}): RouteStopSet {
  return {
    ...T,
    id: 'set',
    scenarioId: 's',
    routeId: 'r',
    roundingSeconds: 60,
    stops: [stop('S1'), stop('S2'), stop('S3'), stop('S4')],
    placementsByPatternId: {
      P1: [x1, x2, x3],
      P2: [x4],
      P3: [x5, x6],
      P4: [x7],
      P5: [x8],
    },
    timepointStopCodesByPatternId: { P1: { pA: 'S1' } },
    ...overrides,
  };
}

function commandCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof RouteStopCommandError ? error.code : undefined;
  }
  return undefined;
}

describe('routeStopUsage', () => {
  it('counts patterns per direction and marks stops shared only across two or more directions', () => {
    const usage = routeStopUsage(setOf(), PATTERNS);
    expect(usage.get('S1')).toEqual({ stopId: 'S1', patternIds: ['P1', 'P2', 'P3'], countByDirectionId: { D1: 2, D2: 1 }, sharedAcrossDirections: true });
    expect(usage.get('S2')).toEqual({ stopId: 'S2', patternIds: ['P1'], countByDirectionId: { D1: 1 }, sharedAcrossDirections: false });
    expect(usage.get('S3')).toEqual({ stopId: 'S3', patternIds: ['P3', 'P4'], countByDirectionId: { D2: 1, '': 1 }, sharedAcrossDirections: false });
    expect(usage.get('S4')).toEqual({ stopId: 'S4', patternIds: ['P1', 'P5'], countByDirectionId: { D1: 1, D3: 1 }, sharedAcrossDirections: true });
  });
});

describe('applyRouteStopEdits', () => {
  it('trims the name and stop ID, drops a blank stop ID, normalizes the location, and keeps the ID and position', () => {
    const set = setOf();
    const edited = applyRouteStopEdits(set, [
      { id: 'S1', name: '  Main St  ', stopCode: '  1001 ', latitude: 39.7, longitude: -104.9, speedLimitMph: Number.NaN },
      { id: 'S2', name: 'Second', stopCode: '   ' },
    ]);
    expect(edited.stops).toEqual([
      { id: 'S1', name: 'Main St', stopCode: '1001', latitude: 39.7, longitude: -104.9 },
      { id: 'S2', name: 'Second' },
      stop('S3'),
      stop('S4'),
    ]);
    expect(set.stops[0]).toEqual(stop('S1'));
  });

  it('throws stopMissing for an unknown stop ID', () => {
    expect(commandCode(() => applyRouteStopEdits(setOf(), [{ id: 'SX', name: 'Nope' }]))).toBe('stopMissing');
  });
});

describe('splitRouteStop', () => {
  it('moves only the placements of the chosen direction to a new stop inserted after the original, keeping their order and timing', () => {
    const set = setOf();
    const result = splitRouteStop(set, PATTERNS, { stopId: 'S1', directionId: 'D2', newStop: { id: 'S1b', name: 'S1 NB', stopCode: '2001' } });
    expect(result.stops.map((item) => item.id)).toEqual(['S1', 'S1b', 'S2', 'S3', 'S4']);
    expect(result.stops[1]).toEqual({ id: 'S1b', name: 'S1 NB', stopCode: '2001' });
    expect(result.placementsByPatternId.P3).toEqual([{ ...x5, stopId: 'S1b' }, x6]);
    expect(result.placementsByPatternId.P1).toEqual([x1, x2, x3]);
    expect(result.placementsByPatternId.P2).toEqual([x4]);
    expect(set.placementsByPatternId.P3).toEqual([x5, x6]);
  });
});

describe('splitRouteStop refusals', () => {
  it('refuses a split when only one direction uses the stop, including a stop shared only with a pattern that has no direction', () => {
    const newStop = { id: 'N', name: 'N' };
    expect(commandCode(() => splitRouteStop(setOf(), PATTERNS, { stopId: 'S2', directionId: 'D1', newStop }))).toBe('nothingToSplit');
    expect(commandCode(() => splitRouteStop(setOf(), PATTERNS, { stopId: 'S2', directionId: 'D2', newStop }))).toBe('nothingToSplit');
    expect(commandCode(() => splitRouteStop(setOf(), PATTERNS, { stopId: 'S3', directionId: 'D2', newStop }))).toBe('nothingToSplit');
  });
});

describe('splitSharedRouteStops', () => {
  it('renames kept stops with the keep direction suffix, creates one record per other direction, and leaves unshared stops alone', () => {
    let counter = 0;
    const result = splitSharedRouteStops(setOf(), PATTERNS, {
      directionOrder: DIRECTION_ORDER,
      keepDirectionId: 'D1',
      suffixByDirectionId: { D1: 'SB', D2: 'NB' },
      renameKept: true,
      newId: () => `n${++counter}`,
    });
    expect(result.set.stops).toEqual([
      stop('S1', 'S1 SB'),
      { id: 'n1', name: 'S1 NB' },
      stop('S2'),
      stop('S3'),
      stop('S4', 'S4 SB'),
      { id: 'n2', name: 'S4' },
    ]);
    expect(result.set.placementsByPatternId.P3).toEqual([{ ...x5, stopId: 'n1' }, x6]);
    expect(result.set.placementsByPatternId.P5).toEqual([{ ...x8, stopId: 'n2' }]);
    expect(result.set.placementsByPatternId.P1).toEqual([x1, x2, x3]);
    expect(result.created).toEqual([
      { fromStopId: 'S1', stopId: 'n1', directionId: 'D2' },
      { fromStopId: 'S4', stopId: 'n2', directionId: 'D3' },
    ]);
  });

  it('uses the first direction of directionOrder as keeper when keepDirectionId does not use the stop', () => {
    let counter = 0;
    const result = splitSharedRouteStops(setOf(), PATTERNS, {
      directionOrder: DIRECTION_ORDER,
      keepDirectionId: 'D2',
      suffixByDirectionId: { D1: 'A', D2: 'B', D3: 'C' },
      renameKept: true,
      newId: () => `n${++counter}`,
    });
    // S1 keeper is D2 (uses it): D1 gets a new record. S4 keeper is D1 (D2 does not use it): D3 gets a new record.
    expect(result.set.stops).toEqual([
      stop('S1', 'S1 B'),
      { id: 'n1', name: 'S1 A' },
      stop('S2'),
      stop('S3'),
      stop('S4', 'S4 A'),
      { id: 'n2', name: 'S4 C' },
    ]);
    expect(result.set.placementsByPatternId.P1).toEqual([{ ...x1, stopId: 'n1' }, x2, x3]);
    expect(result.set.placementsByPatternId.P5).toEqual([{ ...x8, stopId: 'n2' }]);
    expect(result.created).toEqual([
      { fromStopId: 'S1', stopId: 'n1', directionId: 'D1' },
      { fromStopId: 'S4', stopId: 'n2', directionId: 'D3' },
    ]);
  });
});

describe('deleteRouteStops', () => {
  it('removes the stops and their placements, drops a pattern left empty, and leaves timepoint data unchanged', () => {
    const set = setOf();
    const result = deleteRouteStops(set, ['S1']);
    expect(result.stops.map((item) => item.id)).toEqual(['S2', 'S3', 'S4']);
    expect(result.placementsByPatternId).toEqual({ P1: [x2, x3], P3: [x6], P4: [x7], P5: [x8] });
    expect(result.placementsByPatternId.P2).toBeUndefined();
    expect(result.timepointStopCodesByPatternId).toEqual({ P1: { pA: 'S1' } });
  });
});

describe('mergeRouteStops', () => {
  it('points the merged stop placements at the kept stop and removes the merged stop', () => {
    const result = mergeRouteStops(setOf(), { keepStopId: 'S1', mergeStopIds: ['S2'] });
    expect(result.stops.map((item) => item.id)).toEqual(['S1', 'S3', 'S4']);
    expect(result.placementsByPatternId.P1).toEqual([x1, { ...x2, stopId: 'S1' }, x3]);
  });

  it('makes validateRouteStopSet report a repeated stop in one segment when the kept stop already has that segment', () => {
    const set = setOf({ placementsByPatternId: { P1: [placement('a', 'S1', 'pB', 0), placement('b', 'S2', 'pB', 1)] } });
    const merged = mergeRouteStops(set, { keepStopId: 'S1', mergeStopIds: ['S2'] });
    const findings = validateRouteStopSet(merged, PATTERNS);
    expect(findings.some((finding) => finding.ruleId === 'stopPlacement.repeatedInSegment')).toBe(true);
  });

  it('refuses a merge with no other stop as mergeNeedsTwo and an unknown stop as stopMissing', () => {
    expect(commandCode(() => mergeRouteStops(setOf(), { keepStopId: 'S1', mergeStopIds: [] }))).toBe('mergeNeedsTwo');
    expect(commandCode(() => mergeRouteStops(setOf(), { keepStopId: 'S1', mergeStopIds: ['S1'] }))).toBe('mergeNeedsTwo');
    expect(commandCode(() => mergeRouteStops(setOf(), { keepStopId: 'S1', mergeStopIds: ['SX'] }))).toBe('stopMissing');
  });
});
