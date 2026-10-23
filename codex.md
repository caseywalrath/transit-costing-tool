# Codex Project Guide

## User Context

The user is a transit planner with a basic working understanding of GitHub and Codex. Do not assume the user is a software developer or is operating through a traditional terminal workflow.

Codex should perform routine repository inspection, file editing, testing, and other authorized development work directly. Ask the user to perform a manual action only when the action requires their account, judgment, or approval.

When a user action is required, state:

1. what the user must do;
2. why it is required;
3. what result to expect.

## Product Context

This repository will contain a local-first transit service planning application. It will define route patterns, generate scheduled trips, organize trips into vehicle blocks, calculate service quantities, and estimate costs.

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
4. Inspect Git status if the repository has been initialized.
5. Confirm that the requested work belongs to the current approved phase.

The repository is currently local and may not yet have Git initialized or a remote configured. Do not assume a branch strategy, remote URL, package manager, Node installation, or deployment workflow until it exists and has been inspected.

When Git is initialized, treat `main` as the stable branch. Use one descriptive feature branch per meaningful implementation or revision package unless the user directs otherwise.

## Work Packages and Model Recommendations

Development plans must separate structural work from UI/UX work when both are present.

- Recommend Luna for bounded domain, application, persistence, migration, serialization, and test work after the architecture is settled.
- Luna may implement a simple UI or wire approved behavior when it reuses existing components and patterns. Give Luna precise instructions for placement, states, interactions, keyboard/accessibility behavior, and acceptance criteria; do not rely on Luna to invent a new visual or interaction system.
- Recommend Sol when UI work is novel, interaction-heavy, visually complex, or requires substantial usability/accessibility judgment.
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
- `docs/data-schema.md`: proposed TypeScript and IndexedDB schema.
- `docs/decisions/`: accepted architectural decisions and consequences.
- `docs/implementation/`: phase-specific scope, work packages, and acceptance criteria.

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

Assert counts (reads of a store, rows written) rather than elapsed time when a spec measures speed on the Vite development server: eight parallel browsers stretch times two to five times, and React `StrictMode` doubles every effect.

## Checks and CI

Verified on 2026-10-23 in a Claude Code cloud session (Node 22.22.0, pnpm 10.28.0):

- `pnpm typecheck` covers `src`, `tests` (including `tests/ui`), `vite.config.ts`, `vitest.config.ts`, and `playwright.config.ts`. `@types/node` 22 supplies the Node types.
- `pnpm test`, `pnpm build`, and `pnpm test:ui` as above. `pnpm build` runs `tsc -b`, which uses the same configuration.
- Node 22 LTS is pinned in `.nvmrc`, in `engines` (`>=22.12.0 <23`), and in CI (`node-version-file: .nvmrc`). pnpm 10.28.0 is pinned by `packageManager`; CI reads it from there.
- `.github/workflows/ci.yml` runs on pull requests and on pushes to `main`: a `verify` job (install with the frozen lockfile, typecheck, unit tests, build) and a `browser` job (`pnpm exec playwright install --with-deps chromium`, then `pnpm test:ui`; do not set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` on a GitHub runner). `.github/workflows/deploy-pages.yml` runs only after a successful CI run for a push to `main`.
- The workflows have not run yet: they were validated locally (YAML parse, and every command they run) but no pull request existed when they were written. The first pull request is their first run (`docs/implementation/review-fixes.md`, B01 entry).
- `pnpm audit` reports 5 advisories, all in the `vitest` chain. A Vitest major upgrade is follow-up work.

## Unit tests that need IndexedDB

`pnpm test` runs in a Node environment with `fake-indexeddb/auto` loaded before every test file (`vitest.config.ts`), so a unit test can open a real Dexie database, run its upgrades, and run `DexieRouteDefinitionRepository`. Verified on 2026-10-22 with `fake-indexeddb` 6.2.6 and Vitest 3.2.7.

- `src/persistence/repositoryContract.test.ts` runs every test against both the in-memory and the Dexie repository. Add each new repository method there. Both repositories return rows in primary-key order, which is random for generated identifiers, so do not assert the order of a repository list that the code did not sort.
- `src/persistence/database.test.ts` upgrades seeded databases of Dexie versions 1 to 6. Use a unique database name per test and delete it afterwards (`Dexie.delete`).
- `fake-indexeddb` is slow when it overwrites rows that have several indexes. Do not load the full Federal BRT project into a write test; use the trimmed fixture in the contract file, or a browser spec.
- Line coverage is not part of the scripts. To measure it, install `@vitest/coverage-v8@3.2.7` temporarily and do not commit the change (sitting 4D measured `dexieRepository.ts` at 86.54% of lines, from 0%).

## Current implementation status

Phase 3R is implemented and accepted through Package 3R-C. It is recorded in `docs/implementation/phase-03r-closeout.md`. Phase 4 is implemented and user-accepted through Package 4D; see `docs/implementation/phase-04-closeout.md`. Phase 5 planning is approved in `docs/implementation/phase-05-costing.md`. Packages 5A through 5C are implemented, including the consolidated global/module toolbar revision in Decision 0028; automated Costing UI verification passed on 2026-09-23 and user review remains the 5C stop gate. Package 5D integration remains unstarted.

Phase 1 is implemented through Package 1C. The completed scope includes the React/TypeScript/Vite foundation, route-definition domain behavior, Dexie version 1 persistence, complete Phase 1 JSON backup/restore, CSV serializers, the route-definition interface, and the application-layer integration facade.

Phase 2 is implemented and accepted through Package 2G, but user review approved a replacement Trips workflow before Phase 3. The Phase 2R replacement workflow, including the Route and Trips UI, safe route editing, Trip profiles, and integration acceptance, is complete; its historical package plan is `docs/implementation/phase-02r-trips-workflow-revision.md`. The corrective package in `docs/implementation/phase-02r-safe-route-editing.md` is implemented and user-accepted. It stages Node and Pattern saves, deterministically rebalances runtimes and trips, presents reset impacts for ambiguous Pattern changes, and reconciles Direction timetable columns. Trip-profile implementation in `docs/implementation/phase-02tp-trip-profiles.md` is implemented and user-accepted; it adds scenario-wide timetable alternatives and the source boundary for Blocking Scenarios. Phase 3 service-day workflows are implemented and accepted through Package 3C. The completed scope is recorded in `docs/implementation/phase-03-closeout.md`. Phase 3R is implemented and accepted through Package 3R-C; the closeout is `docs/implementation/phase-03r-closeout.md`. Phase 4 is accepted through Package 4D; its closeout is `docs/implementation/phase-04-closeout.md`. Phase 5 Packages 5A through 5C are implemented; persistence, versioned backup, report export, and automated Costing UI checks pass. User review remains before Package 5D, which is unstarted.

The scoped Runtime table paste revision is implemented and recorded in `docs/implementation/runtime-table-paste.md`; full Excel schedule and workbook import remains deferred.

Code review Stage 4 (issue resolution) is in progress. Sitting 4A completed the setup (Playwright Chromium override, A-006 correction), Package P01 (Scenario-wide writes re-read stored data; Decision 0036), and Package P02 (one active tab; Decision 0037). The fix log, with each package's issues, tests, verification, and the next-sitting note, is `docs/implementation/review-fixes.md`. The review documents are on the branch `claude/upbeat-ritchie-51mpy5` only.

Sitting 4B of the code review fixes completed Package P03 (Scenario duplication remaps pull-out, deadhead, and pull-in Nodes; Scenarios duplicated earlier are repaired by the Dexie version 7 upgrade and by backup import; Decision 0038) and Package P04 (backup import keeps Block ownership, discards placeholder Blocks with a count, and validates Block and Trip data before any write; Decision 0039). The Dexie schema is now version 7; the JSON backup schema is still 6. The fix log, with each package's issues, tests, verification, and the next-sitting note, is `docs/implementation/review-fixes.md`.

Sitting 4C of the code review fixes completed Package P05 (the browser test suite is repaired: the stale menu label, the `Add node` setup race, the nested-scroller tests, and the hand-written fixture layout tests are fixed or replaced with specs that drive the real app, and `trips-table-display.spec.ts` covers rounding, Show headways, band shading, duplicate-departure and Block overlap warnings, net-zero Shift discard, and the Runtime paste dialog) and Package X01 (the dead legacy generation-set screens, unused App handlers, service methods, ports, and exports are removed; the `generationSets` table and backup parsing stay). The full browser suite is now green: 59 tests, 0 failures, no `test.fail`. The fix log, with each package's issues, tests, verification, hand-offs, and the next-sitting note, is `docs/implementation/review-fixes.md`.

Sitting 4D of the code review fixes completed Package P06 (unit tests now run on `fake-indexeddb`; one contract suite runs against both the in-memory and the Dexie repository, and the in-memory repository now matches Dexie on result order, stale-regeneration rejection, Scenario deletion, and error types; per-version database upgrades and the `segmentStart` boundary matrix are tested; Decision 0040), Package P07 (a route edit no longer marks a Trip current unless the rebalanced profile calculates its times; Pattern change reviews and Trips CSV reviews are rejected when their source changed; a Trips CSV import cannot move a Trip of the other Direction; a band label no longer changes the calculation revision; `inspectStaleTrips` reports why a Trip could not be checked), and Package P08 (a Last Trip request is limited to 500 Trips; a Shift that would move a Trip before 0:00 is refused instead of blanking the page; an anchor that more than one departure satisfies is rejected and the candidates are listed; a zero-second Shift changes nothing). The full browser suite is green: 61 tests, 0 failures. The fix log, with each package's issues, tests, deliberate breaks, verification, hand-offs, and the next-sitting note, is `docs/implementation/review-fixes.md`.

Sitting 4E of the code review fixes completed Package P09 (deletions of a Project, Scenario, Route, Runtime profile, Trips, and Trip profile take the token of the review the planner confirmed and refuse when the data changed after it; Service day counts are limited to whole numbers of 0 or more that total at most 365; deleting a Node removes the pull-out, pull-in, and deadhead activities that name it; the Default Runtime profile is created once however many calls overlap; Decision 0041), Package P10 (one `SaveStatusPublisher` covers every write of the Route, Trips, Blocking, and Costing services; a full browser store is reported as "Browser storage is full. Export a backup, then free space."; the browser is asked once to keep the store and the time of the last JSON backup is recorded on the device; Decision 0001 amendment), and Package P11 (the Blocking compatibility review and the Costing estimate read the Trips and Patterns once instead of once per Trip or Block, which took 23 and 30 seconds at 400 Blocks and 2,000 Trips; the Costing screen reads its rules from the Costing service). The full browser suite is green: 77 tests, 0 failures. Unit tests: 36 files, 502 tests. A new repository write method must be listed in its service's `*_WRITE_METHODS` list or the guard test in `src/application/saveStatus.test.ts` fails. The fix log, with each package's issues, tests, deliberate breaks, verification, hand-offs, and the next-sitting note, is `docs/implementation/review-fixes.md`.

Sitting 4F of the code review fixes completed Package P12 (explicit-time deadheads outside their connection gap and explicit pull-outs or pull-ins that overlap their Trips are reported and make the Block invalid; a Pattern with 0 total miles is incomplete mileage; Costing findings use the `ValidationFinding` shape and Blocking refusals throw `BlockingValidationError` with findings), Package P13 (one CSV escaping rule for header cells and bare CR, formula-injection protection of free-text cells with import restore, and the Trips CSV and ZIP writer moved to `src/application`), Package P14 (apply-to-all-similar deadheads reach every matching connection, blank minutes and a blank minimum-layover amount are refused, reorder, insertion, the unassigned-Trip filter, and Layover % come from `blockingService`, Block labels are unique per service day with the first free "Block <n>" proposed, and deletion previews exist for U05), and Package B01 (a CI workflow for pull requests and pushes to `main`, deployment only after CI succeeds, Node 22 and pnpm pinned, `pnpm typecheck` widened to `tests` and `playwright.config.ts`, unused `zod` and `@tanstack/react-table` removed, `vite` updated, 5 audit advisories left in the `vitest` chain). The CI workflows have not run yet. Unit tests: 41 files, 637 tests. The full browser suite has 80 tests; one test (`unified-action-layer.spec.ts:139`) failed intermittently in full runs (P14 entry). The fix log, with each package's issues, tests, deliberate breaks, verification, hand-offs, and the next-sitting note, is `docs/implementation/review-fixes.md`.

Sitting 4G/4H of the code review fixes (one combined overnight sitting; branch `claude/stage-4g-4h-review-fixes`, no pull request opened yet; U01, U02, U03, U04, U05, then P16) is complete. It completed: Package U01 (`index.html` is a standards-mode document with a language, charset, viewport, and title; table text now renders at 14 px), Package U02 (a read-only tab says so in the notice banner and header; the Project menu shows the time of the last backup; one filter, `src/ui/errorMessages.ts`, keeps browser and Dexie error text off the screen; a stale-source refusal in Blocking reloads its data; startup, selection, and export failures reach the error banner; many messages gained a next step), Package U03 (a dirty Runtime draft and a staged Shift ask before a Pattern, Profile, day, Direction, or tab change and before a Runtime save; Build Trips keeps its values; saving Nodes or a Pattern keeps the other draft; Escape cancels a numeric or runtime time edit; a stored selection of the wrong shape falls back to the default; the Blocking Scenario is remembered for each Trip Profile), and Package U04 (every modal dialog is built by `ModalDialog`, which traps Tab, closes on Escape, has a name, and returns focus; menus use checkbox roles for toggles, close on Tab, and return focus at once, which fixes the intermittent Trip actions menu failure; focus is not lost after common actions; invalid fields, headings, landmarks, and table headers are marked up and checked with axe-core), Package U05 (removing a Trip, Pull-out, or Pull-in from a Block asks first; deleting a Block or a Blocking Scenario shows what it removes and deletes with the reviewed source; a Trip from another Route shows its Route in the Pattern pill; Blocking hours and miles use the Costing rounding; loads ignore out-of-order responses; labels are exact), and Package P16 (a segment that starts exactly halfway across a gap between Runtime bands uses the later band, as the blend already did; a decimal-minute entry rounds a half second up exactly, so 1.025 minutes is 62 seconds; the direction-order conflict message names the Direction; per-day revenue and platform hours are summed in whole seconds, so 266:30:00 shows as 267; copy and regeneration previews take their time from the caller; `setIdGenerator` lets tests inject domain ids). Next sitting: 4I and 4J combined (U06, U07, P15) on Sonnet, from the new `origin/main` after the pull request for this branch is merged. Nothing is blocked. The browser suite has 125 tests, all passing; unit tests: 47 files, 696 tests. The fix log, with each package's issues, tests, deliberate breaks, verification, hand-offs, and the next-sitting note, is `docs/implementation/review-fixes.md`.

Sitting 4I/4J of the code review fixes (one combined sitting; branch `claude/stage-4i-4j-review-fixes`, no pull request opened; U06, U07, P15, then P17) is in progress. Done so far: Package U06 (a refused Service day edit shows its message beside the field; an invalid Costing estimate lists each finding; the Cost Breakdown table fits a 1024 px frame with Annual Cost visible; "Calculating estimate…" shows while the estimate loads; the Total row leaves the daily columns blank and a note says totals are computed before rounding; View year appears once). The browser suite has 132 tests, all passing; unit tests: 48 files, 700 tests. The fix log, with each package's issues, tests, deliberate breaks, verification, hand-offs, and the next-sitting note, is `docs/implementation/review-fixes.md`.
