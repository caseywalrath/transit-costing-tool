# UI revision plan (Phase UR)

- Status: Approved design; UR-0, UR-1, UR-3, and UR-4 done; UR-2 awaits its visual review gate; UR-5 implemented and awaits its gate; UR-6a and UR-6b implemented and await their shared gate; UR-6c implemented and awaits its gate (O-2); UR-6d implemented and awaits its gate; UR-7 and UR-7b implemented and await their gate; UR-8 implemented and awaits its gate; UR-9 implemented and awaits its gate; UR-10 implemented and awaits its review; UR-11 implemented and awaits its gate; UR-12 integration review done (`docs/implementation/ui-revision-closeout.md`), and the user's final acceptance covers every open gate.
- Date: 2026-10-27
- Decision record: `docs/decisions/0047-interface-revision-design-system.md`
- Base: `main` at the merge of PR #30 (`fd42c5d`, Decision 0046: Regenerate selected and Undo last regeneration are separate Trips actions). This plan keeps that behaviour (section 3, row "Regenerate and undo").
- Reference mockups: `docs/implementation/ui-revision/mockups.html` (open in a browser) and the screenshots in `docs/implementation/ui-revision/screens/`
- Published review page (user's account, private): https://claude.ai/artifact/PRQ43BF8oWjmffcKFLLBc7

This plan turns the approved UI/UX decisions into packages that one agent session each can complete. Each package lists what to read, the files it owns, the steps, the acceptance criteria, and the conditions under which the agent must stop and report rather than improvise.

---

## 1. How an agent uses this plan

1. Read `AGENTS.md`, `codex.md`, and `architecture_overview.md`, then this plan's sections 1 to 5, then your package section and the appendices it names.
2. Complete **one** package per session. Do not start the next package. At the end, report to the user: what changed, the verification results, the screenshots from the visual tour (Appendix E), any deviation, and the next package with its recommended model.
3. Branch: use the branch the user names for the session. If none is named, ask. Do not open a pull request unless asked.
4. Keep the layers separate (`architecture_overview.md`, "Architectural Principles"). Formatting and layout live in `src/ui`. Selection criteria and change markers that need tests go in `src/application` as pure functions. Do not move calculations into React.
5. When a package changes behaviour or conventions, update `docs/ui-conventions.md` in the same package. The closeout package (UR-12) updates `architecture_overview.md` and `codex.md`.
6. If a step needs a design decision this plan does not make, stop and ask the user. Do not invent a pattern. Each package lists its own known stop conditions under "Stop and report if".

## 2. Model guide

The user asked for Claude model names on this plan. They map onto the classes in `AGENTS.md` as follows.

| Model | Use for | Class in `AGENTS.md` |
| --- | --- | --- |
| **Haiku** | Tightly bounded, mechanical edits from an explicit list, such as a string list or a token substitution table. Another model must review the result before the gate. | Structural (Luna), mechanical subset |
| **Sonnet** | Most packages: structural work, pure functions with tests, and UI wiring that copies a mockup and reuses the primitives from UR-4. | Structural (Luna), and UI wiring that reuses established components |
| **Opus** | Delicate or complex work: new interaction models (the spreadsheet grid), dense stateful screens where regressions are costly (Blocking), and final integration review. | UI-design (Sol), and primary-agent integration review |

## 3. Approved decisions

| Code | Decision |
| --- | --- |
| H-B | Two-row header. Row 2 never wraps at 1024 px or wider; Project/Scenario captions drop first, then those names truncate. Route shows its short name. |
| Surfaces | Three levels: work surface, supporting panel, inline note (Appendix B). |
| Actions | One primary button per panel; frequent actions visible; rare and destructive actions in "⋯"; row actions in a selection bar. Per-tab tables are in each package. |
| Route | Approved as mocked; Reverse stays visible on the Pattern editor. |
| R-A | Runtimes collapsible on the Trips tab; open state remembered per device. |
| HW-B + HW-X | Departs column and pinned left columns when headways are shown; mark the first cell where a headway changes. |
| SEL-1, SEL-2 | Select menu on the header checkbox; Pattern chip menu and Ctrl/⌘-click. SEL-3 deferred. |
| BL-A | Blocking side by side when unassigned Trips exist; rail when empty or collapsed by the planner. |
| Costing | Approved as mocked; field label "Inflation rate (%)". |
| Save rule | Standalone fields save on commit; tables and grouped forms use a save bar. |
| Grid | Spreadsheet cells; Enter moves down, Tab moves across. |
| Tokens | Approved with the mockup palette (Appendix A). |
| Type | Source Sans 3, bundled; TY-A (tabular digits, no monospaced face). |
| F1–F8 | All option A (Appendix C). |
| T1-A, T3 | Sentence case with lower-case domain terms in the interface; "inflation". |
| O-1 | Subtle text colour is #62707b (decided 2026-10-27). |
| Regenerate and undo | Decision 0046 (PR #30) is kept: Regenerate is never hidden or replaced by a saved undo, is disabled with a hint until a selected Trip has changed runtimes, and acts only on those Trips. Undo is a separate item listed only while `regenerationUndoApplies` is true. Only the placement changes (UR-6c). |

## 4. Open items for the user

These must be answered at the gate named. The plan states the default an agent applies if the user has not answered.

- **O-1 Subtle text contrast: decided.** The user chose **#62707b** on 2026-10-27 (5.09:1 on white, 4.52:1 on the page background). The mockups and screenshots show the earlier #7b8a95; use #62707b.
- **O-2 Selection bar position (gate after UR-6c).** The mockup puts the selection bar above the Trips table. With 138 rows, the bar scrolls out of view when the selected rows are far down. Option 1: keep it above the table, as approved. Option 2: also keep it in view by sticking it to the bottom of the window while the table is on screen. **Default: Option 1**; UR-6c captures a screenshot of the scrolled case for the user to judge. *Update (user request after UR-6c):* a third option was built: the bar is also pinned, compact, above the fixed duplicate heading row while it shows, so it scrolls with the headings and not the window bottom.
- **O-3 Editable runtimes of an hour or more (information only).** Editable runtime cells keep showing `:61`, because `1:01` already means one minute one second in the entry grammar. Totals and other display-only durations show `1:01`.

## 5. Rules for every package

1. **Tokens only.** No new raw colour, font size, spacing, or radius values in CSS after UR-2. Use the tokens in Appendix A. If a needed token is missing, stop and report.
2. **Sentence case.** All new or rewritten interface text uses sentence case with lower-case domain terms (Appendix D), even before UR-10 sweeps the rest.
3. **Accessible names.** Keep every existing accessible name unless the package says otherwise. When a package renames or moves a control, update the helper in `tests/ui/support/ui.ts` (created by UR-0), not individual specs, wherever the helper covers it.
4. **CSV and backup formats do not change.** The new display formatters (`src/ui/format.ts`) are for screens only. Do not edit `src/application/tripTableCsv.ts`, `src/persistence/csv.ts`, or the formatters they call.
5. **Preferences.** New per-device preferences use `readStoredRecord` from `src/ui/preferences.ts` and must tolerate missing or malformed values. Keys follow the pattern `transit-costing-tool.<name>.v1`.
6. **Verification for every package:** `pnpm typecheck`, `pnpm test`, `pnpm build`, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm test:ui` (omit the variable outside Claude Code cloud sessions). Then run the visual tour (Appendix E) and look at every screenshot. A new or changed browser spec must pass `--repeat-each=10 --workers=8` (see `codex.md`).
7. **Minimum width.** Every layout must work at 1024 px and 1440 px wide. The tour captures both.
8. **Browser tests and CI.** Follow section 5a.

## 5a. Browser tests and CI

GitHub runs two required checks on every pull request to `main` (`.github/workflows/ci.yml`): `verify` (frozen-lockfile install, typecheck, unit tests, build) and `browser` (Playwright with its bundled Chromium; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is not set there). Every UR package lands through its own pull request, and both checks must be green before the user merges it.

1. **Never skip, delete, or weaken a test to get green.** Do not add `test.skip`, `test.fixme`, or wider tolerances. The only exception is the visual tour, which is skipped by design unless `UI_TOUR=1`.
2. **Behaviour assertions stay; design-value assertions move with the design.** Where a spec asserts a value this plan changes (a font size, a control width, a header position), the package that makes the change updates the value to the new one in the same commit. It also names the spec and the old and new value in its report. Assertions about behaviour stay exactly as strict: alignment within 1 px, no nested vertical scroll, scroll restoration, single-line rows, and keyboard paths.
3. **Specs that assert design values today:**

   | Spec | What it asserts now | Package that may change it | What must stay |
   | --- | --- | --- | --- |
   | `standards-mode.spec.ts` | Root and table cell font size `14px` | UR-2 (the token keeps 14 px, so no change expected) | Standards mode, page language and title |
   | `trip-table-layout.spec.ts` | Pattern selector width ≤ 96.5 px and font size `11.2px`; scroll positions; duplicate heading widths | UR-6c (the selector becomes a chip), UR-8 (pinned columns) | Duplicate heading widths match within 1 px; heading y within 1 px; horizontal scroll sync; scroll restoration after a shift |
   | `runtime-table-layout.spec.ts` | From/To field widths ≤ 62.5 px; a 10 px border between To and the first segment | UR-7 (borderless grid cells) | From/To adjacent; segments after To; the table fits its region |
   | `workflow-section-layout.spec.ts`, `service-day-copy-layout.spec.ts` | Runtime and Trip action triggers inside their section headers; Shift drawer 320 px wide at the lower right | UR-6c (header actions change; the drawer is unchanged) | Header actions inside the header; drawer size and position |
   | `keyboard.spec.ts` | axe rules and menu keyboard paths | UR-5, UR-6c, UR-11 | All axe rules pass; every menu is keyboard-operable |
   | `unified-action-layer.spec.ts` | The Trips Actions menu contents, including PR #30's Regenerate and Undo tests | UR-6c | Every PR #30 assertion, re-expressed for the new placement (UR-6c acceptance) |

4. **Fonts make tests more stable.** Bundling Source Sans 3 (UR-2) removes the difference between the local Chromium and the CI runner's system fonts. After UR-2, rerun the four layout specs above with `--repeat-each=10 --workers=8` locally. In the pull request, report any value that differed between the local run and CI.
5. **New specs.** Each new spec passes `--repeat-each=10 --workers=8` before it is pushed (`codex.md`). Assert counts and states, not elapsed time.
6. **The tour never runs in CI.** `visual-tour.spec.ts` skips itself without `UI_TOUR=1`, writes only to `test-results/` (ignored by Git), and must not be made a required check.
7. **Test count.** Each package report states the browser test count before and after. A drop must be explained by a merged or replaced test, named in the report.

---

## 6. Package overview

The user-visible changes start at UR-2 (font and colours). UR-0, UR-1, UR-3 (except number text), and UR-4 change no layout.

| ID | Package | Model | Depends on | Gate after |
| --- | --- | --- | --- | --- |
| UR-0 | Test seams and visual tour | Sonnet | — | no (report only) |
| UR-1 | Split `App.tsx` and `styles.css` (no behaviour change) | Sonnet | UR-0 | no (report only) |
| UR-2 | Tokens and bundled Source Sans 3 | Sonnet (Haiku may do the colour substitution with review) | UR-1, O-1 answered | **yes: visual review** |
| UR-3 | Display formatters F1–F8 | Sonnet | UR-1 | no (report only) |
| UR-4 | Shared UI primitives | Sonnet | UR-2 | no (report only) |
| UR-5 | Application header (H-B) | Sonnet | UR-4 | **yes** |
| UR-6a | Route tab layout | Sonnet | UR-5 | no |
| UR-6b | Costing tab layout | Sonnet | UR-5, UR-3 | **yes (with 6a)** |
| UR-6c | Trips tab layout, Runtimes R-A, selection bar | Sonnet | UR-5, UR-3 | **yes (O-2)** |
| UR-6d | Blocking tab layout (BL-A) | Opus | UR-5, UR-3 | **yes** |
| UR-7 | Spreadsheet grid model and save bar on Runtimes | Opus | UR-6c | **yes** |
| UR-7b | Grid on Nodes and Pattern points | Sonnet | UR-7, UR-6a | no |
| UR-8 | Headways HW-B and HW-X | Sonnet | UR-6c | **yes** |
| UR-9 | Trip selection SEL-1 and SEL-2 | Sonnet | UR-6c | no |
| UR-10 | Terminology and sentence-case sweep | Haiku, reviewed by Sonnet | UR-6a to UR-9 | no |
| UR-11 | Accessibility quick wins | Sonnet | UR-10 | no |
| UR-12 | Integration review and closeout | Opus | all | **yes: final acceptance** |

UR-3 can run in parallel with UR-2 because it touches different files. UR-6a, 6b, 6c, and 6d own different files and can run in any order after UR-5. UR-8 and UR-9 both edit the Trips table, so run them one after the other.

---

## 7. Packages

### UR-0 Test seams and visual tour (Sonnet)

**Goal.** Make the browser tests independent of where controls sit, before anything moves. Add a screenshot tour for visual review. No production code changes.

**Read.** Section 5a, `tests/ui/support/*.ts`, a sample of specs (`trip-profile.spec.ts`, `blocking-workspace.spec.ts`, `costing-workspace.spec.ts`, `unified-action-layer.spec.ts`, including the two regeneration tests that PR #30 added), and `src/ui/MenuButton.tsx`.

**Owns.** `tests/ui/support/ui.ts` (new), `tests/ui/visual-tour.spec.ts` (new), and edits to existing specs that only replace direct selectors with helper calls.

**Steps.**
1. Create `tests/ui/support/ui.ts` with:
   - `scopeField(page, label)`, which returns the Locator of a scope selector. Labels use the new names: `'Route' | 'Day' | 'Direction' | 'Trip profile' | 'Blocking scenario' | 'View year'`. Map each to today's control: today these are `page.locator('.route-picker, .module-toolbar').getByLabel(<today's label>)`, where today's labels are `Trip Profile` and `Blocking Scenario`.
   - `runCommand(page, id)`, where `id` is one of the command IDs in the table below. Each entry records how to run the command today, for example "open the `Trip actions` menu, choose `Build trips…`". Later packages change only this table.
   - `region(page, id)`, which returns the panel Locator for `'unassignedTrips' | 'currentBlock' | 'runtimes' | 'trips' | 'blockingControls' | 'routeControls' | 'costingControls'`, mapped to today's `aria-label` values.
2. Replace direct uses in specs. This covers `.route-picker`, `.module-toolbar`, and `.context-bar` locators, and the menu-plus-item sequences listed in the command table. **Exception:** specs whose subject is the menu itself (`unified-action-layer.spec.ts`, and the menu parts of `keyboard.spec.ts`) keep their direct selectors. The packages that change those menus rewrite them.
3. Add `tests/ui/visual-tour.spec.ts` from Appendix E. It is skipped unless `UI_TOUR=1`.
4. Add the tour command to `codex.md` under "Browser tests…".

**Command table (initial).**

| ID | Today |
| --- | --- |
| `trips.build` | Trip actions › Build trips… |
| `trips.add` | Trip actions › Add trip… |
| `trips.shift` | Trip actions › Shift selected… |
| `trips.regenerate` | Trip actions › Regenerate selected… (always listed; Decision 0046) |
| `trips.undoRegeneration` | Trip actions › Undo last regeneration (N Trips) (separate item `undo-regeneration`, listed only while the undo applies) |
| `trips.changePattern` | Trip actions › Change pattern… |
| `trips.assignBlock` | Trip actions › Assign Block… |
| `trips.unassignBlock` | Trip actions › Unassign from Block… |
| `trips.delete` | Trip actions › Delete selected… |
| `trips.copyDay` | Trip actions › Copy Trips from day… |
| `trips.exportCsv` | Trip actions › Export Trips CSV |
| `trips.toggleHeadways` / `trips.toggleBands` / `trips.toggleRounding` | Trip actions › Show headways / Show runtime bands / Round displayed times |
| `runtime.addBand` / `runtime.copyDay` / `runtime.exportCsv` / `runtime.method.singleBand` / `runtime.method.segmentStart` | Runtime actions › … |
| `project.new` / `project.rename` / `project.delete` / `project.backup` / `project.restore` | Project actions › … |
| `scenario.new` / `scenario.rename` / `scenario.duplicate` / `scenario.delete` | Scenario actions › … |
| `route.new` / `route.rename` / `route.duplicate` / `route.exportCsv` / `route.delete` | Route actions › … |
| `blockingScenario.new` / `.rename` / `.duplicate` / `.delete` / `.exportCsv` | Blocking actions › … |
| `block.new` / `block.rename` / `block.notes` / `block.delete` / `block.addPullOut` / `block.addPullIn` / `block.reassignTrips` / `block.removeTrips` | Current Block actions › … |
| `unassigned.compatibleOnly` / `unassigned.clearFilters` | Unassigned Trip actions › … |
| `costing.exportCsv` | Costing actions › Export Costing CSV (ZIP) |

**Acceptance.**
- The full browser suite passes, with the same test count as before plus the skipped tour.
- `grep -rn "route-picker\|module-toolbar\|context-bar" tests/ui --include=*.spec.ts` finds nothing outside the two exception specs.
- `UI_TOUR=1 … playwright test tests/ui/visual-tour.spec.ts` writes 10 screenshots: five per width (Appendix E).

**Stop and report if** a spec cannot be expressed through a helper without changing what it asserts.

---

### UR-1 Split `App.tsx` and `styles.css` (Sonnet)

**Goal.** Move code into one file per workspace so later packages own distinct files. Behaviour, markup, class names, and accessible names stay identical.

**Read.** `src/ui/App.tsx` (about 1,600 long lines), `src/ui/importGraph.test.ts`, and `src/styles.css`.

**Target layout.**

```text
src/ui/App.tsx                    shell: state, header, tabs, notices, dialogs host (App only)
src/ui/shared/fields.tsx          Field, NumericCommit, DurationField, ClockField, RuntimeTimeInput, ServiceDayNameInput
src/ui/shared/icons.tsx           TrashIcon, CopyIcon
src/ui/shared/dialogs.tsx         NameDialogForm, ConfirmDialog, ShiftDiscardDialog, DiscardRouteDraftDialog, RouteNavigationDraftDialog
src/ui/route/RouteWorkspace.tsx   RouteWorkspace, PatternEditor, RouteEditImpactDialog
src/ui/trips/TripsWorkspace.tsx   TripsWorkspace
src/ui/trips/ScheduleTable.tsx    ScheduleTable, DraftTripRow, TripBlockAssignmentControl, formatTripTableClock, blockPillClass
src/ui/trips/RuntimeEditor.tsx    RuntimeEditor2 (keep the name), RouteRuntimeMethodDialog
src/ui/trips/dialogs.tsx          BuildTripsDrawer, RuntimeProfileDialog2, DeleteRuntimeProfileDialog, DeleteTripsDialog, RecalculationDialog,
                                  AnchorSelect, RuntimeDayCopyDialog, TripDayCopyDialog, BatchPatternChangeDialog, TripBlockAssignmentDialog,
                                  TripBlockUnassignmentDialog, CopyImpact, formatPreview* helpers
src/ui/blocking/BlockingWorkspace.tsx   (moved from src/ui/BlockingWorkspace.tsx)
src/ui/costing/CostingWorkspace.tsx     (moved from src/ui/CostingWorkspace.tsx)
src/ui/styles/base.css, shell.css, tables.css, dialogs.css, route.css, trips.css, blocking.css, costing.css
src/styles.css                    removed; src/main.tsx imports src/ui/styles/index.css, which imports the files above in today's order
```

Move each helper next to its only user. A helper with users in more than one file goes to `src/ui/shared/`. Move the test files with their modules and keep their names.

**Steps.**
1. Move code with copy-paste only. Do not rename, reformat, or "improve" anything. Add exports and imports as needed.
2. Split `styles.css` by the selectors' owners, **keeping rule order**. When in doubt, put a rule in `base.css` or `tables.css`; order in `index.css` must reproduce today's cascade.
3. Update the paths in `importGraph.test.ts` if they are hard-coded. The rule "`src/ui` imports nothing from `src/persistence`" must still hold.

**Acceptance.**
- Typecheck, unit tests, build, and the full browser suite all pass with no spec edits.
- The visual tour screenshots match the UR-0 set pixel for pixel, or differ only by anti-aliasing; compare them with an image diff.
- `git diff -M --stat` shows moves. No function body changes except for import lines.

**Stop and report if** a component closes over `App` state in a way that needs new props. List the props and propose them; do not restructure state.

---

### UR-2 Tokens and bundled Source Sans 3 (Sonnet; Haiku may do step 4 with review)

**Goal.** Introduce the approved tokens and font. Replace every raw value in CSS. The layout does not change.

**Read.** Appendix A, Decision 0047, section 5a, and the screenshots `screens/token-swatches.png` and `screens/route-tab.png`.

**Owns.** `src/ui/styles/*.css`, `src/main.tsx` (font import), `package.json`, and `pnpm-lock.yaml`.

**Steps.**
1. Add `@fontsource-variable/source-sans-3` at an **exact** version whose publish date is at least 14 days old. 5.3.1 was current on 2026-10-27. Import it once in `src/main.tsx`.
2. Create `src/ui/styles/tokens.css` exactly as in Appendix A, using the O-1 answer for `--color-text-subtle`, and import it first in `index.css`.
3. Set `:root` font-family and size from the tokens. Remove `Inter`. Add `font-variant-numeric: tabular-nums` to `table`, `input`, and `.shift-net` (a table of times must line up).
4. Replace every hex colour, `rgb()`, font size, and radius in `src/ui/styles/` with a token, using the role mapping in Appendix A ("How to map an existing colour"). Map by role, not by nearest colour. Keep the runtime-band and block-pill categorical colours as their own `--color-band-*` and `--color-block-*` tokens with their current values.
5. Spacing: replace padding, margin, and gap values with `--space-*` where the value is within 1 px of a step. Leave other values and list them in the report.

**Acceptance.**
- `grep -nE "#[0-9a-fA-F]{3,6}\b|rgba?\(" src/ui/styles/*.css` finds hex and rgb values only in `tokens.css`.
- `grep -n "font-size" src/ui/styles/*.css | grep -v "var(--font-size"` is empty outside `tokens.css`.
- Network panel: no request for a font to any other host; the font file is in `dist/assets` after `pnpm build`.
- Tour screenshots: Source Sans 3 in every screenshot; colours shift only slightly, and the layout does not change.
- All four checks pass.

**Gate.** The user compares the before and after tour screenshots.

---

### UR-3 Display formatters F1–F8 (Sonnet)

**Goal.** One presentation module that every screen uses for numbers, with unit tests from Appendix C.

**Owns.** `src/ui/format.ts` (new) and `src/ui/format.test.ts` (new), plus call-site edits in `src/ui/**`.

**Steps.**
1. Implement the functions in Appendix C. Reuse `formatServiceTime` (domain) and `roundCostingDisplay` (domain) inside them.
2. Replace the screen call sites:
   - Trips table run time, layover, deadhead, and headway: `formatDuration` (today `formatTripConnectionDuration` and `formatRuntimeDuration` for display-only cells).
   - Runtime band **totals**: `formatDuration`. Editable segment cells keep `formatRuntimeDuration` (O-3).
   - Blocking: `formatBlockingDuration`, `formatBlockingHours`, and `formatBlockingMiles` are replaced by `formatDuration`, `formatHours(…, 'daily')`, and `formatMiles`. Table cells drop the unit (F5-A) and the column headings gain "(h)" or "(mi)". The summary tiles keep the unit.
   - Costing: daily hours use `formatHours(…, 'daily')` (two decimals). Annual values use `formatHours(…, 'annual')` and money uses `formatMoney`.
   - Missing values: `MISSING` (`—`) and `INCOMPLETE` ("Incomplete", rendered with the warning text colour).
   - Pattern miles at rest: `formatMiles`. An input being edited shows the stored value unrounded.
3. Delete the `formatBlocking*` functions once unused, and update `blockingFormat.test.ts` to test through the new module.

**Acceptance.**
- `format.test.ts` covers every row of Appendix C.
- Existing browser specs that assert the old text are updated. List each changed expectation in the report, with old and new text.
- CSV files are byte-identical before and after. `tripTableCsv.test.ts` and `csv.test.ts` pass unchanged.

---

### UR-4 Shared UI primitives (Sonnet)

**Goal.** The components and CSS that every tab package reuses. No tab uses them yet.

**Read.** Appendix B, the mockup CSS in `mockups.html` (classes beginning `m-`), and the screenshots.

**Owns.** `src/ui/shared/surfaces.tsx`, `src/ui/shared/bars.tsx`, `src/ui/shared/ContextField.tsx`, `src/ui/shared/chips.tsx`, `src/ui/styles/surfaces.css`, and `src/ui/styles/bars.css`.

**Steps.** Implement the components and CSS exactly as specified in Appendix B, and restyle the shared button classes as described after the CSS. No browser spec is added here: nothing renders the primitives until UR-5, and each later package tests them in place.

**Acceptance.** Typecheck, unit tests, build, and the browser suite pass. Each component has a short comment stating its level or role. The only visible change on existing screens is the button restyle; the tour shows it, and nothing else differs from UR-2.

---

### UR-5 Application header H-B (Sonnet)

**Goal.** Replace today's top bar, the Project and Scenario row, and the module toolbars with the two-row header.

**Read.** `screens/header-hb-1024.png`, `screens/header-row2-1024.png`, `screens/route-tab.png` (top), `src/ui/MenuButton.tsx`, and the `App` render in `src/ui/App.tsx`.

**Owns.** `src/ui/App.tsx` (header), `src/ui/shell/AppHeader.tsx` (new), `src/ui/styles/shell.css`, and the toolbar parts of `BlockingWorkspace.tsx` and `CostingWorkspace.tsx` (each workspace renders its scope selectors into row 2 through a prop or a render slot; choose the smallest change and record it).

**Specification.**
- **Row 1** (`<header class="app-bar">`, 48 px): the application name (16 px bold, `--color-text`) with an 18 px square mark in `--color-accent`; then the primary tabs in `<nav aria-label="Primary">`, as buttons with unchanged names (Route, Trips, Blocking, Costing). The active tab has `aria-current="page"`, a 2 px `--color-accent` bottom border, and `--color-text`; inactive tabs use `--color-text-muted`. Then a spacer, then the status.
- **Status** (13 px, `--color-text-muted`, dot 8 px). In priority order:
  1. Read-only: "Read-only: open in another tab" (dot `--color-text-subtle`).
  2. Save failed: "Local save failed" (dot `--color-danger`).
  3. Saving: "Saving locally…" (dot `--color-accent`).
  4. Otherwise "Saved locally · backup N days old", or "· no backup yet" (dot `--color-ok`).

  The backup text uses `--color-warn` when it is older than 7 days or missing. Backup time comes from `LocalDataProtectionQueries` (already used by the Project menu). The text is not interactive.
- **Row 2** (`<section class="scope-bar" aria-label="Scope">`, minimum height 44 px, `--color-surface-2`, bottom border): the Project switcher, `›`, the Scenario switcher, a 1 px divider, the tab's scope selectors (`ContextField` from UR-4), a spacer, and the tab's "⋯" menu where one exists (Route actions on Route and Trips; Blocking actions on Blocking). On Costing, an "Export costing CSV" button sits in that position.
- **Project switcher.** A `MenuButton` whose trigger shows a small caption "Project" and the project name; its accessible name is "Project: <name>". Menu groups:
  1. Projects: one `menuitemradio` per project, then "New project…".
  2. "Rename project…".
  3. Project data: "Back up project (JSON)", with today's last-backup note and persistent-storage warning; then "Restore project from backup…".
  4. "Delete project…" (destructive).

  This replaces the Project `<select>` and the Project actions "⋯". Selecting a project goes through the same navigation guard as today (`requestRouteNavigation`).
- **Scenario switcher.** The same pattern: Scenarios (radio) and "New scenario…"; "Rename scenario…", "Duplicate scenario…"; "Delete scenario…".
- **Scope selectors per tab.** These stay native `<select>` elements, so keyboard behaviour and test labels hold. Labels follow T1-A.
  - Route: Route.
  - Trips: Route, Day, Direction.
  - Blocking: Route, Trip profile, Blocking scenario, Day.
  - Costing: Blocking scenario, Trip profile (read-only text), View year.
- **Route option text.** The route's short name when it has one and no other route shares it; otherwise "short — name". The `<select>` has `title` set to the full name.
- **No-wrap rule.** Row 2 has `flex-wrap: nowrap`.
  - The switcher group has `flex: 0 1 auto; min-width: 0`.
  - Each switcher name is an ellipsis span with `min-width: 64px`. Project `max-width` is 260 px and Scenario 220 px.
  - Scope fields have `flex: none`. Values that can be long (Route, Blocking scenario) have `max-width: 150px` with an ellipsis.
  - Below a viewport width of 1280 px, the switcher captions are visually hidden (keep them in the accessible name).
- Delete the `.context-bar`, `.route-picker`, `.module-toolbar`, and `.topbar` rules once unused. Update `tests/ui/support/ui.ts`: `scopeField` now finds selectors in `.scope-bar`, and the `project.*` and `scenario.*` commands open the switchers.

**Acceptance.**
- A new spec, `tests/ui/app-shell.spec.ts`, checks four things. Run it at 1024 px and 1440 px on each tab with the Federal BRT golden fixture.
  1. Row 2 is one line: its height is under 52 px, and its `scrollWidth` is at most its `clientWidth`.
  2. The status texts appear in the read-only, saving, and saved states. It is acceptable to reuse `single-tab.spec.ts` set-up.
  3. Project and Scenario menus are keyboard-operable (ArrowDown opens, Escape closes, focus returns).
  4. Choosing another project with unsaved Node edits asks first.
- Tour screenshots match `screens/header-hb-1024.png` in structure.
- `docs/ui-conventions.md`: replace the toolbar bullets with the H-B rules.

**Stop and report if** row 2 cannot fit on Blocking at 1024 px with the rules above. Report the measured widths and do not shrink the scope fields.

**Gate.** The user reviews the header on all four tabs.

---

### UR-6a Route tab layout (Sonnet)

**Read.** `screens/route-tab.png` and its action table (mockup section 3).

**Owns.** `src/ui/route/RouteWorkspace.tsx` and `src/ui/styles/route.css`.

**Specification.**
- **Top row.** A two-column grid (1.4fr / 1fr) of supporting panels:
  - "Route details": Route name, Short name, and Description on one line.
  - "Annual service days": four count fields, a "Total N of 365" line, and the note "Saves when you leave a field" in an `InlineNote`.

  Service-day *names* move into these fields' labels. Renaming a service day remains possible through the existing name input, shown as the field label in edit mode. **Stop and report** if that cannot be done without a new interaction; the fallback is to keep today's two-column Service days table as a supporting panel.
- **Bottom row.** A grid (0.9fr / 1.6fr) of work surfaces: Nodes (title with count) and Patterns.
- **Nodes.** Today's table. The "New node" button becomes the table's last row, "+ New node". The Save nodes and Discard changes buttons move into a `SaveBar` ("N unsaved changes in Nodes", "Discard", "Save nodes"), which shows only when there are changes.
- **Patterns.**
  - Left: the list grouped by direction, with group captions; "+ Add pattern" stays last.
  - Right: a header with the pattern name, then "Direction · N points · total mi", then **Reverse** (secondary button) and a "⋯" menu (`Pattern actions`: Duplicate pattern, Delete pattern…). Below that, the fields (Direction, Pattern name, Label), then the points table. "Add node" becomes the table's last row, "+ Add node to pattern".
  - The `SaveBar` reads "Review and save" and "Discard". It keeps today's impact review and validation.
- Update the `runCommand` entries for `pattern.duplicate` and `pattern.delete`, and update the specs that click the old buttons.

**Acceptance.** `route-editing.spec.ts`, `pattern-distance.spec.ts`, `route-save-race.spec.ts`, and `deletion-reviews.spec.ts` pass. The tour matches `route-tab.png` in structure. `docs/ui-conventions.md` "Phase 1 route definition" is updated.

---

### UR-6b Costing tab layout (Sonnet)

**Read.** `screens/costing-tab.png` and `src/ui/costing/CostingWorkspace.tsx`.

**Specification.**
- **"Costing assumptions" (work surface).** The subtitle reads "Shared by every blocking scenario in <Scenario>". A three-column form, labelled per Appendix D, with the field "Inflation rate (%)". The service-day summary line ends with "edit on the Route tab". The Save button moves into a `SaveBar` ("N unsaved changes · the estimate below uses the saved rate until you save", "Discard", "Save assumptions"). Discard is new: it restores the last saved values in the form. No write happens.
- **"Cost breakdown · <year>" (work surface).** The table uses F3, F5, and F6 headings and cell formats. The "No estimate yet" badge and its warning note use `InlineNote kind="warn"`. The rounding note becomes an `InlineNote`.
- **Exclusions and Yearly outlook** become side-by-side supporting panels.
- **Export.** "Export costing CSV" is a visible secondary button in header row 2. The Costing actions "⋯" menu is removed, because it held only this item.

- Add the glossary line from Appendix D to `docs/domain-glossary.md`.

**Acceptance.** `costing-workspace.spec.ts` and `costing-rules-from-service.spec.ts` pass, with label updates made through helpers. A new check: Discard restores the saved rate and writes nothing (assert the IndexedDB row is unchanged).

**Gate (with UR-6a).** The user reviews Route and Costing.

---

### UR-6c Trips tab layout, Runtimes R-A, selection bar (Sonnet)

**Read.** `screens/trips-runtimes-collapsed.png`, `screens/trips-runtimes-open.png`, mockup section 4, Decision 0046 (`docs/decisions/0046-separate-regenerate-and-undo-actions.md`), section 5a, and `src/ui/trips/TripsWorkspace.tsx`.

**Specification.**
- **Runtimes section (R-A).**
  - Collapsed, it is one line inside a work surface: a disclosure button ("▸ Runtimes", with `aria-expanded`), then the summary "<Pattern name> · <Runtime profile> · N bands · run time <min>–<max> · <method>". The run-time range comes from band totals and uses `formatDuration`. The method reads "band at segment start", "single band for trip", or "continuous blend (legacy)". Then an "Edit runtimes" button.
  - Expanded, it shows the Pattern and Runtime profile selectors, the "⋯" (`Runtime actions`: Calculation method (whole route) radio group, Copy runtimes from another day…, Export profile CSV), and the editor. "Add time band" becomes the table's last row, "+ Add time band".
  - The open state persists per device under `transit-costing-tool.runtimes-open.v1`. **Default: collapsed.**
  - While the editor has unsaved edits, "Close" is disabled, with the title "Save or discard runtime edits first".
  - The Discard and Save buttons that today appear in the header move to a `SaveBar` at the bottom of the section. UR-7 adds the grid behaviour.
- **Trips work surface header.** The title "Trips" and count; the "Trip profile" and "Blocking scenario" menu fields (today's MenuButtons, relabelled); a spacer; then:
  - a "View" menu (`menuitemcheckbox`: Show runtime bands, Show headways, Round displayed times);
  - an "Add trip" button;
  - a **"Build trips…"** primary button;
  - a "⋯" menu (`Trip actions`: Undo last regeneration (N trips), Copy trips from another day…, Export trips CSV). The Undo item keeps Decision 0046 exactly: it is a separate item listed only while `regenerationUndoApplies(…)` is true, is never shown disabled for that reason, is disabled while a write runs or a Shift is staged, and runs `undoRegeneration()` unchanged.
- **Selection bar** (`SelectionBar`). Shown above the table while one or more trips are selected: "N trips selected", then Shift…, Change pattern…, Regenerate…, Assign block…, Unassign…, Delete… (danger), Clear. Each button keeps the disabled rules and titles of today's menu item. Selection changes still go through `requestShiftScopeChange`.
- **Regenerate… (Decision 0046 kept).** The button is always present in the selection bar and is never hidden or replaced while an undo is saved. It is disabled, with the title "Select trips with changed runtimes.", until a selected trip has changed runtimes; with "Discard the staged shift first." while a Shift is staged; and while a write runs. It opens the review for `selectedChangedRuntimeTripIds` only, so select-all stays safe. Copy the `disabled`, `title`, and `onSelect` expressions from today's `regenerate` menu item; do not rewrite them.
- **"Run times have changed" notice.** Add a "Select these trips" button (secondary, small) that selects every visible trip with changed runtimes, using `requestShiftScopeChange`. This keeps Regenerate one click away now that it is no longer in a menu that is always visible.
- **Change pattern with one trip selected** uses today's single-trip review (`changeTripPattern`, signed over the trip, target pattern, and target profile). With more than one, it uses the batch dialog. This replaces the per-row Pattern `<select>`.
- **Pattern column.** A `Chip` showing the pattern's Label (`directionLabel`) when set, otherwise the pattern name with a leading "<Direction>: " removed. The chip's `title` is the full name. Remove the per-row `<select aria-label="Trip pattern">`; the draft Add-trip row keeps its select.
- **Block column.** A `BlockPill`: neutral background, a dot in the block's existing hashed colour, and the block number as text. The assignment menu behaviour is unchanged.
- Update the `runCommand` entries for all `trips.*` commands, and add an `openRuntimes(page)` helper. Specs that edit runtimes call it first.

**Acceptance.**
- All Trips specs pass (the `trips-*`, `trip-*`, `shift-drawer`, `add-trip-draft`, and `stale-trip-reasons` specs, among others).
- New checks: the open state persists across reload; Close is disabled while dirty; the selection bar appears and disappears with the selection; Change pattern with one trip opens the single-trip review; "Select these trips" selects exactly the trips marked "Run times changed".
- **PR #30 regression guard.** Rewrite the two regeneration tests in `unified-action-layer.spec.ts` for the new placement and keep every assertion:
  1. With no regeneration yet, no Undo item exists.
  2. After one regeneration, Undo (1 trips) is enabled in Trip actions, and Regenerate… is present but disabled when the selected trip no longer has changed runtimes.
  3. Select-all enables Regenerate…, and its review lists only the two trips with changed runtimes.
  4. The second regeneration replaces the undo (Undo (2 trips)).
  5. The undo survives a reload and restores the earlier times.
  6. After an undo, the Undo item is gone.
- `regenerationUndoApplies` unit tests in `tripsWorkspaceView.test.ts` pass unchanged.
- `docs/ui-conventions.md`: rewrite the Trips Actions bullet, which since PR #30 describes Regenerate and Undo in the menu, for the new placement. Keep its rules. In `docs/decisions/0046-separate-regenerate-and-undo-actions.md`, change the header line "Placement amended by Decision 0047 (planned)" to "(implemented)".
- The fixed duplicate heading row (Decision 0035) still matches the table's columns after the Pattern column change: `trip-table-layout.spec.ts` passes.
- Capture one extra tour screenshot with rows 120 to 125 selected and the page scrolled to them, for O-2.

**Gate.** The user reviews the Trips tab and answers O-2.

---

### UR-6d Blocking tab layout BL-A (Opus)

**Read.** `screens/blocking-unassigned-side.png`, `screens/blocking-rail-empty.png`, mockup section 5, `src/ui/blocking/BlockingWorkspace.tsx`, Decisions 0020, 0021, 0025, and 0042.

**Specification.**
- **Top area** (`.blocking-top`): a CSS grid.
  - **Side mode:** `minmax(420px, 34%) minmax(0, 1fr)`. Today's Unassigned trips table is unchanged: columns, sorting, column filters, compatible-only filter, and Assign buttons.
  - **Rail mode:** `46px minmax(0, 1fr)`.
- **Which mode.**
  - Rail when the unassigned list for the Route and Day is empty, or when the planner collapsed it. Side otherwise.
  - The collapse button "◂" sits in the Unassigned header (`aria-label` "Collapse unassigned trips"). The rail is a button (`aria-label` "Expand unassigned trips, N"), with the count badge in `--color-ok` when 0 and `--color-warn` when N > 0.
  - The manual collapse persists under `transit-costing-tool.blocking-unassigned-collapsed.v1`. When it is collapsed and trips become unassigned, it stays collapsed and the badge shows N in the warning colour.
  - The column width animates over 200 ms unless `prefers-reduced-motion`.
- **Unassigned trips header.** The title, the count, the "Compatible only" filter as a visible toggle button (`aria-pressed`), "Clear filters" when any filter is set, and the collapse button. The "Unassigned Trip actions" menu is removed if both of its items are now visible.
- **Unassigned selection bar.** "N selected", then the primary button "Assign to Block <label>", then Clear. This replaces today's assign path for selected rows; the per-row Assign button stays.
- **Current block header.**
  - The block selector (today's MenuButton); a subtitle "N trips · <start>–<end> · Revenue <h> · Layover <%>" using the formatters; a "New block" button; and a "⋯" menu (`Current Block actions`: Rename block…, Edit notes…, Delete block…).
  - "Add pull-out…" and "Add pull-in…" become table rows ("+ Add pull-out" first, "+ Add pull-in" last), shown only when that activity is missing.
  - A selection bar for selected block trips offers Remove from block… and Move to block… (today's "Remove Trips…" and "Reassign Trips…").
- **Findings.** "No current issues." and the mileage note become `InlineNote`s (ok and warn).
- **Day summary.** A supporting panel, "<Day> summary · N blocks", above the Blocks table, as a 7-cell stat strip: Revenue, Running, Platform, Layover, Deadhead, Revenue miles, Platform miles. Values use F3 and F4 with units; Incomplete shows in the warning colour.
- **Blocks table.** Headings gain units (F5-A) and the footer reads "Total · N blocks". The current block's row keeps today's highlight.

**Acceptance.**
- `blocking-workspace.spec.ts`, `blocking-presentation.spec.ts`, and `blocking-rules.spec.ts` pass after helper updates.
- New checks: the rail appears when the last unassigned trip is assigned; it expands and collapses by keyboard; the collapse persists across reload; the side layout returns when a trip is unassigned (unless manually collapsed).
- At 1440 px the Current block table shows all columns without horizontal scroll in side mode. **Stop and report** with screenshots if it cannot, and propose which columns to narrow; do not drop columns.

**Gate.** The user reviews Blocking with and without unassigned trips.

---

### UR-7 Spreadsheet grid model and Runtimes save bar (Opus)

**Read.** `screens/save-bar-and-grid.png`, the grid script in `mockups.html` (search for `drawGrid`, `startEdit`, and `commit`), `RuntimeEditor.tsx`, and `src/domain/durations.ts` (`parseRuntimeDuration` and friends).

**Goal.** A reusable keyboard grid applied to the Runtimes editor.

**Specification.**
- **Hook.** Add `src/ui/shared/useGridNavigation.ts`, exposing:
  - `useGridNavigation({ rowCount, colCount, isEditable(r, c), onCommit(r, c, text): string | undefined /* error */ })`;
  - which returns `{ activeCell, editing, cellProps(r, c), inputProps, message }`.
  - Use a roving tabindex: one cell has `tabIndex=0` and the others `-1`. Cells have `role="gridcell"` and the table has `role="grid"` with an `aria-label`.
- **Keys at rest.**
  - The arrow keys move.
  - Enter or F2 starts editing with the current text selected.
  - A printable key starts editing with that character.
  - Backspace or Delete starts editing empty.
  - Tab and Shift+Tab move across within the row, and leave the grid at the row's ends.
  - Home and End go to the first and last cell of the row.
- **Keys while editing.**
  - Enter commits and moves down; Shift+Enter commits and moves up.
  - Tab commits and moves right; Shift+Tab commits and moves left.
  - Escape cancels.
  - Blur commits, or cancels if the entry is invalid.
- **Invalid entry.** The cell stays in edit mode with `aria-invalid`, a `--color-danger` outline, and the message from the domain parser shown under the grid in a live region. The texts are the same as today's.
- **Edited cells.** Cells that differ from the saved profile show the corner mark from the mockup (`--color-warn-border`). The `SaveBar` shows "N unsaved changes in Runtimes".
- **Apply to Runtimes.** Apply this to From, To, and every segment cell. Copy-band and delete-band stay as row buttons. "+ Add time band" stays the last row and adds a band, then focuses its first cell.
- **Parsing and saving.** The editor keeps calling the same domain parse and save functions as today. The UI does not parse durations itself.

**Acceptance.**
- A new spec, `tests/ui/runtime-grid.spec.ts`, covers every key above, invalid entry, discard, save, and tab-away with unsaved edits (the existing guard asks).
- `runtime-table-layout.spec.ts` passes.
- `keyboard.spec.ts` axe checks pass on the Trips tab with the grid open.
- The new spec passes `--repeat-each=10 --workers=8`.

**Gate.** The user tries the grid in the running app (`pnpm dev`).

### UR-7b Grid on Nodes and Pattern points (Sonnet)

Apply `useGridNavigation` to the Nodes table (Name, Short, Notes; Type stays a select reached with Tab) and to the Pattern points table (Cumulative mi; the Node column stays a select). Same acceptance pattern as UR-7, with a smaller spec. Service-day count fields stay ordinary inputs that save on commit. Add the inline "✓ Saved" note (`InlineNote kind="ok"`, 1.8 s) after a successful commit.

---

### UR-8 Headways HW-B and HW-X (Sonnet)

**Read.** `screens/trips-headways-hwb-hwx.png`, Decision 0034, `src/application/tripsWorkspaceView.ts` (`calculateTimepointHeadways`), and `ScheduleTable.tsx`.

**Specification.**
- **Change markers.** In the application layer, extend the headway view with `changed: boolean` per cell. A cell is changed when its headway and the previous headway in the same column are both defined and differ. Cover it with unit tests in `tripsWorkspaceView.test.ts`, including a column where some trips skip the timepoint.
- **Departs column.** When Show headways is on, add a "Departs" column after Pattern showing the trip's first scheduled time (`formatClock`, bold). It is not shown when headways are off.
- **Pinned columns.** The selection, Pattern, and Departs (when shown) columns use `position: sticky` with cumulative `left` offsets and `--color-surface` backgrounds; selected rows use `--color-selection`. The last pinned column has a 1 px right shadow. The fixed duplicate heading row (Decision 0035) must pin the same columns at the same offsets.
- **Marker style.** A headway cell with `changed` gets a 3 px inset left bar in `--color-warn-border` and a `--color-warn-soft` background.
- **Display.** Headway cells use `formatDuration`, so headways read `:15` and `:07:30` rather than `0:15`. The first trip at a timepoint keeps showing its clock time, as today.

**Acceptance.**
- Unit tests for `changed`.
- A browser check on the golden fixture: with headways on, the Departs column exists and its heading stays aligned in the duplicate heading row after scrolling right by 600 px.
- The rows that the transition from one headway to the next marks are visibly marked; the spec asserts the class on at least one cell.

**Stop and report if** the duplicate heading row cannot pin the same columns within `ScheduleTable`'s structure. Pinned columns then move to a follow-up Opus package; ship Departs and HW-X without pinning.

**Gate.** The user reviews headways on the golden fixture.

---

### UR-9 Trip selection SEL-1 and SEL-2 (Sonnet)

**Read.** `screens/trips-select-menus.png`, mockup section 4c, and the selection code in `TripsWorkspace.tsx` (`selectedTripIds`, `selectionAnchorId`, `onToggle`, `onSelectAll`).

**Specification.**
- **Pure helper.** Add `src/application/tripSelection.ts`:
  - `tripIdsMatching(trips, criterion)`, where `criterion` is `{ kind: 'pattern', patternId }`, `{ kind: 'unassigned', assignedTripIds }`, or `{ kind: 'runtimeChanged', changedTripIds }`;
  - `invertSelection(allIds, selectedIds)`;
  - `combineSelection(current, ids, mode: 'replace' | 'add' | 'remove')`.

  Unit tests in `tripSelection.test.ts`. This module is the seat for SEL-3 later.
- **SEL-1.** The header checkbox keeps toggling all on click. A caret button beside it (`aria-label` "Select trips by…") opens a MenuButton:
  1. "Select all (N)", "Select none", "Invert selection".
  2. By pattern: one item per pattern in the direction, "<pattern name> (count)".
  3. By status: "Not assigned to a block (N)", disabled when no Blocking scenario is selected; "Run times have changed (N)".

  Choosing replaces the selection. Choosing while holding Ctrl or ⌘ adds to it; read `event.ctrlKey || event.metaKey` from the click. MenuButton must pass the event to `onSelect`, a small signature extension. No "Select by rule…" item.
- **SEL-2.**
  - Clicking a Pattern chip opens a small menu: "Select all N on <pattern>", "Add them to the selection", "Remove them from the selection". The chip becomes a button with `aria-haspopup="menu"`.
  - Ctrl-click or ⌘-click on a chip adds that pattern's trips without opening the menu.
  - Shift-click on row checkboxes keeps range selection.
- All selection changes go through `requestShiftScopeChange`, so a staged Shift still asks first.

**Acceptance.** Unit tests for the helper. A browser spec selects by pattern (65 trips on the golden fixture's Wagon Road to Evans), adds a second pattern with the modifier, inverts, and confirms a staged Shift asks before the selection changes.

---

### UR-10 Terminology and sentence-case sweep (Haiku, reviewed by Sonnet)

**Goal.** Apply Appendix D everywhere in `src/ui/**` and in the user-facing message strings that screens show verbatim.

**Steps.**
1. Change every string in Appendix D.
2. Search `src/ui` for remaining Title Case user-visible strings, and change them by rule T1-A. A search pattern such as `>[A-Z][a-z]+ [A-Z][a-z]+` and `label: '[A-Z][a-z]+ [A-Z]` helps. Do not change identifiers, `ruleId`s, message keys, CSV headers, or file names.
3. Update the specs that assert the old text. Most should already go through helpers.

**Review (Sonnet).** Read the full diff. Check that no CSV header, identifier, or test-only string changed, and run the full suite.

**Acceptance.** All suites pass. The report lists every changed string (old → new).

---

### UR-11 Accessibility quick wins (Sonnet)

- **Focus.** A `:focus-visible` outline on every interactive element: 2 px `--color-focus`, offset 2 px; grid cells use an inset ring.
- **Hit targets.** Icon buttons are at least 24 × 24 px.
- **Contrast.** Extend the axe run in `keyboard.spec.ts` to include the `color-contrast` rule on all four tabs and fix every finding.
- **Colour plus text.** Every coloured status also has text or an icon. Block pills already carry the number after UR-6c.

**Acceptance.** axe reports no violations for the extended rule set on the four tabs and the open dialogs.

---

### UR-12 Integration review and closeout (Opus)

- Review the full diff since UR-0 for layer violations, raw style values, missing helper use, and inconsistent component use.
- Run every check and the tour at both widths. Compare the tour with the screenshots in `docs/implementation/ui-revision/screens/` and list the differences.
- Update `architecture_overview.md` (the UI Structure section: header rows, surface levels, save rule, grid, and the minimum width), `codex.md` (current implementation status), and `docs/ui-conventions.md` (a consolidated "Interface revision" section; delete superseded bullets).
- Set Decision 0047 to "Accepted (implemented)" and write `docs/implementation/ui-revision-closeout.md`.

**Gate.** User acceptance.

---

## 8. Deferred (record only)

- SEL-3, rule-based selection: a dialog with conditions on pattern, first departure or time at a timepoint (before, after, between), headway at a timepoint (greater than, less than, equal to), run time, block, and runtime change. It is combined with "and", shows a live match count, and offers replace or add. Build it on `tripSelection.ts`.
- Command palette and keyboard shortcuts.
- Glossary tooltips beside domain terms.
- Team readiness: a first-run screen with the sample project, in-app help, a "What's new" note, a project-sharing flow, and a settings page.
- Dark mode: a second set of token values.
- Density toggle, workflow-step tabs, and a left sidebar: dropped.
- A "Fit with Block" column in Unassigned trips. It appears in the mockup with illustrative values but is not part of BL-A.

---

## Appendix A. Tokens (`src/ui/styles/tokens.css`)

```css
/* Decision 0047. Component CSS uses only these names. */
:root {
  /* Surfaces */
  --color-canvas: #eef2f4;        /* page background */
  --color-surface: #ffffff;       /* work surface, inputs */
  --color-surface-2: #f6f8f9;     /* supporting panel, table headings, scope bar */
  --color-sunken: #edf1f3;        /* chips, disabled fill */
  --color-border: #d2dbe0;        /* controls and panels */
  --color-border-soft: #e4e9ec;   /* row and divider lines */
  /* Text */
  --color-text: #17212b;
  --color-text-muted: #536574;    /* labels, secondary text */
  --color-text-subtle: #62707b;   /* captions, placeholders (O-1, decided) */
  /* Action and selection */
  --color-accent: #1b668d;        /* primary button, active tab, links */
  --color-accent-strong: #134f6d; /* primary hover */
  --color-accent-soft: #e4eff5;   /* selected menu item, selected list item */
  --color-focus: #2a7cb3;         /* focus ring */
  --color-selection: #e9f2f8;     /* selected table rows */
  /* Status */
  --color-warn: #7f520f;          /* warning text, Incomplete */
  --color-warn-soft: #fdf3df;     /* warning fill, save bar */
  --color-warn-border: #e2c07a;   /* warning border, edited cell mark */
  --color-danger: #a3342b;        /* error and delete text */
  --color-danger-soft: #fbeceb;
  --color-ok: #2c6a3a;
  --color-ok-soft: #e6f2e8;
  /* Categorical colours: copy today's values from styles.css (runtime bands, block pills) */
  /* --color-band-1 … --color-band-n, --color-block-1 … --color-block-n */

  /* Type */
  --font-family: 'Source Sans 3 Variable', 'Segoe UI', system-ui, sans-serif;
  --font-size-caption: 11.5px;  /* switcher captions, menu group labels */
  --font-size-label: 12px;      /* field labels, table headings */
  --font-size-note: 13px;       /* inline notes, status, subtitles */
  --font-size-body: 14px;       /* body, cells, controls */
  --font-size-title: 16px;      /* work surface titles, app name */
  --font-size-page: 20px;       /* dialog titles, empty-state headings */
  --font-weight-regular: 400;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --line-height: 1.35;

  /* Space, size, shape */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px;
  --control-height: 30px;
  --row-height: 30px;
  --radius-control: 5px;
  --radius-panel: 7px;
  --radius-pill: 999px;
  --shadow-popover: 0 8px 24px rgb(20 35 45 / 16%);
  --shadow-drawer: -10px 0 24px rgb(20 35 45 / 12%);
}
```

**How to map an existing colour.** Decide what the colour *does*, then pick the token. The hex values below are examples taken from `styles.css` on 2026-10-27, not a complete list:

| Today's use | Token |
| --- | --- |
| Page background (`#f3f6f8`) | `--color-canvas` |
| Panel and input background (`#fff`) | `--color-surface` |
| Table heading background (`#e8eef1`) and light tints such as `#e7eef1` and `#f4f7f8` | `--color-surface-2` |
| Disabled fill (`#e7ecef`) | `--color-sunken` |
| Borders (`#c6d0d5`, `#c3cfd6`, `#9eafb8`, `#b9c7ce`, `#d6dee2`) | `--color-border`; use `--color-border-soft` for row lines |
| Body text (`#17212b`, `#1d3644`) | `--color-text` |
| Label and secondary text (`#536a77`, `#3c4f5b`, `#405968`, `#49606e`, `#46606f`, `#627480`, `#334a58`, `#3d4d59`, `#244255`) | `--color-text-muted` |
| Primary action (`#1b668d`), active tab (`#24485d`), focus (`#265d7c`) | `--color-accent` (tab and button) or `--color-focus` (outline) |
| Selected and info tints (`#e7f2f7`) | `--color-accent-soft` or `--color-selection` (rows) |
| Warning text (`#6b4d1c`, `#835521`, `#634716`, `#754d12`) | `--color-warn` |
| Warning fills (`#fff9ee`, `#fff8e9`, `#fff9ed`, `#fff4d9`) | `--color-warn-soft` |
| Warning borders and icons (`#d8bd8a`, `#c28a2e`, `#bd7b22`) | `--color-warn-border` |
| Error text (`#a42f27`, `#9b3028`, `#8b312a`) | `--color-danger` |
| Error fills and borders (`#fff8f7`, `#fff5f4`, `#e0aaa5`, `#d8b1ad`) | `--color-danger-soft` (fill), `--color-danger` (border) |

Any colour that fits none of these rows goes in the package report with a proposed token. Do not add a token without the user's approval at the UR-2 gate.

## Appendix B. Primitives (UR-4)

```tsx
// src/ui/shared/surfaces.tsx
/** Level 1: the panel the planner works in. One primary action at most, in `actions`. */
export function WorkSurface(props: { title: string; count?: number; subtitle?: ReactNode; actions?: ReactNode; footer?: ReactNode;
  ariaLabel?: string; className?: string; children: ReactNode }): JSX.Element;
/** Level 2: context and summaries. No card border. */
export function SupportPanel(props: { title: string; aside?: ReactNode; ariaLabel?: string; children: ReactNode }): JSX.Element;
/** Level 3: one line of status or guidance. */
export function InlineNote(props: { kind?: 'info' | 'warn' | 'ok'; children: ReactNode; live?: boolean }): JSX.Element;

// src/ui/shared/bars.tsx
/** Shown only while `changeCount > 0` or `visible`. Sticky to the bottom of its WorkSurface. */
export function SaveBar(props: { message: string; saveLabel: string; busy?: boolean; saveDisabled?: boolean; saveTitle?: string;
  onSave: () => void; onDiscard: () => void }): JSX.Element;
/** Shown while one or more rows are selected. `role="toolbar"`, labelled "<noun> actions". */
export function SelectionBar(props: { count: number; noun: string; onClear: () => void; children: ReactNode }): JSX.Element;

// src/ui/shared/ContextField.tsx
/** Inline-labelled control for the header's scope row. Wraps a native <select> or a read-only value. */
export function ContextField(props: { label: string; children: ReactNode; maxWidth?: number }): JSX.Element;

// src/ui/shared/chips.tsx
export function Chip(props: { text: string; title?: string; onClick?: (event: MouseEvent) => void; ariaLabel?: string }): JSX.Element;
export function BlockPill(props: { label: string; colorToken: string }): JSX.Element; // dot + label, neutral background
```

```css
/* src/ui/styles/surfaces.css */
.work-surface { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-panel); min-width: 0; position: relative; }
.work-surface__header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: 10px 14px; border-bottom: 1px solid var(--color-border-soft); }
.work-surface__title { margin: 0; font-size: var(--font-size-title); font-weight: var(--font-weight-bold); }
.work-surface__count, .work-surface__subtitle { color: var(--color-text-muted); font-size: var(--font-size-note); }
.work-surface__actions { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); }
.work-surface__body { padding: var(--space-3) 14px; }
.support-panel { display: grid; gap: var(--space-2); min-width: 0; align-content: start; }
.support-panel__title { margin: 0; font-size: var(--font-size-body); font-weight: var(--font-weight-bold); color: var(--color-text-muted); }
.support-panel__body { background: var(--color-surface-2); border: 1px solid var(--color-border-soft); border-radius: 6px; padding: 10px var(--space-3); }
.inline-note { display: flex; gap: 6px; align-items: baseline; color: var(--color-text-muted); font-size: var(--font-size-note); }
.inline-note--warn { color: var(--color-warn); }
.inline-note--ok { color: var(--color-ok); }
/* icon: 15px circle; "i" (info), "!" on --color-warn-soft (warn), "✓" (ok); see .m-note in mockups.html */

/* src/ui/styles/bars.css */
.save-bar { position: sticky; bottom: 0; display: flex; align-items: center; gap: 10px; padding: var(--space-2) 14px;
  background: var(--color-warn-soft); border-top: 1px solid var(--color-warn-border); border-radius: 0 0 var(--radius-panel) var(--radius-panel); }
.save-bar__message { flex: 1; color: var(--color-warn); font-weight: var(--font-weight-semibold); }
.selection-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: var(--space-2);
  background: var(--color-selection); border: 1px solid var(--color-accent-soft); border-radius: 6px; }
.chip { display: inline-flex; align-items: center; height: 22px; padding: 0 var(--space-2); border-radius: 4px; background: var(--color-sunken);
  font-size: 12.5px; font-weight: var(--font-weight-semibold); white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
.block-pill { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 var(--space-2) 0 6px; border-radius: var(--radius-pill);
  border: 1px solid var(--color-border); background: var(--color-surface); font-size: 12.5px; font-weight: var(--font-weight-semibold); }
.block-pill__dot { width: 8px; height: 8px; border-radius: 50%; }
```

The font size `12.5px` in chips and pills is the one exception to the scale and matches the mockup. Add it as `--font-size-chip: 12.5px` in UR-2 if the reviewer prefers no exceptions.

Buttons keep the existing classes. UR-4 restyles them: `.primary` uses `--color-accent` with white text; secondary uses `--color-surface` and `--color-border`; `.ghost` has no border and `--color-accent` text; danger text uses `--color-danger`; all have height `--control-height` and radius `--radius-control`.

## Appendix C. Display formats (`src/ui/format.ts`)

| Function | Rule | Examples (input → output) |
| --- | --- | --- |
| `formatClock(seconds, { round? })` | F1-A. Delegates to `formatServiceTime`; seconds shown only when non-zero; times past 24:00 kept | 14880 → `4:08`; 18270 → `5:04:30`; 93660 → `26:01` |
| `formatDuration(seconds)` | F2-A. Under 3600: `:MM` plus `:SS` when present. 3600 or more: `h:mm` plus `:SS`. Negative values get a leading `−` (U+2212). `undefined` → `—` | 300 → `:05`; 450 → `:07:30`; 3180 → `:53`; 3660 → `1:01`; 3900 → `1:05`; −60 → `−:01`; 0 → `:00` |
| `formatHours(hours, scope)` | F3-A. `'daily'`: two decimals with thousands separators. `'annual'`: whole with separators. Rounds with `roundCostingDisplay`. `undefined` → `INCOMPLETE` | 311.594, daily → `311.59`; 79455.6, annual → `79,456`; 1234.5, daily → `1,234.50` |
| `formatMiles(miles)` | F4-A. Two decimals with separators. `undefined` → `INCOMPLETE` | 2.233962 → `2.23`; 4488.5 → `4,488.50` |
| `formatMoney(usd, { cents? })` | F6-A. Whole dollars in tables; `cents: true` for the hourly rate | 1234567.4 → `$1,234,567`; 142.5 with cents → `$142.50` |
| `formatPercent(value)` | F8-A. One decimal | 16.3 → `16.3%`; 3 → `3.0%` |
| `withUnit(text, unit)` | F5-A. For summary tiles only | (`311.59`, `h`) → `311.59 h` |
| `MISSING`, `INCOMPLETE` | F7-A. `—` when a value cannot exist; `Incomplete` when input is missing. Render `INCOMPLETE` with class `value-incomplete` (`--color-warn`, semibold) | — |

Use `Intl.NumberFormat('en-US', …)`, so separators do not depend on the browser locale. The app reports US dollars and miles.

## Appendix D. Interface text (T1-A, T3)

| Today | New |
| --- | --- |
| Unassigned Trips | Unassigned trips |
| Current Block | Current block |
| Costing Assumptions · Cost Breakdown · Yearly Outlook | Costing assumptions · Cost breakdown · Yearly outlook |
| Weekday Summary (and other day summaries) | Weekday summary |
| Operating cost per Revenue Hour (USD) | Operating cost per revenue hour (USD) |
| First Year of Service · Future Years | First year of service · Future years |
| Inflation Rate (%) | Inflation rate (%) |
| Trip Profile (toolbar label) · Profile (Trips header) | Trip profile |
| Profile (Runtimes header) | Runtime profile |
| Blocking Scenario (labels, menu items) | Blocking scenario |
| Run Time · Next Trip | Run time · Next trip |
| Add Time Band | Add time band |
| Run Times Have Changed | Run times have changed |
| Regenerate selected… (menu item) | Regenerate… (selection bar; UR-6c) |
| Undo last regeneration (N Trips) | Undo last regeneration (N trips) |
| Select Trips with changed runtimes. (hint) | Select trips with changed runtimes. |
| Build Trips (drawer title) | Build trips |
| Copy Trips from day… | Copy trips from another day… |
| Copy runtimes from day… | Copy runtimes from another day… |
| Export Trips CSV · Export Route CSV (ZIP) · Export Blocking CSV (ZIP) · Export Costing CSV (ZIP) | Export trips CSV · Export route CSV (ZIP) · Export blocking CSV (ZIP) · Export costing CSV |
| Assign Block… · Unassign from Block… | Assign block… · Unassign… |
| New Block… · Rename Block… · Delete Block… | New block… · Rename block… · Delete block… |
| New / Duplicate / Rename / Delete Blocking Scenario… | New / Duplicate / Rename / Delete blocking scenario… |
| Remove Trips… · Reassign Trips… | Remove from block… · Move to block… |
| Backup project JSON · Restore project JSON | Back up project (JSON) · Restore project from backup… |
| New project · New scenario · New route | New project… · New scenario… · New route… (each opens a dialog) |
| Delete project · Delete scenario · Delete route | Delete project… · Delete scenario… · Delete route… |
| Save Pattern · Delete Pattern | Review and save (save bar) · Delete pattern… |
| Discard changes | Discard |
| Delete Pattern? · Delete Trip Profile? (dialog titles) | Delete pattern? · Delete trip profile? |
| Method (all Patterns on this Route) | Calculation method (whole route) |

The glossary (`docs/domain-glossary.md`) gains one line under the Costing assumptions entry: "The interface labels annual escalation as **Inflation rate (%)**."

## Appendix E. Visual tour (`tests/ui/visual-tour.spec.ts`)

```ts
// Screenshot tour for visual review. Skipped unless UI_TOUR=1. Output: test-results/ui-tour/<width>/<tab>.png
import { test, expect } from '@playwright/test';
import { openGoldenTrips } from './support/tripsWorkspace';

test.skip(!process.env.UI_TOUR, 'Set UI_TOUR=1 to capture the tour.');

for (const width of [1024, 1440]) {
  test(`tour at ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    await openGoldenTrips(page);
    const out = (name: string) => `test-results/ui-tour/${width}/${name}.png`;
    await page.screenshot({ path: out('trips'), fullPage: false });
    for (const tab of ['Route', 'Blocking', 'Costing'] as const) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: out(tab.toLowerCase()), fullPage: true });
    }
    await page.getByRole('button', { name: 'Trips', exact: true }).click();
    await expect(page.locator('.schedule-table tbody tr').first()).toBeVisible();
    await page.screenshot({ path: out('trips-full'), fullPage: true });
    // Packages add states here, for example runtimes open, headways on, a selection, Blocking with unassigned trips.
  });
}
```

Run it with:

```bash
UI_TOUR=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium pnpm exec playwright test tests/ui/visual-tour.spec.ts
```

Each package that changes a screen adds the states it introduced to the tour and attaches the before and after screenshots to its report.
