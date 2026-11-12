# Packages BSS1 to BSS5: Blocking summary surface and Blocking scenario field menus

Decision: `docs/decisions/0076-blocking-summary-surface.md`. Status: implemented 2026-11-12 (BSS1 to BSS5), awaiting user acceptance.

Implementation notes (deviations from the text below, recorded at closeout):
- BSS1: the hook takes the caller's `busy`/`setBusy` (a scenario write keeps disabling the caller's other controls) and an optional `onBeforeCreate`; the caller remembers a new scenario in `onCreated`, so the hook imports no workspace and Trips can use it without an import cycle. `NameDialog`, `Confirm`, and `plural` moved to `src/ui/blocking/blockingDialogs.tsx`.
- BSS2: `ScopeFieldName` kept 'Blocking scenario' until BSS3, so typechecking passed between packages. The collapsed header stays on one line above 760 px; the figures line truncates with a tooltip.
- BSS3: after a delete, Blocking now selects the remembered or first remaining scenario (Decision 0076 item 9 amended); the former select only displayed its first option while nothing was selected.
- BSS4: the Blocking tab keeps its own remembered scenario per Trip Profile, so a scenario created on Trips is listed, not selected, when Blocking opens next (Decision 0076 item 11).

| Package | Content | Class / model | Owner |
|---|---|---|---|
| BSS0 | Decision 0076 and this plan | Primary | Primary agent (done) |
| BSS1 | Extract the Blocking Scenario commands into a shared module; Blocking tab keeps its current look | Structural (Luna) / Haiku | Agent 1 |
| BSS2 | Blocking summary surface, field menu, collapse, table height, scope bar | UI design (Sol) / Opus | Primary agent |
| BSS3 | Migrate browser specs to the new controls | Structural (Luna) / Haiku | Agent 2 |
| BSS4 | Trips Blocking scenario menu: lifecycle commands | Structural (Luna) / Haiku | Agent 3 |
| BSS5 | Review, documentation, full browser run, closeout | Primary / Opus | Primary agent |

Packages run in this order. Each ends at a verification gate: the agent reports, and the user starts the next package. BSS2 leaves some browser specs failing until BSS3 lands; this is expected and stated in BSS2's commit.

## Read first (every package)

1. `AGENTS.md`, `codex.md`, `architecture_overview.md`.
2. Decision 0076 in full, and Decision 0053.
3. `docs/ui-conventions.md`, sections "Blocking tab layout (UR-6d, BL-A)" and "Phase 4 implemented Blocking conventions".
4. The files your package owns, in full, before you edit them. The line numbers below were read on 2026-11-12 at commit `HEAD` of `claude/compassionate-mendel-flmd0i`. If code at a named line does not match the description, stop and report the difference. Do not guess.

## Facts read from the code (2026-11-12)

`src/ui/blocking/BlockingWorkspace.tsx` (720 lines; most statements are one long line):

- 164: state `tripProfileId`, `blockingScenarioId`, `serviceDayId`.
- 173: state `scenarioDialog` (`{ mode: 'create' | 'duplicate' | 'rename'; value: string }`) and `deleteScenario` (`{ scenario; impact: BlockingScenarioDeletionImpact }`).
- 206: `sourceSignature()` = `createBlockingScenarioSourceSignature(blockingScenario, allBlocks)`.
- 305: `refresh()` reloads scenarios, blocks, and calls `onReload()`. 307: `failed(error, fallback)`.
- 315: `saveScenario(name)`: rename → `blockingService.renameBlockingScenario(id, name, sourceSignature())`; duplicate → `duplicateBlockingScenario(id, name, sourceSignature())` (selection stays on the original); create → `createBlockingScenario({ scenarioId: records.scenario.id, tripProfileId: profile.id, name })`, then `setBlockingScenarioId(created.id)` and `rememberTripBlockingScenario(records.scenario.id, profile.id, created.id)`. Then closes the dialog and `refresh()`.
- 346: `requestDeleteScenario()` → `previewDeleteBlockingScenario(id)` → `setDeleteScenario`.
- 394: `exportCsv()`. 397: `scenarioOptions` = scenarios of the selected Trip Profile.
- 398–407: `blockingActionsMenu` (groups "Blocking scenario" and "Data"). 409: `blocksActionsMenu`.
- 504: `createPortal(...)` into `scopeSlot`: Route select, Trip profile select, Blocking scenario select (`onChange` sets `setScenarioSelectionCleared(!value)` and `setBlockingScenarioId`), Day `SegmentedControl`, spacer, `MenuButton` "Blocking actions".
- 505: no scenario → `<section className="prerequisite">`; otherwise the `.blocking-top` grid.
- 523: `<SummaryPanel …/>` then `<WorkSurface title="Blocks" ariaLabel="Blocks" className="blocks-surface" subtitle=… actions={Blocks actions}>` with `SelectionBar` and the `.blocking-blocks-table` table (`thead`, `tbody`, `tfoot`).
- 533: scenario `NameDialog`. 537: scenario delete `Confirm` (on success: `setScenarioSelectionCleared(true)`, `setBlockingScenarioId('')`, `refresh()`).
- 651: `SummaryPanel`. 655: `NameDialog`. 688: `Confirm`. Both are file-local.
- 59–61: the Unassigned collapsed preference (`readStoredRecord`, `localStorage` in `try/catch`): the model for the new preference.

`src/ui/trips/TripsWorkspace.tsx`:

- 51–53: Runtimes open preference (`storedRuntimesOpen`, `rememberRuntimesOpen`).
- 64: `rememberTripBlockingScenario(scenarioId, tripProfileId, blockingScenarioId)` (exported).
- 172: `blockingScenarios` state. 176–178: `setTripBlockingScenarioId` writes to `onBlockingScenarioChange` when given (side by side), else local state.
- 180: `tripBlockingBlocks`. 274–279: loads `blockingService.listBlockingBlocks(tripBlockingScenarioId)` with no day argument, so it holds every day's Blocks of the scenario.
- 255–271: effect that loads `listBlockingScenarios(records.scenario.id)`, keyed on `[blockingService, records.scenario.id, tripProfileId]`.
- 332: `selectedBlockingScenario`. 440: `requestShiftScopeChange(action)`.
- 734–741: `tripProfileMenu` (list, then Rename/Copy/Delete). 742–745: `tripBlockingScenarioMenu` (list only).
- 757–761: `sharedContext` with the two field menus.

`src/ui/trips/SideBySideTrips.tsx`: 59 holds the shared `blockingScenarioId`; 110–112 pass it to both panes. Only the left pane (`sharedControls`) draws the shared header.

`src/ui/shared/surfaces.tsx` 7: `WorkSurface` already supports `collapse: { open, onToggle, id }`, `count`, `context`, `subtitle`, `actions`. `src/ui/menuItems.tsx` exports `MenuItem` and `MenuGroup`.

`src/application/blockingService.ts`: `renameBlockingScenario`, `duplicateBlockingScenario`, `deleteBlockingScenario` each take a source signature and refuse a stale one.

---

## BSS1: Shared Blocking Scenario commands (Structural / Haiku)

**Goal.** Move the Blocking Scenario lifecycle code into one module, used by Blocking. There is no visible change.

**Owns.** New `src/ui/blocking/blockingDialogs.tsx`, new `src/ui/blocking/blockingScenarioCommands.tsx`, new `src/ui/blocking/blockingScenarioCommands.test.ts`, and `src/ui/blocking/BlockingWorkspace.tsx` (only the lines named here).

**Steps.**

1. Move `NameDialog` (655) and `Confirm` (688) unchanged to a new file, `src/ui/blocking/blockingDialogs.tsx`. Export them, and import them back into `BlockingWorkspace.tsx`, which also uses them for Blocks. No markup change. Do not put them in `src/ui/shared/dialogs.tsx`: that file already exports a type named `NameDialog` and the components `NameDialogForm` and `ConfirmDialog`, which have different props.
2. Create the hook `useBlockingScenarioCommands` in `blockingScenarioCommands.tsx`:
   ```ts
   type Options = {
     blockingService: BlockingApplication;          // same type BlockingWorkspace's props use
     scenarioId: string;                            // records.scenario.id
     tripProfileId: string | undefined;             // undefined disables New
     selected: BlockingScenario | undefined;
     sourceSignature: () => string;
     disabled: boolean;                             // caller's busy state
     onCreated: (created: BlockingScenario) => void;
     onDeleted: () => void;
     onChanged: () => Promise<void>;                // reload after any write
     onError: (error: unknown, fallback: string) => void;
   };
   returns { busy: boolean; items: { create: MenuItem; duplicate: MenuItem; rename: MenuItem; remove: MenuItem }; dialogs: ReactNode }
   ```
   - Copy the bodies of `saveScenario` (315), `requestDeleteScenario` (346), and the dialogs at 533 and 537, unchanged in behavior, error texts, labels, and ids (`new`, `duplicate`, `rename`, `delete`).
   - After create, call `rememberTripBlockingScenario(scenarioId, tripProfileId, created.id)`, then `onCreated(created)`.
   - After delete, call `onDeleted()`.
   - Then call `onChanged()`.
   - Each item has `restoreFocus: false` and is disabled under the same conditions as today, or when `disabled || busy`.
3. In `BlockingWorkspace.tsx`, replace the moved code with the hook. `onCreated` = `setScenarioSelectionCleared(false); setBlockingScenarioId(created.id)`. `onDeleted` = `setScenarioSelectionCleared(true); setBlockingScenarioId('')`. `onChanged` = `refresh`. `onError` = `failed`. Build `blockingActionsMenu` from `items.create`, the existing Auto-blocking item, `items.duplicate`, `items.rename`, `items.remove`, then the Data group, in today's order. Render `dialogs` where 533 and 537 were. The "New" item also calls `setScenarioSelectionCleared(false)` before it opens the dialog, as at 400. Keep that call, in the hook's `create.onSelect` or through a callback option.
4. Unit test (`blockingScenarioCommands.test.ts`): test the pure parts only. If the hook has none, extract `blockingScenarioDialogTitle(mode)` and `blockingScenarioSubmitLabel(mode)` and test them. Do not add a React test harness the repository does not have. Check `package.json` and `vitest.config.ts` first.

**Acceptance.** Run `pnpm typecheck` and `pnpm test`; both pass. `git diff` shows no change to labels, ids, or texts. These specs pass unchanged: `tests/ui/blocking-workspace.spec.ts`, `tests/ui/automatic-blocking.spec.ts`, `tests/ui/keyboard.spec.ts`. Run them with the command in `codex.md`.

---

## BSS2: Blocking summary surface (UI design / Opus)

**Owns.** `src/ui/blocking/BlockingWorkspace.tsx`, `src/ui/styles/blocking.css`, `src/ui/styles/responsive.css` (Blocking rules only), and `tests/ui/support/ui.ts` (seams only).

**Build.** Build Decision 0076 items 1–9:

- Order in the tab: Blocking summary surface, then the `.blocking-top` grid.
- `WorkSurface`:
  - `title` "Blocking summary · {day.name}", `ariaLabel` "Blocking summary", `count` = `dayBlocks.length`;
  - `collapse` with id `blocking-summary-body`;
  - `context` = Blocking scenario `MenuButton`: `fieldLabel` "Blocking scenario", `menuLabel` "Blocking scenario", `triggerAriaLabel` "Blocking scenario: {name}", `menuAlign` "start", `selectionStyle` as the Current block menu uses;
  - `actions` = the Blocks actions `MenuButton`.
- The list items set `setScenarioSelectionCleared(false)` and `setBlockingScenarioId(id)`, as the old `<select>` did.
- Remove the Blocking scenario `ContextField` and the scope-bar Actions `MenuButton` and spacer from the portal at 504.
- Fold `SummaryPanel` into the body. Remove the separate Blocks surface.
- Open-state preference as in Decision 0076 item 7, modeled on lines 59–61.
- Collapsed subtitle line from the existing `summary` values, with `tileHours` and `formatPercent`. Write "Incomplete" where the strip does.
- Table: a max-height scroll container. `thead` and `tfoot` sticky, with an opaque background. Keep `min-width: 1040px` horizontal scroll inside the surface.
- No-scenario state inside the surface body (item 9). Keep the `prerequisite` heading text.

**Judgment calls this package owns.**

- The exact max height.
- The subtitle wrapping at 1024 px.
- Header wrapping below 1100 px.
- The focus target after delete: the field-menu trigger.
- Whether the all-day factors line sits in the subtitle or the body when open.

**Seams.** Make these changes in `tests/ui/support/ui.ts`:

- Map the `blockingScenario.*` commands to a trigger matching `/^Blocking scenario: /` within the `Blocking summary` region, with menu "Blocking scenario".
- Add `chooseBlockingScenario(page, name)`, `selectedBlockingScenarioName(page)` (reads the trigger's name after "Blocking scenario: "), and `blockingScenarioMenu(page)`.
- Remove 'Blocking scenario' from `ScopeFieldName` and its map.

**Acceptance.**

- Typecheck, unit tests, and `pnpm build` pass.
- `tests/ui/blocking-layout.spec.ts`, updated by this package for layout assertions only, passes.
- Visual tour at 1024 px and 1440 px, open and collapsed, inspected.
- Keyboard: the disclosure, field menu, and Actions are reachable in that order. Arrow keys work in the menu. Escape returns focus to the trigger.

---

## BSS3: Spec migration (Structural / Haiku)

**Owns.** The spec files listed below only. Do not change `src/` or `tests/ui/support/ui.ts`. If a helper is missing, stop and report.

**Rules.**

| Old usage | New usage |
|---|---|
| `scopeField(page, 'Blocking scenario')` or `getByRole('combobox', { name: 'Blocking scenario' })` waited on `toHaveValue(/.+/)` | `await expect(blockingScenarioMenu(page)).toHaveAccessibleName(/^Blocking scenario: .+/)` |
| `.selectOption({ label: name })` | `chooseBlockingScenario(page, name)` |
| `locator('option:checked')` text | `selectedBlockingScenarioName(page)` |
| Counting `option` | Count `menuitemradio` in the open "Blocking scenario" menu, then press Escape |
| Click on `button` "Blocking actions", then a scenario item | `runCommand(page, 'blockingScenario.<id>')`. For Auto-blocking, open `blockingScenarioMenu(page)` with `openMenu(page, trigger, 'Blocking scenario')` and click "Auto-blocking…" |
| Heading `/^Weekday summary · \d+ blocks?$/` or `/summary · [1-9]\d* blocks?/` | The disclosure button in region "Blocking summary" named `/^Blocking summary · Weekday/`, plus a check of the count text |

**Usages to change** (file:line, read 2026-11-12):

- `automatic-blocking.spec.ts`: 16, 18, 44, 47, 65
- `automatic-blocking-backup.spec.ts`: 12, 38, 39, 41, 54, 57, 58
- `blocking-rules.spec.ts`: 21, 26
- `blocking-layout.spec.ts`: 30, 35 (229 was changed in BSS2)
- `blocking-workspace.spec.ts`: 25, 105, 116, 117, 182, 246
- `blocking-day-copy.spec.ts`: 16
- `blocking-bulk-delete.spec.ts`: 15, 47
- `blocking-defaults.spec.ts`: 18, 19, 30
- `blocking-context-menu.spec.ts`: 17
- `blocking-presentation.spec.ts`: 120, 140
- `keyboard.spec.ts`: 175
- `trips-table-display.spec.ts`: 102
- `drafts-and-preferences.spec.ts`: 257, 300 (Blocking tab). Leave 287, which is the Trips menu, unless it fails.
- `app-shell.spec.ts`: 46. The expected list becomes `['Route', 'Trip profile', '(Day)']`.

Before starting, run the search below. Treat any extra match as in scope and report it. The usages above came from this search:

```bash
grep -rn "Blocking scenario'\|Blocking actions\|summary · " tests/ui --include=*.spec.ts
```

**Acceptance.** Each changed spec passes. Then run all `tests/ui/blocking-*.spec.ts` plus `app-shell`, `keyboard`, `drafts-and-preferences`, `automatic-blocking*`, and `trips-table-display` together; they pass. No assertion is deleted. Each one is changed to an equivalent check.

---

## BSS4: Trips Blocking scenario lifecycle (Structural / Haiku)

**Owns.** `src/ui/trips/TripsWorkspace.tsx`, `src/ui/trips/SideBySideTrips.tsx`, `tests/ui/support/ui.ts` (add commands only), and one new spec `tests/ui/trips-blocking-scenario-menu.spec.ts`.

**Steps.**

1. In `TripsWorkspace`, call `useBlockingScenarioCommands` with these options:
   - `scenarioId` = `records.scenario.id`, `tripProfileId`, `selected` = `selectedBlockingScenario`;
   - `sourceSignature` = `createBlockingScenarioSourceSignature(selectedBlockingScenario, tripBlockingBlocks)`, or `''` when no scenario is selected;
   - `disabled` = `tripProfileBusy || Boolean(tripBlockAssignment) || tripBlockingBlocksBusy`;
   - `onCreated` = `requestShiftScopeChange(() => setTripBlockingScenarioId(created.id))`;
   - `onDeleted` = `setTripBlockingScenarioId('')`;
   - `onChanged` = increment a new `blockingScenarioListVersion`;
   - `onError` = `onError`.

   The signature can use `tripBlockingBlocks` because lines 274–279 load it without a day argument, so it holds every day's Blocks. Confirm this before relying on it.
2. Add `blockingScenarioListVersion` to the dependency list of the effect at 255–271. In side by side, both panes must reload:
   - lift the version into `SideBySideTrips` (state beside line 59);
   - pass `blockingScenarioListVersion` and `onBlockingScenarioListChanged` to both panes, as `blockingScenarioId` is passed at 112;
   - a pane uses the props when given, else its own state, as `setTripBlockingScenarioId` does at 176–178.
   - Add both props to the `ContainerProps` `Omit` list at line 46.
3. Wrap New and Delete in `requestShiftScopeChange`, because they change the selected scenario. Rename and Duplicate are not wrapped.
4. In `tripBlockingScenarioMenu` (742), add a second group `{ items: [create, duplicate, rename, remove] }`. Do not add Auto-blocking or Export.
5. On the `MenuButton` at 760, add `triggerAriaLabel={`Blocking scenario: ${selectedBlockingScenario?.name ?? 'No blocking scenario'}`}`.
6. Render `dialogs` once per workspace instance. Only the instance with `sharedControls` shows the menu, so only that instance's dialogs can open.

**Spec.** `tests/ui/trips-blocking-scenario-menu.spec.ts` covers:

- New: the new scenario is selected in Trips and appears in Blocking.
- Rename: the trigger name updates.
- Duplicate: the selection stays on the original and the copy is listed.
- Delete: the selection falls back to the first remaining scenario, or to "No blocking scenario".
- One side-by-side check: after New in the shared header, the right pane's Block column uses the new, empty scenario, so all its trips show unassigned.

**Acceptance.** Typecheck, unit tests, the new spec (10 repeats with 8 workers, per `codex.md`), `side-by-side-trips.spec.ts`, `trips-runtime-presentation.spec.ts`, and `workflow-section-layout.spec.ts` all pass.

---

## BSS5: Review and closeout (Primary / Opus)

1. Review BSS1–BSS4 diffs against Decision 0076. Check behavior parity of the moved code: error texts, stale-signature refusals, focus return.
2. Update the documentation:
   - `docs/ui-conventions.md`: lines describing the Blocking scope bar, the summary and Blocks table, the Trips Blocking scenario menu, and the scope-selector list. Today these are about lines 67, 97, 110–114, 122, 162, 207, and 216.
   - `architecture_overview.md` line 182 (the toolbar contents).
   - Decision 0053 status line: add "Item 4 superseded for Blocking by Decision 0076".
   - Decision 0066 Category E note.
   - `codex.md` current status.
   - Decision 0076 status.
3. Run the full browser suite, the full unit suite, typecheck, and build. Take visual tour screenshots at 1024 px and 1440 px. Report them to the user for acceptance.

## Verification per package

| Package | Run | Skip | Do not cut |
|---|---|---|---|
| BSS1 | typecheck; unit suite; `blocking-workspace`, `automatic-blocking`, `keyboard` specs | Full browser suite: no visible change | Typecheck; the three specs proving behavior is unchanged |
| BSS2 | typecheck; unit suite; build; `blocking-layout` spec; visual tour; keyboard pass | Specs that BSS3 migrates: they fail by design until BSS3 | Typecheck; build; visual inspection |
| BSS3 | Each changed spec; then the Blocking, app-shell, keyboard, drafts, automatic-blocking, and trips-table-display specs together | Unit suite: no source change | Every migrated spec passing; no deleted assertion |
| BSS4 | typecheck; unit suite; new spec ×10; side-by-side, trips-runtime-presentation, workflow-section-layout specs | Full browser suite: the closeout runs it | Typecheck; `side-by-side-trips` spec |
| BSS5 | Full browser suite; unit suite; typecheck; build; visual tour | None | The full closeout run |
