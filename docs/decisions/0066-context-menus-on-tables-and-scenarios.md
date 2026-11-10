# Decision 0066: Context Menus on Tables, Blocks and Scenarios, and Copy Table

- Status: Accepted and implemented (2026-11-10). Plan: `docs/implementation/context-menus-round-1.md`. Closeout: `docs/implementation/context-menus-round-1-closeout.md`.
- Date: 2026-11-10 (the user accepted the recommendations in `docs/implementation/context-menus-proposal.md`)
- Related: Decision 0064 (project context menu; item 7 sets the shared rules), Decision 0053 (Blocking menus), Decision 0065 (segment distances)

## Context

Decision 0064 added `ContextMenu` for items of an open menu. The proposal surveyed every screen and table, and the user accepted its recommendations:

- the selection rule A;
- Shift+right-click for the browser menu;
- a Route switcher, but later;
- Copy table now, and the other new capabilities later;
- a first round of CM0–CM3 plus Copy table.

Table rows bring selection, controls inside cells, and locked modes, which Decision 0064 does not cover.

## Decision

### Rules for every context menu on an element that is not a menu item

These rules extend Decision 0064 item 7.

1. **Which rows a menu acts on.**
   - A menu on a selected row acts on the whole selection, and its heading reads "N selected <things>".
   - A menu on an unselected row acts on that row only, and its heading names the row. Opening the menu never changes the selection.
   - The one exception is a single-row command that opens a selection tool, such as Shift… or Change pattern… on a Trip. That command first makes that row the only selection, then opens the tool.
2. **Keyboard.** A row is not focusable and is not in the Tab order. Shift+F10 or the ContextMenu key on any control inside the row opens the row's menu, placed at the control's lower-left corner. When the menu closes, focus returns to that control.
3. **When the browser menu wins.** These cases open the browser's own menu and never the app's:
   - **Fields:** the target is in an `input`, `textarea`, `select` or `[contenteditable]`;
   - **Selected text:** the page has selected text inside the target row or region;
   - **Shift+right-click:** this applies everywhere, including menu items with a context menu (Decision 0064);
   - **Inside a menu:** the target is inside an open menu (`[role="menu"]`).
4. **Controls that are menus.** Right-clicking a control that opens its own menu, such as the block pill or the Pattern chip, opens the row's menu. The control's own menu stays on left-click.
5. **One list of commands.** A selection bar and its context menu take their commands from one `MenuItem[]` list. The bar shows them as buttons, so a label, disabled state or reason cannot differ between the two.
6. **Locks.** While a table is locked (a staged shift, the shift bar, a draft row, an open drawer or a busy save), its menus show the same items, disabled for the same reasons. A menu never offers a way around a lock.
7. **Where there are no context menus:**
   - modal dialogs;
   - tabs and the save status;
   - form fields;
   - empty page areas.

### Menus in this round

8. **Trips table.**
   - **Unselected row.** The groups are:
     - Select: Add to selection · Select only this trip · Select all on <pattern>.
     - Edit: Edit start time · Change pattern… · Shift… · Regenerate…. Regenerate… is listed only when that trip's run times changed.
     - Block: Assign block… · Unassign from block.
     - Delete trip….
   - **Selected row.** The selection bar's commands, followed by Clear selection.
   - **Column headings.** These groups come from the existing builders:
     - the "Select trips by…" groups;
     - the View menu's options.
   - **Side by side.** Each pane has the same menus. The draft row has none.
9. **Blocking.**
   - **One list of block items.** One builder, `blockGroups(block)`, gives Open · Rename… · Edit notes… · Delete block… for any block. It serves:
     - the Current block Actions ⋯, without Open;
     - the context menu on each item of the Block picker;
     - the Blocks table rows.
   - **Checked Blocks rows.** "Delete N blocks…" and Clear selection.
   - **Unassigned trips rows:**
     - Assign: Assign to Block <current>, for the row or the selection.
     - Select: Add to selection · Select only this trip.
     - Filter: Show only <pattern> · Show only trips starting at <node> · Show only trips ending at <node> · Clear filters (when filters are on).
   - **Current block, revenue-trip rows:**
     - Move up · Move down · Add deadhead after… or Edit deadhead…;
     - Move to block… · Remove from block….
     - A selected row shows the selection bar's commands.
   - **Current block, pull-out, pull-in and deadhead rows:** Edit… · Remove….
10. **Scenario switcher.**
    - **Items.** Each scenario item has a context menu: Open · Rename… · Duplicate… · Delete scenario…. Every item acts on that scenario, open or not.
    - **Renaming or duplicating a scenario that isn't open** keeps the current selection.
    - **Duplicating** keeps today's behavior: it opens the copy, after the unsaved-route question.
    - **Deleting a scenario that isn't open** asks no unsaved-route question and keeps the current selection. Deleting the open scenario behaves as it does today.
    - **The application layer** gains `renameScenarioById` and `duplicateScenarioById`.
11. **Copy table.**
    - **Where.** Cost breakdown has "Copy cost breakdown" in its context menu and in the Costing Actions ⋯ menu.
    - **What it copies.** It writes the table as tab-separated text to the clipboard. That covers the header row, every service-day row and the total row, with the values as displayed.
    - **Result.** A status line reports success or failure. A failed write changes nothing else.

### Not in this round

12. These are left for later decisions:
    - **CM4:** the Route switcher.
    - **CM5:** the grid menus, and inserting above and below.
    - **CM7:** going from one tab to another.
    - **Add trip after this.**
    - **Shared builders not used by a round-1 menu.** Until then, the pattern menus and the Trips View menu keep their own item lists.

## Consequences

- **Faster table work.** Planners can act on one row without clearing a selection they built carefully. They can also act on the selection from where they are looking, instead of from the bar above the table.
- **Shared commands.** Selection bars and menus share commands, so a later change to a disabled reason applies to both.
- **New application methods.** `renameScenarioById` and `duplicateScenarioById` are added. The existing `renameScenario` and `duplicateScenario` keep their signatures and call the new methods.
- **No schema or backup changes.** The Dexie schema stays at 10 and the backup schema at 11. Copy table reads nothing that is not already on screen.
- **Hidden but reachable.** Context menus are hard to discover. Every action in this round stays reachable without one.

## Rejected alternatives

- **Right-click replaces the selection (rule B).** A stray right-click would discard a multi-step selection, and some selections survive a staged shift.
- **Focusable rows.** This would add a Tab stop per row and change every table's keyboard path. Opening the menu from controls inside the row needs neither.
- **Clipboard Paste in menus.** Reading the clipboard prompts for permission, or is unavailable, depending on the browser. Ctrl+V keeps working where it works today.
