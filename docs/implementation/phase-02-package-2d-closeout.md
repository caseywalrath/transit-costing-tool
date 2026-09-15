# Phase 2 Package 2D Closeout: Trip Generation, Overrides, and Regeneration Domain

## Status

Implemented on 2026-09-11. Paused for structural verification and user review. Package 2E is not started.

## Delivered result

- Validated generation controls, including positive headways and counts, inclusive end-time departures, and end-before-start rejection.
- Generated materialized trips with a runtime band selected independently for every departure. A departure in a saved runtime gap produces a structured generation error.
- Preserved 24-plus service times through integer-second calculations.
- Added stable logical keys using generation-set ID plus generation sequence.
- Added strict pattern-point correspondence and monotonic scheduled-time validation.
- Added signed single- and multi-trip shifts. Net shift seconds and the `times` provenance flag remain visible on generated trips.
- Added pattern-change previews and apply operations. A changed pattern and the `patternId` provenance flag are retained.
- Added regeneration previews covering additions, removals, changed and unchanged trips, overwritten time/pattern overrides, affected blocks, and removed block references.
- Added confirmed regeneration application that reuses IDs for surviving generation positions and removes deleted revenue-trip activities from blocks with normalized sequences.
- Added application-level `TripGenerationService` ports and coordinator. It consumes repository behavior and contains no React, Dexie, or IndexedDB code. Transactional persistence is Package 2E.

## Override decision

Decision 0008 records the accepted representation: materialized `patternId` and `stopTimes`, provenance flags, and optional signed `manualTimeShiftSeconds`. Regeneration overwrites both override types after confirmation.

## Example regeneration preview

For a three-trip set reduced to two trips:

- Added: 0
- Removed: 1 trip
- Changed times: 1 surviving trip
- Unchanged: 1 surviving trip
- Manual time shifts overwritten: 1 trip
- Manual pattern changes overwritten: 0 trips
- Affected blocks: 1 block
- Block references removed: 1 revenue-trip activity

The preview is data only. No repository write occurs until the caller applies it.

## Files changed

- `src/domain/types.ts`
- `src/domain/trips.ts`
- `src/domain/trips.test.ts`
- `src/application/ports.ts`
- `src/application/tripGenerationService.ts`
- `docs/data-schema.md`
- `docs/decisions/0008-trip-override-representation.md`
- `architecture_overview.md`
- `codex.md`
- `docs/implementation/phase-02-runtime-trip-generation.md`

## Verification

- TypeScript typecheck: passed.
- Vitest: 12 test files and 51 tests passed.
- Production Vite build: passed.
- Domain tests cover count and inclusive end-time generation, multiple runtime bands, runtime gaps, extended times, stable IDs during regeneration, signed shifts, pattern changes, monotonic validation, and block-reference removal.
- No persistence schema or Dexie changes were made. Package 2E must add repository methods, transactions, backup/CSV coverage, and 500-trip capacity checks.

## User verification

Please review the override semantics and preview language:

1. A shift stores a signed net seconds offset and retains the `times` override flag, even if later shifts partially cancel.
2. A pattern change stores the selected materialized pattern and retains the `patternId` override flag.
3. Regeneration overwrites both override types only after a preview is accepted.
4. Surviving generation sequences retain trip IDs; removed sequences are removed from blocks; new sequences are unassigned.
5. A missing runtime band blocks generation with a planner-facing equivalent of “No run time defined for this time period.”

## Recommended next package

Package 2E, trip persistence, transactions, backup, and CSV, is next. Luna is recommended because it is bounded structural persistence work. Do not begin it until this package is verified.
