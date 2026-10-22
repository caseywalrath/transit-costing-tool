# Stage 3B Handoff Prompt (User Decisions and Fix Packaging)

Paste the prompt below into a new session to start Stage 3B. Run that session on an Opus-class model. The session is the review lead. Stage 3B needs no sub-agents: it is consolidation and package design. If the user authorizes delegation, use at most one Sonnet reader to check the package file lists against the code; it must not write review files.

Stage 3A (plan Section 8.1 steps 1–5) is complete. Its output is `docs/review/issue-register.md`. Stage 3B runs steps 6–7.

---

Begin Stage 3B of the code review: user decisions and fix packaging. Follow the master plan exactly (`docs/review/code-review-plan.md`, Section 8), as split in `docs/review/stage-3a-handoff.md` and this file.

## Setup

- Repository: `caseywalrath/transit-costing-tool`. Work on branch `claude/upbeat-ritchie-51mpy5`. Fetch it and check it out; do not start from `main`.
- No test runs are required. If you need to re-check a reproduction, the commands are in `docs/review/stage-3a-handoff.md` (Setup). Use a browser port of 4188 or higher.

## Read before doing anything else

1. `AGENTS.md`, then `codex.md` sections "Communication" and "Work Packages and Model Recommendations".
2. `docs/review/code-review-plan.md`: Sections 4.3 (posture), 5.2 (rubric), 8 (Stage 3), and 9 (Stage 4, which the packages must make executable).
3. `docs/review/issue-register.md` in full. It is the only input for packaging. Use it, not the phase files, as the source of IDs, severities, and groups. Open a phase file only to read the Location and Fix scope of a finding you are packaging.
4. `docs/review/user-decisions.md` (decisions 1–18). These are settled; do not re-open them.
5. Decision 0005 and the "Architecture and Documentation" and "Work Packages" sections of `AGENTS.md`.

## Step 6: user decisions

Write the consolidated `docs/review/user-decisions.md`:

- Keep decisions 1–18 unchanged, under their gate headings.
- Add a "Stage 3 candidates" section. List each candidate below with its source issues, the question, every option with its implementation consequence, and a recommendation. Mark each one "Open" until the user answers.
- Add any further candidate you find while packaging. A candidate is a choice that changes product behavior, a governing document, or a package boundary, and that the register or a decision record does not already settle.
- Present the open candidates to the user at the gate. Do not record an answer the user has not given.

Open candidates found during Stage 3A (not yet decided):

| # | Source issues | Question | Options | Recommendation |
| --- | --- | --- | --- | --- |
| C1 | I-055 (1-011) | The minimum-layover candidate preference is implemented, but D0020-19 says no minimum-layover policy applies, and no decision record covers it. Is it accepted product behavior? | (a) Accept it: write a new decision record and annotate D0020-19. (b) Remove the preference to match D0020-19. | (a). It is implemented, documented in the overview and ui-conventions, and affects only candidate classification. |
| C2 | I-015 (2-006) | How should legacy explicit-time deadheads and pull-outs be handled? | (a) Report a placement finding when explicit times fall outside the gap, or a boundary overlaps a Trip (smallest fix). (b) Convert legacy explicit-time activities to relative offsets on load and import (changes stored data; needs a migration decision record). | (a). |
| C3 | I-087 (5-019) | The Costing Total row sums daily hours across day types, and its totals are rounded independently of the displayed rows. Decision 2 accepted 5C, so changing the row changes accepted presentation. | (a) Leave the daily columns blank in the Total row, keep the annual totals, and add a note that totals are computed before rounding. (b) Keep the row as is and add only the rounding note. | (a). |
| C4 | I-099, I-100, I-101 (6-009 to 6-011) | Scope of dependency work in Stage 4. | (a) Update `vite` within its range in the build package; upgrade `vitest` (a major version) in a separate package after the test-suite repair; raise `chunkSizeWarningLimit` with a recorded reason instead of code-splitting. (b) Also code-split Blocking and Costing. | (a). The bundle is 210 kB gzip and works offline once loaded. |
| C5 | I-045 (6-003), I-026 (4-010) | GitHub Pages serves every repository of the account from one origin, so the IndexedDB store and `localStorage` keys are shared with sibling Pages sites (Phase 6 lead; not measured). | (a) Record the risk in the Decision 0001 amendment required by decision 16; no code change. (b) Move to a dedicated origin (custom domain or subdomain); stored data does not move with it, so planners must export and re-import. | (a). |
| C6 | All packages; I-047 (A-007) | What happens to the review reproductions in `docs/review/golden/` during Stage 4? | (a) Each package ports the reproduction for the issues it fixes into `src/**/*.test.ts` or `tests/ui/`, as its test-first step (plan Section 9 step 1). `docs/review/` stays on the review branch only. (b) Merge `docs/review/golden/` into `main` as a second test suite. | (a). It keeps one test suite and makes each fix carry its own regression test. |

## Step 7: fix packaging

Write `docs/review/fix-packages.md`, and fill the "Fix package" column of `docs/review/issue-register.md` so that every open issue (I-001 to I-101) names exactly one package. I-102 is closed and stays "none".

Section 8.3 package rules (verbatim from the plan):

- Each package is **structural** or **UI/UX**, never both. Structural packages may wire existing UI ports without changing layout or interaction.
- Each package states owned files, acceptance criteria, the verification required by `AGENTS.md` Verification, and the recommended model class (Luna-class or Sol-class).
- Order: S0 data-integrity packages first; then S1 calculation packages; then test-suite repair (so later packages have regression protection); then S2 contract and layering; then S3 cleanup and documentation.
- Documentation drift is fixed in the same package as the related code change where possible, with a final documentation-only package for the remainder.
- Any change in system structure, data flow, persistence, or major behavior updates `architecture_overview.md` and adds a decision record.

Model-class labels (from `AGENTS.md`; use the class names, with the current model name in parentheses):

- **Luna-class:** bounded, mechanical, or structural work after the architecture is settled: TypeScript domain types, pure calculation utilities, IndexedDB repositories and migrations, import and export serializers, deterministic unit tests, mechanical refactors with explicit acceptance criteria. Luna-class may also implement simple UI changes that reuse existing components, only when the package specifies placement, states, interaction, keyboard and accessibility behavior, and acceptance criteria. It must not make visual design, layout, interaction, or accessibility decisions.
- **Sol-class:** novel, complex, interaction-heavy, or visually distinctive UI work that needs design, usability, accessibility, or layout judgment.
- Terra assignments in historical plans do not apply.
- The primary agent stays responsible for architecture, integration review, cross-layer consistency, and final verification.

Each package entry must contain:

- ID, title, type (structural, UI/UX, test-only, build, or docs), and model class.
- Issues resolved (register IDs and their finding IDs), and the user decisions it implements.
- Owned files. Two packages may not own the same file at the same time unless the order between them is stated.
- Acceptance criteria, each testable, citing the governing source from the register's findings.
- The test-first step (plan Section 9 step 1) and the verification required by `AGENTS.md` (domain or persistence: focused tests and typecheck; UI: typecheck, UI tests, build, visual inspection; migration or export: round trip and schema-version validation), plus the full regression in plan Section 9 step 4.
- Documentation, overview, and decision-record updates.
- Dependencies on other packages.

Package ordering. Apply the Section 8.3 order to the register's root-cause groups:

1. **S0 data integrity:** G01 (I-001, I-002, I-025; decision 10). Split it if the tab guard and the snapshot fix own different files. I-039 is a UI follow-up and goes into a later UI package.
2. **S1:** G02 (I-004, I-005; decision 4, load-time recovery) and G03 (I-003, plus I-010 and I-017 in the same file). Decision 6 places I-016 (3-009) in the first structural package, so add it to the first package that owns `dexieRepository.ts`, or state why not.
3. **Test-suite repair:** G15 (I-006, I-029 first; I-047, I-080, I-084, I-085) and the IndexedDB test environment from G04 (I-007, I-008). The plan places test repair after the S1 packages. State whether the G04 test environment must move earlier so that the S0 and S1 packages can carry Dexie-backed tests (see the register's cross-group dependencies).
4. **S2 contract and layering:** G04 remainder (I-016 if not already placed, I-020), G05, G06, G07, G08, G09, G10, G12 (I-015), G13, then the UI packages G11, G16, G17, G18, G19, G20, G21, G24, and the build package G22 (I-046 needs I-006 first).
5. **S3 cleanup and documentation:** G14 (dead code; decision 13), the remaining S3 items, and a final documentation-only package from G23.

Split rules to apply while packaging:

- A group that mixes structural and UI work becomes two packages: G01 (I-039), G07 (the I-012 error boundary), G08 (I-031), G09 (messages), G10 (the I-044 loading state and I-096), G11, G19 (preview port), and G24 (I-041 query).
- Label every UI package Luna-class or Sol-class. Phase 5 labelled its findings; I-096 (6-005) is Sol-class; I-040 (5-015) is Luna-class because decision 15 settled the presentation.
- Keep each package small enough for one session: about 10 issues or 8 owned files at most, unless they are mechanical.

## Outputs

- `docs/review/user-decisions.md` (consolidated, with the open candidates).
- `docs/review/fix-packages.md`.
- The "Fix package" column filled in `docs/review/issue-register.md`.
- Commit and push the three files to `claude/upbeat-ritchie-51mpy5`. Do not create a pull request.

## Gate

Give one report to the user covering:

- the open user-decision candidates, with options and recommendations;
- the package list in order, with type, model class, issue count, and highest severity;
- any issue whose package placement depends on an open candidate;
- any register correction made during packaging, with its reason.

Do not start Stage 4. Stage 4 starts only on user approval (plan Section 4.1).
