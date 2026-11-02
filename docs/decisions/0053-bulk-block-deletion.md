# Decision 0053: Delete Several Blocks at Once, and Place Day-Level Block Commands on the Blocks Surface

- Status: Accepted (user decision of 2026-11-02); implemented, awaiting user acceptance
- Date: 2026-11-02
- Extends: Decision 0052 (copy blocks from another day)

## Context

Blocks could be deleted only one at a time, through Current block → Actions → Delete block…. Trips can be checked in bulk and acted on through a selection bar. Clearing a day before rebuilding or copying it needed one deletion per Block.

The Blocking scope-bar Actions menu held both Blocking Scenario commands and "Copy blocks from another day…", a command on one day's Blocks. On the Trips tab the matching command ("Copy trips from another day…") is on the trips table's own Actions menu, so similar commands sat in different places.

## Decision

1. **Checked Blocks.** The Blocks table has a checkbox column with a select-all header checkbox, using the existing `blocking-selection-column` pattern. Checking a Block is separate from opening it: the checkbox never changes the Current block, and selecting a block name never checks it. Checks clear when the Blocking Scenario or Day changes.
2. **Selection bar.** While at least one Block is checked, the shared `SelectionBar` ("N blocks selected") shows **Delete blocks…**.
3. **Blocks surface Actions menu.** The Blocks surface has its own Actions menu ("Blocks actions") with **Copy blocks from another day…** (moved from the scope-bar menu) and **Delete all blocks on {Day}…**.
4. **Menu placement rule.** The scope-bar Actions menu holds commands on the object chosen in the scope bar (the Blocking Scenario: new, duplicate, rename, delete, export). A surface's Actions menu holds commands on that surface's rows. This matches the Trips tab, where the scope bar holds Route actions and the trips table holds trip commands.
5. **Review and write.** `BlockingApplicationService.previewDeleteBlocks` returns a `BlocksDeletionImpact` (Block labels and counts of Blocks, Trips, deadheads, and activities) computed by the pure `calculateBlocksDeletionImpact`, with the source signature as the review token. `deleteBlocks` re-checks the signature and removes every listed Block in one `saveBlockingBlocksAtomically` write. If any listed Block is missing, nothing is deleted.
6. **Deleted open Block.** If the open Block is deleted, Current block returns to no selection.
7. No schema change. Trips of deleted Blocks become unassigned, as with single-Block deletion.

## Consequences

- One confirmation clears a day or a chosen set of Blocks; the action cannot be undone, as with single-Block deletion.
- UI specs that opened "Copy blocks from another day…" through "Blocking actions" now use "Blocks actions".
