# Code Review Fix Log

## Next sitting

**Sitting 4K part 1 (U08 only) is finished on the branch `claude/stage-4k-review-fixes`, from `origin/main` after the merge of PR #23 (U06, U07, P15, P17). The user must review the branch, open and merge the pull request, and read the first CI run. The next sitting is 4K part 2: D01 on Sonnet, then U09 on Sonnet (recommended placement), then P18 (Sonnet, the Vitest major upgrade, its own package). Start it only after this branch is merged; create a new work branch from the new `origin/main` (the user names it). Standing rules 1 to 10 below apply unchanged. U10 (Opus) stays a sitting of its own after 4K.**

- Done on this branch: U08 (`U08_HASH`). The hash-record commit follows it.
- Not started: D01, U09, U10, P18.
- U08 result: "Regenerate selected" on 480 Trips at the capacity fixture, production build, 5 runs: review 407 to 461 ms (before: 1,043 to 1,300 ms), apply 556 to 587 ms (before: 918 to 1,072 ms). Anchor selection stays available for every Trip. Two layout defects of the dialog that predate U08 are fixed (details in the U08 entry). No decision was blocked.
- Exceptions of the 4K part 1 sitting (user, 2026-10-23), not carried over: Opus main session, no sub-agents, the Decision 0005 gate waived. The user states the exceptions for each sitting.
- **U09 and U10: DECIDED by the user on 2026-10-23. Not started.**
  - **U09 (Sonnet, small UI): why a Trip cannot be recalculated** (option A). One status line under the "Run Times Have Changed" indicator lists the distinct reasons from `inspectStaleTrips` (the message texts exist from P07). Reuse the existing notice/status line styling; no new component. Acceptance: when at least one Trip is flagged and its profile cannot calculate it, the line names each distinct reason once; with no such Trip nothing is shown; a browser test covers both; keyboard and screen-reader behavior as the other status lines (plain text, no focus trap). Verification: UI rules, visual check at 1024 and 1440 px.
  - **U10 (Opus, UI design, beyond the scope of a fix; user will review the result afterward): redesign the Shift drawer.** The overlap of the open drawer with the Runtime Save and Discard buttons is **accepted as is** (option D); do not solve it as a goal of U10 unless the redesign does so as a side effect. The user's brief: the drawer wastes white space; the shifting control (left and right buttons and an up/down minute selector) is confusing; the drawer is valuable because the planner sees the effect of a shift on the Trips table, and that must stay. Wanted: a much more discreet control and a more intuitive increment selector. The agent decides the design and records the options it rejected. Constraints: the preview-then-apply behavior, Undo and Redo (U07), the net-shift label (`formatNetShift`, `formatStagedShift`), the minute parsing rules (`parseShiftSeconds`), keyboard and screen-reader operation, and the existing specs (`workflow-section-layout.spec.ts` asserts the right-docked drawer; it may change only with a recorded reason). Verification: UI rules plus screenshots at 1024 and 1440 px before and after, and the interaction written up so the user can review it.
- **P18 (Vitest major upgrade, 5 advisories in the `vitest` chain):** its own package, not mixed with feature work (user decision 5 below). Not started.
- Known failures: none. `unified-action-layer.spec.ts:139` passed in every full run of this sitting. If it returns, diagnose it as a package failure and fix the code.
- State after U08: unit tests 51 files, 747 tests; browser suite 151 tests, all passing; bundle `index--t3h4Nml.js` 806.22 kB. The user must still read the first CI run (branch protection and CI are the user's to watch).
- Carried forward (details in the U06, U07, P15, P17, and U08 entries):
  - **U08:** an anchor list holds one option until it is focused or pressed; a screen reader may announce "1 of 1" on the first focus before the list fills (not verified with a screen reader). The Shift drawer, the bulk anchor row, and the band picker are unchanged.
  - **U06:** the persistence answer of `getLocalDataProtection()` is still not shown (no criterion asks for it), and the assumptions alert keeps its single sentence.
  - **U07:** the Runtime totals read `:61` by design (the Decision 0010 duration format). The Shift drawer over the Runtime Save button is accepted as is (U10 redesigns the drawer); the `inspectStaleTrips` findings get a status line in U09.
  - **Accessibility notes:** "Compatible only" stays a radio menu item because `blocking-workspace.spec.ts` asserts `menuitemradio`; menus do not implement typeahead; the Add-trip row drafts are not kept across a scope change.
  - **P15:** a CSV label with a bare CR does not round-trip byte for byte through the Trips CSV reader.
  - **P17:** `makePatternPoint` has no caller left (harmless).
  - **P16 leftovers:** `resetPatternService` (legacy mutator) still stamps wall-clock `now`; about 40 other domain signatures still default `now` to the wall clock.
- Decisions made by the user on 2026-10-23 (all follow the recommended option). `docs/review/fix-packages.md` is on the review branch and is not edited; this note is the record.
  1. `deletePattern` gets a review token (Decision 0041 pattern). **DONE in P17 (`87359e0`).**
  2. The legacy per-field route mutators are deleted, and the unit-test setups move to preview and commit. **DONE in P17.**
  3. Repeated Block labels already stored: the backup import refusal message explains the cause and the way out. No repair on load. **DONE in P17.**
  4. Branch protection: the user requires the two CI checks on `main`. User action only. The check names are "Typecheck, unit tests, build" (job `verify`) and "Browser tests" (job `browser`).
  5. Vitest major upgrade: its own package, **P18**, after D01, or in a separate maintenance sitting. Not mixed with feature work. **Not started.**
  6. Defaults accepted: Runtime band totals use the duration format; a Pattern with no distance shows "incomplete"; menu typeahead is not built.
  7. U07 blocked item 1: the Shift drawer overlap is accepted (option D); the drawer is redesigned in package **U10**.
  8. U07 blocked item 2: option A, a status line under the "Run Times Have Changed" indicator: package **U09**.
- Other hand-offs still open from earlier sittings:
  - **Decided by the user on 2026-10-23 (Option B), done in U07.** Under a segment-start or blended profile, an anchor that fits two first departures is rejected and the candidates are listed (Decision 0031 addendum).
  - **CSV.** The Trips CSV and ZIP writer live in `src/application`. A free-text cell that begins with `=`, `+`, `-`, or `@` is written with a leading apostrophe; the Trips CSV import and Runtime paste remove it (`restoreFormulaText`). A new CSV importer must do the same for the same columns.
  - **U05 hand-offs from 4E (not done in U05; see its entry):** the Node editor's impact dialog does not list `nonRevenueImpact`; the Trip profile confirmation does not mention `blockingScenarioCount`; the Runtime profile and Trips delete dialogs stay open with the old review after a refusal.
  - **Persistence (no owner yet):** `listProfileTrips` in `main.tsx` loads every Trip of the Scenario and filters by Trip Profile in memory; a compound index on Scenario and Trip Profile would avoid reading Trips of other profiles. Placeholder Blocks already stored in databases that imported version 3 and 4 files have no clean-up. Not covered by the contract suite: the legacy generation-set methods and `saveBlocks`. One timeout in 50 runs of `local-data-protection.spec.ts` (P10 entry) is unexplained; it did not return in 100 later runs.
- Unit-test and browser-test conventions are in "Standing rules" below and in `codex.md`. Browser-test helpers (all in `tests/ui/support/`): `dexieEnv.ts` (`runInPage`, `seedSnapshot`), `goldenFixture.ts` (the Federal BRT project), `tripsWorkspace.ts` (`createRouteWithPattern`, `createShiftReadySchedule`, `openGoldenTrips`, `settleFrames`), and `capacityFixture.ts` (400 Blocks, 2,000 Trips).
- Review documents: read them from the review branch with `git show origin/claude/upbeat-ritchie-51mpy5:docs/review/<file>`. Never copy `docs/review/` into the work branch.

### Added acceptance criteria

Items that the user assigned to later packages. They are added to those packages' acceptance criteria and stay here, unchanged, until the owning package lands. The bullets above that describe them are carried forward verbatim.

- **P09 (sitting 4E), the service part of the Runtime first-visit race. DONE in P09 (commit `fd1e65b`).** `ensureDefaultRuntimeProfile` is a check-then-write that is not atomic, and two overlapping calls can store duplicate Runtime assignments. Make it idempotent: one check-and-write in a single transaction, so two calls at once leave one Default profile and one assignment per standard Service day, and "Duplicate runtime assignment" cannot appear. Add a test that runs two calls at the same time against both repositories. P09 does not change `App.tsx`. Do not remove the up-front Default Runtime profile step or the reload after the Runtime save in `tests/ui/support/tripsWorkspace.ts`; U07 removes them.
- **P14 (sitting 4F), DONE in P14 (commit `3df50b6`):** enforce Block label uniqueness when a Block is created or renamed (Decision 0039), with a proposed default label of the first free "Block <n>".
- **U07 (sitting 4I). DONE in U07 (commit `4d270c1`):**
  - the single-flight Runtime load in `App.tsx` (the other half of the race above), then remove the two test-helper steps named above;
  - the Trips table must reload Runtime profiles after a Runtime profile is saved, so Show runtime bands shades without a page reload (the second behavior in the 4C decision bullet);
  - the Recalculate dialog hides the band picker for segment-start and blended Trips (Option B, decided 2026-10-23).

- **P17 (sitting 4I/4J), defined 2026-10-23. DONE in P17 (commit `87359e0`).** Items 1 to 3 of the decisions above: a review token for `deletePattern`; the legacy mutators deleted with the unit-test setups moved to preview and commit; the backup import refusal message for repeated Block labels.

- **P15 (sitting 4I/4J), added 2026-10-23. DONE in P15 (commit `b920627`).** A Pattern with no distance entered shows "incomplete" instead of "0.0 miles" on the Trips and Pattern screens, using the same rule as Blocking (a total of 0 is incomplete mileage, P12). This is the one intended display change in P15; every other displayed value stays unchanged, and the user-visible text is recorded in the P15 entry.

### Standing rules for every sitting

User direction, 2026-10-22 and 2026-10-23. They apply to every Stage 4 sitting, so a sitting's prompt only needs to name the handoff and the work branch.

1. **Branch.** Work on the branch named in the Next sitting note, created from current `origin/main`. Never commit or push to the review branch `claude/upbeat-ritchie-51mpy5` or to a branch name that the harness designates. The user authorizes pushes to the named work branch only. Do not open a pull request unless the user asks.
2. **Review documents.** Read them from the review branch with `git show` or `git archive` into the scratchpad. Never copy `docs/review/` into the work branch. Their line numbers refer to the code before sitting 4A: find code and documents by content (grep), not by line number.
3. **Models.** Main session on Sonnet. No sub-agents unless the Next sitting note says so.
4. **Order and gates.** Run the packages in the order listed. At each package gate, report the result and continue unless something failed or a question is open. If usage runs short, stop after the current package's gate and write the Next sitting note.
5. **Regression after every package:** `pnpm typecheck`, `pnpm test`, the full Playwright suite (`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`), and `pnpm build`. The browser suite stays at 0 failures with no `test.fail`, `test.skip`, or `test.fixme`. Do not weaken an existing spec. If a fixture must change because the intended behavior changes, keep its assertion and say so in the fix log.
6. **Test conventions.**
   - Unit tests run on `fake-indexeddb` (`codex.md` "Unit tests that need IndexedDB", Decision 0040). A new repository method goes into both repositories and into `src/persistence/repositoryContract.test.ts`. Repositories return rows in primary-key order, which is random for generated ids, so a test must not assert list order.
   - If a package needs a file that it does not own (a repository, for example), make the minimum change and record the hand-off in the fix log.
   - New browser specs use the helpers in `tests/ui/support/`. Do not remove the up-front Default Runtime profile step or the reload after the Runtime save in `tests/ui/support/tripsWorkspace.ts`; U07 removes them.
7. **Proof that a test works.** A unit test is shown failing on the unfixed code first. A new browser test is run several times with several workers (`--repeat-each=10 --workers=8`) before it is committed. Each new test or test group has one deliberate break that makes it fail, recorded in the fix log and the package report.
8. **Scope.** Do the sitting's packages and the added acceptance criteria assigned to them. Everything assigned to a later package stays unchanged and unstarted: the "Added acceptance criteria" entries, the carried-forward bullets in the Next sitting note, and every package not in the sitting. When an added criterion lands, mark it done in its section with the commit hash.
9. **Commits.** A package lands as one commit or a short series, with its fix log entry. A stop hook flags uncommitted changes at the end of a turn: commit finished work and push it to the work branch.
10. **End of sitting.** Update the Next sitting note (the next sitting, its packages, prerequisites, and open questions), update `codex.md`, push, and give one report: each package's result, exact test counts, deliberate breaks, anything deferred or handed off, what the user must do, any decision needed, what the user will see different in the app after the merge, and the recommended next sitting and model. Do not start the next sitting.

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

## P05: Browser test-suite repair

- Date: 2026-10-22. Sitting 4C. Model: Sonnet (main session). No sub-agents: P05 is test-only (S2), so no Opus review (sitting plan).
- Type: test-only. Severity: S2.
- Commit: `b588bcb`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-006 | A-001, 5-001 | S2 | Seven browser tests failed in every run. Six failed in the shared helper of `unified-action-layer.spec.ts`, which expected the menu item `Copy from day…` (the app renders `Copy Trips from day…`). `trip-table-layout.spec.ts:40` asserted a nested schedule scroller that Decision 0035 item 5 forbids. `unified-action-layer.spec.ts:169` set `scrollTop` on `.schedule-table`, which has no vertical scroll, so the value was always 0. Behind the label error, `:140` also fails under load for an app reason (hand-off 1). |
| I-029 | 5-002 | S2 | `service-day-copy-layout`, `workflow-section-layout`, and the draft-row test in `trip-table-layout` loaded hand-written fixture HTML. The fixture listed buttons the app no longer renders, and the draft-row test asserted classes the fixture wrote itself, so none could fail when the app changed. |
| I-084 | 5-003 | S3 | No browser test covered rounding of displayed times, Show headways, band shading, duplicate-departure and Block overlap warnings, scroll restoration, or net-zero Shift discard. |
| I-085 | 5-017 | S3 | Weak assertions: `route-editing` never reloaded or read IndexedDB; the Costing test claimed narrow-width usability but checked two headings; screenshots were taken and never asserted; four conditional `Discard` clicks could hide a stray unsaved-Route banner; the Runtime paste dialog had no test. |

No user decision applied (finding 5-001: Decision 0035 governs).

### What changed

All changes are under `tests/` plus two documentation notes. No file under `src/` changed.

- New shared helper `tests/ui/support/tripsWorkspace.ts` (outside the package's listed owned files; recorded here): `createRouteWithPattern` (project, Route, Nodes A and B, a saved Pattern, and the Default Runtime profile), `createShiftReadySchedule` (the former local helper, now with a configurable Runtime segment), `openGoldenTrips` (the Federal BRT golden project on the Weekday Southbound Trips: 138 Trips, 11 timepoints, Blocks assigned), and `settleFrames`.
- Label: the helper expects `Copy Trips from day…`.
- The `Add node` race (L-16). The cause is a reload that lands after a save and replaces the draft the next step just created, so `Add node` never appears. The setup now waits for each save to finish (`Save nodes` disabled and the saved Node listed; the Pattern draft showing; each Pattern point visible before the next click) before the next step. `Add pattern` is clicked again if it opened no draft (seen once in about 700 setups under heavy load). The four specs that repeated the sequence (`blocking-workspace`, `trip-profile`, `unified-action-layer`, `route-editing`) share it or carry the same waits.
- Setup also waits for the stored Runtime value before reloading and building Trips, because the `Save` button disappears while the write is still running (the original helper had this race too).
- `trip-table-layout.spec.ts` (4 tests, all on the real app): Pattern column no wider than its selector; the draft row is first and the saved rows follow; the fixed duplicate heading row appears at page level once the real headings scroll away (`position: fixed`, same headings and column widths as the grid, horizontal scroll synchronized both ways, gone when the headings are back in view, and the grid has no vertical scroller); the page and horizontal grid position are restored after a committed Shift.
- `service-day-copy-layout.spec.ts` and `workflow-section-layout.spec.ts` now drive the real Runtimes and Trips sections (header layer button lists, geometry, and the 380 px right-docked Shift drawer).
- `tests/fixtures/trip-table-layout.html`, `service-day-copy-layout.html`, and `workflow-section-layout.html` are deleted. `runtime-table-layout.html` stays with `runtime-table-layout.spec.ts`, which now says in a comment that it is reduced to the geometry Decision 0013 permits.
- `unified-action-layer.spec.ts`: scroll restoration rewritten to the page-level behavior; the duplicate-and-discard Runtime band check moved out of the setup helper into its own test (it had been an incidental part of setup).
- `route-editing.spec.ts`: reads IndexedDB (a discarded Node was never stored; two Nodes and one Pattern after the saves; two Routes after rename and duplicate) and reloads. `costing-workspace.spec.ts`: at 1024 and 760 px the page does not scroll sideways, the tables stay inside the viewport, and the results keep their content; the two unasserted screenshots are removed. `blocking-workspace.spec.ts`: the four conditional `Discard` clicks are now `toHaveCount(0)` assertions, the three unasserted screenshots are removed, and at 600 px the Current Block menu is asserted to open inside the viewport with no sideways page scroll.
- Documentation: `docs/implementation/phase-02r-trip-table-interchange-undo.md` Verification claim corrected; `docs/decisions/0013-browser-layout-regression-tests.md` addendum (layout specs drive the real app).

### Tests added

New `tests/ui/trips-table-display.spec.ts` (6 tests, real app):

- rounds displayed times to the minute and keeps the exact time in the cell title (6:07:30 shows as 6:08; whole minutes carry no "Exact" note);
- Show headways replaces each later time with the gap from the previous Trip (`0:10`), marks the first time, and restores the times when switched off;
- Show runtime bands lists the band and shades the run-time cells in the legend's color, and the first timepoint is unshaded;
- a duplicate departure is flagged on both Trips, and two Trips in one Block that overlap each get the Block warning with the arrival and departure times;
- a Shift whose net offset is zero writes nothing (stored Trips deep-equal before and after) while a real Shift does;
- the Runtime paste dialog refuses a row with no runtime, previews valid rows, replaces the draft only, and stores nothing until Save.

Also new or rewritten: `unified-action-layer.spec.ts` (page scroll restoration; duplicate and discard a time band), `trip-table-layout.spec.ts` (4), `service-day-copy-layout.spec.ts`, `workflow-section-layout.spec.ts`. Total browser tests: 51 before, 59 after (8 more: 6 in `trips-table-display`, the duplicate-band test in `unified-action-layer`, and the position-restore test in `trip-table-layout`).

### Deliberate breaks (each new or rewritten test fails when its behavior is broken)

Each break was applied to the source, the one spec run, and the source restored with `git checkout`:

| Test | Deliberate break | Result |
| --- | --- | --- |
| `service-day-copy-layout`: header action layers | `.section-header-actions` gets `margin-top: 90px` | fails: actions sit below the title (`<= 304`, received 317) |
| `workflow-section-layout`: right-docked Shift drawer | drawer width `min(360px, 40vw)` instead of 380 | fails: expected 380, received 360 |
| `trip-table-layout`: Pattern column | `.trip-pattern-column` 140 px wide | fails: column `<= 97`, received 140 |
| `trip-table-layout`: draft row first | `DraftTripRow` rendered after the saved rows | fails: first row has no `draft-trip-row` class |
| `trip-table-layout`: duplicate heading row | the `show` condition in `ScheduleTable` forced to `false` | fails: the heading region is never visible |
| `trip-table-layout`: page and grid position after Shift | restore scrolls the page to 0; restore sets grid `scrollLeft` to 0 (two runs) | fails both ways: expected 2400, received 0; expected 140, received 0 |
| `unified-action-layer`: page scroll restoration | restore scrolls the page to 0 | fails: expected 300, received 0 |
| `unified-action-layer`: duplicate and discard a band | `duplicateBand` omits the copy | fails: `Time band 2 start` not found |
| `trips-table-display`: rounding | `formatTripTableClock` ignores `roundToMinute` | fails: times stay `6:07:30` |
| `trips-table-display`: headways | headway lookup returns nothing | fails: cells keep clock times |
| `trips-table-display`: band shading | the cell `style` with the gradient removed | fails: `none` instead of `linear-gradient` |
| `trips-table-display`: duplicate departure and Block overlap | the `Duplicate departure` note removed; separately the `trip-block-warning` span removed | each fails: no duplicate notes; 0 warnings instead of 2 |
| `trips-table-display`: net-zero Shift | the `netOffsetSeconds === 0` shortcut removed from `completeStagedShift` | fails: stored Trips differ after a zero-net Shift |
| `trips-table-display`: Runtime paste dialog | parse issues are not shown | fails: `Fix the pasted rows` not found |

The first demonstration of the scroll tests was too weak: removing the restore code did not fail them, because the browser keeps the position anyway. The behavior they protect is that the position is preserved, so the break that counts is one that moves it, and the tests now wait for the shifted data and two animation frames before reading the position.

### Verification run

- Baseline before the package: 51 browser tests, 44 passed, 7 failed (the I-006 set).
- `pnpm typecheck`: clean.
- `pnpm test`: 32 files, 311 tests passed (unchanged; P05 changes no file under `src/`).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`, run three times in a row on the committed code: 59 tests, 59 passed, 0 failed, 0 flaky, each run (2.4 minutes). An earlier set of three runs before two last test tweaks also passed 59 of 59 each time. No `test.fail`, `test.skip`, or `test.fixme` in `tests/ui`.
- Stress runs with 8 to 16 workers while the setup was being made reliable: `createRouteWithPattern` 420 of 420; the regeneration-undo test 40 of 40; the Trips specs 152 of 152.
- `pnpm build`: succeeds (existing chunk-size warning only); the bundle is unchanged: `index-C3-9F8IV.js` 779.07 kB (214.79 kB gzip), the baseline for X01.

### Residual risks, hand-offs, and findings made while repairing

The following app behaviors were found while making the suite stable. None is in the review register. P05 is test-only, so none was fixed; each is worked around in the test setup and handed off.

1. **Runtime section reloads overlap (not in the register; suggest adding to P09, which owns `routeDefinitionService.ts`, with the App part in U07).** On the first visit to Trips, `loadRuntime` runs twice at once (React `StrictMode` runs effects twice in development). Both runs find no default Runtime profile and both create one, and the assignment check-then-write is not atomic. Observed: eight stored assignments where four are expected, a "Duplicate runtime assignment" banner, and a Runtime editor draft that is reset after the user has started editing. Saving a Runtime profile also starts two overlapping reloads (`onSaved` calls `loadRuntime`, then `onRuntimeChanged` triggers it again); while they run they disable the Runtime menus, close an open menu, and can reset the draft. The test setup creates the defaults once through `ensureDefaultRuntimeProfile` before Trips mounts, waits for the stored Runtime value, and reloads, so the browser tests no longer exercise the app's own first-visit creation path.
2. **Stale Runtime profiles in the Trips table (not in the register; suggest U07 or P15).** `onRuntimeChanged` only bumps `runtimeVersion`; the Scenario records the Trips table reads (`records.runtimeProfiles`, `records.runtimeAssignments`) are not reloaded. After a Runtime profile is saved, Show runtime bands shades nothing until the page is reloaded, because the table compares the Trip times with the pre-save profile. The band-shading test reloads first and says why.
3. React warns on every Trips render: "You provided a `checked` prop to a form field without an `onChange` handler" (the row checkboxes use `onClick`). Cosmetic; U04.
4. Not done: focus trap, Escape, and focus return in dialogs (B4-19), part of 5-017. Those tests would fail today (I-036 is open) and AC1 forbids `test.fail`, so they belong to U04's `keyboard.spec.ts`.
5. Not done: a unit test for `calculateTimepointHeadways` (5-003 location). It is in `src/domain/trips.ts`, which P15 owns; the browser test now covers the displayed headways.
6. Strengthened existing tests (`route-editing`, `costing-workspace`, `blocking-workspace`) were checked against the current app, not given a deliberate break. The Costing width check does not assert that Annual cost is visible without table scroll; that is U06 criterion 3.
7. What could still be wrong: the browser suite runs against the Vite dev server (`StrictMode` on), not a production build. `settleFrames` waits a fixed number of frames; a very slow machine could in principle read a scroll position before the app's two-frame restore runs, which would make the restore tests pass wrongly, never fail wrongly.

## X01: Dead code removal

- Date: 2026-10-22. Sitting 4C. Model: Sonnet (main session). Sub-agent: Haiku, for the mechanical deletions only (an exact file and line list with line fingerprints, plus typecheck, unit-test, unused-import, and grep checks). The main session rebuilt each file from `HEAD` with only the listed ranges removed and diffed it against Haiku's result before committing. No Opus review (S3).
- Type: structural (mechanical deletion). Severity: S3.
- Commit: `8a2d0d7`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-069 | 3-008 | S3 | `RouteDefinitionService.deleteNode` was unreachable and, if wired, would have deleted other Routes' Nodes and Patterns and committed in two transactions (S0). Its only caller was a dead App handler. |
| I-075 | 4-015 | S3 | The legacy generation-set screens, 11 App-level route handlers, unused service methods, and 22 zero-reference exports (user decision 13: delete the dead UI and commands, keep the table and backup parsing). |
| I-079 | 4-022 | S3 | Nine `ports.ts` interfaces were unused; four no longer matched their services. |

User decision implemented: decision 13.

### What changed

Deleted, each re-verified by grep on the current code (the review's line numbers were stale) before it was removed:

- `src/ui/App.tsx` (265 lines): the legacy generation-set screens `TripScheduleWorkspace`, `RuntimeWorkspace`, and `DirectionSetup`, with their exclusive children `RuntimeProfileEditor`, `RuntimeProfileDialog`, `ServiceTimeField`, `FragmentTripRow`, `GenerationPreviewDialog`, `PatternChangeDialog`, `PatternChangePreviewDialog`, and `type RuntimeDialog`; the 11 App-level handlers (`addNode`, `updateNode`, `deleteNode`, `addPattern`, `updatePattern`, `addPoint`, `updatePoint`, `movePoint`, `removePoint`, `reverseSelectedPattern`, `duplicateSelectedPattern`); `UndoIcon` and `RedoIcon`. Imports that became unused were removed.
- Service methods (14): `RouteDefinitionService` `deleteDirection`, `updateDirectionColumn`, `getNodeDeletionFindings`, `deleteNode`, `ensureDefaultProfile`, `validateRuntimeAssignments`, `resolveRuntimeBand`; `TripGenerationService` `ensureDefaultTripProfile`, `previewTripGeneration`, `applyTripGeneration`, `applyTripShift`, `validateTrip`; `BlockingApplicationService` `validateBlock`, `getTripBlockingContext`. Their names are gone from the `Pick` aliases (`RouteDefinitionApplication`, `TripGenerationApplication`), and the two Blocking entries from `BlockingQueries`. The aliases themselves remain.
- `src/application/ports.ts` (100 lines): the nine unused interfaces `RouteDefinitionCommands`, `RouteDefinitionQueries`, `RuntimeCommands`, `RuntimeQueries`, `AuthoritativeTripRepository`, `TripGenerationCommands`, `AuthoritativeTripCommands`, `AuthoritativeTripQueries`, `TripGenerationQueries`. The `TripGenerationRepository` comment no longer says it serves a running pre-2R UI.
- The 22 zero-reference exports: `normalizeBlock`, `validateBlock` (alias), `deriveBlockSummary`, `deriveBlockingSummary`, `evaluateBlockingInsertion` (`blocking.ts`); `parseDuration`, `formatDuration`, `parseRuntimeDurationSeconds`, `formatRuntimeDurationSeconds` (`durations.ts`, and from the re-export lists in `time.ts` and `runtime.ts`); `patternSegmentMiles`; `PatternEditAnalysis`; `SERVICE_DAY_ORDER`, `orderServiceDays`, `sortServiceDayDefinitions`; `addDuration`; `generateTripsFromRequest`, `previewGenerateAuthoritativeTrips`, `tripLogicalKey`; `NormalizedTrip`, `NormalizedBlock`, `NormalizedBlockingBlock`; `RUNTIME_PROJECT_BACKUP_SCHEMA_VERSION`.
- Tests of the deleted methods: two `TripGenerationService` generation-set tests, the `applyTripShift` test, and one `deleteDirection` assertion (311 unit tests before, 308 after). The staged-Shift, Trip-list, and runtime-profile tests are untouched.
- `docs/data-schema.md`: the two stale claims that the generation-set repository methods and a legacy export method serve a "running pre-2R UI" now say what is true (the methods remain for old backups; `RouteDefinitionService.exportCsv` remains but no screen calls it).

Kept, as required: the `generationSets` table, all generation-set backup parsing including the version 3 import path (the version 3 placeholder-Block tests pass), `SessionStatusQueries` in `ports.ts`, `recoverScenarioCopyNodeReferences`, `parseProjectBackupWithReport`, `importProjectWithReport`.

Behavior before and after: none. No screen, menu, or stored value reached any deleted code.

### Deviations from the finding

- **`selectedUnassignedTripIds` was not deleted.** The finding lists it as dead, but on current code `BlockingWorkspace.tsx` reads it twice (the select-all checkbox and each row's selected state) and sets it five times. It is live.
- **`type PatternPreviewDialog` was deleted although the finding does not list it.** The removed `TripScheduleWorkspace` and `PatternChangePreviewDialog` were its only users.
- The finding's line numbers had moved; the list was rebuilt from the current code with a reference sweep (identifier counts across `src` and `tests`) and AST line ranges.

### Tests added

None (deletion only). The existing suites are the check: nothing outside tests referenced any deleted symbol.

### Verification run

- `pnpm typecheck`: clean. `tsc --noUnusedLocals` diagnostics fell from 31 to 14, all 14 present before; none is new, and the 17 that disappeared are the dead handlers and components themselves.
- `pnpm test`: 32 files, 308 tests passed (311 before; 3 test cases of deleted methods removed).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 59 passed, 0 failed, twice in a row (2.5 and 2.4 minutes).
- `pnpm build`: succeeds (existing chunk-size warning only). **Bundle size:** `index-C3-9F8IV.js` 779.07 kB (214.79 kB gzip) before, `index-TR3LK2Mp.js` 770.23 kB (213.02 kB gzip) after, 8.84 kB smaller (1.1%); the CSS bundle is unchanged at 42.47 kB.
- Grep for every deleted name across `src` and `tests`: no match, except `validateRuntimeAssignments`, `validateTrip`, and `validateBlock`, which still exist as domain functions (`runtime.ts`, `trips.ts`, `validation.ts`) and in `backup.ts`.

### Residual risks and hand-offs

- Left in place because 4-015 does not list them: the domain functions `previewRegeneration` and `applyRegeneration` (now referenced only by their unit tests, since the generation-set commands are gone), `validateBlock` in `src/domain/validation.ts` (P12 removes it), `RouteDefinitionService.exportCsv` (referenced only by a test), and the generation-set repository and service methods that the kept table and backup parsing still use (`getGenerationSet`, `listGenerationSets`, `saveGenerationSet`, `replaceGenerationSet`, and the CSV generation-sets file). A later cleanup could remove the first three once the user agrees.
- `docs/implementation/phase-02tp-trip-profiles.md` (line 181) and two Phase 2R closeout documents still describe the deleted methods and the "running pre-2R UI". They are historical records and were not edited.
- What could still be wrong: the unused-reference sweep is by identifier name, so a symbol reachable only through string lookups or dynamic access would be missed; the typecheck, 308 unit tests, and 59 browser tests would catch a static or tested use, and none exists.

## P06: IndexedDB test environment and repository parity

- Date: 2026-10-22. Sitting 4D. Model: Sonnet (main session). No sub-agents: P06 is S2, so no Opus review (sitting plan).
- Type: structural (test-first). Severity: S2.
- Commit: `1f9e64a`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-007 | A-002 | S2 | `dexieRepository.ts` had 0% line coverage. Vitest ran in Node with no IndexedDB, so every atomicity, rollback, and cascade test used the in-memory repository or a fake. |
| I-008 | A-003, 3-014 | S2 | The only migration unit test returned early (no `indexedDB`) and asserted version 5 for a version 7 database. The browser migration test seeded IndexedDB version 4, which is Dexie 0.4, so it ran every upgrade from the start. No test reported the placeholder-Block discard count. |
| I-020 | 3-013 | S2 | The in-memory and Dexie repositories diverged on stale-regeneration rejection, Scenario deletion, result order, and error types. |
| I-047 | A-007 | S3 | The `segmentStart` boundary matrix existed only in the review's golden suite. |

No user decision applied.

### What changed

- `vitest.config.ts`: `setupFiles: ['fake-indexeddb/auto']`. Unit tests can open a real Dexie database. Dev dependency `fake-indexeddb` 6.2.6 (the only one added; `package.json` +1 line, `pnpm-lock.yaml` +9 lines, no other lockfile line changed).
- `src/persistence/inMemoryRepository.ts` now matches Dexie on every row of the review's parity table (Phase 3 findings, Section 7):
  - Reads return rows in primary-key order (before: insertion order). One helper, `inKeyOrder`, used by every list and records read.
  - `saveRegeneratedTripsWithUndo` rejects a stale or missing before-state with "A selected Trip changed. Review regeneration again." and writes nothing (before: it wrote, and a later undo restored the stale Trip).
  - `saveProjectSnapshot` deletes the service days and Routes of a Scenario that the snapshot no longer contains (before: it left them, for example 4 service days and 1 Route after Scenario deletion).
  - `saveRuntimeAssignment` with a missing profile raises "Runtime assignment ... references a missing record" (before: a `TypeError`).
  - `saveScenarioRecords` invalidates the regeneration undo only after every check that can reject the write (before: a write rejected for costing ownership still discarded the undo; Dexie rolls that back).
  - `getScenarioRecords` omits `directions` when there are none (before: `[]`).
- Behavior in the application: none. The app uses the Dexie repository; the in-memory repository serves tests only.
- `src/persistence/database.test.ts`: per-version upgrade tests. `src/persistence/repository.test.ts`: the migration test now runs and asserts version 7.
- `src/domain/runtime.test.ts`: the `segmentStart` boundary matrix.
- `tests/ui/database-migration.spec.ts`: seeds IndexedDB version 40 (Dexie 4).
- Documentation: Decision 0040; `architecture_overview.md` (Technology Direction and Persistence principle); `codex.md` section "Unit tests that need IndexedDB".

### Hand-offs (files outside the package's owned list)

- `src/application/routeDefinitionService.test.ts` (2 assertions): "coordinates a route-definition workflow..." and "provides runtime-profile editing operations..." listed Patterns and Runtime profiles in insertion order. With key order they failed in 22 of 25 and 7 of 25 runs (generated ids are random). They now compare sorted names. Those two tests would also have been wrong against Dexie.
- `docs/decisions/0040-repository-contract-and-indexeddb-test-environment.md`, `architecture_overview.md`, `codex.md`: records that rule 7 and the package's documentation line require. `dexieRepository.ts` and `database.ts` are unchanged; no Dexie behavior needed to change.

### Tests added

- `src/persistence/repositoryContract.test.ts`: 27 shared tests, each run against both repositories (54 runs), plus 4 Dexie-only tests: 58 tests in the file. Groups:
  - reads: same data from every read method; primary-key order; project snapshot round trip; Route definition read, write, and removal; `directions` omitted when none.
  - Scenario deletion and cascades: deleting a Scenario through `RouteDefinitionService` and through a snapshot removes every owned record (13 kinds) and keeps the other Scenario; deleting a Project; the undo of a deleted Project.
  - Scenario record writes: dropped records removed; `updateScenarioRecords` (re-read, no-change, missing Scenario); a write rejected for costing ownership keeps the undo.
  - Trip writes: stale and missing before-state rejected; apply, undo once, refuse after a later edit; duplicate Trip id rejected with none of the batch stored; missing or foreign Trip profile rejected; Trip and Block changes and deletions; day replacement.
  - Runtime: duplicate assignment, missing profile (`Error`, not `TypeError`), delete of an assigned profile with and without a replacement, Runtime copy commit and duplicate-id rejection.
  - Trip profiles: name collisions in both save paths; copy with Trips in one write; deletion cascade.
  - Costing assumptions: one record per Scenario and the rejections.
  - Dexie only: `costPlans` removed with the Project; failed Scenario write, regeneration write, and Trip deletion roll back (failure injected into the named table method).
- `src/persistence/database.test.ts`: `upgrades a Dexie version N database to version 7 and keeps every record`, N = 1 to 6. Each seeds two Scenarios with Dexie's own historical store definitions (IndexedDB version N × 10), upgrades, checks that every record and every index is intact, and reports the discard count. Counts: 4 of 4 placeholder Blocks discarded from versions 1, 2, and 3; 0 of 2 from versions 4, 5, and 6 (normalized Blocks kept).
- `src/persistence/repository.test.ts`: the placeholder-Block migration test runs (no early return), asserts Dexie version 7 and IndexedDB version 70, and the discarded count of 1.
- `src/domain/runtime.test.ts`: `segmentStart boundary matrix` (13 tests): first band start, band end half-open, gap (nearest band), after the last band, rejected departures, contributions, single band, unsorted bands, overlap, zero-length band. The golden "DEFECT 2-007" test (gap midpoint tie) is not ported; it belongs to P16.
- `tests/ui/database-migration.spec.ts`: seeds version 40, and asserts that no Default Trip profile is created and the normalized Block is kept.

### Tests first: what failed on the current code

- Contract suite, before the in-memory fixes (56 runs at that point; the Route definition test was added later): 8 runs failed, all in-memory, one per parity row: primary-key order; `directions` omitted; Scenario deletion through the service (4 service days and 1 Route left); snapshot without a Scenario (same); undo kept after a rejected costing write; stale before-state (two tests); `TypeError` for a missing profile. All Dexie runs passed (the Dexie repository was the reference).
- Migration unit test, once an IndexedDB existed: failed with `expected 7 to be 5` (A-003: it had never run).
- Browser migration spec with the old seed of 4 and the new assertions: failed (`tripProfileCount` expected 0, received 1: the version 3 upgrade ran).
- The per-version upgrade tests and the `segmentStart` matrix pass on arrival. They close test gaps over code with no defect (A-003 and A-007 are test-gap findings), so they cannot fail first; the deliberate breaks below show that they fail when the code is wrong.

### Deliberate breaks (each applied to the source, the test run, and the source restored with `git checkout` or a saved copy)

| Test | Deliberate break | Result |
| --- | --- | --- |
| Per-version upgrade tests and the migration test | the version 4 upgrade no longer clears Blocks (`database.ts`) | 4 fail: versions 1, 2, and 3 (0 discarded instead of 4) and the `repository.test.ts` migration test |
| `segmentStart` boundary matrix | band lookup uses `<=` for the band end (`runtime.ts`) | 4 fail: the band end, the last band end, the zero-length band, and an existing half-open test |
| Contract: stale before-state | the Dexie before-state check removed | 2 fail (Dexie): stale and missing before-state |
| Contract: Dexie only, `costPlans` | `deleteProject` no longer deletes `costPlans` rows | 1 fails |
| Contract: primary-key order | `inKeyOrder` returns insertion order | 1 fails (in-memory) |
| Contract: Dexie only, rollback | `deleteTripsAtomically` without its transaction | 1 fails: the Trips stay deleted after the injected Block failure |
| Browser migration spec | seed 4 instead of 40 | fails on `tripProfileCount` |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 33 files, 385 tests passed (308 before; 77 new: 58 in the contract file, 6 upgrade tests, 13 matrix tests; the changed migration test is not a new one). Time 8.3 s. Repeated 25 times before the two order-dependent tests were fixed (they failed in 22 and 7 runs) and 8 times after (8 of 8 passed).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 59 passed, 0 failed (2.4 minutes). The migration spec passes alone with seed 40.
- `pnpm build`: succeeds (existing chunk-size warning only). Bundle unchanged: `index-TR3LK2Mp.js` 770.23 kB.
- Line coverage, measured with `@vitest/coverage-v8` 3.2.7 installed temporarily and then removed (`package.json` and the lockfile restored): `dexieRepository.ts` 86.54% (0% before), `inMemoryRepository.ts` 95.12%, `database.ts` 51.28% (the uncovered lines are the write-guard and the version 7 upgrade, covered by `tabGuard.test.ts` and the browser specs).
- Lockfile change: `fake-indexeddb` 6.2.6 only (importer entry, package entry, snapshot entry). The local pnpm version also wanted to delete the `libc` fields of 14 Linux packages; that was reverted by hand, so the diff is the 9 added lines.

### Residual risks and hand-offs

- The contract suite does not cover the legacy generation-set methods (`getGenerationSet`, `listGenerationSets`, `saveGenerationSet`, `replaceGenerationSet`, `saveBlocks`); they remain with the kept table and backup parsing (X01 note).
- One divergence stays by design: a duplicate Trip id. Dexie reports its raw bulk-write failure; the in-memory repository says the Trip exists. Both reject and store nothing. Readable Dexie messages are finding 3-015 (a UI package).
- Row order is a contract only for the reads that Dexie sorts by key. A future read through an index with several distinct values, or a sorted compound index, would return index order, not key order, and needs its own contract test.
- What could still be wrong: `fake-indexeddb` is not Chromium's IndexedDB. Transaction timing, auto-commit across awaits, and quota behave differently; the browser specs remain the check for those. The contract suite uses 173 Trips (the full project makes an overwrite take 9 s on this store), so it does not test scale.

## P07: Trip stale checks and runtime revisions

- Date: 2026-10-22. Sitting 4D. Model: Sonnet (main session). No sub-agents: P07 is S2, so no Opus review (sitting plan).
- Type: structural. Severity: S2.
- Commit: `b5b2f3c`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-014 | 2-004, 2-005 | S2 | A deterministic route edit stamped the new runtime revision on every Trip. A segment-start Trip whose time crossed two bands (merged by a point removal) was marked current although the profile no longer calculates it, and a Trip that was already stale was made current. |
| I-021 | 4-003 | S2 | A single-Trip Pattern change committed its review without checking that the Trip or the target profile was unchanged. A Shift made after the review was discarded; a profile change after the review stamped the Trip with a revision whose profile gives other times. |
| I-022 | 4-004 | S2 | Trips CSV import looked up existing Trips by Route only, so a Trip ID from the other Direction was moved onto the displayed Direction's Pattern. Its Block activity still referenced it. |
| I-028 | 4-019 | S2 | The Trips CSV review signature omitted Patterns, so an import reviewed before a Pattern gained a point saved a Trip with 2 times against a 3-point Pattern. |
| I-065 | 2-011 | S3 | Renaming a runtime band label raised the calculation revision and marked every Trip stale. |
| I-081 | 4-024 | S3 | `listStaleTrips` marked a Trip stale on any error, including programming errors, and gave no reason. It had no `segmentStart` test. |

No user decision applied.

### What changed

- `src/domain/safeRouteEditing.ts`, `rebalanceTripForPattern`: a Trip moves to the rebalanced profile's revision only when it was current before the edit (its recorded revision is one below the rebalanced profile's) and the rebalanced profile calculates all its new times from its first departure. Every other Trip keeps its recorded revision and is therefore stale (Decision 0030 item 1). A Trip that was already stale stays stale. A Trip that records no revision is unchanged. Manual shifts that stay inside one band are reproduced and stay current; a hand-edited single time is not, so that Trip is stale after the edit. Retained times, manual shifts, and Pattern-point identifiers are preserved as before.
- `src/domain/runtime.ts`: a band label is not part of the calculation shape. Bounds, segment durations, band ids, and the method still raise the revision.
- `src/application/tripGenerationService.ts`:
  - `previewTripPatternChange` returns a review signed over the Trip, the target Pattern's points, the assignment, and the target profile (`TripPatternChangeReview`). `changeTripPattern` recomputes the signature after reading current data and rejects a mismatch, or a review with no signature, with `TripPatternChangeStalePreviewError` ("The Pattern change review is out of date. Review the change again."). The application passes the review object through unchanged, so no screen changed.
  - Trips CSV import updates only Trips whose Pattern is in the displayed Direction. A Trip ID from the other Direction gets the existing finding `trip.csvTripInvalid` ("A Trip ID does not belong to the selected schedule."), and the Trip keeps its Pattern. The review signature now covers every Pattern used by a Trip of the schedule or by a CSV row (id, Route, Direction, points).
  - `inspectStaleTrips` returns the stale Trips and a finding for each Trip that its profile cannot calculate. `listStaleTrips` returns its Trips, as before. Only `TripGenerationError` (every error the recalculation raises on purpose) is reported as a finding; any other error surfaces. The Trips tab already catches errors from loading and shows its message.
- Documentation: Decision 0014 addendum (items 5 and 6 for segment-start and blend profiles); glossary "Calculation revision"; `architecture_overview.md` (Runtime model, Trip generation model, Trips CSV).

### Hand-offs and visible changes

- **Existing spec fixture corrected, assertion unchanged:** `safeRouteEditing.test.ts` "keeps retained trip times and manual shifts while inserting a point" used a profile with `bands: []`, which cannot calculate any time. It now has the single band that the rebalanced profile would have (segments 0 and 600). Its assertion (revision 4, retained times, manual shift 120) is unchanged and still passes; the new rule is what needed the fixture to be realistic.
- `routeDefinitionService.ts` is P09's file. `rebalanceDependentService` still passes only the rebalanced profiles to `rebalanceTripForPattern`; the function infers "was current" as `recorded === revision - 1`, which is exact because `rebalanceRuntimeProfile` raises the revision by exactly one per save. If P09 changes that, pass the pre-edit profiles.
- **Visible after the merge:** after a point is added to or removed from a Pattern, a Trip whose times the rebalanced profile does not calculate now shows `Run times changed` (before: it showed nothing). This includes a Trip with a hand-edited time and a segment-start Trip that crossed two bands. A Trip that was already marked changed stays marked. A Trips CSV row that names a Trip of the other Direction is refused with the existing message. An older CSV review, or an older Pattern change review, is refused with a plain message.
- The user-facing text for `trip.anchorNoRuntime` and the findings that `inspectStaleTrips` returns are not shown anywhere yet; presenting them belongs to U07.

### Tests added

- `src/domain/safeRouteEditing.test.ts`, "Trip revisions after a deterministic route edit" (7 new tests): the 2-004 reproduction (a Trip that crossed two bands keeps revision 3 while the profile is at 4; the profile gives 4200, the Trip stores 4800); revision advances when the rebalanced profile reproduces the Trip, for single-band, `segmentStart`, and blend; an already-stale Trip stays stale (2-005); a stale Trip stays stale even when its times match; a manual shift inside one band stays current; a hand-edited time makes the Trip stale; a Trip with no recorded revision is unchanged.
- `src/domain/runtime.test.ts`: `does not increment the calculation revision when only a band label changes` (bounds and method still do).
- `src/application/tripGenerationService.test.ts`, "stale-source checks..." (14 new tests on the in-memory repository, which the P06 contract suite ties to Dexie):
  - Pattern change (5): applies an unchanged review; rejects after a Shift (and keeps the Shift); after a target profile change; after the target Pattern gained a point; and refuses an unsigned review.
  - Trips CSV (5): other-Direction `tripId` rejected and the Trip keeps its Pattern; a Trip of the Direction still updates and a new row is created; rejects after the row's Pattern gained a point; rejects after the Pattern of another Trip in the schedule changed; an unchanged import applies.
  - `listStaleTrips` (4): with a `segmentStart` profile, a Trip that records no source is stale only when its times differ; a Trip no band can calculate is stale with a `trip.anchorNoRuntime` finding; a programming error (a profile with no `bands`) is thrown, not hidden; a Trip that a route edit could not carry forward is reported stale end to end (domain rebalance, then the query).

### Tests first: what failed on the current code

- Domain: 4 of the new tests failed (band label raised the revision to 5; the 2-004 Trip was stamped 4; the already-stale Trip was stamped 4, twice).
- Application: 10 of the 14 new tests failed (4 Pattern change, 3 CSV, 3 stale-query). The 4 that passed on arrival are controls (an unchanged review and an unchanged import still apply; a Trip of the Direction still updates) and the `segmentStart` legacy-Trip test (a test gap, no defect).

### Deliberate breaks (applied, run, restored)

| Test | Deliberate break | Result |
| --- | --- | --- |
| Rebalance tests and the end-to-end stale query | `carryForward` always true (the old unconditional stamp) | 4 fail |
| Band label test | `label` back in `calculationShape` | 1 fails |
| Pattern change tests | signature check removed from `changeTripPattern` | 4 fail |
| CSV Direction test | existing Trips filtered by Route only | 1 fails |
| CSV Pattern signature tests | signature covers Trips only | 2 fail |
| `listStaleTrips` error tests | the old bare `catch` that marks every error stale | 2 fail (the programming-error test and the finding test). A first attempt, removing only the `instanceof` check, left one test green because `error.findings.map` itself threw a `TypeError`; that is why the break above replaces the whole `catch`. |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 33 files, 407 tests passed (385 before; 22 new: 7 rebalance, 1 band label, 14 service). Three runs in a row: all passed.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 59 passed, 0 failed (2.3 minutes).
- `pnpm build`: succeeds (existing chunk-size warning only). Bundle `index-DytSo5qe.js` 771.53 kB (770.23 kB before P07, +1.3 kB).

### Residual risks

- The "was current" test is an inference (`recorded === revision - 1`); see the hand-off above.
- `inspectStaleTrips` findings use the rule ids of the recalculation (`trip.anchorNoRuntime`, `trip.anchorAmbiguous`), not `runtime.noApplicableBand`, because the legacy comparison runs the anchored recalculation from the first departure.
- A Trip with a hand-edited time now shows as stale after a route edit. That is the rule in the package (a Trip keeps its revision unless the profile reproduces its times) and matches how a Trip without a recorded source is already judged, but it is a visible change for planners who edit single times by hand; Decision 0014's addendum records it.
- What could still be wrong: the Pattern change signature includes the whole profile (including `updatedAt`), so re-saving the target profile without changing it between review and commit also rejects the review. That fails safe; the review is rebuilt in one click.

## P08: Trip generation and shift bounds

- Date: 2026-10-22. Sitting 4D. Model: Sonnet (main session). No sub-agents: P08 is S2, so no Opus review (sitting plan).
- Type: structural. Severity: S2.
- Commit: `2cdb883`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-011 | 2-001, 1-009 | S2 | A Last Trip request ignored the 500-Trip limit (Decision 0010 item 2). First Trip 0:00, headway 1 minute, Last Trip 23:59 produced 1,440 Trips. 1-009 is the document side: `ui-conventions.md` bounded only Number of Trips. |
| I-012 | 2-002, 5-011 | S2 | A Shift that moved a Trip before 0:00 produced negative times in the preview with no finding. Formatting one threw while React rendered, and with no error boundary the whole page went blank. Staging −6 minutes on a Trip departing 0:05 reproduced it. |
| I-013 | 2-003, 1-005 | S2 | Anchored regeneration under a `segmentStart` or blended profile silently chose one of several first departures that give the anchor time (the one nearest the saved departure). |
| I-064 | 2-010 | S3 | A zero-second Shift was accepted and marked every Trip as manually time-changed. |

User decision implemented: decision 3 (reject and list the candidates).

### What changed

- `src/domain/trips.ts`:
  - `validateGenerateTripsRequest` counts the departures from First Trip to Last Trip (Last Trip included when it is on the headway sequence) and rejects more than 500 with `tripGeneration.tripCountTooLarge` on field `lastTrip`, with the maximum as a parameter. Generation and the Build preview already call the validation, so they refuse the request.
  - `validateTrip` rejects a negative time with `trip.timeBeforeServiceDay`.
  - A segment-start or blended anchor that more than one first departure satisfies raises `trip.anchorAmbiguous` as an `AnchorBandChoiceError` whose choices list each candidate departure and its band, in departure order (Decision 0031 addendum). One candidate is used as before; none is `trip.anchorNoRuntime` as before. Manual band override stays single-band only.
  - `shiftTrips` with an offset of zero returns the Trips untouched (no `manuallyChangedFields`, no new `updatedAt`).
- `src/domain/tripShift.ts`: `buildTripShiftPreview` refuses a Shift that would put any time of a selected Trip below 0:00, with one `tripShift.timeBeforeServiceDay` finding per Trip. A Shift that lands exactly on 0:00 is allowed. The error says "A Shift would move a Trip before 0:00. Use a smaller Shift." The application's staged-Shift preview and commit both go through this function, so the commit refuses it too.
- Documentation: Decision 0031 addendum (segment-start and blend rule); `docs/ui-conventions.md` line 68 (the 500 limit applies to both limits; no other line changed); `architecture_overview.md` (Trip generation model).

### Behavior before and after (what you will see)

- Build Trips with a Last Trip that gives more than 500 Trips: before, 1,440 Trips were stored; now the drawer shows "Enter 500 trips or fewer." and stores nothing.
- Staging a Shift that would put a Trip before 0:00 (for example −6 minutes on a Trip at 0:05): before, the page went blank until reloaded; now the Shift drawer shows "A Shift would move a Trip before 0:00. Use a smaller Shift.", the table keeps the last valid staged times, and Done stays unavailable until the Shift is valid again. A Shift to exactly 0:00 works.
- A Recalculate review for a segment-start or blended Trip whose anchor fits two departures: before, one was chosen silently; now the review reports that the anchor is ambiguous. See the hand-off about the dialog below.
- A zero-minute staged Shift marks nothing (the drawer already discarded a net-zero Shift, so stored data was not affected).

### Hand-offs (not fixed here)

- **U07 (`App.tsx`):** the Recalculate dialog shows a band picker for any `AnchorBandChoiceError`. For a segment-start or blended Trip the picker lists the candidate departures, but choosing one is still refused (`trip.anchorBandChoiceInvalid`, shown as "Review this item."), because Decision 0031 limits manual band override to single-band profiles. **Decided by the user on 2026-10-23 (Option B):** the planner cannot pick a candidate for those methods. U07 hides the picker for segment-start and blended Trips and says that the fixed time can be reached two ways; the dialog's existing "Use first departure for this trip", another anchor, or revised bands resolve it. No domain change.
- **U07:** the React error boundary (the package text assigns it to U07). With P08, the known way to blank the page from a Shift is closed; any other render error still blanks it.
- **U07:** user-facing text for `tripShift.timeBeforeServiceDay` and `trip.timeBeforeServiceDay` in `USER_FACING_VALIDATION_MESSAGES`. The Shift drawer shows the error's own message, so nothing is missing from the screen today; the CSV preview cannot reach a negative time because the CSV parser already refuses one.

### Tests added

- `src/domain/trips.test.ts`, "generation and shift bounds (P08)" (9 tests): Last Trip over 500 is rejected in validation, in `generateRequestDepartures`, and in `generateAuthoritativeTrips` (1,440 case); exactly 500 is accepted and 501 rejected, including the inclusive Last Trip and a Last Trip between two departures; Number of Trips over 500, an invalid headway, and a Last Trip before First Trip are reported by their own findings and not by the limit; `validateTrip` rejects a negative time; segment-start and blended anchors with two departures raise `trip.anchorAmbiguous` and list both candidates, whichever departure is nearer the saved one; single-band still raises it and a unique anchor still recalculates (segment-start and blend); a zero-second shift returns the same Trip (no flag, no new `updatedAt`) and a non-zero shift still marks the Trip.
- `src/domain/tripShift.test.ts`, "staged Trip Shift bounds" (4 tests): a Shift before 0:00 is rejected with `tripShift.timeBeforeServiceDay` naming the Trip and the readable message; a Shift to exactly 0:00 is allowed; with several selected Trips only the ones that would go below 0:00 are named; a zero-second Shift is a no-op.
- `tests/ui/trip-bounds.spec.ts` (2 tests, real app and IndexedDB; the spec driving the staged Shift is ported from the review's `p5-trip-shift-negative.spec.ts`):
  - a six-minute Shift on a Trip at 0:05 shows the alert, keeps the page and the staged times, disables Done; five minutes lands on 0:00 and Done stores `[0, 420]`, also after reload;
  - Build Trips refuses a Last Trip that would create more than 500 Trips with the message and stores no Trip.

### Tests first: what failed on the current code

- Domain: 9 of 13 new tests failed (Last Trip limit 2, negative time 1, anchor ambiguity 2, zero shift 2, Shift bound 2 of 4); the rest are controls.
- Browser: the Shift spec failed on the current code: after the six-minute Back the drawer never showed an alert, because the page had gone blank (`element(s) not found`).

### Deliberate breaks (applied to the source, run, restored)

| Test | Deliberate break | Result |
| --- | --- | --- |
| Last Trip limit tests | the limit condition replaced by `false` | 2 fail |
| `validateTrip` negative time | the check replaced by `if (false)` | 1 fails |
| Anchor ambiguity tests | the ambiguity threshold raised to 99 (the old silent choice) | 2 fail (segment-start and blend) |
| Zero-second Shift tests | the zero shortcut removed | 2 fail (`trips.test.ts` and `tripShift.test.ts`) |
| Shift bound tests | the bound check disabled | 2 fail |
| Shift bound, browser | the bound off by one (`<= 0`) | the unit test for exactly 0:00 fails, and the spec fails at the five-minute step (the alert remains). The first test of the spec also fails on the unfixed code, shown above. |
| Build Trips limit, browser | the Last Trip limit condition replaced by `false` | the spec fails: no alert appears (the request would build 1,440 Trips) |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 33 files, 420 tests passed (407 before; 13 new: 9 in `trips.test.ts`, 4 in `tripShift.test.ts`). Three runs in a row: all passed.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 61 passed, 0 failed (2.3 minutes); 59 before P08 plus the 2 new tests. No `test.fail`, `test.skip`, or `test.fixme`. A full run before the second spec test was added also passed (60 of 60).
- New spec repeated with several workers: the Shift test passed 40 of 40 (`--repeat-each=10` and `--repeat-each=30`, `--workers=8`), and the whole spec (both tests) passed 30 of 30 (`--repeat-each=15 --workers=8`).
- `pnpm build`: succeeds (existing chunk-size warning only). Bundle `index-VVj0arcS.js` 772.60 kB (771.53 kB before P08, +1.1 kB).

### Residual risks

- A request of 500 Trips or fewer that the Last Trip limit now allows is unchanged; a planner who needs a day of one-minute headway builds it in two requests.
- The shift bound is checked on the Trips the Shift selects, at preview and at commit. The legacy `previewTripShift` (used only by tests since X01) still calls `shiftTrips` without the bound; it has no caller in the application.
- What could still be wrong: negative times that already exist in stored data (from the old defect) are not repaired. The app could only reach them by committing a staged Shift, which the old UI could not do (the page crashed first), so none is expected; a hand-made backup could still carry one, and `validateTrip` now reports it only where a caller validates (CSV import).

## P09: Application validation and deletion reviews

- Date: 2026-10-23. Sitting 4E. Model: Sonnet (main session). No sub-agents: P09 is S2, so no Opus review (sitting plan).
- Type: structural. Severity: S2.
- Commit: `fd1e65b`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-009 | A-005, 4-005 | S2 | `updateServiceDay` saved a count above 365 (as a total), negative, fractional, or `NaN`, and a blank or untrimmed name. The Costing estimate then turned invalid with no edit-time message. |
| I-018 | 3-007 | S2 | Deleting a Node in the Node editor left pull-out, pull-in, and deadhead activities pointing at the deleted Node (138 for a garage Node in the golden project), and the review did not report them. |
| I-027 | 4-011, 4-012 | S2 | Deletion reviews were incomplete. The Trip profile token was optional and ignored Blocking Scenarios, so an empty Blocking Scenario created after the review was deleted silently. `deleteTrips` removed Block activities its review had not shown. Route, Scenario, Runtime profile, and Project deletions had no token. |
| I-052 | 1-006 | S3 | The overview said annual counts are "capped at 365"; the code treats a total above 365 as an error. |
| I-078 | 4-020 | S3 | `renameScenario` accepted a blank name. (The second half of the finding, the legacy per-field mutators, is not in the package's acceptance criteria; see the residual risks.) |

Also done, as assigned:

- **Added acceptance criterion from the 4C decision (the service half of the Runtime first-visit race).** `ensureDefaultRuntimeProfile` is one check-and-write in a single transaction. Marked done below.
- **Criterion 5:** a query that returns every Service day that shares a Runtime profile, for U07 (I-041, 02R-AC18).

No user decision applied beyond the assignment of the race to this package (4C decision bullet).

### What changed

- `src/application/routeDefinitionService.ts`:
  - `updateServiceDay` accepts only `name` and `annualServiceDays` (the only two fields any caller patches; other fields are ignored). A blank name, a count that is not a whole number of 0 or more, and a total above 365 are refused with `ServiceDayValidationError`, whose `findings` use the existing finding shape (`ruleId`, `entityType: 'serviceDay'`, `entityId`, `field`, `parameters`) and whose message is plain language ("Annual service days cannot total more than 365. This change would make the total 504."). A name is trimmed. A refused edit writes nothing and publishes no save status. A total that is already above 365 (saved before this check) may be reduced in steps but not raised, so a planner can correct it. An unchanged patch still writes nothing.
  - `renameScenario` rejects a blank name ("Scenario name is required", the message `createScenario` uses) and trims.
  - Node deletion: `applyNodeChanges` removes the pull-out, pull-in, and deadhead activities that name a deleted Node (the Blocks stay and their remaining activities are renumbered). `NodeChangePreview.nonRevenueImpact` reports `{ blockIds, removedActivityCount }`. The route-edit signature also covers Blocks that name a Node of the Route, so a Block that changed after the review makes the commit refuse.
  - Deletion reviews: `getProjectDeletionImpact`, `getScenarioDeletionImpact`, `getRouteDeletionImpact`, and `getRuntimeProfileDeletionImpact` return a `reviewToken`; `deleteProject(projectId, reviewToken)`, `deleteScenario(scenarioId, reviewToken)`, `deleteRoute(routeId, reviewToken)`, and `deleteRuntimeProfile(profileId, replacementProfileId, reviewToken)` require it. What each token covers is in Decision 0041. Route deletion and its review now come from one private plan (`planRouteDeletion`), so the review cannot disagree with the deletion; the review's numbers are unchanged.
  - `ensureDefaultRuntimeProfile` computes what is missing from the stored Scenario and, only when something is missing, applies the same computation inside `updateScenarioRecords` (which re-reads the stored records in the write transaction). A call that finds everything in place writes nothing and publishes no save status.
  - `listRuntimeProfileServiceDays(profileId)`: every Service day assigned the profile, in the canonical order. Added to `RouteDefinitionApplication`.
- `src/application/tripGenerationService.ts`: `previewTripProfileDeletion` reads the Scenario's Blocking Scenarios, reports `blockingScenarioCount`, and signs the profile, the other profiles, its Trips, its Blocks, its Blocking Scenarios, and its stale Trips. `deleteTripProfile(profileId, previewToken)` requires the token (it was optional). `previewTripDeletion` returns a `reviewToken` over the Trips and every Block that would lose an activity; `deleteTrips(tripIds, reviewToken)` requires it.
- New `src/application/reviewToken.ts`: `fingerprint` (a stable 53-bit hash of record sets ordered by id; 17 ms for the 984 Trips and 69 Blocks of the golden project), `assertReviewCurrent`, and `DeletionReviewStaleError` ("The <thing> deletion review is out of date. Review the impact again.").
- `src/ui/App.tsx` (wiring only; no layout, state, or interaction changed): the six deletion callers pass the token from the preview they already hold (Project, Scenario, Route, Runtime profile, Trips; the Trip profile caller already did). The two pieces of state that keep a review (`profileDeletionImpact`, `tripDeletion`) carry the token.
- `ports.ts` needed no change: tokens live in the services.
- Documentation: Decision 0041 (new); `architecture_overview.md` (the 365 rule, deletion reviews and Node deletion, atomic default provisioning).

### Behavior before and after (what you will see)

- Service days table: typing a count that would push the total above 365 (or a negative or fractional count) is refused and the error banner says why; before, it saved and Costing turned invalid. A blank service day name is refused and a name is trimmed. The table does not yet show the message beside the field (U06).
- Rename scenario with a blank name is refused.
- Saving the Node editor after deleting a Node that pull-outs, pull-ins, or deadheads name now removes those activities; before, they stayed and pointed at a Node that no longer existed. The impact dialog does not list them yet (hand-off below).
- Every deletion is checked against its review. If the data changed after the planner opened the confirmation, the app shows "The route deletion review is out of date. Review the impact again." (or scenario, project, runtime profile, Trip, Trip profile) and deletes nothing. After such a refusal the Runtime profile and Trips delete dialogs stay open with the old review; Cancel and open them again.
- Opening Trips for the first time no longer risks eight stored assignments, a second Default profile, or the "Duplicate runtime assignment" banner.

### Tests added

- `src/application/routeDefinitionService.test.ts` (32 new test runs):
  - "Service day and Scenario validation" (9): total above 365 refused with a field finding and no save status; a total of exactly 365 and a lower total accepted; `-5`, `1.5`, `NaN`, and `Infinity` refused; blank name refused, name trimmed, both fields reported at once; a total already above 365 comes down in steps but cannot be raised; `renameScenario` blank and trim.
  - "Node deletion removes the non-revenue activities that name the Node", on the in-memory and the Dexie repository (4 × 2): the review lists Blocks and the activity count and writes nothing; commit removes them, keeps the Blocks, renumbers, leaves no reference; a Block that changed after the review makes the commit refuse; deadhead and pull-in activities of a Node that a Pattern also uses are counted.
  - "Deletion reviews carry a required token" (5): Project, Scenario (not invalidated by a change in another Scenario), Route (a late Trip; a Block it would change), and Runtime profile (profile rename; assignment change) are refused when stale and accepted with a fresh review; every deletion refuses a missing, empty, or foreign token.
  - "Default Runtime profile provisioning under overlapping calls", on both repositories (4 × 2): 2 and 5 calls at once leave one Default profile and four assignments, one per standard Service day, and every call returns the same ids; a later call changes nothing and publishes no save status; an existing profile is kept and resized to a longer Pattern.
  - "Service days that share a Runtime profile" (2): the canonical order, a second profile on Saturday only, an unused profile, and an unknown profile.
- `src/application/tripGenerationService.test.ts`, "Trip deletions carry a required review token" (7): an empty Blocking Scenario created after the review keeps the profile and the Blocking Scenario (A1-07); `blockingScenarioCount` and the full branch deleted with a current token; a Block of the Blocking Scenario changed after the review; a missing or empty token refused; Trips refused when a Block that uses one is saved after the review (A1-06); refused when a Trip changed, accepted with a fresh review that lists the Block; a token from another selection refused.
- `src/persistence/repositoryContract.test.ts` (1 test, 2 runs): overlapping `updateScenarioRecords` calls each see the other's write.
- `tests/ui/deletion-reviews.spec.ts` (5 tests, real app on IndexedDB): Delete route (with 3 Trips) after the review; Delete route refused after a Trip was added, then accepted with a fresh review; Delete scenario refused after a Service day of it changed, then accepted; Delete selected Trips refused after a Block that uses one was saved, then accepted with the Block shown; Delete runtime profile refused after the profile changed, then accepted with a replacement.

### Tests first: what failed on the current code

- Unit, the final tests run against the original source of the four changed files (and without `reviewToken.ts`): 36 of the 157 tests in the five affected test files failed. They are 35 of the 41 new runs and the one existing test that now expects a review token (`deletes selected trips and removes their revenue activities`). The 6 new runs that passed are controls: a total of exactly 365 and a lower total are accepted; a later `ensureDefaultRuntimeProfile` changes nothing and an existing profile is kept and resized (each on both repositories); the Dexie run of the overlapping-update contract test. The overlapping-call tests failed with "Duplicate runtime assignment for <pattern>:<service day>", the banner of the 4C finding, on the in-memory and on the Dexie repository (2 and 5 calls). All 7 Trip deletion tests failed (an optional token let `deleteTripProfile('tp2', undefined)` delete the profile).
- The contract test failed on the old in-memory repository (`expected ['+c'] to equal ['+a', '+b', '+c']`: two of three overlapping updates were lost) and passed on Dexie. The in-memory `updateScenarioRecords` yielded between its read and its write.
- Found by self-review and covered by a test that failed first: a Block that names a Node of the Route and changed after a Node review was not in the route-edit signature, so the commit removed activities the review had not shown.

### Deliberate breaks (each applied to the source, the tests run, and the source restored)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Service day validation | the validation before the write and the re-check inside the write both removed | 7 fail |
| Service day validation | only the validation before the write removed (the re-check inside the write still refuses) | 1 fails: a refused edit must not start a save |
| Service day count format | the whole-number-of-0-or-more check removed | 5 fail |
| Service day total rule | the `> 365` condition replaced by false | 2 fail |
| Blank service day name | the name check removed | 1 fails |
| Blank scenario name | the check removed | 1 fails |
| Node deletion commit | blocks left unchanged in `applyNodeChanges` | 1 fails (per repository, so 2 runs) |
| Node deletion review | `nonRevenueImpact` empty | 2 fail |
| Deletion token check | `assertReviewCurrent` does nothing | 5 fail |
| Route token | changed Blocks left out of the fingerprint | 1 fails |
| Scenario token | Blocks left out | 1 fails |
| Trip profile token | Blocking Scenarios left out | 1 fails |
| Trips token | Blocks left out | 1 fails |
| Race tests | the write ignores the second computation (`() => unchanged.records`) | 4 fail |
| Runtime query | assignments of other profiles included | 1 fails |
| Contract: overlapping updates | in-memory `updateScenarioRecords` awaits the read again | 1 fails |
| Browser spec | `assertReviewCurrent` does nothing | the 4 refusal tests fail (Delete route plain passes) |
| Browser spec | `App.tsx` passes the token `'wrong'` for Route, Scenario, Trips, and Runtime profile | all 5 fail |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 33 files, 461 tests passed (420 before; 41 new runs: 32 in `routeDefinitionService.test.ts`, 7 in `tripGenerationService.test.ts`, 2 contract runs; the existing tests that now take a token are not new). Three runs in a row, 8.5 s each.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 66 passed, 0 failed (2.5 minutes); 61 before plus the 5 new tests. No `test.fail`, `test.skip`, or `test.fixme`. One earlier run failed 2 tests in `single-tab.spec.ts`; see the fixture change below.
- New spec stress run: `--repeat-each=10 --workers=8`, 50 of 50 passed (1.7 minutes).
- `pnpm build`: succeeds (existing chunk-size warning only). Bundle `index-DQ_m5s4t.js` 777.85 kB (772.60 kB before P09, +5.25 kB; the review-token module, the validation, the single plan for Route deletion, and the provisioning plan).

### Fixture change forced by the intended behavior (assertion kept)

`tests/ui/single-tab.spec.ts` (two tests) typed the value `256` into the Weekday annual count to produce an edit that only the read-only guard should refuse. The golden project's counts total exactly 365 (255 + 52 + 52 + 6), so 256 makes 366 and the new validation refuses it first, with a different message. The value is now `254` (total 364) and the second assertion reads `not.toBe(254)`. Every assertion about the read-only rejection is unchanged.

### Hand-offs (files outside the package's owned list; minimum change each)

- `src/persistence/inMemoryRepository.ts`: `updateScenarioRecords` now reads, changes, and writes without yielding (the read and the write were already synchronous inside `async` methods; the extra `await` between them is gone). Without it the in-memory repository loses an update under overlapping calls, which Dexie's transaction already prevents. `getScenarioRecords` and `saveScenarioRecords` are now thin wrappers over private synchronous methods. No behavior of the other methods changed. The new contract test is in `src/persistence/repositoryContract.test.ts`.
- `src/persistence/repositoryContract.test.ts`: `deleteScenario` takes a token (one call). `src/application/tripProfile.test.ts` and `src/application/authoritativeTripService.test.ts` (tests of `TripGenerationService`): the calls that delete now take the token of a review taken first; assertions unchanged except that the expected review now includes `reviewToken: expect.any(String)`.
- New `src/application/reviewToken.ts` (not on the owned list): the helper is shared by the two services.
- New `tests/ui/deletion-reviews.spec.ts`: the package lists no browser spec; the six `App.tsx` callers it wires needed one.
- UI packages (not done here, by design):
  - **U05 (destructive actions):** the Node editor's impact dialog does not list `nonRevenueImpact` (Blocks and activities removed); the Trip profile confirmation does not mention `blockingScenarioCount`; the Runtime profile and Trips delete dialogs stay open with the old review after a refusal (close them, or refresh the review). The other confirmations close on confirm.
  - **U06:** the Service days table shows the message in the error banner. Showing each `ServiceDayValidationError` finding beside its field is U06's (acceptance criterion 1).
  - **U07:** the shared-profile line should call `listRuntimeProfileServiceDays` (I-041).

### Residual risks

- Pattern deletion (`deletePattern`) has no review token. It is the same defect class (it deletes Runtime profiles, assignments, Trips, and changes Blocks). Package P09's list names six deletions and Pattern is not among them, so it is not changed. Suggested owner: the user's choice (a small addition to P09's pattern, or P14).
- The legacy per-field route mutators (`updatePattern`, `addNode`, `updateNode`, `addPattern`, `addPatternPoint`, `updatePatternPoint`, `movePatternPoint`, `removePatternPoint`, `createReversePattern`, `duplicatePattern`, and the Direction ones) still bypass the preview and the Pattern validation (the second half of finding 4-020). The application does not call them; only unit tests use them to build fixtures, and `addPatternPoint` itself builds a Pattern up through `updatePattern`, so a two-point minimum cannot be added there without rewriting those fixtures. Left for a decision: delete them and move the fixtures to preview/commit, or leave them as test helpers.
- `ensureDefaultRuntimeProfile` now writes through `saveScenarioRecords`, which validates every Runtime profile of the Scenario and rewrites the Scenario's rows once, only when something is missing (first visit to a Pattern, or a resize). The application cannot store an invalid profile (`saveRuntimeProfile` refuses it), so no Scenario is expected to hold one; if one did, creating a Default profile for another Pattern would fail until it is corrected. Like every Scenario-wide write (Decision 0036), it reads and writes the whole Scenario.
- A review token is a fingerprint of the stored records, so any change to a record it covers, even a harmless one, refuses the deletion and asks for a new review. That is the intended fail-safe.
- The single-flight load in `App.tsx` (the other half of the race) and the two steps in `tests/ui/support/tripsWorkspace.ts` remain for U07, as the added criterion requires. With the service fixed, the app's own first-visit creation path is now correct, but the browser helper still creates the defaults first.
- The P07 hand-off about `rebalanceDependentService` does not apply: P09 did not change that call.

## P10: Save status and local-data protection

- Date: 2026-10-23. Sitting 4E. Model: Sonnet (main session). No sub-agents: P10 is S2, so no Opus review (sitting plan).
- Type: structural. Severity: S2.
- Commit: `2eb3439`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-023 | 4-006 | S2 | Only Route saves published the visible save status. 33 repository writes in the Trips, Blocking, and Costing services never showed "Saving locally…" or "Local save failed", and an error status stayed until the next Route save. |
| I-045 | 6-003 | S2 | The application never asked the browser to keep its store, never recorded when a backup was last exported, and showed the browser's raw text ("The current transaction exceeded its quota limitations. QuotaExceededError: …") when a write failed because the store was full. |

User decisions implemented: decision 11 (the save status covers every write: Route, Trips, Blocking, and Costing) and decision 16 (request persistent storage, map quota errors to plain guidance, remember the time of the last backup). Decision C5 (the shared Pages origin) is recorded in the Decision 0001 amendment, with no code change, as approved.

### What changed

- New `src/application/saveStatus.ts`:
  - `SaveStatusPublisher`: the one publisher of the save status. `run(write)` publishes `saving`, then `saved` (with the time) or `error` (with the message), and rethrows. The status is `saving` while any write is in flight, and a burst that contained a failure ends as `error`, so overlapping writes cannot hide a failure. `error` stays until the next successful write.
  - `StorageFullError` and `isQuotaExceeded`: a quota failure (`QuotaExceededError` by name, DOMException code 22, a wrapper's `inner` or `cause`, or a message that names it) becomes `StorageFullError`, message "Browser storage is full. Export a backup, then free space.", with the original kept as `cause`. Other errors pass through unchanged.
  - `publishWrites(repository, publisher, writes)`: returns the repository with the listed write methods run through the publisher. The Trips, Blocking, and Costing services use it, so no call site has to remember to publish. A method that is not listed, or that the repository lacks, is returned as it is.
  - `LocalDataProtectionService`: after the first successful save on a browser profile it calls `navigator.storage.persist()` once (not when the store already reports itself persistent) and records `granted`, `denied`, or `unavailable`. A recorded answer is not asked for again; `requestPersistentStorage()` is available for a planner action. `recordBackupExported()` records the time. It implements the new `LocalDataProtectionQueries` port.
- `src/application/ports.ts`: `LocalDataProtection`, `LocalDataProtectionQueries`, `LocalDataProtectionStore`, and `StorageManagerPort` (the part of `navigator.storage` the application uses, so the application layer does not touch the browser).
- `src/application/routeDefinitionService.ts`: takes the shared publisher (and the protection service) as constructor arguments; `save` runs through it; `exportProject` records the backup time; `getLocalDataProtection` and `subscribeToLocalDataProtection` (also on `RouteDefinitionApplication`) give the screen the port without a new prop. The list `ROUTE_DEFINITION_WRITE_METHODS` names the repository writes this service publishes explicitly.
- `src/application/tripGenerationService.ts`, `blockingService.ts`, `costingService.ts`: take the shared publisher and wrap their repository with `publishWrites` (`TRIP_GENERATION_WRITE_METHODS`, `BLOCKING_WRITE_METHODS`, `COSTING_WRITE_METHODS`). No write method body changed. Each defaults to its own publisher, so existing callers and tests are unaffected.
- `src/main.tsx`: creates one `SaveStatusPublisher` and one `LocalDataProtectionService` (with the `localStorage` store and `navigator.storage`) and passes them to the four services.
- New `src/persistence/localDataProtectionStore.ts` (not on the owned list): `LocalStorageDataProtectionStore` keeps the record under `transit-costing-tool.local-data-protection.v1`, like the selection preferences. A missing, unreadable, or wrong-shaped value reads as empty (each field is checked), and a failed write is ignored.
- Documentation: Decision 0001 amendment (decision 11, decision 16, C5 including the shared-origin risk); `architecture_overview.md` (persistence section).

### Behavior before and after (what you will see)

- A Trips, Blocking, or Costing write now shows "Saving locally…" in the header while it runs, and "Local save failed" if it fails, until the next successful write. Before, only Route saves did.
- A write that fails because the browser store is full now says "Browser storage is full. Export a backup, then free space." in the error banner. Before, it showed the browser's text.
- A Blocking write that is refused because its source changed after the review also shows "Local save failed" (the refusal happens inside the write).
- The first time anything is saved on a browser profile, the browser may be asked to keep the store (Firefox shows a permission prompt; Chromium decides silently). Nothing on screen says so yet.
- Exporting "Backup project JSON" records the time on the device. Nothing on screen shows it yet (U02).

### Tests added

- `src/application/saveStatus.test.ts` (19 tests):
  - `SaveStatusPublisher` (6 tests, 10 runs counting the five quota shapes): saving then saved with the time; a failure is rethrown unchanged and stays until a later success; overlapping writes stay `saving` until the last ends, a failure in the burst ends it as `error`, and a new burst starts clean; five quota shapes become `StorageFullError` with the plain message and the original as `cause`; other errors and an already-mapped error pass through, and a self-referencing error does not loop; the after-save hook runs once per successful burst and not after a failure.
  - `LocalDataProtectionService` (4): persistence asked once after the first save with the answer recorded, however many saves follow; a refusal is recorded and not asked again on a later start, while an explicit request still asks; no request when the store is already persistent, and `unavailable` for a missing, empty, or throwing browser API; the backup time is recorded, keeps the persistence answer, and tells subscribers.
  - "Every write of the four services publishes through one publisher" (5): one write in each service publishes saving and saved; a failed write in each service is a `StorageFullError` and the one status shows it, and the next write clears it; `exportProject` records the time through the Route service, a failed export does not, and the record is exposed; every write-like method (names beginning `save`, `delete`, `insert`, `replace`, `commit`, `update`, `restore`, `copy`) of the Dexie and in-memory route repositories and the Dexie and in-memory Blocking repositories is classified in one of the four lists, so a new write method fails the test until a service publishes it; a full Route workflow on the Dexie repository (create, duplicate, rename, edit, runtime, Node commit, import, three deletions) runs every repository write inside a published save.
- `src/persistence/localDataProtectionStore.test.ts` (7 tests): round trip; `not json`, `null`, `[]`, a string, and a record with wrong field types each read as empty; a partly valid record keeps its valid fields; a storage that throws, or is missing, reads as empty and ignores a write.
- `tests/ui/local-data-protection.spec.ts` (5 tests, real app on IndexedDB; the quota simulation is ported from the review's `p6-quota.spec.ts`):
  - a full store, for a Route edit, Build Trips, New Block, and a Costing save: each starts from a clean status, shows the plain message and "Local save failed", stores nothing, and after the store has room again the same action succeeds and the status clears;
  - a successful write in each of the four services shows "Saving locally…" in the one indicator (a transaction held open for 0.8 s makes the saving state last, because a fast write can finish before React draws it);
  - the browser is asked once after the first save, not by later saves, and not again after a reload;
  - a refusal and a browser without the request are recorded and not repeated;
  - "Backup project JSON" records the time within the test's window, and the backup file does not contain it.

### Tests first: what failed on the current code

The final tests, run against the source of the package-P09 commit (the new modules present but not wired in):

- Unit: 5 of the 26 new tests failed (one write per service; a failed write per service; the backup time; the write classification; the Route workflow). The other 21 test the new modules themselves, which did not exist before, so they pass on arrival and are shown by the deliberate breaks below.
- Browser: all 5 failed.

### Deliberate breaks (each applied, run, and restored)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Publisher | quota errors not mapped | 5 fail |
| Publisher | a failed write of a burst forgotten | 8 fail |
| Write gate | `publishWrites` publishes nothing | 2 fail |
| Persistence request | no once-only guard | 2 fail |
| Backup time | `exportProject` does not record | 1 fails |
| Route writes | `save` does not publish | 2 fail |
| Write classification | `insertTripsAtomically` removed from the Trips list | 1 fails |
| Store | any `persistentStorage` value accepted | 2 fail |
| Browser, quota and indicator tests | the Trips service not given the shared publisher | both fail (first run of the quota test passed this break: the status was still `error` from the Route step, so the test was restructured to start each step from a clean status, and the break then failed it) |
| Browser, quota and indicator tests | the Blocking service not given the shared publisher | the quota test fails (checked before the Costing leg was restored) |
| Browser, quota and indicator tests | the Costing service not given the shared publisher | both fail |
| Browser, persistence tests | no after-save hook in `main.tsx` | 2 fail |
| Browser, backup test | `exportProject` does not record | 1 fails |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 35 files, 487 tests passed (461 before; 26 new: 19 in `saveStatus.test.ts`, 7 in `localDataProtectionStore.test.ts`). Three runs in a row.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 71 passed, 0 failed (2.7 minutes); 66 before plus the 5 new tests. No `test.fail`, `test.skip`, or `test.fixme`.
- New spec stress runs, `--repeat-each=10 --workers=8`: the final form passed 50 of 50, then 49 of 50 (one timeout in the indicator test at the Trips step, 240 s, cause not found), then 50 of 50 with traces, and the indicator test alone 10 of 10. A final run is recorded in the P11 entry. Earlier forms of the spec failed in the Costing step; see "Costing save and I-044" below.
- `pnpm build`: succeeds (existing chunk-size warning only). Bundle `index-CgKt-qRs.js` 781.75 kB (777.85 kB before P10, +3.90 kB).

### Costing save and I-044 (a finding made while testing)

A Costing save is slow when the Costing estimate is working. On the unchanged `origin/main` (ee0d61c), a probe that fills the rate and clicks Save on the golden project, run 16 times with 8 browsers sharing the machine, did not store the assumption within 8 seconds in 8 of the 16 runs; with the 90-second allowance used in the new spec, every run completed. The save is a read-write transaction, and the estimate (finding 6-002 / I-044, fixed by Package P11) issues about 800 reads per build that the transaction waits behind. I did not measure the queue directly; the evidence is the timing, the identical result before this package, and the fact that Route, Trips, and Blocking saves under the same load were never slow. While the save waits, the Save button and the header show "Saving…". The new spec gives its Costing steps 90 seconds and says why. P11 should make them fast.

### Hand-offs and what the next packages must know

- New file outside the owned list: `src/persistence/localDataProtectionStore.ts` and its test (the `localStorage` implementation of the port; the application layer stays free of browser APIs).
- **U02:** show `getLocalDataProtection()` (available on the `service` object that `App` already holds): "Last backup: <date and time>" or "No backup exported yet" under "Backup project JSON", and the recorded persistence answer if wanted. Add `QuotaExceededError`, `VersionError`, and `UnknownError` to the technical-error filter of `showError` as U02 criterion 4 says; the new storage-full message does not match the filter, so it already reaches the banner.
- **U02:** a read-only tab's rejected write now also sets the header status to "Local save failed" (the message is the read-only text); present the read-only status before that.
- The constructor argument order changed: `RouteDefinitionService(repository, backup, now, saveStatus, protection)`, `TripGenerationService(repository, now, saveStatus)`, `BlockingApplicationService(repository, context, saveStatus)`, `CostingApplicationService(contextQueries, assumptionsRepository, now, saveStatus)`. All new arguments are optional.
- P11 moves the Costing context builder out of `main.tsx`; the shared publisher stays wired as it is.

### Residual risks

- Real quota exhaustion was not reproduced here. Chromium's DevTools quota override did not block writes (a Costing save under it simply finished), so the browser spec uses the review's simulation (the store's `put` and `add` throw the error a full store raises). A real full store aborts the transaction asynchronously; `isQuotaExceeded` looks through Dexie's `inner` and `cause` chain and accepts the error name, the code 22, or a message that names it, which covers the shapes Dexie and IndexedDB produce, but it was proven with those shapes, not with a real failure.
- The backup time is recorded when the backup text is produced, not when the download finishes. A download that the planner cancels is still counted; the application cannot observe a download.
- `navigator.storage.persist()` in Firefox shows a permission prompt the first time. The answer is recorded and the request is not repeated, so a planner who dismisses the prompt is not asked again unless a later screen offers the request.
- The `error` status stays until the next successful write, as before for Route saves. A planner who sees "Local save failed" and then does not save again keeps seeing it. The error banner carries the specific message.
- The single timeout in the 49-of-50 stress run (an unrelated `selectOption` at the Trips step) was not reproduced in the roughly 70 runs of the same spec that followed (50 with traces, 10 of the indicator test alone, and the full-suite run). Its cause is unknown; I treat it as load on the shared machine, with that uncertainty recorded.
- What could still be wrong: a repository write added later under a name that does not begin with one of the eight prefixes the classification test looks for would not be caught by it.

## P11: Blocking and Costing read paths

- Date: 2026-10-23. Sitting 4E. Model: Sonnet (main session). No sub-agents: P11 is S2, so no Opus review (sitting plan).
- Type: structural. Severity: S2.
- Commit: `82bd08a`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-043 | 6-001, 4-008 | S2 | The Blocking screen checked every unassigned Trip against the selected Block with one `classifyInsertion` call each, and each call re-read every Trip and Pattern of the Scenario. At capacity (400 Blocks, 2,000 Trips, 300 unassigned) that was 302 reads of the Trips and about 23 seconds before "Assign" was ready. |
| I-044 | 6-002 (structural part) | S2 | The Costing context in `main.tsx` summarized each Block on its own, and each summary re-read every Trip and Pattern. At capacity that was 401 reads of the Trips and about 30 seconds before the estimate appeared. The same reads queued ahead of a Costing save (see the P10 entry, "Costing save and I-044"). |
| I-074b | 4-014 (Costing items) | S3 | `CostingWorkspace.tsx` validated the assumptions, summed the annual service days, checked the 365-day limit, built the list of service years, and clamped the future years itself. |
| I-080 | 4-023 | S3 | The Costing context builder lived in `main.tsx` (the composition root), where it could not be tested without the browser. |

### What changed

- `src/application/blockingService.ts` and `ports.ts`: `classifyInsertions(blockingScenarioId, blockId, tripIds, insertAt?, minimumLayover?)` returns a map from Trip id to compatibility. It reads the Blocking Scenario and the Block, then the Trips and the Patterns once, and classifies every Trip from that read. A Trip that is not in the Scenario's Trip Profile is looked up on its own, as `classifyInsertion` does, and a Trip that cannot be found is `incomplete`. When the Blocking Scenario or the Block is gone, every Trip is `incomplete` and nothing else is read. `classifyInsertion` (one Trip) is unchanged.
- New `src/application/costingContext.ts`: `buildCostingCalculationContext(sources, scenarioId, blockingScenarioId)` and `createCostingContextQueries(sources)`. The Trips and the Patterns are read once per build and every Block is summarized from that read with `summarizeBlockingScenario`. A Blocking Scenario of another Scenario, a missing Scenario, and a missing Trip Profile each give `undefined`. `main.tsx` now only supplies the sources (`CostingContextSources` in `ports.ts`).
- `src/application/costingService.ts` and `ports.ts` (`CostingQueries`): `validateAssumptions`, `summarizeServiceDays` (total, maximum 365, whether the total is above it), `listServiceYears`, and `normalizeFutureYearCount` (a whole number from 0 to 10; not-a-number gives 0). They use the domain constants and `validateCostingAssumptions`.
- `src/ui/BlockingWorkspace.tsx`: the compatibility effect makes one `classifyInsertions` call instead of one `classifyInsertion` call per Trip (4 lines).
- `src/ui/CostingWorkspace.tsx`: the five rules above are read from `costingService` (14 lines). The Total cell reads `annualDays.total`. Nothing else in the file changed.
- `src/main.tsx`: the context builder moved out; `listProfileTrips` and `listScenarioPatterns` are the two shared reads for the Blocking and Costing sources.
- Documentation: `architecture_overview.md` (Costing data flow).

### Behavior before and after (what you will see)

- Blocking, with a Block selected and many unassigned Trips: "Assign" is ready sooner. At capacity: 23.1 s before, 1.4 to 6.3 s after on the development server with eight browsers sharing the machine, and 0.57 to 0.70 s in the production build on an idle machine.
- Costing at capacity: the estimate appears in 0.4 to 1.3 s (development server, eight browsers) instead of 30 s. A Costing save no longer waits behind the estimate.
- Nothing else changes on screen. The Costing values are pinned by the new browser spec, which passes against both the old and the new `CostingWorkspace.tsx`.

### Deviation from the criterion

Criterion 1 says Assign is enabled within 1 s. The built application meets it (0.57 to 0.70 s, idle machine). The browser spec runs on the Vite development server, where React `StrictMode` runs every effect twice and the code is not minified: 1.2 to 1.4 s on an idle machine, and up to 6.3 s with eight browsers. A 1 s limit there would fail for the machine's load, not for a defect, so the committed spec asserts what the defect is (the number of Trip reads) with a loose time limit of 15 s (Blocking) and 10 s (Costing), a third of the old times. The production numbers above are the evidence for the 1 s and 2 s targets. They were measured once, by hand, and are not asserted by any test.

### Tests added

- Unit, `src/application/blockingService.test.ts` (4 tests, "Batch insertion classification"): the result for every listed Trip equals the result of `classifyInsertion` for it, from one read of the Trips and the Patterns; the Trips are read once however many Trips are classified, and a duplicate id is classified once (read counts, not time); a Trip it cannot find is `incomplete` after a single lookup for it; a missing Blocking Scenario or Block gives `incomplete` for every Trip without reading the Trips.
- Unit, `src/application/costingContext.test.ts` (7 tests, two Scenarios and two Trip Profiles, four Blocking Scenarios): the context holds only the selected Blocking Scenario, its Trip Profile, its Trips and Blocks, and its Scenario; each of the four Blocking Scenarios gets its own data; each Block's summary equals the Blocking service's summary for that Block; the Trips and the Patterns are read once per build however many Blocks there are; a Blocking Scenario of another Scenario, an unknown one, or one whose Scenario or Trip Profile is gone gives `undefined`; a Blocking Scenario of another Scenario is ignored even when a source returns it; the queries list the Blocking Scenarios of one Scenario only.
- Unit, `src/application/costingService.test.ts` (4 tests, "assumption and service-day rules the screen reads from the service"): `validateAssumptions` returns what the domain returns; `summarizeServiceDays` totals the days against the 365-day limit; `listServiceYears` starts at the first year of service and has one more year than the number of future years; `normalizeFutureYearCount` gives a whole number from 0 to 10.
- Browser, `tests/ui/capacity-read-paths.spec.ts` (2 tests, the golden specs `p6-capacity-latency.spec.ts` and `p6-costing-timing.spec.ts` ported) with the new support file `tests/ui/support/capacityFixture.ts` (four Service days of 100 Blocks and 500 Trips each, so 400 Blocks and 2,000 Trips; with 2 Trips per Block 300 Trips per day stay unassigned; Trips in a Block are 90 minutes apart so every Block is valid): reads of the Trips store while the tab opens (at most 16 for Blocking, at most 8 for Costing; measured 3 and 1) and a loose time limit; every unassigned Trip is reviewed.
- Browser, `tests/ui/costing-rules-from-service.spec.ts` (4 tests, golden project): the day counts and the total "365 / 365" in the valid style; a saved total above 365 marked invalid; the year list starts at the first year of service and Future Years clamps to 0 to 10; a rate year after the first year of service blocks Save and shows the explanation.

### Tests first: what failed on the current code

- Unit: all 15 new tests fail on the unfixed code, because the new module and methods do not exist there. That shows only that they are new; what each one guards is shown by the deliberate breaks below, and the old behavior (one read per Trip, one per Block) is shown by the capacity spec on the unfixed source.
- Capacity spec on the unfixed source (`origin/main` plus P09 and P10), one worker: both tests failed on the read count: Blocking 302 reads and 23,140 ms; Costing 401 reads and 30,315 ms.
- Costing display spec on the unfixed source: passes. It is a characterization of values that must not change; it passes against the old and the new `CostingWorkspace.tsx`, and fails when the service rules are broken (below).

### Deliberate breaks (each applied, run, and restored from a saved copy)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Batch classification | reads the Trips once per Trip | 3 fail |
| Batch classification | no single-Trip fallback for a Trip outside the Trip Profile | 1 fails |
| Costing context | reads the Trips once per Block | 1 fails |
| Costing context | accepts a Blocking Scenario of another Scenario | 1 fails |
| Costing context | reads the Trips of every Trip Profile | 2 fail |
| Costing rules | `validateAssumptions` returns no findings | 1 fails |
| Costing rules | the day total never exceeds the limit | 1 fails |
| Costing rules | the year list omits the first year's future years (`+ 1` removed) | 1 fails |
| Costing rules | Future Years not clamped | 1 fails |
| Costing display spec | `>` changed to `>=` in the 365 check | the 365 / 365 test fails |
| Costing display spec | `+ 1` removed from the year list | the year-list test fails |
| Costing display spec | the Future Years clamp removed | the clamp test fails |
| Capacity spec | the unfixed source (per-Trip classification and per-Block summaries) | both fail (302 and 401 reads) |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 36 files, 502 tests passed (487 before; 15 new: 4 + 7 + 4). Three runs in a row.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 77 passed, 0 failed (2.8 minutes); 71 before plus the 6 new tests. No `test.fail`, `test.skip`, or `test.fixme`.
- New spec stress runs, `--repeat-each=10 --workers=8`: `costing-rules-from-service.spec.ts` 40 of 40; `capacity-read-paths.spec.ts` 20 of 20 (Blocking 1.4 to 6.3 s with 3 reads of the Trips; Costing 0.4 to 1.3 s with 1 read).
- P10 spec after P11: `local-data-protection.spec.ts` 50 of 50 with the unchanged 90 s allowance, then 50 of 50 after the allowance was cut to 30 s (the Costing save is no longer slow) and its comment was brought up to date. The P10 timeout that was never explained did not return in these 100 runs.
- `pnpm build`: succeeds (existing chunk-size warning only). Bundle `index-Xh7-lYti.js` 782.90 kB (781.75 kB after P10, +1.15 kB).

### Hand-offs

- `tests/ui/local-data-protection.spec.ts` (P10's file): the Costing allowance went from 90 s to 30 s and its comment was updated, as the P10 entry said P11 should allow.
- Costing screen wording: the alert "Review the rate, years, horizon, and escalation…" and the "Total n / 365" display keep their text. The values come from the service; the wording was not touched.

### Residual risks

- The 1 s and 2 s targets are asserted only as read counts and loose limits in the browser spec; the production numbers are a manual measurement.
- `classifyInsertions` takes the Block and the Trips as stored at the time of the call; like `classifyInsertion`, it does not re-check them when the answer is used. The Blocking write path still refuses a stale source (the source signature).
- Real capacity for the Dexie reads is bounded by `listProfileTrips`, which loads every Trip of the Scenario and filters by Trip Profile in memory. At 2,000 Trips that is one read; at much larger sizes it would read more than it needs. A compound index on Scenario and Trip Profile would avoid it and is not part of this package.

## P12: Blocking calculation rules and finding shape

- Date: 2026-10-23. Sitting 4F. Model: Sonnet (main session). No sub-agents: P12 is S2, so no Opus review (sitting plan).
- Type: structural. Severity: S2.
- Commit: `ce5852d`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-015 | 2-006 | S2 | A deadhead with explicit clock times (legacy or imported) was never checked against the gap between its two Trips, so a deadhead at 9:00 between Trips ending 7:00 and starting 7:30 counted as valid with 20 minutes of layover. A pull-out that ended after the first Trip started, or a pull-in that started before the last Trip ended, understated Platform hours and raised no finding. |
| I-060 | 1-016, 2-015 | S3 | `CostingFinding` was `{ code, severity, entityId?, serviceDayId? }`, not the `ValidationFinding` shape that OV-VAL-01 and DS-25 describe. Blocking structural rejections were plain `Error`s with joined message keys. `validation.ts` held an exported, unused `validateBlock` with the same name as the Blocking validator. |
| I-066 | 2-012 | S3 | A Pattern whose points are all at 0 miles was reported as complete mileage (0 revenue miles). |

User decisions implemented: C2 (option (a): report a finding, leave stored data unchanged) and decision 8 (a 0-mile total is incomplete; no schema change).

### What changed

- `src/domain/blocking.ts`
  - New rule `block.deadheadOutsideGap`: an explicit-time deadhead that starts before the previous Trip ends or ends after the next Trip starts. The connection becomes a `conflict`, the Block `invalid`, and that connection's layover is not counted (its deadhead hours still are). A deadhead placed by minutes after the previous Trip is never reported, because it is inside the gap by construction. `classifyBlockingInsertion` reports the same rule for the deadhead next to the insertion, so a misplaced deadhead no longer reads as `compatible`.
  - New rule `block.boundaryOverlap`: a pull-out that ends after the first Trip starts, or a pull-in that starts before the last Trip ends. The Block becomes `invalid`.
  - Both rule ids join the set of operational rules that make a Block invalid (`INVALIDATING_RULES`, with the three that were already there).
  - `revenueDistance` requires a total above 0. A Block with a 0-mile Pattern now has no revenue miles and no platform miles, reports `block.revenueMilesIncomplete` and `block.platformMilesIncomplete`, and is `incomplete`.
  - New `BlockingValidationError` (carries `findings`; `message` is the text screens show). Every `throw new Error` in the file is now one: invalid Block (`assertStructurallyValidBlock`), Blocking Scenario name (`renameBlockingScenario`, `duplicateBlockingScenario`), a stale Blocking Scenario source, an unavailable Block, a missing boundary Node, changed Trip endpoints, and the five `applyTripAssignment` refusals. Messages are unchanged. New rule ids: `block.tripExists`, `block.tripContext`, `block.destinationUnavailable`, `block.tripAlreadyAssigned`, `block.assignmentRoute`, `block.unavailable`, `block.boundaryNode`, `block.endpointsChanged`, `blockingScenario.sourceChanged`, `blocking.fieldRequired`.
- `src/domain/costing.ts`: `CostingFinding` is an alias of `ValidationFinding`. `ruleId` is the former `code`; every finding has an entity type and id (assumption findings name the Scenario and the field; Service day, Trip, Block, Blocking Scenario, and Trip Profile findings name their own id); the Service day of a Trip or Block finding is the `serviceDayId` parameter. `validateCostingAssumptions` takes an optional Scenario id (default `costing-assumptions`, for assumptions not yet saved).
- `src/domain/validation.ts`: the unused legacy `validateBlock` is removed.
- Because `CostingFinding` is an alias, `ports.ts` and `costingService.ts` needed no change (the 4E note expected an edit to the return type).
- Documentation: `architecture_overview.md` (Validation, Blocking findings list, Summary and Cost Model) and `docs/data-schema.md` (Validation result, Pattern rules). Whether acknowledgment remains planned: yes, planned and not implemented; the finding shape has no field for it, and when it is built it will be stored separately, keyed by `ruleId` and entity (OV-VAL-01 and DS-25 both record this).

### Behavior before and after (what you will see)

- A Block with a legacy deadhead outside its gap, or a legacy pull-out or pull-in that overlaps its Trips, is now shown as invalid with a finding, excluded from the day subtotals and from the Costing estimate, instead of valid with wrong hours. Blocks built in the app (relative times) are never affected.
- A Block whose Trip uses a Pattern with no distances entered shows incomplete miles instead of 0.0 miles.
- The two new findings have no wording of their own yet. The Blocking screen's fallback turns `block.deadheadOutsideGap` into "Deadhead outside gap" and `block.boundaryOverlap` into "Boundary overlap". Proper sentences are U05's (presentation).
- Federal BRT project: no change (the golden reconciliation and 13 of the 16 shapes below pass unchanged).

### Tests added

- `src/domain/blockingRules.test.ts` (19 tests): the deadhead inside the gap stays valid with its layover; four misplaced explicit deadheads (after the next Trip starts, before the previous Trip ends, and the two straddling cases) give the finding, a `conflict` connection, no layover, and an `invalid` Block; a relative deadhead is not reported as misplaced and a too-long one gets only `deadheadDoesNotFit`; insertion next to a misplaced deadhead is a `conflict`; pull-out and pull-in overlap, and touching or relative boundaries are accepted; a 0-mile Pattern gives undefined revenue and platform miles and an incomplete Block (alone and mixed with a Pattern that has miles); a Pattern with miles still counts; the typed errors carry the right rule, entity, and field with the unchanged message, for an invalid Block, a Trip outside the context, a duplicate assignment, an unavailable Block, a second Route, Blocking Scenario names, and bulk boundary requests; `validation.ts` exports no `validateBlock`.
- `src/domain/costing.test.ts` (2 new tests; the 2 existing `finding.code` reads became `finding.ruleId`): the full shape of an assumption finding, an entity-less finding (`rateMissing`, `noEligibleBlocks`, the 365-day total), the Service day findings, and the parameters of a Trip and a Block source mismatch.
- `src/application/costingService.test.ts`: two assertions read `ruleId`.

### Tests first: what failed on the current code

17 of the 21 new tests failed on the unfixed code. The other 4 are controls that must keep passing (deadhead inside the gap; relative deadheads; touching and relative boundaries; a Pattern with miles). The 3 existing tests that read `code` failed until they were changed to `ruleId`.

### Deliberate breaks (each applied, run, and restored from a saved copy)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| 0-mile Pattern | `end > 0` changed back to `end >= 0` | 2 fail |
| Deadhead placement | `explicitDeadheadOutsideGap` always returns false | 5 fail |
| Boundary overlap | `block.boundaryOverlap` removed from `INVALIDATING_RULES` | 2 fail |
| Typed errors | the Trip-context refusal throws a plain `Error` | 1 fails |
| Costing finding shape | `entityId` written as an empty string | 2 fail |

### Review reproductions

The review's golden file (`p2-blocking.golden.test.ts`, copied temporarily into `src/` and deleted afterwards) was run against the fix. S1 to S13 pass unchanged. S14, S15, and S16 are "DEFECT" tests that assert the old behavior, and they now fail in exactly the intended way (S14: the connection is not `valid`; S15: revenue miles are undefined, not 0; S16: a finding exists). The Federal BRT reconciliation, the rounding golden, and 10 of the 12 tests in the costing golden file pass unchanged; the other 2 read `finding.code`, which is now `ruleId`.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 37 files, 523 tests passed (502 before; 21 new).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 77 passed, 0 failed (2.5 minutes). No `test.fail`, `test.skip`, or `test.fixme`.
- `pnpm build`: succeeds (existing chunk-size warning only).

### Hand-offs

- `src/persistence/costingPersistence.ts` (not owned): one word, `finding.code` to `finding.ruleId`, in the error text of an invalid assumptions record.
- U05 (Blocking presentation): sentences for `block.deadheadOutsideGap` and `block.boundaryOverlap` in `blockingMessages` (`BlockingWorkspace.tsx`) and, if the old Block table still uses it, the map in `App.tsx`.
- `blockingService.ts` throws plain `Error`s of its own (about 30 sites, for example "Select a Block first"). They are application checks, not domain rules, and `blockingService.ts` is P14's. P14 may adopt `BlockingValidationError` where a rule has a finding.

### Residual risks

- Other code that treats a Pattern's 0 total as a valid distance is untouched: the Trips and Pattern screens still show 0.0 miles for such a Pattern. Only Blocking's mileage is incomplete now.
- `block.deadheadOutsideGap` and `block.boundaryOverlap` invalidate the Block, which excludes it from subtotals and from the Costing estimate. That matches how the other timing contradictions (`connectionOverlap`, `deadheadDoesNotFit`) are treated; a planner who disagrees would change `INVALIDATING_RULES`.
- An explicit pull-out or pull-in with no Trips in the Block is not checked (nothing to overlap).

## P13: CSV serializers

- Date: 2026-10-23. Sitting 4F. Model: Sonnet (main session). The sitting plan allows Haiku for the file moves; the moves were four `git mv` commands plus six one-line import edits, so the main session did them and no sub-agent was used. No Opus review: P13 is S2.
- Type: structural. Severity: S2.
- Commit: `2463328`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-019 | 3-012 | S2 | `toCsv` did not escape header cells. The Trips CSV puts the Pattern name and Node name in its time-column headers, so a name with a comma or a double quote made an export that the Trips CSV import rejected. |
| I-070 | 3-010 | S3 | `csvEscape` did not quote a field with a bare CR, and the Runtime profile CSV had its own, different escaper. |
| I-071 | 3-011 | S3 | A name, label, or note beginning with `=`, `+`, `-`, or `@` was exported as written, so a spreadsheet ran it as a formula. |
| I-073 | 4-013 | S3 | `src/ui/tripTableCsv.ts` and `src/ui/csvDownload.ts` imported the serializers from `src/persistence`. |

User decisions implemented: decision 5 (prefix `'` on free-text cells, strip it on import, free-text columns only) and decision 12 (move the two files to `src/application`; OV-TECH-03 not amended).

### What changed

- `src/persistence/csv.ts`
  - `csvEscape` quotes CR as well as comma, double quote, and LF.
  - `toCsv` escapes header cells with `csvEscape`, and takes an optional list of free-text column names.
  - New `neutralizeFormulaText` and `restoreFormulaText`. A value that begins with a trigger character, or with apostrophes before one, gets one more apostrophe; import removes one apostrophe in front of a trigger character. The pair is exact for every string, including `'=x` (becomes `''=x`) and ordinary text with an apostrophe (`'Til midnight` is unchanged).
  - Each serializer lists its free-text columns: Route (name, short name, description); Nodes (name, short name, notes); Patterns (name, direction label, notes); Directions (name); direction columns (label override); Runtime bands (profile name, band label); generation sets (name); Trips and authoritative Trips (Trip profile name, public label); Blocks (Trip profile name, label, notes); Blocking Scenarios (Trip profile name, name, description); Blocking Blocks (label, notes); the three Costing files (Scenario, Blocking Scenario, Trip profile, and Service day names, the source note, and the Block label). Identifiers, times, numbers, and fixed words are not changed.
- Moved (history kept with `git mv`): `src/ui/tripTableCsv.ts`, `src/ui/csvDownload.ts`, and their tests to `src/application/`.
- `src/application/tripTableCsv.ts`: the Trips CSV protects the public label and the importer restores it.
- New `src/application/csvText.ts`: re-exports `csvEscape`, `neutralizeFormulaText`, and `restoreFormulaText`, the one route by which `src/ui` reaches them.
- `src/ui/runtimePaste.ts`: its private escaper is gone; the Runtime profile CSV uses `csvEscape` and protects the band label, and the paste importer restores it.
- `src/ui/App.tsx`: import paths only.
- Documentation: `architecture_overview.md` ("Persistence, Backup, and Export": the CSV rules).

### Behavior before and after (what you will see)

- A Pattern or Node name with a comma or a double quote no longer breaks the Trips CSV: export and re-import work.
- A name, label, or note such as `-5 stops` or `=Peak` opens in a spreadsheet as text with a leading apostrophe (`'-5 stops`). Importing the Trips CSV or a Runtime CSV gives back the original text. Spreadsheet programs that show the apostrophe in the cell will show it; Excel hides a leading apostrophe in the cell view and keeps it in the file.
- No screen changes.

### Tests added

- `src/persistence/csvText.test.ts` (42 tests): the escaping rule for comma, quote, LF, CR, and CRLF; a Block note with a bare CR stays in one row; header cells; the pair `neutralizeFormulaText`/`restoreFormulaText` for the four trigger characters, strings that must not change, and strings that already start with apostrophes; one test per serializer (20) that fills every string field with `=1+1` and checks that exactly its free-text columns come out as `'=1+1` and no other column changes; numbers, times, negative miles, and identifiers beginning with `-` are never prefixed.
- `src/application/tripTableCsv.test.ts` (13 new tests beside the 1 moved): Pattern and Node names with a comma, a double quote, a line break, a colon round-trip through export and import; labels `=1+1`, `+1+1`, `-2+3`, `@SUM(1,1)`, `'=1+1`, and `-5 stops` are written protected and read back unchanged; identifiers and ordinary labels are untouched.
- `src/ui/runtimePaste.test.ts` (7 new tests beside the 1 existing): the same label round trip for the Runtime profile CSV; an ordinary label with an apostrophe is untouched; a label with a bare CR is quoted.
- `src/ui/importGraph.test.ts` (2 tests): no file in `src/ui` imports from `src/persistence` (static, re-export, dynamic, and bare import forms), with a self-check of the pattern. Vite's `import.meta.glob` reads the files, because Node types are not in the project yet (B01 adds them).

### Tests first: what failed on the current code

- `csvText.test.ts`: on the unfixed `csv.ts`, 37 of 42 tests failed (the CR, header, and helper tests, and all 20 serializer tests); the 5 that passed are controls (strings that must not change).
- Importer tests, run against the unfixed `tripTableCsv.ts` and `runtimePaste.ts` (with the fixed `csv.ts`): 12 of the 22 tests in the two files failed (the label protection and restore tests).
- Import graph: it listed `csvDownload.ts` and `tripTableCsv.ts` before the move, and a probe file with an import from `../persistence/csv` makes it fail after the move.

### Deliberate breaks (each applied, run, and restored from a saved copy)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Formula round trip | `restoreFormulaText` returns its input | 20 fail |
| Header escaping | header cells not escaped | 6 fail |
| CR rule | `csvEscape` ignores CR | 4 fail |
| Serializer coverage | `nodesCsv` does not protect `notes` | 1 fails (the Nodes serializer test) |
| Trips CSV | label not protected on export | 6 fail |
| Runtime CSV | band label not protected on export | 5 fail |
| Runtime CSV | band label not restored on import | 5 fail |
| Import graph | a file in `src/ui` imports `../persistence/csv` | 1 fails |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 39 files, 587 tests passed (523 before; 64 new).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 77 passed, 0 failed (2.3 minutes) on the second full run. The first full run had 76 passed and 1 failed: `unified-action-layer.spec.ts:139` failed inside the shared setup helper `createShiftReadySchedule` (`tests/ui/support/tripsWorkspace.ts:95`): the Trip actions menu did not appear within 5 s after `ArrowDown`, with 0 menu items. That step runs no CSV code. The same test then passed 16 of 16 (`--repeat-each=16 --workers=8`) and the second full run passed. The cause is not proven; the likely candidate is the Runtime section's overlapping reloads after the page reload, which the P05 hand-offs describe and which U07 removes. No `test.fail`, `test.skip`, or `test.fixme`.
- `pnpm build`: succeeds (existing chunk-size warning only). Bundle `index-VpKnYSaf.js` 785.31 kB (782.90 kB after P11; P12 and P13 add 2.4 kB).
- Round trip: the Trips CSV and Runtime CSV round trips are the tests above (no schema version changes; CSV carries none).

### Hand-offs

- `src/ui/CostingWorkspace.tsx` and `src/ui/BlockingWorkspace.tsx` (not owned): one import path each (`./csvDownload` to `../application/csvDownload`).
- `src/persistence/csv.ts` serializers that have no importer (Route, Nodes, Patterns, Blocks, Costing, and the rest) are report output only. Their protection is one-way; if a CSV import is ever built for one, it must call `restoreFormulaText` on the same columns. The per-serializer test lists those columns.

### Residual risks

- A spreadsheet program that does not hide the leading apostrophe will show it. This is the cost of decision 5.
- A tab or carriage return at the start of a cell can also be read as a formula by some spreadsheet programs (a known OWASP addition). Decision 5 names only `=`, `+`, `-`, and `@`, so only those are protected.
- A label with a bare CR is quoted on export, but the Trips CSV importer reads a CR inside quotes as LF, so such a label does not round-trip byte for byte. Out of scope (the Trips CSV reader is unchanged).

## P14: Blocking rules into `blockingService`

- Date: 2026-10-23. Sitting 4F. Model: Sonnet (main session). No sub-agents: P14 is S2, so no Opus review.
- Type: structural. Severity: S2.
- Commit: `3df50b6`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-024 | 4-007 | S2 | "Apply to all similar Trips" in the deadhead dialog skipped every second matching connection: the loop computed Trip positions once and then inserted deadheads, so later positions pointed one activity early. 5 matching Trips gave 2 deadheads instead of 4 (reproduced in the browser on the unfixed code). |
| I-074a | 4-014 (Blocking items) | S3 | `BlockingWorkspace.tsx` grouped Trips for reordering, inserted new activities, filtered the unassigned Trips by Route and assignment, and computed Layover % twice. |
| I-077 | 4-018 | S3 | A blank minutes field saved a 0-minute deadhead in the single path and was refused in the bulk path; a blank minimum-layover amount became a 0-minute rule. |

Also found while testing, and fixed with the insertion move: adding a pull-out, pull-in, or deadhead gave the new activity the same `sequence` as the activity it displaced, and `normalizeBlockActivities` breaks ties by random activity id, so the order could come out wrong (the unfixed browser run showed "A deadhead must be placed between two revenue Trips" after a blank-minutes deadhead). The service now numbers every activity again.

Added acceptance criterion from the 4B note, done here: Block label uniqueness when a Block is created or renamed (Decision 0039), with the first free "Block <n>" as the proposed label. Marked done in "Added acceptance criteria" below.

### What changed

- `src/domain/blocking.ts`: `layoverPercent` (also a field of `BlockSummary` and `BlockingSummary`); `parseActivityInput` and `parseMinimumLayoverRule` (blank is refused; new rules `block.minutesRequired`, `block.minutesInvalid`, `block.minimumLayoverAmountRequired`, `block.minimumLayoverAmountInvalid`); `insertBlockActivity`; `moveRevenueTripGroup`; `applyDeadheadToMatchingConnections`; `unassignedRouteTrips`; `validateBlockLabel`, `assertBlockLabelAvailable`, `proposeBlockLabel`; `calculateBlockDeletionImpact`; request types.
- `src/application/ports.ts` and `blockingService.ts`. Commands: `addActivity`, `applyDeadheadToMatchingConnections`, `moveTripGroup`. Queries: `listUnassignedTrips`, `proposeBlockLabel`, `previewDeleteBlock`, `previewDeleteBlockingScenario`, and the synchronous `parseActivityInput` and `parseMinimumLayover`. `createBlock` and a renaming `updateBlock` check the label. No repository method was added, so `BLOCKING_WRITE_METHODS` is unchanged.
- `src/ui/BlockingWorkspace.tsx` (no layout or interaction change): the dialog save, the bulk pull-out review, the Trip order arrows, the Unassigned Trips list (loaded with the Blocks, and reloaded when the Route changes), the Layover % cells, the New Block dialog default, and the Minimum layover dialog now call the service. Two message entries were added to its message table (`block.minutesRequired`, `block.minutesInvalid`: "Enter a non-negative whole-minute duration."). The unused `useMemo` import was removed.
- Deletion previews: `previewDeleteBlock` returns the label, service day, activity, Trip, and deadhead counts; `previewDeleteBlockingScenario` returns the existing `BlockingScenarioDeletionImpact`. Both return `sourceSignature`, which is the review token of the existing deletions (`deleteBlock` and `deleteBlockingScenario` already refuse a different signature). No new fingerprint was needed. Nothing calls the previews yet; U05 shows them.
- Documentation: `architecture_overview.md` (Blocking Model), `docs/decisions/0039-backup-import-normalization-and-validation.md` (label rule implemented).

### Behavior before and after (what you will see)

- Apply to all similar Trips adds a deadhead to every matching connection.
- A blank minutes field is refused with "Enter a non-negative whole-minute duration." in both the single and bulk paths; a blank minimum-layover amount disables Apply and shows the existing alert.
- Creating or renaming a Block to a label that another Block of the same service day uses is refused with "Another Block on this service day already uses that label." The New Block dialog opens with the first free "Block <n>" (after deleting Block 2 of three, "Block 2" instead of "Block 3").
- Adding a pull-out, pull-in, or deadhead always lands in its place.
- Nothing else changes on screen. Layover % values are the same numbers (same formula).

### Tests added

- `src/domain/blockingEditing.test.ts` (34 tests): Layover %; activity and minimum-layover input; bulk deadhead (5 Trips give 4 deadheads, replaced deadheads keep their id, non-matching connections are skipped, no match is refused); insertion order independent of ids; Trip-group moves; the unassigned filter; label rule and proposal.
- `src/application/blockingRules.test.ts` (16 tests): the same rules through the service against the in-memory repository, including stale-source refusal, atomic label checks, a legacy repeated label staying editable, previews, and that previews write nothing.
- `tests/ui/blocking-rules.spec.ts` (3 browser tests): 5 Trips give 4 deadheads through the dialog; blank minutes refused for a deadhead, a bulk pull-out, and the minimum layover; label uniqueness, the proposed label after a deletion, and a refused rename.

### Tests first: what failed on the current code

- The browser spec was run in a clean worktree of the P13 commit: all 3 failed (2 deadheads instead of 4; a blank minutes field accepted, then "A deadhead must be placed between two revenue Trips."; no label rule).
- The unit tests failed because the functions did not exist (the first run of the domain file failed to import them). What each one guards is shown by the breaks.

### Deliberate breaks (each applied, run, and restored from a saved copy)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Bulk deadhead | every second insertion skipped (the original defect) | 2 fail |
| Activity input | blank minutes read as 0 | 5 fail |
| Minimum layover | blank amount read as 0 | 3 fail |
| Insertion | new activity keeps `sequence: index` | 3 fail |
| Labels | create does not check | 1 fails |
| Labels | rename does not check | 1 fails |
| Labels | proposal is count plus 1 | 2 fail |
| Previews | activity count off by one | 1 fails |
| Layover % | divided by running hours only | 2 fail |
| Unassigned | Route ignored | 2 fail |
| Trip-group move | deadhead not kept with its Trip | 2 fail |

(The first attempt at these runs was cut off by a restart of the session's worker; one source file was left in its broken state, found by comparing it with the saved copy, and restored before the runs were repeated in full.)

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 41 files, 637 tests passed (587 before; 50 new).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 80 passed, 0 failed on the last full run. No `test.fail`, `test.skip`, or `test.fixme`. The first full run had 79 passed and 1 failed: `unified-action-layer.spec.ts:139`, the same step as in the P13 entry (`tests/ui/support/tripsWorkspace.ts:95`, the Trip actions menu has no items after `ArrowDown`). See "Intermittent browser failure" below.
- New spec stress run, `--repeat-each=10 --workers=8`: 30 of 30.
- `pnpm build`: succeeds (existing chunk-size warning only). Bundle `index-BdF3r0BO.js` 790.12 kB (785.31 kB after P13).

### Intermittent browser failure (open, not fixed)

`unified-action-layer.spec.ts:139` failed at the same setup step in 2 of the 6 full runs on this branch (P13, first run; P14, first run) and in 0 of 3 full runs on `origin/main` (the 4E report, and two runs for this sitting). It passed in every isolated run: 16 of 16 and 40 of 40 on this branch, 40 of 40 on `origin/main`, and in each re-run of the full suite. The failing step runs no code that P12 to P14 changed. The cause is not found; the P05 hand-off about overlapping Runtime reloads that close an open menu is the candidate. The samples are too small to say whether this branch makes it more likely.

### Hand-offs

- U05: wording for `block.deadheadOutsideGap` and `block.boundaryOverlap` (P12); show `previewDeleteBlock` and `previewDeleteBlockingScenario` before deleting and pass the preview's `sourceSignature` to the deletion (I-035); the Block-label message uses the thrown text.
- `BlockingWorkspace.tsx` keeps its in-component rule for "Delete similar deadheads" (selects deadheads by From and To Node in the Block) and `boundaryNode`. They are not on the 4-014 Blocking list for P14.
- Clean-up of repeated Block labels already stored (no owner yet).

### Residual risks

- `listUnassignedTrips` adds one read of the Trips when the Blocking tab opens (the capacity spec still passes: its limit is 16 reads).
- The Unassigned Trips list is refreshed with the Blocks and on a Route change. Trips edited on the Trips tab reach it when the Blocking tab is opened again, as before.
- The bulk deadhead now considers every Route's Trips in the Block (it used the selected Route's Patterns only). For a single-Route Block the result is the same.

## B01: CI, typecheck scope, and dependencies

- Date: 2026-10-23. Sitting 4F. Model: Sonnet (main session). No sub-agents.
- Type: build. Severity: S2.
- Commit: `e6bf12e`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-046 | 6-004 | S2 | The deploy workflow published every push to `main` after only `pnpm build`, and no workflow ran on pull requests. |
| I-097 | 6-006, A-008 | S3 | `pnpm typecheck` left out `tests/ui` and `playwright.config.ts`, and `@types/node` was absent. |
| I-098 | 6-007 | S3 | Node and pnpm were not pinned, and CI used Node 20, which is past end of life. |
| I-099 | 6-009 | S3 | `zod` and `@tanstack/react-table` were declared and never imported. |
| I-100 | 6-010 | S3 | `pnpm audit` reported 11 advisories (2 critical, 2 high). |
| I-101 | 6-011 | S3 | Every build warned that the one chunk was over 500 kB. |

User decisions implemented: 17 (Node 22 LTS in CI, `engines`, `packageManager`, `.nvmrc`), 18 (remove both libraries and amend OV-TECH-01 and OV-TECH-02), C4 (update `vite` within its range, raise `chunkSizeWarningLimit` with a recorded reason, leave the `vitest` major upgrade as follow-up).

### What changed

- New `.github/workflows/ci.yml`: on pull requests and pushes to `main`. Job `verify`: install with the frozen lockfile, typecheck, unit tests, build. Job `browser` (required, because P05 made the suite green): install Chromium with its system packages, run `pnpm test:ui`, keep `test-results` as an artifact on failure. Node from `.nvmrc`, pnpm from `packageManager`. Concurrent runs for one ref cancel the older one.
- `.github/workflows/deploy-pages.yml`: now triggered by `workflow_run` of `CI` on `main`. It builds and deploys only when that run succeeded for a push, and it checks out the commit CI checked. The manual `workflow_dispatch` trigger is removed, because it was a way to publish without CI; a deployment is repeated by re-running the workflow run. Node 22, pnpm from `packageManager`.
- `package.json`: `packageManager` `pnpm@10.28.0`; `engines.node` `>=22.12.0 <23`; `zod` and `@tanstack/react-table` removed; `@types/node` `^22.20.5` added; `vite` range raised to `^7.3.7` (resolves to 7.3.7 from 7.3.6). `pnpm-lock.yaml` updated; `source-map-js` refreshed to the patched 1.2.x inside `postcss`'s own range.
- `tsconfig.json`: `include` now has `tests` and `playwright.config.ts`.
- `tests/ui/support/capacityFixture.ts`: one non-null assertion (`lastPat.points.at(-1)!`), the only type error that the wider scope exposed (the minimum change the 4E note expected).
- `.nvmrc`: `22`.
- `vite.config.ts`: `build.chunkSizeWarningLimit` 900 with a comment that gives the reason (about 790 kB, 218 kB gzip, works offline once loaded; split the chunk if it grows well beyond).
- Documentation: `architecture_overview.md` (OV-TECH-01 and OV-TECH-02 list: hand-written tables and validation, CI, Node and pnpm pins; the dependency sentence), `codex.md` ("Checks and CI", the verified commands).

### Behavior before and after

- Pull requests and pushes to `main` now run typecheck, unit tests, build, and the browser suite. A push to `main` is published only if they pass.
- No change in the application. The built bundle is byte-identical in name (`index-BdF3r0BO.js`, 790.12 kB), because the two removed packages were never imported. The 500 kB warning is gone.

### `pnpm audit`

| | Before | After |
| --- | --- | --- |
| Total | 11 (1 low, 6 moderate, 2 high, 2 critical) | 5 (3 moderate, 2 critical) |
| `vite` advisories | 5 | 0 |
| `source-map-js` (through `vite > postcss`) | 1 high | 0 |
| `vitest`, `@vitest/mocker`, `tinypool` | 5 | 5 (need the Vitest major upgrade) |

The remaining 5 are dev-toolchain packages only; none is in the shipped bundle. Follow-up (not done, by decision C4): upgrade `vitest` to the 4.1 or 5 line in a separate package, with its own regression run. Other majors behind (Vite 8, `@vitejs/plugin-react` 6, TypeScript 7) are not part of this package.

### Tests

B01 adds no test file; its checks are the commands themselves. One deliberate break: a type error added to a Playwright spec and, separately, to `playwright.config.ts`, each made `pnpm typecheck` fail (before B01 neither was checked); both removed.

### Verification run

- `pnpm install --frozen-lockfile`: up to date. `pnpm typecheck`: clean (now over `src`, `tests`, and the three config files). `pnpm test`: 41 files, 637 tests passed. `pnpm build`: succeeds with no chunk-size warning.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 80 passed, 0 failed (2.6 minutes).
- Workflow files: both parse as YAML and every step has a `uses` or `run`. `actionlint` is not installed here.
- `pnpm audit` before and after: table above (saved outputs in the session scratchpad only).

### What could not be verified

The acceptance criteria ask for a CI run on the package branch. No pull request was opened (the user did not authorize one), and the new `ci.yml` runs only on a pull request or a push to `main`, so no run exists. Not verified:

- that GitHub accepts the workflow syntax and the `workflow_run` link between `CI` and `Deploy to GitHub Pages` (the deploy workflow only starts once it is on the default branch);
- that `pnpm/action-setup@v4` with no `version` takes pnpm from `packageManager`, and that `actions/setup-node@v4` accepts `node-version-file: .nvmrc` with the pnpm cache;
- that `playwright install --with-deps chromium` works on the runner, and that the browser suite passes there (it passes here on a different Chromium build, 141, and on this machine's load);
- the one intermittent failure in `unified-action-layer.spec.ts:139` (see the P14 entry) could fail a CI run. A re-run clears it; the cause is open.

Before the first deployment, open the pull request and read the CI run; then merge, and read the first Deploy run.

### Hand-offs and residual risks

- The first deployment after merge is the first real use of the `workflow_run` trigger. If the Deploy workflow does not start, the fallback is to restore `on: push` and make the build job `needs` a call to `ci.yml` through `workflow_call`.
- The repository's branch protection (requiring the `verify` and `browser` checks) is a GitHub setting for the user; this package cannot set it.
- The `engines` range is `>=22.12.0 <23`; pnpm warns, but does not fail, outside it unless `engine-strict` is set.

## U01: Standards-mode `index.html`

- Date: 2026-10-23. Sitting 4G/4H (combined). Model: Sonnet (main session). No sub-agents.
- Type: UI/build. Severity: S2.
- Commit: `8e347e4`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-038 | 5-013, 6-008 | S2 | `index.html` held only the root element and the script tag: no doctype, `lang`, charset, viewport, or title. The browser rendered every screen in quirks mode (`document.compatMode` was `BackCompat`), where tables do not inherit the root font size (table text was 16 px, not the 14 px of `styles.css:1`) and the page has no language or title for assistive technology. |

User decisions implemented: none (this is the Decision 0005 gate for the UI packages; the user waived the verification gate between 4F and U01 for this sitting).

### What changed

- `index.html`: `<!doctype html>`, `<html lang="en">`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<title>Transit Costing Tool</title>`, and the root element and script tag inside `<head>` and `<body>`.
- Behavior before and after: the page title in the browser tab was the address; it is now "Transit Costing Tool". Table text is 14 px (it was 16 px), so table rows are about 1 px shorter and more columns fit in the Trips table at 1024 px. No CSS was changed.
- The Vite build wraps the same `index.html` (`dist/index.html` 0.41 kB). The bundle is unchanged (`index-BdF3r0BO.js`, 790.12 kB).

### Tests added

`tests/ui/standards-mode.spec.ts` (2 tests, 20 runs with `--repeat-each=10 --workers=8`, all passed):

- "the page is a standards-mode HTML document with a language, charset, viewport, and title": `compatMode` is `CSS1Compat`, the doctype is `html`, `lang` is `en`, the document is UTF-8 with a `charset` meta, the viewport meta has `width=device-width`, the title is "Transit Costing Tool".
- "table text renders at the 14 px root size instead of the quirks-mode 16 px": a table cell with no font size of its own computes to 14 px, and so does the root.

Both tests failed on the unfixed `index.html` (`Expected "CSS1Compat", Received "BackCompat"`; `Expected "14px", Received "16px"`).

Deliberate break: removing `lang="en"` from the fixed file made the first test fail (`Expected "en", Received ""`) and left the second passing; restored.

### Layout tests and baselines

All 14 layout-related specs pass unchanged (`trip-table-layout`, `runtime-table-layout`, `service-day-copy-layout`, `workflow-section-layout`, `unified-action-layer`, `costing-workspace`, `capacity-read-paths`, and the others). No measured value changed, so no layout baseline under `tests/ui/` was edited.

### Screenshots (not committed; session scratchpad only)

Taken on the Federal BRT project (Weekday, Southbound; Blocking Scenario "Workbook Blocks"; Costing assumptions of $150 per Revenue Hour added for the Costing view). "Before" is the unfixed page, "after" the fixed page.

- After: `/tmp/claude-0/-home-user-transit-costing-tool/97a11f95-8195-5c0d-bed4-917d1a55f2e0/scratchpad/shots/u01/{1024,1440}-{route,trips,blocking,costing}.png`
- Before: `/tmp/claude-0/-home-user-transit-costing-tool/97a11f95-8195-5c0d-bed4-917d1a55f2e0/scratchpad/shots/before/{1024,1440}-{route,trips,blocking,costing}.png`

What the screenshots show: every screen keeps its structure at both widths. The changes are in table text (16 px to 14 px) and row height. At 1024 px the Trips table now shows the Yale and Englewood columns that the quirks-mode page cut off, and the Costing and Blocking tables are slightly more compact.

Layout problems seen (listed, not fixed here; each existed before U01 and is owned by the package named):

- Costing, 1024 px: the Cost Breakdown table scrolls inside its frame and the Annual Cost column is still clipped (finding 5-007, U06).
- Trips, Runtime editor: band totals of 60 minutes or more read ":61" and ":65" (finding 5-028, U07).
- Blocking, both widths: Pattern pills are cut off ("Northbound: Evan…", finding 5-021, U05).
- Route, 1440 px: the Node Type select cuts its text ("timep", "termi"), Pattern Node selects cut long names, the order arrows stack on two lines, and "Delete Pattern" and "Add node" wrap onto two lines. Unchanged by U01; no finding owns them.

No new layout regression was seen.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 41 files, 637 tests passed (unchanged).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 82 passed, 0 failed (3.1 minutes); 80 before plus the 2 new tests. No `test.fail`, `test.skip`, or `test.fixme`. The intermittent `unified-action-layer.spec.ts:139` passed.
- `pnpm build`: succeeds with no chunk warning.
- Baseline before the change: 41 files, 637 tests; 80 browser tests, all passed (3.2 minutes).

### Documentation

No architecture or decision record changes: no structure, data flow, or persistence changed. The browser tab title and page language are described here only.

### Residual risks

- Any CSS that relied on a quirks-mode measurement would show it only in a layout the specs do not cover (the specs cover Trips, Runtime, and Costing; Route and Blocking were inspected by screenshot at 1024 and 1440 px, and no regression was seen).
- Screenshots were taken in headless Chromium 141 only.

## U02: Data-safety and error presentation

- Date: 2026-10-23. Sitting 4G/4H (combined). Model: Sonnet (main session). No sub-agents.
- Type: UI. Severity: S2.
- Commit: `dea5288`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-039 | 5-014 | S2 | After a stale-source refusal Blocking kept its old data and refused every later edit until the planner changed day or reloaded the page. |
| I-072 | 3-015, 4-017 | S3 | UI error paths showed `error.message` directly or lost it: Trips Block assignment, the Shift preview, the Trips CSV preview, Build Trips, Recalculation, and the copy and batch dialogs. The filter missed `QuotaExceededError`, `VersionError`, "not part of transaction", `TypeError`, and Dexie's "Database has been closed". `blockingError` inserted a space before every capital letter of a typed message, and raw message-key lists reached the screen. |
| I-076 | 4-016 | S3 | A failed startup, a failed selection reload, and a failed JSON or CSV export had no error handling: the empty "Start a local planning project" screen appeared, or nothing happened. |
| I-095 | 5-029 | S3 | Messages with no next step, technical terms, inconsistent Trip and Block capitalization, and wrong text. |

User decisions implemented: none new. This package presents the P02 read-only status and the P10 last-backup time (hand-offs from 4A and 4E).

### What changed

- **Read-only tab.** `App` takes the P02 `SessionStatusQueries` (`main.tsx` passes the tab guard). A read-only tab shows the notice banner "This project is open in another tab. This tab is read-only." (a new `notice info` variant in `styles.css`; a tab whose database was upgraded elsewhere shows "The saved data was upgraded in another tab. This tab is read-only. Reload this page to edit."). The header shows "Read-only" instead of "Saving locally…" or "Local save failed", which a rejected write also set. Edit controls stay visible; writes are still rejected by P02.
- **Last backup.** The Project menu shows "Last backup: <date and time>" or "No backup exported yet" under "Backup project JSON", from `getLocalDataProtection()`. `MenuButton` gained an optional `note` on an item (shown under the item and read as its accessible description; the item's name is unchanged).
- **One error filter.** New `src/ui/errorMessages.ts` (`userFacingError`). It shows application text as written and returns the fallback for browser, Dexie, or JavaScript wording (`QuotaExceededError`, `VersionError`, `UnknownError`, "not part of transaction", `TypeError`, Dexie error names, "Database has been closed", and others) and for a raw message-key list. It also checks the error name, because a `DOMException` keeps its technical name there. `showError` and every catch site use it.
- **Catch sites.** Trips Block assignment and unassignment, Shift preview and save, Trips CSV preview and import, Runtime profile CSV, pasted Runtime rows, Build Trips (a Headway such as "abc" now reads "Enter a Headway in minutes, such as 10, or as minutes and seconds, such as 7:30."), Recalculation review and apply, and the Runtime copy, Trip copy, and batch Pattern change dialogs show filtered text with a next step. The copy and batch dialogs no longer also post a second banner.
- **Blocking.** `blockingError` returns the mapped sentence for a list of message keys (each once), the message as written for any other text (commas kept), and the fallback for technical text. Every Blocking write goes through `failed()`. After a stale-source refusal (`blockingScenario.sourceChanged` or `block.endpointsChanged`) it shows the refusal once and reloads the Blocking Scenarios and Blocks, so the next edit uses the current source. Message: "Blocking Scenario changed since the operation was reviewed. Nothing was saved, and the latest Blocks are loaded. Review them and try again." (it keeps the earlier sentence, so `single-tab.spec.ts:248` passes unchanged).
- **Startup, selection, export.** A failed startup shows the error banner ("Unable to open your saved projects. Reload this page and try again.") and not the start screen. The Project, Scenario, Route, and Blocking Route selectors catch a failed reload ("Unable to load that selection. Reload this page and try again."). JSON and Route CSV export failures show the banner ("Unable to export the project backup. Your data was not changed. Try again.").
- **Messages (5-029).** Next steps added to `node.referencedBeforeDelete`, `pattern.sequenceNormalized`, `block.missingTrip` (both lists), `runtime.noApplicableBand`, the "Review this item." fallback, the staged Shift save, Trips CSV and Runtime CSV imports, the pasted rows, and every "Unable to …" fallback in the copy and batch dialogs. "The Trip shift request is invalid." is replaced in the UI (the domain wording stays). Trip, Block, Pattern, Node, Route, Scenario, Direction, and Runtime capitalization follows the glossary in the validation messages and the Build Trips messages. The Runtime profile dialog says "Enter a name." or "Select a Pattern." for the field that is missing.
- **Docs.** `architecture_overview.md` (tab model paragraph) and `docs/ui-conventions.md` (error text and read-only rules).

### Files outside the package's owned list (recorded hand-offs)

- `src/ui/MenuButton.tsx`: the optional item `note` (minimum change for criterion 2; U04 owns this file next and keeps it).
- `src/ui/errorMessages.ts` (new) and its test: the shared filter. `App.tsx` imports it, and `BlockingWorkspace.tsx` cannot import `App.tsx` (circular).
- `src/main.tsx`: passes the tab guard to `App`.
- `src/ui/BlockingWorkspace.test.ts`: tests for `blockingError`.
- `tests/ui/trip-bounds.spec.ts:60`: "Enter 500 trips or fewer." became "Enter 500 Trips or fewer." Same assertion (the Build Trips limit message is shown), new capitalization.

### Tests added

- `src/ui/errorMessages.test.ts` (16 tests): application text and `StorageFullError` pass through; 14 technical or key-list texts become the fallback; the error name is checked; non-Error values use the fallback. The old inline filter let 5 of 8 sample technical texts through (`QuotaExceededError`, `VersionError`, "not part of transaction", `TypeError`, "is not a function").
- `src/ui/BlockingWorkspace.test.ts`, "blockingError" (4 tests): typed messages as written, commas kept, key lists once each with the fallback for an unknown key, technical text hidden. Against the old function all 4 failed (it returned " Another  Block on this service day already uses that label." and repeated "A Block can have only one pull-in.").
- `tests/ui/data-safety.spec.ts` (6 tests, real IndexedDB): a read-only tab shows the banner and header, keeps its controls, and does not say "Local save failed" after a rejected write; the Project menu shows "No backup exported yet" and then "Last backup: <time>" after a download; a stale-source refusal reloads Blocking, shows the message once, and the retry in the same dialog saves; a duplicate Block label shows its typed message once, as written; a failed startup shows the banner and not the start screen, with no browser error text; after the database is removed under the page, a selection reload and a JSON export each show their plain banner message with no Dexie or "closed" text. On the unfixed code 5 of the 6 failed; the sixth (typed message) is a control, because that path never used `blockingError` (the unit test covers the old defect).
- Proof they are stable: `--repeat-each=10 --workers=8` on `data-safety.spec.ts`: 60 of 60 passed.
- Deliberate break: removing the reload in `failed()` made the stale-source test fail ("Expected substring: Renamed elsewhere, Received 26 ▾"); restored.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 42 files, 657 tests passed (637 before; +16 and +4).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 88 passed, 0 failed (3.3 minutes); 82 before plus the 6 new tests. A first full run showed one failure, `single-tab.spec.ts:248`, because its assertion read the old stale-source sentence; the new message keeps that sentence, and the spec passes unchanged. The intermittent `unified-action-layer.spec.ts:139` passed in both full runs.
- `pnpm build`: succeeds, no chunk warning. Bundle `index-BntBzvlk.js` 793.57 kB (790.12 kB before).
- Visual check at 1024 px (scratchpad, not committed): `/tmp/claude-0/-home-user-transit-costing-tool/97a11f95-8195-5c0d-bed4-917d1a55f2e0/scratchpad/shots/u02-readonly.png` (banner between the context bar and the Route bar; "Read-only" in the header) and `.../shots/u02-menu.png` (the note under "Backup project JSON"). Both read well.

### Not done, or only partly

- The persistence answer of `getLocalDataProtection()` ("kept" or "may be cleared") is not shown. The hand-off said "if wanted"; no acceptance criterion asks for it.
- Repeated Block labels saved before P14 (open question 3): not addressed here; the import message is unchanged.
- `RuntimeProfileDialog2` and the other name dialogs still close on submit before the write finishes, as before.
- Messages listed in 5-029 under terminology that belong to U07 ("Run Time" as a term) are left for U07.

### Residual risks

- A notice banner stays until dismissed, so a stale-source message from an earlier refusal remains on screen after a successful retry (the test pins this). Auto-clearing notices is a UX decision no package owns.
- Errors from `RuntimeDurationError` and similar domain classes are matched by class in one place only (Build Trips); other inputs still show the filter's fallback or the domain sentence.

## U03: Drafts, inputs, and preferences

- Date: 2026-10-23. Sitting 4G/4H (combined). Model: Sonnet (main session). No sub-agents.
- Type: UI. Severity: S2.
- Commit: `215ec5c`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-026 | 4-010 | S2 | A JSON `null` in the route-selection key blanked the app on every load (the key was rewritten only after a successful load, so it could not repair itself); `null` in the Blocking key blanked it when Blocking opened. |
| I-030 | 5-004 | S2 | An unsaved Runtime editor draft was discarded silently on a Pattern, Profile, service day, Direction, or tab change; a staged Shift was discarded silently on a Runtime save; Build Trips input was lost on close; a reload with a dirty Runtime draft raised no leave prompt. |
| I-032 | 5-006 | S2 | Saving Nodes replaced an unsaved Pattern draft with the saved copy, and saving a Pattern replaced unsaved Node edits. |
| I-042 | 5-024 | S3 | Escape in a numeric field and in a Runtime time field committed the typed text instead of cancelling (the blur handler still held the typed draft). |
| I-091 | 5-025 | S3 | The remembered Blocking Scenario was overwritten after a Trip Profile change in Trips, and Blocking overwrote its own record with empty values on its first render, so the choice was never restored. |

User decision implemented: 14 (guard the Runtime editor draft and the staged Shift with the discard dialog; Build Trips closes without a prompt and keeps its values).

### What changed

- **Runtime draft and staged Shift (`App.tsx`, Trips).** A new `requestScopeChange` runs before any change that replaces the Runtime editor: the Runtime Pattern select, the Profile menu (select, New, Rename, Copy, Reverse-copy, Delete), and the App-level Route, Day, Direction, Project, Scenario, and tab controls (through the existing navigation guard, which now also covers a dirty Runtime draft). A dirty draft opens the existing three-button dialog (`RouteNavigationDraftDialog`, now with a title and text: "Save Runtime changes before leaving?" Cancel, Discard, Save). Save saves the draft and then continues; if the save fails validation the planner stays on the editor with its findings. A staged Shift keeps its existing Cancel/Discard dialog; when both are open the Runtime question comes first. The header Runtime Save also asks to discard a staged Shift first, because the save reloads the Trips and cleared the Shift without a word. A reload with a dirty Runtime draft raises the browser's leave prompt (`beforeunload`). `RuntimeEditor2`'s `save()` now resolves to whether it saved.
- **Latent defect fixed on the way.** The Project, Scenario, Route, Day, and Direction selects read `event.target.value` inside the deferred navigation action. A controlled select resets its DOM value after the change event, so after any Save/Discard dialog the action used the old value and the change silently did nothing (it only worked when no dialog was needed). Each select now captures the value first. This also repairs the Route draft dialog for those selects.
- **Build Trips.** The drawer's values live in a ref owned by the Trips workspace. Closing the drawer (Cancel, Escape, a service-day change) asks nothing; reopening shows the values again; a successful build clears them. The Pattern is kept only if it is still on offer.
- **Nodes and Patterns.** A save returns new arrays for both. A draft is now replaced only when its own saved records changed (the Pattern comparison ignores the save time), so saving Nodes keeps an unsaved Pattern draft and saving a Pattern keeps unsaved Node edits. Deleting a Node that changes a Pattern still resets that draft.
- **Escape.** `NumericCommit` and `RuntimeTimeInput` remember that Escape started the blur, restore the saved value, and skip the commit.
- **Preferences.** New `src/ui/preferences.ts` (`readStoredRecord`, `storedText`, `storedTextMap`): a stored value that is not a plain object reads as empty, and each field must be a string (or a valid minimum-layover rule). The route-selection and Blocking-selection readers use it, so `null`, arrays, numbers, and wrong-typed fields fall back to the default selection.
- **Remembered Blocking Scenario.** Trips remembers one Blocking Scenario for each Trip Profile of a Scenario (an older single-choice record still reads), writes only a real choice that belongs to the profile shown, and falls back to the remembered choice, then the first, when the profile changes (it used to fall to "No Blocking Scenario"). Blocking saves its selection only once the Trip Profile and service day are restored, keeps `blockingScenarioByProfile` the same way, and restores that choice.
- **Docs.** `docs/ui-conventions.md` (drafts, Build Trips, selection preferences).

### Files outside the package's owned list (recorded hand-offs)

- `src/ui/preferences.ts` and `src/ui/preferences.test.ts` (new): the shared shape check (App and Blocking cannot share it from `App.tsx`).

### Tests added

- `src/ui/preferences.test.ts` (12 tests): stored `null`, arrays, numbers, strings, broken JSON, a missing or throwing storage read as empty; text and identifier-map checks.
- `tests/ui/drafts-and-preferences.spec.ts` (14 tests, real IndexedDB): the Runtime dialog on a service-day change with Cancel, Discard, and Save (what is stored after each); the tab change; the Pattern select and the Profile menu, and the leave prompt (a cancelled `beforeunload`); a Runtime Save with a staged Shift (asks, Cancel keeps both, Discard saves and drops the Shift); a staged Shift and a dirty draft on a tab change (Runtime question first); Build Trips values kept across close and reopen and cleared by a build; saving Nodes with an unsaved Pattern edit and saving a Pattern with an unsaved Node edit; Escape in the annual-count field and in a Runtime time field (value restored, no write, no message) with Enter still committing; stored selections of four wrong shapes in both keys; the remembered Blocking Scenario across a Trip Profile change in Trips and after a reload in Blocking.
- On the unfixed code (the U02 commit) 11 of 14 failed. The three that passed are controls: arrays, numbers, and wrong-typed fields in the selection keys already fell back (only `null` crashed, as the finding says).
- `--repeat-each=10 --workers=8` on the spec found two defects in the tests themselves, both fixed in the tests: the Node test assumed the first Node input is Node "A" (5 failures in 140), and the leave-prompt test read the `beforeunload` listener before React had removed it (2 failures in 140; now polled). The final run: 140 of 140 passed. The full browser suite was run before the second test fix; the changed spec alone was re-run (140 of 140), and the next package's full run includes it.
- Deliberate breaks, one per group, each made its test fail and was restored: bypassing `requestScopeChange` (service-day test), not recording Build values, removing the Escape guard in `NumericCommit`, resetting the Node draft on every save, removing the shape check in `preferences.ts` (the `null` selection test), and dropping the per-profile memory (the remembered-Scenario test).

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 43 files, 669 tests passed (657 before; +12).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 102 passed, 0 failed (3.8 minutes); 88 before plus the 14 new tests. No existing spec changed. The intermittent `unified-action-layer.spec.ts:139` passed.
- `pnpm build`: succeeds, no chunk warning. Bundle `index-BCu_9qhe.js` 796.30 kB (793.57 kB before).
- Visual check of the new Runtime leave dialog at 1024 px (scratchpad, not committed): `/tmp/claude-0/-home-user-transit-costing-tool/97a11f95-8195-5c0d-bed4-917d1a55f2e0/scratchpad/shots/u03-leave-dialog.png`. It is the existing three-button dialog with Cancel focused.

### Not done, or only partly

- The finding also names the Add-trip row and Blocking dialog drafts as silently discarded. Decision 14 and the acceptance criteria cover only the Runtime editor, the staged Shift, and Build Trips, so those two are unchanged.
- Build Trips values live in the Trips workspace; leaving the Trips tab and returning clears them (the workspace unmounts). Decision 14 says "until the drawer is reopened"; a tab change was not asked for.

### Residual risks and hand-offs

- **U07 (layout, Sol if redesigned):** at 1024 to 1900 px the docked Shift drawer covers the Runtime Save and Discard buttons, so with a staged Shift open the planner can reach Runtime Save only by keyboard (the new test presses it with the keyboard). Not fixed here; no package owns it.
- The Runtime leave dialog says "Save Runtime changes before leaving?" for a Runtime Pattern or Profile change as well as for leaving the tab; the wording fits all of them, and no separate title was added.
- A Pattern draft that is dirty when a Node save changes that Pattern (a deleted Node) is still replaced; the planner already saw the impact dialog.

## U04: Dialogs, focus, and keyboard

- Date: 2026-10-23. Sitting 4G/4H (combined). Model: Sonnet (main session). No sub-agents.
- Type: UI. Severity: S2.
- Commit: `d596125`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-036 | 5-010 | S2 | No modal dialog trapped Tab; a dialog opened from a menu lost its focus to the trigger (so Escape did nothing and focus fell to the page on close); 10 dialogs ignored Escape; two Runtime dialogs had no accessible name. |
| I-037 | 5-012 | S2 | Focus dropped to the page after Shift drawer steps and after Block pill moves, Unassign, Delete trips, Runtime Discard, and Node Discard. |
| I-086 | 5-018 | S3 | The independent Display toggles had the radio role; an open menu stayed open on Tab. |
| I-090 | 5-023 | S3 | Missing `aria-invalid` and `aria-describedby` on fields with errors; no `h1` on Trips, Blocking, or Costing; a nested `main`; an unlabelled JSON file input; table headers without `scope`; a `form` carrying the dialog role. |

### What changed

- **`src/ui/ModalDialog.tsx` (new).** One wrapper for every modal dialog: initial focus (the `autoFocus` control, else the first focusable control, else the dialog), Tab and Shift+Tab wrap inside it, focus that escapes is pulled back (only the innermost open dialog does this), Escape cancels (`onClose`, ignored while `busy`), and focus returns to the invoking control when the dialog closes, unless other code has already placed it. A menu item records its trigger as the invoker, because the menu is gone by the time the dialog mounts. The role is `dialog` or `alertdialog`; the name comes from `labelledBy` or `label`. A dialog that submits is a dialog section holding a `<form class="dialog-form">` with `display: contents` (a `form` may not carry the dialog role; four CSS selectors gained a `.dialog-form` variant, so the layout is unchanged).
- **All 24 modal dialogs use it** (App 17, Blocking 6, Costing 1). The count in the finding was 28; four were dialogs of the legacy screens that X01 removed. The two Runtime dialogs now have names (`runtime-profile-dialog-title`, `delete-runtime-profile-title`). The dialogs' own `Escape` handlers were removed, and the 10 that had none now close on Escape. Existing specs pass unchanged.
- **`MenuButton`.** An item that opens a dialog records the trigger and no longer refocuses it (it refocuses the trigger only when focus was lost). Independent toggles use `kind: 'checkbox'` (`menuitemcheckbox`): Show runtime bands, Show headways, Round displayed times. Tab closes an open menu and the browser moves on from the trigger. Escape returns focus to the trigger at once (see "Intermittent browser failure" below).
- **Focus after common actions.** Shift drawer steps restore focus to the pressed button, or to the next enabled control when that button stays disabled. Block pill moves, Unassign, and Delete trips return focus through the dialog's invoker rule. Runtime Discard and Save return focus to Runtime actions; Node Discard to New node; Pattern Discard to Add node.
- **Fields and landmarks.** `Field` marks its control `aria-invalid` and `aria-describedby` its messages when it has errors. The Build Trips drawer marks the fields it cannot use (Pattern, First Trip, Headway, Number of Trips, Last Trip) and points at its alert; the Runtime profile dialog marks Name or Pattern; Costing inputs named by a finding point at the alert (`CostingFinding.field`). Trips, Blocking, and Costing each get one visually hidden `h1` ("Trips and runtimes", "Blocking", "Cost estimate"; Costing's must not be "Costing", which `costing-workspace.spec.ts` forbids); the early-return states use `h1.box-heading`. The Costing `main` is a `div` (the App owns the one `main`). The JSON file input is labelled "Restore project JSON file" and, like the other two hidden file inputs, is out of the Tab order. Every column header has `scope="col"` (76 headers).
- **Dependency.** `axe-core` 4.13.0 (exact; released 2026-08-05) added as a dev dependency for the accessibility scan. It is used only by `tests/ui/keyboard.spec.ts`. `package.json` and `pnpm-lock.yaml` are not on U04's owned list (recorded hand-off).
- **Docs.** `docs/ui-conventions.md` (dialogs, menus, accessibility baseline).

### Intermittent browser failure (cause found, fixed here)

`unified-action-layer.spec.ts:139` failed at `tripsWorkspace.ts:95` in some full runs (the Trip actions menu had no items after `ArrowDown`). The cause: when a menu closed, `MenuButton.dismiss()` returned focus to its trigger in a `setTimeout`. The helper presses Escape on the Runtime actions menu and immediately focuses Trip actions; under load the timer fired after that, pulled focus back to the Runtime trigger, and the next `ArrowDown` opened the Runtime menu. `keyboard.spec.ts` "Escape returns focus to the menu trigger at once" reproduces the mechanism deterministically: with the timer the focus ends on "Runtime actions" instead of "Trip actions". `dismiss()` now focuses the trigger synchronously. The failure had been seen in 2 of 6 full runs on the 4F branch, so the real fix is confirmed by the deterministic test rather than by absence: the full suite ran green here (117 of 117). The first 140 runs of the new spec hit the symptom once, before the fix was complete.

### Tests added

- `src/ui/modalDialogs.test.ts` (3 tests): `modal-backdrop` and `aria-modal` appear only in `ModalDialog.tsx`; 24 `ModalDialog` uses in the three workspaces; each has `labelledBy` or `label`.
- `tests/ui/keyboard.spec.ts` (15 tests; the B4 reproductions ported as normal tests plus new ones): a name dialog opened from a menu by keyboard takes focus, closes on Escape, and returns focus; a menu item that opens a dialog never gives its trigger focus (a focus counter, with the mouse); Tab and Shift+Tab stay inside and stray focus is pulled back; the Runtime profile dialog has a name and closes on Escape; Delete trips closes on Escape and, after confirming, returns focus to Trip actions; axe (dialog name, label, landmark, heading, role, document rules) on the four screens and on four open dialogs; Shift drawer steps keep focus; focus after a Block pill assignment and after Unassign; Runtime Discard and Node Discard; Escape returns focus at once; Display toggles are checkboxes and Tab closes a menu; `aria-invalid` on Route name, Build Trips, the Runtime dialog, and Costing; one `h1` and one `main` per workspace, a labelled file input, `scope` on every header.
- All 14 specs written before the Escape one failed on the unfixed code (the U03 commit; axe reported the unlabelled input there). `--repeat-each=10 --workers=8`: 150 of 150 passed.
- Deliberate breaks, each restored: removing the Tab trap (the trap test failed: "Tab press 2 left the dialog; focus on BODY"); the menu always refocusing its trigger (the focus-counter test failed); a Display toggle back to radio; `Field` without `aria-invalid`; no focus restore in the Shift drawer; the deferred `dismiss()` (focus ended on Runtime actions); a column header without `scope` in Blocking.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 44 files, 672 tests passed (669 before; +3).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 117 passed, 0 failed (4.2 minutes); 102 before plus the 15 new tests. No existing spec was changed. `unified-action-layer.spec.ts:139` passed.
- `pnpm build`: succeeds, no chunk warning. Bundle `index-Jh7TRu9e.js` 799.22 kB (796.30 kB before).
- Visual check at 1024 px (scratchpad, not committed): `/tmp/claude-0/-home-user-transit-costing-tool/97a11f95-8195-5c0d-bed4-917d1a55f2e0/scratchpad/shots/u04-after/{name-dialog,activity-dialog,notes-dialog}.png` against `.../shots/u04-before/name-dialog.png`: the dialogs are laid out as before; the input now shows its focus ring because it has focus.

### Not done, or only partly

- "Compatible only" in the Blocking menu is a single filter toggle but keeps the radio role: it is in the Compatibility group, not a Display option, and `blocking-workspace.spec.ts` asserts `menuitemradio` for it. Changing it needs that spec to change; left for a later package.
- Typeahead in menus (finding 5-018) is not implemented; the acceptance criteria do not ask for it.
- The Add-trip row, the Blocking dialogs that open inside other dialogs, and the frozen-column row headers (Sol-class) are unchanged.
- Initial focus in a dialog without an `autoFocus` control is its first focusable control, which for a confirmation is the Cancel or Close button in some dialogs and a destructive button in none that was checked; each alert dialog already marks Cancel `autoFocus`.

### Residual risks

- `ModalDialog` pulls focus back with a document-level `focusin` listener. Another feature that focuses a control outside an open dialog on purpose would be overridden; none exists today.
- Focus return trusts that the invoking control is still on the page; when a row is re-created (a Trips reload) the new control does not receive focus. The tests cover the Block pill and Trip actions flows.

## U05: Blocking presentation and destructive actions

- Date: 2026-10-23. Sitting 4G/4H (combined). Model: Sonnet (main session). No sub-agents.
- Type: UI. Severity: S2.
- Commit: `25752ee`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-034 | 5-008 | S2 | Removing a Trip, Pull-out, or Pull-in from a Block was one click, with no confirmation. |
| I-035 | 5-009 | S2 | Delete Block and Delete Blocking Scenario showed no impact counts and used the screen's older source signature; Delete Pattern's confirmation button read "Confirm". |
| I-040 | 5-015 | S2 | A Block holding a Trip from another Route showed "Missing pattern" and dashes for its Nodes. |
| I-083 | 4-026 | S3 | Blocking loads had no guard against out-of-order responses. |
| I-088 | 5-020 | S3 | Blocking showed hours with `toFixed(2)` and Costing with half-away-from-zero; 14 of 345 golden Block quantities differed (Saturday Block 22: 14.575 h showed 14.57 h). |
| I-089 | 5-021 | S3 | Truncated Pattern pills with no full name, a warning style on "No current issues.", "Move Trip N" off by one when a Pull-out row exists, "Trip profile" and "Trip Profile" mixed, and a Delete Pattern button whose accessible name did not contain its label. |

User decision implemented: 15 (the Route short name in the Pattern pill, only for activities from another Route; no new column).

### What changed

- **Remove asks first.** The remove button of a Trip, Pull-out, or Pull-in opens the existing Confirm dialog: "Remove Trip 3?" ("Remove Trip 3 from Block “26”? The Trip will become unassigned and its connected deadheads will be removed.") and "Remove pull-out?" / "Remove pull-in?" ("Platform hours and miles are incomplete until a new pull-out is added."). The button's accessible name is now "Remove Trip 3" (it was the Pattern name).
- **Delete previews (hand-off from P14).** Delete Block calls `previewDeleteBlock` and shows "Delete Block “26” with 14 Trips, 0 deadheads, and 16 activities in all?"; Delete Blocking Scenario calls `previewDeleteBlockingScenario` and shows "with 69 Blocks and N activities across every service day". Each deletion passes the preview's `sourceSignature`, so it deletes what was reviewed even if the screen is older, and is refused ("Blocking Scenario changed since the operation was reviewed…") when the data changed after the review; the dialog then closes and Blocking reloads (U02), so the next review is current. Delete Pattern's confirmation is titled "Delete Pattern?" with a "Delete Pattern" button; the button's accessible name is "Delete Pattern <name>" (it contains its visible label).
- **Other-Route Trips.** `ActivityRow` reads the Patterns and Nodes of every Route of the Scenario (not only the selected one) and shows `31B · Cross Pattern` in the pill for a Trip whose Route differs from the selected Route. The Pattern pills (Current Block and Unassigned Trips) carry the full name as a title.
- **Out-of-order loads.** New `src/ui/latestRequest.ts`: `loadBlocks` and `loadScenarios` each begin a numbered request and apply their result only if still the latest; an older response and its error are ignored.
- **Rounding.** `formatBlockingHours` and `formatBlockingMiles` use `roundCostingDisplay(value, 2)`. Every hours and miles figure of the Blocks table, the totals row, and the summary changes only where `toFixed(2)` was wrong (Saturday Block 22 revenue: 14.57 h to 14.58 h).
- **Labels.** "Move Trip N" uses the Trip's number in the Block; "No current issues." is a neutral note (`.blocking-no-issues`); the visible message strings and menu names "Trip profile" in App.tsx are "Trip Profile" (Blocking already used it).
- **Wording (hand-off from P12).** `block.deadheadOutsideGap`: "The deadhead times fall outside the time between its two Trips. Edit the deadhead to fit between them." `block.boundaryOverlap`: "The pull-out or pull-in overlaps its adjacent Trip. Shorten it, or change the Trip times." Both use the glossary terms Deadhead, Pull-out, Pull-in, and Trip. `block.missingTrip` already carries its next step (U02).
- **Docs.** `docs/ui-conventions.md` (Blocking rules).

### Files outside the package's owned list (recorded hand-offs)

- `src/ui/latestRequest.ts` and its test (new); `src/ui/blockingFormat.test.ts` (new; imports the golden backup and the format functions); `src/styles.css` gained `.blocking-no-issues` (owned).
- `src/ui/App.tsx` beyond "the Delete Pattern button label only": the Delete Pattern confirmation label and the "Trip Profile" capitalization (10 strings). The Delete Pattern confirmation is the other half of finding 5-009; the capitalization is one of the 5-021 label fixes.

### Tests added

- `src/ui/latestRequest.test.ts` (3 tests): only the latest request is current; with a slow older and a fast newer response, the newer result stays.
- `src/ui/blockingFormat.test.ts` (2 tests): Block 22 reads "14.58 h"; every golden Block quantity (300 or more) shows exactly as `roundCostingDisplay` rounds it, and some of them differ from `toFixed(2)` (the old defect). Both fail with `toFixed`.
- `tests/ui/blocking-presentation.spec.ts` (8 tests, real IndexedDB): the three removals ask first, name the activity, keep everything on Cancel, and remove exactly that activity on confirm; Delete Block shows its counts (compared with the stored Block), is refused after a change made after the review, and then deletes after a fresh review; Delete Block uses the reviewed source when the screen was loaded before another change; Delete Blocking Scenario shows its Block and activity counts, is refused after a change, and then deletes; the Delete Pattern button and confirmation read "Delete Pattern"; a Trip of another Route (a second Route, Nodes, Pattern, and Trip seeded) shows `31B · Cross Pattern` with its Nodes resolved while the selected Route's pill is unchanged; Saturday Block 22 reads 14.58 h; "Move Trip 1" with a Pull-out row first, the full Pattern name as a title, a neutral "No current issues.", and "Trip Profile" in the menus.
- On the unfixed code (the U04 commit) all 7 of the first 7 specs failed (the Delete Block source test was added later and passes only with the fix).
- Deliberate breaks, each restored: removal without asking; no Route in the pill; deleting a Block with the screen's signature instead of the reviewed one (the added source test failed); "Move Trip" by row index; `toFixed` instead of the Costing rounding (both unit tests failed).
- `--repeat-each=10 --workers=8` on the spec: 80 of 80 passed (8 tests; the ninth added later is in the full run).
- The out-of-order guard is covered by the unit test only. A browser test cannot hold one Blocking response back while another overtakes it without stubbing IndexedDB inside the page, and that stub would cut a transaction between its steps. No guard-removal break was run on the browser suite.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 46 files, 677 tests passed (672 before; +3 +2).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 125 passed, 0 failed (4.5 minutes); 117 before plus the 8 new tests. No existing spec was changed. `unified-action-layer.spec.ts:139` passed.
- `pnpm build`: succeeds, no chunk warning. Bundle `index-BjSl236P.js` 801.32 kB (799.22 kB before).
- Visual inspection of Blocking (Block 26 selected) at 1024 and 1440 px (scratchpad, not committed): `/tmp/claude-0/-home-user-transit-costing-tool/97a11f95-8195-5c0d-bed4-917d1a55f2e0/scratchpad/shots/u05/{1024,1440}-{blocking,remove-trip,delete-block}.png`. The two confirmation dialogs read clearly with Cancel focused; "No current issues." is a plain grey note; the totals and summary use two decimals. Seen and left alone: at 1024 px the Blocks table scrolls inside its frame and its Platform column is cut off (not new; U01 list); Pattern pills are still cut off by the pill's width, now with the full name as a tooltip.

### Not done, or only partly

- A Route column or a wider pill (the decision chose the short name in the pill only); no hover-free way to read a cut-off Pattern name on a touch screen.
- The Block name dialogs and the layover dialog keep their texts.
- Costing still shows whole hours (Decision 2 of the review); "Block 22 shows 14.58 in both workspaces" holds for the Blocking side, and Costing has no Block-level hours.

### Residual risks

- `ActivityRow` trusts `records.patterns` and `records.nodes` for other Routes; a Trip whose Pattern was deleted still shows "Missing pattern".
- The Delete Block confirmation says "in all" after the three counts to mean the totals do not add up to the activity count (Trips plus deadheads plus boundary activities); the wording is plain but not elegant.

## P16: Domain precision and message polish

- Date: 2026-10-23. Sitting 4G/4H (combined; the last package). Model: Sonnet (main session). No sub-agents.
- Type: structural. Severity: S3.
- Commit: `cf2d189`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-061 | 2-007 | S3 | At the exact midpoint of a gap between Runtime bands, `segmentStart` picked the earlier band and the blend fallback picked the later band. |
| I-062 | 2-008 | S3 | A decimal-minute entry that is exactly half a second rounded inconsistently: 0.025 gave 2 s but 1.025 gave 61 s and 4.225 gave 253 s (binary multiplication: 1.025 * 60 is 61.49999999999999); 4,369 of 200,000 half-second entries rounded down. |
| I-063 | 2-009 | S3 | The direction-order conflict message did not name the Direction, which Decision 0014 item 4 requires. |
| I-067 | 2-013 | S3 | Per-day hour totals were summed in floating hours: 17 Blocks that total exactly 266:30:00 gave 266.49999999999994, which the whole-hour display rounded to 266 instead of 267. |
| I-068 | 2-014 | S3 | `adjustBlockReferences` and `planBulkBoundaryActivities` stamped adjusted Blocks with the wall clock, so a copy preview was not reproducible; domain identifiers could not be injected in tests. |

User decisions implemented: none new (finding 2-007 was marked "either rule acceptable once documented"; the later band is documented in a Decision 0033 addendum).

### What changed

- `src/domain/runtime.ts`: `resolveSegmentStartBand` resolves a tie to the later band (`<=`), matching the blend.
- `src/domain/durations.ts`: a decimal-minute entry is converted from its decimal text with `BigInt` arithmetic, rounding half a second up. `0.025`, `1.025`, `4.225` give 2, 62, 254; every colon form and every whole-minute entry is unchanged.
- `src/domain/safeRouteEditing.ts`: the conflict message reads "… place B and A in conflicting order in the Outbound Direction. …".
- `src/domain/blocking.ts`, `src/domain/costing.ts`: `BlockSummary` gains optional `revenueSeconds` and `platformSeconds` (the whole seconds behind the hours; `summarizeBlock` fills them). The costing day total adds seconds and converts to hours once. A summary without them (hand-built in a test) gives the seconds behind its hours. The golden Federal BRT costing is unchanged: the same run before and after differs only in the sixth decimal of one annual cost (241823.216917 against 241823.216918 USD), far below the four decimals that the CSV and the screen use.
- `src/domain/trips.ts`, `src/domain/serviceDayCopy.ts`, `src/domain/blocking.ts`: `adjustBlockReferences(blocks, removed, surviving, now)` and `planBulkBoundaryActivities(request, blocks, trips, patterns, now)` take `now` (default: the wall clock, as before); `applyRegeneration` and the Trip copy preview pass their own `now`, so an adjusted Block carries the preview's time.
- `src/domain/ids.ts`: `setIdGenerator(generator)` replaces the identifier source and returns a function that restores the previous one (injections nest). Production still draws a random UUID.
- Documentation: Decision 0033 addendum (the tie rule) and Decision 0010 addendum (decimal minutes).

### Tests added

- `src/domain/runtime.test.ts`: at the exact gap midpoint (55,800 s between MID and PM) `segmentStart` resolves to PM, one second earlier to MID, one second later to PM, and its second segment uses the same band as the blend. Ported from the review's "DEFECT 2-007" reproduction, which the 4D hand-off said was not ported.
- `src/domain/durations.test.ts` (10 tests): 0.025, 1.025, 4.225, and five other values; a sweep of 2,000 exact half-second entries of the form (2j + 1) / 40 minutes (the floating-point conversion failed 1,000 of 2,000, the old scan found 4,369 of 200,000 over a wider range); malformed decimals are still rejected.
- `src/domain/safeRouteEditing.test.ts`: the message contains "Outbound Direction", both Pattern names, and the timepoints; `conflict.directionName` is the Direction name.
- `src/domain/costing.test.ts` (2 tests): the 17 Blocks (959,400 s) give 266.5 revenue and platform hours and display as 267, both with seconds on the summaries and with hours only. Ported from the review's "DEFECT 2-013".
- `src/domain/trips.test.ts`: an adjusted Block carries the given time and an unaffected Block is returned as it was. `src/domain/blockingRules.test.ts`: `planBulkBoundaryActivities` stamps changed Blocks with the given time and draws new activity ids from the injected generator. `src/domain/ids.test.ts` (3 tests, new): default uniqueness, injection and restore, nested injections.
- On the unfixed code 11 of the new tests failed; the others in the same files are controls (0.025, 0.5, the malformed-decimal check, default uniqueness).
- Deliberate breaks, each restored: the tie back to the earlier band; the floating-point conversion; the message without the Direction; hours summed as floats; the injected generator ignored.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 47 files, 696 tests passed (677 before; +19).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 125 passed, 0 failed, no `test.fail`, `test.skip`, or `test.fixme`. `unified-action-layer.spec.ts:139` passed. No browser spec changed in this package.
- `pnpm build`: succeeds; `index-D0zj91Yn.js` 801.78 kB (the bundle size message is the existing chunk-size notice, not new).
- Golden reconciliation: `calculateCosting` on the Federal BRT project, before and after, equal to six decimals except the one annual cost noted above.

### Not done, or only partly

- `resetPatternService` (a legacy mutator in `safeRouteEditing.ts`) still calls `adjustBlockReferences` without `now`; it has no `now` parameter and only unit tests use it (open question 2 in the Next sitting note).
- About 40 other domain signatures still default `now` to the wall clock. The finding asked for the two functions above; the rest stay optional parameters.
- Display rounding in the Trips table is not part of this package (P15 owns the "display rounding" item).

### Residual risks

- A `BlockSummary` built by hand without `revenueSeconds` has its seconds recovered with `Math.round(hours * 3600)`, which is exact for hours that come from whole seconds and moves a fractional-second value to the nearest second.
- The later-band tie rule changes the Trip times of a Runtime profile only for a segment that starts at the exact midpoint of a gap, an event of one second in a gap; no stored data is rewritten, and a Trip keeps its stored times until recalculated.

## U06: Costing and service-day presentation

- Date: 2026-10-23. Sitting 4I/4J (combined). Model: Sonnet (main session). No sub-agents.
- Type: UI. Severity: S2.
- Commit: `88a40a6`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-031 | 5-005 | S2 | A refused Service day edit (a total above 365, a count that is not a whole number, a blank name) showed only in the error banner, away from its field. Costing then showed "Invalid inputs" and an alert that pointed at "listed problems" without listing any. |
| I-033 | 5-007 | S2 | The Cost Breakdown table had a minimum width of 1,120 px, so at 1024 px it scrolled inside its frame and hid the Annual Cost column (acceptance criterion 7). |
| I-058 | 1-014 | S3 | The Phase 5 plan listed the columns of the 5C design, not the implemented table. |
| I-087 | 5-019 | S3 | The Total row summed daily hours across day types and its figures were not labelled as unrounded; "1 excluded Blocks" was not singular; View year appeared twice (toolbar and table header); dead Costing CSS. |
| I-044 (loading state) | 6-002 | S2 | While the estimate loaded, the workspace said "Select a valid Blocking Scenario to calculate an estimate." and "Enter a rate to calculate costs." |

User decisions implemented: C3 (the Total row leaves the daily columns blank, keeps the annual totals, and a note says totals are computed before rounding), decision 2 (5C is accepted, so the plan lists the implemented columns).

### What changed

- **Service days table (criterion 1).** `App.updateServiceDay` now returns the findings of a refused edit (`ServiceDayValidationError`) instead of showing the error banner; any other failure still goes to the banner. `RouteWorkspace` maps the findings of the edited field to text with the new `serviceDayFindingMessage` (`routeDefinitionService.ts`; `ServiceDayValidationError` uses the same function, so the banner text of earlier sittings is unchanged). The annual count (`NumericCommit`, which already had a field error with `aria-invalid`, `aria-describedby`, and "Saved value remains N.") takes the refusal as a returned string; a new `ServiceDayNameInput` does the same for the name ("Enter a service day name. Saved name remains Weekday."). Each message is a `field-error` under its input, in the same table row, and is announced as an alert. A later valid commit clears it. The saved value is unchanged until a valid edit.
- **Costing findings (criterion 2).** An invalid estimate lists each of its findings as a bullet under the alert, in plain language with a next step (new `costingFindingMessage` in `CostingWorkspace.tsx`; 19 rules; a service day named by id is shown by name; an unknown rule shows "Review this item and correct it before trying again.").
- **Annual cost at 1024 px (criterion 3).** The results table no longer has a minimum width; its header cells wrap and its cells keep their digits on one line, with 6 px side padding. At 1024 px the table is 960 px wide in a 960 px frame (before: 1,120 px in 960 px) and all nine columns show; at 768 px it also fits (704 in 704; before 1,120 in 704); at 1440 px it is unchanged.
- **Loading (criterion 4).** The effect that calculates the estimate sets `calculating`. While it is true and there is no result, the workspace says "Calculating estimate…" (a status) in place of the old text, and the Cost Breakdown subtitle is not shown. "Select a valid Blocking Scenario to calculate an estimate." appears only when no calculation is running.
- **Decision C3 (criterion 5).** The Total row shows Days, Blocks, and the three annual columns; Daily Revenue Hours, Daily Platform Hours, and Daily Cost are blank (the daily cost was already a dash). A note under the table reads "Totals are computed before rounding, so a total can differ by 1 from the sum of the rounded rows." "1 excluded Block" and "1 unassigned Trip" are singular. The View year selector in the table header is removed; View year stays in the toolbar (Decision 0028). The dead rules `.costing-setup-grid`, `.costing-context-fields`, `.costing-source-note`, and `.costing-year-selector` are deleted.
- **Plan (criterion 6).** `docs/implementation/phase-05-costing.md` lists the implemented nine columns, the Total row rule, the note, and the 1024 px fit.

### Behavior before and after (what you will see)

- Route tab, Service days: typing 300 for the Weekday count when the others total 163 shows "Annual service days cannot total more than 365. This change would make the total 418. Saved value remains 255." under the field; before, only the red banner at the top of the page. A blank name shows "Enter a service day name. Saved name remains Weekday."
- Costing, at 1024 and 768 px: the Annual Cost column is visible without scrolling the table.
- Costing, invalid estimate: the red alert lists each problem, for example "Annual service days total more than 365. Correct the counts in the Service days table on the Route screen."
- Costing: "Calculating estimate…" while it loads; the Total row has no daily figures and a note below the table; one View year selector; "0 excluded Blocks · 1 unassigned Trip".

### Files outside the package's owned list (recorded hand-offs)

- `src/application/routeDefinitionService.ts`: the exported `serviceDayFindingMessage` (the message table already existed there). No behavior change.
- `tests/ui/costing-rules-from-service.spec.ts` (P11's spec): `yearOptions` read the year list from the table header selector (`getByLabel('Cost breakdown year')`), which no longer exists; it reads the toolbar selector (`getByLabel('View year')` inside `.module-toolbar`). Every assertion is unchanged.
- `tests/ui/costing-workspace.spec.ts`: the existing assertion `0 excluded Blocks · 1 unassigned Trips` became `... 1 unassigned Trip` because the criterion makes the count singular. The same test's `getByLabel('View year')` still finds the one toolbar selector.
- New `tests/ui/support/costingFixture.ts` (the small project that `costing-workspace.spec.ts` seeded inline, moved out so more tests can use it) and `src/ui/CostingWorkspace.test.ts`.

### Tests added

- `src/ui/CostingWorkspace.test.ts` (4 tests): the 365-day finding text; a service day named by id (and "a service day" when unknown); no message key or id appears in any of the 19 rules; the fallback.
- `tests/ui/costing-workspace.spec.ts` (7 new tests, real IndexedDB): a total above 365 shows its message beside the field with `aria-invalid` and a description, not in the banner, keeps the stored value, and clears on a valid edit; a blank name does the same; an invalid estimate lists its finding; "Calculating estimate…" shows while the estimate's reads are held back (a raw IndexedDB write transaction on `trips`, `blocks`, and `patterns` keeps the estimate's reads waiting while the Blocking Scenarios and the assumptions load) and the old text never shows; the Total row, the note, and the singular counts; View year appears once and the Cost Breakdown section has no selector; the table does not scroll, and Annual Cost stays inside the viewport, at 1024 and 1440 px with an eight-digit cost, and the page does not scroll sideways at 768 px.
- On the unfixed code 6 of the 7 new tests failed (the seventh, "View year appears once", passed because the table's selector had an `aria-label`; it now also asserts that the section has no combobox, which fails on the old page). The first failure of the Calculating test was a missing page reload in the test itself; its break below shows that it fails for its own reason.

### Deliberate breaks (each applied, run, and restored)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Service day field errors | the refusal text dropped (`serviceDayRefusal` returns nothing) | 2 fail |
| Estimate findings | the list renders no items | 1 fails |
| Calculating | `setCalculating(true)` removed | 1 fails |
| Total row | the daily cells filled again | 1 fails |
| AC7 width | `min-width: 1120px` restored | 1 fails |
| Singular counts | the plural helper always adds "s" | 1 fails |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 48 files, 700 tests passed (696 before; +4).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 132 passed, 0 failed (4.3 minutes); 125 before plus the 7 new tests. No `test.fail`, `test.skip`, or `test.fixme`. `unified-action-layer.spec.ts:139` passed.
- New spec stress run, `--repeat-each=10 --workers=8` over `costing-workspace.spec.ts` and `costing-rules-from-service.spec.ts` (12 tests): 120 of 120 passed.
- `pnpm build`: succeeds, no chunk warning. Bundle `index-sdD2Whrb.js` 805.01 kB (801.78 kB before).
- Visual inspection (scratchpad, not committed). Costing at 768, 1024, and 1440 px, before and after: `/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/costing-{before,after}-{768,1024,1440}.png`. Route Service days with two refused edits at 1024 px: `.../shots/route-service-days-errors-1024.png`. Costing with an invalid estimate at 1024 px: `.../shots/costing-invalid-findings-1024.png`. Seen: before, at 1024 px the table is cut after "Annual Platform Hours"; after, all nine columns show, the header cells wrap on two lines at 768 px, the Total row is blank under the daily columns, and the note sits under the table. The field messages are red 12 px text under the input, as the Node editor's.

### Documentation

`docs/implementation/phase-05-costing.md` (columns, Total row, note, width). No architecture or decision record changed: no structure, data flow, or persistence changed.

### Not done, or only partly

- The recorded answer of `getLocalDataProtection()` ("kept" or "may be cleared") is not shown on the Costing screen; no acceptance criterion asks for it.
- The assumptions alert ("Review the rate, years, horizon, and escalation…") keeps its single sentence; only the estimate's findings are listed.
- At 768 px the Save button of Costing Assumptions wraps below the title (unchanged).

### Residual risks

- The estimate findings that name a Trip or a Block cannot say which one: the finding holds an id and the screen holds no Trips. The text says what to review.
- `ServiceDayNameInput` is uncontrolled (`defaultValue`), as the field was; a refused name stays typed in the field with the message beside it until the planner corrects it or reloads.

## U07: Trips and Runtime presentation

- Date: 2026-10-23. Sitting 4I/4J (combined). Model: Sonnet (main session). No sub-agents.
- Type: UI. Severity: S2.
- Commit: `4d270c1`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-041 | 5-016 | S2 | The Runtime profile line named only the selected Service day ("Used by Weekday for ...") even when other days share the profile (02R-AC18). |
| I-057 | 1-013 | S3 | The Trips selector for a Blocking Scenario read "Scenario", the label of the global Scenario selector; "Run Time" and the operating-span line were not in the glossary or contradicted the overview. |
| I-082 | 4-025 | S3 | Runtime paste replaced the profile's calculation method, also in Append mode, without showing it. |
| I-092 | 5-026 | S3 | Shift drawer Undo, Redo, and the step buttons changed the Redo history before the preview resolved; a refused preview left the history out of step with the preview. |
| I-093 | 5-027 | S3 | The Trips CSV import preview showed Trip and Pattern UUIDs; finding keys could collide. |
| I-094 | 5-028 | S3 | Runtime band totals of 60 minutes or more read ":61" and ":65". **Checked first, as the user directed: see "What criterion 6 found".** |
| I-012 (UI part) | 5-011 | S2 | Any error while drawing a screen blanked the whole page (no error boundary). |

User decisions implemented: decision 7 (the Trips selector reads "Blocking Scenario"); the 2026-10-23 decision, Option B, for the Recalculate dialog (Decision 0031 addendum, item 5).

Added acceptance criteria done in this package (the Added acceptance criteria section records the hash): the single-flight Runtime load and the removal of the two test-helper steps; the Trips table follows a Runtime profile saved in the same session; the Recalculate dialog hides the band picker for segment-start and blended Trips.

### What changed

- **Single-flight Runtime load (`App.tsx`, new `src/ui/singleFlight.ts`).** `loadRuntime` used to start a new read each time it was called: the effect, StrictMode's second effect run, and every change (a save, an assignment, a copy, a method change) that called it and then bumped `runtimeVersion` made two or three reads in a row or at once, each disabling the Runtime menus and closing an open one. Now a change only calls `onRuntimeChanged`, which bumps the version and reloads once through the effect, and loads that overlap (StrictMode's second effect run, a change that lands during a load) run one after another and share the last result (`singleFlight`: a call made while a read runs asks for one more read and every caller waits for it). The section sets `loading` once and applies one result. A read is also where the Default profile is ensured, as before (the service half was P09's).
- **Runtime reload after a save.** The Runtime section's read now includes every profile of the Route and the day's assignments (`routeRuntime`), and the Trips table shades from those, not from the records the page loaded at the start. After a Runtime save, "Show runtime bands" shades from the saved profile with no page reload (the legend shows the new band times).
- **Test helpers.** `tests/ui/support/tripsWorkspace.ts` no longer creates the Default Runtime profile before Trips mounts, and no longer reloads the page after the Runtime save (it waits for the Runtime menu to be enabled instead). `trips-table-display.spec.ts` no longer reloads before "Show runtime bands".
- **Shared Runtime profile line (criterion 1).** "Used by Weekday, Saturday, and Sunday for Southbound: Wagon Road to Evans." The days come from `listRuntimeProfileServiceDays` (P09), in the canonical order, in the same read.
- **Label (criterion 2).** The Trips selector reads "Blocking Scenario". `docs/ui-conventions.md` (the Trips selector line) and `docs/domain-glossary.md` (new "Run Time" entry; the operating-span line says spans are derived from the authoritative Trips and not stored) are updated.
- **Runtime paste (criterion 3).** The preview shows "Calculation method: Band at segment start (from the pasted rows, replacing Single band for trip)." or "Single band for trip (unchanged)." Append keeps the profile's own method and says so, naming the pasted method when it differs ("kept; Append does not change the method, and the pasted rows name Band at segment start"). Before, Append applied the method the pasted rows named. **Reading of "unless the preview says otherwise":** Append never changes the method; the preview says so. If the planner wants a way to change the method while appending, that is a new control and was not added.
- **Shift history (criterion 4).** `reviewStagedShift` returns whether the preview resolved. `appendStagedShift`, `undoStagedShift`, and `redoStagedShift` change the Redo history only after it did.
- **CSV import preview (criterion 5).** The Trip column shows the label, or "Trip departing 6:10" when there is none; the Pattern column shows the Pattern's name. The error list keys include the position.
- **Runtime band totals (criterion 6).** See below.
- **Error boundary (criterion 7).** `WorkspaceErrorBoundary` wraps the screen below the header and the tabs. A render error shows "This screen could not be shown" with what to do ("Your saved data is still in this browser; edits you had not saved on this screen are lost. Choose another tab, or try again. If it happens again, export a backup from the Project menu and reload the page."), a Try again button, and a Reload page button. It resets when the tab, Scenario, or Route changes. The error is written to the console.
- **Recalculate dialog (Option B).** For a Trip whose Pattern uses the segment-start or the blended method, an ambiguous anchor no longer offers the Runtime band picker. It lists the candidates ("Early: 5:55 departure (within band)") and says "The fixed time can be reached from two first departures, and a band cannot be chosen for a Band at segment start profile", then "Use the first departure for this trip, choose another anchor, or adjust the runtime bands." The "Use first departure for this trip" button is unchanged. A single-band profile keeps the picker.
- **Messages (carried forward from P07 and P08).** `USER_FACING_VALIDATION_MESSAGES` has text for `tripShift.timeBeforeServiceDay`, `trip.timeBeforeServiceDay`, `trip.anchorNoRuntime`, and `trip.anchorAmbiguous`.

### What criterion 6 found

The totals show `:53`, `:61`, `:65`, and `:57` for the golden Weekday profile (the sums of eight segments of 5 to 15 minutes). They are not wrong and not a different format: `formatRuntimeDuration` prints minutes without a cap at 59 (Decision 0010: "display as `:MM` or `:MM:SS`"), so `:61` is 61 minutes, in the same format as the segment cells (`:06`) and the Trips table's Run Time column. Decision 0033 defines no other duration format. Finding 5-028 is therefore a readability question, not a defect, and the user's default (the totals use the duration format) already holds. **No change was made;** a test pins the display (`Runtime band totals of 60 minutes or more use the same duration format as the segments and the Run Time column`). If the planner would rather read totals of an hour or more as `1:01`, that is a decision for all duration cells, not for the totals alone.

### Blocked: decision needed

**Decided by the user on 2026-10-23 (after this entry was written).** Item 1: the overlap is accepted (option D); the Shift drawer is redesigned in package U10 (Opus, beyond the scope of a fix). Item 2: option A, in package U09 (Sonnet). Both are in the Next sitting note. Nothing below was changed by the decision.

1. **Shift drawer covers the Runtime Save and Discard buttons (carried forward from U03).** At 1024 to 1900 px the docked Shift drawer (380 px or 40% of the width, fixed to the right edge from 72 px down) covers the right end of the Runtimes header, where Save and Discard sit. With a staged Shift open the planner reaches Runtime Save only by keyboard. No package text, added criterion, or decision says how the two should coexist. **Question:** how should the open Shift drawer and the Runtime Save and Discard buttons coexist? **Options:** (A) reserve the room: while the drawer is open the Trips workspace gets a right margin equal to the drawer width, so nothing is covered and the schedule table narrows (smallest change to the header; recommended); (B) move Save and Discard to the left of the Runtimes header, next to the title, so the drawer never covers them (changes the header convention in `docs/ui-conventions.md`); (C) dock the drawer at the bottom of the window (new layout; Sol-class judgment); (D) leave it, since the keyboard reaches Save. Not done.
2. **Where to show why a Trip cannot be recalculated (`inspectStaleTrips` findings, from P07).** The text for the findings exists now (messages above) but no screen shows them. **Question:** where should the reason appear when "Run Times Have Changed" and a Trip's profile cannot calculate it? **Options:** (A) one status line under the "Run Times Have Changed" indicator listing the distinct reasons (recommended); (B) the reason in the row's "Run times changed" note; (C) leave it unshown. Not done.

### Files outside the package's owned list (recorded hand-offs)

- New `src/ui/singleFlight.ts` and `src/ui/singleFlight.test.ts` (the screen's one-at-a-time rule, tested without a browser).
- `tests/ui/support/tripsWorkspace.ts` and `tests/ui/trips-table-display.spec.ts`: the helper steps and the reload that the added criterion says U07 removes. Their assertions are unchanged.
- `architecture_overview.md` (UI layer paragraph). `tests/ui/deletion-reviews.spec.ts`: one call added to its fixture (see Verification). Assertions unchanged.

### Tests added

- `src/ui/singleFlight.test.ts` (4 tests): one call runs once; overlapping calls never run together, run once more, and all get the last result; a call after the end starts a fresh run and a failure does not stick; the second run reads the newest inputs.
- `tests/ui/trips-runtime-presentation.spec.ts` (13 tests, real IndexedDB): the shared-profile line (three days; two days; one day); the "Blocking Scenario" label; the band totals pin; the paste preview text for unchanged, pasted-method, and Append, and the stored method after an Append of rows that name another method; Undo and Redo after a refused preview; the CSV preview names (and no ids); the error boundary (message, tabs still work, recovers on another tab) and Try again; "Show runtime bands" after a Runtime save with no reload; the Recalculate dialog with no picker for segment-start and the picker kept for single-band; the first visit to Trips (one profile, four assignments, no notice).
- On the unfixed code 10 of the first 12 failed; the totals pin and the single-band picker control passed because they pin behavior that was already right. The first-visit test was added after that run and was not run on the old code.

### Deliberate breaks (each applied, run, and restored)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Shared profile line | the line names only the selected day again | 3 fail (both line tests and the first-visit test) |
| Label | the selector reads "Scenario" again | 1 fails |
| Paste preview | Append applies the pasted method | 1 fails |
| Shift history | the step buttons clear the Redo history before the preview resolves | 1 fails |
| CSV preview | the Pattern cell shows the id | 1 fails |
| Error boundary | the boundary renders its children after an error | 2 fail (the render-error test and Try again) |
| Show runtime bands | the table reads the records loaded at the start | 1 fails |
| Recalculate dialog | the band picker is always offered | 1 fails |
| Single flight (`singleFlight.test.ts`) | a call made while a run works starts a second run | 1 fails |

Each break was applied to the source, the spec (or the unit test) run, and the source restored from a saved copy. No browser test fails when the single-flight wrapper is removed: the service half (P09) already keeps the first visit correct, and the browser specs no longer need the old helper steps either way. The unit test is the proof of the rule; the saved profile reaching the Trips table and the one-time load are covered as behavior, not as timing.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 49 files, 704 tests passed (700 before; +4 in `singleFlight.test.ts`).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 145 passed, 0 failed (4.8 minutes); 132 before plus the 13 new tests. No `test.fail`, `test.skip`, or `test.fixme`. `unified-action-layer.spec.ts:139` passed. An earlier run of this package's code failed two specs and the cause was in the package: `deletion-reviews.spec.ts` created its second profile before the app had created the Default one (the removed helper step used to do that; it now calls `ensureDefaultRuntimeProfile` first, assertions unchanged), and the paste test, rewritten, waited on a menu that a second Runtime load closed (the explicit `loadRuntime()` calls after each change were removed, so a change reloads once through `onRuntimeChanged`).
- New spec stress run, `--repeat-each=10 --workers=8`: `trips-runtime-presentation.spec.ts` 130 of 130 passed (13 tests).
- `pnpm build`: succeeds, no chunk warning. Bundle `index-CUKH2aRs.js` 808.96 kB (805.01 kB before).
- Visual inspection (scratchpad, not committed), Federal BRT Trips (Weekday, Southbound) at 1024 and 1440 px, before and after: `/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/trips-{before,after}-{1024,1440}.png` and `/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/runtime-{before,after}-{1024,1440}.png`. Seen: the Runtime and Trips layout is unchanged; the Trips header reads "Profile" and "Blocking Scenario" and fits at 1024 px; the totals read `:53`, `:61`, `:65`, `:57`. Also: the Shift drawer over a Runtime draft at 1024 and 1440 px (`/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/shift-drawer-over-runtime-save-after-{1024,1440}.png`), which shows the right end of the Runtimes header, where Save and Discard sit, under the drawer (blocked item 1); the Recalculate dialog for a segment-start Trip (`/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/recalculate-segment-start-after-1024.png`), which lists the two candidates and has no band picker; and the error message (`/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/error-boundary-after-1024.png`). Seen and left alone: at 1024 px the Recalculate dialog is wider than the window, so its right-hand columns and its buttons are cut off (it was before this package).

### Not done, or only partly

- The two blocked items above.
- The Runtime paste dialog loses keyboard focus when "Review rows" is pressed (the button is disabled while it reviews), so Escape does not close it until focus is moved back into the dialog. Seen while writing the test (it clicks Cancel). Not owned by this package; U04's focus work did not cover it.
- The Recalculate dialog is wider than a 1024 px window (seen in the screenshot above); it was before this package, and no package owns it.
- The finding-key change in the CSV preview is not covered by a test (a duplicate key needs two findings with one message for one Trip, which the CSV reader does not produce).

### Residual risks

- `routeRuntime` adds two reads (the Route's profiles and the day's assignments) to each Runtime section load.
- The error boundary cannot catch an error thrown while drawing the header or the tabs, in an event handler, or in an asynchronous callback.

## P15: Trips and Runtime rules out of `App.tsx`

- Date: 2026-10-23. Sitting 4I/4J (combined). Model: Sonnet (main session). No sub-agents.
- Type: structural. Severity: S3.
- Commit: `b920627`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-074c | 4-014 (Trips and Runtime items) | S3 | `App.tsx` assembled Runtime bands, chose reverse-copy candidates, converted Shift minutes, labelled the net Shift, found duplicate departures (in O(n²)), rounded displayed times, applied the usable-Pattern rule four times, ordered Service days and Directions by its own rules, counted Block assignment impacts by copying a private Blocking function, validated Build Trips a second time, and called the runtime calculations while drawing each Trip row. |

Added acceptance criterion (the user, 2026-10-23), done here: a Pattern with no distance entered shows "incomplete" instead of a zero distance, with the same rule as Blocking (a total of 0 is incomplete mileage, P12). Marked done in the Added acceptance criteria section.

### What changed

Each item of the 4-014 list for Trips and Runtime now has one home and a unit test:

| Item | Now |
| --- | --- |
| Runtime band assembly, sequence renumbering, ids | `addRuntimeBand`, `updateRuntimeBand`, `duplicateRuntimeBand`, `removeRuntimeBand`, and `applyPastedRuntimeRows` (Replace keeps the id and label of the band at the same position; Append never changes the method) in `src/domain/runtime.ts` |
| Reverse-candidate eligibility | `reverseRuntimeCandidates` in `runtime.ts`; `reverseCopyRuntimeProfile` uses the same node-mirror test (`patternsMirrorNodes`), so the menu and the copy cannot disagree |
| Shift minute conversion and net-shift label | `parseShiftSeconds`, `formatNetShift`, `formatStagedShift` in `src/domain/tripShift.ts` |
| Duplicate-departure rule | `duplicateDepartureKeys` in `src/domain/trips.ts` (one pass; a Trip with no times is never a duplicate) |
| Display rounding | `roundServiceTimeToMinute` in `trips.ts`; `calculateTimepointHeadways` has its first unit test |
| Usable-Pattern rule | `isUsablePattern` and `usableDirectionPatterns` in `src/domain/directions.ts`; used by `App.tsx` (the Trips tab, the Pattern choices of a Direction, the Runtime copy dialog) and by `serviceDayCopy.ts` |
| `serviceDayOrder` | removed; the Service days table uses `sortServiceDays` (kind, sequence, then id) |
| Direction sort | `orderDirections` (sequence, then id, columns in their own order) in both places |
| Block assignment and unassignment impact counts | `tripBlockAssignmentImpact` and `tripBlockUnassignmentImpact` in the new `src/application/tripsWorkspaceView.ts`, which count with the Blocking service's own `removeSelectedTripsFromBlock` (now exported), so a count cannot differ from what the write removes |
| Build Trips validation | `parseBuildTripsForm` and `buildTripsFieldProblems` in `tripsWorkspaceView.ts`; the range and order rules are the domain's `validateGenerateTripsRequest`; the texts stay in `App.tsx` |
| Render-time runtime calls | `describeTripBandShading` in `runtime.ts` and `buildTripTableView` in `tripsWorkspaceView.ts` give each Trip row its run time, duplicate flag, and band shading, and each column its headways |
| Pattern total distance | `patternTotalMiles` in `src/domain/patterns.ts`; Blocking's `revenueDistance` uses it, so the two screens cannot disagree |

`App.tsx` now imports no calculation from `src/domain`. What it still imports as values from the domain: three error classes (`AnchorBandChoiceError`, `TripGenerationError`, `TripShiftValidationError`), the text helpers `parseServiceTime`, `parseRuntimeDuration`, `formatServiceTime`, and `formatRuntimeDuration`, and the identifier helpers `newId` and `metadata` (the Node and Pattern drafts of the Route screen use them). `src/ui/importGraph.test.ts` fails if another value import appears. Everything else the screen needs comes from `src/application/tripsWorkspaceView.ts`, which also re-exports the domain functions above so the interface imports them from one place.

### Displayed values

Unchanged, except the one criterion. The literal text "0.0 miles" is not on any screen today. What a Pattern with no distance shows is the **Segment mi** column of the Pattern editor on the Route screen (`0.00` for every point), and the Trips screen shows no distance at all. So the change is on the Pattern editor: a Pattern whose total distance is 0 now shows **incomplete** in the Segment mi cells; a Pattern with a distance shows what it showed (the first point still reads `0.00`). The Trips screen has nothing to change. If the planner meant another place, say so.

Non-visible differences from the old inline code:

- Pattern order within a Direction breaks a tie in `sequence` by id (before: the order they were stored in). Patterns with no `sequence` use their position, not 0. Real Patterns carry a unique sequence, so no screen changes.
- Directions and their columns are ordered with the same tie-break (`orderDirections`); no stored Direction has a tie.
- `duplicateDepartureKeys` skips a Trip with no times; before, two such Trips were flagged. A Trip row cannot be drawn without times.
- The Build Trips messages are the same texts; the count-range rule and the Last-before-First rule now come from the domain's request validation.

### Tests added

- `src/domain/tripsRuntimeRules.test.ts` (25 tests): band add, update, duplicate, and remove; pasted rows in Replace and Append (ids, labels, numbering, method, copied arrays); reverse candidates (opposite order only; not itself, even for a palindrome); trip band shading for single-band, segment-start, mismatched times, marked-changed, and missing profile; Shift minutes and both labels; duplicate departures and a Trip with no times; display rounding at 29, 30, 31, and 90 seconds; timepoint headways (order, ties, unknown Pattern); the usable-Pattern rule and its Direction list; a Pattern's total distance (0, none, NaN); Service day and Direction ordering with ties.
- `src/application/tripsWorkspaceView.test.ts` (12 tests): table rows (run time, duplicates, single-band shading, segment contributions and a Trip marked changed, a staged Shift's times against saved duplicates and headways); the Build Trips form (requests by Last Trip and by count, every reason it refuses, the domain's own rules, a Last Trip over 500 left to the service, the field marks); assignment and unassignment impact counts (moved, new, already there, deadheads once, none outside the moved Trips).
- `src/ui/importGraph.test.ts` (2 tests): `App.tsx` imports only allowed value names from the domain; the check detects value imports and ignores type imports.
- `tests/ui/pattern-distance.spec.ts` (1 test, real app): a Pattern with no distance shows `incomplete`, a distance of 4.5 shows `0.00` and `4.50`, and a distance reset to 0 shows `incomplete` again.
- On the unfixed code every new test fails (the functions do not exist and `App.tsx` imports `selectRuntimeBand` and others from the domain). That shows only that they are new; what each protects is shown by the deliberate breaks. The existing browser specs (Trips table display, Shift, paste, Build Trips, Blocking assignment) pin the displayed values that must not change, and they pass unchanged.

### Deliberate breaks (each applied, run, and restored)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Display rounding | rounds 29 seconds up | 1 fails |
| Duplicate departures | needs three Trips, not two | 3 fail |
| Reverse candidates | a Pattern is its own candidate | 1 fails |
| Pasted rows | Append applies the pasted method | 1 fails |
| Band editing | a duplicated band keeps the source id | 1 fails |
| Shift minutes | zero minutes accepted | 1 fails |
| Usable Pattern | one point is enough | 2 fail |
| Total distance | a total of 0 counts as a distance | 1 fails |
| Table view | headways read the saved Trips, not the shown ones | 1 fails |
| Impact counts | every Trip counts as newly assigned | 1 fails |
| Domain import guard | `App.tsx` imports `selectRuntimeBand` from the domain | 1 fails |
| Build Trips form | the count range rule is skipped | 1 fails |
| Pattern editor (browser) | the distance check removed, so a Pattern with no distance shows `0.00` | the new spec fails |
| Trips table (browser) | duplicate flag never set | `trips-table-display.spec.ts` "flags a duplicate departure…" fails |
| Trips table (browser) | display rounding floors instead of rounding | `trips-table-display.spec.ts` "rounds displayed times…" fails |

One break was not a break and was replaced: removing the "not the destination Block" filter from the assignment impact count changed nothing (a moved Trip is never in the destination Block, so that Block never loses a deadhead either), so the filter is a safeguard, not a rule. The break in the table above ("every Trip counts as newly assigned") stands in for it. Each break was applied to the source, the tests run, and the source restored from a saved copy.

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 51 files, 743 tests passed (704 before; +25 in `tripsRuntimeRules.test.ts`, +12 in `tripsWorkspaceView.test.ts`, +2 in `importGraph.test.ts`).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 146 passed, 0 failed (4.7 minutes); 145 before plus the 1 new spec. No existing spec changed. No `test.fail`, `test.skip`, or `test.fixme`. `unified-action-layer.spec.ts:139` passed.
- New spec stress run, `--repeat-each=10 --workers=8`: `pattern-distance.spec.ts` 10 of 10 passed.
- `pnpm build`: succeeds, no chunk warning. Bundle `index-DidXN46k.js` 810.48 kB (808.96 kB before).
- Visual inspection (scratchpad, not committed): the Trips and Runtime screens at 1024 px after P15 (`/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/trips-p15-1024.png`, and 1440 px `/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/trips-p15-1440.png`) are the same as after U07 (`/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/trips-after-{1024,1440}.png`): the same rows, the same band totals, the same run times and block pills. The Pattern editor with a Pattern that has no distance: `/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/pattern-editor-incomplete-p15-1024.png` (both Segment mi cells read "incomplete"), and with a distance of 4.5: `/tmp/claude-0/-home-user-transit-costing-tool/cca2e888-fc60-55dc-a41a-63377769b359/scratchpad/shots/pattern-editor-with-distance-p15-1024.png`.

### Files outside the package's owned list (recorded hand-offs)

- `src/domain/patterns.ts` (`patternTotalMiles`), `src/domain/blocking.ts` (`revenueDistance` calls it; same rule), `src/domain/serviceDayCopy.ts` (`isUsablePattern`), `src/application/blockingService.ts` (`removeSelectedTripsFromBlock` exported; no behavior change). New `src/application/tripsWorkspaceView.ts` and its test, `src/ui/importGraph.test.ts`, and `tests/ui/pattern-distance.spec.ts`.

### Not done, or only partly

- `routeDefinitionService.ts` keeps its own "fewer than two points" check (a Pattern cannot be saved or deleted into that state), and `validatePattern` keeps its own `pattern.requiresTwoPoints` rule. They are Route-editing rules, not Trips or Runtime items.
- `App.tsx` still builds Node and Pattern drafts with `newId` and `metadata`, and parses Runtime and clock text with `parseServiceTime` and `parseRuntimeDuration`; none is a calculation, and the import test records them as allowed.
- The Blocking items of 4-014 (P14) and the Costing items (P11) were done in their packages.

### Residual risks

- `buildTripTableView` runs on every render of the Trips table, as the inline code did; with the duplicate rule now one pass it is cheaper than before. A memo was not added.
- The application module re-exports domain functions for the interface. A new calculation that the interface needs must be added there, not imported from the domain; the import test enforces it for `App.tsx` only. `BlockingWorkspace.tsx` and `CostingWorkspace.tsx` still import a few functions from the domain (`createBlockingScenarioSourceSignature`, `sortServiceDays`, `roundCostingDisplay`, and others); the Blocking and Costing items of 4-014 are P14's and P11's.

## P17: Pattern deletion token, legacy mutators removed, import refusal message

- Date: 2026-10-23. Sitting 4I/4J (combined). Model: Sonnet (main session). No sub-agents.
- Type: structural. Severity: S3. Defined by the user's decisions of 2026-10-23, items 1 to 3 (the Next sitting note); `docs/review/fix-packages.md` has no P17 entry.
- Commit: `87359e0`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-027 (remainder) | 4-011, 4-012 | S2 | `deletePattern` was the one confirmed deletion with no review token. It removes Runtime profiles, Runtime assignments, Generation sets, and Trips, and changes Blocks, so a Trip or a Block saved after the confirmation dialog opened was removed unseen. |
| I-078 (second half) | 4-020 | S3 | The per-field route mutators saved without the preview and without Pattern validation. The application no longer called them, but they stayed on the public interface, and test fixtures used them, so a fixture could hold a Pattern that a planner could not save. |
| (none) | Decision 0039 follow-up, user decision 2026-10-23 | S4 | A backup that gave two Blocks of one Blocking Scenario the same label on one service day was refused with "Rename one of them in the app that made this file". The message named neither the service day nor the way out. |

### Decisions

- Item 1: `deletePattern(patternId, reviewToken)`. The token covers the Pattern, its Runtime profiles and assignments, its Generation sets, its Trips, and the Blocks that hold a revenue activity of one of those Trips (Decision 0041 addendum). The review and the command share one private plan, so the counts shown and the records removed cannot differ.
- Item 2: the mutators are deleted, not deprecated. Test setups use a new `src/testSupport/routeFixtures.ts` that saves through `previewNodeChanges`, `previewPatternChange`, and their commits.
- Item 3: no repair on import. The message names the Blocking Scenario, the label, and the service day, says how many other labels repeat, says that nothing was imported, and says to rename the repeated labels in the project where the file was exported, export again, and import the new file.

### What changed

- `src/application/routeDefinitionService.ts`:
  - `PatternDeletionImpact.reviewToken`; `getPatternDeletionImpact` and `deletePattern` use the private `planPatternDeletion` and `recordsForPattern`; `deletePattern` takes a required token and refuses with "The pattern deletion review is out of date. Review the impact again." when it is missing or differs.
  - Removed: `addNode`, `updateNode`, `addPattern`, `updatePattern`, `addPatternPoint`, `updatePatternPoint`, `movePatternPoint`, `removePatternPoint`, `createReversePattern`, `duplicatePattern`, `addDirection`, `updateDirection`, `addDirectionColumn`, `assignPatternDirection`, and their names in `RouteDefinitionApplication`. Two imports left unused were removed. The domain functions they called stay (the domain and its tests still use them).
- `src/ui/App.tsx`: `deleteSelectedPattern` passes `impact.reviewToken` (one line; no layout or interaction change). The existing refusal path (error banner) shows the stale-review message.
- `src/persistence/backup.ts`: `repeatedBlockLabelsMessage` builds the refusal text of the duplicate-label check.
- New `src/testSupport/routeFixtures.ts`: `addRouteNodes`, `savePattern`, `savePatternDraft`, `addTwoStopPattern`. `routeDefinitionService.test.ts` (about 15 setups) and `saveStatus.test.ts` use them. Where a setup depended on a legacy side effect, it now says what it needs (for example the third point of the lengthened Pattern in the `ensureDefaultRuntimeProfile` resize test is added with `previewPatternChange` and `commitPatternChange`).
- Docs: Decision 0041 addendum (items 1 to 3) and its two stale Consequences lines; `architecture_overview.md` lists Pattern among the deletions that take a review token.

### Tests added

- `src/application/routeDefinitionService.test.ts` (+1 test, and two assertions in an existing one): a Pattern deletion is refused after a Trip, a Runtime profile, or a Block it would change changed after the review, nothing is deleted on a refusal, and a fresh review deletes; a missing or foreign token is refused.
- `src/persistence/backupImportValidation.test.ts` (+2 tests): the refusal names the Blocking Scenario, the label, the service day, the count of other repeated labels, "Nothing was imported", and the rename, export, and import steps; with one repeated label the text has no count clause.
- `tests/ui/deletion-reviews.spec.ts` (+1 test, real app): Delete Pattern is refused when a Trip was saved after the review, nothing is deleted, and a fresh review (which now counts 4 Trips) deletes the Pattern and its Trips.
- `tests/ui/backup-import.spec.ts` (+1 test, real app): importing a file with a repeated Block label shows the new message and writes nothing.
- No existing assertion was changed. All unit setups that used the removed mutators pass with the fixtures.

### Deliberate breaks (each applied, run, and restored from a saved copy)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Pattern deletion token | `deletePattern` does not check the token | 2 unit tests fail; the browser spec fails |
| Pattern deletion token | the token leaves out the Trips | 1 unit test fails |
| Pattern deletion token | the token leaves out the Blocks | 1 unit test fails |
| Import message | "Nothing was imported" removed | 1 unit test fails |
| Import message (browser) | "Nothing was imported" removed | the new `backup-import.spec.ts` test fails |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 51 files, 746 tests passed (743 before; +2 in `backupImportValidation.test.ts`, +1 in `routeDefinitionService.test.ts`).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 148 passed, 0 failed (4.7 minutes); 146 before plus 2 new tests. No existing spec changed. No `test.fail`, `test.skip`, or `test.fixme`. `unified-action-layer.spec.ts:139` passed.
- New browser tests, stress run `--repeat-each=10 --workers=8`: `deletion-reviews.spec.ts` (all 6 tests) 60 of 60 passed; the new `backup-import.spec.ts` test 10 of 10 passed.
- `pnpm build`: succeeds, no chunk warning. Bundle `index-DO8O5EIH.js` 805.44 kB (810.48 kB before; the removed mutators).
- No visual change: the one UI edit passes a token to an existing call.

### Hand-offs and residual risks

- A Pattern deletion dialog that was open when the data changed closes and shows the error banner, like the Route, Scenario, and Project dialogs. The Runtime profile and Trips dialogs keep their old review (U05 hand-off); not changed here.
- `makePatternPoint` (`src/domain/commands.ts`) has no caller left outside its own re-export. It is domain code and harmless; remove it in a later cleanup if wanted.
- The fix log entries above (P09, 4G) still describe the mutators as present; they are history and are not edited.

## U08: Recalculation dialog at capacity

- Date: 2026-10-23. Sitting 4K part 1. Model: Opus (main session). No sub-agents.
- Type: UI. Severity: S3. Sol-class.
- Commit: `U08_HASH`.

### Issues fixed

| Register | Finding | Severity | What was wrong |
| --- | --- | --- | --- |
| I-096 | 6-005 | S3 | "Regenerate selected" on a 500-row Direction table took about 2.5 s to show its review and as long to apply it (review measurement, quirks mode). The dialog built one anchor list per Trip holding every point of its Pattern (14,431 options, 20,217 elements at 480 rows), and the review read the Pattern, the Runtime assignment, and the Runtime profile from IndexedDB once per Trip, one after another; the apply runs the review again. |
| (none) | found in this package's visual check | S3 | Two layout defects of the dialog, present before U08 (screenshots below): at 1024 px the dialog stayed 1,320 px wide, so Cancel and "Regenerate trips" were off the screen; and the table area inherited the dialogs' `display: flex; justify-content: end`, so the 1,300 px table overflowed 18 px to the left, where it cannot be scrolled to (the Anchor header read "chor" and the lists were cut). |

Capacity restore (1.9 s, one-time) is out of scope, as the package states.

### Decisions

- No user decision was needed. The anchor control stays a native select with the same label, the same choices, and the same keyboard behavior; only the moment its options are built changes. No interaction or visual design was invented: the alternatives considered (a virtualized table, rendering the select only on the rows in view, or a separate "change anchor" button per row) change what the planner sees or does and were rejected for that reason.
- The capacity fixture is `capacityBackup({ allOutbound: true, calculationMethod: 'blendSegments' })`: one Direction table of 500 Trips per service day, of which 480 have changed runtimes and are offered for regeneration. This is the fixture of the review's measurement.

### What changed

- `src/ui/App.tsx` (Regenerate dialog only):
  - New `AnchorSelect`: a native select that renders only its chosen option until the planner focuses it or presses on it, then every point of the Trip's Pattern. React adds the options inside the pointer-down or focus event, before the browser opens the list. Before: 30 options in each of 480 lists. After: one option per list until it is opened.
  - The rows read their Trip, Pattern, node names, revised times, band selection, nearest connection, and findings from maps keyed by id, built once per review, instead of scanning the arrays once per row.
- `src/application/tripGenerationService.ts` (hand-off: not an owned file; the minimum change): `previewRecalculateTrips` resolves the Pattern, assignment, and profile once per Scenario, service day, and Pattern, not once per Trip. A failed resolution still fails each of its Trips with the same finding. The source signature is unchanged (the same records are signed).
- `src/styles.css` (Regenerate dialog only): `max-width: calc(100vw - 32px)` on the dialog, and `display: block` on its table area.
- `architecture_overview.md`: one sentence on how the regeneration review stays fast at 500 Trips.

### Timing (production build, capacity fixture, 480 Trips, 1600 x 1000 window, 5 runs each)

Measured in the page, from the menu click until "Regenerate trips" is enabled (review), and from its click until the dialog is gone after the Trips table reloaded (apply). Built with `pnpm exec vite build` into the scratchpad and served by `vite preview`.

| | Review (ms) | Apply (ms) | Options in the dialog | Elements in the dialog |
| --- | --- | --- | --- | --- |
| Before (`origin/main` 3179991) | 1,071; 1,109; 1,043; 1,300; 1,109 | 1,034; 918; 954; 1,072; 1,019 | 14,431 | 20,217 |
| After | 431; 407; 461; 410; 417 | 556; 580; 562; 566; 587 | 511 | 6,297 |

The review's own measurement (2.47 s and 2.54 s) was taken in quirks mode before U01 and the earlier packages; on today's `main` the same path took about 1.0 to 1.6 s. A phase split of the after build: the service review takes about 165 to 220 ms, the apply's service call (which reviews again, then writes) about 410 to 670 ms, and the Trips reload about 170 to 190 ms. Both now meet the 1 s criterion with margin.

### Tests added

- `src/application/authoritativeTripService.test.ts`: "reads the Pattern, assignment, and profile once per Pattern and service day when many Trips are reviewed (U08, I-096)". 50 Trips; the review reads the Pattern twice (one resolution, one connection review), the assignments once, and the profile once; the apply doubles each. Failed on the old code (51, 50, 50 reads).
- New `tests/ui/recalculation-capacity.spec.ts` (real app, capacity fixture, 3 tests):
  - 480 rows: one option per anchor list, at most 8 Pattern reads in IndexedDB during the review (481 before), a coarse 10 s limit on the development server, and the apply closes the dialog. Failed on the old code (14,400 options).
  - Anchor selection for every Trip: at the first, middle, and last rows a real mouse click fills the list with all 30 points ("First departure" first, "Last timepoint" last); focusing a list by keyboard fills it and ArrowDown picks "Stop 1"; the changed anchor starts a new review that can be applied; choosing "Last timepoint" on the last row and the bulk "Last timepoint" button reach every Trip. Failed on the old code (30 options on a closed list).
  - At 1024 px: the dialog lies inside the window, Cancel and "Regenerate trips" are fully visible, and the table starts at the left edge of its scrolling area. Failed on the old styles (dialog right edge 1,346 px).
- No existing assertion was changed.

### Deliberate breaks (each applied, run, and restored from a saved copy)

| Test group | Deliberate break | Result |
| --- | --- | --- |
| Service reads | the per-Pattern cache removed (old `tripGenerationService.ts`) | the new unit test fails (51, 50, 50 reads) |
| Anchor lists | `onFocus` and `onPointerDown` removed from `AnchorSelect` (lists never fill) | the anchor-selection browser test fails (expected 30 options, received 1) |
| Dialog width | the `max-width` and `display: block` rules removed (old `styles.css`) | the 1024 px test fails (right edge 1,346) |
| Table edge | only `display: block` removed | the 1024 px test fails (table left edge -312 against 35) |

### Verification run

- `pnpm typecheck`: clean.
- `pnpm test`: 51 files, 747 tests passed (746 before; +1).
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`: 151 passed, 0 failed (3.5 minutes); 148 before plus 3 new tests. No `test.fail`, `test.skip`, or `test.fixme`. `unified-action-layer.spec.ts:139` passed.
- New browser tests, stress run `--repeat-each=10 --workers=8`: 30 of 30 passed.
- `pnpm build`: succeeds. Bundle `index--t3h4Nml.js` 806.22 kB (805.44 kB before).
- Visual check (production build, capacity fixture), images in the session scratchpad only, not committed:
  - `/tmp/claude-0/-home-user-transit-costing-tool/78c7fbd5-e401-5ce8-811b-ff376540b588/scratchpad/u08-recalculate-1024.png` and `/tmp/claude-0/-home-user-transit-costing-tool/78c7fbd5-e401-5ce8-811b-ff376540b588/scratchpad/u08-recalculate-1024-anchor-changed.png`: the dialog fits the window; the full bulk row, the Trip and Anchor columns, and Cancel and "Regenerate trips" are visible; the table scrolls sideways for the later columns; after ArrowDown the second row reads "Stop 1" with a focus ring and its fixed time 5:26.
  - `/tmp/claude-0/-home-user-transit-costing-tool/78c7fbd5-e401-5ce8-811b-ff376540b588/scratchpad/u08-recalculate-1440.png` and `/tmp/claude-0/-home-user-transit-costing-tool/78c7fbd5-e401-5ce8-811b-ff376540b588/scratchpad/u08-recalculate-1440-anchor-changed.png`: all ten columns visible, the Anchor header and lists no longer cut at the left.
  - Before, for comparison: `/tmp/claude-0/-home-user-transit-costing-tool/78c7fbd5-e401-5ce8-811b-ff376540b588/scratchpad/before/u08-recalculate-1024.png` (dialog wider than the window, no buttons visible, "chor" header) and `/tmp/claude-0/-home-user-transit-costing-tool/78c7fbd5-e401-5ce8-811b-ff376540b588/scratchpad/before/u08-recalculate-1440.png`.

### Hand-offs and residual risks

- `tripGenerationService.ts` is not owned by U08; the change is limited to `previewRecalculateTrips` and is recorded here.
- A screen reader may announce a closed anchor list as "1 of 1" on its first focus, before React fills it; the list is full when the planner opens it or moves with the arrows. Not verified with a screen reader.
- A list stays full after it was opened once; at most the lists the planner touched hold all their points.
- The apply still runs the review a second time to check that nothing changed (P04/P07 design); that is about half of the apply time.
