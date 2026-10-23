# Package F1: UI follow-up fixes

- Approved by the user on 2026-10-23 (hand-offs 1, 2, 4, 5, and 7 of the post-Stage-4 hand-off list).
- Model: Sonnet (main session). Class: structural with precise UI wiring: reuse existing dialogs, banners, and notices; do not invent new components or styles.
- Branch: `claude/stage-4k-review-fixes`. The user may have merged it; if `origin/main` contains the U10 commit (`c1a6177`) and this branch carries nothing that `main` lacks, restart the branch from `origin/main` with the same name. Never push to another branch. Do not open a pull request.

## Read first

1. `AGENTS.md`, `codex.md`, `architecture_overview.md`.
2. `docs/implementation/review-fixes.md`: the Next sitting note and "Standing rules for every sitting" (rules 1 to 10 apply, except that no review documents are needed).
3. The U05, U07, U09, U10, and P10 entries in the fix log, for the code each item touches.

## Items

### 1. Add-trip row draft is dropped on a scope change

- Now: an unsaved Add-trip row (`draftTrip` in `TripsWorkspace`, `src/ui/App.tsx`) disappears when the service day, Direction, Trip Profile, or tab changes.
- Required: when a draft row has a Pattern or a first time entered, a scope change asks first through the existing discard question used for the Runtime editor and the staged Shift (`onRegisterNavigationGuard`, the U03 pattern): **Discard** continues and drops the draft; **Cancel** stays. A draft with nothing entered is dropped silently. Order with other open drafts: Runtime question first, then the staged Shift, then the Add-trip draft (one question per press, as now).
- Acceptance: a browser test for each of the four scope changes with an entered draft (asks), Cancel keeps the draft, Discard drops it, and an empty draft does not ask. Update the "Unsaved input is never dropped silently" bullet in `docs/ui-conventions.md`.

### 2. A Pattern draft may not open right after "Save nodes"

- Now: `tests/ui/route-editing.spec.ts:6` failed once (D01 entry): the click on **Add pattern** right after the second **Save nodes** opened no draft. Probable cause: the save's reload (`acceptRouteEdit`) lands after the click and replaces the new draft (finding L-16).
- Required: find the cause in the app first (reproduce with a slowed save, for example a delayed repository write in a unit test or a throttled browser run). Fix it in the app: either keep a Pattern draft that was created after the save started, or disable **Add pattern** while a Node or Pattern save is in flight. Choose the one that does not change the layout; record why.
- Then make `route-editing.spec.ts:6` wait for the save to finish the same way `tests/ui/support/tripsWorkspace.ts` does. Do not weaken an assertion.
- Acceptance: a test that fails on the old code with the slowed save; `route-editing.spec.ts` 100 of 100 in `--repeat-each=100 --workers=16`.

### 4. Delete dialogs keep the old review after a refusal

- Now: when the Runtime profile delete or the Trips delete (`tripDeletion`) is refused because the data changed (stale review token, Decision 0041), the dialog stays open with the old impact.
- Required: close the dialog and show the refusal in the error banner, exactly as the Route, Scenario, Project, and Pattern delete dialogs do. Nothing is deleted.
- Acceptance: one browser test per dialog in `tests/ui/deletion-reviews.spec.ts`.

### 5. Impact dialogs leave things out

- Node editor save review: list `nonRevenueImpact` (`src/application/routeDefinitionService.ts`, `blockIds` and `removedActivityCount`) as one line, for example "Removes 3 pull-out, pull-in, or deadhead activities in 2 Blocks." Show nothing when the count is 0.
- Trip profile delete confirmation: state `blockingScenarioCount` (`src/application/tripGenerationService.ts`), for example "Also deletes 2 Blocking Scenarios and their Blocks." Show nothing when 0. Check that the delete really removes them before you word it; if it does not, word it to match the code and record that.
- Use the existing impact-list markup of each dialog. Singular and plural wording.
- Acceptance: browser tests that show each line with a non-zero count and its absence at 0.

### 7. Storage protection answer is not shown

- Now: `getLocalDataProtection()` (`src/application/saveStatus.ts`) knows whether the browser granted persistent storage; the Project menu shows only the last backup time (U02, P10).
- Required: when the answer is "not granted" (refused or unsupported), the Project menu shows one more disabled info line under the last backup time: "This browser may clear local data. Export backups regularly." When granted or not yet known, nothing is added. Reuse the existing last-backup line's markup.
- Acceptance: a browser test that stubs `navigator.storage.persist`/`persisted` to false (shows the line) and to true (no line). Update `docs/ui-conventions.md` and the Decision 0001 amendment text if it describes what is shown.

## Verification and records

- Standing rule 5 regression after the package (typecheck, unit tests, full browser suite, build); standing rule 7 proof for each new test (fails first, one deliberate break per test group, `--repeat-each=10 --workers=8`).
- Visual check at 1024 and 1440 px of each changed dialog and the Project menu; screenshots in the session scratchpad only, paths in the fix log.
- One commit (or a short series) plus a hash-record commit. Fix log entry "F1: UI follow-up fixes" before the "Register map" section; mark items 1, 2, 4, 5, 7 done in the "Post-Stage-4 hand-offs" list of the Next sitting note; replace the Next sitting note header and the `codex.md` status paragraph. Push. Report and stop; F2 is a separate session.
