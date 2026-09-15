# Phase 2 Package 2F Closeout: Trip-Building UI/UX

## Status

Implemented on 2026-09-11. Paused for hands-on Trips-tab verification. Package 2G is not started.

## Delivered result

- Added a generation-set editor for the selected service day. It supports first departure and headway plus either an inclusive final departure or a trip count.
- Added a preview-before-write dialog for initial generation and regeneration. The dialog reports generated, added, changed, and removed trips; it also calls out overwritten manual shifts or pattern changes and future block references affected by removed trips.
- Added one compact, departure-sorted materialized schedule for the selected service day. It shows pattern, departure, arrival, duration, generation set, override status, read-only block label, and row actions.
- Kept scheduled-point times compact by expanding them only on request within each trip row.
- Added checkbox multi-selection and signed whole-minute shifting.
- Added individual pattern-change selection, recalculation preview, confirmation, and user-facing runtime-gap feedback.
- Added Trips-tab composition through `TripGenerationApplication`; React continues to use application behavior rather than persistence or scheduling logic directly.
- Corrected initial generation persistence so the generation set, its trips, and affected blocks are saved atomically. Added generation-set listing and assigned-runtime-profile resolution application queries.

## Files changed

- `src/ui/App.tsx`
- `src/styles.css`
- `src/main.tsx`
- `src/application/ports.ts`
- `src/application/tripGenerationService.ts`
- `src/domain/trips.ts`
- `src/persistence/inMemoryRepository.ts`
- `src/persistence/dexieRepository.ts`
- `src/application/tripGenerationService.test.ts`
- `docs/ui-conventions.md`
- `docs/data-schema.md`
- `docs/implementation/phase-02-runtime-trip-generation.md`
- `architecture_overview.md`
- `codex.md`

## Verification

- TypeScript typecheck: passed.
- Vitest: 12 test files and 57 tests passed.
- Production Vite build: passed.
- Browser review: created and previewed a 138-trip, seven-minute schedule; confirmed generation, schedule rendering, compact timepoint expansion, and dense table behavior.
- No React UI-test harness is configured. Pattern-change confirmation was code-reviewed but requires a second usable pattern and assigned runtime profile for hands-on verification.

## User verification

1. Create a weekday generation set with a seven-minute headway over an all-day span. Confirm the preview, create action, and compact schedule are usable.
2. Add a short, offset, or staggered pattern with an assigned runtime profile. Confirm it appears in the same materialized schedule in departure order.
3. Create a trip whose departure or arrival is after midnight. Confirm that `25:00`-style times never wrap.
4. Select one and then several trips. Apply positive and negative whole-minute shifts and confirm the amber override marker and updated times.
5. Change one trip to a different pattern with a runtime profile. Review the recalculation preview, cancel once, then confirm once.
6. Edit a saved generation set. Review regeneration effects, cancel once, then confirm once; verify that manual overrides are clearly identified before replacement.

## Recommended next package

Package 2G, integration and Phase 2 acceptance, is next. The primary agent should lead cross-layer review. Use Luna only for bounded structural corrections and Terra only for UX corrections exposed by the verification checklist. Do not begin it until this package is verified.
