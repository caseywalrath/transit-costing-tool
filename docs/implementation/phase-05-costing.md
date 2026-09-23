# Phase 5: Costing — Implementation Plan

## Status and gate

Approved planning scope, 2026-09-22. Decision 0027 records the accepted Revenue-Hour basis, rate-year adjustment, one assumption set per parent Scenario, 3% editable default, base year plus up to ten future years, and selector-only Blocking Scenario view. Phase 4 is the input baseline. No implementation package begins until the user requests it; the next proposed package is 5A.

## Outcome

For one selected Blocking Scenario at a time, show eligible daily Revenue and Platform Hours, cost per service day, annualized quantities and USD cost, plus a base service year and up to ten future years. An NTD-style entered USD/VRH rate is the only initial multiplier. Apply the same Scenario-owned assumptions when switching Blocking Scenarios. Show excluded Block and unassigned-Trip counts. Never label a partial estimate as complete. Do not add a cross-scenario comparison table.

## Pure calculation contract

Input: one Scenario's service-day definitions and Costing assumptions, the selected Blocking Scenario, its source Trip Profile, saved Trips and Blocks, and pure Blocking summaries. Output: per-day eligibility and exclusions, annual quantities, adjusted rates by year, daily and annual cost rows, and plain-language finding codes. Do not persist outputs.

A Block qualifies when it has Trips, structurally sound references, operationally valid connections, and a calculable Platform-Hours boundary. Missing miles alone does not disqualify it. The exact predicate is a 5A review checkpoint because existing Block `complete` also tests mileage. Never use the scenario-wide aggregate `platformHours` as an eligibility shortcut: one ineligible Block can make that aggregate undefined. Sum individual eligible Block summaries.

For year `y`, `rate[y] = enteredRate × (1 + annualEscalation)^(y - rateYear)`. For day `d`, `costPerDay[d,y] = eligibleRevenueHours[d] × rate[y]`; `annualCost[d,y] = costPerDay[d,y] × annualDayCount[d]`. Sum across four days. Round only for display/export, not intermediate math; deterministic currency rounding policy must be fixed in 5A tests. Future schedule, counts, and quantities are held constant. A changed source Trip, Block, service-day count, or assumption recalculates results automatically.

Require annual counts as nonnegative integers totaling at most 365. A total below 365 is valid and is not scaled up. Zero-count days show daily quantities but add zero annual cost. Block eligibility affects both Revenue and Platform quantities consistently. Default annual escalation to 3%; permit a finite negative value above -100% for sensitivity testing, and reject -100% or below.

## Persisted inputs and lifecycle

Replace the unused draft `CostPlan`/`CostEstimate` shapes with one Scenario-owned Costing assumptions record. Fields: stable ID, Scenario ID, entered USD/VRH rate, rate year, source type and note, base service year, future-year count 0–10, annual escalation (3% default), metadata. Do not store totals, selected year, selected Blocking Scenario, or a duplicate Trip Profile ID as authoritative cost data. The selected Blocking Scenario and year are workspace UI state; change of selection does not create a new Costing scenario.

Scenario duplication copies assumptions with new ID. Scenario deletion removes them. Blocking Scenario duplication or deletion does not clone/delete assumptions. JSON project backup/restore includes the inputs and a schema-version bump. Older backups and databases receive a default empty assumptions record or lazy creation without inventing a monetary rate. Import-as-copy remaps Scenario ownership. Restore validates ownership, rate/year range, currency, and version; historical service-day totals above 365 remain preserved but block calculations pending correction.

CSV export is one ZIP download containing assumptions, all per-day/year results for the selected Blocking Scenario, and exclusions. Do not include a cross-scenario comparison table. Filenames, header units, and rounding are fixed in 5B. CSV remains reporting, not backup.

## UI structure

Reuse the Blocking Scenario selector, compact form fields, day-count controls, existing table and Actions patterns. Show selected Blocking Scenario and derived Trip Profile clearly. Main results table: Day, Days, Revenue h/day, Platform h/day, Cost/day, Annual Revenue h, Annual Platform h, Annual cost. Totals align under the same columns. A year selector changes the table; an outlook table lists all years and applied rates. Exclusions are a visible summary near the table, with details for affected Blocks; zero eligibility produces a no-estimate state, not a misleading $0. There is no cross-scenario comparison table.

No independent Costing scenario CRUD. No Platform-Hour cost, mileage supplement, charts, inferred NTD downloads, or cost-category allocation. Use accessible labels, keyboard operable controls, coherent focus after selection, and responsive table review.

## Packages and ownership

| Package | Owner | Boundaries and deliverable | Stop gate |
| --- | --- | --- | --- |
| 5A — Domain and application contracts | Luna | Pure eligibility, excluded-work accounting, annualization, compounding, validation, selectors/query ports, deterministic tests. No layout or React design. | Primary agent checks examples with missing miles, absent pull-in, invalid connections, unassigned Trips, 364/365/366 days, zero days, source-year escalation, and 10-year horizon; user reviews calculation examples. |
| 5B — Persistence, backup, export | Luna | Replace draft cost types, Dexie migration/repository, JSON backup version and import-as-copy, duplication/deletion, single-download CSV/ZIP. No UI layout. | Primary agent verifies migration and round-trip backup, old-backup compatibility, malformed inputs, CSV row/total reconciliation, and one-download behavior. |
| 5C — Costing workspace | Luna for precisely specified reuse; Sol if interaction/layout judgment is needed | Assumptions editor, one Blocking Scenario selector, year selector, daily/yearly tables, exclusions, export action, accessible states. No cross-scenario comparison table and no business math in React. Exact UI port is confirmed after a small user review of the mockup. | User verifies representative scenarios in browser; primary agent checks keyboard, dense table, responsive layout, typecheck, UI tests, and build. |
| 5D — Integration and acceptance | Primary agent/Sol | Cross-layer audit, docs, regression verification, user acceptance. | Report results and ask before any follow-on scope. |

No package starts automatically after its gate. If 5C exposes a new domain rule, return it to a structural change rather than implementing that rule in the UI.

## Acceptance criteria

1. A selected Blocking Scenario's eligible Blocks alone determine costed Revenue Hours; Platform Hours are displayed and not multiplied into a second cost.
2. Missing mileage does not suppress otherwise eligible hour-based estimates. Missing Platform boundaries, invalid connections, and unassigned Trips are reported as exclusions; empty or partially eligible data cannot masquerade as complete service.
3. Per-day and annual totals reconcile to displayed quantities and service-day counts; the count sum never exceeds 365 in new edits. Less than 365 remains valid.
4. The entered source rate, source year, applied year rate, and escalation are visible and calculate correctly for the base year and each selected future year.
5. Switching Blocking Scenarios changes quantities while retaining the one Scenario-owned assumptions set; Trip Profile derivation remains unambiguous.
6. Backup/restore, scenario copy, migration, and export preserve inputs and reproduce derived results without persisting totals.
7. The UI is keyboard accessible, table columns and totals align, and a standard desktop width needs no unintended horizontal scrolling.
8. One editable assumption set applies across Blocking Scenarios; its escalation defaults to 3%, and the maximum horizon is the base year plus ten future years. The UI shows one selected Blocking Scenario at a time without a cross-scenario comparison table.

## Verification

Focused Vitest coverage for pure math, eligibility, edge cases, and life cycles; TypeScript check; migration and JSON round-trip tests; CSV reconciliation; relevant Playwright UI/keyboard checks; production build; browser visual inspection with small and dense data. Documentation-only changes to this plan require proofreading and cross-file consistency rather than a code test suite.
