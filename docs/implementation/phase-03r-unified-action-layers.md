# Phase 3R Implementation Plan: Unified Action Layers

## Status

Packages 3R-A and 3R-B were implemented on 2026-09-14. Package 3R-C completed integration and acceptance verification on 2026-09-16. Decision 0018 is implemented. Phase 3R is closed; Phase 4 remains deferred and is not part of this plan.

## Objective

Consolidate the Runtimes and Trips controls into consistent section-header action layers, replace the inline Trip Shift tool with a staged right-docked drawer, and preserve all accepted Phase 2R and Phase 3 domain behavior.

## Scope

### Included

- one header action layer for Runtimes;
- one header action layer for Trips;
- sectioned Runtime and Trip Profile menus;
- a Runtime Actions menu containing Route-wide Day copy;
- a Trips Actions menu containing schedule commands;
- conditional Runtime `Discard` and `Save` controls;
- a staged, non-modal Shift drawer with timetable preview, Undo, Redo, Discard, and Done;
- keyboard, focus, accessibility, responsive, visual, and regression verification;
- updates to reusable UI conventions and implementation status documents.

### Excluded

- any change to Runtime, Trip, Trip-profile, Day-copy, regeneration, deletion, or batch Pattern-change domain rules;
- combined Runtime-and-Trip copying;
- Phase 4 Blocking work;
- top-level Scenario or backup/export menu consolidation;
- Route-tab Node and Pattern action-menu consolidation;
- mobile-specific redesign beyond safe wrapping and drawer fallback;
- a new component library or visual theme.

## Fixed interaction design

### Shared section-header grammar

Each `workflow-section` retains one `section-title` row. The heading remains at the upper-left. The complete action layer is placed at the upper-right in the same row and vertically centered with the heading. Do not place an additional profile row below the heading.

At desktop widths, controls remain on one row in this order:

```text
Runtimes                                      [Pattern selector] [Profile ▾] | [Add] [Discard] [Save] | [Actions ▾]
Trips                                                       [Profile ▾] | [Actions ▾]
```

`Discard` and `Save` are absent when no Runtime draft exists. They appear immediately after `Add` when the editor becomes dirty. The separators are visual spacing or a one-pixel neutral rule; they are not text glyphs and are not focusable.

The action layer may wrap below the title only when the complete row cannot fit. On wrap, it occupies the section width, remains left-to-right in the same control order, and has an 8px gap from the title block. It must not overlap the heading, table, status indicator, or section edge. Horizontal scrolling is permitted only as the last fallback below 680px.

### Dimensional and visual requirements

Use existing tokens as the source of truth:

- application typeface: `Inter, ui-sans-serif, system-ui, sans-serif`;
- base type size: 14px;
- section title: 1rem, using the existing weight and color;
- button and field minimum height: 30px;
- ordinary button padding: 4px 9px;
- ordinary button radius: 3px; field radius: 2px;
- adjacent action-button gap: 5px;
- context-control gap: 8px;
- gap between logical groups: 8px, plus the optional neutral separator;
- section padding: 12px on every side;
- section-title-to-content spacing: 8px;
- focus ring: existing 3px blue outline with 1px offset;
- menu offset from trigger: 3px;
- menu padding: 4px;
- minimum menu width: 210px; widen only enough to prevent command-label wrapping;
- menu shadow, border, colors, primary treatment, subtle-danger treatment, and disabled treatment: reuse existing styles without new variants.

Do not reduce controls below 30px high to force one-line placement. Do not use icon-only buttons for Profile or Actions triggers. Profile and Actions triggers use the same height, border, padding, type size, caret, hover treatment, and focus treatment.

### Menu construction and behavior

Use accessible custom menu-button popovers rather than native `select` elements for mixed record selection and commands. Each trigger exposes expanded state and menu ownership. Menus support Up/Down, Home/End, Enter/Space, Escape, and outside-click dismissal. Escape and selection return focus to the trigger.

Within each Profile menu:

1. show a non-interactive `Profiles` group label;
2. list saved profiles first;
3. mark the selected profile with a checkmark and `aria-checked` or equivalent menu-radio semantics;
4. insert a separator;
5. list lifecycle commands in the specified order.

Profile names truncate with an ellipsis only after the menu reaches a practical desktop maximum width. A tooltip or accessible name exposes the complete value. Selection and commands must be distinguishable without relying on color.

Disabled commands remain visible when their absence would make the menu unstable or hide why an operation is unavailable. Provide a concise accessible explanation through the existing tooltip/title convention. Destructive commands remain last and use the existing confirmation behavior.

### Runtimes action layer

Order and content:

1. Pattern selector, retaining the current selected Pattern and accessible `Pattern` label;
2. `Profile: {selected name} ▾` menu trigger;
3. group separation;
4. visible `Add` button;
5. conditional `Discard` and primary `Save` buttons;
6. group separation;
7. `Actions ▾` menu trigger.

The Runtime Profile menu contains:

```text
Profiles
✓ {selected profile}
  {other profiles}
────────────
New profile…
Rename profile…
Copy profile…
Delete profile…
```

The Runtime Actions menu contains:

```text
Copy from day…
```

`Copy from day…` retains the accepted target-first, all-usable-Patterns-on-the-Route behavior and existing impact dialog. Do not describe it as copying only the selected Pattern or profile.

`Add` continues to add a Runtime time band. It does not open the Actions menu. `Discard` and `Save` retain current local-draft behavior. If the conditional controls cause wrapping, preserve the documented order instead of moving them elsewhere.

### Trips action layer

Order and content:

1. `Profile: {selected name} ▾` menu trigger;
2. group separation;
3. `Actions ▾` menu trigger.

The Trip Profile menu contains:

```text
Profiles
✓ {selected profile}
  {other profiles}
────────────
New profile…
Rename profile…
Copy profile…
Delete profile…
```

If Trip-profile creation is not currently exposed in the accepted application contract, omit `New profile…` rather than inventing behavior. Record the deviation at the Package 3R-B gate.

The Trips Actions menu contains:

```text
Build trips…
Add trip…
Regenerate selected…
Shift selected…
Change pattern…
Copy from day…
────────────
Delete selected…
```

Selection-dependent commands remain visible and disabled when no Trips are selected. Existing stale-Runtime indicators remain visible in the section header or immediately above the table; they must not become menu items. Existing dialogs and previews retain their accepted scope and warning content.

### Shift selected Trips drawer

Selecting `Shift selected…` closes the Actions menu and opens a non-modal drawer fixed to the right edge of the application viewport. Do not use a centered modal or a full-screen backdrop because the timetable must remain visible.

Desktop geometry:

- width: 380px;
- maximum width: 40vw;
- top edge: below the persistent application top bar and tabs, without covering their navigation controls;
- right and bottom edges: flush with the application viewport;
- internal padding: 16px;
- left border: one-pixel neutral border;
- shadow: equivalent in strength to the existing menu/dialog shadow;
- background: white;
- stacking: above workflow content and below blocking confirmation dialogs.

Below 680px, use `width: min(100vw, 380px)` and permit the drawer to cover the timetable. The drawer body scrolls vertically if needed. Keep its title and footer actions visible while its body scrolls.

Drawer content order:

```text
Shift selected Trips                                      [Close]

[− Back] [Minutes field] [+ Forward]

[Undo] [Redo]

{selected count} · {net staged shift}

[Discard] [Done]
```

- `Back` and `Forward` are text-and-symbol buttons, not unexplained icon buttons.
- Minutes is a positive whole-number field using the existing 30px field height and tabular numerals.
- The field defaults to 1 and retains its valid value while the drawer remains open.
- Each Back or Forward action appends one staged operation and updates the timetable preview without persistence.
- Preview rows use the existing selected-row treatment plus a concise staged-shift status that does not rely on color.
- Undo and Redo operate only on the staged operation sequence in the open drawer.
- The summary states the number of selected Trips and the net earlier/later shift. Mixed net results, if supported by repeated selection changes, must be reported explicitly rather than collapsed into a misleading single value.
- `Discard` abandons the complete staged sequence and closes the drawer without writes.
- `Done` commits the net result once, atomically, then clears selection and temporary history according to the accepted Trips workflow.
- The top-right Close control behaves like Discard when no staged changes exist. With staged changes, it opens the concise existing-style discard confirmation.
- Escape follows the same rule as Close.
- Route, Day, Direction, Trip Profile, tab, or selected-row changes are blocked while staged changes exist and invoke the same discard decision. They must not silently alter drawer scope.
- After Discard, focus returns to the Trips Actions trigger. After Done, focus returns to the schedule region or the Actions trigger according to the existing successful batch-action convention.
- A stale preview prevents Done and asks the user to discard/reopen against current Trips. Do not silently recalculate against changed source records.

## Work-package sequence and model boundaries

```text
3R-A Staged Shift contracts and deterministic behavior — Luna
  -> structural verification gate
  -> mandatory stop before model shift
3R-B Unified action-layer UI/UX — Terra
  -> hands-on UI verification gate
  -> mandatory stop before model shift
3R-C Integration and acceptance — Primary agent
```

Do not start or delegate the next package automatically. At each gate, report changed files, verification results, deviations, and unresolved decisions. A model shift requires explicit user approval.

## Package 3R-A: Staged Shift contracts

### Recommended model

Luna. This package is bounded domain, application, persistence, and deterministic test work. Luna must not modify React layout, CSS, fixtures, menu behavior, drawer behavior, wording, focus, or responsive design.

### Communication constraint

Be parsimonious. Report contracts, changed files, tests, and blockers. Avoid explanatory narrative that does not affect implementation or review.

### File ownership

- Trip batch-shift domain request, preview, and result types;
- application ports and orchestration;
- stale-source signature calculation;
- atomic repository command wiring if the current command cannot satisfy one final staged commit;
- deterministic domain, application, and persistence tests;
- structural documentation only when a contract changes.

### Ordered subtasks

#### 3R-A-1: Characterize current Shift behavior

- Confirm signed shift calculations, Trip ID preservation, manual-shift provenance, selection scope, and current Undo/Redo ownership.
- Identify the minimum reusable domain command for previewing and committing one net staged shift.
- Confirm no schema migration is required.

#### 3R-A-2: Define staged preview and commit contracts

- Define a request scoped to Scenario, Route, Trip profile, Day, Direction, and selected Trip IDs.
- Return original and preview scheduled points, selected count, signed net seconds, validation findings, and a source signature.
- Keep operation-stack Undo/Redo state in the UI; keep authoritative time propagation, eligibility, and source signatures outside React.

#### 3R-A-3: Implement atomic commit

- Commit one reviewed net shift across every selected Trip.
- Preserve Trip IDs and accepted manual-shift provenance.
- Recheck the source signature immediately before writing.
- Reject mixed missing/stale selections without partial writes.
- Prove cancellation and forced transaction failure perform no writes.

#### 3R-A-4: Verify boundaries

- Confirm existing immediate-shift callers remain compatible until Package 3R-B replaces them, or provide an explicit migration note.
- Confirm no UI wording or presentation logic enters domain/application modules.

### Required verification

- focused staged-shift tests;
- all-or-nothing multi-Trip commit tests;
- stale-preview rejection;
- forced transaction rollback;
- signed earlier/later preview values;
- Trip ID and provenance preservation;
- TypeScript typechecking;
- complete Vitest suite;
- production build.

### Gate

Package 3R-A is complete. The available UI contract is `TripShiftRequest`, `TripShiftPreview`, `previewStagedTripShift`, and `applyStagedTripShift`. Stop here. Recommend Terra for Package 3R-B. Do not modify UI files or begin 3R-B until the user approves the model shift.

## Package 3R-B: Unified action-layer UI/UX

### Required model

Terra. This package owns component composition, placement, measurements, styling, menu behavior, drawer behavior, focus, accessibility, responsive behavior, fixtures, visual review, and planner-facing wording. It must consume 3R-A contracts and must not recreate authoritative Shift, copy, regeneration, or impact calculations in React.

### Communication constraint

Be parsimonious. Report visible decisions, changed files, verification evidence, and blockers. Do not add unnecessary explanatory text to the interface or the handoff.

### File ownership

- Trips workspace React components and UI-only state;
- shared menu-button and drawer components where reuse is justified;
- stylesheet changes;
- Playwright fixtures and UI tests;
- reusable UI-convention documentation.

### Ordered subtasks

#### 3R-B-1: Record current geometry

- Capture the Runtimes and Trips sections at representative wide desktop, 1100px, and 680px viewport widths.
- Add focused fixtures for both header action layers, open Profile menus, open Actions menus, dirty Runtime state, and the open Shift drawer.
- Preserve the accepted data-grid widths and section treatment.

#### 3R-B-2: Build the shared menu-button primitive

- Implement the menu keyboard, focus, dismissal, group-label, separator, checked-selection, disabled, and destructive-item rules in this plan.
- Reuse it for both Profile menus and both Actions menus.
- Do not use separate visual implementations for Runtimes and Trips.

#### 3R-B-3: Consolidate Runtimes

- Move Pattern, Profile, Add, conditional Discard/Save, and Actions into the upper-right header action layer in the exact documented order.
- Remove the former profile-action row and absolute Runtime toolbar.
- Wire every existing lifecycle and Day-copy operation without changing scope or confirmation behavior.
- Verify clean, dirty, missing-profile, long-name, and narrow-width states.

#### 3R-B-4: Consolidate Trips

- Move Trip Profile selection/lifecycle and all schedule commands into the upper-right header action layer.
- Remove the former Trip-profile row, visible five-button command row, More menu, and inline Shift tool.
- Preserve selection-dependent enablement, stale-Runtime status, destructive confirmations, copy previews, and batch Pattern-change previews.
- Verify empty timetable, populated timetable, selected rows, long profile names, and narrow-width states.

#### 3R-B-5: Implement the Shift drawer

- Implement the fixed geometry, control order, staged operation history, table preview, status, discard guard, stale response, and focus behavior specified above.
- Keep timetable scrolling and row inspection usable while the drawer is open.
- Do not persist until Done.

#### 3R-B-6: Accessibility and visual verification

- Verify complete keyboard operation without pointer input.
- Verify menu and drawer trigger names, expanded state, checked profile, disabled explanations, focus return, live preview status, and discard confirmation.
- Verify all controls meet the 30px minimum height and spacing requirements.
- Verify the two section headers use the same typography, Profile trigger, Actions trigger, separators, menu rows, and edge buffers.
- Verify no control is closer than 12px to a workflow-section edge and no wrapped row overlaps content.
- Visually inspect wide desktop, 1100px, 680px, long-profile-name, dirty Runtime, open-menu, and open-drawer states.

### Required verification

- TypeScript typechecking;
- complete Vitest suite;
- focused Playwright menu, geometry, responsive, and Shift-drawer tests;
- production build;
- keyboard and accessibility review;
- browser visual inspection;
- user verification of Runtime menus, Trip menus, staged Shift preview, Undo/Redo, Discard, Done, and scope-change guard.

### Gate

Package 3R-B is complete. It adds one shared accessible menu-button primitive, unified Runtime and Trip header action layers, conditional Runtime draft actions, and the staged right-docked Shift drawer. Runtime reverse-copy remains available in the Profile menu to preserve the accepted lifecycle behavior. `New profile…` is intentionally absent from the Trip Profile menu because no accepted Trip-profile creation command exists. TypeScript, 119 Vitest tests, 7 Playwright tests, the production build, keyboard review, and 1280px/680px visual review passed. User verification remains required for menus and the staged Shift flow. Stop here. Do not begin 3R-C or make structural corrections that change accepted behavior. If integration exposes a structural deficiency, recommend a bounded Luna correction for user approval.

## Package 3R-C: Integration and acceptance

### Responsibility

Primary agent. Do not delegate automatically.

### Ordered subtasks

1. Confirm profile selection, profile lifecycle, editing commands, schedule commands, and Route-wide commands remain correctly scoped.
2. Confirm React owns only menu/drawer state and staged operation history, not authoritative time propagation or stale-source calculations.
3. Confirm every former visible command remains reachable, named consistently, and covered by keyboard navigation.
4. Confirm Runtimes and Trips share visual primitives and measurable geometry without duplicating domain behavior.
5. Run the complete automated suite, typechecking, production build, reload, accessibility review, and final visual review.
6. Update architecture, UI conventions, decisions, roadmap, and status documents.
7. Record Phase 3R closeout and stop before any Phase 4 or follow-on consolidation work.

### Acceptance criteria

- Both workflow sections have one upper-right header action layer and no redundant profile/action row.
- Profile menus list profiles before clearly separated lifecycle commands and expose the selected profile without relying on color.
- Runtime Pattern remains a separate selector.
- Runtime Add remains visible; Discard and Save appear only for a dirty Runtime draft.
- Runtime Day copy remains Route-wide and separate from the Pattern-owned Profile menu.
- Trips Actions contains every accepted schedule command in the documented order.
- Shift opens a right-docked non-modal drawer while the timetable remains inspectable.
- Shift changes are previewed but not persisted before Done.
- Undo, Redo, Discard, Done, stale-source rejection, and navigation guards behave as specified.
- Existing copy, regeneration, Pattern-change, deletion, profile, and Runtime-editing behavior is unchanged.
- Header alignment, 12px section buffers, 30px control heights, 5px action gaps, 8px group gaps, typography, menus, focus rings, and responsive behavior are consistent across like elements.
- Automated tests, production build, keyboard review, accessibility review, reload, and visual inspection pass.

### Gate

Package 3R-C is complete. Integration confirmed that the UI keeps only menu, drawer, and staged-operation state, while the application layer retains authoritative Trip propagation and stale-source checks. The final browser test exercises Runtime editing, Build Trips, keyboard Actions access, staged Shift preview, scope-change discard confirmation, Undo, Redo, Discard, Done, and reload persistence. TypeScript, 119 Vitest tests, 8 Playwright tests, the production build, and 1280px/680px visual review passed. `New profile…` remains intentionally absent from the Trip Profile menu because no accepted Trip-profile creation command exists; Runtime reverse-copy remains available. Record the final result in `phase-03r-closeout.md`. Stop before Phase 4 or the deferred follow-on candidates.

## Deferred follow-on candidates

After Phase 3R is accepted, evaluate these independently:

- a top-level `Scenario` menu for New, Rename, Duplicate, and Delete;
- a top-level `Data` menu for backup, restore, and CSV exports;
- Node and Pattern action menus that keep frequent Add actions visible and group only same-scope lifecycle commands.

Do not include these candidates in Phase 3R implementation.
