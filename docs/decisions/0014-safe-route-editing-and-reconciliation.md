# Decision 0014: Safe Route Editing and Direction Reconciliation

- Status: Accepted
- Date: 2026-09-13

## Context

The original route interface saved every Node and Pattern field immediately. A Pattern point edit could therefore leave Direction timetable columns, runtime profile segment counts, saved trips, or later block references inconsistent. Its one-pattern-at-a-time column mapping also reported a generic error instead of reconciling the entire Direction.

## Decision

1. Nodes and one selected Pattern are edited in React drafts and save only through application-layer preview and commit commands.
2. Every reviewed route edit uses a source signature. A commit reloads the authoritative scenario and rejects a stale review.
3. Direction columns are reconciled from all saved Patterns in the Direction through stable topological ordering. Compatible existing columns retain their identifiers; repeated visits use separate columns; orphan columns are removed.
4. A cyclic ordering constraint blocks the Pattern save. The message names the Direction, Patterns, and timepoints. Removing service does not override the conflict.
5. Deterministic point insertion uses the zero-minute convention: predecessor-to-new is zero and new-to-successor keeps the former segment runtime. Existing trips receive the predecessor scheduled time at the new point.
6. Deterministic point removal merges its adjoining segments and removes the matching scheduled point. Retained trip and Pattern-point identifiers remain stable.
7. Reordered retained points and broad replacement without anchors require an explicit reset. The reset removes only service owned by that Pattern and removes its revenue-trip activities while retaining block records.
8. The complete scenario update is committed in one repository transaction. No data-schema migration is required.

## Consequences

- The active Route UI no longer invokes immediate Node or Pattern mutation commands.
- The legacy immediate commands remain temporarily for historical tests and non-Route callers, but they are not the safe editing path.
- A new Node must be saved before it can be selected in a Pattern draft.
- No separate Trips rebuild command is needed after a successful Pattern save; the reconciled direction columns load immediately.

## Addendum (2026-10-22, code review package P07): Trip revisions after a deterministic edit

Items 5 and 6 predate the segment-start calculation method (Decision 0033), which is now the default for new Runtime profiles. A profile that uses it takes each segment's duration from the band that contains the segment's start. A Trip saved before the edit can hold a time that came from two bands: its segment from B to C started in the PM band and its segment from A to B in the AM band. Merging the two segments when B is removed keeps one duration, taken from the band at A, so the rebalanced profile calculates a different time at C than the Trip stores. The same can happen with the continuous blend method.

The rebalance still preserves every retained scheduled time and every manual shift (items 5 and 6 are unchanged). What changes is the calculation source recorded on each Trip:

1. A Trip is recorded at the new calculation revision only when it was current before the edit (its recorded revision equals the profile's revision before the edit) and the rebalanced profile calculates all of its new times from its first departure.
2. Any other Trip keeps its recorded revision and is therefore stale in the sense of Decision 0030 item 1. A Trip that was already stale stays stale, whether or not its times happen to match. A Trip that records no revision keeps its provenance unchanged.
3. The planner reviews and recalculates such Trips through the existing explicit recalculation. The edit never changes a time to make a Trip current.

This applies to every calculation method; for the single-band and zero-minute-insertion cases the rebalanced profile reproduces the Trip, so those Trips move to the new revision as before.

