# Decision 0093: Stop Location Warnings and Naming Both Places of a Stop ID Conflict

- Status: Accepted and implemented
- Date: 2026-11-23 (user request: Federal BRT export refused for stop IDs 13703 and 26175)
- Related: Decision 0080 (timepoint stop IDs per pattern), Decision 0085 (stop locations), Decision 0090 items 5 and 19 (GTFS export stops and refusals), Decision 0092 (timepoint stop names, used in the warnings' labels)

## Context

A GTFS export of the Federal BRT scenario "2026 FD Nov 2026 US36 Littleton" was refused twice with "Same stop ID at two places". One timepoint longitude was typed without its minus sign; one stop ID was entered for the Northbound and Southbound bays, 49 m apart. The refusal named only the second record, and the Stops drawer of that pattern showed nothing wrong, because the conflict was with another pattern. The only location checks were the world ranges (latitude -90 to 90, longitude -180 to 180), which a missing minus sign passes.

## Decision

1. **The conflict names both records.** A `gtfsExport.stopIdConflict` refusal carries `conflictWith`: the Route, pattern (none for a Route stop) and stop name of the first record of the stop ID, which gives the stop its location. The export problems table reads "Englewood (stop ID 26175, 49 m from Englewood on *BRT: Wagon Road to Englewood)"; a Route stop reads "on the route stops", and another Route is named. The report line adds "first at …".
2. **Out-of-line warning (`outOfLineWarnings`, `src/domain/stopLocationChecks.ts`).** In a pattern's travel order, each located row is compared with the nearest located rows before and after it. It is out of line when the detour through it, beyond the straight line between them, exceeds the larger of twice that straight line and 1 mile. A first or last located row is out of line when it is more than 5 miles from its one neighbour, unless that neighbour is itself out of line. The detour measure names the wrong row only, not its neighbours.
3. **Stop ID elsewhere warning (`stopIdElsewhereWarnings`).** Each located row with an entered stop ID is compared with every other located record of the same stop ID on the Route: this pattern's other rows (draft), the other patterns' timepoints (saved), and the Route stops this pattern does not place. The farthest record more than 30 m away is named, the same limit as the export (Decision 0090 item 5). The scope is the Route: the export also compares across Routes, and remains the final check.
4. **Shown in the Stops drawer as warnings.** Each warning is an InlineNote (warn) row under its stop or timepoint row, shown whether or not Show locations is on, updated as values are typed. Warnings never block saving: loops, detours into stations and shared IDs placed on purpose are real.

## Alternatives considered

- **Refusing the save.** Rejected: real alignments can trip the rules.
- **A check against the Route area or a map preview.** Deferred: the neighbour rule catches the same errors without a map; a map needs tiles from the network.
- **Distance against the entered segment miles.** Deferred as a later addition.

## Consequences

- No stored-data, schema or backup change.
- The export refusal stays; the drawer warning finds the same conflicts earlier, within one Route.
