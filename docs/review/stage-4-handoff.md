# Stage 4 Handoff Prompt (Issue Resolution, one sitting per session)

Paste the prompt below into a new session to run one Stage 4 sitting. The same prompt works for every sitting: the session finds its sitting from the fix log. Run the main session on **Sonnet**, except sitting 4K's U08 package, which runs on **Opus** (see `docs/review/fix-packages.md`, "Stage 4 execution plan").

Delegation is authorized as that plan states: one Opus reviewer per S0 or S1 package (P01–P04), and Haiku only for the mechanical edits it names.

---

Run the next sitting of Stage 4 of the code review: issue resolution. Follow `docs/review/code-review-plan.md` Section 9 and `docs/review/fix-packages.md` exactly.

## Setup

- Repository: `caseywalrath/transit-costing-tool`.
- The review documents live only on branch `claude/upbeat-ritchie-51mpy5` (decision C6). Fetch that branch. Read its files with `git show origin/claude/upbeat-ritchie-51mpy5:<path>`, or copy them into your scratchpad. Do not merge it, and do not copy `docs/review/` into your work branch.
- Your work branch is the one this session designates. It must start from current `origin/main`. If it already carries commits that are not on `main`, stop and ask the user.
- Find your sitting:
  - If `docs/implementation/review-fixes.md` does not exist on `origin/main`, this is sitting 4A.
  - Otherwise, read its "Next sitting" note at the top. If the note names a sitting whose prerequisite is not merged into `main`, stop and ask the user.
- Run `pnpm install --frozen-lockfile`.
- Browser tests in this environment: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui`. In sitting 4A, run this only after the Setup step below brings the override to your branch.
- Review reproductions (read-only evidence): check out `docs/review/golden/` from the review branch into your scratchpad if you need to run one. Port the test into `src/**/*.test.ts` or `tests/ui/`; never commit the `docs/review/` copy.

## Read before doing anything else

1. `AGENTS.md`, then `codex.md`.
2. `architecture_overview.md`.
3. From the review branch:
   - `docs/review/fix-packages.md` in full: the rules, the execution plan, and the sections for your sitting's packages.
   - `docs/review/user-decisions.md`: decisions 1–18 and C1–C8, all settled. Do not re-open them.
   - The rows of `docs/review/issue-register.md` for your packages.
   - For each issue, its finding section in `docs/review/findings/phase-*.md`, which gives Location, Evidence, and Governing source.
4. The decision records and implementation plans that your packages' acceptance criteria cite.

## How to run each package

Work through your sitting's packages in the order the sitting table gives. For each package:

1. **Test first.** Port the cited reproduction, or write the test the acceptance criteria describe. Show it failing on the current code.
2. **Minimal fix.** Change only the package's owned files. If the fix needs a file the package does not own, record the hand-off in the fix log entry. If it needs a design or UX decision that the package text does not settle, stop and ask the user. Do not invent one.
3. **Verify** as the package states, then run the full regression:
   - `pnpm typecheck`
   - `pnpm test`
   - the full Playwright suite
   - `pnpm build`

   Before P05 lands, the 7 known browser failures in `unified-action-layer.spec.ts` and `trip-table-layout.spec.ts` are the baseline. A package passes when it adds no new failure.
4. **Independent review (P01–P04 only).** Give one Opus sub-agent:
   - the package section from `fix-packages.md`;
   - the cited finding sections;
   - the diff.

   Ask it for an adversarial review: does each acceptance criterion hold, what could still be wrong, and is any data path left unprotected. It may run tests. It must not edit files. It replies in at most 400 words. Fix what it confirms. Record what you rejected and why.
5. **Self-review.** Re-read your own diff and state what could still be wrong.
6. **Commit** the package as one commit (or a short series) with a message that names the package and the register IDs.
7. **Records.** Write these as `fix-packages.md` "Records for the ChatGPT-based workflow" requires:
   - the fix log entry in `docs/implementation/review-fixes.md`;
   - updates to `architecture_overview.md`;
   - decision records;
   - any documentation that the package owns.
8. **Package gate.** Report the package result to the user in a few lines. Then continue to the next package of the same sitting, unless something failed or a question is open.

Haiku use: only where the execution plan names it (X01 deletions, P13 file moves, D01 status lines). Give Haiku an exact file and line list and a mechanical check, such as typecheck passing or a grep returning nothing. Verify its result yourself before committing.

## Sitting 4A setup step (sitting 4A only, before P01)

Bring these three review-branch changes onto your branch, as one commit:

- `playwright.config.ts`: the `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override from commit `9748db0`.
- The `codex.md` section "Browser tests in environments with a preinstalled Chromium".
- The A-006 correction in `docs/implementation/phase-05-costing.md` from commit `d33ac1c`.

Take only those changes. Then create `docs/implementation/review-fixes.md`. Its header must say:

- what the review was;
- where the review documents live (the review branch and its `docs/review/` paths);
- how to read the fix log.

Then add the "Next sitting" note.

## End of sitting

1. Update the "Next sitting" note at the top of `docs/implementation/review-fixes.md`: the next sitting, its packages, its prerequisites, and any open question or known failure.
2. Update `codex.md` "Current implementation status" with one paragraph that names the completed packages and points to the fix log.
3. Push the branch. Do not open a pull request unless the user asks.
4. Give one report to the user covering:
   - each package's result;
   - verification results, including exact test counts;
   - anything deferred or handed off;
   - what the user must do: review, open and merge the pull request, and any decision needed;
   - the recommended next sitting and its model.
5. Stop. Do not start the next sitting.
