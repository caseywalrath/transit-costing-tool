# Decision 0091: Scenario Comparison

- Status: Accepted 2026-11-22 (gate answers in `docs/implementation/scenario-compare-phase-v.md`, Part 7: G-V1 to G-V9 and mock-up A to C, as recommended).
- Date: 2026-11-22
- Plan: `docs/implementation/scenario-compare-phase-v.md`; sub-plan and work cards `docs/implementation/scenario-compare-phase-v-cards.md`; mock-up `docs/implementation/scenario-compare/mockup.html`
- Related: Decisions 0051 (estimated basis), 0054 (cost summary), 0077 (Route rows, Unattributed), 0081 (Blocking scenario per Trip profile), 0089 (own counts)

## Context

An imported feed gives a baseline; a copy of it, edited, is a proposal. Planners need the difference, route by route, in trips, miles, hours, span, headways, vehicles and cost. Costing already computes hours and cost for one Scenario. The comparison must use that math rather than repeat it (plan V-D2), and must change nothing (V-D1).

## Decision

### A. Sides (G-V1, G-V9)

1. A Compare tab, the fifth tab, covers the whole Project and ignores the selected Route. It has two sides, Baseline and Proposed. Each side is a Scenario of the open Project, a Trip profile of that Scenario, and a Blocking scenario of that profile or "None". Both sides may name the same Scenario.
2. The Blocking scenario defaults to the one remembered for the profile (Decision 0081). A side with a Blocking scenario uses the blocked cost basis; a side with "None" uses the estimated basis with its Scenario's estimate factors. (This replaces the plan's "saved basis": Costing's basis choice is a device preference, not stored.)
3. Read only. The tab's choices (both sides, the day, the rate and count menus, filter, sort) are remembered on the device per Project (G-V8).

### B. Matching (G-V2)

4. Routes are matched by `gtfsRouteId`, then short name, then name, compared after trimming and ignoring case. Each key is tried in turn on the Routes still unmatched. A key value held by more than one Route on either side matches none of them at that step. Routes left over appear as Discontinued (Baseline only) or New (Proposed only). Routes skipped because of a repeated key are listed in a warning (`compare.ambiguousRoute`).
5. Service days are matched by kind for Weekday, Saturday, Sunday and Holiday (the first of each kind in sequence order) and by name, ignoring case, for custom days. A day only one side has is shown with "—" on the other side.

### C. Rates and counts (G-V3, G-V4)

6. **Rates** menu: Baseline's (default), Proposed's, Each side's own. The chosen Scenario's Costing assumptions (entered rate, rate year, first service year, escalation, future years) replace the other side's before its calculation. Estimate factors always stay with their own side.
7. **Day counts** menu: Baseline's (default), Proposed's, Each side's own. The chosen side's annual count for each matched day replaces the other side's. For matched Routes, the chosen side's own counts (on or off, and their numbers) replace the other's. Unmatched days and Routes keep their own.
8. A warning line appears when the sides' rates, counts or bases differ, saying how. Under "Each side's own" it offers "Use the baseline's for both".

### D. Measures

9. For a day:
   - **Trips:** the profile's Trips of the Route and day.
   - **Revenue miles:** each trip's cumulative miles at its last stop time minus at its first.
   - **Span:** per direction, the earliest first departure to the latest last arrival.
   - **Revenue hours, platform hours and annual cost:** read from Costing's Route rows for the day. Annual cost is the first service year's.
10. Directions are the pattern's direction group, Outbound or Inbound, named by the direction name. A pattern without a group is listed under its direction's name.
11. **Headway by period** (G-V7). A trip's departure at its first stop time places it in a period:
    - Early: before 6:00.
    - AM peak: 6:00 to 9:00.
    - Midday: 9:00 to 15:00.
    - PM peak: 15:00 to 18:00.
    - Evening: 18:00 to 21:00.
    - Night: from 21:00, including times past 24:00.

    The headway is (last − first departure) ÷ (trips − 1), in minutes, rounded to the nearest half minute. It is "—" with fewer than two trips.
12. **Peak vehicles** (G-V6) follows Blocking's peak pull-out rule:
    - A block's interval runs from its pull-out start to its pull-in end. A block without them uses its first revenue trip's departure to its last revenue trip's arrival.
    - Intervals are [start, end): a block ending as another starts does not overlap it.
    - Each Route counts the blocks attributed to it under Decision 0077 (all revenue trips on that Route). The Unattributed row counts the rest. Only valid blocks count, as in Blocking's peak pull-out (amended in V1). The system figure counts all of them, and the table notes it is less than the sum.
    - A side with no Blocking scenario shows "Not blocked".
13. **Annual view.**
    - Trips, miles, hours and cost are each day's figure × that day's count (rule 7), added up over the days.
    - Peak vehicles are the highest day's figure, with that day named.
    - Span and headways are not shown.

### E. Changes and status

14. Change = Proposed − Baseline; % = change ÷ Baseline, one decimal; "—" when the Baseline is 0 or missing, and on New and Discontinued rows (amended in V1). Peak vehicles and trips are whole numbers; miles and hours have one decimal on screen; cost is shown in dollars (millions in tiles).
15. **Status** of a matched Route for the chosen day (or for any day, in the Annual view):
    - Changed when trips, miles (to 0.01), span or any headway differ, or revenue hours differ by 1 minute or more.
    - Unchanged otherwise.

    Unmatched Routes are New or Discontinued in every view. Peak vehicles and cost do not set the status: they can move without a service change (interlining, rates).
16. The Unattributed row is shown when either side has one. Its status follows rule 15.
17. **Default order:** largest absolute revenue hours change first, then route order (numeric-aware name); Unattributed always last. Unchanged Routes fold into one row with their totals (mock-up A to C).

### F. CSV

18. The file is `<baseline>-vs-<proposed>-<day>.csv`, safe for file names, lower case, joined by dashes. It is UTF-8 with LF line endings.
    - It starts with a heading block: the two sides, the day, the rates and counts used, the preparation date, then a blank line.
    - Then one row per Route (Unchanged and Unattributed included) in the order of rule 17 without folding, then a system totals row.
    - Columns: `route_id, route, status`, then for each of trips, revenue miles, revenue hours, platform hours, peak vehicles and cost: `_base`, `_proposed`, `_change`, with `revenue_hours_pct` and `cost_pct`.
    - Values are unrounded to 2 decimals for miles and hours, whole dollars for cost.
    - Cells starting with `=`, `+`, `-` or `@` are protected as in the Costing CSV.

## Alternatives considered

- Whole Scenarios only (G-V1 B): cannot compare two profiles of one Scenario.
- Hand pairing of Routes now (G-V2 B): a data change; backlog.
- Each side's own counts and rates always (G-V3 B, G-V4 B): an unedited copy would show changes.
- Peak as overlapping trips (G-V6 B): ignores layovers; disagrees with the Blocking tab.

## Consequences

- New pure modules in `src/domain/compare/`, a service and worker in `src/application/compare/`, a tab in `src/ui/compare/`. No data or backup change.
- Each side's hours and cost equal the Costing tab's for that Scenario under the same rates and counts. A test enforces this (card V2).
