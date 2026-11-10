# Project Context Menu and Deleting Any Project: Closeout

- Decision: `docs/decisions/0064-project-context-menu-and-deletion-from-list.md`
- Plan: `docs/implementation/project-context-menu.md`
- Date: 2026-11-10
- PR: caseywalrath/transit-costing-tool#52

## Packages

| Package | Implementer | Commit | Result |
|---|---|---|---|
| PCM1 Per-project backup times | Haiku, reviewed by Opus | `8a11e90` | `projectBackupExportedAt` in `LocalDataProtection`; validated on load; written on export; removed on delete |
| PCM2 Deletion review | Haiku, reviewed by Opus | `edd8b68` | `projectLastChangedAt` (domain); `lastChangedAt` and `backedUpSinceLastChange` in `ProjectDeletionImpact` |
| PCM3 `ContextMenu` | Opus | `fc0e9b0` | `src/ui/menuItems.tsx` (shared `MenuGroups`, `moveMenuFocus`, `MenuItem.contextGroups`); `src/ui/ContextMenu.tsx`; `MenuButton` opens item context menus |
| PCM4 Wiring | Haiku, reviewed by Opus | `2733155` | Project context menu; `Confirmation.secondary`; project-parameter rename, export and delete; `tests/ui/project-context-menu.spec.ts` (6 tests) |
| PCM5 Closeout | Opus | this commit and `a015a08` | Docs; full suites; visual inspection; context-menu width and heading style fixed |

## Acceptance criteria

1. Any listed project can be opened, renamed, backed up or deleted from its context menu. Verified by browser tests.
2. Deleting the project that is not open keeps the open project, scenario and tab. Verified by a browser test. Deleting the open project behaves as before: the existing specs pass unchanged.
3. The warning and **Back up and delete** appear exactly when this browser has no backup since the last change. Verified by unit tests (PCM2) and two browser tests.
4. Back up and delete deletes nothing when the export fails. The code runs the delete only after `exportProjectJson` returns `true`. No test forces an export failure.
5. The backup schema (11) and the Dexie schema (10) are unchanged. `backup-import.spec.ts` and the backup unit tests pass.
6. The menu opens by right-click and by Shift+F10 (browser tests); its keys and focus return follow `MenuButton`. The touch long-press is implemented but has no browser test.
7. The switcher's own items are unchanged, so every action stays reachable without the context menu.

## Verification

- `npm run typecheck`; `npm run build`.
- Full unit suite: 1218 passed.
- Full browser suite: 301 passed, 2 skipped (9.4 min).
- After the style fix, `project-context-menu.spec.ts` and `keyboard.spec.ts` were run again: 21 passed.
- Visual inspection at 1024 px, light theme: the context menu beside the open Projects menu, and the delete dialog with Back up and delete. Dark theme was not inspected.

## Deviations from the plan

- The plan's `useContextMenu` hook, for targets that are not menu items, was not built because nothing uses it yet. The first context menu on a table row or card should add it, built on `ContextMenu`.
- The read-only check (PCM4 step 4) was not added. The switcher's own Rename and Delete items are not disabled in read-only mode, and writes are refused by the save path. Making menus aware of read-only mode is a separate decision.
- The PCM1 test for deleting a project after backing it up was added by the orchestrator, in `saveStatus.test.ts`, because `routeDefinitionService.test.ts` builds no service with a protection record.
