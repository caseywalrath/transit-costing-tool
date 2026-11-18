# Decision 0083: Auto-block Unassigned Trips

- Status: Accepted (user, 2026-11-18)
- Date: 2026-11-18
- Related: Decision 0055 (automatic blocking), Decision 0056 (vehicle limit), Decision 0081 (restore points), Decision 0082 (chooser styles)

## Context

Auto-blocking (Decision 0055) builds Blocks from every Trip of the Trip Profile. It either creates a new Blocking Scenario, or replaces every Block on the chosen days of an automatically built one. A planner who built Blocks by hand, or edited automatic ones, and has trips left over had no way to block only those trips. The user asked for a command in the Unassigned trips menu that does that inside the selected Blocking Scenario. Two levels were compared:

- Level A: new Blocks only.
- Level B: also append trips to the ends of existing Blocks.

The user chose Level A.

## Decision

1. **Command.** "Auto-block unassigned trips…" sits in the Unassigned trip actions menu, in a "Blocks" group after "Minimum layover…". It is disabled while the workspace is busy or when no Blocking Scenario or Trip profile is selected. Auto-blocking… stays in the Blocking scenario menu, because it creates or replaces a scenario.
2. **Scope.**
   - It acts on every Route of the Trip Profile, not only the selected Route.
   - It uses only the Trips that no Block of the Blocking Scenario holds, on the service days ticked in the dialog. The day the workspace shows is the only day ticked when the dialog opens.
3. **Stored Blocks are not changed.** The result is new Blocks only. They are written together with the unchanged stored Blocks in one atomic write (`saveBlockingBlocksAtomically`). The write is refused when the Blocks changed after the source signature was read.
4. **Engine.** `buildAutoBlocks` takes `existingBlocks`. When they are given:
   - Trips already in a Block are left out.
   - New labels are "Block n" with the lowest free n, compared ignoring case.
   - Peak vehicles and the Maximum vehicles limit count the stored Blocks' in-service intervals together with the new ones. An interval runs from the first trip minus the pull-out minutes to the last trip plus the pull-in minutes.
   - The day rows of the result count new Blocks and placed Trips. Peak vehicles covers all Blocks.
5. **Rules.**
   - The dialog uses the Blocking Scenario's stored automatic rules when it has them, and the default rules otherwise.
   - The dialog is `AutoBlockingDialog` in fill mode. It has no name field and no rebuild checkbox, and no "Read rules from built blocks" panel.
   - The service days show their unassigned trip counts.
   - The preview adds a "Trips placed" column, and its Blocks column reads "New blocks".
   - The submit button reads "Add n blocks". It is disabled when nothing would be built.
   - Fill mode keeps no draft.
6. **The automatic build record is not changed.** On an automatically built scenario, the added Blocks show up as a changed block count in its "edited since the build" status.
7. **Undo.** The command stores a restore point of kind `autoBlockUnassigned`, labelled "Auto-blocked unassigned trips into n new blocks". Undo deletes the added Blocks.

## Consequences

- Application port: `BlockingCommands.fillUnassignedTrips` and `BlockingQueries.previewFillUnassigned`.
- `getAutoBlockingSetup` takes an optional `fillBlockingScenarioId` and then returns `unassignedTripCounts`.
- Level B (appending to existing Blocks) and inserting into gaps inside a Block remain open. Either would change stored Blocks and needs its own decision.
