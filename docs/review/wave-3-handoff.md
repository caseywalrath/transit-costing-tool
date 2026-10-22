# Wave 3 Handoff Prompt (Stage 2, Phase 6)

Paste the prompt below into a new session to start Wave 3. Run that session on an Opus-class model. Under plan Section 4.6, the session is the review lead and the only orchestrator; it delegates the Phase 6 work to one Sonnet analyst and to Haiku sweeps. Sub-agents cannot spawn their own sub-agents in this environment, so the orchestrator must be the main session.

---

Begin Wave 3 of the code review: Stage 2, Phase 6 (performance, build, and delivery). Follow the master plan exactly, as amended in Section 4.6.

## Setup

- Repository: `caseywalrath/transit-costing-tool`. Work on branch `claude/upbeat-ritchie-51mpy5`. Fetch it and check it out; do not start from `main`.
- Run `pnpm install --frozen-lockfile`.
- Browser tests: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`
- Golden dataset checks: `pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts`
- Phase 4 and 5 browser reproductions: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/p4-playwright.config.ts` (port 4184), and the same command with `p5-playwright.config.ts` (port 4185). Defect tests use `test.fail()` and `it.fails`, so they report as passing while the defect exists.

## Read before doing anything else

1. `AGENTS.md`, `codex.md`, `architecture_overview.md`.
2. `docs/review/code-review-plan.md`. It is the governing plan. Section 4.6 defines the Wave 2–3 operating model. Section 4.3 gives the posture rules, Section 5 the finding template and severity rubric, and Section 7 the Phase 6 task table (6.1–6.6).
3. `docs/review/user-decisions.md`. It holds every user decision so far (items 1–15).
4. `docs/review/findings/phase-A.md`, `phase-1.md` … `phase-5.md`, and `rule-catalogue.md`. Read the headers, task-result tables, and the "Leads handed to other phases" sections. Read individual findings only where a Phase 6 task touches them.

## Roles and delegation (the user has authorized delegation)

- You are the review lead, and the only Opus-class agent.
- Use one Sonnet analyst for the Phase 6 analysis tasks.
- Use Haiku only for inventories: bundle composition (6.3) and the dependency and advisory list (6.4). Haiku output is never a finding.
- Give each sub-agent a short brief of about one page. Include:
  - Section 4.3 posture rules, verbatim.
  - The Section 5.1 template and the Section 5.2 rubric.
  - Write restrictions: no edits to `src/`, `tests/`, `tools/`, configs, `package.json`, the lockfile, or governing docs; reproductions go in the scratchpad or in `docs/review/golden/` with a `p6-` prefix and the `it.fails`/`test.fail` convention.
  - An assigned port of 4186 or higher. Ports 4174, 4184, and 4185 are taken.
  - The relevant rule IDs and leads.
  - Exact file targets.
- The Wave 2 brief in the previous session's scratchpad is not available. Write a new one from these sources.
- Analysts write full detail to a scratch report file and reply with at most 500 words. If the harness refuses report files, the reply is the record.
- Re-verify every S0 and S1 yourself by re-running it. Verify at least one in three of the other findings. Record rejected claims.
- Report any S0 to the user immediately.

## Phase 6 scope and leads to cover

- **6.1 Capacity:** the overview's capacity targets (500 Trips per service day, 30 points per Pattern, 100 Blocks per day, 4 days). Measure generation, recalculation, timetable render, Block summary, costing, and backup export and import. Any interaction over 1 s, or any render over 2 s, is a finding.
- **6.2 Rendering cost:** include Phase 4 finding 4-008. Blocking `classifyInsertion` re-reads every Trip and Pattern once per unassigned Trip, which is 250 reads for 250 candidates. `getBlockSummary` reads the Scenario once per Block. Also cover ScheduleTable's per-row runtime recompute and the O(n²) duplicate-departure check (4-014). Measure wall-clock time at capacity.
- **6.3 Bundle:** a single JS chunk of about 765 kB.
- **6.4 Dependencies:** `zod`, `@tanstack/react-table`, and `jszip` are declared but never imported (Phase 4 task 4.1; lead L-08). Also run `pnpm audit` and check for outdated major versions.
- **6.5 CI and deployment:** L-13 (`tsconfig.json` does not typecheck `tests/ui` or `playwright.config.ts`; A-008 needs `@types/node`); L-14 (no CI test gate before the Pages deploy). Propose a minimal CI workflow as a proposal only.
- **6.6 Storage:** IndexedDB quota and `navigator.storage.persist()`. This connects to Decision 0001 and to the S0 findings 4-001 and 4-002, which make backups the only recovery path.
- **`index.html`:** Phase 5 finding 5-013 found no doctype, so the app renders in quirks mode. Judge the build and delivery side. Measurements taken in quirks mode must be labelled as such.

## Outputs

- `docs/review/findings/phase-6.md`, in the format of `phase-4.md`: a header with operating model and verification, task results, findings, areas with no defects, rejected claims, leads, user decisions, and the gate.
- Commit and push the findings and any `p6-` reproductions to `claude/upbeat-ritchie-51mpy5`. Do not create a pull request.

## Gate

When Phase 6 is complete, give one report to the user covering:
- finding counts by severity;
- S0 and S1 findings with evidence;
- user decisions required, with options and a recommendation;
- rejected delegated claims;
- the tokens used by sub-agents per model;
- readiness for Stage 3, which consolidates every phase into `docs/review/issue-register.md`, `user-decisions.md`, and `fix-packages.md` (plan Section 8).

Do not start Stage 3.

## Known state at handoff (2026-10-22)

- Stage 2 totals so far: Phases A and 1–5 give 2 S0 (4-001, 4-002), 3 S1 (3-001, 3-002, 3-006), and the rest S2/S3. The S0 findings were reported to the user. The interim advice given was: use one tab, reload before editing Service days or renaming a Scenario, and export a backup first.
- An empty stray file, `/pw-golden.config.ts`, may exist at the container root from the previous session. It is not in the repository; ignore it.
