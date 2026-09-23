# Phase 5 Planning Review: Costing

## Status

Planning decisions accepted on 2026-09-22. Phase 4 is accepted. The companion `phase-05-costing.md` is the approved Phase 5 implementation plan; each package still requires an explicit request before work begins.

## Objective

Translate the Trips and Blocks in a selected Blocking Scenario into daily and annual operating-cost estimates for a service year and up to ten future years. Keep assumptions, exclusions, and calculation bases visible. Do not create separate named Costing scenarios.

## User-confirmed direction

- Select one Blocking Scenario at a time and derive its Trip Profile and all service-day schedules. Switching the selector shows another Blocking Scenario under the same cost assumptions. No cross-scenario comparison table is included.
- Cost only Blocks with operationally valid, calculable Platform Hours. Ignore unassigned Trips and ineligible Blocks in the numeric estimate, but report their counts and a partial-estimate warning.
- Annualize each service-day type using its editable day count. Their sum may be below 365 but must not exceed 365.
- Use a manually entered NTD-style operating-cost rate in USD per Vehicle Revenue Hour (VRH) as the initial and only cost multiplier. Show Revenue and Platform Hours; do not add a Platform-Hour cost.
- Store the rate year and automatically escalate the entered rate to the service year. Project future years with one editable annual rate, defaulting to 3% as a planning assumption, not a prediction.
- Show a base service year plus up to ten future years (at most eleven years), with a year selector and year-by-year outlook.
- Export useful Costing information; the single-download CSV organization is specified below.

## Accounting boundary

Revenue Hours include Running Time and usable layover under Decision 0026; deadhead, pull-out, and pull-in are excluded. Platform Hours include non-revenue time and are shown for operational context. An NTD operating-cost-per-VRH rate has total operating expense in its numerator. Multiplying Platform Hours by that same rate **and adding it** to the Revenue-Hour estimate would double count expense. A later platform-sensitive estimate needs an independent marginal rate or calibrated formula and a separate decision.

## Approved detailed direction

1. Store one Scenario-owned `CostAssumptions` record shared by its Blocking Scenarios: entered $/VRH, rate year, source type/note, base service year, annual escalation, and future-year count. USD is fixed for this release. Selecting a Blocking Scenario changes quantities, not assumptions. Scenario duplication copies assumptions; deleting one Blocking Scenario does not delete them.
2. Define an eligible Block by its resolved activities, timing, and connection findings, **not** by the existing all-fields `complete` flag. Missing miles alone must not exclude a Block with valid Platform Hours. Ineligible Blocks and unassigned Trips are counted separately by service day. Empty Blocks add no hours and no cost.
3. Sum Revenue Hours and Platform Hours only from eligible Blocks. For service-day type `d`, `dailyCost[d,y] = eligibleRevenueHours[d] × adjustedRate[y]` and `annualCost[d,y] = dailyCost[d,y] × serviceDayCount[d]`. Sum annual costs across days. Hold schedules and day counts constant across projection years; only the rate changes.
4. `adjustedRate[y] = enteredRate × (1 + escalation)^(y - rateYear)`. Require a rate year no later than the base service year, a nonnegative rate, and finite escalation above -100%. Display the applied rate in each year. Base year plus ten future years yields at most eleven outlook rows.
5. Enforce the 365-day cap on editing and Costing calculation. On restore, preserve historical records above the cap but mark Costing unavailable until corrected; do not discard schedules or day counts.
6. Export one ZIP download containing assumptions and all service-day/year results for the selected Blocking Scenario, plus exclusions, in CSV. Complete JSON backup includes assumptions; CSV is not a restore format. Include basis, unit, year, source Blocking Scenario, and excluded counts.
7. The selector shows one Blocking Scenario in detail. Do not add a cross-scenario comparison table, charts, or Costing-case lifecycle.

## Implementation checks, not open product decisions

- The 3% starting value is editable. For validation, permit a finite negative rate above -100% for sensitivity testing; reject -100% or below, which would produce zero or negative future multipliers.
- Verify the Block exclusion predicate against representative Blocks, especially missing miles, absent pull-out/pull-in, and incomplete connections. This is a calculation gate, not a change to the accepted cost basis.

## Interface layout reference

```text
Costing                                      Scenario [Blocking 1 v]
Assumptions                                 Year [2026 v]  [Export v]
NTD operating cost [$  / Revenue hour]     Rate year [2024]
Annual escalation [3.0%]                   Service year [2026]  Future years [10]
Service days: Weekday [260] Saturday [52] Sunday [52] Holiday [0]  Total 364 / 365

2026 cost estimate                          Applied rate $... / Revenue hour
Day       Days  Revenue h/day  Platform h/day  Cost/day  Annual Revenue h  Annual cost
Weekday   260   ...            ...             ...       ...               ...
Saturday   52   ...            ...             ...       ...               ...
Sunday     52   ...            ...             ...       ...               ...
Holiday     0   ...            ...             ...       ...               ...
Total     364                                                  ...               ...
Excluded: 2 Blocks without usable Platform Hours; 3 unassigned Trips. Partial estimate.

Yearly outlook: Year | Applied $/Revenue hour | Annual Revenue h | Annual Platform h | Annual cost
```

Use established selectors, Actions menus, dense tables, and plain-language findings. Keep the main cost table readable without horizontal scrolling at standard desktop width; verify keyboard navigation, focus, number formatting, and narrow widths.

## Package recommendation

See `phase-05-costing.md`. Luna owns pure calculations, application contracts, migration, backup, CSV, and narrowly specified reuse of existing UI components. Sol owns novel UI decisions and primary integration review. Each package stops at its verification gate.
