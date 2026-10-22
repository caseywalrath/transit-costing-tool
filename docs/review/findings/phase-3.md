# Phase 3 Findings: Persistence, Migrations, and Data Pipelines

- Status: Complete. Gate report for review-lead integration.
- Baseline: `main` at `baed9f1`; review branch `claude/upbeat-ritchie-51mpy5` (HEAD `d33ac1c` when work began).
- Orchestrator: Phase 3 orchestrator.
- Delegation: none. The Agent tool was not available in this session, so every task in the Phase 3 table was performed by the orchestrator directly. No Haiku or Sonnet output was used. Every finding below was reproduced by the orchestrator; "Verified by" says how.
- Evidence locations:
  - Node (Vitest) reproductions: `docs/review/golden/p3-*.golden.test.ts`, helper `docs/review/golden/p3-fixture.ts`. Run with `pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts`. Each defect test uses `it.fails`: it asserts the expected behaviour and is reported as passing while the defect exists, so the golden suite stays green. Change `it.fails` to `it` to see the failure.
  - Browser reproductions against the real Dexie store in Chromium: `docs/review/golden/p3-*.spec.ts`, helper `p3-env.ts`, config `p3-playwright.config.ts`. Run with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p3-playwright.config.ts`. The specs import `src/` modules from the Vite dev server, so they exercise `DexieRouteDefinitionRepository`, `DexieBlockingRepository`, and the application services on real IndexedDB. Defect tests are marked `test.fail(...)`. Last run: 18 passed.
  - No dependency was added. `package.json`, the lockfile, configs, `src/`, `tests/`, and `tools/` are unchanged (`git status` shows only new `docs/review/golden/p3-*` files and this file). A `tools/__pycache__/` directory created by a `py_compile` check was removed.
- Rule IDs cite `docs/review/findings/rule-catalogue.md`.
- Review-lead re-verification (2026-10-22): the lead independently re-ran 3-001, 3-002 and 3-006 with `it.fails` switched to `it`. 3-001: the import fails with "normalized block … duplicates mismatched Trip Profile ownership", and 0 projects are stored. 3-002: the duplication throws "cannot reference a Trip from another Trip profile". 3-006: in the copy, Weekday Block 11 gains `block.deadheadNodeDiscontinuity` and becomes ineligible. The lead also confirmed that the golden backup's Blocks carry no `tripProfileId` (0 of 69), which makes the 3-001 fixture realistic. The lead re-ran the full browser suite (18 passed), which includes the 3-009 `objectStore` NotFoundError on Dexie.

## 1. Task results

| Task | Verdict | Evidence |
| --- | --- | --- |
| 3.1 Dexie migrations v1→v6 | **No defects in `database.ts`.** Real upgrades from seeded Dexie v1, v2, v3, v4, and v5 databases all reach v6 (IndexedDB version 60) with every record preserved, both Default Trip Profiles created (v1/v2), every Trip stamped with a valid profile, the `runtimeProfileId`, `[tripProfileId+serviceDayId]`, and `blockingScenarioId` indexes queryable, placeholder Blocks discarded (4 of 4 from v1–v3 seeds), normalized Blocks kept (v4/v5 seeds), `costingAssumptions` empty unless seeded, `tripRegenerationUndo` created empty, `costPlans` and `appMetadata` untouched. The discard count is not reported anywhere (L-18; already A-003). The existing browser migration test seeds the wrong version: 3-014. | `p3-migrations.spec.ts`; table in Section 3 |
| 3.2 Backup schema v1→v6 | v1–v6 files all import through the app path. Normalization matches DS-37 (one Default Trip Profile per Scenario for v1–v3), DS-36 (v5 and older import without Costing assumptions), and direction optionality. **Defects:** the export → import round trip is not stable and fails outright with two Trip Profiles (3-001). v3/v4 placeholder Blocks are kept (Phase 1 finding 1-010); effect rated S2 in Section 2.1. | `p3-backup-versions.golden.test.ts`, `p3-multiprofile.golden.test.ts` |
| 3.3 Import validation strength (L-08) | **Defects (3-005).** 37 malformed cases: 21 rejected correctly, 16 accepted that should be rejected, and 2 raw `TypeError` paths. Validation does complete before any write: an invalid payload leaves the repository empty. `__proto__` and `constructor` keys do not pollute prototypes. A 24 MB file with 19,680 Trips parses and validates in 157 ms. Unknown fields are persisted. | `p3-import-fuzz.golden.test.ts`; case table in Section 4 |
| 3.4 Import-as-copy and duplication remap | Import-as-copy, Route duplication, Trip Profile copy, and Blocking Scenario duplication remap every ID field. **Scenario duplication has two defects:** non-revenue Node references (A-004; consequences in 3-006) and a stray `tripProfileId` on every copied Block (3-002). | Matrix in Section 5; `copyReferences.golden.test.ts` (Phase A), `p3-multiprofile.golden.test.ts` |
| 3.5 Deletion cascades | Project, Scenario, Route, Pattern, Runtime profile, Trip Profile, Blocking Scenario, and Trip cascades on Dexie remove exactly the documented records, keep empty Blocks, and clear undo where required. **Defects:** Node deletion through the Node editor leaves Block activities pointing at the deleted Node (3-007). Deleting a source Scenario leaves its duplicate pointing at Nodes that no longer exist (3-006, A-004 hypothesis 4). | Counts in Section 6; `p3-cascades.spec.ts`, `p3-node-deletion.golden.test.ts` |
| 3.6 Repository parity (L-17) | **Divergences (3-013):** stale-before-state rejection, Scenario-deletion cascade, ordering, error types. | Table in Section 7; `p3-parity.spec.ts` |
| 3.7 Transaction atomicity | 17 multi-table repository operations were run with a failure injected at their last write. All rolled back completely. **Defects:** `RouteDefinitionService.deleteNode` writes in two transactions and leaks the first one (3-008). `commitRuntimeCopyAtomically` reads stores outside its transaction scope, so it fails every time (3-009). | Section 8; `p3-atomicity.spec.ts` |
| 3.8 Regeneration undo lifecycle (L-19) | **No defects on Dexie.** The undo survives a page reload, is replaced by the next recalculation, and is invalidated by a Trip shift and by deletion of an affected Trip. It is rejected and removed when the after-state does not match, and undo restores the before-state. It is kept after an unrelated import-as-copy and an unrelated Scenario save. It is cleared on Scenario deletion and on Project deletion, and it is absent from the backup JSON. The in-memory repository does not check the before-state (3-013). | `p3-runtimecopy-undo.spec.ts` (3.8 test passes) |
| 3.9 CSV interchange | Trips CSV round-trips IDs, Pattern, labels with commas, quotes, and newlines, 24-plus times, and second-level times. BOM, CRLF, and LF inputs parse the same. Blank IDs add rows; malformed quoting and wrong column counts are reported. Runtime CSV/paste round-trips labels, 24-plus ranges, second-level runtimes, and method, including tab-separated input with BOM, CRLF, and Total columns. **Defects:** header cells are not escaped, so Pattern or Node names containing a comma or quote break the Trips CSV round trip (3-012). `csvEscape` does not quote a bare CR (3-010, Phase 1 hand-off). Import trims spaces from `publicLabel` (not byte-stable; no finding). Costing CSV rounding is Phase 2's (A-006 closed). | `p3-csv.golden.test.ts` |
| 3.10 Formula injection (L-20) | **Confirmed (3-011).** Every CSV writer emits user text that begins with `=`, `+`, `-`, or `@` unescaped. | `p3-csv.golden.test.ts` |
| 3.11 Federal BRT tool pipeline | **Pipeline verdict: conforms.** The committed output is schema 6 and passes the current validator: `node tools/validate_federal_brt_backup.mjs …` exits 0 on Linux. It restores through the app path, single profile (Phase A golden loader). The audit lists every Saturday pull-in inference and both Block 29 inferences, which match `tools/federal_brt_to_backup.py:399-405`. The trace CSV has 984 rows, one per Trip. The converter compiles and `--help` runs under Linux Python 3.13 with openpyxl present. The documented commands are PowerShell-formatted but contain nothing Windows-specific other than the example workbook path. The workbook is not in the repository, so the converter itself was not executed. IDs are deterministic (`uuid5`); `exportedAt` is not. | Section 9 |
| 3.12 Save status and error mapping (D0012-04) | The save status shows the fixed text "Local save failed". `showError` filters technical messages. **Gaps (3-015, Probable):** five UI catch sites bypass `showError`, and the filter misses some Dexie error names. | Section 2 |
| A-004 consequences | Hypotheses 1, 3, and 4 confirmed. Hypothesis 2 confirmed in modified form. A further consequence, Blocks with deadheads becoming ineligible for Costing, raises A-004 to **S1** (3-006). | Section 2, 3-006 |

## 2. Findings

### 3-001: A project backup with two or more Trip Profiles cannot be restored by the app; export → import is not stable even with one profile

- Severity: S1
- Category: data-integrity
- Location: `src/persistence/backup.ts:448` (stamps `tripProfileId` on every Block that lacks one, including normalized Blocks), `src/persistence/backup.ts:433` (`defaultProfileByScenario` keeps the *last* profile per Scenario), `src/persistence/backup.ts:376` (rejects a Block whose `tripProfileId` differs from its Blocking Scenario's), `src/persistence/backupRepository.ts:157-158` (copy mode re-parses the clone), `src/application/routeDefinitionService.ts:629` (the UI always imports in copy mode)
- Governing source: D0019-09 "A Block stores `blockingScenarioId` and `serviceDayId`. It does not store a second authoritative `tripProfileId`." D0001-C1 "reliable backup/restore are required before the tool is considered usable for substantive work." D0006-02 / DS-39.
- Evidence:
  - Input: the golden backup plus a second Trip Profile "Alt" (Weekday Trips copied) and a Blocking Scenario on "Alt". This is the shape produced by Copy Trip Profile followed by New Blocking Scenario.
  - Parsing stamps all 87 normalized Blocks with `tripProfileId` = the last profile ("Alt"). For 69 of them this is wrong. The UI import path then clones, exports, and re-parses, and line 376 rejects: `Invalid project backup: normalized block … duplicates mismatched Trip Profile ownership`. Nothing is written.
  - Re-verified on Dexie in Chromium: the app's own `exportProject` output for such a project fails `importProject` with the same message (`p3-s1-verify` scratch run; same code path as `p3-multiprofile.golden.test.ts`).
  - With one profile, the round trip `export(import(golden))` differs from the original: all 69 Blocks gain `tripProfileId`. A second round trip is a fixed point.
  - Reproduction: `docs/review/golden/p3-multiprofile.golden.test.ts` (3-001 tests), `p3-backup-versions.golden.test.ts` (round trip).
- Consequence: export succeeds and gives no warning, but the file cannot be restored through the application. Dexie returns Trip Profiles in primary-key (UUID) order, so which profile is "last" is arbitrary. Any project with two or more profiles and Blocks in a non-last profile is affected. The file content is complete and correct: the import code is at fault, so a code fix makes existing files restorable. This is why the rating is S1 and not S0.
- Confidence: Confirmed (reproduced in Node and in Chromium/Dexie)
- Verified by: orchestrator
- Fix scope: structural; 1 file (`backup.ts:447-448`: do not default `tripProfileId` on a Block that has `blockingScenarioId`) plus a test with two profiles.
- User decision required: no

### 3-002: Scenario duplication fails when a Blocking Scenario on a non-first Trip Profile has assigned Trips; otherwise it stamps every copied Block with the first profile

- Severity: S1
- Category: data-integrity
- Location: `src/domain/project.ts:222` (`tripProfileId: block.tripProfileId ? … : defaultProfileId` applied to every Block), `src/domain/project.ts:220` (`defaultProfileId = tripProfiles[0]`), `src/domain/trips.ts:480` (rejects the result), `src/persistence/dexieRepository.ts:94`
- Governing source: D0019-11 "Project Scenario duplication copies and remaps Blocking Scenarios, Blocks, activities, Trip references…"; D0019-09 (no Block `tripProfileId`); DS-31 (scenario clone is one transaction).
- Evidence: with the two-profile fixture stored as the app stores it (normalized Blocks without `tripProfileId`), `RouteDefinitionService.duplicateScenario` throws `Block … cannot reference a Trip from another Trip profile.` on both the in-memory and the Dexie repository. The save status becomes `error` and nothing is written. With only the first profile's Blocking Scenario present, duplication succeeds but 69 of 69 copied normalized Blocks carry `tripProfileId`. If that profile is not the last one, the 3-001 restore failure follows. Reproduction: `p3-multiprofile.golden.test.ts` (3-002 tests); Dexie re-verification in the `p3-s1-verify` scratch run.
- Consequence: no workaround exists in the app, because the alternative route (export, then import as a copy) is blocked by 3-001. `tripProfiles[0]` follows UUID order on Dexie, so failure depends on random IDs.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: structural; 1 file (`project.ts:222`: keep `tripProfileId` only on legacy Blocks without `blockingScenarioId`, mapping through `tripProfileIds`). Fix together with A-004 (same line).
- User decision required: no

### 3-006: A-004 consequences: in a duplicated Scenario, deadheads break Costing eligibility, Nodes show as blank, edits keep invisible source IDs, and bulk apply matches nothing (A-004 re-rated S1)

- Severity: S1 (supersedes the provisional S2 on A-004; root cause remains A-004 at `src/domain/project.ts:222`)
- Category: data-integrity
- Location: `src/domain/project.ts:222`; consequences at `src/domain/blocking.ts:118,202` (deadhead Node continuity), `src/ui/BlockingWorkspace.tsx:118,367-368` (Node names from the current Route), `src/ui/BlockingWorkspace.tsx:413-414,429-430` (dialog state)
- Governing source: D0019-11; OV-TECH-08 "Blocking Scenario, Block, activity, Trip, Node … references are remapped during import-as-copy and scenario duplication."
- Evidence (hypothesis table):

  | # | Hypothesis | Verdict | Evidence |
  | --- | --- | --- | --- |
  | 1 | Pull-out, pull-in, and deadhead From/To display blank in the copy | **Confirmed** | Chromium, real app: source Block row `Pull-out … To = "Evans"`, `Pull-in From = "Evans"`; copy Block rows show `—` in both Node columns (`p3-a004-ui.spec.ts`, console `[A-004 H1]`). |
  | 2 | The edit dialog preselects a Node not in its options; saving could change the Node | **Confirmed, modified** | The DOM `<select>` shows "Select Node" (`value ""`, not among the 11 copy Nodes). React state still holds the source ID. Saving the unchanged dialog writes the source-Scenario ID back silently: 0 of 69 pull-outs reference a copy Node afterwards, and no error is shown. The Node does not change; the user cannot see that the activity refers to another Scenario. |
  | 3 | Bulk "Apply to matching Blocks" matches nothing | **Confirmed** | Review from the unchanged dialog in the copy: `Selected Block included · 0 node matches · 0 add · 1 replace`. In the source Scenario the same action matches Blocks by endpoint. |
  | 4 | After the source Scenario is deleted, references point at Nodes that no longer exist | **Confirmed** | Dexie cascade: after `deleteScenario(source)`, 138 of 138 non-revenue activities in the copy reference missing Nodes (`p3-cascades.spec.ts`). |
  | 5 | (new) Validation, eligibility, and hours change | **Confirmed for deadheads** | Golden plus one zero-minute deadhead: the source Block is eligible with findings `[platformMilesIncomplete]`; the copied Block gains `block.deadheadNodeDiscontinuity` and becomes **ineligible**, so Costing excludes it (`p3-a004-consequences.golden.test.ts`). Pull-out and pull-in Node IDs are not checked for existence, so they do not change eligibility. Phase A saw no change only because the golden file has no deadheads. |
  | 6 | Node rename or deletion in the copy reaches the activities | **Rejected as stated** | Rename is irrelevant to IDs. Deletion never reaches non-revenue activities on any path (3-007), copy or not. |

- Consequence: every duplicated Scenario that contains a manual deadhead reports wrong Costing totals: Blocks are excluded with a reason that the user cannot fix by looking at the Block, because the Node columns are blank. This is "wrong planning numbers", hence S1. A workaround exists: re-select both Nodes on every deadhead in the copy.
- Confidence: Confirmed
- Verified by: orchestrator (Node and Chromium)
- Fix scope: structural; 1 file (`project.ts:222` applies `nodeIds`, as `backup.ts:557` does). Consider a load-time recovery like `recoverCopiedDirectionColumnNodeReferences` for Scenarios already duplicated. UI-only leads (hypotheses 1–3 presentation) are handed to Phase 5.
- User decision required: yes. Should existing duplicated Scenarios be repaired automatically on load, by mapping each source Node ID to the copy Node with the same Route position and name? Option A: automatic recovery (as in `4fc88ba`). Option B: fix new duplications only and document manual repair. Recommendation: A, because the defect is silent and affects Costing.

### 3-009: Runtime "Copy from day" always fails on the IndexedDB store

- Severity: S2 (a workaround exists: assign each Pattern's profile on the target day manually; raise to S1 if the lead does not accept that workaround for a documented Phase 3 workflow)
- Category: correctness
- Location: `src/persistence/dexieRepository.ts:338` (transaction scope is only `runtimeProfiles`, `runtimeAssignments`) vs `:345` (reads `patterns` and `serviceDays` inside it)
- Governing source: DS-30 "`commitRuntimeCopyAtomically` … validate the complete affected graph before writing and execute one transaction"; D0017-05.
- Evidence: in Chromium, `TripGenerationService.previewRuntimeCopy` (Weekday → Saturday, golden; 0 findings, 6 profiles, 6 assignments) followed by `applyRuntimeCopy` fails in both `independent` and `shared` modes with `NotFoundError: Failed to execute 'objectStore' on 'IDBTransaction': The specified object store was not found.` The same calls succeed on the in-memory repository. The UI maps the failure to "Unable to copy runtimes." (`App.tsx:1672`). Nothing is written. Reproduction: `p3-runtimecopy-undo.spec.ts` (3-009 test), `p3-atomicity.spec.ts`.
- Consequence: the feature has never worked on the shipped store. Unit tests use the in-memory repository (A-002), and the browser tests that reach the Copy menu fail earlier on a label (A-001).
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: structural; 1 file (add `patterns` and `serviceDays` to the transaction table list) plus a Dexie-backed test.
- User decision required: no

### 3-005: Backup import accepts dangling, cross-Scenario, duplicate, and negative Block and Trip data; two malformed inputs reach the user as raw TypeErrors

- Severity: S2
- Category: data-integrity
- Location: `src/persistence/backup.ts:345-381` (`validateTrips`, `validateBlocks`), `:330-343` (`validateGenerationSets` reads `set.limit.mode` without a type check), `:553` (`cloneProjectSnapshot` reads `trip.provenance.generationSetId`)
- Governing source: D0006-02 "The payload is validated completely before a repository write"; D0006 Consequences "Import validation must check cross-entity references"; DS-20 (Block label uniqueness; a Trip once per Blocking Scenario/day); OV-BLK "Structural ownership, reference, duplicate-assignment, and malformed-time violations reject writes." L-08: `zod` is unused, and validation is hand-written.
- Evidence: the case table in Section 4. Accepted although they should be rejected:
  - pull-out Node unknown, or from another Scenario;
  - duplicate activity IDs;
  - one Trip assigned twice in one Blocking Scenario and day;
  - repeated Block label;
  - a Trip's stop times repeating one Pattern point;
  - a Trip whose `routeId` or `patternId` belongs to another Scenario;
  - an empty Block on another Scenario's service day;
  - a Blocking Scenario assigning a Trip from a different Trip Profile;
  - an unknown activity `type`;
  - a non-numeric or negative `minutesBeforeFirstTrip`;
  - a negative explicit deadhead time;
  - negative miles.

  A missing `limit` returns `Cannot read properties of undefined (reading 'mode')`. A missing `provenance` passes parsing, then fails in import-as-copy with `Cannot read properties of undefined (reading 'generationSetId')`. Unknown fields (`trip.evil`, `activity.evil`) are persisted into IndexedDB and re-exported.
- Mitigating, verified: every rejection happens before any write (repository empty after an invalid payload). Prototype keys are inert.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: structural; 1 file (`backup.ts`) plus tests. Validate activities (type, Node ownership, non-negative integers), Trip ownership (route, pattern, and service day in the Trip's Scenario), Trip-to-Blocking-Scenario profile consistency, and assignment uniqueness. Reuse `validateBlockingBlock` and `validateBlockingAssignments` where possible. Adopting Zod is a separate decision (Phase 6, L-08).
- User decision required: no

### 3-007: Deleting a Node in the Node editor leaves pull-out, pull-in, and deadhead activities pointing at the deleted Node, and the preview does not report them

- Severity: S2
- Category: data-integrity
- Location: `src/application/routeDefinitionService.ts:967-983` (`applyNodeChanges` passes `records.blocks` through unchanged), `:893-924` (`buildNodePreview` impact covers Pattern services only), `src/ui/App.tsx:474,483` (live path)
- Governing source: `phase-04-manual-blocking.md:206` "Include non-revenue activity impacts in Node and Route deletion previews; remove reviewed affected activities while retaining Blocks." OV-PRIN "Deletion must report and safely apply its downstream effects."
- Evidence: golden plus a garage Node used as every pull-out From and pull-in To. `previewNodeChanges` without the garage reports `impact.blockIds: 0`. After `commitNodeChanges`, the Node is gone and 138 activities still reference it (`p3-node-deletion.golden.test.ts`, 3-007). Route deletion does remove them, as verified in the Section 6 Route row.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: structural; 1 file (apply `removeNonRevenueActivitiesForNodes` in `applyNodeChanges` and report it in `buildNodePreview`). Application-layer code: shared with Phase 4.
- User decision required: no

### 3-008: The unused `RouteDefinitionService.deleteNode` deletes other Routes' Nodes and Patterns and commits in two transactions

- Severity: S2 (latent: `App.tsx:258` `deleteNode` is never called and the Node editor uses 3-007's path. It would be S0 if wired, because it silently deletes other Routes' data.)
- Category: data-integrity
- Location: `src/application/routeDefinitionService.ts:497-512`; exported on the application port at `:1043`
- Governing source: DS-31 / OV-PRIN-05 "Related writes must occur in one database transaction."
- Evidence: two Routes in one Scenario. `deleteNode` passes only the current Route's `nodes`, `patterns`, and `directions` as the whole Scenario's records to `saveScenarioRecords` (line 509). When the second Route has no runtime data, its 12 Nodes and 6 Patterns are deleted with no error; the Route record remains. When it has runtime data, `assertRuntimeGraph` throws after the first transaction (line 506) has committed. Dexie injection run: `nodes`, `patterns`, and `directions` changed, while Trips and runtime profiles were left inconsistent (`segmentCountMismatch`). Reproduction: `p3-node-deletion.golden.test.ts` (3-008), `p3-atomicity.spec.ts`.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: structural; delete the method, its port entry, and the dead `App.tsx:258` function, or rebuild it on `commitNodeChanges`. 2 files.
- User decision required: no

### 3-012: CSV header cells are not escaped; a Pattern or Node name containing a comma or double quote breaks the Trips CSV round trip

- Severity: S2
- Category: pipeline
- Location: `src/persistence/csv.ts:6` (`toCsv` joins `headers` without `csvEscape`); `src/ui/tripTableCsv.ts:9-10` (headers embed `${pattern.name} · ${nodeName}`)
- Governing source: D0035-02 / OV-TRIP-07 (Trips CSV round-trips through review); `phase-02r-trip-table-interchange-undo.md` acceptance: "Trips CSV round-trips schedule IDs, labels, patterns, and whole-second timepoints."
- Evidence: Pattern "SB, Express" → re-import reports `Row 2: expected 30 columns but found 12.` for every row. Pattern `SB "Express"` → `A CSV quote must begin a field.` The Node name "Federal, Colfax" fails the same way. Names with colons work. Reproduction: `p3-csv.golden.test.ts` (3-012 tests).
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: structural; 1 file (`toCsv` escapes header cells). Layering of `tripTableCsv.ts` importing persistence is Phase 4 (L-09).
- User decision required: no

### 3-013: The in-memory and Dexie repositories diverge on stale-regeneration rejection, Scenario-deletion cascade, ordering, and error types

- Severity: S2
- Category: contract
- Location: `src/persistence/inMemoryRepository.ts:346` (no before-state check; Dexie checks at `dexieRepository.ts:425-426`); `inMemoryRepository.ts:200-201` (service days and routes of a Scenario removed from the snapshot are not deleted); ordering in `listTrips`, `listRuntimeProfiles` and every `where().equals()`; `insertTripsAtomically` errors
- Governing source: D0029-C1 "IndexedDB and in-memory repositories apply the same cascade behavior." L-17.
- Evidence: the parity table in Section 7. With a stale before-state, Dexie rejects with "A selected Trip changed"; in memory the write succeeds and a later undo restores the stale Trip. After `deleteScenario(source)`, in memory keeps 4 service days and 1 route of the deleted Scenario, while Dexie keeps 0. Dexie returns primary-key (UUID) order; in memory returns insertion order. This matters for `tripProfiles[0]` in 3-002 and the "last profile" in 3-001. Reproduction: `p3-parity.spec.ts`.
- Consequence: unit tests (all in-memory, A-002) cannot detect Dexie-only behaviour (3-009) and cannot reproduce order-dependent defects (3-001, 3-002).
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: structural plus test-only; 2 files plus a shared contract test run against both implementations (needs an IndexedDB test environment; A-002).
- User decision required: no

### 3-011: CSV exports write user-entered text beginning with `=`, `+`, `-`, or `@` unescaped (formula injection, L-20)

- Severity: S3 (recommendation; local single-user tool. The realistic vector is a crafted backup received from someone else and later exported to CSV.)
- Category: pipeline
- Location: `src/persistence/csv.ts:5` (`csvEscape`); `src/ui/runtimePaste.ts:20` (separate escape); all writers in `csv.ts`, `tripTableCsv.ts`, `costingCsvFiles`
- Governing source: none. No document addresses it (L-20). This is an omission.
- Evidence: Node names `=HYPERLINK("http://x","y")`, `+1+1`, `-2+3`, and `@SUM(1,1)` reach the nodes CSV cell unchanged. A Trip `publicLabel` of `=1+1` reaches the Trips CSV cell unchanged (`p3-csv.golden.test.ts`, 3-011 tests).
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: structural; 2 files, plus a documentation rule.
- User decision required: yes. Option A: prefix a `'` to text cells that start with `= + - @` (tab or CR), which changes exported text and requires the Trips/Runtime CSV importers to strip it. Option B: leave the export unchanged and document the risk. Recommendation: A, limited to free-text columns (names, labels, notes), never IDs, times, or numbers.

### 3-010: `csvEscape` does not quote a field containing a bare CR (Phase 1 hand-off)

- Severity: S3
- Category: pipeline
- Location: `src/persistence/csv.ts:5` (`/[",\n]/`); compare `src/ui/runtimePaste.ts:20` (`/[",\r\n]/`)
- Governing source: RFC 4180 behaviour assumed by OV-PERS CSV exports; the two escapers in the repository disagree.
- Evidence: `csvEscape('a\rb')` returns the input unquoted. A Block note `line1\rline2` produces 3 rows for an RFC 4180 reader instead of 2 (`p3-csv.golden.test.ts`, 3-010 tests). Browser text inputs normalize line endings to LF, so a bare CR mainly arrives through imported data.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: structural; 1 line.
- User decision required: no

### 3-014: The browser migration test seeds IndexedDB version 4, which Dexie reads as schema 0.4, not Dexie version 4; no test reports the placeholder-Block discard count

- Severity: S3
- Category: test-gap
- Location: `tests/ui/database-migration.spec.ts:7` (`indexedDB.open('transit-costing-tool', 4)`), title at `:3`
- Governing source: D0019-12 (migration tests report the discarded count); DS-33.
- Evidence: Dexie stores `version × 10`; the test itself expects 60 after upgrade. A raw version-4 database runs every upgrader from v1, so "preserves a version 4 project" never tests a real v4 store. The real per-version upgrades pass (`p3-migrations.spec.ts`, seeded at 10/20/30/40/50). This builds on A-003 and does not repeat it.
- Confidence: Confirmed (code read; behaviour demonstrated by the p3 seeds)
- Verified by: orchestrator
- Fix scope: test-only; adopt the `p3-migrations.spec.ts` seeding approach.
- User decision required: no

### 3-015: Five UI error paths show raw messages without the technical-error filter; the filter misses some Dexie error names

- Severity: S3
- Category: ux
- Location: `src/ui/App.tsx:943,962` (Trip Block assignment), `:988,998` (shift preview), `:1072` (Trips CSV preview) set `error.message` directly; `App.tsx:195` regex lacks `QuotaExceededError`, `VersionError`, `UnknownError`, and Dexie's "not part of transaction" wording; `BlockingWorkspace.tsx:76` splits camel case (`ConstraintError` → "Constraint Error") before `showError`. "Object store" still catches the common case.
- Governing source: D0012-04 "must not expose key paths, object-store names, or index terminology."
- Evidence: input-to-output trace. A Dexie `BulkError` (`trips.bulkAdd(): 1 of 2 operations failed. Errors: ConstraintError: Key already exists in the object store.`, as observed in `p3-parity.spec.ts`) raised during Block assignment would be shown verbatim by `App.tsx:962`. Domain messages containing UUIDs, such as the 3-001 import error, also reach the user through `showError`.
- Confidence: Probable (traced, not executed through the UI)
- Verified by: orchestrator
- Fix scope: UI; 1 file (route the five sites through `showError` and extend the regex).
- User decision required: no

### 2.1 Phase 1 finding 1-010: effect rating (task 3.2)

Not a new finding. Phase 1 reported that v3/v4 placeholder Blocks are kept on import. Effect on stored data, measured through the app import path (`p3-backup-versions.golden.test.ts`, "effect of kept v4 placeholder Blocks"):

- After import, 69 kept Blocks have no `blockingScenarioId` and carry `tripProfileId`. The project has 0 Blocking Scenarios.
- They are **orphaned and invisible**. Blocking reads Blocks by `blockingScenarioId` (`blockingRepository.ts:116`), and Costing reads through Blocking (`main.tsx:40`), so they never appear in Blocking or Costing and do not change any total.
- They do not break validation: `assertTripProfileReferences` passes because their profile matches their Trips.
- They **inflate impact counts**: Project and Scenario deletion impacts report `blockCount` 69 while the user sees none. Trip Profile deletion previews also count them (`listBlocksForProfile` matches on `tripProfileId`).
- They persist through every later backup and Scenario duplication.
- Rating: **S2**: contract violation (D0019-13) with misleading counts. No data loss. Not S0 or S1.

## 3. Migration and backup-version verdict table (3.1, 3.2)

| Step / version | Seed | Result | Verdict |
| --- | --- | --- | --- |
| DB v1 → v6 | 2 Scenarios; Routes, Nodes, Patterns, runtime data, 4 Trips, 4 placeholder Blocks, a generation set, `costPlans`, `appMetadata` | All preserved; 2 Default Trip Profiles; Trips stamped; 4 Blocks discarded; `runtimeProfileId` index works; undo store empty | Pass |
| DB v2 → v6 | as v1 | as v1 | Pass |
| DB v3 → v6 | v3 Trip Profiles and profile-owned placeholder Blocks | No new profiles; 4 Blocks discarded; `[tripProfileId+serviceDayId]` works | Pass |
| DB v4 → v6 | Blocking Scenarios and normalized Blocks | 2 Blocks kept; `blockingScenarioId` index works | Pass |
| DB v5 → v6 | plus Costing assumptions | 2 assumptions kept; undo store added | Pass |
| Backup v1 | golden minus runtime, Trips, Blocks, Trip Profiles, Blocking Scenarios, Costing | Imports; Default profile; runtime empty | Pass |
| Backup v2 | adds runtime | Imports; 18 profiles, 24 assignments | Pass |
| Backup v3 | adds Trips without profile, Blocks | Trips normalized to Default; 69 placeholder Blocks **kept** | 1-010 (S2 effect) |
| Backup v4 | adds Trip Profiles; Blocks with `tripProfileId` | 69 placeholder Blocks **kept** | 1-010 (S2 effect) |
| Backup v5 | adds Blocking Scenarios | Imports; no Costing assumptions | Pass |
| Backup v6 | golden | Imports; round trip adds `tripProfileId` to 69 Blocks | 3-001 |
| Backup v6, 2 Trip Profiles | golden + Alt | Import fails | 3-001 (S1) |

## 4. Import validation case table (3.3)

"Rejected" means `parseProjectBackup` threw before any write.

| Case | Result | Expected |
| --- | --- | --- |
| trip.patternId unknown | rejected | reject |
| revenue tripId unknown | rejected | reject |
| pull-out toNodeId unknown | **accepted** | reject |
| runtime assignment profile unknown | rejected | reject |
| blockingScenario.tripProfileId unknown | rejected | reject |
| direction column nodeId unknown | accepted and recovered from Pattern points (by design, `4fc88ba`) | accept |
| trip.provenance missing | **accepted**; copy import then throws a raw TypeError | reject |
| duplicate Node / Trip / runtime-assignment IDs | rejected | reject |
| duplicate block-activity IDs | **accepted** | reject |
| Pattern-point ID reused across Patterns | rejected (indirectly, via stop times) | reject |
| same Trip in two Blocks of one Blocking Scenario/day | **accepted** | reject (DS-20) |
| duplicate Block label in one Blocking Scenario/day | **accepted** | reject (DS-20) |
| Trip stop times repeat one point | **accepted** | reject |
| trip.serviceDayId from another Scenario | rejected (only because the Trip is in a Block) | reject |
| trip.routeId / patternId from another Scenario | **accepted** | reject |
| pull-out Node from another Scenario | **accepted** | reject |
| empty Block on another Scenario's day | **accepted** | reject |
| Blocking Scenario on profile A assigns a profile-B Trip | **accepted** | reject (D0019-09/11) |
| stop time as string; annualServiceDays as string | rejected | reject |
| unknown activity type | **accepted** | reject |
| `minutesBeforeFirstTrip` "thirty" / -30 | **accepted** | reject |
| generation set without `limit` | rejected with raw `TypeError` text | reject with a user-safe message |
| negative stop time | rejected | reject |
| negative deadhead `startTime`; negative miles | **accepted** | reject |
| Costing: rate -1, horizon 11, escalation -1, rate year after base year | rejected | reject |
| service-day total 400 | accepted | accept (DS-36) |
| unknown fields | accepted and persisted | accept (S3 note inside 3-005) |
| `__proto__` / `constructor.prototype` keys | accepted; no pollution | accept |
| 19,680 Trips, 24.1 MB | 157 ms | accept |
| invalid payload, then repository state | empty | no write |

## 5. Remap field-by-path coverage matrix (3.4)

Legend: R = remapped to the copy's record. S = intentionally shared (same Scenario or same profile). P = provenance pointer to the source. **X = defect**. n/a = the path does not copy this record by decision. IC = Project import-as-copy (`backup.ts:482-560`), SD = Scenario duplication (`project.ts:143-231`), RD = Route duplication (`project.ts:64-140`), TPC = Trip Profile copy (`tripGenerationService.ts:58-67`), BSD = Blocking Scenario duplication (`blocking.ts:16`).

| Record.field | IC | SD | RD | TPC | BSD |
| --- | --- | --- | --- | --- | --- |
| Project.id | R | S | S | S | S |
| Scenario.id, projectId | R, R | R, S | n/a | n/a | n/a |
| Scenario.sourceScenarioId | R or cleared | P | n/a | n/a | n/a |
| ServiceDay.id, scenarioId | R | R | S | S | S |
| Route.id, scenarioId | R | R | R, S | S | S |
| Node.id, scenarioId, routeId | R | R | R, S, R | S | S |
| Direction.id, scenarioId, routeId | R | R | R, S, R | S | S |
| DirectionColumn.id, nodeId | R | R | R | S | S |
| Pattern.id, scenarioId, routeId, directionId | R | R | R, S, R, R | S | S |
| PatternPoint.id, nodeId, directionColumnId | R | R | R | S | S |
| RuntimeProfile.id, scenarioId, routeId, patternId; band.id | R | R | R, S, R, R; R | S | S |
| RuntimeAssignment.id, scenarioId, patternId, serviceDayId, runtimeProfileId | R | R | R, S, R, S, R | S | S |
| TripProfile.id, scenarioId | R | R | S | R, S | S |
| TripProfile.sourceTripProfileId | P | P | n/a | P | n/a |
| GenerationSet.id, scenarioId, routeId, serviceDayId, patternId | R | R | R, S, R, S, R | n/a | n/a |
| Trip.id, scenarioId, routeId, serviceDayId, patternId | R | R | R, S, R, S, R | R, S, S, S, S | S |
| Trip.tripProfileId | R | R | S | R | S |
| ScheduledPoint.patternPointId | R | R | R | S | S |
| Provenance.generationSetId, runtimeProfileId, calculationSource.runtimeProfileId | R | R | R | S | S |
| BlockingScenario.id, scenarioId, tripProfileId | R | R | n/a | n/a | R, S, S |
| Block.id, scenarioId, serviceDayId, blockingScenarioId | R | R | n/a | n/a | R, S, S, R |
| Block.tripProfileId (legacy only) | R (legacy only) | **X** (stamped on all; 3-002) | n/a | n/a | S (copied as-is) |
| Activity.id | R | R | n/a | n/a | R |
| RevenueTrip.tripId | R | R | n/a | n/a | S |
| PullOut/Deadhead/PullIn fromNodeId, toNodeId | R | **X** (A-004, 3-006) | n/a | n/a | S |
| CostingAssumptions.id, scenarioId | R | R | n/a | n/a | n/a |

Executed evidence: Phase A sweep `copyReferences.golden.test.ts` (IC 0, RD 0, SD 138 leaks); `p3-multiprofile.golden.test.ts` (SD stamping; TPC: 984 Trips copied, 0 reused IDs, 0 foreign Patterns or points, 0 Blocks added; BSD: 0 reused IDs, same profile and Trip set); `p3-a004-consequences.golden.test.ts` (deadhead Node references). Note: `data-schema.md` lists `BlockingScenario.sourceBlockingScenarioId`, but `types.ts` lacks it and BSD does not set it (data-schema drift; Phase 1 1-008 owns schema drift).

## 6. Cascade before/after counts on Dexie (3.5)

Seed: golden plus "Alt" profile (+276 Trips), "Alt Blocks" (+18 Blocks), Costing assumptions, one deadhead, one historical generation set (Scenario row: plain golden). Counts are whole-database; one transaction per cascade (Section 8).

| Cascade | Before → after (changed tables) | Retained as documented | Verdict |
| --- | --- | --- | --- |
| Project (+1 other project) | routes 1→0, nodes 11→0, patterns 6→0, directions 2→0, runtimeProfiles 18→0, assignments 24→0, generationSets 1→0, trips 1260→0, blocks 87→0, blockingScenarios 2→0, costingAssumptions 1→0, undo 1→0, costPlans 1→0 | other project, its Scenario, 4 days, 1 profile | Pass (D0029-04) |
| Scenario (after duplicating) | every Scenario-owned table halves (e.g. trips 1968→984, blocks 138→69); undo 1→0 | copy intact, but 138/138 copy activities reference deleted Nodes | Pass for cascade; A-004 H4 (3-006) |
| Route | nodes, patterns, directions, runtime data, generationSets, trips → 0; revenue 1260→0; non-revenue 175→0 | blocks 87 (all now empty), profiles, Blocking Scenarios, Costing | Pass (D0015-01/02) |
| Pattern | patterns 6→5, runtimeProfiles 18→15, assignments 24→20, trips 1260→965, generationSets 1→0, revenue activities 1260→965 | blocks 87, dangling Trip refs 0 | Pass |
| Runtime profile (with replacement) | runtimeProfiles 18→17; 2 assignments moved | assignments 24; deleting a referenced profile raises `RuntimeProfileTripReferenceError` | Pass |
| Trip Profile "Alt" | trips 1260→984, blocks 87→69, blockingScenarios 2→1, tripProfiles 2→1, undo 1→0; preview counted 276 Trips and 18 Blocks | Default profile, its Blocking Scenario | Pass (D0019-10) |
| Blocking Scenario "Alt Blocks" | blocks 87→69, blockingScenarios 2→1 | Trips, profiles, Costing | Pass (D0019-08) |
| Trips of one Block (16) | trips 1260→1244; revenue 1260→1244; adjacent deadhead removed (175→174) | Block kept with its pull-out and pull-in | Pass (D0015-02) |
| Node (Node editor) | nodes −1 | 138 activities keep the deleted Node ID | **3-007** |

## 7. Repository parity table (3.6)

Same calls, same seed, in Chromium (`p3-parity.spec.ts`).

| Method / behaviour | Dexie | In-memory | Parity |
| --- | --- | --- | --- |
| `listTripProfiles`, `getScenarioRecords` keys, `listTrips` counts (with and without profile), `listBlocks`, `listBlocksForProfile`, `getCostingAssumptions` | — | — | same |
| Result ordering (`listTrips(day)`, `listRuntimeProfiles`) | primary-key (UUID) order | insertion order | **differs** |
| `saveRegeneratedTripsWithUndo` with stale before-state | rejects "A selected Trip changed" | writes; a later undo restores the stale Trip | **differs** |
| `insertTripsAtomically` duplicate ID | raw `BulkError` text; nothing inserted | `Trip … already exists`; nothing inserted | error text differs |
| Duplicate runtime assignment, Trip Profile name collisions, still-assigned runtime profile delete, missing project delete | same messages | same | same |
| `saveRuntimeAssignment` with missing profile | `assertRuntimeGraph` message | `[profile!]` → would throw a TypeError (`inMemoryRepository.ts:283`, code read; the run was masked by the duplicate check) | differs (code) |
| Scenario deletion via `saveProjectSnapshot` | removes the Scenario's days, routes, nodes, Trips | leaves 4 service days and 1 route orphaned | **differs** |
| `saveScenarioRecords` undo invalidation before ownership checks | inside the transaction | runs before the costing-ownership throws (`:94` vs `:96-102`), not rolled back | differs (code) |
| `getScenarioRecords.directions` when none | omitted | `[]` | differs (cosmetic) |
| `deleteProject` `costPlans` | deleted | no table | n/a |

## 8. Transaction atomicity results (3.7)

Failure injected by replacing the named Dexie table method on the database instance; "rolled back" means every table's contents compared byte-equal before and after.

| Operation (roadmap / DS-31) | Injected at | Result |
| --- | --- | --- |
| `insertTripsAtomically` (additive group) | `trips.bulkAdd`; and a natural duplicate mid-batch | rolled back |
| `saveRegeneratedTripsWithUndo` (recalculation) | `tripRegenerationUndo.put` | rolled back |
| `saveTripChangesAtomically` (shift with Blocks) | `tripRegenerationUndo.get` | rolled back |
| `deleteTripsAtomically` | `blocks.bulkPut` | rolled back |
| `replaceTripsForDayAtomically` (day replacement) | `blocks.bulkPut` | rolled back |
| `saveBlockingBlocksAtomically` (two-Block reassignment) | `blocks.bulkPut` | rolled back |
| `saveBlockingScenarioGraphAtomically` (duplicate) | `blocks.bulkPut` | rolled back |
| `deleteBlockingScenarioAtomically` | `blockingScenarios.delete` | rolled back |
| `saveProjectSnapshot` (import / Scenario delete) | `projects.put` | rolled back |
| `saveScenarioRecords` (Scenario duplication) | `blocks.bulkPut` | rolled back (14 tables) |
| `commitRouteEdit` (reviewed Node/Pattern edit, Route delete) | `blocks.bulkPut` | rolled back |
| `deleteProject` | `projects.delete` | rolled back |
| `deleteTripProfile` | `blocks.bulkDelete` | rolled back |
| `copyTripProfileAtomically` | `trips.bulkAdd` | rolled back |
| `deleteRuntimeProfile` with replacement | `runtimeProfiles.delete` | rolled back |
| `commitRuntimeCopyAtomically` | — | **always fails before writing** (3-009) |
| `RouteDefinitionService.deleteNode` | second write | **first write committed** (3-008) |

Both Dexie repositories share one `TransitDatabase` instance in `main.tsx:20`, so Blocking and Trip writes can join one transaction.

## 9. Federal BRT pipeline (3.11)

- Output conformance: `exportSchemaVersion: 6`. Validator run on Linux: exit 0, `roundTrip: passed`, `importAsCopy: passed`, 0 Block findings, 69 eligible. Single Trip Profile, so 3-001 does not affect this file.
- Inferences: audit lines 49-67 list `infer-30` mode, 18 Saturday pull-in inferences, the Block 29 pull-out ("SA Hours!B20 is inconsistent"), and its pull-in. These match converter lines 399-405. Trace CSV: 984 rows plus header.
- Portability: the converter compiles; `--help` runs under Python 3.13 with openpyxl. The commands in `federal-brt-workbook-conversion.md` work unchanged in a POSIX shell, apart from the Windows example path. The validator is plain Node and starts Vite in middleware mode. The workbook is absent, so a full re-conversion was not run.
- The validator's printed `costingEligibleBlocks` and `runtimeMatchingTrips` are array lengths, not counts (Phase A note). Verdict unchanged.

## 10. Areas examined with no defects found

- `database.ts` upgrade functions v1–v6 and their index definitions (Section 3).
- Undo lifecycle on Dexie (3.8, 12 checks).
- Import-as-copy, Route duplication, Trip Profile copy, and Blocking Scenario duplication remaps (Section 5).
- Project, Scenario, Route, Pattern, Runtime profile, Trip Profile, Blocking Scenario, and Trip cascades (Section 6).
- All 15 repository transactions under injection (Section 8).
- `parseRuntimePaste` and `runtimeProfileCsv` (quoting, CR/LF/CRLF, BOM, 24-plus times, seconds, method column, wrong counts).
- Trips CSV import scoping: IDs from another day or Trip Profile are rejected as `trip.csvTripInvalid`; omitted rows are not deleted; updates keep Trip IDs, so Block references survive (code trace of `tripGenerationService.ts:237-303`).
- The ZIP writer `createCsvArchive` (stored entries, CRC, UTF-8 flag; code read).
- Lead "Blocking Scenario source Trip Profile not enforced on save" (`blockingRepository.ts:33,93`): the repository does not check it. No service path changes it: `renameBlockingScenario` keeps `tripProfileId`, and duplication copies it. No live defect.
- Lead "`listTrips` without a profile returns all profiles": the only caller is `listServiceDayTrips`, used only by the unmounted `TripScheduleWorkspace` (`App.tsx:595-626`). No live defect (dead code, handed to Phase 4/5).

## 11. Delegated claims rejected on verification

None. No delegation took place. One orchestrator hypothesis was rejected: an unknown direction-column Node is not a validation gap, because it is recovered by design (`backup.ts:203-231`).

## 12. Leads handed to other phases

| Lead | Owner |
| --- | --- |
| A-004 UI presentation: Node columns show "—", and the dialog shows "Select Node" while it holds a hidden source ID (3-006 hypotheses 1–2). After the structural fix, decide whether the dialog should flag an unknown Node. | Phase 5 |
| 3-007 and 3-008 live in `routeDefinitionService.ts` (application layer); `App.tsx:258` and `TripScheduleWorkspace` (`App.tsx:595`) are dead code. | Phase 4 |
| `tripTableCsv.ts` and `runtimePaste.ts` serializers in `src/ui` import persistence `toCsv` (L-09); 3-012 sits in that shared function. | Phase 4 |
| Trips CSV import accepts a row whose `tripId` belongs to the other Direction of the same Route, day, and profile, and moves it to this Direction's Pattern (`tripGenerationService.ts:239-240` filters by Route only). Suspected; not executed. | Phase 4 |
| Runtime paste Replace/Append and the validation gate in `App.tsx:1329-1356` remain untested; the parser itself is covered by `p3-csv.golden.test.ts`. | Phase 5 |
| `tripProfile.test.ts` uses the legacy `Block.tripProfileId` shape; normalized-shape deletion is verified on Dexie in `p3-cascades.spec.ts`. The unit test still needs updating. | Phase 2 |
| Raw domain messages containing UUIDs reach the user (e.g. the 3-001 import error). | Phase 5 |
| `zod` unused (L-08). Adopting a schema library would address 3-005 systematically. | Phase 6 |
| A shared repository contract suite needs an IndexedDB test environment (A-002, 3-013); the `p3-*.spec.ts` in-page module approach works without new dependencies. | Stage 4 / Phase 6 |

## 13. User decisions required

1. **3-006 / A-004 repair of existing duplicated Scenarios.** Option A: automatic load-time recovery of non-revenue Node references, as in commit `4fc88ba`. Option B: fix new duplications only and document manual repair. Recommendation: A.
2. **3-011 formula injection.** Option A: prefix `'` to free-text cells starting with `= + - @` (tab or CR) and strip it in the two CSV importers. Option B: leave the export unchanged and document the risk. Recommendation: A, free-text columns only.
3. **3-009 severity.** Accept manual per-Pattern assignment as the workaround (S2), or treat the broken documented workflow as S1. Recommendation: S2, fixed in the first structural package because the fix is one line.

## 14. Gate

Exit criteria met.

- Every migration step (v1–v5 → v6) and backup version (v1–v6) has an executed verdict.
- Every remap path (IC, SD, RD, TPC, BSD) has an executed verdict.
- Every cascade, including Node, has an executed verdict.
- Every listed transaction has an injection result.

No S0 was confirmed, so nothing was appended to `S0-alerts.md`. 3-008 would be S0 if its dead code path were wired; it is reported here for that reason.

Recommended next package: one structural package covering 3-001, 3-002, A-004/3-006, 3-009, 3-012, and 3-010, with Dexie-backed contract tests. These are small fixes in `backup.ts`, `project.ts`, `dexieRepository.ts`, and `csv.ts`. Model recommendation per `AGENTS.md`: Luna (bounded structural work with explicit acceptance criteria). The import-validation hardening (3-005) and the in-memory parity fixes (3-013) can follow in a second Luna package.
