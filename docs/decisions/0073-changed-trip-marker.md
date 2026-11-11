# Decision 0073: Changed-Trip Marker

- Status: Accepted and implemented
- Date: 2026-11-11 (user acceptance of D3 Option B, with Select changed trips; plan: `docs/implementation/trip-review-and-runtime-reconciliation.md`, packages R6 and R7)
- Related: the moved-row marker of 2026-10-30 (`row-moved` in `src/ui/styles/tables.css`)

## Context

A shift, regeneration, or pattern change can move a Trip several rows in the Trips table, because rows are ordered by the first shared timepoint. Nothing marks the Trips that changed.

## Decision

1. **Which Trips.** The Trips written by the last of these actions are marked: staged Shift commit, Regenerate apply, Change pattern apply (single or batch), Undo last regeneration or pattern change, start-time edit, Add trip, and Build trips.
2. **One to five Trips.** Each row gets the existing moved-row style: accent bar, shading, and a 900 ms flash (no flash under reduced motion). When the first marked row is off screen, it is scrolled into view.
3. **Six or more Trips.** Accent bar and shading, no flash. A status line in the selection-bar slot reads "46 trips changed · 12 above, 9 below", with **Previous ↑**, **Next ↓**, **Select changed trips**, and **Clear marks**.
4. **Cleared** by the next marking action, by **Clear marks**, and by a change of Day, Direction, Trip Profile, Route, or Scenario.
5. A marked Trip that is no longer in the visible Day and Direction is counted in the status line ("2 changed trips are not in this view").
6. View state only. Nothing is stored or backed up.

## Consequences

- The marker reuses `row-moved`, so the Trips, Blocking, and Pattern-point tables share one visual meaning for "this row just moved".
