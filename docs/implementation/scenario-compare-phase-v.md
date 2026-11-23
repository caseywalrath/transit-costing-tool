# Scenario comparison (phase V) — plan

> **Status:** Approved 2026-11-22: gates G-V1 to G-V9 and mock-up questions A to C answered as recommended. Sitting 1 (V0) done: Decision 0091, cards `scenario-compare-phase-v-cards.md`, worked example `tests/fixtures/scenario-compare/`. Sitting 2 (V1, V2) done. Sitting 3 (V4, the tab) done. Next: sitting 4 (V5, V6). V-V is a later checkpoint.
>
> **Parent plan:** `docs/implementation/gtfs-interoperability.md`, Part 6 "V". This file expands that section. The parent's fixed decisions (Part 8) and run rules (Part 7) apply unless this file says otherwise.
>
> **Origin:** old C3 in the deferred plan. The comparison comes first; the blocks timeline and Marey chart are left for a later phase (Part 1.4).
>
> **Where the work happens:** only in this repository, on branch `claude/dazzling-tesla-znfnl8`.

---

## Summary

**Goal:** show what changes between two versions of service ("existing vs proposed") in one place: trips, revenue miles, revenue hours, span, peak vehicles and cost, route by route, with the totals for the whole system.

**What the planner does:**
1. Opens a new **Compare** tab, the fifth tab after Costing.
2. Picks a **Baseline** and a **Proposed** side. Each side is a Scenario with its Trip profile and Blocking scenario; both sides can be the same Scenario with different profiles.
3. Picks a day: Weekday, Saturday, Sunday, a custom day, or Annual.

The tab then shows:
- a totals strip;
- a route table, grouped by Changed, New, Discontinued and Unchanged;
- a route detail with span and headways by time of day;
- a **Download CSV** button.

The comparison never changes either Scenario.

**Main use:** the baseline comes from a GTFS import (phase I), and the proposal is a copy of it that the planner edits.

**Not in this phase:**
- more than two sides;
- matching renamed or split routes by hand (backlog);
- maps;
- ridership;
- the blocks timeline and the Marey chart;
- printing (the CSV covers sharing for now);
- interlined cost split per route (phase X).

---

## Part 1 — Starting

### 1.1 Findings from the code (checked 2026-11-22)

| Finding | Where | Matters for |
|---|---|---|
| Costing computes, per service day and per Route: trips, running, revenue and platform hours, annual hours, and cost by year. It has two bases: blocked and estimated. | `src/domain/costing.ts` (`calculateCosting`, `CostingDailyResult`), `routeCosting.ts` (`CostingRouteResult`), `estimatedCosting.ts` | Reused for both sides; most figures need no new math |
| Multi-route blocks get an Unattributed row (Route ID null) | `costSummary.ts` (`UNATTRIBUTED_ROUTE_NAME`) | Its own row in the comparison, so totals add up |
| Costing settings (rate, rate year, escalation, first year, estimate factors) are stored per Scenario | `CostingAssumptionsInput` | Gate G-V4 (whose rates) |
| Annual counts: Scenario counts, or the Route's own counts | `ownOrScenarioCount` (`costing.ts`) | Gate G-V3 (whose counts) |
| Peak vehicles exists only in auto-blocking (`peakVehicles`, the most blocks running at once). Costing does not report it. | `src/domain/autoBlocking.ts` | Gate G-V6; small new domain function reusing it |
| Revenue miles and span are not in Costing results | Trips and patterns | New, from trips and pattern miles |
| Matching fields on Routes: `gtfsRouteId`, short name, name | `src/domain/types.ts` | Gate G-V2 |
| Costing takes about 9 s on a whole RTD Scenario (backlog) | Closeout of phase I | Both sides run in a worker, with progress; Risk 1 |
| Tabs: `ActiveTab = 'route' \| 'trips' \| 'blocking' \| 'costing'` | `src/ui/App.tsx:45` | New `'compare'` value |

### 1.2 Inputs from the Analysis app

None. Comparing in the Analysis app (coverage and Title VI of two feeds) uses the phase E export and is the Analysis app's own work.

### 1.3 Steps when the user approves this draft

1. Record the gate answers in Part 7 and the mock-up answers in Part 4.
2. V0: decision record `docs/decisions/0091-scenario-comparison.md`, the sub-plan with work cards, and a test fixture.
3. The orchestrator runs the sittings in Part 5.

### 1.4 Later (not gated)

- **Blocks timeline:** blocks as bars across the day, for one side or both.
- **Marey chart:** a time-distance chart of every trip on one route.

Both can come after the comparison or be dropped. They would get their own small plan.

---

## Part 2 — Measures

All measures are for the chosen day. "Annual" multiplies each day by its annual count and adds the days up. Each measure is computed the same way on both sides, under the rate and count choices in the header.

| Measure | Definition | Source |
|---|---|---|
| Trips | Revenue trips of the Route on that day | Costing (blocked) or Trips (unblocked) |
| Revenue miles | Sum of each trip's pattern miles | New: pattern cumulative miles |
| Revenue hours | As Costing defines them on that side's basis | Costing |
| Platform hours | As Costing | Costing (in the CSV and the route detail only) |
| Span | First departure to last arrival, per direction | New: trips |
| Peak vehicles | Most blocks in service at once (G-V6) | `peakVehicles` on block intervals |
| Annual cost | First service year cost, at the rate chosen in the header (G-V4) | Costing year rows |
| Headway by period | Average gap between departures at the first timepoint, per direction and period (G-V7) | New: trips |

**Change** = Proposed − Baseline, and **%** = change ÷ Baseline. When the baseline is 0 or missing, the % shows "—".

### 2.1 Route status

| Status | Rule |
|---|---|
| New | Only on the Proposed side |
| Discontinued | Only on the Baseline side |
| Changed | On both sides, and any shown measure or the headway grid differs |
| Unchanged | On both sides, and every measure is equal (to the minute or 0.01 mile) |

The Unattributed row is always shown when either side has one.

---

## Part 3 — Comparison rules (to become Decision 0091)

1. Read only. Neither Scenario changes. The tab's choices are remembered on the device only (G-V8).
2. Each side is a Scenario, a Trip profile and an optional Blocking scenario. They default to the Blocking scenario that Costing uses for that profile (Decision 0081).
3. Routes are matched across the sides by GTFS route ID, then short name, then name, ignoring case. Each Route is used at most once; if a key matches more than one Route, those Routes are not matched and are listed (G-V2).
4. Both sides use one rate (G-V4) and one set of annual counts (G-V3), chosen in the header. A mismatch is stated in a warning line.
5. A side's basis is the Costing basis saved for its Scenario and profile. When the two bases differ, the warning line says so (G-V5).
6. Peak vehicles appear only for a side with a Blocking scenario; otherwise "Not blocked", never 0 (G-V6).
7. The CSV holds every Route (Unchanged too) for the chosen day, both sides, change and %, with a heading block naming the two sides and the rate and count choices.

---

## Part 4 — The Compare tab (mock-up for package V3)

**Mock-up:** `docs/implementation/scenario-compare/mockup.html` (five frames, numbered notes).

1. **Header:** the Baseline and Proposed pickers side by side, a ⇄ button to swap them, the Day switch, and the Rates and Counts menus.
2. **Warning line:** shown only when the sides differ in rates, counts or basis, or when a side is not blocked.
3. **Totals strip:** four tiles (trips, revenue hours, peak vehicles, annual cost), each showing baseline → proposed and the change.
4. **Route table:**
   - a filter by status, sorting, a search box and Download CSV;
   - a bar showing the size of each change in hours;
   - Unchanged routes folded into one row.
5. **Route detail:** opens in place, one route at a time. It shows span, the headway grid, miles and platform hours, and links to the Trips and Costing tabs.
6. **While calculating:** "Costing baseline… 62 of 130 routes". Each side fills in when its calculation is done.
7. **Narrow window:** the sides stack, and the table keeps Route, Status, Rev hrs and Annual cost.

**Questions on the mock-up** (answer with the gates):
- **A. Bars in the table:** keep the small change bar in the Rev hrs column (recommended), or numbers only?
- **B. Unchanged routes:** fold them into one row (recommended), or list them with the rest?
- **C. Sort default:** largest hours change first (recommended), or route order as in Costing?

---

## Part 5 — Packages

Run rules: as in the parent plan, Part 7.

| Package | What | Class / model | After |
|---|---|---|---|
| V0 | Decision 0091, sub-plan with cards, fixture: two small hand-worked Scenarios with expected comparison figures | Opus | Gate answers |
| V1 | Pure domain `src/domain/compare/`: route matching, measures (miles, span, peak, headway by period), the change table, status, CSV text | Structural / Haiku `xhigh` | V0 |
| V2 | Application `src/application/compare/`: run Costing for both sides with the chosen rates and counts, in a worker with progress, with a fallback on the main thread; recompute only the side that changed | Structural / Sonnet | V1 |
| V3 | Mock-up approval (the draft is in this sitting) | Opus | — |
| V4 | Compare tab: header, warnings, totals, table, detail, CSV, choices remembered on the device, narrow layout | UI / Sonnet | V2, V3 |
| V5 | Scale: RTD import vs a copy with three edited Routes (timed); results checked against the Costing tab on each side | Structural / Haiku; Opus judges | V4 |
| V6 | Closeout: docs, backlog, full browser suite, code review at high effort | Opus | V5 |

Sittings:
1. V0.
2. V1 and V2.
3. V4.
4. V5 and V6.

### Verification per package

| Package | Run | Never cut |
|---|---|---|
| V1 | Unit tests; expected figures on the fixture; `pnpm typecheck`; full `pnpm test` | Fixture figures |
| V2 | Unit tests; a check that each side's totals equal a direct Costing call with the same settings | Equality with Costing |
| V4 | New `tests/ui/compare.spec.ts`; `keyboard.spec.ts` (axe); tab tests; `pnpm build`; screenshots at desktop and phone width inspected | Typecheck, build |
| V5 | RTD timing (target: both sides within 20 s, the page responsive throughout); the three edits show as Changed with the right signs; 127 Routes Unchanged | Equality with the Costing tab |
| V6 | Full `pnpm test:ui` | Full run |

---

## Part 6 — Fixed decisions

Inherited from the parent plan, Part 8 (D1 to D13, notably D6 hour vocabulary, D12 no new libraries, D13 no silent number changes).

Added:
- **V-D1:** the comparison is read only.
- **V-D2:** each side's figures equal what the Costing tab shows for that Scenario under the same rate and count choices. The comparison never has its own version of Costing math.

---

## Part 7 — Gates

**Gate G-V1 — What can be compared**
Question: what is a "side"?
- Option A (recommended): a Scenario plus a Trip profile plus an optional Blocking scenario. Both sides may be the same Scenario.
- Option B: whole Scenarios only, each with its default profile.
Example: "RTD Nov 2026 / Base / Feed blocks" vs "Network Redesign v2 / Base / Draft blocks", or "Redesign v2 / Base" vs "Redesign v2 / Added frequency".
What changes: A covers both "existing vs proposed" and "option vs option" in one tool.
If you say "your call": Option A.

**Gate G-V2 — Matching routes**
Question: how does the tab know that two Routes are "the same route"?
- Option A (recommended): automatically, by GTFS route ID, then short name, then name. Unmatched Routes are New or Discontinued. Pairing by hand goes to the backlog.
- Option B: automatic matching plus a "Match with…" picker now, remembered per Project (a data change).
Example: route "15" in the import and its edited copy match by route ID. If the planner splits 15 into 15A and 15B, A shows 15 as Discontinued and 15A and 15B as New, and the totals are still right.
If you say "your call": Option A.

**Gate G-V3 — Annual day counts**
Question: the two sides may count days per year differently (feed counts on the import, the Scenario calendar on a planner's copy). Whose counts apply?
- Option A (recommended): the baseline's for both by default, with a menu: "Baseline's", "Proposed's", "Each side's own". A warning line appears when the sides differ.
- Option B: each side's own, always, with a warning line.
Example: Weekday 251 on the import, 255 on the copy. Under B, a copy with no edits shows +1.6% annual hours.
If you say "your call": Option A.

**Gate G-V4 — Cost rates**
Question: the two Scenarios may have different hourly rates or escalation. Which apply?
- Option A (recommended): the baseline's for both by default, with the same three-way menu as G-V3. A different-rates warning line appears when they differ.
- Option B: each side's own.
What changes: A shows the cost of the service change alone; "Each side's own" shows rate and service together.
If you say "your call": Option A.

**Gate G-V5 — Blocked and estimated bases**
Question: Costing can work from blocks or from estimate factors. What if the sides differ?
- Option A (recommended): each side uses its own saved basis, and the warning line says "Baseline from blocks, Proposed estimated". The figures are still shown.
- Option B: refuse to compare until both sides use the same basis.
If you say "your call": Option A.

**Gate G-V6 — Peak vehicles**
Question: how are peak vehicles counted?
- Option A (recommended): the most blocks in service at once on that day. For each Route, its own blocks; for the system, all blocks. Not added up across routes, because they peak at different times. "Not blocked" for a side without a Blocking scenario.
- Option B: the most trips in service at once (works without blocks, but ignores layovers).
What changes: A matches how agencies size fleets. The system figure is less than the sum of the rows, and the table says so.
If you say "your call": Option A.

**Gate G-V7 — Time periods for headways**
Question: the route detail shows headways by time of day. Which periods?
- Option A (recommended): fixed periods by first-timepoint departure:
  - Early before 6:00;
  - AM peak 6:00–9:00;
  - Midday 9:00–15:00;
  - PM peak 15:00–18:00;
  - Evening 18:00–21:00;
  - Night from 21:00.
  
  Each period shows its average gap, rounded to the half minute, or "—" with fewer than two trips. Editable periods go to the backlog.
- Option B: periods set per Project now (a data change).
If you say "your call": Option A.

**Gate G-V8 — Remembering the choices**
Question: should the tab remember the last sides and day?
- Option A (recommended): yes, on this device only, per Project (like other view preferences). Nothing is stored in the Project or its backup.
- Option B: stored in the Project, so a backup restores it (a schema change).
If you say "your call": Option A.

**Gate G-V9 — Where the tab sits**
Question: Compare is about the whole Project, not one Route. Where does it go?
- Option A (recommended): a fifth tab after Costing. It is available whenever the Project has a Scenario with trips, and it ignores the selected Route.
- Option B: a full-screen dialog opened from the Project menu.
If you say "your call": Option A.

### Gate register

| Gate | Topic | Recommendation | Answer | Date |
|---|---|---|---|---|
| G-V1 | Sides | A: Scenario + profile + blocks | Approved as recommended | 2026-11-22 |
| G-V2 | Matching | A: automatic only | Approved as recommended | 2026-11-22 |
| G-V3 | Day counts | A: baseline's, with menu | Approved as recommended | 2026-11-22 |
| G-V4 | Rates | A: baseline's, with menu | Approved as recommended | 2026-11-22 |
| G-V5 | Bases | A: own basis, warned | Approved as recommended | 2026-11-22 |
| G-V6 | Peak vehicles | A: blocks at once | Approved as recommended | 2026-11-22 |
| G-V7 | Periods | A: fixed six | Approved as recommended | 2026-11-22 |
| G-V8 | Remembering | A: on the device | Approved as recommended | 2026-11-22 |
| G-V9 | Placement | A: fifth tab | Approved as recommended | 2026-11-22 |
| Mock-up A–C | Bars, folding, sort | As recommended | Approved as recommended | 2026-11-22 |
| V-V | User check: compare the RTD import with an edited copy | Before closeout | | |

---

## Part 8 — Risks

1. **Speed.** Two whole-feed Costing runs take about 18 s today. The worker keeps the page usable, but the backlog item for Costing speed becomes more valuable. V5 measures it.
2. **False changes.** Different counts, rates or bases make unchanged service look changed. The header menus and warning line are the guard; the V5 check of 127 Unchanged Routes tests it.
3. **Matching surprises.** Two Routes with the same short name (for example "Shuttle") will not match. Rule 3 lists them rather than guessing.
4. **Peak vehicles across routes.** Planners may add up the column; a note under the table says the system peak is lower.
5. **Interlined blocks.** Per-route vehicles can move to or from the Unattributed row without a real change, until phase X.

---

## Progress log

### 2026-11-22 — Draft (Opus)

Plan and mock-up written. Waiting for gate answers G-V1 to G-V9 and mock-up answers A to C.

### 2026-11-22 — Gates answered (user)

G-V1 to G-V9 and mock-up questions A to C: approved as recommended.

### 2026-11-22 — Sitting 1: V0 (Opus)

Decision 0091, cards V1 and V2, and the worked example written. Two refinements from the code, recorded in 0091:
- The basis follows the side's Blocking choice (item 2), since Costing's basis is a device preference, not stored per Scenario.
- Peak vehicles use Blocking's existing peak pull-out rule (item 12).

Also fixed: status ignores peak and cost (item 15), and a matched Route shows the Proposed name.

### 2026-11-22 — Sitting 2: V1 (Haiku), V2 (Sonnet); Opus review

The domain rules and the service are built. Decision 0091 items 12 and 14 were clarified. 2,497 unit tests pass.
