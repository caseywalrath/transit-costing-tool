# Feature Backlog

Ideas that are not yet planned. An entry here is not approved work: when one is picked up, it gets a decision record in `docs/decisions/` and an implementation plan in `docs/implementation/`, and its entry here links to them.

Each entry lists the problem, the proposed approach, open choices, and the edge cases found so far.

| Entry | Area | Status |
| --- | --- | --- |
| [Auto-shift to a consistent frequency](#auto-shift-to-a-consistent-frequency) | Trips | Proposed |

---

## Auto-shift to a consistent frequency

- Proposed: 2026-11-05
- Area: Trips (Shift, Regenerate, Blocking impact)

### Problem

A planner builds trips around a consistent frequency at one timepoint. That timepoint is often the first, but may be mid-route, or a hybrid: on the Federal BRT test case one pattern's first stop is another pattern's mid-route stop. Today each trip must be shifted by hand.

### Proposed approach

Auto-shift is a staged Shift in which each trip has its own offset. It reuses the staged Shift preview, apply, stale check and undo/redo (`previewStagedTripShift`, `applyStagedTripShift`), the staged-shift row markers, and the headway column. New parts: a pure domain function that computes per-trip offsets, a staged operation holding per-trip offsets, and a setup panel.

1. **Anchor on a node, not a table column.** Both Federal patterns' trips align at a shared node (for example WSTMNST) into one combined frequency. Regenerate already anchors by node (`anchorByTripId`).
2. **Two methods.**
   - **Snap to clock:** each trip moves to the nearest slot of a grid defined by headway (7:30 / 15 / 30 / 60 min) and slot start (for example :05 / :20 / :35 / :50).
   - **Even spacing:** the first and last trips of a period stay fixed; trips between them are spaced evenly.
3. **Periods.** A From / To / Method / Headway / Slot start table, like runtime bands. A trip belongs to the period that contains its time at the anchor node before shifting, so a shift never moves a trip into another period. Start inclusive, end exclusive.

### Grid choice (snap to clock)

- No trip is the anchor by default. For each period the slot start is the best fit, searched in 30-second steps across one headway: fewest unplaced trips first, then least total movement, then the start that leaves the earliest trip unmoved. The preview names the chosen grid.
- Overrides: type a slot start, or pin a trip (its anchor time stays and the grid passes through it). Pinned trips that do not fit one grid are reported as a conflict.
- Even spacing: the first and last trips of each period are fixed; pinning another trip splits the period.

### Rules and edge cases

| Case | Rule |
| --- | --- |
| Trip does not serve the anchor node | Skip and report. |
| Two trips snap to one slot | Never stack or reorder trips. The later trip takes the next free slot in its own period; if that exceeds the maximum move, it is skipped and reported. |
| Large move | Maximum move, default half the headway; trips beyond it are reported. |
| More trips than the headway allows (example: trips change to 15 min at 7:00 but the setup says 8:00) | Place what fits; report the extra trips. Offer "Start 15-minute service at 7:00" (setup change, detected from existing gaps) and "Select the extra trips" (deleted through the existing Delete with its block review). Auto-shift never adds or deletes trips. |
| Fewer trips than the headway needs | Report empty slots; offer to move the period boundary. Adding trips stays with Add trip / Generate. |
| Mixed directions | Each direction computed separately, with its own anchor node. |
| After midnight | Slots continue past 24:00; no wrap. |
| Interlined connections | Broken connections are listed in the preview, not blocked. |
| Display rounding | Snap uses stored seconds, not displayed times. |
| Already aligned | Reported as aligned, not as zero-minute changes. Running auto-shift twice changes nothing (test this). |

### Runtime bands and regeneration

A shift keeps a trip's runtimes, so a trip moved into another band shows "Run times changed". Regenerating around the same anchor node keeps the anchor time, so the frequency survives. Proposal: an optional "Regenerate shifted trips around the anchor" checkbox in the same preview; trips that cross a band boundary under `segmentStart` are noted; no automatic repetition.

### At a glance, undo, blocking

- Headways measured at the anchor column, the anchor column marked, off-headway gaps and period transitions shown distinctly; a preview summary (trips moved, largest move, skipped, extra or missing trips per period).
- Undo: one staged operation in the existing undo/redo list; after saving, "Undo last auto-shift" works like "Undo last regeneration" (Decision 0046).
- Blocking impact in the preview: layovers below the minimum, overlaps within a block, broken connections, peak vehicles before and after. The Auto-blocking menu can rebuild blocks afterwards.

### Open choices

- Default method: snap to clock or even spacing.
- Default maximum move: half the headway.
- Whether "Regenerate around the anchor" is on by default.

### Suggested packages

1. Decision record (rules above).
2. Domain offset function and unit tests (structural).
3. Service: per-trip staged operation, preview with blocking impact, saved undo (structural).
4. Setup panel, anchor-column headway markers, preview summary (UI design).
5. Combined auto-shift and regenerate (follow-up).
