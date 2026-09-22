# Phase 2R-B Closeout: Direction, Runtime, and Ordering Foundations

## Status

Accepted for implementation verification on 2026-09-11. Package 2R-B is complete. Package 2R-C is not started.

## Delivered

- Added route-owned directions and ordered timetable columns with stable identifiers.
- Added pattern direction ownership, pattern-point column mappings, deterministic ordering, and repeated-node support.
- Added directional validation for missing, cross-route, duplicate, and incompatible references.
- Added canonical Weekday, Saturday, Sunday, Holiday sorting.
- Added runtime-duration parsing and formatting for decimal minutes, standard `MM:SS`, and displayed `:MM` / `:MM:SS` values.
- Added runtime calculation revisions and runtime source fields on trip provenance.
- Added idempotent Default profile and standard-service-day assignment provisioning.
- Added explicit runtime profile rename and safe deletion with replacement requirements.
- Follow-up correction: database version 2 adds the `runtimeProfileId` assignment index required by safe profile deletion and replacement.
- Added IndexedDB/in-memory direction persistence and direction-aware backup clone/validation support.
- Added direction and direction-column CSV serializers.

## Verification

- TypeScript typecheck: passed.
- Vitest: 75 tests passed across 14 files.
- Existing Phase 1 and original Phase 2 tests remain passing.

## Boundary

This package did not establish Route or Trips layout, styling, focus behavior, keyboard behavior, accessibility, or other UX decisions. The current generation-set UI remains until Package 2R-D. The authoritative-trip command and persistence replacement remains Package 2R-C.

## Next gate

User verification is requested before Package 2R-C. Recommended next package: Package 2R-C, Luna, for authoritative trip commands, transient additive generation, Add Trip, pattern changes, recalculation, and revised trip persistence.
