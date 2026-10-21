# Decision 0031: Trip Regeneration Anchors

- Status: Accepted
- Date: 2026-10-20

## Decision

Regeneration uses a one-time anchor selection in the review dialog. First departure is the default. Users may set all selected trips to first departure, last timepoint, or a shared served timepoint, then override individual trips. The saved anchor time remains fixed. The domain first uses a runtime band applicable to the resulting first departure. If no band is applicable, it may use the uniquely nearest band when that band is no more than ten minutes from the calculated departure. Multiple applicable bands, a nearest-band tie, or a larger gap require an explicit band or anchor choice. The preview labels automatic and manual band selections. The application rechecks trip, pattern, runtime, assignment, and block inputs before applying an atomic update. Anchor choices and band selections are not stored on trips.

When a later anchor cannot be preserved or resolves to multiple departures, the review dialog identifies the affected trip, fixed timepoint, and reason. It offers a direct switch to first-departure anchoring for that trip. The user may also change its anchor or revise the runtime bands.

Blended-segment profiles resolve a later anchor by searching valid first departures and recalculating each segment through band boundaries. The nearest-band exception and manual band override apply only to single-band profiles.

The review table shows signed changes to first departure, last timepoint, and total Run Time. A change is regenerated time minus saved time; no change appears as `0:00`.

The review also shows the change in layover from each selected Trip to its next Trip in a Block, after assigned deadhead. Layover is unavailable when a connection needs deadhead but none is assigned. A newly negative trip-end-to-next-departure gap is flagged as a warning on the affected selected Trip. The user may still regenerate after reviewing the warning. The preview checks adjacent saved Trips even when they are not selected and rechecks their times before applying.
