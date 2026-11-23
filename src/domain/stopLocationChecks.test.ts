import { describe, expect, it } from 'vitest';
import { locationWarningText, outOfLineWarnings, outOfOrderWarnings, patternLocationSegments, stopIdElsewhereWarnings, type LocationRow, type LocationSegment } from './stopLocationChecks';
import type { RoutePattern } from './types';

// Federal Boulevard runs north and south along longitude -105.025; 0.01 degree of latitude is about 0.69 mile.
const row = (key: string, latitude?: number, longitude = -105.025, stopCode?: string): LocationRow => ({
  key, label: key, ...(stopCode ? { stopCode } : {}), ...(latitude === undefined ? {} : { location: { latitude, longitude } }),
});
const line = [row('a', 39.70), row('b', 39.71), row('c', 39.72), row('d', 39.73), row('e', 39.74)];

describe('outOfLineWarnings (option 1)', () => {
  it('gives no warning for stops along a line', () => {
    expect(outOfLineWarnings(line)).toEqual([]);
  });

  it('names only the row with a missing minus sign, not its neighbours', () => {
    const rows = line.map((item) => item.key === 'c' ? row('c', 39.72, 105.025) : item);
    expect(outOfLineWarnings(rows).map((warning) => warning.key)).toEqual(['c']);
  });

  it('names a row with a shifted decimal point', () => {
    const rows = line.map((item) => item.key === 'c' ? row('c', 39.72, -105.25) : item);
    expect(outOfLineWarnings(rows).map((warning) => warning.key)).toEqual(['c']);
  });

  it('names a wrong first row by its distance to the next one, and not the next one', () => {
    const rows = line.map((item) => item.key === 'a' ? row('a', 39.70, 105.025) : item);
    expect(outOfLineWarnings(rows).map((warning) => warning.key)).toEqual(['a']);
  });

  it('names a wrong last row', () => {
    const rows = line.map((item) => item.key === 'e' ? row('e', 3.974) : item);
    expect(outOfLineWarnings(rows).map((warning) => warning.key)).toEqual(['e']);
  });

  it('skips rows without a location, comparing across them', () => {
    const rows = [row('a', 39.70), row('b'), row('c', 39.72, 105.025), row('d'), row('e', 39.74)];
    expect(outOfLineWarnings(rows).map((warning) => warning.key)).toEqual(['c']);
  });

  it('accepts a short side trip of under a mile', () => {
    // b is about 0.4 mile east of the line.
    const rows = [row('a', 39.70), row('b', 39.705, -105.018), row('c', 39.71)];
    expect(outOfLineWarnings(rows)).toEqual([]);
  });

  it('names both rows when only two are located and they are far apart', () => {
    expect(outOfLineWarnings([row('a', 39.70), row('b', 39.70, 105.025)]).map((warning) => warning.key)).toEqual(['a', 'b']);
  });

  it('gives no warning with fewer than two located rows', () => {
    expect(outOfLineWarnings([row('a', 39.70, 105.025), row('b')])).toEqual([]);
  });
});

describe('stopIdElsewhereWarnings (option 4)', () => {
  it('names the other place of an entered stop ID more than 30 m away', () => {
    const rows = [row('here', 39.737734, 105.024986, '13703')];
    const others = [row('Decatur on *BRT-S', 39.73773401, -105.0249863, '13703')];
    const [warning] = stopIdElsewhereWarnings(rows, others);
    expect(warning).toMatchObject({ key: 'here', kind: 'stopIdElsewhere', stopCode: '13703', otherLabel: 'Decatur on *BRT-S' });
    expect(locationWarningText(warning)).toMatch(/^Stop ID 13703 is [\d,]+ mi from here at Decatur on \*BRT-S\.$/);
  });

  it('gives metres for a nearby conflict, and nothing within 30 m', () => {
    const near = stopIdElsewhereWarnings([row('nb', 39.655756, -104.999554, '26175')], [row('sb', 39.655319, -104.999591, '26175')]);
    expect(locationWarningText(near[0])).toBe('Stop ID 26175 is 49 m from here at sb.');
    expect(stopIdElsewhereWarnings([row('nb', 39.655756, -104.999554, '26175')], [row('sb', 39.6558, -104.999554, '26175')])).toEqual([]);
  });

  it('compares rows of the same pattern with each other, and trims the stop ID', () => {
    const warnings = stopIdElsewhereWarnings([row('a', 39.70, -105.025, ' 1 '), row('b', 39.71, -105.025, '1')], []);
    expect(warnings.map((warning) => warning.key)).toEqual(['a', 'b']);
  });

  it('ignores rows without a stop ID or a location', () => {
    expect(stopIdElsewhereWarnings([row('a', 39.70), row('b', undefined, -105.025, '1')], [row('c', 39.80, -105.025, '1')])).toEqual([]);
  });

  it('names the farthest of several other places', () => {
    const [warning] = stopIdElsewhereWarnings([row('a', 39.70, -105.025, '1')], [row('near', 39.701, -105.025, '1'), row('far', 39.75, -105.025, '1')]);
    expect(warning).toMatchObject({ otherLabel: 'far' });
  });
});

describe('outOfOrderWarnings (rule A)', () => {
  // A segment due north, 0.04 degree (about 2.76 mi) long, entered as 2.8 mi.
  const segment = (stops: LocationRow[], miles = 2.8): LocationSegment => ({ opening: row('A', 39.70), closing: row('E', 39.74), miles, stops });

  it('gives no warning for stops in order', () => {
    expect(outOfOrderWarnings([segment([row('b', 39.71), row('c', 39.72), row('d', 39.73)])])).toEqual([]);
  });

  it('names the stop that comes back, with the stop it falls behind', () => {
    const [warning, ...rest] = outOfOrderWarnings([segment([row('b', 39.71), row('d', 39.73), row('c', 39.72), row('e', 39.735)])]);
    expect(rest).toEqual([]);
    expect(warning).toMatchObject({ key: 'c', kind: 'outOfOrder', previousLabel: 'd' });
    expect(warning.kind === 'outOfOrder' && warning.meters).toBeCloseTo(1112, -1);
    expect(locationWarningText(warning)).toMatch(/^This stop is 1,?1\d\d m behind d along the segment\. Check the order of the stops or their coordinates\.$/);
  });

  it('allows a stop up to 50 m behind, and a stop beside the line', () => {
    // 0.0004 degree is about 44 m; c is also about 400 m east of the line.
    expect(outOfOrderWarnings([segment([row('b', 39.7204), row('c', 39.72, -105.0203)])])).toEqual([]);
  });

  it('names a stop behind the opening timepoint, and a closing timepoint behind the last stop', () => {
    expect(outOfOrderWarnings([segment([row('b', 39.69)])]).map((warning) => warning.key)).toEqual(['b']);
    expect(outOfOrderWarnings([segment([row('b', 39.75)])]).map((warning) => warning.key)).toEqual(['E']);
  });

  it('skips a curved segment, whose chord is under 70% of its entered miles', () => {
    expect(outOfOrderWarnings([segment([row('d', 39.73), row('c', 39.72)], 4.5)])).toEqual([]);
  });

  it('skips a segment with an unlocated timepoint, and unlocated stops', () => {
    expect(outOfOrderWarnings([{ ...segment([row('d', 39.73), row('c', 39.72)]), closing: row('E') }])).toEqual([]);
    expect(outOfOrderWarnings([segment([row('b', 39.73), row('x'), row('c', 39.735)])])).toEqual([]);
  });
});

describe('patternLocationSegments', () => {
  it('reads each segment with its timepoints, miles and placed stops', () => {
    const pattern = { id: 'p', points: [{ id: 'p1', nodeId: 'n1', sequence: 0, cumulativeMiles: 0 }, { id: 'p2', nodeId: 'n2', sequence: 1, cumulativeMiles: 2.5 }] } as unknown as RoutePattern;
    const [only] = patternLocationSegments(pattern, [{ id: 's', name: ' Pecos ', latitude: 39.71, longitude: -105 }], [{ id: 'pl', stopId: 's', afterPatternPointId: 'p1', sequence: 0, timing: 'interpolate' }], { p1: { latitude: 39.7, longitude: -105 } }, (id) => `TP ${id}`);
    expect(only).toEqual({
      opening: { key: 'point:p1', label: 'TP p1', location: { latitude: 39.7, longitude: -105 } },
      closing: { key: 'point:p2', label: 'TP p2', location: undefined },
      miles: 2.5,
      stops: [{ key: 'stop:s', label: 'Pecos', location: expect.objectContaining({ latitude: 39.71 }) }],
    });
  });
});

describe('locationWarningText', () => {
  it('reads an out-of-line distance in miles', () => {
    expect(locationWarningText({ key: 'c', kind: 'outOfLine', miles: 6620.4 })).toBe('This location is 6,620 mi out of line with the stops next to it. Check for a missing minus sign or a misplaced decimal point.');
  });
});
