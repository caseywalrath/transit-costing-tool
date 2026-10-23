import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { RoutePattern, Trip } from '../domain/types';
import { csvRows } from '../testSupport/csvRows';
import { parseTripTableCsv, tripTableCsv } from './tripTableCsv';

describe('Trips table CSV interchange', () => {
  it('round trips IDs, labels, timepoints, and second-level schedule times', () => {
    const pattern: RoutePattern = { ...metadata(), id: 'pattern', scenarioId: 'scenario', routeId: 'route', name: 'Outbound', points: [
      { id: 'p1', nodeId: 'n1', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'n2', sequence: 1, cumulativeMiles: 2 },
    ] };
    const trip: Trip = { ...metadata(), id: 'trip', scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', tripProfileId: 'profile', patternId: pattern.id, publicLabel: 'Trip, A', stopTimes: [
      { patternPointId: 'p1', sequence: 0, time: 18000 }, { patternPointId: 'p2', sequence: 1, time: 18435 },
    ], provenance: { kind: 'generated', manuallyChangedFields: [] } };
    const parsed = parseTripTableCsv(tripTableCsv([trip], [pattern], (nodeId) => nodeId === 'n1' ? 'Central' : 'Airport'));
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toEqual([{ tripId: 'trip', patternId: 'pattern', publicLabel: 'Trip, A', stopTimes: [
      { patternPointId: 'p1', time: 18000 }, { patternPointId: 'p2', time: 18435 },
    ] }]);
  });

  describe('names, labels, and formula protection (P13)', () => {
    const pattern: RoutePattern = { ...metadata(), id: 'pattern', scenarioId: 'scenario', routeId: 'route', name: 'Outbound', points: [
      { id: 'p1', nodeId: 'n1', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'n2', sequence: 1, cumulativeMiles: 2 },
    ] };
    const trip = (publicLabel: string): Trip => ({ ...metadata(), id: 'trip', scenarioId: 'scenario', routeId: 'route', serviceDayId: 'weekday', tripProfileId: 'profile', patternId: pattern.id, publicLabel, stopTimes: [
      { patternPointId: 'p1', sequence: 0, time: 18000 }, { patternPointId: 'p2', sequence: 1, time: 18435 },
    ], provenance: { kind: 'generated', manuallyChangedFields: [] } });
    const names = (nodeId: string) => nodeId === 'n1' ? 'Central' : 'Airport';

    it.each([
      ['a comma', { ...pattern, name: 'SB, Express' }, names],
      ['a double quote', { ...pattern, name: 'SB "Express"' }, names],
      ['a line break', { ...pattern, name: 'SB\nExpress' }, names],
      ['a comma in a Node name', pattern, () => 'Federal, Colfax'],
      ['a double quote in a Node name', pattern, () => 'The "Hub"'],
      ['a colon', { ...pattern, name: 'SB: Express' }, () => 'Node: 1'],
    ])('round trips a Pattern or Node name with %s', (_label, source, nodeName) => {
      const parsed = parseTripTableCsv(tripTableCsv([trip('A')], [source], nodeName));
      expect(parsed.issues).toEqual([]);
      expect(parsed.rows).toEqual([{ tripId: 'trip', patternId: 'pattern', publicLabel: 'A', stopTimes: [{ patternPointId: 'p1', time: 18000 }, { patternPointId: 'p2', time: 18435 }] }]);
    });

    it.each(['=1+1', '+1+1', '-2+3', '@SUM(1,1)', "'=1+1", '-5 stops'])('writes the label %j so a spreadsheet reads text, and reads it back unchanged', (label) => {
      const csv = tripTableCsv([trip(label)], [pattern], names);
      const labelCell = csvRows(csv)[1][2];
      expect(labelCell).toBe(`'${label}`);
      expect(parseTripTableCsv(csv).rows[0].publicLabel).toBe(label);
    });

    it('leaves identifiers and ordinary labels alone', () => {
      const csv = tripTableCsv([{ ...trip("Late 'run'"), id: '-trip-1', patternId: '=pattern' }], [{ ...pattern, id: '=pattern' }], names);
      expect(csvRows(csv)[1].slice(0, 3)).toEqual(['-trip-1', '=pattern', "Late 'run'"]);
    });
  });
});

