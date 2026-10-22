# Code Review Issue Register

- Status: Stage 3A (plan Section 8.1 steps 1–5) and Stage 3B (steps 6–7) complete. Packages: `docs/review/fix-packages.md`. User decisions C1–C8 (approved 2026-10-22): `docs/review/user-decisions.md`.
- Date: 2026-10-22. Branch `claude/upbeat-ritchie-51mpy5`; code baseline `main` at `baed9f1`.
- Sources: `docs/review/findings/phase-A.md` and `phase-1.md` to `phase-6.md`. User decisions 1–18 in `docs/review/user-decisions.md` are settled and are cited, not re-opened.

## Operating model

- The review lead (Opus-class) collected, de-duplicated, calibrated, and grouped every finding. The lead is the only orchestrator.
- One independent Sonnet verifier, which wrote no finding, reproduced the sample below from the written evidence alone. Its temporary `zz-verify-*` copies in `docs/review/golden/` were deleted, and `git status` was clean afterwards.
- Severity uses the plan Section 5.2 rubric. A merged issue takes the highest severity of its findings before calibration.

## Verification sample

- Every S0 and S1 finding: 4-001, 4-002, 3-001, 3-002, 3-006.
- 25% of the 46 Stage 2 S2 findings, rounded up: 12 findings.
  - Method: sort the 46 S2 IDs as strings, then `random.Random(20261022).shuffle(ids)` in Python 3, and take the first 12.
  - Seed: **20261022**.
  - Sample: 2-001, 3-007, 3-012, 4-004, 4-009, 5-009, 5-011, 5-013, 6-001, A-003, A-004, A-007.
- Results: 17 of 17 reproduced. 16 reproduced from their written evidence; 1 (4-004) was repaired by the lead and then reproduced. 0 dropped. No severity disagreement. No new S0.
- The verifier ran copies of the golden tests with the defect marker removed, in Vitest and in Chromium on port 4187, and confirmed that each failure was on the data assertion. It deleted every copy (`git status` empty). Full report (scratch, not committed): `s3a/verifier/report.md` in the session scratchpad.

## Counts by severity

| Stage | S0 | S1 | S2 | S3 | Total | Closed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Stage 2 findings, as written | 2 | 3 | 46 | 67 | 118 | A-006 (counted in S2) |
| After de-duplication (16 merges), before calibration | 2 | 3 | 40 | 56 | 101 | 1 (I-102) |
| After calibration | 2 | 3 | 41 | 55 | 101 | 1 (I-102) |
| After Stage 3B packaging (I-074 split into a, b, c) | 2 | 3 | 41 | 57 | 103 | 1 (I-102) |

## Severity changes (step 4)

Calibration rules applied across phases:

1. A test gap is S2 when a test passes for the wrong reason, can never pass, or is the reason a confirmed defect went undetected. A missing test with no hidden defect is S3.
2. A reviewed operation whose commit does not reject a stale review is S2. The rubric names "stale-review check missing on one path" as an S2 example.
3. Unreachable code has no consequence for a planner's data. It is S3, whatever it would do if it were wired.
4. Wrong Revenue or Platform hours on data the app still accepts is at least S2, even if only legacy data can produce it.
5. A UI action that writes a value the planner tried to cancel is S2, the same class as a one-click destructive action (5-008).

| Issue | Finding | From | To | Reason |
| --- | --- | --- | --- | --- |
| I-015 | 2-006 | S3 | S2 | Rule 4. A misplaced legacy explicit-time deadhead gives 20 minutes of usable layover, which D0026 adds to Revenue hours. A legacy pull-out understates Platform hours. Backup import still accepts both shapes. Workaround: re-enter the activity in relative form. |
| I-027 | 4-011, 4-012 | S3 | S2 | Rule 2. Trip Profile deletion silently deletes a Blocking Scenario created after the review. `deleteTrips` removes Block activities that its review did not show. |
| I-028 | 4-019 | S3 | S2 | Rule 2. A Trips CSV import reviewed before a Pattern change saves a Trip with 2 times against a 3-point Pattern. |
| I-042 | 5-024 | S3 | S2 | Rule 5. Escape in `NumericCommit` calls `setDraft(value)` and then `blur()`. The `onBlur` handler still holds the typed draft, so it commits the typed value (`src/ui/App.tsx:1784`, re-traced by the lead). The Service days annual count uses this input, and that commit also triggers I-001. |
| I-047 | A-007 | S2 | S3 | Rule 1. Phase 2 found no `segmentStart` calculation defect: its boundary matrix passes. The remaining gap is that the matrix lives only in `docs/review/golden/`, outside `pnpm test`. |
| I-069 | 3-008 | S2 | S3 | Rule 3. `RouteDefinitionService.deleteNode` is unreachable: its only caller, `App.tsx:258`, is dead (4-015). It stays flagged: it would be S0 if wired, and its removal belongs with I-075. |
| I-084 | 5-003 | S2 | S3 | Rule 1. Every listed Trips table behavior passes in the browser today (Phase 5 task 5.6). |

Severity raised only by a merge (not a calibration): 4-008 (S3) under 6-001 (S2); 6-008 (S3) under 5-013 (S2); 1-009 (S3) under 2-001; 1-005 (S3) under 2-003; 3-014 (S3) under A-003; 4-021 (S3) under 4-002 (S0); A-004 (S2) under 3-006 (S1).

Severities reviewed and kept, with the reason:

- 3-001 stays S1, not S0: the exported file is complete and correct, and a code fix makes it restorable.
- 3-007 stays S2, not S0: the Node deletion is complete and intended. The orphaned references show as "—", do not change Costing eligibility (pull-out and pull-in Node IDs are not checked), and the planner can re-select a Node.
- 3-009 stays S2 (user decision 6).
- 4-010 stays S2. The app never writes `null` to either key (`App.tsx:45,879`, `BlockingWorkspace.tsx:33`), so the trigger is an outside write. Note for Stage 3B: the only recovery, "clear site data", also deletes the IndexedDB store unless a backup was exported first.
- 4-025 stays S3: the pasted method lands in the Runtime editor draft, which the planner still has to save.

## Rejected claims

Rejected during Stage 2, by the phase that received them. None became a finding.

| Claim | Source | Rejected by | Reason |
| --- | --- | --- | --- |
| The converter flattened pull-out and pull-in durations to 30 minutes. | Phase A analyst | Phase A | `federal_brt_to_backup.py:397-398` reads them from the workbook. |
| Revenue hours wrongly include layover. | Phase A analyst | Phase A | D0026 item 6 defines Revenue hours that way. |
| Trip copy keeping `calculationSource` is a defect. | Phase A lead | Phase 2 | D0017-07 requires provenance to be kept. |
| Mirrored-Pattern Trip-count asymmetry is a defect (L-22). | Phase A lead | Phase 2 | All 984 Trips reproduce; the asymmetry is in the source rows. |
| An unknown direction-column Node is a validation gap. | Phase 3 orchestrator | Phase 3 | Recovered by design (`backup.ts:203-231`). |
| `formatTripTableClock` is dead, so 2-002 cites a dead path. | Analyst R3 | Phase 4 lead | 4 calls at `App.tsx:1481`. |
| `App.tsx` 521 onward is a block comment. | Haiku H1 | Phase 4 lead | The comment spans 521–531 only. |
| Menu-opened dialogs have effective `autoFocus`. | Haiku H2 | Phase 5 lead | `MenuButton.tsx:45` refocuses the trigger. |
| `jszip` is declared but never imported. | Phase 4 hand-off | Phase 6 lead | Not declared, not locked, not imported. `phase-4.md` Sections 1 and 6 were corrected in Stage 3A. |
| P6-S1-01 is S1. | Analyst S1 | Phase 6 lead | Lowered to S2: Trips-table assignment is a workaround. |
| `getBlockSummary` fan-out is at `main.tsx:35`. | Analyst S1 | Phase 6 lead | It is at `main.tsx:43`. |
| 6-008 needs a user decision. | Analyst S1 | Phase 6 lead | `styles.css` already states the intended 14 px. |
| Declared ranges block every update. | Haiku H1 | Phase 6 lead | The caret ranges allow the patched versions. |

Stage 3A verification results (no finding was dropped):

| Finding | Result | Correction to the written evidence |
| --- | --- | --- |
| 4-004 | Repaired, then reproduced | The cited test (`p4-stale-preview.golden.test.ts`, A1-03) asserts only that no error finding is raised. The lead ran the same setup and applied the import: Trip `in-1` (inbound) is stored with `patternId` `outbound`, and Block `b1` still references it. Corrected location: `tripGenerationService.ts:238-239`. |
| 4-009 | Reproduced | The test asserts the 3 orphan Trips; "shows no error" is a spec comment, not an assertion. |
| 3-001 | Reproduced | Reproduced in Node. The one-profile round-trip claim and the Chromium variant were not re-run in 3A. |
| 3-006 | Reproduced | Hypothesis 2: the select value is `""`, which is the "Select Node" option, so "not among its options" is imprecise. The outcome (source ID written back silently) matches. |
| 5-011 | Reproduced | Calling `applyTripShift([id], -600)` directly stores −300, after which the Trips tab throws until the Trip is repaired. No UI path reaches this, so S2 stands. |
| 4-001 | Reproduced | Rename scenario, New route, and Duplicate route remain Probable (not run). |

## De-duplication (step 2)

| Issue | Kept finding | Merged findings | Shared root cause |
| --- | --- | --- | --- |
| I-002 | 4-002 | 4-021 | No cross-tab or in-transaction stale check; 4-021 matters only through 4-002, and Phase 4 folded it into the 4-002 fix. |
| I-005 | 3-006 | A-004 | `project.ts:222` does not apply the `nodeIds` map. 3-006 records the consequences. |
| I-006 | A-001 | 5-001 | The browser suite asserts a stale label and the nested scroller that D0035-05 forbids. |
| I-008 | A-003 | 3-014 | No executed test runs a real per-version migration or reports the placeholder-Block discard count. |
| I-009 | A-005 | 4-005 | `updateServiceDay` saves without validation. |
| I-011 | 2-001 | 1-009 | The Last Trip path ignores the 500-Trip limit. 1-009 is the document side. |
| I-012 | 2-002 | 5-011 | `shiftTrips` and the shift preview have no lower bound. 5-011 is the UI crash. |
| I-013 | 2-003 | 1-005 | Anchored regeneration picks one of several departures. 1-005 is the missing decision text. |
| I-014 | 2-004 | 2-005 | `safeRouteEditing.ts:267-289` stamps the new revision on every Trip unconditionally. |
| I-027 | 4-012 | 4-011 | Deletion review tokens are missing or incomplete. |
| I-038 | 5-013 | 6-008 | `index.html` has no doctype, charset, viewport, `lang`, or title. |
| I-043 | 6-001 | 4-008 | `classifyInsertion` re-reads every Trip and Pattern once per candidate. |
| I-059 | 1-015 | 5-022 | `ui-conventions.md` mixes historical and current rules; 5-022 is its `:27` line. |
| I-060 | 1-016 | 2-015 | The finding shape is not unified between documents, `ValidationFinding`, and `CostingFinding`. |
| I-072 | 3-015 | 4-017 | UI error paths bypass or defeat the technical-error filter. 4-017 asks for this merge. |
| I-097 | 6-006 | A-008 | The typecheck scope omits `tests/ui` and `playwright.config.ts`; `@types/node` is absent. |

Non-finding items merged: 6-009 also carries seed lead L-08 and plan Section 8.4 item 6 (user decision 18).

## Issue register

Verification column: **3A Reproduced** means the Stage 3A verifier reproduced the finding. Rows outside the sample carry their Stage 2 confidence. "Lead re-run" means a Stage 2 lead re-executed it. "UD n" cites a settled user decision. The root-cause groups are defined in the next section.

| ID | Sev | Category | Title | Merged finding IDs | Verification | Root-cause group | Fix package |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I-001 | S0 | data-integrity | Service-day edits (and Scenario rename, New Route, Duplicate Route) write the App's startup Scenario snapshot over newer Trips, Blocks, and Runtime profiles | 4-001 | 3A Reproduced (Service day path; other 3 triggers still Probable) | G01 | P01 |
| I-002 | S0 | data-integrity | A second tab silently deletes or reverts data saved in the other tab; stale checks run outside the write transaction (UD 10) | 4-002, 4-021 | 3A Reproduced (6 overwrite cases; control passes) | G01 | P02 |
| I-003 | S1 | data-integrity | A backup with two or more Trip Profiles cannot be restored; export → import is not stable with one profile | 3-001 | 3A Reproduced (Node; one-profile round trip not re-observed) | G03 | P04 |
| I-004 | S1 | data-integrity | Scenario duplication fails when a non-first Trip Profile's Blocking Scenario has Trips; otherwise it stamps every copied Block with the first profile | 3-002 | 3A Reproduced (Node) | G02 | P03 |
| I-005 | S1 | data-integrity | Scenario duplication leaves pull-out, pull-in, and deadhead Nodes pointing at the source Scenario; deadhead Blocks become ineligible for Costing (UD 4: recover on load) | 3-006, A-004 | 3A Reproduced (Node and Chromium; H2 wording corrected) | G02 | P03 |
| I-006 | S2 | test-gap | Seven browser tests fail: a stale menu label, and two tests assert the nested scroller that D0035-05 forbids | A-001, 5-001 | Stage 2 Confirmed (6 runs) | G15 | P05 |
| I-007 | S2 | test-gap | The production Dexie repository has no unit-test coverage | A-002 | Stage 2 Confirmed (coverage run) | G04 | P06 |
| I-008 | S2 | test-gap | The migration unit test never runs and asserts version 5; the browser migration test seeds raw version 4, which is Dexie 0.4 | A-003, 3-014 | 3A Reproduced | G04 | P06 |
| I-009 | S2 | contract | `updateServiceDay` saves annual counts above 365, negative, fractional, or NaN, and blank or untrimmed names | A-005, 4-005 | Stage 2 Confirmed (A1 test) | G08 | P09 |
| I-010 | S2 | contract | v3/v4 backup import keeps placeholder Blocks with no Blocking Scenario, against D0019-13; they inflate deletion counts | 1-010 | Stage 2 Confirmed | G03 | P04 |
| I-011 | S2 | contract | A Last Trip generation request is not limited to 500 Trips | 2-001, 1-009 | 3A Reproduced | G07 | P08 |
| I-012 | S2 | correctness | Shifting Trips before 0:00 yields negative times; staging such a Shift crashes the app (no error boundary) | 2-002, 5-011 | 3A Reproduced (5-011; root empties) | G07 | P08 |
| I-013 | S2 | contract | `segmentStart` and blend anchored regeneration silently pick one of several valid departures (UD 3: reject and list) | 2-003, 1-005 | Stage 2 Confirmed | G07 | P08 |
| I-014 | S2 | correctness | A deterministic route edit stamps the new runtime revision on every Trip, hiding stale Trips and `segmentStart` mismatches | 2-004, 2-005 | Stage 2 Confirmed | G06 | P07 |
| I-015 | S2 | correctness | Legacy explicit-time deadheads and pull-outs are not checked against their placement; layover and Platform hours are wrong | 2-006 | Stage 2 Confirmed | G12 | P12 |
| I-016 | S2 | correctness | Runtime "Copy from day" always fails on IndexedDB: the transaction omits `patterns` and `serviceDays` (UD 6) | 3-009 | Stage 2 Confirmed (lead re-run) | G04 | P01 |
| I-017 | S2 | data-integrity | Backup import accepts dangling, cross-Scenario, duplicate, and negative Block and Trip data; two inputs raise raw TypeErrors | 3-005 | Stage 2 Confirmed | G03 | P04 |
| I-018 | S2 | data-integrity | Node deletion in the Node editor leaves non-revenue activities pointing at the deleted Node, and the preview does not report them | 3-007 | 3A Reproduced | G05 | P09 |
| I-019 | S2 | pipeline | CSV header cells are not escaped; a Pattern or Node name with a comma or quote breaks the Trips CSV round trip | 3-012 | 3A Reproduced | G13 | P13 |
| I-020 | S2 | contract | In-memory and Dexie repositories diverge on stale rejection, Scenario cascade, ordering, and error types | 3-013 | Stage 2 Confirmed | G04 | P06 |
| I-021 | S2 | contract | A single-Trip Pattern change commits without a stale check | 4-003 | Stage 2 Confirmed (lead re-run) | G06 | P07 |
| I-022 | S2 | data-integrity | Trips CSV import moves a Trip from the other Direction onto this Direction's Pattern | 4-004 | 3A Repaired (evidence asserted only the missing finding; lead added the move check) | G06 | P07 |
| I-023 | S2 | contract | Only Route saves publish the save status (UD 11: every write) | 4-006 | Stage 2 Confirmed (3 traces) | G09 | P10 |
| I-024 | S2 | correctness | "Apply to all similar Trips" in the deadhead dialog skips every second matching connection | 4-007 | Stage 2 Probable (loop executed on a copy) | G11 | P14 |
| I-025 | S2 | data-integrity | Trip generation stores Trips for a Trip Profile that no longer exists | 4-009 | 3A Reproduced (3 orphan Trips; "no error" not asserted) | G01 | P01 |
| I-026 | S2 | correctness | A JSON `null` in either selection-preference key blanks the app on every load | 4-010 | Stage 2 Confirmed (lead re-run) | G18 | U03 |
| I-027 | S2 | contract | Deletion reviews are incomplete: Trip Profile token ignores Blocking Scenarios; `deleteTrips` removes unshown activities; Route, Scenario, Runtime profile, and Project deletes have no token | 4-012, 4-011 | Stage 2 Confirmed (A1 tests) | G05 | P09 |
| I-028 | S2 | contract | The Trips CSV review signature omits Patterns; a stale review saves a Trip with the wrong number of times | 4-019 | Stage 2 Confirmed (A1 test) | G06 | P07 |
| I-029 | S2 | test-gap | Three layout tests assert hand-written fixture HTML that no longer matches the app | 5-002 | Stage 2 Confirmed (lead re-run) | G15 | P05 |
| I-030 | S2 | ux | Runtime editor drafts, Build Trips input, the Add-trip row, and Blocking dialog drafts are discarded silently; a staged Shift is lost on a profile change (UD 14) | 5-004 | Stage 2 Confirmed (lead re-run) | G17 | U03 |
| I-031 | S2 | ux | Costing shows an invalid estimate for a service-day total above 365 without listing the problem | 5-005 | Stage 2 Confirmed (lead re-run) | G08 | U06 |
| I-032 | S2 | ux | Saving Nodes discards an unsaved Pattern draft, and saving a Pattern discards unsaved Node edits | 5-006 | Stage 2 Probable (lead code read) | G17 | U03 |
| I-033 | S2 | ux | The Costing results table overflows at 1024 px and hides Annual cost (AC7) | 5-007 | Stage 2 Confirmed | G20 | U06 |
| I-034 | S2 | ux | Removing a Trip, Pull-out, or Pull-in from a Block is one click with no confirmation or undo | 5-008 | Stage 2 Confirmed | G19 | U05 |
| I-035 | S2 | ux | Delete Block and Delete Blocking Scenario show no impact counts; Delete Pattern's button reads "Confirm" | 5-009 | 3A Reproduced (code trace) | G19 | U05 |
| I-036 | S2 | a11y | Modal dialogs have no focus trap, lose initial focus when opened from a menu, ignore Escape (10), or lack a name (2) | 5-010 | Stage 2 Confirmed (lead re-run) | G16 | U04 |
| I-037 | S2 | a11y | Focus drops to the page body after Shift drawer steps and common confirms | 5-012 | Stage 2 Confirmed (lead re-run) | G16 | U04 |
| I-038 | S2 | a11y | `index.html` has no doctype, charset, viewport, `lang`, or title; the app renders in quirks mode | 5-013, 6-008 | 3A Reproduced | G21 | U01 |
| I-039 | S2 | ux | After a stale-source rejection, Blocking rejects every edit until the day changes or the page reloads | 5-014 | Stage 2 Probable | G01 | U02 |
| I-040 | S2 | ux | Blocks with Trips from another Route show "Missing pattern" and "—" (UD 15) | 5-015 | Stage 2 Probable | G11 | U05 |
| I-041 | S2 | contract | The shared Runtime-profile display names only the selected day (02R-AC18) | 5-016 | Stage 2 Confirmed (code) | G24 | U07 |
| I-042 | S2 | ux | Escape in numeric and runtime time inputs commits the typed value instead of cancelling | 5-024 | Stage 2 Probable; lead trace in 3A | G16 | U03 |
| I-043 | S2 | performance | The Blocking compatibility review takes about 22 s at 300 unassigned Trips and blocks Assign | 6-001, 4-008 | 3A Reproduced (24.2 s) | G10 | P11 |
| I-044 | S2 | performance | The Costing tab takes about 31 s at capacity and shows "Select a valid Blocking Scenario" while it waits | 6-002 | Stage 2 Confirmed (lead re-run) | G10 | P11 |
| I-045 | S2 | data-integrity | No persistent-storage request, no backup reminder, and raw text on quota failure (UD 16) | 6-003 | Stage 2 Confirmed (grep, simulated quota) | G09 | P10 |
| I-046 | S2 | pipeline | Deployment publishes every push to `main` without tests; no workflow runs on pull requests | 6-004 | Stage 2 Confirmed | G22 | B01 |
| I-047 | S3 | test-gap | The `segmentStart` calculation tests exist only in the review golden suite, not in `pnpm test` | A-007 | 3A Reproduced; closure confirmed (14 review tests pass) | G15 | P06 |
| I-048 | S3 | docs | The overview describes a bounded Trips scroll viewport that D0035-05 forbids | 1-001 | Stage 2 Confirmed | G23 | D01 |
| I-049 | S3 | docs | Roadmap constraints and deletion rules contradict Decisions 0011, 0019, 0033, 0035 | 1-002 | Stage 2 Confirmed | G23 | D01 |
| I-050 | S3 | docs | Overview, schema, glossary, and roadmap omit the Number of Trips limit | 1-003 | Stage 2 Confirmed | G23 | D01 |
| I-051 | S3 | docs | Decision status lines are missing, stale, or omit supersession | 1-004 | Stage 2 Confirmed | G23 | D01 |
| I-052 | S3 | docs | The overview says service-day counts are "capped at 365"; the code treats more than 365 as an error | 1-006 | Stage 2 Confirmed | G08 | P09 |
| I-053 | S3 | docs | `codex.md` and the overview repeat status paragraphs; `codex.md` makes false repository claims (UD 9) | 1-007 | Stage 2 Confirmed | G23 | D01 |
| I-054 | S3 | docs | `data-schema.md` index table, migration history, and entity shapes drift from the code | 1-008 | Stage 2 Confirmed | G23 | D01 |
| I-055 | S3 | docs | The minimum-layover preference has no decision record and contradicts D0020-19 | 1-011 | Stage 2 Confirmed | G23 | D01 |
| I-056 | S3 | docs | Decisions 0017 and 0018 were overtaken by `ui-conventions.md` without an amendment | 1-012 | Stage 2 Confirmed | G23 | D01 |
| I-057 | S3 | docs | Trips labels "Scenario" (UD 7: "Blocking Scenario") and "Run Time" are not glossary terms | 1-013 | Stage 2 Confirmed | G23 | U07 |
| I-058 | S3 | docs | The Phase 5 plan's Costing column list does not match the implemented table (UD 2) | 1-014 | Stage 2 Confirmed | G20 | U06 |
| I-059 | S3 | docs | `ui-conventions.md` mixes current and historical rules, including the modal Node-removal rule | 1-015, 5-022 | Stage 2 Confirmed | G23 | D01 |
| I-060 | S3 | contract | The validation-finding shape differs between documents, `ValidationFinding`, `CostingFinding`, and Blocking string errors | 1-016, 2-015 | Stage 2 Confirmed | G12 | P12 |
| I-061 | S3 | contract | At an exact gap midpoint, `segmentStart` picks the earlier band and the blend picks the later band | 2-007 | Stage 2 Confirmed | G12 | P16 |
| I-062 | S3 | correctness | Half-second decimal-minute runtime entries round inconsistently | 2-008 | Stage 2 Confirmed | G12 | P16 |
| I-063 | S3 | contract | The direction-order conflict message does not name the Direction | 2-009 | Stage 2 Confirmed | G12 | P16 |
| I-064 | S3 | contract | A zero-second Trip shift is accepted and marks Trips manually changed | 2-010 | Stage 2 Confirmed | G07 | P08 |
| I-065 | S3 | contract | Renaming a runtime band label increments the revision and marks Trips stale | 2-011 | Stage 2 Confirmed | G06 | P07 |
| I-066 | S3 | contract | A 0-mile Pattern is reported as complete (UD 8: treat as incomplete) | 2-012 | Stage 2 Confirmed | G12 | P12 |
| I-067 | S3 | correctness | Per-day hour totals accumulate in floating hours and can break the half-away-from-zero tie | 2-013 | Stage 2 Confirmed | G12 | P16 |
| I-068 | S3 | layering | Domain ID generation and two timestamp paths are not injectable | 2-014 | Stage 2 Confirmed (trace) | G12 | P16 |
| I-069 | S3 | data-integrity | The unused `RouteDefinitionService.deleteNode` deletes other Routes' Nodes and commits in two transactions (S0 if wired) | 3-008 | Stage 2 Confirmed | G14 | X01 |
| I-070 | S3 | pipeline | `csvEscape` does not quote a bare CR | 3-010 | Stage 2 Confirmed | G13 | P13 |
| I-071 | S3 | pipeline | CSV exports write text beginning with `=`, `+`, `-`, `@` unescaped (UD 5) | 3-011 | Stage 2 Confirmed | G13 | P13 |
| I-072 | S3 | ux | Twelve UI error paths bypass or defeat the technical-error filter; the filter misses some Dexie names | 3-015, 4-017 | Stage 2 Probable (one path executed) | G09 | U02 |
| I-073 | S3 | layering | UI modules import persistence CSV serializers (UD 12: move to `src/application`) | 4-013 | Stage 2 Confirmed | G13 | P13 |
| I-074a | S3 | layering | Business rules implemented in React: Blocking items (reorder grouping, activity insertion, ownership filter, Layover %) | 4-014 | Stage 2 Confirmed (code) | G11 | P14 |
| I-074b | S3 | layering | Business rules implemented in React: Costing items (`validateCostingAssumptions`, day total, 365 check, year list) | 4-014 | Stage 2 Confirmed (code) | G20 | P11 |
| I-074c | S3 | layering | Business rules implemented in React: Trips and Runtime items (band assembly, shift rules, duplicate departures, usable Pattern, ordering, Build Trips validation, render-time runtime calls) | 4-014 | Stage 2 Confirmed (code) | G24 | P15 |
| I-075 | S3 | layering | Dead legacy generation-set UI, App route handlers, service methods, and exports (UD 13) | 4-015 | Stage 2 Confirmed | G14 | X01 |
| I-076 | S3 | correctness | Startup, selection reloads, and JSON/CSV export have no error handling | 4-016 | Stage 2 Probable | G09 | U02 |
| I-077 | S3 | correctness | A blank minutes field saves a 0-minute deadhead in a single save but is rejected in bulk | 4-018 | Stage 2 Probable | G11 | P14 |
| I-078 | S3 | contract | `renameScenario` accepts a blank name; legacy route mutators bypass preview and Pattern validation | 4-020 | Stage 2 Confirmed (A1 tests) | G08 | P09 |
| I-079 | S3 | contract | Nine `ports.ts` interfaces are unused; four no longer match their services | 4-022 | Stage 2 Confirmed | G14 | X01 |
| I-080 | S3 | test-gap | The costing context assembly in `main.tsx` is untested | 4-023 | Stage 2 Confirmed | G15 | P11 |
| I-081 | S3 | correctness | `listStaleTrips` marks a Trip stale on any error, including programming errors | 4-024 | Stage 2 Confirmed (code) | G06 | P07 |
| I-082 | S3 | correctness | Runtime paste replaces the calculation method, also in Append mode, without showing it | 4-025 | Stage 2 Probable; lead read in 3A (`App.tsx:1339`) | G24 | U07 |
| I-083 | S3 | correctness | Blocking loads have no request guard against out-of-order responses | 4-026 | Stage 2 Suspected | G11 | U05 |
| I-084 | S3 | test-gap | No test covers Trips table rounding, headways, shading, duplicate header, overlaps, scroll restoration, or net-zero discard | 5-003 | Stage 2 Confirmed | G15 | P05 |
| I-085 | S3 | test-gap | Weak browser assertions (no reload, unasserted screenshots, conditional branches) | 5-017 | Stage 2 Confirmed | G15 | P05 |
| I-086 | S3 | a11y | Menu semantics: `menuitemradio` for independent toggles, menus stay open on Tab, no typeahead | 5-018 | Stage 2 Confirmed | G16 | U04 |
| I-087 | S3 | ux | Costing Total row is not the sum of displayed rows; cross-day-type hours total; two View year selectors; pluralization | 5-019 | Stage 2 Confirmed | G20 | U06 |
| I-088 | S3 | ux | Blocking (`toFixed`) and Costing (half away from zero) round the same hours differently | 5-020 | Stage 2 Confirmed (lead re-run) | G11 | U05 |
| I-089 | S3 | ux | Labels and names: truncated Pattern pills, warning style on "No current issues", off-by-one "Move Trip N", capitalization | 5-021 | Stage 2 Confirmed | G11 | U05 |
| I-090 | S3 | a11y | Missing `aria-invalid`, headings, landmarks, labelled file inputs, and table header scope | 5-023 | Stage 2 Confirmed | G16 | U04 |
| I-091 | S3 | ux | The remembered Blocking Scenario is overwritten after a Trip Profile change | 5-025 | Stage 2 Probable | G18 | U03 |
| I-092 | S3 | correctness | Shift drawer Undo and Redo update history before the preview resolves | 5-026 | Stage 2 Suspected | G24 | U07 |
| I-093 | S3 | ux | The Trips CSV import preview shows raw Trip and Pattern UUIDs | 5-027 | Stage 2 Confirmed (code) | G24 | U07 |
| I-094 | S3 | ux | Runtime band totals of 60 minutes or more display as ":61" or ":65" | 5-028 | Stage 2 Suspected | G24 | U07 |
| I-095 | S3 | ux | Message quality: missing next steps, technical terms, wrong text | 5-029 | Stage 2 Confirmed (inventory) | G09 | U02 |
| I-096 | S3 | performance | "Regenerate selected" on 500 rows takes 2.5 s; capacity restore takes 1.9 s | 6-005 | Stage 2 Confirmed (timings) | G10 | U08 |
| I-097 | S3 | build | `pnpm typecheck` omits `tests/ui` and `playwright.config.ts`; `@types/node` is absent | 6-006, A-008 | Stage 2 Confirmed (lead re-run) | G22 | B01 |
| I-098 | S3 | build | Node and pnpm are not pinned; CI uses end-of-life Node 20 (UD 17) | 6-007 | Stage 2 Confirmed | G22 | B01 |
| I-099 | S3 | build | `zod` and `@tanstack/react-table` are declared and never imported (UD 18; L-08; plan 8.4 item 6) | 6-009 | Stage 2 Confirmed (lead grep) | G22 | B01 |
| I-100 | S3 | build | `pnpm audit`: 11 dev-toolchain advisories; five dependencies a major version behind | 6-010 | Stage 2 Confirmed (lead re-run) | G22 | B01 |
| I-101 | S3 | build | One 765 kB JavaScript chunk; every build warns | 6-011 | Stage 2 Confirmed | G22 | B01 |
| I-102 | Closed | contract | Costing applied rate in whole dollars; the documentation was corrected (A-006 resolution) | A-006 | Closed in Phase A | — | none |

## Stage 3B register corrections

- I-074 (4-014) spanned three workspaces. It is split into I-074a (Blocking, package P14), I-074b (Costing, P11), and I-074c (Trips and Runtime, P15), so that each row names one package, following the step 5 rule to group logic-in-UI findings by workspace. Severity S3 is unchanged; the S3 count rises from 55 to 57 rows.
- No severity, merge, or verification result changed during packaging.

## Root-cause groups (step 5)

Each group is a set of issues that one fix, or one tightly coupled change in the same files, resolves. Stage 3B builds packages from these groups and splits any group that mixes structural and UI work (plan Section 8.3).

| Group | Root cause | Issues | Highest | Work type | Main files |
| --- | --- | --- | --- | --- | --- |
| G01 | Writes are last-writer-wins: the UI keeps a startup Scenario snapshot, nothing coordinates tabs, and stale checks run outside the write transaction | I-001, I-002, I-025, I-039 | S0 | Structural, plus a UI follow-up for I-039 | `App.tsx` (state refresh only), `routeDefinitionService.ts`, `dexieRepository.ts`, a new tab-guard module, `main.tsx` |
| G02 | Scenario duplication does not remap Block fields (`project.ts:222`) | I-004, I-005 | S1 | Structural | `project.ts`, load-time recovery next to `recoverCopiedDirectionColumnNodeReferences` |
| G03 | Backup normalization and validation in `backup.ts` | I-003, I-010, I-017 | S1 | Structural | `backup.ts`, tests |
| G04 | Repository transaction scope and in-memory parity, with no IndexedDB test environment | I-007, I-008, I-016, I-020 | S2 | Structural plus test | `dexieRepository.ts`, `inMemoryRepository.ts`, `repository.test.ts`, `tests/ui/database-migration.spec.ts`, a dev dependency |
| G05 | Deletion previews and cascades do not cover Block activities and have no review token | I-018, I-027 | S2 | Structural | `routeDefinitionService.ts`, `tripGenerationService.ts` |
| G06 | Trip commands commit without a full stale check, and runtime revisions are stamped without checking reproduction | I-014, I-021, I-022, I-028, I-065, I-081 | S2 | Structural | `safeRouteEditing.ts`, `runtime.ts`, `tripGenerationService.ts` |
| G07 | Trip generation and shift rules miss documented bounds and ambiguity rules | I-011, I-012, I-013, I-064 | S2 | Structural, plus an error boundary in UI for I-012 | `trips.ts`, `tripShift.ts`, `App.tsx` (error boundary only) |
| G08 | Service-day and name edits are not validated in the application layer | I-009, I-031, I-052, I-078 | S2 | Structural (I-009, I-078), then UI (I-031) | `routeDefinitionService.ts`, `CostingWorkspace.tsx`, `App.tsx:508`, `architecture_overview.md` |
| G09 | Save status, error mapping, and local-data protection | I-023, I-045, I-072, I-076, I-095 | S2 | Structural (status publisher, storage), then UI (messages) | `routeDefinitionService.ts`, `tripGenerationService.ts`, `blockingService.ts`, `costingService.ts`, `App.tsx`, `BlockingWorkspace.tsx`, Decision 0001 or a new record |
| G10 | Repository reads repeated once per Trip or Block in Blocking and Costing | I-043, I-044, I-096 | S2 | Structural (I-043, I-044), UI Sol-class (I-096, I-044 loading state) | `blockingService.ts`, `ports.ts`, `main.tsx`, `BlockingWorkspace.tsx:199`, `CostingWorkspace.tsx` |
| G11 | Blocking workspace logic in React and its presentation | I-024, I-040, I-074a, I-077, I-083, I-088, I-089 | S2 | Structural (move bulk apply and rules into `blockingService`), then UI | `BlockingWorkspace.tsx`, `blockingService.ts` |
| G12 | Domain calculation and finding-shape rules | I-015, I-060, I-061, I-062, I-063, I-066, I-067, I-068 | S2 | Structural | `blocking.ts`, `runtime.ts`, `durations.ts`, `safeRouteEditing.ts`, `costing.ts`, `ids.ts`, `validation.ts` |
| G13 | CSV serializers: escaping, injection, and their layer | I-019, I-070, I-071, I-073 | S2 | Structural | `csv.ts`, `runtimePaste.ts`, `tripTableCsv.ts`, `csvDownload.ts` (moved to `src/application`) |
| G14 | Dead code and unused ports | I-069, I-075, I-079 | S3 | Structural | `App.tsx` (deletions only), `routeDefinitionService.ts`, `tripGenerationService.ts`, `ports.ts` |
| G15 | Test-suite integrity and coverage gaps | I-006, I-029, I-047, I-080, I-084, I-085 | S2 | Test-only | `tests/ui/*.spec.ts`, `tests/fixtures/`, `src/**/*.test.ts` |
| G16 | Dialog, focus, and keyboard behavior | I-036, I-037, I-042, I-086, I-090 | S2 | UI | `MenuButton.tsx`, `App.tsx`, `BlockingWorkspace.tsx`, a shared dialog wrapper |
| G17 | Unsaved drafts are discarded without the discard dialog | I-030, I-032 | S2 | UI | `App.tsx`, `BlockingWorkspace.tsx` |
| G18 | Selection preferences are not shape-checked and are overwritten | I-026, I-091 | S2 | UI | `App.tsx`, `BlockingWorkspace.tsx` |
| G19 | Destructive Blocking actions lack confirmation and impact counts | I-034, I-035 | S2 | UI plus a structural preview port | `BlockingWorkspace.tsx`, `blockingService.ts`, `App.tsx:283` |
| G20 | Costing presentation | I-033, I-058, I-074b, I-087 | S2 | UI | `CostingWorkspace.tsx`, `styles.css`, `phase-05-costing.md` |
| G21 | `index.html` lacks a standards-mode document head | I-038 | S2 | UI/build; re-run layout tests afterwards | `index.html` |
| G22 | Build, CI, and dependency hygiene | I-046, I-097, I-098, I-099, I-100, I-101 | S2 | Build | `.github/workflows/`, `package.json`, lockfile, `tsconfig.json`, `.nvmrc`, `architecture_overview.md` (OV-TECH-01/02) |
| G23 | Documentation drift with no code change | I-048, I-049, I-050, I-051, I-053, I-054, I-055, I-056, I-057, I-059 | S3 | Docs (I-057 also has a one-label UI change) | `architecture_overview.md`, `codex.md`, `AGENTS.md`, `docs/data-schema.md`, `docs/domain-glossary.md`, `docs/ui-conventions.md`, roadmap, decision records |
| G24 | Trips and Runtime workspace presentation and UI logic | I-041, I-074c, I-082, I-092, I-093, I-094 | S2 | UI, plus a small query for I-041 | `App.tsx`, `routeDefinitionService.ts:765` |

Cross-group dependencies for Stage 3B:

- G04 provides the IndexedDB test environment that the G01, G02, G03, and G05 tests need. Either G04's test environment goes first, or those packages use the `p3-*.spec.ts` in-page approach.
- I-006 (G15) must be fixed before browser tests can gate CI (G22, I-046).
- I-038 (G21) changes layout. Re-run every layout test and the Costing width check (I-033) after it.
- I-042 (G16) writes through `updateServiceDay`, so I-001 (G01) makes it worse until G01 is fixed.
- I-022 and I-028 (G06) share the Trips CSV import path with I-019 (G13).
