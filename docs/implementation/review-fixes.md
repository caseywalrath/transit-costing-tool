# Code Review Fix Log

## Next sitting

Sitting 4A is in progress (Setup, P01, P02). This note is rewritten at the end of every sitting.

## About this log

In October 2026 a staged code review examined the whole repository: governance, domain correctness, persistence, application layer, UI/UX, and performance and build. It produced an issue register (I-001 to I-101), fix packages, and user decisions 1-18 and C1-C8. Stage 4 resolves those issues one package at a time, in sittings.

The review documents are not on `main`. They live only on the branch `claude/upbeat-ritchie-51mpy5` (decision C6):

- `docs/review/code-review-plan.md`: the review plan; Section 9 governs Stage 4.
- `docs/review/fix-packages.md`: package definitions, owned files, acceptance criteria, sitting plan.
- `docs/review/issue-register.md`: every issue with ID, severity, and package.
- `docs/review/user-decisions.md`: decisions 1-18 and C1-C8.
- `docs/review/findings/phase-*.md`: per-finding Location, Evidence, and Governing source.
- `docs/review/golden/`: read-only reproductions. Each package ports the ones it needs into `src/**/*.test.ts` or `tests/ui/`.

Read them with `git show origin/claude/upbeat-ritchie-51mpy5:<path>`.

How to read the fix log: one section per package, newest last. Each section records the issues fixed (register ID, finding ID, severity), the user decisions implemented, what changed in plain English, tests added, the exact verification run, documentation updated, residual risks, and the commit hash. Finding IDs such as `4-001` are `<phase>-<number>` from the findings files. The fix log does not replace the register; sitting 4K adds a final map from every register issue to its package and commit.

## Setup (sitting 4A)

Brought three review-branch changes to this branch: the `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override in `playwright.config.ts` (review commit `9748db0`), the `codex.md` section "Browser tests in environments with a preinstalled Chromium", and the A-006 whole-dollar display correction in `docs/implementation/phase-05-costing.md` (review commit `d33ac1c`).
