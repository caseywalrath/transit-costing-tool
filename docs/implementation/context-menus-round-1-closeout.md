# Context Menus, Round 1: Closeout

- Decision: `docs/decisions/0066-context-menus-on-tables-and-scenarios.md`
- Plan: `docs/implementation/context-menus-round-1.md`
- Date: 2026-11-10
- Branch: `claude/confident-lovelace-n30nu4`

## Packages and commits

| Package | Implemented by | Commits |
|---|---|---|
| CM0: `useContextMenu`, `CommandButton`, Shift rule in `MenuGroups` | Opus | `2dca519` |
| CM1: Trips rows and headings | Opus (wiring), Haiku (tests) | `3d1ae39`, `f2e6ef2` |
| CM2: Blocking | Haiku, reviewed by Opus | `7a0b9f1` |
| CM3: Scenario switcher | Haiku (application layer), Opus (wiring, tests) | `79e8ff3`, `1ada678` |
| CM6: Copy cost breakdown | Haiku, reviewed by Opus | `04fa5d9` |
| Fixes found at closeout | Opus | `3f6f13d` and the closeout commit |
| Documentation | Opus | `81fc44e` |

## Acceptance results

1. **Ways to open each menu.** Every round-1 menu opens by right-click and by Shift+F10. Escape returns focus to the control that opened it. Tested in `trips-context-menu`, `scenario-context-menu` and `context-menu-target`. Touch long-press reuses the timing of Decision 0064 and has no automated test.
2. **The selection is unchanged when a menu opens.** Tested on Trips rows: "no box becomes checked", and "Add to selection" checks only that row.
3. **The browser's own menu wins** for Shift+right-click, text fields and selected text. Tested in `context-menu-target` and `trips-context-menu`.
4. **One command list.** The Trips, Unassigned, Current block and Blocks selection bars draw their buttons from the same `MenuItem[]` lists as their menus.
5. **Locks.** The shift drawer turns the Trips row menu off (tested). The other locks use the bars' own disabled expressions.
6. **Non-current scenarios and blocks.** Renaming or deleting a scenario or block that isn't current keeps the current one. Tested in `scenario-context-menu` and `blocking-context-menu`.
7. **Copy cost breakdown** writes the table as tab-separated text, or reports that it could not. Tested in `costing-copy-table`, from both Actions ⋯ and the right-click menu.
8. **Schemas.** No schema change: Dexie stays at 10 and the backup schema at 11. The full unit suite passed (1257 tests), and the full browser suite passed (328 passed, 2 skipped by design). The suite ran before the closeout fixes. After the fixes, the 51 tests of the eight specs that cover `ContextMenu` passed again.

## Deviations

- **Edit start time.** `rowContextMenu` takes a third argument, `editStartTime`, because the start-time button is inside the row and the workspace can't reach it.
- **Row checkboxes.** A checkbox is not treated as a text field, so it opens the row's menu (rule 2).
- **Move to block… (CM2).** It calls `moveTripsToBlock(tripIds)` with the Trip ID. The plan had it set the selection and then call `requestReassignSelectedTrips()`, which would read the old selection.
- **Extra props (CM2).** `UnassignedRow` and `ActivityRow` take more props than `contextTarget`: the menu content, the selection commands and the Move item.
- **Shift… from an unselected row.** `openShiftDrawer` takes an optional list of Trip IDs, for the same stale-state reason as Move to block….

## Fixes made at closeout

- **Menu off-screen on a scrolled page.** A later `.action-menu { position: absolute }` rule overrode the fixed position of `.action-menu--context`. On a scrolled page the menu opened off-screen and closed at once. This affected the Decision 0064 menus too. The selector is now `.action-menu.action-menu--context`, and a test checks a scrolled Trips row.
- **Menu closing as it opened.** `ContextMenu` focused its first item before it moved itself inside the window, and that focus could scroll the page. A scroll that happened just before opening is also reported one frame later. Either one closed the menu. The menu now focuses with `preventScroll` and ignores scroll events in its first two frames.
- **Rename changed the current block.** Renaming a block made it the current block. Rename now keeps the current block.

## Visual inspection

The Trips row menu, the Blocks row menu and the scenario menu were each checked at 1024 px in the light theme. The app has no dark theme, so the dark check does not apply. The copied-status note is covered by `costing-copy-table` and was not inspected visually.

## Not in this round

Decision 0066 item 12 lists what is left for later: the Route switcher (CM4), the grid menus (CM5), going from one tab to another (CM7), and Add trip after this.
