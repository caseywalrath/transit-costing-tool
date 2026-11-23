import { describe, expect, it } from 'vitest';
import { locationWarningText, outOfLineWarnings, stopIdElsewhereWarnings, type LocationRow } from './stopLocationChecks';

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

describe('locationWarningText', () => {
  it('reads an out-of-line distance in miles', () => {
    expect(locationWarningText({ key: 'c', kind: 'outOfLine', miles: 6620.4 })).toBe('This location is 6,620 mi out of line with the stops next to it. Check for a missing minus sign or a misplaced decimal point.');
  });
});
