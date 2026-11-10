# Decision 0067: Anchored Pattern Change

- Status: Accepted, not implemented
- Date: 2026-11-10 (user request; plan: `docs/implementation/anchored-pattern-change.md`)
- Related: Decision 0031 (Trip regeneration anchors), Decision 0058 item 7 (built and regenerated Trips give the same times at an anchor)
- Number: 0066 is reserved for another branch.

## Context

**Change pattern…** keeps a Trip's first departure time and recalculates every other time from the target Pattern's runtime profile (`previewPatternChange`, `src/domain/trips.ts`). When the target Pattern starts at a different node, the first time moves to that node, and every time the planner cared about moves with it. For example, a Trip that reaches the transit center at 8:30 on its full Pattern no longer reaches it at 8:30 on a short Pattern that starts closer.

Regenerate already solves this problem: the planner picks an anchor point whose time is kept, and the other times are calculated on both sides (`recalculateTripWithAnchor`). Builds with an anchor node use the same function (Decision 0058 item 7).

## Decision

1. **Optional anchor node.** The Change pattern review accepts an optional anchor node. With no anchor node, or with the first stop as the anchor, the result is exactly today's result.
2. **Candidates.** Only nodes served by both the Trip's current Pattern and the target Pattern can be the anchor. The domain refuses any other node with `trip.anchorNodeNotServed`, so data that changed between listing and review is caught.
3. **Visit.** The anchor is the **first visit** of the node on each Pattern. A node visited more than once (a loop) uses the first visit on the source Pattern for the time and the first visit on the target Pattern for its position. This matches the build rule (`generationAnchorIndex`).
4. **Kept time.** The kept time is the Trip's saved time at the source visit, including any manual edit or shift that produced it.
5. **Calculation.** The target Trip is calculated by `recalculateTripWithAnchor` with the kept time at the target visit, so it gives the same times as a Regenerate with the same anchor. All of Decision 0031 applies unchanged:
   - the nearest-band exception (at most ten minutes) for single-band profiles;
   - band choice for single-band profiles when the result is ambiguous (`AnchorBandChoiceError`);
   - `trip.anchorAmbiguous` with listed candidates and no picker for segment-start and blended profiles;
   - `trip.anchorNoRuntime` when no departure gives the kept time.
6. **Times before the service day.** A calculated time earlier than 0:00 is a finding (`trip.timeBeforeServiceDay`) and blocks the change.
7. **Provenance.** Only the stop times come from the anchored calculation. The Trip's provenance follows today's Change pattern rule: `patternId` is added to `manuallyChangedFields`, and nothing else changes. Regenerate clears manual flags; Change pattern does not.
8. **Review safety.** The review signature includes the anchor node, the chosen band, and the node ids of the source Pattern's points (not only the target's). A change to any of them makes the review stale (`TripPatternChangeStalePreviewError`).
9. **Batch change.** The batch dialog takes one anchor node for all selected Trips. A Trip whose Patterns do not both serve the node, whose result is ambiguous, or that has no runtime is listed with its finding as "Cannot change", as today. The batch dialog offers no band picker; the planner changes that Trip alone to choose a band.
10. **Not stored.** The anchor node and band choice are review inputs. They are not stored on the Trip, as in Decision 0031.
11. **Review content.** The review shows the anchor node, the kept time, and the signed change to the first departure and to the last time, as Regenerate does. Blocks that hold the Trip are listed, as today.

## Alternatives considered

- **Keep the time at the first shared node automatically.** Rejected: the planner may care about a different node (a timed transfer), and an automatic choice hides why times move.
- **Keep the old Trip's times at every shared node.** Rejected: the target profile could not reproduce them, so the Trip would be stale on arrival.
- **Store the anchor on the Trip.** Rejected for consistency with Decision 0031 and because no later calculation reads it.

## Consequences

- No Dexie, backup, or export schema change.
- Change pattern and Regenerate give the same times for the same Pattern, anchor, and profile.
- A late anchor can move the first departure earlier, so layovers and Block connections before the Trip can shrink. The existing Block follow-up covers this; the review states it.
- The batch dialog cannot resolve band choices; those Trips must be changed one at a time.
