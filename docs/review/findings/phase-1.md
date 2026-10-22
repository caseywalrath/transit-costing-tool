# Phase 1 Findings: Governance and Documentation Consistency

- Status: Complete. Gate report for the review lead.
- Baseline: `main` at `baed9f1`; review branch `claude/upbeat-ritchie-51mpy5` (Phase A harness `9748db0`, Phase A findings `d33ac1c`).
- Orchestrator: Phase 1 orchestrator (Opus-class).
- Delegation: none. The Agent tool was not available in this session. Per the common brief ("If the Agent tool is not available to you, do the work yourself — do not skip any task"), the orchestrator performed every task, including the Haiku extraction and Sonnet analysis tasks, directly against the sources.
- Verification: every finding below was produced and checked by the orchestrator. Document contradictions were checked by re-reading both quoted lines. Code-side claims were checked by reading the cited code or by executing a reproduction test (two new files in `docs/review/golden/`, listed under each finding). No delegated claims exist, so none were rejected.
- Outputs: this file; `docs/review/findings/rule-catalogue.md` (task 1.2, published first); reproduction tests `docs/review/golden/p1-v4PlaceholderBlocks.golden.test.ts` and `docs/review/golden/p1-generationCap.golden.test.ts`. Both tests fail by design; each failure demonstrates a document-versus-code contradiction.

Run the reproductions:

```bash
pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p1-v4PlaceholderBlocks.golden.test.ts docs/review/golden/p1-generationCap.golden.test.ts
```

## 1. Task results

| Task | Verdict |
| --- | --- |
| 1.1 Decision-supersession map | Complete (Section 3). 35 decisions mapped. Missing or wrong status lines in 0003, 0005, 0016, 0019, 0020, 0021, 0022, 0025, 0026, 0027, 0032, 0035; missing Date lines in 0011, 0012, 0035. **L-04 confirmed** (1-004). Two decision texts were overtaken by `ui-conventions.md` without a new decision (1-012). One accepted UI behavior has no decision record (1-011). |
| 1.2 Rule catalogue | Published: `docs/review/findings/rule-catalogue.md`. About 430 rule rows with stable IDs across the overview (OV), data schema (DS), 35 decisions (D), UI conventions (UI), Phase 5 plan (PL05), and glossary (GL). Each row has source file:line, rule text, status, and owning phase. Extraction was done by the orchestrator, not Haiku; every row was read against its cited line. |
| 1.3 Contradiction sweep | Complete. **L-02 confirmed** (1-001), **L-03 confirmed** (1-002), **L-05 confirmed** (1-003), plus the 500-trip limit (1-009), the 365-day rule (1-006), the v4 placeholder-Block rule (1-010), validation-finding shape (1-016), and segment-start regeneration (1-005). Each contradiction states which source the code follows. |
| 1.4 Status-claim audit | Complete. **L-06 confirmed** (1-007). Phase 5 status is consistent across `codex.md:123,127`, `architecture_overview.md:7,366`, `phase-05-costing.md:5`, the roadmap `:5`, and `phase-05-costing-planning.md:5`: 5A–5C implemented, 5C user review open, 5D not started. **L-07** evidence recorded as user decision UD-1 (Section 7). The interchange-package verification claim is already A-001 and is not re-reported. |
| 1.5 Version-claim audit | Complete. Dexie versions 1–6 and their stores match `database.ts:8-41`. JSON backup versions 1–6 and their per-version collections match `backup.ts:391-430`. CSV column lists for Costing (3 files), Blocking summaries (`runningHours`, `valid`, `complete`), Trip CSV (`tripProfileId`, `tripProfileName`), activity relative-offset columns, and Runtime profile CSV method column match `csv.ts` and `runtimePaste.ts:21`. Mismatches: data-schema index table and migration paragraph (1-008); placeholder-Block import rule (1-010). |
| 1.6 Glossary conformance | Complete (1-013, 1-014). Exported type names follow the glossary code names (`RoutePattern`, `ServiceDayDefinition`, `TripProfile`, `BlockingScenario`, `CostingAssumptions`). Label mismatches: Trips **Scenario** selector naming a Blocking Scenario; **Run Time** without a glossary entry; Costing table header list. All S3. |
| 1.7 Agent-instruction applicability (L-21) | Complete. Recommendation in Section 8. No edits made. |

## 2. Findings

Sorted by severity; IDs are stable.

### 1-010: JSON version 3 and 4 backups import their placeholder Blocks; Decision 0019 item 13 says they are discarded

- Severity: S2
- Category: contract
- Location: `src/persistence/backup.ts:430` (validates and keeps v3/v4 Blocks), `src/persistence/backup.ts:449` (normalizes them with `tripProfileId`, no `blockingScenarioId`), `src/persistence/dexieRepository.ts:300` (`this.db.blocks.bulkPut(snapshot.blocks)`); related `src/domain/types.ts:100` (`Block.blockingScenarioId` optional "until migration/import normalization")
- Governing source: D0019-13 (`0019:26`): "JSON version 4 backups remain readable, but their placeholder Blocks are discarded when normalized into the Phase 4 schema." DS-17 (`data-schema.md:383`): "Blocks do not contain a Route ID or duplicate Trip Profile ID."
- Evidence: `docs/review/golden/p1-v4PlaceholderBlocks.golden.test.ts` converts the Federal BRT backup to a version 4 shape (no `blockingScenarios`, Blocks carry `tripProfileId` and no `blockingScenarioId`) and imports it. Actual: 69 Blocks returned by `importProjectJson`, 0 with a Blocking Scenario, 0 Blocking Scenarios. Expected per D0019-13: 0 Blocks. The Dexie snapshot write (`dexieRepository.ts:300`) persists the returned Blocks unchanged (traced, not executed in a browser). The database upgrade path does follow the decision (`database.ts:34` `blocks.clear()`); only the backup-import path diverges.
- Which side the code follows: neither document. The code follows an undocumented rule: legacy Blocks are retained with legacy `tripProfileId` ownership.
- Consequence (for Phase 3 to rate on the data path): orphan Blocks with no Blocking Scenario are stored, are re-exported in later v6 backups, and are matched by `tripProfileId` in `dexieRepository.ts:378,468` and `inMemoryRepository.ts:272,360`. They are not visible in Blocking or Costing, which select by Blocking Scenario.
- Confidence: Confirmed (parse and import reproduced); persistence step Probable (traced).
- Verified by: orchestrator
- Fix scope: structural; 1–2 files (`backup.ts`, test). Hand-off to Phase 3 for the data-path consequence.
- User decision required: no. The decision record is explicit.

### 1-001: The overview describes a bounded Trips scroll viewport; Decision 0035 forbids it and the code follows Decision 0035

- Severity: S3
- Category: docs
- Location: `architecture_overview.md:222`; code `src/styles.css:97` (`.schedule-table { max-height: none; ... overflow-y: visible; }`), `src/styles.css:99` (`.sticky-schedule-header { position: fixed; top: 0; ... }`), `src/ui/App.tsx:1452,1481` (duplicate header synchronized to `scheduleViewportRef.scrollLeft`)
- Governing source: D0035-05 (`0035:13`): "Keep Trips on normal page-level vertical scrolling ... Do not create a nested vertical scroll area." UI-31 (`ui-conventions.md:67`) and `phase-02r-trip-table-interchange-undo.md:10` agree.
- Evidence: quoted contradiction. `architecture_overview.md:222`: "The schedule table scrolls within a bounded viewport with sticky headers." vs `0035:13` above. The code follows Decision 0035. The browser test `tests/ui/trip-table-layout.spec.ts:40` follows the overview (A-001; Phase 5).
- Confirms: L-02.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs; 1 file (`architecture_overview.md`). The test is Phase 5.
- User decision required: no. Plan Section 8.4 item 3 recommends Decision 0035 governs; the code already follows it.

### 1-002: The roadmap "Confirmed constraints" and deletion rules contradict Decisions 0011, 0033, 0035, and 0019

- Severity: S3
- Category: docs
- Location: `docs/implementation/schedule-development-roadmap.md:38`, `:45`, `:47`, `:60`, `:97`, `:103`
- Governing source: D0035-01, D0033-01, D0011-01, D0010-02, D0019-14, OV-PRIN-06.
- Evidence (quoted contradictions; code side checked):
  - `:38` "The departure time of each individual trip selects one runtime band for that complete trip." vs D0035-01 (`0035:9`) "New runtime profiles use `segmentStart`: each segment uses the band containing its start time." Code: `src/domain/runtime.ts:106,285` implements `segmentStart`. Code follows the decisions.
  - `:45` "User-defined directions provide ordered timetable columns" vs D0011-01 (`0011:9`) "The Route interface does not expose direction creation, deletion, renaming, or timetable-column editing." Code follows Decision 0011.
  - `:47` "No minimum layover rule is included in the first blocking build." vs `architecture_overview.md:259` (minimum-layover UI preference). See 1-011.
  - `:60` Build Trips uses "Pattern, First Trip, Headway, and Last Trip" (omits Number of Trips). See 1-003.
  - `:97` "Every future user-defined record type must define both deletion and archiving behavior before its editing interface is accepted." vs `architecture_overview.md:105` ("Archiving is a later lifecycle state") and D0019-14 ("Archiving remains deferred"). Every record type has an accepted editing UI without archiving rules.
  - `:103` "A direction cannot be deleted while patterns use it." Directions cannot be deleted at all (D0011-01).
- Confirms: L-03.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs; 1 file.
- User decision required: no.

### 1-003: The overview, data schema, glossary, and roadmap omit the Number of Trips generation limit that Decision 0010 and the code provide

- Severity: S3
- Category: docs
- Location: `architecture_overview.md:218`; `docs/data-schema.md:253-262` (`GenerateTripsRequest` has `lastTrip` only, `tripProfileId` required); `docs/domain-glossary.md:107`; `schedule-development-roadmap.md:60`. Code: `src/domain/types.ts:46-48` (`lastTrip?`, `tripCount?`, "Exactly one generation limit is required"), `src/domain/trips.ts:41` (`limitRequired` when both or neither), `src/domain/trips.ts:53-57`; UI `src/ui/App.tsx:108,1585,1603`.
- Governing source: D0010-02 (`0010:16`): "exactly one generation limit: an inclusive Last Trip or a Number of Trips." UI-32/UI-33 (`ui-conventions.md:68`).
- Evidence: quoted contradiction. `architecture_overview.md:218`: "A request contains a pattern, First Trip, Headway, and inclusive Last Trip." The code follows Decision 0010 and ui-conventions.
- Confirms: L-05.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs; 4 files.
- User decision required: no.

### 1-004: Decision status lines are missing, stale, or omit supersession

- Severity: S3
- Category: docs
- Location and evidence (each line was read):
  - `0003:3` "Accepted for the initial runtime build" — item `0003:18` ("That band applies to the full trip") is superseded by 0032/0033/0035 for non-`singleBand` profiles. No annotation.
  - `0005:34` "return it to a Terra package" — contradicts its own update at `0005:8` and `AGENTS.md` (Sol/Luna).
  - `0016:12` heading "Proposed decision" in an Accepted record; item 7 (`0016:20`) superseded by D0019-09 (noted only in Consequences `0016:26`).
  - `0019:3`, `0020:3`, `0021:3` "Accepted for Phase 4 planning" — Phase 4 is accepted (`phase-04-closeout.md:5`).
  - `0020:3` lacks "partly superseded" although 0022 (`0022:5`), 0023 (`0023:5`), and 0026 (`0026:10`) each supersede parts of it.
  - `0021:20` item 7 "read-only Block column" superseded by D0025-01 (assignment pill); no annotation in either record.
  - `0022:11` item 3 "Deadhead activities continue to store explicit start and end service times." Decision 0023 supersedes it in substance but its header (`0023:5`) names only "Decision 0020 item 5".
  - `0025:3` "Accepted; implementation in progress" — implemented (`phase-04-closeout.md:5`; `App.tsx` Assign Block…).
  - `0026:3` "Accepted for implementation", `0027:3` "Accepted for implementation planning" — both implemented.
  - `0032:3` "Superseded for new profiles by Decision 0033" — the new-profile default is set by D0035-01 (`0035:9`), not 0033; 0033 only adds the method.
  - `0035` has no Status or Date line. `0011` and `0012` have no Date line.
- Governing source: AGENTS.md "Record material architectural decisions in `docs/decisions/`"; plan Section 2 rule 2: "A later decision overrides an earlier one only where it says so."
- Consequence: plan rule 2 makes the explicit text decisive. 0022 item 3 and 0021 item 7 are, by that rule, still in force although the code follows 0023 and 0025.
- Confirms: L-04 (all five named items, plus the additions above).
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs; about 14 decision files.
- User decision required: no.

### 1-005: No decision governs anchored regeneration for `segmentStart` profiles; the code silently picks the nearest departure among multiple solutions

- Severity: S3 (documentation omission). Code-side behavior handed to Phase 2.
- Category: docs
- Location: `docs/decisions/0031-trip-regeneration-anchors.md:8-12` (covers single-band and blended only); `architecture_overview.md:38,220`. Code: `src/domain/trips.ts:267-282`.
- Governing source: OV-TRIP-03 (`architecture_overview.md:220`): "The domain resolves a runtime band consistent with the resulting first departure and rejects missing or ambiguous solutions." D0031-04 (`0031:10`): when a later anchor "resolves to multiple departures, the review dialog identifies the affected trip, fixed timepoint, and reason."
- Evidence (trace): for `segmentStart`, `trips.ts:270-279` collects every candidate first departure that reproduces the anchor time; `trips.ts:280` sorts by distance from the saved departure and takes `[0]`. Multiple solutions are not rejected or reported. Decision 0031 was written before `segmentStart` (0033, 2026-10-21) and was not updated. Default for new profiles is `segmentStart` (D0035-01), so this is the common path.
- Which side the code follows: neither; the code implements an undocumented tie-break.
- Confidence: Probable (traced; not executed)
- Verified by: orchestrator
- Fix scope: docs (decision addendum); code-side fix, if any, is Phase 2.
- User decision required: yes. Question: for `segmentStart` profiles, should an anchor that admits more than one first departure (a) be rejected and reported, as OV-TRIP-03 and D0031-04 state, or (b) resolve to the solution nearest the saved first departure, as the code does? Recommendation: (a) unless the user confirms (b); either way, record it in 0031.

### 1-006: The overview says annual service-day counts are "capped at 365"; the Phase 5 plan and the code treat a total above 365 as an error

- Severity: S3
- Category: docs
- Location: `architecture_overview.md:271`; code `src/domain/costing.ts:5,203`; UI `src/ui/CostingWorkspace.tsx:187`
- Governing source: PL05-07 (`phase-05-costing.md:21`): "Require annual counts as nonnegative integers totaling at most 365. A total below 365 is valid and is not scaled up." DS-36: totals above 365 "make Costing calculations invalid until corrected."
- Evidence: quoted contradiction. "capped at 365" reads as `min(count, 365)`. Code: `costing.ts:203` emits `costing.annualServiceDaysExceed365` (error). The code follows the Phase 5 plan.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs; 1 file.
- User decision required: no.

### 1-007: `codex.md` and the overview repeat status paragraphs, and `codex.md` makes false repository claims

- Severity: S3
- Category: docs
- Location: `codex.md:123` and `:127` (Phase 3R, 4, and 5 status stated twice); `codex.md:51` "The repository is currently local and may not yet have Git initialized or a remote configured"; `codex.md:4`/`:48`/`:104` conditional Git steps; `codex.md:94` "`docs/data-schema.md`: proposed TypeScript and IndexedDB schema"; `codex.md:90-96` Documentation Map omits `docs/ui-conventions.md`; `codex.md:121-129` omits the Trip interchange and undo package. `architecture_overview.md:5` and `:7` both state Phase 3R acceptance. `docs/implementation/phase-02r-trip-table-interchange-undo.md` has no Status or Date section.
- Governing source: AGENTS.md "Inspect the repository state before assuming files, dependencies, scripts, or Git configuration exist."
- Evidence: `git remote -v` returns `origin https://github.com/caseywalrath/transit-costing-tool`; `package.json` defines `build`, `typecheck`, `test`, `test:ui`. The duplicated paragraphs agree with each other (no conflicting status), so the defect is redundancy and staleness, not contradiction.
- Confirms: L-06.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs; 3 files.
- User decision required: no.

### 1-008: `data-schema.md` index table, migration history, and entity shapes drift from the code

- Severity: S3
- Category: docs
- Location: `docs/data-schema.md:429-449`, `:507`, `:515`, `:253-262`, `:291-301`, `:372-380`, `:416-424`, `:488`, `:542`; code `src/persistence/database.ts:8-41`, `src/domain/types.ts:38-48,79,81,100,116`
- Governing source: DS-33 (`data-schema.md:513`): each schema change must "update this document when entity meaning or ownership changes"; D0012-C1.
- Evidence (doc → code):
  - `:441` `runtimeAssignments` lists `serviceDayId` as an index and omits `runtimeProfileId`; code v2 (`database.ts:11`) is `id,scenarioId,patternId,runtimeProfileId,[patternId+serviceDayId]`. The doc's own `:507` says v2 added `runtimeProfileId`.
  - `:444` `trips` omits `provenance.generationSetId` (`database.ts:14`).
  - The table has no `tripRegenerationUndo` row; code v6 `database.ts:41` `'id,scenarioId,tripProfileId'`.
  - `:507` migration history stops at version 5; no version 6 sentence (overview `:281` and D0035-C1 record it).
  - `:429` "Proposed tables" and `:5` "planned" — the tables are implemented.
  - `:515` "`appMetadata` should include the application data-schema version" — no code writes `appMetadata` (only declared, `database.ts:5`; `types.ts:117`). Backup `applicationVersion` is never supplied (`backupRepository.ts:14`).
  - `:291-301` `Trip.tripProfileId` required; code optional (`types.ts:79`). `:372-380` `Block.blockingScenarioId` required and no `tripProfileId`; code has both optional (`types.ts:100`). See 1-010 for the consequence.
  - `:416-424` `ValidationFinding` lacks `category`; code adds `category?: 'structural' \| 'operational'` (`types.ts:116`). See 1-016.
  - `:488` "historical generation-set repository methods remain only for the running pre-2R UI" and `:542` "A legacy export method remains temporarily for the pre-2R UI" — plan lead L-11 states the pre-2R UI has no JSX usages. Suspected stale; Phase 4 confirms reachability.
- Which side the code follows: the code is authoritative for every item above; the document is stale.
- Confidence: Confirmed (all items except `:488`/`:542`, which are Suspected)
- Verified by: orchestrator
- Fix scope: docs; 1 file.
- User decision required: no.

### 1-009: Decision 0010 limits every generation request to 500 trips; ui-conventions and the code limit only Number of Trips

- Severity: S3 (document contradiction). Code-side defect handed to Phase 2 with a recommended S2.
- Category: docs
- Location: `docs/decisions/0010-authoritative-trips-and-directional-timetables.md:16`; `docs/ui-conventions.md:68`; code `src/domain/trips.ts:44` (cap applied only when `tripCount` is set), `src/domain/trips.ts:57` (Last Trip loop unbounded); `MAX_TRIPS_PER_GENERATION` is referenced nowhere else in `src/`.
- Governing source: D0010-02: "A single request is limited to 500 trips." UI-35: "Number of Trips is bounded to 500 per request."
- Evidence: `docs/review/golden/p1-generationCap.golden.test.ts`. Input: First Trip 0:00, Headway 1 minute, Last Trip 24:00. Actual: `validateGenerateTripsRequest` returns no findings; `generateRequestDepartures` returns 1,441 departures. Expected per D0010-02: rejection above 500. The code follows the narrower ui-conventions wording.
- Confidence: Confirmed (domain function executed); application and UI paths not executed.
- Verified by: orchestrator
- Fix scope: docs (ui-conventions wording) plus structural (`trips.ts`, 1 file and a test) via Phase 2.
- User decision required: no. Decision 0010 is the higher authority.

### 1-011: The minimum-layover candidate preference has no decision record and contradicts the Phase 4 plan

- Severity: S3
- Category: docs
- Location: `architecture_overview.md:259`; `docs/ui-conventions.md:90`; vs `docs/decisions/0020-manual-block-activities-validation-and-summaries.md:30`, `docs/implementation/phase-04-manual-blocking.md:70,99`, `schedule-development-roadmap.md:47`. Code: `MinimumLayoverRule` type (exported from `src/domain`), Unassigned Trips **Minimum layover** dialog (`src/ui/BlockingWorkspace.tsx`, label "Minimum layover").
- Governing source: AGENTS.md "Record material architectural decisions in `docs/decisions/`"; OV-DEF-01.
- Evidence: D0020-19 "No minimum-layover policy is applied in Phase 4." `phase-04-manual-blocking.md:99` lists "minimum-layover policies" as deferred. `grep -ril "minimum layover" docs/decisions` returns only 0020. The overview and ui-conventions describe an implemented preference (fixed minutes or percentage of preceding runtime) that changes candidate compatibility classification.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs; 1 new decision record plus 0020 annotation.
- User decision required: no.

### 1-012: Decisions 0017 and 0018 were overtaken by ui-conventions without a decision amendment

- Severity: S3
- Category: docs
- Location: `0017:13` ("the user selects a source Day through `Copy day…`") vs `ui-conventions.md:66` ("labeled **Copy Trips from day**") and `src/ui/App.tsx:1162`; `0018:15` ("Keep `Add` visible in Runtimes") vs `ui-conventions.md:51` ("Runtime **Actions** contains **Add Time Band**") and `src/ui/App.tsx:1188` (Add Time Band is a menu item; no visible Runtime `Add` button found in `src/ui/*.tsx`); `0018:21` item 10 vs Decision 0028 (Project/Scenario Actions menus).
- Governing source: plan Section 2 rule 2; AGENTS.md decision-record rule.
- Evidence: quoted contradictions above. The code follows ui-conventions in both cases. The 0017 label drift is the root of A-001 (stale browser helper); it is recorded here only as a decision-text defect.
- Confidence: Confirmed for 0017 and 0018 item 10; Probable for 0018 item 4 (absence of a visible button established by search, not rendering).
- Verified by: orchestrator
- Fix scope: docs; 2 files.
- User decision required: no.

### 1-013: Two UI labels use non-glossary terms for glossary concepts

- Severity: S3
- Category: docs
- Location: `src/ui/App.tsx:1205` (`MenuButton fieldLabel="Scenario"` for the Blocking Scenario selector), prescribed by `docs/ui-conventions.md:95`; "Run Time" headers in the regeneration review (`src/ui/App.tsx`, headers "Run Time", "Run Time change") and D0031-06 (`0031:14` "total Run Time"); `docs/domain-glossary.md:81` "Initial operating spans are derived from generated trips".
- Governing source: `docs/domain-glossary.md:3` ("This glossary defines the terms used in architecture, code, tests, and interface copy"); glossary entries "Scenario" (`:11`), "Blocking scenario" (`:155`), "Running time" (`:191`).
- Evidence: the permanent global row has a **Scenario** selector for the project Scenario (D0028-01); Trips adds a second visible **Scenario** label naming a Blocking Scenario. The accessible menu label is "Blocking Scenarios" (`App.tsx:1142`), so screen-reader users get the right term; sighted users see two "Scenario" labels with different meanings. "Run Time" (per-trip first-to-last duration) has no glossary entry and differs from "Running time" (sum over a Block). The glossary's operating-span definition contradicts `architecture_overview.md:234` ("derived from authoritative trips").
- Which side the code follows: the code follows ui-conventions; the governing document (ui-conventions `:95`) is the problem for the Scenario label.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs (glossary) and UI (one label; Luna-class, Phase 5).
- User decision required: yes. Question: should the Trips selector read **Blocking Scenario** (glossary term, wider control) or remain **Scenario** (current, compact)? Recommendation: **Blocking Scenario**, matching the Blocking and Costing toolbars.

### 1-014: The Phase 5 plan's Costing results-table column list does not match the implemented table

- Severity: S3
- Category: docs
- Location: `docs/implementation/phase-05-costing.md:33`; `src/ui/CostingWorkspace.tsx:195`
- Governing source: PL05-11: "Main results table: Day, Days, Revenue h/day, Platform h/day, Cost/day, Annual Revenue h, Annual Platform h, Annual cost."
- Evidence: implemented headers begin "Service day, Days, Blocks, Daily Revenue Hours, Daily Platform Hours, ..." (an added Blocks column and different names). Whether the added column is accepted is a 5C user-review question (UD-2).
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs; 1 file (after the 5C review outcome).
- User decision required: no (covered by UD-2).

### 1-015: `ui-conventions.md` mixes historical and current rules under a blanket "historical" note

- Severity: S3
- Category: docs
- Location: `docs/ui-conventions.md:20` ("The Phase 2 sections below are historical implementation context"); current rules inside those sections at `:80` (shift-click selection), `:82` (Block pill assignment and unassign, Decision 0025/0026); stale rules at `:11` ("Its read-only Block column"), `:30` ("Future-phase tabs are disabled"), `:76-79` (generation-set editor and preview), `:27` (modal confirmation for Node removal vs. `:38` draft deletion with **Undo**).
- Governing source: D0025-01; D0026-01; D0014-01.
- Evidence: quoted lines above. A Phase 5 analyst cannot tell from the document which bullets are current.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs; 1 file.
- User decision required: no.

### 1-016: The documented validation-finding shape does not match the code

- Severity: S3
- Category: docs
- Location: `architecture_overview.md:275`; `docs/data-schema.md:416-424`; code `src/domain/types.ts:116`; Costing findings use a different shape (`src/domain/costing.ts:198,203`: `{ code, severity, entityId?, serviceDayId? }`).
- Governing source: OV-VAL-01: "Each finding includes a rule identifier, severity, entity reference, message parameters, and optional acknowledgment information."
- Evidence: no acknowledgment field exists in `ValidationFinding` or any persisted table; `category` exists in code but not in either document. `CostingFinding` uses `code` rather than `ruleId` and has no `entityType` or `messageKey`.
- Which side the code follows: neither fully; DS-25 is closer than OV-VAL-01.
- Confidence: Confirmed
- Verified by: orchestrator
- Fix scope: docs (2 files). Whether `CostingFinding` should conform is a Phase 2 (task 2.11) question.
- User decision required: no.

## 3. Decision-supersession map (task 1.1)

"Implicit" means the later record changes the rule without saying so in either record.

| # | Status line (as written) | Date | Supersedes | Superseded by | Status-line defect |
| --- | --- | --- | --- | --- | --- |
| 0001 | Accepted | 2026-09-10 | — | — | none |
| 0002 | Accepted | 2026-09-10 | — | — | none |
| 0003 | Accepted for the initial runtime build; review required after user testing | 2026-09-10 | — | Item 4 (one band for full trip): 0032 (blend), 0033 (segmentStart), 0035 item 1 (default) — implicit | Not annotated (1-004) |
| 0004 | Superseded for Phase 2R by Decision 0010 | 2026-09-10 | — | 0010 (explicit); undo statement by 0035 item 3 | none |
| 0005 | Accepted (model update 2026-09-22) | 2026-09-10 | — | Terra assignments: its own update and AGENTS.md | `:34` still says Terra (1-004) |
| 0006 | Accepted for Phase 1 | 2026-09-10 | — | Extended by 0007, 0009, later versions (additive) | none |
| 0007 | Accepted for Phase 2B | 2026-09-11 | — | Item 3 index detail completed by 0012 (explicit) | none |
| 0008 | Superseded for Phase 2R by Decision 0010 | 2026-09-11 | — | 0010 (explicit); provenance fields remain in schema | none |
| 0009 | Superseded for Phase 2R where generation sets are required | 2026-09-11 | — | 0010 (explicit) | none |
| 0010 | Accepted for Phase 2R | 2026-09-11 | 0004, 0008, 0009 (explicit) | Direction setup by 0011 (explicit in 0010:20) | none |
| 0011 | Accepted for the Phase 2R revision | none | User-managed directions in 0010 (explicit) | — | No Date (1-004) |
| 0012 | Accepted | none | — | — | No Date (1-004) |
| 0013 | Accepted on 2026-09-13 | 2026-09-13 (in status) | — | — | none |
| 0014 | Accepted | 2026-09-13 | — | — | none |
| 0015 | Accepted | 2026-09-14 | — | Scope extended by 0016/0019/0027 (additive) | none |
| 0016 | Accepted; implementation and user verification complete | 2026-09-14 | — | Item 7 by 0019 item 9 (noted only in Consequences) | Heading "Proposed decision" (1-004) |
| 0017 | Implemented and accepted through Phase 3 | 2026-09-14 | — | `Copy day…` label by ui-conventions:66 — implicit | Text stale (1-012) |
| 0018 | Implemented | 2026-09-14 | — | Item 4 by ui-conventions:51; item 10 by 0028 — implicit | Text stale (1-012) |
| 0019 | Accepted for Phase 4 planning | 2026-09-18 | 0016 item 7 (stated in 0016) | — | "planning" stale (1-004) |
| 0020 | Accepted for Phase 4 planning | 2026-09-18 | — | Item 5: 0022, 0023 (explicit in those); items 11 Revenue formula: 0026 (explicit); item 16 in part: 0022 (explicit); item 19 in part: minimum-layover preference (no record, 1-011); item 20 tiles: 0026 item 7 | Not annotated; "planning" stale (1-004) |
| 0021 | Accepted for Phase 4 planning | 2026-09-18 | — | Item 7 "read-only Block column": 0025 item 1 — implicit | "planning" stale; not annotated (1-004) |
| 0022 | Accepted; Supersedes 0020 items 5 and 16 for new/edited boundaries | 2026-09-21 | 0020 items 5, 16 (explicit) | Item 3: 0023 — implicit (0023 names only 0020) | Not annotated (1-004) |
| 0023 | Accepted; Supersedes 0020 item 5 for new/edited deadheads | 2026-09-21 | 0020 item 5 (explicit); 0022 item 3 (implicit) | — | Header incomplete (1-004) |
| 0024 | Accepted | 2026-09-22 | — | — | none |
| 0025 | Accepted; implementation in progress | 2026-09-22 | 0021 item 7 (implicit) | — | "in progress" stale (1-004) |
| 0026 | Accepted for implementation | 2026-09-22 | 0020 Revenue-hours formula (explicit) | — | "for implementation" stale (1-004) |
| 0027 | Accepted for implementation planning | 2026-09-22 | Draft `CostPlan` (via phase-05-costing.md) | — | "planning" stale (1-004) |
| 0028 | Accepted and implemented | 2026-09-23 | 0018 item 10 in part (implicit) | — | none |
| 0029 | Accepted and implemented | 2026-10-20 | — | — | none |
| 0030 | Accepted | 2026-10-20 | — | — | none |
| 0031 | Accepted | 2026-10-20 | — | Silent on `segmentStart` (0033, later) | Omission (1-005) |
| 0032 | Superseded for new profiles by Decision 0033; retained for saved legacy profiles | 2026-10-21 | 0003 item 4 for blend profiles (implicit) | New-profile default by 0035 item 1 (not 0033) | Attribution wrong (1-004) |
| 0033 | Accepted | 2026-10-21 | 0003 item 4 for segmentStart (implicit) | — | none |
| 0034 | Accepted | 2026-10-21 | — | — | none |
| 0035 | none | none | 0004 "no undo" (implicit); 0032 default (explicit only in 0032's attribution) | — | No Status, no Date (1-004) |

## 4. Document ratings

Ratings: **current** (matches the code and later decisions), **partly stale** (some statements contradicted by code or later decisions; cite the finding), **historical** (superseded record retained for history or legacy-data compatibility).

| Document | Rating | Basis |
| --- | --- | --- |
| `AGENTS.md` | current | Rules are consistent with the repository; Codex-specific wording assessed in Section 8. |
| `codex.md` | partly stale | 1-007. Playwright section (Phase A) is current. |
| `architecture_overview.md` | partly stale | 1-001, 1-003, 1-006, 1-007, 1-016. All other sections checked against the catalogue (OV rows) without contradiction. |
| `docs/domain-glossary.md` | partly stale | 1-003 (`:107`), 1-013 (`:81`, no "Run Time"). |
| `docs/data-schema.md` | partly stale | 1-003, 1-008, 1-010. Backup version history and Costing sections are current. |
| `docs/ui-conventions.md` | partly stale | 1-009 (`:68`), 1-013 (`:95`), 1-015. |
| Decision 0001 | current | — |
| Decision 0002 | current | — |
| Decision 0003 | partly stale | Item 4 superseded without annotation (1-004). |
| Decision 0004 | historical | Superseded by 0010. |
| Decision 0005 | partly stale | `:34` Terra (1-004). |
| Decision 0006 | historical | Governs the v1 backup read path only. |
| Decision 0007 | current | — |
| Decision 0008 | historical | Superseded by 0010; provenance fields survive in the schema. |
| Decision 0009 | historical | Governs the v3 read path only. |
| Decision 0010 | current | Its 500-trip rule is not implemented for Last Trip (1-009, code side). |
| Decision 0011 | current | No Date line (1-004). |
| Decision 0012 | current | No Date line (1-004). |
| Decision 0013 | current | — |
| Decision 0014 | current | — |
| Decision 0015 | current | — |
| Decision 0016 | partly stale | Heading and item 7 (1-004). |
| Decision 0017 | partly stale | Menu label (1-012). |
| Decision 0018 | partly stale | Items 4 and 10 (1-012). |
| Decision 0019 | partly stale | Status (1-004); item 13 not implemented on import (1-010); item 11 not met by scenario duplication (A-004). |
| Decision 0020 | partly stale | Superseded items not annotated (1-004). |
| Decision 0021 | partly stale | Item 7 (1-004). |
| Decision 0022 | partly stale | Item 3 (1-004). |
| Decision 0023 | current | Supersession header incomplete (1-004). |
| Decision 0024 | current | — |
| Decision 0025 | partly stale | Status (1-004). |
| Decision 0026 | partly stale | Status wording only (1-004). |
| Decision 0027 | partly stale | Status wording only (1-004). |
| Decision 0028 | current | — |
| Decision 0029 | current | — |
| Decision 0030 | current | — |
| Decision 0031 | partly stale | No `segmentStart` rule (1-005). |
| Decision 0032 | historical | Governs legacy `blendSegments` profiles; attribution defect (1-004). |
| Decision 0033 | current | — |
| Decision 0034 | current | — |
| Decision 0035 | partly stale | No Status or Date (1-004). Content is current and is what the code follows. |
| `implementation/schedule-development-roadmap.md` | partly stale | 1-002. Transaction list (`:83-91`) and runtime-profile deletion rule (`:105`, matches `routeDefinitionService.ts:755-756`) are current. |
| `implementation/phase-05-costing.md` | partly stale | 1-014; Phase A A-006 edit is current. Status and calculation contract are current. |
| `implementation/phase-05-costing-planning.md` | historical | Planning record; superseded by `phase-05-costing.md`. |
| `implementation/phase-02r-trip-table-interchange-undo.md` | partly stale | Verification claim fails (A-001); no Status/Date (1-007). Scope and acceptance criteria are current. |
| `implementation/runtime-table-paste.md` | current | Status and behavior consistent with OV-RT-05 and `runtimePaste.ts`. |
| `implementation/federal-brt-workbook-conversion.md` | current | Figures reconciled by Phase A (A6). Windows-only command is Phase 3 task 3.11. |
| `implementation/phase-04-manual-blocking.md` | historical | Implementation record; minimum-layover statements stale (1-011). |
| `implementation/phase-04-closeout.md` | historical | Dated closeout; "Costing ... has not started" was true at its date. |
| `implementation/phase-03r-unified-action-layers.md`, `phase-03r-closeout.md` | historical | Closed phase. |
| `implementation/phase-03-service-day-workflows.md`, `phase-03-closeout.md` | historical | Closed phase. |
| `implementation/phase-02tp-trip-profiles.md`, `phase-02tp-closeout.md` | historical | Closed phase. |
| `implementation/phase-02r-trips-workflow-revision.md`, `phase-02r-safe-route-editing.md`, `phase-02r-package-2rb-closeout.md`, `phase-02r-package-2rc-closeout.md` | historical | Closed phase; self-described as historical. |
| `implementation/phase-02-runtime-trip-generation.md`, `phase-02-closeout.md`, `phase-02-package-2a…2f-closeout.md` | historical | Superseded generation-set workflow; reviewed only where compatibility code runs (plan Section 2 rule 4). |
| `implementation/phase-01-route-definition.md`, `phase-01-closeout.md` | historical | Closed phase. |

## 5. Areas examined with no defects found

- Dexie version sequence and store definitions v1–v6: `database.ts:8-41` matches `data-schema.md:507` (v1–v5), overview `:281` and D0035-C1 (v6), D0012 (v2 index), D0019-12 (v4 discard via `blocks.clear()`), PL05-09 (v5 empty store, `costPlans` untouched).
- JSON backup schema: `PROJECT_BACKUP_SCHEMA_VERSION = 6` (`backup.ts:28`); accepted versions 1–6 (`backup.ts:391`); per-version collections (runtime ≥2, generation sets/trips/blocks ≥3, Trip profiles ≥4 with v1–3 Default normalization, Blocking Scenarios ≥5, Costing assumptions =6) match OV-TECH-06/07, DS-36/37, D0007-02, D0009-02, D0016-02, PL05-09. Format identifier, `exportSchemaVersion`, `exportedAt`, optional `applicationVersion` match DS-35.
- CSV columns: Costing assumptions/results/exclusions headers (`csv.ts:104,120-124,171`) contain every field PL05-10 lists, including the rounding note required by PL05-06; Blocking summary `runningHours`, `valid`, `complete` (`csv.ts:261`) match D0026-08 and D0021-11; activity CSVs carry relative-offset and legacy time columns (`csv.ts:55,237`) per D0022-C1/D0023-C1; Trip CSV carries `tripProfileId`/`tripProfileName` and no generation-set columns in the authoritative export (`csv.ts:34`) per DS-40; Runtime profile CSV carries the method (`runtimePaste.ts:21`) per D0035-01.
- Phase 5 status claims across five documents (Section 1, task 1.4).
- Runtime-profile deletion rule (roadmap `:105`) against `routeDefinitionService.ts:749-764`: blocks deletion when Trips reference the profile; consistent.
- Exported type names against glossary code names.
- Trip Profile menu has no **New profile…** (`App.tsx:1134-1141`), consistent with `phase-03r-closeout.md:20`.

## 6. Delegated claims rejected on verification

None. No sub-agents were used (Agent tool unavailable).

## 7. Leads handed to later phases

| Lead | Owner | Evidence |
| --- | --- | --- |
| Last Trip generation is not capped at 500 (1-009). Recommended S2. Check application and UI paths too. | Phase 2 (task 2.3) | `docs/review/golden/p1-generationCap.golden.test.ts`; `trips.ts:44,57` |
| `segmentStart` anchored regeneration silently picks the nearest of multiple solutions (1-005); blended search may share the issue. | Phase 2 (task 2.4) | `trips.ts:267-282` |
| v3/v4 backup import keeps placeholder Blocks without a Blocking Scenario (1-010): rate the data-path consequence, including re-export and `tripProfileId`-based Block queries. | Phase 3 (task 3.2) | `p1-v4PlaceholderBlocks.golden.test.ts`; `backup.ts:430,449`; `dexieRepository.ts:300,378,468` |
| `csvEscape` quotes on `"`, `,`, `\n` but not `\r` (`csv.ts:5`); relevant to CRLF and formula-injection checks. | Phase 3 (tasks 3.9, 3.10) | `csv.ts:5` |
| `CostingFinding` does not use the `ValidationFinding` shape (1-016). | Phase 2 (task 2.11) | `costing.ts:198,203` |
| PL05-AC3 "The count sum never exceeds 365 in new edits": the Service days editor (`App.tsx:508`) shows no sum check; only Costing reports it. | Phase 5 (and Phase 4 for the save path) | `App.tsx:508`; `costing.ts:203` |
| React imports a persistence serializer: `tripTableCsv.ts:3` imports `toCsv`; `csvDownload.ts:1-2` re-exports `createCsvArchive` from persistence. Contradicts OV-TECH-03. | Phase 4 (task 4.1, L-09) | cited lines |
| Generation-set repository methods and legacy CSV exports described as serving the "running pre-2R UI" (`data-schema.md:488,542`). Confirm reachability. | Phase 4 (task 4.4, L-11) | cited lines |
| Trips label **Scenario** for the Blocking Scenario selector (1-013) — Luna-class UI change if UD-3 is accepted. | Phase 5 | `App.tsx:1205` |
| `tests/ui/trip-table-layout.spec.ts:40` asserts the overview's bounded viewport; Decision 0035 governs (1-001). | Phase 5 (task 5.1) | A-001 |

## 8. Task 1.7: Agent-instruction applicability (L-21) — recommendation only

Assessment of `AGENTS.md` and `codex.md` for a non-Codex agent:

1. **Unambiguous and tool-neutral:** required reading order, layer separation, store-inputs-derive-outputs, decision-record and overview update duties, change safety (no destructive Git, no commit/push without request), verification scaling, and work-package gates. A Claude agent can follow these as written.
2. **Codex-specific and ambiguous for other agents:**
   - "Use `apply_patch` for source and documentation edits" (`AGENTS.md`, Change Safety). No such tool exists for Claude agents. The review plan (Section 2) supplies an interpretation for this review only.
   - "Distinguish work Codex performs from actions the user must perform" and `codex.md:7` ("Codex should perform ...") name one agent product.
   - Model names Luna, Sol, and Terra are not models a Claude agent can select or recommend by name. The rule's intent is a capability class (structural/low-novelty vs. design-judgment UI). The review plan already uses "Luna-class" and "Sol-class".
   - `codex.md` is titled "Codex Project Guide", yet `AGENTS.md` requires every agent to read it.
3. **Factually stale instructions that mislead any agent:** `codex.md:51` (Git may not be initialized), conditional Git steps (`:48`, `:104`), and the absence of a verification command list although `package.json` scripts exist (1-007).
4. **Recommendation (for a Stage 4 documentation package, not Stage 2):**
   - Add one sentence to `AGENTS.md` stating that its rules apply to every coding agent and mapping tool names: "`apply_patch` means the agent's file-edit tool; shell redirection and bulk `sed` are not used on source files."
   - Restate model guidance as capability classes with the current names in parentheses (for example, "structural class (Luna)", "UI-design class (Sol)") so an agent without those models can still classify packages.
   - Replace `codex.md:51` with the verified repository facts (Git initialized, `origin` on GitHub, `pnpm` scripts) and add a short verification command list.
   - Optionally rename `codex.md` to a neutral project guide name; this requires updating `AGENTS.md` and `architecture_overview.md:301`, so it is a user decision (UD-4).

## 9. User decisions required

| ID | Question | Options | Recommendation |
| --- | --- | --- | --- |
| UD-1 (L-07) | Does this code review replace Phase 5 Package 5D ("Cross-layer audit, docs, regression verification, user acceptance", `phase-05-costing.md:44`)? Evidence: 5D is unstarted (`codex.md:123,127`; `architecture_overview.md:7`); its three technical deliverables are tasks of Phases 1, 4, and A/5 of this review. User acceptance is not covered by the review. | (a) Yes: record in `phase-05-costing.md` that the review's Stage 3 register replaces the 5D audit, leaving only user acceptance. (b) No: run 5D separately after Stage 4. | (a), as plan Section 8.4 item 1 recommends. |
| UD-2 | Is Package 5C user review complete? It decides whether 1-014 and any Costing UI findings are regressions or open package work. | (a) Complete — record the date in `phase-05-costing.md:5`. (b) Open — Costing UI findings go to 5C. | User judgment; no technical recommendation. |
| UD-3 | Trips Blocking Scenario selector label (1-013). | (a) **Blocking Scenario**. (b) Keep **Scenario**. | (a). |
| UD-4 | Segment-start anchored regeneration with multiple solutions (1-005). | (a) Reject and report, per OV-TRIP-03 and D0031-04. (b) Choose the nearest to the saved departure, as coded; record in 0031. | (a) unless the user prefers (b). |
| UD-5 | Make `AGENTS.md`/`codex.md` agent-neutral (Section 8). | (a) Neutral wording and capability classes; keep file names. (b) Also rename `codex.md`. (c) No change. | (a). |

## 10. Gate

| Exit criterion | Met | Evidence |
| --- | --- | --- |
| Rule catalogue published | Yes | `docs/review/findings/rule-catalogue.md`, published before all other Phase 1 output. |
| Every contradiction states which source the code follows | Yes | Findings 1-001, 1-002, 1-003, 1-005, 1-006, 1-008, 1-009, 1-010, 1-012, 1-013, 1-016 each name the side. |
| Every document rated current, partly stale, or historical | Yes | Section 4 covers every document in plan Section 2. |

Seed leads: L-02, L-03, L-04, L-05, L-06 confirmed; L-07 recorded as UD-1; L-21 assessed (Section 8).

Counts: S0 0, S1 0, S2 1 (1-010), S3 15.
