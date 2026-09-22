# Decision 0024: Bulk Pull-Out and Pull-In Editing

- Status: Accepted
- Date: 2026-09-22

## Decision

1. Pull-outs and pull-ins remain independent Block activities. There is no shared garage-to-node time table in this phase.
2. A user may apply one activity to matching Blocks in the current Blocking Scenario and service day. A pull-out matches the first revenue Trip's starting Node; a pull-in matches the last revenue Trip's ending Node. Matching includes every Route in the Scenario. The selected Block's Node does not have to match its current endpoint.
3. The selected Block is always included when it has a revenue Trip, even if its endpoint differs from the selected Node. Its Pull-out To or Pull-in From field defaults to the selected Block's adjacent Trip endpoint, while the user may select any Node. Other Blocks are included only when their corresponding endpoint matches the selected Node.
4. Other matching Blocks without that activity receive a new activity with its own ID. Existing activities in other Blocks remain unchanged unless the user explicitly selects replacement. Replacement preserves each activity's ID. The review identifies selected-Block inclusion and reports matching, added, replaced, retained, and skipped counts before changes are applied.
5. Blocks without a revenue Trip are skipped. The application rechecks the Scenario source and Trip endpoints before writing all affected Blocks in one transaction.
6. Users may edit any resulting Block activity independently. Each activity stores its own relative duration, Nodes, and optional miles; platform measures remain derived.

## Consequences

- Bulk edits change existing backup and CSV activity records without a schema change.
- A later shared movement table may fill Block activities, but cannot silently override saved Block values.
