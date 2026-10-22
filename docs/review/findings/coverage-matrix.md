# Acceptance-Criteria Coverage Matrix (Phase A, task A4)

- Baseline: `main` at `baed9f1`, harness commit `9748db0`
- Inputs: `inventory/acceptance-criteria.md` (1,218 items from nine implementation plans) and `inventory/tests.md` (205 unit cases in 29 files; 21 browser tests in 10 files)
- Scope mapped: the 394 items whose kind is acceptance criterion (AC), required test or verification (TST), or gate (GATE). The 816 general requirements (REQ) are not mapped here. Phase 1 folds them into the rule catalogue, and Phases 2–5 test them directly.
- Method: three Sonnet analysts read every cited test body. A matching test title alone does not count as coverage. The orchestrator re-checked the highest-risk claims; Phase A findings record the verification results.

## Status definitions

| Status | Meaning |
| --- | --- |
| Covered | A currently passing test asserts the behavior. |
| Partial | A test touches the behavior but does not assert its key condition. |
| Failing | Only one of the 7 deterministically failing browser tests asserts it. |
| Uncovered | No test asserts it. |
| Superseded | A later decision record replaced it. |
| Not testable | A manual user gate or walkthrough. |

## Summary

| Plan group | Items | Covered | Partial | Failing | Uncovered | Superseded | Not testable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 02R, 02RS, 02TP | 209 | 52 | 62 | 3 | 49 | 5 | 38 |
| 03, 03R, 04 | 134 | 27 | 62 | 2 | 18 | 0 | 25 |
| 05, RTP, TTI | 51 | 8 | 24 | 2 | 11 | 0 | 6 |
| **Total** | **394** | **87 (22%)** | **148 (38%)** | **7** | **78 (20%)** | **5** | **69** |

Of the 320 testable, non-superseded items, 87 (27%) have full passing coverage.

The analysts recorded "Failing" conservatively. Many 03R and TTI items lost their only real-app check when the six `unified-action-layer.spec.ts` tests began failing. Those items are marked Partial when a service-level or static-fixture test also touches them.


---

## A4 coverage map: 02R, 02RS, 02TP (kinds AC, TST, GATE)

Method: every test cited was read (body, not title). "Covered" requires a currently passing test with an assertion on the stated behavior. Baseline: 7 Playwright tests fail at HEAD and give no coverage. Implementation line numbers are from the working tree at HEAD (9748db0).

Path abbreviations (all under /home/user/transit-costing-tool):
ATS=src/application/authoritativeTripService.test.ts | TRT=src/domain/trips.test.ts | DIR=src/domain/directions.test.ts | SRE=src/domain/safeRouteEditing.test.ts | RDS=src/application/routeDefinitionService.test.ts | TPT=src/application/tripProfile.test.ts | DUR=src/domain/durations.test.ts | TIM=src/domain/time.test.ts | RUN=src/domain/runtime.test.ts | PRJ=src/domain/project.test.ts | BAK=src/persistence/backup.test.ts | CSV=src/persistence/csv.test.ts | REPO=src/persistence/repository.test.ts | RE=tests/ui/route-editing.spec.ts | TPS=tests/ui/trip-profile.spec.ts | UAL=tests/ui/unified-action-layer.spec.ts (all 6 tests FAIL) | TTL=tests/ui/trip-table-layout.spec.ts (line 40 FAILS; lines 3, 30 load a static fixture HTML, not the app)

### Cross-cutting findings that drive many statuses

1. vitest runs `environment: 'node'` with no IndexedDB (vitest.config.ts:2). `src/persistence/dexieRepository.ts` and `src/persistence/database.ts` have zero unit tests; every "atomic"/"rollback"/"round trip" unit test runs against `InMemoryRouteDefinitionRepository` or a hand-written fake that throws before writing.
2. REPO:30-47 (v3 to v4 migration) begins with `if (typeof indexedDB === 'undefined') return;` (REPO:31). Under node it passes vacuously. If it did run, `expect(migrated.verno).toBe(5)` (REPO:42) contradicts the declared version 6 (database.ts:41, REPO:21).
3. Route-edit classification and reset paths are untested: `classifyPatternEdit` (safeRouteEditing.ts:206), `getPatternServiceImpact` (safeRouteEditing.ts:220), reset commit (routeDefinitionService.ts:956), Node-delete preview (routeDefinitionService.ts:216, 914). Only the deterministic insert (RDS:235-257), middle removal (SRE:54), and stale Node-rename token (RDS:221-233) are exercised.
4. No test creates two Trip profiles and checks isolation. `Trip.tripProfileId` and `GenerateTripsRequest.tripProfileId` are optional (types.ts:49, 79); with it omitted, `listTrips` returns all profiles (dexieRepository.ts:388-391) and `findExactTripDuplicates` input is unscoped (tripGenerationService.ts:314-315).
5. `sortServiceDays` (serviceDays.ts:9) has no test.
6. TPT:42-46 and TPT:74,78 use the legacy `Block.tripProfileId` field; current ownership is `blockingScenarioId` (Decision 0019 item 9). Cross-profile Block/Trip rejection in the live path (blocking.ts:81, 236; blockingService.ts:148) has no test.
7. Dead UI code: `TripScheduleWorkspace` (App.tsx:595-724) still implements the removed generation-set UI and is never rendered (only its definition matches).
8. The "Service section" (02R-AC269) no longer exists; Service context is the Route/Day/Direction toolbar (App.tsx:353; Decision 0028 item 3). Shared-profile day usage (02R-AC18/AC271) renders only the currently selected day: App.tsx:1200.

### Table

| ID | Criterion (short) | Status | Evidence |
| --- | --- | --- | --- |
| 02R-AC6 | Trips are the authoritative saved schedule | Covered | ATS:48-50 generated trips land in repository (size 6); BAK:96 trip times survive export/import |
| 02R-AC7 | Generate request is transient; not saved as a set | Partial | Impl: tripGenerationService.ts:319-323 inserts trips only. No test asserts no set is persisted (fake `sets` map never read in ATS). Legacy set-based `applyTripGeneration` still exists and is tested (tripGenerationService.test.ts:35-66) |
| 02R-AC8 | Generation is additive, interlaces | Covered | ATS:48-50 (3+3=6 trips), ATS:93-96 re-generation adds (size 2), ATS:82-86 interlace order |
| 02R-AC9 | Trips unchanged on runtime change; explicit recalc | Partial | ATS:275 flags stale trip; ATS:170-171 recalc needs explicit call. No test saves a runtime edit and asserts trips untouched (impl routeDefinitionService.ts:696-704 writes only the profile). UI check is UAL:112 (failing) |
| 02R-AC10 | Regeneration review: first-departure default, bulk first/last/shared, per-trip override, preview | Partial | Per-trip anchors + preview: ATS:182-187, ATS:235-239; anchor math TRT:42-49. Default-first and bulk buttons only in UAL:134 (failing) |
| 02R-AC11 | Initial generation needs no preview | Covered | ATS:48 `generateTrips` persists with no preview call |
| 02R-AC12 | Impact confirmation for destructive recalc / day replacement | Partial | Recalc w/ Block ref: ATS:170 throws `TripRecalculationConfirmationError`, ATS:173 `impact.blockIds`. Manual-shift impact only on legacy path TRT:129. Day replacement preview is Phase 3A (serviceDayCopy.test.ts:123-135) |
| 02R-AC13 | Two managed groups; every pattern in exactly one | Partial | DIR:12-18 two groups; RDS:25, RDS:41 (reverse goes to inbound). No test that a pattern without a group is rejected or that new patterns default to Outbound |
| 02R-AC14 | Internal ordered columns; patterns map points; may omit | Covered | DIR:28-55 (loop, short-turn omit; asserts DIR:53-54); SRE:19-26. Doc has internal conflict flag (0011) |
| 02R-AC15 | One service day + direction schedule, interlaced | Partial | ATS:84-86 interlace within one direction. No assertion that other-direction or other-day trips are excluded (impl tripGenerationService.ts:598, 628) |
| 02R-AC16 | Pattern-specific profile resolved per day+pattern | Covered | ATS:52 provenance `rp2`; ATS:264 target pattern's profile `rp2`, revision 4 |
| 02R-AC17 | Default profile without user creating it; shared across days | Partial | RDS:112-115 idempotent, 4 assignments. Does not assert all 4 point to the one profile |
| 02R-AC18 | UI identifies service days using shared profile | Uncovered | Impl diverges: App.tsx:1200 prints only the selected day name, not all days sharing the profile |
| 02R-AC19 | Weekday, Saturday, Sunday, Holiday order, centralized | Partial | PRJ:6-9 asserts creation order only. `sortServiceDays` (serviceDays.ts:9-14) untested; used at App.tsx:353 |
| 02R-AC20 | Accepts decimal, MM:SS, :MM, :MM:SS | Covered | DUR:5-18 (`5`,`07`,`5.5`,`5:30`,`:07`,`:05:30`) assertions DUR:16-17 |
| 02R-AC21 | Durations are integer seconds internally | Partial | DUR:16 integer results for whole-second inputs only. Rounding of long decimals (durations.ts:46 `Math.round`) untested |
| 02R-AC22 | Add Trip requires pattern + one time; resolves profile; calculates rest | Partial | Calc/resolve: ATS:166, ATS:201 (1200 + 600 = 1800). Missing: no test that missing pattern/time is rejected (UI draft row App.tsx:1575) |
| 02R-AC23 | Pattern column leftmost; pattern change keeps first time, re-resolves, recalcs | Partial | Behavior: ATS:261-264. Column order not asserted in the real app (header App.tsx:1480); TTL:3 uses static fixture |
| 02R-AC24 | Exact duplicates allowed with nonblocking indication | Covered | ATS:94-96 warning `trip.possibleExactDuplicate`, both stored. UI label untested (App.tsx:1481) |
| 02R-AC25 | Different patterns same time: no duplicate indication | Partial | ATS:48-49 same first times on two patterns are stored, but `second.warnings` is never asserted (impl trips.ts:138-147) |
| 02R-AC26 | No backward compat required; may drop generation sets | Not testable | Permission, not behavior. Related: BAK:21-25 export omits `generationSets` |
| 02R-AC94 | Custom direction names + deterministic order | Superseded | Decision 0011 (fixed Outbound/Inbound, no renaming). Ordering still tested DIR:20-26 |
| 02R-AC95 | Two patterns in one direction | Covered | SRE:19-26 (one stable order, columns a,b,c); ATS:63-87 |
| 02R-AC96 | Pattern omitting direction columns | Covered | DIR:42-55 asserts DIR:53-54; SRE:25 short pattern maps to tail columns |
| 02R-AC97 | Loop: two visits map to distinct columns | Covered | DIR:28-40 (DIR:36); SRE:28-34 (SRE:33 three distinct) |
| 02R-AC98 | Invalid cross-route and missing-column refs | Partial | DIR:57-62 asserts only `pattern.directionColumnRequired`. Cross-route reference (validateDirection route arg) not asserted |
| 02R-AC99 | All duration examples and invalid boundaries | Covered | DUR:5-18 valid; DUR:27-29 invalid incl. `1:60`, `:07:60`, `-1` |
| 02R-AC100 | Blank vs zero | Covered | DUR:20-25 |
| 02R-AC101 | Rename does not change calc revision | Covered | RUN:111-113 (revision stays 4) |
| 02R-AC102 | Band or segment change increments revision | Partial | RUN:114 segment change only (4 to 5). Band start/end or method change untested (runtime.ts:38-46 includes them) |
| 02R-AC103 | Idempotent Default provisioning | Covered | RDS:112-116 same profile id and assignment ids |
| 02R-AC104 | Shared Default across all four standard days | Partial | RDS:115 `toHaveLength(4)` only; does not assert each assignment's day kind or that all reference one profile |
| 02R-AC105 | Safe profile delete needs replacement | Covered | RDS:132-134 rejects /replacement/ then succeeds with replacement |
| 02R-AC106 | Service-day sort from arbitrary order | Uncovered | serviceDays.ts:9-14 has no test |
| 02R-AC107 | Gate: focused tests + typecheck | Not testable | Process gate (historical) |
| 02R-AC108 | Gate: Federal Blvd two Southbound patterns, one column set | Not testable | Manual demo; automated analogs SRE:19-26, ATS:63-87 |
| 02R-AC109 | Gate: pause before 2R-C | Not testable | Process gate |
| 02R-AC126 | Inclusive First through Last | Covered | TRT:87 `[18000..21600]` 5 values; ATS:48-50 |
| 02R-AC127 | Decimal and MM:SS headway via shared utility | Partial | Utility tested DUR:5-18; headway path (App.tsx:1587) untested. Request tests pass numeric seconds only (TRT:84) |
| 02R-AC128 | Additive interlacing of two patterns | Covered | ATS:48-50, ATS:82-86 |
| 02R-AC129 | Two patterns, same first time | Partial | ATS:48-50 stored (size 6); absence of warning not asserted |
| 02R-AC130 | Exact duplicate warns without rejecting | Covered | ATS:94-96 |
| 02R-AC131 | All-or-nothing on runtime gap | Covered | ATS:158-159 rejects, `trips.size` 0 |
| 02R-AC132 | Add Trip runtime resolution and propagation | Covered | ATS:166 then ATS:201 end time 1800 (propagated 600 s) and ATS:184 |
| 02R-AC133 | Pattern change uses target assignment | Covered | ATS:261-264 (profile `rp2`, revision 4, first time 1200) |
| 02R-AC134 | Trip ID preserved on pattern change and recalc | Covered | ATS:263 (id), ATS:172 (recalc id) |
| 02R-AC135 | Stale revision identified without auto mutation | Partial | ATS:275 lists stale id. No assertion that stored trips are unchanged afterwards |
| 02R-AC136 | Recalc impacts: manual shifts and block refs | Partial | Block refs ATS:173. Manual-shift impact only on legacy regeneration TRT:129; not on `calculateRecalculationImpact` |
| 02R-AC137 | Atomic persistence failure | Partial | ATS:150-151 and REPO:109-110 use fakes/in-memory. Dexie transactions (dexieRepository.ts:416-474) untested |
| 02R-AC138 | Backup, import-as-copy, scenario duplication round trips | Partial | BAK:96-100 (trips via clone). Scenario duplication test has `trips: []` (PRJ:31); trip profile/trip remap on duplicate/clone untested (project.ts:192-224, backup.ts:491-559) |
| 02R-AC139 | Deterministic CSV with 24+ times | Covered | CSV:29 `scheduledPointsCsv` `toContain('25:00')` |
| 02R-AC140 | 500-trip query and ordering | Covered | ATS:276-279 (502 trips, first 0, last >= 29940). Ordering checked at ends only |
| 02R-AC141 | Gate: all tests, typecheck, build | Failing | 7 Playwright tests fail at HEAD (baseline) |
| 02R-AC253 | Walkthrough 1: select Weekday | Not testable | Manual walkthrough |
| 02R-AC254 | Walkthrough 2: select Southbound | Not testable | Manual walkthrough (direction labels now Outbound/Inbound, Decision 0011) |
| 02R-AC255 | Walkthrough 3: Southbound 1 Default profile | Not testable | Manual walkthrough |
| 02R-AC256 | Walkthrough 4: 5.5 and 5:30 give :05:30 | Not testable | Manual walkthrough; unit analog DUR:10-12 |
| 02R-AC257 | Walkthrough 5: generate every 15 min | Not testable | Manual walkthrough; UI analog UAL:83 fails |
| 02R-AC258 | Walkthrough 6: second pattern offset | Not testable | Manual walkthrough |
| 02R-AC259 | Walkthrough 7: interlaced schedule | Not testable | Manual walkthrough; unit analog ATS:82-86 |
| 02R-AC260 | Walkthrough 8: add trip via draft row | Not testable | Manual walkthrough; TTL:30 is fixture-only |
| 02R-AC261 | Walkthrough 9: change pattern recalcs | Not testable | Manual walkthrough; unit analog ATS:261-264 |
| 02R-AC262 | Walkthrough 10: runtime edit leaves trips, Recalculate shown | Not testable | Manual walkthrough; UI analog UAL:112/119 fails |
| 02R-AC263 | Walkthrough 11: 25:07 shown without date conversion | Not testable | Manual walkthrough; unit analog TIM:9-10, 14-16 |
| 02R-AC264 | Gate: UI tests, a11y checks, visual inspection, user verify | Not testable | Process gate. Note: repo has no accessibility test tooling (no axe in package.json) |
| 02R-AC269 | Service, Runtimes, Trips as A-B-C workflow | Superseded | Decision 0028 item 3 (Service section replaced by Route/Day/Direction toolbar, App.tsx:353); only Runtimes and Trips sections exist (App.tsx:1175, 1204) |
| 02R-AC270 | Every usable pattern can begin with Default | Covered | RDS:112 `ensureDefaultRuntimeProfile` for a fresh two-point pattern |
| 02R-AC271 | Shared-profile day usage visible before editing | Uncovered | App.tsx:1200 shows only the selected day; no test |
| 02R-AC272 | Runtime entry forms accepted and displayed correctly | Covered | DUR:5-18 parse + display (`:05:30`, `:75:15`); UI display only in failing UAL:33 |
| 02R-AC273 | Generate is additive, persists no instruction | Partial | Same as 02R-AC7/AC8: additive Covered ATS:48-50; "no instruction persisted" not asserted |
| 02R-AC274 | Add Trip needs only pattern + first time | Covered | ATS:166 request carries only pattern, direction, first time |
| 02R-AC275 | Combined timetable shows all patterns in direction | Covered | ATS:84-86 service-level; rendering App.tsx:1481 untested |
| 02R-AC276 | Missing pattern points show em dashes | Uncovered | Impl App.tsx:1481 `displayedValue = time === undefined ? '—'`; no test |
| 02R-AC277 | Pattern change and recalc retain IDs | Covered | ATS:172, ATS:263 |
| 02R-AC278 | Runtime changes do not silently alter trips | Partial | Same gap as 02R-AC9; UAL:112 (failing) |
| 02R-AC279 | Exact duplicates allowed and identified | Covered | ATS:94-96 (service); label App.tsx:1481 untested |
| 02R-AC280 | Universal Weekday..Holiday ordering | Partial | Same gap as 02R-AC19/AC106 |
| 02R-AC281 | 24+ times intact | Covered | TIM:9-10 parse, TIM:14-16 format; CSV:29 |
| 02R-AC282 | 500 trips queried, ordered, displayed, backed up, restored | Partial | Query/order ATS:276-279. Backup/restore of 500 trips and display untested |
| 02R-AC283 | Tests, typecheck, build, reload, visual pass | Failing | 7 Playwright tests fail at HEAD; typecheck/build not run here |
| 02R-AC291 | Closeout: present Phase 3 plan; do not auto-start | Not testable | Process gate |
| 02R-AC298 | Test boundary, tie, threshold, manual selection, preview | Covered | TRT:67-76 tie (TRT:70), 600 s threshold (TRT:73) vs 4499 reject (TRT:74), manual (TRT:71, 75); preview ATS:182-187, ATS:235-239 |
| 02RS-AC4 | Zero before new point; former runtime after | Covered | SRE:45-52 `[0,600]` (SRE:50); middle insert only |
| 02RS-AC5 | Contradictory order blocks Save Pattern, no override | Partial | Domain conflict SRE:36-42. Block-on-save throw (routeDefinitionService.ts:232, 256) and absence of override untested |
| 02RS-AC6 | Ambiguous change requires resetting owning service | Uncovered | classify/reset impl safeRouteEditing.ts:206-218, routeDefinitionService.ts:257, 956; no test |
| 02RS-AC7 | New Nodes must be saved before Pattern uses them | Uncovered | RE:12-28 saves nodes first but never tries an unsaved one; impl not located |
| 02RS-AC13 | Edit Nodes without committing each field | Partial | RE:12-22 draft + Save nodes; no assertion that nothing persisted before Save |
| 02RS-AC14 | Edit a Pattern without committing each point | Partial | RE:24-32 "not saved" label until Save; no persistence check |
| 02RS-AC15 | Review downstream impacts before saving | Partial | RE:30 dialog heading "Save Pattern and rebalance?"; impact contents not asserted |
| 02RS-AC16 | Preserve service when deterministic | Covered | SRE:68, RDS:255 trip times `[21600,21600,22200]` retained |
| 02RS-AC17 | Explicit reset of dependent service | Uncovered | Impl routeDefinitionService.ts:956; no test |
| 02RS-AC18 | Understand/correct order conflicts before saving | Partial | Names + message SRE:40-42; no UI test |
| 02RS-AC19 | Discard drafts without changing saved data | Partial | RE:14-15 Node discard only (input disappears); Pattern Discard untested |
| 02RS-AC136 | Metadata edits don't affect runtimes/trips | Uncovered | safeRouteEditing.ts:210-212 'metadata' class; no test |
| 02RS-AC137 | Added unused Nodes have no downstream effect | Uncovered | No test |
| 02RS-AC138 | Deleting used Nodes reports every occurrence | Uncovered | Impl routeDefinitionService.ts:911-921; no test |
| 02RS-AC139 | Middle/first/final insertion, zero convention, every band | Partial | SRE:45-52 middle insertion, one band. First/final and multi-band untested (impl safeRouteEditing.ts:246-258) |
| 02RS-AC140 | Middle removal sums adjoining runtimes, every band | Partial | SRE:54-59 `[900]` (SRE:58), one band |
| 02RS-AC141 | Boundary removal removes correct segment | Uncovered | No first/last removal test |
| 02RS-AC142 | Multiple edits preserve runtime between retained anchors | Uncovered | Only single edits tested |
| 02RS-AC143 | Retained point IDs, trip IDs, times stable | Partial | SRE:67-68 trip id + times; retained point IDs not asserted |
| 02RS-AC144 | Added points get new IDs and predecessor times | Partial | Predecessor time SRE:68 (`21600`). New-ID generation untested (test supplies ids) |
| 02RS-AC145 | Manual shifts survive reconciliation | Covered | SRE:69 `manualTimeShiftSeconds` 120. Other changed fields not asserted |
| 02RS-AC146 | Profile revision increments once | Covered | SRE:51 (2 to 3) |
| 02RS-AC147 | Full + short patterns give one stable order | Covered | SRE:19-26 |
| 02RS-AC148 | Prefixes and suffixes insert correctly | Partial | Suffix only (short = [b,c], SRE:21). Prefix case untested |
| 02RS-AC149 | Loop visits get distinct columns | Covered | SRE:28-34 (SRE:33) |
| 02RS-AC150 | Stable order preserves previous order | Uncovered | SRE helper always passes empty `columns` (SRE:16); no prior-order test |
| 02RS-AC151 | Orphan columns removed | Uncovered | No test |
| 02RS-AC152 | Contradictions return named details and no commit | Partial | Details SRE:40-42. "No commit" (routeDefinitionService.ts:949, 974) untested |
| 02RS-AC153 | Compatible Direction changes preserve service | Uncovered | No test of direction-change classification |
| 02RS-AC154 | Reordering retained points requires reset | Uncovered | safeRouteEditing.ts:214; no test |
| 02RS-AC155 | Reset impact: profiles, assignments, trips, history, blocks | Partial | Delete impact counts RDS:154 (profiles 1, assignments 4, trips 1, blocks 1). Reset-preview path and historical records untested |
| 02RS-AC156 | Stale preview cannot commit | Partial | Node preview only: RDS:228-231. Pattern preview staleness untested |
| 02RS-AC157 | Deterministic Pattern save round trip | Partial | RDS:254-256 in-memory repository only; Dexie commit untested |
| 02RS-AC158 | Node cascade round trip | Uncovered | No test |
| 02RS-AC159 | Pattern reset round trip | Uncovered | No test |
| 02RS-AC160 | Block cleanup retains block records | Covered | RDS:159 pattern delete leaves block with `activities []`; RDS:184 route delete. Reset path untested |
| 02RS-AC161 | Forced failure leaves every record group unchanged | Uncovered | No route-edit failure test (RDS:87-97 covers createProject only) |
| 02RS-AC162 | Backup/restore and scenario dup keep reconciled mappings | Partial | Scenario dup PRJ:41-42 (direction columns, point column ids). Backup export/import of `directions` has no assertion in BAK |
| 02RS-AC163 | No migration unless documented | Uncovered | No test; Dexie versions 3-6 each have documented upgrade comments (database.ts:12-41) |
| 02RS-AC164 | Node/Pattern edits don't persist before Save | Partial | RE:14-15, RE:25 show draft state only; no reload/persistence check |
| 02RS-AC165 | Both Discard actions restore saved data | Partial | Node Discard only RE:14-15 |
| 02RS-AC166 | Pending Node deletion can be undone | Uncovered | No UI test |
| 02RS-AC167 | Add Pattern unsaved until Save Pattern | Partial | RE:25 label visible, RE:32 gone after save; no persistence check |
| 02RS-AC168 | Dirty navigation offers Save, Discard, Cancel | Partial | RE:34-38 asserts dialog heading and Cancel closes; Save/Discard buttons not asserted |
| 02RS-AC169 | Deterministic and destructive dialogs use correct actions | Partial | Deterministic RE:30-31 ("Save and rebalance"). Destructive reset dialog untested |
| 02RS-AC170 | Direction conflict names Patterns/timepoints, local, blocks save | Partial | Domain naming SRE:40-42; UI untested |
| 02RS-AC171 | Cancel preserves the draft | Partial | RE:37-38 dialog closes; draft content not re-asserted |
| 02RS-AC172 | Save updates Trips headers without Rebuild | Uncovered | Domain columns RDS:256 only; no UI header assertion |
| 02RS-AC173 | Reconciled trips under correct columns | Partial | RDS:255 asserts times only, not column placement |
| 02RS-AC174 | Keyboard-only editing and dialog operation | Uncovered | TPS:105-110 keyboard on Trip-profile menu only; none for Route editing |
| 02RS-AC175 | Focus returns appropriately | Uncovered | No test |
| 02RS-AC176 | No state color-only | Uncovered | No test |
| 02RS-AC177 | Dense Route layout at desktop widths | Uncovered | No Route layout spec |
| 02RS-AC181 | Walkthrough 1: save route Nodes | Not testable | Manual walkthrough |
| 02RS-AC182 | Walkthrough 2: Trips unchanged before Save Pattern | Not testable | Manual walkthrough |
| 02RS-AC183 | Walkthrough 3: save and see columns | Not testable | Manual walkthrough |
| 02RS-AC184 | Walkthrough 4: short-turn into same table | Not testable | Manual walkthrough; analog SRE:19-26 |
| 02RS-AC185 | Walkthrough 5: contradictory Pattern blocked | Not testable | Manual walkthrough; analog SRE:36-42 |
| 02RS-AC186 | Walkthrough 6: correct and save | Not testable | Manual walkthrough |
| 02RS-AC187 | Walkthrough 7: add point with bands + trips | Not testable | Manual walkthrough |
| 02RS-AC188 | Walkthrough 8: zero insertion, later times unchanged | Not testable | Manual walkthrough; analog SRE:45-70, RDS:235-257 |
| 02RS-AC189 | Walkthrough 9: remove, merged runtimes | Not testable | Manual walkthrough; analog SRE:54-59 |
| 02RS-AC190 | Walkthrough 10: reorder, inspect reset impact, cancel | Not testable | Manual walkthrough (no automated analog) |
| 02RS-AC191 | Walkthrough 11: reset removes only that Pattern's service | Not testable | Manual walkthrough (no automated analog) |
| 02RS-AC192 | Walkthrough 12: Node rename changes headers after Save | Not testable | Manual walkthrough |
| 02RS-AC193 | Walkthrough 13: delete used Node, inspect impact | Not testable | Manual walkthrough (no automated analog) |
| 02RS-AC194 | Walkthrough 14: reload consistency across tabs | Not testable | Manual walkthrough |
| 02RS-AC195 | Gate: all Vitest + Playwright, migration tests, typecheck, build | Failing | 7 Playwright tests fail at HEAD; migration test REPO:30-47 is vacuous under node (REPO:31) |
| 02RS-AC196 | Gate: visual inspection; React has no reconciliation calc | Not testable | Manual gate |
| 02RS-AC197 | Gate: inspect IndexedDB; backup/restore; scenario dup | Not testable | Manual gate |
| 02RS-AC198 | Gate: user verification accepted 2026-09-14 | Not testable | Recorded user gate |
| 02TP-AC3 | Maintain Default, rename, copy, delete alternatives | Covered | TPT:48-100 (copy, rename, delete); TPS:114-124 (copy via menu, delete dialog) |
| 02TP-AC4 | Every trip command/query within selected profile | Uncovered | No two-profile isolation test; `tripProfileId` optional (types.ts:49), unscoped listing dexieRepository.ts:388-391 |
| 02TP-AC5 | Blocking gets one explicit source profile, no mixing | Uncovered | Mechanism now BlockingScenario.tripProfileId (Decision 0019). Retained on duplicate: blocking.test.ts:19. Mismatch rejection (blocking.ts:81, 236; blockingService.ts:148) has no test |
| 02TP-AC54 | Migration test with populated v2 DB | Uncovered | database.ts:16-26 upgrade untested; REPO:30 covers v3 to v4 and is vacuous (REPO:31); tests/ui/database-migration.spec.ts starts at v4 |
| 02TP-AC71 | One Default profile per new and migrated Scenario | Partial | New: PRJ:10-12. Migrated: database.ts:17-19 untested |
| 02TP-AC72 | Unique trimmed profile names | Covered | TPT:69 ` weekday PLAN ` rejected /already exists/ |
| 02TP-AC73 | Copied Trips: new IDs, preserve schedule + provenance | Partial | TPT:58 ids differ; fixture trips have `stopTimes: []` (TPT:20), so schedule/provenance preservation unasserted |
| 02TP-AC74 | Copy includes every Route and service day | Covered | TPT:37, 57 (trips on two routes/days both copied) |
| 02TP-AC75 | Blocks cannot reference Trips from another profile | Superseded | Decision 0019 item 9 (Block holds blockingScenarioId, not tripProfileId). TPT:42-46 tests the legacy field only; live-path gap listed under 02TP-AC5 |
| 02TP-AC76 | Migration assigns existing Trips and Blocks to Default | Uncovered | Trips: database.ts:21-23 untested. Blocks: Superseded (Decision 0019 item 12, placeholder Blocks discarded; database.ts:34-36) |
| 02TP-AC77 | Forced migration failure leaves v2 intact | Uncovered | No test |
| 02TP-AC78 | 2,000-Trip copy within practical duration | Uncovered | TPT copy uses 2 trips |
| 02TP-AC79 | Gate: focused tests + typecheck; stop for user | Not testable | Process gate |
| 02TP-AC88 | Build/Add/shift/pattern change/regen/delete affect only selected profile | Uncovered | No test with two profiles |
| 02TP-AC89 | Same-time Trips in two profiles: no cross-profile duplicate warning | Uncovered | Impl trips.ts:138-147 and tripGenerationService.ts:314-315; scoped only if `tripProfileId` supplied |
| 02TP-AC90 | Copy preserves source data, independent IDs | Partial | TPT:56-59; source data compare absent (stopTimes empty) |
| 02TP-AC91 | Copy creates no Blocks | Covered | TPT:60 `listBlocksForProfile` is `[]` |
| 02TP-AC92 | Delete preview reports all dependents | Partial | TPT:81-82 trips 2, blocks 1 via legacy Block field; Blocking Scenario ownership path (dexieRepository.ts:465-468) untested |
| 02TP-AC93 | Last-profile deletion blocked | Covered | TPT:86 /only profile/ |
| 02TP-AC94 | Confirmed delete removes the complete branch only | Partial | TPT:83-87 branch removed and source profile kept; source trips/blocks survival not asserted; atomicity untested |
| 02TP-AC95 | Stale preview cannot commit | Covered | TPT:90-100 /out of date/, branch intact |
| 02TP-AC96 | Route delete removes Trips in every profile | Partial | RDS:178-184 single profile only |
| 02TP-AC97 | Pattern reset affects matching Trips in every profile | Uncovered | Reset untested |
| 02TP-AC98 | Runtime deletion finds calculation refs in every profile | Uncovered | RDS:233-235 tests assignment check only; trip-reference search (App.tsx:1610 `tripCount`) implementation not located |
| 02TP-AC99 | Scenario dup and backup remap all references | Partial | BAK:104-123 blocking scenario/block remap; `tripProfileId` remap on Trips/BlockingScenario copy not asserted; PRJ:31 `trips: []` |
| 02TP-AC100 | Legacy backup imports create Default profiles | Uncovered | BAK:43-58 do not assert tripProfiles; impl backup.ts:418-448 |
| 02TP-AC101 | Forced failures leave every profile branch unchanged | Uncovered | In-memory rollback (inMemoryRepository.ts:263-270) and Dexie transaction (dexieRepository.ts:368-380) untested |
| 02TP-AC102 | Gate: domain/app/repo/backup/CSV/migration/typecheck | Not testable | Process gate |
| 02TP-AC115 | Trip Profile controls below Trips header, above table | Superseded | Decision 0018 items 2, 6 and 0028 item 3 (Profile menu in section header actions). Current placement asserted TPS:95-103 |
| 02TP-AC116 | Controls appear only where specified | Partial | TPS:95-96 absent from route picker and legacy block. Other tabs untested |
| 02TP-AC117 | Switching profile shows only its Trips | Uncovered | No UI test |
| 02TP-AC118 | Switching clears selection and shift history | Uncovered | No test; UAL:186 (failing) guards Day change only |
| 02TP-AC119 | Rename does not alter Trips | Covered | TPT:67-68 trip ids unchanged. UI rename untested |
| 02TP-AC120 | Copy selects independent complete schedule | Covered | TPS:117-118 new profile selected; TPT:56-60 independent copy |
| 02TP-AC121 | Delete cancel performs no writes | Partial | TPS:123-124 dialog closes; no-write not asserted |
| 02TP-AC122 | Last-profile deletion shows explanation | Uncovered | Impl App.tsx:314 notice; no UI test |
| 02TP-AC123 | Delete confirmation reports Trip and Block impacts | Partial | TPS:122 heading only; counts via domain TPT:81-82 |
| 02TP-AC124 | Profile switch doesn't change Runtime controls | Uncovered | No test |
| 02TP-AC125 | Compact workspace row usable at desktop widths | Uncovered | No test of the real toolbar (fixture tests are static HTML) |
| 02TP-AC126 | Gate: typecheck, tests, build, keyboard, visual; user verify | Not testable | Process gate |
| 02TP-AC127 | One Scenario, one or more selectable profiles | Covered | PRJ:10-12 (Default), TPT:53-57 (copy), TPS:118 |
| 02TP-AC128 | Runtime profiles independent calc inputs | Uncovered | No test asserting copy/delete leaves runtime profiles/assignments |
| 02TP-AC129 | Every Trip and Block has valid profile ownership | Uncovered | `Trip.tripProfileId` is optional (types.ts:79); import normalization backup.ts:447-448 untested |
| 02TP-AC130 | No Trip command/query leaks across profiles | Uncovered | See 02TP-AC4/AC88 |
| 02TP-AC131 | Copy duplicates all Route/day Trips, new IDs, no Blocks | Covered | TPT:56-60 |
| 02TP-AC132 | Delete impact-reviewed, atomic, not last | Partial | Review/last/stale TPT:81-100; atomicity untested |
| 02TP-AC133 | Future Blocking scenarios constrained to one profile | Uncovered | Same as 02TP-AC5 |
| 02TP-AC134 | Route/Pattern/runtime lifecycle across profiles | Partial | RDS:137-185 single profile only |
| 02TP-AC135 | DB v3, export schema v4, legacy import, dup, CSV, reload, visual | Superseded | Versions replaced: DB 6 (Decision 0035 consequences; REPO:21), JSON schema 6 (BAK:125 title; Decision 0019 item 13) |
| 02TP-AC136 | Do not start next phase automatically | Not testable | Process gate |
| 02TP-AC137 | Profiles Scenario-owned; span all Routes and days | Covered | PRJ:10-12, TPT:57 |
| 02TP-AC138 | Copy duplicates Trips, no Blocks | Covered | TPT:60 |
| 02TP-AC139 | Runtime assignments remain shared and independent | Uncovered | No test |
| 02TP-AC140 | Last profile cannot be deleted | Covered | TPT:86 |
| 02TP-AC141 | Non-final delete removes owned Blocks as one branch | Partial | TPT:83-85 via legacy Block field; Blocking Scenario cascade (dexieRepository.ts:375-378) untested |
| 02TP-AC142 | Each Blocking Scenario selects one profile, no mixing | Uncovered | Same as 02TP-AC5; creation retains profile blocking.test.ts:13-19 |

### High-risk gaps (Uncovered or Failing; data loss or wrong times/hours/costs), ranked

1. 02TP-AC4 / AC88 / AC130 / AC128 - No test ever holds two Trip profiles. `tripProfileId` is optional on Trip and on commands (types.ts:49, 79); an omitted id makes `listTrips` return every profile (dexieRepository.ts:388-391). A leak would mix timetable alternatives into one schedule, Block, or cost.
2. 02TP-AC5 / AC133 / AC142 (and live-path remainder of AC75) - Rejection of a Trip from another profile in a Block (blocking.ts:81, 236; blockingService.ts:148) is untested. The only test (TPT:42-46) exercises the legacy `Block.tripProfileId` field. Wrong profile in a Block corrupts Revenue Hours and cost.
3. 02RS-AC6 / AC17 / AC153 / AC154 / AC159 - Pattern edit classification and the destructive reset commit (safeRouteEditing.ts:206-218; routeDefinitionService.ts:257, 956) have no test. A misclassification either deletes Trips/Runtimes/assignments or keeps Trips against reordered columns.
4. 02TP-AC101 / 02RS-AC161 / 02TP-AC77 / 02R-AC137 - Atomicity is untested on the real store. vitest has no IndexedDB (vitest.config.ts:2); `dexieRepository.ts` is untested; fake "rollbacks" throw before writing. A partial write loses data.
5. 02TP-AC54 / AC76 / AC77 - The v2 to v3 Trip-profile migration (database.ts:16-26) has no test, and the only migration unit test (REPO:30-47) returns early without IndexedDB (REPO:31) and would fail its own `verno` 5 assertion (REPO:42) if it ran.
6. 02RS-AC138 / AC158 / AC137 - Node delete cascade, used-Node occurrence report, and unused-Node no-effect have no test (routeDefinitionService.ts:216, 911-921). Deleting a Node can remove pattern points and their runtimes/trips.
7. 02RS-AC141 / AC142 / AC139 / AC140 - Runtime rebalancing is tested only for a single-band middle insert and middle removal (SRE:45-58). First/last removal, multiple edits, first/last insert, and multi-band profiles can produce wrong segment runtimes and wrong trip times (safeRouteEditing.ts:242-264).
8. 02R-AC9 / AC278 / AC135 (Partial, plus failing UAL:112) - No unit test that saving a runtime edit leaves stored trips byte-identical (routeDefinitionService.ts:696-704). A regression would silently change published times.
9. 02R-AC18 / AC271 (implementation diverges) - The UI states "Used by <selected day>" only (App.tsx:1200); a shared Default profile used by four days can be edited with no sign that Saturday/Sunday/Holiday trips become stale.
10. 02RS-AC150 / AC151 - Stable ordering against existing columns and orphan-column removal are untested (SRE helper always passes empty columns, SRE:16). Times can land under wrong columns after a save.
11. 02TP-AC99 / 02R-AC138 - Scenario duplication and import-as-copy remap of `tripProfileId` on Trips and Blocking Scenarios is untested (PRJ:31 `trips: []`; BAK:104-123 skips Trip/Blocking Scenario profile id). Copies could reference the source scenario's profile.
12. 02TP-AC100 / AC129 - Legacy backup import creating Default profiles and normalizing Trip ownership (backup.ts:418-448) is unasserted (BAK:43-58); optional `tripProfileId` leaves invariant unenforced.
13. 02TP-AC98 / AC97 - Runtime-profile deletion's calculation-reference search across profiles and Pattern reset across profiles have no test.
14. 02R-AC106 / AC19 / AC280 - `sortServiceDays` (serviceDays.ts:9-14) is untested but drives Day selectors and every four-day comparison, export, and cost year table.
15. 02TP-AC89 - Cross-profile duplicate warning scoping (trips.ts:138-147, tripGenerationService.ts:314-315) is untested; false warnings or suppressed true warnings when profile is omitted.

Also failing as meta-criteria (7 Playwright failures at HEAD): 02R-AC141, 02R-AC283, 02RS-AC195.
Not reached by this scope but noted: `TripScheduleWorkspace` (App.tsx:595-724) is dead generation-set UI; RDS:44-46 still expects a `generation-sets` CSV (conflicts with the spirit of 02R-AC7/AC26, Decision 0010).

---

## A4 coverage matrix: 03-, 03R-, 04- (Kind AC/TST/GATE only)

Method: every test body listed in tests.md for these areas was read; "Covered" requires a passing test assertion on the stated behavior. Vitest = src/**/*.test.ts (node env, no IndexedDB). Playwright files named *-layout.spec.ts load static HTML in tests/fixtures/, not src/ui/App.tsx. SDC = src/application/serviceDayCopy.test.ts. AUTH = src/application/authoritativeTripService.test.ts. BS = src/application/blockingService.test.ts. BD = src/domain/blocking.test.ts. UAL = tests/ui/unified-action-layer.spec.ts (failing helper, menu label 'Copy from day…' at :64 vs App.tsx:1162 'Copy Trips from day…').

Cross-cutting findings that drive several rows:
- SDC fixture has Trips for one Trip profile and one Route only (SDC:26-28, 54) and a single legacy-shape Block (SDC:30-32, 55: `tripProfileId`, no `blockingScenarioId`; shape superseded by ADR 0019). Route/profile scoping and normalized-Block cleanup are therefore not exercised.
- No Vitest test runs against Dexie (vitest.config.ts: environment node, no fake-indexeddb). All "atomic/rollback" unit tests run on in-memory fakes. Dexie transactions are exercised only by Playwright happy paths.
- src/persistence/repository.test.ts:31 `if (typeof indexedDB === 'undefined') return;` makes the v3-to-v4 migration test vacuous in Vitest (node has no indexedDB); it also asserts `verno` 5 at :42 while :21 asserts 6, so it would fail if it ran.
- tests/ui/database-migration.spec.ts:3-58 starts at DB version 4 with no Blocks or Trips; it never runs the version-4 upgrade that clears Blocks (src/persistence/database.ts:33-35).

### 03- rows

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 03-AC1 | Runtime and Trip copy are separate commands; no combined command | Uncovered | Impl: App.tsx:1162 and :1196 (separate menu items), :1231-1232 (separate dialogs), tripGenerationService.ts:439-486 (separate preview/apply). No passing test asserts it; the only menu-contents assertion is UAL:56-68 (failing set). |
| 03-AC2 | Target-first; selected Day is target, dialog asks source Day | Uncovered | Impl: App.tsx:1669, :1677 (`sources = days.filter(day.id !== targetDay.id)`), serviceDayCopy.ts:121,134 (same-day finding). No test. |
| 03-AC3 | Runtime copy covers every usable Pattern on Route, direction-independent | Covered | SDC:70 (profilesCreated 2, i.e. outbound+inbound, no unresolved) and :74 (assignments for ['inbound','outbound']); other-Route Pattern excluded (otherwise :70 would be 3 or unresolved). Gap: the `points.length >= 2` usable filter (serviceDayCopy.ts:201) has no test. |
| 03-AC4 | Runtime copy defaults independent; shared is explicit | Partial | Both modes asserted at service level (SDC:70-77, :83-85). The default is UI state (App.tsx:1669 `useState('independent')`) with no UI test. |
| 03-AC5 | Trip copy: selected Route + Trip profile, both Directions, replaces target | Partial | SDC:100-107 (2 source Trips both Directions, replaced). Route and Trip-profile scoping (serviceDayCopy.ts:284-285) is never exercised: no other-Route Trips and one Trip profile in the fixture (SDC:26-28,54). |
| 03-AC6 | Trip copy does not copy Runtime assignments, Blocks, Blocking scenarios | Uncovered | No assertion on target assignments after Trip copy; fixture has no source Block (SDC:55 holds only 'target-block'). Impl: serviceDayCopy.ts:254-256,299 (copyTrip touches Trips only); dexieRepository.ts:448-462. |
| 03-AC7 | Each copy has own impact review and transaction; one never implies the other | Partial | Runtime copy leaves Trips (SDC:76). Reverse (Trip copy leaves assignments) not asserted. Separate transactions: dexieRepository.ts:337 vs :448; no failure test. |
| 03-AC8 | Source-day records remain unchanged | Partial | SDC:108 (one source Trip's serviceDayId) and :94 (whole-scenario equality, but only for the rejected case). Source assignments/profiles/other source Trips not compared after a successful copy. |
| 03-AC67 | Source and target Day cannot match | Uncovered | No test passes sourceServiceDayId == targetServiceDayId. Impl: serviceDayCopy.ts:121,134; enforced at apply via assertNoCopyErrors (tripGenerationService.ts:~528-531). |
| 03-AC68 | Source unchanged in every mode | Partial | Same evidence as 03-AC8: SDC:94 (rejected case), :108. Shared and independent success paths do not diff source records. |
| 03-AC69 | Independent copy creates independent IDs and assignments | Covered | SDC:75 (assignment profile IDs differ from source IDs), :77 (two new profiles named for target day). Band-ID independence only in runtime.test.ts:89. |
| 03-AC70 | Shared copy creates no profiles, shares assignments | Covered | SDC:83 (`profiles` empty), :85 (target assignments point at source profile IDs). "Visibly" (App.tsx:1673 hint) untested. |
| 03-AC71 | Unresolved source Runtime assignment prevents partial copy | Covered | SDC:92-94 (unresolvedPatternIds contains 'inbound'; apply rejects ServiceDayCopyValidationError; scenario records equal before). |
| 03-AC72 | Runtime copy never recalculates or deletes Trips | Covered | SDC:76 (target Trip still present, time 1000). |
| 03-AC73 | Trip copy: both Directions, only selected Route and Trip profile | Partial | Both Directions: SDC:100,105. "Only selected Route/profile" not exercised (see 03-AC5). |
| 03-AC74 | Target Trips replaced, not merged | Covered | SDC:105-107 (2 Trips, 'target-outbound' ID gone). |
| 03-AC75 | Copied Trips get new IDs, preserve times and provenance | Partial | New IDs: SDC:106-107. Times and provenance of copies never asserted (only counts). Impl copyTrip serviceDayCopy.ts:254-256 keeps source calculationSource unchanged. |
| 03-AC76 | Source Blocks are not copied | Uncovered | No source Block in fixture (SDC:55). Impl: serviceDayCopy.ts:299 copies Trips only. |
| 03-AC77 | Affected target Block activities removed; Block records remain | Covered | SDC:102 (affectedBlockIds ['target-block']), :109 (`blocks.get('target-block')?.activities` equals []). Legacy Block shape only (ADR 0019); connection-deadhead removal in trips.test.ts:137. |
| 03-AC78 | Empty-source clearing requires explicit reviewed impact | Covered | SDC:115-120 (apply rejected without allowEmptySource; with it, requiresExplicitEmptySourceReview true and target emptied). |
| 03-AC79 | Stale previews cannot commit | Partial | Trip copy only: SDC:125-127. Runtime-copy stale path (tripGenerationService.ts:457-458) and batch Pattern change stale path untested. |
| 03-AC80 | Forced transaction failure leaves source and target unchanged | Uncovered | No copy test forces a failure (grep: no failure injection in SDC). Impl: inMemoryRepository.ts:287-300, :363-383; dexieRepository.ts:337-352, :448-462. |
| 03-AC81 | Batch shifts and Pattern changes atomic, preserve Trip IDs | Partial | Batch Pattern change only rejection: SDC:129-133, and the lone eligible Trip is already on the target Pattern, so no write could be observed. Successful `applyBatchPatternChange` (tripGenerationService.ts:~509-523) never run. Single-Trip change keeps ID: AUTH:255-265. Shifts: single-Trip only (see 03R-AC73). |
| 03-AC82 | Backup, duplication, CSV, capacity checks pass | Partial | Capacity: SDC:136-151 (20 Patterns/500 Trips, preview only; apply of 500 not run; no time bound). Backup/CSV of Blocks: backup.test.ts:82-123, csv.test.ts:48-66. Nothing exercises backup after a copy. |
| 03-AC83 | Run suites, typecheck, rollback tests, round trips, build; report contracts | Not testable | Process gate (verification record). |
| 03-AC84 | Stop; recommend Terra for 3B | Not testable | Process/model-recommendation gate; AGENTS.md says Terra assignments are history. |
| 03-AC114 | 3B: typecheck, Vitest/Playwright, build, a11y, visual | Not testable | Process gate. HEAD has 7 failing Playwright tests, so the Playwright part is unmet at HEAD. |
| 03-AC115 | User verifies Runtime copy modes, Trip overwrite cancel/confirm, reload | Not testable | Manual user gate. No Playwright test drives either copy dialog (grep of tests/ for copy dialogs: none). |
| 03-AC116 | Stop; no 3C or structural change | Not testable | Process gate. |
| 03-AC125 | Runtime and Trip copying are independent operations | Uncovered | Same as 03-AC1/03-AC7; no passing test of independence in the UI. |
| 03-AC126 | Selected Day is initial target; source explicit | Uncovered | Impl: App.tsx:1231-1232 pass `targetDay={selectedDay}`; :1669 preselects `sources[0]`. No test. |
| 03-AC127 | Runtime copy covers every usable Pattern; never mutates Trips | Covered | SDC:70,74,76. |
| 03-AC128 | Independent default; shared requires explicit selection | Partial | See 03-AC4. |
| 03-AC129 | Trip copy: both Directions, one Route and Trip profile | Partial | See 03-AC5/03-AC73. |
| 03-AC130 | Target replaced only after impact review; source Trips unchanged | Partial | Stale/empty review enforced at service (SDC:112-127). "Only after review" is UI (App.tsx:1681 apply button after preview), untested; source unchanged asserted for one Trip (SDC:108). |
| 03-AC131 | Fresh IDs, target-Day ownership, preserved times/provenance | Partial | IDs and ownership: SDC:104-107. Times/provenance not asserted. |
| 03-AC132 | Blocks not copied; affected activities removed without dangling refs | Partial | Removal: SDC:102,109. "Not copied" unasserted (no source Block). Legacy Block shape only; normalized BlockingBlock path (ADR 0019) untested. |
| 03-AC133 | Empty-source clearing explicit and impact-reviewed | Covered | SDC:115-120. The UI checkbox flow (App.tsx:1681) is untested. |
| 03-AC134 | Batch changes atomic, no silent skips | Partial | SDC:129-133: apply throws on an ineligible Trip (no silent skip). Atomicity unproven: the eligible Trip's Pattern equals the target, so an unchanged outcome proves nothing. |
| 03-AC135 | UI wording/controls compact and non-redundant | Not testable | Subjective visual criterion. |
| 03-AC136 | JSON backup/restore, duplication, CSV, tests, build, reload, a11y, visual pass | Partial | Aggregate. Backup and CSV unit tests exist (see 03-AC82); reload/a11y/visual manual. |
| 03-AC137 | Present Phase 4 as separate effort | Not testable | Process gate. |

### 03R- rows

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 03R-AC72 | Focused staged-shift tests | Covered | tripShift.test.ts:29-48; AUTH:114-152. |
| 03R-AC73 | All-or-nothing multi-Trip commit | Partial | Every staged-shift service test uses one Trip (AUTH:119,135,148); no test shifts two or more Trips together. |
| 03R-AC74 | Stale-preview rejection | Covered | AUTH:129-140 (TripShiftStalePreviewError at :138; time still 600 at :139). Trigger is an `updatedAt` bump; signature is the full Trip JSON (tripShift.ts:47). |
| 03R-AC75 | Forced transaction rollback | Partial | AUTH:142-152, but the fake throws before touching state (AUTH:31), one Trip; passes without any rollback logic. Dexie `saveTripChangesAtomically` not tested. |
| 03R-AC76 | Signed earlier/later preview values | Partial | Earlier (-120): tripShift.test.ts:31-36, AUTH:119-121. Later (positive) value never asserted in a passing test; the only positive staged shift is in UAL:215-219 (failing). |
| 03R-AC77 | Trip ID and provenance preservation | Covered | tripShift.test.ts:37-38; AUTH:122,126 (same ID re-read with 480, manualTimeShiftSeconds -120). |
| 03R-AC78 | Typecheck, full Vitest, build | Not testable | Process verification. |
| 03R-AC79 | Gate: contract names; recommend Terra | Not testable | Process gate. Contract names exist at tripGenerationService.ts:137,156. |
| 03R-AC103 | 3R-B typecheck | Not testable | Process verification. |
| 03R-AC104 | 3R-B complete Vitest | Not testable | Process verification. |
| 03R-AC105 | Focused Playwright menu, geometry, responsive, Shift-drawer tests | Partial | Geometry passes only on static fixtures: workflow-section-layout.spec.ts:14-43, service-day-copy-layout.spec.ts:56-78. Menu and Shift-drawer behavior in the real app: UAL (failing). No responsive/narrow assertion for these sections. |
| 03R-AC106 | Build, keyboard/a11y review, visual inspection | Not testable | Manual. |
| 03R-AC107 | User verifies menus, staged Shift, Undo/Redo, Discard, Done, guard | Not testable | Manual user gate. |
| 03R-AC108 | Gate: stop after 3R-B | Not testable | Process gate. |
| 03R-AC115 | One upper-right header layer; no redundant profile/action row | Partial | Fixtures only: workflow-section-layout.spec.ts:14-18,38-41; service-day-copy-layout.spec.ts:56-59,75-78. Real app, Trips: trip-profile.spec.ts:110-111 (no route-picker Trip Profile, no `.trip-profile-context`). Real-app Runtimes section: no passing assertion. |
| 03R-AC116 | Profile menus: profiles before lifecycle, selection not color-only | Partial | Trips menu: trip-profile.spec.ts:123-128 (one checked menuitemradio). Order (profiles before lifecycle) not asserted; Runtime profile menu (App.tsx:1122-1131) untested. |
| 03R-AC117 | Runtime Pattern remains a separate selector | Uncovered | Impl: App.tsx:1177 (`header-field` Pattern select) outside the Profile menu (:1178). No assertion. |
| 03R-AC118 | Runtime Add visible; Discard/Save only when dirty | Partial | Fixture only: service-day-copy-layout.spec.ts:56 (buttons present when dirty), workflow-section-layout.spec.ts:15 (absent). Real-app dirty toggling asserted only in UAL helper :37-38,45-46 (failing). |
| 03R-AC119 | Runtime Day copy Route-wide, separate from Profile menu | Uncovered | Impl: App.tsx:1196 (Runtime Actions > Service day), not in runtimeProfileMenu (:1122-1131). No test. |
| 03R-AC120 | Trips Actions has every accepted command in documented order | Failing | Only UAL:56-68, which fails: expects 'Copy from day…' (:64) but App.tsx:1162 renders 'Copy Trips from day…'. |
| 03R-AC121 | Shift opens right-docked non-modal drawer; timetable inspectable | Partial | Geometry on fixture: workflow-section-layout.spec.ts:42-43 (380px wide, flush right). Real-app open/non-modal/inspectable: UAL:186-198 (failing). Nothing asserts non-modality. |
| 03R-AC122 | Shift changes previewed, not persisted before Done | Partial | Service level: AUTH:122 (repo unchanged after preview), tripShift.test.ts:35. UI path (staged label, Discard leaves 6:00, Done persists after reload) only UAL:196-223 (failing). |
| 03R-AC123 | Undo, Redo, Discard, Done, stale rejection, navigation guards | Failing | UI behavior only in UAL:186-224 (failing). Stale rejection alone is Covered at service level (AUTH:129-140). |
| 03R-AC124 | Existing copy, regen, Pattern change, deletion, profile, Runtime editing unchanged | Partial | Copy: SDC. Regen: AUTH:176-207 (service) with UI in UAL (failing). Pattern change: AUTH:255-265 single Trip. Deletion: AUTH:242-253. Profile: trip-profile.spec.ts. Runtime editing UI: only UAL helper (failing) and fixture layout. |
| 03R-AC125 | Alignment, 12px buffers, 30px controls, 5px/8px gaps, typography, focus rings, responsive | Partial | Only header-vs-title y-alignment and a 12px right inset on fixtures (workflow-section-layout.spec.ts:38-41; service-day-copy-layout.spec.ts:75-78). No 30px, 5px, 8px, typography, focus-ring or responsive assertion. |
| 03R-AC126 | Automated tests, build, keyboard, a11y, reload, visual pass | Not testable | Aggregate/manual. HEAD has 7 failing Playwright tests. |
| 03R-AC127 | Gate: record closeout; stop before Phase 4 | Not testable | Process gate (record claims 8 Playwright tests passed; 7 fail at HEAD). |
| 03R-AC129 | Runtime reverse-copy stays in Profile menu; no New profile… in Trip menu | Uncovered | Impl: App.tsx:1128 (Reverse-copy, conditional on reverseCandidates), :1134-1141 (Trip menu has no New). No test. Flagged conflict with fixed Runtime menu text; code matches this row. |

### 04- rows

| ID | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 04-AC1 | Manual blocking with named scenarios and ordered activities | Covered | blocking-workspace.spec.ts:116-162 (create scenario, Blocks, reload); BS:73-87 (reorder persisted); BD:12-22. |
| 04-AC2 | Scenario selects one immutable Trip Profile; spans all service days | Partial | Profile carried: BD:19. Immutability is neither enforced nor tested: `existing`/`current` fetched but unused (blockingRepository.ts:33 in-memory, :93 Dexie). Multi-day span never asserted. |
| 04-AC3 | Alternatives, assign/move, boundary/deadhead entry, feasibility, summaries | Partial | Aggregate: see 04-AC4 to 04-AC12. |
| 04-AC4 | Create empty Blocking Scenario or duplicate one | Partial | Create: BS:50-58, e2e :131-133. Duplicate: domain BD:18-19 only; service paths (blockingService.ts:35-41, :57-62) and UI never run. |
| 04-AC5 | Select Trip Profile, Blocking Scenario, Route, service day as context | Partial | Scenario selector e2e :133; day heading :134. Trip Profile and Route selectors not asserted. |
| 04-AC6 | Create, label, rename, annotate, delete Blocks | Partial | Create/label: e2e :138-146, BS:55. Rename, notes, delete not tested (`deleteBlock` blockingService.ts:80, no caller in tests). |
| 04-AC7 | Assign, move, unassign, remove, reorder; no duplicate Trip ID | Covered | BS:57,73-87,89-105,107-128,141-165; BD:117-123; e2e blocking-workspace.spec.ts:27-104. |
| 04-AC8 | See raw gaps, deadhead requirements, usable layovers, findings | Partial | usableLayoverSeconds BD:73,82; deadheadMissing BD:70; 'Needs deadhead' e2e :294. `rawGapSeconds` never asserted; BlockingWorkspace.test.ts:5-9 tests only the duration formatter. |
| 04-AC9 | Relative pull-out/in/deadhead durations; bulk apply with preview/replace | Covered | BD:46-58,76-83; BS:13-48 (preview counts, endpoint-change rejection :30, replace :39-41); e2e :235-248. |
| 04-AC10 | Keep valid incomplete/infeasible work with visible findings | Partial | Incomplete: BD:60-64,66-70,111-114; e2e :150. Infeasible (overlap, non-fitting deadhead) retained: no test (see 04-AC78/79). |
| 04-AC11 | Compatibility at insertion point without mutating | Covered | BD:85-90 (value.activities length 2 after), :92-100, :102-109. |
| 04-AC12 | Block and selected-day hours/miles/status | Partial | Block-level hours/miles/status: BD:43. Selected-day summary (getScenarioSummary serviceDayId, blockingService.ts:211) untested; e2e :108-111 checks headings only. |
| 04-AC13 | Reload, duplicate, back up, restore, export without losing relationships | Partial | Backup round trip/remap: backup.test.ts:104-123; reload e2e :160-162; export e2e :152-155, csv.test.ts:48-66. Duplicate across persistence untested; Scenario duplication drops node remap (see High-risk 1). |
| 04-AC14 | Trips Block column: assign/move/unassign one or more | Covered | blocking-workspace.spec.ts:58-104 (row pill, bulk assign :74-81, move :85-87, row unassign :91-93, bulk unassign :98-104); passes at HEAD. |
| 04-AC72 | Scenario naming, ownership, immutable Trip Profile | Partial | Name trim: BD:14. Ownership boundary: blockingRepository.test.ts:25-27. Name uniqueness and immutability untested. |
| 04-AC73 | Empty and populated duplication across all days | Partial | BD:15-21 (one Block, one day, ids differ). No empty-duplicate test, no multi-day test, no service/persistence duplicate test. blockingRepository.test.ts:12-20 does not duplicate despite its title. |
| 04-AC74 | Activity normalization and stable IDs | Covered | BD:15-17 (sequence renumbered [po 0, r 1], IDs preserved). |
| 04-AC75 | Pull-out/in cardinality and position | Partial | Only `block.pullOutMustBeFirst` asserted (BD:27). multiplePullOut/In and pullInMustBeLast untested (blocking.ts rules). |
| 04-AC76 | Matching-terminal layover | Covered | BD:43 (layoverHours 100/3600, revenueHours includes it). |
| 04-AC77 | Different-terminal incomplete connection | Covered | BD:70 (`block.deadheadMissing`). Connection `status` not asserted. |
| 04-AC78 | Fitting, misplaced, non-fitting deadhead | Partial | Missing BD:70; fitting BD:71-73. `deadheadDoesNotFit`, `deadheadPlacement`, `deadheadNodeDiscontinuity` (blocking.ts:~95,118,203) have no test. |
| 04-AC79 | Overlap and extended times above 24:00 | Uncovered | No block test with overlapping Trips (`block.connectionOverlap` blocking.ts:118,192) or times above 86400. BlockingWorkspace.test.ts:5-9 tests only formatting of -600. |
| 04-AC80 | Duplicate Trip prevention across Blocks | Covered | BD:28-29; BD:121-122 ('already assigned'); BS:130-138 (rejects, repo unchanged). |
| 04-AC81 | Identical schedules with distinct Trip IDs | Uncovered | No test assigns two Trips with identical times. Impl: duplicate key by trip.id (blocking.ts:98). |
| 04-AC82 | Atomic reassignment request behavior | Covered | BD:117-120 (both Blocks updated in one result); BS:100-102, :159-164. |
| 04-AC83 | Revenue, platform, deadhead, layover hours | Covered | BD:43, :54-55, :73. |
| 04-AC84 | Complete and incomplete revenue/platform miles | Partial | Complete only: BD:43 (20, 23). Incomplete derivation (blocking.ts:125) never asserted; costing.test.ts:102-106 feeds hand-built undefined values. |
| 04-AC85 | Known subtotal and invalid/incomplete counts | Partial | BD:114 asserts validBlockCount, incompleteBlockCount, revenueHours; `invalidBlockCount` never asserted and no invalid Block in the fixture. |
| 04-AC86 | Two-sided insertion compatibility | Covered | BD:88-89,99,107-108. |
| 04-AC87 | 100 Blocks and 500 Trips for one day | Partial | BD:153-158 uses 100 empty Blocks; none of the 500 Trips is assigned or summarized; no time bound. |
| 04-AC88 | 4A gate: focused tests + typecheck | Not testable | Process gate. |
| 04-AC89 | Present worked timelines | Not testable | Manual presentation. |
| 04-AC90 | Confirm with user before 4B | Not testable | User gate. |
| 04-AC107 | Repository and transaction tests | Partial | blockingRepository.test.ts:12-36 (in-memory only). No Vitest runs DexieBlockingRepository. |
| 04-AC108 | Duplicate-assignment race and stale-preview rejection | Partial | Stale: BS:36, blockingRepository.test.ts:17. Duplicate rejection: BS:130-138. No stale-signature test for assignTrip/reassign (the race path). |
| 04-AC109 | Forced rollback for create, duplicate, delete, assignment, reassignment | Partial | One in-memory rollback (validation failure) at blockingRepository.test.ts:22-28. No forced-failure test for create, duplicate, delete, assign, reassign, or any Dexie path. |
| 04-AC110 | Dexie migration with zero and populated placeholder Blocks | Uncovered | repository.test.ts:30-47 returns early without indexedDB (:31) and would fail at :42. database-migration.spec.ts starts at v4. Impl: database.ts:30-36 (`blocks.clear()`). |
| 04-AC111 | Placeholder removal keeps Trips and Trip Profiles | Uncovered | Asserted only inside the vacuous test, repository.test.ts:43-45. |
| 04-AC112 | Backup versions 1 through current; current round trip | Partial | v1 backup.test.ts:43-50, v4 :52-58, v5 :145-158, v6 round trip :125-143. Versions 2 and 3 accepted (backup.ts:391) but untested. |
| 04-AC113 | Import-as-copy and Project Scenario duplication remapping | Partial | Import-as-copy: backup.test.ts:104-123 (Blocking Scenario, Block owner, Node). Project Scenario duplication (project.ts:143-230) has no Blocking coverage: project.test.ts:31 uses `blocks: []`, no blockingScenarios. |
| 04-AC114 | Blocking Scenario duplication across all days | Partial | Same as 04-AC73. |
| 04-AC115 | Trip Profile copy and deletion | Partial | Copy: tripProfile.test.ts:48-61. Deletion: :72-88, :90-99, but Blocks use legacy `tripProfileId` shape (:44,74); Blocking Scenarios owned by the profile (inMemoryRepository.ts:270-272; dexieRepository.ts:370-382) are never created in the test. |
| 04-AC116 | Trip, service-day, Pattern, Route, Node cleanup | Partial | Trip: AUTH:242-253, trips.test.ts:120-146. Pattern: routeDefinitionService.test.ts:137-160. Route: :162-185. Service-day deletion and Node deletion (routeDefinitionService.ts:497-513) have no test. Fixtures use legacy Block shape. |
| 04-AC117 | CSV headers, escaping, ordering, summaries, incomplete values | Partial | csv.test.ts:7-9 (escaping), :48-59 (headers, ordering), :61-66 (summary). Incomplete-value output (blank platform hours/miles) not asserted; BS:61-71 only checks file suffixes. |
| 04-AC118 | 4B typecheck, full Vitest, build | Not testable | Process verification. |
| 04-AC119 | 4B data-integrity gate completed | Not testable | Process gate. |
| 04-AC153 | User builds representative Federal Boulevard Blocks | Not testable | Manual user gate. |
| 04-AC154 | 4C gate: full Vitest and Playwright, build, reload, a11y, visual | Not testable | Process gate. Playwright suite has 7 failing tests at HEAD. |
| 04-AC163 | Scenario belongs to one Scenario and one immutable Trip Profile; all days | Partial | Same as 04-AC2/04-AC72. |
| 04-AC164 | Block belongs to one Blocking Scenario and one service day | Partial | Ownership boundary blockingRepository.test.ts:25-27. `block.blockingScenarioMismatch` and service-day validity not tested. |
| 04-AC165 | No duplicate Trip within scenario/day; may differ across scenarios | Partial | Duplicate rejection covered (04-AC80). Cross-scenario allowance (validateBlockingAssignments filters by scenario, blocking.ts:98) has no two-scenario test. |
| 04-AC166 | Reassignment writes both Blocks atomically | Partial | Single save call and end state: BS:100-102. Failure atomicity untested (see 04-AC109). |
| 04-AC167 | Blocks persist ordered activities, not copied Trip data/totals | Uncovered | Enforced by type shape only (types.ts:89 RevenueTripActivity holds tripId; :97 BlockingBlock). No test inspects persisted records. |
| 04-AC168 | Structural corruption rejected; infeasibility visible | Covered | Structural: BD:27,30; BS:177-178 (rejected, repo equals original). Operational retained: BD:63,70. |
| 04-AC169 | All displayed values derived; revenue hours = running + layover | Covered | BD:43 (revenueHours = running+layover), :73; csv.test.ts:61-66; e2e :108-111. |
| 04-AC170 | Platform hours/miles never shown complete without inputs | Partial | Hours: BD:63 (platformBoundaryMissing). Miles: platformMilesIncomplete (blocking.ts:125) and UI gating untested. |
| 04-AC171 | Route filter does not truncate Block or create multi-route assignments | Partial | Multi-route blocked: BS:177-178. Truncation by Route filter (UI) untested. |
| 04-AC172 | Trips Block column scoped by scenario selector; no cross day/profile; atomic and duplicate-safe | Partial | Atomic/duplicate-safe: BS:107-165, e2e :74-104. Selector present e2e :174-177. Cross-day/profile rejection (blockingService.ts:148) has no test. |
| 04-AC173 | Trip/Profile/Route/Pattern/Node/service-day cleanup and revalidation | Partial | Same as 04-AC116. |
| 04-AC174 | Dexie migration discards placeholders, preserves non-Block records | Uncovered | Same as 04-AC110/111. |
| 04-AC175 | Backup, restore, import-as-copy, Scenario duplication, Blocking duplication, CSV reference checks | Partial | See 04-AC113: Scenario duplication untested and defective for node refs. |
| 04-AC176 | UI has no authoritative calculations | Uncovered | No test or lint. Grep of BlockingWorkspace.tsx for hour arithmetic found none; it imports only createBlockingScenarioSourceSignature from domain (BlockingWorkspace.tsx:4). |
| 04-AC177 | Tests, build, reload, capacity, keyboard, a11y, visual pass | Not testable | Aggregate/manual. 7 Playwright tests fail at HEAD. |
| 04-AC178 | Phase 4 closeout; do not start Costing | Not testable | Process gate. |

### High-risk gaps (ranked)

1. 04-AC113 / 04-AC175 / 04-AC13: Project Scenario duplication does not remap Node IDs inside Block activities. src/domain/project.ts:222 maps non-revenue activities with `{ ...activity, id: newId() }` while `nodeIds` (project.ts:156-159) exists; backup.ts:557 does remap. Duplicated Scenario's pull-out/pull-in/deadhead keep source-Scenario Node IDs (cross-Scenario dangling refs, false discontinuity findings). Test project.test.ts:14-48 has `blocks: []`. Defect plus gap.
2. 03-AC80: no forced-failure test for Runtime copy or Trip copy transactions. Trip copy deletes the target day's Trips (inMemoryRepository.ts:363-383; dexieRepository.ts:448-462). Data loss if rollback is wrong.
3. 04-AC109 / 04-AC107: rollback for Blocking create/duplicate/delete/assign/reassign is covered by a single in-memory validation case (blockingRepository.test.ts:22-28). Dexie transactions (blockingRepository.ts:91,106,122) have no Vitest coverage.
4. 04-AC110 / 04-AC111 / 04-AC174: v3-to-v4 migration `blocks.clear()` (database.ts:33-35) untested; the Vitest test is vacuous (repository.test.ts:31) and would fail at :42 (expects 5, DB is 6). Playwright migration starts at v4.
5. 03R-AC73 / 03R-AC75 / 03-AC81: multi-Trip staged Shift and batch Pattern change atomicity unproven. All shift tests use one Trip; the rollback fake throws before mutating (AUTH:31); successful `applyBatchPatternChange` never run (SDC:129-133 only rejection).
6. 03R-AC76 (related): `shiftTrips` (trips.ts:422-430) and `buildTripShiftPreview` add the offset with no lower bound; no test or guard located for a negative-start result when shifting earlier than 00:00. Wrong times.
7. 03R-AC122 / 03R-AC123 / 03R-AC120: the only real-app proof that Shift is not persisted before Done, and that Discard writes nothing, is UAL:186-224, which fails at its helper (label mismatch UAL:64 vs App.tsx:1162).
8. 04-AC73 / 04-AC114 / 04-AC4: Blocking Scenario duplication (service blockingService.ts:35-41, :57-62) has no service, persistence, or UI test; domain test covers one Block on one day. blockingRepository.test.ts:12-20 is titled "duplicates" but does not duplicate.
9. 04-AC2 / 04-AC72 / 04-AC163: Trip Profile immutability for a Blocking Scenario is not enforced (`existing` unused blockingRepository.ts:33; `current` unused :93) and not tested. A profile change would orphan Block Trip references.
10. 04-AC79: overlap (`block.connectionOverlap`, blocking.ts:118,192) and after-midnight times have no Block-level test. Negative gaps feed hours and validity.
11. 04-AC84 / 04-AC170: incomplete revenue/platform miles never asserted at the domain; propagation (blocking.ts:125, :140-141) affects costing inputs. Only a hand-built summary tests costing (costing.test.ts:102-106).
12. 04-AC85: scenario totals sum only `valid` Blocks (blocking.ts:~134-139); `invalidBlockCount` and exclusion of an invalid Block's hours are untested, so hours can be silently under-reported.
13. 04-AC116 / 04-AC173: Node deletion cleanup (routeDefinitionService.ts:497-513) has no test and performs two separate writes (`saveAggregate` then `saveScenarioRecords`), so a failure between them leaves Blocks referencing a deleted Node.
14. 04-AC115: Trip profile deletion tests use the superseded legacy Block shape (tripProfile.test.ts:44,74); owned Blocking Scenarios and their Blocks (dexieRepository.ts:370-382) are never exercised.
15. 03-AC6 / 03-AC76 / 03-AC75: Trip copy tests have no source Block and never compare copied times/provenance or target assignments, so unintended Block or assignment copying, or provenance drift (copied `calculationSource` still points at the source day's profile, serviceDayCopy.ts:255), would not be caught.

---

## A4 coverage map: 05-, RTP-, TTI- (Kind AC/TST/GATE only) — 51 rows

Paths relative to /home/user/transit-costing-tool. "CW" = tests/ui/costing-workspace.spec.ts (passing Playwright). "UAL" = tests/ui/unified-action-layer.spec.ts (all 6 tests fail in helper at L56-64).

### Table

| ID | Criterion | Status | Evidence |
|---|---|---|---|
| 05-AC1 | 5C user-verification gate | Not testable | Manual gate. |
| 05-AC2 | One scenario; daily Rev/Platform hrs, cost/day, annual qty+USD, base + up to 10 yrs | Covered | src/domain/costing.test.ts:205-211 (3 year rows), :214-217 (11 rows, last 2036); CW:46-52 (View year select, Cost Breakdown, `$40,170` footer = 260 x 1.0h x 154.5). Impl costing.ts:327-343. |
| 05-AC3 | Entered USD/VRH rate only multiplier | Covered | costing.test.ts:241-256: Platform Hours default 3 but total asserted 0.01 (=0.005x1x1 + 0.005x1x1); a platform multiplier would give 0.03. Impl costing.ts:342 (revenueHoursPerDay*rate*days). |
| 05-AC4 | Same Scenario-owned assumptions on scenario switch | Partial | costingService.test.ts:61-77 asserts one record per Scenario, identity kept (L75 `updated.id` = `created.id`). No test switches Blocking Scenario in UI or service and compares assumptions. |
| 05-AC5 | Show excluded Block and unassigned-Trip counts; never label partial complete; no comparison table | Covered (counts, partial label); comparison-table negative unasserted | CW:44-45 asserts `Partial estimate` and `0 excluded Blocks · 1 unassigned Trips`; costing.test.ts:171 `state` = partial, :196. No assertion that a comparison table is absent. |
| 05-AC22 | Tie and row-total rounding examples in 5A tests | Covered | costing.test.ts:236-238 (1.005 -> 1.01, -1.005 -> -1.01, 1.23445 -> 1.2345); :255-256 (rows sum 0.02 vs rounded total 0.01). Impl costing.ts:362-381 (BigInt decimal-string rounding). Not tested: exponent-form inputs (1e-7, 1e21). |
| 05-AC53 | 5A gate passed | Not testable | Historical gate record. |
| 05-AC54 | 5B gate recorded 2026-09-23 | Not testable | Recorded result. Related automated pieces: tests/ui/database-migration.spec.ts (v4 -> v6 project preserved, verified by reading; expects version 60), csv.test.ts:68. |
| 05-AC55 | 5C user verification gate | Not testable | Manual gate. |
| 05-AC56 | 5D report/ask gate | Not testable | Manual gate. |
| 05-AC60 | Eligible Blocks alone determine costed Revenue Hours; Platform Hours displayed, not multiplied | Covered | costing.test.ts:112-115, :241-256 (see 05-AC3); eligibility :265-274. Impl costing.ts:342. |
| 05-AC61 | Missing mileage does not suppress hour estimate | Covered | costing.test.ts:97-115: revenue/platform miles undefined, state `complete`, hours 1 and 3. |
| 05-AC62 | Missing boundaries, bad connections, unassigned Trips reported; partial never complete | Covered | costing.test.ts:118-128 (platformBoundariesMissing), :131-155 (connectionIncomplete, connectionConflict), :168-173 (unassigned), :158-165 (empty Block = noEstimate, not complete). Negative hours (not NaN/Infinity) untested: :265-274. |
| 05-AC63 | Totals reconcile before presentation rounding; displayed rows may differ by rounding | Covered | costing.test.ts:241-256 (unrounded sum, rounded once); CW:46-47 `$40,170` footer. Gap: annualRevenueHours = perDay x days asserted only for days=0 (:199); no unit test with nonzero days other than CW. |
| 05-AC64 | Day counts sum never exceeds 365 in new edits; <365 valid | Partial | costing.test.ts:176-183 tests 364/365/366 against `validateAnnualServiceDays` only (domain). Edit path is not guarded: App.tsx:508 -> :254 `updateServiceDay` -> routeDefinitionService.ts:419-421 saves any integer >=0 with no 365 check; `MAX_ANNUAL_SERVICE_DAYS` referenced only in costing.ts:203. A 366+ total is saved and the Costing result becomes `invalid` (costing.ts:287). "In new edits" is unenforced and untested. |
| 05-AC65 | Source rate, source year, applied rate, escalation visible and correct for base + future years | Partial | Math: costing.test.ts:205-211 (106.09, 109.2727, 112.550881 from 100 @2024, 3%). UI: CW:53-54 asserts only `Applied rate 159 USD per Revenue Hour`; CostingWorkspace.tsx:58 rounds rate to 0 dp (159.135 shown as 159). Source/rate-year/escalation field visibility not asserted. Rate year == base year (exponent 0) and negative escalation untested. |
| 05-AC66 | Switching Blocking Scenarios changes quantities, keeps one assumptions set; Trip Profile derivation unambiguous | Partial | costingService.test.ts:25-59 (only the selected id is loaded; other returns undefined); costing.test.ts:259-262 (selection), no test switches between two populated Blocking Scenarios. `costing.tripProfileMismatch` (costing.ts:269-271) untested. |
| 05-AC67 | Backup/restore, scenario copy, migration, export preserve inputs and reproduce results without persisting totals | Partial | backup.test.ts:125-143 (schema 6 round trip, import-as-copy remap), :145-158 (v5), :160+ (malformed rejected); routeDefinitionService.test.ts:200-218 (scenario copy/delete); csv.test.ts:68-95 (export). Gaps: Dexie scenario-copy/backup path untested at unit level; csv.test builds its CostingCalculationResult by hand (not from `calculateCosting`), so export reconcile is formatting-only; repository.test.ts:36-47 migration test is vacuous: it returns when `typeof indexedDB === 'undefined'` (no fake-indexeddb in repo) and, if it did run, asserts `verno` 5 while schema is 6 (database.ts:41). Only tests/ui/database-migration.spec.ts exercises migration. |
| 05-AC68 | Keyboard accessible; columns/totals align; no unintended horizontal scroll at desktop width | Partial | CW:59-60 asserts no page horizontal scroll at 1440 and headings visible at 760. No keyboard test, no column-alignment assertion. |
| 05-AC69 | One editable assumption set; escalation default 3%; max base + 10 future | Partial | Max horizon: costing.test.ts:214-217 (10 allowed), no test that 11 is rejected (costing.ts:150). Default 3%: constant costing.ts:9, used CostingWorkspace.tsx:34; no test asserts it (CW seeds 0.03 explicitly; costingService.test.ts:70 passes 0.03). Escalation bounds (<= -1 invalid, costing.ts:157) untested. |
| 05-AC70 | One selected scenario shown, no comparison table | Partial | CW exercises one scenario only; absence of a comparison table not asserted. |
| 05-AC71 | Vitest: pure math, eligibility, edge cases, life cycles | Partial | src/domain/costing.test.ts (16 cases, listed in tests.md) + costingService.test.ts + backup/routeDefinition lifecycle. Missing: escalation bounds, futureYearCount >10, negative/NaN rate, overflow (`costing.calculationOverflow`), negative hours, `adjustedRateInvalid`. |
| 05-AC72 | Typecheck; migration + JSON round-trip tests; CSV reconciliation | Partial | JSON round trip: backup.test.ts:125-143. Migration: Playwright only (see 05-AC67); Vitest migration test vacuous. CSV: see 05-AC67. Typecheck is not a test. |
| 05-AC73 | Playwright UI + keyboard checks; build; visual inspection small/dense data | Partial | Only CW (1 test, 1 seeded project, 1 block). No keyboard test; no dense-data case. Build/visual are manual. |
| RTP-AC2 | Enter several runtime bands from clipboard/CSV | Partial | Only src/ui/runtimePaste.test.ts:7-14 (parser round trip of one band). Dialog never exercised: no Playwright spec references paste (grep of tests/ empty). |
| RTP-AC4 | `Paste rows…` in Runtimes Actions menu | Uncovered | App.tsx:1189. No test. |
| RTP-AC5 | Accept TSV, CSV, quoted fields, CRLF | Partial | runtimePaste.test.ts:12-13: CSV with quoted `"AM, peak"` and CRLF (runtimePaste.ts:21 emits `\r\n`). TSV path (detectDelimiter runtimePaste.ts:48-71) untested; escaped `""`, embedded newlines, unclosed quote untested. |
| RTP-AC6 | Data rows = From, To, one runtime per segment in order | Partial | runtimePaste.test.ts:13 asserts two segments [450, 510] from `Segment 1/2`. Order vs pattern displayed order and wrong counts not asserted. |
| RTP-AC7 | Optional header; leading Band, trailing Total; labels kept; Total ignored | Partial | runtimePaste.test.ts:13 asserts `bandLabel: 'AM, peak'`. The export header (runtimePaste.ts:20) has no Total column, so Total-ignore (detectColumns :173-174, columns :183-184) is untested. |
| RTP-AC8 | Calculation Method column, same on every row, updates draft method | Partial | runtimePaste.test.ts:13 asserts `calculationMethod: 'segmentStart'` parsed. Mixed-method rejection (runtimePaste.ts:211) and draft update (App.tsx:1339) untested. Note: export writes `singleBand` for a legacy profile with undefined method (runtimePaste.ts:21), so re-import converts it to explicit singleBand (revision hash treats undefined as singleBand, runtime.ts:39). |
| RTP-AC9 | Headerless rows only From, To, runtimes | Uncovered | Impl runtimePaste.ts:136-138 (expected count segmentCount+2), :189-193. No test. |
| RTP-AC10 | From/To use service-time parser incl. >24:00; runtimes use duration parser | Partial | runtimePaste.test.ts:13 (05:00/06:00 -> 18000/21600; 7:30 style durations). No >24:00 or invalid-token case. |
| RTP-AC11 | Replace/append choice; Replace default | Uncovered | App.tsx:1296 (default `replace`), :1367-1369. No test. |
| RTP-AC12 | Preview parsed times, runtimes, Totals; validate full candidate before Apply | Uncovered | App.tsx:1329-1349 (validateRuntimeProfile on candidate), :1379-1382 preview, :1383 `canApply`. No test. |
| RTP-AC13 | Parse/validation errors prevent any draft change; non-errors stay visible | Uncovered | App.tsx:1340-1341, :1356 `canApply`, :1375-1376. No test. |
| RTP-AC14 | Apply updates unsaved draft; Save persists | Uncovered | App.tsx:1264-1268 `applyPastedProfile`, save :1269. No test. |
| RTP-AC15 | Shared profile edits affect all assignments; Trips unchanged until recalculated | Partial | authoritativeTripService.test.ts:267-281 (stale detection `listStaleTrips` without mutating Trips); serviceDayCopy.test.ts:80 (shared profile); runtime.test.ts:111 (revision increments). No test that saving a shared profile leaves assigned-day Trips unchanged. |
| RTP-AC16 | No schema/IndexedDB/backup/import changes needed | Not testable | Negative scope statement. |
| RTP-AC17 | Paste complete row or multiple rows | Partial | Same single-band-row test as RTP-AC2; multi-row (parse loop runtimePaste.ts:186-226) not exercised. |
| RTP-AC18 | Column count must match segment count + optional Band/Total | Uncovered | Impl runtimePaste.ts:175-179 (header), :188-192 (rows). No test. |
| RTP-AC19 | Invalid times, durations, quoting, blanks, profile errors shown before Apply | Uncovered | Impl runtimePaste.ts:100-116 (quote errors), :199-226. No test. |
| RTP-AC20 | Apply changes draft only; Cancel leaves it unchanged | Uncovered | App.tsx:1264-1268, :1383 Cancel -> onClose. No test. |
| RTP-AC21 | Replace removes bands; Append preserves and sequences after | Uncovered | App.tsx:1329-1337 (`firstSequence`, `nextBands`). No test. |
| RTP-AC22 | Save continues through existing validation/persistence | Partial | Existing path tested without paste: runtime.test.ts:65 (validation), routeDefinitionService.test.ts:62 (save/copy). Paste->save not tested. |
| RTP-AC23 | Total derived, never imported as authoritative | Uncovered | runtimePaste.ts does not read the Total cell (indices :132-135, :198); trailing Total only counted. No test. |
| TTI-AC8 | Runtime CSV round-trips labels, ranges, runtimes, method via review-and-save | Partial | runtimePaste.test.ts:7-14 asserts parse of `runtimeProfileCsv` output (label, startTime, endTime, method, runtimes). Not covered: the UI review-and-save flow, Export action, band IDs. |
| TTI-AC9 | Trips CSV round-trips IDs, labels, patterns, whole-second timepoints; invalid items shown and cannot apply | Partial | tripTableCsv.test.ts:7-21 asserts round trip incl. 18435 (sub-minute) and `publicLabel: 'Trip, A'`. Invalid ID/pattern/point-set/time rejection: impl tripGenerationService.ts:241-275 (`csvDuplicateId`, `csvPatternInvalid`, `csvTripInvalid`, `csvPointSetInvalid`), tripTableCsv.ts:60-68 (bad time), App.tsx:1076 apply guard. None tested; apply-time rejection of error findings (tripGenerationService.ts ~313) untested. |
| TTI-AC10 | Import updates do not detach Blocks; added Trips manual+unassigned; omitted Trips not removed | Partial | authoritativeTripService.test.ts:209-224 asserts created=1/updated=1, ID retained on update, `manuallyChangedFields: ['times']`. Not asserted: added Trip `creationMethod: 'manual'` (impl tripGenerationService.ts:281-284), no Block activity added, omitted Trip still present, Block assignment of updated Trip unchanged. |
| TTI-AC11 | Atomic recalculation+undo; undo survives reload; schedule-context-only; expires on affected Trip change/removal | Partial (core unit) / Failing (reload, context) | Unit (InMemory fake only): authoritativeTripService.test.ts:189-207 asserts undo stored (:200), restored (:203), cleared after (:204), invalidated by saveTrips of an affected Trip (:206-207). Atomic failure rollback for shift: :150-151 (shift only). Reload survival + context gating (App.tsx:1146-1149): only UAL:140-167 (Failing; also fails before reaching undo at the helper). Dexie implementation (dexieRepository.ts:393-444, :228-232, :125) has 0% unit coverage and no passing Playwright test. Untested invalidation paths: delete (:421), saveTripChangesAtomically (:417), replaceTripsForDayAtomically (:459), replaceGenerationSet (:476), scenario/project replace (:125, :232), stale-restore throw (:437-441), regeneration precondition mismatch (:430). |
| TTI-AC12 | New profiles use segmentStart; legacy undefined stays singleBand | Failing | Only assertion: UAL:50 (`Band at segment start` aria-checked true) — inside failing helper. No unit test: `createDefaultRuntimeProfile` (routeDefinitionService.ts:689) not asserted (routeDefinitionService.test.ts:62-80 never checks `calculationMethod`); legacy undefined -> singleBand has no test; there is no unit test of `segmentStartTimes` (runtime.ts:106-126) or segmentStart anchored recalculation (trips.ts:267-285) at all (`segmentStart` appears in no .test file except runtimePaste.test.ts). |
| TTI-AC13 | Trips headers visible in page-scrolling schedule; shift commit restores page and horizontal grid positions | Failing | UAL:169-184 uses `.schedule-table` `scrollTop` (nested vertical scroller; stale vs decision 0035 item 5, CSS styles.css:97 sets `overflow-y: visible` so scrollTop poll at :172 cannot pass). tests/ui/trip-table-layout.spec.ts:40-62 asserts `position: sticky` inside a scroll viewport — superseded by 0035 item 5 (fixed duplicate header `.sticky-schedule-header`, styles.css:99). No passing test of the fixed header (App.tsx:1452, :1475) or of window/horizontal restoration (App.tsx:1012-1018). Both tests are stale and would need rewriting, not just the menu-label fix. |

### Counts (51 rows)

| Status | Count | IDs |
|---|---|---|
| Covered | 8 | 05-AC2, AC3, AC5, AC22, AC60, AC61, AC62, AC63 |
| Partial | 24 | 05-AC4, AC64-AC73 (10 rows: 64,65,66,67,68,69,70,71,72,73); RTP-AC2, 5, 6, 7, 8, 10, 15, 17, 22; TTI-AC8, 9, 10, 11 |
| Failing | 2 | TTI-AC12, TTI-AC13 |
| Uncovered | 11 | RTP-AC4, 9, 11, 12, 13, 14, 18, 19, 20, 21, 23 |
| Superseded | 0 | (05-AC64's "new edits" and TTI-AC13's nested-scroll tests are not superseded by a decision; the tests are stale vs 0035) |
| Not testable | 6 | 05-AC1, 53, 54, 55, 56; RTP-AC16 |

### High-risk gaps (ranked)

1. 05-AC64 / edit path: no 365 enforcement when editing annual service days (App.tsx:508 -> routeDefinitionService.ts:419-421). A >365 total is persisted; costing then returns `invalid` (costing.ts:287) — no wrong cost, but the criterion "never exceeds 365 in new edits" is unimplemented and untested.
2. TTI-AC11 Dexie undo invalidation: dexieRepository.ts:393-444, :228-232, :125 untested. Only the in-memory fake is tested (authoritativeTripService.test.ts:189-207; repository.test.ts:87). A bug in Dexie invalidation on delete/import/copy/replaceGenerationSet leaves a stale undo that overwrites newer Trip times (restore compares JSON of afterTrips, :437, which limits damage but invalidation on delete :421/:459/:476 is untested). Reload persistence covered only by failing UAL:140.
3. TTI-AC12 `segmentStart` calculation has no unit test: `segmentStartTimes` (runtime.ts:106-126), propagation (runtime.ts:285-288), and anchored segmentStart recalculation (trips.ts:267-285) can produce wrong Trip times undetected. Default-method assertion exists only in failing UAL:50.
4. TTI-AC10 CSV import: no test that updated Trips keep Block assignments, added Trips are manual/unassigned, omitted Trips survive (tripGenerationService.ts:241-300; write via saveTripChangesAtomically).
5. TTI-AC9 CSV import rejection paths untested (tripGenerationService.ts:241-275; tripTableCsv.ts:60-68). An undetected hole would let wrong times be written to Trips.
6. RTP-AC21 / AC11 / AC12 / AC13 / AC20 paste Replace/Append/validation gating all untested (App.tsx:1329-1349, :1356, :1264-1268). Replace overwrites band times; a regression writes wrong runtimes into the draft that Save persists.
7. RTP-AC8 mixed-method and method-update untested (runtimePaste.ts:211; App.tsx:1339); import silently turns a legacy undefined method into explicit `singleBand` (export writes it, runtimePaste.ts:21).
8. RTP-AC9 / AC18 / AC19 / AC23 column-count and Total-ignore logic untested (runtimePaste.ts:136-138, :173-184, :188-226). A misaligned column would shift segment runtimes silently only if the count happens to match.
9. 05-AC69 / AC71 escalation and horizon bounds untested: no test for futureYearCount 11 (costing.ts:150), escalation <= -1 (costing.ts:157), non-finite/negative rate, `costing.adjustedRateInvalid`, `costing.calculationOverflow` (costing.ts:332-335, :350-353).
10. 05-AC66 Blocking Scenario switch never exercised with two populated scenarios; wrong-scenario quantities would show silently (costingService.test.ts:25 uses empty context).
11. 05-AC65 UI rounds the Applied rate to whole dollars (CostingWorkspace.tsx:58, :192: 159.135 -> "159"); criterion says applied rate is visible and correct. Test CW:53 locks in the integer.
12. 05-AC67 / AC72 Vitest migration test is vacuous and wrong (repository.test.ts:36-47: early return without indexedDB; expects verno 5, schema is 6). Only tests/ui/database-migration.spec.ts covers migration.
13. TTI-AC13 both tests are stale vs 0035 (nested `scrollTop`, in-viewport `position: sticky`); fixed duplicate header and page/horizontal restoration (App.tsx:1012-1018, :1452, :1475) have no passing test. UI-only, no data loss.
14. 05-AC63 `annualRevenueHours = perDay x days` asserted for 0 days only at unit level (costing.test.ts:199); non-zero reconciliation relies on CW:47 single number.
15. 05-AC22 rounding helper untested for exponent notation / large values (costing.ts:365-368).
