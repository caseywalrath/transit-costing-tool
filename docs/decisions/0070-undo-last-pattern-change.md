# Decision 0070: Undo Last Pattern Change

- Status: Accepted, not implemented
- Date: 2026-11-11 (user request; plan: `docs/implementation/dialogs-selection-undo.md`, package P1)
- Annotates: Decision 0035 item 3 (one regeneration snapshot) and Decision 0046 item 2 (the undo item)
- Related: Decision 0067 (anchored pattern change)

## Context

**Change pattern…** recalculates a Trip's times. When the result is wrong, the planner must change the pattern back and repair the times by hand. Regeneration already has a one-step undo: a before-and-after snapshot of Trips in the `tripRegenerationUndo` store under the key `'last'`. A pattern change writes only Trips (no Blocks), so the same snapshot can hold it.

## Decision

1. **One shared slot.** The snapshot holds the last regeneration **or** the last pattern change. Saving either replaces the other. There is no undo stack.
2. **Kind.** The snapshot gains `kind?: 'regeneration' | 'patternChange'`. A snapshot without `kind` is a regeneration, so snapshots saved before this change still work.
3. **Saved by.** The single-Trip change (`changeTripPattern`) and the batch change (`applyBatchPatternChange`) save the Trips as read before the change and as written, in one transaction, with the existing before-state check.
4. **Menu item.** Trip actions shows **Undo last pattern change (N trips)** for a `patternChange` snapshot and **Undo last regeneration (N trips)** otherwise, in the same position. Visibility (`regenerationUndoApplies`) and disabled rules are unchanged.
5. **Restore.** Unchanged: every covered Trip must still equal its saved after-state; otherwise the snapshot is discarded. The refusal message names the kind: "The changed Trips were edited again. The undo is no longer available." for a pattern change.
6. **Invalidation.** Unchanged: any other write to a covered Trip discards the snapshot.
7. **Restored data.** The whole Trip is restored, including `patternId`, stop times, and provenance (`manuallyChangedFields`).
8. **Blocks.** Not part of the snapshot. A Block keeps its Trip ids, so the Trip returns to its Block with its old times; the Block's connections are recalculated as for any time change.
9. **Not backed up.** As in Decision 0035, undo state is excluded from JSON backups.

## Alternatives considered

- **Separate slot per kind.** Rejected: two undo items with different scopes confuse the menu.
- **Multi-step undo.** Out of scope.

## Consequences

- No Dexie version and no backup schema change; the `kind` field is optional.
- A pattern change now discards a saved regeneration undo.
