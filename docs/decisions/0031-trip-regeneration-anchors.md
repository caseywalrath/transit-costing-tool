# Decision 0031: Trip Regeneration Anchors

- Status: Accepted
- Date: 2026-10-20

## Decision

Regeneration uses a one-time anchor selection in the review dialog. First departure is the default. Users may set all selected trips to first departure, last timepoint, or a shared served timepoint, then override individual trips. The saved anchor time remains fixed. The domain first uses a runtime band applicable to the resulting first departure. If no band is applicable, it may use the uniquely nearest band when that band is no more than ten minutes from the calculated departure. Multiple applicable bands, a nearest-band tie, or a larger gap require an explicit band or anchor choice. The preview labels automatic and manual band selections. The application rechecks trip, pattern, runtime, assignment, and block inputs before applying an atomic update. Anchor choices and band selections are not stored on trips.

When a later anchor cannot be preserved or resolves to multiple departures, the review dialog identifies the affected trip, fixed timepoint, and reason. It offers a direct switch to first-departure anchoring for that trip. The user may also change its anchor or revise the runtime bands.

Blended-segment profiles resolve a later anchor by searching valid first departures and recalculating each segment through band boundaries. The nearest-band exception and manual band override apply only to single-band profiles.

The review table shows signed changes to first departure, last timepoint, and total Run Time. A change is regenerated time minus saved time; no change appears as `0:00`.

The review also shows the change in layover from each selected Trip to its next Trip in a Block, after assigned deadhead. Layover is unavailable when a connection needs deadhead but none is assigned. A newly negative trip-end-to-next-departure gap is flagged as a warning on the affected selected Trip. The user may still regenerate after reviewing the warning. The preview checks adjacent saved Trips even when they are not selected and rechecks their times before applying.

## Addendum (2026-10-22, code review package P08): segment-start and blend anchors

The paragraph on later anchors says the review dialog identifies the Trip, the fixed timepoint, and the reason when an anchor resolves to multiple departures. The domain did that only for single-band profiles. Under the segment-start and the blended methods it searched for the first departures that give the anchor time and silently kept the one nearest the saved departure. For example, with band A (0:00 to 1:00, 10 minutes) and band B (1:00 to 2:00, 5 minutes), an anchor of 1:05 at the last timepoint is reached by departing at 0:55 in band A or at 1:00 in band B.

User decision 3 settles it: reject and list the candidates, as single-band profiles do.

1. For a segment-start or blended profile, when more than one first departure gives the anchor time, the recalculation raises `trip.anchorAmbiguous` as an `AnchorBandChoiceError`. Its choices list each candidate departure with the band that contains it, in departure order. Nothing is chosen on the planner's behalf, and no Trip is changed.
2. Exactly one candidate is used as before. No candidate is `trip.anchorNoRuntime`, as before.
3. Manual band override stays limited to single-band profiles (the paragraph above is unchanged). For segment-start and blended profiles the planner resolves an ambiguous Trip by switching it to first-departure anchoring, choosing another anchor, or revising the bands, as that paragraph already says.
4. The Recalculate dialog presents an `AnchorBandChoiceError` with a band picker. Choosing a band for a segment-start or blended Trip is still refused (`trip.anchorBandChoiceInvalid`), so the dialog must not offer the picker for those methods. That presentation belongs to the Trips and Runtime UI package (U07).

