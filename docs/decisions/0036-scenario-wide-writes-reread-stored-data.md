# Decision 0036: Scenario-Wide Writes Re-Read Stored Data

- Status: Accepted and implemented
- Date: 2026-10-22

## Context

The code review (issues I-001, I-016, I-025; findings 4-001, 3-009, 4-009) found that `saveScenarioRecords` replaces every record of a Scenario with the copy it is given. It deletes stored records that are absent from the copy and overwrites the rest. The Route tab keeps one copy of the Scenario from load time, and Trips, Blocking, and Runtime writes never refresh it. A later Service day edit, Scenario rename, New route, or Duplicate route therefore wrote that older copy over newer Trips, Blocks, and Runtime profiles. A no-change blur of the Service day name was enough to trigger it. Duplicate scenario copied the older snapshot, so the copy omitted recent work.

Two smaller defects shared the cause "the write does not check current storage". Runtime "Copy from day" read the `patterns` and `serviceDays` stores inside a transaction that did not list them, so it failed on IndexedDB every time. Trip generation stored Trips for a Trip profile that no longer existed.

## Decision

1. `RouteDefinitionRepository.updateScenarioRecords(scenarioId, change)` reads the stored Scenario records inside the write transaction, applies a synchronous `change` to them, and writes the result. It rejects when the Scenario no longer exists, so a stale caller cannot recreate a deleted Scenario. Returning the records it was given writes nothing.
2. `updateServiceDay`, `renameScenario`, `addRoute`, and `duplicateRoute` use it. Their `records` argument now only identifies the Scenario; the Scenario copy that was passed in is never written. Each returns the records it wrote, which the interface uses to refresh its copy.
3. `updateServiceDay` compares the patch with the stored Service day and writes nothing, and publishes no save status, when no field differs.
4. `duplicateScenario` reads the stored Scenario instead of copying the caller's copy.
5. `commitRuntimeCopyAtomically` lists `patterns` and `serviceDays` in its transaction scope.
6. `insertTripsAtomically` checks, inside its transaction, that every Trip's Trip profile exists and belongs to the Trip's Scenario, and rejects with "The selected Trip profile is no longer available." Both repositories enforce it.
7. `saveScenarioRecords` remains for whole-Scenario operations whose caller has just read the records (Scenario creation, Route deletion, safe route edits). A later package decides whether those move to the same pattern.

## Consequences

- The four listed commands cannot revert or delete work saved elsewhere in the same tab. Across tabs the problem remains until the single-tab guard (Package P02, decision 10).
- The repository port gains one method. In-memory and Dexie implementations match.
- Reading the whole Scenario inside the write adds the cost of one Scenario read to these four commands. The golden project loads in tens of milliseconds, and the commands are user-initiated and infrequent.
- Per-record writes (for example writing only the changed Service day row) were not chosen. They would require a second write path beside `saveScenarioRecords` for little gain at this data size.
