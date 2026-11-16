# Route stops and stop trips closeout (ST7)

- Status: Implemented; awaits user acceptance
- Date: 2026-11-16
- Plan: `docs/implementation/stop-trips.md`
- Decision: `docs/decisions/0079-route-stops-and-derived-stop-times.md` (now "Accepted and implemented")
- Branch: `claude/funny-fermat-0hgeua`, based on `main` at `a5dbb48`

## 1. Packages

| Package | Commit | Class | Result |
| --- | --- | --- | --- |
| ST0 | `bdaa2cb` | Opus | Decision 0079 and the plan |
| ST1 | `c158b83` | Haiku | Stop types; `stops.ts`, `stopTimes.ts`, `stopPlacementMatching.ts` with 57 tests |
| ST2 | `e97cbf9` | Haiku | Dexie 11 (`routeStopSets`), backup schema 13, copies, deletion counts |
| ST3 | `4fea90d` | Haiku | `saveRouteStops`, stop Fill and Copy with undo, reconciliation in pattern and Node commits, `stopTripsTable`, `stopTimesCsv` |
| Gate A | — | User | Data rules confirmed by the user on 2026-11-16 |
| ST4 | `7b92087` | Haiku | Node Stop ID column, stop counts in the save review and deletion confirmations, messages, "Export trips with stops CSV" |
| ST5 | `a6b6d93`, `e10f4b1` | Opus | Route tab Stops drawer |
| ST6 | `26ae4d6` | Opus | Trips tab Stop trips drawer |
| ST7 | this commit | Opus | Documentation, full verification |

## 2. Changes made in integration review

1. **Plan example (ST1).** The plan's clamp example (`A` = 28850, `B` = 28870) did not clamp: the rounded value is 28860. The plan now uses `B` = 28852.
2. **Migration spec (ST2).** `tests/ui/database-migration.spec.ts` asserted the IndexedDB version 100 (Dexie 10); it now asserts 110. The plan's section 3 had not listed it.
3. **Flaky test (ST2).** A pattern-deletion test took node order from `aggregate.nodes`, which has no fixed order, and failed about one run in three. It now takes the order from the saved pattern's points.
4. **Route edit review (ST3).** The Route edit signature now includes the Route's stop set, so a pattern or Node review that states stop counts expires when the stops change before the commit.
5. **Shared test lists (ST4, ST5, ST6).** The Trip actions menu list in `tests/ui/support/tripsWorkspace.ts` and `route-stop-wiring.spec.ts`, and the modal dialog inventory in `src/ui/modalDialogs.test.ts`, gained the new items.

## 3. Design choices in ST5 and ST6

- **Stops drawer.** Timepoints are tinted rows with a ring marker; a segment's stops hang under them with a rail, followed by **+ Add stop**. A new row's name field suggests the Route's stops as "Name · Stop ID"; a value that matches a suggestion on Enter or blur links the row to that stop. A linked stop's name and Stop ID edit the stop itself, and a chip shows "N patterns" when more than one pattern uses it. Moving past a segment's first or last stop crosses the timepoint. The Route tab and the scope bar reserve the drawer's width (`.route-workspace--stops-drawer`), so the pattern Actions trigger is never covered.
- **Stop trips drawer.** Pattern, a two-choice segmented control for rounding (a select at 680 px and below), and the number of Trips shown. The grid scrolls inside the drawer; the heading row and the stop name column stay in view. An out-of-order rule shows a "!" marker named by its message. Edits to several patterns are saved as one write per pattern, each on the set the previous one wrote. The drawer overlays the Trips table, like Build trips; Shift and Build trips are disabled while it is open.

## 4. Verification

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passes |
| `pnpm test` | 93 files, 1526 tests pass |
| `pnpm build` | Passes (the existing chunk-size warning only) |
| Full browser suite (`pnpm test:ui`, Chromium at `/opt/pw-browsers/chromium`) | 372 passed, 2 skipped (the existing skips), 13.8 min |
| Visual tour (`UI_TOUR=1`) | 2 passed |
| Backup round trip | `routeStopBackup.test.ts`: export, import, export of a project with stops and a Node `stopCode` is identical; a version 12 file imports with its `routeEstimateFactors` and no stops; `route-stop-wiring.spec.ts` imports a schema 13 file through the screen |
| New specs repeated | `route-stop-wiring` 20/20, `route-stops` 20/20, `stop-trips` 12/12 |
| Screenshots | Nodes table at 1024 px and 1440 px; Stops drawer at 1440, 1024 and 390 px; Stop trips drawer at 1440 and 390 px. The app has no dark theme, so no dark screenshots apply. |

## 5. Findings for the user

1. **Unnamed Route backups (pre-existing).** A Route with no name exports a backup that import refuses ("routes[0].name must be a non-empty string"); the app shows such a Route as "Untitled route". ST4's spec names its Route before exporting. Not changed here.
2. **CSV time format.** The stop-times CSV writes times as the Trips CSV does (`6:00`, `6:04:30`), without a leading zero.
3. **Stop trips covers the Trips table.** Like Build trips, the drawer overlays the right part of the Trips table, including the Trip actions trigger; the Route tab's Stops drawer instead reserves its width.
4. **Copy undo** is lost on reload, as for distance and runtime copy (Decision 0079, Consequences).
