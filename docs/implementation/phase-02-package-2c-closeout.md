# Phase 2 Package 2C Closeout: Runtime-table UI/UX

## Status

Implemented on 2026-09-11. Paused for hands-on user verification. Package 2D is not started.

## Delivered result

- Enabled the Trips tab when the selected route has a usable pattern.
- Added selected service-day, pattern, and assigned-profile controls while retaining the established project, scenario, and route context.
- Added a compact runtime profile editor with runtime bands as rows and named pattern segments as columns.
- Added 24-plus time and duration inputs with blur/Enter commit, Escape restore, inline invalid-input feedback, and an explicit distinction between a blank runtime and zero.
- Added profile creation, assignment, copying, and compatible reverse-copy dialogs. New and copied profiles require user-entered names.
- Added local draft editing and explicit save. Domain validation remains authoritative and is translated into planner-facing language without exposing rule identifiers.
- Added horizontal table scrolling with a frozen band-name column for wide patterns.
- Added a narrow application-facade correction so React can use the established runtime repositories without importing persistence code.

## Files changed

- `src/ui/App.tsx`
- `src/styles.css`
- `src/application/routeDefinitionService.ts`
- `src/application/routeDefinitionService.test.ts`
- `docs/ui-conventions.md`
- `docs/implementation/phase-02-runtime-trip-generation.md`
- `architecture_overview.md`
- `codex.md`

## Verification

- TypeScript typecheck: passed.
- Vitest: 10 files and 45 tests passed.
- Production build: passed with Vite.
- The local application was inspected with the existing empty/disabled Trips-tab prerequisite state. A usable pattern was not present in the existing local verification project, so representative runtime entry remains a required user gate rather than a new persistent test-data mutation.
- The project has no UI test harness beyond the application integration test. No test dependency was added for this UI-only package.

## User verification

Using a route with a two-or-more-point pattern:

1. Open **Trips**, select a service day and pattern, and create a named runtime profile.
2. Enter representative Federal Boulevard bands, including one after-midnight boundary such as `25:00`, and enter every segment runtime.
3. Confirm that blank runtimes are rejected clearly, zero remains accepted, overlapping bands are rejected on save, and intentional gaps can be saved.
4. Assign the profile to a second service day, then create an independent copy and verify that edits to the copy do not alter the original.
5. Create or select a reverse-compatible pattern and verify reverse-copy reverses the displayed segment values.
6. Verify horizontal scrolling and keyboard commit/restore behavior at the widths you use for schedule planning.

## Recommended next package

Package 2D, trip generation, overrides, and regeneration domain behavior, is next. Luna is recommended because it is a bounded domain/application package. Do not begin it until this runtime workflow is verified.
