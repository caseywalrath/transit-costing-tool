# Decision 0072: Anchor Diagnosis and Ready Fixes

- Status: Accepted (not implemented)
- Date: 2026-11-11 (user request; plan: `docs/implementation/trip-review-and-runtime-reconciliation.md`, packages R2 and R4)
- Annotates: Decision 0031 and its addendum (anchor solutions, band choice only for one-band-per-trip profiles)

## Context

`trip.anchorNoRuntime` says only "The fixed timepoint cannot be reached with the current runtimes." For a profile that picks a band at each segment start, the usual cause is a runtime that rises at a band boundary. A rise leaves a window of arrival times that no departure reaches. The gaps of every segment before the anchor add up, so a Trip near a boundary often fails at every anchor.

## Decision

1. A pure domain function `diagnoseAnchor` returns, for a failed anchor:
   - the nearest reachable anchor time before the saved one and the nearest after it, each with its first departure;
   - the band boundary between them, and the runtime change of each segment across that boundary;
   - whether keeping the first departure gives a valid Trip.
2. The nearest solutions are offered as row actions: *Keep 6:07:59 (−1:01)* and *Keep 6:10 (+0:59)*. Choosing one sets a new anchor time for that Trip, through the existing `anchorTimeByTripId` input of the recalculation, or through a new `anchorTime` input of a pattern change.
3. The finding `ruleId`s and `messageKey`s are unchanged, so existing tests and callers keep working. The diagnosis travels beside the finding. A UI formatter, `describeAnchorDiagnosis` in `src/ui/shared/messages.ts`, states the cause in one sentence.
4. The six message keys the domain produces but the interface has no text for are given text: `trip.targetRuntimeUnavailable`, `trip.anchorNearestTie`, `trip.anchorBandChoiceInvalid`, `trip.patternRouteMismatch`, `trip.anchorMissing`, `trip.anchorTimeMissing`.
5. Band choice stays available only for one-band-per-trip profiles (Decision 0031 addendum, unchanged).
6. Boundary-move advice ("move AM Peak start from 6:00 to 5:58") is **not** in this decision. A boundary move changes other Trips, and its effect needs its own review. It is recorded as possible later work.

## Consequences

- The diagnosis is derived and never stored.
- A nearest solution keeps a different anchor time from the saved one. The review shows the signed difference before the planner applies it.
