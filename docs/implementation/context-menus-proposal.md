# Context Menus Across the App: Proposal for Review

- Status: Proposal. Not a decision. The user reviews it, and the chosen items become a decision record and an implementation plan.
- Date: 2026-11-10
- Builds on: Decision 0064 item 7 (shared context-menu rules), `src/ui/ContextMenu.tsx`, `src/ui/menuItems.tsx`
- Evidence: the code as of `c899267` (after PR 52, Decision 0064, and PR 53, Decision 0065). Each entry names the file that holds the existing behavior.

## How to read this

Each candidate has one recommendation:

- **Do**: worth building in the first round.
- **Consider**: useful, but costs more or is used less. Build it after the first round.
- **Defer**: wait until a real need appears.
- **No**: keep the browser's own menu, or add nothing.

Each item is marked **(existing)** when the app already does it somewhere, or **(new)** when it is a new capability. New capabilities need application or domain work as well as a menu entry. A context menu should mostly expose existing commands. New capabilities belong in separate decisions.

## 1. Questions to settle before any table gets a menu

Decision 0064 covers menu items, which are a single object. Table rows add selection, so these rules must be decided first. They become package CM0.

### 1.1 Which rows does a row menu act on?

The Trips, Unassigned trips, Current block and Blocks tables all have checkbox selection. Right-clicking a row can do one of two things:

- **A. The selection rule (recommended).**
  - Right-clicking a selected row acts on the whole selection. The heading reads "4 selected trips".
  - Right-clicking an unselected row acts on that row only and leaves the selection unchanged. The heading names the row, for example "IB Local · 06:12".
- **B. The file-manager rule.** Right-clicking an unselected row replaces the selection with that row.

A is recommended because selections in this app are built deliberately: with checkboxes, Shift-ranges, "Select trips by…" and Pattern chips. They also survive a staged shift. Under B, one misplaced right-click would throw away a selection that took several steps to build. Under A, a single-row menu also offers "Add to selection", so a menu can still build up a selection.

### 1.2 How does the keyboard reach a row?

Table rows are not focusable today. The cells hold controls instead: checkboxes, the start-time button, block pills and row buttons.

- **Recommended:** a row carries a `data-context-row` marker. Shift+F10 or the ContextMenu key on any control inside the row opens that row's menu.
- Rows stay out of the Tab order, so the existing keyboard paths do not change.

### 1.3 When does the browser's own menu win?

Decision 0064 item 7 already keeps the browser menu for text inputs, text areas and grid cells in edit mode. Two more cases need a rule:

- **Selected text inside the target (recommended: browser menu).** Planners copy times and names out of tables, and the browser menu is what makes Copy work.
- **Shift+right-click.** Consider making this always open the browser menu, as an escape hatch for everything else. This is cheap to build.

### 1.4 What happens to a control that is already a menu?

Some cells hold a control that opens its own menu when clicked, such as the block pill and the Pattern chip.

- **Recommended:** right-clicking the control opens the row's menu.
- The control's own menu stays on left-click.
- The row menu repeats the control's main items, so nothing is lost.

### 1.5 Where do the menu items come from?

Decision 0064 item 7 requires one `MenuGroup[]` builder per object. Today several commands exist only as buttons, for example the Trips selection bar and the Blocks selection bar.

- **Recommended:** each surface defines its commands once, each as an id, label, disabled state, reason and action.
- The selection bar renders them as buttons, and the context menu renders them as items.
- This keeps the disabled reasons identical in both places. The Trips selection bar alone has six reasons, such as "Discard the staged shift first."

### 1.6 Modes that lock the table

The Trips table locks parts of itself while a staged shift, the shift bar, a draft trip row or the Build drawer is open. The Runtimes section does the same while it holds unsaved edits.

- **Recommended:** the context menu shows the same items, disabled with the same reasons. It must not become a way around a lock.

### 1.7 Places with no context menu

- **Inside modal dialogs.** This includes Auto-blocking, the previews, and the Day-copy and impact dialogs.
- **Tabs, the save status, and empty page areas.**
- **Form fields.** These keep the browser menu: Route details, Annual service days, Costing assumptions, the rate combobox and the planned-period inputs.

## 2. Candidates by category

### Category A: object lists in switchers and pickers (extends Decision 0064)

These are menus that list objects. Each listed object gets the same context menu the Project items now have. These are the cheapest candidates, because `MenuItem.contextGroups` already exists.

| Where | Object | Proposed items | Rec. | Notes |
|---|---|---|---|---|
| Scenario switcher, `App.tsx` `scenarioActions` | Scenario | Open · Rename… · Duplicate… · Delete scenario… | **Do** | `renameScenario` and `duplicateScenario` take the loaded `ScenarioRecords` (`routeDefinitionService.ts:460,464`). Acting on a scenario that is not open needs by-id variants or a records load first. `deleteScenario(id, token)` already works by id. |
| Current block picker, `BlockingWorkspace.tsx` `currentBlockMenu` | Block | Open · Rename… · Edit notes… · Delete block… | **Do** | `setBlockDialog` already takes a block. `requestDeleteBlock()` uses `selectedBlock` and needs a block parameter. The same builder serves the Blocks table rows (B4). |
| Trip profile picker, `TripsWorkspace.tsx` `tripProfileMenu` | Trip profile | Open · Rename… · Copy… · Delete… | **Consider** | Rename, copy and delete handlers act on the selected profile. There are usually only one or two profiles, so the benefit is small. |
| Runtime profile picker, `runtimeProfileMenu` | Runtime profile | Open · Rename… · Copy… · Reverse-copy… · Delete… | **Consider** | Same as above. Reverse-copy depends on the candidates for the selected pattern. |
| Pattern list, `RouteWorkspace.tsx` (aside buttons) | Pattern | Open · Reverse · Duplicate · Delete pattern… · Edit runtimes (Trips tab) | **Do** | These are list buttons, not menu items, so they need the CM0 target hook. They act on that pattern. The Decision 0065 distance items (Fill, Copy, Undo) are not offered here: Fill changes only the open pattern's draft, and Copy reads the open pattern after it is saved (Decision 0065 items 7 and 9). An unsaved pattern draft asks the existing discard question first. "Edit runtimes" is **(new)** navigation (Category F). |

### Category B: table rows with selection (the main new use)

#### B1. Trips table (`ScheduleTable.tsx`): recommended first

**Row menu, unselected row (one trip).** Heading: "<pattern short name> · <departure>".

| Group | Item | Source |
|---|---|---|
| Select | Add to selection · Select only this trip · Select all on <pattern> | existing (checkbox, Pattern chip menu) |
| Edit | Edit start time (same as F2) · Change pattern… · Shift… · Regenerate… (shown only when its run times changed) | existing (start-time cell, selection bar) |
| Block | Assign block… · Unassign from block · Open block in Blocking | existing; "Open in Blocking" is **(new)** (F1) |
| Data | Add trip after this… | **(new)**: a draft row with the same pattern, starting one headway later |
| Destructive | Delete trip… | existing (trash button) |

**Row menu, selected row (the selection).** Heading: "N selected trips". It holds the selection bar's commands from one shared list (1.5): Shift… · Change pattern… · Regenerate… · Assign block… · Unassign… · Delete…. It also has "Clear selection".

**Header menu.** Right-clicking the column headings shows:

- the View menu's options: Show runtime bands, Show headways, Round displayed times, and Show both directions side by side;
- the "Select trips by…" groups.

Both come from the existing builders (`viewMenu` and `selectMenu`), so nothing is duplicated.

**Side by side.** Each pane has the same menus. The header menu adds "Show only <direction>", which closes side by side and keeps that direction.

Recommendation: **Do** the row menu, the selection menu and the header menu. **Consider** "Add trip after this" as a separate small decision.

#### B2. Unassigned trips table (`BlockingWorkspace.tsx` `UnassignedRow`)

| Group | Item | Source | Rec. |
|---|---|---|---|
| Assign | Assign to Block <current> (one row, or the selection) | existing (row Assign button, selection bar) | **Do** |
| Select | Add to selection · Select only this trip | existing | **Do** |
| Filter | Show only <pattern> · Show only trips starting at <node> · Clear filters | existing filters (`unassignedFilters`) | **Do** |
| Navigate | Show in Trips | **(new)** (F2) | Consider |

The filter items are this table's main gain. Filtering today means opening a header filter list and finding the value. Right-clicking the value itself is quicker.

#### B3. Current block activities (`ActivityRow`)

| Row kind | Items | Rec. |
|---|---|---|
| Revenue trip, unselected | Move up · Move down · Add deadhead after / Edit deadhead… · Move to block… · Remove from block… · Show in Trips **(new)** | **Do** (except Show in Trips) |
| Revenue trips, selected | Move to block… · Remove from block… (the selection bar's list) | **Do** |
| Pull-out, pull-in, deadhead | Edit… · Remove… | **Do** |
| Table header or empty area | Add pull-out · Add pull-in (only when missing) | Consider |

The Move up and Move down buttons are small icon buttons. Putting them in the menu makes them easier to hit and adds no new commands.

#### B4. Blocks table (`blocking-blocks-table`)

| Row | Items | Rec. |
|---|---|---|
| One block | Open · Rename… · Edit notes… · Delete block… (the same builder as the block picker in Category A) | **Do** |
| Checked blocks | Delete N blocks… | **Do** |
| Header | Sort ascending · Sort descending for that column | Consider: headings already sort when clicked |

### Category C: spreadsheet grids (`role="grid"`, cell navigation, edit mode)

The grids use `useGridNavigation`. A cell that is not in edit mode can show a context menu. A cell in edit mode keeps the browser menu (Decision 0064 item 7).

| Grid | Proposed items | Rec. |
|---|---|---|
| Runtimes, `RuntimeEditor.tsx` | Edit cell (F2) · Insert band above · Insert band below · Duplicate band · Remove band | **Do**. Duplicate and Remove are already row buttons; insert above and below are **(new)**, because the add button only appends. |
| Pattern points, `RouteWorkspace.tsx` `PatternEditor` | Edit segment (F2; rows after the first) · Move up · Move down · Insert node above · Insert node below · Remove point | **Do**. Since Decision 0065 the editable column is Segment mi, and the first row has no segment. Insert above and below are **(new)**. Long patterns now need an append followed by many moves up. An inserted point gets a 0 segment ("not entered", so Fill can supply it) and takes the cumulative miles of the point before it, so no later cumulative value moves. |
| Nodes, `RouteGrids.tsx` | Edit cell · Remove node / Undo remove · New node | **Consider**. The row's trash button is visible. A "Used by N patterns" note would be **(new)**. |
| Estimate factors, `EstimateFactorsGrid.tsx` | Edit cell · Clear (use All days) | **Consider** |
| Planned frequencies, `PlannedFrequenciesPanel.tsx` | Insert period above · Insert period below · Remove period | **Defer**. Every cell is an input, so the browser menu wins almost everywhere. |

**Clipboard items in grids.** The browser can write to the clipboard after a click, so a "Copy" item can be built. Reading for Paste prompts for permission, or is unavailable, depending on the browser.

- **Recommended:** offer no Copy or Paste items in grid menus.
- Ctrl+C and Ctrl+V keep their current behavior.
- Shift+right-click (1.3) gives the browser menu.

### Category D: read-only result tables

| Table | Proposed items | Rec. |
|---|---|---|
| Cost breakdown, `CostingWorkspace.tsx` `CostBreakdownTable` | Copy table (paste into a spreadsheet) · Export costing CSV · View cost summary… | **Do**. Copy table is **(new)**: it puts tab-separated rows on the clipboard. Export and summary already exist (`costingActionsMenu`). |
| Yearly outlook | View <year> · Copy table | Consider |
| Blocks table | Copy table, added to the B4 header menu | Consider |
| Cost summary view, `CostSummaryView.tsx` | none: it is a document for printing | No |

"Copy table" is the one new capability that is likely to be used every week. Planners move these numbers into spreadsheets and memos, and today that takes a CSV export followed by opening the file.

### Category E: combining duplicate menus

| Today | Proposal | Rec. |
|---|---|---|
| **Route.** A native `<select>` for choosing the route (`App.tsx` `routeSelect`, which also holds a "New route" option), plus a separate Route Actions ⋯ menu. | One Route switcher like Project and Scenario: a list of routes with New route, Rename, Duplicate, Export route CSV and Delete route, and a context menu on each route. The Actions ⋯ button goes away. | **Do**. A native option cannot have a context menu, and Route is the only scope level that works differently. This changes layout and interaction, so it is a UI-design (Sol) package. |
| **Blocking scenario.** A native `<select>`, plus Blocking Actions ⋯, which holds the blocking-scenario commands under Decision 0053. | The same treatment as Route: a Blocking scenario switcher, with Auto-blocking… and Export in it. | **Consider**, after Route proves the pattern. |
| **Current block.** The Block picker, plus Current block Actions ⋯ (Rename, Notes, Delete). | Keep both visible. Use one `blockGroups(block)` builder for Actions, the picker's context menus and the Blocks table rows. | **Do** (the shared builder only) |
| **Pattern.** The Pattern editor header's Reverse button and Actions ⋯ (Duplicate, Delete, and the Decision 0065 items Fill distances…, Copy distances…, Undo last distance copy), plus the proposed pattern list menu. | One `patternGroups(pattern)` builder for both. The distance items appear only in the editor's Actions ⋯ (see Category A). | **Do** |
| **Selecting by pattern** appears in three places: the Pattern chip menu, the "By pattern" group of "Select trips by…", and the proposed row menu. | One builder for these selection items. Keep the chip, because it is the fastest path. | **Do** |
| **Selection bars** in Trips, Unassigned trips, Current block and Blocks, plus their proposed selection menus. | One command list per bar (1.5). | **Do** |
| **Trips View ⋯** plus the proposed header menu. | The same `viewMenu` groups. | **Do** |

### Category F: going from one tab to another (new)

These items open another tab with a specific object selected. The app has no such navigation today. Each tab keeps its own selection state, such as `selectedBlockId` in Blocking and `selectedTripIds` in Trips.

| Item | From → to | Rec. |
|---|---|---|
| F1. Open block in Blocking | Trips row with an assigned block → Blocking, with the same blocking scenario, day and block | **Consider**. Needs a "navigate with selection" port in `App.tsx` and a decision on what happens to unsaved edits; the existing `requestRouteNavigation` guard covers the leaving tab. |
| F2. Show in Trips | Unassigned trips or Current block row → Trips, with the route, day and direction set and the trip selected and scrolled into view | **Consider** |
| F3. Edit runtimes | Pattern list → Trips, with Runtimes open on that pattern | **Consider** |

**Recommendation:** decide these together in one decision with one navigation port. Do not add them one at a time.

## 3. Proposed package order

| Package | Content | Class | Depends on |
|---|---|---|---|
| CM0 | Decision record covering section 1. `useContextMenu(target)` for elements that are not menu items, with row resolution through `data-context-row`, the selected-text and Shift exceptions, and touch. A shared command-list type for selection bars. Unit and browser tests of the hook. | Opus (rules settled in the decision); Haiku for the tests | none |
| CM1 | Trips table: row, selection and header menus (B1, without the new items) | Opus wiring, Haiku tests | CM0 |
| CM2 | Blocking: `blockGroups` builder, the block picker context menu, and the Blocks, Current block and Unassigned row menus (A, B2–B4) | Haiku with exact steps, reviewed by Opus | CM0 |
| CM3 | Scenario switcher context menu, plus by-id scenario rename and duplicate in the application layer | Haiku (application and tests), Opus (wiring) | none |
| CM4 | Route switcher replacing the select and Actions ⋯ (E, first row) | Sol (design), then Haiku | CM3 |
| CM5 | Grids: insert above and below, plus menus for Runtimes and Pattern points (C). A pattern-point insert follows Decision 0065: 0 segment, no change to later cumulative miles. | Haiku for the domain inserts, Opus for menus | CM0 |
| CM6 | Copy table for result tables (D) | Haiku: a pure table-to-TSV helper with tests, then wiring | CM0 |
| CM7 | Tab-to-tab navigation (F): its own decision first | Opus | CM1, CM2 |

The first round recommended for review is **CM0, CM1, CM2 and CM3**. Together they put context menus on the Trips and Blocking tables, which are the two places the user named, and they extend Decision 0064 to scenarios. CM0 must come first, because rows depend on its rules.

## 4. Decisions needed from the user

1. Selection rule (1.1): A (recommended) or B.
2. Shift+right-click opens the browser menu (1.3): yes or no.
3. Route switcher (E, first row): approve the change to how the route is chosen, or keep the select.
4. New capabilities to include in a first round, if any:
   - Add trip after this;
   - Insert above and below in the grids;
   - Copy table;
   - tab-to-tab navigation.
5. The first round: CM0–CM3 as recommended, or a different set.
