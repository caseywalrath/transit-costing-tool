# Decision 0077: Per-Route Cost Breakdown and Route Estimate Factors

- Status: Accepted (2026-11-12, user acceptance of the recommendations for open decisions 1–6). Implemented 2026-11-12 (closeout: `docs/implementation/route-cost-breakdown-closeout.md`). Plan: `docs/implementation/route-cost-breakdown.md`.
- Date: 2026-11-12
- Related: Decisions 0026 (Revenue hours include layover), 0027 (cost basis), 0051 (estimated cost basis), 0054 (cost summary), 0062 (Trip-Profile-owned factors), 0066 (copy table), 0076 (Blocking summary surface; its placement rule, item 6, governs where the selectors and actions of this decision sit)
- Backlog: `docs/backlog.md`, "Per-route cost breakdown and factors"

## Context

Costing is scenario-wide. The estimated basis sums every Trip of the Trip Profile; the blocked basis sums every eligible Block of the Blocking Scenario. The Cost breakdown table has one row per service day, so a planner cannot see which Routes drive cost. Estimate factors (layover %, deadhead %) belong to a Trip Profile and a service day (Decision 0062) and cannot differ by Route, although Routes with different cycle lengths need different layover shares.

## Decision

### 1. Cost breakdown layout

1. The Cost breakdown table has one row per Route, then a Total row. It replaces the one-row-per-service-day table. Its columns are the existing eleven (`BREAKDOWN_COLUMNS` in `src/ui/costing/costBreakdownText.ts`), with the first heading renamed from "Service day" to "Route".
2. Each Route row expands in place to show that Route's service-day rows, indented in the first cell. A Route row's values are the sums of its service-day rows, computed by the same rules as the Total row today.
3. Expanding or collapsing never changes a column's width or position.
4. With exactly one Route row, it is expanded by default.
5. The expanded state is remembered per device and per Scenario. Expand all and Collapse all are items in a new Actions menu in the Cost breakdown header, which holds commands on that surface's rows (Decision 0076 item 6). They are not visible buttons, and they are not added to the scope-bar Costing actions menu.
6. The year columns are unchanged. Route rows are listed by Route name (numeric-aware, case-insensitive); the Unattributed row is last (user decision, 2026-11-12).
7. A scenario-wide by-service-day view is not part of this decision (backlog: "Costing by service day across routes").

### 2. Route estimate factors

1. **Ownership.** Route factors belong to a Trip Profile and a Route. `CostingAssumptions.routeEstimateFactors` holds at most one entry `{ tripProfileId, routeId, factors }` per Trip Profile × Route. `factors` has the Decision 0051 shape (`CostingEstimateFactors`).
2. **Fallback.** Each factor (layover, deadhead) is resolved independently, per Route and service day, in this order:
   1. the Route entry's service-day row;
   2. the Route entry's All days row;
   3. the Trip Profile's resolved factor for that day, exactly as Decision 0062 resolves it today (own entry, else the Scenario's shared factors; day row, else All days).

   A blank Route cell always inherits. Unlike Decision 0062, an empty Route entry does not stop inheritance; an entry that becomes empty on save is removed.
3. **Saving.** Saving the factors of a Route writes only that Route's entry for that Trip Profile. Entries of Trip Profiles or Routes that no longer exist are dropped on every save.
4. **Lifecycle.**
   - Copying a Trip Profile copies its Route entries to the copy.
   - Deleting a Trip Profile removes its Route entries.
   - Deleting a Route removes its Route entries, in the same write.
   - Duplicating a Route copies its Route entries to the new Route.
   - Scenario duplication and backup import-as-copy remap Trip Profile, Route and service-day IDs.
5. **Costing screen.** A Route field menu (`MenuButton` with `fieldLabel`, as the Blocking scenario field menu of Decision 0076) in the Estimate factors header has "All routes" (the Trip Profile's factors, as today) followed by each Route. The subtitle produced by `factorSubtitle` ("Trip profile X · shared scenario factors" / "· blank days use All days") is removed. A cell that inherits is visibly distinct from a value entered at the selected level.
6. **Vehicle requirement (Decision 0063), accepted 2026-11-12.** Each row starts from its Route's resolved layover % (item 2.2) and says whether it comes from the "route" or the "trip profile". "Use" writes only to the level the Route menu shows: with All routes, only on rows whose Route inherits the Trip Profile's layover (a row with its own Route layover is disabled, with a tooltip naming the Route menu); with one Route chosen, only on that Route's rows, and the other rows are dimmed. "Use" never changes the Route menu. Rejected: "Use" writing to the row's Route entry whatever the menu shows, because it creates unsaved edits on a level the grid does not show.
7. **Bases.** Route factors affect the estimated basis only. The blocked basis takes its hours from Block summaries and does not use factors, as today.

### 3. Attribution

1. **Estimated basis.** A Trip belongs to its `routeId`. A Route's running hours are the sum of its Trips' run times. Revenue and platform hours are computed per Route with that Route's resolved factors.
2. **Blocked basis, interim rule.** An eligible Block whose revenue Trips all have one `routeId` belongs to that Route; all its revenue and platform seconds (including pull-out, pull-in and deadhead) go to that Route. An eligible Block whose revenue Trips have more than one `routeId` goes to an **Unattributed** row and produces the warning finding `costing.multiRouteBlock`. This rule stands until a decision on multi-route interlining replaces it (backlog: "Multi-route interlining").
3. **Unassigned Trips (blocked basis).** Each Route row shows the count of that Route's Trips that are in no Block, as a note on the row, not as a column.
4. **Blocks column.** A Route row counts the eligible Blocks attributed to it. The Total row counts eligible Blocks once each, which is the sum of the Route rows and the Unattributed row.
5. **Totals.** The Total row and the Yearly outlook equal today's scenario totals. When no Route has its own factors, every day's figures are computed exactly as today, so existing results are unchanged to the last digit.

### 4. Output

The Cost Summary (Decision 0054) gains a "Cost by route" table: Route, annual revenue hours, first-year annual cost, and share of the first-year cost. The Costing CSV/ZIP report gains a `costing-routes` file with one row per Route × service day and one per Route total. The copied Cost breakdown text (Decision 0066) follows the new table: Route rows, each followed by its service-day rows, then Total.

### 5. Formats

- JSON backup schema version 12. A version 12 file validates each `routeEstimateFactors` entry: an array; each Trip Profile and Route of the same Scenario; each pair at most once; factors valid as in Decision 0051. A version 1 to 11 file's `routeEstimateFactors` field is dropped rather than failing the import. Versions 1 to 11 stay readable.
- The Dexie schema does not change: the field lives on the existing `costingAssumptions` record.
- Existing CSV files keep their columns.

## Consequences

- A planner can see which Routes drive cost and can set a layover % per Route without losing the Trip-Profile and Scenario defaults.
- Route rows no longer split cost in proportion to hours once Route factors differ, so the table, not a share of hours, is the source of Route cost.
- The blocked basis cannot attribute interlined Blocks yet; they are visible as Unattributed with a finding rather than hidden.
- The service-day totals across all Routes are not visible on screen until the follow-on backlog item is done. The Cost Summary keeps its by-service-day table.

## Rejected alternatives

- **Filter the existing table by Route.** It cannot compare Routes side by side.
- **Stacked per-Route tables.** Too busy for a scenario with many Routes.
- **Route factors nested inside the Trip Profile's entry.** Creating a Route entry would create a Trip Profile entry, and under Decision 0062 that stops the Profile from using the Scenario's shared factors.
- **Route factors owned by the Scenario.** Changing Trip Profiles would keep the same Route factors, although timetable alternatives need different layover shares.
- **Split pull-out, pull-in and deadhead of multi-route Blocks now.** The current scenario has no interlined Blocks, and the rule needs its own decision.
