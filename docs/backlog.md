# Feature Backlog

Ideas that are not yet planned. An entry here is not approved work: when one is picked up, it gets a decision record in `docs/decisions/` and an implementation plan in `docs/implementation/`, and its entry here links to them.

Each entry lists the problem, the proposed approach, open choices, and the edge cases found so far.

| Entry | Area | Status |
| --- | --- | --- |
| [Planned frequencies](#planned-frequencies) | Route, Trips, Costing | Implemented 2026-11-05: Decision 0058, `docs/implementation/planned-frequencies-closeout.md` |
| [Auto-shift to a consistent frequency](#auto-shift-to-a-consistent-frequency) | Trips | Proposed; would use Planned frequencies as its periods |
| [Per-route cost breakdown and factors](#per-route-cost-breakdown-and-factors) | Costing | Planned 2026-11-12: Decision 0077, `docs/implementation/route-cost-breakdown.md` |
| [Costing by service day across routes](#costing-by-service-day-across-routes) | Costing | Proposed 2026-11-12; follows the per-route breakdown |
| [Multi-route interlining](#multi-route-interlining) | Blocking, Costing | Proposed 2026-11-12; not needed for the current scenario |
| [Year-varying service](#year-varying-service) | Scenario, Costing | Idea 2026-11-12; beyond current scope |

---

## Planned frequencies

- Implemented: 2026-11-05 (see `docs/implementation/planned-frequencies-closeout.md`; the text below is the original proposal, and Decision 0058 governs where they differ)
- Proposed: 2026-11-05
- Area: Route (new table), Trips (Build trips, comparison), Costing (later)
- Rules: `docs/decisions/0058-planned-frequencies.md` (governs where this entry differs). Plan: `docs/implementation/planned-frequencies.md`.

### Problem

A planner knows the intended service plan (for example 6:00–8:00 every 30, 8:00–19:00 every 15, 19:00–24:00 every 30) before building trips, and it often differs by service day. Today the plan lives outside the tool: Build trips takes one headway at a time, and nothing says whether the built trips still follow the plan after shifts and edits.

### Principles

- The plan is an optional target, never a constraint. Trips can be built and edited outside it; nothing is refused or blocked because of it.
- The plan is stored; the comparison with built trips is derived and never stored (as with runtime changes and costs).

### Data

New record `PlannedFrequency`, one per Route × Service day:

- `scenarioId`, `routeId`, `serviceDayId`;
- `periods: { startTime, endTime, headwaySeconds }[]`: service seconds, start inclusive, end exclusive, 24-plus times allowed; periods must not overlap; a gap between periods means no planned service;
- `measureNodeIdByDirectionId`: the node where frequency is measured for each direction. Default: the first timepoint column of the direction. It matters for the Federal patterns, where one pattern's first stop is another's mid-route stop.
- Directions share the periods by default. A per-direction override is a later option.
- Not per Trip Profile: Trip Profiles are alternative timetables compared against one plan.
- **Owned by the Scenario, not shared across Scenarios** (user decision 2026-11-05). Routes and service days are already Scenario records, so the plan cannot outlive them; Decision 0051 rejected live links between Scenarios; and a Scenario that tests a different service level needs its own plan. Duplicating a Scenario copies the plan, so carrying a plan forward is the copy, not a link.

Dependencies: Dexie version 10 (new table), JSON backup schema 10 with older versions still readable, Scenario duplication and import-as-copy remapping of route and service-day IDs, Route deletion cascade, and service-day deletion review counts (Decision 0041).

### Route screen

- A **Planned frequencies** panel to the right of Annual service days. `.route-top-grid` goes from two columns to three at standard widths (Route details, Annual service days, Planned frequencies) and still collapses to one column below 1100 px (`responsive.css`).
- Laid out like Runtimes: a **Service day** menu button (like Runtime profile) and an Actions menu with **Copy from another day…** (preview, then replace) and **Clear**.
- Rows: From | To | Headway | Trips/hour (derived) | delete; **+ Add period**. Headway accepts minutes or minutes:seconds (7:30), the same parser as Build trips.
- Each row shows a quiet built status for the selected day: a check mark when the built trips match within tolerance, otherwise a short note ("14 of 16 trips").

### Build trips

- The Build trips drawer gets a mode switch: **One headway** (today) | **From planned frequencies**.
- From planned frequencies: choose a pattern and the periods to build (all checked by default). Slots are `period start + k × headway`, end exclusive, at the measure node. A preview lists the trip count per period and existing trips that would duplicate a slot (the duplicate-departure check exists).
- Building stays additive (existing trips untouched), and it is never required.
- **Dependency:** generation today places the first trip time at the pattern's first stop (`GenerateTripsRequest.firstTrip`). Building at a mid-route measure node needs generation to accept an anchor point and back-calculate earlier stops, as Regenerate already does (`recalculateTripWithAnchor`).
- Later option: alternate patterns within a period (for example every other trip to Littleton).

### Planned vs built comparison

Measured per Route, Service day, direction and Trip Profile at the measure node, merging every pattern that serves it.

- **Tolerance** keeps the 5:55-instead-of-6:00 case quiet:
  - the first and last trips of a period may fall within ± half the headway of the period edges;
  - a gap matches within ± 1 minute or 10 % of the headway, whichever is larger;
  - the period's trip count matches within ± 1.
- **Per-period status:** Matches, Differs (with a reason: extra trips, missing trips, gaps off, edge shifted beyond tolerance), or No trips.
- **Trips screen:** one small chip in the Trips header ("Plan: matches" / "Plan: 2 periods differ"). It opens a popover with Planned vs Built per period. When the headway column is shown, gaps out of tolerance get a subtle marker. No banners and no validation findings.
- **Route screen:** the per-row status in the Planned frequencies panel.

### Connections to other features

- **Auto-shift:** the plan supplies its periods and headways, so auto-shift becomes "conform to plan". The measure node is the anchor node.
- **Costing:** Decision 0051 rejected a headway-based estimate. A plan makes a later "planned trips × runtime" estimate possible before trips exist (not in the first build).
- **Blocking:** planned headway with cycle time gives a quick vehicle check against Peak vehicles (later).
- **Service day copy** (trips and blocking): copying trips does not copy the plan; the plan has its own Copy from another day.
- **Trip Profiles:** the comparison is per profile, so alternatives can be checked against the same plan.

### Suggested packages

1. Decision record (data, tolerance, ownership).
2. Domain: types, period validation, slot generation and the comparison function, with unit tests (structural).
3. Persistence: table, backup schema 10 round trip, Scenario copy remapping, deletion (structural).
4. Route screen panel and copy between days (UI design).
5. Build trips mode, including anchor-point generation (structural service, UI design drawer).
6. Comparison chip, popover and headway markers (UI design).

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

---

## Per-route cost breakdown and factors

- Proposed: 2026-11-12
- Area: Costing (Cost breakdown table, Estimate factors, Cost Summary and export)
- Rules: `docs/decisions/0077-per-route-cost-breakdown-and-factors.md` (governs; the open decisions below are resolved there). Plan: `docs/implementation/route-cost-breakdown.md`.

### Problem

Costing is scenario-wide: every Route's Trips (estimated basis) or Blocks (blocking basis) are summed. The Cost breakdown table has one row per service day, so the planner cannot see which Routes drive cost. Estimate factors (layover %, deadhead %) are per Trip Profile and service day, not per Route.

### Agreed design (user, 2026-11-12)

1. **Replaces the by-service-day table.** The new table has one row per Route plus Total, with the existing Cost breakdown columns. A by-service-day view across Routes is a separate entry ([Costing by service day across routes](#costing-by-service-day-across-routes)).
2. **Expandable rows.** Selecting a Route expands its service-day rows in place, below the Route row.
3. **Stable columns.** Expanding or collapsing never changes column widths or positions: fixed table layout, indentation inside the first cell only, a toggle space reserved in every Route row, right-aligned tabular numbers. A browser test measures column positions before and after expanding.
4. **Single Route.** The Route row is expanded by default.
5. **Expanded state** is remembered. The Expand all control is discreet.
6. **Year columns** stay as they are.
7. **Per-route estimate factors.** A Route selector next to the Estimate factors title (All routes, then each Route) replaces the subtitle text "Trip profile X · shared scenario factors" / "blank days use All days". Inherited cells stay visibly distinct from values entered for that Route.

### Open decisions

- Factor fallback order, for example: Profile + Route + day → Profile + Route All days → Profile + day → Profile All days → Scenario shared.
- Whether per-route factors are owned by the Trip Profile (as factors are now, Decision 0062) or by the Scenario.
- Blocking basis: block-level hours (pull-out, pull-in, deadhead) go to the Block's Route; a multi-route Block gets a validation finding and an Unattributed row until [Multi-route interlining](#multi-route-interlining) sets the rule.
- Whether the Route row shows unassigned Trips (blocking basis costs only Trips in Blocks, and the Blocking screen lists unassigned Trips for the selected Route only).
- Route row order: by name or by annual cost.
- Whether the Cost Summary and CSV/ZIP report gain the Route table in the same effort.

### Suggested packages

1. Decision record: factor ownership and fallback, Route attribution, Unattributed row.
2. Domain, persistence, migration, backup schema bump, and costing grouped by Route, with tests that Route rows sum to the scenario total (structural).
3. Route comparison table and factor Route selector (UI design).
4. Cost Summary and report output (structural).

---

## Costing by service day across routes

- Proposed: 2026-11-12
- Area: Costing

The per-route breakdown replaces the by-service-day table. A way to see scenario-wide totals per service day (a grouping toggle, or a summary row set) is decided after the per-route table is in use.

---

## Multi-route interlining

- Proposed: 2026-11-12
- Area: Blocking, Costing

Today the Blocking screen lists unassigned Trips for the selected Route only (`listUnassignedTrips(blockingScenarioId, serviceDayId, routeId)`), Phase 4 does not create multi-route Blocks, and existing multi-route Blocks are shown in full with other-route Trips flagged.

Plan:

1. Decision record for costing attribution: deadhead between Trips of different Routes (preceding Trip, following Trip, or split); pull-out and pull-in on a multi-route Block (proportional to Revenue hours, or first and last Trip's Route); the Unattributed row.
2. An All routes option for the Unassigned trips panel, with a Route column and filter.
3. Deliberate multi-route assignment in Blocking.
4. Interlining assistance (see Phase 6 in `architecture_overview.md`).

---

## Year-varying service

- Idea: 2026-11-12
- Area: Scenario, Costing

Costing assumes the same service in every forecast year; only the rate escalates. A real plan may change one Route in year 3 and leave another unchanged. Supporting this needs a temporal model (for example, a Trip Profile or Route service level per year range) and is beyond current scope. Until then, separate Scenarios model each service stage.
