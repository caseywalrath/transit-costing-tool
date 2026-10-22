# Code Review Fix Packages (Stage 4 plan)

- Status: Stage 3B output, 2026-10-22. Decisions C1–C8 approved by the user on 2026-10-22 (option (a) each); C7 moved X01 to follow P05. Each Stage 4 package still starts only on user request (plan Section 9 step 6).
- Input: `docs/review/issue-register.md` (issue IDs, severities, root-cause groups) and `docs/review/user-decisions.md` (decisions 1–18 and C1–C8).
- Every open issue (I-001 to I-101, with I-074 split into I-074a, b, and c) belongs to exactly one package. I-102 is closed.

## Rules that apply to every package

These restate plan Sections 8.3 and 9, and `AGENTS.md`.

1. **Type.** A package is structural, UI/UX, test-only, build, or docs. Structural packages may wire an existing UI port (for example, change one call) without changing layout, states, or interaction. A UI package must not add business rules: it consumes application ports.
2. **Branch.** Each package runs on its own branch from current `main` (plan Section 9). Never two packages at once on overlapping owned files. "Owned files" lists every file the package may change; changing any other file needs a recorded hand-off.
3. **Test first.** Write a failing test from the register evidence before the fix, and commit it with the fix. The review reproductions in `docs/review/golden/` are the source; port the relevant one into `src/**/*.test.ts` or `tests/ui/` (decision C6). Do not change files in `docs/review/`.
4. **Dexie-backed tests before P06.** Until P06 adds an IndexedDB test environment to Vitest, a persistence test that needs real IndexedDB is a Playwright spec under `tests/ui/` that imports `src/` modules from the Vite dev server, as `docs/review/golden/p3-env.ts` does.
5. **Verification** (`AGENTS.md`):
   - Domain or persistence logic: focused tests and `pnpm typecheck`.
   - UI behavior: `pnpm typecheck`, the relevant Playwright tests, `pnpm build`, and visual inspection at 1024 px and 1440 px.
   - Migration or export: an export → import round trip and schema-version validation.
6. **Full regression** (plan Section 9 step 4): `pnpm typecheck`, `pnpm test`, the full Playwright suite, and `pnpm build`. Before P05 lands, the Playwright suite has 7 known failures (I-006). A package before P05 passes when it adds no new failure and the same 7 tests fail for the same reasons.
7. **Documentation.** Fix documentation drift in the package that changes the related code. Any change to system structure, data flow, persistence, or major behavior updates `architecture_overview.md` and adds a decision record in `docs/decisions/`.
8. **Gate.** Each package ends with its verification result, an adversarial re-read of its own diff ("what could still be wrong"), and a recommendation for the next package and model. Do not start the next package automatically. A user-verification gate sits between a structural package and the UI package that consumes it (Decision 0005).

## Model classes

- **Luna-class:** bounded structural work after the architecture is settled, and simple UI work that reuses existing components when the package gives placement, states, interaction, keyboard and accessibility behavior, and acceptance criteria. It must not make visual design, layout, interaction, or accessibility decisions.
- **Sol-class:** novel, complex, interaction-heavy, or visually distinctive UI work that needs design, usability, accessibility, or layout judgment.
- **Primary agent (Opus-class):** architecture, integration review, cross-layer consistency, and final verification of every package.

## Package order

| Order | Package | Type | Class | Issues | Highest | Depends on |
| ---: | --- | --- | --- | ---: | --- | --- |
| 1 | P01 Scenario-wide writes re-read current data | Structural | Luna | 3 | S0 | — |
| 2 | P02 Single active tab | Structural | Luna | 1 | S0 | P01 |
| 3 | P03 Scenario duplication remap and recovery | Structural | Luna | 2 | S1 | decision C8 |
| 4 | P04 Backup import normalization and validation | Structural | Luna | 3 | S1 | P03 |
| 5 | P05 Browser test-suite repair | Test-only | Luna | 4 | S2 | — |
| 6 | X01 Dead code removal | Structural | Luna | 3 | S3 | P01, P02, P05 (decision C7) |
| 7 | P06 IndexedDB test environment and repository parity | Structural (test) | Luna | 4 | S2 | P01, P02 |
| 8 | P07 Trip stale checks and runtime revisions | Structural | Luna | 6 | S2 | P06 |
| 9 | P08 Trip generation and shift bounds | Structural | Luna | 4 | S2 | — |
| 10 | P09 Application validation and deletion reviews | Structural | Luna | 5 | S2 | P01, P07 |
| 11 | P10 Save status and local-data protection | Structural | Luna | 2 | S2 | P02, P09 |
| 12 | P11 Blocking and Costing read paths | Structural | Luna | 4 | S2 | P10 |
| 13 | P12 Blocking calculation rules and finding shape | Structural | Luna | 3 | S2 | decision C2 |
| 14 | P13 CSV serializers | Structural | Luna | 4 | S2 | P07 |
| 15 | P14 Blocking rules into `blockingService` | Structural | Luna | 3 | S2 | P11, P12 |
| 16 | B01 CI, typecheck scope, and dependencies | Build | Luna | 6 | S2 | P05, decision C4 |
| 17 | U01 Standards-mode `index.html` | UI/build | Luna | 1 | S2 | P05 |
| 18 | U02 Data-safety and error presentation | UI | Luna | 4 | S2 | P02, P10, U01 |
| 19 | U03 Drafts, inputs, and preferences | UI | Luna | 5 | S2 | U02 |
| 20 | U04 Dialogs, focus, and keyboard | UI | Luna | 4 | S2 | U03 |
| 21 | U05 Blocking presentation and destructive actions | UI | Luna | 6 | S2 | P14, U04 |
| 22 | U06 Costing and service-day presentation | UI | Luna | 4 | S2 | P09, P11, U04, decision C3 |
| 23 | U07 Trips and Runtime presentation | UI | Luna | 6 | S2 | P08, P09, U04 |
| 24 | P15 Trips and Runtime rules out of `App.tsx` | Structural | Luna | 1 | S3 | U07, X01 |
| 25 | P16 Domain precision and message polish | Structural | Luna | 5 | S3 | P07, P08, P12 |
| 26 | U08 Recalculation dialog at capacity | UI | Sol | 1 | S3 | U07 |
| 27 | D01 Documentation-only remainder | Docs | Luna | 9 | S3 | all others |

Ordering notes:

- The plan's order is S0, S1, test-suite repair, S2, S3, documentation. P05 has no code dependency and may run in parallel with P01 to P04 on its own branch, because it owns only `tests/ui/` and `tests/fixtures/`.
- P06 follows the S0 packages because it changes `dexieRepository.ts` and `inMemoryRepository.ts`, which P01 and P02 own.
- Every UI package from U02 to U07 changes `src/ui/App.tsx`, so they run one after another in the order shown. U01 goes first because quirks mode changes every layout measurement (I-038).
- X01 runs right after P05 (decision C7): it is mechanical, removes the latent S0 path `deleteNode` (3-008), and shrinks `App.tsx` before the S2 packages edit it. It follows P01 and P02 because it deletes methods from services they own.

---

## P01: Scenario-wide writes re-read current data

- Type: structural. Class: Luna-class.
- Issues: I-001 (4-001, S0), I-016 (3-009, S2; decision 6 places it in the first structural package), I-025 (4-009, S2).
- Owned files: `src/application/routeDefinitionService.ts`, `src/application/tripGenerationService.ts`, `src/persistence/dexieRepository.ts`, `src/persistence/inMemoryRepository.ts`, `src/application/routeDefinitionService.test.ts`, `src/application/tripGenerationService.test.ts`, new `tests/ui/scenario-write-safety.spec.ts`, `architecture_overview.md`, new decision record.
- Required design (settled by the lead; record it in the decision record): `updateServiceDay`, `renameScenario`, `addRoute`, and `duplicateRoute` no longer pass the caller's full Scenario copy to `saveScenarioRecords`. Each one reads the current stored records inside its write transaction and changes only its own records. `duplicateScenario` reads the stored Scenario, not the caller's copy. `updateServiceDay` with no field change writes nothing.
- Acceptance criteria:
  1. The `docs/review/golden/p4-stale-records.spec.ts` sequences pass as normal tests: after Build Trips, a Trip time edit, a new Block, and a Runtime profile rename, a Service day name blur keeps 987 Trips, the edited time, the Block, and the new name, also after reload.
  2. The same holds for Scenario rename, New route, and Duplicate route (these were traced only; the new test must drive each).
  3. Duplicate scenario copies the current stored Trips and Blocks.
  4. Runtime "Copy from day" succeeds on IndexedDB in both `independent` and `shared` modes (the `p3-runtimecopy-undo.spec.ts` 3-009 case passes). The transaction lists `patterns` and `serviceDays`.
  5. Generating Trips for a Trip Profile that does not exist is rejected inside the write, with no Trip stored (`p4-selection.spec.ts` B1-08 data assertion).
- Test first: port the A1-01 tests from `p4-stale-preview.golden.test.ts` (in-memory) and the `p4-stale-records.spec.ts` browser sequence.
- Verification: persistence rules (focused tests, typecheck) plus the browser spec on IndexedDB; full regression per rule 6.
- Documentation: overview persistence section (which writes are whole-Scenario and which are per-record); new decision record "Scenario-wide writes re-read stored data".

## P02: Single active tab

- Type: structural. Class: Luna-class.
- Issues: I-002 (4-002 and 4-021, S0). Implements decision 10.
- Owned files: new `src/persistence/tabGuard.ts`, `src/persistence/database.ts`, `src/persistence/dexieRepository.ts`, `src/persistence/blockingRepository.ts`, `src/application/costingService.ts`, `src/main.tsx`, `src/application/ports.ts`, new `tests/ui/single-tab.spec.ts`, `architecture_overview.md`, `docs/decisions/0001-*.md` or a new decision record.
- Required design: one tab holds a Web Locks lock (fallback: `BroadcastChannel` election). Every repository write checks the guard first and rejects with a typed `ReadOnlySessionError` in a tab that does not hold it. A Dexie `versionchange` event closes the database in older tabs and switches them to read-only. A read-only status is exposed through a port for U02. In this package the existing error banner shows the rejection; no new UI.
- Acceptance criteria:
  1. Every scenario in `p4-concurrency.spec.ts` and `p4-selection.spec.ts` (B1-01 to B1-04, B1-07, B1-08) ends with tab B's data intact. Tab A's write is rejected with a user-safe message and writes nothing.
  2. Closing the active tab lets another open tab become active after reload, without data loss.
  3. B1-09: a tab on an older schema stops writing after another tab upgrades the database.
  4. The Blocking stale-source control still works in the active tab.
- Test first: port B1-01 to B1-09 as normal Playwright tests.
- Verification: persistence rules; full regression.
- Documentation: overview (single-tab model); decision record recording decision 10 and that 4-021 (stale checks outside transactions) is accepted under a single-writer model.

## P03: Scenario duplication remap and recovery

- Type: structural. Class: Luna-class.
- Issues: I-004 (3-002, S1), I-005 (3-006 and A-004, S1). Implements decision 4. Decision C8 governs copies whose source Scenario no longer exists.
- Owned files: `src/domain/project.ts`, `src/domain/project.test.ts`, new `src/domain/scenarioCopyRecovery.ts` and its test, `src/persistence/database.ts` (version 7 upgrade with no store change), `src/persistence/backup.ts` (only the call to the recovery during parse), `docs/data-schema.md` (migration history), `architecture_overview.md`, new decision record.
- Required design: `project.ts:222` applies the existing `nodeIds` map to `fromNodeId` and `toNodeId`, and keeps `tripProfileId` only on legacy Blocks without `blockingScenarioId`, remapped through `tripProfileIds`. Recovery: for each non-revenue activity whose Node ID belongs to another Scenario, map it to the copy's Node with the same Route, the same position in the Route's Node order, and the same name (3-006 option A). Run it once in a Dexie version 7 upgrade and in backup parsing, for files exported before the fix.
- Acceptance criteria:
  1. `copyReferences.golden.test.ts`: Scenario duplication has 0 references to the source (was 138).
  2. With two Trip Profiles and a Blocking Scenario on the non-first profile, `duplicateScenario` succeeds on in-memory and Dexie, and 0 copied normalized Blocks carry `tripProfileId`.
  3. In the `p3-a004-consequences` fixture, the copied deadhead Block is eligible, as the source is.
  4. Recovery: a database seeded with an already-duplicated Scenario (138 leaking references) has 0 after upgrade. A backup file with the same content has 0 after import. Records outside non-revenue activities are byte-equal before and after.
  5. Copies whose source no longer exists (decision C8): pull-out To, pull-in From, and deadhead From/To are inferred from the adjacent Trip endpoints; each garage end that cannot be inferred (pull-out From, pull-in To) gets a finding naming the Block.
- Test first: un-mark the A-004, 3-002, and 3-006 golden reproductions and port them.
- Verification: domain and migration rules: round trip of the recovered backup; schema version 7 asserted; full regression.
- Documentation: data-schema migration history (version 7), overview, decision record.

## P04: Backup import normalization and validation

- Type: structural. Class: Luna-class.
- Issues: I-003 (3-001, S1), I-010 (1-010, S2), I-017 (3-005, S2).
- Owned files: `src/persistence/backup.ts`, `src/persistence/backup.test.ts`, `src/persistence/backupRepository.ts`, `src/persistence/backupRepository.test.ts`, `docs/data-schema.md` (import rules).
- Acceptance criteria:
  1. A backup with two Trip Profiles and a Blocking Scenario on each restores through the UI import path, with every Block's ownership unchanged (`p3-multiprofile.golden.test.ts` 3-001 cases).
  2. `export(import(golden))` equals the original for Blocks: normalized Blocks gain no `tripProfileId`.
  3. Version 3 and 4 placeholder Blocks are discarded on import (D0019-13), and import reports the discarded count.
  4. Every "accepted" row of the `phase-3.md` Section 4 case table is rejected before any write, with a user-safe message. The two raw `TypeError` paths give a user-safe message. Valid backups v1–v6 still import.
- Test first: un-mark `p3-multiprofile`, `p3-backup-versions`, `p3-import-fuzz`, and `p1-v4PlaceholderBlocks` reproductions and port them.
- Verification: migration and export rules: round trip for the golden file and the two-profile file; schema version 6 unchanged; full regression.
- Documentation: data-schema import rules (placeholder discard, validation list).

## P05: Browser test-suite repair

- Type: test-only. Class: Luna-class.
- Issues: I-006 (A-001, 5-001), I-029 (5-002), I-084 (5-003), I-085 (5-017).
- Owned files: `tests/ui/*.spec.ts`, `tests/fixtures/*.html`.
- Acceptance criteria:
  1. The full Playwright suite passes with 0 failures and no `test.fail`.
  2. The label helper uses `Copy Trips from day…`, and `createShiftReadySchedule` waits for `Add node` (the L-16 race).
  3. `trip-table-layout.spec.ts:40` and `unified-action-layer.spec.ts:169` assert the page-level duplicate header and page-scroll restoration (D0035-05), not a nested scroller.
  4. The three fixture layout tests (5-002) assert the real app, or are reduced to the geometry that D0013 permits and say so in a comment.
  5. New tests cover rounding of displayed times, Show headways, band shading, overlap warnings, scroll restoration, and net-zero Shift discard (5-003), plus the weak assertions listed in 5-017.
- Test first: not applicable (the tests are the deliverable). Each rewritten test must fail when the behavior it covers is broken: show one deliberate break per new test in the package report.
- Verification: full Playwright suite three times with no flake; typecheck; build.
- Documentation: `phase-02r-trip-table-interchange-undo.md` Verification claim corrected.

## P06: IndexedDB test environment and repository parity

- Type: structural (test-first). Class: Luna-class.
- Issues: I-007 (A-002), I-008 (A-003, 3-014), I-020 (3-013), I-047 (A-007).
- Owned files: `package.json` and `pnpm-lock.yaml` (one dev dependency, `fake-indexeddb` or equivalent), `vitest.config.ts`, `src/persistence/repository.test.ts`, new `src/persistence/repositoryContract.test.ts`, `src/persistence/inMemoryRepository.ts`, `src/persistence/database.test.ts`, `tests/ui/database-migration.spec.ts`, `src/domain/runtime.test.ts`.
- Acceptance criteria:
  1. One contract suite runs against `InMemoryRouteDefinitionRepository` and `DexieRouteDefinitionRepository` and covers every row of the `phase-3.md` Section 7 parity table. The in-memory repository rejects a stale regeneration before-state, deletes a removed Scenario's service days and Routes, and returns the same order as Dexie.
  2. The migration unit test runs (no early return) and asserts Dexie version 6 (version 7 if P03 has landed). Per-version upgrades from seeded v1–v5 databases are tested and report the placeholder-Block discard count (D0019-12).
  3. `database-migration.spec.ts` seeds IndexedDB version 40 for Dexie version 4.
  4. The `segmentStart` boundary matrix from `p2-time-runtime.golden.test.ts` runs in `pnpm test`.
  5. Line coverage of `dexieRepository.ts` is above 0%; report the figure.
- Verification: persistence and migration rules; full regression.
- Documentation: `codex.md` verification notes for the new test environment, after it is verified.

## P07: Trip stale checks and runtime revisions

- Type: structural. Class: Luna-class.
- Issues: I-014 (2-004, 2-005), I-021 (4-003), I-022 (4-004), I-028 (4-019), I-065 (2-011), I-081 (4-024).
- Owned files: `src/domain/safeRouteEditing.ts`, `src/domain/runtime.ts`, `src/application/tripGenerationService.ts`, and their tests; `docs/decisions/0014-*.md` (addendum), `docs/domain-glossary.md` (revision wording).
- Acceptance criteria:
  1. After a deterministic route edit, a Trip keeps its previous revision unless the rebalanced profile reproduces its times, and a Trip that was stale before stays stale (2-004 and 2-005 reproductions).
  2. `changeTripPattern` rejects a review after the Trip or the target profile changed (A1-02).
  3. Trips CSV import rejects a row whose `tripId` belongs to another Direction (A1-03 plus the Stage 3A check: the Trip keeps its Pattern).
  4. The Trips CSV review signature covers Patterns (A1-04).
  5. A band label change does not change the calculation revision.
  6. `listStaleTrips` reports a calculation error as a finding instead of a silent stale flag, and has a `segmentStart` test.
- Verification: domain rules; full regression.
- Documentation: D0014-06 addendum for `segmentStart` profiles; glossary note that a band label is not a calculation input.

## P08: Trip generation and shift bounds

- Type: structural. Class: Luna-class.
- Issues: I-011 (2-001, 1-009), I-012 (2-002, 5-011), I-013 (2-003, 1-005; decision 3), I-064 (2-010).
- Owned files: `src/domain/trips.ts`, `src/domain/tripShift.ts`, their tests, `docs/decisions/0031-*.md`, `docs/ui-conventions.md` (line 68 only).
- Acceptance criteria:
  1. A Last Trip request producing more than 500 departures is rejected with `tripGeneration.tripCountTooLarge`.
  2. A shift that would move any time below 0:00 is rejected in the preview with `tripShift.timeBeforeServiceDay`; `validateTrip` rejects negative times. The staged −6-minute Shift no longer crashes the app (`p5-trip-shift-negative.spec.ts`).
  3. For `segmentStart` and blend profiles, an anchor with more than one valid departure raises the ambiguity error and lists the candidates, as single-band does (decision 3).
  4. A zero-second shift is a no-op and does not set `manuallyChangedFields`.
- Verification: domain rules; full regression.
- Documentation: D0031 addendum (segment-start and blend rule); `ui-conventions.md:68` states that the 500 limit applies to both limits. The React error boundary is U07's.

## P09: Application validation and deletion reviews

- Type: structural. Class: Luna-class.
- Issues: I-009 (A-005, 4-005), I-018 (3-007), I-027 (4-011, 4-012), I-052 (1-006), I-078 (4-020). Also provides the query that U07 needs for I-041.
- Owned files: `src/application/routeDefinitionService.ts`, `src/application/tripGenerationService.ts`, `src/application/ports.ts`, their tests, `architecture_overview.md`.
- Acceptance criteria:
  1. `updateServiceDay` rejects a total above 365, negative, fractional, and non-finite counts, and blank names, and trims names, returning field findings in the existing pattern (A1-05).
  2. Node deletion removes non-revenue activities that reference the deleted Node, and the preview reports the affected Blocks and activity count (3-007 reproduction).
  3. Trip Profile, Trips, Route, Scenario, Runtime profile, and Project deletions take a required review token that covers every record they delete; a stale token is rejected (A1-06, A1-07).
  4. `renameScenario` rejects a blank name.
  5. A query returns every service day that shares a Runtime profile (02R-AC18), for U07.
- Verification: application rules; full regression.
- Documentation: overview line 271 ("capped at 365") states the error rule.

## P10: Save status and local-data protection

- Type: structural. Class: Luna-class.
- Issues: I-023 (4-006; decision 11), I-045 (6-003; decision 16).
- Owned files: new `src/application/saveStatus.ts`, `src/application/routeDefinitionService.ts`, `src/application/tripGenerationService.ts`, `src/application/blockingService.ts`, `src/application/costingService.ts`, `src/main.tsx`, `src/application/ports.ts`, `docs/decisions/0001-*.md` or a new decision record.
- Acceptance criteria:
  1. Every write in the four services publishes saving, saved, and failed states through one publisher.
  2. After the first successful save, the app calls `navigator.storage.persist()` once and records the result.
  3. A `QuotaExceededError` maps to a typed error with the plain message "Browser storage is full. Export a backup, then free space." (simulated as in `p6-quota.spec.ts`).
  4. The time of the last JSON backup export is stored (non-authoritative, like selection state) and exposed through a port for U02.
- Verification: application rules plus the quota browser spec; full regression.
- Documentation: Decision 0001 amendment (decision 16), including the shared-origin risk (decision C5).

## P11: Blocking and Costing read paths

- Type: structural. Class: Luna-class.
- Issues: I-043 (6-001, 4-008), I-044 (6-002, structural part), I-074b (Costing items of 4-014), I-080 (4-023).
- Owned files: `src/application/blockingService.ts`, `src/application/costingService.ts`, `src/application/ports.ts`, `src/main.tsx` (moving the costing context builder into `src/application`), new `src/application/costingContext.ts` and test, `src/ui/BlockingWorkspace.tsx` (the classification call at `:195-202` only), `src/ui/CostingWorkspace.tsx` (replacing in-component rules with port calls only).
- Acceptance criteria:
  1. A batch `classifyInsertions` reads Trips and Patterns once. At capacity with 300 unassigned Trips, Assign is enabled within 1 s (`p6-capacity-latency.spec.ts` P6-S1-01).
  2. The costing context reads Trips and Patterns once per build and uses `summarizeBlockingScenario`. The capacity Costing estimate appears within 2 s (P6-S1-02).
  3. The costing context builder has unit tests with two Scenarios and two Trip Profiles.
  4. `CostingWorkspace.tsx` no longer calls `validateCostingAssumptions` or computes the day total, the 365 check, or the year list: it reads them from the port. The displayed values are unchanged.
- Verification: application rules plus the two capacity specs; full regression.
- Documentation: overview Costing data flow.

## P12: Blocking calculation rules and finding shape

- Type: structural. Class: Luna-class.
- Issues: I-015 (2-006; decision C2), I-060 (1-016, 2-015), I-066 (2-012; decision 8).
- Owned files: `src/domain/blocking.ts`, `src/domain/costing.ts`, `src/domain/validation.ts`, `src/domain/types.ts`, their tests, `architecture_overview.md` (validation section), `docs/data-schema.md` (finding shape).
- Acceptance criteria:
  1. Decision C2: an explicit-time deadhead outside [previous end, next start] gets a placement finding, and a pull-out ending after the first Trip start (or a pull-in starting before the last end) gets a boundary-overlap finding (S14 and S16 shapes).
  2. A Pattern whose total distance is 0 is treated as incomplete mileage (decision 8).
  3. `CostingFinding` uses the `ValidationFinding` shape; Blocking structural rejections throw a typed error that carries findings; the dead `validation.ts` `validateBlock` is removed.
  4. The 16 Blocking shapes and the golden reconciliation still pass unchanged except where criteria 1–2 change a status.
- Verification: domain rules; full regression.
- Documentation: overview and data-schema finding shape (OV-VAL-01, DS-25): record whether acknowledgment remains planned.

## P13: CSV serializers

- Type: structural. Class: Luna-class.
- Issues: I-019 (3-012), I-070 (3-010), I-071 (3-011; decision 5), I-073 (4-013; decision 12).
- Owned files: `src/persistence/csv.ts`, `src/ui/runtimePaste.ts`, `src/ui/tripTableCsv.ts` and `src/ui/csvDownload.ts` (moved to `src/application/`), their tests (moved with them), `src/ui/App.tsx` (import paths only), `architecture_overview.md`.
- Acceptance criteria:
  1. `toCsv` escapes header cells; Pattern and Node names with a comma or a double quote round-trip through the Trips CSV.
  2. `csvEscape` quotes a field containing a bare CR; both escapers use the same rule.
  3. Free-text cells (names, labels, notes) beginning with `=`, `+`, `-`, or `@` are prefixed with `'`; the Trips CSV and Runtime paste importers strip it. IDs, times, and numbers are never prefixed.
  4. No module in `src/ui` imports from `src/persistence` (import-graph check).
- Verification: export rules: CSV round trip with the `p3-csv.golden.test.ts` cases; full regression.
- Documentation: overview CSV rules (decision 5); OV-TECH-03 unchanged (decision 12).

## P14: Blocking rules into `blockingService`

- Type: structural. Class: Luna-class.
- Issues: I-024 (4-007), I-074a (Blocking items of 4-014), I-077 (4-018). Also provides the preview port that U05 needs for I-035.
- Owned files: `src/application/blockingService.ts`, `src/application/ports.ts`, `src/domain/blocking.ts`, their tests, `src/ui/BlockingWorkspace.tsx` (replacing in-component rules with port calls; no layout or interaction change).
- Acceptance criteria:
  1. Bulk deadhead apply runs in `blockingService` and adds a deadhead to every matching connection (5 matching Trips give 4 deadheads).
  2. A blank minutes field is rejected in both the single and bulk paths, and a blank layover amount is rejected.
  3. Reorder grouping, activity insertion, the ownership filter, and Layover % come from the application layer (the 4-014 Blocking list); displayed values are unchanged.
  4. `previewDeleteBlock` and `previewDeleteBlockingScenario` return impact counts before deletion.
- Verification: application rules plus `tests/ui/blocking-workspace.spec.ts`; full regression.
- Documentation: none beyond port comments.

## B01: CI, typecheck scope, and dependencies

- Type: build. Class: Luna-class.
- Issues: I-046 (6-004), I-097 (6-006, A-008), I-098 (6-007; decision 17), I-099 (6-009; decision 18), I-100 (6-010; decision C4), I-101 (6-011; decision C4).
- Owned files: new `.github/workflows/ci.yml`, `.github/workflows/deploy-pages.yml`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, new `.nvmrc`, `vite.config.ts`, `architecture_overview.md` (OV-TECH-01, OV-TECH-02), `codex.md` (verified commands).
- Acceptance criteria:
  1. A CI workflow runs on pull requests and pushes to `main`: install, typecheck, unit tests, build (the `phase-6.md` Section 3 proposal), plus a Playwright job, which is required because P05 has landed.
  2. Deployment runs only after CI passes.
  3. `pnpm typecheck` covers `tests/ui` and `playwright.config.ts`; `@types/node` is added for Node 22.
  4. Node 22 is pinned in CI, `engines`, `packageManager`, and `.nvmrc`.
  5. `zod` and `@tanstack/react-table` are removed; OV-TECH-01 and OV-TECH-02 record hand-written validation (decision 18).
  6. Decision C4: `vite` is updated within its range so that `pnpm audit` reports no `vite` advisory; `chunkSizeWarningLimit` is raised with a comment stating the reason. The `vitest` major upgrade is recorded as follow-up work, not done here.
- Verification: CI run on the package branch; full regression; `pnpm audit` before and after.

## U01: Standards-mode `index.html`

- Type: UI/build. Class: Luna-class.
- Issues: I-038 (5-013, 6-008).
- Owned files: `index.html`; layout baselines under `tests/ui/` only if a measured value changes.
- Acceptance criteria:
  1. `index.html` has `<!doctype html>`, `<html lang="en">`, `<meta charset="utf-8">`, a viewport meta, and `<title>Transit Costing Tool</title>`; `document.compatMode` is `CSS1Compat`.
  2. Table text renders at 14 px (`styles.css:1`).
  3. Every layout test passes, and screenshots of Route, Trips, Blocking, and Costing at 1024 px and 1440 px are inspected and attached to the package report. Any layout regression is listed, not fixed here.
- Verification: UI rules; full regression.

## U02: Data-safety and error presentation

- Type: UI. Class: Luna-class (reuses the existing notice banner and save-status indicator).
- Issues: I-039 (5-014), I-072 (3-015, 4-017), I-076 (4-016), I-095 (5-029). Also shows the P02 read-only status and the P10 last-backup time.
- Owned files: `src/ui/App.tsx`, `src/ui/BlockingWorkspace.tsx`, `src/styles.css` (only if an existing class needs a variant), new `tests/ui/data-safety.spec.ts`.
- Acceptance criteria:
  1. A read-only tab shows the existing notice banner with the text "This project is open in another tab. This tab is read-only." Edit controls stay visible; writes are rejected by P02.
  2. The project menu shows "Last backup: <date and time>" or "No backup exported yet" under "Backup project JSON".
  3. After a stale-source rejection, Blocking reloads its data and shows the rejection message once.
  4. Every catch site listed in 3-015 and 4-017 goes through `showError`; the filter matches `QuotaExceededError`, `VersionError`, `UnknownError`, and "not part of transaction"; `blockingError` no longer splits words.
  5. Startup, selection reloads, and JSON/CSV export failures show the error banner instead of the empty start screen.
  6. The message rewrites in 5-029 are applied; terms follow `docs/domain-glossary.md`.
- Verification: UI rules.

## U03: Drafts, inputs, and preferences

- Type: UI. Class: Luna-class (reuses `ShiftDiscardDialog` and the Route discard pattern).
- Issues: I-026 (4-010), I-030 (5-004; decision 14), I-032 (5-006), I-042 (5-024), I-091 (5-025).
- Owned files: `src/ui/App.tsx`, `src/ui/BlockingWorkspace.tsx`, `tests/ui/` specs for these behaviors.
- Acceptance criteria:
  1. A dirty Runtime editor draft and a staged Shift trigger the existing Save/Discard/Cancel dialog on a profile, day, Direction, or tab change and on Runtime save; reload with a dirty Runtime draft raises the leave prompt (B4-10 to B4-13).
  2. Build Trips closes without a prompt but keeps its values until the drawer is reopened (decision 14).
  3. Saving Nodes keeps an unsaved Pattern draft, and saving a Pattern keeps unsaved Node edits.
  4. Escape in `NumericCommit` and `RuntimeTimeInput` restores the saved value and writes nothing.
  5. A `null` or wrong-shaped value in either selection key falls back to the default selection.
  6. The remembered Blocking Scenario survives a Trip Profile change and is restored in Blocking.
- Verification: UI rules.

## U04: Dialogs, focus, and keyboard

- Type: UI. Class: Luna-class, implementing the WAI-ARIA dialog pattern exactly as specified below (no design choices left open).
- Issues: I-036 (5-010), I-037 (5-012), I-086 (5-018), I-090 (5-023).
- Owned files: new `src/ui/ModalDialog.tsx`, `src/ui/MenuButton.tsx`, `src/ui/App.tsx`, `src/ui/BlockingWorkspace.tsx`, `src/ui/CostingWorkspace.tsx`, `tests/ui/keyboard.spec.ts`.
- Acceptance criteria:
  1. One shared modal wrapper: focus moves to the first focusable field (or the dialog) on open, Tab and Shift+Tab stay inside, Escape cancels, and focus returns to the invoking control on close (D0025-09). All 28 modal dialogs use it.
  2. A menu item that opens a dialog does not refocus the menu trigger.
  3. Every dialog has an accessible name.
  4. Focus returns to the invoker after Shift drawer steps, Block pill move, Unassign, Delete trips, Runtime Discard, and Node Discard (B4-05 to B4-07).
  5. Independent Display toggles use `menuitemcheckbox`; Tab closes an open menu.
  6. `aria-invalid` and `aria-describedby` on invalid fields; one `h1` per workspace; no nested `main`; the JSON file input is labelled; table headers have `scope`. Frozen-column row headers are out of scope (Sol-class if wanted).
  7. The axe scan in `p5-b4-keyboard.spec.ts` reports no dialog-name, label, or landmark violation.
- Verification: UI rules plus keyboard tests.

## U05: Blocking presentation and destructive actions

- Type: UI. Class: Luna-class.
- Issues: I-034 (5-008), I-035 (5-009), I-040 (5-015; decision 15), I-083 (4-026), I-088 (5-020), I-089 (5-021).
- Owned files: `src/ui/BlockingWorkspace.tsx`, `src/styles.css`, `src/ui/App.tsx` (Delete Pattern button label only), `tests/ui/blocking-workspace.spec.ts`.
- Acceptance criteria:
  1. Removing a Trip, Pull-out, or Pull-in from a Block opens the existing `ConfirmDialog`, naming the activity.
  2. Delete Block and Delete Blocking Scenario show the P14 impact counts before confirming; the Delete Pattern button reads "Delete Pattern".
  3. Activities from another Route show that Route's short name in the Pattern pill; activities from the selected Route are unchanged.
  4. Blocking loads ignore out-of-order responses.
  5. Blocking hours and miles use `roundCostingDisplay`; Block 22 shows 14.58 in both workspaces.
  6. 5-021 label fixes: full Pattern names available on hover and to assistive technology, neutral style for "No current issues.", "Move Trip N" counts Trips only, "Trip Profile" capitalized.
- Verification: UI rules.

## U06: Costing and service-day presentation

- Type: UI. Class: Luna-class.
- Issues: I-031 (5-005), I-033 (5-007), I-058 (1-014), I-087 (5-019; decision C3). Also the I-044 loading state.
- Owned files: `src/ui/CostingWorkspace.tsx`, `src/ui/App.tsx` (Service days table only), `src/styles.css`, `tests/ui/costing-workspace.spec.ts`, `docs/implementation/phase-05-costing.md`.
- Acceptance criteria:
  1. The Service days table shows the P09 field errors for a total above 365 using the existing field-error pattern.
  2. An invalid Costing estimate lists each finding.
  3. At 1024 px, Annual cost is visible without horizontal page scroll (AC7). Checked after U01.
  4. While the estimate loads, the workspace says "Calculating estimate…" instead of "Select a valid Blocking Scenario…".
  5. Decision C3: the Total row leaves the daily columns blank, keeps the annual totals, and a note says totals are computed before rounding. "1 excluded Block" is singular. View year appears only in the toolbar (D0028).
  6. `phase-05-costing.md` lists the implemented columns (decision 2: 5C is accepted).
- Verification: UI rules, with the width check at 768, 1024, and 1440 px.

## U07: Trips and Runtime presentation

- Type: UI. Class: Luna-class.
- Issues: I-041 (5-016), I-057 (1-013; decision 7), I-082 (4-025), I-092 (5-026), I-093 (5-027), I-094 (5-028). Also adds the React error boundary related to I-012.
- Owned files: `src/ui/App.tsx`, `docs/ui-conventions.md` (line 95 only), `docs/domain-glossary.md` ("Run Time" entry, operating-span line), `tests/ui/` specs.
- Acceptance criteria:
  1. The shared Runtime-profile line lists every service day that shares the profile (P09 query; 02R-AC18).
  2. The Trips selector label reads "Blocking Scenario" (decision 7); the glossary defines "Run Time" or the headers use a glossary term.
  3. The Runtime paste preview shows the calculation method that will be applied, and Append mode keeps the existing method unless the preview says otherwise.
  4. Shift drawer Undo and Redo update history only after the preview resolves.
  5. The Trips CSV import preview shows Pattern names and Trip labels, not UUIDs; finding-list keys are unique.
  6. Runtime band totals of 60 minutes or more display in the duration format of Decision 0033 (first confirm what the current display is, since 5-028 is Suspected).
  7. A React error boundary shows a recoverable error message instead of an empty page.
- Verification: UI rules.

## X01: Dead code removal

- Type: structural. Class: Luna-class (mechanical deletion).
- Issues: I-069 (3-008), I-075 (4-015; decision 13), I-079 (4-022).
- Owned files: `src/ui/App.tsx` (deletions only), `src/application/routeDefinitionService.ts`, `src/application/tripGenerationService.ts`, `src/application/blockingService.ts`, `src/application/ports.ts`, the zero-reference exports listed in 4-015, `docs/data-schema.md` (lines 488 and 542).
- Acceptance criteria:
  1. The legacy generation-set UI, the 11 dead App handlers, `UndoIcon` and `RedoIcon`, the listed service methods (including `deleteNode`), and the 22 zero-reference exports are deleted.
  2. The `generationSets` table and backup parsing stay (decision 13); v3 backups still import.
  3. The nine unused `ports.ts` interfaces are deleted; the `Pick` aliases remain.
  4. Typecheck, unit tests, and the Playwright suite pass unchanged; the bundle size is reported before and after.
- Verification: structural rules; full regression.

## P15: Trips and Runtime rules out of `App.tsx`

- Type: structural. Class: Luna-class.
- Issues: I-074c (the Trips and Runtime items of 4-014).
- Owned files: `src/domain/runtime.ts`, `src/domain/trips.ts`, `src/domain/serviceDays.ts`, `src/domain/directions.ts`, `src/application/tripGenerationService.ts`, `src/application/ports.ts`, their tests, `src/ui/App.tsx` (replacing logic with calls; no layout change).
- Acceptance criteria: every Trips and Runtime item in the 4-014 list (runtime band assembly, reverse-candidate eligibility, shift minute conversion and net-shift label, duplicate-departure rule, display rounding, usable-Pattern rule, `serviceDayOrder`, Direction sort, Block assignment impact counts, Build Trips validation, render-time runtime calls) is computed in the domain or application layer and has a unit test; `App.tsx` imports no calculation function from `src/domain` other than formatting helpers and error classes. Displayed values are unchanged (P05 tests pass).
- Verification: domain and application rules; full regression.

## P16: Domain precision and message polish

- Type: structural. Class: Luna-class.
- Issues: I-061 (2-007), I-062 (2-008), I-063 (2-009), I-067 (2-013), I-068 (2-014).
- Owned files: `src/domain/runtime.ts`, `src/domain/durations.ts`, `src/domain/safeRouteEditing.ts`, `src/domain/costing.ts`, `src/domain/trips.ts`, `src/domain/blocking.ts`, `src/domain/ids.ts`, their tests.
- Acceptance criteria:
  1. At an exact gap midpoint, `segmentStart` picks the same band as the blend fallback (D0033-01: "matching the prior blend's fallback").
  2. Decimal-minute entries round half away from zero exactly (0.025, 1.025, and 4.225 give 2, 62, and 254 s).
  3. The direction-order conflict message names the Direction.
  4. Per-day hours accumulate in integer seconds; 266:30:00 rounds to 267.
  5. `adjustBlockReferences` and `planBulkBoundaryActivities` take `now`; ID generation can be injected in tests.
- Verification: domain rules; the golden reconciliation is unchanged.

## U08: Recalculation dialog at capacity

- Type: UI. Class: Sol-class (changes the dialog's interaction).
- Issues: I-096 (6-005).
- Owned files: `src/ui/App.tsx` (recalculation dialog only), `src/styles.css`, a capacity timing spec under `tests/ui/`.
- Acceptance criteria: "Regenerate selected" on 500 rows opens its review within 1 s and applies within 1 s at the capacity fixture, with anchor selection still available for every Trip. Capacity restore (1.9 s, one-time) is out of scope.
- Verification: UI rules, plus the capacity timing measured in a production build.

## D01: Documentation-only remainder

- Type: docs. Class: Luna-class.
- Issues: I-048 (1-001), I-049 (1-002), I-050 (1-003), I-051 (1-004), I-053 (1-007; decision 9), I-054 (1-008), I-055 (1-011; decision C1), I-056 (1-012), I-059 (1-015, 5-022). Also records decisions 1 and 2 in `phase-05-costing.md`.
- Owned files: `architecture_overview.md`, `codex.md`, `AGENTS.md`, `docs/data-schema.md`, `docs/domain-glossary.md`, `docs/ui-conventions.md`, `docs/implementation/schedule-development-roadmap.md`, `docs/implementation/phase-05-costing.md`, `docs/decisions/*.md`, a new minimum-layover decision record (decision C1).
- Acceptance criteria: every quoted contradiction in the listed findings is resolved toward the source the register names; every decision record has Status and Date lines and annotates its supersessions; `AGENTS.md` and `codex.md` use agent-neutral wording and capability classes without renaming `codex.md` (decision 9); `phase-05-costing.md` records that the review replaces 5D except user acceptance (decision 1) and that 5C review is complete (decision 2).
- Verification: documentation rules: proofread and a cross-file consistency check against the rule catalogue rows the findings cite.
