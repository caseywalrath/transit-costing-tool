# Code Review Master Plan

- Status: Draft for user approval (Stage 1 deliverable)
- Date: 2026-10-22
- Review baseline: `main` at `baed9f1` (merge of PR #12, Trips interchange and regeneration undo)
- Plan location: `docs/review/code-review-plan.md` on branch `claude/upbeat-ritchie-51mpy5`

## 1. Purpose and overall structure

This plan governs a complete code review of the Transit Costing Tool. The review has four stages:

| Stage | Name | Output | Owner |
| --- | --- | --- | --- |
| 1 | Develop review plan | This document | Primary agent (complete) |
| 2 | Phased, targeted code analysis | One verified findings file per phase | One orchestrator per phase |
| 3 | Issue identification and review | Consolidated, de-duplicated, severity-ranked issue register and fix packages | Review lead (primary agent) plus an independent verifier |
| 4 | Issue resolution | Fixed code, tests, and documentation, delivered in gated packages | Package agents under the repository's normal package rules |

Stage 2 is organized into seven phases (A and 1–6). Each phase has its own orchestrating agent. Orchestrators delegate sub-tasks to Sonnet and Haiku as described in Section 4, follow this plan, and report against the exit criteria in their phase.

The review is analytical through Stages 2 and 3. No application source file is modified until Stage 4, except where Phase A explicitly permits test-harness repair (Section 7, Phase A).

## 2. Governing documents and how the review treats them

The review reads these documents as the specification of intended behavior:

| Document | Role in the review |
| --- | --- |
| `AGENTS.md` | Repository working rules. Applies to every agent. |
| `codex.md` | Project guide, user context, documentation map, current status claims. |
| `architecture_overview.md` | Layer boundaries, domain model, persistence rules, capacity targets. Primary contract. |
| `docs/domain-glossary.md` | Canonical terminology. Findings must use these terms. |
| `docs/data-schema.md` | Entity shapes, IndexedDB tables, transactions, backup and CSV schema. |
| `docs/ui-conventions.md` | Accepted UI patterns. Primary contract for Phase 5. |
| `docs/decisions/0001`–`0035` | Accepted decisions. A later decision overrides an earlier one only where it says so. |
| `docs/implementation/*.md` | Phase plans, acceptance criteria, and closeout claims. |

Rules for interpreting them:

1. **Documents are claims, not evidence.** A closeout that says "passed" is an unverified claim until an agent re-runs the check at the review baseline. Section 3 shows that at least one such claim no longer holds.
2. **Decision precedence.** When two documents conflict, the most recent accepted decision record wins over plans and the overview. Superseded decisions (0004, 0008, 0009, parts of 0003, 0020, 0032) are reviewed only where compatibility code still depends on them.
3. **Conflicts are findings.** A document-versus-document or document-versus-code conflict is recorded as a finding. The orchestrator does not decide which side is correct when the answer changes product behavior; it flags it as a user decision (Section 8.4).
4. **Historical material is out of scope** except where code still executes it. Phase 2 generation-set plans and closeouts are not reviewed for their own sake.

`AGENTS.md` instructions that refer to Codex tooling apply to this review as follows:

- "Use `apply_patch`" means "use the agent's file-edit tool." No agent may rewrite files through shell redirection or bulk `sed` on source files.
- "Use subagents only when the user requests delegation" is satisfied: the user requested phase orchestrators that delegate to Sonnet and Haiku.
- Luna/Sol model recommendations remain the rule for Stage 4 work-package classification (structural vs. UI/UX). They do not constrain which Claude models run Stage 2 analysis.
- "Do not commit, push, publish, or create a pull request unless requested" applies. Stage 2 and 3 orchestrators commit only their findings files to the review branch. No PRs are created without user instruction.

## 3. Verified baseline (2026-10-22, `baed9f1`)

The primary agent ran these checks before writing the plan. Orchestrators must not re-litigate them, but Phase A re-runs them as the formal baseline.

| Check | Command | Result |
| --- | --- | --- |
| Dependency install | `pnpm install --frozen-lockfile` | Pass |
| Typecheck | `pnpm typecheck` | Pass |
| Unit tests | `pnpm test` | Pass: 29 files, 205 tests |
| Production build | `pnpm build` | Pass. Single JS chunk 764.55 kB (210 kB gzip); Vite 500 kB warning |
| Browser tests, default config | `pnpm test:ui` | 21 of 21 fail to launch. Resolved `@playwright/test` expects Chromium build 1243; the container provides build 1194 at `/opt/pw-browsers/chromium`. Environment issue, not an application defect. |
| Browser tests, preinstalled Chromium | Temporary config adding `launchOptions.executablePath: '/opt/pw-browsers/chromium'` (not committed) | 14 pass, **7 fail** |

The 7 browser failures are real test-suite defects at the baseline:

- 6 failures in `tests/ui/unified-action-layer.spec.ts` share one cause. The helper at line 64 expects the Trip Actions menu item `Copy from day…`; `src/ui/App.tsx:1162` renders `Copy Trips from day…`. The menu label changed without the test being updated. These six tests (Build Trips drawer, regeneration preview, undo across reload, scroll restoration after shift, staged Shift, shift-click range) therefore provide **no current coverage**.
- 1 failure in `tests/ui/trip-table-layout.spec.ts:40` ("keeps schedule headers sticky while scrolling the schedule viewport"). The test name describes a nested schedule viewport. Decision 0035 item 5 requires page-level scrolling with a fixed duplicate header and forbids a nested vertical scroll area. The test and the decision disagree; Phase 5 must determine whether the test, the code, or both are wrong.

The `phase-02r-trip-table-interchange-undo.md` closeout states "Trips browser checks passed, including sticky headers, undo across reload, and shift scroll restoration." That claim does not reproduce at the merged baseline.

## 4. Operating model

### 4.1 Roles

| Role | Model | Responsibilities | May not |
| --- | --- | --- | --- |
| Review lead | Primary agent (Opus-class) | Owns this plan, launches phase orchestrators, runs Stage 3 consolidation, presents gates to the user. | Start Stage 4 without user approval. |
| Phase orchestrator | Opus-class | Decomposes its phase into sub-tasks, delegates, verifies every delegated claim, writes the phase findings file. | Accept a delegated finding without verification. Edit application source. Expand scope into another phase's files without recording a hand-off. |
| Analyst | Sonnet | Reads code deeply, traces data flows, writes and runs throwaway reproduction tests, proposes root causes. | Assign final severity. Report a finding without file:line evidence. |
| Sweeper | Haiku | Mechanical inventories: grep sweeps, string and label extraction, doc cross-reference tables, import graphs, counting, listing exported symbols, diffing two method lists. | Report findings. Haiku output is raw input to an orchestrator or Sonnet analyst, never a finding by itself. |

### 4.2 Delegation rules

1. **Use Haiku for "list everything that matches X".** Use Sonnet for "explain why X is or is not correct." Use the orchestrator for "decide whether X is a defect and how bad."
2. **Each sub-task brief must state:** the exact files or symbols in scope, the governing document sections, the question to answer, the required output format (Section 5), and an explicit instruction that "no issue found" must be justified with what was checked.
3. **Batch Haiku work.** One Haiku sweep should produce a complete inventory for several downstream Sonnet tasks. Do not spawn Haiku per file.
4. **Cap fan-out.** An orchestrator runs at most 6 concurrent sub-agents. Large files (`src/ui/App.tsx` is 1,800 lines and 248 KB, with 81 lines over 400 characters) must be split by line range or component, not given whole to one agent.
5. **Reproductions live in the scratchpad.** Throwaway tests and scripts go in a scratch directory or a `review/` test path that is deleted or kept only on the review branch. They must not modify `src/`.

### 4.3 Required orchestrator posture: blunt and skeptical

Every orchestrator brief must include these rules verbatim:

> - Assume the code is wrong until evidence shows otherwise. Assume documentation is out of date until code confirms it.
> - "Looks fine," "appears correct," and "should work" are not acceptable results. State what was checked and how.
> - Every finding requires a file:line reference and one of: a failing test, a reproduction script, a concrete input-to-output trace, or a quoted contradiction between two named sources.
> - Re-verify at least one in three delegated findings yourself, and every S0 or S1 finding. If a delegated claim fails verification, discard it and record that the sub-agent was wrong.
> - Do not soften severity because a fix is easy, or raise it because a fix is hard.
> - Report omissions as findings: an untested acceptance criterion, a missing decision record, or a documented rule with no implementation.
> - Do not propose redesigns. Propose the smallest fix that satisfies the governing document, and flag when the governing document itself is the problem.
> - Do not pad. If a phase finds nothing in an area, say "No defects found" and list what was examined.

### 4.4 Scheduling and parallelism

```text
Wave 0   Phase A  Baseline and harness              (gate: harness trustworthy)
Wave 1   Phase 1  Governance and documentation      ┐
         Phase 2  Domain correctness and edge cases │ parallel; disjoint file ownership
         Phase 3  Persistence and data pipelines    ┘
Wave 2   Phase 4  Application layer and cross-layer contracts  (consumes 2 and 3 outputs)
         Phase 5  UI, UX, and accessibility                    (consumes 1 output)
Wave 3   Phase 6  Performance, build, and delivery
Stage 3  Consolidation, verification, triage
```

Phase 6 may start with Wave 2 if capacity allows; it depends only on Phase A.

### 4.5 File ownership in Stage 2

Ownership prevents duplicate analysis. An orchestrator may read any file but reports findings only for its owned files, or records a hand-off note for the owner.

| Phase | Primary owned paths |
| --- | --- |
| A | `playwright.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tests/fixtures/`, test inventory |
| 1 | `*.md` at root, `docs/**` |
| 2 | `src/domain/**` |
| 3 | `src/persistence/**`, `src/ui/runtimePaste.ts`, `src/ui/tripTableCsv.ts`, `src/ui/csvDownload.ts`, `tools/**`, `output/**` |
| 4 | `src/application/**`, `src/main.tsx`, layer boundaries across all of `src/` |
| 5 | `src/ui/*.tsx`, `src/styles.css`, `tests/ui/**` |
| 6 | `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `.github/**`, `index.html`, cross-cutting performance |

## 5. Finding format and severity

### 5.1 Finding record

Each phase writes `docs/review/findings/phase-<id>.md`. Each finding uses this template:

```markdown
### <PHASE>-<NNN>: <one-line claim>

- Severity: S0 | S1 | S2 | S3
- Category: correctness | data-integrity | migration | pipeline | contract | layering | ux | a11y | performance | test-gap | docs | build
- Location: `path/to/file.ts:123` (plus related locations)
- Governing source: <decision/plan/overview section, quoted>
- Evidence: <failing test path, reproduction steps, or input -> actual output vs expected output>
- Confidence: Confirmed (reproduced) | Probable (traced, not executed) | Suspected (needs Stage 3 verification)
- Verified by: <orchestrator | Sonnet analyst | independent re-check>
- Fix scope: structural | UI | docs | test-only ; estimated files touched
- User decision required: yes/no (if yes, state the question and both options)
```

### 5.2 Severity rubric

| Level | Definition | Examples in this product |
| --- | --- | --- |
| S0 | Silent data loss or corruption; unrecoverable state. | Migration drops Trips; backup restore loses Blocks; a cascade deletes records outside its scope; a non-atomic write leaves orphaned references. |
| S1 | Wrong planning numbers or a broken primary workflow with no workaround. | Incorrect Revenue Hours, layover, or annual cost; runtime band selected incorrectly at a boundary; regeneration writes wrong times; a Save that silently fails. |
| S2 | Contract violation, inconsistent behavior, or a defect with a workaround. | Layer-boundary violation; stale-review check missing on one path; misleading UI state after selection changes; test that passes for the wrong reason. |
| S3 | Maintainability, documentation drift, or polish without behavior impact. | Dead code; stale doc status; unused dependency; naming inconsistency. |

Severity is about consequence to a planner's data and numbers, not about code style.

## 6. Seed list from the Stage 1 document review

The primary agent found these during Stage 1. They are leads, not confirmed findings. The owning phase must confirm, reject, or reclassify each one with evidence.

| ID | Lead | Owner |
| --- | --- | --- |
| L-01 | 6 browser tests fail on a stale `Copy from day…` label; one sticky-header test contradicts Decision 0035. The interchange closeout's "passed" claim does not reproduce. | A, 5 |
| L-02 | `architecture_overview.md` (Trip Generation Model) says "The schedule table scrolls within a bounded viewport with sticky headers"; Decision 0035 item 5 forbids a nested vertical scroll area. | 1, 5 |
| L-03 | `schedule-development-roadmap.md` "Confirmed constraints" still states that one departure selects one band for the complete trip and that directions are user-defined. Decisions 0011, 0033, and 0035 replace both. | 1 |
| L-04 | Decision 0003 is not marked as superseded for band selection by 0033/0035. Decision 0020 is not annotated as partly superseded by 0022, 0023, and 0026. Decision 0025 status still says "implementation in progress". Decision 0035 has no Status or Date line. Decision 0005 boundary rule still says "return it to a Terra package". | 1 |
| L-05 | Decision 0010 allows a Last Trip or a Number of Trips limit; `architecture_overview.md` describes only an inclusive Last Trip. A Playwright test name mentions count limits. | 1, 2 |
| L-06 | `codex.md` repeats its Phase 3R/4/5 status paragraph, and still says the repository "may not yet have Git initialized." | 1 |
| L-07 | Phase 5 Package 5C user review and Package 5D are open per `codex.md` and `phase-05-costing.md`. Package 5D is defined as "cross-layer audit, docs, regression verification." This review overlaps 5D substantially. | Review lead (user decision) |
| L-08 | `zod` and `@tanstack/react-table` are declared dependencies but no file in `src/` imports either. The overview says Zod is "reserved for import and migration validation"; backup import validation is therefore hand-written and must be reviewed with extra care. | 3, 6 |
| L-09 | `src/ui/tripTableCsv.ts` imports `toCsv` from `src/persistence/csv`. The overview states that React does not import persistence serializers. `runtimePaste.ts` and `tripTableCsv.ts` are parsers and serializers placed in the UI layer. | 3, 4 |
| L-10 | UI imports domain functions directly (`validateCostingAssumptions`, `roundCostingDisplay`, `createBlockingScenarioSourceSignature`, `parseServiceTime`). Some may be permitted formatting helpers; others may bypass application ports. | 4 |
| L-11 | `src/ui/App.tsx` contains components with zero JSX usages: `TripScheduleWorkspace`, `DirectionSetup`, `RuntimeWorkspace` (Phase 2 generation-set UI). Their exclusive children are likely also dead. Dead code still references generation-set commands. | 4, 5 |
| L-12 | UI-side time arithmetic and trip ordering exist in `App.tsx` (for example, sorting by `stopTimes[0]` at line 626 and `* 60` / `/ 60` conversions). Ordering rules for interlaced timetables belong to the domain per the overview. Live and dead paths must be separated before judging. | 4 |
| L-13 | `tsconfig.json` `include` covers `src` and two configs only. `tests/ui/*.spec.ts` and `playwright.config.ts` are not typechecked by `pnpm typecheck`. | A, 6 |
| L-14 | No CI workflow runs typecheck, unit tests, or browser tests. `.github/workflows/deploy-pages.yml` builds and deploys every push to `main`. | 6 |
| L-15 | `vitest.config.ts` uses the `node` environment and includes only `src/**/*.test.ts`. There are no component tests; React behavior is covered only by Playwright. | A, 5 |
| L-16 | The Phase 4 closeout records 3 Playwright timeouts in `unified-action-layer.spec.ts`; the interchange closeout records one Blocking timeout. Flakiness was accepted without root cause. | A, 5 |
| L-17 | Two persistence implementations (`dexieRepository.ts`, 486 lines; `inMemoryRepository.ts`, 393 lines) must apply identical cascade, ordering, and transaction semantics (Decision 0029). Unit tests mostly exercise the in-memory implementation. | 3 |
| L-18 | Decision 0019 discards pre-Phase-4 placeholder Blocks during migration and requires the discard count to be reported in migration tests. | 3 |
| L-19 | The regeneration undo store is excluded from backup. Restore-with-replace, scenario deletion, project deletion, and import-as-copy must invalidate or clean it correctly. | 3 |
| L-20 | CSV exports contain user-entered names and labels. Spreadsheet formula injection (`=`, `+`, `-`, `@` prefixes) is not addressed in any document. | 3 |
| L-21 | `AGENTS.md` and `codex.md` describe a Codex workflow and model names (Luna, Sol, Terra). Their applicability to Claude agents is implicit. | 1 |
| L-22 | `output/federal-brt-import/federal-brt-project-backup.json` is a real schema-6 dataset (69 Blocks, four service days). It is the best available golden dataset for costing reconciliation, migration, and performance checks. | A, 2, 3, 6 |

## 7. Stage 2 phases

Each phase lists: mandate, required reading, tasks with delegation, specific suspicions to test, and exit criteria. Task IDs are stable and are referenced in findings.

---

### Phase A — Baseline and test harness (Wave 0)

**Mandate.** Make the evidence tools trustworthy before anyone uses them. Establish the formal baseline. This is the only Stage 2 phase permitted to change files, and only test-harness files.

**Required reading.** `AGENTS.md` Verification; `codex.md`; Decision 0013; `playwright.config.ts`; `vitest.config.ts`; `package.json`.

| ID | Task | Delegate | Method and output |
| --- | --- | --- | --- |
| A1 | Re-run the Section 3 baseline and record exact results. | Haiku | Command outputs, counts, durations. |
| A2 | Make Playwright runnable in this container without changing behavior elsewhere. Preferred: an environment-variable override of `executablePath` in `playwright.config.ts`, or a pinned `@playwright/test` that matches the installed Chromium. Record the verified command in `codex.md` only after it works (per `AGENTS.md`). | Sonnet | Proposed harness diff, verification output. Requires user approval before commit because it changes a repository config. |
| A3 | Run the full browser suite three times serially and three times in parallel. Classify every failure as deterministic, flaky, or environment. | Sonnet | Failure matrix with root cause per test. Confirms or rejects L-01 and L-16. |
| A4 | Inventory tests against acceptance criteria. For every acceptance criterion in phase plans 02R, 02TP, 03, 03R, 04, 05, runtime-table-paste, and trip-table-interchange, list the covering test or "none." | Haiku inventory; Sonnet verification of the mapping | Coverage matrix `docs/review/findings/coverage-matrix.md`. Uncovered criteria become test-gap findings for the owning phase. |
| A5 | Add line coverage reporting for Vitest in a scratch config (not committed). Report per-file coverage for `src/domain`, `src/application`, `src/persistence`. | Haiku | Coverage table. Files under 70% line coverage are flagged to Phases 2–4. |
| A6 | Confirm the Federal BRT backup restores and validates with `tools/validate_federal_brt_backup.mjs`. Produce a reusable load script for Phases 2, 3, and 6. | Sonnet | Script path in scratch; restore result; Block eligibility count (documented as 69). |

**Exit criteria.** Browser suite runs; every failure has a classification; coverage matrix and coverage table exist; golden dataset loads. The review lead reports to the user before Wave 1 starts.

---

### Phase 1 — Governance and documentation consistency (Wave 1)

**Mandate.** Determine whether the documentation set is internally consistent and whether it matches the code. Phases 2–5 depend on knowing which documents are trustworthy.

**Required reading.** Every document in Section 2.

| ID | Task | Delegate | Method and output |
| --- | --- | --- | --- |
| 1.1 | Build a decision-supersession map: for each decision 0001–0035, list status, date, what it supersedes, and what supersedes it (explicit or implicit). | Haiku extraction; Sonnet judgment on implicit supersession | Table. Missing or wrong status lines become findings (L-04). |
| 1.2 | Extract every normative rule ("must," "requires," numbered decision items) from the overview, data schema, and decisions into a rule catalogue with stable IDs. | Haiku | `docs/review/findings/rule-catalogue.md`. Phases 2–5 cite these IDs. |
| 1.3 | Cross-document contradiction sweep. Compare overview, roadmap, glossary, data-schema, ui-conventions, and decisions for conflicting statements. | Sonnet (two analysts split by topic: scheduling/runtime vs. blocking/costing/persistence) | Contradiction list with quotes. Confirms or rejects L-02, L-03, L-05. |
| 1.4 | Status-claim audit. Compare status sections in `codex.md`, `architecture_overview.md`, `phase-05-costing.md`, the roadmap, and closeouts. | Haiku | Inconsistency list (L-06, L-07). |
| 1.5 | Version-claim audit. Verify every stated Dexie version, JSON backup schema version, CSV column list, and table/index definition in docs against `src/persistence/database.ts`, `backup.ts`, and `csv.ts`. | Sonnet | Mismatch list. |
| 1.6 | Glossary conformance. List UI labels and exported type names that use non-glossary terms for glossary concepts. | Haiku sweep; Sonnet filter | Term mismatches that could confuse a planner. S3 unless a label misstates meaning. |
| 1.7 | Agent-instruction applicability. Assess whether `AGENTS.md` and `codex.md` give a non-Codex agent unambiguous instructions (L-21). | Orchestrator | Recommendation only; no edits in Stage 2. |

**Specific suspicions.** L-02 through L-07 and L-21.

**Exit criteria.** Rule catalogue published; every contradiction states which source the code follows; every document rated "current," "partly stale," or "historical."

---

### Phase 2 — Domain correctness and edge cases (Wave 1)

**Mandate.** Prove or disprove that pure domain calculations produce correct planning results, including at boundaries. This phase decides whether the tool's numbers can be trusted.

**Required reading.** Overview sections Runtime Model, Trip Generation Model, Service-Day Model, Blocking Model, Summary and Cost Model; Decisions 0002, 0010, 0011, 0014, 0017, 0020, 0022–0024, 0026, 0027, 0030–0035; `phase-05-costing.md` Pure calculation contract.

| ID | Task | Delegate | Method and output |
| --- | --- | --- | --- |
| 2.1 | Time and duration parsing/formatting (`time.ts`, `durations.ts`). Test: `24:00`, `25:00`, `27:30`, `:MM`, `:MM:SS`, decimal minutes, negative input, `60` minutes, `xx:60`, whitespace, empty, very large hours, rounding of decimal minutes to seconds, round-display rule "exactly 30 seconds rounds up" (Decision 0033). | Sonnet | Table-driven reproduction tests in scratch. |
| 2.2 | Runtime band resolution (`runtime.ts`). For each method (`singleBand`, `segmentStart`, legacy `blendSegments`): half-open boundaries, departure exactly at band end, gaps, before first and after last band, single-band profiles, zero-length bands, overlapping bands, unsorted bands, the 10-minute nearest-band rule and its tie case (Decision 0031), revision increments on method change. | Sonnet (one analyst per method) | Boundary matrix with expected vs. actual. |
| 2.3 | Trip generation (`trips.ts`). Inclusive Last Trip on and off the headway sequence, Number of Trips mode, 500-trip cap, zero or negative headway, first trip after last trip, generation across 24:00, departure in a band gap. | Sonnet | Reproduction tests. |
| 2.4 | Regeneration and anchors (`trips.ts`, Decision 0031). Anchor at first, last, and shared timepoint; anchor unreachable; multiple solutions; blended search; signed change display values; layover-change computation after deadhead; legacy staleness inference (Decision 0030). | Sonnet | Traces and tests. |
| 2.5 | Trip shift and staged shift (`tripShift.ts`). Cumulative shifts, shift below 0:00, undo/redo of staged sequence, net-zero shift. | Sonnet | Tests. |
| 2.6 | Directions and safe route editing (`directions.ts`, `safeRouteEditing.ts`, Decision 0014). Topological column reconciliation with loops and repeated nodes, cycle detection message content, point insertion zero-minute rule, point removal merge, reorder requiring reset, column ID stability. | Sonnet | Tests with loop, short-turn, and offset patterns. |
| 2.7 | Service-day copy (`serviceDayCopy.ts`, Decision 0017). Runtime copy independent vs. shared, target replacement, empty-source clear, Block activity cleanup, source-signature staleness. | Sonnet | Tests. |
| 2.8 | Blocking calculations (`blocking.ts`). Layover, Running Time, Revenue Hours (Decision 0026), Platform Hours, deadhead hours, relative pull-out/pull-in/deadhead resolution, legacy explicit times, both representations present (must be rejected), overlap pair marking, location discontinuity, deadhead longer than gap, empty Blocks, multi-route Blocks, mileage completeness never treating missing as zero. | Sonnet (two analysts: activities/structure and summaries/findings) | Hand-computed expected values for at least 10 Block shapes. |
| 2.9 | Costing (`costing.ts`, `phase-05-costing.md`). Eligibility rules exactly as written; escalation formula including negative escalation and the `> -100%` bound; rate year after base year; zero rate vs. absent rate; 365-day cap and below-365 behavior; zero-count days; rounding half-away-from-zero at 2 and 4 decimals; totals computed before rounding; no-estimate state vs. $0. | Sonnet | Independent re-implementation of the formula in a scratch script; diff against domain output for the golden dataset and synthetic cases. |
| 2.10 | Golden-dataset reconciliation. Load the Federal BRT backup; compute Revenue, Platform, and annual hours per service day with domain functions; compare to the conversion audit and workbook figures stated in `output/federal-brt-import/federal-brt-conversion-audit.md`. | Sonnet | Reconciliation table; any unexplained difference over 0.01 hours is a finding. |
| 2.11 | Validation finding structure (`validation.ts`). Every finding has rule ID, severity, entity reference, and parameters per the overview; errors vs. warnings are classified as documented. | Haiku inventory; Sonnet judgment | Rule list with gaps. |
| 2.12 | Purity check. Confirm no domain module imports React, Dexie, browser globals, `Date.now`, or randomness without injection. | Haiku | Import and global-usage list. |

**Specific suspicions.** Half-open band handling at exact boundaries; floating-point accumulation in blended runtimes and costing; rounding mode differences between display helpers and CSV; L-05.

**Exit criteria.** Every domain module has an explicit verdict; every numeric rule in the rule catalogue for these modules has a passing or failing test; golden-dataset reconciliation complete.

---

### Phase 3 — Persistence, migrations, and data pipelines (Wave 1)

**Mandate.** Determine whether data survives every handoff: database upgrades, backup export and import, import-as-copy, duplication, deletion cascades, CSV interchange, and the Federal BRT conversion tool. Data loss findings from this phase are the highest-priority output of the review.

**Required reading.** Overview Persistence, Backup, and Export; `docs/data-schema.md` in full; Decisions 0001, 0006, 0007, 0009, 0012, 0015, 0016, 0019, 0021, 0022, 0029, 0035; `phase-05-costing.md` Persisted inputs; `runtime-table-paste.md`; `phase-02r-trip-table-interchange-undo.md`; `federal-brt-workbook-conversion.md`.

| ID | Task | Delegate | Method and output |
| --- | --- | --- | --- |
| 3.1 | Dexie migrations v1→v6 (`database.ts`). For each upgrade step: data preserved, indexes added, placeholder-Block discard and its count (L-18), lazy costing assumptions, undo store creation. Run real upgrades in a browser from seeded v1, v3, and v4 databases. | Sonnet | Migration test results per step. |
| 3.2 | Backup schema v1→v6 (`backup.ts`). For each historical version: import succeeds, normalization matches the documented rule (Default Trip profile, direction optionality, discarded placeholder Blocks, absent assumptions). Export → import round-trip of the golden dataset is byte-stable after normalization. | Sonnet | Round-trip diff; per-version fixtures. |
| 3.3 | Import validation strength (L-08). Feed malformed backups: missing references, duplicated IDs, cross-scenario references, wrong types, negative times, out-of-range costing values, extra fields, very large files, prototype keys (`__proto__`). Confirm validation completes before any write. | Sonnet | Fuzz-style case table with result per case. |
| 3.4 | Import-as-copy and duplication remapping. Verify every ID and every foreign key is remapped for project import-as-copy, scenario duplication, route duplication (Decision 0028), Trip profile copy, Blocking Scenario duplication. Search for any reference left pointing at the source graph. | Haiku: list every ID-bearing field in `types.ts`; Sonnet: verify each remap path covers each field | Field-by-path coverage matrix. |
| 3.5 | Deletion cascades. Project, Scenario, Route, Pattern, Runtime profile, Trip profile, Blocking Scenario, Trip. Verify each removes exactly what the decision says, retains what it says to retain (empty Blocks), and runs in one transaction. | Sonnet | Before/after record counts per cascade on the golden dataset. |
| 3.6 | Repository parity (L-17). Compare `dexieRepository.ts` and `inMemoryRepository.ts` method-by-method: ordering, filtering, cascade, error types, transaction scope. Run the existing repository test suite against both implementations if it is not already. | Haiku: method/signature diff; Sonnet: semantic comparison | Parity table; divergences are findings. |
| 3.7 | Transaction atomicity. For each multi-table write listed in the roadmap's "Cross-phase data and transaction requirements," confirm all tables are inside one Dexie transaction. Inject a failure midway (throw in a mocked step) and confirm nothing persists. | Sonnet | Per-operation result. |
| 3.8 | Regeneration undo lifecycle (L-19, Decision 0035). Survives reload, replaced by next recalculation, invalidated by Trip change or deletion, rejected if after-state mismatches, cleaned up on project/scenario deletion and restore, absent from backup. | Sonnet | Test results. |
| 3.9 | CSV interchange. Trips CSV (`tripTableCsv.ts`) and Runtime CSV/paste (`runtimePaste.ts`): round-trip, quoted fields, embedded commas/newlines, CRLF, BOM, 24-plus times, blank IDs, unknown IDs, IDs from another day or profile, omitted rows not deleted, Block references preserved. Blocking and Costing CSVs: column stability, rounding as documented, ZIP packaging. | Sonnet | Round-trip and malformed-input tables. |
| 3.10 | CSV formula injection (L-20). Determine whether user-entered names beginning with `=`, `+`, `-`, `@` are exported unescaped. | Haiku sweep of CSV writers; Sonnet confirmation | Finding with severity recommendation; a fix may require a user decision because escaping changes exported text. |
| 3.11 | Federal BRT tool pipeline (`tools/`). Does the Python converter's output conform to the current schema-6 validator? Are its stated inferences (Saturday pull-ins, Block 29) reflected in the audit and trace? Is the tool's Windows-only command documentation runnable elsewhere? | Sonnet | Pipeline verdict. |
| 3.12 | Visible save status and error mapping (Decision 0012 item 4). Confirm Dexie errors never reach the user with key paths or index names. | Haiku: list all `catch` sites in persistence and application; Sonnet: check mapping | Unmapped error paths. |

**Specific suspicions.** Hand-written import validation (L-08); undo-store cleanup on cascade (L-19); parity between repositories (L-17); duplication paths that copy a new field added after the remap code was written (the backup direction-reference fix in commit `4fc88ba` shows this class of defect has occurred).

**Exit criteria.** Every migration step, backup version, remap path, and cascade has an executed verdict. Any S0 finding is reported to the review lead immediately, without waiting for phase completion.

---

### Phase 4 — Application layer and cross-layer contracts (Wave 2)

**Mandate.** Verify the application services correctly coordinate domain and persistence, and that each layer stays within its boundary. Consumes Phase 2 and 3 findings so it does not re-test domain math or storage.

**Required reading.** Overview Architectural Principles and Logical Layers; Decisions 0005, 0014, 0018, 0025, 0026, 0031, 0035; `src/application/ports.ts`.

| ID | Task | Delegate | Method and output |
| --- | --- | --- | --- |
| 4.1 | Import graph. Produce the module dependency graph for `src/`. Flag: UI → persistence, UI → domain commands, domain → application/persistence, cycles. | Haiku | Graph and violation list (L-09, L-10). |
| 4.2 | Classify each UI → domain import as permitted (pure formatting or parsing for display) or a boundary violation (validation, signatures, calculation, command). | Sonnet | Classified list with rationale citing the overview. |
| 4.3 | Business logic in React. Read `App.tsx`, `BlockingWorkspace.tsx`, and `CostingWorkspace.tsx` by component. List every calculation, ordering rule, eligibility rule, or validation rule implemented in a component (L-12). | Sonnet (split `App.tsx` into at least four line ranges) | Inventory with recommended destination layer. |
| 4.4 | Dead code (L-11). Determine every unreachable component, function, application method, and domain export. Confirm the generation-set UI path is unreachable at runtime. | Haiku: symbol-usage sweep; Sonnet: confirmation | Dead-code list; S3 unless dead code is reachable through a menu or stored state. |
| 4.5 | Preview/commit and stale-source protection. For each destructive or reviewed operation (route edit, recalculation, Trip copy, Runtime copy, staged shift, assignment, unassignment, bulk boundary, Trip CSV import, undo, deletions), confirm the commit re-reads authoritative data and rejects a stale preview. | Sonnet | Operation table: preview function, commit function, signature fields, test that proves rejection. |
| 4.6 | Concurrency within one browser. Two tabs on the same database: does a stale tab overwrite newer data? Is there any `versionchange` handling? | Sonnet | Reproduction in Playwright with two pages. |
| 4.7 | Port completeness. Confirm `ports.ts` contracts match service implementations and that the UI depends only on declared ports. | Haiku diff; Sonnet review | Divergence list. |
| 4.8 | Error handling. Every `catch` in application services and the 96 `catch` sites in `App.tsx`: is the error surfaced, swallowed, or mis-mapped? Is save status correct after a failure? | Haiku inventory; Sonnet review of non-trivial cases | Swallowed-error list. |
| 4.9 | Selection state integrity. Non-authoritative selections (Project, Scenario, Route, Day, Direction, Trip Profile, Blocking Scenario, View year) persisted in `localStorage`: do they fall back safely when the referenced record is deleted, renamed, or belongs to another project (Decision 0021 item 8)? | Sonnet | Scenario table with result. |

**Specific suspicions.** L-09 through L-12; any reviewed operation lacking a stale-rejection test.

**Exit criteria.** Complete import graph; every reviewed operation has a stale-protection verdict; logic-in-UI inventory complete with destinations.

---

### Phase 5 — UI, UX, and accessibility (Wave 2)

**Mandate.** Verify the interface meets `docs/ui-conventions.md`, the UI decisions, and the accessibility requirements in phase plans, and that the browser test suite tests what it claims. Classify every UX finding as "fix within established patterns" (Luna-class) or "requires design judgment" (Sol-class), per `AGENTS.md`.

**Required reading.** `docs/ui-conventions.md`; Decisions 0013, 0018, 0021, 0025, 0026, 0028, 0033, 0034, 0035; UI sections of phase plans 02R, 03R, 04, 05.

| ID | Task | Delegate | Method and output |
| --- | --- | --- | --- |
| 5.1 | Browser test integrity (L-01, L-16). For each spec, does it assert the documented behavior, or the implementation at the time? Identify tests that pass for the wrong reason or are stale. | Sonnet | Per-test verdict. |
| 5.2 | Workspace walkthroughs with the golden dataset: Route, Trips, Blocking, Costing. Capture screenshots at 1440, 1024, and 768 px widths. Compare to ui-conventions. | Sonnet (one per workspace) | Screenshot set and deviations. |
| 5.3 | Keyboard and focus. Every menu, dialog, drawer, and pill: open with keyboard, Escape closes, focus returns to the invoker (Decision 0025 item 9), focus trap in modal dialogs, no focus loss after list reload. | Sonnet | Interaction matrix. |
| 5.4 | Accessible names and roles. Run an automated accessibility scan (axe-core via Playwright, scratch only) on each workspace; manually verify table header associations and `aria-invalid` usage. | Haiku runs scan; Sonnet triages | Violation list, de-duplicated. |
| 5.5 | Discard guards and unsaved state. Route Node/Pattern drafts, Runtime editor draft, staged Shift drawer, Build Trips drawer: switching Project, Scenario, Route, Day, Direction, Profile, or tab with unsaved changes. | Sonnet | Scenario table: guarded, lost silently, or blocked. |
| 5.6 | Trips table behaviors: sticky duplicate header (L-02, Decision 0035), horizontal sync, scroll restoration after shift, Round displayed times, Show headways (Decision 0034 tie and skip rules), band shading only when profile reproduces saved times, warning icons for both Trips in an overlapping pair. | Sonnet | Verdict per behavior with evidence. |
| 5.7 | Destructive-action UX. Every delete and replace shows impact counts from the application layer before confirmation; button text names the action; no destructive action is one click. | Haiku: list destructive actions; Sonnet: verify each | Table. |
| 5.8 | Costing presentation. No-estimate state vs. $0, partial estimate labeling, exclusions visible, column and total alignment, applied rate shown to four decimals, narrow-width usability. | Sonnet | Verdict per `phase-05-costing.md` UI and acceptance criteria 2, 4, 7. |
| 5.9 | User-facing message quality. Extract every user-visible error string (`USER_FACING_VALIDATION_MESSAGES` and inline strings). Flag technical language, missing guidance, or inconsistent terminology. | Haiku extraction; Sonnet review | Message list with recommended rewrite category (not rewrites). |

**Specific suspicions.** Stale tests masking regressions (L-01); sticky header contradiction (L-02); unsaved-draft loss on selector change; focus loss after reloads triggered by `onReload`.

**Exit criteria.** Every browser test has an integrity verdict; every workspace has screenshots and a deviation list; every UX finding is labeled Luna-class or Sol-class.

---

### Phase 6 — Performance, build, and delivery (Wave 3)

**Mandate.** Verify the documented capacity targets and the delivery pipeline.

**Required reading.** Overview Initial Capacity Target and Technology Direction; Decision 0001; `.github/workflows/deploy-pages.yml`; `package.json`; `vite.config.ts`.

| ID | Task | Delegate | Method and output |
| --- | --- | --- | --- |
| 6.1 | Capacity test. Generate a synthetic scenario at the documented targets: 500 Trips per service day, 30 pattern points per pattern, 100 Blocks per service day, four service days. Time generation, recalculation of 500 Trips, timetable render, Block summary calculation, costing calculation, backup export and import. | Sonnet | Timing table. Any interaction over 1 second, or render over 2 seconds, is a finding with profiler evidence. |
| 6.2 | React rendering cost. Profile Trips and Blocking at capacity. Identify full-tree re-renders, missing memoization of derived data, and repeated O(n²) lookups (for example, `flatMap(...).find(...)` inside row renders). | Sonnet | Hot-path list with measured cost. |
| 6.3 | Bundle. 764 kB single chunk. Identify contributors and whether code-splitting by workspace is viable. | Haiku: bundle composition via build stats | Contributor table; S3 unless load time is materially affected. |
| 6.4 | Dependency hygiene (L-08). Unused dependencies, outdated major versions, known advisories (`pnpm audit`), lockfile integrity. | Haiku | List. |
| 6.5 | CI and deployment (L-13, L-14). Absence of test gates before deploy; typecheck scope excluding `tests/`; Node and pnpm version alignment between CI (Node 20, pnpm 10) and local; Pages relative base path with a deep link or reload. | Sonnet | Findings with a proposed minimal CI workflow (proposal only). |
| 6.6 | Storage limits. IndexedDB quota behavior with large projects; behavior when the browser denies persistent storage; whether the app requests `navigator.storage.persist()`. Relates to Decision 0001 data-loss risk. | Sonnet | Verdict. |

**Exit criteria.** Capacity targets measured; CI gap documented with a proposed workflow; dependency list complete.

## 8. Stage 3 — Issue identification and review

Stage 3 converts seven findings files into one decision-ready register. It is run by the review lead with one independent verifier who did not author the findings.

### 8.1 Steps

1. **Collect.** Merge all `docs/review/findings/phase-*.md` into `docs/review/issue-register.md`.
2. **De-duplicate.** Merge findings with the same root cause. Keep all locations. Record merged IDs.
3. **Independent verification.** A Sonnet verifier reproduces every S0 and S1 finding and a random 25% sample of S2 findings from the written evidence alone. A finding that cannot be reproduced from its evidence returns to its phase orchestrator once; if it still fails, it is dropped and the drop is recorded.
4. **Severity calibration.** The review lead re-rates findings across phases on the Section 5.2 rubric so that S1 means the same thing everywhere.
5. **Root-cause grouping.** Group findings that one fix resolves (for example, all logic-in-UI findings in one workspace).
6. **User decisions.** Extract every finding marked "User decision required" into a decision list with options and a recommendation.
7. **Fix packaging.** Define Stage 4 packages (Section 8.3).

### 8.2 Stage 3 outputs

- `docs/review/issue-register.md`: one row per issue with ID, severity, category, title, merged finding IDs, verification result, fix package.
- `docs/review/user-decisions.md`: questions requiring user judgment.
- `docs/review/fix-packages.md`: package definitions.

### 8.3 Fix package rules

Packages follow `AGENTS.md` and Decision 0005:

- Each package is **structural** or **UI/UX**, never both. Structural packages may wire existing UI ports without changing layout or interaction.
- Each package states owned files, acceptance criteria, the verification required by `AGENTS.md` Verification, and the recommended model class (Luna-class or Sol-class).
- Order: S0 data-integrity packages first; then S1 calculation packages; then test-suite repair (so later packages have regression protection); then S2 contract and layering; then S3 cleanup and documentation.
- Documentation drift is fixed in the same package as the related code change where possible, with a final documentation-only package for the remainder.
- Any change in system structure, data flow, persistence, or major behavior updates `architecture_overview.md` and adds a decision record.

### 8.4 Known user-decision candidates

These are expected to require user input. Stage 3 confirms them and adds others.

1. Whether this review replaces Phase 5 Package 5D integration and acceptance (L-07). **Recommendation:** yes; record it in `phase-05-costing.md` after Stage 3.
2. Whether 5C user review is complete (affects whether Costing UI findings are regressions or open package work).
3. Sticky header model: page-level duplicate header (Decision 0035) vs. bounded viewport (overview text and test). **Recommendation:** Decision 0035 governs; fix overview and test.
4. CSV formula-injection handling: prefix escaping changes exported text.
5. Dead generation-set UI: delete, or retain for a documented reason.
6. Adopt Zod for backup validation, or keep hand-written validation and remove the dependency.

## 9. Stage 4 — Issue resolution

Each package runs on its own branch from current `main`, following `codex.md` Repository Workflow.

1. **Test first.** Write a failing test that captures the issue from its register evidence. Commit it with the fix, not separately on `main`.
2. **Minimal fix.** Change only owned files. No opportunistic refactors.
3. **Verify per `AGENTS.md`.** Domain or persistence: focused tests and typecheck. UI: typecheck, relevant Playwright tests, build, and visual inspection. Migration or export: round-trip and schema-version validation.
4. **Full regression.** `pnpm typecheck`, `pnpm test`, the full Playwright suite (with the Phase A harness), and `pnpm build` must pass before the package closes.
5. **Adversarial self-review.** Before requesting review, the package agent re-reads its own diff and states what could still be wrong.
6. **Gate.** Report results and recommend the next package and model. Do not start the next package automatically.

## 10. Efficiency recommendations

The four-stage structure is sound. These changes reduce cost without reducing rigor:

1. **Fix the harness first (Phase A).** Six of seven browser failures share one stale label. Without Phase A, every UI analyst would rediscover this and work from false negatives.
2. **Verify inside Stage 2, not only in Stage 3.** Orchestrators must reproduce S0/S1 findings before reporting. Stage 3 then samples and calibrates instead of re-investigating everything.
3. **Use the Federal BRT backup as the shared golden dataset.** It is real, already schema-6, and has documented expected figures. It replaces most hand-built fixtures for Phases 2, 3, 5, and 6.
4. **Restrict Haiku to inventories.** Haiku output feeds analysts; it never becomes a finding directly. This avoids triaging low-precision claims.
5. **Share the rule catalogue (task 1.2).** Phases 2–5 cite rule IDs instead of re-reading and re-quoting the documents.
6. **Fold Phase 5 Package 5D into this review** (Section 8.4 item 1) rather than running a second cross-layer audit later.
7. **Escalate S0 immediately.** A data-loss finding should reach the user before the rest of the review completes.
8. **Skip superseded history.** Do not review generation-set plans except where compatibility code still runs.

## 11. Actions required from the user

| Action | Why | Expected result |
| --- | --- | --- |
| Approve or amend this plan. | Orchestrators follow it literally. | Stage 2 Wave 0 (Phase A) starts on request. |
| Decide whether Phase A may commit a Playwright harness change (task A2). | It changes a repository config file. | Browser tests run in cloud sessions without a temporary config. |
| Answer Section 8.4 items 1 and 2 when convenient. | They change how Costing findings are classified. | Correct severity and package placement for Costing issues. |
