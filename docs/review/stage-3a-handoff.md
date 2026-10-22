# Stage 3A Handoff Prompt (Consolidation and Verification)

Paste the prompt below into a new session to start Stage 3A. Run that session on an Opus-class model. The session is the review lead and the only orchestrator. It delegates verification to one independent Sonnet verifier. Sub-agents cannot spawn their own sub-agents in this environment.

Stage 3 is split into two sittings (user decision, 2026-10-22):

- **Stage 3A:** plan Section 8.1 steps 1–5 (collect, de-duplicate, independent verification, severity calibration, root-cause grouping). Output: `docs/review/issue-register.md`.
- **Stage 3B:** steps 6–7 (user decisions and fix packaging). Outputs: the consolidated `docs/review/user-decisions.md` and `docs/review/fix-packages.md`. Stage 3B starts in a later session, from a handoff file that Stage 3A writes.

---

Begin Stage 3A of the code review: consolidation and verification. Follow the master plan exactly (`docs/review/code-review-plan.md`, Section 8), as split in `docs/review/stage-3a-handoff.md`.

## Setup

- Repository: `caseywalrath/transit-costing-tool`. Work on branch `claude/upbeat-ritchie-51mpy5`. Fetch it and check it out; do not start from `main`.
- Run `pnpm install --frozen-lockfile`.
- Golden Vitest reproductions: `pnpm exec vitest run --config docs/review/golden/vitest.golden.config.ts [file filter]`.
- Browser reproductions: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test --config docs/review/golden/<pN>-playwright.config.ts [filter]`. The configs are p3 (see its header), p4 (port 4184), p5 (port 4185) and p6 (port 4186). Defect tests use `test.fail()` and `it.fails`, so they report as passing while the defect exists. To confirm a defect, run a temporary copy with the marker removed and delete the copy afterwards.

## Read before doing anything else

1. `AGENTS.md`, then `codex.md` sections "Communication" and "Browser tests…".
2. `docs/review/code-review-plan.md`: Sections 4.3 (posture), 5 (template and rubric), and 8 (Stage 3).
3. `docs/review/user-decisions.md` (decisions 1–18). These are settled; do not re-open them.
4. The findings files `docs/review/findings/phase-A.md` and `phase-1.md` through `phase-6.md`. Read them in full; they total about 250 KB. Use `rule-catalogue.md` and `coverage-matrix.md` only as references.

## Roles and delegation (the user has authorized delegation)

- You are the review lead.
- Use one Sonnet verifier that did not write any finding. Give it a brief of about one page. Include:
  - Section 4.3 posture rules, verbatim.
  - The Section 5.2 rubric.
  - The rule that it must reproduce from the written evidence alone.
  - Write restrictions: no edits to `src/`, `tests/`, `tools/`, root configs, `package.json`, the lockfile, or governing docs. Throwaway copies go in the scratchpad or are deleted.
  - A free browser port of 4187 or higher.
- The verifier reproduces every S0 and S1 finding and a random 25% sample of the S2 findings. Choose the sample with a stated, reproducible method, such as a seeded shuffle of the S2 IDs, and record the seed. Stage 2 totals: 2 S0 (4-001, 4-002), 3 S1 (3-001, 3-002, 3-006), and 46 S2.
- The verifier writes full detail to a scratch report and replies with at most 500 words.
- A finding that cannot be reproduced from its evidence returns to you once. If you cannot repair the evidence, drop the finding and record the drop.
- Report any newly found S0 to the user immediately.

## Steps

1. **Collect.** Create `docs/review/issue-register.md` with one row per finding from every phase.
2. **De-duplicate.** Merge findings that share a root cause, keep every location, and record the merged IDs. Known merges: 6-001 with 4-008; 6-008 with 5-013; 6-009 with L-08 and plan item 8.4-6. Also correct the false `jszip` statement in `phase-4.md` Sections 1 and 6 (see `phase-6.md` Section 5).
3. **Verify.** Run the Sonnet verifier as described above.
4. **Calibrate.** Re-rate every issue on the Section 5.2 rubric so a severity means the same thing in every phase. Record each change of severity and its reason.
5. **Group by root cause.** Group issues that one fix resolves, for example all logic-in-UI findings in one workspace. Steps 6–7 build the packages from these groups.

Register columns (plan Section 8.2): ID, severity, category, title, merged finding IDs, verification result, root-cause group. Leave the "fix package" column empty; Stage 3B fills it. Add a short header that states the operating model, the verification sample and seed, the counts by severity before and after calibration, and the rejected claims.

## Outputs

- `docs/review/issue-register.md`.
- `docs/review/stage-3b-handoff.md`: a prompt for the next session, written in the same format as this file. It must cover:
  - Steps 6–7 of plan Section 8.1.
  - The open user-decision candidates found during Stage 3A.
  - The Section 8.3 package rules.
  - The Luna-class and Sol-class labels from `AGENTS.md`.
  - Package ordering.
- Commit and push both files to `claude/upbeat-ritchie-51mpy5`. Do not create a pull request.

## Gate

Give one report to the user covering:
- issue counts by severity, before and after de-duplication and calibration;
- verification results: reproduced, repaired, and dropped findings;
- the severity changes;
- the root-cause groups;
- new user-decision candidates (not yet decided);
- the tokens used by sub-agents per model.

Do not start Stage 3B.
