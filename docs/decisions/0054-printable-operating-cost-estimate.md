# Decision 0054: Printable Operating Cost Estimate

- Status: Accepted (user decisions of 2026-11-03); implemented, awaiting user acceptance
- Date: 2026-11-03
- Extends: Decision 0051 (estimated cost basis)

## Context

Costing results needed to be shared with third parties who do not use the app. The Costing tab is a working screen: it shows editable assumptions, estimate factors, exclusions, and rounding notes. The app has no server (Decision 0001), so a link cannot carry stored data to another person.

## Decision

1. **Sharing method.** A printable page. The planner prints it or saves it as a PDF through the browser. No hosted link and no data-carrying link are built.
2. **Menu.** The Costing scope bar's "Export costing CSV" button becomes an Actions menu ("Costing actions") with **View cost summary…** and **Export costing CSV**, matching the Route, Trips, and Blocking tabs. View cost summary… is disabled unless the estimate is complete or partial and has costs by year.
3. **Contents, in order.**
   - Header: project name above the title "Operating Cost Estimate"; scenario name and date prepared on the right. The cost basis is not shown.
   - Four figures: {first year} annual cost; Year {N} cost (the last projected year, where N is the number of future years; omitted when N is 0); {first year} revenue hours; {first year} platform hours.
   - Service by day: days per year, daily revenue hours, daily platform hours, annual revenue hours, first-year annual cost, and a total row.
   - Cost by year: year, cost per revenue hour, annual cost, cumulative cost. No row is highlighted.
   - Footer: "Costs are based on annual revenue hours and {y}% projected inflation."
4. **Data.** The pure `buildCostSummary` derives the figures from the calculated estimate of the selected cost basis and the draft assumptions. Nothing is stored or backed up.
5. **Partial estimates.** The page never marks a partial estimate. Before it opens, a confirmation ("This estimate is partial") lists the reasons from `costSummaryPartialReasons` (excluded blocks and unassigned trips per day for a blocked basis; trips without run times for an estimated basis), with Cancel and Open summary.
6. **Print.** The page is drawn over the window with Close and "Print or save as PDF" buttons. An `@media print` stylesheet hides everything except the sheet and prints it on one US Letter page with 0.5 in margins. The sheet keeps light paper colors on screen and in print.

## Consequences

- A summary of 11 years fits one portrait page.
- Tests that pressed the Export costing CSV button open it through Costing actions.
- A hosted or data-carrying link remains possible later from the same `CostSummary` object.
