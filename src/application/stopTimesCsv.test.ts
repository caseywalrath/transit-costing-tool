import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { Node, RoutePattern, RouteStopSet, Trip } from '../domain/types';
import { csvRows } from '../testSupport/csvRows';
import { stopTimesCsv, type StopTimesCsvInput } from './stopTimesCsv';

// Pattern "Southbound to C" has timepoints Alpha (stop ID 1000), Bravo and Charlie. Elm Street is interpolated between Alpha and Bravo; Oak Avenue is "previous" after Bravo.
const at = '2026-01-01T00:00:00.000Z';
const node = (id: string, name: string): Node => ({ id, scenarioId: 's', routeId: 'r', name, kind: 'timepoint', ...metadata(at) });
const nodes = [node('na', 'Alpha'), node('nb', 'Bravo'), node('nc', 'Charlie')];
const pattern: RoutePattern = { ...metadata(at), id: 'trunk', scenarioId: 's', routeId: 'r', name: 'Southbound to C', points: [{ id: 'p1', nodeId: 'na', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'nb', sequence: 1, cumulativeMiles: 1 }, { id: 'p3', nodeId: 'nc', sequence: 2, cumulativeMiles: 2 }] } as RoutePattern;
const set = (elmName = 'Elm Street'): RouteStopSet => ({
  ...metadata(at), id: 'set', scenarioId: 's', routeId: 'r', roundingSeconds: 60,
  stops: [{ id: 'elm', name: elmName }, { id: 'oak', name: 'Oak Avenue', stopCode: '2002' }],
  placementsByPatternId: { trunk: [{ id: 'x1', stopId: 'elm', afterPatternPointId: 'p1', sequence: 0, timing: 'interpolate' }, { id: 'x2', stopId: 'oak', afterPatternPointId: 'p2', sequence: 0, timing: 'previous' }] },
  timepointStopCodesByPatternId: { trunk: { p1: '1000' } },
});
const trip = (id: string, patternId: string, times: Array<[string, number]>): Trip => ({ ...metadata(at), id, scenarioId: 's', routeId: 'r', serviceDayId: 'weekday', tripProfileId: 'profile', patternId, publicLabel: id, stopTimes: times.map(([patternPointId, time], sequence) => ({ patternPointId, sequence, time })), provenance: { kind: 'generated', manuallyChangedFields: [] } } as unknown as Trip);
const t1 = trip('t1', 'trunk', [['p1', 36000], ['p2', 36600], ['p3', 37200]]);
const t2 = trip('t2', 'trunk', [['p1', 37800], ['p2', 38400], ['p3', 39000]]);
const input = (overrides: Partial<StopTimesCsvInput> = {}): StopTimesCsvInput => ({
  trips: [t1, t2], patterns: [pattern], nodes, set: set(), directionName: 'Southbound', blockLabels: new Map(), ...overrides,
});

describe('stop times CSV export', () => {
  it('writes the header and one row per timepoint or stop of each Trip', () => {
    const rows = csvRows(stopTimesCsv(input()));
    expect(rows[0]).toEqual(['Trip', 'Direction', 'Pattern', 'Stop Order', 'Stop ID', 'Stop Name', 'Timepoint', 'Time', 'Block']);
    expect(rows).toHaveLength(11);
    expect(rows.slice(1, 6)).toEqual([
      ['1', 'Southbound', 'Southbound to C', '1', '1000', 'Alpha', 'Yes', '10:00', ''],
      ['1', 'Southbound', 'Southbound to C', '2', '', 'Elm Street', 'No', '10:05', ''],
      ['1', 'Southbound', 'Southbound to C', '3', '', 'Bravo', 'Yes', '10:10', ''],
      ['1', 'Southbound', 'Southbound to C', '4', '2002', 'Oak Avenue', 'No', '10:10', ''],
      ['1', 'Southbound', 'Southbound to C', '5', '', 'Charlie', 'Yes', '10:20', ''],
    ]);
  });

  it('numbers Trips by their place in the input, and skips a Trip whose pattern is missing', () => {
    const orphan = trip('orphan', 'gone', [['p1', 30000], ['p2', 30600]]);
    const rows = csvRows(stopTimesCsv(input({ trips: [orphan, t2] })));
    expect(rows.slice(1).map((row) => row[0])).toEqual(['2', '2', '2', '2', '2']);
  });

  it('carries the Block label of a Trip in a Block, and leaves it empty otherwise', () => {
    const rows = csvRows(stopTimesCsv(input({ blockLabels: new Map([['t2', 'Block 7']]) })));
    expect(rows[1].at(-1)).toBe('');
    expect(rows[6].at(-1)).toBe('Block 7');
  });

  it('quotes a stop name with a comma or quotes, and protects a stop name that starts with =', () => {
    const quoted = csvRows(stopTimesCsv(input({ set: set('Elm, "North" St') })));
    expect(quoted[2][5]).toBe('Elm, "North" St');
    const protectedRows = csvRows(stopTimesCsv(input({ set: set('=Elm'), directionName: '+South', blockLabels: new Map([['t1', '-1']]) })));
    expect(protectedRows[2][5]).toBe("'=Elm");
    expect(protectedRows[1][1]).toBe("'+South");
    expect(protectedRows[1].at(-1)).toBe("'-1");
  });

  it('writes empty times for a Trip with no time at one of its timepoints', () => {
    const partial = trip('partial', 'trunk', [['p1', 36000], ['p3', 37200]]);
    const rows = csvRows(stopTimesCsv(input({ trips: [partial] })));
    expect(rows[2].slice(7)).toEqual(['', '']);
  });
});
