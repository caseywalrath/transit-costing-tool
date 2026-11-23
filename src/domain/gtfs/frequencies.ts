import { GtfsFeedError, type GtfsTables, type Row } from './feedTables';
import { GtfsTimeError, parseGtfsTime } from './time';

export interface FrequencyWindow {
  tripId: string;
  /** Seconds after midnight of the service day. */
  start: number;
  end: number;
  headway: number;
  /** True when frequencies.txt says departures are exact (exact_times = 1); blank or 0 means approximate. */
  exact: boolean;
}

export interface SkippedFrequencyRow {
  tripId: string;
  reason: 'badFrequencyRow';
}

export interface FrequencyWindows {
  /** Usable windows, grouped by the template trip they belong to, in file order. */
  windows: Map<string, FrequencyWindow[]>;
  /** Rows left out because they are malformed; each is reported rather than stopping the read. */
  skipped: SkippedFrequencyRow[];
}

/** Windows of frequencies.txt by template trip. A malformed row is skipped and listed in `skipped`. */
export function frequencyWindows(tables: GtfsTables): FrequencyWindows {
  const windows = new Map<string, FrequencyWindow[]>();
  const skipped: SkippedFrequencyRow[] = [];
  for (const row of tables.frequencies) {
    const window = readWindow(row);
    if (!window) {
      skipped.push({ tripId: row.trip_id, reason: 'badFrequencyRow' });
      continue;
    }
    const list = windows.get(window.tripId) ?? [];
    list.push(window);
    windows.set(window.tripId, list);
  }
  return { windows, skipped };
}

// A window is usable only when both times are given and well formed, the end is after the start, and the
// headway is a whole number above zero. A zero or fractional headway would never reach the end, so it is
// refused rather than guessed at.
function readWindow(row: Row): FrequencyWindow | undefined {
  let start: number | undefined;
  let end: number | undefined;
  try {
    start = parseGtfsTime(row.start_time);
    end = parseGtfsTime(row.end_time);
  } catch (error) {
    if (error instanceof GtfsTimeError) return undefined;
    throw error;
  }
  if (start === undefined || end === undefined || end <= start) return undefined;
  if (!/^\d+$/.test(row.headway_secs) || Number(row.headway_secs) <= 0) return undefined;
  return {
    tripId: row.trip_id,
    start,
    end,
    headway: Number(row.headway_secs),
    exact: row.exact_times === '1',
  };
}

/** Departure offsets for one window: start + k*headway while < end. */
export function windowDepartures(window: FrequencyWindow): number[] {
  // frequencyWindows never returns a window that fails this; the check guards against a hand-built window.
  if (!(window.headway > 0)) {
    throw new GtfsFeedError(`The window for trip "${window.tripId}" has a headway of ${window.headway}; it must be above 0`);
  }
  const departures: number[] = [];
  // The end is exclusive: a window ending at 11:00 gives no departure at 11:00.
  for (let departure = window.start; departure < window.end; departure += window.headway) {
    departures.push(departure);
  }
  return departures;
}
