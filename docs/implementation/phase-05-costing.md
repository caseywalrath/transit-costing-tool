# Phase 5: Costing — Implementation Plan

## Status and gate

Approved planning scope, 2026-09-22. Decision 0027 records the accepted Revenue-Hour basis, rate-year adjustment, one assumption set per parent Scenario, 3% editable default, base year plus up to ten future years, and selector-only Blocking Scenario view. Phase 4 is the input baseline. Packages 5A and 5B were implemented and verified on 2026-09-23. Package 5C was requested and implemented on 2026-09-23; its user-directed toolbar revision is recorded in Decision 0028. Automated behavior, accessibility structure, desktop overflow, responsive layout, typecheck, unit tests, and production build pass. User verification with representative local project data remains the 5C stop gate before Package 5D.

## Outcome

For one selected Blocking Scenario at a time, show eligible daily Revenue and Platform Hours, cost per service day, annualized quantities and USD cost, plus a base service year and up to ten future years. An NTD-style entered USD/VRH rate is the only initial multiplier. Apply the same Scenario-owned assumptions when switching Blocking Scenarios. Show excluded Block and unassigned-Trip counts. Never label a partial estimate as complete. Do not add a cross-scenario comparison table.

## Pure calculation contract

Input: one Scenario's service-day definitions and Costing assumptions, the selected Blocking Scenario, its source Trip Profile, saved Trips and Blocks, and pure Blocking summaries. Output: per-day eligibility and exclusions, annual quantities, adjusted rates by year, daily and annual cost rows, and plain-language finding codes. Do not persist outputs.

A Block is eligible only when it contains at least one revenue-Trip activity, its `BlockSummary.valid` is true, every resolved connection has `status === 'valid'`, and its `platformHours` and `revenueHours` are finite, nonnegative numbers. `platformHours` must be defined by valid pull-out and pull-in boundaries. A connection with missing times or a missing required deadhead is incomplete and excludes the Block even if `BlockSummary.valid` remains true. Structural errors and connection conflicts also exclude it. Mileage findings alone do not affect eligibility; do not use `BlockSummary.complete` or the scenario-wide aggregate `platformHours` as shortcuts. Sum individual eligible Block summaries. An empty Block contributes no quantities and is neither eligible nor counted as excluded work.

For each service day, count nonempty ineligible Blocks and source Trip Profile Trips not assigned to any Block in the selected Blocking Scenario as separate exclusions. Keep reason codes for affected Blocks so missing boundaries, incomplete connections, and conflicts can be reported without guessing from a scenario-level status. Any such exclusion makes the estimate partial, including when the service-day count is zero. If no eligible Block exists across the selected Blocking Scenario, return a no-estimate state rather than a numeric zero-cost estimate.

For year `y`, `rate[y] = enteredRate × (1 + annualEscalation)^(y - rateYear)`. For day `d`, `costPerDay[d,y] = eligibleRevenueHours[d] × rate[y]`; `annualCost[d,y] = costPerDay[d,y] × annualDayCount[d]`. Sum across four days. Keep full numeric precision through all calculations and totals. At the presentation/export boundary, round USD amounts independently to two decimal places and hours independently to four decimal places, with exact half-unit ties rounded away from zero. Show the applied USD/VRH rate to four decimal places so escalation is visible. Do not add already rounded rows to obtain totals; minor displayed row-versus-total differences from rounding are acceptable and must be identified in export metadata. Include tie and row-total rounding examples in 5A tests. Future schedule, counts, and quantities are held constant. A changed source Trip, Block, service-day count, or assumption recalculates results automatically.

Require annual counts as nonnegative integers totaling at most 365. A total below 365 is valid and is not scaled up. Zero-count days show daily quantities but add zero annual cost. Block eligibility affects both Revenue and Platform quantities consistently. Require the source rate year to be no later than the base service year. Default annual escalation to 3%; permit a finite negative value above -100% for sensitivity testing, and reject -100% or below.

## Persisted inputs and lifecycle

Replace the unused draft `CostPlan`/`CostEstimate` shapes with one Scenario-owned Costing assumptions record. Fields: stable ID, Scenario ID, fixed USD currency, optional entered USD/VRH rate, rate year, source type and note, base service year, future-year count 0–10, annual escalation (3% editor default), and metadata. Zero is a valid entered rate; an absent rate means the user has not entered one. Do not store totals, selected year, selected Blocking Scenario, or a duplicate Trip Profile ID as authoritative cost data. The selected Blocking Scenario and year are workspace UI state; change of selection does not create a new Costing scenario.

Scenario duplication copies assumptions with a new ID. Scenario deletion removes them. Blocking Scenario duplication or deletion does not clone/delete assumptions. JSON project backup/restore includes the inputs and uses schema version 6; versions 1–5 remain readable and import without assumptions. Database version 5 adds the assumptions store and leaves it empty for existing Scenarios; new records are created lazily, without inventing a rate or service year. Import-as-copy remaps Scenario ownership. Restore validates ownership, rate/year range, USD currency, and version; historical service-day totals above 365 remain preserved but block calculations pending correction.

CSV export returns the three fixed files `costing-assumptions.csv`, `costing-results.csv`, and `costing-exclusions.csv` for one selected Blocking Scenario; the UI packages them into one ZIP download. Assumptions headers include the selected Blocking Scenario and Trip Profile, cost basis, currency, rate unit, source, rate year, base service year, horizon, escalation fraction, and rounding note. Results headers identify row type, selected source, estimate state/reason, service day/year, service-day count, eligible/excluded/unassigned counts, Revenue and Platform Hours, applied USD/VRH rate, daily/annual USD, and rounding note. Exclusions include service day, excluded Block ID/label, reason codes, and unassigned Trip count. USD amounts use two decimals, hours four decimals, and applied rates four decimals; totals are calculated before rounding and rounded independently. CSV remains reporting, not backup.

## UI structure

Use the shared module toolbar for Blocking Scenario, derived read-only Trip Profile, View year, and Costing Actions. Keep assumptions in one full-width workspace section; do not repeat an Estimate Context card. Main results table: Day, Days, Revenue h/day, Platform h/day, Cost/day, Annual Revenue h, Annual Platform h, Annual cost. Totals align under the same columns. The year selector changes the table; an outlook table lists all years and applied rates. Exclusions are a visible summary near the table, with details for affected Blocks; zero eligibility produces a no-estimate state, not a misleading $0. There is no cross-scenario comparison table.

No independent Costing scenario CRUD. No Platform-Hour cost, mileage supplement, charts, inferred NTD downloads, or cost-category allocation. Use accessible labels, keyboard operable controls, coherent focus after selection, and responsive table review.

## Packages and ownership

| Package | Owner | Boundaries and deliverable | Stop gate |
| --- | --- | --- | --- |
| 5A — Domain and application contracts | Luna | Implemented: pure eligibility, excluded-work accounting, annualization, compounding, validation, selectors/query ports, and deterministic tests. No layout or React design. | User proceeded to Package 5B after implementation. Calculation examples remain documented in the 5A tests and earlier review. |
| 5B — Persistence, backup, export | Luna | Implemented: assumptions types/repository, Dexie version 5, JSON schema version 6 and import-as-copy, Scenario duplication/deletion lifecycle, and three CSV serializers packaged by the shared ZIP utility. No UI layout. | Passed on 2026-09-23: browser migration preserved a version 4 project; backup round-trip and version 5 compatibility passed; malformed assumptions were rejected; CSV rounding/reconciliation and one ZIP archive passed. |
| 5C — Costing workspace | Luna for precisely specified reuse; Sol if interaction/layout judgment is needed | Implemented using existing workflow sections, tables, and the shared module toolbar: assumptions editor, one Blocking Scenario selector, derived Trip Profile, year selector, daily/yearly tables, detailed exclusions, contextual ZIP export action, and accessible estimate states. No cross-scenario comparison table and no business math in React. | Automated checks pass. User verifies representative scenarios in browser before Package 5D. |
| 5D — Integration and acceptance | Primary agent/Sol | Cross-layer audit, docs, regression verification, user acceptance. | Report results and ask before any follow-on scope. |

No package starts automatically after its gate. If 5C exposes a new domain rule, return it to a structural change rather than implementing that rule in the UI.

## Acceptance criteria

1. A selected Blocking Scenario's eligible Blocks alone determine costed Revenue Hours; Platform Hours are displayed and not multiplied into a second cost.
2. Missing mileage does not suppress otherwise eligible hour-based estimates. Missing Platform boundaries, invalid connections, and unassigned Trips are reported as exclusions; empty or partially eligible data cannot masquerade as complete service.
3. Per-day and annual totals reconcile before presentation rounding to eligible quantities and service-day counts; independently rounded displayed rows may differ from a displayed total by the rounding amount. The count sum never exceeds 365 in new edits. Less than 365 remains valid.
4. The entered source rate, source year, applied year rate, and escalation are visible and calculate correctly for the base year and each selected future year.
5. Switching Blocking Scenarios changes quantities while retaining the one Scenario-owned assumptions set; Trip Profile derivation remains unambiguous.
6. Backup/restore, scenario copy, migration, and export preserve inputs and reproduce derived results without persisting totals.
7. The UI is keyboard accessible, table columns and totals align, and a standard desktop width needs no unintended horizontal scrolling.
8. One editable assumption set applies across Blocking Scenarios; its escalation defaults to 3%, and the maximum horizon is the base year plus ten future years. The UI shows one selected Blocking Scenario at a time without a cross-scenario comparison table.

## Verification

Focused Vitest coverage for pure math, eligibility, edge cases, and life cycles; TypeScript check; migration and JSON round-trip tests; CSV reconciliation; relevant Playwright UI/keyboard checks; production build; browser visual inspection with small and dense data. Documentation-only changes to this plan require proofreading and cross-file consistency rather than a code test suite.
