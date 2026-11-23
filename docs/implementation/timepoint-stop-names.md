# Implementation Plan: Timepoint Stop Names

- Decision: `docs/decisions/0092-timepoint-stop-names.md`
- Status: Implemented 2026-11-23 (closeout: `docs/implementation/timepoint-stop-names-closeout.md`)
- Branch: `claude/timepoint-stop-names` from `main`, or the branch the session names
- Orchestrator: Opus. Workers: Haiku (most cards). Card N4 is UI wiring and stays with Haiku `xhigh`, with Opus doing the visual check.

All file paths and line numbers below were read from `main` at commit `141bfda` (2026-11-23). A worker re-reads every named function before editing it. A line number that has moved is not an error; a function that is missing or different is. Report it and stop.

## Part 1 — Summary

Each timepoint (pattern point) can get a stop name of its own. It is stored next to the timepoint stop IDs (Decision 0080) and locations (Decision 0085), and it follows the same rules for pruning, reconciliation, copying, and fill.

- Node name stays in: the Trips table, timetables, runtimes, blocking, costing, and the Fill/Copy preview "Timepoint" column.
- Stop name, with the Node name as a fallback, is used in: `stopTimeRows` (and so the Stop trips drawer, the trips-with-stops CSV, and the stop schedule export), GTFS export `stop_name`, and the drawer's location-import name matching.
- GTFS import stores the feed `stop_name` on every timepoint.
- Backup schema 18 → 19. No Dexie version change.

## Part 2 — Run rules (user approval 2026-11-23)

These copy the GTFS plan's run rules (`docs/implementation/gtfs-interoperability.md`, Part 7) for this plan only.

- **Continuing.** The Opus orchestrator runs the packages of a sitting one after another without asking. It stops at the end of each sitting, at gate G-N4 (visual check sent to the user), at closeout, and on anything this plan does not decide.
- **Delegation.** Opus gives each card in Part 5 to a sub-agent on the named model and effort, word for word, adding only the branch or worktree path. Cards N2 and N3 may run in parallel in separate worktrees: they touch different files (see "Files" in each card).
- **Checking.** Opus reads each diff in full and runs the card's verification rows (Part 6). It fixes small problems itself, or returns the card once to the same model with the failure. After a second failure, Opus does the package.
- **Commits.** One commit per card, with the `Verified:` lines from `AGENTS.md`. Push at each sitting's end. No pull request until the user asks.
- **Closeout.** N5 runs `/code-review` at `high` effort. It is never skipped.

| Sitting | Packages | Models | Ends with |
|---|---|---|---|
| 1 | Baseline; N0; N1 | Opus; Haiku `high` | Push, hand-off in the progress log |
| 2 | N2 and N3 in parallel | Haiku `xhigh`; Haiku `high` | Push, hand-off |
| 3 | N4; gate G-N4; N5 | Haiku `xhigh`; Opus | Closeout report to the user |

**Baseline (Opus, sitting 1).** Run `pnpm install`, `pnpm typecheck`, and `pnpm test`, and record the unit test count in the progress log (Part 7). If the baseline fails, stop and report; do not start N0.

**Prompt to start a sitting:**

```
You are the Opus orchestrator for docs/implementation/timepoint-stop-names.md
in transit-costing-tool. Read AGENTS.md, codex.md, Decision 0092, this plan in
full, and the last hand-off in its Part 7. Run the next sitting in Part 2,
following its run rules.
```

## Part 3 — Shared rules for every card

- Read `AGENTS.md` and `codex.md` first. Use the file-edit tool, not shell redirection or `sed`.
- Do not edit files outside the card's "Files" list. If a change elsewhere is needed, stop and report it.
- Copy the existing timepoint stop ID code (Decision 0080) as the model. Where a card says "as for codes", the stop name code has the same shape as the stop ID code next to it, with `Codes`/`codes`/`StopCodes` renamed to `Names`/`names`/`StopNames`.
- Every new comment cites "Decision 0092" and, where useful, its item number.
- While working, run only the test file being changed: `pnpm vitest run <file>`. At the end of the card run `pnpm typecheck` and `pnpm test` once. Report the summary lines and any failures only.

## Part 4 — Names used in every card

| Name | Kind | Defined in | Meaning |
|---|---|---|---|
| `TimepointStopNames` | type | `src/domain/types.ts` | `Record<EntityId, string>`: pattern point ID → stop name |
| `RouteStopSet.timepointStopNamesByPatternId` | optional field | `src/domain/types.ts` | pattern ID → `TimepointStopNames` |
| `normalizeTimepointStopNames(pattern, names)` | function | `src/domain/stops.ts` | as `normalizeTimepointStopCodes` |
| `reconcileTimepointStopNames(saved, next, names)` | function | `src/domain/stops.ts` | as `reconcileTimepointStopCodes`; returns `{ names, removedCount }` |
| `timepointStopName(storedName, nodeName)` | function | `src/domain/stops.ts` | the displayed stop name (Decision 0092 item 4) |
| `RouteStopsEdit.timepointStopNames` | optional field | `src/application/routeDefinitionService.ts` | absent keeps the stored names |
| `StopDraft.timepointStopNames` | optional field | same | absent plans as none |
| `TimepointNameChange`, `TimepointNameSkip` | types | `src/domain/stopPlacementMatching.ts` | as `TimepointCodeChange`, `TimepointCodeSkip`; the candidate field is `stopName` |
| `StopPlacementPlan.nameChanges`, `.nameSkips` | fields | same | as `codeChanges`, `codeSkips` |
| `applyTimepointNamePlan` | function | same | as `applyTimepointCodePlan` |
| `ExportPatternPointInput.stopName` | optional field | `src/domain/gtfsExport/types.ts` | the stored timepoint stop name |
| `gtfsExport.stopNameDiffers` | issue code | same | Decision 0092 item 8 |

## Part 5 — Work cards

### N0 — Documentation (Opus)

Files: `architecture_overview.md`, `docs/data-schema.md`, `docs/decisions/0080-timepoint-stop-ids-per-pattern.md`, `docs/decisions/0085-stop-and-timepoint-locations.md`, `docs/decisions/0089-gtfs-import.md`, `docs/decisions/0090-gtfs-export.md`, `AGENTS.md`.

1. `architecture_overview.md`: in the Route stop set description, add the third per-point map and the displayed-name rule (Decision 0092 items 1, 4 to 6).
2. `docs/data-schema.md`:
   - Add a "Version 19" paragraph above the version 18 paragraph (line 657). Mark it current and remove "(current" from version 18. Content: the field; its shape (trimmed, non-blank strings of the pattern's own points); versions 1 to 18 import with none; Dexie stays 15.
   - Add the field to the `RouteStopSet` field list, wherever `timepointLocationsByPatternId` is listed.
3. Decisions 0080, 0085, 0089, 0090: add an "Extended by: Decision 0092" (0080, 0085) or "Amended by: Decision 0092 item 9" (0089 item 27) and "item 6, 8" (0090 item 8) line to the header. Do not rewrite their text.
4. `AGENTS.md`, "Work Packages and Model Recommendations": extend the exception paragraph: "and (user approval 2026-11-23) `docs/implementation/timepoint-stop-names.md`, under its Part 2".

Done when: the files are proofread and agree with Decision 0092.

### N1 — Storage, pruning, reconciliation, copy, backup (Haiku `high`)

Files: `src/domain/types.ts`, `src/domain/stops.ts`, `src/domain/stops.test.ts`, `src/persistence/routeStopPersistence.ts`, `src/persistence/backup.ts`, `src/persistence/routeStopBackup.test.ts`, `src/persistence/backup.test.ts`, `src/persistence/repositoryContract.test.ts`, `src/persistence/plannedFrequencyBackup.test.ts`, `src/persistence/backupImportValidation.test.ts`, `src/application/routeDefinitionService.ts` (only `saveRouteStops` and `reconcileRouteStopSets`), `src/application/routeDefinitionService.test.ts`, `tests/ui/automatic-blocking-backup.spec.ts` (only the version literal).

Steps:

1. **Types** (`src/domain/types.ts`, near line 70):
   ```ts
   /** Decision 0092. Pattern point ID → the stop name of that timepoint on its pattern. A trimmed, non-blank string. */
   export type TimepointStopNames = Record<EntityId, string>;
   ```
   In `RouteStopSet`, after `timepointLocationsByPatternId`:
   ```ts
   /** Decision 0092. Pattern ID → its timepoints' stop names. A pattern with none has no entry. */
   timepointStopNamesByPatternId?: Record<EntityId, TimepointStopNames>;
   ```
   Update the `RouteStopSet` doc comment ("Not stored when it has no stops and no timepoint stop IDs") to name stop IDs, locations, and names.
2. **`src/domain/stops.ts`**:
   - `normalizeTimepointStopNames`: copy `normalizeTimepointStopCodes` (line 49).
   - `timepointStopName(storedName: string | undefined, nodeName: string | undefined): string`: returns `storedName.trim()` when non-blank, otherwise `nodeName ?? ''`.
   - `pruneRouteStopSets` (line 202): add a names block after the locations block, as for codes. Add `hasNames` to the "drop the set" condition (`stops.length === 0 && !hasCodes && !hasLocations && !hasNames`) and `namesChanged` to the "unchanged" condition. Add the field to the destructure and the rebuilt object, as for codes. Update the doc comment at line 125.
   - `reconcileTimepointStopNames`: copy `reconcileTimepointStopCodes` (line 300). Return `{ names, removedCount }`.
   - `remapRouteStopSet` (line 366): add a names block as for codes, and the field to the destructure and the result.
   - Do not change `moveNodeStopCodesToPatterns`.
3. **`src/persistence/routeStopPersistence.ts` `assertRouteStopSets`** (line 30):
   - Add `nameEntries` from `set.timepointStopNamesByPatternId ?? {}`.
   - Add it to the "has no stops" check.
   - Add a validation loop copied from the code loop, with these messages: `has stop names for a missing pattern.`, `has a stop name for a missing timepoint.`, `has an invalid timepoint stop name.`
4. **`src/persistence/backup.ts`**:
   - Line 44: `PROJECT_BACKUP_SCHEMA_VERSION = 19`.
   - Line 43 comment: append "Version 19 adds `RouteStopSet.timepointStopNamesByPatternId` (Decision 0092); versions 1 to 18 import with none."
   - Every list that ends `17, PROJECT_BACKUP_SCHEMA_VERSION]` (11 places, including line 829) gets `18` before the constant, so it ends `17, 18, PROJECT_BACKUP_SCHEMA_VERSION]`. Search for `17, PROJECT_BACKUP_SCHEMA_VERSION` to find them all; afterwards that search must find none.
   - After the `timepointStopCodesByPatternId` shape check (line 184), add the same check for `timepointStopNamesByPatternId`, with "(version 19)" in the comment and the same message pattern ("must be an object", "must be a non-blank string").
   - Do not version-gate the field: an older file simply has none.
5. **Test version literals:** every `toBe(18)` on `exportSchemaVersion` becomes `toBe(19)`, in `backup.test.ts`, `repositoryContract.test.ts`, `routeStopBackup.test.ts`, `plannedFrequencyBackup.test.ts`, `backupImportValidation.test.ts` (check each file), and `tests/ui/automatic-blocking-backup.spec.ts` line 29. Change only literals that are the current export version. A literal that names an older file's version stays.
6. **`saveRouteStops`** (`routeDefinitionService.ts` line 888):
   - Add to `RouteStopsEdit` (line 322): `/** Decision 0092. The open pattern's timepoint stop names by point ID. Absent keeps the stored ones. */ timepointStopNames?: TimepointStopNames;`
   - In the write, copy the locations block: when `edit.timepointStopNames !== undefined`, normalize and set or delete the pattern's entry. Spread `timepointStopNamesByPatternId` into `next` when it is non-empty. Import `normalizeTimepointStopNames` and `TimepointStopNames`.
7. **`reconcileRouteStopSets`** (line 1856): add `namesByPatternId` as for codes, using `reconcileTimepointStopNames`. Add it to the "unchanged" comparison and the spread.

Tests to add:

- `stops.test.ts`:
  - normalize trims, drops blanks and foreign points, and returns point order;
  - `timepointStopName` uses the stored name, falls back on blank or absent, and returns `''` with neither;
  - prune keeps a set that has only names, drops names of a missing pattern or point, and drops a set whose names all go;
  - reconcile keeps a name on an unchanged point, drops it when the point is removed or its Node changes, and counts removals;
  - remap maps pattern and point IDs and drops an unmapped point.
- `routeStopBackup.test.ts`: round trip of a set with names (export then import is equal); a version 18 file without the field imports; a blank name and a name of a missing point are refused with the messages above; import as copy remaps the names (copy the existing stop ID copy test at line 138).
- `routeDefinitionService.test.ts`:
  - `saveRouteStops` with names stores them;
  - a later save without `timepointStopNames` keeps them;
  - a save with `{}` removes them;
  - a pattern edit that moves a point to another Node removes its name (copy the existing code reconciliation test).

Done when: typecheck passes, the full unit suite passes, and the backup round trip test reports schema 19.

### N2 — Fill and Copy (Haiku `xhigh`)

Depends on N1. Files: `src/domain/stopPlacementMatching.ts`, `src/domain/stopPlacementMatching.test.ts`, `src/application/routeDefinitionService.ts` (only `StopDraft`, `previewStopFill`, `applyStopFill`, `previewStopCopy`, `applyStopCopy`, `describeStopPlacementPlan`), `src/application/routeDefinitionService.test.ts`.

Steps:

1. **`stopPlacementMatching.ts`**:
   - Add the types, after `TimepointCodeSkip` (line 13):
     ```ts
     /** Decision 0092 item 11. */
     export interface TimepointNameChange { patternId: EntityId; patternPointId: EntityId; nodeId: EntityId; previous?: string; next: string; sourcePatternIds: EntityId[]; }
     export interface TimepointNameSkip { patternId: EntityId; nodeId: EntityId; reason: StopSkipReason; candidates?: { stopName: string; patternIds: EntityId[] }[]; }
     ```
   - `StopPlacementPlan` (line 20): add `nameChanges: TimepointNameChange[]; nameSkips: TimepointNameSkip[];` after the location fields.
   - `StopPlacementPlanInput` (line 41): add `openNames?: Readonly<TimepointStopNames>;` and `namesByPatternId?: Readonly<Record<EntityId, Readonly<TimepointStopNames>>>;`.
   - `planNames(mode, input)`: copy `planCodes` (lines 94–140) exactly, with codes renamed to names, `normalizeTimepointStopCodes` → `normalizeTimepointStopNames`, and the candidate field `stopName`. Strings compare with `===`, as codes do. Do not generalize `planCodes` itself; the duplication is accepted.
   - In the plan builder (around line 209): call `planNames`, sort the results as for codes, count `nameChanges` in `affectedPatterns` (`count(change.patternId, change.previous !== undefined)`), and return `nameChanges` and `nameSkips`.
   - `applyTimepointNamePlan`: copy `applyTimepointCodePlan` (line 353).
2. **`routeDefinitionService.ts`**:
   - `StopDraft` (line 341): add `timepointStopNames?: TimepointStopNames`.
   - `previewStopFill` (line 1008): pass `openNames: draft.timepointStopNames, namesByPatternId: set?.timepointStopNamesByPatternId ?? {}`.
   - `applyStopFill`: add `timepointStopNames: applyTimepointNamePlan([pattern], { [pattern.id]: draft.timepointStopNames ?? {} }, preview)[pattern.id] ?? draft.timepointStopNames ?? {}`.
   - `previewStopCopy`:
     - read `names` from the set;
     - include `Object.keys(names).length === 0` in the "Save this pattern's stops" check;
     - pass `openNames` and `namesByPatternId`.
   - `applyStopCopy`:
     - include `!preview.nameChanges.length` in the "No stops would change" check;
     - add `plan.nameChanges` / `preview.nameChanges` to the stale comparison array;
     - pass names into `planStopCopy`;
     - apply with `applyTimepointNamePlan`;
     - spread `timepointStopNamesByPatternId` when `plan.nameChanges.length`.
   - `describeStopPlacementPlan` (line 1118): add `...plan.nameChanges, ...plan.nameSkips` to the `nodeNames` loop.
3. Anything else that builds a `StopPlacementPlan` or `StopPlacementPreview` object literal will fail typecheck. Add `nameChanges: [], nameSkips: []` there, and list each such place in the report.

Tests to add (copy the existing timepoint stop ID fill and copy tests: `stopPlacementMatching.test.ts`, and `routeDefinitionService.test.ts` around lines 1275–1322):

- fill takes an agreed name from a same-direction pattern;
- fill reports a conflict when two same-direction patterns disagree, with both candidates sorted;
- fill ignores an opposite-direction pattern;
- a Node twice in a pattern is skipped as ambiguous;
- copy replaces a different name and counts it as replaced;
- copy never clears a name;
- `applyStopCopy` writes names, and `undoStopCopy` restores the earlier set;
- a stale preview is refused when a name changed after the preview.

Done when: typecheck and the full unit suite pass. Existing fill and copy tests pass unchanged, except that literal plan objects now include the two new empty arrays.

### N3 — Outputs and GTFS (Haiku `high`)

Depends on N1. Can run in parallel with N2. Files: `src/domain/stopTimes.ts`, `src/domain/stopTimes.test.ts`, `src/domain/stopSchedule.test.ts`, `src/application/stopTimesCsv.test.ts`, `src/domain/gtfsExport/types.ts`, `src/domain/gtfsExport/feed.ts`, `src/domain/gtfsExport/stops.ts`, `src/domain/gtfsExport/stops.test.ts`, `src/ui/gtfsExport/gtfsExportModel.ts` (only the warning text map), `src/domain/gtfs/routeFromFeed.ts`, `src/domain/gtfs/routeFromFeed.test.ts`, `src/application/gtfs/gtfsImportService.test.ts` (only expectations that the new field breaks), and the golden fixtures in `src/domain/gtfsExport/feed.golden.test.ts` only if they change (they should not; see step 5).

Steps:

1. **`stopTimeRows`** (`src/domain/stopTimes.ts` line 79):
   - Read `const timepointNames = set?.timepointStopNamesByPatternId?.[pattern.id] ?? {};` next to `timepointCodes`.
   - In the timepoint row of the with-set branch (line 113), set `name: timepointStopName(timepointNames[point.id], node?.name)`.
   - Leave the no-set branch (line 95) unchanged: there are no names without a set.
   - Update the `StopTimeRow.name` comment (line 13): "timepoint: its stop name, else its node name (Decision 0092); stop: stop name".
   - This one change covers the Stop trips drawer, `stopTimesCsv.ts`, `stopScheduleCsv.ts`, `stopSchedule.ts`, `gtfsExport/feed.ts` line 349, and `gtfsExport/shapes.ts`. Do not edit those files for names.
2. **GTFS export input** (`src/domain/gtfsExport/types.ts` `ExportPatternPointInput`, line 43): add `/** Decision 0092. The stored timepoint stop name; blank or absent uses the Node name. */ stopName?: string;`. In `feed.ts` `exportPatternInput` (line 286), read `names` from the set and set `stopName: names[point.id]`.
3. **GTFS export stops** (`src/domain/gtfsExport/stops.ts`):
   - Timepoint record (line 125): `stopName: blankToUndefined(point.stopName) ?? name`. Update the comment to "Decision 0090 item 8, as amended by Decision 0092 item 6".
   - Add `'gtfsExport.stopNameDiffers'` to `GtfsExportStopIssueCode` (`types.ts` line 15).
   - In the merge loop (line 156):
     - for each group, once, when any later record that merges (the `continue` branch) has `stopName !== first.stopName`, push one warning `issueOf('gtfsExport.stopNameDiffers', other)` for the first such record;
     - a refused record (`stopIdConflict`) is not compared.
   - `gtfsExportModel.ts`: typecheck shows each `Record<…IssueCode, …>` map that needs an entry. Add to the warning text map (line 238 area): `'gtfsExport.stopNameDiffers': (count) => plural(count, 'stop ID is used with different stop names; the first name is exported.', 'stop IDs are used with different stop names; the first name of each is exported.')`. If a label map also requires it, use `'Same stop ID with different names'`.
4. **GTFS import** (`src/domain/gtfs/routeFromFeed.ts` lines 307–322):
   - Build `timepointStopNamesByPatternId` beside the codes. For each point, `const name = (stops.get(stopId)?.stop_name ?? '').trim(); if (name) names[point.id] = name;`. Do not use the `stopName` helper at line 125: it falls back to the stop ID, and Decision 0092 item 9 stores only a non-blank feed name.
   - Add the field to `stopSet` when it has any entry. Use the type `TimepointStopNames`.
5. **Unchanged output when no names are entered.** The golden GTFS export test and every existing export test must pass without edits, because a set without names gives the Node name as before. If a golden file changes, stop and report.

Tests to add:

- `stopTimes.test.ts`: a timepoint with a stored name shows it; a blank stored name falls back to the Node name; a stop row is unchanged.
- `stopSchedule.test.ts`: two patterns merge one timepoint row by stop ID, and the row takes the spine pattern's name.
- `stopTimesCsv.test.ts`: the CSV's name cell for a named timepoint.
- `gtfsExport/stops.test.ts`:
  - a named timepoint exports its name;
  - an unnamed one exports the Node name;
  - two merged records with different names give one `stopNameDiffers` warning and keep the first name;
  - equal names give no warning.
- `routeFromFeed.test.ts`: imported points carry the feed `stop_name`; a blank `stop_name` stores no name.
- A round trip in `gtfsExport/readBack.test.ts` or `gtfsImportService.test.ts`, whichever already has an export-then-import helper: export a scenario whose timepoint has a name that differs from the Node name, re-import it, and check the stored name. If neither file has such a helper, report it, and Opus decides.

Done when: typecheck and the full unit suite pass, and no golden fixture changed.

### N4 — Stops drawer wiring (Haiku `xhigh`)

Depends on N1, N2, N3. Files: `src/ui/route/PatternStopsDrawer.tsx`, its CSS file (find it with a search for `pattern-stops-timepoint__name`), `tests/ui/route-stops.spec.ts`.

Layout and behavior (decided; do not change):

- **Field.** In the timepoint row's first cell (`<th scope="row">`, line 379), keep the mark and the Node name span. Below them, in the same cell, add a text input:
  - wrapped in the same `<div className="pattern-stops-name">` that stop rows use (line 391), so it takes the same width and style;
  - placeholder: the Node name (or `Untitled node`);
  - `aria-label={`Timepoint stop name, ${timepointLabel}`}`;
  - `disabled={busy}`.
  An empty field removes the name.
- No suggestions list, no link behavior, and no new column. The Stop ID cell and the location cells are unchanged.

Steps:

1. **`Draft`** (line 27): add `names: TimepointStopNames`. In `draftOf` (line 29), set `names: normalizeTimepointStopNames(pattern, set?.timepointStopNamesByPatternId?.[pattern.id])`. Add `names: {}` to `EMPTY_DRAFT`.
2. **Dirty count** (line 58): add a loop like the code loop, comparing normalized names.
3. **`updateName(pointId, value)`**: copy `updateCode` (line 215).
4. **Save** (line 319): pass `timepointStopNames: draft.names`.
5. **`hasSavedPlacements`** (line 341): also true when the pattern has saved names.
6. **Fill.**
   - `stopDraft` (line 103) gets `timepointStopNames: draft.names`, and its dependency list gets `draft.names`.
   - `onFilled` (line 410) sets `names: filled.timepointStopNames ?? draft.names`.
7. **Preview dialog.**
   - Add a "Timepoint stop names" table after the stop ID table (line 487). Copy that table: the columns are Timepoint (Node name), Stop name, Source.
   - Add `nameSkipGroups`, `nameSkipText`, and `NAME_SKIP_TITLES = { ambiguous: 'Timepoint appears more than once in a pattern (stop name)', conflict: 'Other patterns disagree on a timepoint stop name' }`, copied from the code ones (lines 417, 458, 459, 507).
   - Include `preview.nameChanges.length === 0` in `nothing` (line 463).
8. **Location import** (line 293): a timepoint target's `name` and label are `timepointStopName(draft.names[point.id], node?.name) || 'Untitled node'`.
9. `StopTripsDrawer.tsx` line 97 needs no change: it omits `timepointStopNames`, which keeps the stored names. Confirm this by reading, and do not edit the file.

Tests (`tests/ui/route-stops.spec.ts`; copy the existing timepoint stop ID test near line 155):

- typing a stop name and saving stores it; reopening the drawer shows it;
- clearing the field and saving removes it;
- the Trips table header still shows the Node name;
- the Stop trips drawer shows the stop name;
- Fill from a same-direction pattern fills the name.

Gate G-N4 (Opus):

1. Run `pnpm build`.
2. Take 1× screenshots of the drawer with locations off and on, at 1280 px and 900 px width, and check that no row wraps badly and no horizontal scroll appears.
3. Send the 2× screenshots to the user and continue to N5 unless the layout is broken.
4. A layout problem that needs a design decision stops the run and goes to the user, with a recommendation of a UI-design (Sol) package.

### N5 — Closeout (Opus)

1. Run the full unit suite, typecheck, build, and the full browser suite (`pnpm test:ui -- --trace off`).
2. Run `/code-review` at `high` effort on the branch diff, fix its findings, and re-run the affected tests.
3. Write `docs/implementation/timepoint-stop-names-closeout.md`: what was built, deviations from this plan, test counts, and the skipped items with reasons.
4. Set Decision 0092 status to "Accepted and implemented".
5. Report to the user. A pull request is opened only on request.

## Part 6 — Verification per package

| Package | Run | Skip | Do not cut |
|---|---|---|---|
| N0 | Proofread; cross-check against Decision 0092 | All tests (documentation only) | — |
| N1 | `stops.test.ts`, `routeStopBackup.test.ts`, `backup.test.ts`, `backupImportValidation.test.ts`, `repositoryContract.test.ts`, `plannedFrequencyBackup.test.ts`, `database.test.ts`, `routeDefinitionService.test.ts`; typecheck; full unit suite; browser specs `backup-import`, `automatic-blocking-backup`, `database-migration`, `scenario-copy-recovery` | Other browser specs: no UI change | Backup and migration tests; round trip with schema 19 checked |
| N2 | `stopPlacementMatching.test.ts`, `routeDefinitionService.test.ts`, `routeStopManagementService.test.ts`, `restorePointService.test.ts`; typecheck; full unit suite | Browser suite: no UI change; the preview UI is tested in N4 | Existing fill and copy tests (they show that stop ID and location behavior is unchanged) |
| N3 | `stopTimes`, `stopSchedule`, `stopTimesCsv`, `stopScheduleCsv`, `stopTripsView`, all `gtfsExport/*.test.ts` (including `feed.golden`), `routeFromFeed`, `gtfsImportService`; typecheck; full unit suite; browser specs `gtfs-export`, `gtfs-import`, `stop-schedule-export`, `stop-trips` | Other browser specs | Golden export test unchanged; export→import round trip |
| N4 | Typecheck; full unit suite; build; browser specs `route-stops`, `route-stop-wiring`, `route-stop-locations`, `route-stops-table`, `stop-trips`, `keyboard`; visual check (G-N4) | Full browser suite: run in N5 | Existing drawer specs |
| N5 | Full unit suite; typecheck; build; full browser suite; `/code-review` high | — | Everything in this row |

## Part 7 — Progress log

Each sitting appends a hand-off: date, packages done, commit hashes, test summary lines, problems, and the next sitting.

- 2026-11-23, sitting 1 (user asked for the whole plan in one run). Baseline: typecheck passes, 2552 unit tests. N0 `3099e71` (documentation). N1 `0ff8566`: 2573 unit tests; browser specs backup-import, automatic-blocking-backup, database-migration, scenario-copy-recovery 11 passed. Problem: a blank stored name is refused by the backup shape check ("must be a non-blank string") before `assertRouteStopSets`; accepted.
- 2026-11-23, sitting 2. N3 `693e521`: 2582 unit tests; golden unchanged; gtfs-export, gtfs-import, stop-schedule-export, stop-trips 26 passed. Round trip in `readBack.test.ts`. N2 `556ad37`: 2594 unit tests with N3 merged; Opus corrected the `nodeNames` comment. No placeholder plan literals were needed.
- 2026-11-23, sitting 3. N4 `b4670fb`: build passes; route-stops, route-stop-wiring, route-stop-locations, route-stops-table, stop-trips, keyboard 45 passed, 1 skipped (screenshot-only test). G-N4 passed; screenshots sent. N5: see the closeout.
