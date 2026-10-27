# Decision 0046: Interface revision design system and layout

- Status: Accepted (design); implementation pending under `docs/implementation/ui-revision-plan.md`
- Date: 2026-10-27
- Amends: Decision 0034 (headway display gains a pinned Departs column and change marking), Decision 0028 (toolbar layout), and the "Shared workflow and table hierarchy" conventions in `docs/ui-conventions.md`. Supersedes nothing else.

## Context

A UI/UX review in October 2026 found inconsistent visual hierarchy (every panel shares one card style), 168 distinct colours, 21 font sizes, and 7 corner radii in `src/styles.css`, an undeclared font (Inter is named but never loaded), three different save placements, frequent actions hidden in "⋯" menus, and number formats that disagree between tabs. The user reviewed three rounds of mockups (`docs/implementation/ui-revision/mockups.html`) and approved the decisions below.

## Decisions

1. **Design tokens.** All colours, font sizes, spacing, radii, and control heights are CSS custom properties defined once (`src/ui/styles/tokens.css`). Component rules use only token names. The approved palette is listed in the plan, Appendix A.
2. **Typeface.** Source Sans 3 (variable), bundled with the application through `@fontsource-variable/source-sans-3`; no network font request. Tabular digits are applied to every numeric cell (TY-A: no separate monospaced face for times).
3. **Header (H-B).** Row 1: application name, primary tabs, local-save status with backup age. Row 2: Project › Scenario switchers (each a menu that also holds that level's lifecycle actions), then the active tab's scope selectors. Row 2 never wraps at 1024 px or wider: the Project and Scenario captions drop first, then those two names truncate with an ellipsis; the Route selector shows the short name.
4. **Surface levels.** Level 1 work surface (white panel, 16 px title, panel actions in its header), Level 2 supporting panel (muted 14 px title over a tinted box, no card border), Level 3 inline note (icon and text, no box). The accent colour is reserved for the active tab, primary buttons, and the selected item.
5. **Action placement.** Each panel shows its most frequent action as a labelled button (one primary button per panel at most), keeps rare and destructive actions in its "⋯" menu, and shows actions on selected rows in a selection bar.
6. **Save rule.** A standalone field (name, service-day count, selector) saves when it is committed and shows a brief "Saved". A table or form whose edits must be reviewed or saved together (Nodes, Pattern, Runtimes, Costing assumptions) collects edits and shows a save bar at the bottom of that panel. Impact reviews and navigation guards are unchanged.
7. **Spreadsheet cells.** Editable grids use borderless cells with a focus outline, arrow-key movement, type-to-replace, Enter or F2 to edit, Enter to commit and move down, Tab to commit and move right, and Escape to cancel. Edited cells are marked until saved.
8. **Runtimes (R-A).** The Runtimes section on the Trips tab collapses to a one-line summary and expands in place; the open or closed state is a per-device preference.
9. **Headways (HW-B, HW-X).** While "Show headways" is on, a Departs column (the Trip's first scheduled time) is shown beside Pattern. The selection, Pattern, and Departs columns stay pinned during horizontal scroll. The first cell whose headway differs from the previous headway at that timepoint is marked. Headway calculation (Decision 0034) is unchanged.
10. **Selecting Trips (SEL-1, SEL-2).** The header checkbox opens a Select menu (all, none, invert, by Pattern with counts, by status). Clicking a Pattern chip offers select, add, or remove for that Pattern; Ctrl-click (⌘-click) adds directly. Shift-click keeps range selection. Rule-based selection (SEL-3) is deferred.
11. **Blocking (BL-A).** Unassigned trips and Current block stay side by side whenever unassigned Trips exist. When none remain, or when the planner collapses it, the Unassigned panel becomes a narrow rail in the same column; the collapse choice is a per-device preference.
12. **Number formats.** F1-A clock times (`4:08`, `5:04:30`, `26:01`); F2-A displayed durations (`:53` under an hour, `1:01` from an hour); F3-A hours (two decimals daily, whole annual with separators); F4-A miles (two decimals, separators, full value while editing); F5-A units in table headings, beside numbers in summary tiles; F6-A whole dollars in tables, cents for the hourly rate; F7-A `—` for not applicable and amber "Incomplete" for missing input; F8-A one-decimal percentages. CSV output formats are unchanged.
13. **Terminology (T1-A, T3).** Interface text uses sentence case, with domain terms lower-cased mid-label ("Blocking scenario", "Unassigned trips"). The documentation keeps its capitalised domain terms. "Profile" is always qualified ("Runtime profile", "Trip profile"). The Costing field is "Inflation rate (%)"; the glossary records it as the interface name for annual escalation.

## Consequences

- Editable runtime cells keep the `:MM` entry grammar for values of an hour or more (`:61`), because `1:01` already parses as one minute and one second. Only display-only durations (totals, run time, layover, headway) use `h:mm` from an hour.
- Browser tests that reach controls by class names or menu items that move must go through shared helpers in `tests/ui/support/` (plan package UR-0), so later layout changes update one helper instead of many specs.
- `src/ui/App.tsx` is split into per-workspace files before the layout work (plan package UR-1), so each later package owns distinct files.
- The minimum supported viewport width for the no-wrap rule is 1024 px.
- Dark mode, density options, a command palette, glossary tooltips, and rule-based selection remain deferred.
