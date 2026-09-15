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
