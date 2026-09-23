# Phase 4 Closeout: Manual Blocking

## Status

Phase 4 was implemented and user-accepted through Package 4D on 2026-09-22. The user reported that the Blocking module works as expected. Costing remains a separate phase and has not started.

## Delivered scope

- Named Blocking Scenarios with immutable Trip Profile ownership and all-service-day scope.
- Persisted Blocks with ordered Trip, pull-out, pull-in, and deadhead activities; lifecycle, migration, backup/restore, duplication, and scenario-scoped CSV export.
- Structural validation, operational findings, compatibility, layover, running, revenue, platform, deadhead, and mileage summaries.
- Blocking workspace for one-Route assignment with complete inspection of existing multi-route Blocks.
- Trips-table assignment, reassignment, and unassignment scoped to a selected Blocking Scenario and service day.
- Documentation of ownership, lifecycle, activity timing, bulk boundary edits, assignment, and Revenue-hour semantics in Decisions 0019–0026.

## Verification record

The implementation closeout recorded:

- TypeScript typechecking passed.
- Vitest passed: 163 tests across 24 files.
- Production build passed; Vite reported the existing large-main-bundle warning.
- Focused Playwright checks passed for Trips assignment/unassignment and Blocking workspace layout.
- Browser inspection confirmed the Blocks summary columns and footer totals align and remain visible.
- `git diff --check` reported no whitespace errors; line-ending conversion warnings were present on Windows.

A wider Playwright run had three timeouts in `unified-action-layer.spec.ts`; those are not recorded as passing Phase 4 verification. The focused Blocking and Trips tests passed. The user accepted the Blocking module after review.

## Deferred to Costing planning

- Costing basis aggregation and treatment of unassigned Trips, invalid Blocks, and incomplete quantities.
- Costing source selection across Trip Profiles and Blocking Scenarios.
- Annualization, analysis-year, and inflation formulas.
- Cost-plan lifecycle, comparison scope, and Costing exports.

See `phase-05-costing-planning.md`. Do not treat the preliminary Costing types in `docs/data-schema.md` as approved contracts.
