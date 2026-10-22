# Phase A Findings: Baseline and Test Harness

- Status: Complete. Gate report pending user review before Wave 1.
- Baseline: `main` at `baed9f1`. Harness commit `9748db0` on `claude/upbeat-ritchie-51mpy5`.
- Orchestrator: primary agent. Delegated: A4 inventory (Haiku), A4 mapping (3 × Sonnet), A6 golden dataset (Sonnet).
- Verification: the orchestrator re-ran or re-read every finding below that came from a delegated agent. It rejected two delegated claims (Section 4).

## 1. Task results

| Task | Result |
| --- | --- |
| A1 Baseline | Typecheck pass. Unit tests pass: 29 files, 205 tests. Build passes with a 764.55 kB single JavaScript chunk (Vite 500 kB warning). |
| A2 Harness | `playwright.config.ts` accepts an optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. When it is unset, local behavior is unchanged. Command recorded in `codex.md`. Committed as `9748db0` with user approval. |
| A3 Failure matrix | 3 parallel and 3 serial full runs: 14 pass and 7 fail in every run. All 7 failures are deterministic. No flaky or environment failures remain once the harness override is used. See A-001. |
| A4 Coverage matrix | `coverage-matrix.md`. 394 acceptance, test, and gate items mapped. 87 (22%) are fully covered by passing tests; 78 are uncovered; 148 are partial. Inventories are in `inventory/`. |
| A5 Unit coverage | Line coverage 56.4% overall (branches 71.6%). Table in Section 3. See A-002. |
| A6 Golden dataset | The Federal BRT backup restores through the app's own import path. Every figure stated in the conversion doc and audit reconciles with zero difference. Loader: `docs/review/golden/` (run `pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts`). Details: `docs/review/golden/REPORT.md`. |

## 2. Findings

### A-001: Seven browser tests fail deterministically; the closeout claim of passing Trips browser checks does not reproduce

- Severity: S2
- Category: test-gap
- Location: `tests/ui/unified-action-layer.spec.ts:56-64` (shared helper), tests at lines 83, 112, 140, 169, 186, 226; `tests/ui/trip-table-layout.spec.ts:40`; `src/ui/App.tsx:1162`
- Governing source: `phase-02r-trip-table-interchange-undo.md` Verification: "Trips browser checks passed, including sticky headers, undo across reload, and shift scroll restoration."
- Evidence: six tests fail in the shared helper. It expects the menu item `Copy from day…`; the app renders `Copy Trips from day…`. The sticky-header test fails its predicate; it exercises a nested schedule scroll viewport, which Decision 0035 item 5 forbids. Results were identical across 6 full runs.
- Additional (Probable, from A4 mapping, not yet executed): `unified-action-layer.spec.ts:169` also assumes the nested viewport. Correcting the label alone will not make it pass.
- Consequence: staged Shift, Discard, Done, regeneration preview, one-step undo across reload, scroll restoration, and the Build Trips drawer have no working real-app test.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: test-only (label), plus a UI decision on the sticky-header model (Decision 0035 vs. overview text). About 2 files.
- User decision required: no for the label. The sticky-header model is listed as decision candidate 3 in the master plan.

### A-002: The production IndexedDB repository has no unit-test coverage; every atomicity and rollback test uses an in-memory store or a fake

- Severity: S2
- Category: test-gap
- Location: `src/persistence/dexieRepository.ts` (0% lines of 464), `src/persistence/database.ts` (upgrade callbacks not executed), `vitest.config.ts:2` (`environment: 'node'`, no IndexedDB)
- Governing source: overview "Related writes must occur in one database transaction"; Decision 0029 "IndexedDB and in-memory repositories apply the same cascade behavior."
- Evidence: Vitest v8 coverage reports 0% for `dexieRepository.ts`. Unit tests use `InMemoryRouteDefinitionRepository` or fakes that throw before mutating (for example, `src/application/authoritativeTripService.test.ts:31`). Only the browser specs exercise IndexedDB, and 7 of them are failing (A-001).
- Consequence: transaction scope, cascade deletion, undo invalidation (`dexieRepository.ts:393-444`), and Trip-copy replacement (`dexieRepository.ts:448-462`) in the shipped store are unverified at unit level.
- Confidence: Confirmed
- Verified by: orchestrator (coverage run)
- Fix scope: test-only (add `fake-indexeddb` or an equivalent to run repository contract tests against both implementations). Directly feeds Phase 3 task 3.6.
- User decision required: no. Adding a dev dependency is part of a Stage 4 package.

### A-003: The only migration unit test passes without running and asserts a stale database version

- Severity: S2
- Category: test-gap
- Location: `src/persistence/repository.test.ts:30-47`
- Governing source: Decision 0019 item 12 requires migration tests to report the discarded placeholder-Block count. `AGENTS.md` Verification says to "validate schema versions" for migrations.
- Evidence: line 31 `if (typeof indexedDB === 'undefined') return;` always returns under Vitest's node environment. Line 42 expects `verno` 5; `database.ts:41` declares version 6. The v2→v3 Trip-profile migration (`database.ts:16-26`) and the v3→v4 placeholder-Block discard (`database.ts:33-35`, `blocks.clear()`) have no executed test. `tests/ui/database-migration.spec.ts` starts from version 4.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: test-only, together with A-002's IndexedDB test environment.
- User decision required: no

### A-004: Scenario duplication leaves pull-out, pull-in, and deadhead Node references pointing at the source Scenario

- Severity: S2 (Phase 3 may raise this to S1; see Consequence)
- Category: data-integrity
- Location: `src/domain/project.ts:222`
- Governing source: Decision 0019 item 11: "Project Scenario duplication copies and remaps Blocking Scenarios, Blocks, activities, Trip references, and non-revenue Node references."
- Evidence: line 222 maps each non-revenue activity to `{ ...activity, id: newId() }` and does not apply the `nodeIds` map built at lines 156-160. Backup import-as-copy does remap them (`src/persistence/backup.ts:557`). Reproduction: `docs/review/golden/dupNodes.golden.test.ts`. On the golden dataset, **138 of 138** Node references in the duplicated Scenario point at the source Scenario's Nodes.
- Consequence today: the duplicated Scenario's Block hours, eligibility (69/69), and findings are identical to the source, measured by the same reproduction. Validation does not currently compare activity Node IDs against Scenario ownership.
- Latent consequence (unverified; assigned to Phase 3 tasks 3.4 and 3.5): Node rename and delete in the copy will not reach these activities, and deleting the source Scenario leaves the copy referencing Nodes that no longer exist. Display names and any later location-continuity check would then be wrong.
- Confidence: Confirmed (reference defect); consequence partly verified
- Verified by: orchestrator (reproduction)
- Fix scope: structural, 1 file plus a test. Route duplication (`duplicateRouteRecords`) must be checked for the same pattern; it does not copy Block activities (Decision 0028), so it is probably unaffected.
- User decision required: no

### A-005: Service-day annual counts can be saved with a total above 365

- Severity: S2
- Category: contract
- Location: `src/application/routeDefinitionService.ts:419-421` (`updateServiceDay`), `src/ui/App.tsx:508` (Service days table)
- Governing source: `phase-05-costing.md` acceptance criterion 3: "The count sum never exceeds 365 in new edits."
- Evidence: `updateServiceDay` merges the patch and saves without validation. A search of `src/` finds the 365 limit only in `src/domain/costing.ts:5,203`, where it turns the cost estimate invalid after the fact.
- Consequence: a planner can save 366+ days and then sees a blocked Costing estimate instead of an edit-time error.
- Confidence: Confirmed by code read (not executed in a browser)
- Verified by: orchestrator
- Fix scope: structural validation, plus a small UI message using the existing field-error pattern.
- User decision required: no

### A-006: Costing shows the applied rate in whole dollars; the approved plan requires four decimal places

- Severity: S2
- Category: contract
- Location: `src/ui/CostingWorkspace.tsx:58` (`money` and `number` round to 0 decimals); `tests/ui/costing-workspace.spec.ts:53` asserts `Applied rate 159 USD per Revenue Hour` for a rate of 159.135
- Governing source: `phase-05-costing.md` Pure calculation contract: "Show the applied USD/VRH rate to four decimal places so escalation is visible"; acceptance criterion 4.
- Evidence: the display change arrived in commit `d990e5a` ("Refine costing year controls and table labels", 2026-10-09), which changed no documentation. The browser test was updated to lock in whole-dollar display.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: either a docs change or a UI change.
- User decision required: **yes**. Is whole-dollar display an intended product change (update the plan and the acceptance criterion), or a regression (restore four decimals)?

### A-007: The default runtime calculation method for new profiles has no calculation test

- Severity: S2
- Category: test-gap
- Location: `src/domain/runtime.ts:106-126` (`segmentStartTimes`); `src/application/routeDefinitionService.ts:689` makes `segmentStart` the default
- Governing source: Decisions 0033 and 0035 item 1.
- Evidence: the only test file that mentions `segmentStart` is `src/ui/runtimePaste.test.ts`, and only as a CSV method string. The "new profile defaults to segmentStart" check is inside the failing helper (A-001).
- Consequence: Trip times for every newly created Runtime profile are produced by untested code.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: test-only. Top priority for Phase 2 task 2.2.
- User decision required: no

### A-008: `playwright.config.ts` is not typechecked, and would fail a strict typecheck once included

- Severity: S3
- Category: build
- Location: `tsconfig.json` `include`; `playwright.config.ts:5`
- Evidence: `tsc --strict` on the config reports `TS2580: Cannot find name 'process'` because `@types/node` is not a dependency. `pnpm typecheck` does not cover the config or `tests/ui/*.spec.ts` (lead L-13). Playwright transpiles the config without type checking, so the harness works.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: build config. Add `@types/node` when tests are brought into typechecking (Phase 6 task 6.5).
- User decision required: no

## 3. Unit-test line coverage (A5)

Files below 70% line coverage are flagged to their owning phase.

| File | Lines % | Branches % | Owner |
| --- | ---: | ---: | --- |
| `src/persistence/dexieRepository.ts` | **0** | — | Phase 3 |
| `src/main.tsx` (costing context assembly at lines 27-45) | **0** | 0 | Phase 4 |
| `src/ui/App.tsx`, `CostingWorkspace.tsx`, `MenuButton.tsx`, `BlockingWorkspace.tsx` | 0–11 | — | Phase 5 (browser tests only) |
| `src/persistence/blockingRepository.ts` | 56.0 | 66.7 | Phase 3 |
| `src/persistence/database.ts` | 69.7 | — | Phase 3 |
| `src/application/routeDefinitionService.ts` | 73.9 | 64.7 | Phase 4 |
| `src/domain/validation.ts` | 76.5 | 57.1 | Phase 2 |
| `src/domain/project.ts` | 79.8 | 61.8 | Phase 3 |
| `src/domain/directions.ts` | 81.0 | 66.7 | Phase 2 |
| `src/domain/trips.ts` | 81.8 | 79.5 | Phase 2 |
| `src/domain/runtime.ts` | 82.6 | 69.9 | Phase 2 |
| `src/persistence/backup.ts` | 83.6 | 63.3 | Phase 3 |
| `src/ui/runtimePaste.ts` | 84.2 | 45.2 | Phase 3 |
| `src/domain/costing.ts` | 87.9 | 74.1 | Phase 2 |
| `src/domain/blocking.ts` | 97.6 | 78.1 | Phase 2 |

Coverage was measured with a temporarily installed `@vitest/coverage-v8@3.2.7`. `package.json` and the lockfile were restored afterward, and the provider is not committed.

## 4. Delegated claims rejected on verification

| Claim | Source | Reason rejected |
| --- | --- | --- |
| The converter flattened Weekday and Sunday pull-out and pull-in durations to 30 minutes. | A6 analyst | `tools/federal_brt_to_backup.py:397-398` computes each duration from the workbook's Hours sheet. The uniform values come from the source. |
| "Revenue hours" wrongly include layover. | A6 analyst | Decision 0026 item 6 defines Revenue hours as Running Time plus usable layover. The behavior is intended. |

## 5. Leads handed to later phases (recorded by analysts; not yet verified)

| Lead | Owner |
| --- | --- |
| `Trip.tripProfileId` is optional (`src/domain/types.ts:49,79`). Repository `listTrips` without a profile ID returns every profile's Trips (`dexieRepository.ts:388-391`). No test holds two Trip profiles at once. | Phase 3, 4 |
| A Blocking Scenario's source Trip Profile is not enforced as immutable on save. `existing` and `current` are fetched and unused (`blockingRepository.ts:33,93`). | Phase 3 |
| Node deletion writes the route aggregate and the Block cleanup in two separate transactions (`routeDefinitionService.ts:507-511`). | Phase 3 |
| `shiftTrips` has no lower bound (`src/domain/trips.ts:422-430`). Shifting earlier than 00:00 may produce negative service times. | Phase 2 |
| Trip copy keeps the source day's `calculationSource` on copied Trips (`src/domain/serviceDayCopy.ts:255`). | Phase 2 |
| The Trip Profile deletion tests use the legacy `Block.tripProfileId` shape (`src/application/tripProfile.test.ts:42-46,74`). The live cross-profile rejection (`blocking.ts:81,236`; `blockingService.ts:148`) is untested. | Phase 2, 3 |
| The shared Runtime-profile display lists only the selected day (`src/ui/App.tsx:1200`), not every day that shares the profile (02R-AC18). | Phase 5 |
| The costing context is assembled only in `src/main.tsx:27-45` and is untested. | Phase 4 |
| The Runtime paste Replace/Append and validation gate have no test (`src/ui/App.tsx:1329-1356`). | Phase 3, 5 |
| Untested bounds: costing horizon of 11 years, escalation ≤ -100%, a negative or non-finite rate. | Phase 2 |
| Trip counts are asymmetric between mirrored Englewood–Westminster Patterns in the golden dataset (66 vs. 65 on Weekday). Not checkable without the workbook. | Phase 2 (low priority) |

## 6. Gate

Phase A exit criteria are met. The browser suite runs, every failure has a classification, the coverage matrix and coverage table exist, and the golden dataset loads. Wave 1 (Phases 1, 2, 3) is ready to start on user request.
