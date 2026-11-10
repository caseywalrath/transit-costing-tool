# Anchored pattern change

- Requested by the user on 2026-11-10. Rules: Decision 0067 (`docs/decisions/0067-anchored-pattern-change.md`).
- Branch: `claude/fervent-cannon-rw8mso`. Decision 0066 is reserved for a parallel branch; do not use it.
- Orchestration: the primary agent owns architecture, package briefs, diff review, and final verification. Delegate only if the user asks.
- Packages A1 and A2 are structural class (Luna). A3 is structural class (Luna) because it reuses the Regenerate dialog's anchor and band controls; if it needs a new layout, stop and return it as a UI-design (Sol) package.
- Do not start a package until the previous gate is reported to the user.

## 1. Summary

**Change pattern…** gains an **Anchor** selector. The selected node's time is kept, and the other times are calculated before and after it from the target Pattern's runtime profile. The default, **First stop**, gives today's behavior.

## 2. Code facts (verified 2026-11-10)

If one no longer holds when a package starts, stop and report.

| Fact | Location |
|---|---|
| `previewPatternChange(trip, targetPattern, profile)` keeps `trip.stopTimes[0].time` and calls `propagatePatternTimes`. | `src/domain/trips.ts:508` |
| `applyPatternChange` sets `patternId`, the preview's stop times, and adds `patternId` to `manuallyChangedFields`. | `src/domain/trips.ts:515` |
| `recalculateTripWithAnchor(trip, pattern, profile, now, anchorPointId?, chosenBandId?)` reads the anchor time from `trip.stopTimes` by the **target** pattern's point id. It throws `TripGenerationError` or `AnchorBandChoiceError`. It clears manual flags in provenance. | `src/domain/trips.ts:332` |
| A build seeds a Trip on the target pattern with every time equal to the slot, then calls `recalculateTripWithAnchor`. Copy this seeding. | `src/domain/trips.ts:119-126` |
| `generationAnchorIndex` uses the first visit of a node. | `src/domain/trips.ts:82` |
| `previewTripPatternChange(tripId, targetPatternId, directionId)` and `changeTripPattern(review)` are the single-Trip service methods. | `src/application/tripGenerationService.ts:332`, `:345` |
| `tripPatternChangeSignature` covers the Trip, the target's point ids, the assignment, and the profile. It does not cover the source pattern. | `src/application/tripGenerationService.ts:45` |
| `buildBatchPatternChangePreview` calls `previewPatternChange` per Trip; `previewBatchPatternChange` / `applyBatchPatternChange` are the service methods. | `src/domain/serviceDayCopy.ts:326`, `src/application/tripGenerationService.ts` |
| `TripPatternChangeDialog` (single) and `BatchPatternChangeDialog` (batch). | `src/ui/trips/dialogs.tsx:337`, `:326` |
| `RecalculationDialog` holds the anchor selector and band picker to reuse. | `src/ui/trips/dialogs.tsx` |
| Existing anchor tests to copy from. | `src/domain/tripAnchorGeneration.test.ts` |

## 3. Packages

### A1 — Domain (structural)

Files: `src/domain/trips.ts`, `src/domain/serviceDayCopy.ts`, `src/domain/tripPatternChangeAnchor.test.ts` (new), message keys if a new key is needed.

1. `previewPatternChange(trip, targetPattern, profile, options?: { sourcePattern?: RoutePattern; anchorNodeId?: string; chosenBandId?: string })`.
   - No `anchorNodeId`, or `anchorNodeId` equal to the source pattern's first node **and** the target's first node: unchanged code path.
   - Otherwise require `sourcePattern`. Find the first source point with the node and the trip's time at that point id; find the first target point with the node. Missing on either side: finding `trip.anchorNodeNotServed`.
   - Seed a Trip on the target's points with every time equal to the kept time; call `recalculateTripWithAnchor(seed, targetPattern, profile, now, targetPoint.id, chosenBandId)`.
   - `AnchorBandChoiceError`: return a preview with `finding` and `bandChoices` (new optional field, the error's `choices`). Other `TripGenerationError`: return `finding`.
   - Any calculated time below 0: finding `trip.timeBeforeServiceDay`.
   - Add `anchorNodeId`, `anchorTime` to the returned preview.
2. `applyPatternChange` is unchanged (rule 7: only the stop times are taken).
3. `buildBatchPatternChangePreview` takes optional `anchorNodeId` in its request and passes it with each Trip's source pattern. No band choice in batch.
4. Tests:
   - first stop as anchor equals today, for all three methods;
   - mid-route anchor equals `recalculateTripWithAnchor` on the target;
   - target starts at a later node: the anchor time is kept;
   - loop pattern uses first visits;
   - node missing on source, on target;
   - ambiguous single-band gives `bandChoices`, and `chosenBandId` resolves it;
   - segment-start ambiguity gives a finding with no picker;
   - time before 0:00;
   - provenance after apply equals today's;
   - batch: one ineligible Trip does not affect others.

Gate: `pnpm typecheck`, the new test file, `src/domain/trips*.test.ts`, `src/domain/serviceDayCopy*.test.ts`, then the full unit suite.

### A2 — Application (structural)

Files: `src/application/tripGenerationService.ts` and its tests.

1. `previewTripPatternChange(tripId, targetPatternId, directionId, options?: { anchorNodeId?: string; chosenBandId?: string })` passes the source pattern and options to the domain.
2. The review stores `anchorNodeId` and `chosenBandId`. `changeTripPattern` recomputes the preview with them.
3. `tripPatternChangeSignature` adds the anchor node, the band choice, and the source pattern's `[point.id, point.nodeId, point.sequence]`.
4. The batch request takes `anchorNodeId`; its stale check covers the same inputs.
5. Add `sharedAnchorNodes(sourcePattern, targetPattern)` (domain helper in `trips.ts`, exposed through the service) returning nodes served by both, in target order, first visits only.
6. Tests: stale review after the source pattern's nodes change, after the anchor changes; band choice round trip; batch with anchor.

Gate: typecheck, `tripGenerationService.test.ts`, `serviceDayCopy.test.ts`, full unit suite.

### A3 — UI (structural, reuses Regenerate controls)

Files: `src/ui/trips/dialogs.tsx`, `docs/ui-conventions.md`, `tests/ui/` (one new spec).

1. Both dialogs: an **Anchor** select below **Target pattern**. Options: **First stop** (default) and each shared node by name. Changing the target or the anchor clears the review.
2. Single dialog: when the review has `bandChoices`, show the band picker as `RecalculationDialog` does; choosing a band reviews again. Segment-start and blended findings show the reason in text, no picker.
3. Review text: "Keeps {node} at {time}.", signed change to first departure and last time, and the existing affected-block line.
4. Batch dialog: one Anchor select; ineligible Trips show their finding as today.
5. Keyboard: the select is in tab order after Target pattern; focus rules are unchanged.
6. Update `docs/ui-conventions.md` (Trips selection bar, Change pattern) and `architecture_overview.md` (trips section).
7. Browser spec: change one Trip to a shorter pattern anchored at a shared mid-route node and check that node's time is unchanged.

Gate: typecheck, the new spec plus existing Change pattern specs, production build, a screenshot of both dialogs, full unit suite. Full browser suite at closeout of this plan.

## 4. Out of scope

- Storing the anchor on Trips.
- Band choice in the batch dialog.
- Changing Regenerate.
