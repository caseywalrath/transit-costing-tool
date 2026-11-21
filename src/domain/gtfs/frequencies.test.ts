import { describe, expect, it } from 'vitest';
import { GtfsFeedError } from './feedTables';
import { frequencyWindows, windowDepartures } from './frequencies';
import { loadFeedTables, tablesWith } from './testFeeds';

describe('frequencyWindows (mini feed)', () => {
  const { windows, skipped } = frequencyWindows(loadFeedTables('mini'));

  it('reads one window per row, keyed by the template trip', () => {
    expect([...windows.keys()]).toEqual(['F1_W_FREQ', 'F1_W_PM', 'F1_S_NIGHT']);
    expect(windows.get('F1_W_FREQ')).toEqual([{ tripId: 'F1_W_FREQ', start: 21600, end: 32400, headway: 1200, exact: false }]);
  });

  it('reads exact_times = 1 as exact, and a window past midnight in seconds', () => {
    expect(windows.get('F1_W_PM')).toEqual([{ tripId: 'F1_W_PM', start: 57600, end: 64800, headway: 900, exact: true }]);
    expect(windows.get('F1_S_NIGHT')).toEqual([{ tripId: 'F1_S_NIGHT', start: 82800, end: 90000, headway: 1800, exact: true }]);
  });

  it('skips nothing in the mini feed', () => {
    expect(skipped).toEqual([]);
  });
});

describe('windowDepartures', () => {
  it('gives the nine departures of the 06:00 to 09:00 window every 20 minutes (mini F1_W_FREQ)', () => {
    const [window] = frequencyWindows(loadFeedTables('mini')).windows.get('F1_W_FREQ') ?? [];
    expect(windowDepartures(window)).toEqual([21600, 22800, 24000, 25200, 26400, 27600, 28800, 30000, 31200]);
  });

  it('gives 23:00, 23:30, 24:00 and 24:30 for the window that crosses midnight (mini F1_S_NIGHT)', () => {
    const [window] = frequencyWindows(loadFeedTables('mini')).windows.get('F1_S_NIGHT') ?? [];
    expect(windowDepartures(window)).toEqual([82800, 84600, 86400, 88200]);
  });

  it('gives the two approximate departures of the loop feed window (edge-loop-variants L1_freq)', () => {
    const [window] = frequencyWindows(loadFeedTables('edge-loop-variants')).windows.get('L1_freq') ?? [];
    expect(window).toMatchObject({ exact: false });
    expect(windowDepartures(window)).toEqual([36000, 37800]);
  });

  it('never gives a departure at the end time, which is exclusive', () => {
    expect(windowDepartures({ tripId: 'x', start: 36000, end: 36600, headway: 600, exact: true })).toEqual([36000]);
    expect(windowDepartures({ tripId: 'x', start: 36000, end: 37200, headway: 600, exact: true })).toEqual([36000, 36600]);
  });

  it('refuses a hand-built window whose headway would never reach the end', () => {
    expect(() => windowDepartures({ tripId: 'x', start: 36000, end: 37000, headway: 0, exact: true })).toThrow(GtfsFeedError);
  });
});

describe('frequencyWindows (malformed rows are skipped and reported)', () => {
  const base = { trip_id: 'T', start_time: '06:00:00', end_time: '07:00:00', headway_secs: '600', exact_times: '1' };

  it('skips a row with a blank start or end time, a blank, zero, or fractional headway, or end not after start', () => {
    const bad = [
      { ...base, headway_secs: '' },
      { ...base, headway_secs: '0' },
      { ...base, headway_secs: '600.5' },
      { ...base, start_time: '' },
      { ...base, end_time: '  ' },
      { ...base, start_time: '07:00:00', end_time: '06:00:00' },
      { ...base, start_time: '07:00:00', end_time: '07:00:00' },
    ];
    const result = frequencyWindows(tablesWith({ frequencies: bad }));
    expect(result.windows.size).toBe(0);
    expect(result.skipped).toEqual(bad.map(() => ({ tripId: 'T', reason: 'badFrequencyRow' })));
  });

  it('skips a row whose time does not parse, instead of throwing', () => {
    const result = frequencyWindows(tablesWith({ frequencies: [{ ...base, start_time: '6:0:0' }] }));
    expect(result.windows.size).toBe(0);
    expect(result.skipped).toEqual([{ tripId: 'T', reason: 'badFrequencyRow' }]);
  });

  it('keeps the usable rows of a trip while skipping its malformed one', () => {
    const result = frequencyWindows(tablesWith({ frequencies: [base, { ...base, headway_secs: '' }] }));
    expect(result.windows.get('T')).toEqual([{ tripId: 'T', start: 21600, end: 25200, headway: 600, exact: true }]);
    expect(result.skipped).toEqual([{ tripId: 'T', reason: 'badFrequencyRow' }]);
  });
});
