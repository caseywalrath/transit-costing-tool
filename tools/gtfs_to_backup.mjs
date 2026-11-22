// Converts a GTFS feed ZIP into a project backup, and prints what was imported (Decision 0089). The feed is read and imported with the
// application's own reader and rules, loaded through Vite as tools/validate_federal_brt_backup.mjs does.
//
// node tools/gtfs_to_backup.mjs <feed.zip> <out.json> [--routes 31,0,0L] [--blocks 10,10] [--own-counts 0L] [--report out.csv]
//
// --routes       feed route_id values to import (default: every Route in routes.txt)
// --blocks       import the feed's blocks, with pull-out and pull-in minutes
// --own-counts   feed route_id values whose proposed own annual counts are switched on
// --report       write the import report as CSV

import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createServer } from 'vite';

const USAGE =
  'Usage: node tools/gtfs_to_backup.mjs <feed.zip> <out.json> [--routes a,b] [--blocks pullOut,pullIn] [--own-counts a,b] [--report out.csv]';
const KNOWN_OPTIONS = new Set(['routes', 'blocks', 'own-counts', 'report']);
const REQUIRED_FILES = ['routes.txt', 'trips.txt', 'stops.txt', 'stop_times.txt'];

function fail(message) {
  console.error(message);
  process.exit(2);
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const value = argv[index + 1];
    if (!KNOWN_OPTIONS.has(name)) fail(`Unknown option ${arg}.\n${USAGE}`);
    if (value === undefined || value.startsWith('--')) fail(`${arg} needs a value.\n${USAGE}`);
    options[name] = value;
    index++;
  }
  if (positional.length !== 2) fail(USAGE);
  return { zipPath: positional[0], outPath: positional[1], options };
}

function list(text) {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function blockMinutes(text) {
  const match = /^(\d+),(\d+)$/.exec(text);
  if (!match) fail(`--blocks needs two whole numbers of minutes, pull-out and pull-in, such as 10,10.\n${USAGE}`);
  return { pullOutMinutes: Number(match[1]), pullInMinutes: Number(match[2]) };
}

const { zipPath, outPath, options } = parseArgs(process.argv.slice(2));
const bytes = new Uint8Array(readFileSync(zipPath));
const blocks = options.blocks === undefined ? undefined : { import: true, ...blockMinutes(options.blocks) };
const ownCountsOn = options['own-counts'] === undefined ? undefined : list(options['own-counts']);

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { readZipEntries } = await vite.ssrLoadModule('/src/persistence/gtfs/zipReader.ts');
  const { findFeedFiles, readFeedTable } = await vite.ssrLoadModule('/src/persistence/gtfs/feedFiles.ts');
  const { scenarioFromFeed, projectFromFeed } = await vite.ssrLoadModule('/src/domain/gtfs/scenarioFromFeed.ts');
  const { importReportCsv } = await vite.ssrLoadModule('/src/domain/gtfs/reportFromFeed.ts');
  const { exportProjectJson, parseProjectBackup } = await vite.ssrLoadModule('/src/persistence/backup.ts');

  const files = findFeedFiles(readZipEntries(bytes));
  for (const name of REQUIRED_FILES) {
    if (!files.has(name)) fail(`${zipPath} has no ${name}, so the feed cannot be imported.`);
  }
  if (!files.has('calendar.txt') && !files.has('calendar_dates.txt')) {
    fail(`${zipPath} has neither calendar.txt nor calendar_dates.txt, so the feed cannot be imported.`);
  }

  const read = (name, keep) => (files.has(name) ? readFeedTable(bytes, files.get(name), keep) : Promise.resolve([]));
  const routeRows = await read('routes.txt');
  const allRouteIds = [...new Set(routeRows.map((row) => row.route_id))];
  const routeIds = options.routes === undefined ? allRouteIds : list(options.routes);
  const unknown = routeIds.filter((id) => !allRouteIds.includes(id));
  if (unknown.length > 0) fail(`Not in routes.txt: ${unknown.join(', ')}`);

  // Trips are read first, so stop_times.txt keeps only the rows of the selected Routes' trips (Decision 0089 item 8).
  const tripRows = await read('trips.txt');
  const selectedTripIds = new Set(tripRows.filter((row) => routeIds.includes(row.route_id)).map((row) => row.trip_id));
  const tables = {
    agency: await read('agency.txt'),
    routes: routeRows,
    trips: tripRows,
    stopTimes: await read('stop_times.txt', (row) => selectedTripIds.has(row.trip_id)),
    stops: await read('stops.txt'),
    calendar: await read('calendar.txt'),
    calendarDates: await read('calendar_dates.txt'),
    frequencies: await read('frequencies.txt'),
    shapes: await read('shapes.txt'),
    feedInfo: await read('feed_info.txt'),
    fileNames: [...files.keys()].sort(),
  };

  const common = {
    tables,
    routeIds,
    fileName: basename(zipPath),
    now: new Date().toISOString(),
    ...(blocks ? { blocks } : {}),
    ...(ownCountsOn ? { routeOwnCountsOn: ownCountsOn } : {}),
  };

  const { records, translation, counts } = scenarioFromFeed('converter-report', 'Existing service', common);
  const report = translation.report;

  console.log(`Feed ${basename(zipPath)}: Routes ${routeIds.join(', ')}`);
  for (const summary of report.routes) {
    const trips = Object.entries(summary.tripsByServiceDay)
      .map(([name, count]) => `${name} ${count}`)
      .join(', ');
    console.log(
      `Route ${summary.routeId} ${summary.name}: patterns ${summary.patterns}, Nodes ${summary.timepoints}, stops ${summary.stops}, trips ${trips || 'none'}, blocks ${summary.blocks}`,
    );
  }
  for (const skipped of translation.skippedRoutes) console.log(`Skipped ${skipped.routeId}: ${skipped.reason}`);

  const countLine = records.serviceDays.map((day) => `${day.name} ${day.annualServiceDays}`).join(', ');
  const total = records.serviceDays.reduce((sum, day) => sum + day.annualServiceDays, 0);
  console.log(`Annual counts: ${countLine}; total ${total}${counts.scaled ? ` (scaled from ${counts.countedDates} dates)` : ''}`);
  console.log(`Fidelity: ${report.fidelityOk ? 'OK' : 'NOT OK'}`);
  for (const row of report.fidelity) {
    console.log(
      `  ${row.routeId} ${row.serviceDay}: feed ${row.feedTrips} trips, ${row.feedRunningSeconds} s; imported ${row.importedTrips} trips, ${row.importedRunningSeconds} s`,
    );
  }

  const snapshot = projectFromFeed(common);
  const json = exportProjectJson(snapshot);
  parseProjectBackup(json);
  writeFileSync(outPath, json);
  if (options.report) writeFileSync(options.report, importReportCsv(report));
  console.log(`Wrote ${outPath}`);
  if (!report.fidelityOk) {
    console.error('The fidelity check failed: the imported trips differ from the feed (see the list above).');
    process.exitCode = 1;
  }
} finally {
  await vite.close();
}
