# Phase 3 Closeout: Service-Day Editing Workflows

## Status

Implemented and accepted through Package 3C on 2026-09-14.

## Delivered scope

- Runtime Day copy is target-first and Route-scoped. It covers every usable Pattern, defaults to independent Runtime profiles, and permits explicit profile sharing.
- Trip Day copy is target-first and scoped to one Route and Trip profile. It copies both Directions, replaces only target-Day Trips in that scope, preserves times and calculation provenance, and creates new Trip IDs.
- Empty Trip sources require an explicit reviewed clear-target operation.
- Trip replacement removes affected revenue-trip Block activities while retaining Block records. Blocks and Blocking scenarios are not copied.
- Batch Pattern change previews every selected Trip, rejects a mixed eligible/ineligible batch without writes, and commits eligible batches atomically.
- The UI keeps Runtime copy at Runtime Pattern/Profile context and Trip copy in the Trips More menu. Visible Trips action order remains Build, Add, Regenerate, Shift, Delete.

## Integration findings

- Domain copy calculations remain in `src/domain/serviceDayCopy.ts`.
- Application services own preview freshness checks, validation, and command orchestration.
- In-memory and Dexie repositories apply Runtime and Trip copy writes as complete transactions.
- React consumes previews and application commands; it does not calculate copy impacts, determine eligibility, or create authoritative schedule records.
- Runtime and Trip copy use separate previews, source signatures, and transaction boundaries.
- JSON backup/restore, Scenario duplication, and CSV continue to use the authoritative Trip profile, Route, Day, Direction, Runtime-profile, and Block graph. No schema migration was required.
- Historical generation-set records remain readable for pre-Phase-2R backup compatibility only. They do not participate in Phase 3 commands.

## Verification

- TypeScript typecheck passed.
- Vitest passed: 18 files, 113 tests.
- Playwright passed: 7 layout tests.
- Production build passed.
- Package 3B included keyboard, accessibility, and desktop visual review. The in-app browser could not reach the local server during the final integration pass, but local Playwright coverage and the completed desktop review passed.

The production build reports a non-blocking JavaScript chunk-size warning.

## Deferred work

Phase 4, including Blocking and any follow-on architecture or UI work, is deferred to a later user-approved session. No Phase 4 implementation was started.
