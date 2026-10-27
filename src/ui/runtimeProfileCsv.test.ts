import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { RuntimeProfile } from '../domain/types';
import { csvRows } from '../testSupport/csvRows';
import { runtimeProfileCsv } from './runtimeProfileCsv';

describe('runtime profile CSV export', () => {
  it('writes bands, segment runtimes, and the calculation method', () => {
    const profile: RuntimeProfile = {
      ...metadata(), id: 'profile', scenarioId: 'scenario', routeId: 'route', patternId: 'pattern', name: 'Weekday', calculationMethod: 'segmentStart',
      bands: [{ id: 'band', label: 'AM, peak', sequence: 0, startTime: 18000, endTime: 21600, segmentRuntimeSeconds: [450, 510] }],
    };
    expect(csvRows(runtimeProfileCsv(profile))).toEqual([['Band', 'From', 'To', 'Calculation Method', 'Segment 1', 'Segment 2'], ['AM, peak', '5:00', '6:00', 'segmentStart', ':07:30', ':08:30']]);
  });

  describe('band labels and formula protection (P13)', () => {
    const profile = (label: string): RuntimeProfile => ({
      ...metadata(), id: 'profile', scenarioId: 'scenario', routeId: 'route', patternId: 'pattern', name: 'Weekday', calculationMethod: 'singleBand',
      bands: [{ id: 'band', label, sequence: 0, startTime: 18000, endTime: 21600, segmentRuntimeSeconds: [450] }],
    });

    it.each(['=1+1', '+1+1', '-2+3', '@SUM(1,1)', "'=1+1"])('writes the band label %j so a spreadsheet reads text', (label) => {
      expect(csvRows(runtimeProfileCsv(profile(label)))[1][0]).toBe(`'${label}`);
    });

    it('leaves an ordinary label alone, including one that starts with an apostrophe', () => {
      expect(csvRows(runtimeProfileCsv(profile("'Til midnight")))[1][0]).toBe("'Til midnight");
    });

    it('quotes a label with a bare carriage return, as every other CSV writer does', () => {
      const csv = runtimeProfileCsv(profile('AM\rpeak'));
      expect(csv.split('\r\n')[1].startsWith('"AM\rpeak",')).toBe(true);
    });
  });
});
