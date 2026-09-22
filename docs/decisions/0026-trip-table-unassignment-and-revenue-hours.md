# Decision 0026: Trips-Table Unassignment and Revenue-Hour Semantics

- Status: Accepted for implementation
- Date: 2026-09-22

## Context

Trips-table assignment was added under Decision 0025. Users also need to unassign one Trip from its Block pill or multiple selected Trips across their source Blocks. The current Blocking summaries label scheduled Trip runtime alone as Revenue and list layover separately, which understates revenue-service hours for the selected reporting convention.

This decision supersedes Decision 0020's Revenue-hours formula only; its remaining activity, validation, mileage, and completeness rules remain in force.

## Decision

1. An assigned Trip's Block pill offers **Unassign from Block**. Selecting it requires confirmation.
2. The Trips Actions menu offers **Unassign from Block…** for a multi-selection, including Trips from different source Blocks. Already-unassigned selections remain unchanged and are reported in the confirmation.
3. Unassignment removes the selected revenue-Trip activities from all source Blocks in the active Blocking Scenario and service day through one atomic write. Blocks remain. Adjacent deadhead activities are removed because their connection no longer exists; pull-outs and pull-ins stay in their source Blocks.
4. Unassignment uses the same stale-source signature, Blocking Scenario, Trip Profile, service-day, and duplicate-reference safeguards as assignment. Duplicate or cross-day references are rejected, not silently repaired.
5. **Running Time** is the sum of scheduled revenue-Trip durations and excludes layover.
6. **Revenue hours** equal Running Time plus known usable layover between revenue Trips. Deadhead, pull-out, and pull-in durations remain excluded. The Layover % value is Layover divided by Revenue hours.
7. Selected-day totals continue to include only valid Blocks in the known subtotal. Incomplete but valid Blocks contribute known hours; their completeness status remains visible by Block. The Selected-day Summary omits the redundant complete/incomplete Block-count tiles.
8. Running Time and Revenue hours are derived values. Their summary CSV adds `runningHours`; no IndexedDB or JSON backup schema migration is required.

## Consequences

- A Trip can be assigned, moved, or unassigned without switching to the Blocking tab.
- Unassignment can safely span multiple Blocks while preserving unrelated activities and Block records.
- Revenue hours now match the chosen reporting convention without losing the previous running-time measure.
- Block-level status and findings remain available even though aggregate status-count tiles are removed.

## Rejected alternatives

### Delete the Block when its last Trip is unassigned

Rejected because Blocks remain valid reusable planning records and may contain boundary activities or notes.

### Treat Running Time alone as Revenue hours

Rejected because this omits usable layover from the requested revenue-service measure.
