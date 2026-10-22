# Code Review Fix Log

## Next sitting

Sitting 4A is in progress (Setup, P01, P02). P01 is done. This note is rewritten at the end of every sitting.

## About this log

In October 2026 a staged code review examined the whole repository: governance, domain correctness, persistence, application layer, UI/UX, and performance and build. It produced an issue register (I-001 to I-101), fix packages, and user decisions 1-18 and C1-C8. Stage 4 resolves those issues one package at a time, in sittings.

The review documents are not on `main`. They live only on the branch `claude/upbeat-ritchie-51mpy5` (decision C6):

- `docs/review/code-review-plan.md`: the review plan; Section 9 governs Stage 4.
- `docs/review/fix-packages.md`: package definitions, owned files, acceptance criteria, sitting plan.
- `docs/review/issue-register.md`: every issue with ID, severity, and package.
- `docs/review/user-decisions.md`: decisions 1-18 and C1-C8.
- `docs/review/findings/phase-*.md`: per-finding Location, Evidence, and Governing source.
- `docs/review/golden/`: read-only reproductions. Each package ports the ones it needs into `src/**/*.test.ts` or `tests/ui/`.

Read them with `git show origin/claude/upbeat-ritchie-51mpy5:<path>`.

How to read the fix log: one section per package, newest last. Each section records the issues fixed (register ID, finding ID, severity), the user decisions implemented, what changed in plain English, tests added, the exact verification run, documentation updated, residual risks, and the commit hash. Finding IDs such as `4-001` are `<phase>-<number>` from the findings files. The fix log does not replace the register; sitting 4K adds a final map from every register issue to its package and commit.

## Setup (sitting 4A)

Brought three review-branch changes to this branch: the `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override in `playwright.config.ts` (review commit `9748db0`), the `codex.md` section "Browser tests in environments with a preinstalled Chromium", and the A-006 whole-dollar display correction in `docs/implementation/phase-05-costing.md` (review commit `d33ac1c`).

## P01: Scenario-wide writes re-read current data

- Date: 2026-10-22. Sitting 4A. Model: Sonnet (main session). Independent diff review by an Opus sub-agent.
- Type: structural. Severity: S0.
- Commit: recorded in the P02 section's "P01 commit" line (the hash is only known after this commit).

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-001 | 4-001 | S0 | Service day edits (and Scenario rename, New route, Duplicate route) wrote the page's startup copy of the Scenario over newer Trips, Blocks, and Runtime profiles. A no-change blur of the Service day name was enough. Duplicate scenario copied the same old copy. |
| I-016 | 3-009 | S2 | Runtime "Copy from day" always failed on IndexedDB because its transaction did not list the `patterns` and `serviceDays` stores it reads. |
| I-025 | 4-009 | S2 | Build Trips and Add Trip stored Trips for a Trip profile that no longer existed. |

User decision implemented: decision 6 (3-009 is S2 and is fixed in the first structural package).

### What changed

- `RouteDefinitionRepository` gains `updateScenarioRecords(scenarioId, change)` (`src/application/ports.ts`). It reads the stored Scenario inside the write transaction, applies the change, and writes the result. It rejects when the Scenario no longer exists. Returning the unchanged records writes nothing. Dexie and in-memory repositories implement it. The Dexie table list for Scenario writes moved into one private method used by both writes.
- `updateServiceDay`, `renameScenario`, `addRoute`, and `duplicateRoute` use it. The `records` argument now only identifies the Scenario; the caller's copy is never written. Each returns the records it wrote, and the interface already replaces its copy with that result, so the interface copy is refreshed.
- `updateServiceDay` writes nothing, and publishes no save status, when the patch matches the stored Service day. Before: every blur wrote.
- `duplicateScenario` copies the stored Scenario, not the caller's copy.
- `commitRuntimeCopyAtomically` lists `patterns` and `serviceDays` in its transaction.
- `insertTripsAtomically` (both repositories) rejects a Trip whose Trip profile is missing or belongs to another Scenario ("The selected Trip profile is no longer available."). Trips with no `tripProfileId` (legacy shape) are still accepted.
- Decision record `docs/decisions/0036-scenario-wide-writes-reread-stored-data.md`; `architecture_overview.md` persistence text updated.
- New shared browser-test support under `tests/ui/support/`: `dexieEnv.ts` (page bootstrap on real IndexedDB, ported from the review's `p3-env.ts`) and `goldenFixture.ts` (golden project loader). Packages P02 and later use them. These two files are not on the package's owned-file list; they are test helpers required by its owned spec.

### Tests added

- `src/application/routeDefinitionService.test.ts`, "Scenario-wide writes re-read stored records" (7 tests): each of the four commands and Duplicate scenario keeps a Trip edit, a new Trip, a new Block, and a renamed Runtime profile saved after the caller took its copy; a no-change Service day patch writes nothing; a deleted Scenario is not recreated.
- `src/application/tripGenerationService.test.ts`, "Trip generation validates the Trip profile inside the write" (3 tests): Build Trips and Add Trip reject a missing profile and store nothing; an existing profile still works.
- `tests/ui/scenario-write-safety.spec.ts` (8 tests, real IndexedDB, Federal BRT project): Service day blur after Build Trips (987 Trips kept, also after reload); Trip edit + new Block + Runtime rename kept after a Service day name change; Rename scenario, New route, Duplicate route, and Duplicate scenario each driven through the UI after Build Trips; Runtime "Copy from day" in independent and shared modes; Build Trips for a deleted Trip profile is rejected with no Trip stored.
- Each new test failed on the code before the fix (9 of the 10 unit tests failed, the tenth being a control that must keep passing; all 8 browser tests failed) and passes after it.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 29 files, 215 tests passed (205 before).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 22 passed, 7 failed. The 7 are the known baseline failures (I-006): `trip-table-layout.spec.ts:40` and `unified-action-layer.spec.ts:83, 112, 140, 169, 186, 226`. The baseline run on the unchanged branch was 14 passed, 7 failed, so the 8 new tests are the only change.
- `pnpm build`: succeeds (only the existing chunk-size warning).

### Independent review (Opus)

Confirmed all five acceptance criteria. Findings and disposition:

- Confirmed: `RouteDefinitionService.deleteNode` has the same defect class. It writes the caller's single-Route Nodes and Patterns into a whole-Scenario write, which deletes the other Routes' Nodes and Patterns. It is the latent S0 path 3-008. Not fixed here: no UI control reaches it (the interface's `deleteNode` function in `App.tsx` is never referenced), and package X01 deletes it (decision C7). Handed off to X01.
- Accepted and fixed: the Trip-profile check also verifies that the profile belongs to the Trip's Scenario. The Duplicate route browser test now identifies the original Route by id.
- Rejected: reading the `tripProfileId === undefined` case as a defect. Generation without a profile is an existing legacy path that other tests use; D0016 normalization belongs to the Trip-profile work, not this package.
- Speculative, recorded as residual: Trips CSV import and Trip "Copy from day" do not check that the Trip profile exists (P07/P09 own those stale checks); `deleteRoute`, `deletePattern`, and `commitRouteEdit` read fresh data before their write rather than inside it (P02's single-writer model covers them); the interface still passes its older Scenario copy to CSV export and to the Trips and Blocking workspaces for display (U02/U03 own display refresh).

### Residual risks

- Two browser tabs can still overwrite each other until P02.
- `saveScenarioRecords` remains for whole-Scenario operations whose callers read the records just before (Scenario creation, Route and Pattern deletion, safe route edits).
