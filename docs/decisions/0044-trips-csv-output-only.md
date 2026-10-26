# Decision 0044: Trips CSV Mirrors the Trips Table and Is Output Only

- Status: Accepted and implemented
- Date: 2026-10-26 (user request)
- Supersedes: the Trips CSV interchange in Decision 0035 (CSV import and ID-based export)

## Context

The Trips CSV carried `tripId`, `patternId`, `publicLabel`, and a long `point:<id>:<label>` header per Pattern point. Each Pattern had its own group of columns, so overlaid Patterns (trunk and branch) did not line up as they do in the Trips table. The IDs existed only so that import could update existing Trips.

## Decision

1. The Trips CSV has the columns Direction, Pattern, one column per Direction timepoint, Run Time, Layover, Deadhead, Next Trip, and Block, in the order of the Trips table. Timepoint headers are the plain names the table shows (label override, else short name, else name).
2. Timepoint columns are Direction columns, so Patterns that share a timepoint share the column. A Trip leaves a column blank when its Pattern does not serve it.
3. Times are exact (seconds shown when not whole minutes), not rounded by the display preference. Run Time, Layover, Deadhead, and Next Trip use the table's formats. Layover, Deadhead, Next Trip, and Block are blank for a Trip not in the selected Blocking Scenario's Block.
4. No IDs are written. The Trips CSV import UI and parser are removed because import depended on those IDs. CSV remains reporting output; JSON backup is the restore path.
5. The Trip service methods `previewTripTableImport` and `applyTripTableImport` and the `TripTableImportRow` type are not called by the interface after this change. They are left in place and are a candidate for later removal.

## Consequences

- A user can no longer edit Trips in a spreadsheet and re-import them. Time changes use Shift, Regenerate, or Runtimes.
- The Trips menu loses **Import Trips CSV…**.
