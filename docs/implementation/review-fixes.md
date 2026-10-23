# Code Review Fix Log

## Next sitting

**Sitting 4E: P09 (Application validation and deletion reviews), P10 (Save status and local-data protection), P11 (Blocking and Costing read paths).** Main session: Sonnet. No sub-agents: none of these packages is S0 or S1 (sitting plan). Run them in this order: P09 depends on P01 and P07, P10 on P02 and P09, P11 on P10.

- Work branch: `claude/stage-4e-review-fixes`, created from current `origin/main`.
- Prerequisite: the sitting 4D pull request (branch `claude/stage-4d-review-fixes`) and the follow-up that records the Option B decision (commit `9f863d9`) must be merged into `main`. If either is not, stop and ask the user. Start 4E from current `origin/main`.
- State after 4D: the full browser suite is green and stays green. 61 tests, 61 passed; no `test.fail`, `test.skip`, or `test.fixme`. Every later package must keep 0 failures (`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`). Unit tests: 33 files, 420 tests, about 9 s. Bundle after P08: `index-VVj0arcS.js` 772.60 kB.
- New in 4D that 4E relies on:
  - Unit tests run on `fake-indexeddb` (`vitest.config.ts`). `src/persistence/repositoryContract.test.ts` runs each test against both repositories; any new repository method goes into both repositories and into that suite. Both repositories return rows in primary-key order, which is random for generated ids: do not assert list order in a test (Decision 0040; `codex.md` "Unit tests that need IndexedDB"). P09's deletion review tokens and P10's save publisher may add repository methods, and `ports.ts` is theirs but the repositories are not on their owned lists: record the hand-off.
  - `TripGenerationService` has `inspectStaleTrips` (stale Trips plus findings), `TripPatternChangeReview` (signed review), and a Trips CSV signature that covers Patterns (P07). `updateServiceDay` and the other whole-Scenario writes already re-read stored data (P01).
- Browser-test helpers (all in `tests/ui/support/`): `dexieEnv.ts` (`runInPage`, `seedSnapshot`: real IndexedDB from a spec), `goldenFixture.ts` (the Federal BRT project), and from 4C `tripsWorkspace.ts` (`createRouteWithPattern`, `createShiftReadySchedule`, `openGoldenTrips`, `settleFrames`). New browser specs should use them. `createRouteWithPattern` creates the Default Runtime profile itself, before the Trips tab first mounts, to avoid the race in hand-off 1 below; do not remove that step until the race is fixed.
- P09 specifics: `rebalanceDependentService` in `routeDefinitionService.ts` passes only the rebalanced profiles to `rebalanceTripForPattern`, which infers "was current" as `recorded === revision - 1` (P07 hand-off). If P09 changes that call, pass the pre-edit profiles. Acceptance criterion 3 makes deletions take a required review token, so the deletion callers in `App.tsx` must pass the token from the preview they already show: wire one call per caller without changing layout or interaction, and record it as a hand-off. P09 also provides the query U07 needs for I-041 (every service day that shares a Runtime profile). The Runtime first-visit race in the carried-forward decision below is P09's if the user assigns it.
- P10 specifics: the quota simulation is `p6-quota.spec.ts` in the review's golden folder; port it with `tests/ui/support/`.
- P11 specifics: `main.tsx` holds the costing context builder to move; the two capacity specs are `p6-capacity-latency.spec.ts` and `p6-costing-timing.spec.ts` (golden). `BlockingWorkspace.tsx` (the classification call only) and `CostingWorkspace.tsx` (port calls only) are the only UI files.
- Hand-offs from 4D for later sittings (details in the P06 to P08 entries):
  - **Decided by the user on 2026-10-23 (Option B), for U07 (sitting 4I).** Under a segment-start or blended profile, an anchor that fits two first departures is rejected and the candidates are listed (user decision 3). A planner cannot pick one of the listed candidates for those methods; Decision 0031 keeps manual band override for single-band profiles only. The Recalculate dialog must therefore hide its band picker for segment-start and blended Trips, say plainly that the fixed time can be reached two ways, and rely on the options it already has: "Use first departure for this trip", choosing another anchor, or revising the bands. No domain change is needed. See "Added acceptance criteria" below and the Decision 0031 addendum.
  - U07: the React error boundary; user-facing text for `tripShift.timeBeforeServiceDay` and for the findings of `inspectStaleTrips`.
  - P16: the golden "DEFECT 2-007" test (gap-midpoint tie between `segmentStart` and blend) was not ported with the `segmentStart` matrix.
  - Not covered by the contract suite: the legacy generation-set methods and `saveBlocks`.
- **Decision for the user (found in 4C, not in the register).** Two app behaviors surfaced while making the browser suite reliable; see "Residual risks, hand-offs, and findings" in the P05 entry. (1) `ensureDefaultRuntimeProfile` is a non-atomic check-then-write that runs twice at once on the first visit to Trips (React `StrictMode` in development; also after a Runtime save): it can store duplicate Runtime assignments (8 instead of 4), show "Duplicate runtime assignment", and reset the Runtime editor draft. Suggested owner: P09 (owns `routeDefinitionService.ts`), with the single-flight load in `App.tsx` going to U07. (2) After a Runtime profile is saved, the Trips table keeps the profiles it loaded earlier, so Show runtime bands shades nothing until a reload. Suggested owner: U07 (or P15). Neither blocks P06 to P08.
  - Status after 4D: unchanged by P06 to P08. The first behavior is P09's if assigned, with the single-flight load in `App.tsx` going to U07; the second is U07's or P15's.
- Still carried forward from 4B, unchanged: enforce Block label uniqueness when a Block is created or renamed (Decision 0039), as an added acceptance criterion of Package P14 (sitting 4F), with a proposed default label of the first free "Block <n>"; clean-up of placeholder Blocks already stored in databases that imported version 3 and 4 files (no owner yet); presenting the import report and recovery findings (U02).
- Tests deferred to later packages (all recorded in the P05 entry): focus trap, Escape, and focus return (U04's `keyboard.spec.ts`); a unit test for `calculateTimepointHeadways` (P15); Annual cost visible without table scroll at 1024 px (U06).
- Review documents: read them from the review branch with `git show origin/claude/upbeat-ritchie-51mpy5:docs/review/<file>`. Never copy `docs/review/` into the work branch.

### Added acceptance criteria

Items that the user assigned to later packages. They are added to those packages' acceptance criteria and stay here, unchanged, until the owning package lands. The bullets above that describe them are carried forward verbatim.

- **P09 (sitting 4E), the service part of the Runtime first-visit race.** `ensureDefaultRuntimeProfile` is a check-then-write that is not atomic, and two overlapping calls can store duplicate Runtime assignments. Make it idempotent: one check-and-write in a single transaction, so two calls at once leave one Default profile and one assignment per standard Service day, and "Duplicate runtime assignment" cannot appear. Add a test that runs two calls at the same time against both repositories. P09 does not change `App.tsx`. Do not remove the up-front Default Runtime profile step or the reload after the Runtime save in `tests/ui/support/tripsWorkspace.ts`; U07 removes them.
- **P14 (sitting 4F):** enforce Block label uniqueness when a Block is created or renamed (Decision 0039), with a proposed default label of the first free "Block <n>".
- **U07 (sitting 4I):**
  - the single-flight Runtime load in `App.tsx` (the other half of the race above), then remove the two test-helper steps named above;
  - the Trips table must reload Runtime profiles after a Runtime profile is saved, so Show runtime bands shades without a page reload (the second behavior in the 4C decision bullet);
  - the Recalculate dialog hides the band picker for segment-start and blended Trips (Option B, decided 2026-10-23).

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
