# Phase 6 Findings: Performance, Build, and Delivery

- Status: Complete. Gate report pending user review.
- Baseline: `main` at `baed9f1`; review branch `claude/upbeat-ritchie-51mpy5`.
- Operating model: plan Section 4.6 (amended). The review lead orchestrated directly. There were two sub-agents:
  - Sonnet analyst S1: tasks 6.1, 6.2, 6.5, 6.6, and the delivery side of `index.html`.
  - Haiku sweeper H1: inventories for 6.3 (bundle composition) and 6.4 (dependencies, `pnpm audit`, `pnpm outdated`, lockfile). Haiku output is not a finding; findings 6-009 to 6-011 were judged by the lead from the inventory after re-running the commands.
- Measurement conditions (apply to every number below):
  - Container with 4 vCPU (Xeon 2.1 GHz), Node 22.22.0, pnpm 10.28.0, Chromium at `/opt/pw-browsers/chromium`, `@playwright/test` 1.63.0.
  - Browser timings use a production build (`vite preview`) on real Dexie/IndexedDB, and the page runs in **quirks mode**, because `index.html` has no doctype (5-013, 6-008).
  - Each figure is the median of 3 runs unless stated. A desktop CPU will be faster in absolute terms; call counts and ratios do not change.
- Capacity fixture (`docs/review/golden/p6-capacity-fixture.ts`): 1 Scenario, 4 service days, 500 Trips per day (2,000 in total), 100 Blocks per day (400 in total), and 2 Patterns of 30 points each. It passes `importProjectJson` (`p6-capacity-validate.golden.test.ts`).
  - Variants: every Trip assigned, 300 unassigned Trips per day, 100 unassigned per day, and all 500 Trips in one Direction.
- Verification by the review lead:
  - The analyst's one proposed S1 (P6-S1-01, now 6-001) was re-run. With `test.fail` removed, the Blocking review measured 22.8 s (the analyst measured 21.8 s). Its severity was lowered to S2 because a workaround exists (Section 5).
  - 6-002 was re-run: the Costing tab took 33.4 s at capacity (analyst: 31.1 s).
  - 6-006 was re-run: the scratch typecheck gave the same single TS2580 error.
  - 6-003 was checked by grep: `navigator.storage` and `QuotaExceeded` appear nowhere in `src/`.
  - 6-009 to 6-011 rest on `pnpm audit` and `pnpm outdated`, which the lead re-ran (identical output), and on lead greps.
  - All p6 Vitest files were re-run and pass (3 files, 5 tests).
  - In total, 4 of the 8 analyst findings were re-run or re-checked.
- Evidence:
  - Vitest: `docs/review/golden/p6-*.golden.test.ts`.
  - Browser: `docs/review/golden/p6-*.spec.ts`, run with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p6-playwright.config.ts` (port 4186). Set `P6_DIST=<dir>` to serve a production build made with `pnpm exec vite build --outDir <dir>`.
  - The defect tests are in `p6-capacity-latency.spec.ts` and use `test.fail()`. The other p6 specs and tests are measurements; they write JSON to `P6_SCRATCH` when it is set.
- Analyst reports (scratch, not committed): `w3/s1/report.md` and `w3/h1/inventory.md` in the session scratchpad.

## 1. Task results

| Task | Verdict |
| --- | --- |
| 6.1 Capacity | **Domain and application code at capacity, in Node: no defects found.** Every operation is under 200 ms (table 1a). **In the browser, three paths exceed the plan thresholds** (an interaction over 1 s, or a render over 2 s): the Blocking compatibility review takes 22 s (6-001), the Costing tab 31 s (6-002), and Regenerate selected on 500 rows 2.5 s (6-005). JSON restore of the 5.2 MB capacity file takes 1.9 s (6-005). Trips timetable first render: 0.53 s at 500 rows. Backup export: 0.66 s. |
| 6.2 Rendering cost | The slow paths are caused by repository reads, not by rendering or domain code. In the CPU profiles, native IndexedDB deserialisation, Dexie `onsuccess` and GC account for more than 90% of the 6-001 and 6-002 time windows, and domain JavaScript for under 2%. 4-008 is measured: 300 `classifyInsertion` calls each read every Scenario Trip (about 80 ms per read). `getBlockSummary` is called once per Block from `main.tsx:43` (6-002). ScheduleTable at 500 rows: **no defect found**. The O(n²) duplicate-departure check (`App.tsx:1412`, 4-014) costs 3.4 ms. The worst render-time domain function is `segmentStartTimes` ×500 at 92 ms. In the browser, a row toggle takes 111 ms and Show headways 513 ms, both under 1 s. |
| 6.3 Bundle | There is one JS chunk: 764.60 kB (210.11 kB gzip), plus 42.47 kB of CSS. The build has no dynamic `import()` (H1 grep; every `import(` in `src/` is a TypeScript type position). By source bytes, `react-dom` is 39%, `App.tsx` 15%, `dexie` 6% and `BlockingWorkspace.tsx` 5%. Splitting by workspace is technically possible (Blocking and Costing are separate components), but the gain is small. 6-011 (S3). |
| 6.4 Dependencies | `zod` and `@tanstack/react-table` are declared, locked and never imported (6-009). **`jszip` is not declared, not in the lockfile, and not imported.** The Phase 4 hand-off was wrong; ZIP files are written by the hand-written `createCsvArchive` (Section 5). `pnpm audit`: 11 advisories, all in the dev toolchain (6-010). Five packages have a new major version (6-010). The lockfile matches `package.json` (`pnpm install --frozen-lockfile --offline`: "Lockfile is up to date"). |
| 6.5 CI and deployment | No workflow runs tests, and no workflow runs on pull requests (6-004, L-14). The typecheck scope leaves out `tests/ui` and `playwright.config.ts` (6-006, L-13, A-008). Node and pnpm versions are not pinned, and CI uses Node 20, which is end-of-life (6-007). A proposed minimal CI workflow is in Section 3. The relative base `./` with a deep link or reload: **no defect found**. The app has no client-side routes (no `pushState` or `location` use in `src/`), and the built `index.html` references `./assets/…`. |
| 6.6 Storage | The app never calls `navigator.storage.persist()` or `estimate()`, and `persisted()` is `false`. There is no backup reminder. On a simulated `QuotaExceededError`, the save fails visibly but shows raw engine text with no recovery guidance (6-003). IndexedDB footprint: 2.1–3.9 MB for the golden dataset and 5.7–12 MB at capacity; this container's quota is 1.06 GB. |
| `index.html` (build side) | The built `dist/index.html` also has no doctype, charset or viewport. In quirks mode, table text renders at 16 px instead of the 14 px set by `:root`. The Trips table is 3% wider, and the Blocking Blocks table is 11% taller (6-008). Charset: no defect. Module scripts decode as UTF-8, and GitHub Pages sends `charset=utf-8`. |

### 1a. Capacity timings, Node, in-memory repository (`p6-capacity-node.golden.test.ts`)

| Operation | Median |
| --- | --- |
| `importProjectJson` parse and validate (5.2 MB) | 52 ms |
| `exportProjectJson` | 65 ms |
| `previewGenerateTrips` / `generateTrips`, 500 Trips | 2.8 ms / 4.8 ms |
| `previewRecalculateTrips` / `recalculateTrips`, 500 Trips | 36 ms / 17.5 ms |
| `summarizeBlockingScenario`, one day (100 Blocks) / whole Scenario (400 Blocks) | 38 ms / 135 ms |
| `getBlockSummary` ×400, as `main.tsx:43` calls it | 190 ms; 400 `listTrips` + 400 `listPatterns` calls |
| `calculateCosting` | 2.8 ms |
| `classifyInsertion` ×300, in-memory reads | 101 ms |

### 1b. Capacity timings, Chromium, quirks mode, production build

| Step | Capacity | Golden dataset (984 Trips, 69 Blocks) |
| --- | --- | --- |
| JSON restore until the "Imported" notice | 1.93 s | 0.36–0.84 s |
| First render of the Trips timetable | 0.50 s (250 rows); 0.53 s (500 rows) | 0.27 s |
| Toggle one row / Select all, 500 rows | 111 ms / 225 ms | — |
| Show headways on / off, 500 rows | 498 / 513 ms | 56–62 ms |
| Regenerate selected: review / apply, 500 rows | 2.47 s / 2.54 s | — |
| Regenerate selected: review / apply, 250 rows | 0.74 s / 0.90 s | — |
| Blocking: open tab until Assign is enabled, 300 unassigned | **21.8 s** (lead re-run: 22.8 s) | 0 unassigned |
| Blocking: switch Block / assign one Trip, 300 unassigned | **22.2 s / 23.3 s** | — |
| Blocking: open tab, 100 unassigned | 6.0 s | — |
| Costing tab until the estimate is shown | **31.1 s** (lead re-run: 33.4 s) | 1.16 s |
| JSON backup export | 0.53–0.66 s; 10.2 MB file (pretty-printed) | 0.10–0.59 s; 2.1 MB |

## 2. Findings

### 6-001: Blocking compatibility review takes about 22 s at 300 unassigned Trips; it runs on every tab open, Block switch, and assignment, and Assign stays disabled throughout

- Severity: S2 (the analyst proposed S1; the lead lowered it because a workaround exists, see Section 5)
- Category: performance
- Location:
  - `src/ui/BlockingWorkspace.tsx:195-202`: one `classifyInsertion` per unassigned Trip, inside `Promise.all`.
  - `:203`: the effect depends on the Block activity signature, so it re-runs after every assignment.
  - `:208`: `assign()` returns early while `compatibilityPending` is set.
  - `src/application/blockingService.ts:213`: each call reads the Blocking Scenario, the Block, the Trip, then every Scenario Trip (`listTrips`) and every Pattern.
  - `src/main.tsx:23-24`: `listTrips` reads every Scenario Trip from Dexie, then filters them.
- Governing source: OV-CAP-01, `architecture_overview.md:314-324`: "500 trips per service day; … 100 blocks per service day; four service-day types; smooth local generation, recalculation, ordering, and validation at that scale." Plan task 6.1 threshold: an interaction over 1 s is a finding.
- Evidence: `docs/review/golden/p6-capacity-latency.spec.ts`, test "P6-S1-01" (`test.fail`; expects Assign to be enabled within 1 s).
  - Analyst, 3 runs: 21.8 s to open the tab, 22.2 s to switch Block, 23.3 s after assigning one Trip; 6.0 s at 100 unassigned Trips.
  - Lead re-run without `test.fail`: 22,801 ms.
  - A raw `getAll('trips')` of 2,000 Trips takes about 90 ms in the page, and the review issues it 300 times.
  - CPU profile (`w3/s1/profile-capacity-unassigned.json`) of a 24.2 s window: native deserialisation 12.4 s, Dexie `onsuccess` 6.8 s, GC 3.0 s.
  - The same 300 calls with in-memory reads take 101 ms in Node.
  - Phase 4 finding 4-008 had established the call count; this finding measures its wall-clock cost.
- Consequence: assigning N Trips one at a time in the Blocking workspace costs about N × 23 s at this scale. Trips-table assignment avoids the cost (Section 5). The golden dataset has 0 unassigned Trips, so a planner sees this only while blocking newly built service.
- Confidence: Confirmed (reproduced by the lead; attributed by profile)
- Verified by: review lead (re-run), Sonnet analyst S1
- Fix scope: structural, about 3 files. Add a batch `classifyInsertions(blockingScenarioId, blockId, tripIds)` that reads Trips and Patterns once; update `ports.ts`; make one call from `BlockingWorkspace.tsx:199`. This supersedes 4-008 for fix packaging (Stage 3 should merge the two).
- User decision required: no

### 6-002: The Costing tab takes about 31 s at capacity (1.2 s on the golden dataset), because the context builder calls `getBlockSummary` once per Block; meanwhile it shows "Select a valid Blocking Scenario"

- Severity: S2
- Category: performance
- Location:
  - `src/main.tsx:43`: `blocks.map((block) => blocking.getBlockSummary(…))`. The analyst cited `:35`; the lead corrected it to `:43`.
  - `src/application/blockingService.ts:210`: each call reads every Scenario Trip and every Pattern.
  - `src/ui/CostingWorkspace.tsx:196`: `!result && !validation.length` renders "Select a valid Blocking Scenario to calculate an estimate." while the estimate is still being computed.
- Governing source: OV-CAP-01. Plan threshold: a render over 2 s. No document defines a Costing loading state. The interim message misstates the condition, because a valid Blocking Scenario is already selected. `phase-05-costing.md:33` requires states that are not misleading (a "no-estimate state, not a misleading $0"). Phase 5 task 5.8 checked only the final states.
- Evidence: `p6-capacity-latency.spec.ts`, test "P6-S1-02" (`test.fail`; expects the estimate within 2 s).
  - Analyst: 31.1 s at capacity (30.8–31.6 s); 1.16 s on the golden dataset (`p6-costing-timing.spec.ts`).
  - Lead re-run without `test.fail`: 33,362 ms.
  - Node: 400 `listTrips` + 400 `listPatterns` calls per context build. `calculateCosting` itself takes 2.8 ms.
  - "Loading Costing…" is visible for only about 40 ms; for the rest of the wait the page shows the misleading message (MutationObserver capture in `w3/s1/costing-timing-*.json`).
- Confidence: Confirmed
- Verified by: review lead (re-run), Sonnet analyst S1
- Fix scope:
  - Structural, 1–2 files: read Trips and Patterns once and use `summarizeBlockingScenario`. This also removes the per-Block reads that Phase 4 noted under 4-008.
  - UI, Luna-class, 1 file: show a loading state for the estimate instead of the empty-state text.
- User decision required: no

### 6-003: The app does not request persistent storage, never reminds the planner to export a backup, and shows raw engine text on a storage-quota failure

- Severity: S2
- Category: data-integrity
- Location:
  - All of `src/`: there is no `navigator.storage` call site.
  - `src/ui/App.tsx:192-198`: the technical-error filter in `showError` does not match `QuotaExceededError`.
  - `App.tsx:349`: the "Local save failed" status.
  - `App.tsx:352`: "Everything saves in this browser."
  - `src/application/routeDefinitionService.ts:1003`.
- Governing source: Decision 0001, Consequences: "Clearing site data or changing browser profiles may remove access to locally stored projects." and "Database migrations and reliable backup/restore are required before the tool is considered usable for substantive work." No document decides whether the app should request persistent storage or prompt for backups. That omission is part of the finding.
- Evidence:
  - Lead grep: `grep -rn "navigator.storage\|QuotaExceeded" src` returns nothing.
  - `p6-quota.spec.ts` simulates the failure by patching `IDBObjectStore.put/add` to throw `QuotaExceededError` after the app loads; real quota exhaustion was not reproduced. `navigator.storage.persisted()` returns `false`.
  - A Route edit, Build Trips and New Block each show "The current transaction exceeded its quota limitations. QuotaExceededError: …". None tells the planner what to do.
  - "Local save failed" stays displayed after later actions.
  - The only backup affordance is the "Backup project JSON" menu item (`App.tsx:329`).
- Consequence: without `persist()`, the browser can evict the storage under pressure. Eviction was not reproduced here, so that part is Suspected. Because of S0 findings 4-001 and 4-002, a JSON backup is the planner's only recovery path, and the app neither protects the store nor prompts for a backup.
- Confidence: Confirmed (absence of the calls; message text under a simulated failure); Suspected (eviction)
- Verified by: review lead (grep), Sonnet analyst S1
- Fix scope: structural plus UI, 2–3 files:
  - Request `persist()` once after the first successful save.
  - Map `QuotaExceededError` to a plain message: "Browser storage is full. Export a backup, then free space."
  - Optionally add a last-backup reminder. This part is a UX decision; it would be Sol-class if it is novel, Luna-class if it reuses the notice pattern.
  - Record the choice in Decision 0001 or a new decision record.
- User decision required: yes. Should the app protect local data actively?
  - (a) Request persistent storage, map quota errors to plain guidance, and show when the last backup was exported (recommended).
  - (b) Document that backups are entirely the planner's responsibility, and change only the error text.

### 6-004: The deploy workflow publishes every push to `main` without running tests, and no workflow runs on pull requests (L-14)

- Severity: S2
- Category: pipeline
- Location: `.github/workflows/deploy-pages.yml:3-6` (`on: push: branches: [main]` and `workflow_dispatch` only) and `:34-35` (the only check is `pnpm build`); `package.json:9` (`"build": "tsc -b && vite build"`).
- Governing source: `AGENTS.md` Verification ("Domain or persistence logic: run focused tests and TypeScript typechecking"; "UI behavior: run typechecking, relevant UI tests, a production build"). The repository enforces none of these before publishing.
- Evidence:
  - `tsc -b` does typecheck `src/**`, including its 29 test files (`--listFilesOnly`), so a type error blocks deployment.
  - Neither Vitest (205 tests, 4.3 s) nor Playwright runs.
  - The consequence is already present: the baseline shipped with 7 failing browser tests (Section 3 of the plan, A-001), and nothing caught them.
- Confidence: Confirmed
- Verified by: Sonnet analyst S1; the lead read the workflow
- Fix scope: build, 1–2 files. See the proposed workflow in Section 3.
- User decision required: no

### 6-005: Two capacity operations exceed the 1 s threshold: "Regenerate selected" on a 500-row Direction table (2.5 s to review, 2.5 s to apply) and JSON restore of the capacity backup (1.9 s)

- Severity: S3
- Category: performance
- Location: `src/ui/App.tsx:1663`: the recalculation dialog renders one row per selected Trip, each with an anchor `<select>` listing every Pattern point (476 rows; 14,311 `<option>` elements; 20,049 DOM nodes). The restore path is `backupRepository` import (parse 52 ms in Node; the rest is cloning and about 12 MB of IndexedDB writes).
- Governing source: OV-CAP-01 "smooth … recalculation … at that scale"; plan threshold: an interaction over 1 s.
- Evidence: `p6-regenerate-timing.spec.ts`, 3 runs: 2.47 s to review and 2.54 s to apply at 500 rows; 0.74 s and 0.90 s at 250 rows. In Node, `previewRecalculateTrips(500)` takes 36 ms. Restore: `p6-capacity-ui.spec.ts`, 1.93 s.
- Attribution:
  - Regeneration: the CPU profile shows native DOM and layout as the largest share. This is probable, not isolated.
  - Restore: it is a one-time whole-file operation.
- Confidence: Confirmed (timings); Probable (attribution for regeneration)
- Verified by: Sonnet analyst S1 (not re-run by the lead)
- Fix scope: UI, 1 file, Sol-class. Rendering the anchor select only where needed changes the dialog's interaction, so it needs design judgment. No fix is recommended for restore.
- User decision required: no. A dialog change goes through a Sol-class UI package.

### 6-006: `pnpm typecheck` does not cover `tests/ui/*.spec.ts` or `playwright.config.ts`; including them fails on `process` because `@types/node` is absent (L-13, A-008)

- Severity: S3
- Category: build
- Location: `tsconfig.json:3` (`"include": ["src", "vite.config.ts", "vitest.config.ts"]`); `playwright.config.ts:5`; `package.json` devDependencies (no `@types/node`).
- Governing source: Phase A finding A-008; `AGENTS.md` Verification.
- Evidence: the scratch config `w3/s1/tsconfig.tests.json` extends the root config and adds `tests/ui/*.ts` and `playwright.config.ts`. `pnpm exec tsc --noEmit -p` on it gives exactly one error: `playwright.config.ts(5,28): error TS2580: Cannot find name 'process'`. The lead re-ran it with the same result. The 10 spec files compile clean, so the gap is latent.
- Confidence: Confirmed
- Verified by: review lead (re-run), Sonnet analyst S1
- Fix scope: build, 3 files: add `@types/node` (matching the chosen Node line, 6-007), extend `include`, and update the lockfile.
- User decision required: no

### 6-007: The Node and pnpm versions are not pinned, and CI uses Node 20, which is end-of-life

- Severity: S3
- Category: build
- Location: `.github/workflows/deploy-pages.yml:28-30` (`version: 10`, `node-version: 20`); `package.json` (no `engines` or `packageManager` field); no `.nvmrc` file.
- Governing source: none states a version. The constraint is `node_modules/vite/package.json` `"engines": {"node": "^20.19.0 || >=22.12.0"}`.
- Evidence:
  - Local versions are Node 22.22.0 and pnpm 10.28.0.
  - CI floats to the latest Node 20.x, which reached end-of-life on 2026-04-30 (Node.js release schedule).
  - GitHub Actions are pinned by tag, not by SHA.
  - No breakage has been observed.
- Confidence: Confirmed (facts); Suspected (consequence)
- Verified by: Sonnet analyst S1
- Fix scope: build, 2–3 files.
- User decision required: yes. Which Node line should the repository standardise on?
  - (a) Node 22 LTS in CI, `engines`, `packageManager` and `.nvmrc` (recommended; it matches local use).
  - (b) Keep Node 20, accepting that it is end-of-life.

### 6-008: The built `index.html` has no doctype, charset or viewport; quirks mode enlarges table text from 14 px to 16 px

- Severity: S3
- Category: build
- Location: `index.html:1`. The built `dist/index.html` is unchanged apart from the injected tags.
- Governing source: `src/styles.css:1` `:root { font-size: 14px }` (in quirks mode, tables do not inherit font size). Cross-reference: Phase 5 finding 5-013 (accessibility side).
- Evidence: `p6-quirks.spec.ts` compares the same build with and without `<!doctype html><meta charset="utf-8"><meta name="viewport" …>`:
  - `compatMode` is `BackCompat` versus `CSS1Compat`.
  - Table text is 16 px versus 14 px.
  - The 30-column Trips table is 2,955 px wide versus 2,870 px.
  - The Blocking Blocks table is 2,973 px tall versus 2,670 px.
  - Charset: no defect observed.
- Confidence: Confirmed
- Verified by: Sonnet analyst S1 (the lead confirmed the file content)
- Fix scope: build, 1 file, Luna-class. Afterwards, the `tests/ui` layout specs must be re-run and the pages visually inspected, because every existing browser test currently runs in quirks mode. Stage 3 should merge this with 5-013.
- User decision required: no. The 14 px root size in `styles.css` already states the intended design. The analyst proposed a decision; the lead judged one unnecessary.

### 6-009: `zod` and `@tanstack/react-table` are declared runtime dependencies but are never imported (L-08)

- Severity: S3
- Category: build
- Location: `package.json` `dependencies`; `architecture_overview.md:67` (OV-TECH-02: "Zod 4 (reserved for import/migration validation), TanStack Table 8 (headless table capability)").
- Governing source: OV-TECH-01 ("a runtime schema validator for imported data and migrations") and OV-TECH-02.
- Evidence:
  - H1 inventory, confirmed by a lead grep: no file in `src/`, `tests/`, `tools/` or the root configs imports either package. Both are in the lockfile.
  - Backup import validation is hand-written (Phase 3, 3.3).
  - The bundle is unaffected, because neither package is imported.
- Confidence: Confirmed
- Verified by: review lead (grep), Haiku H1 (inventory)
- Fix scope: build plus docs, 2–3 files.
- User decision required: yes (plan Section 8.4 item 6).
  - (a) Remove both dependencies, and amend OV-TECH-01 and OV-TECH-02 to record that validation is hand-written (recommended; Phase 3 found the hand-written validator adequate where tested).
  - (b) Adopt Zod for backup validation as a separate structural package, and remove only TanStack Table.

### 6-010: `pnpm audit` reports 11 advisories in the dev toolchain (2 critical, 2 high), and five dependencies are a major version behind

- Severity: S3
- Category: build
- Location: `package.json` `devDependencies` (`vite` ^7.1.3, locked 7.3.6; `vitest` ^3.2.4, locked 3.2.7); `pnpm-lock.yaml`.
- Governing source: none. Plan task 6.4.
- Evidence: `pnpm audit` (re-run by the lead) reports "11 vulnerabilities found. Severity: 1 low | 6 moderate | 2 high | 2 critical".
  - `tinypool`: GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr (critical), via `vitest`.
  - `vite`: GHSA-587h-7wmj-h5pm (high), plus GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-rq7h-c2jc-7f22 (moderate) and GHSA-9jrq-w75r-8gcw (low); patched in 7.3.7.
  - `source-map-js`: GHSA-68fv-2mgg-jv7q (high), via `vite > postcss`.
  - `vitest` / `@vitest/mocker`: GHSA-82fw-gwwq-j7x9 and GHSA-qxg6-89mg-rqv8 (moderate); patched in 4.1.11 and later.
  - Every path starts at `vite` or `vitest`, which are dev tools. No runtime dependency is affected, and the shipped bundle contains none of them.
  - The `vite` fix is within the declared range (7.3.7). The `vitest` and `tinypool` fixes need a `vitest` major upgrade.
  - `pnpm outdated` new majors: `@tanstack/react-table` 9, `@vitejs/plugin-react` 6, `typescript` 7, `vite` 8, `vitest` 5. Patch updates exist for `dexie`, `react`, `react-dom`, `zod` and `@playwright/test`.
- Consequence: exposure is limited to developer machines running the dev server or tests. Planner data and the published site are not affected.
- Confidence: Confirmed
- Verified by: review lead (re-run), Haiku H1 (inventory)
- Fix scope: build, 2 files (`package.json`, lockfile). Update `vite` within its range now. A `vitest` major upgrade is a separate package that needs a full test re-run.
- User decision required: no

### 6-011: The app ships as one 765 kB JavaScript chunk, and every build emits Vite's 500 kB warning

- Severity: S3
- Category: build
- Location: `vite.config.ts` (no `build` options); `src/main.tsx` (static imports of every workspace).
- Governing source: plan task 6.3: "S3 unless load time is materially affected."
- Evidence: H1 build: `index-*.js` 764.60 kB (210.11 kB gzip), with the warning "Some chunks are larger than 500 kB". There are no dynamic imports. By source bytes, `react-dom` is 39% and `App.tsx` 15%. At 210 kB gzip, load time on a desktop connection is not materially affected. Once loaded, the site works offline.
- Confidence: Confirmed
- Verified by: Haiku H1 (inventory); the lead read the build output
- Fix scope: build, 1–2 files. Lazy-load the Blocking and Costing workspaces, or raise `chunkSizeWarningLimit` with a recorded reason. Optional.
- User decision required: no

## 3. Proposed minimal CI workflow (proposal only; not written to `.github/`)

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

- **Deploy gate:** either add `pnpm typecheck` and `pnpm test` before "Build application" in `deploy-pages.yml`, or trigger the deployment from `workflow_run` on a successful `CI` run.
- **Browser tests:** keep `pnpm test:ui` as a second, optional job. It needs `pnpm exec playwright install --with-deps chromium` (CI has no `/opt/pw-browsers`). Make it required only after the stale and impossible browser tests from Phase A and Phase 5 (A-001, 5-001) are fixed; otherwise it fails at once.
- **Typecheck scope:** after 6-006, `pnpm typecheck` should cover `tests` and `playwright.config.ts`.

## 4. Areas examined with no defects found

- **Domain and application at capacity (Node):** generation, recalculation, Blocking summaries, costing, and backup export and import are each under 200 ms (table 1a).
- **ScheduleTable at 500 rows:**
  - The O(n²) duplicate-departure check (4-014) takes 3.4 ms.
  - The per-row runtime recompute is at most 92 ms (`segmentStartTimes` ×500).
  - In the browser, every row toggle and display toggle stays under 1 s.
  - 4-014 stays a layering finding, not a performance one.
- **Trips timetable first render:** 0.53 s at 500 rows.
- **JSON backup export:** under 0.7 s at capacity.
- **Deep link and reload on GitHub Pages:** there are no client-side routes, and the relative base works.
- **Lockfile integrity:** the frozen offline install matches `package.json`.
- **Local verification:** `pnpm typecheck`, `pnpm test` (29 files, 205 tests) and `tsc -b` pass.
- **Charset:** non-ASCII interface text decodes correctly without a `<meta charset>`.

## 5. Delegated and inherited claims rejected or changed on verification

| Claim | Source | Result |
| --- | --- | --- |
| "`jszip` is declared but never imported." | Phase 4 hand-off (Section 6 of `phase-4.md`, task 4.1 row) and the Wave 3 handoff prompt | **Rejected.** `jszip` is not in `package.json` or `pnpm-lock.yaml`, and nothing imports it (H1 grep, re-checked by the lead). ZIP files are written by the hand-written `createCsvArchive` (`src/ui/csvDownload.ts`). The `phase-4.md` statement should be corrected in Stage 3. |
| P6-S1-01 is S1 ("broken primary workflow with no workaround"). | Analyst S1 | **Lowered to S2.** Trips-table Block assignment (Decision 0025; `App.tsx:919-960` → `blockingService.assignTripsToBlock`, `blockingService.ts:108`) assigns several Trips in one call and never calls `classifyInsertion`. This is a workaround as the rubric defines it. The lead traced this path but did not time it. |
| `getBlockSummary` fan-out is at `main.tsx:35`. | Analyst S1 | Location corrected to `main.tsx:43` (lead grep). The substance stands. |
| 6-008 needs a user decision. | Analyst S1 | Not needed. `styles.css` already sets the intended 14 px. |
| "'wanted' equals 'current' for every package, so declared ranges block all of these updates." | Haiku H1 | **Rejected.** `pnpm outdated` prints no "wanted" column. The declared caret ranges allow the patched `vite` 7.3.7 and the patch updates of `dexie`, `react`, `react-dom` and `zod`. Only the lockfile holds them back. |
| `costingTabMs` values in `w3/s1/ui-*.json` | Analyst S1 (self-reported) | The analyst marked these values invalid: they were wait-timeout artefacts. They are not used anywhere in this file. |

## 6. Leads handed to other phases

| Lead | Owner |
| --- | --- |
| Merge 6-001 with 4-008 (same root cause; 6-001 carries the measurement). | Stage 3 |
| Merge 6-008 with 5-013 (`index.html`). | Stage 3 |
| Correct the `jszip` statement in `phase-4.md` Sections 1 and 6. | Stage 3 |
| The backup exporter pretty-prints (`backup.ts:474`, `JSON.stringify(backup, null, 2)`), which doubles file size (5.2 MB compact → 10.2 MB). This is not a defect under any governing document. | Stage 3, for information only |
| GitHub Pages serves every repository of one account from one origin, so IndexedDB and `localStorage` are shared with sibling Pages sites (fixed database name `transit-costing-tool`). Not measured; relevant to 6-003. | Stage 3 (consider with 6-003) |
| The 6-002 interim message ("Select a valid Blocking Scenario…") is a Costing presentation gap that Phase 5 task 5.8 did not cover. | Stage 3 (UI package with 6-002) |

## 7. User decisions required

1. **6-003, local data protection:** (a) request persistent storage, map quota errors to plain guidance, and show when the last backup was exported (recommended); or (b) document that backups are the planner's responsibility and change only the error text.
2. **6-007, Node line:** (a) Node 22 LTS everywhere, pinned with `engines`, `packageManager` and `.nvmrc` (recommended); or (b) keep Node 20, which is end-of-life.
3. **6-009, Zod and TanStack Table (plan Section 8.4 item 6):** (a) remove both and amend OV-TECH-01 and OV-TECH-02 (recommended); or (b) adopt Zod for backup validation in a separate package, and remove TanStack Table.

## 8. Gate

Exit criteria are met:

- **Capacity targets measured:** the OV-CAP-01 fixture was measured in Node and in Chromium (Section 1). Every threshold breach is recorded with profiler or timing evidence (6-001, 6-002, 6-005).
- **CI gap documented with a proposed workflow:** 6-004 and Section 3.
- **Dependency list complete:** 6.4, 6-009 and 6-010; H1 inventory.

Phase 6 has no S0 or S1 findings.
