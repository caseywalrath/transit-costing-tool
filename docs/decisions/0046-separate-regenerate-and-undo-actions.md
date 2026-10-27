# Decision 0046: Regenerate and Undo Last Regeneration Are Separate Trips Actions

- Status: Accepted and implemented
- Date: 2026-10-27 (user request)
- Annotates: Decision 0035 items 3 and 4 (the one-step regeneration undo and where it appears)

## Context

Trips Actions had one item, `regenerate`, that showed one of two commands. While a saved regeneration undo applied to the visible schedule it read **Undo last regeneration (N Trips)** and ran the undo; otherwise it read **Regenerate selected…**. The undo is kept across reloads until an affected Trip changes, so after any regeneration the Regenerate command stayed hidden. A planner who changed the Route's calculation method (Decision 0045) and then had new Trips with changed run times could not regenerate them without first undoing the earlier regeneration or changing one of its Trips.

## Decision

1. **Regenerate selected…** is always in the Schedule group. It is disabled, with the hint "Select Trips with changed runtimes.", until at least one selected Trip has changed runtimes, and while a Shift is staged or a write is running. The saved undo does not affect it.
2. **Undo last regeneration (N Trips)** is a separate item directly after Regenerate. It is in the menu only while the saved undo applies to the schedule on screen, and is not shown disabled otherwise. It is disabled while a write is running or a Shift is staged. Its action is unchanged.
3. The undo applies when it belongs to the visible Scenario and Trip Profile, covers at least one Trip, and every Trip it covers is shown. The rule is `regenerationUndoApplies` in `src/application/tripsWorkspaceView.ts`. Persistence still checks, when the undo runs, that every covered Trip has its regenerated times, and discards the undo if one does not.
4. Regenerate acts only on the selected Trips that have changed runtimes. A planner can select every Trip with the select-all checkbox; the unchanged Trips are skipped. This behavior is kept.
5. A new regeneration replaces the saved undo, as before.

## Consequences

- Regenerate stays available while an undo is saved, and the menu can show both items.
- No persistence, domain, or backup change; no schema bump.
- Decision 0035 item 4 ("Put Undo last regeneration in Trips Actions only while the snapshot applies") still holds, as a separate item.
