# Phase 4 Findings: Application Layer and Cross-Layer Contracts

- Status: Complete. Gate report pending user review.
- Baseline: `main` at `baed9f1`; review branch `claude/upbeat-ritchie-51mpy5`.
- Operating model: plan Section 4.6 (amended). The review lead orchestrated directly. Two Haiku sweeps produced inventories (H1: imports, symbols, ports, catches; H2: destructive actions, messages, dialogs). Phase 4 questions were answered by these Sonnet analysts:
  - A1: preview/commit and stale protection.
  - A2: contracts, layering and dead code.
  - B1: concurrency and selection state, in a browser.
  - R1–R5: a single code-reading pass over `App.tsx` 1–360 together with `CostingWorkspace.tsx` and `MenuButton.tsx`, then `App.tsx` 361–1000, 1001–1408 and 1409–1800, and `BlockingWorkspace.tsx`.
- Verification by the review lead:
  - Both S0 findings were reproduced in Chromium on IndexedDB. For 4-001, the lead wrote the reproduction. For 4-002, the lead re-ran the analyst's specs with `test.fail` removed, and each test fails on its own data assertion.
  - All 13 Phase 4 browser specs and all 12 Phase 4 Vitest reproductions were re-run.
  - These findings were confirmed by code reading: R5-01 (4-007), R2-03 (handed to Phase 5), R1-04 (4-014) and R4's dead-code correction.
  - Two delegated claims were rejected (Section 5).
- Evidence:
  - Vitest: `docs/review/golden/p4-*.golden.test.ts`.
  - Browser: `docs/review/golden/p4-*.spec.ts`, run with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p4-playwright.config.ts` (port 4184).
  - Defect tests assert the expected behaviour and use `it.fails` or `test.fail()`, so they report as passing while the defect exists.
- Analyst reports (scratch, not committed): `w2/<analyst>/report.md` in the session scratchpad. A1 could not write its report file, so its operation table below is taken from its reply.

## 1. Task results

| Task | Verdict |
| --- | --- |
| 4.1 Import graph | 39 non-test modules, 0 file-level cycles. H1 found none, and A2 confirmed with its own depth-first search. There are no domain → outer-layer imports and no application → UI imports. There are 3 UI → persistence edges, which violate OV-TECH-03 (4-013). There are 30 UI → domain import statements covering 85 symbols (see 4.2). External packages imported: `react`, `react-dom`, `dexie`. `zod` and `@tanstack/react-table` are declared but never imported; this is handed to Phase 6. (Corrected in Stage 3A: an earlier version also named `jszip`, which is not declared, not locked and not imported; see `phase-6.md` Section 5.) |
| 4.2 UI → domain classification | Permitted: formatting and parsing helpers (`formatServiceTime`, `parseServiceTime`, `formatRuntimeDuration`, `roundCostingDisplay`, `sortServiceDays`) and error classes. Boundary violations: `validateCostingAssumptions` (CostingWorkspace:76), `createBlockingScenarioSourceSignature` (App.tsx:909; BlockingWorkspace:146, 316), render-time runtime calculation (`selectRuntimeBand`, `segmentStartTimes`, `blendSegmentTimes`, `calculateTimepointHeadways` in ScheduleTable), `MAX_TRIPS_PER_GENERATION` validation duplicate, and `newId` in UI band/activity creation. Recorded as 4-014. |
| 4.3 Business logic in React | The inventory is complete across all five ranges and is recorded as 4-014. The analysts found no input where the live UI computes a different number than the domain. There are two exceptions where UI-only logic is defective: 4-007 (bulk deadhead apply) and 4-018 (a blank minutes field becomes 0). The L-12 time arithmetic and the `stopTimes[0]` sort are in dead code only (R2). |
| 4.4 Dead code | Confirmed: the legacy generation-set UI (`TripScheduleWorkspace`, `RuntimeWorkspace`, `DirectionSetup`) and its exclusive children; 11 App-level route handlers; `UndoIcon`/`RedoIcon`; 22 zero-reference exports; 11 dead service methods, including `deleteNode` (3-008). None is reachable from a menu or stored state. Recorded as 4-015 (S3). |
| 4.5 Preview/commit stale protection | Operation table in Section 3. 13 Blocking commits, recalculation, Trip copy, Runtime copy, staged shift and route edits reject a stale preview. Gaps: 4-003 (Pattern change), 4-004 and 4-019 (Trips CSV), 4-020 (deletions). Stale checks outside Blocking run before the write transaction (4-021). The Scenario-wide record writes have no protection at all (4-001). |
| 4.6 Concurrency (two tabs) | **S0 (4-002).** Nothing in `src/` handles `versionchange`, `liveQuery`, `BroadcastChannel` or the `storage` event, and no record carries a version token. Every save is last-writer-wins and silent. Only Blocking edits and a staged shift refuse a stale tab. |
| 4.7 Port completeness | The real UI contracts are `Pick<>` aliases (`RouteDefinitionApplication`, `TripGenerationApplication`), which the compiler enforces, plus the Blocking and Costing ports. Nine interfaces in `ports.ts` are unused. Four of them no longer match the service method names (4-022). |
| 4.8 Error handling | Every UI catch reaches `showError`/`onError`, and no write failure is swallowed. Gaps: save status is published only for Route saves (4-006); startup and selection reloads have no catch (4-016); raw or garbled messages bypass the technical-error filter at seven more sites (4-017); `tripGenerationService.ts:589-593` uses a bare `catch {}` (4-024). |
| 4.9 Selection state | Safe fallback for invalid JSON, wrong types, IDs that don't exist, IDs from another Project, renamed records, and a View year horizon that shrinks. B1 tested these in the browser. A JSON `null` value in either localStorage key blanks the app (4-010). |

## 2. Findings

### 4-001: Service day edits write the App's startup copy of the Scenario over newer Trips, Blocks, and Runtime profiles

- Severity: S0
- Category: data-integrity
- Location: `src/ui/App.tsx:134` (the `records` state), `App.tsx:168,199` (the only places it is refreshed), `App.tsx:254` (`updateServiceDay`) and `App.tsx:508` (Service day name `onBlur` and annual-count commit); `src/application/routeDefinitionService.ts:419-421`; `src/persistence/dexieRepository.ts:92-142` (`saveScenarioRecords` bulk-deletes every stored record that is absent from the caller's copy and overwrites the rest). The same unprotected path is used by `renameScenario` (`:313`), `addRoute` (`:364`) and `duplicateRoute` (`:369`), called from `App.tsx:216,236,238`.
- Governing source: OV "Related writes must occur in one database transaction" and the Phase 3 rule set for preview and commit; plan Section 5.2 S0 "a non-atomic write leaves orphaned references" and "silent data loss". D0012-04 (save status) is not triggered, because the save succeeds.
- Evidence: `docs/review/golden/p4-stale-records.spec.ts`, reproduced by the review lead in Chromium on IndexedDB with the Federal BRT dataset.
  1. Open the app. Trips tab → Trip actions → Build trips… → build 3 Trips. Trip count goes from 984 to 987.
  2. Route tab → click into "Weekday name" and leave it without typing. Trip count is **984**, and stays 984 after reload.
  3. Second test: after the app loads, edit a Trip's times, add a Block and rename a Runtime profile, then blur the same field. The Trip time is **reverted**, the Block is **deleted**, and the Runtime profile name is **reverted**.
  4. Application-layer reproduction: `p4-stale-preview.golden.test.ts` (A1-01, two tests).
- Trigger and blast radius: the app keeps one Scenario snapshot from load time. Writes from the Trips, Blocking and Runtime workspaces never refresh it (`TripsWorkspace` never calls `onReload`, and switching tabs does not reload). Any later Service day edit therefore destroys that work. A no-change blur is enough, because the name field saves on every blur.
  - Rename scenario, New route and Duplicate route use the same call shape; they are traced, not reproduced in the UI (the lead's attempt to drive New route did not reach the menu item).
  - Duplicate scenario copies the stale snapshot, so the copy silently omits recent work.
- Confidence: Confirmed (Service day path); Probable (the other three triggers)
- Verified by: review lead (own reproduction), plus analyst A1 (application-layer tests)
- Fix scope: structural. The smallest fix is to have `updateServiceDay`, `renameScenario`, `addRoute` and `duplicateRoute` re-read the Scenario inside the write, or write only the changed tables or records instead of the whole Scenario through `saveScenarioRecords`. Also skip the no-change name save. About 2–3 files plus tests.
- User decision required: no

### 4-002: A second browser tab silently deletes or reverts data saved in the other tab

- Severity: S0
- Category: data-integrity
- Location: no cross-tab coordination exists anywhere in `src/`: no `versionchange`, `liveQuery`, `BroadcastChannel` or `storage` listener, and no version token on any record. Overwrite points:
  - `dexieRepository.ts:92-142`: Scenario records.
  - `dexieRepository.ts:179`: the Route aggregate save.
  - `dexieRepository.ts:309`: Runtime profile save.
  - `costingService.ts:25`: Costing assumptions.
  - `dexieRepository.ts:411`: Trip insert without checking that the Trip Profile exists.
- Governing source: Decision 0001 (local-first storage is the only copy, so a lost write cannot be recovered); OV persistence rules; S0 definition. No document decides or states a single-tab assumption; that omission is a docs finding.
- Evidence: `docs/review/golden/p4-concurrency.spec.ts` and `p4-selection.spec.ts`, by analyst B1. The lead re-ran all of them, and also re-ran B1-02 and B1-03 without `test.fail`; each fails on its data assertion. Tab A holds older data; tab B saves first; then tab A saves:
  - A Route description edit in A deletes the Node B added (B1-02).
  - A Short name edit in A reverts B's Route rename (B1-02).
  - An annual-count edit in A deletes the Route B added and reverts B's Block reorder (B1-01, which is 4-001 across tabs).
  - A Runtime band save in A reverts B's band value: stored segments 300 s instead of 540 s (B1-03).
  - A Costing save in A overwrites B's rate: 200 becomes 100 (B1-04).
  - A Route edit in A re-creates a Project that B deleted, as invisible orphan rows (B1-07).
  - Build Trips in A on a Trip Profile that B deleted stores 3 Trips with a missing profile and no error (B1-08).
  - Control: a stale Blocking edit is refused with "Blocking Scenario changed…".
- Confidence: Confirmed
- Verified by: review lead (re-run), Sonnet analyst B1
- Fix scope: structural. Options are in the user decision below. About 3–6 files.
- User decision required: yes. How should the app handle two tabs?
  - (a) Allow only one active tab: a `BroadcastChannel` or Web Locks guard, with other tabs made read-only.
  - (b) Add a per-aggregate concurrency token that is checked inside each write transaction, rejecting stale saves.
  - (c) Document two tabs as unsupported and do nothing else.
  - Recommendation: (a). It is the smallest change that removes the S0, and it matches a single-user local tool. (b) is the complete fix but touches every repository write. A Dexie `versionchange` handler (B1-09: a tab on an older schema keeps writing after an upgrade) belongs in the same package under either option.

### 4-003: A single-Trip Pattern change commits the preview without a stale check

- Severity: S2
- Category: contract
- Location: `src/application/tripGenerationService.ts:351` (`changeTripPattern`)
- Governing source: D0018 and D0031 preview/commit rules ("commit re-reads authoritative data and rejects a stale preview").
- Evidence: `p4-stale-preview.golden.test.ts`, A1-02 (two tests). If a Trip is shifted after the Pattern-change review, committing the review discards the shift. If the target profile changes after review, the Trip is stamped with the new revision on times that revision does not produce, so `listStaleTrips` returns `[]`. That is a second route into Phase 2 findings 2-004 and 2-005.
- Confidence: Confirmed
- Verified by: Sonnet analyst A1; the lead re-ran the test
- Fix scope: structural; 1 file plus a test.
- User decision required: no

### 4-004: Trips CSV import moves a Trip from the other Direction into this Direction's Pattern

- Severity: S2
- Category: data-integrity
- Location: `src/application/tripGenerationService.ts:239-240` (existing Trips are filtered by Route only)
- Governing source: `phase-02r-trip-table-interchange-undo.md`: an import "updates Trips … of the displayed schedule"; omitted Trips remain unchanged.
- Evidence: `p4-stale-preview.golden.test.ts`, A1-03. An inbound `tripId` in an outbound-context import is moved to the outbound Pattern with no finding, and its Block activity still references it. This confirms the Phase 3 lead.
- Confidence: Confirmed
- Verified by: Sonnet analyst A1; the lead re-ran the test
- Fix scope: structural; 1 file.
- User decision required: no

### 4-005: `updateServiceDay` saves annual counts of 400, −5, 1.5, and NaN, and blank or untrimmed names

- Severity: S2
- Category: contract
- Location: `src/application/routeDefinitionService.ts:419-421`
- Governing source: PL05-AC3 "The count sum never exceeds 365 in new edits"; the data schema says annual counts are whole non-negative numbers.
- Evidence: `p4-stale-preview.golden.test.ts`, A1-05 (application layer). This extends Phase A A-005, which found only the missing 365 check. The UI side (no message) is Phase 5 finding 5-005. R2-08: names are saved empty or untrimmed.
- Confidence: Confirmed
- Verified by: Sonnet analyst A1
- Fix scope: structural; 1 file (validation in the service, with the existing field-error pattern in the UI).
- User decision required: no

### 4-006: Only Route saves publish the visible save status; Trips, Blocking, and Costing writes never show "Saving locally…" or "Local save failed"

- Severity: S2
- Category: contract
- Location: `src/application/routeDefinitionService.ts:997-1004` (the only publisher); 33 repository writes in `tripGenerationService.ts`, `blockingService.ts` and `costingService.ts` bypass it; `App.tsx:349` (indicator)
- Governing source: `architecture_overview.md:289` (visible local-save status); D0012-04; `phase-04-manual-blocking.md:208`.
- Evidence: grep (A2) and code trace (R1, R2). Failures in the other three services still reach the generic error banner, so they are not silent. But the status indicator never reflects them, and an error status stays until the next Route save.
- Confidence: Confirmed (code)
- Verified by: Sonnet analysts A2, R1, R2 (three independent traces)
- Fix scope: structural; about 4 files.
- User decision required: yes. Should the save status cover every write, as the overview reads, or only Route definition saves? Recommendation: every write.

### 4-007: "Apply to all similar Trips" in the deadhead dialog skips every second matching connection

- Severity: S2
- Category: correctness
- Location: `src/ui/BlockingWorkspace.tsx:214`
- Governing source: D0023 (relative deadhead connections) and D0024 (bulk boundary activities): apply to every matching connection.
- Evidence: `revenueIndices` is computed once, but deadheads are inserted with `splice(previousIndex + 1, 0, …)`. Every later index then points one activity early, so the next pair resolves to a deadhead, fails the Pattern lookup, and is skipped by `continue`. A copy of the loop run on 5 matching Trips gives `t1 DH t2 DH t3 t4 t5`: 2 of 4 connections (R5, `R5/loop.mjs`). The lead confirmed this by reading the code. No test covers the checkbox.
- Confidence: Probable (logic executed on a copy; the UI was not driven)
- Verified by: review lead (code read), Sonnet analyst R5
- Fix scope: structural (move the bulk apply into `blockingService`, or iterate from the end); 1–2 files plus a test.
- User decision required: no

### 4-008: Blocking compatibility classification re-reads every Trip and Pattern once per unassigned Trip

- Severity: S3
- Category: performance
- Location: `src/ui/BlockingWorkspace.tsx:197-200` → `src/application/blockingService.ts:213` (`classifyInsertion`)
- Evidence: `p4-blocking-compat-fanout.golden.test.ts`. 250 candidates cause 250 `listTrips` and 250 `listPatterns` reads. This re-runs on every Block selection and activity change, and Assign is disabled until it finishes. Wall-clock cost was not measured; Phase 6 task 6.2 should measure it at capacity. A2 found the same pattern in `getBlockSummary` (one Scenario read per Block).
- Confidence: Confirmed (call count)
- Verified by: Sonnet analyst R5
- Fix scope: structural; 1–2 files.
- User decision required: no

### 4-009: The Trips tab and generation commands accept a Trip Profile that no longer exists

- Severity: S2
- Category: data-integrity
- Location: `src/persistence/dexieRepository.ts:411`; `tripGenerationService.ts` generate path
- Governing source: D0016 (every Trip belongs to a Trip Profile); D0019 ownership.
- Evidence: `p4-selection.spec.ts`, B1-08. Build Trips in a tab whose Trip Profile was deleted elsewhere stores 3 Trips with a missing profile and shows no error. The cross-tab trigger is covered by 4-002; this finding is the missing reference check inside the write.
- Confidence: Confirmed
- Verified by: Sonnet analyst B1; the lead re-ran the test
- Fix scope: structural; 1–2 files.
- User decision required: no

### 4-010: A JSON `null` in either selection-preference key blanks the app

- Severity: S2
- Category: correctness
- Location: `src/ui/App.tsx:41,178`; `src/ui/BlockingWorkspace.tsx:32,183`
- Governing source: D0021-08 (selection state is non-authoritative and falls back safely).
- Evidence: `p4-selection.spec.ts`, B1-06. `null` in `route-selection.v1` gives a white screen on every load. The key is rewritten only after a successful load, so it cannot fix itself. `null` in the Blocking key blanks the app when Blocking opens. R1-01 traced the same thing from code. The only recovery is clearing site data.
- Confidence: Confirmed
- Verified by: Sonnet analyst B1; the lead re-ran the test
- Fix scope: UI (shape check on load), Luna-class; 2 files.
- User decision required: no

### 4-011: Trip Profile deletion review token ignores Blocking Scenarios

- Severity: S3
- Category: contract
- Location: `src/application/tripGenerationService.ts` (`deleteTripProfile`, optional token at `:82`)
- Evidence: `p4-stale-preview.golden.test.ts`, A1-07. An empty Blocking Scenario created after the review is deleted silently. The token is also optional.
- Confidence: Confirmed
- Verified by: Sonnet analyst A1
- Fix scope: structural; 1 file.
- User decision required: no

### 4-012: `deleteTrips` removes Block activities its review did not show; Route, Scenario, Runtime profile, and Project deletes have no review token

- Severity: S3
- Category: contract
- Location: `src/application/tripGenerationService.ts:436`; the delete methods in `routeDefinitionService.ts`
- Evidence: `p4-stale-preview.golden.test.ts`, A1-06.
- Confidence: Confirmed
- Verified by: Sonnet analyst A1
- Fix scope: structural; 2 files.
- User decision required: no

### 4-013: UI modules import persistence serializers (L-09)

- Severity: S3
- Category: layering
- Location: `src/ui/tripTableCsv.ts:3` (`toCsv`); `src/ui/csvDownload.ts:1-2` (re-exports `createCsvArchive`, `CsvArchiveFile`)
- Governing source: OV-TECH-03 "React does not import … persistence serializers."
- Evidence: H1 import graph, confirmed by A2. `runtimePaste.ts` imports only the domain and is permitted. Phase 3 finding 3-012 sits in the shared `toCsv`.
- Confidence: Confirmed
- Verified by: Sonnet analyst A2; the lead re-checked the imports
- Fix scope: structural; move both modules to `src/application`, about 4 files.
- User decision required: yes. Move the modules (recommended), or amend OV-TECH-03 to permit CSV serializers in `src/ui`?

### 4-014: Business rules implemented in React components (4.2/4.3 inventory)

- Severity: S3
- Category: layering
- Location, grouped by destination layer:
  - **Domain:**
    - Runtime band assembly, sequence renumbering and IDs (`App.tsx:1255-1337`).
    - Reverse-candidate eligibility (`App.tsx:1058`, duplicating `runtime.ts:331`).
    - Shift rules: minutes to seconds and the positive-integer check (`App.tsx:1110`); the net-shift label (`:1127`, `:1417`).
    - Duplicate-departure rule (`:1412`, O(n²)).
    - Display rounding (`:1481`).
    - Usable-Pattern rule, repeated four times (`:535,596,775`, plus `serviceDayCopy.ts:201`).
    - `serviceDayOrder` (`:363`): no id tie-break, unlike `sortServiceDays`.
    - Direction sort without `normalizeDirections` tie-breaks (`:184,353`).
  - **Application:**
    - Block assignment and unassignment impact counts (`:1520-1561`, copying the private `removeSelectedTripsFromBlock`).
    - Build Trips validation (`:1585-1594`, duplicating `validateGenerateTripsRequest`).
    - Costing day total, the >365 check, year list and 10-year clamp (`CostingWorkspace.tsx:70,140-155`).
    - Blocking reorder grouping, activity insertion and ownership filter (`BlockingWorkspace.tsx:120`, against `ui-conventions.md:12`).
    - Layover % (duplicated at `:297`, `:311`).
  - **UI → domain calls that should go through ports** (4.2): `validateCostingAssumptions`, `createBlockingScenarioSourceSignature`, render-time `selectRuntimeBand`/`segmentStartTimes`/`blendSegmentTimes`.
- Governing source: OV "Architectural Principles" and "Logical Layers" (the domain owns calculations and ordering; the UI renders application results).
- Evidence: R1–R5 traces. No live input was found where the UI copy produces a different number from the domain. The only defective UI-only rules are 4-007 and 4-018. Also from R1-04: the inflation input displays float noise (0.035 is shown as 3.5000000000000004; confirmed with `node`).
- Confidence: Confirmed (code)
- Verified by: Sonnet analysts R1–R5; the lead re-checked R1-04
- Fix scope: structural; spread across several packages. Fold each item into the Stage 4 package that touches the same area.
- User decision required: no

### 4-015: Dead code: the legacy generation-set UI, 11 App-level route handlers, unused service methods and exports (L-11)

- Severity: S3
- Category: layering
- Location:
  - **Legacy generation-set UI:** `TripScheduleWorkspace` (`App.tsx:595`), `RuntimeWorkspace` (`:534`) and `DirectionSetup` (`:519`), with their exclusive children: `RuntimeProfileEditor` (`:1691`), `RuntimeProfileDialog` (`:1721`), `ServiceTimeField`, `FragmentTripRow`, `GenerationPreviewDialog`, `PatternChangeDialog`, `PatternChangePreviewDialog`, and `type RuntimeDialog` (`:517`).
  - **Unused icons:** `UndoIcon` and `RedoIcon` (`:1764,1768`).
  - **App-level route handlers:** 11 at `App.tsx:256-266`, including `deleteNode`, which reaches the latent S0 path 3-008.
  - **Service methods:** `deleteDirection`, `updateDirectionColumn`, `ensureDefaultProfile`, `getNodeDeletionFindings`, `resolveRuntimeBand`, `validateRuntimeAssignments`, `ensureDefaultTripProfile`, `validateTrip`, `getTripBlockingContext`, `blockingService.validateBlock`, `deleteNode`, and the generation-set commands `previewTripGeneration`/`applyTripGeneration`/`applyTripShift`.
  - **Other:** 22 zero-reference exports (e.g. `blocking.ts:245-249`, `durations.ts:59-62`); `selectedUnassignedTripIds` in BlockingWorkspace.
- Governing source: L-11; `data-schema.md:488,542` claims the generation-set repository methods serve a "running pre-2R UI", which is stale.
- Evidence: H1 symbol sweep, confirmed by R1, R2, R4, R5 and A2. Keep the `generationSets` table and backup parsing, because old backups still need them (`backup.ts:416-420`).
- Confidence: Confirmed
- Verified by: Sonnet analysts; the lead re-checked the R4 correction (Section 5)
- Fix scope: structural cleanup; about 6 files.
- User decision required: yes (plan Section 8.4 item 5). Delete the dead generation-set UI and commands, or keep them for a documented reason? Recommendation: delete the UI and dead commands, and keep the table and backup parsing.

### 4-016: Startup, selection reloads, and JSON/CSV export have no error handling

- Severity: S3
- Category: correctness
- Location: `src/ui/App.tsx:178` (startup `reload`), `:350,353,354` (select-driven reloads), `:286` (`exportJson`), `:288` (`exportCsv`); `.catch(() => undefined)` at `:945,964`
- Evidence: code trace (R1, R2). A failed database open shows the empty "Start a local planning project" screen with no notice.
- Confidence: Probable
- Verified by: Sonnet analysts R1, R2
- Fix scope: UI; 1 file.
- User decision required: no

### 4-017: Raw or garbled error text bypasses the technical-error filter at seven more sites

- Severity: S3
- Category: contract
- Location: `App.tsx:1599` (Build Trips), `:1646,1662` (Recalculation), `:1588` ("Invalid runtime duration: abc"); `BlockingWorkspace.tsx:76` (`blockingError` camel-splits every part, so the stale-source text becomes " Blocking  Scenario changed …" and defeats the `showError` filter; run in `R5/t.mjs`); raw `messageKey` lists from `blockingService.ts:92` (via `BlockingWorkspace.tsx:205-213,316-321`); and generic fallbacks with no next step (`App.tsx:1031,1038,1100,1264,1349`).
- Governing source: D0012-04 (technical errors never reach the user with key paths or index names).
- Evidence: R3, R4 and R5 traces. These are new relative to Phase 3 finding 3-015; Stage 3 should merge them with 3-015.
- Confidence: Confirmed (R5-06 executed); Probable (others)
- Verified by: Sonnet analysts R3, R4, R5
- Fix scope: UI; 2 files.
- User decision required: no

### 4-018: A blank minutes field saves as a 0-minute deadhead in a single save but is rejected in the bulk path

- Severity: S3
- Category: correctness
- Location: `src/ui/BlockingWorkspace.tsx:214` (`Number('')` is 0), `:223` (bulk path rejects blank), `:402` (a blank layover amount becomes a 0-minute rule)
- Evidence: code trace (R5).
- Confidence: Probable
- Verified by: Sonnet analyst R5
- Fix scope: UI; 1 file.
- User decision required: no

### 4-019: The Trips CSV review signature omits Patterns

- Severity: S3
- Category: contract
- Location: `src/application/tripGenerationService.ts:292`
- Evidence: `p4-stale-preview.golden.test.ts`, A1-04. An import reviewed before a Pattern gains a point saves a Trip with 2 times against a 3-point Pattern.
- Confidence: Confirmed
- Verified by: Sonnet analyst A1
- Fix scope: structural; 1 file.
- User decision required: no

### 4-020: `renameScenario` accepts a blank name; legacy per-field route mutators bypass preview/commit and Pattern validation

- Severity: S3
- Category: contract
- Location: `routeDefinitionService.ts:313-315` (blank name); the legacy mutators (`updatePattern` accepts a 1-point Pattern, etc.), whose App wrappers at `App.tsx:254-266` are dead (4-015)
- Governing source: D0014-01 (route edits use staged preview and commit).
- Evidence: `p4-stale-preview.golden.test.ts`, A1-08 and A1-09.
- Confidence: Confirmed
- Verified by: Sonnet analyst A1
- Fix scope: structural; 1 file (delete the dead mutators under 4-015).
- User decision required: no

### 4-021: Outside Blocking, stale checks run before the write transaction, not inside it

- Severity: S3
- Category: contract
- Location: `routeDefinitionService.ts` and `tripGenerationService.ts` commit paths. Only the Blocking writes and the Dexie regeneration write verify inside the transaction.
- Evidence: code trace (A1). This cannot be tested in memory. It matters only together with 4-002.
- Confidence: Probable
- Verified by: Sonnet analyst A1
- Fix scope: structural; folded into the 4-002 fix.
- User decision required: no

### 4-022: Nine `ports.ts` interfaces are unused, and four no longer match their services

- Severity: S3
- Category: contract
- Location: `src/application/ports.ts`. These four are unused and have method names that drifted from the services (`tsc` conformance check, `A2/conf.ts`): `RouteDefinitionCommands`, `RouteDefinitionQueries`, `RuntimeCommands`, `RuntimeQueries`. Five more are satisfied structurally but unused. 13 `Pick` members have no UI caller.
- Evidence: H1 ports sweep, confirmed by A2's conformance check.
- Confidence: Confirmed
- Verified by: Sonnet analyst A2
- Fix scope: structural cleanup; 1 file.
- User decision required: no

### 4-023: The costing context assembly in `main.tsx` is untested

- Severity: S3
- Category: test-gap
- Location: `src/main.tsx:27-45`
- Evidence: by trace, it passes the selected Scenario's service days, the Blocking Scenario's own Trip Profile, Trips filtered by that profile, and that Blocking Scenario's Blocks. The Phase A lead about `dexieRepository.ts:388` does not apply, because `main.tsx` does not call that `listTrips`. No wrong-input path exists with two Profiles or two Scenarios. The assembly still has no test.
- Confidence: Confirmed (absence of a test); traced correct
- Verified by: Sonnet analyst A2
- Fix scope: test-only; 1–2 files.
- User decision required: no

### 4-024: `listStaleTrips` marks a Trip stale on any error, including programming errors

- Severity: S3
- Category: correctness
- Location: `src/application/tripGenerationService.ts:589-593` (bare `catch {}`)
- Evidence: code read (A2). Also no `listStaleTrips` test uses a `segmentStart` profile (A1, task 2). A1 showed that a Trip with matching revision but wrong times is not reported. That is Decision 0030-01 by design, and it is why 2-004, 2-005 and 4-003 stay invisible.
- Confidence: Confirmed (code)
- Verified by: Sonnet analysts A1, A2
- Fix scope: structural plus test; 1–2 files.
- User decision required: no

### 4-025: Pasting runtime rows replaces the profile's calculation method, including in Append mode, without showing it in the preview

- Severity: S3
- Category: correctness
- Location: `src/ui/App.tsx:1335`
- Evidence: code trace (R3).
- Confidence: Probable
- Verified by: Sonnet analyst R3
- Fix scope: UI; 1 file.
- User decision required: no

### 4-026: Blocking loads have no request guard; an out-of-order response can show another day's summary

- Severity: S3
- Category: correctness
- Location: `src/ui/BlockingWorkspace.tsx:183-187`
- Confidence: Suspected
- Verified by: Sonnet analyst R5 (trace)
- Fix scope: UI; 1 file.
- User decision required: no

## 3. Task 4.5 operation table (from A1)

| Operation | Rejects stale preview | Existing rejection test | Notes |
| --- | --- | --- | --- |
| Route Node save, Pattern save, Node delete | Yes (one-shot token) | Node rename only (RDS:221-233) | Pattern save and Node delete have no test |
| Runtime recalculation of Trips | Yes | Yes | Dexie re-checks in the transaction; in-memory does not (3-013) |
| Trip copy between days | Yes (content change with the same `updatedAt`) | Yes | |
| Runtime copy between days | Yes | None | Moot on Dexie: the copy always fails (3-009) |
| Staged Trip shift | Yes | Yes | |
| Block assignment, unassignment, 13 Blocking commits | Yes (source signature, in the transaction) | Partial; none for assign/unassign | |
| Bulk boundary activities | Yes, when `expectedEndpointSignature` is sent (the UI always sends it) | Yes | |
| Single-Trip Pattern change | **No** | — | 4-003 |
| Trips CSV import | Trip changes only; Patterns not covered | None | 4-004, 4-019 |
| Regeneration undo | Yes (after-state check) | Yes (Phase 3, 3.8) | |
| Deletions (Route, Scenario, Trip Profile, Runtime profile, Trips, Project) | No token, except Trip Profile (optional, incomplete) | — | 4-011, 4-012 |
| Service day, Scenario rename, add/duplicate Route (Scenario-wide writes) | **No** | — | 4-001 (S0) |

## 4. Areas examined with no defects found

- No domain module imports React, Dexie or the application layer; there are no import cycles (4.1).
- The selection fallback for invalid JSON, wrong types, IDs that don't exist, IDs from another Project, renamed records, and a shrinking View-year horizon writes nothing and to no wrong record (B1, browser).
- UI overlap warnings consume domain findings and mark both Trips; no UI/domain disagreement (R2).
- Display rounding, headways, band shading and signed change values in ScheduleTable match the domain and Decisions 0031, 0033 and 0034 (R4 code; B2 browser).
- Runtime paste Replace/Append and the validation gate: no logic defect, though untested (R3; test gap in Phase 5).
- Every catch in `BlockingWorkspace.tsx` (17) reaches `onError`; no write failure is swallowed (R5).
- Phase 2 finding 2-002 (negative staged shift): no path commits negative times. Time inputs, CSV import, JSON restore and Runtime durations all reject them. The staged preview crashes the UI before any write (B1, browser). The service layer has no lower bound (`applyTripShift([id], -600)` stored −300), but no UI path reaches it. The severity stays S2; the UI crash is Phase 5 finding 5-011.

## 5. Delegated claims rejected on verification

| Claim | Source | Reason rejected |
| --- | --- | --- |
| `formatTripTableClock` (`App.tsx:1402`) is dead, so Phase 2's 2-002 evidence cites a dead path. | Analyst R3 (R3-01) | It has 4 calls on `App.tsx:1481` (lead grep). R3 misread H1's `JSX \| calls \| refs` columns. R4 reported the same correction. 2-002's citation stands. |
| "App.tsx lines 521 onward are a block comment." | Haiku H1 | The block comment spans 521–531 only (lead grep). |
| Inventory errors recorded but not used as findings | H1, H2 | H1 counted `RuntimeProfileEditor`/`RuntimeProfileDialog` as live (R4) and placed `normalizePattern` in `commands.ts` (A2). H1/H2 listed only 2 of the 11 dead App handlers (R1). |

## 6. Leads handed to other phases

| Lead | Owner |
| --- | --- |
| 4-008 compatibility fan-out and `getBlockSummary` per-Block reads: measure at capacity | Phase 6 (6.2) |
| `zod` and `@tanstack/react-table` declared but never imported (corrected in Stage 3A: `jszip` is not declared; see `phase-6.md` Section 5) | Phase 6 (6.4) |
| `data-schema.md:488,542` "running pre-2R UI" claim is stale | Stage 3 docs package (Phase 1 class) |
| An empty file `/pw-golden.config.ts` exists at the container filesystem root (created by analyst B1; its delete was blocked by the session's safety check). Outside the repository; no effect on the review. | Review lead, reported to the user |

## 7. User decisions required

1. **4-002 two-tab handling:**
   - (a) Allow only one active tab (recommended).
   - (b) Add a per-aggregate concurrency token.
   - (c) Document two tabs as unsupported.
2. **4-006 save-status scope:** every write (recommended), or Route only.
3. **4-013:** move the CSV serializers out of `src/ui` (recommended), or amend OV-TECH-03.
4. **4-015:** delete the dead generation-set UI and commands (recommended; keep the table and backup parsing), or keep them.

## 8. Gate

Exit criteria are met:
- **Import graph:** complete (Section 1, 4.1).
- **Stale protection:** every reviewed operation has a verdict (Section 3).
- **Logic in the UI:** the inventory is complete, with a destination layer for each item (4-014).

Two S0 findings (4-001, 4-002) were reported to the user when they were confirmed.
