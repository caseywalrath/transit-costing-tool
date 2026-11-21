/** One CSV record, keyed by trimmed header name. Values are the raw text of the feed. */
export type Row = Record<string, string>;

/**
 * The feed's tables as the rules read them. Each list holds the raw rows of one file (an empty list
 * when the file is absent); the rules parse values as they need them.
 */
export interface GtfsTables {
  agency: Row[];
  routes: Row[];
  trips: Row[];
  stopTimes: Row[];
  stops: Row[];
  calendar: Row[];
  calendarDates: Row[];
  frequencies: Row[];
  shapes: Row[];
  feedInfo: Row[];
  /** Every text file in the feed, as named in the archive (for example 'stops.txt'). */
  fileNames: string[];
}

/** The files the import reads. Any other file in a feed is reported as not imported. */
export const USED_FEED_FILES: readonly string[] = [
  'agency.txt',
  'stops.txt',
  'routes.txt',
  'trips.txt',
  'stop_times.txt',
  'calendar.txt',
  'calendar_dates.txt',
  'frequencies.txt',
  'shapes.txt',
  'feed_info.txt',
];

/**
 * A feed value the rules cannot read at all, such as a stop sequence that is not a whole number.
 * Blank optional fields are not errors; a value that is present but unusable is, because guessing
 * at it would change a number silently.
 */
export class GtfsFeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GtfsFeedError';
  }
}
