# Phase 2 Findings: Domain Correctness and Edge Cases

- Status: Complete. Gate report for the review lead.
- Baseline: `main` at `baed9f1`; review branch `claude/upbeat-ritchie-51mpy5` (working tree as of 2026-10-22).
- Orchestrator: Phase 2 orchestrator (Opus).
- Delegation: none. The Agent tool was not available in this orchestrator's environment. Per the common brief, the orchestrator performed every task itself. No Sonnet or Haiku output is used in this file.
- Verification: every finding below was reproduced by the orchestrator with an executed test in `docs/review/golden/p2-*.golden.test.ts`, except 2-014 and 2-015, which are confirmed by code trace (quoted lines). There are no delegated claims to re-verify.
- Review-lead re-verification (2026-10-22): the lead re-ran all 131 Phase 2 golden tests (all pass) and read the 2-002, 2-004 and 2-005 traces against `src/domain/trips.ts:422-430`. 2-002 is rated S2 provisionally. In the staged Shift path, the preview renders through `formatServiceTime` before commit, and the app has no React error boundary, so the expected failure is a crash before any write, recoverable by reload. Phase 5 must confirm this in a browser.
- Rule catalogue: rule IDs cite `docs/review/findings/rule-catalogue.md` (Phase 1, pass 1).
- Phase 1 cross-references: 2-001 is the code-side rating of 1-009. 2-003 is the code-side rating of 1-005. 2-015 is the code-side part of 1-016. L-05 is closed by 1-003, and the "capped at 365" wording by 1-006. Phase 2 does not repeat those documentation findings.

Reproduction tests (all pass; 131 tests). Each test file header names the findings it backs. A test whose name starts with `DEFECT` asserts the current defective behavior, and its comment states the expected behavior.

| File | Tasks |
| --- | --- |
| `docs/review/golden/p2-time-runtime.golden.test.ts` | 2.1, 2.2 |
| `docs/review/golden/p2-trips.golden.test.ts` | 2.3, 2.4, 2.5 |
| `docs/review/golden/p2-routeedit-copy.golden.test.ts` | 2.6, 2.7 |
| `docs/review/golden/p2-blocking.golden.test.ts` | 2.8 (16 hand-computed Block shapes) |
| `docs/review/golden/p2-costing-golden.golden.test.ts` | 2.9, 2.10, L-22 |

Run all of them: `pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts docs/review/golden/p2-`. The full golden suite still runs. Its only failures are other phases' intentional `EXPECTED` tests and the existing A-004 test.

## 1. Task results

| Task | Verdict | Evidence |
| --- | --- | --- |
| 2.1 Time and duration parsing | Pass with one S3 defect (2-008). `24:00`, `25:00`, `27:30`, `:MM`, `:MM:SS`, `MM:SS`, decimal minutes, whitespace, empty, `xx:60`, negative input, and `60` minutes all behave as documented. Very large hours exceed `Number.MAX_SAFE_INTEGER`. Decision 0002 explicitly defers a maximum hour, so this is not a finding. The round-display formula (`App.tsx:1402-1405`) rounds exactly 30 s up (D0033-04). | `p2-time-runtime` 2.1 blocks |
| 2.2 Runtime band resolution | Pass with S3 defects 2-007 and 2-011. **A-007 closed:** `segmentStart` now has a boundary matrix covering band start, crossing a band end, departure at a band end, a gap, after the last band, before the first band, a single-band profile, unsorted bands, overlapping bands, and zero-length bands. `singleBand` and `blendSegments` matrices also pass. Revision increments on method, bound, and duration changes, but not on rename or reorder. | `p2-time-runtime` 2.2 blocks |
| 2.3 Trip generation | One S2 defect (2-001, code side of 1-009). Inclusive Last Trip on and off the headway sequence, Number of Trips, the 500/501 count cap, zero, negative, and fractional headway, Last Trip before First Trip, generation across 24:00, and all-or-nothing failure for a departure in a band gap all pass. | `p2-trips` 2.3 |
| 2.4 Regeneration and anchors | One S2 defect (2-003, code side of 1-005). Single-band behavior passes for: an anchor at the last timepoint, the 600 s nearest-band limit (600 s accepted, 601 s rejected), an equidistant tie (`trip.anchorNearestTie`), and the ambiguous case. Also pass: an unreachable `segmentStart` anchor, layover change after a relative deadhead, a newly negative gap warning, layover unavailable without a required deadhead, and the legacy unverified-source confirmation flag. Signed change display values are computed in the UI and are handed to Phase 5. The legacy staleness query is in `tripGenerationService.ts:549` and is handed to Phase 4. | `p2-trips` 2.4 |
| 2.5 Trip shift and staged shift | Defects 2-002 (S2) and 2-010 (S3). Cumulative shifts equal one net shift, and the staged-preview signature does not depend on the offset. The undo/redo stack lives in the UI (`App.tsx:979-1010`); handed to Phase 5. | `p2-trips` 2.5 |
| 2.6 Directions and safe route editing | Defects 2-004 (S2), 2-005 (S2), and 2-009 (S3). A loop with a repeated node, short-turn column-ID stability, offset topological order, reset on reorder and full replacement, and zero-minute insertion all pass. | `p2-routeedit-copy` 2.6 |
| 2.7 Service-day copy | No defects found. Independent and shared Runtime copy, target-assignment replacement, Trip replacement with revenue-activity and adjacent-deadhead cleanup while boundaries are kept, empty-source explicit clear, and source-signature staleness all pass. Phase A lead "Trip copy keeps `calculationSource`" is closed: D0017-07 requires provenance to be kept. `listStaleTrips` (`tripGenerationService.ts:568-569`) compares the source with the target Day's assignment, so a copied Trip with a different target profile is flagged stale as D0017-C1 intends. | `p2-routeedit-copy` 2.7 |
| 2.8 Blocking calculations | Defects 2-006 and 2-012 (S3, both affect only legacy data or mileage). The 16 hand-computed shapes match: empty Block; single Trip; same-terminal layover; terminal mismatch without deadhead; relative deadhead; deadhead longer than its gap; overlap pair marking; legacy explicit boundaries; both timing representations rejected; multi-route Block; pull-out before 0:00; missing deadhead miles (never treated as zero); cross-Trip-Profile rejection (`blocking.ts:236` and `validateBlockingBlock`; this closes the Phase A lead); legacy placement cases. | `p2-blocking` |
| 2.9 Costing | Defect 2-013 (S3). Every PL05 numeric rule passes: escalation including negative values and the `> -100%` bound (−1, −1.5, NaN, and ∞ rejected; −0.9999 accepted); rate year after base year; equal years; horizon 0–10 (11 and 1.5 rejected); zero rate gives $0, absent rate gives a no-estimate state, negative and non-finite rates are rejected; 365 accepted, 366 invalid, below 365 not scaled; zero-count day; no eligible Block gives no estimate rather than $0; totals computed before rounding; half-away-from-zero rounding at 0, 2, and 4 decimals; partial state with a zero-count day. This closes the Phase A "untested bounds" lead. | `p2-costing-golden` 2.9 |
| 2.10 Golden reconciliation | **Complete; zero unexplained difference.** Revenue and Platform hours were recomputed independently from the raw backup JSON in integer seconds, using Block span minus between-Trip deadhead and span plus boundary offsets rather than `summarizeBlock`. The table is below. The largest difference from the domain is 7.4e-14 h, which is floating accumulation. The independent cost-formula re-implementation matches all 11 years to within 1e-6 USD. | `p2-costing-golden` 2.10 |
| 2.11 Validation finding structure | Defect 2-015 (S3, code side of 1-016). Every `ValidationFinding` producer in `runtime.ts`, `trips.ts`, `tripShift.ts`, `serviceDayCopy.ts`, `directions.ts`, `patterns.ts`, `validation.ts`, and `blocking.ts` sets `ruleId`, `severity`, `entityType`, `entityId`, and `messageKey`. Error and warning classification matches OV-VAL-02: structural findings are errors, operational findings are warnings, and duplicates, sequence normalization, and Node-reference deletion are warnings. | code trace |
| 2.12 Purity | Defect 2-014 (S3). No domain module imports React, Dexie, or any non-domain module (all imports are `./`). The only global use is `ids.ts:2` (`crypto.randomUUID` with a `Date.now`/`Math.random` fallback) and the wall-clock `new Date()` defaults on `now` parameters. | grep (listed in 2-014) |
| L-22 Golden Trip counts | Closed as not a defect. All 984 golden Trips reproduce exactly from their assigned Runtime profiles (`p2-costing-golden`, L-22 test), so no Trip would be flagged stale. The NB/SB asymmetry (66/65 and 8/7 on Weekday) comes from the trip-trace rows: `output/federal-brt-import/federal-brt-trip-trace.csv` lists 66 NB Englewood–Westminster rows. The flagged SA row 134 and SU row 116 NB Trips run 44 minutes, the same as every other 13.5-mile Englewood–Westminster Trip, so their Pattern assignment matches their times. The workbook "21.0 mi" label is a source inconsistency. Final confirmation needs the workbook, which is not in the repository. | trace CSV, L-22 test |

### 2.10 reconciliation table (per service day; hours/day)

| Day | Blocks | Revenue (independent, integer s) | Revenue (domain) | Platform (independent) | Platform (domain) | Running (independent) | Documented (REPORT.md §3 / audit) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Weekday | 18 | 311.591667 | 311.59166666666664 | 329.591667 | 329.59166666666664 | 256.283333 | 311.591667 / 329.591667 |
| Saturday | 17 | 280.950000 | 280.94999999999993 | 298.200000 | 298.19999999999993 | 227.566667 | 280:57:00 = 280.95 (audit) |
| Sunday | 17 | 245.891667 | 245.8916666666666 | 262.891667 | 262.8916666666666 | 196.216667 | 245.891667 |
| Holiday | 17 | 245.891667 | 245.8916666666666 | 262.891667 | 262.8916666666666 | 196.216667 | 245.891667 |

Annual revenue hours are 108,326.991667. At $150/VRH (2022), 3% escalation, and base year 2025, the applied rate is 163.90905 and the annual cost is 17,755,774.29 (2025). The independent check found no overlaps and no terminal mismatches in any golden Block. The golden data has no deadhead activities, so deadhead paths are covered only by the synthetic shapes in 2.8.

## 2. Findings

### 2-001: A Last Trip generation request is not limited to 500 Trips (code side of 1-009)

- Severity: S2
- Category: contract
- Location: `src/domain/trips.ts:44` (cap only when `tripCount` is set), `src/domain/trips.ts:57` (unbounded Last Trip loop)
- Governing source: D0010-02: "A single request is limited to 500 trips."
- Evidence: `p2-trips.golden.test.ts` "DEFECT 2-001". Input: First Trip 0:00, Headway 60 s, Last Trip 23:59. `validateGenerateTripsRequest` returns `[]`, and `generateAuthoritativeTrips` returns 1,440 Trips. Expected: a rejection finding. This independently reproduces Phase 1's `p1-generationCap.golden.test.ts`, which produces 1,441 Trips with Last Trip 24:00.
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural; 1 file plus a test. In `validateGenerateTripsRequest`, add `tripGeneration.tripCountTooLarge` when `floor((lastTrip − firstTrip) / headway) + 1 > 500`.
- User decision required: no. Decision 0010 is the higher authority; Phase 1 concurs.

### 2-002: Shifting Trips earlier than 0:00 produces negative service times with no finding

- Severity: S2
- Category: correctness
- Location: `src/domain/trips.ts:422-430` (`shiftTrips`), `src/domain/tripShift.ts:30-41,52-68` (no bound in validation or preview), `src/domain/trips.ts:406-416` (`validateTrip` does not check that times are non-negative), `src/application/tripGenerationService.ts:123-160` (saves without validation)
- Governing source: D0002-01: "Store schedule times as non-negative integer seconds from service-day midnight."
- Evidence: `p2-trips.golden.test.ts` "DEFECT 2-002". A Trip at [0:05, 0:15] shifted by −600 s gives a preview with `findings: []` and times [−300, 300]. The shared formatter `formatServiceTime(−300)` throws. The Trips table renders preview times through `formatTripTableClock` → `formatServiceTime` (`src/ui/App.tsx:1402-1405`), and `App.tsx` has no error boundary.
- Consequence (Probable, not executed in a browser): the staged-Shift preview of such a shift may crash the Trips view before commit. The legacy `applyTripShift` path (`tripGenerationService.ts:129-134`) would persist negative times. Handed to Phase 5 for browser confirmation; if the persisted state cannot be recovered, Phase 5 may raise the severity.
- Confidence: Confirmed (domain reproduced); UI consequence Probable
- Verified by: orchestrator
- Fix scope: structural. Add a `tripShift.timeBeforeServiceDay` error in `buildTripShiftPreview`, and a non-negative-time check in `validateTrip`. 1–2 files plus tests.
- User decision required: no

### 2-003: Anchored regeneration for `segmentStart` and `blendSegments` silently picks one of several valid departures (code side of 1-005)

- Severity: S2
- Category: contract
- Location: `src/domain/trips.ts:280-285` (segmentStart), `src/domain/trips.ts:291-306` (blend)
- Governing source: OV-TRIP-03: the domain "rejects missing or ambiguous solutions". D0031-04: when a later anchor "resolves to multiple departures, the review dialog identifies the affected trip, fixed timepoint, and reason".
- Evidence: `p2-trips.golden.test.ts`, two "DEFECT 2-003" tests.
  - `segmentStart`, bands a [0:00, 1:00) 600 s and b [1:00, 2:00) 300 s, anchor 1:05 at the last point. Departures 0:55 (band a) and 1:00 (band b) both reproduce the anchor. With saved departure 0:58:20, the result is 1:00. With saved departure 0:55:50, the result is 0:55. No error is raised and no `bandSelection` is returned.
  - With the same bands, `singleBand` raises `trip.anchorAmbiguous`.
  - `blendSegments`: departures 0:59:59 and 1:00:00 both round to 1:05:00; 0:59:59 is chosen silently.
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural; 1 file plus tests. When `matches.length > 1`, throw `AnchorBandChoiceError`/`trip.anchorAmbiguous`, offering the candidate departures.
- User decision required: yes. This is the same question as 1-005 (already recorded by Phase 1): (a) reject and report multiple solutions, or (b) keep nearest-to-saved. Phase 2 recommends (a). Both governing sources say to reject, and single-band already does.

### 2-004: Removing a Pattern point under `segmentStart` marks Trips current even though their times no longer match the profile

- Severity: S2
- Category: correctness
- Location: `src/domain/safeRouteEditing.ts:242-264` (merge sums segments within each band), `src/domain/safeRouteEditing.ts:267-289` (stamps the new revision unconditionally); caller `src/application/routeDefinitionService.ts:926-940`
- Governing source: overview Runtime Model (`architecture_overview.md:206`) and DS-15: Trips "record the profile and revision used for their current times"; D0030-03: stale "when the current profile cannot reproduce" the times. D0014-06 (merge rule) predates `segmentStart` (D0033).
- Evidence: `p2-routeedit-copy.golden.test.ts` "DEFECT 2-004". Profile bands AM [0:00, 1:00) [600, 600] and PM [1:00, 2:00) [1200, 1200]. Trip A–B–C [0:50, 1:00, 1:20] at revision 3. Removing B gives profile revision 4 with bands [1200] and [2400]. The Trip becomes [0:50, 1:20] with `calculationSource.runtimeCalculationRevision = 4`, but the profile now produces [0:50, 1:10]. `listStaleTrips` (`tripGenerationService.ts:568-569`) compares revisions only, so the Trip is not flagged. The saved 1:20 used the PM band for B→C; the merged segment uses only the start band.
- Confidence: Confirmed (domain reproduced; the stale query was traced, not executed)
- Verified by: orchestrator
- Fix scope: structural; 1 file plus a test. After rebalancing, keep the Trip's previous revision unless `propagatePatternTimes` reproduces its times.
- User decision required: no. Phase 1 may note that D0014-06 needs an addendum for segment-start profiles.

### 2-005: A deterministic route edit clears the stale state of a Trip that was already stale

- Severity: S2
- Category: correctness
- Location: `src/domain/safeRouteEditing.ts:276-287`
- Governing source: D0030-01, DS-15, and GL-05 (stale runtime source "is a review condition, not an automatic schedule mutation").
- Evidence: `p2-routeedit-copy.golden.test.ts` "DEFECT 2-005". A Trip at revision 1 against a profile at revision 3 is stale. After a point insertion, it carries the rebalanced profile's revision 4, and its times still differ from the profile's output. This applies to every calculation method.
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural; same fix as 2-004 (advance the revision only when the Trip's revision equaled the profile's revision before the edit and the times reproduce). 1 file.
- User decision required: no

### 2-006: Legacy explicit-time deadheads and pull-outs are not checked against their placement

- Severity: S3 (legacy and imported data only; new edits are relative)
- Category: correctness
- Location: `src/domain/blocking.ts:66,107,110,118` (`summarizeBlock` uses only the explicit duration and pull-out start)
- Governing source: D0020-14: usable layover "subject to explicit deadhead placement and Node-continuity validation". OV-BLK-05 lists overlapping activities among the reported findings.
- Evidence: `p2-blocking.golden.test.ts`.
  - S14: a deadhead at 9:00–9:10 between Trips ending 7:00 and starting 7:30 is reported valid, with 20 minutes of layover and the Block eligible.
  - S16: a pull-out at 6:30–6:40 before a Trip that departs 6:00 gives Platform hours of 1.0, no finding, and an eligible Block. Platform hours are understated relative to the Trip and boundary span.
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural; 1 file. Report `block.deadheadDoesNotFit` (or a new placement rule) when explicit times fall outside [previous end, next start], and a boundary-overlap finding when the pull-out ends after the first start or the pull-in starts before the last end.
- User decision required: no

### 2-007: At an exact gap midpoint, `segmentStart` picks the earlier band while the blend fallback picks the later band

- Severity: S3
- Category: contract
- Location: `src/domain/runtime.ts:162-170` (tie keeps the earlier band); compare `runtime.ts:196-214` (blend evaluates `time + 1e-7`)
- Governing source: D0033-01: "At a gap or beyond the outer bands, use the nearest band, matching the prior blend's fallback."
- Evidence: `p2-time-runtime.golden.test.ts` "DEFECT 2-007". MID ends 15:00 and PM starts 16:00. A segment starting at 15:30 uses MID under `segmentStart` and PM under the blend.
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural, one comparison (`<=` on ties), or a docs note stating the tie rule. 1 file.
- User decision required: no (exact-second edge case; either rule is acceptable once documented)

### 2-008: Half-second decimal-minute runtime entries round inconsistently

- Severity: S3
- Category: correctness
- Location: `src/domain/durations.ts:48-51` (`Math.round(minutes * 60)`)
- Governing source: OV-RT-02 / D0010-06 (decimal minutes convert "into integer seconds"). No tie rule is documented.
- Evidence: `p2-time-runtime.golden.test.ts` "DEFECT 2-008". `0.025` (1.5 s) parses to 2, but `1.025` (61.5 s) parses to 61 and `4.225` (253.5 s) to 253. An exhaustive scan of the 200,000 inputs of the form (2j+1)/40 found 4,369 that round down. The cause is binary multiplication (1.025 × 60 = 61.49999999999999).
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural; 1 file. Round the decimal string exactly (for example, reuse the decimal approach in `roundCostingDisplay`). The effect is at most 1 s per segment.
- User decision required: no

### 2-009: The direction-order conflict message does not name the Direction

- Severity: S3
- Category: contract
- Location: `src/domain/safeRouteEditing.ts:161`; shown through `src/application/routeDefinitionService.ts:948`
- Governing source: D0014-04: the message "names the Direction, Patterns, and timepoints."
- Evidence: `p2-routeedit-copy.golden.test.ts` "DEFECT 2-009". The conflict object has `directionName: 'Outbound'`, but `message` ("Forward and Backward place Node A and Node B in conflicting order…") does not contain it.
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural; 1 line.
- User decision required: no

### 2-010: A zero-second Trip shift is accepted and marks Trips as manually time-changed

- Severity: S3 (the Shift drawer discards net-zero shifts at `src/ui/App.tsx:1010`)
- Category: contract
- Location: `src/domain/tripShift.ts:39`, `src/domain/trips.ts:422-430`
- Governing source: D0008-01 (shift stored as a signed net value; manual edits recorded in `manuallyChangedFields`). A net-zero change is not a manual edit. OV-TRIP-03 relies on manual-change flags for recalculation confirmation.
- Evidence: `p2-trips.golden.test.ts` "DEFECT 2-010": offset 0 gives `findings: []` and `manuallyChangedFields: ['times']`.
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural; 1 file (reject or no-op offset 0).
- User decision required: no

### 2-011: Renaming a runtime band label increments the calculation revision and marks Trips stale

- Severity: S3
- Category: contract
- Location: `src/domain/runtime.ts:105-114` (`calculationShape` includes `label` and band `id`)
- Governing source: GL-03: the revision "increments when those calculation inputs change and remains unchanged when only the profile name changes". OV-RT-03 and DS-12 name band bounds and segment values as the triggers. A band label is not a calculation input.
- Evidence: `p2-time-runtime.golden.test.ts` "DEFECT 2-011": revision 4 becomes 5 when only `label` changes.
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural; 1 file (drop `label` from the shape). The documents do not mention band labels explicitly; Phase 1 may clarify.
- User decision required: no

### 2-012: Pattern distance has no "missing" state, so un-entered mileage is reported as complete 0 miles

- Severity: S3 (miles are not costed)
- Category: contract
- Location: `src/domain/types.ts:15` (`cumulativeMiles` required), `src/domain/commands.ts:4` (defaults to 0), `src/domain/blocking.ts:65`
- Governing source: D0020-17: revenue miles are "the sum of complete revenue Pattern distances". D0020-20: "missing mileage remains incomplete and is never treated as zero". OV-COST-01: revenue miles "when distances are complete".
- Evidence: `p2-blocking.golden.test.ts` "DEFECT 2-012 S15". A Pattern with every point at 0 miles gives `revenueMiles 0` and `complete true`.
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural (schema-level). The data model needs an "unknown" distance, or a rule that a zero-length Pattern is incomplete. 2–4 files.
- User decision required: yes. Question: is a Pattern total of 0 miles "missing" or a valid distance? Options: (a) treat a zero total Pattern distance as incomplete (small fix, no schema change); (b) add an explicit unknown-distance state (schema change). Recommendation: (a).

### 2-013: Per-day hour totals are accumulated in floating hours and can break the half-away-from-zero tie rule

- Severity: S3
- Category: correctness
- Location: `src/domain/costing.ts:424-425` (sums `summary.revenueHours` per Block); `src/domain/blocking.ts:125` (per-Block hours = seconds/3600)
- Governing source: PL05-05/PL05-06: "Keep full numeric precision through all calculations and totals … exact half-unit ties rounded away from zero". The workspace shows hours as whole numbers (A-006 resolution).
- Evidence: `p2-costing-golden.golden.test.ts` "DEFECT 2-013". 17 Blocks whose integer-second Revenue time totals exactly 266:30:00 give `revenueHoursPerDay = 266.49999999999994`. `roundCostingDisplay(…, 0)` returns 266, where 267 is expected. On the golden data, the drift is at most 7.4e-14 h and changes no 4-decimal CSV value (a 4-decimal tie in hours cannot occur for integer seconds).
- Confidence: Confirmed (reproduced)
- Verified by: orchestrator
- Fix scope: structural; 1–2 files. Accumulate integer seconds per day and divide once.
- User decision required: no

### 2-014: Domain ID generation and two timestamp paths are not injectable

- Severity: S3
- Category: layering
- Location: `src/domain/ids.ts:2` (`globalThis.crypto.randomUUID`, fallback `Date.now()`/`Math.random()`); `src/domain/trips.ts:464` (`adjustBlockReferences` calls `withUpdatedAt` with no `now`); `src/domain/blocking.ts:55` (`planBulkBoundaryActivities`, same); wall-clock `now = new Date().toISOString()` defaults in about 40 domain signatures
- Governing source: overview "Domain logic is independent … pure TypeScript wherever practical"; plan task 2.12 criterion ("randomness without injection").
- Evidence: trace (lines quoted above). No domain module imports React, Dexie, or browser components. `buildTripCopyPreview(…, now)` passes `now`, but its adjusted Blocks receive the wall-clock `updatedAt` through `adjustBlockReferences`.
- Confidence: Confirmed (code trace)
- Verified by: orchestrator
- Fix scope: structural; thread `now` through the two functions (2 files). ID injection is optional.
- User decision required: no

### 2-015: Costing findings and Blocking rejections do not use the `ValidationFinding` shape (code side of 1-016)

- Severity: S3
- Category: contract
- Location: `src/domain/costing.ts:40-45` (`CostingFinding { code, severity, entityId?, serviceDayId? }`); `src/domain/blocking.ts:10,28,38,40,97,236-240` (formatted-string `Error`s for structural rejections); `src/domain/validation.ts:76` (legacy `validateBlock`, exported and unused, with the same name as `blocking.ts:246`)
- Governing source: OV-VAL-01: "Each finding includes a rule identifier, severity, entity reference, message parameters…"; DS-25 (shape); overview Validation: "Validation returns structured findings rather than formatted strings."
- Evidence: trace. `CostingFinding` has no `ruleId`, `entityType`, `messageKey`, or `parameters`, and global findings such as `costing.rateMissing` carry no entity reference. `applyTripAssignment` throws "Trip is outside the Blocking Scenario service context." `assertStructurallyValidBlock` throws joined message keys. `grep` finds no importer of `validation.ts` `validateBlock`.
- Confidence: Confirmed (code trace)
- Verified by: orchestrator
- Fix scope: structural; 2–3 files (map `CostingFinding` to `ValidationFinding`, throw a typed error carrying findings, delete the dead legacy function). Phase 1 owns the documentation side (1-016, including the missing acknowledgment field).
- User decision required: no

## 3. Areas examined with no defects found

- `parseServiceTime` / `formatServiceTime`: 17 parse cases, 10 rejection cases, and format/negative/fractional handling.
- `resolveRuntimeForDeparture`, `selectRuntimeBand`, `validateRuntimeProfile` (overlap, zero-length band, segment count, method), `copyRuntimeProfile`, and `reverseCopyRuntimeProfile` (existing tests plus the boundary matrix).
- Single-band anchor rules (D0031-02): exact band, 600/601 s limit, tie, ambiguity, and manual choice.
- `calculateRecalculationConnections` (D0031-07): relative and legacy deadhead, layover unavailable without a deadhead, and newly negative gap warning.
- `calculateRecalculationImpact` (D0030-04).
- `reconcileDirectionTimetable`: loops, short-turn, offset, column-ID stability, and cycle detection (except 2-009).
- `classifyPatternEdit`: reorder, insertion/removal, and full replacement.
- `rebalanceRuntimeProfile`: zero-minute insertion, consecutive insertions, and removal merge (correct for `singleBand`; see 2-004 for `segmentStart`).
- `buildRuntimeCopyPreview`, `buildTripCopyPreview`, and `buildBatchPatternChangePreview` (code read).
- `summarizeBlock` and `summarizeBlockingScenario`: all 16 shapes. Running, Revenue, Layover, Deadhead, and Platform hours match hand computation. Status/validity mapping matches D0020-10 and D0026-07.
- `classifyBlockingInsertion` (existing tests plus a code read) and `applyTripAssignment`: duplicate, cross-route, and cross-profile rejection.
- `calculateCosting`, `evaluateBlockEligibility` (PL05-03/04), and `roundCostingDisplay`: rules listed in 2.9.
- `serviceDays.ts`: canonical order and default counts (260/52/52/0 = 364).
- `patterns.ts`: segment miles, reverse, duplicate, and validation.
- `project.ts` was examined only for numeric content. Its duplication and remap paths belong to Phase 3 (task 3.4, A-004), so they are not re-reported here.

### Module verdict table (every non-test file in `src/domain`)

| Module | Verdict |
| --- | --- |
| `blocking.ts` | Defects 2-006, 2-014 (timestamp), 2-015 (string errors); calculations otherwise verified on 16 shapes and the golden data |
| `commands.ts` | No defects in behavior. Duplicates `normalizePattern` from `patterns.ts`. Its default `cumulativeMiles = 0` is part of 2-012 |
| `costing.ts` | Defects 2-013 and 2-015; every PL05 numeric rule passes |
| `directions.ts` | No defects found (mapping, ordering, validation) |
| `durations.ts` | Defect 2-008 |
| `ids.ts` | Defect 2-014 |
| `patterns.ts` | No defects found |
| `project.ts` | Numeric content only; remap paths deferred to Phase 3 (A-004) |
| `runtime.ts` | Defects 2-007 and 2-011; A-007 closed by the boundary matrix |
| `safeRouteEditing.ts` | Defects 2-004, 2-005, 2-009 |
| `serviceDayCopy.ts` | No defects found |
| `serviceDays.ts` | No defects found |
| `time.ts` | No defects found (no maximum hour, as Decision 0002 defers it) |
| `tripShift.ts` | Defects 2-002 and 2-010 |
| `trips.ts` | Defects 2-001, 2-002, 2-003, 2-014 |
| `types.ts` | Type for 2-012 (`cumulativeMiles` cannot express "missing") |
| `validation.ts` | Dead legacy `validateBlock` (part of 2-015); the other functions have no defects |

## 4. Delegated claims rejected on verification

None. No work was delegated (the Agent tool was unavailable). Phase A leads that were closed after verification:

| Lead | Source | Result |
| --- | --- | --- |
| "Trip copy keeps the source day's `calculationSource`" is a defect | phase-A.md §5 | Rejected as a defect. D0017-07 requires provenance to be preserved, and `listStaleTrips` compares the source with the target Day's assignment, so copied Trips are flagged stale when their target profile differs. |
| Mirrored-Pattern Trip-count asymmetry (L-22) | phase-A.md §5 | Not a domain defect. All 984 Trips reproduce from their assigned profiles, and the asymmetry is present in the trip-trace source rows. |

## 5. Leads handed to later phases

| Lead | Owner |
| --- | --- |
| 2-002 consequence: check whether a staged Shift below 0:00 crashes the Trips view (`App.tsx:1402` → `formatServiceTime` throws; no error boundary). If the state persists and cannot be recovered, raise the severity. | Phase 5 |
| Staged-Shift undo/redo stack and net-zero discard (`App.tsx:979-1010`) are UI-only and have no unit test (A-001 also blocks their browser test). | Phase 5 |
| D0031-06 signed change display values (regenerated minus saved, `0:00` for no change) are computed in the UI; not covered here. | Phase 5 |
| `BlockingWorkspace.tsx:79-81` formats hours and miles with `toFixed(2)` (binary rounding). Costing uses half-away-from-zero (`roundCostingDisplay`). The two workspaces can display the same quantity with different rounding. | Phase 5 |
| `listStaleTrips` (`tripGenerationService.ts:549-590`, Decision 0030 inference) has no test against `segmentStart` profiles, and it is the path through which 2-004 and 2-005 become invisible. | Phase 4 |
| Trip-table CSV import and backup import should reject negative or non-integer stop times (Decision 0002), because `validateTrip` does not check them (2-002). | Phase 3 |
| D0014-06 (merge on point removal) predates `segmentStart`; an addendum is needed whichever fix is chosen for 2-004. Band-label revision wording (2-011). | Phase 1 |

## 6. User decisions required

1. 2-003 / 1-005: segmentStart (and blend) anchors with several valid departures. Options: (a) reject and list candidates, matching single-band behavior and OV-TRIP-03/D0031-04; (b) keep nearest-to-saved and document it. Recommendation: (a).
2. 2-012: does a 0-mile Pattern mean "distance missing"? Options: (a) treat a zero total as incomplete (no schema change); (b) add an explicit unknown-distance state. Recommendation: (a).

## 7. Gate

Exit criteria are met.

- Every domain module has an explicit verdict (Section 3 table).
- Every numeric rule in the catalogue for these modules (D0002, D0010-02/06, D0014-04..06, D0017, D0020-12..20, D0022-01..06, D0023-02..04, D0026-05..07, D0031-02/04/07, D0033-01/04, OV-RT-02..09, PL05-03..07, DS-12/22) has a passing test, or a `DEFECT` test documenting the violation.
- The golden-dataset reconciliation is complete. It used an independent integer-second recomputation and found zero difference above 7.4e-14 h.

Counts: S0 0, S1 0, S2 5 (2-001 to 2-005), S3 10 (2-006 to 2-015). Recommended next package: a structural fix package for 2-001 to 2-005 and 2-013, assigned to Luna (pure domain calculations with explicit acceptance criteria), after the user answers decision 1.
