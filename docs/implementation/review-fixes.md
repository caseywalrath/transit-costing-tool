# Code Review Fix Log

## Next sitting

**Sitting 4C: P05 (Browser test-suite repair) and X01 (Dead code removal).** Main session: Sonnet. Sub-agent: Haiku for the X01 deletions only, with an exact file and line list and a mechanical check (typecheck, a grep that returns nothing). No Opus reviewer: P05 is test-only (S2) and X01 is S3. After 4C the full browser suite must be green; every later sitting relies on it.

- Prerequisite: the sitting 4B pull request (branch `claude/stage-4b-review-fixes`) must be merged into `main`. If it is not, stop and ask the user. Start 4C from current `origin/main`.
- Known browser-suite state after 4B: 51 tests, 44 passed, 7 failed (`trip-table-layout.spec.ts:40`; `unified-action-layer.spec.ts:83, 112, 140, 169, 186, 226`). These are P05's I-006 set. The `:140` test fails on `toHaveText` when run alone and sometimes on a click timeout under parallel load.
- `blocking-workspace.spec.ts` is flaky at its "Add node" step under load (seen at `:116`, `:180`, and `:251` across sittings 4A and 4B). It is the L-16 race that P05's `createShiftReadySchedule` fix targets. It is not caused by any 4A or 4B change.
- Specs added in 4A and 4B that P05 must leave passing: `scenario-write-safety`, `single-tab`, `scenario-copy-recovery`, `backup-import`. Shared helpers are in `tests/ui/support/` (`dexieEnv.ts`, `goldenFixture.ts`). `costing-workspace.spec.ts` waits for the app before seeding (4A hand-off), and `database-migration.spec.ts` now expects IndexedDB version 70 for Dexie version 7 (4B hand-off; P06 owns its seed-version change).
- X01 deletes `RouteDefinitionService.deleteNode` (the latent S0 path 3-008, handed off from P01) and the dead generation-set UI, handlers, and exports. It must keep the `generationSets` table and backup parsing (decision 13), including the version 3 import path in `backup.ts`.
- Open questions for the user, not blocking 4C: (1) the Block-label rule (see P04, Independent review): enforce DS-20 when a Block is created or renamed, or relax the import check; (2) clean-up of placeholder Blocks already stored in databases that imported version 3 and 4 files; (3) presenting the import report and the recovery findings belongs to U02.
- Review documents: read them from the review branch with `git show origin/claude/upbeat-ritchie-51mpy5:docs/review/<file>`.

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
- Commit: `b9df89d`.

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

## P02: Single active tab

- Date: 2026-10-22. Sitting 4A. Model: Sonnet (main session). Independent diff review by an Opus sub-agent.
- Type: structural. Severity: S0.
- P01 commit: `b9df89d`. P02 commit: `4de45c9`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-002 | 4-002, 4-021 | S0 | A second tab silently deleted or reverted data saved in the first: Route and Node edits, Scenario-wide writes, Runtime band values, Costing assumptions, a deleted Project recreated as orphan rows, Build Trips for a deleted Trip profile. A tab on an older schema kept writing after another tab upgraded the database. Stale checks outside the write transaction mattered only because of this. |

User decision implemented: decision 10 (one active tab; other tabs read-only; Dexie `versionchange` handler in the same package). Finding 4-021 is accepted under the single-writer model (Decision 0037, item 7).

### What changed

- New `src/persistence/tabGuard.ts`: `TabGuard` holds a Web Locks lock `transit-costing-tool.active-tab` for the life of the page. A later tab waits up to 1.5 seconds (covers a reload while the old page is closing), then becomes read-only and withdraws its lock request. Without Web Locks, tabs elect an active tab over a `BroadcastChannel` (lower random id wins a simultaneous start; each tab repeats its claim once because a channel only hears messages posted after it exists). `ReadOnlySessionError` carries the plain-language message.
- `src/persistence/database.ts`: `TransitDatabase(name, guard?)`. With a guard, a Dexie DBCore middleware rejects every write to every table with `ReadOnlySessionError`, so no repository, including Blocking and Costing, can bypass it. A `versionchange` event marks the tab read-only (`databaseUpgraded`) and closes the connection so another tab's upgrade can run.
- `src/main.tsx`: awaits the guard before the application builds its database; passes the guard in. Startup moved into an async function.
- `src/application/ports.ts`: `SessionStatus`, `SessionReadOnlyReason`, and `SessionStatusQueries` (the read-only status port for U02). No new interface: the existing error banner shows the rejection.
- Behavior before: two tabs wrote last-writer-wins. After: only the first tab writes; the second shows its data, and any save is rejected with "This tab is read-only because the Transit Costing Tool is open in another tab. Close the other tab and reload this one to edit here." A read-only tab never promotes itself. Closing the active tab and reloading another tab makes it active.
- Decision record `docs/decisions/0037-single-active-tab.md`; `architecture_overview.md` persistence section.
- Hand-off (file outside the package's owned list): `tests/ui/costing-workspace.spec.ts` now waits for the app to render before seeding IndexedDB directly. The spec assumed the app had created the database by the time `page.goto('/')` returned. Starting the application after the lock is acquired moves that moment slightly later. P05 owns this file.

### Tests added

- `src/persistence/tabGuard.test.ts` (7 tests): first tab active and second read-only; read-only before the answer is known; no self-promotion after the active tab closes, a reload can become active; upgrade reason and subscriber notification; BroadcastChannel fallback (lone tab, later tab, simultaneous start with one winner).
- `tests/ui/single-tab.spec.ts` (13 tests, real IndexedDB, two tabs in one browser profile): the six review overwrite cases (Node added then Route edit; Route rename then Short name edit; Route added then annual-count edit; Block reorder then annual-count edit; Runtime band values; Costing assumptions), the deleted-Project case, Build Trips (read-only message; deleted Trip profile), the older-schema tab after another connection upgrades the database (B1-09), closing the active tab then reloading the other, read-only tab can open every workspace, and the Blocking stale-source control in the active tab. In the review's cases the stale tab was the one that saved second; here the first tab to load is active and the stale tab is read-only, so each test asserts that the read-only tab's write is rejected and stores nothing and that the active tab's data is intact.
- `tests/ui/single-tab.spec.ts` also has "a read-only tab can still run a database upgrade" (a version 4 database opened by a read-only tab is upgraded; ordinary saves in that tab are still rejected). It failed before the middleware exemption described under the review below.
- Without the guard wired into `main.tsx`, 9 of the first 13 fail; the 4 that still pass are the controls and behaviors that do not depend on the guard (closing the active tab, opening every workspace, the Blocking control, the P01 deleted-profile check).

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 30 files, 223 tests passed (215 after P01; +8 `tabGuard.test.ts`).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 36 passed, 7 failed. The 7 are the known baseline failures (I-006), with the same error messages as the baseline run (`trip-table-layout.spec.ts:40`; `unified-action-layer.spec.ts:83, 112, 140, 169, 186, 226`). The 22 tests that passed after P01 plus 14 new `single-tab.spec.ts` tests make 36; every earlier test still passes.
- `pnpm build`: succeeds (only the existing chunk-size warning).

### Independent review (Opus)

Confirmed all four acceptance criteria and found no unprotected write path (Dexie sends add, put, delete, clear, bulk operations, `Collection.modify`, and `Collection.delete` through the guarded hook; `src/` has no raw `indexedDB` use). Disposition:

- Confirmed and fixed: Dexie runs schema-upgrade transactions through the middleware, so a read-only tab that had to run a content upgrade (database.ts versions 3 and 4 write data) would fail its upgrade and leave both tabs unusable. The middleware now lets writes through in `versionchange` mode. New test above.
- Confirmed and fixed: an older tab that went read-only after an upgrade kept the lock, so no tab could write. It now releases the lock when it goes read-only (unit test added).
- Accepted and recorded in Decision 0037: the 1.5-second reload wait, the `BroadcastChannel` fallback's 250-millisecond window, back-forward cache pages, and deleting the database showing the upgrade message.
- Accepted as is: `DexieRouteDefinitionRepository` and `DexieBlockingRepository` still default to an unguarded `new TransitDatabase()`. Only `main.tsx` builds the production database and it passes the guard. Making the guard mandatory would change every test fixture; Decision 0037 item 4 records it.
- Strengthened: the older-schema test now also requires the error banner. The Build Trips deleted-profile test accepts either rejection message on purpose, because P01's check fires first there; the read-only message is asserted by the neighbouring test.

### Residual risks and hand-offs

- U02 must present `SessionStatus` (the read-only status port) so a read-only tab shows its state before a save fails, disables editing controls, and replaces the generic message a closed database produces. The data-safety package P10/U02 owns it.
- `tests/ui/blocking-workspace.spec.ts:116` is flaky under repeated parallel load (about 1 run in 8 times out at "Add node"). It fails the same way on the P01 commit without the guard, so it is not caused by P02. P05 owns the browser suite.
- Other pre-existing risk unchanged: GitHub Pages sibling sites share the origin (decision C5, P10).

## P03: Scenario duplication remap and recovery

- Date: 2026-10-22. Sitting 4B. Model: Sonnet (main session). Independent diff review by an Opus sub-agent.
- Type: structural. Severity: S1.
- Commit: `d80d801`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-004 | 3-002 | S1 | Duplicate scenario stamped every copied Block with the copy's first Trip Profile. With Blocking Scenarios on two Trip Profiles the save failed ("Block ... cannot reference a Trip from another Trip profile"); with one profile it added a Trip Profile to every normalized Block, against Decision 0019 item 9. |
| I-005 | 3-006, A-004 | S1 | Duplicate scenario did not remap the Node of pull-out, deadhead, and pull-in activities. All 138 such references in a copy of the Federal BRT project named the source's Nodes: the Nodes showed blank, the edit dialog held the source ID, bulk apply matched nothing, and a copied Block with a deadhead dropped out of Costing. |

User decisions implemented: decision 4 (repair Scenarios already duplicated, on load) and decision C8 (copies whose source Scenario no longer exists).

### What changed

- `src/domain/project.ts`: `duplicateScenario` applies its Node map to `fromNodeId` and `toNodeId` of every non-revenue activity. A Block that has a Blocking Scenario keeps no `tripProfileId` in the copy. A legacy Block without a Blocking Scenario keeps its Trip Profile, remapped to the copy's profile (the copy's first profile when it had none, as before).
- New `src/domain/scenarioCopyRecovery.ts` (pure): `recoverScenarioCopyNodeReferences` repairs Scenarios copied by the older code. It touches only Blocks of a Scenario that records a `sourceScenarioId`, and only `fromNodeId` and `toNodeId` of non-revenue activities. A Node of another Scenario maps to the copy's Node by Route name and Node name; a repeated name maps by position when both Routes list the same names in the same order. Where a Scenario in the copy's lineage no longer exists, pull-out To, pull-in From, and deadhead From and To are taken from the adjacent Trip endpoints (C8); an optional garage end (pull-out From, pull-in To) that names a missing Node is cleared; every reference it cannot repair gets a finding that names the Block. Unchanged Blocks are returned as the same objects.
- `src/persistence/database.ts`: Dexie version 7 changes no store. Its upgrade runs the recovery once over all Scenarios in the database and writes only the Blocks that changed. It runs in a read-only tab too, because the write guard of Decision 0037 lets upgrades through. A recovery that throws is logged and skipped so the database still opens.
- `src/persistence/backup.ts`: `parseProjectBackupWithReport` runs the recovery after the Block checks and returns `{ snapshot, report }` (`recoveredNodeReferences`, `recoveryFindings`). `parseProjectBackup` is unchanged for callers.
- Behavior before: Scenarios duplicated before this change, and backups of them, kept pointing at the source's Nodes; a second Trip Profile made Duplicate scenario fail. After: new copies are correct, old copies are repaired when the app first opens at database version 7, and an old backup of a copy imports repaired.
- Decision record `docs/decisions/0038-scenario-copy-node-references-and-recovery.md`; `docs/data-schema.md` migration history (version 7); `architecture_overview.md` (schema version 7, copy and recovery text).

### Tests added

- `src/domain/project.test.ts` (5 tests): no reference back to the source Scenario on the golden project (was 138); pull-out, deadhead, and pull-in Nodes map to the same Node in the copy; a copied Block with a deadhead keeps the source's eligibility, hours, and findings; normalized Blocks of two Blocking Scenarios on different Trip Profiles copy with no Block Trip Profile and pass the Trip Profile check; legacy Blocks keep and remap their Trip Profile.
- `src/domain/scenarioCopyRecovery.test.ts` (15 tests): the 140 leaking references (138 plus a deadhead) are repointed and nothing else changes (recovered copy equals a correctly made copy, byte-equal outside the Node fields); idempotent; a Scenario that is not a copy is left alone; an unknown Node in an intact lineage is left and reported; copy of a copy; a Pattern renamed after duplication; same-named Nodes kept apart by position; unique name mapped when the order changed, repeated name left; renamed Node and renamed Route are reported; C8 inference from adjacent Trips; garage ends cleared with a finding naming the Block; a required end with no Trip is reported and left; copy of a copy with the first source deleted.
- `src/persistence/backup.test.ts` (4 tests): a backup of a leaky copy imports with 138 references repaired and every other record as exported; the recovered backup round trips; import-as-copy of it has no reference to the source; a copy whose source is not in the file is inferred (C8).
- `tests/ui/scenario-copy-recovery.spec.ts` (4 tests, real IndexedDB, Federal BRT project): Duplicate scenario with Blocking Scenarios on two Trip Profiles succeeds on IndexedDB and in memory with no Block Trip Profile; a version 6 database holding a copy with 138 leaking references has none after the version 7 upgrade and equals a correctly made copy (no other table changes); the same with the source Scenario deleted (C8); the upgrade runs in a read-only tab while its ordinary writes stay rejected.
- Before the fix: 4 of the 5 new `project.test.ts` tests failed (the legacy-Block test is a control that must keep passing), 2 of the `scenarioCopyRecovery` tests (the ones that compare with a correctly made copy) failed, all 4 browser tests failed (Duplicate scenario threw "cannot reference a Trip from another Trip profile"; the database stayed at version 6), and 3 of the 4 `backup.test.ts` tests failed with the recovery call removed. The recovery module was written against its tests; three of its tests were added after the review (below) from the reviewer's confirmed probes.
- Shared test support, new: `src/testSupport/goldenBackup.ts` and `rawImports.d.ts` (golden project fixtures for unit tests, read through Vite's `?raw` import because `@types/node` is not installed). Package P04 uses them.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 31 files, 247 tests passed (223 before: +5 project, +15 recovery, +4 backup).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 40 passed, 7 failed. The 7 are the known baseline failures (I-006): `trip-table-layout.spec.ts:40` and `unified-action-layer.spec.ts:83, 112, 140, 169, 186, 226`. The baseline on `origin/main` in this session was 36 passed, 7 failed, so the 4 new tests are the only change. One baseline run showed `:140` failing on a click timeout instead of `toHaveText`; run alone three times, it fails on `toHaveText` both on untouched `origin/main` and on this branch, so the difference is load, not this change.
- `pnpm build`: succeeds (only the existing chunk-size warning).

### Independent review (Opus)

Confirmed all five acceptance criteria (the original golden reproductions, run with `it.fails` removed, pass; the ported tests fail when the fix is reverted). Findings and disposition:

- Confirmed and fixed: renaming one Pattern, in the source or the copy, shifted the position rule and left all 140 references unrepaired. Names that are unique in the Route now map by name; position is used only for repeated names, and only when both Routes list the same names in the same order.
- Confirmed and fixed: a copy of a copy whose first source was deleted (S0 → S1 → S2, S0 gone) was skipped silently, because its direct source still existed. The C8 test now follows the whole `sourceScenarioId` chain. A Node that exists nowhere in an intact lineage is now reported as a finding instead of skipped.
- Confirmed and fixed: wrong Node when names repeat and a Route was reordered. Position is trusted only when both Routes list identical names in identical order. The remaining case (a palindromic name list) cannot be told apart and is recorded in Decision 0038.
- Accepted and fixed: a recovery error would have stopped the database from opening; it is now logged and skipped.
- Accepted as is: copies that lost their `sourceScenarioId` (import-as-copy of a file without the source, by earlier code) are not recognized and stay unrepaired; recovery findings are not shown anywhere yet; garage-end clearing can also apply to references left by Node deletion (3-007) in a copy whose lineage is broken. All recorded in Decision 0038.

### Residual risks and hand-offs

- Hand-off (U02, with P12 and P14): present `recoveryFindings` and `recoveredNodeReferences` after an import, and a Blocking rule that flags an activity Node outside its Scenario. The findings from the database upgrade can be recomputed by running the recovery on the stored data; nothing calls it yet.
- Hand-off (files outside the package's owned list): `src/persistence/database.test.ts` and `src/persistence/repository.test.ts` assert the schema version, now 7; `tests/ui/database-migration.spec.ts` expects the upgraded IndexedDB version 70 (was 60). Only the version numbers changed. P06 owns these files.
- What could still be wrong: a Route renamed or Nodes renamed or removed after duplication leave references unrepaired (reported, not guessed); the upgrade reads every Trip and Block into memory once (the Federal BRT project is about 2 MB); a leak whose Node was deleted from a live source is reported, not repaired.
- `tests/ui/blocking-workspace.spec.ts` is flaky at its "Add node" step under parallel load (one failure in about 4 full runs; the documented race, not caused by this change). P05 owns the browser suite.

## P04: Backup import normalization and validation

- Date: 2026-10-22. Sitting 4B. Model: Sonnet (main session). Independent diff review by an Opus sub-agent.
- Type: structural. Severity: S1.
- Commits: `83c057e` (implementation) and `60c2477` (review fixes and this entry).

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-003 | 3-001 | S1 | Parsing stamped every Block without a `tripProfileId`, normalized Blocks included, with the last Trip Profile of its Scenario. A backup with Blocking Scenarios on two or more Trip Profiles could not be restored through the app (import is always import-as-copy and re-parses), and with one profile `export(import(file))` added a `tripProfileId` to every Block. |
| I-010 | 1-010 | S2 | Version 3 and 4 backups imported their placeholder Blocks (no Blocking Scenario), against Decision 0019 item 13. They were invisible in Blocking and Costing but inflated deletion counts and persisted into later backups. |
| I-017 | 3-005 | S2 | Import accepted dangling, cross-Scenario, duplicate, and negative Block and Trip data, and two inputs (a generation set without `limit`, a Trip without `provenance`) reached the planner as raw `TypeError` text. |

### What changed

- `src/persistence/backup.ts`:
  - No `tripProfileId` is added to a normalized Block; a stamped one from an older export is dropped when it equals the Blocking Scenario's profile and rejects the file when it differs.
  - A Block whose `blockingScenarioId` is absent, null, or empty is a placeholder: discarded in any file version and counted. A malformed value rejects the file.
  - New checks, all before any write: Trip needs a `provenance` object, a Route, Pattern (on the Trip's Route), and service day of its own Scenario, and may not repeat a stop; Block's service day belongs to its Scenario; Block labels unique per Blocking Scenario and service day; activities need a unique `id`, a supported `type`, a whole `sequence`, numeric time, offset, and mile fields, and Node references in the Block's Scenario; every Block passes `validateBlockingBlock` (structural findings, except gaps in `sequence`); each Trip is assigned once per Blocking Scenario (`validateBlockingAssignments`); a generation set needs a `limit`.
  - A reference in a Scenario copy that P03's recovery reported as unrepairable does not reject the file; it is in the import report.
  - Any remaining `TypeError` or `RangeError` becomes "Invalid project backup: the file contains data in an unexpected form", with the original kept as `cause` and written to the console.
  - `BackupImportReport` gains `discardedPlaceholderBlocks`. Messages name the Block's position in the file.
- `src/persistence/backupRepository.ts`: `ProjectBackupService.importProjectWithReport(payload, mode)` returns `{ project, report }`; `importProject` is unchanged for callers.
- Behavior before: a two-profile backup was refused after export; v3/v4 placeholder Blocks were kept; malformed Block and Trip data was stored. After: those restore, are discarded and counted, and are refused with a readable message and no write.
- Decision record `docs/decisions/0039-backup-import-normalization-and-validation.md`; `docs/data-schema.md` ("Import rules"); `architecture_overview.md` (backup text); Decision 0038 consequence updated.

### Tests added

- `src/persistence/backupImportValidation.test.ts` (64 tests): the 3-001 cases (parse leaves normalized Blocks without a Trip Profile; the app import path restores two Blocking Scenarios on two Trip Profiles with Block counts per Blocking Scenario unchanged; `export(import(golden))` equals the original for every key but `exportedAt`; an older stamped profile is dropped, a mismatching one rejects); the 1-010 cases (69 placeholder Blocks discarded and counted for v3 and v4; stored deletion count 0; the count through the service; a placeholder in a current file; zero for golden); versions 1 to 6 import through the app path; the whole case table of `phase-3.md` Section 4 (every accepted-but-should-reject row and both `TypeError` paths reject with a matching message and no repository write; the accepted-by-design rows import); import-as-copy of a Trip without `provenance`; prototype keys inert; a 20-fold Trip file inside the time budget; recovery and validation together (C8 inference through a file, a cleared garage end with a finding, an unrepairable required end and a renamed-Route copy that import with findings, sequence gaps, a malformed `blockingScenarioId`, the Block position in a message, the `cause` kept).
- `src/persistence/backup.test.ts`: the P03 tests no longer need a workaround for stamped Trip Profiles.
- `tests/ui/backup-import.spec.ts` (4 tests, the Import JSON control on real IndexedDB): a two-Trip-Profile backup restores with Block counts per Blocking Scenario unchanged and no Block Trip Profile; a version 4 backup imports with no Blocks; a Trip assigned to two Blocks and a pull-out Node outside its Scenario are refused with a readable message in the error banner and nothing written.
- Before the fix (on the P03 code): 30 of the first 56 unit tests failed (the others were controls, the rows already rejected, and the accepted-by-design rows); all 4 browser tests failed (restore refused, 69 placeholder Blocks kept, both malformed files accepted).

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 32 files, 311 tests passed (247 after P03; +64 `backupImportValidation.test.ts`).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 44 passed, 7 failed. The 7 are the known baseline failures (I-006), the same tests as before: `trip-table-layout.spec.ts:40` and `unified-action-layer.spec.ts:83, 112, 140, 169, 186, 226`. 40 passed after P03, plus the 4 new tests. In one full run `:140` failed on a click timeout instead of `toHaveText`; alone it fails on `toHaveText` on untouched `origin/main` too, so the difference is load.
- `pnpm build`: succeeds (only the existing chunk-size warning).
- Schema versions: the JSON backup schema is still 6 (asserted by the existing export tests); the Dexie schema is 7 (P03).

### Independent review (Opus)

Confirmed all four acceptance criteria, found every case-table row and both `TypeError` paths rejected before any write, and found no other importer that bypasses `parseProjectBackup`. Findings and disposition:

- Confirmed and fixed: a Scenario copy whose Node references recovery could not repair (a Route renamed after copying, a copy that lost its `sourceScenarioId`) made the whole file unrestorable, although earlier versions imported it. Such references are now reported in the import report and the file imports. A wrong reference in a Scenario that is not a copy still rejects.
- Confirmed and fixed: a `blockingScenarioId` that was present but malformed made the Block a placeholder and dropped it silently; it now rejects.
- Confirmed and fixed: messages named the Block's index after placeholders were removed; they now use the position in the file.
- Confirmed and fixed: the data-schema text claimed every rejection begins "Invalid project backup:"; reworded.
- Accepted and fixed: the catch-all kept no trace of the original error; it now keeps it as `cause` and logs it.
- **Confirmed, not changed, decision for the user:** the application's own default Block label ("Block <count + 1>") can repeat after a Block is deleted, and `createBlock` does not check labels, so the application can create two Blocks with the same label. The acceptance criteria require rejecting duplicate labels (DS-20), so such a database exports a file this import refuses, with a message that names the Blocking Scenario and the label. Renaming one Block and exporting again fixes it. Options: enforce DS-20 when a Block is created or renamed and propose a free label (a later structural package), or relax the import check. Recorded in Decision 0039.
- Speculative, recorded: a version 4 to 6 Trip without a Trip Profile receives its Scenario's last profile and could then fail the Block profile check in a multi-profile file (the Dexie version 3 upgrade stamped every Trip, so none is expected); `validateBlockingBlock` is quadratic in the activities of one Block (20,000 deadheads took 1.7 s) and no size cap exists.

### Residual risks and hand-offs

- Hand-off (U02): present the import report (`discardedPlaceholderBlocks`, `recoveredNodeReferences`, `recoveryFindings`) after an import. `BackupPort.importProject` and `RouteDefinitionService.importProject` still return only the Project, so the planner does not see the count yet. `ports.ts` is outside this package.
- Databases that already hold placeholder Blocks from earlier imports of version 3 and 4 files keep them (they stay invisible and inflate deletion counts) until something removes them. A backup exported from such a database imports without them. No package owns a database clean-up yet.
- What could still be wrong: an unusually large Block validates slowly; Trip Profile defaulting for a version 4 to 6 Trip without a profile is unchanged and takes the last profile; the label rule above.
