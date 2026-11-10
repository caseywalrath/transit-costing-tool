# Project Context Menu and Deleting Any Project: Implementation Plan

- Decision: `docs/decisions/0064-project-context-menu-and-deletion-from-list.md`
- Date: 2026-11-10
- Status: Implemented (2026-11-10). See `project-context-menu-closeout.md`.

## Roles

| Role | Model | Responsibility |
|---|---|---|
| Orchestrator | Opus | Hands each package to its implementer, reviews every diff against this plan, runs the gate checks, owns PCM3 and PCM5, and gives the user the result at each gate |
| Structural implementer | Haiku | PCM1, PCM2, PCM4. Follows the instructions exactly. Stops and reports instead of guessing when the code differs from what a package describes |

Rules for the structural implementer, repeated in each hand-off:

1. Read every file named in the package before editing it. The line numbers below are from commit `b02c6ba` and can move. Find the code by the quoted text, not by the line number.
2. Edit only the files the package lists. Use the file-edit tool. Do not use `sed`, shell redirection or scripts on source files (`AGENTS.md`).
3. Do not rename, reformat or reorder code the package does not mention.
4. Do not make layout, wording or interaction choices. Use the strings below exactly. If a string or behavior is missing here, stop and ask the orchestrator.
5. Run only the checks the package lists, and report each one as passed or failed. For a failure, include the output.
6. Do not commit. The orchestrator reviews the diff and commits.

## Facts the plan relies on (verified at `b02c6ba`)

| Fact | Where |
|---|---|
| The Projects group lists every stored project as radio items; the actions below it use the open project | `src/ui/App.tsx:238-249` (`const projectActions: MenuGroup[]`) |
| Delete review and delete for the open project only | `src/ui/App.tsx:139-145` (`function deleteCurrentProject()`) |
| Rename acts on `selectedProject` | `src/ui/App.tsx:138` (`renameCurrentProject`); the service call `service.renameProject(projectId, name)` already takes any ID (`src/application/routeDefinitionService.ts:427`) |
| Export uses the open project | `src/ui/App.tsx:201` (`exportJson`); `service.exportProject(projectId)` takes any ID and calls `this.protection?.recordBackupExported()` with no argument (`routeDefinitionService.ts:638-642`) |
| Review token and impact | `getProjectDeletionImpact(projectId)` returns `ProjectDeletionImpact` (`routeDefinitionService.ts:99-108`, `435-439`); `deleteProject(projectId, reviewToken)` (`441-447`) |
| Protection facts: one global backup time | `LocalDataProtection` (`src/application/ports.ts:74-81`); `LocalDataProtectionService.recordBackupExported()` (`src/application/saveStatus.ts:150-153`); `LocalStorageDataProtectionStore.load()` validates each field (`src/persistence/localDataProtectionStore.ts:15-28`) |
| Confirm dialog has one action | `Confirmation = { title; text; action; confirmLabel? }` and `ConfirmDialog` (`src/ui/shared/dialogs.tsx:5`, `22-24`) |
| Menus | `MenuButton`, `MenuItem`, `MenuGroup` (`src/ui/MenuButton.tsx`); `Switcher` wraps `MenuButton` (`src/ui/shell/AppHeader.tsx:21-24`) |
| Every record has `updatedAt` | `EntityMetadata` (`src/domain/types.ts:8`); snapshot collections in `ProjectSnapshot` (`src/domain/types.ts:155-176`) |
| No context menus exist | `grep -rn "contextmenu\|onContextMenu" src` returns nothing |
| Scripts | `npm run typecheck`, `npm test` (Vitest), `npm run test:ui` (Playwright), `npm run build` (`package.json`) |

## Packages

| Package | Class / model | Files | Depends on |
|---|---|---|---|
| PCM1 Per-project backup times | Structural / Haiku | `src/application/ports.ts`, `src/application/saveStatus.ts`, `src/persistence/localDataProtectionStore.ts`, `src/application/routeDefinitionService.ts` (`exportProject`, `deleteProject` only), tests | — |
| PCM2 Last change and backup status in the deletion review | Structural / Haiku | `src/domain/project.ts` (new function), `src/application/routeDefinitionService.ts` (`ProjectDeletionImpact`, `getProjectDeletionImpact` only), tests | PCM1 |
| PCM3 `ContextMenu` component | UI design / Opus | `src/ui/ContextMenu.tsx` (new), `src/ui/MenuButton.tsx` (extract the shared item list only), `src/ui/styles/*.css` (the file that holds `.action-menu`), tests | — |
| PCM4 Project actions for any project, wiring | Structural / Haiku | `src/ui/App.tsx`, `src/ui/shared/dialogs.tsx`, `src/ui/shell/AppHeader.tsx`, `tests/ui/project-context-menu.spec.ts` (new) | PCM1–PCM3 |
| PCM5 Closeout | Orchestrator / Opus | `architecture_overview.md`, `docs/ui-conventions.md`, `docs/implementation/project-context-menu-closeout.md` (new) | PCM4 |

PCM1 and PCM3 can run in parallel.

---

### PCM1 Per-project backup times (Haiku)

**Goal.** Record, on this browser, when each project was last exported, and forget a project's entry when it is deleted.

**Steps.**

1. `src/application/ports.ts`, in `interface LocalDataProtection`, after `lastBackupExportedAt?: string;`, add:
   ```ts
   /** When each project was last exported as a JSON backup on this browser profile (Decision 0064), by project ID. Absent until the first export. */
   projectBackupExportedAt?: Record<string, string>;
   ```
2. In `src/persistence/localDataProtectionStore.ts`, in `load()`, after the `lastBackupExportedAt` line, add the following check:
   - If `record.projectBackupExportedAt` is a non-null, non-array object, build a new object.
   - Keep only the entries whose key is a non-empty string and whose value is a string for which `!Number.isNaN(Date.parse(value))`.
   - Set `state.projectBackupExportedAt` only when at least one entry is kept.

   Change nothing else in the file.
3. In `src/application/saveStatus.ts`:
   - Change `recordBackupExported(): void` to `recordBackupExported(projectId?: string): void`. The body sets `lastBackupExportedAt: at` as now. When `projectId` is given, it also sets `projectBackupExportedAt: { ...this.state.projectBackupExportedAt, [projectId]: at }`. Compute `const at = this.now();` once.
   - Add this method after it:
     ```ts
     /** Forgets a deleted project's backup time (Decision 0064). */
     forgetProjectBackup(projectId: string): void
     ```
     If the project has no entry, it returns without calling `update`. Otherwise it removes the key, and removes `projectBackupExportedAt` entirely when it becomes empty.
4. In `src/application/routeDefinitionService.ts`:
   - In `exportProject`, change `this.protection?.recordBackupExported();` to `this.protection?.recordBackupExported(projectId);`.
   - In `deleteProject`, after the `await this.save(...)` line, add `this.protection?.forgetProjectBackup(projectId);`.
5. Tests:
   - In `src/persistence/localDataProtectionStore.test.ts`, add one test where a stored map has one valid entry, one entry with an invalid date and one entry whose value is a number. `load()` returns only the valid entry. Add a second test where a stored array returns no `projectBackupExportedAt`.
   - In `src/application/saveStatus.test.ts` (`describe('LocalDataProtectionService')`), add tests that:
     - `recordBackupExported('p1')` sets both fields to the clock time;
     - `recordBackupExported()` sets only `lastBackupExportedAt`;
     - `forgetProjectBackup('p1')` removes the entry, and removes the map when it is the last entry;
     - `forgetProjectBackup('missing')` does not notify listeners.
   - In `src/application/routeDefinitionService.test.ts`, find the existing test that constructs the service with a protection service. If none exists, report this instead of inventing one. Add a test that exporting project A and then deleting it leaves no entry for A.

**Checks.** `npm run typecheck`; `npx vitest run src/persistence/localDataProtectionStore.test.ts src/application/saveStatus.test.ts src/application/routeDefinitionService.test.ts`; then `npm test` once.

**Review (orchestrator).**
- No new field reaches `src/persistence/backup.ts` or Dexie.
- The header status still reads `lastBackupExportedAt` only.
- `forgetProjectBackup` runs only after a successful delete.

---

### PCM2 Last change and backup status in the deletion review (Haiku)

**Goal.** The deletion review reports the project's last change time and whether a backup on this browser is newer.

**Steps.**

1. In `src/domain/project.ts`, add and export:
   ```ts
   /** Latest `updatedAt` of the Project and every record in its snapshot (Decision 0064). Pure; ISO strings compare by `Date.parse`. */
   export function projectLastChangedAt(snapshot: ProjectSnapshot): string
   ```
   - Iterate `snapshot.project` and every array of `ProjectSnapshot`.
   - Treat the optional arrays as `?? []`.
   - Skip values whose `Date.parse` is `NaN`.
   - Return the original string of the greatest value. Return `snapshot.project.updatedAt` when no value parses.

   `ProjectSnapshot` is already imported in that file (line 6). Before editing, open `src/domain/types.ts:155-176` and list the collections. If a collection's element type lacks `updatedAt`, stop and report it.
2. In `src/application/routeDefinitionService.ts`, in `interface ProjectDeletionImpact`, add:
   ```ts
   /** Latest change to the project's records (Decision 0064). */
   lastChangedAt: string;
   /** True when this browser exported a backup of the project at or after `lastChangedAt`. */
   backedUpSinceLastChange: boolean;
   ```
   In `getProjectDeletionImpact`, compute both values:
   - `lastChangedAt` is `projectLastChangedAt(snapshot)`.
   - Read `const exportedAt = this.protection?.getLocalDataProtection().projectBackupExportedAt?.[projectId]`.
   - `backedUpSinceLastChange` is `exportedAt !== undefined && Date.parse(exportedAt) >= Date.parse(lastChangedAt)`.

   Do not change `reviewToken`.
3. Tests:
   - In `src/domain/project.test.ts` (it exists), add tests for:
     - the latest value across the project, a trip and a block;
     - optional collections being absent;
     - invalid dates being ignored.
   - In `src/application/routeDefinitionService.test.ts`, add tests for:
     - no export gives `false`;
     - an export after the last save gives `true`;
     - a save after the export gives `false`. Use the service's injected clock and advance it between the steps; find how existing tests inject `now`.

**Checks.** `npm run typecheck`; `npx vitest run src/domain/project.test.ts src/application/routeDefinitionService.test.ts`; then `npm test` once.

**Review (orchestrator).**
- The function is pure and lives in the domain.
- Existing deletion tests (`routeDefinitionService.test.ts:658`, `660`, `730`) still pass without changes.

---

### PCM3 `ContextMenu` component (Opus, UI design)

**Goal.** A reusable context menu that meets Decision 0064 item 7 and shares item rendering with `MenuButton`.

**Steps.**

1. Extract the item rendering from `MenuButton.tsx`, line 57 to line 66 (the `groups.map(...)` block that renders groups, separators, labels, items and notes), into `MenuGroups({ groups, menuId, selectionStyle, onChoose })`.
   - `MenuButton` renders `MenuGroups` with unchanged DOM, roles and classes.
   - Existing browser specs that use menus must pass unchanged. This step is what proves it: `keyboard.spec.ts`, `trip-selection-menus.spec.ts` and `app-shell.spec.ts`.
2. Add `src/ui/ContextMenu.tsx`:
   - `useContextMenu(buildGroups: () => MenuGroup[] | undefined, heading: string)` returns props to spread on the target element (`onContextMenu`, `onKeyDown` for the ContextMenu key and Shift+F10, and pointer handlers for a 500 ms touch long-press that a move over 10 px cancels) and the menu element to render.
   - `undefined` or empty groups do not call `preventDefault`, so the browser menu stays.
   - Targets inside `input`, `textarea` or `[contenteditable]` keep the browser menu.
   - The menu is `role="menu"`, its accessible name is `${heading} actions`, and it is rendered through a portal to `document.body` with `position: fixed`. It is placed at the pointer, or at the target's bottom-left for keyboard opening, and clamped inside the viewport.
   - The first enabled item takes focus. Keys behave as in `MenuButton`.
   - Escape, Tab, choosing an item, an outside pointer-down, scroll or resize closes the menu. Closing returns focus to the target, except that a chosen item which opens a dialog keeps `rememberDialogInvoker(target)`, as `MenuButton` does.
   - The heading uses the `.action-menu-label` style and `role="presentation"`.
3. **Inside an open menu.** When the target is an item of an open `MenuButton` menu:
   - The parent menu's outside pointer-down and Escape handlers ignore events inside the context menu.
   - Escape in the context menu stops propagation.
   - Choosing a context item closes both menus.

   Add `data-menu-layer` on the portal and check for it in `MenuButton`'s `onPointerDown`.
4. Styles: reuse `.action-menu`. Add only `.action-menu--context { position: fixed; }` if a rule is needed.
5. Tests (browser, a harness page or the first use in PCM4), covering:
   - opening by right-click, by Shift+F10 and by long-press (`page.touchscreen` / dispatched pointer events);
   - focus returning to the target;
   - the menu not opening on a text input;
   - Escape closing only the inner menu.

**Checks.** `npm run typecheck`; `npm run build`; the three menu specs above; visual inspection at 1440 and 1024 px in light and dark themes.

---

### PCM4 Project actions for any project, wiring (Haiku)

**Goal.** Right-clicking a project in the Projects group opens Open, Rename…, Back up project (JSON) and Delete project… for that project. The deletion dialog applies the backup guard.

**Steps.**

1. In `src/ui/shared/dialogs.tsx`:
   - Extend `Confirmation` with `secondary?: { label: string; action: () => void }`.
   - In `ConfirmDialog`, when `secondary` is set, render `<button onClick={() => { dialog.secondary!.action(); onClose(); }}>{dialog.secondary.label}</button>` between Cancel and the danger button.
   - No other change.
2. In `src/ui/App.tsx`, replace the three current-project functions with project-parameter versions. Keep the existing strings exactly.
   - `renameProjectById(project: Project, name: string)`: the body of `renameCurrentProject`, using `project.id`.
   - `exportProjectJson(project: Project): Promise<boolean>`: the body of `exportJson`, using `project.id` and `${project.name}.json`. It returns `true` on success and `false` after `showError`.
   - `deleteProject(project: Project)`: the body of `deleteCurrentProject` with these changes:
     - (a) If `impact.backedUpSinceLastChange` is false, append `' No backup of this project has been exported since its last change.'` to the text. Set `secondary: { label: 'Back up and delete', action: () => { void exportProjectJson(project).then((ok) => { if (ok) runDelete(); }); } }`. Here `runDelete` is the existing delete action, moved to a local function.
     - (b) In `runDelete`, after the delete succeeds: if `project.id === projectId`, keep the existing `setActiveTab('route'); await reload(project.id);`. Otherwise call `await reload(projectId, scenarioId, routeId)` and do not change the tab.

   Keep `deleteCurrentProject`, `renameCurrentProject` and `exportJson` as one-line wrappers that pass `selectedProject`, so the existing menu items keep working.
3. In `src/ui/App.tsx`, in `projectActions`, give each project item a context menu, via the `MenuItem` field that PCM3 adds (`contextGroups?: () => MenuGroup[]`, `contextHeading?: string`; the orchestrator confirms the final name in the PCM3 review). Its groups are:
   - `[{ items: [{ id: 'ctx-open', label: 'Open', disabled: project.id === projectId, onSelect: <the existing item's onSelect> }] }]`;
   - `{ items: [{ id: 'ctx-rename', label: 'Rename…', onSelect: () => setNameDialog({ title: 'Rename project', label: 'Project name', initialValue: project.name, submitLabel: 'Rename', action: (name) => renameProjectById(project, name) }) }] }`;
   - `{ label: 'Project data', items: [{ id: 'ctx-backup', label: 'Back up project (JSON)', note: <see below>, onSelect: () => { void exportProjectJson(project); } }] }`;
   - `{ items: [{ id: 'ctx-delete', label: 'Delete project…', destructive: true, onSelect: () => project.id === projectId ? requestRouteNavigation(() => deleteProject(project)) : deleteProject(project) }] }`.

   `contextHeading` is `project.name`. The backup note is `Last backup: ${formatBackupTime(t)}` when `protection.projectBackupExportedAt?.[project.id]` is set. Otherwise it is `'No backup exported yet'`.
4. In read-only mode (`sessionStatus.mode === 'readOnly'`), disable Rename… and Delete project… in the context menu. Before setting this, check how the existing switcher items behave in read-only mode and copy that behavior. If they are not disabled, report it and do not add the check.
5. Do not change `src/ui/shell/AppHeader.tsx` unless PCM3's API needs it. If it does, change only that.
6. Add `tests/ui/project-context-menu.spec.ts`. Seed two projects by copying the seeding approach of an existing spec that uses `seedSnapshot`, and confirm the approach in `tests/ui/support/dexieEnv.ts`. Test these cases:
   - Right-clicking the second project in the Projects menu shows Open, Rename…, Back up project (JSON) and Delete project….
   - Rename… renames the project that is not open, and the open project's name is unchanged.
   - Delete project… on the project that is not open:
     - the dialog contains the no-backup sentence and the Back up and delete button;
     - Delete project removes it from the list;
     - the open project, the tab and the scenario stay;
     - IndexedDB holds one project.
   - Back up and delete starts a download (`page.waitForEvent('download')`) and then deletes the project.
   - After Back up project (JSON) on a project, the dialog for that project has no no-backup sentence.
   - Shift+F10 on a focused project item opens the same menu.

**Checks.** `npm run typecheck`; `npm run build`; `npx playwright test tests/ui/project-context-menu.spec.ts tests/ui/app-shell.spec.ts tests/ui/data-safety.spec.ts tests/ui/local-data-protection.spec.ts tests/ui/keyboard.spec.ts tests/ui/backup-import.spec.ts --trace off`; then `npm test` once.

**Review (orchestrator).**
- Deleting the open project behaves exactly as before.
- No unsaved-route prompt appears for a project that is not open.
- The visible switcher items are unchanged.
- The strings match Decision 0064.

---

### PCM5 Closeout (Opus)

1. In `architecture_overview.md`, add the per-project backup times to the local-data protection section and the `ContextMenu` component to the UI shell section.
2. In `docs/ui-conventions.md`, add the context-menu rules (Decision 0064 item 7).
3. Write `docs/implementation/project-context-menu-closeout.md` with the packages, the acceptance results and the deviations.
4. Mark Decision 0064 as "Accepted and implemented".
5. Run the full unit suite and the full browser suite (`npm run test:ui -- --trace off`). Do the visual inspection.

## Acceptance criteria

1. Any listed project can be opened, renamed, backed up or deleted from its context menu without opening it first.
2. Deleting the project that is not open keeps the open project, the scenario, the route and the tab. Deleting the open project behaves as before.
3. The deletion dialog warns, and offers Back up and delete, exactly when this browser has no backup of that project at or after its last change.
4. Back up and delete deletes nothing when the export fails.
5. Backup files, the backup schema (11) and the Dexie schema (10) are unchanged. Restoring a deleted project's backup brings it back.
6. The context menu opens by right-click, by the ContextMenu key or Shift+F10, and by a touch long-press. Its keyboard behavior matches the existing menus, focus returns to the item, and text inputs keep the browser's menu.
7. Every action in the context menu stays reachable without it: open from the list, or the switcher's own items after opening the project.

## Verification summary

| Package | Run | Skip | Do not cut |
|---|---|---|---|
| PCM1 | Typecheck; the three test files; full unit suite | Browser suite (no screen change) | `localDataProtectionStore` and `saveStatus` tests |
| PCM2 | Typecheck; the two test files; full unit suite | Browser suite | Existing project-deletion tests |
| PCM3 | Typecheck; build; menu specs; visual inspection | Full browser suite until PCM5 | Existing menu specs unchanged |
| PCM4 | Typecheck; build; the six specs listed; full unit suite | Full browser suite until PCM5 | `data-safety`, `local-data-protection`, `backup-import` specs |
| PCM5 | Full unit and browser suites; visual inspection | — | Everything |
