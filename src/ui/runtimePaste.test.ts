import { describe, expect, it } from 'vitest';
import { metadata } from '../domain/ids';
import type { RuntimeProfile } from '../domain/types';
import { parseRuntimePaste, runtimeProfileCsv } from './runtimePaste';

describe('runtime profile CSV interchange', () => {
  it('round trips bands and the calculation method', () => {
    const profile: RuntimeProfile = {
      ...metadata(), id: 'profile', scenarioId: 'scenario', routeId: 'route', patternId: 'pattern', name: 'Weekday', calculationMethod: 'segmentStart',
      bands: [{ id: 'band', label: 'AM, peak', sequence: 0, startTime: 18000, endTime: 21600, segmentRuntimeSeconds: [450, 510] }],
    };
    const parsed = parseRuntimePaste(runtimeProfileCsv(profile), 2);
    expect(parsed).toMatchObject([{ bandLabel: 'AM, peak', startTime: 18000, endTime: 21600, calculationMethod: 'segmentStart', segmentRuntimeSeconds: [450, 510] }]);
  });
});
