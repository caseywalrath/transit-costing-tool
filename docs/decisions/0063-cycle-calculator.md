# Decision 0063: Vehicle Requirement (Cycle Calculator) on the Costing Screen

- Status: Accepted and implemented (2026-11-10)
- Date: 2026-11-10 (user choice of option A, one row per service day)
- Replaces: the Implied service panel of Decision 0062 item 6 (its derivation, `deriveImpliedService`, stays and feeds the calculator)

## Context

The Implied service panel showed what a layover % implies but did not let the planner work the relation vehicles = cycle with layover ÷ headway in the other directions. The user reviewed two mock-ups (one row per service day, and one row per period) and chose one row per service day.

## Decision

1. **Place.** With an estimated cost basis, a Vehicle requirement surface precedes the Cost breakdown, because it is mainly an input (user request, 2026-11-10; first called "Cycle calculator" and placed after the Cost breakdown). It has one row per service day with Trips, and per Route when the Scenario has more than one.
2. **Columns.** Service day, Cycle running (mean, min), Layover %, Cycle with layover (min), Headway (median, min), Vehicles, Revenue (h/day), Annual cost, and a Use button. The column labels name the statistic: cycle running is the sum of each direction's mean run time, and headway is the median departure gap (Decision 0062).
3. **Starting values.**
   - Cycle running and headway start from the Trips. Headway starts blank when the directions' headways differ.
   - Layover % starts from the day's factor in the Estimate factors draft.
   - Vehicles start from the implied vehicles, rounded up.
4. **Solving.** "Solve for" (Vehicles, Layover %, Headway) chooses the calculated value; the others are typed. The pure `solveCycle` in `src/domain/cycleCalculator.ts` solves it.
   - "Whole vehicles" (Vehicles only) rounds up and recalculates the layover that fills the longer cycle.
   - A calculated value becomes a typed value when "Solve for" changes.
   - A cycle shorter than the running cycle is reported.
5. **Cost.** Revenue hours = the schedule's running hours, scaled by typed ÷ scheduled running cycle, ÷ (1 − layover %), as the estimated basis computes them. Annual cost uses the applied rate of the selected year and the day's annual service days.
6. **Writing back.** Use writes the row's layover % into that day's Estimate factors cell as an unsaved change. Nothing else is written. Typed values are screen state: they reset with Reset to schedule and when the cost basis changes, and are never stored or exported.

## Consequences

- The planner can find the layover % that matches a chosen fleet and headway and apply it in one step.
- One row per day uses one headway and the mean running cycle; routes whose frequency or run time varies during the day are described by their typical period only. A per-period version is deferred.
