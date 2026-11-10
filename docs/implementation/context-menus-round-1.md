# Context Menus, Round 1: Implementation Plan

- Decision: `docs/decisions/0066-context-menus-on-tables-and-scenarios.md`
- Survey: `docs/implementation/context-menus-proposal.md`
- Date: 2026-11-10
- Status: Implemented. See `context-menus-round-1-closeout.md`.
- Base: `main` at `c899267`

## Roles

- **Opus** is the orchestrator. It writes CM0 and the Trips wiring, and writes the exact steps for each Haiku package. It reviews every diff, reruns the checks, and commits.
- **Haiku** implements the structural packages: application methods, pure helpers, tests and specified wiring. It follows the steps literally. If a step does not match the code it finds, Haiku stops and reports. It does not invent behavior.
- No package needs the UI-design class. Every menu reuses `ContextMenu` and existing commands, and no layout changes.

## Facts verified in the code

| Fact | Where |
|---|---|
| `ContextMenu({ heading, groups, point, onChoose, onClose(returnFocus) })` renders into `document.body` marked `data-menu-layer`, takes focus, and closes on Escape or Tab with `returnFocus = true` | `src/ui/ContextMenu.tsx` |
| `MenuGroups` opens an item's context menu on `contextmenu`, the ContextMenu key and Shift+F10 (`isContextMenuKey`), and a 500 ms touch press | `src/ui/menuItems.tsx` |
| `MenuItem` has `id, label, onSelect(event), disabled, title, destructive, contextGroups, contextHeading` | `src/ui/menuItems.tsx` |
| `MenuButton`'s outside-click handler ignores targets inside `[data-menu-layer]` | `src/ui/MenuButton.tsx` |
| `SelectionBar({ count, noun, ariaLabel, compact, onClear, children })` renders its children as the bar's buttons | `src/ui/shared/bars.tsx:13` |
| The Trips selection bar has six buttons with disabled reasons: Shift…, Change pattern…, Regenerate…, Assign block…, Unassign…, Delete… | `src/ui/trips/TripsWorkspace.tsx` `renderSelectionBar` |
| Single-trip handlers act by ID: `openTripBlockAssignment([id], '', 'pill', trigger[, 'unassign'])`, `requestTripDeletion([id])`, `setRecalculationTripIds([id])`. Shift and Change pattern act on `selectedTripIds` | `TripsWorkspace.tsx` |
| `ScheduleTable` builds `selectMenu` itself. `viewMenu` is built in `TripsWorkspace`. The pinned headings render through a portal into `document.body` | `src/ui/trips/ScheduleTable.tsx` |
| The start-time edit is internal to `StartTimeCell`; its trigger is `button.trip-start-edit` | `ScheduleTable.tsx` |
| `requestDeleteBlock()` uses `selectedBlock`. `setBlockDialog({ mode: 'rename', block, value })` and `setNotesDialog(block)` take a block | `src/ui/blocking/BlockingWorkspace.tsx` |
| These Blocking handlers already exist: `assign(trip)`, `assignSelectedUnassigned()`, `requestReassignSelectedTrips()`, `requestRemoveActivity(activity, name)`, `reorderTripGroup(id, ±1)`, `toggleUnassignedTrip`, `toggleBlockTrip`, `requestDeleteBlocks(all)` | `BlockingWorkspace.tsx` |
| `UnassignedFilters = { patternIds, startNodeIds, endNodeIds, fromTime, toTime }`. `emptyUnassignedFilters()` returns the empty filter set | `BlockingWorkspace.tsx:43` |
| `renameScenario(records, name)` and `duplicateScenario(records, name)` read only `records.scenario.id`. `deleteScenario(id, token)` works by ID | `src/application/routeDefinitionService.ts:460–490` |
| `deleteCurrentScenario()` builds the confirmation from `records.scenario` and, after the delete, sets the Route tab and calls `reload(projectId)` | `src/ui/App.tsx` |
| `CostBreakdownTable` uses `breakdownRows(result, year)` and `BREAKDOWN_COLUMNS`, formatted with `MISSING`, `dailyHours`, `annualHours` and `money` | `src/ui/costing/CostingWorkspace.tsx` |

## Packages

Each package ends with its own checks and a commit. Opus reviews before the commit. Packages after CM0 may run in any order, but CM1 and CM2 both touch `src/ui/shared/bars.tsx` through CM0 only, so they do not conflict.

### CM0. Shared context-menu hook and command buttons (Opus)

**Files**

- New `src/ui/useContextMenu.tsx`
- New `src/ui/shared/CommandButton.tsx`
- `src/ui/menuItems.tsx`
- New `tests/ui/context-menu-target.spec.ts`

The repository has no component-test library. Vitest runs only `.ts` tests without a DOM, so the hook is tested in the browser.

**Steps**

1. **Create `useContextMenu()`.** It returns two things:
   - `target(resolve)`: a set of handlers (`onContextMenu`, `onKeyDown`, `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`) to spread onto any element, usually a `tr`. `resolve` is `() => { heading: string; groups: MenuGroup[] } | undefined`, called when the menu opens.
   - `menu`: a React node to render once. It is the open `ContextMenu`, or `null`.
2. **When the handlers do nothing.** Before calling `resolve`, the handlers return without calling `preventDefault`, which keeps the browser menu, in these cases (Decision 0066 rule 3):
   - `event.target` is inside `input, textarea, select, [contenteditable]`, or inside `[role="menu"]`;
   - `window.getSelection()` is not collapsed and its anchor node is inside `event.currentTarget`;
   - the mouse `contextmenu` event has `shiftKey` set;
   - `resolve()` returns `undefined`.
3. **Where the menu opens.**
   - **Pointer:** at `clientX` and `clientY`.
   - **Keyboard** (`isContextMenuKey`, handled in `onKeyDown` with `preventDefault` and `stopPropagation`): at the lower-left corner of the focused element (`document.activeElement` inside `currentTarget`).
   - **Touch:** the 500 ms press with a 10 px slop. Copy the constants and behavior from `MenuGroups`, and suppress the click that follows a long press.
4. **Choosing and closing.**
   - **Choosing an item** closes the menu, then calls `item.onSelect(event)`.
   - **Closing with `returnFocus = true`** focuses the element that was focused when the menu opened. When the menu was opened with the mouse, that is the `currentTarget`'s first focusable descendant.
5. **Change `MenuGroups` for Shift+right-click.** In the `onContextMenu` handler, return before `preventDefault()` when `event.shiftKey` is set.
6. **Create `CommandButton({ item, className })`.**
   - It renders `<button type="button">` with `disabled={item.disabled}` and `title={item.title}`.
   - The class is `className`, or `'subtle-danger'` when `item.destructive` is set.
   - `onClick` calls `item.onSelect({ ctrlKey, metaKey, shiftKey })` from the click.
   - The button's text is `item.label`.
7. **Browser tests (`tests/ui/context-menu-target.spec.ts`).** The hook has no consumer until CM1, so these tests use the project switcher for the Shift rule in `MenuGroups`. They are then extended in CM1 against a Trips row:
   - right-click opens the menu with the heading and items;
   - Shift+right-click does not open it and does not call `preventDefault`;
   - right-click on an `input` inside the target does not open it;
   - Shift+F10 on a button inside the target opens it, and Escape returns focus to that button;
   - with selected text inside the target, the menu does not open;
   - choosing an item calls `onSelect` once.

**Checks**

- `npm run typecheck`
- the new spec (the Shift-rule case)
- `tests/ui/project-context-menu.spec.ts`, because `MenuGroups` changed
- the full unit suite

### CM1. Trips table (Opus wires, Haiku writes the browser tests)

**Files**

- `src/ui/trips/ScheduleTable.tsx`
- `src/ui/trips/TripsWorkspace.tsx`
- New `tests/ui/trips-context-menu.spec.ts`

**Steps**

1. **Move the selection bar's commands into one list.** In `TripsWorkspace`, move the six selection-bar buttons into `const selectionCommands: MenuItem[]`. Copy each label, `disabled` expression, `title` expression and `onClick` body exactly into `label`, `disabled`, `title` and `onSelect`. Delete… gets `destructive: true`.
   - **The bar** renders `selectionCommands.map((item) => <CommandButton key={item.id} item={item} />)` inside `SelectionBar`. Delete… keeps the class `subtle-danger`.
   - **The shift bar** (`renderShiftBar`) is unchanged.
2. **New `ScheduleTable` props:**
   - `rowContextMenu?: (trip: Trip, selected: boolean) => { heading: string; groups: MenuGroup[] } | undefined`;
   - `headerContextGroups?: MenuGroup[]`.
3. **Wire `ScheduleTable`.**
   - Call `useContextMenu()` once and render its `menu`.
   - **Trip rows:** spread `contextMenu.target(() => rowContextMenu?.(savedTrip, selectedIds.includes(savedTrip.id)))` onto each saved trip's `<tr>`.
   - **No menu:** the draft row and the empty-table row get no handlers.
   - **Headings:** spread `contextMenu.target(() => ({ heading: 'Trips table', groups: [...selectMenu, ...(headerContextGroups ?? [])] }))` onto the `<thead>` element in `tableHeader`. Because the pinned headings reuse `tableHeader`, this covers the portal copy too.
4. **Build `rowContextMenu` in `TripsWorkspace`.** Return `undefined` while `shiftDrawerOpen` is set; the shift bar is the only control in that mode.
   - **Selected rows:** the heading is `` `${selectedTripIds.length} selected ${selectedTripIds.length === 1 ? 'trip' : 'trips'}` ``. The groups are `[{ items: selectionCommands }, { items: [{ id: 'clear', label: 'Clear selection', onSelect: clearTripSelection }] }]`.
   - **Unselected row:** the heading is the pattern's short name and the departure time. Use the same `chipText` and `formatTripTableClock(trip.stopTimes[0].time, roundDisplayedTimes)` as the table.
   - **Select group:**
     - Add to selection runs the row checkbox's toggle for that trip.
     - Select only this trip runs `requestShiftScopeChange(() => { selectionAnchorId.current = trip.id; setSelectedTripIds([trip.id]); })`.
     - Select all on <pattern> runs `selectTripsBy({ kind: 'pattern', patternId, mode: 'replace' })`.
   - **Edit group:**
     - Edit start time focuses and clicks the row's `button.trip-start-edit`. It is disabled when the row has none, which happens when `onStartTimeChange` is undefined or the row is staged.
     - Change pattern… and Shift… first set `selectedTripIds` to `[trip.id]`, then run the same action as the bar button. Their `disabled` and `title` match the bar's.
     - Regenerate… is listed only when `changedRuntimeTripIds.has(trip.id)`, and runs `setRecalculationTripIds([trip.id])`.
   - **Block group:**
     - Assign block… runs `openTripBlockAssignment([trip.id], '', 'actions', null)`.
     - Unassign from block is listed only when `tripBlockByTripId.has(trip.id)`, and runs `openTripBlockAssignment([trip.id], '', 'actions', null, 'unassign')`.
     - Both use the bar button's `disabled` and `title` expressions, with the selection replaced by this one trip.
   - **Delete group:** Delete trip… runs `requestShiftScopeChange(() => void requestTripDeletion([trip.id]))`, the same as the row's trash button, with `destructive: true`.
5. **Header menu.** Pass `headerContextGroups={viewMenu}`.
6. **Browser tests.** Reuse the setup helpers that `tests/ui/shift-drawer.spec.ts` uses to make a route with trips.
   - right-click an unselected row: the menu is named "<heading> actions", and the selection does not change;
   - with two trips selected, right-click a selected row: the heading reads "2 selected trips", and Delete… opens the deletion dialog for 2 trips;
   - Shift+F10 on a row checkbox opens the menu, and Escape returns focus to the checkbox;
   - right-click the headings: Show headways toggles;
   - Shift+right-click a row does not open the app menu;
   - with a staged shift, the row menu does not open.

**Checks**

- `npm run typecheck`
- the new spec and the rest of `context-menu-target.spec.ts` (the row cases of CM0 step 7), plus `shift-drawer`, `add-trip-draft`, `trip-selection-menus`, `trip-start-edit`, `side-by-side-trips` and `keyboard` specs
- the full unit suite
- `npm run build`
- visual inspection of one row menu at 1024 px

### CM2. Blocking (Haiku, reviewed by Opus)

**Files**

- `src/ui/blocking/BlockingWorkspace.tsx`
- New `tests/ui/blocking-context-menu.spec.ts`

**Steps**

1. **Delete any block.** Change the signature to `async function requestDeleteBlock(block = selectedBlock)`. In its body, replace `selectedBlock` with `block`. The existing callers stay as they are.
2. **One list of block items.** Add `const blockGroups = (block: BlockingBlock, withOpen: boolean): MenuGroup[]`, which returns these groups in this order:
   - `withOpen` only: `{ items: [{ id: 'open', label: 'Open', disabled: block.id === selectedBlockId || busy, onSelect: () => setSelectedBlockId(block.id) }] }`;
   - `{ label: 'Block', items: [rename, notes] }`, using the same labels and `restoreFocus: false` as `currentBlockActionsMenu`. Rename… calls `setBlockDialog({ mode: 'rename', block, value: block.label })` and Edit notes… calls `setNotesDialog(block)`; both are `disabled: busy`;
   - `{ items: [{ id: 'delete', label: 'Delete block…', destructive: true, restoreFocus: false, disabled: busy, onSelect: () => void requestDeleteBlock(block) }] }`.
3. **Current block Actions ⋯ and the Block picker.**
   - `currentBlockActionsMenu` becomes `selectedBlock ? blockGroups(selectedBlock, false) : <the current groups with every item disabled>`.
   - Each item of `currentBlockMenu` gains `contextGroups: () => blockGroups(block, true)` and `contextHeading: block.label`.
4. **Selection bars use one command list.** Use the CM0 `CommandButton` pattern:
   - the Unassigned trips bar (Assign to Block X, class `primary`);
   - the Current block bar (Remove from block…, `subtle-danger`; Move to block…);
   - the Blocks bar (Delete blocks…, class `danger`).

   Each bar's `MenuItem[]` copies its button's label, disabled, title and action exactly.
5. **Context menus on the rows.** Call `useContextMenu()` once in `BlockingWorkspace` and render its `menu`.
   - **Blocks table rows:**
     - **checked row:** the heading is "N selected blocks"; the groups are the Blocks bar commands, then Clear selection (`setCheckedBlockIds([])`);
     - **unchecked row:** the heading is `block.label`; the groups are `blockGroups(block, true)`.
   - **Unassigned rows** (pass a `contextTarget` prop into `UnassignedRow` and spread it on its `<tr>`):
     - **selected row:** the heading is "N selected trips"; the groups are the Unassigned bar commands, then Clear selection;
     - **unselected row:** the heading is the pattern label and the start time, as the row shows them;
     - **Assign group:** "Assign to Block <label>" runs `assign(trip)`, with the same `disabled` and `title` as the row's Assign button;
     - **Select group:** Add to selection runs `toggleUnassignedTrip(trip.id, index, false)`; Select only this trip runs `setSelectedUnassignedTripIds([trip.id])` and sets the anchor;
     - **Filter group:** Show only <pattern> runs `setUnassignedFilters((current) => ({ ...current, patternIds: [trip.patternId] }))`; the start and end node items do the same with `startNodeIds` and `endNodeIds`, using the pattern's first and last `nodeId`; Clear filters (only when `unassignedFiltersActive`) runs `setUnassignedFilters(emptyUnassignedFilters())`.
   - **Current block rows** (pass `contextTarget` into `ActivityRow`, built in the parent from the same values the row receives):
     - **selected revenue row:** the Current block bar commands, then Clear selection;
     - **unselected revenue row:** Move up (`onMove(-1)`, disabled `!hasPreviousRevenue`), Move down (`onMove(1)`, disabled `!connection`), then "Edit deadhead…" or "Add deadhead after…" calling `onDeadhead` exactly as the cell button does, then "Move to block…" (first `setSelectedTripIds([activity.tripId])`, then `requestReassignSelectedTrips()`; disabled with the bar's reason), then "Remove from block…" calling `onRemove(activityName)`;
     - **pull-out, pull-in and deadhead rows:** Edit… (`onEdit`) and Remove… (`onRemove(activityName)`).

     Because `hasPreviousRevenue`, `connection` and `activityName` are computed inside `ActivityRow`, the simplest correct change is to have `ActivityRow` build its own groups. Pass it the `target` function from the hook as a prop, and let it call `target(() => ({ heading, groups }))` on its own `<tr>`.
6. **Browser tests.** Reuse the helpers from `blocking-workspace.spec.ts`.
   - right-click a Blocks row, choose Rename…: the rename dialog shows that block's label even when it is not the current block;
   - delete a non-current block from its row menu: the current block stays selected;
   - right-click an unassigned row, choose Show only <pattern>: only that pattern's trips remain, and Clear filters restores them;
   - right-click a revenue row in the current block, choose Move down: the order changes;
   - the Block picker item's context menu opens with Open, Rename…, Edit notes…, Delete block….

**Checks**

- `npm run typecheck`
- the new spec, plus `blocking-workspace`, `blocking-bulk-delete`, `blocking-presentation`, `blocking-rules` and `keyboard` specs
- the full unit suite
- `npm run build`
- visual inspection of one row menu

### CM3. Scenario switcher (Haiku for the application layer and tests, Opus wires)

**Files**

- `src/application/routeDefinitionService.ts` and its tests
- `src/ui/App.tsx`
- New `tests/ui/scenario-context-menu.spec.ts`

**Steps**

1. **Rename by ID.** Add `renameScenarioById(scenarioId: string, name: string): Promise<ScenarioRecords>`, using the body of `renameScenario`, with `records.scenario.id` replaced by `scenarioId`. `renameScenario(records, name)` becomes `return this.renameScenarioById(records.scenario.id, name);`.
2. **Duplicate by ID.** Add `duplicateScenarioById(scenarioId, name)` the same way. `duplicateScenario` delegates to it.
3. **Unit tests.**
   - Renaming by ID changes only that scenario's name and `updatedAt`.
   - Duplicating by ID copies the stored scenario.
   - The existing rename and duplicate tests pass unchanged.
4. **`App.tsx`: one delete function.** Generalize `deleteCurrentScenario()` into `deleteScenario(scenario: Scenario)`.
   - **Text:** the confirmation uses `scenario.name`.
   - **The open scenario:** after the delete, the code does what it does today, which is `setActiveTab('route')` and `reload(projectId)`.
   - **Any other scenario:** the code calls `reload(projectId, scenarioId, routeId)`, and the tab does not change.
   - **The only scenario:** it keeps the existing notice.
   - **Existing caller:** `deleteCurrentScenario` becomes `() => { if (records) deleteScenario(records.scenario); }`.
5. **`App.tsx`: the scenario context menu.** Add `scenarioContextGroups(scenario)`, following the order of `projectContextGroups`.
   - **Open:** disabled when the scenario is open; otherwise it runs the scenario item's own `onSelect` body.
   - **Rename…:** opens a name dialog whose action calls `service.renameScenarioById(scenario.id, name)`. It updates `scenarioOptions`, and also calls `setRecords(next)` when `scenario.id === scenarioId`.
   - **Duplicate…:** opens a name dialog prefilled with `` `${scenario.name} Copy` ``. Its action calls `service.duplicateScenarioById`, then `requestRouteNavigation(() => void reload(projectId, next.scenario.id))`.
   - **Delete scenario…:** `destructive`. For the open scenario it calls `requestRouteNavigation(() => deleteScenario(scenario))`; for any other scenario it calls `deleteScenario(scenario)` directly.

   Each scenario item gains `contextGroups: () => scenarioContextGroups(scenario)` and `contextHeading: scenario.name`.
6. **Browser tests.** Model them on `project-context-menu.spec.ts`.
   - Rename a scenario that isn't open: the open scenario and tab stay the same.
   - Delete a scenario that isn't open: it leaves the list, and the open scenario stays.
   - Duplicate a scenario from its context menu: the copy opens.
   - Shift+F10 on a scenario item opens its menu, and Escape returns focus to the item.

**Checks**

- `npm run typecheck`
- `routeDefinitionService.test.ts`
- the new spec, plus `project-context-menu`, `deletion-reviews` and `app-shell` specs
- the full unit suite
- `npm run build`

### CM6. Copy cost breakdown (Haiku, reviewed by Opus)

**Files**

- New `src/ui/tableText.ts` and `src/ui/tableText.test.ts`
- New `src/ui/costing/costBreakdownText.ts` and `costBreakdownText.test.ts`
- `src/ui/costing/CostingWorkspace.tsx`
- New `tests/ui/costing-copy-table.spec.ts`

**Steps**

1. **Create `tableToTsv(rows: string[][]): string`.**
   - Cells are joined with `\t` and rows with `\n`.
   - Inside a cell, tabs and newlines become one space, and leading and trailing spaces are trimmed.
   - It has unit tests.
2. **Move the row builder.** Move `BreakdownRow`, `breakdownRows` and `BREAKDOWN_COLUMNS` unchanged from `CostingWorkspace.tsx` into the new `costBreakdownText.ts`, and import them back. Also move the helpers `dailyHours`, `annualHours` and `money` (now `CostingWorkspace.tsx:97–100`) there unchanged and export them. They are built on `formatHours`, `formatMoney` and `MISSING` from `src/ui/format.ts`, which is plain TypeScript. Leave `rate` in place unless the table needs it.

   Then create `costBreakdownText(result, selectedYear, totalDays): string[][]` in that file. It returns:
   - `BREAKDOWN_COLUMNS`;
   - one row per `breakdownRows(...).rows`;
   - the total row.

   Each cell uses the same formatter and the same `MISSING` fallback as `CostBreakdownTable`. The total row's blank cells are `''`. Unit-test it in `costBreakdownText.test.ts` for one blocked result and one estimated result.
3. **Add `copyBreakdown()`.**
   - It calls `navigator.clipboard.writeText(tableToTsv(costBreakdownText(...)))`.
   - On success it sets a status text: `` `Copied the cost breakdown for ${selectedYear}.` ``
   - On failure it sets: `'The browser did not allow copying. Use Export costing CSV instead.'`
   - The text shows as `<InlineNote kind="ok" live>` (or `kind="warn"`) under the table, and clears when `result` or `selectedYear` changes.
4. **Reachable two ways.**
   - Add `{ id: 'copy', label: 'Copy cost breakdown', disabled: !result || !result.dailyRows.length, onSelect: () => void copyBreakdown() }` to `costingActionsMenu`, between View cost summary… and Export costing CSV.
   - Add `useContextMenu()` with `target` on the `CostBreakdownTable`'s wrapping `div`. The heading is `` `Cost breakdown · ${selectedYear}` ``, and the groups are `costingActionsMenu`.
5. **Browser test.**
   - Grant `clipboard-read` and `clipboard-write` in the Playwright context. Right-click the table, choose Copy cost breakdown, and read the clipboard: the first line is the header row, and the line count is the number of days + 2.
   - The Actions ⋯ item also copies.

**Checks**

- `npm run typecheck`
- `tableText.test.ts` and the Costing unit tests
- the new spec, plus `costing-workspace` and `costing-summary` specs
- the full unit suite
- `npm run build`

### Closeout (Opus)

1. **Documentation.**
   - In `docs/ui-conventions.md`, add the rules of Decision 0066 under "Context menus".
   - In `architecture_overview.md`, add one sentence on `useContextMenu` beside the local-data-protection paragraph.
   - Mark the decision and this plan as implemented.
2. **Full checks.** Run the full unit suite and the full browser suite.
3. **Visual inspection.** Inspect at 1024 px, in the light and dark themes:
   - one row menu in each of Trips and Blocking;
   - the scenario menu;
   - the copied-status note.
4. **Closeout note.** Write `docs/implementation/context-menus-round-1-closeout.md`, listing:
   - packages and commits;
   - acceptance results;
   - deviations.

## Acceptance criteria

1. Every menu in Decision 0066 items 8–11 opens by right-click, by Shift+F10 on a control in the row, and by touch long-press. Escape returns focus to the control that opened it.
2. Opening a row menu never changes the selection. Only the commands named in rule 1 change it, and only when chosen.
3. Shift+right-click, fields, selected text and open menus always get the browser menu.
4. Each selection bar and its menu show the same labels, disabled states and reasons, from one list.
5. No menu offers an action that its visible control refuses in the current lock.
6. A scenario or block that isn't the current one can be renamed or deleted without changing the current selection.
7. Copy cost breakdown puts the table as shown on the clipboard, or reports that it could not.
8. The Dexie schema (10) and the backup schema (11) are unchanged, and every existing spec passes.

## Risks

- **Shift+F10 in Chromium.** It can fire `contextmenu` with `shiftKey` set. CM0 handles the key in `onKeyDown` and calls `preventDefault`, so the Shift rule applies only to mouse events. The CM0 test covers both.
- **Pinned Trips headings.** They are a portal copy of `tableHeader`, so they get the same handlers. CM1's header test should run once with the headings pinned.
- **`ActivityRow` and `UnassignedRow` gain one prop each.** No other caller exists (`BlockingWorkspace.tsx` only).
