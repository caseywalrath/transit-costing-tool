# Decision 0069: Select Alternating Trips

- Status: Accepted, not implemented
- Date: 2026-11-11 (user request; plan: `docs/implementation/dialogs-selection-undo.md`, package P2)
- Related: `docs/ui-conventions.md` ("Selecting trips (UR-9, SEL-1 and SEL-2)")

## Context

Planners thin or split a schedule by taking every other Trip (for example, to move half the Trips to another Pattern). Today this needs one click per Trip.

## Decision

1. **Item.** The "Select trips by…" menu gets **Select alternating** directly after **Invert selection**, in the same group.
2. **Enabled.** Only while exactly one shown Trip is selected. Otherwise it is disabled with the title "Select one trip to start from."
3. **Result.** The selection becomes the selected Trip and every second shown Trip below it, in table order (the order of `trips` in `ScheduleTable`). Trips above it are not selected. Patterns are not considered: alternation counts every shown row.
4. **Mode.** The choice always replaces the selection. Ctrl or ⌘ is ignored, because adding and replacing give the same result.
5. **Range anchor.** After the choice, the Shift-click range anchor (`selectionAnchorId`) is the starting Trip.
6. **Staged Shift.** The choice goes through `requestShiftScopeChange`, like every selection change.
7. **Not counted.** The draft row is not a shown Trip and is skipped.

## Alternatives considered

- **Alternate within the starting Trip's Pattern.** Deferred; it hides which rows are skipped.
- **Step set by two selected Trips (every n-th).** Deferred; it can extend rule 2 later without a new item.

## Consequences

- One pure helper and one menu item. No persistence, domain, or backup change.
