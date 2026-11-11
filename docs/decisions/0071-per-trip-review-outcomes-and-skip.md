# Decision 0071: Per-Trip Review Outcomes, Skip, and One Shared Review

- Status: Accepted and implemented
- Date: 2026-11-11 (user acceptance of D1 and D2; plan: `docs/implementation/trip-review-and-runtime-reconciliation.md`, packages R1, R3, R5)
- Annotates: Decision 0031 (regeneration anchors), Decision 0046 (Regenerate and Undo items), Decision 0067 (anchored pattern change), Decision 0070 (pattern change undo)

## Context

**Regenerate selected…** stops its review at the first Trip with an anchor problem: `previewRecalculateTrips` rethrows `AnchorBandChoiceError` at once, and any other per-Trip error throws the whole review. The batch **Change pattern** review labels each row by pattern name only, and it cannot apply while any Trip is ineligible. The two dialogs use different layouts and different review flows.

## Decision

1. **Outcomes per Trip.** New application methods `reviewRecalculation` and `reviewBatchPatternChange` return one outcome per Trip: `ready`, `needsChoice`, or `error`, with that Trip's findings, band choices, and diagnosis (Decision 0072). They throw only for problems with the whole request. The existing `previewRecalculateTrips`, `applyRecalculationPreview`, `previewBatchPatternChange`, and `applyBatchPatternChange` stay unchanged for their current callers until R5 moves the dialogs off them.
2. **Skip.** Each review takes `skipTripIds`. A skipped Trip is not recalculated or written, and it is not in the undo snapshot. In the block-connection review it counts as an unchanged neighbor.
3. **Partial apply.** Apply writes the Trips that are `ready` and not skipped, in one transaction with the undo snapshot (Decision 0070). Apply is refused when no Trip is left to write, or when the review signature no longer matches the stored data.
4. **Per-Trip inputs for Change pattern.** The batch request gains an anchor node per Trip and a chosen band per Trip, alongside the existing anchor node for all Trips.
5. **One review table.** Regenerate, batch Change pattern, and single-Trip Change pattern use one component, `TripReviewTable`. Each row is labelled with the pattern short name and the first departure. Each row has an **Action** select that holds the fixes for that row and *Skip — leave unchanged*. **Skip all trips with errors** sits above the table. The primary button counts the Trips it will change. The review loads when the dialog opens and again on every input change; the **Review change** button is removed.

## Alternatives considered

- **Keep the Skip buttons and only collect every error.** Rejected by the user (D1 Option B).
- **Two dialogs with trip labels added.** Rejected by the user (D2 Option B).

## Consequences

- The single-Trip signed review (Decision 0067) is kept. The single-Trip dialog builds its row from `previewTripPatternChange`.
- A start-time edit in the Trips table still uses `previewRecalculateTrips` and is not affected.
