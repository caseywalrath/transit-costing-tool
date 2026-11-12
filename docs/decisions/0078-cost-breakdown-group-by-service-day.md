# Decision 0078: Cost Breakdown Grouped by Service Day

- Status: Accepted (2026-11-12, user instruction "Implement as suggested"). Implemented 2026-11-12.
- Date: 2026-11-12
- Related: Decisions 0066 (copy table), 0076 (placement rule, item 6), 0077 (per-Route Cost breakdown; this decision resolves its item 1.7)
- Backlog: `docs/backlog.md`, "Costing by service day across routes"

## Context

Decision 0077 replaced the one-row-per-service-day Cost breakdown with one expandable row per Route. A planner can no longer see the scenario-wide figures of a service day on screen. The costing result still contains them: `dailyRows` holds the scenario totals per service day, and `routeRows[].days` holds each Route's row per service day. No calculation is needed.

## Decision

1. **Two groupings.** The Cost breakdown groups by **Route** (Decision 0077) or by **Service day**. Grouped by Service day:
   - each service-day row is the scenario's row for that day, with its daily values, in service-day order;
   - it expands in place to that day's row of each Route, ordered as the Route grouping orders Routes (by name, Unattributed last); a blocked-basis Route row shows its unassigned-trip note for that day;
   - the first column heading is "Service day";
   - the Total row is the same in both groupings.
   Column widths and positions do not change between groupings or expand states.
2. **Selector.** A "Group by" field menu (`MenuButton` with `fieldLabel`, highlight selection) in the Cost breakdown header, with "Route" and "Service day". The grouping is a persistent view choice, not a command on rows, so it is not an item of the Cost breakdown Actions menu (Decision 0076 item 6). Route is the default. The choice is remembered per device and per Scenario (`transit-costing-tool.costing-breakdown-grouping.v1`); it is never in a backup.
3. **One Route.** With fewer than two Route rows the selector is hidden and the table groups by Route, because both groupings would show the same figures.
4. **Expanded state.** Each grouping keeps its own expanded rows per Scenario (`transit-costing-tool.costing-day-expanded.v1` for service days). The Actions menu items read "Expand all days" / "Collapse all days" in the Service day grouping.
5. **Copied text.** "Copy cost breakdown" copies the grouping on screen. Grouped by Service day the columns are Service day, Route, then the value columns; a day row says "All routes" in the Route cell and carries its daily values.
6. **Unchanged.** The costing calculation, stored data, backup and CSV formats, and the Cost Summary do not change.

## Rejected alternatives

- **Grouping items in the Actions menu.** The Actions menu holds one-time commands; a remembered selection there mixes two kinds of item.
- **Showing the selector with one Route.** It would offer a second view with no new figures.
