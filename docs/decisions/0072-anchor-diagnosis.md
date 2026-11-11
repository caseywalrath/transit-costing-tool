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

## Communication (user decision of 2026-11-11, after gate G1)

The one-sentence messages of item 3 were too long for a table row and too technical for a planner with little background in runtimes. They are replaced by three layers, all built from fixed templates. No text is written freely, and every number is concrete.

7. **Status chip** in the row, two to four words: "Can't keep 8:16", "Two start times fit", "Outside time periods", "No runtimes for pattern".
8. **Action list.** Each option in the row's Action select names its result and its cost: "Keep Stop B at 8:15 instead (1 min earlier)", "Keep the start time (7:48); Stop B will change", "Start at 7:52 (Early)", "Skip this trip; leave it unchanged". The options are ordered from least to most disruptive, and Skip is always last.
9. **"Why?" panel.** An ⓘ button beside the chip opens a small panel on click or keyboard focus. It does not open on hover alone, because hover cannot be reached by touch or keyboard. The panel has a headline, one to three cause sentences, and a "To fix it, choose one" list. Every item in that list matches an option in the Action select, and the list may end with a Runtimes hint and an **Open runtimes** button. Each kind of diagnosis has its own template, and a sentence appears only when the diagnosis holds its data.
10. **Vocabulary.** The templates use a fixed glossary:
    - anchor or fixed timepoint → "the time you kept";
    - runtime band → "time period", with its name;
    - segment runtime → "travel time from A to B";
    - first departure → "start time";
    - band boundary → "when AM Peak starts at 8:00".
11. **Timeline (optional in R5).** The panel may show a one-line strip of reachable arrival times at the kept stop, with the gap or the overlap marked.
12. **Overlap data.** For the overlap template to name both start times ("7:52 and 7:55 both arrive at 8:16"), `diagnoseAnchor` also returns the departures that reach the kept time exactly (`exactDepartures`).

**Cut of 2026-11-11 (user direction: keep only what the planner needs to decide).** The panel's "To fix it" list (it repeated the Action list), the timeline of item 11, the separate Runtimes hint, the dialog intro sentences, the footer notes, and "leave it unchanged" on Skip are removed. The panel holds a headline, at most one cause line that names the runtime jump ("AM Peak (from 8:00) adds 1:00 from A to B, so no start time reaches B between 8:14 and 8:18."), and Open runtimes. Action options keep their cost.

Items 7 to 12 supersede the sentence templates of R4. `describeAnchorDiagnosis` and `describeAnchorSegmentChanges` are replaced by a structured explanation: headline, cause lines, and fixes, each fix carrying the id of its Action option. R5 owns the presentation.

## Consequences

- The diagnosis is derived and never stored.
- A nearest solution keeps a different anchor time from the saved one. The review shows the signed difference before the planner applies it.
