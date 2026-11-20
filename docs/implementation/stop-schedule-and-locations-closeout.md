# Stop schedule and locations closeout (SX)

- Status: Implemented; awaits user acceptance (Gate B open)
- Date: 2026-11-20
- Plan: `docs/implementation/stop-schedule-and-locations.md`
- Decisions: 0084, 0085, 0086 (now "Accepted and implemented"); 0079 items 5 and 6 note the amendment by 0086
- Branch: `claude/sweet-allen-m3vw3x`

## 1. Packages

| Package | Commit | Class | Result |
| --- | --- | --- | --- |
| SS1 | `85fec93` | Haiku | Stop schedule model (`src/domain/stopSchedule.ts`) |
| SS2 | `242d156`, `f69128b` | Haiku | Stop schedule CSV (`src/application/stopScheduleCsv.ts`) |
| SS3 | `e1d25d1` | Opus | Export stop schedule dialog and wiring |
| Gate A | `0353471` | User | No sliver periods; a timepoint without a stop ID joins its Node's stop ID row |
| SL1 | `a26d8f7` | Haiku | Location and spacing types, validation, lifetime, `geo.ts`, location Fill and Copy |
| SL2 | `6e64d13` | Haiku | Backup schema 16, persistence checks, service, messages |
| SL3 | `6baa6c3` | Haiku | Locations and distances in the export; CSV reader and location import |
| SL4 | `bc7aae6` | Opus | Stops drawer Show locations and Import stop locations review |
| Gate B | — | User | Not yet done: the user asked to continue through SD2 |
| SD1 | `d7c6810` | Haiku | Distance-weighted stop times and 1-second rounding |
| SD2 | `a8e6264`, `92b5f50` | Opus | Spacing and 1 s controls in the Stop trips drawer |
| SX | this commit | Opus | Documentation, full verification |

## 2. Changes made in integration review

1. **Saved settings kept (SL2).** `RouteStopsEdit.timepointLocations` and `interpolation` are optional; an absent value keeps the stored one, so callers that do not edit them cannot clear them.
2. **Name matching (SL3).** A name match needs the name to be unique among both the drawer rows and the file rows. `conflictStopCodes` keep the stop ID as written in the file.
3. **Shared test list (SX).** The Trip actions menu list in `tests/ui/support/tripsWorkspace.ts` lacked "Export stop schedule CSV…" (added in SS3), which failed 85 specs that use it; it now lists it.

## 3. Verification

- `pnpm typecheck`: clean.
- `pnpm test`: 103 files, 1746 tests passed.
- `pnpm build`: succeeded.
- Browser suite: 397 passed, 2 skipped (312 in the full run, then the 85 failures of item 2.3 rerun after the fix at four workers: 84 passed; `trips-table-display.spec.ts:128` timed out once under load and passed 3 of 3 alone).
- Screenshots: `output/stop-locations-sl4/`, `output/stop-spacing-sd2/` at 1024 and 1440 px.

## 4. User acceptance

Gate B remains: enter or import the Federal stop locations in the Stops drawer, export the stop schedule, and compare Latitude, Longitude and Distance with the STOPS workbook; then try By distance spacing in the Stop trips drawer.
