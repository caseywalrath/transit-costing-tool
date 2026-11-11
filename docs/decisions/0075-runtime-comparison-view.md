# Decision 0075: Runtime Comparison and Reconciliation View

- Status: Accepted (not implemented)
- Date: 2026-11-11 (user acceptance of D5 Option A with the Option B toggle; plan: `docs/implementation/trip-review-and-runtime-reconciliation.md`, packages R10 and R11)
- Related: Decision 0049, Decision 0074

## Context

Runtimes for the same segment are entered separately in each pattern's profile, and differences between them are hard to see.

## Decision

1. **Entry.** Runtimes **Actions → Compare patterns…** opens the view for the selected Route, Direction, and Day.
2. **Stacked view (default).** One table per pattern of the Direction, stacked vertically. The columns are one shared segment axis: every ordered node pair the Direction's patterns run, in timetable-column order. A pattern that does not run a segment shows `·`. Each pattern keeps its own band rows.
3. **Align by time.** A toggle switches to one table whose rows are clock intervals, cut at every band boundary of every pattern, and whose cells list each pattern's value.
4. **Discrepancy.** A cell is highlighted when another pattern holds a different value for the same segment during a time that overlaps the cell's band. Both views use the same rule, computed by the pure function `compareRouteRuntimes`.
5. **Reconcile.** On a highlighted cell, **Use this value for…** lists the other patterns. It writes through the segment-runtime preview, apply, and undo path of Decision 0049 and Decision 0074.
6. No storage, backup, or Dexie change.
