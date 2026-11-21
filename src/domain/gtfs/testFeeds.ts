// Test support only: loads a fixture folder from tests/fixtures/gtfs/ into GtfsTables. It keeps its own
// small synchronous CSV splitter so that nothing under this folder imports from another layer, even in tests.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GtfsTables, Row } from './feedTables';

const FIXTURE_ROOT = fileURLToPath(new URL('../../../tests/fixtures/gtfs/', import.meta.url));

/** CSV text to rows: quote-aware, CRLF/LF/CR line ends, BOM removed, blank rows skipped, names trimmed. */
export function parseCsvText(text: string): Row[] {
  const source = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c !== '"') {
        field += c;
      } else if (source[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const populated = rows.filter((cells) => cells.some((cell) => cell !== ''));
  if (populated.length === 0) return [];
  const header = populated[0].map((name) => name.trim());
  return populated.slice(1).map((cells) => {
    const record: Row = {};
    header.forEach((name, index) => {
      record[name] = index < cells.length ? cells[index] : '';
    });
    return record;
  });
}

/** Loads tests/fixtures/gtfs/<name>/ . Every .txt file is listed in fileNames; a missing table is an empty list. */
export function loadFeedTables(name: string): GtfsTables {
  const folder = join(FIXTURE_ROOT, name);
  const fileNames = readdirSync(folder)
    .filter((file) => file.toLowerCase().endsWith('.txt'))
    .sort();
  const rowsOf = (file: string): Row[] =>
    fileNames.includes(file) ? parseCsvText(readFileSync(join(folder, file), 'utf8')) : [];
  return {
    agency: rowsOf('agency.txt'),
    routes: rowsOf('routes.txt'),
    trips: rowsOf('trips.txt'),
    stopTimes: rowsOf('stop_times.txt'),
    stops: rowsOf('stops.txt'),
    calendar: rowsOf('calendar.txt'),
    calendarDates: rowsOf('calendar_dates.txt'),
    frequencies: rowsOf('frequencies.txt'),
    shapes: rowsOf('shapes.txt'),
    feedInfo: rowsOf('feed_info.txt'),
    fileNames,
  };
}

/** Tables built in code for a small case; every table not given is empty. */
export function tablesWith(overrides: Partial<GtfsTables>): GtfsTables {
  return {
    agency: [],
    routes: [],
    trips: [],
    stopTimes: [],
    stops: [],
    calendar: [],
    calendarDates: [],
    frequencies: [],
    shapes: [],
    feedInfo: [],
    fileNames: [],
    ...overrides,
  };
}
