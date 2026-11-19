# Stop schedule export, stop locations, distance-weighted stop times: work order plan

- Requested by the user on 2026-11-19, after a design discussion based on the Federal BRT STOPS modeling workbook. Rules: Decision 0084 (`docs/decisions/0084-stop-schedule-export.md`), Decision 0085 (`docs/decisions/0085-stop-and-timepoint-locations.md`), Decision 0086 (`docs/decisions/0086-distance-weighted-stop-times.md`). Where this plan and a decision differ, the decision governs and the difference is reported to Opus.
- Branch: `claude/sweet-allen-m3vw3x`, unless the user names another. Do not push to any other branch. Do not open a pull request unless the user asks.
- **Orchestration: Opus** (primary agent). Opus gives each Haiku package its brief from this plan, reviews every package diff against this plan, does the UI-design packages (SS3, SL4, SD2), resolves every question a Haiku package stops on, and runs the final verification.
- **Structural packages: Haiku** (structural class, Luna): SS1, SS2, SL1, SL2, SL3, SD1. Haiku follows this plan literally. Every function name, file, rule, and test in a Haiku package is written here. Where this plan does not say what to do, or a code fact in section 3 no longer holds, Haiku stops and reports the question to Opus. Haiku does not choose wording, layout, or behaviour beyond what is written here.
- Do not start the next package automatically. At each gate, report the result to the user and recommend the next package and model.

## 1. Summary

1. **Step 1 (Decision 0084).** Trips **Actions → Export stop schedule CSV…**: both directions, one row per stop, one column per pattern and period (a sample trip) or per Trip, with Stop ID, name, latitude, longitude, distance, and speed limit columns. No stored-data change.
2. **Step 2 (Decision 0085).** Optional latitude, longitude, and speed limit on Route stops and on timepoints per pattern point; a **Show locations** expansion of the Stops drawer; Copy and Fill carry timepoint locations; a stop location CSV import; the export fills its location and distance columns. Backup schema 16; no Dexie version.
3. **Step 3 (Decision 0086).** A Route setting for equal or distance-weighted stop spacing, and 1-second rounding, in the Stop trips drawer.

## 2. Settled decisions (user, 2026-11-19)

| Question | Answer |
|---|---|
| Export layout | Wide, like the STOPS workbook; both directions in one file; direction names as stored |
| Duplicate name columns (workbook W, X) | Not exported |
| "As the crow flies" note | Not exported |
| Location entry | Both a CSV import and editable columns in the Stops drawer (an expansion of the drawer) |
| Same Node, different position by direction | Timepoint locations are per pattern point, like timepoint stop IDs |
| Copy of locations between patterns | Yes, through the existing Copy and Fill actions |
| Model split | Haiku implements structural packages from this plan with no assumptions; Opus orchestrates, does UI, and reviews |

## 3. Code facts this plan depends on (verified 2026-11-19 on `main` at `cc7a67e`)

Haiku must not assume anything beyond these facts. If a fact no longer holds when a package starts, stop and report it to Opus.

| Fact | Location |
|---|---|
| `RouteStop { id; name; stopCode? }`, `StopTimingRule`, `PatternStopPlacement`, `StopTimeRoundingSeconds = 30 \| 60`, `TimepointStopCodes`, `RouteStopSet` (with optional `timepointStopCodesByPatternId`). | `src/domain/types.ts:51-67` |
| `PatternPoint { id, nodeId, sequence, cumulativeMiles, directionColumnId? }`; `RoutePattern` has optional `directionId` and `sequence`. | `src/domain/types.ts:16`, `:33` |
| `RuntimeBand { id, label, sequence, startTime, endTime, segmentRuntimeSeconds }`; `RuntimeProfile { …, patternId, bands }`; `RuntimeAssignment { patternId, serviceDayId, runtimeProfileId }`. | `src/domain/types.ts:35-37` |
| `PlannedPeriod { id, startTime, endTime, headwaySeconds }`, start inclusive, end exclusive; `PlannedFrequency.periods`. | `src/domain/types.ts:39-49` |
| `Trip.stopTimes` is `{ patternPointId, sequence, time }[]`; `Trip.publicLabel?`. | `src/domain/types.ts:125` |
| `sortedPoints`, `placementsBySegment`, `normalizeTimepointStopCodes`, `normalizePlacements`, `validateRouteStopSet` (rounding check at line 121), `pruneRouteStopSets`, `reconcilePlacements`, `reconcileTimepointStopCodes`, `remapRouteStopSet`, `DEFAULT_STOP_ROUNDING_SECONDS = 60`. | `src/domain/stops.ts:18-305` |
| `StopTimeRow` and `segmentStopTimes(a, b, timings, roundingSeconds)` (equal spacing formula at line 35) and `stopTimeRows({ pattern, set?, nodes, trip?, placements?, roundingSeconds? })`. Timepoint rows carry `stopCode` from `timepointStopCodesByPatternId`. | `src/domain/stopTimes.ts:4-101` |
| `planCodes` (timepoint stop ID Fill/Copy, the model for location Fill/Copy), `finish` (sorting and `affectedPatterns`), `planStopFill`, `planStopCopy`, `stopCopyCandidatePatternIds`, `applyTimepointCodePlan`, `applyStopPlacementPlan`, `sameDirection`. | `src/domain/stopPlacementMatching.ts:68-323` |
| `RouteStopsEdit` (line 320), `StopDraft` (333), `RouteStopValidationError` (334), `StopPlacementPreview` (338), `STOPS_CHANGED_ELSEWHERE` (349), `StopCopyUndo` (352). | `src/application/routeDefinitionService.ts:320-352` |
| `saveRouteStops` rebuilds each stop as `{ id, name, stopCode? }` (lines 817-820) and so **drops any other stop field**; it writes `roundingSeconds: edit.roundingSeconds`. | `src/application/routeDefinitionService.ts:793-831` |
| `previewStopFill` (835), `applyStopFill` (841), `previewStopCopy` (849; refuses when the pattern has no placements and no codes), `applyStopCopy` (867; stale check compares `JSON.stringify([plan.changes, plan.codeChanges])`), `undoStopCopy` (898; restores the whole set), `describeStopPlacementPlan` (`nodeNames` filled from code changes and skips at line 936). | `src/application/routeDefinitionService.ts:835-940` |
| Route-edit reconciliation of placements and timepoint stop IDs. | `src/application/routeDefinitionService.ts:1675-1694` |
| `assertRouteStopSets` refuses an invalid stored set, including a set with no stops and no codes. | `src/persistence/routeStopPersistence.ts` |
| Backup: `PROJECT_BACKUP_SCHEMA_VERSION = 15` (line 43, with its version comment at line 42); `validateRouteStopSets` (150-191; rounding must be 30 or 60 at line 155); accepted versions list (723); per-collection version lists such as `[13, 14, PROJECT_BACKUP_SCHEMA_VERSION]` (753-776). The schema bump template is commit `e8e21c1` (`git show e8e21c1 -- src/persistence`). | `src/persistence/backup.ts` |
| Dexie is at version 15. **This plan does not change it.** | `src/persistence/database.ts:142` |
| Backup schema 15 assertions: `backup.test.ts` lines 139, 167, 270, 437, 439, 482, 548; `backupImportValidation.test.ts:56`; `plannedFrequencyBackup.test.ts:39`; `repositoryContract.test.ts:133`; `routeStopBackup.test.ts:49`, `:111`; `tests/ui/automatic-blocking-backup.spec.ts:29`. The `15` in `database.test.ts`, `repository.test.ts`, and `tests/ui/scenario-copy-recovery.spec.ts` is the Dexie version and does not change. | as listed |
| `csvEscape`, `neutralizeFormulaText` (prefixes `=`, `+`, `-`, `@`). The application re-exports them from `src/application/csvText.ts`. | `src/persistence/csv.ts:9-15` |
| `formatServiceTime(seconds, includeSeconds)`. | `src/domain/time.ts:3` |
| `orderDirections(directions)`, `orderPatterns(patterns, directionId?)`. | `src/domain/directions.ts:52`, `:57` |
| Stop times export and its test fixture style (`csvRows` from `src/testSupport/csvRows.ts`). | `src/application/stopTimesCsv.ts`, `src/application/stopTimesCsv.test.ts` |
| `TripsWorkspace`: `routeDayTrips` (both directions of the Route on the day for the Trip Profile; state at line 122, loaded at 268); `routeRuntime` (`{ profiles, assignments }` = the Route's profiles and the day's assignments; set at 261, may be `undefined`); `planResult?.plan`; `exportStopTimesCsv` (701-709); `tripActionsMenu` export group (856). | `src/ui/trips/TripsWorkspace.tsx` |
| Stop trips drawer: `ROUNDING_OPTIONS` (line 22) and its `saveRouteStops` call (line 92). | `src/ui/trips/StopTripsDrawer.tsx` |
| Stops drawer: `Draft` (line 24), `draftOf` (26), `changeCount` (29), `stopDraft` passed to the Fill dialog (75), `save` calls `saveRouteStops` (171-182), the table (233-251), `onFilled` (254). | `src/ui/route/PatternStopsDrawer.tsx` |
| Validation message text by `messageKey`. | `src/ui/shared/messages.ts` (`USER_FACING_VALIDATION_MESSAGES`) |
| Scripts: `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:ui`. In a cloud session browser runs use `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium` and `--trace off`. | `codex.md:56`, `:131` |

## 4. Rules

### 4.1 Types (SL1 adds them to `src/domain/types.ts`)

```ts
/** Decision 0079, 0085. Location fields are optional; latitude and longitude are both present or both absent. */
export interface RouteStop { id: EntityId; name: string; stopCode?: string; latitude?: number; longitude?: number; speedLimitMph?: number; }
/** Decision 0085. The location of one timepoint on one pattern. Never stored empty. */
export interface StopLocation { latitude?: number; longitude?: number; speedLimitMph?: number; }
/** Decision 0085. Pattern point ID → its location. */
export type TimepointLocations = Record<EntityId, StopLocation>;
/** Decision 0079, 0086. */
export type StopTimeRoundingSeconds = 1 | 30 | 60;
/** Decision 0086. Absent means 'equal'. */
export type StopInterpolation = 'equal' | 'distance';
```

`RouteStopSet` gains, after `timepointStopCodesByPatternId?`:

```ts
  /** Decision 0085. Pattern ID → its timepoints' locations. A pattern with none has no entry. */
  timepointLocationsByPatternId?: Record<EntityId, TimepointLocations>;
  /** Decision 0086. Absent means 'equal'. Stored only when 'distance'. */
  interpolation?: StopInterpolation;
```

### 4.2 Locations (SL1, `src/domain/stops.ts`)

- `normalizeStopLocation(value: StopLocation | undefined): StopLocation | undefined`: keeps each of the three fields only when it is a finite number; returns `undefined` when none is kept. Field order in the result: `latitude`, `longitude`, `speedLimitMph`.
- `normalizeTimepointLocations(pattern, locations)`: like `normalizeTimepointStopCodes`: in point order, drops entries whose point is not on the pattern, normalizes each value, drops `undefined`.
- `sameLocation(left?: StopLocation, right?: StopLocation): boolean`: both normalized values are `undefined`, or all three fields are equal (`===`, with absent equal to absent).
- `hasCoordinates(value?: { latitude?: number; longitude?: number }): value is { latitude: number; longitude: number }`: both are finite numbers.

### 4.3 Validation (SL1, added to `validateRouteStopSet`; `ruleId` equals `messageKey`; all errors)

Checked on every stop (entityType `routeStop`, entityId the stop id) and on every timepoint location of every pattern of the Route (entityType `timepointLocation`, entityId the pattern point id, parameters `{ patternId }`):

| ruleId | field | When |
|---|---|---|
| `stopLocation.incomplete` | `latitude` | exactly one of latitude and longitude is a number |
| `stopLocation.latitudeRange` | `latitude` | latitude present and not finite, or below −90, or above 90 |
| `stopLocation.longitudeRange` | `longitude` | longitude present and not finite, or below −180, or above 180 |
| `stopLocation.speedLimitInvalid` | `speedLimitMph` | speed present and not finite, or ≤ 0, or > 100 |

`routeStopSet.roundingInvalid` now fires when `roundingSeconds` is not 1, 30, or 60. New: `routeStopSet.interpolationInvalid` (error, entityType `routeStopSet`, field `interpolation`) when `interpolation` is present and is not `'equal'` or `'distance'`.

### 4.4 Lifetime (SL1, SL2)

Every place that handles `timepointStopCodesByPatternId` handles `timepointLocationsByPatternId` the same way, with `normalizeTimepointLocations` in place of `normalizeTimepointStopCodes`:

- `pruneRouteStopSets`: a set is kept when it has stops, codes, or locations; locations of a missing pattern or point are dropped; the input array is returned unchanged when nothing changed.
- `reconcileTimepointLocations(saved, next, locations)`: same rule as `reconcileTimepointStopCodes` (kept while the point remains and stands on the same Node); returns `{ locations, removedCount }`.
- `remapRouteStopSet`: maps pattern and point keys of locations as it maps codes.
- `assertRouteStopSets`: a set with no stops, no codes, and no locations is refused; each location entry belongs to a pattern of the Route and to a point of that pattern, and is a non-empty object whose fields are numbers.
- Route-edit reconciliation (`routeDefinitionService.ts:1675-1694`) applies `reconcileTimepointLocations` next to the codes.

### 4.5 Geometry (SL1, new `src/domain/geo.ts`)

```ts
export const EARTH_RADIUS_MILES = 3958.8;
/** Haversine distance in miles. */
export function greatCircleMiles(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number
```

Formula: φ in radians; `h = sin²(Δφ/2) + cos φ1 · cos φ2 · sin²(Δλ/2)`; result `2 · R · asin(√h)`. Test: (39.912274, −104.99353) to (39.914169, −105.006705) is 0.71 miles to 2 decimals.

### 4.6 Timepoint location Fill and Copy (SL1, `src/domain/stopPlacementMatching.ts`)

A copy of `planCodes` named `planLocations`, with these substitutions and nothing else:

| `planCodes` | `planLocations` |
|---|---|
| `input.openCodes`, `input.codesByPatternId` | `input.openLocations`, `input.locationsByPatternId` (new optional fields of `StopPlacementPlanInput`) |
| `normalizeTimepointStopCodes` | `normalizeTimepointLocations` |
| a code is "present" when not `undefined` | a location is present when `normalizeStopLocation` returns a value |
| `previous === code` (skip identical) | `sameLocation(previous, location)` |
| groups keyed by the code string | groups keyed by `JSON.stringify(normalizeStopLocation(location))` |
| conflict candidates `{ stopCode, patternIds }` sorted by `stopCode` | `{ location, patternIds }` sorted by the JSON key |

New types:

```ts
export interface TimepointLocationChange { patternId: EntityId; patternPointId: EntityId; nodeId: EntityId; previous?: StopLocation; next: StopLocation; sourcePatternIds: EntityId[]; }
export interface TimepointLocationSkip { patternId: EntityId; nodeId: EntityId; reason: StopSkipReason; candidates?: { location: StopLocation; patternIds: EntityId[] }[]; }
```

`StopPlacementPlan` gains `locationChanges: TimepointLocationChange[]` and `locationSkips: TimepointLocationSkip[]`. `finish` calls `planLocations`, sorts both lists like the code lists, and counts each location change in `affectedPatterns` (overwrite when `previous` is present). New `applyTimepointLocationPlan(patterns, current, plan)` is a copy of `applyTimepointCodePlan` for locations.

### 4.7 Stop schedule model (SS1, new `src/domain/stopSchedule.ts`)

```ts
export type StopScheduleColumnMode = 'sample' | 'all';
export interface StopScheduleInput {
  directions: RouteDirection[];            // already in direction order
  patterns: RoutePattern[]; nodes: Node[]; set?: RouteStopSet;
  trips: Trip[];                            // the Route's Trips of the day and Trip Profile, both directions
  runtimeProfiles: RuntimeProfile[];        // the Route's profiles
  runtimeAssignments: RuntimeAssignment[];  // the day's assignments
  plan?: PlannedFrequency;
  columnMode: StopScheduleColumnMode;
  omitTimepointsWithoutStopId: boolean;
}
export interface StopScheduleRow { key: string; name: string; stopCode?: string; isTimepoint: boolean; latitude?: number; longitude?: number; speedLimitMph?: number; distanceMiles?: number; }
export interface StopScheduleColumn {
  patternId: EntityId; patternName: string;
  label: string;                            // runtime band label, or 'Service'
  headwaySeconds?: number; tripCount: number;
  startTime: ServiceSeconds; endTime: ServiceSeconds;
  tripId: EntityId; tripLabel: string;
  /** One entry per row: a time, undefined (served, no usable time), or null (not served by this pattern). */
  times: Array<ServiceSeconds | undefined | null>;
  runSeconds?: number;
}
export interface StopScheduleDirection { directionId: EntityId; name: string; rows: StopScheduleRow[]; columns: StopScheduleColumn[]; orderConflict: boolean; }
export function buildStopSchedule(input: StopScheduleInput): StopScheduleDirection[]
```

Steps, for each direction in input order:

1. **Patterns.** `orderPatterns(input.patterns, direction.id)`, keeping those with at least one Trip in `input.trips` with a usable departure (step 3). A direction with no such pattern is left out of the result.
2. **Pattern rows.** For each pattern, `stopTimeRows({ pattern, set, nodes })` gives its rows in order (Decision 0079). Row key: when the row's `stopCode` trimmed is not empty, `code:` + lower case of it; otherwise `stop:` + `stopId` for a stop row, `node:` + `nodeId` for a timepoint row. When a key repeats within one pattern, the second occurrence gets `#2`, the third `#3`, and so on. When `omitTimepointsWithoutStopId` is true, timepoint rows with no stop ID are removed from the pattern's row list **after** keys are assigned; times are still computed on the full row list.
3. **Departure.** A Trip's departure is its time at the pattern's first point by `sequence`; when it has none, its smallest `stopTimes` time; a Trip with no times is ignored. Trips of a pattern are sorted by departure, then by `id`.
4. **Merged rows.** The spine is the pattern with the most rows (ties: the first in step 1 order). Start with the spine's keys. For each other pattern in step 1 order, set `cursor = -1`, then for each of its keys: if the key is in the merged list at index `i` and `i > cursor`, set `cursor = i`; if it is not in the list, insert it at `cursor + 1` and set `cursor = cursor + 1`; if it is in the list at `i ≤ cursor`, insert a new key `key + '~' + n` (n = 2, 3, … the first unused) at `cursor + 1`, set `cursor = cursor + 1`, and set `orderConflict = true`. The pattern's row is then identified by the key it was placed under.
5. **Row details.** `name`, `stopCode`, and `isTimepoint` come from the first pattern, in the order spine first then step 1 order, that has the row. Latitude, longitude, and speed limit: SS1 leaves them `undefined`; SL3 fills them (section 4.9).
6. **Periods (sample mode).** Boundaries = `startTime` and `endTime` of every `plan.periods` entry, plus `startTime` and `endTime` of every band of the pattern's profile (the `runtimeAssignments` entry whose `patternId` is the pattern, then the `runtimeProfiles` entry with that id; none → no bands). Sort and remove duplicates: b₀ < b₁ < … < bₙ. Windows: `(−∞, b₀)`, `[b₀, b₁)`, …, `[bₙ₋₁, bₙ)`, `[bₙ, +∞)`; with no boundaries, one window `(−∞, +∞)`. Each Trip goes in the window that contains its departure. Windows with no Trips are dropped. One column per window, in time order:
   - `tripId`: the window's first Trip.
   - `tripCount`: the window's Trip count.
   - `headwaySeconds`: with 2 or more Trips, the gaps between consecutive departures sorted ascending, element `Math.floor((gaps.length - 1) / 2)`; otherwise absent.
   - `startTime`: the window start, or the first departure when the start is −∞. `endTime`: the window end, or the last departure when the end is +∞.
   - `label`: the label of the band with `startTime ≤ departure < endTime` for the window's first Trip; `'Service'` when none.
7. **Every-trip mode.** One column per Trip in step 3 order. `tripCount` 1; `headwaySeconds` = departure − previous departure of the same pattern (absent for the first); `startTime = endTime = departure`; `label` as in step 6.
8. **Column fields.** `patternName` = `pattern.name`. `tripLabel` = `trip.publicLabel` when not empty, else `Trip ` + its 1-based position in step 3 order. `times`: for each merged row, `null` when the pattern has no row with that key; otherwise the `time` of that row from `stopTimeRows({ pattern, set, nodes, trip })`. `runSeconds` = the last defined time minus the first defined time, or absent with fewer than two.
9. **Distance (SS1 rule).** For a pattern's full row list (step 2, before omission), the piece between rows *k* and *k + 1* is the segment miles (`next.cumulativeMiles − point.cumulativeMiles` of the segment's two points) when both rows are timepoints of the same segment (no stop between them) and that value is above 0; otherwise undefined. A row's distance in this pattern is the sum of the pieces from the row to the pattern's next **exported** row, undefined if any piece is undefined or the row is the pattern's last exported row. `StopScheduleRow.distanceMiles` is the first defined value over the patterns that have the row, spine first then step 1 order.

### 4.8 Stop schedule CSV (SS2, new `src/application/stopScheduleCsv.ts`)

`stopScheduleCsv(directions: StopScheduleDirection[]): string`. Lines joined with `\r\n`, file ends with `\r\n`, every cell through `csvEscape`. Free text cells (direction name, pattern name, stop name, stop ID, band label, Trip label) go through `neutralizeFormulaText`; times, numbers, `-`, and fixed labels do not. For each direction, in order, separated by one empty line:

1. A row with one cell: the direction name (free text).
2. `['Stop ID', 'Stop Name', 'Latitude', 'Longitude', 'Distance (miles)', 'Speed Limit', …patternName of each column]`
3. `['', '', '', '', '', '', …header of each column]`. Header: three lines joined by `\n`:
   - sample mode: `label`; `headwayText`; `${formatServiceTime(startTime)}-${formatServiceTime(endTime)}`;
   - every-trip mode: `label`; `tripLabel`; `formatServiceTime(startTime)`;
   - `headwayText`: with `headwaySeconds`, `${minutes} min` when divisible by 60, otherwise `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`; without it, `${tripCount} trip` (or `trips` when not 1).
   The mode is passed as a second argument: `stopScheduleCsv(directions, columnMode)`.
4. One line per row: `stopCode ?? ''`, `name`, `latitude ?? ''`, `longitude ?? ''`, `distanceMiles === undefined ? '' : distanceMiles.toFixed(2)`, `speedLimitMph ?? ''`, then per column `null → '-'`, `undefined → ''`, a time → `formatServiceTime(t, t % 60 !== 0)`. Numbers are written with `String(value)`.
5. `['', 'Run time (min)', '', '', '', '', …runSeconds === undefined ? '' : String(Math.round(runSeconds / 6) / 10)]`.

### 4.9 Locations in the stop schedule (SL3)

- Row latitude and longitude: a stop row takes the stop record's fields; a timepoint row takes, from the first pattern (spine first, then step 1 order) that has the row, the normalized location of its pattern point. Speed limit the same way. Values are used only when `hasCoordinates` holds (speed only when it is a number).
- Distance pieces (replaces the SS1 piece rule; the summing and the pattern choice of section 4.7 step 9 stay): for rows *k* and *k + 1* in segment *s* of the pattern (the timepoint that opens *s*, its stops, and the timepoint that closes it):
  1. when every member of *s* has coordinates, the segment miles are above 0, and the sum *C* of `greatCircleMiles` between consecutive members of *s* is above 0: `greatCircleMiles(k, k + 1) × segmentMiles ÷ C`;
  2. otherwise, when rows *k* and *k + 1* both have coordinates: `greatCircleMiles(k, k + 1)`;
  3. otherwise the SS1 rule.
  Timepoint coordinates for pieces come from this pattern's own point locations.

### 4.10 Stop location CSV import (SL3, pure)

New `src/application/csvRead.ts`: `parseCsv(text: string): string[][]`, RFC 4180: a leading U+FEFF removed; fields separated by `,`; records by `\r\n`, `\n`, or `\r`; a quoted field may contain commas, line breaks, and `""` for a quote; a trailing empty record is dropped.

New `src/application/stopLocationImport.ts`:

```ts
export interface StopLocationFileRow { line: number; stopCode?: string; name?: string; latitude: number; longitude: number; speedLimitMph?: number; }
export function readStopLocationFile(text: string): { rows: StopLocationFileRow[]; skippedLineCount: number; missingColumns: boolean }
export interface StopLocationTarget { key: string; stopCode?: string; name: string; }   // 'stop:<id>' or 'point:<patternPointId>'
export interface StopLocationMatch { key: string; row: StopLocationFileRow; by: 'id' | 'name'; }
export function matchStopLocations(rows: StopLocationFileRow[], targets: StopLocationTarget[]): { matches: StopLocationMatch[]; conflictStopCodes: string[]; unmatchedTargetKeys: string[]; unusedRowLines: number[] }
```

- Header: the first record that has a latitude column and a longitude column. Header cells are compared trimmed and lower case. Aliases: stop ID `stop id`, `stop_id`, `stopid`, `brt id`, `id`; stop code `stop code`, `stop_code`; name `stop name`, `stop_name`, `name`; latitude `latitude`, `lat`, `stop_lat`; longitude `longitude`, `lon`, `lng`, `long`, `stop_lon`; speed `speed limit`, `speed_limit`, `speed limit (mph)`, `speed`. When both a stop code and a stop ID column exist, a row's `stopCode` is the stop code cell when not empty, else the stop ID cell. No header found: `missingColumns: true`, no rows.
- Each later record: latitude and longitude parsed with `Number(cell.trim())`; when either is empty or not finite the record is skipped (counted in `skippedLineCount`). Speed: `Number` when the cell is not empty and finite, else absent. `line` is the 1-based record number. Values are not range-checked here; validation (section 4.3) reports them on save.
- Matching: (1) by ID: `target.stopCode` and `row.stopCode`, trimmed, lower case, equal. When the file has two rows with that ID and different latitude, longitude, or speed, the ID goes in `conflictStopCodes` and does not match. (2) by name, for targets with no ID match: the name lower case, with runs of whitespace replaced by one space and trimmed, equal for exactly one target and exactly one row, and that row is not used by an ID match. (3) Targets without a match go in `unmatchedTargetKeys`; rows used by no match go in `unusedRowLines`. Matches are in target order.

### 4.11 Distance spacing and 1-second rounding (SD1, `src/domain/stopTimes.ts`)

- `segmentStopTimes` gains an optional last parameter `fractions?: readonly number[]`, one per timing. When given, the `interpolate` entry at position *i* gets `Math.max(a, Math.floor((a + (b - a) * fractions[i]) / roundingSeconds + 1e-9) * roundingSeconds)`; `previous` and `next` are unchanged; the final raise-to-previous pass is unchanged. Without it, behaviour is exactly as today.
- `stopTimeRows` gains optional `interpolation?: StopInterpolation` (overrides `set.interpolation`, like `roundingSeconds`). When the effective value is `'distance'`, for each segment the chain is the opening point's location (from `set.timepointLocationsByPatternId[pattern.id]`), each placed stop's record, and the closing point's location. When every member `hasCoordinates` and the chain total is above 0, `fractions[i]` = the cumulative `greatCircleMiles` from the opening point to stop *i* ÷ the total, and the segment is computed with them; otherwise without.
- `StopTimeRow` gains `spacing?: 'equal' | 'distance'` on stop rows: `'distance'` when fractions were used for its segment, otherwise `'equal'`.

## 5. Package overview

| Package | Title | Model | Depends on | Owns |
|---|---|---|---|---|
| SS0 | Decision records 0084-0086 and this plan | Opus | none | done 2026-11-19 |
| SS1 | Stop schedule model | Haiku | SS0 | `src/domain/stopSchedule.ts`, `src/domain/stopSchedule.test.ts` |
| SS2 | Stop schedule CSV | Haiku | SS1 | `src/application/stopScheduleCsv.ts`, `src/application/stopScheduleCsv.test.ts` |
| SS3 | Export dialog and wiring | Opus (UI) | SS2 | `src/ui/trips/TripsWorkspace.tsx` (export only), `src/ui/trips/StopScheduleExportDialog.tsx` (new), `tests/ui/stop-schedule-export.spec.ts` (new) |
| Gate A | User reviews an exported Federal file | — | SS3 | — |
| SL1 | Location and spacing types, validation, lifetime, geometry, location Fill/Copy | Haiku | Gate A | `src/domain/types.ts`, `src/domain/stops.ts`, `src/domain/geo.ts` (new), `src/domain/stopPlacementMatching.ts` (+ tests) |
| SL2 | Backup 16, persistence checks, service, pass-through in drawers, messages | Haiku | SL1 | `src/persistence/backup.ts`, `src/persistence/routeStopPersistence.ts`, version assertions, `src/application/routeDefinitionService.ts`, the two save calls in the drawers, `src/ui/shared/messages.ts` (+ tests) |
| SL3 | Locations in the export; CSV reader and location import | Haiku | SL2 | `src/domain/stopSchedule.ts`, `src/application/csvRead.ts`, `src/application/stopLocationImport.ts` (+ tests) |
| SL4 | Stops drawer locations expansion and import dialog | Opus (UI) | SL3 | `src/ui/route/PatternStopsDrawer.tsx`, `src/ui/route/StopLocationImportDialog.tsx` (new), `src/ui/styles/route.css`, `tests/ui/route-stop-locations.spec.ts` (new) |
| Gate B | User reviews locations entry and import | — | SL4 | — |
| SD1 | Distance spacing and 1-second rounding in stop times | Haiku | Gate B | `src/domain/stopTimes.ts`, `src/application/stopTripsView.ts` (+ tests) |
| SD2 | Spacing and rounding controls in the Stop trips drawer | Opus (UI) | SD1 | `src/ui/trips/StopTripsDrawer.tsx`, `src/ui/styles/trips-workflow.css`, `tests/ui/stop-trips.spec.ts` |
| SX | Documentation, closeout, full verification | Opus | all | `architecture_overview.md`, `docs/data-schema.md`, `docs/domain-glossary.md`, `docs/ui-conventions.md`, `codex.md`, decision statuses, `docs/implementation/stop-schedule-and-locations-closeout.md` |

Order: SS1 → SS2 → SS3 → Gate A → SL1 → SL2 → SL3 → SL4 → Gate B → SD1 → SD2 → SX. Step 1 is useful on its own; the user may stop after Gate A.

## 6. Instructions for every package

- Read first: `AGENTS.md`, `codex.md`, `architecture_overview.md`, Decisions 0079, 0080, 0084, 0085, 0086, this plan, and the files under "Read first" in the package.
- Domain code imports no React and no IndexedDB. `src/ui` imports nothing from `src/persistence`.
- Edit with the file-edit tool, never shell redirection or `sed`.
- Change only the files the package owns. A needed change elsewhere: stop and report it.
- Existing tests must pass unedited, except the version assertions SL2 lists.
- Run verification exactly as section 7 says. Put the results in the commit message as `Verified:` lines, and name what was skipped and why.
- Commit messages begin with the package ID, for example `SS1: Stop schedule model (Decision 0084)`, and end with the attribution lines the session requires.

## 7. Verification per package

The unit suite runs in full once at the end of every code package. While working, run only the test file being written.

| Package | Run | Skip | Do not cut |
|---|---|---|---|
| SS1, SS2, SL3, SD1 | `pnpm typecheck`; the package's test files; `pnpm test` | Browser suite and build (no UI) | `stopTimes.test.ts`, `stopTimesCsv.test.ts`, `stopTripsView.test.ts` |
| SL1 | `pnpm typecheck`; changed test files; `pnpm test` | Browser suite and build | every existing `stops` and `stopPlacementMatching` test |
| SL2 | `pnpm typecheck`; `pnpm test`; browser specs `backup-import`, `route-stops`, `route-stop-wiring`, `stop-trips`, `automatic-blocking-backup` | other browser specs; build | every persistence, backup, and contract test; an exact backup round trip of a set with locations |
| SS3, SL4, SD2 | `pnpm typecheck`; `pnpm test`; `pnpm build`; the package's specs and the existing specs of the touched screen; screenshots at 1024 px and 1440 px | the rest of the browser suite | — |
| SX | `pnpm typecheck`; `pnpm test`; `pnpm build`; full `pnpm test:ui` | — | everything |

## 8. SS1: Stop schedule model (Haiku)

### Read first

`src/domain/stopTimes.ts`; `src/domain/stops.ts` lines 1-60; `src/domain/directions.ts` lines 50-72; `src/domain/types.ts` lines 15-67 and 125; `src/application/stopTimesCsv.test.ts` (fixture style).

### Do

Implement section 4.7 in `src/domain/stopSchedule.ts`, including the SS1 distance rule (step 9). Export exactly the names in section 4.7. Location fields stay `undefined`.

### Tests (`src/domain/stopSchedule.test.ts`)

Fixture: Route with Nodes A, B, C, D; direction "Southbound" with three patterns in this `sequence`: **North** A→C, **South** B→D, **Full** A→D, cumulative miles A 0, B 2, C 5, D 7 on each (offset so each pattern starts at 0). Stops: s1 (code 101) between A and B on North and Full; s2 (no code) between C and D on South and Full. Timepoint stop IDs: A 100 on North and Full. Runtime bands for each pattern: "Early" 4:00-6:00, "Peak" 6:00-10:00. Plan periods: 4:00-5:00 every 30, 5:00-10:00 every 15. Trips: North departs 4:00, 4:30, 5:00, 5:15, 6:00, 6:15; South 5:10, 5:25; Full 9:00.

1. Rows are the Full pattern's order (most rows): A, s1, B, C, s2, D; keys `code:100`, `code:101`, `node:B`, `node:C`, `stop:s2`, `node:D`.
2. Sample mode, North: columns 4:00-5:00 ("Early", 30 min, tripCount 2), 5:00-6:00 ("Early", 15 min), 6:00-10:00 ("Peak", 15 min); each column's `tripId` is the first Trip; `times` is `null` on s2 and D.
3. A window with no Trips makes no column (South has none before 5:00).
4. A Trip before the first boundary forms a column whose `startTime` is its departure.
5. With no plan and no assignment the pattern has one column labelled "Service".
6. Every-trip mode: one column per Trip; `headwaySeconds` is the gap to the previous Trip of the same pattern, absent for the first.
7. `omitTimepointsWithoutStopId`: B, C, D rows are absent; s1's time is unchanged.
8. Order conflict: a fourth pattern visiting C before B gives a `~2` row and `orderConflict: true`.
9. Distance: row B → C on Full is 3 (segment without stops); A and s1 have no distance (segment with a stop, no locations); D has none (last row).
10. Median headway with gaps 15, 15, 30 is 15; with gaps 15, 30 it is 15.
11. A direction with no Trips is left out.

### Commit and gate

`SS1: Stop schedule model (Decision 0084)`. Opus reviews the diff against section 4.7 and recommends SS2 (Haiku).

## 9. SS2: Stop schedule CSV (Haiku)

### Read first

`src/application/stopTimesCsv.ts` and its test; `src/persistence/csv.ts` lines 1-16; `src/testSupport/csvRows.ts`.

### Do

Implement section 4.8. Do **not** add the export to `cases()` in `src/persistence/csvText.test.ts` (its header-row model does not fit a two-row header); test formula protection in the package's own test.

### Tests (`src/application/stopScheduleCsv.test.ts`)

Build `StopScheduleDirection` values by hand (no call to `buildStopSchedule`).

1. Two directions give: title, two header rows, data rows, run time row, empty line, second block; the file ends with `\r\n`.
2. A header cell is three lines joined by `\n`, quoted; `7:30 min` for 450 s; `1 trip`; `3 trips`.
3. `null` → `-`, `undefined` → empty, 36030 → `10:00:30`, 36000 → `10:00`, 90000 → `25:00`.
4. A stop named `=SUM(A1)`, a pattern named `+North`, a band labelled `-Peak`, and a stop ID `@5` are each prefixed with `'`; `-` cells and times are not.
5. Distance 0.456 → `0.46`; latitude 39.912274 → `39.912274`.
6. Run time 3270 s → `54.5`.
7. Every-trip mode headers use the Trip label and one time.

### Commit and gate

`SS2: Stop schedule CSV (Decision 0084)`. Opus reviews and starts SS3.

## 10. SS3: Export dialog and wiring (Opus, UI)

Requirements:

- Trips Actions export group gains **Export stop schedule CSV…** after the two existing items, disabled when `routeDayTrips` is empty.
- A small modal (existing dialog components and draggable behaviour, Decision 0068): **Columns**: "One sample trip per period" (default) / "Every trip"; checkbox **Leave out timepoints without a stop ID** (off); a line naming the day and Trip Profile; Export and Cancel. Escape cancels.
- On Export: read the stop set with `service.getRouteStopSet`; call `buildStopSchedule` with `orderDirections(aggregate.directions ?? [])`, `aggregate.patterns`, `aggregate.nodes`, `routeDayTrips`, `routeRuntime?.profiles ?? []`, `routeRuntime?.assignments ?? []`, `planResult?.plan`; download `${safeName}-stop-schedule.csv` (same `safeName` rule as the other exports). When any direction has `orderConflict`, the dialog stays open after the download with a note that some stops are listed twice because patterns visit them in different orders.
- Spec `tests/ui/stop-schedule-export.spec.ts`: import a backup (pattern of `tests/ui/route-stop-wiring.spec.ts`) with two directions, two patterns, one stop, one plan; export in both modes; check the file name, the two blocks, a `-` cell, and a header cell.
- Gate A: export the Federal project (`output/federal-brt-import/federal-brt-project-backup.json` with stops added, or the user's live project) and give the file to the user next to the STOPS workbook.

## 11. SL1: Locations and spacing in the domain (Haiku)

### Read first

`src/domain/types.ts` lines 50-67; `src/domain/stops.ts` (whole); `src/domain/stopPlacementMatching.ts` (whole); their tests.

### Do

1. Section 4.1 types.
2. `src/domain/stops.ts`: section 4.2 helpers; section 4.3 rules in `validateRouteStopSet`; section 4.4 changes to `pruneRouteStopSets`, new `reconcileTimepointLocations`, `remapRouteStopSet`. `moveNodeStopCodesToPatterns` is unchanged.
3. `src/domain/geo.ts`: section 4.5.
4. `src/domain/stopPlacementMatching.ts`: section 4.6. `planStopFill` and `planStopCopy` return the new fields.

### Tests

- `stops.test.ts`: every row of section 4.3, including a valid set with rounding 1 and `interpolation: 'distance'`; a set with only timepoint locations survives pruning; a location of a removed point is pruned; `reconcileTimepointLocations` keeps a location on an unchanged point, drops it when the point's Node changes; `remapRouteStopSet` maps location keys.
- `geo.test.ts`: section 4.5 example; distance from a point to itself is 0.
- `stopPlacementMatching.test.ts`: for locations, repeat each existing timepoint stop ID test case with locations (Fill into an empty point, agreeing sources, conflict, ambiguous Node, other direction ignored, Copy never clears, identical value not a change, overwrite counted).

### Commit and gate

`SL1: Stop and timepoint locations, spacing types, validation and location copy (Decisions 0085, 0086)`. Opus reviews and recommends SL2 (Haiku).

## 12. SL2: Persistence, service, pass-through (Haiku)

### Read first

`git show e8e21c1 -- src/persistence`; `src/persistence/backup.ts` lines 40-45, 150-191, 720-780; `src/persistence/routeStopPersistence.ts`; `src/application/routeDefinitionService.ts` lines 318-352, 785-940, 1675-1694; `src/ui/trips/StopTripsDrawer.tsx` line 92; `src/ui/route/PatternStopsDrawer.tsx` lines 20-30 and 171-182; `src/ui/shared/messages.ts`.

### Do

1. **Backup schema 16.** `PROJECT_BACKUP_SCHEMA_VERSION = 16`; extend the comment at line 42 with "Version 16 adds stop and timepoint locations, `interpolation`, and 1-second rounding (Decisions 0085, 0086)". Add `15` to every explicit version list that already ends with `14, PROJECT_BACKUP_SCHEMA_VERSION`. In `validateRouteStopSets`: `roundingSeconds` must be 1, 30, or 60 (message `must be 1, 30 or 60`); each stop's `latitude`, `longitude`, `speedLimitMph`, when present, must be a number (`must be a number`); `timepointLocationsByPatternId`, when present, is an object of objects of objects whose present fields among the three are numbers; `interpolation`, when present, is `'equal'` or `'distance'`. Ranges are left to `assertRouteStopSets` through `validateRouteStopSet`.
2. **`assertRouteStopSets`**: section 4.4.
3. **Version assertions**: change each schema 15 assertion listed in section 3 to 16. Change nothing else in those files. Do not change any Dexie version.
4. **Service** (`routeDefinitionService.ts`):
   - `RouteStopsEdit` gains required `timepointLocations: TimepointLocations` and required `interpolation: StopInterpolation`. `StopDraft` gains `timepointLocations: TimepointLocations`.
   - `saveRouteStops`: each stop is written as `{ id, name, stopCode?, ...location }` where `location = normalizeStopLocation({ latitude, longitude, speedLimitMph })` spread when defined; the pattern's locations are normalized and stored or deleted like the codes; `interpolation` is stored only when `'distance'` (the key is absent for `'equal'`).
   - `previewStopFill`, `applyStopFill`, `previewStopCopy`, `applyStopCopy`: pass `openLocations` and `locationsByPatternId` like the codes; `applyStopFill` returns `timepointLocations` from `applyTimepointLocationPlan`; `previewStopCopy` refuses only when the pattern has no placements, no codes, and no locations; `applyStopCopy`'s stale check compares `JSON.stringify([plan.changes, plan.codeChanges, plan.locationChanges])` and writes the applied locations; "No stops would change." when all three lists are empty.
   - `describeStopPlacementPlan`: `nodeNames` also covers the Nodes of `locationChanges` and `locationSkips`.
   - Route-edit reconciliation: `reconcileTimepointLocations` next to the codes (section 4.4).
5. **Pass-through only** (no other UI change):
   - `StopTripsDrawer.tsx` line 92: add `timepointLocations: current.timepointLocationsByPatternId?.[id] ?? {}, interpolation: current.interpolation ?? 'equal'`.
   - `PatternStopsDrawer.tsx`: `Draft` gains `locations: TimepointLocations`; `draftOf` fills it with `normalizeTimepointLocations(pattern, set?.timepointLocationsByPatternId?.[pattern.id])`; `EMPTY_DRAFT` gets `locations: {}`; `save` passes `timepointLocations: draft.locations, interpolation: loaded?.set?.interpolation ?? 'equal'`; `stopDraft` (line 75) passes `timepointLocations: draft.locations` and `onFilled` keeps `locations: filled.timepointLocations`. Compile errors in other drawer lines: stop and report.
6. **Messages** in `USER_FACING_VALIDATION_MESSAGES`:

| key | text |
|---|---|
| `stopLocation.incomplete` | Enter both latitude and longitude, or neither. |
| `stopLocation.latitudeRange` | Latitude must be between -90 and 90. |
| `stopLocation.longitudeRange` | Longitude must be between -180 and 180. |
| `stopLocation.speedLimitInvalid` | Enter a speed limit above 0 and up to 100 mph. |
| `routeStopSet.roundingInvalid` | Choose 1 min, 30 s, or 1 s rounding. |
| `routeStopSet.interpolationInvalid` | Choose equal or distance spacing. |

### Tests

- `routeStopBackup.test.ts`: exact round trip of a set with stop locations, timepoint locations, rounding 1, and `interpolation: 'distance'`; a version 15 file imports with none of them; each malformed field is refused with its message; import as copy remaps location keys.
- `routeDefinitionService.test.ts`: `saveRouteStops` keeps stop locations and pattern locations and refuses an incomplete pair; saving another pattern does not drop the first pattern's locations; Copy writes locations to same-direction patterns and Undo restores; a stale preview is refused when only a location changed; a pattern edit that moves a point to another Node drops its location.

### Commit and gate

`SL2: Backup 16, stop location persistence and copy (Decision 0085)`. Opus reviews (especially the drawer lines), runs the SL2 browser specs, and recommends SL3 (Haiku).

## 13. SL3: Locations in the export, CSV import (Haiku)

### Read first

`src/domain/stopSchedule.ts`; `src/domain/geo.ts`; sections 4.9 and 4.10.

### Do

Section 4.9 in `buildStopSchedule`; section 4.10 in the two new files.

### Tests

- `stopSchedule.test.ts` additions: a stop row's coordinates and speed; a timepoint row's coordinates from the spine pattern; scaled distances that add up to the segment miles (rule 1); straight-line distance when segment miles are 0 (rule 2); rule 3 still applies with no locations.
- `csvRead.test.ts`: BOM, CRLF and LF, a quoted comma, a quoted line break, `""`, a trailing newline.
- `stopLocationImport.test.ts`: the STOPS workbook layout (title row "Southbound", header `BRT ID, Stop Name, Latitude, Longitude, Distance (miles), Speed Limit`, data, then a second "Northbound" block with its own header): every data row read, title and header rows skipped; GTFS `stops.txt` with `stop_id` and `stop_code`; no header → `missingColumns`; ID match ignores case and spaces; a duplicate ID with different values is a conflict; a name match only when unique on both sides and the row has no ID match; unmatched targets and unused rows reported.

### Commit and gate

`SL3: Locations and distances in the stop schedule; stop location CSV import (Decisions 0084, 0085)`. Opus reviews and starts SL4.

## 14. SL4: Stops drawer locations expansion and import (Opus, UI)

Requirements (Decision 0085 items 5 and 7):

- **Show locations** switch in the drawer header, remembered per device (`readStoredRecord`/`localStorage`, same pattern as `RUNTIMES_OPEN_PREFERENCE_KEY`), off by default. On: Latitude, Longitude, Speed limit inputs on stop and timepoint rows; the drawer widens (CSS in `route.css`; check 1024 px).
- Numeric inputs accept typed decimals; a value with a comma and two numbers pasted or typed into Latitude fills both fields. Field errors use the section 4.3 messages next to the row, as stop name errors do today.
- `changeCount` counts location changes; Save, Discard, and the close prompt cover them.
- A stop used by more than one pattern shows the pattern count while locations are shown.
- Fill and Copy dialogs list location changes and skips the way they list timepoint stop ID changes.
- Actions → **Import stop locations…**: file picker (`.csv`), then a review: matched by ID (applied), matched by name (unchecked checkboxes), conflicts, unmatched drawer rows, unused file rows, skipped lines. Apply writes into the draft only; saving is the normal **Save stops**.
- Spec `tests/ui/route-stop-locations.spec.ts`: type and save a stop location; paste a pair; an incomplete pair shows its error and blocks saving; Copy carries a timepoint location to a same-direction pattern only; import fills by ID, leaves a name match unapplied until checked.
- Gate B: the user enters or imports Federal stop locations and reviews the export.

## 15. SD1: Distance spacing and 1-second rounding (Haiku)

### Read first

`src/domain/stopTimes.ts` (whole) and its test; `src/application/stopTripsView.ts`; section 4.11.

### Do

Section 4.11. `stopTripsTable` gains an optional `interpolation` input passed to `stopTimeRows`, like `roundingSeconds`.

### Tests (`stopTimes.test.ts`)

1. Equal spacing results are unchanged (all existing tests pass unedited).
2. A segment 10:00 to 10:10 with two stops at 1/4 and 3/4 of the chain gives 10:02 and 10:07 at 60-second rounding (rounded down), 10:02:30 and 10:07:30 at 1 second.
3. A missing location makes the segment equal-spaced and marks its rows `spacing: 'equal'`.
4. `previous` and `next` stops in a distance segment keep the timepoint times; the raise-to-previous rule still applies.
5. A zero-length chain falls back to equal spacing.
6. With `interpolation` absent on the set, spacing is equal.

### Commit and gate

`SD1: Distance-weighted stop times and 1-second rounding (Decision 0086)`. Opus reviews and starts SD2.

## 16. SD2: Stop trips drawer controls (Opus, UI)

- `ROUNDING_OPTIONS` gains `{ value: '1', text: '1 s' }`.
- A **Spacing** segmented control, "Equal" / "By distance", next to Rounding, saved with the drawer's save like rounding (passes `interpolation` to `saveRouteStops`).
- When "By distance" is chosen, a quiet note under the table: "N segments use equal spacing because a stop or timepoint has no location." (N from `spacing === 'equal'` rows of the shown pattern, counted per segment).
- `tests/ui/stop-trips.spec.ts`: switch to By distance and 1 s, save, reload, and check a stop time and the note.

## 17. SX: Documentation and closeout (Opus)

- `architecture_overview.md`: stop locations, the stop schedule export, spacing; status line backup schema 16 (Dexie unchanged at 15).
- `docs/data-schema.md`: new fields, backup 16.
- `docs/domain-glossary.md`: Stop schedule, Stop location, Spacing.
- `docs/ui-conventions.md`: the export dialog, the Show locations expansion, the import review.
- Decisions 0084-0086 status "Accepted and implemented"; Decision 0079 items 5 and 6 note the amendment by 0086.
- `codex.md` dated status line; closeout file with per-package results.
- Full verification row; push to the branch; report and stop.

## 18. Out of scope

- A link between a timepoint and a Route stop record (Decision 0085 alternatives).
- Timepoint stop names distinct from Node names in exports.
- Along-route distances or speed limits from the Transit Analysis Tool, and its "Export stops" action.
- GTFS export.
- Labels, merges, or notes for export columns inside the application.
- Showing stop locations on a map.
