# Interface revision closeout (UR-12)

- Status: Integration review complete; awaits user acceptance (the UR-12 gate)
- Date: 2026-10-27
- Plan: `docs/implementation/ui-revision-plan.md`
- Decision: `docs/decisions/0047-interface-revision-design-system.md` (now "Accepted (implemented)")
- Branch: `claude/amazing-planck-r3uzr4`, based on `main` at `fd42c5d` (PR #30)

## 1. What the revision delivered

| Package | Result | Gate state before UR-12 |
| --- | --- | --- |
| UR-0 | Test helpers in `tests/ui/support/ui.ts`; visual tour `tests/ui/visual-tour.spec.ts` | Done |
| UR-1 | `App.tsx` and `styles.css` split by workspace and area | Done |
| UR-2 | `src/ui/styles/tokens.css`; bundled Source Sans 3 | Awaits visual review |
| UR-3 | Display formatters F1–F8 in `src/ui/format.ts` | Done |
| UR-4 | Shared primitives in `src/ui/shared/` | Done |
| UR-5 | Two-row header (H-B) | Awaits gate |
| UR-6a, UR-6b | Route and Costing layouts | Await shared gate |
| UR-6c | Trips layout, collapsible Runtimes, selection bar (with the pinned compact copy chosen for O-2) | Awaits gate |
| UR-6d | Blocking layout BL-A | Awaits gate |
| UR-7, UR-7b | Spreadsheet grid on Runtimes, Nodes, and Pattern points | Await gate |
| UR-8 | Headway change markers, pinned Departs column | Awaits gate |
| UR-9 | Select menu and Pattern chip menu | Report only |
| UR-10 | Sentence-case sweep | Report only |
| UR-11 | Focus outline, 24 px targets, axe `color-contrast` and `target-size` | Report only |

The UR-12 user acceptance covers every gate in this table that is still open.

## 2. Integration review

The review read the full diff `fd42c5d..HEAD` (123 files; 55 under `src/`).

### 2.1 Layer separation

- No file under `src/application` or `src/domain` imports React, `src/ui`, or IndexedDB code. The new application modules (`draftChangeCounts.ts`, `tripSelection.ts`, and the additions to `tripsWorkspaceView.ts`) import only domain types and are covered by unit tests.
- No file under `src/ui` imports the persistence layer (`importGraph.test.ts` enforces this).
- The application modules that import `../persistence/csv` did so before Phase UR; Phase UR did not add any.
- CSV and backup formatters are unchanged. `src/ui/format.ts` is used only by screens.
- Finding, not changed: React still holds no calculations, but selection-bar availability rules (for example, when **Regenerate…** is enabled) are expressions inside `TripsWorkspace.tsx` that call application functions. This matches the pattern before Phase UR.

### 2.2 Raw style values

- No raw colour value exists outside `tokens.css`.
- Fixed in UR-12: four values that had an exact token (two 8 px gaps → `--space-2`; 4 px radii → `--radius-control`; 6 px radii → `--radius-panel`).
- Remaining raw values added during Phase UR, not changed because no token holds them and snapping them would move layouts the user has already reviewed:
  - Spacing between scale steps: 6 px (selection bar gap and count margin, inline label gaps in `ContextField` and menu fields, save-status and switcher gaps, inline-note gap), 10 px (save-bar gap, work-surface header padding, support-panel body padding, rail gap), 14 px (work-surface padding, save-bar padding, `.blocking-top` gap), 18 px and 30 px (`.app-shell` padding, kept from before UR-2).
  - Font sizes: 12.5 px on `.chip` and `.block-pill`; 10 px on the inline-note icon glyph.
  - Control geometry: the sort-button padding (`3px 28px 3px 5px`) that clears the 24 px column-filter button, and the 3 px Trips selection-header padding.
- Recommendation: either add `--space-1-5: 6px` and `--space-2-5: 10px` (and keep 14 px as a work-surface inset token), or snap the values to the scale in one reviewed package. Both are design decisions for the user.

### 2.3 Helper use in browser specs

- Fixed in UR-12: three spec lines that reached scope selectors without `scopeField` (`costing-workspace.spec.ts`, `blocking-presentation.spec.ts` twice), and a stale comment in `ui.ts` ("(N Trips)" → "(N trips)").
- Specs that name a menu directly do so to assert its contents or keyboard path, which the helper does not cover. They are left as they are.

### 2.4 Component use

- Every work surface, supporting panel, inline note, save bar, selection bar, chip, and block pill is built with the shared components, with one reasoned exception: the Runtimes section writes the WorkSurface markup by hand because its title is a disclosure button. `WorkSurface` accepts only a text title.
- The Blocking Pattern pills (`pattern-pill`) do not use `Chip`, and they show the Pattern's full name, not its Label as the Trips chip does (`tripPatternChipText`). See finding F-3.

### 2.5 Defects found and fixed in UR-12

| ID | Defect | Fix |
| --- | --- | --- |
| D-1 | At 1440 px the Unassigned trips headings Start, From time, To time, and End were overlapped by their sort icons: UR-11's 24 px filter button left about 25 px for the label. | The filter button moves to the heading's top-right corner and the label uses the full width below it (`blocking.css`). axe `target-size` still passes. |
| D-2 | Pattern points' Cumulative mi showed the stored value at rest (`2.233962`), against F4-A. | The cell shows `formatMiles` at rest (`2.23`); editing still starts from the full value. |
| D-3 | The Node Type select showed stored values in lower case (`timepoint`), against T1-A; UR-10 missed it. | The options keep their values and show "Timepoint", "Terminal", "Garage", "Other". |

Spec values changed with D-2 (plan section 5a, rule 2):
- `route-grid.spec.ts`: the Cumulative mi cell after entering `4.5` reads `4.50` (was `4.5`).
- `pattern-distance.spec.ts`: "the editor contains no `0.00`" became "the editor header reads `miles incomplete`", because a zero Cumulative mi now reads `0.00`. The segment-miles assertions are unchanged.

## 3. Verification

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Clean |
| `pnpm test` | 56 files, 811 tests passed |
| `pnpm build` | Built |
| Browser suite before UR-12 fixes | 216 passed, 2 skipped (the tour) |
| Browser suite after UR-12 fixes | 216 passed, 2 skipped (unchanged; UR-12 adds no tests) |
| Changed specs, `--repeat-each=10 --workers=8` | `pattern-distance`, `route-grid`, `blocking-presentation`, `costing-workspace`: 220 of 220 passed |
| Visual tour, 1024 px and 1440 px | Captured (13 screenshots per width) and inspected |

## 4. Tour compared with the reference screenshots

The references are in `docs/implementation/ui-revision/screens/`. They were drawn with illustrative data (Pattern Labels such as "Wagon Rd–Evans", backup age, a saved rate); the tour uses the golden fixture, which has no Pattern Labels, no backup, and no saved rate. Differences caused only by that data are not listed.

| Screen | Difference from the reference | Assessment |
| --- | --- | --- |
| Header | Matches H-B. The Project caption is hidden and the name truncated at 1024 px, as specified. | Matches |
| Route | Annual service days stay a two-column table with editable names, not the four-field strip (recorded deviation in UR-6a). The Pattern list repeats the direction in each name ("Northbound: …") under the direction caption. Cumulative mi is left-aligned; the reference right-aligns it. Empty Short cells are blank, not "—". Below 1100 px the panels stack. | Deviations noted; F-4 |
| Trips | Pattern chips show the full name less the direction ("Wagon Road to Evans") because the fixture has no Labels. The header checkbox has the "Select trips by…" caret (UR-9), which the reference predates. The selection bar shows **Regenerate…** (disabled with its hint), which the reference omits. | Matches the approved decisions |
| Trips, headways | Departs column bold and pinned; change markers as specified; first row shows clock times in the accent colour. | Matches |
| Blocking | Unassigned trips headings carry sort and filter buttons, which the reference does not show. Pattern pills show the full name and are cut to "Northbound:" in the 34% panel (F-3). The Blocks table puts each sort icon at the left edge of its right-aligned column, so it reads as belonging to the column before (F-5; unchanged from before Phase UR). | Findings F-3, F-5 |
| Costing | Service day names in the breakdown are right-aligned and bold; the reference left-aligns them. Otherwise matches, including "Inflation rate (%)". | F-6 |

## 5. Open findings for the user

| ID | Finding | Recommendation |
| --- | --- | --- |
| F-1 | Raw spacing and font-size values between the token steps (section 2.2). | Decide: add tokens, or snap to the scale. A Sonnet package either way. |
| F-2 | Several gates remain open (section 1). | Review them as part of this acceptance. |
| F-3 | Blocking Pattern pills show the full Pattern name and ignore the Label; at 1440 px the Unassigned column shows only the direction prefix. | Use the Trips chip rule (Label, else the name without the direction prefix) and keep the full name in the tooltip. Blocking has no Direction column, so decide whether the direction stays visible (for example "NB"). |
| F-4 | Route: Cumulative and Segment mi are left-aligned. | Right-align numeric grid cells (a one-rule change). |
| F-5 | Blocks table sort icons sit at the left of right-aligned headings. | Put the icon beside the label. Pre-existing. |
| F-6 | Costing breakdown service-day names are right-aligned. | Left-align the first column. |

## 6. Documentation updated in UR-12

- `architecture_overview.md`: "UI Structure" describes the header rows, surface levels, save rule, grid, selection, styling, minimum width, and files; the Phase UR roadmap entry is marked implemented.
- `docs/ui-conventions.md`: a consolidated "Interface revision" section at the top (tokens and formats, surfaces and actions, interface text, accessibility, and one subsection per tab and for the grid), including the UR-8, UR-9, UR-10, and UR-11 conventions that had not been recorded. Superseded bullets in the older sections were rewritten or deleted (workflow-section styling, the Runtime header Save and Discard, the Phase 4 Blocking Actions menus, the disabled selection actions).
- `docs/decisions/0047-interface-revision-design-system.md`: status "Accepted (implemented)".
- `codex.md`: current implementation status.
