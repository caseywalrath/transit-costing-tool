# Decision 0081: Restore Points and Working Context

- Status: Accepted (user, 2026-11-17: every recommendation D1 to D9 of `docs/implementation/undo-and-context.md`); items 1 to 10 implemented (FX1 to FX6, closeout `docs/implementation/undo-and-context-closeout.md`, 2026-11-18); items 11 and 12 not yet implemented (FX7, FX8)
- Date: 2026-11-17
- Supersedes, when the named package lands: Decision 0076 on the placement of the Blocking scenario field menu and of the Trips Trip profile and Blocking scenario menus (FX6); Decision 0051 on the per-Scenario cost basis preference (FX6); Decisions 0046 and 0070 on the single regeneration undo slot (FX8)
- Related: Decision 0036 (writes re-read stored data), Decision 0037 (single writing tab), Decision 0041 (review tokens), `docs/implementation/destructive-actions-inventory.md`

## Context

The destructive-actions inventory (2026-11-17) found 17 High-risk actions. None has an in-place undo; the only recovery is a JSON backup restore, which creates a separate project. Warnings exist for all of them, but several do not name effects on other tabs or on blocking scenarios the planner cannot see.

The user also asked for better awareness of the working context. Scheduling systems such as Trapeze make the planner set a context (signup, route, pattern, service day) and show it continuously in the menu bar. This application has equivalents (Project, Scenario, Route, Trip profile, Blocking scenario, Day, Direction), but Trip profile and Blocking scenario are shown inside work-surface headers rather than in the scope bar, the Trip profile and Day fall back to the first entry after a page reload, and the Costing cost basis keeps its own Trip profile choice. A planner can therefore work in the wrong Trip profile without noticing. The user asked for a fix that avoids excessive nagging.

## Decision

### Undo

1. **Restore points.** Every command in the plan's coverage table stores a restore point in the same IndexedDB transaction as its write. A failed command stores nothing; a restore point never exists without its change. Coverage is applied at the composition root by a proxy (`withRestorePoints`, `src/application/restorePointCoverage.ts`), so the covered service methods themselves do not change. The proxy also runs the whole command inside the shared save-status publisher, so the header shows "saved" only after the restore point is stored.
2. **Content.** A restore point records the difference between the Scenario's records (`getScenarioRecords`) before and after the command: the full rows it removed, the previous version of the rows it changed, the ids it added, and a stamp of each row it changed or added. Project deletion records the full project snapshot. A restore point also records its kind, per-collection counts, an optional quantity and detail, and the names of the context it ran in, resolved from the "before" records so they read after a deletion.
3. **Restoring.** Restoring puts the removed and changed rows back and deletes the added rows in one Scenario write (`updateScenarioRecords`, with its validation and pruning). It is refused, naming the records, when a row the command changed or added has changed since, when a changed row was deleted since, or when a removed row's id exists again. Restore points are independent: an older one can be restored while its rows are untouched, whatever came after it. A restore of an existing Scenario is itself recorded, so it can be undone; restoring a deleted Scenario or Project is not recorded.
4. **Storage.** Two new Dexie tables (version 13): `restorePoints` (summaries, indexed by `projectId` and `createdAt`) and `restorePointPayloads` (the differences and snapshots), so listing never loads payloads. They are local operational data: not in JSON backups, not copied with a Scenario or Project, kept across reloads and after their project is deleted. Retention: the newest 20, none older than 30 days, at most 50 MB in total by the serialized length at capture; the oldest go first; the newest is always kept. On a storage-full failure the newest 5 are kept and the command's error is reported unchanged.
5. **No new confirmations.** Three confirmations of single, visible removals are replaced by the Undo notice (removing one activity from the Current block, deleting one deadhead, unassigning one trip from its Block pill). Every other confirmation stays. Project deletion keeps its backup prompt; no other backup prompt is added.

### Working context

6. **No silent context changes.** The Trip profile and Day of each Scenario and the Direction of each Route are remembered on the device across reloads (`transit-costing-tool.working-context.v1`). When the remembered Trip profile no longer exists the first time a Scenario opens in a session, the notice area says which one opened instead. A change the planner made does not produce a notice. The browser tab title names the Route, Trip profile, and Scenario.
7. **One visible context line.** The scope bar's Project › Scenario breadcrumb continues with Trip profile › Blocking scenario on Trips, Blocking, and Costing, each a switcher that also holds its lifecycle commands. The Trips work-surface Trip profile and Blocking scenario menus and the Blocking summary field menu are removed. Route, Day, and Direction stay as the tab's scope selectors.
8. **One working Trip profile and Blocking scenario.** The Costing cost basis follows them, with a Blocked or Estimated choice; choosing a basis on Costing changes the working context for Trips and Blocking.
9. **Emphasis by ambiguity.** A context level with two or more choices shows an identity colour dot; a level with one choice is plain. The name is always shown.
10. **Context at the moment it matters.** Dialogs that change data outside the visible table, and Undo notices, name the context on one line. No other place adds context text.

### Also accepted

11. **Run-time staleness by content (FX7).** A Trip records a signature of the runtime inputs it was calculated from; it is stale when the assigned profile's signature differs.
12. **Trip change history (FX8).** Regenerate, Change pattern, the start-time edit, and Shift Done record restore points of their own kind in a separate retention group, replacing the single regeneration undo slot.
13. **Scenario lock (FX9)** is deferred until FX6 has been used.
14. **Accepted without change:** save-bar Discard and "Discard new pattern" act at once; a blank annual service-day count saves 0; the in-memory copy undos end on reload.

## Consequences

- Dexie version 13 adds two tables. The JSON backup schema does not change for items 1 to 10.
- Verified on 2026-11-17 on `fake-indexeddb` with a throwaway test: a `db.transaction('rw', db.tables, …)` wrapped around service commands (`renameScenarioById`, `deleteScenario` through `saveProjectSnapshot`, `copyTripProfile`, `deleteBlockingScenario`) joins their own transactions; a throw rolls all of them back, including the save-status wrapper path. FX1 turns this check into a permanent test.
- A covered command reads the Scenario's records twice more. Only covered commands pay this.
- The header gains an Undo entry point and an Undo history dialog; "This cannot be undone." leaves covered dialogs.
- Items 7 and 8 move controls and must fit header row 2 at 1024 px; they need mock-ups and a user gate.

## Alternatives considered

- **Per-command inverse operations** (as the segment, distance, and stop undos do). Rejected for this set: about 25 inverse implementations, each a source of its own defects.
- **Whole-Scenario snapshots.** Rejected: a restore would discard every later change, and an unrelated write (for example the automatic "Default" blocking scenario) would block the Undo.
- **Wrapping inside each service method.** Rejected: it edits about 25 method bodies that existing tests cover; the proxy leaves them unchanged.
- **A backup prompt before every High-risk action**, more confirmations, typed confirmations, or "you are in Trip profile X" reminders. Rejected as nagging.
