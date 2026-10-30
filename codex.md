# Project Guide

This file keeps the name `codex.md` (review decision 9) but applies to every coding agent. `AGENTS.md` requires every agent to read it.

## User Context

The user is a transit planner with a basic working understanding of GitHub and AI coding agents. Do not assume the user is a software developer or is operating through a traditional terminal workflow.

The agent should perform routine repository inspection, file editing, testing, and other authorized development work directly. Ask the user to perform a manual action only when the action requires their account, judgment, or approval.

When a user action is required, state:

1. what the user must do;
2. why it is required;
3. what result to expect.

## Product Context

This repository contains a local-first transit service planning application. It will define route patterns, generate scheduled trips, organize trips into vehicle blocks, calculate service quantities, and estimate costs.

The application is intended for planning rather than daily operations. It should use concepts familiar to users of scheduling systems such as Trapeze or Hastus without attempting to reproduce those products.

The initial application:

- works on one route at a time in the interface;
- supports multiple saved projects and scenarios;
- stores data locally in IndexedDB;
- is deployed as a static GitHub Pages site;
- supports weekday, Saturday, Sunday, and holiday service;
- supports service times greater than 24:00;
- uses miles;
- begins with manual blocking and manually entered costing assumptions.

## Communication

- Use direct, structured language.
- Lead with the result or decision.
- Explain implementation consequences when asking the user to choose between alternatives.
- Do not treat the reference workbook as a literal specification.
- Identify assumptions and unresolved decisions explicitly.
- Use transit-planning terms consistently with `docs/domain-glossary.md`.

## Repository Workflow

Before changing the repository:

1. Read `AGENTS.md`.
2. Read `architecture_overview.md`.
3. Read relevant decision records and implementation plans.
4. Inspect Git status.
5. Confirm that the requested work belongs to the current approved phase.

Repository facts, verified on 2026-10-23:

- Git is initialized. The remote `origin` is `https://github.com/caseywalrath/transit-costing-tool`. `main` is the stable branch, protected by the two CI checks described in "Checks and CI".
- The package manager is pnpm 10.28.0 on Node 22. The scripts are `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test` (Vitest), and `pnpm test:ui` (Playwright).
- The site is deployed to GitHub Pages by `.github/workflows/deploy-pages.yml` after CI succeeds on `main`.
- Use one descriptive feature branch per meaningful implementation or revision package unless the user directs otherwise. Do not commit or push to a branch the user did not name, and do not open a pull request unless the user asks.

## Work Packages and Model Recommendations

Development plans must separate structural work from UI/UX work when both are present.

Packages are classified by capability class, as `AGENTS.md` states. The model names in parentheses are the names this project has used; an agent without those models recommends the closest model it can select.

- Recommend the structural class (Luna) for bounded domain, application, persistence, migration, serialization, and test work after the architecture is settled.
- The structural class may implement a simple UI or wire approved behavior when it reuses existing components and patterns. Give it precise instructions for placement, states, interactions, keyboard/accessibility behavior, and acceptance criteria; do not rely on it to invent a new visual or interaction system.
- Recommend the UI-design class (Sol) when UI work is novel, interaction-heavy, visually complex, or requires substantial usability/accessibility judgment.
- Keep structural packages from establishing UI conventions through placeholders, and keep UI packages from duplicating business rules that belong in domain commands or selectors.
- Place a user-verification gate between structural work and a separately owned UI/UX package when both are required.
- The primary agent remains responsible for architecture, integration, cross-layer consistency, and final verification.

Older plans may contain Terra assignments from when that model was available. Treat those as historical recommendations; do not use Terra for new work.

Model recommendations are presented to the user between packages. They do not authorize automatic task creation, delegation, or continuation.

## Reference Material

The current reference workbook is:

`Federal Blvd Service Plan 11-20-2024.xlsx`

It illustrates:

- directional trip tables;
- short and full-length patterns;
- runtime bands;
- manual block assignments;
- pull-out and pull-in times;
- block-level revenue and platform hours;
- annual service calculations;
- hourly cost projections;
- vehicle-mile calculations.

Use it to understand terminology, relationships, and expected outputs. Do not copy its formula layout or assume every calculation belongs in the application.

## Documentation Map

- `architecture_overview.md`: stable system architecture and phased roadmap.
- `docs/domain-glossary.md`: canonical domain terminology.
- `docs/data-schema.md`: TypeScript entity shapes, IndexedDB tables and indexes, migrations, and backup rules.
- `docs/ui-conventions.md`: current interaction and layout conventions.
- `docs/decisions/`: accepted architectural decisions and consequences. Each record has a Status and a Date and names the decisions it supersedes.
- `docs/implementation/`: phase-specific scope, work packages, and acceptance criteria.
- `docs/implementation/ui-revision-plan.md`: the approved interface revision (Phase UR, Decision 0047), split into one-agent packages UR-0 to UR-12, with mockups and screenshots in `docs/implementation/ui-revision/`.
- `docs/implementation/review-fixes.md`: the fix log of the October 2026 code review, with the next-sitting note. The review documents themselves are on the branch `claude/upbeat-ritchie-51mpy5` only.

## Verification and Closeout

Before closing an implementation package:

1. Review the applicable acceptance criteria.
2. Run checks appropriate to the changed layer.
3. Inspect Git status if Git is available.
4. Summarize changed files and verification results.
5. Confirm whether architecture or decision documentation must be updated.
6. Present the next work package and recommended model to the user.

Do not start the next package until the user requests it.

## Browser tests in environments with a preinstalled Chromium

`pnpm test:ui` launches the Chromium build bundled with the installed `@playwright/test` version. Some hosted environments, including Claude Code cloud sessions, provide a different preinstalled Chromium and block browser downloads. In those environments, point Playwright at the provided executable with `PLAYWRIGHT_CHROMIUM_EXECUTABLE`:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui
```

Verified on 2026-10-22 in a Claude Code cloud session with `@playwright/test` 1.63.0 and Chromium 141. When the variable is unset, Playwright uses its bundled browser and local behavior is unchanged.

To prove that a new browser spec is not flaky, run it ten times over with eight workers (verified 2026-10-23):

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test tests/ui/<spec>.spec.ts --repeat-each=10 --workers=8
```

The visual tour (`tests/ui/visual-tour.spec.ts`, interface revision plan UR-0) captures five screenshots at 1024 px and five at 1440 px into `test-results/ui-tour/<width>/` for visual review. It skips itself unless `UI_TOUR=1`, so CI never runs it:

```bash
UI_TOUR=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test tests/ui/visual-tour.spec.ts
```

Specs reach scope selectors, panels, and menu commands through `tests/ui/support/ui.ts` (`scopeField`, `region`, `runCommand`, `projectSelect`, `scenarioSelect`), so a package that moves a control edits that file and not every spec.

Assert counts (reads of a store, rows written) rather than elapsed time when a spec measures speed on the Vite development server: eight parallel browsers stretch times two to five times, and React `StrictMode` doubles every effect.

## Checks and CI

Verified on 2026-10-23 in a Claude Code cloud session (Node 22.22.0, pnpm 10.28.0):

- `pnpm typecheck` covers `src`, `tests` (including `tests/ui`), `vite.config.ts`, `vitest.config.ts`, and `playwright.config.ts`. `@types/node` 22 supplies the Node types.
- `pnpm test`, `pnpm build`, and `pnpm test:ui` as above. `pnpm build` runs `tsc -b`, which uses the same configuration.
- Node 22 LTS is pinned in `.nvmrc`, in `engines` (`>=22.12.0 <23`), and in CI (`node-version-file: .nvmrc`). pnpm 10.28.0 is pinned by `packageManager`; CI reads it from there.
- `.github/workflows/ci.yml` runs on pull requests and on pushes to `main`: a `verify` job (install with the frozen lockfile, typecheck, unit tests, build) and a `browser` job (`pnpm exec playwright install --with-deps chromium`, then `pnpm test:ui`; do not set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` on a GitHub runner). `.github/workflows/deploy-pages.yml` runs only after a successful CI run for a push to `main`.
- The workflows have run on pull requests #22 to #24, and branch protection on `main` requires the two checks. Reading each CI run stays with the user.
- `pnpm audit` reports no known vulnerabilities (verified 2026-10-23, after the Vitest 4.1.12 upgrade of review package P18; the five advisories of the Vitest 3 chain are gone).

## Unit tests that need IndexedDB

`pnpm test` runs in a Node environment with `fake-indexeddb/auto` loaded before every test file (`vitest.config.ts`), so a unit test can open a real Dexie database, run its upgrades, and run `DexieRouteDefinitionRepository`. Verified on 2026-10-22 with `fake-indexeddb` 6.2.6 and Vitest 3.2.7, and again on 2026-10-23 with Vitest 4.1.12 (P18; no change to `vitest.config.ts` or to a test was needed).

- `src/persistence/repositoryContract.test.ts` runs every test against both the in-memory and the Dexie repository. Add each new repository method there. Both repositories return rows in primary-key order, which is random for generated identifiers, so do not assert the order of a repository list that the code did not sort.
- `src/persistence/database.test.ts` upgrades seeded databases of Dexie versions 1 to 8 (version 9 is the current one). Use a unique database name per test and delete it afterwards (`Dexie.delete`).
- `fake-indexeddb` is slow when it overwrites rows that have several indexes. Do not load the full Federal BRT project into a write test; use the trimmed fixture in the contract file, or a browser spec.
- Line coverage is not part of the scripts. To measure it, install `@vitest/coverage-v8@4.1.12` (the same version as `vitest`) temporarily and do not commit the change (sitting 4D measured `dexieRepository.ts` at 86.54% of lines, from 0%).

## Current implementation status

Phases 1 through 4 are implemented and user-accepted: route definition (Package 1C), runtime and trip generation (Package 2G) and the Phase 2R replacement of the Trips workflow (direct Trips, safe route editing, Trip profiles), service-day workflows (Package 3C), unified action layers and the staged Shift drawer (Package 3R-C), and manual blocking (Package 4D). Closeouts are in `docs/implementation/phase-*-closeout.md`; the stage-by-stage history is in the decision records and `docs/implementation/`. The Runtime table paste recorded in `docs/implementation/runtime-table-paste.md` was removed by Decision 0045, which also makes every Runtime profile of a Route use one calculation method; full Excel schedule and workbook import remains deferred.

Phase 5 Packages 5A through 5C (Costing) are implemented, and the user accepted the Costing workspace on 2026-10-22. The October 2026 code review replaces Package 5D except user acceptance (`docs/implementation/phase-05-costing.md`).

Code review Stage 4 (issue resolution): sittings 4A to 4J and 4K part 1 landed packages P01 to P17, X01, B01, and U01 to U08 in `main`. Sitting 4K part 2 (branch `claude/stage-4k-review-fixes`) finished D01 (documentation-only remainder: ten documentation contradictions resolved, every decision record has a Status and a Date and annotates its supersessions, new Decision 0042 records the minimum-layover display preference, `AGENTS.md` and this file use agent-neutral wording, and the fix log ends with a map from every register issue to its package and commit), U09 (the "Run Times Have Changed" indicator has a status line that says why a Trip cannot be recalculated, for example that no Runtime band covers its first departure), and P18 (Vitest 3.2.7 to 4.1.12; `pnpm audit` reports no vulnerabilities). Unit tests: 52 files, 752 tests; browser suite: 153 tests. U10 (the Shift drawer is now a compact lower-right panel with step buttons that name their size and preset step sizes of 1, 5, 10, and 15 minutes) followed on the same branch name after PR #25 and completes Stage 4; browser suite: 155 tests. Package F1 (UI follow-up fixes, same branch) followed: an entered Add-trip row asks before the service day, Direction, Trip Profile, or tab changes; "Add pattern" is disabled while a Node or Pattern save runs; the Runtime profile and Trips delete dialogs close after a refusal; the Node save review lists the pull-out, pull-in, and deadhead activities it removes and the Trip Profile delete confirmation names the Blocking Scenarios it deletes; the Project menu warns when the browser did not grant persistent storage. Package F2 (structural follow-up and maintenance, same branch) followed: Dexie version 8 adds the `[scenarioId+tripProfileId]` index on `trips` and deletes placeholder Blocks without a Blocking Scenario (Decision 0043), `saveBlocks` and `makePatternPoint` are deleted, the generation-set methods and a JSON backup round trip are in the repository contract suite, the U09 stale check was timed (about 60 ms for 500 Trips, no change), and the CSV importer rule is in `architecture_overview.md`. Unit tests: 52 files, 761 tests; browser suite: 171 tests. No work package is open; the fix log lists the deferred hand-offs. The fix log `docs/implementation/review-fixes.md` records each package's issues, tests, deliberate breaks, verification, and hand-offs, and carries the next-sitting note.

Interface revision (Phase UR): the user approved the design on 2026-10-27 (Decision 0047). The plan `docs/implementation/ui-revision-plan.md` divides the work into packages UR-0 to UR-12 with model recommendations (Haiku, Sonnet, Opus). UR-0 (test seams and visual tour) and UR-1 (`App.tsx` and `styles.css` split into one file per workspace and one stylesheet per area, with no behaviour change; the tour screenshots are byte-identical to UR-0) are done. `src/styles.css` is replaced by `src/ui/styles/index.css`, which imports the area files in the original cascade order. UR-2 (tokens and bundled Source Sans 3) is implemented and awaits the user's visual review gate: `src/ui/styles/tokens.css` holds every colour, size, and radius, and `@fontsource-variable/source-sans-3` 5.3.1 is imported in `src/main.tsx`. UR-3 (display formatters F1-F8 in `src/ui/format.ts`, used by the Trips, Blocking, and Costing screens; CSV output is unchanged) is done. Blocking table cells drop the unit and the Blocks headings name it ("Running (h)"); Costing daily hours show two decimals, annual hours are whole, and the applied rate shows cents; display-only durations of an hour or more read `1:01`. UR-4 (shared primitives) and UR-5 (two-row header) are done; UR-5 awaits its visual gate. UR-6a (Route tab: supporting panels, Nodes and Patterns work surfaces, save bars, Pattern actions menu) and UR-6b (Costing tab: work surfaces, save bar with a new Discard, supporting panels) are implemented and await their shared gate. `src/application/draftChangeCounts.ts` counts the edits that the save bars report. UR-6c (Trips tab: collapsible Runtimes section with its open state in `transit-costing-tool.runtimes-open.v1`, View, Add trip, Build trips…, a selection bar for the selected-Trip commands, Pattern chip, Block pill, and a single-Trip Change pattern review) is implemented and awaits its gate, which includes the O-2 answer. UR-6d (Blocking tab BL-A: side/rail Unassigned trips panel with its collapse in `transit-costing-tool.blocking-unassigned-collapsed.v1`, selection bars, boundary rows, InlineNote findings, stat-strip day summary) is implemented and awaits its gate. UR-7 (spreadsheet grid: `src/ui/shared/useGridNavigation.ts`, applied to the Runtimes editor's From, To, and segment cells; edited cells carry a corner mark and the save bar reads "N unsaved changes in Runtimes") is implemented and awaits its gate; browser specs edit a cell with `editRuntimeCell` and read it with `runtimeCell` from `tests/ui/support/ui.ts`. UR-7b applies the grid to the Route tab (`src/ui/route/RouteGrids.tsx`: Nodes Name, Short, Notes; Pattern points' Cumulative mi). Type and each point's Node stay selects inside grid cells marked `data-grid-control`, which Tab reaches. Service-day count fields show an inline "Saved" note for 1.8 s after a saved commit. Specs edit these cells with `gridCell` and `editGridCell`. UR-8 (headways HW-B and HW-X) is implemented and awaits its gate: `markHeadwayChanges` in `src/application/tripsWorkspaceView.ts` gives each headway cell `changed` (its headway and the previous one in the same column are both defined and differ), shown with the `trip-headway-changed` class. With Show headways on, a bold Departs column follows Pattern. Selection (left 0), Pattern (left 56 px), and Departs (left 244 px) are pinned in the table and in the duplicate heading row; the last pinned column carries `trip-pinned-last`. UR-9 (trip selection SEL-1 and SEL-2) is implemented and awaits its gate: `src/application/tripSelection.ts` holds `tripIdsMatching`, `invertSelection`, and `combineSelection`. A caret beside the header checkbox opens "Select trips by…" (all, none, invert, by pattern, by status); a click replaces the selection and Ctrl or ⌘ adds. Each Pattern chip is a menu button (select, add, or remove that pattern's trips) and Ctrl or ⌘ with the click adds without opening it. `MenuButton` passes a `MenuSelectEvent` to `onSelect`, and its `fixedMenu` option places a menu by window position so the pinned duplicate heading row cannot clip it. Every change goes through `requestShiftScopeChange`. UR-10 (sentence-case sweep) is implemented: every user-visible string in `src/ui/**` uses sentence case with lower-case domain terms (trip, block, pattern, node, route, scenario, runtime, shift) except tab names (Route, Trips, Blocking, Costing), which stay capitalized. Persistence error messages, CSV headers, message keys, and `ruleId`s are unchanged. The Blocking "Reassign" dialog is now "Move trips to block", and the Route actions menu item "Delete route" is "Delete route…". UR-11 (accessibility quick wins) is implemented: a 2 px offset-2 px `:focus-visible` outline on every interactive element (grid cells keep the inset ring), Trips header checkbox and menu trigger and the Blocking column-filter buttons are at least 24 px with spacing, and the axe run in `keyboard.spec.ts` now includes `color-contrast` and `target-size` on all four tabs and the open dialogs. UR-12 (integration review and closeout) is done: `docs/implementation/ui-revision-closeout.md` records the review, the tour comparison, three fixes (Unassigned trips heading labels no longer overlapped by sort icons at 1440 px; Cumulative mi shows two decimals at rest; Node type options in sentence case), and six findings. The user approved every open gate and accepted Phase UR on 2026-10-27. UR-13 implements the decisions made at acceptance: role tokens (`--space-inline`, `--inset-tight`, `--inset-panel`, `--font-size-chip`); Pattern and Node short names in the Trips and Blocking tables, generated by `src/application/shortNames.ts` when not entered (the Pattern "Label" field is now "Pattern short name", still stored as `directionLabel`); Blocking sort icons only on the sorted column, beside the label; and stacked Route details. UR-14 fixes the user's post-acceptance list (plan, UR-14): a Node save no longer leaves a Pattern save bar; Tab in the grids runs through a row's cells and buttons to the next row's first cell (`useGridNavigation` `rowProps`); Pattern list cards; the Runtimes summary line, the Runtimes Close button, and the service-days note are removed. UR-15 makes Shift a mode of the Trips selection bar (toolbar "Shift selected trips"; specs use `shiftBar`). UR-16 adds onboarding: empty-state buttons, a "+ New route" option in the Route selector, the Route setup line, and primary first-add buttons. Decision 0047 is "Accepted (implemented)", and `docs/ui-conventions.md` starts with a consolidated "Interface revision" section. Phase UR is complete. The plan is based on `main` at PR #30 (Decision 0046, separate Regenerate and Undo items) and keeps that behaviour.

Package S1 (segment runtime copy and fill, `docs/implementation/segment-runtime-fill.md`, Decision 0049) is implemented on branch `claude/segment-based-runtimes-h47wi7`: the Runtime profile menu has "Copy segments to other patterns…", "Fill from other patterns…", and "Undo last segment copy". Matching is derived (`src/domain/segmentRuntimeMatching.ts`); no storage, backup, or Dexie change. Unit tests: 59 files, 839 tests; browser suite: 225 tests (`tests/ui/segment-runtime-fill.spec.ts`). It awaits the user's review.

A new Scenario now also starts with an empty "Default" Blocking Scenario on its Default Trip Profile (`createScenarioRecords`; Decision 0019 item 3, amended). Existing Scenarios are not backfilled. Unit tests: 59 files, 840 tests.

Unsaved-change prompts now follow the Costing model (Cancel, Discard, Save): the pattern-edit, staged-shift, and new-trip prompts gained Save. A new Pattern still being built has no Save. The activity minutes field has no placeholder, and a blank is still refused. A Blocking Scenario created on the Blocking tab becomes the Trips tab choice too. Browser suite: 229 tests.

- 2026-10-30: A blank Annual Service Days field on the Route tab is recorded as 0 (`NumericCommit` option `blankAsZero`). Other numeric fields still refuse a blank.
