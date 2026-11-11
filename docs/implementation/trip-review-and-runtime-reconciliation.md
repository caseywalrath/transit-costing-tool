# Trip review, changed-trip markers, and runtime reconciliation

Status: Proposed (planning only; no code changed). Date: 2026-11-11.
Base: `main` at PR #57 (Decisions 0068 to 0070).

This plan answers the user's list of 2026-11-11:

1. A way to leave a problem trip out of **Regenerate selected…** and **Change pattern**, so one trip does not block the rest.
2. The Change pattern review does not say which trip an error belongs to, and it looks and behaves differently from the Regenerate review.
3. Regenerate and Change pattern errors do not say what to do. Example: "The fixed timepoint cannot be reached with the current runtimes. Choose another anchor or adjust the runtime bands."
4. Trips seem to disappear after a shift or regeneration when their place in the table changes.
5. **Fill from other patterns…** sometimes does not fill cells whose timepoints and bands seem to match. A view to compare and reconcile runtimes across patterns.

Section 1 records what the code does today, verified by reading it and, for item 5, by a throwaway test run against the golden project. Section 2 lists the decisions the user must make. Section 3 divides the work into packages.

## 1. Findings

### 1.1 Regenerate stops at the first problem trip

- `TripGenerationService.previewRecalculateTrips` (`src/application/tripGenerationService.ts:394`) recalculates every selected trip. A band-choice problem (`AnchorBandChoiceError`: ambiguous anchor, nearest-band tie, or band too far) is rethrown at once (line 421), so the review stops at the first such trip. Other errors are collected, but any error throws the whole review (line 425).
- Result: while any trip has an error, the dialog shows no new times for any trip, and it reports anchor problems one trip at a time. The dialog already has **Skip this trip and regenerate the others** and **Skip these N trips** (`RecalculationDialog`, `src/ui/trips/dialogs.tsx:243`). With many problem trips, the planner skips one, waits for a new review, finds the next one, and skips again.

### 1.2 Change pattern review

- **Batch** (`BatchPatternChangeDialog`, `dialogs.tsx:330`). Each result row is labelled `tripName(id)`, which returns the trip's **pattern name** only (line 331). Several trips on one pattern read the same, for example "Southbound full: The fixed timepoint cannot be reached…" three times. That is the defect the user reported.
- **Change patterns** is disabled while any trip is ineligible (line 335). There is no skip.
- The batch review shows no times (no first or last change, run time, or layover), no per-trip anchor, and no band choice. The domain already returns `bandChoices` per trip (`PatternChangePreview`, `src/domain/trips.ts:507`).
- **Single trip** (`TripPatternChangeDialog`, `dialogs.tsx:343`) shows one status sentence and, for a single-band ambiguity, a band select.
- Regenerate uses a review table that loads when the dialog opens. Change pattern uses a form with a **Review change** button and a list. These are the two different approaches the user described.

### 1.3 Why "The fixed timepoint cannot be reached" appears, and why other anchors fail too

The message is `trip.anchorNoRuntime` (`src/ui/shared/messages.ts:71`). `recalculateTripWithAnchor` (`src/domain/trips.ts:332`) produces it in three ways:

- **Band at segment start** (the default method). The solver works backward from the anchor, one segment at a time, and keeps an earlier departure only if the band that contains it is the band whose runtime was used (lines 341 to 351). When a segment's runtime **increases** at a band boundary, some arrival times cannot be reached from any departure. Example: segment A→B is 8:00 in Early (ends 6:00) and 10:00 in AM Peak. A departure at 5:59:59 arrives at 6:07:59. A departure at 6:00 arrives at 6:10. No departure arrives between 6:08 and 6:09:59. An anchor time saved in that gap has no solution. The gaps of every segment before the anchor add up, so a trip that runs near a boundary often fails at every anchor. This is the "other anchors throw similar errors" case. When the runtime **decreases** at the boundary, the same window can be reached twice, and the result is `trip.anchorAmbiguous`.
- **Blended**. The binary search per band (lines 364 to 376) finds no exact second. This has the same cause at band edges.
- **One band per trip**. Each band's departure (anchor time minus the band's runtime to the anchor) falls outside that band. When the nearest band is more than 10 minutes away, or two bands are equally near, the dialog lists band choices. The message is only bare when no band produces a departure at or after 0:00.

The solver already has what a specific message needs: the two nearest reachable solutions (the last departure before the boundary and the first one at or after it), the boundary between them, and the runtime change of each segment across that boundary. None of this is returned today.

### 1.4 Trips that seem to disappear

- The Trips table orders rows by the first shared timepoint (`architecture_overview.md`, Trip Generation Model). A shift, regeneration, or pattern change can move a trip several rows. Only a staged Shift restores the scroll position. Nothing marks the rows that changed.
- The marker for a moved row already exists: `row-moved` in `src/ui/styles/tables.css:30` (a 3 px accent bar, accent-soft shading, and a 900 ms flash that is off under reduced motion). The Pattern points grid and the Blocking table use it (`tests/ui/moved-row-marker.spec.ts`).

### 1.5 Fill from other patterns

The logic (`src/domain/segmentRuntimeMatching.ts`) does what Decision 0049 specifies. That specification is strict, and the dialog hides why cells are not filled. Verified facts:

1. **A band matches only with the identical start and end time, to the second** (`sameBand`, line 60). In a throwaway run against the golden Federal BRT project, each of the 18 runtime profiles was set to `:00` and filled. **Every profile filled 0 cells.** Every skip was `bandMismatch`, because band boundaries differ from pattern to pattern. Weekday examples: Wagon Road–Evans 5:47 / 9:58 / 17:51; Westminster Station–Englewood 6:00:30 / 10:14:30 / 18:03:30; Evans–Wagon Road 6:01:30 / 10:01:30 / 15:03:30. Boundaries taken from a workbook differ by the offset to each pattern's first timepoint.
2. **The dialog drops seconds from band ranges.** `describeSegmentRuntimePlan` formats ranges with `formatServiceTime(band.startTime)` (`src/application/routeDefinitionService.ts:929`), which omits seconds. A band of 6:00:30–10:14:30 is listed as "6:00–10:14". A mismatch between 6:00:00 and 6:00:30 therefore reads as two identical ranges. This is the most likely cause of "bands seem to match". The Runtimes editor does show seconds (`RuntimeEditor.tsx:57`).
3. **Some exclusions are not reported.**
   - A profile is a source only if it shares a service day with the open profile (`qualifyingProfiles`). A profile assigned only to other days is left out without a message. A profile with no assignment is reported.
   - The reason `noMatchingSegment` is declared (line 5) and never produced.
   - A source cell of `:00` is ignored without a message (line 187).
4. Only cells that are exactly `:00` are filled. This is the specified behavior and is stated in the dialog.

Segment matching by ordered node pair is correct for the golden project, where all patterns share Node records. It fails without a message when two patterns use different Node records with the same name. Item 3 covers that case.

## 2. Decisions for the user

Each item gives a recommendation. Packages P1 to P3 can start once D1 and D2 are answered. D3 to D5 control P4 to P7.

**D1. How a problem trip is left out (items 1 and 2).**
- Option A: each review row has an **Action** select: *Regenerate* (or *Change pattern*), the fixes that apply to that row (section 3, P4), and *Skip — leave unchanged*. Above the table, **Skip all trips with errors** sets every error row to *Skip*. The primary button counts what it will change, for example "Regenerate 46 trips (3 skipped)".
- Option B: keep today's Skip buttons and only make the review show every problem at once.
- **Recommendation: A.** It is the drop-down the user asked for. It also gives each row's fixes a place in the row.

**D2. One review for Regenerate and Change pattern (item 2).**
- Option A: one shared review table with the same columns, row status, Action select, and footer. Change pattern adds a Target pattern select above the table. Its anchor column offers the nodes both patterns serve, which is the existing rule. The single-trip Change pattern uses the same table with one row. The review loads when the dialog opens and again on every input change, as Regenerate does today. The **Review change** button is removed.
- Option B: keep the two dialogs and add trip labels and Skip to the batch list.
- **Recommendation: A.** The user asked for one approach.

**D3. Changed-trip marker (item 4).** See P5 for the visual detail.
- Option A: one marker for every change, the existing `row-moved` style, on every changed row.
- Option B: the same marker in two strengths. One to five changed trips: accent bar, shading, and the flash, and the first changed trip is scrolled into view if it is off screen. Six or more: accent bar and shading only, with no flash, plus a status line in the selection-bar position: "46 trips changed · 12 above, 9 below · Next ↓ · Previous ↑ · Clear marks".
- Option C: no row marker. Only select the changed trips after the action.
- **Recommendation: B.** One visual vocabulary is easier to learn. Flashing 46 rows is noise, and a long list needs navigation more than emphasis. Optionally combine B with C by adding a **Select changed trips** command to the status line. That command reuses the selection bar and needs no new interaction.

**D4. Band matching for Fill and Copy (item 5).**
- Option A: keep exact matching. Fix only the display and the missing reasons (P6a).
- Option B: automatic overlap matching. Each open band takes the other profile's band that covers most of its time span, and only when exactly one band covers more than half of it.
- Option C: a band map in the dialog. For each other profile, one row per open band, with a select defaulted to the largest-overlap band, or *None* when nothing overlaps by half. The planner reviews and changes the pairs before **Fill runtimes**.
- **Recommendation: C, built on B's default.** On the golden data every band would pair automatically, and the planner sees each pairing before anything is written. B alone can pair bands silently in a way the planner did not intend. This changes Decision 0049 rule "a band matches only with the same start and end time", so it needs a new decision record.

**D5. Runtime comparison view (item 5).** Mock-ups are in P7.
- Option A, stacked tables: one Runtimes table per pattern of the direction, stacked vertically. Segment columns are aligned on a shared axis: the union of the direction's segments in timetable-column order, with a blank where a pattern does not run that segment. Each pattern keeps its own band rows. A cell is highlighted when another pattern's band, overlapping in time, holds a different value for the same segment. This is what the user described, but the rows do not line up when band boundaries differ.
- Option B, clock-aligned matrix: one table. Rows are clock intervals made from every pattern's band boundaries together. Columns are shared segments. Each cell lists the values of the patterns that run that segment in that interval, and a disagreement is highlighted. Rows line up by time, but the table is denser.
- Option C, segment drill-down: pick one segment and see a small pattern × band table. Good for one segment, poor for an overview.
- **Recommendation: A, with a toggle to B ("Align by time").** A matches how planners read runtimes. B is the honest comparison when boundaries differ. Both views share one discrepancy rule. Both views offer **Use this value for…** on a cell, which writes through the existing segment-plan preview, apply, and undo path. That makes this view the reconciliation feature, not only a display.

## 3. Work packages

Capability classes follow `AGENTS.md`: structural (Luna) and UI design (Sol). The structural packages land first. Between P3 and P4 there is a user-verification gate.

### P1 — Regenerate review returns every trip's outcome (structural, Luna)

- `previewRecalculateTrips` no longer throws for per-trip problems. It returns one outcome per trip: `ready`, `needsChoice` (with band choices), or `error` (with findings and, from P2, a diagnosis). It still throws for whole-request problems, such as missing trips.
- New input `skipTripIds`. Skipped trips are not recalculated. They still count in the block-connection review as unchanged neighbors.
- `applyRecalculationPreview` writes only `ready` trips that are not skipped, rechecks the preview signature as today, and refuses when nothing is left to write. The undo slot (Decision 0046) holds only the trips written.
- Acceptance: three problem trips among fifty are all reported in one review. The other forty-seven show new times and can be applied in one action. Skipped trips are unchanged in storage and are not in the undo snapshot.

### P2 — Anchor diagnosis (structural, Luna)

- New pure function `diagnoseAnchor(trip, pattern, profile, anchorIndex)` in `src/domain/trips.ts`, or in a new `src/domain/anchorDiagnosis.ts`. It returns:
  - the nearest reachable anchor times before and after the saved one, each with its first departure and signed difference ("arrives 6:07:59, −1:01, departing 5:59:59");
  - the band boundary that causes the gap, and each segment's runtime change across it ("A→B +2:00, B→C +0:30");
  - the smallest move of that boundary that makes the saved anchor reachable ("move AM Peak start from 6:00 to 5:58"), and how many other trips on the profile that move would change;
  - whether *First departure* resolves the trip. It always does unless the trip has no first departure.
- New parameterized message keys, for example `trip.anchorGap` with `{ anchorName, anchorTime, boundaryTime, earlierArrival, laterArrival }`. `userMessage` formats them as `trip.regenerationBlockOverlap` does now.
- Acceptance: unit tests for an increasing boundary (gap), a decreasing boundary (ambiguity), a gap that adds up over several segments, single-band too far, and blended. Each test checks the nearest solutions to the second.

### P3 — Change pattern outcomes and skip (structural, Luna)

- `previewBatchPatternChange` returns, per trip, the label data (pattern short name and first departure), old and new stop times, the run-time change, layover connections (reuse `calculateRecalculationConnections`), status, band choices, and the P2 diagnosis.
- Inputs `skipTripIds`, a per-trip anchor node, and per-trip chosen bands.
- `applyBatchPatternChange` changes only ready, non-skipped trips, signs the included trips, and keeps `kind: 'patternChange'` undo (Decision 0070) for the trips written.
- The single-trip path (`previewTripPatternChange` / `changeTripPattern`) becomes a one-trip call of the same command. Its signed review (target pattern, trip, and target profile) is kept.
- Acceptance: the existing pattern-change unit tests still pass. A batch with one ineligible trip applies to the others when that trip is skipped.

**Verification gate:** the user reviews the P1 to P3 behavior through unit-test summaries before P4.

### P4 — Shared trip review table (UI design, Sol)

- One component, `TripReviewTable`, used by `RecalculationDialog`, `BatchPatternChangeDialog`, and `TripPatternChangeDialog`.
- Columns: Trip (pattern short name · first departure, which is the label the user asked for), Status, Anchor, Fixed time, First change, Last change, Run time change, Layover change, Action.
- The Action select per row holds only the options that apply to that row:
  - *Regenerate* (or *Change pattern*). This is the default on ready rows.
  - *Keep 6:07:59 (−1:01)* and *Keep 6:10 (+0:59)*, from the P2 nearest solutions.
  - *Use first departure*.
  - *Choose band: …*, for one-band-per-trip profiles only (the Decision 0031 addendum is unchanged).
  - *Skip — leave unchanged*.
- An error row shows its diagnosis in the row as one sentence, for example "Keeping 104th Ave at 6:09 is not possible: the runtime from Wagon Road rises 2:00 at the 6:00 band start. Nearest: 6:07:59 or 6:10." A **Details** disclosure shows each segment's change across the boundary and the boundary move, with "Open runtimes" to go to the Runtimes editor.
- Header bar: "48 trips · 45 ready · 3 need attention", with **Skip all trips with errors** and the existing bulk anchor buttons.
- Footer: the primary button counts what it will change and is enabled when at least one row will change.
- Acceptance: keyboard reachable (each Action select, Details, and the bulk buttons); axe clean in `keyboard.spec.ts`; one visual pattern across all three dialogs; at 500 trips the review stays under one second, as the U08 capacity limit requires.

### P5 — Changed-trip marker (UI design, Sol; may be structural if the user picks D3 Option A)

- View state only. Nothing is stored or backed up.
- Set after Shift commit, Regenerate apply, Change pattern apply, Undo, start-time edit, and Add trip. Cleared by the next such action, by **Clear marks**, or by a change of Day, Direction, or Trip Profile.
- The D3 Option B rules as listed in section 2. When a changed trip is no longer in the visible Day or Direction, the status line says so ("2 changed trips are now in another direction").
- Acceptance: a browser spec shifts a trip so it moves past five rows and finds it marked and in view. A 40-trip regeneration shows the status line, and **Next ↓** scrolls to each marked row in turn. With reduced motion requested there is no animation.

### P6 — Fill and Copy fixes (P6a structural, Luna; P6b UI design, Sol)

- **P6a** (does not depend on D4):
  - Band ranges show seconds when they are not zero (finding 1.5.2).
  - Skips for a profile on other service days only, for no shared segment (`noMatchingSegment`, now produced), and for a source cell of `:00`.
  - In each `bandMismatch` entry, the nearest band of the other profile ("6:00:30–10:14:30 has no exact match; nearest 5:47–9:58").
- **P6b**, if D4 is C: the band map in the Fill and Copy dialogs. Matching moves from `sameBand` to an input `bandPairs` that defaults to the largest overlap above half. A new decision record amends Decision 0049.
- Acceptance: the golden project fill probe (every profile set to `:00`, then filled) fills cells once the bands are paired. A unit test covers each new skip reason.

### P7 — Runtime comparison and reconciliation (UI design, Sol, with a structural part for the discrepancy model)

- Structural part: a pure `compareRouteRuntimes(direction, patterns, profiles, assignments, serviceDayId)` that returns the shared segment axis, the clock intervals, each cell's values per pattern, and discrepancies. It reuses `segmentKeys`.
- Entry: Runtimes **Actions → Compare patterns…**, a wide modal or a full-width panel below the Runtimes editor. Sol chooses.
- Mock-up, Option A (stacked):

```text
Compare runtimes · Southbound · Weekday            [Align by time ☐]
                 WR→112 112→104 104→WS  WS→CC  CC→32  32→Dec ...
Wagon Rd–Evans
  0:00–5:47       :04    :03    :05     :06    :07    :05
  5:47–9:58       :05    :04    :06    [:08]   :09    :06
Westm.–Englewood
  0:00–6:00:30     ·      ·      ·      :06    :07    :05
  6:00:30–10:14    ·      ·      ·     [:07]   :09    :06
```

- Mock-up, Option B (aligned by time):

```text
                  WS→CC              CC→32
5:47–6:00:30      WR–E :08 · W–E :06 ⚠   WR–E :09 · W–E :07 ⚠
6:00:30–9:58      WR–E :08 · W–E :07 ⚠   :09 (all)
```

- On a highlighted cell, **Use this value for…** lists the patterns. It writes through the segment plan preview, apply, and undo path that P6b extends.
- Acceptance: Sol mock-up gate before the build; axe clean; no storage change.

### Verification per package

| Package | Run | Skip | Do not cut |
| --- | --- | --- | --- |
| P1 | `pnpm typecheck`; `tripGenerationService.test.ts`, `authoritativeTripService.test.ts`, `tripAnchorGeneration.test.ts`; full unit suite at the end | Browser suite (no UI change) | Existing regeneration-undo tests |
| P2 | `pnpm typecheck`; `tripAnchorGeneration.test.ts`, `tripPatternChangeAnchor.test.ts`, the new diagnosis tests; full unit suite | Browser suite | Existing anchor tests |
| P3 | `pnpm typecheck`; `serviceDayCopy.test.ts`, `tripPatternChangeAnchor.test.ts`, `tripGenerationService.test.ts`; full unit suite | Browser suite | Pattern-change undo tests (Decision 0070) |
| P4 | typecheck; build; full unit suite; `recalculation-capacity`, `anchored-pattern-change`, `pattern-change-undo`, `unified-action-layer`, `trips-runtime-presentation`, `impact-dialogs`, `keyboard`, `draggable-dialogs` specs; visual inspection | Blocking and Costing specs | Capacity spec (500 trips) |
| P5 | typecheck; build; full unit suite; `moved-row-marker`, `shift-drawer`, `trips-table-display`, `trip-table-layout`, `trips-layout`, `trip-start-edit`, new marker spec; visual inspection | Blocking and Costing specs | `shift-drawer` scroll retention |
| P6a | typecheck; `segmentRuntimeMatching.test.ts`, `segmentRuntimeService.test.ts`; full unit suite; `segment-runtime-fill` spec | Other browser specs | Existing fill and copy tests |
| P6b, P7 | typecheck; build; full unit suite; `segment-runtime-fill`, `runtime-grid`, `runtime-table-layout`, `keyboard` specs; visual inspection | — | Segment undo tests |
| Closeout | Full browser suite | — | Full browser suite |

## 4. Recommended order

1. P6a (small and independent; fixes the misleading Fill dialog now).
2. P1, P2, P3, then the user gate.
3. P4.
4. P5.
5. P6b and P7, after D4 and D5 and a Sol mock-up gate.
