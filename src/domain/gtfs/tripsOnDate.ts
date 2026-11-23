import { serviceIdsActiveOn } from './calendar';
import { GtfsFeedError, type GtfsTables, type Row } from './feedTables';
import { frequencyWindows, type FrequencyWindow, windowDepartures } from './frequencies';
import { GtfsTimeError, type GtfsDate, parseGtfsTime } from './time';

export interface FeedStopTime {
  stopId: string;
  /** stop_sequence as a whole number; the rows of a trip are in ascending order of this. */
  sequence: number;
  /** Seconds after midnight of the service day; undefined when the feed leaves the time blank. */
  arrival?: number;
  departure?: number;
  timepoint?: 0 | 1;
}

export interface FeedTrip {
  /** The trip_id, or '{template trip_id}@{departure seconds}' for a trip made from frequencies.txt. */
  tripId: string;
  /** The trip_id in trips.txt that the trip was read from (the same as tripId for an ordinary trip). */
  sourceTripId: string;
  routeId: string;
  serviceId: string;
  directionId?: 0 | 1;
  blockId?: string;
  shapeId?: string;
  headsign?: string;
  shortName?: string;
  stopTimes: FeedStopTime[];
  /** Present only on trips made from a frequency window. */
  frequency?: { exact: boolean };
}

export type InvalidTripReason =
  | 'blankFirstOrLastTime'
  | 'repeatedSequence'
  | 'fewerThanTwoStops'
  | 'badSequence'
  | 'badTime'
  | 'badFrequencyRow';

export interface TripsOnDate {
  /** Trips that run on the date, per route, in order of their first departure (then tripId). */
  byRoute: Map<string, FeedTrip[]>;
  /** Trips on the date that are left out of byRoute, with the reason. */
  invalid: Array<{ tripId: string; routeId: string; reason: InvalidTripReason }>;
}

interface ReadStops {
  stopTimes: FeedStopTime[];
  /** First departure, or the first arrival where the departure is blank. */
  origin: number;
}

/** Trips that run on the date (their service is active then), limited to the given routes when present. */
export function tripsOnDate(tables: GtfsTables, date: GtfsDate, routeIds?: ReadonlySet<string>): TripsOnDate {
  const active = serviceIdsActiveOn(tables, date);
  const trips = tables.trips.filter((trip) => active.has(trip.service_id) && (!routeIds || routeIds.has(trip.route_id)));
  const stopTimes = stopTimeIndexOf(tables.stopTimes);
  const { windows, skipped } = frequencyWindows(tables);
  // A trip with any frequencies.txt row is a template, even when none of its rows is usable; it is never returned as an ordinary trip.
  const templateIds = new Set([...windows.keys(), ...skipped.map((row) => row.tripId)]);

  const made: Array<{ trip: FeedTrip; origin: number }> = [];
  const invalid: TripsOnDate['invalid'] = [];
  for (const row of trips) {
    const tripId = row.trip_id;
    const read = readTrip(stopTimes, tripId);
    if ('reason' in read) {
      invalid.push({ tripId, routeId: row.route_id, reason: read.reason });
      continue;
    }
    if (!templateIds.has(tripId)) {
      made.push({ trip: feedTrip(row, tripId, read.stopTimes), origin: read.origin });
      continue;
    }
    // A template with frequency windows is replaced by its departures; the template itself is not a trip.
    for (const window of windows.get(tripId) ?? []) {
      for (const departure of windowDepartures(window)) {
        made.push({ trip: expandWindow(row, read, window, departure), origin: departure });
      }
    }
  }

  // Malformed frequencies.txt rows are listed for the templates in scope, so the planner can see what was left out.
  if (skipped.length > 0) {
    const rowById = new Map<string, Row>();
    for (const row of trips) {
      if (!rowById.has(row.trip_id)) rowById.set(row.trip_id, row);
    }
    for (const skip of skipped) {
      const row = rowById.get(skip.tripId);
      if (row) invalid.push({ tripId: skip.tripId, routeId: row.route_id, reason: skip.reason });
    }
  }

  const byRoute = new Map<string, FeedTrip[]>();
  made.sort((a, b) => a.origin - b.origin || compareText(a.trip.tripId, b.trip.tripId));
  for (const { trip } of made) {
    const list = byRoute.get(trip.routeId) ?? [];
    list.push(trip);
    byRoute.set(trip.routeId, list);
  }
  return { byRoute, invalid };
}

/** Seconds from a trip's first departure (or arrival) to its last arrival (or departure). */
export function runningSeconds(trip: FeedTrip): number {
  const first = trip.stopTimes[0];
  const last = trip.stopTimes[trip.stopTimes.length - 1];
  const start = first?.departure ?? first?.arrival;
  const end = last?.arrival ?? last?.departure;
  if (start === undefined || end === undefined) {
    throw new GtfsFeedError(`Trip "${trip.tripId}" has no time at its first or last stop`);
  }
  return end - start;
}

const stopIdKeys = new WeakMap<readonly FeedStopTime[], string>();

/**
 * The stop IDs of a trip in order, as one string that is the same for two trips with the same stops. A trip's stop times are
 * shared by all of its dates (see stopTimeIndexOf), so the string is built once per trip rather than once per date.
 */
export function stopIdKey(stopTimes: readonly FeedStopTime[]): string {
  let key = stopIdKeys.get(stopTimes);
  if (key === undefined) {
    key = JSON.stringify(stopTimes.map((stop) => stop.stopId));
    stopIdKeys.set(stopTimes, key);
  }
  return key;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * The stop_times rows of each trip, and each trip's read of them, kept for the feed. A trip's stop times do not depend on the date,
 * but tripsOnDate is asked once per date, and a fresh grouping of the whole stop_times list on every call made a feed of 800,000
 * rows cost one scan and one parse of its times for every date. The feed's rows are not changed after they are read, so the index
 * is kept against the list itself and is not rebuilt unless the list is a different one.
 */
interface StopTimeIndex {
  rowsByTrip: Map<string, Row[]>;
  readByTrip: Map<string, ReadStops | { reason: InvalidTripReason }>;
}

const stopTimeIndexes = new WeakMap<Row[], StopTimeIndex>();

function stopTimeIndexOf(stopTimes: Row[]): StopTimeIndex {
  const existing = stopTimeIndexes.get(stopTimes);
  if (existing) return existing;
  const rowsByTrip = new Map<string, Row[]>();
  for (const row of stopTimes) {
    const list = rowsByTrip.get(row.trip_id);
    if (list) list.push(row);
    else rowsByTrip.set(row.trip_id, [row]);
  }
  const index: StopTimeIndex = { rowsByTrip, readByTrip: new Map() };
  stopTimeIndexes.set(stopTimes, index);
  return index;
}

// Trips made from one trip's stop times share its stopTimes array. Nothing in the rules changes a FeedTrip's stop times after
// they are read, so the array is shared rather than copied on every date.
function readTrip(index: StopTimeIndex, tripId: string): ReadStops | { reason: InvalidTripReason } {
  let read = index.readByTrip.get(tripId);
  if (!read) {
    read = readStopTimes(index.rowsByTrip.get(tripId) ?? []);
    index.readByTrip.set(tripId, read);
  }
  return read;
}

// A malformed value makes only its own trip invalid: a sequence that is not a whole number, or a time that
// will not parse, is reported with its reason and does not stop the rest of the read.
function readStopTimes(rows: Row[]): ReadStops | { reason: InvalidTripReason } {
  if (rows.length < 2) return { reason: 'fewerThanTwoStops' };
  if (rows.some((row) => !/^\d+$/.test(row.stop_sequence))) return { reason: 'badSequence' };

  const ordered = rows
    .map((row) => ({ row, sequence: Number(row.stop_sequence) }))
    .sort((a, b) => a.sequence - b.sequence);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].sequence === ordered[i - 1].sequence) return { reason: 'repeatedSequence' };
  }

  let stopTimes: FeedStopTime[];
  try {
    stopTimes = ordered.map(({ row, sequence }) => ({
      stopId: row.stop_id,
      sequence,
      arrival: parseGtfsTime(row.arrival_time),
      departure: parseGtfsTime(row.departure_time),
      timepoint: parseTimepoint(row.timepoint),
    }));
  } catch (error) {
    if (error instanceof GtfsTimeError) return { reason: 'badTime' };
    throw error;
  }

  // The first stop needs a time to start from and the last stop needs one to end at. A stop in the
  // middle with no time is kept; the timepoint rules fill it later.
  const first = stopTimes[0];
  const last = stopTimes[stopTimes.length - 1];
  const origin = first.departure ?? first.arrival;
  const end = last.arrival ?? last.departure;
  if (origin === undefined || end === undefined) return { reason: 'blankFirstOrLastTime' };

  return { stopTimes, origin };
}

function feedTrip(row: Row, tripId: string, stopTimes: FeedStopTime[]): FeedTrip {
  return {
    tripId,
    sourceTripId: row.trip_id,
    routeId: row.route_id,
    serviceId: row.service_id,
    directionId: parseDirection(row.direction_id),
    blockId: optionalText(row.block_id),
    shapeId: optionalText(row.shape_id),
    headsign: optionalText(row.trip_headsign),
    shortName: optionalText(row.trip_short_name),
    stopTimes,
  };
}

function expandWindow(row: Row, template: ReadStops, window: FrequencyWindow, departure: number): FeedTrip {
  // Each departure copies the template's stop times, moved by the same amount as its first departure.
  const shift = departure - template.origin;
  const stopTimes = template.stopTimes.map((stop) => ({
    ...stop,
    arrival: shiftTime(stop.arrival, shift),
    departure: shiftTime(stop.departure, shift),
  }));
  return { ...feedTrip(row, `${row.trip_id}@${departure}`, stopTimes), frequency: { exact: window.exact } };
}

function shiftTime(value: number | undefined, shift: number): number | undefined {
  return value === undefined ? undefined : value + shift;
}

// A blank optional field is absent, not an empty string, so a feature check never has to test for both.
function optionalText(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

function parseDirection(value: string | undefined): 0 | 1 | undefined {
  if (value === '0') return 0;
  if (value === '1') return 1;
  return undefined;
}

function parseTimepoint(value: string | undefined): 0 | 1 | undefined {
  if (value === '0') return 0;
  if (value === '1') return 1;
  return undefined;
}
