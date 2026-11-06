# Decision 0060: Side-by-Side Trips

- Status: Accepted and implemented (packages SS1 to SS4, 2026-11-06; implementation plan `docs/implementation/side-by-side-trips.md`)
- Date: 2026-11-06 (user design review of the level A mock-up, versions 1 and 2)
- Related: Decisions 0011 (managed directions), 0046 (regeneration undo), 0047 (interface revision), 0059 (scope toggles)

## Context

Planners switch between Outbound and Inbound often and want to see both at once, to judge how trips line up and to work on either direction without switching. Some planners use very wide screens. The Trips tab shows one direction at a time: `TripsWorkspace` receives one `directionId` from `App.tsx` and draws one `ScheduleTable`. The page is capped at 1720 px (`.app-shell`).

## Decision

### Activation

1. **View menu.** The Trips table's **View** menu gains a checkbox item, "Show both directions side by side", below the existing three display options. It is disabled, with the reason as its title, when the route has fewer than two directions or the window is narrower than the minimum width (rule 12).
2. **Side-by-side strip.** While side by side is on, a strip under the Trips heading reads "<left direction> on the left · <right direction> on the right" and holds **Switch sides** (⇄) and **Close side by side** (✕). Switch sides swaps the panes without drawing them again, so open edits stay. Close first asks about any open edit (one table cannot hold both panes' edits), then returns to one table showing the left-pane direction.
3. **Direction toggle.** While side by side is on, the scope bar's Direction control is disabled. Its title says that both directions are shown.
4. **More than two directions.** Each pane header gets a Direction select (the Decision 0059 fallback without a visible label, `aria-label` "Left direction" and "Right direction"). The two panes may not show the same direction; choosing the other pane's direction swaps them.
5. **Stored per viewer.** Side by side on or off and the left-pane direction are viewer preferences, stored like the existing View options. They are not Scenario data and are not in backups.

### Layout

6. **Runtimes hidden.** The Runtimes section above the trips table is hidden while side by side is on and returns in its previous state when side by side closes. If Runtimes has unsaved changes, turning side by side on asks Save, Discard, or Cancel first; Cancel leaves side by side off.
7. **Two panes.** Each pane is a labeled region ("Outbound trips") with a header: direction name, its first-to-last timepoint description, its trip count, and its own **Add trip**, **Build trips…**, and **Actions** (⋯) controls acting on that direction only. Trip profile, the plan status chip, Blocking scenario, and the View menu stay in the shared Trips header and apply to both panes. The plan status chip stays shared because it already reports every direction of the Route (corrected in SS3; the SS1 text moved it into each pane).
8. **Compact columns.** In side by side both tables use compact density: timepoint columns at least 50 px instead of 76 px (times with seconds widen them) with short timepoint names as headers, the Pattern column 84 px instead of 188 px showing the pattern short name with the full name as tooltip, Run time, Layover, and Next trip 56 px, Block 64 px, cell padding 3 px and 13 px text. The Deadhead column is hidden; its total stays in the totals row. Run time, Layover, Next trip, and Block remain.
9. **Natural width.** Each pane is as wide as its compact table. The panes are not stretched to fill spare width; spare width stays empty at the right.
10. **Full window width.** While side by side is on, the 1720 px page cap does not apply; the page uses the window width.
11. **Overflow.** When both natural widths do not fit, each pane gets width in proportion to its natural width and scrolls horizontally inside itself. Selection and Pattern stay pinned at the left as today; Run time, Layover, Next trip, and Block are pinned at the right. Only timepoint columns scroll. The page never scrolls horizontally.
12. **Minimum width.** Side by side is offered only when the window is at least 1100 px wide. If the window becomes narrower while it is on, it closes as in rule 2 and the preference is kept for the next wide window.
13. **Vertical scrolling.** The page scrolls, as it does for the single table, so both panes move together and each keeps its existing pinned headings while scrolling. (SS1 proposed separate vertical scrolling per pane; SS3 kept the page scroll because the Trips table's pinned headings and pinned selection bar are built on it.) Time-aligned scrolling is a later level (B) and is not part of this decision.

### Editing

14. **One open edit.** At most one pane may hold an open edit: an Add-trip row with entered values, a staged Shift, or an open Build trips drawer. Starting one of these in the other pane first asks the existing question for the open edit (Cancel or Discard for an Add-trip row, discard for a staged Shift; Build trips closes without a prompt as today). Selection, start-time edits that save at once, block assignment, and regeneration are allowed in either pane at any time.
15. **Shared scope changes.** A Day, Trip profile, Route, Scenario, or tab change asks about the open edit in whichever pane holds it, as the single table does now.
16. **Undo last regeneration** stays in each pane's Actions menu and applies only when its saved undo belongs to that pane's direction.

## Consequences

- Planners on wide screens see both directions with no horizontal scrolling. Measured in SS3 on the Federal BRT fixture (9 timepoints per direction, times with seconds): each compact table is about 995 px wide, so neither pane scrolls at 2560 px, while at 1920 px each pane is about 85 px short and scrolls its timepoints. Times without seconds (or Round displayed times) make timepoint columns narrower.
- A window that becomes narrower than 1100 px while side by side is on shows the single table again; open edits in either pane are dropped without a question, because the change comes from the window, not a command. This is a known limitation.
- `TripsWorkspace` must be able to draw a second instance for another direction with its own data, and report open edits to one combined navigation guard. This is a structural refactor done before the UI work.
- Browser tests that find the trips table by role must name the pane region when side by side is on. Single-table tests are unchanged.
- A "key timepoints only" view for very long routes needs a new stored field and is out of scope until requested.
