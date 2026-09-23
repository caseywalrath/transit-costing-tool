# Decision 0027: Phase 5 Cost Basis, Assumptions, and Forecast

- Status: Accepted for implementation planning
- Date: 2026-09-22

## Context

Blocking now derives Running Time, Revenue Hours inclusive of usable layover, and Platform Hours. The Costing release needs one clear initial multiplier and a way to use an entered NTD-style rate whose source year precedes the service year.

## Decision

1. The initial Costing estimate uses a manually entered USD operating-cost rate per Vehicle Revenue Hour, multiplied by eligible Revenue Hours. Revenue Hours follow Decision 0026.
2. Display Platform Hours, but do not multiply them into an additional cost or add a Platform-Hour estimate to the total. Deadhead, pull-out, and pull-in remain outside Revenue Hours.
3. Record the entered rate's year and automatically adjust that rate from its source year to the selected service year using the entered annual escalation assumption. Show the applied rate.
4. A platform-sensitive supplemental cost is deferred. It requires its own rate or calibrated formula and a separate decision; applying the same total-operating-cost-per-VRH rate to Platform Hours and adding the result is not allowed.
5. Maintain one Scenario-owned assumption set shared when the user switches between that Scenario's Blocking Scenarios. Do not create separate named Costing scenarios or assumption sets per Blocking Scenario.
6. The editable annual escalation rate defaults to 3%. The projection horizon is the base service year plus up to ten future years.
7. The initial Costing UI uses a Blocking Scenario selector and shows one selected scenario at a time. Do not include a cross-scenario comparison table.

## Consequences

The initial estimate has one cost basis, and the user can inspect alternative Blocking Scenarios under the same assumptions by switching the selector. Platform Hours remain useful context for non-revenue work. Annualization, eligibility, persistence, and export details are specified in the approved Phase 5 implementation plan and verified at its package gates.
