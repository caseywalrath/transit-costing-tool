# GTFS Import — Phase I Sub-plan and Work Cards

- Status: Written in sitting 1 (2026-11-21), awaiting user review with Decision 0089. No package has started.
- Rules: `docs/decisions/0089-gtfs-import.md` (cited below as "0089 item n").
- Programme plan, run rules and sittings: `docs/implementation/gtfs-interoperability.md`, Part 7.
- Test feeds: `tests/fixtures/gtfs/` (see its `README.md` for the worked answers).

## 1. Branch

The run rules ask for one branch per phase from `main`. This cloud session may push only to `claude/dazzling-tesla-znfnl8`, so phase I is built on that branch until the user names another. The user merges it through a pull request when the phase closes.

## 2. Where the code goes

| Folder | Holds | Package |
|---|---|---|
| `src/persistence/gtfs/` | ZIP reader, streaming CSV reader, feed-file lookup. File formats only; no transit rules. | I1 |
| `src/domain/gtfs/` | Pure rules: feed tables, calendars, frequencies, trips on a date, summary (I2); day groups, holidays, counts (I2b); translation to Routes, patterns, stops, profiles, trips, blocks, report (I3, I4). No React, no IndexedDB, no reading of files. | I2–I4 |
| `src/application/gtfs/` | Import service for levels A–C, restore point, Web Worker wrapper. | I6 |
| `tools/gtfs_to_backup.mjs` | Command-line converter: feed → project backup. | I6 |
| `src/ui/gtfs/` | Import dialog and menu entries. | I8, I9 |

Domain code never imports from `persistence` or `application`. The worker and the service join the reader (I1) to the rules (I2–I4).

## 3. Packages, models and order

| Package | Model and effort | Sitting | Files it owns |
|---|---|---|---|
| I1 | Haiku, `high` | 2 (parallel with I5) | `src/persistence/gtfs/**` |
| I5 | Haiku, `high` | 2 (parallel with I1) | `src/domain/types.ts` (new fields only), `src/persistence/backup.ts`, `src/domain/project.ts` (copy remapping), service-day delete path, their tests, `docs/data-schema.md` |
| I2 | Haiku, `high` | 2 (after I1) | `src/domain/gtfs/feed*.ts`, `calendar.ts`, `frequencies.ts`, `tripsOnDate.ts`, `summary.ts`, `time.ts` and tests |
| I2b | Sonnet, `high` (user approval asked: several rules interact) | 3 | `src/domain/gtfs/days*.ts`, `holidays.ts`, `annualCounts.ts`, new calendar fixtures |
| I3 | Haiku, `xhigh` | 3 | `src/domain/gtfs/directions.ts`, `patterns.ts`, `timepoints.ts`, `routeBuild.ts`, `distances.ts` |
| I4 | Haiku, `xhigh` | 4 | `src/domain/gtfs/runtimes.ts`, `trips.ts`, `blocks.ts`, `report.ts`, `translate.ts` |
| I5b | Haiku, `xhigh` | 4 | `src/application/costingService.ts` and costing domain files for per-route counts |
| I6 | Haiku, `high` | 5 | `src/application/gtfs/**`, `tools/gtfs_to_backup.mjs`, restore-point files |
| I7 | Opus | 6 | `docs/implementation/gtfs-import/` mock-ups |
| I8 | Haiku, `high`, precise card | 7 | `src/ui/gtfs/` steps 1–3 |
| I9 | Sonnet (user approval asked) | 7–8 | `src/ui/gtfs/` steps 4–5, menus, notice |
| I9b | Sonnet (user approval asked) | 7–8 | Route tab Annual service days panel, Costing markers, Add service day command |
| I10 | Haiku, `high`; Opus judges | 8 | measurements and fixes |
| I11 | Opus | 9 | closeout documents |

Cards for I1, I5 and I2 are below. The orchestrator writes each later card at the start of its sitting, from the code as it then stands, and adds it to this file.

## 4. Verification per package

| Package | Run | Skip, and why | Never cut |
|---|---|---|---|
| I1, I2, I2b, I3, I4 | The package's unit tests; `pnpm typecheck`; full `pnpm test` at package end | Browser suite: no screen or storage change | Typecheck; full unit suite |
| I5 | `src/persistence/backup*.test.ts`, `database.test.ts`, `repositoryContract.test.ts`, project copy tests; `tests/ui/backup-import.spec.ts`, `database-migration.spec.ts`, `scenario-copy-recovery.spec.ts`; a backup round trip of the Federal BRT example | Other browser specs: no screen change | Persistence, migration and backup tests; round trip |
| I5b | Costing unit tests; a test that totals are unchanged with no Route switched on; `tests/ui/costing*.spec.ts` | Other browser specs | Unchanged-totals test |
| I6 | Service tests with fake-indexeddb; restore-point tests; `tests/ui/undo-history.spec.ts`, `data-safety.spec.ts`; converter run on every fixture feed | Screen specs | Restore-point tests |
| I8, I9, I9b | New `tests/ui/gtfs-import.spec.ts`; `draggable-dialogs.spec.ts`, `keyboard.spec.ts` (axe), `project-context-menu.spec.ts`, `scenario-context-menu.spec.ts`, `context-line.spec.ts`; `pnpm build`; screenshots inspected | Blocking specs not touched | Typecheck; build |
| I10 | `capacity-read-paths.spec.ts`, `recalculation-capacity.spec.ts`, a new large-feed timing check | — | Typecheck |
| I11 | Full `pnpm test:ui` | — | Full run |

## 5. Baseline (sitting 1, 2026-11-21, commit `729609c`)

- `pnpm install --frozen-lockfile`: done.
- `pnpm typecheck`: clean.
- `pnpm test`: 105 files, 1,781 tests passed.
- `tests/ui/backup-import.spec.ts` (Chromium at `/opt/pw-browsers/chromium`): 5 passed.

## 6. Rules for every card

Every sub-agent prompt starts with this block:

```
Repository: transit-costing-tool. Read AGENTS.md and codex.md first, then
docs/decisions/0089-gtfs-import.md and the card below. Work only in the files
the card names. Do not add any library (decision D12). Do not change any
existing number, test expectation or behaviour that the card does not name.
No GTFS·X or other outside code. Comments explain why, not what; no plan or
package names in code comments. TypeScript strict, no `any`. Use the file-edit
tool, not shell redirection. Run only the commands the card lists. Do not
commit or push. When done, report: files changed, test counts, anything the
card did not decide (stop and ask instead of guessing).
```

## 7. Card I1 — ZIP reader and streaming CSV reader

**Model:** Haiku, effort `high`. **Rules:** 0089 items 6–8, 11 (first two bullets).

**Files to create:** `src/persistence/gtfs/zipReader.ts`, `src/persistence/gtfs/csvStream.ts`, `src/persistence/gtfs/feedFiles.ts`, and a `*.test.ts` beside each. **Do not touch** any other file.

**API (exact names):**

```ts
// zipReader.ts
export type ZipErrorCode = 'notZip' | 'zip64' | 'encrypted' | 'multiPart' | 'unsupportedMethod' | 'corrupt';
export class ZipReadError extends Error { constructor(readonly code: ZipErrorCode, message: string) }
export interface ZipEntry { name: string; method: 0 | 8; compressedSize: number; uncompressedSize: number; crc32: number; localHeaderOffset: number; }
/** Reads the central directory from the end-of-central-directory record. */
export function readZipEntries(bytes: Uint8Array): ZipEntry[];
/** The entry's bytes, decompressed for method 8 with DecompressionStream('deflate-raw'). Checks size and CRC-32; a mismatch throws ZipReadError('corrupt'). */
export function openZipEntry(bytes: Uint8Array, entry: ZipEntry): ReadableStream<Uint8Array>;

// csvStream.ts
/** Yields one record per data row, keyed by trimmed header name. */
export function readCsvRecords(text: ReadableStream<string> | AsyncIterable<string>): AsyncGenerator<Record<string, string>>;
/** UTF-8 text of an entry, as a stream of strings (TextDecoderStream). */
export function zipEntryText(bytes: Uint8Array, entry: ZipEntry): ReadableStream<string>;

// feedFiles.ts
/** Maps 'stops.txt' etc. to entries. Files may be at the root or all inside one folder; directories and '__MACOSX/' entries are ignored. */
export function findFeedFiles(entries: ZipEntry[]): Map<string, ZipEntry>;
/** Reads one table, keeping rows for which keep(row) is true (all rows when absent). */
export function readFeedTable(bytes: Uint8Array, entry: ZipEntry, keep?: (row: Record<string, string>) => boolean): Promise<Record<string, string>[]>;
```

**ZIP facts to follow:**
- End-of-central-directory signature `0x06054b50`, searched backwards from the end over at most 65,557 bytes. Not found → `notZip`.
- "Number of this disk" ≠ 0 or "disk where central directory starts" ≠ 0 → `multiPart`. Any field equal to `0xFFFF`/`0xFFFFFFFF`, or a ZIP64 locator (`0x07064b50`) just before the record → `zip64`.
- Central entry signature `0x02014b50`; general-purpose flag bit 0 set → `encrypted`; method not 0 or 8 → `unsupportedMethod`. Names are UTF-8.
- Local header signature `0x04034b50`; data starts at offset + 30 + local name length + local extra length (read the local lengths; they can differ from the central ones). Sizes come from the central directory, so bit-3 data descriptors need no special handling.
- CRC-32: the standard table (polynomial `0xEDB88320`), checked on the decompressed bytes.

**CSV facts to follow:** remove a leading BOM (`﻿`); accept `\r\n`, `\n`, `\r`; quotes per RFC 4180 (`""` inside quotes is one quote; a quoted field may hold commas and line breaks); a chunk may end anywhere, including inside quotes and between `\r` and `\n`; a row with fewer fields than the header gets `''` for the missing ones; extra fields are dropped; a row whose fields are all empty is skipped; the final row may lack a line end.

**Tests (Vitest; read fixtures with `node:fs` from `tests/fixtures/gtfs/`):**
1. `readZipEntries` on `zips/mini-deflate.zip` lists the 9 `.txt` files with method 8; on `zips/mini-stored.zip` with method 0.
2. `openZipEntry` text of `stops.txt` from both ZIPs equals the bytes of `mini/stops.txt` (byte for byte, BOM included).
3. `findFeedFiles` on `zips/mini-in-folder-deflate.zip` maps `stops.txt` to `mini-feed/stops.txt`. Entries in two different folders → only root files are mapped; a test builds such a directory list by hand.
4. Errors: random bytes → `notZip`; a ZIP with one flipped data byte → `corrupt` (copy the stored ZIP into a buffer and flip a byte inside the data); a hand-patched flag bit 0 → `encrypted`; method 12 → `unsupportedMethod`; disk number 1 → `multiPart`; entry count `0xFFFF` → `zip64`.
5. CSV: `mini/calendar.txt` (CRLF) gives 3 records with `service_id` WKDY, SAT, SUN. `mini/stops.txt` gives 7 records; the first has `stop_id` = `S1` (BOM removed) and `stop_name` = `Main St & 1st Ave, Shared`; `platform_note` of `P1` is `north end`. `mini/routes.txt` long name of B1 = `Main St, Crosstown`.
6. CSV chunking: feed `a,b\r\n"x,""y""\r\nz",2\r\n,\r\n3,4` split into every possible pair of chunks (every split point), and into one-character chunks; every run gives `[{a:'x,"y"\r\nz', b:'2'}, {a:'3', b:'4'}]`.
7. `readFeedTable` with `keep = (r) => r.route_id === 'B1'` on `trips.txt` returns 8 rows.

**Run:** `pnpm exec vitest run src/persistence/gtfs`, `pnpm typecheck`, then `pnpm test` once at the end.

**Done when:** all of the above pass, no other file changed.

## 8. Card I5 — Stored data and backup schema 17

**Model:** Haiku, effort `high`. **Rules:** 0089 items 31 (`feed` value), 38–42.

**Files:** `src/domain/types.ts` (additions only); `src/persistence/backup.ts`; `src/domain/project.ts` (`cloneProjectSnapshot`, `duplicateScenario`, `duplicateRouteRecords`); the code path that deletes a service day (find it with `grep -rn "serviceDay" src/application src/domain | grep -i delet`); their tests; `docs/data-schema.md`. **Do not touch** UI files, Costing, `database.ts` (no Dexie version change), or any GTFS folder.

**Type additions (exact):**

```ts
export interface ScenarioImportNote { publisher: string; feedVersion?: string; fileName: string; datesByServiceDayId: Record<EntityId, string /* YYYY-MM-DD */>; routeCount: number; importedAt: string /* ISO */; }
export interface RouteOwnAnnualServiceDays { enabled: boolean; countsByServiceDayId: Record<EntityId, number>; }
// Scenario: add  importNotes?: ScenarioImportNote[];
// Route:    add  gtfsRouteId?: string; gtfsRouteType?: number; color?: string; ownAnnualServiceDays?: RouteOwnAnnualServiceDays;
// TripCreationMethod: 'generated' | 'manual' | 'feed'
```

**Backup changes:**
1. `PROJECT_BACKUP_SCHEMA_VERSION = 17`. Every accepted-version list in `backup.ts` that ends with `PROJECT_BACKUP_SCHEMA_VERSION` must still contain 16: write 16 explicitly before the constant. Check every list (`grep -n "15, PROJECT_BACKUP_SCHEMA_VERSION" src/persistence/backup.ts`). A version-16 backup must import exactly as before.
2. Validation, in the existing style (`Invalid project backup: routes[3].color …`):
   - `gtfsRouteId`: non-blank string. `gtfsRouteType`: whole number ≥ 0. `color`: matches `/^[0-9A-F]{6}$/`.
   - `ownAnnualServiceDays`: `enabled` boolean; each key is a service day of the Route's own Scenario; each value a whole number ≥ 0; values total ≤ 365.
   - `importNotes`: an array; each entry has non-blank `publisher` and `fileName`, `routeCount` whole ≥ 0, `importedAt` a string, `datesByServiceDayId` keys that are service days of that Scenario and values matching `/^\d{4}-\d{2}-\d{2}$/`.
   - `provenance.creationMethod` accepts `feed`.
3. Export writes the new fields when present and nothing when absent.

**Copy remapping:**
- `cloneProjectSnapshot` and `duplicateScenario`: remap `ownAnnualServiceDays.countsByServiceDayId` keys and `importNotes[].datesByServiceDayId` keys through the service-day ID map (same pattern as `remapEstimateFactorDays`).
- `duplicateRouteRecords` (same Scenario): copies `ownAnnualServiceDays` unchanged; copies `gtfsRouteId`, `gtfsRouteType`, `color`.
- Deleting a service day removes its key from every Route's `countsByServiceDayId` and from every `importNotes` entry in that Scenario.

**Tests:**
1. Round trip: a snapshot with all new fields → export → import gives equal records.
2. A version-16 backup (take an existing v16 fixture or test payload) imports, with no new fields.
3. Each invalid value above is refused with the field named (one test per rule).
4. Copy as new project (`'copy'` mode) and `duplicateScenario`: keys point at the new service-day IDs; the counts are unchanged.
5. Deleting a service day removes its key.
6. `repositoryContract.test.ts`: a Route with `ownAnnualServiceDays` and a Scenario with `importNotes` save and load on both repositories.

**Docs:** `docs/data-schema.md`: the new fields, schema 17, "no Dexie change".

**Run:** the I5 row of section 4. Browser specs with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test tests/ui/backup-import.spec.ts tests/ui/database-migration.spec.ts tests/ui/scenario-copy-recovery.spec.ts`.

**Done when:** all pass, version 16 still imports, no screen changed.

**As built (2026-11-21):** no service-day delete path exists yet, so `removeServiceDayFromFeedFields` (`src/domain/project.ts`) is pure and tested but not called; I9b's Delete command must call it.

## 9. Card I2 — Feed model: calendars, frequencies, trips on a date, summary

**Model:** Haiku, effort `high`. **Depends on:** I1 (uses only its record shape `Record<string, string>`, not its code). **Rules:** 0089 items 10, 13–14, 16 ("feed's range"), 22–23.

**Files to create in `src/domain/gtfs/`:** `time.ts`, `feedTables.ts`, `calendar.ts`, `frequencies.ts`, `tripsOnDate.ts`, `summary.ts`, each with a test. A test helper `src/domain/gtfs/testFeeds.ts` loads a fixture folder from `tests/fixtures/gtfs/<name>/` into `GtfsTables` with a small synchronous CSV split for tests only (or reuse `readCsvRecords` from I1 in the test file only). **Do not touch** other files.

**API (exact names):**

```ts
// time.ts
/** 'H:MM:SS' or 'HH:MM:SS', hours may exceed 23. Blank → undefined. Anything else → throws GtfsTimeError. */
export function parseGtfsTime(value: string): number | undefined;
/** 'YYYYMMDD' ↔ { year, month, day }; day-of-week 0 = Monday … 6 = Sunday; addDays; daysBetween. Pure, UTC arithmetic only. */
export type GtfsDate = string; // 'YYYYMMDD'
export function dayOfWeek(date: GtfsDate): number; export function addDays(date: GtfsDate, n: number): GtfsDate; export function daysBetween(a: GtfsDate, b: GtfsDate): number;

// feedTables.ts
export interface GtfsTables { agency: Row[]; routes: Row[]; trips: Row[]; stopTimes: Row[]; stops: Row[]; calendar: Row[]; calendarDates: Row[]; frequencies: Row[]; shapes: Row[]; feedInfo: Row[]; fileNames: string[]; }
export type Row = Record<string, string>;

// calendar.ts
export function serviceIdsActiveOn(tables: GtfsTables, date: GtfsDate): Set<string>;
/** Earliest and latest date on which any trip of the given routes runs (all routes when absent). Undefined when none. */
export function feedServiceRange(tables: GtfsTables, routeIds?: ReadonlySet<string>): { start: GtfsDate; end: GtfsDate } | undefined;

// frequencies.ts
export interface FrequencyWindow { tripId: string; start: number; end: number; headway: number; exact: boolean; }
export function frequencyWindows(tables: GtfsTables): Map<string, FrequencyWindow[]>;
/** Departure offsets for one window: start + k*headway while < end. */
export function windowDepartures(window: FrequencyWindow): number[];

// tripsOnDate.ts
export interface FeedStopTime { stopId: string; sequence: number; arrival?: number; departure?: number; timepoint?: 0 | 1; }
export interface FeedTrip { tripId: string; sourceTripId: string; routeId: string; serviceId: string; directionId?: 0 | 1; blockId?: string; shapeId?: string; headsign?: string; shortName?: string; stopTimes: FeedStopTime[]; frequency?: { exact: boolean }; }
export interface TripsOnDate { byRoute: Map<string, FeedTrip[]>; invalid: Array<{ tripId: string; routeId: string; reason: 'blankFirstOrLastTime' | 'repeatedSequence' | 'fewerThanTwoStops' }>; }
export function tripsOnDate(tables: GtfsTables, date: GtfsDate, routeIds?: ReadonlySet<string>): TripsOnDate;
export function runningSeconds(trip: FeedTrip): number; // first departure (or arrival) to last arrival (or departure)

// summary.ts
export interface FeedSummary { agencies: Array<{ id: string; name: string }>; feedVersion?: string; publisher?: string; range?: { start: GtfsDate; end: GtfsDate }; expiry: 'ok' | 'endsWithin30Days' | 'expired'; routeCount: number; stopCount: number; notImported: string[]; routes: Array<{ routeId: string; shortName: string; longName: string; type: number; agencyId?: string; color?: string; tripCount: number }>; }
/** today and countDate are GtfsDate; tripCount counts trips of each route on countDate. */
export function feedSummary(tables: GtfsTables, today: GtfsDate, countDate?: GtfsDate): FeedSummary;
```

**Rules:**
- Stop-time rows of a trip sorted by `stop_sequence` as a number. Repeated sequence → invalid. Fewer than 2 rows → invalid. Blank time at the first or last row → invalid.
- A frequency template produces one `FeedTrip` per departure; `tripId` = `{template id}@{departure seconds}`; `sourceTripId` = the template id; times shifted by (departure − template's first departure). The template itself is not returned. `frequency.exact` from `exact_times` (`1` → true; `0` or blank → false).
- `directionId`: `'0'` → 0, `'1'` → 1, blank or missing → undefined.
- `stopCount` counts `location_type` 0 or blank. `notImported`: file names in `fileNames` not in 0089 item 10's list, sorted.
- `expiry`: `expired` when `range.end` < today; `endsWithin30Days` when `daysBetween(today, range.end)` ≤ 30; else `ok`.

**Worked examples (mini feed; from `tests/fixtures/gtfs/mini/ANALYSIS-APP-EXPECTED.md`):**

| Date | Active services | Trips B1 / R1 / F1 | Invalid |
|---|---|---|---|
| 20260112 | WKDY | 5 / 2 / 18 | 1 (`B1_W_BAD`) |
| 20260119 | SUN | 1 / 0 / 0 | 0 |
| 20260124 | SAT, EVT | 1 / 2 / 4 | 0 |
| 20260130 | WKDY, SAT | 6 / 3 / 22 | 1 |

- Running seconds on 20260112: B1 6000, R1 4440, F1 16200.
- F1 on 20260124: departures 23:00, 23:30, 24:00, 24:30 (82800, 84600, 86400, 88200).
- `B1_W_OWL` is a trip of 20260123 (Friday), not of 20260124.
- `feedServiceRange(mini)` = 20260105 to 20260201.
- `feedSummary(mini, '20260120', '20260112')`: 3 routes; stopCount 6 (`STN` is a station); notImported = [] (every mini file is in the list); routes B1 type 3 colour `0055AA` 5 trips; expiry `endsWithin30Days`.
- `edge-loop-variants`, 20260105: 6 trips of L1; the two from `L1_freq` have `frequency.exact` false and departures 36000 and 37800.
- `edge-no-direction`: every trip has `directionId` undefined; `notImported` = [].

**Run:** `pnpm exec vitest run src/domain/gtfs`, `pnpm typecheck`, then `pnpm test` once at the end.

**Done when:** the worked examples are tests and pass; no other file changed.

## 10. Sitting 3 order

I3 reads only I2's `FeedTrip` lists, not I2b's code, so I2b and I3 run in parallel (separate files). Decision 0089 item 19 is amended for this: two trips are "the same" when they have the same direction, the same stop sequence and the same first departure. That is stricter than "same pattern" and needs no pattern grouping.

## 11. Card I2b — Day groups, default dates, part-year routes, holidays, annual counts

**Model:** Sonnet, effort `high`. **Rules:** 0089 items 15–21 (item 19 as amended in section 10).

**Files to create:** `src/domain/gtfs/dayGroups.ts`, `holidays.ts`, `annualCounts.ts`, a test beside each, and fixture folders `tests/fixtures/gtfs/cal-school-days/`, `cal-friday-extras/`, `cal-holiday-saturday/`, `cal-holiday-mixed/`, `cal-holiday-unique/`, `cal-part-year/`, each with an `EXPECTED.md` of hand-worked answers, and a row for each in `tests/fixtures/gtfs/README.md`. Use I2's functions (`serviceIdsActiveOn`, `tripsOnDate`, `feedServiceRange`, `dayOfWeek`, `addDays`, `daysBetween`) and `testFeeds.ts`. **Do not touch** other files.

**API (names fixed; field details may be added, not removed):**

```ts
export type ServiceDayKey = 'weekday' | 'saturday' | 'sunday' | 'holiday' | `custom${number}`;
export interface DayGroup { serviceIds: string[]; dates: GtfsDate[]; daysOfWeek: number[]; tripCount: number; addedServiceIds: string[]; removedServiceIds: string[]; tripDelta: number; routeIdsAffected: string[] }
export function dayGroups(tables: GtfsTables, routeIds: ReadonlySet<string>): { range?: { start: GtfsDate; end: GtfsDate }; groups: DayGroup[]; typicalByDayOfWeek: string[][] };
export function defaultDates(tables: GtfsTables, routeIds: ReadonlySet<string>): Partial<Record<'weekday' | 'saturday' | 'sunday', GtfsDate>>;
export function partYearRoutes(tables: GtfsTables, routeIds: ReadonlySet<string>, chosen: Partial<Record<'weekday' | 'saturday' | 'sunday', GtfsDate>>): Array<{ routeId: string; serviceDay: 'weekday' | 'saturday' | 'sunday'; suggestedDate?: GtfsDate }>;
export type HolidayClass = 'saturday' | 'sunday' | 'reducedWeekday' | 'unique' | 'none';
export interface HolidayCandidate { date: GtfsDate; addedServiceIds: string[]; removedServiceIds: string[]; byRoute: Record<string, HolidayClass>; scenarioClass: Exclude<HolidayClass, 'none'> }
export function holidayCandidates(tables: GtfsTables, routeIds: ReadonlySet<string>, chosen: Partial<Record<'weekday' | 'saturday' | 'sunday', GtfsDate>>): HolidayCandidate[];
export function proposeHolidayDays(tables: GtfsTables, routeIds: ReadonlySet<string>, candidates: HolidayCandidate[]): Array<{ key: ServiceDayKey; name: string; date: GtfsDate; dates: GtfsDate[] }>;
export interface AnnualCountProposal { countsByKey: Record<string, number>; datesByKey: Record<string, number>; rangeDates: number; scaled: boolean; unmatchedDates: GtfsDate[] }
export function proposeAnnualCounts(tables: GtfsTables, routeIds: ReadonlySet<string>, classOfDate: (date: GtfsDate) => ServiceDayKey): AnnualCountProposal;
export function proposeRouteOwnCounts(tables: GtfsTables, routeId: string, classOfDate: (date: GtfsDate) => ServiceDayKey, scenarioRangeDates: number): Record<string, number>;
```

`classOfDate` is built by the caller from the candidates and the planner's choices; tests build it with a small helper that applies the default classification (a candidate's `scenarioClass`; Saturday/Sunday classes map to those keys, `reducedWeekday` to weekday, `unique` to the key `proposeHolidayDays` gave the date; any other date maps to its day of the week).

**Worked example (mini, all three routes; check by hand and stop if you disagree):**
- Range 20260105–20260201, 28 dates. Typical sets: Monday–Friday `{WKDY}`, Saturday `{SAT}`, Sunday `{SUN}`.
- Defaults: weekday 20260120 (20260119 has an exception; 20260120 is 1.5 days from the middle, 20260116 is 2.5), saturday 20260117 (20260124 has an exception), sunday 20260118.
- Candidates: 20260119 (removed WKDY, added SUN) → B1 `sunday`, R1 and F1 `none` → scenario `sunday`. 20260124 (added EVT) → B1 and F1 `saturday`, R1 `unique` → scenario `unique`. 20260130 (added SAT) → `unique`.
- Holiday days: Holiday = 20260130 (31 trips, the most), Holiday 2 = 20260124.
- Counts by date: weekday 18, saturday 3, sunday 5, holiday 1, custom1 1 (28). Scaled by 365/28 with the largest remainder: 235, 39, 65, 13, 13 (365).

**Fixtures to write:** school-day services on 60% of weekdays (weekday default must be a school date only if school dates are the most common set; make them the less common set); one extra service only on Fridays; a Monday holiday that runs Saturday service on every route; a holiday with Saturday trips on one route and Sunday trips on another; two unique holidays with different trips; a route running only in July (range covering June–August), flagged part-year with its own counts. Keep each under 30 lines per file.

**Run:** `pnpm exec vitest run src/domain/gtfs`, `pnpm typecheck`, `pnpm test` once at the end. **Done when:** the worked example and every fixture's `EXPECTED.md` are tests and pass.

## 12. Card I3 — Translation part 1: directions, patterns, timepoints, Nodes, stops, distances

**Model:** Haiku, effort `xhigh`. **Rules:** 0089 items 24–29, 38 (`gtfsRouteId`, `gtfsRouteType`, `color` upper-cased).

**Files to create:** `src/domain/gtfs/directionsFromFeed.ts`, `patternsFromFeed.ts`, `timepointsFromFeed.ts`, `distancesFromFeed.ts`, `routeFromFeed.ts`, a test beside each. Reuse `greatCircleMiles` (`src/domain/geo.ts`), `createManagedDirections` and `mapPatternPointsToDirection` (`src/domain/directions.ts`), `newId`/`metadata` (`src/domain/ids.ts`), and the `RouteStopSet` rules of `src/domain/stops.ts` (`validateRouteStopSet` must return no error-level finding on every result). **Do not touch** other files.

**Main API:**

```ts
export interface FeedShapePoint { latitude: number; longitude: number; sequence: number }
export interface RouteFromFeedInput {
  scenarioId: EntityId; routeRow: Row; trips: FeedTrip[];            // every trip of the route on every chosen date, already expanded
  stops: ReadonlyMap<string, Row>; shapes: ReadonlyMap<string, FeedShapePoint[]>;
  timepointOverrides?: Record<string, string[]>;                     // pattern key → stop IDs chosen by the planner
  now: string;
}
export interface TripPlacement { tripId: string; patternId: EntityId; points: Array<{ patternPointId: EntityId; departure: number; arrival: number; filled: boolean }> }
export type GtfsFindingCode = 'mergedVariant' | 'thinnedTimepoints' | 'filledTime' | 'straightLineMiles' | 'stopWithoutLocation' | 'directionsGuessed' | 'dwellAtTimepoint';
export interface GtfsFinding { code: GtfsFindingCode; routeId: string; patternKey?: string; tripId?: string; stopId?: string; detail?: string }
export interface RouteFromFeed { route: Route; nodes: Node[]; directions: RouteDirection[]; patterns: RoutePattern[]; stopSet?: RouteStopSet; placements: TripPlacement[]; patternKeys: Record<EntityId, string>; findings: GtfsFinding[] }
export function routeFromFeed(input: RouteFromFeedInput): RouteFromFeed;
```

- A **pattern key** is `{outbound|inbound}:{timepoint stop IDs joined by '>'}`.
- `placements` gives every trip's time at every pattern point: the departure, and the arrival at the last point. `filled` is true when the time was blank and filled by distance (item 26).
- Route: name = long name, or the short name when the long name is blank; `shortName` = short name when present.
- Segment miles go on the pattern points' `cumulativeMiles`, rounded to 0.01 mile.

**Worked examples (from `tests/fixtures/gtfs/README.md`):**
- `edge-no-direction` (weekday trips on 20260105): directions guessed (finding `directionsGuessed`); Outbound = NA→NB with name "South Terminal", Inbound name "North Terminal"; 2 Nodes (NA, NB, both `terminal`); 2 patterns, each with 2 points; one Route stop `NM` placed on both patterns; Route name "N1"; finding `straightLineMiles` per pattern.
- `edge-loop-variants` (20260105): one Outbound loop pattern `LA>LC>LA` with 5 trips and one short pattern `LA>LC` with 1 trip; Node `LA` used at both ends; one `mergedVariant` finding (`L1_skip`); one `dwellAtTimepoint` (`L1_full_1` at `LC`, stored departure 06:11 = 22260); stops `LB` and `LD`; pattern names "Loop Hub to Loop Hub" and "Loop Hub to Loop Far"; colour `AA00AA`.
- `mini` route B1 (trips on 20260112): Outbound S1>S2>S3 and Inbound S3>S2>S1; `B1_W_2` has `filled: true` at S2 with 08:10:00 (29400); miles measured along `SH_B1_0` (S1→S2 about 0.53 mi along the line; assert within 0.02 of the polyline length you compute independently in the test); colour `0055AA`; `gtfsRouteType` 3.
- A built test feed with 35 flagged timepoints on one trip → 30 points kept, both terminals kept, one `thinnedTimepoints` finding.

**Run:** `pnpm exec vitest run src/domain/gtfs`, `pnpm typecheck`, `pnpm test` once at the end. **Done when:** every worked example is a test and passes, and `validateRouteStopSet` has no error on any built route.

### 12a. Card I3 answers (orchestrator, 2026-11-21)

These amend Decision 0089 items 24–29 as noted there.
1. **Flagged timepoints are per direction, not per trip.** A direction's timepoint stops are every stop flagged `timepoint` = 1 on any of its trips. Each trip's timepoints are those stops it serves, plus its own first and last stop. A blank time at such a stop is filled (item 26). The mini B1 example stands: `B1_W_2` sits on S1>S2>S3 with S2 filled. A stop that is a Node of the Route is never also a Route stop.
2. **Thinning** runs per direction on that stop set, before grouping. The even shares use the median running time of the trips of the direction's most common stop sequence.
3. **Overrides** are keyed by the pattern key before the override. An overridden pattern's trips get the override stops they serve, plus their own first and last stop. Override stops the pattern does not serve are ignored.
4. **Mixed `direction_id`:** trips with a blank value join the direction whose valued trips most often share their first stop, otherwise Outbound, with the finding `directionsGuessed`.
5. **Names:** a headsign is trimmed and cut to 40 characters; a tie goes to the earliest trip's headsign; on a clash both directions keep "Outbound" and "Inbound".
6. **Bad route fields:** a leading `#` is removed from `route_color`; a colour that is still not six hexadecimal digits is left unset, and `route_type` that is not a whole number is left unset, each with a new finding `badRouteField`. A blank `stop_name` uses the `stop_id` as the name.
7. **Missing locations:** stops without a location are skipped in distance chains. A pattern with fewer than 2 located points gets 0 miles and a new finding `unmeasuredPattern`. A blank time whose neighbours cannot be measured is filled by equal spacing (finding `filledTime`, detail `equal`).
8. **File names:** the card's (`…FromFeed.ts`) apply; section 3's names are superseded.
The agent's listed non-blocking choices are accepted.

### 12b. I3 as built: carried to the I4 card

- `routeFromFeed` can throw on an odd route: conflicting stop order between two patterns of one direction (`mapPatternPointsToDirection`). Also, stop IDs that differ only by case give `codeDuplicate`, and a stop repeated within one segment gives `stopPlacement.repeatedInSegment`. The I4 card must catch each per route: that route is not imported, it is listed with the reason, and the rest of the import goes on (0089 item 12).
- Route stops come only from each pattern's most common variant. Stops served only by merged variants are not imported; the `mergedVariant` findings list those trips.

## 13. Card I4 — Translation part 2: run times, trips, service days, blocks, report

**Model:** Haiku, effort `xhigh`. **Rules:** 0089 items 12, 19 (Holiday trips), 30–37, 44; section 12b.

**Files to create in `src/domain/gtfs/`:** `runtimesFromFeed.ts`, `tripsFromFeed.ts`, `blocksFromFeed.ts`, `reportFromFeed.ts`, `translateFeed.ts`, a test beside each. Reuse `routeFromFeed` (I3), `tripsOnDate` (I2), `tripCalculationSource` and `validateRuntimeProfile` (`src/domain/runtime.ts`), `createBlockingBlock`, `normalizeBlockActivities` and `validateBlockingBlock` (`src/domain/blocking.ts`), `newId`/`metadata`. **Do not touch** other files.

**Main API:**

```ts
export interface TranslateServiceDay { key: string; serviceDayId: EntityId; name: string; date: GtfsDate; dateByRouteId?: Record<string, GtfsDate> }
export interface TranslateFeedInput {
  tables: GtfsTables; routeIds: string[]; scenarioId: EntityId; tripProfileId: EntityId;
  serviceDays: TranslateServiceDay[];
  blocks: { import: boolean; blockingScenarioId?: EntityId; pullOutMinutes?: number; pullInMinutes?: number };
  timepointOverrides?: Record<string, Record<string, string[]>>;  // routeId → pattern key → stop IDs
  existingRouteNames?: string[];                                  // level C clash rule (0089 item 4)
  now: string;
}
export interface TranslatedRoute extends RouteFromFeed { runtimeProfiles: RuntimeProfile[]; runtimeAssignments: RuntimeAssignment[]; trips: Trip[] }
export interface FeedTranslation { routes: TranslatedRoute[]; blocks: BlockingBlock[]; skippedRoutes: Array<{ routeId: string; reason: string }>; report: ImportReport }
export function translateFeed(input: TranslateFeedInput): FeedTranslation;
export function importReportCsv(report: ImportReport): string;
```

- For each route, collect its trips on every service day's date (or its own `dateByRouteId` date), call `routeFromFeed` once with all of them, then build profiles, trips and blocks per service day.
- **Per-route failure (12b):** if `routeFromFeed` throws, or the built stop set has an error-level finding, the route goes to `skippedRoutes` with the message and the rest continues.
- **Profiles (item 30):** one per pattern and service day that has trips; name "{service day name} from feed"; method `segmentStart`; `validateRuntimeProfile` must return no error. A band's `segmentRuntimeSeconds[i]` = median over its trips of (time at point i+1 − time at point i), where the time at a point is the departure, and the arrival at the last point.
- **Trips (item 31):** `stopTimes` from the I3 placements; `provenance` = `{ kind: 'generated', creationMethod: 'feed', manuallyChangedFields: [], runtimeProfileId, runtimeCalculationRevision, calculationSource: tripCalculationSource(profile) }`; `tripProfileId` from the input; `publicLabel` = `trip_short_name`.
- **Blocks (items 33–35):** rule as written; deadheads with `minutesAfterPreviousTrip: 0` and no miles; each block must pass `validateBlockingBlock`. If one does not, leave it out, list it with the finding, and report this to the orchestrator (the decision says the question returns to the user).
- **Size warning (item 44):** `report.sizeWarning` true above 40 routes or 5,000 trips on any service day.
- **Report (items 36–37):** per route: patterns, timepoints, stops, trips per service day, blocks; every I3 finding; invalid trips; not-imported files; approximate frequency trips; skipped routes; blocks left out with "also serves". **Fidelity:** per service day and route, feed trips and running seconds on the date (from `tripsOnDate`) vs imported trips and running seconds (first to last stop time); `report.fidelityOk` true only when all are equal. `importReportCsv` writes one row per finding, with columns `section,routeId,serviceDay,tripId,stopId,code,detail`.

**Worked examples:**
- `edge-no-direction`, Weekday 20260105: 3 trips; Outbound profile "Weekday from feed" with bands 06:00–07:00 [720] and 07:00–08:00 [840]; Inbound one band [720]; fidelity OK.
- `edge-multi-route-blocks`, Weekday, blocks on, pull-out/in 10: M1 only → block `Y` imported (2 revenue trips), `X` left out "also serves M2"; both routes → `X`, `Y`, `Z` imported, `X` has 3 revenue trips across two Routes.
- `mini`, all routes, Weekday 20260112 and Saturday 20260117: Weekday trips B1 5, R1 2, F1 18; running seconds B1 6000, R1 4440, F1 16200; fidelity OK; 1 invalid trip (`B1_W_BAD`) listed; F1's generated trips marked approximate only for `F1_W_FREQ` (9).
- Clash: `existingRouteNames: ['main st, crosstown']` → B1 is named "Main St, Crosstown (feed)" and listed.
- Every trip of every example: `tripRuntimeSourceIsCurrent(trip.provenance.calculationSource, profile)` is true.

**Run:** `pnpm exec vitest run src/domain/gtfs`, `pnpm typecheck`, `pnpm test` once at the end.

## 14. Card I5b — Costing with per-route annual counts

**Model:** Haiku, effort `xhigh`. **Rules:** 0089 item 41.

**Files:** `src/domain/costing.ts`, `src/domain/routeCosting.ts`, `src/application/costingService.ts`, `src/domain/costSummary.ts`, `src/persistence/csv.ts` (cost CSV columns only), and their tests. **Do not touch** UI files (I9b shows the markers) or any GTFS file.

**Rule:** a Route's count for a service day = its own count when `ownAnnualServiceDays.enabled` and the day is in `countsByServiceDayId`; otherwise the Scenario's count. Read `costing.ts` and `routeCosting.ts` first and write down, in your report, where service-day annual hours are computed today.
1. **Route rows:** annual hours = hours per day × the Route's count. The Unattributed row uses the largest count among the Routes of its Blocks, with a warning finding `costing.unattributedUsesLargestCount`.
2. **Totals:** when any Route of the Scenario is switched on, each service day's annual hours and cost are the sum of its route rows (incl. Unattributed), not hours per day × the Scenario's count. Each service-day row keeps showing the Scenario's count as `annualServiceDays`, and gains `usesRouteCounts: true`. With no Route switched on, nothing changes.
3. **Both cost bases** (revenue and platform) follow the same counts.
4. **Cost summary and CSV:** a finding or note `costing.routeCountsInUse` listing the Routes on their own counts; the route-day CSV rows write the count actually used in `annualServiceDays`, and a new last column `countSource` (`scenario` or `route`).
5. **Unchanged-totals test (never cut):** the existing Costing tests pass unchanged, and a new test runs the Federal BRT golden scenario with every Route's `ownAnnualServiceDays` absent and then with `enabled: false` and other counts present: every number equals the baseline.
6. **New tests:** two Routes, one with Weekday 62 of the Scenario's 255: its row and the totals use 62 for it and 255 for the other; an interlined Block over both uses 255 with the warning; switching off restores the baseline.

If the costing structure makes rule 2 need a change outside these files, stop and report.

**Run:** costing unit tests, `pnpm typecheck`, `pnpm test`; `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test tests/ui/costing` (all costing specs).

## 15. Sitting 5 split

I6 is split. **I6a** (pure scenario builder and converter) comes first, because Gate V-I needs only the converter. **I6b** (application service for levels A–C, restore point, worker) runs while the orchestrator makes the Gate V-I backups.

## 16. Card I6a — Scenario builder and `tools/gtfs_to_backup.mjs`

**Model:** Haiku, effort `high`. **Rules:** 0089 items 2, 13, 19–21, 39, 41.

**Files to create:** `src/domain/gtfs/scenarioFromFeed.ts` and its test; `tools/gtfs_to_backup.mjs`. **Do not touch** other files.

```ts
export interface ScenarioFromFeedOptions {
  tables: GtfsTables; routeIds: string[]; fileName: string; now: string;
  /** Planner choices; each absent value uses the I2b default. */
  dates?: Partial<Record<'weekday' | 'saturday' | 'sunday', GtfsDate>>;
  holidayClasses?: Record<GtfsDate, 'saturday' | 'sunday' | 'reducedWeekday' | 'unique' | 'weekdayAsNormal'>;
  keepExtraHolidayDays?: boolean;          // default true: "Holiday 2", … as custom days
  routeOwnCountsOn?: string[];             // feed route IDs whose proposed own counts are switched on
  blocks?: { import: boolean; pullOutMinutes: number; pullInMinutes: number };
}
export interface ScenarioFromFeed { records: ScenarioRecords; translation: FeedTranslation; counts: AnnualCountProposal }
export function scenarioFromFeed(projectId: EntityId, scenarioName: string, options: ScenarioFromFeedOptions): ScenarioFromFeed;
export function projectFromFeed(options: ScenarioFromFeedOptions): ProjectSnapshot;  // level A
```

- Start from `createScenarioRecords` (four standard days, Default Trip profile, Default Blocking scenario). Add custom days from `proposeHolidayDays` when kept, with sequence after Holiday and `kind: 'custom'`.
- Dates: I2b `defaultDates`, `partYearRoutes` (a flagged route gets its `suggestedDate` as `dateByRouteId`), `holidayCandidates`, `proposeHolidayDays`; Holiday's date is the proposed one; a service day with no date gets no trips.
- Annual counts from `proposeAnnualCounts` with the classification; set each service day's `annualServiceDays`. Own counts from `proposeRouteOwnCounts` for part-year routes, stored on the Route with `enabled` true only when listed in `routeOwnCountsOn`.
- Blocks: when imported, add a Blocking scenario "From feed" on the Default Trip profile and put the blocks there.
- `importNotes`: one entry (publisher = first agency name, `feedVersion` from `feed_info`, file name, dates as YYYY-MM-DD, route count, `importedAt` = now).
- Merge `translateFeed` output into the records (routes, nodes, directions, patterns, stop sets, profiles, assignments, trips, blocks).
- `projectFromFeed`: `createProject("{agency} ({feed version or first date})")`, one Scenario "Existing service".
- **Test:** for `mini` and every `edge-*` feed, `parseProjectBackup(exportProjectJson(projectFromFeed(...)))` succeeds (backup validation is the gate), counts total ≤ 365, and the mini Weekday has 25 trips; `edge-multi-route-blocks` with blocks has a "From feed" Blocking scenario with 3 blocks.

**Converter** `tools/gtfs_to_backup.mjs`, following `tools/validate_federal_brt_backup.mjs` (Vite `ssrLoadModule`):

```
node tools/gtfs_to_backup.mjs <feed.zip> <out.json> [--routes 31,0,0L] [--blocks 10,10] [--own-counts 0L] [--report out.csv]
```

It reads the ZIP with I1's reader (`readZipEntries`, `findFeedFiles`, `readFeedTable`; `stop_times.txt` filtered to the selected routes' trips), builds `GtfsTables`, calls `projectFromFeed`, writes `exportProjectJson`, writes the report CSV when asked, and prints per route: patterns, Nodes, stops, trips per service day, blocks, plus the counts and the fidelity result. It exits non-zero when `fidelityOk` is false. Run it on `tests/fixtures/gtfs/zips/mini-deflate.zip` into the scratch folder and report the printout.

**Run:** `pnpm exec vitest run src/domain/gtfs`, `pnpm typecheck`, `pnpm test` once, the converter on the mini ZIP.

## 17. Card I6b — Import service, restore point, worker

**Model:** Haiku, effort `high`. **Rules:** 0089 items 2–5, 9.

**Files:** `src/application/gtfs/gtfsImportService.ts` and test; `src/application/gtfs/gtfsWorker.ts` (Web Worker entry) and `gtfsWorkerClient.ts`; the restore-point kind `importGtfsRoutes` in `src/domain/types.ts`, `src/domain/restorePoints.ts`, `src/application/restorePointCoverage.ts` and their tests. **Do not touch** UI files.

- `importAsProject(options)` → level A through `RouteDefinitionService.importProject(exportProjectJson(projectFromFeed(options)))`.
- `importAsScenario(projectId, options)` → level B: `scenarioFromFeed` written with one Scenario write (find the existing write used by Scenario copy, `projectSnapshotWithScenario`).
- `addRoutes(scenarioId, tripProfileId, blockingScenarioId | undefined, options)` → level C: take the restore point `importGtfsRoutes` first; translate with `existingRouteNames`; add only the new records; do **not** change service days or counts; return the report with the proposed-vs-Scenario count differences. Undo of the restore point removes the added Routes and all they own (follow how `deleteRoute` is covered).
- Worker: `gtfsWorker.ts` reads the file bytes and runs the read + `scenarioFromFeed`/`translateFeed` steps, posting progress per file; `gtfsWorkerClient.ts` falls back to the same code on the main thread when `Worker` is unavailable. Results are plain data (structured clone).
- **Tests (fake-indexeddb):** each level on `mini`; level C leaves the Scenario's counts unchanged, renames a clash, and its Undo removes exactly the added records; restore-point coverage tests include the new kind.

**Run:** the I6 row of section 4 (`undo-history.spec.ts`, `data-safety.spec.ts`), `pnpm typecheck`, `pnpm test`.

## 18. Sitting 7: user answers to the mock-ups (2026-11-22)

All approved: A (screens as drawn), B (Holidays open when present; Day groups and Part-year routes closed unless they find something), C (patterns of one direction that share a headsign are named "{headsign} (to {last timepoint name})", and only when that still clashes, " 2", " 3"), D (timepoint review on step 5). Mock-ups: `docs/implementation/gtfs-import/mockups.html`.

## 19. Card I8 — Import dialog, steps 1–3, and the data it needs

**Model:** Haiku, effort `high`. **Rules:** Decision 0089; the mock-ups (sections "Entry points" excluded, "Step 1", "Step 2", "Step 3"); section 18.

**Files:** new `src/ui/gtfs/GtfsImportDialog.tsx`, `src/ui/gtfs/importSteps.tsx` (steps 1–3 as components), `src/ui/gtfs/gtfsImportModel.ts` (pure view state and derived rows, with test), `src/ui/styles/gtfs-import.css` (imported from `src/ui/styles/index.css`); `src/domain/gtfs/dayGroups.ts` (add `serviceDayGroups`); `src/domain/gtfs/patternsFromFeed.ts` (naming rule C) with tests; `src/application/gtfs/gtfsWorkerClient.ts` and `gtfsWorker.ts` (two new jobs); new `tests/ui/gtfs-import.spec.ts`. **Do not touch** `App.tsx` or the menus (I9). The spec opens the dialog through a test-only hook: export `openGtfsImportForTest` from `GtfsImportDialog.tsx` only if no cleaner way exists; prefer rendering it from a tiny dev-only route — ask if unsure.

1. **Jobs.** `readFeedOverview(bytes)` → tables without `stopTimes` + `feedSummary` (step 1, 2). `readRouteStopTimes(bytes, routeIds)` → `stopTimes` for those routes (after step 2's Next, and in the background when the selection settles for 600 ms, to fill the Patterns column). Both through the worker with the existing main-thread fallback; progress per file.
2. **Step 1** as drawn: file input (accept `.zip`), Feed panel, Reading panel with Cancel, expiry warning (only `expired` / `endsWithin30Days`), refusal text from `GtfsFeedError`/`ZipReadError` with Next disabled.
3. **Step 2** as drawn: search (short or long name, case-insensitive), type filter, Select all shown, Clear, running total "n routes selected · m weekday trips", rows sorted by route order (numeric part, then text), colour dot, Patterns column ("—" until counted). Weekday trips counted on the default weekday date. Size warning above 40 routes or 5,000 weekday trips. Next needs ≥ 1 route.
4. **Step 3** as drawn: one row per service day with a date input (limited to the feed range), "typical"/"chosen" chip, trips, dates in feed, editable annual days (whole numbers ≥ 0; total must be ≤ 365 or Next is off with the message used by the Annual service days panel), basis text. Sections: Holidays (open when any) with per-route classes and a class menu (Saturday, Sunday, Weekday (reduced), Holiday, Holiday 2…, Not a holiday = `weekdayAsNormal`); Day groups (closed unless a service day has more than one group) using `serviceDayGroups`; Part-year routes (closed unless any) with own date and the own-counts switch.
5. **`serviceDayGroups(tables, routeIds, key)`**: the day groups restricted to the dates of that service day's days of the week, each with dates, trips, and the difference from that day's typical set. RTD Sunday: one group of 14 dates (holidays are listed under Holidays, not here).
6. **Naming rule C** in `patternsFromFeed.ts`. Test: RTD-like fixture with three patterns of one direction sharing headsign "Evans" → "Evans (to {last timepoint})" each.
7. **Model** `gtfsImportModel.ts` holds every choice as plain data, and produces the `FeedPlanOptions` for the service (`dates`, `holidayClasses`, `routeOwnCountsOn`, counts edits). Unit-test the derivations.
8. **Accessibility:** the dialog uses `ModalDialog` (draggable, Decision 0068); the steps bar is a list with `aria-current="step"`; tables have headers; every input has a label.
9. **Spec** `tests/ui/gtfs-import.spec.ts`: upload `tests/fixtures/gtfs/zips/mini-deflate.zip`; step 1 shows "Mini Test Transit"; step 2 lists B1, F1, R1 in route order and totals; step 3 shows Weekday 20 Jan 2026, the holiday rows (19 Jan Sunday; 24 and 30 Jan unique), counts 235/39/65/13/13; a refused file shows its reason.

**Run:** unit tests for changed files, `pnpm typecheck`, `pnpm test`, the new spec plus `draggable-dialogs.spec.ts` and `keyboard.spec.ts`, `pnpm build`. Take a screenshot of each step at 1440 px into the scratchpad (`/tmp/claude-0/-home-user/3bdc75fd-55d7-5724-ad85-d8deb92c9cc0/scratchpad/i8/`) for review.
