import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { RoutePattern, Trip } from '../domain/types';
import { csvRows } from '../testSupport/csvRows';
import { tripTableCsv, type TripTableCsvInput } from './tripTableCsv';

// A trunk Pattern (A, B, C) and a branch Pattern (A, B, D) share the Direction columns A and B.
const point = (id: string, nodeId: string, sequence: number, directionColumnId: string) => ({ id, nodeId, sequence, cumulativeMiles: sequence, directionColumnId });
const pattern = (id: string, name: string, points: RoutePattern['points']): RoutePattern => ({ ...metadata(), id, scenarioId: 'scenario', routeId: 'route', name, points });
const trunk = pattern('trunk', 'Southbound to C', [point('t1', 'a', 0, 'colA'), point('t2', 'b', 1, 'colB'), point('t3', 'c', 2, 'colC')]);
const branch = pattern('branch', 'Southbound to D', [point('b1', 'a', 0, 'colA'), point('b2', 'b', 1, 'colB'), point('b3', 'd', 2, 'colD')]);
const trip = (id: string, patternId: string, times: Array<[string, number]>): Trip => ({ ...metadata(), id, scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', tripProfileId: 'profile', patternId, publicLabel: 'Label', stopTimes: times.map(([patternPointId, time], sequence) => ({ patternPointId, sequence, time })), provenance: { kind: 'generated', manuallyChangedFields: [] } });
const columns = [{ id: 'colA', name: 'Alpha' }, { id: 'colB', name: 'Bravo' }, { id: 'colC', name: 'Charlie' }, { id: 'colD', name: 'Delta' }];
const input = (overrides: Partial<TripTableCsvInput> = {}): TripTableCsvInput => ({
  trips: [trip('1', 'trunk', [['t1', 18000], ['t2', 18300], ['t3', 18900]]), trip('2', 'branch', [['b1', 19800], ['b2', 20100], ['b3', 20760]])],
  patterns: [trunk, branch], directionName: 'Southbound', columns, blockLabels: new Map(), connections: new Map(), ...overrides,
});

describe('Trips table CSV export', () => {
  it('writes the Trips table columns without IDs, point numbers, or labels', () => {
    const [header] = csvRows(tripTableCsv(input()));
    expect(header).toEqual(['Direction', 'Pattern', 'Alpha', 'Bravo', 'Charlie', 'Delta', 'Run Time', 'Layover', 'Deadhead', 'Next Trip', 'Block']);
  });

  it('leaves out timepoint columns no Trip has a time in', () => {
    const [header, row] = csvRows(tripTableCsv(input({ trips: [trip('1', 'trunk', [['t1', 18000], ['t2', 18300], ['t3', 18900]])] })));
    expect(header).toEqual(['Direction', 'Pattern', 'Alpha', 'Bravo', 'Charlie', 'Run Time', 'Layover', 'Deadhead', 'Next Trip', 'Block']);
    expect(row.slice(2, 5)).toEqual(['5:00', '5:05', '5:15']);
  });

  it('interlaces Patterns that share Direction columns, one row per Trip', () => {
    const rows = csvRows(tripTableCsv(input()));
    expect(rows[1]).toEqual(['Southbound', 'Southbound to C', '5:00', '5:05', '5:15', '', ':15', '', '', '', '']);
    expect(rows[2]).toEqual(['Southbound', 'Southbound to D', '5:30', '5:35', '', '5:46', ':16', '', '', '', '']);
  });

  it('writes run time with seconds, layover, deadhead, next trip, and Block for a Trip in a Block', () => {
    const connections = new Map([['1', { connection: { usableLayoverSeconds: 600, deadhead: {} }, deadheadSeconds: 240, nextTripStart: 19800 }]]);
    const rows = csvRows(tripTableCsv(input({ trips: [trip('1', 'trunk', [['t1', 18000], ['t3', 18930]])], blockLabels: new Map([['1', 'Block 7']]), connections })));
    expect(rows[1].slice(-5)).toEqual([':15:30', '0:10', '0:04', '5:30', 'Block 7']);
  });

  it('leaves connection columns empty for a Trip that is not in a Block', () => {
    const connections = new Map([['1', { connection: { usableLayoverSeconds: 600 }, nextTripStart: 19800 }]]);
    expect(csvRows(tripTableCsv(input({ connections })))[1].slice(7)).toEqual(['', '', '', '']);
  });

  it('quotes names with commas or quotes and protects text that a spreadsheet would run as a formula', () => {
    const csv = tripTableCsv(input({ directionName: '=SB', columns: [{ id: 'colA', name: 'Federal, "Colfax"' }], patterns: [{ ...trunk, name: '+Express' }], blockLabels: new Map([['1', '-1']]) }));
    const rows = csvRows(csv);
    expect(rows[0][2]).toBe('Federal, "Colfax"');
    expect(rows[1][0]).toBe("'=SB");
    expect(rows[1][1]).toBe("'+Express");
    expect(rows[1].at(-1)).toBe("'-1");
  });
});
