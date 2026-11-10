# Decision 0064: Project Context Menu, Deleting Any Project from the List, and Shared Context Menus

- Status: Accepted (2026-11-10). Plan: `docs/implementation/project-context-menu.md`.
- Date: 2026-11-10 (user choice of option A: removing a project from the list deletes it from this browser)
- Related: Decision 0061 (per-viewer convenience state), review issue I-045 (local data protection)

## Context

The Project switcher lists every project stored in this browser's IndexedDB (`repository.listProjects()`), not a list of recent projects. A project leaves the list only when it is deleted, and "Delete project…" acts only on the open project. Planners collect old projects and must open each one to delete it. The app has no context menus.

Two options were reviewed:

- A: delete the project from this browser;
- B: hide it with a per-browser flag.

The user chose A. B would add a second state that keeps the browser storage in use and confuses restore.

## Decision

1. **Removing means deleting.** Right-clicking a project in the Projects group of the Project switcher opens a context menu for that project with these items:
   - Open;
   - Rename…;
   - Back up project (JSON);
   - Delete project….

   Every item works on that project, whether it is open or not. The switcher's own items ("Rename project…", "Back up project (JSON)", "Delete project…") keep working on the open project. No "hide" state is added.
2. **Deletion review.** Deleting any project uses the existing review (`getProjectDeletionImpact`, then `deleteProject` with its review token) and the existing dialog text.
   - Deleting the project that is not open asks no unsaved-route question, because its edits are not on screen. The open project, scenario, route and tab stay selected.
   - Deleting the open project keeps today's behavior: the unsaved-route check, then the Route tab, then the first remaining project.
3. **Backup guard.** The deletion dialog says whether this browser exported a backup of that project after the project's last change.
   - Without such a backup, the text adds "No backup of this project has been exported since its last change." The dialog then offers Cancel, Back up and delete, and Delete project.
   - Back up and delete starts the JSON download and then deletes the project with the same review token. If the export fails, nothing is deleted.
   - The browser cannot report whether the file was saved to disk, so starting the download counts as the backup.
4. **Per-project backup time.** `LocalDataProtection` gains `projectBackupExportedAt: Record<projectId, ISO time>`, written by every project export, beside the existing `lastBackupExportedAt`, which keeps driving the header status.
   - Like the existing protection facts, it is device-local convenience state: it is kept in `localStorage`, never in IndexedDB or in a backup.
   - Malformed entries are dropped when it is read.
   - Deleting a project removes its entry.
   - A browser with only the old single timestamp has no per-project times, so every project starts as "no backup".
5. **Last change.** A project's last change is the latest `updatedAt` of the project and of every record in its snapshot. It is derived when the dialog opens and never stored.
6. **Backups are unaffected.** Deleting a project never reads, changes or removes a backup file. Restore from backup brings back the project as it was exported. The backup format (schema 11) and the Dexie schema (version 10) do not change.
7. **Shared context-menu model.** Context menus are a shortcut to actions that remain reachable without them. These rules apply to this menu and every later one.
   - **Content.** An object's actions are one `MenuGroup[]` builder, and both its visible menu and its context menu use it. The context menu shows the object's name as a heading. The group order is:
     1. open or select;
     2. edit;
     3. data;
     4. destructive actions, last.
   - **Opening.** The menu opens with the secondary mouse button, the context-menu key, Shift+F10 on the focused element, or a touch long-press of 500 ms.
   - **Keyboard.** Keyboard behavior matches `MenuButton`: arrow keys, Home and End, and Escape. When the menu closes, focus returns to the element that opened it.
   - **Placement.** A menu opened by the pointer opens at the pointer. A menu opened from the keyboard opens at the element's lower-left corner. The menu is kept inside the window.
   - **Closing.** The menu closes on scroll, resize, Escape, an outside click, or when an item is chosen.
   - **Browser menu.** Text inputs, text areas, and grid cells in edit mode keep the browser's own menu, so copy and paste keep working. Elements with no actions also keep it.
   - **Nesting.** A context menu opened on an item of an open menu sits beside that item. Escape closes only the context menu, and focus returns to the item.

## Consequences

- The planner can clear old projects from the list without opening each one, and is warned before deleting a project with no recent backup.
- The per-project backup time is a browser convenience. Clearing site data or using another browser loses it, so the guard then warns about projects that do have a backup file.
- A change made only by deleting records may not move the last-change time. After such a change the guard can report a backup as current.
- Later context menus (Scenario, Route, Trip Profile, Block, grid rows) reuse the `ContextMenu` component and the rules in item 7. Each one needs its own decision on which actions it shows.

## Rejected alternatives

- **Hide from the list (option B).** Keeps the data in browser storage and adds a hidden state, plus questions about restoring a backup over a hidden project.
- **A "⋯" button inside each project menu item.** A button inside a menu item breaks the ARIA menu pattern.
- **Storing backup times in IndexedDB.** Backup history describes this browser, not the project, and must not travel in backups.
