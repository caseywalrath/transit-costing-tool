# Decision 0020: Manual Block Activities, Validation, and Summaries

- Status: Accepted for Phase 4 planning
- Date: 2026-09-18

## Context

The architecture defines Blocks as ordered activity lists and treats layovers and summaries as derived results. Phase 4 needs exact rules for activity placement, assignment, infeasible draft work, hours, miles, completeness, and duplicate Trips before domain and persistence work can begin.

## Decision

1. A Block is an ordered list of stable-ID activities. Sequence values are normalized after every committed edit.
2. Empty Blocks are valid and remain available for later assignment or repair.
3. A Block contains zero or one pull-out activity, which must be first, and zero or one pull-in activity, which must be last.
4. A connection between consecutive revenue Trips contains at most one manual deadhead activity.
5. Pull-out, pull-in, and deadhead activities store explicit start and end service times. Their end must not precede their start.
6. Pull-out and pull-in add optional miles. Deadhead retains optional miles.
7. The same Trip ID may appear only once across all Blocks in one Blocking Scenario and service day. The same Trip may appear in another Blocking Scenario. Different Trip IDs with identical times remain distinct and assignable.
8. Assigning an already assigned Trip to another Block is an atomic move: remove it from the source, insert it at the reviewed destination position, normalize both Blocks, and write both or neither.
9. Structural invariants reject a write. These include missing records, wrong Scenario, wrong Blocking Scenario source profile, wrong service day, duplicate Trip assignment, malformed activity order, invalid service-time values, and invalid references.
10. Structurally valid but operationally infeasible Blocks may be saved. Overlaps, negative connection time, location discontinuity, missing deadhead, non-fitting deadhead, and missing pull-out or pull-in remain visible as derived findings.
11. Revenue Trip start and end come from its first and last scheduled points. Revenue hours are the sum of revenue-trip durations.
12. Raw connection gap is the next revenue Trip start minus the previous revenue Trip end.
13. When terminal Nodes match and no deadhead is present, usable layover equals the raw connection gap.
14. When terminal Nodes differ, the connection is incomplete without a deadhead. With a deadhead, usable layover equals the raw connection gap minus deadhead duration, subject to explicit deadhead placement and Node-continuity validation.
15. Deadhead hours are the sum of pull-out durations, pull-in durations, and manual between-Trip deadhead durations. Layover remains a separate derived quantity.
16. Platform hours are elapsed time from pull-out start through pull-in end. They are incomplete without both activities or when either boundary is structurally invalid.
17. Revenue miles are the sum of complete revenue Pattern distances.
18. Platform miles equal revenue miles plus pull-out, deadhead, and pull-in miles. They are complete only when all required revenue and non-revenue distances are present.
19. No minimum-layover policy is applied in Phase 4.
20. Block and selected-day summaries return values with validity and completeness status. Selected-day totals show a known valid subtotal plus counts of invalid or incomplete Blocks. Valid but incomplete Blocks still contribute their known hours; missing mileage remains incomplete and is never treated as zero.
21. Compatibility is read-only and evaluates both sides of the selected insertion point. It reports compatible, deadhead required, conflict, or incomplete and does not mutate Blocks.

## Consequences

- Feasibility findings support iterative planning without permitting corrupt ownership or duplicate vehicle work.
- Summary types must carry completeness and validity metadata instead of returning bare totals.
- Pull-out and pull-in schema shapes require optional mileage fields.
- Assignment and reassignment require Blocking-Scenario/day-wide duplicate checks and transaction boundaries.
- The UI may show invalid Blocks but must clearly distinguish them from structurally rejected commands.

## Rejected alternatives

### Reject every infeasible Block edit

Rejected because planners must be able to construct and review incomplete or conflicting draft blocking work.

### Treat missing miles as zero

Rejected because it would present incomplete platform mileage as complete.

### Store layover activities or summary totals

Rejected because layovers, hours, miles, and totals are derived from authoritative Trips and manual activity inputs.
