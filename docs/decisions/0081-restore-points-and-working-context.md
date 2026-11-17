# Decision 0081: Restore Points and Working Context

- Status: Proposed (awaiting the user's answers at Gate 0 of `docs/implementation/undo-and-context.md`)
- Date: 2026-11-17
- Supersedes (when accepted): Decision 0076 item on the placement of the Blocking scenario field menu and the Trips Trip profile and Blocking scenario menus (only if item 7, option A, is accepted); Decision 0051 item on the per-Scenario cost basis preference (only if item 8 is accepted); Decisions 0046 and 0070 on the single regeneration undo slot (only when optional package FX8 is accepted)
- Related: Decision 0036 (writes re-read stored data), Decision 0037 (single writing tab), Decision 0041 (review tokens), `docs/implementation/destructive-actions-inventory.md`

## Context

The destructive-actions inventory (2026-11-17) found 17 High-risk actions. None has an in-place undo; the only recovery is a JSON backup restore, which creates a separate project. Warnings exist for all of them, but several do not name effects on other tabs or on blocking scenarios the planner cannot see.

The user also asked for better awareness of the working context. Scheduling systems such as Trapeze make the planner set a context (signup, route, pattern, service day) and show it continuously in the menu bar. This application has equivalents (Project, Scenario, Route, Trip profile, Blocking scenario, Day, Direction), but Trip profile and Blocking scenario are shown inside work-surface headers rather than in the scope bar, the Trip profile and Day fall back to the first entry after a page reload, and the Costing cost basis keeps its own Trip profile choice. A planner can therefore work in the wrong Trip profile without noticing. The user asked for a fix that avoids excessive nagging.

## Decision

### Undo

1. **Restore points.** Every command listed in the plan's coverage table (the High-risk deletions and replacements, and the Low-risk deletions whose dialog says "This cannot be undone") stores a restore point in the same IndexedDB transaction as its write. A failed command stores nothing; a restore point never exists without its change.
2. **Content of a restore point.** A restore point records the difference between the Scenario's records before and after the command: the full rows it removed, the previous version of the rows it changed, and a fingerprint (`fingerprint` in `src/application/reviewToken.ts`) of each row it added or changed. Project deletion records the full project snapshot. A restore point also records the command kind, its counts, and the names of the context it ran in (Scenario, Route, Trip profile, Blocking scenario, Day), resolved from the "before" records so they read after a deletion.
3. **Restoring.** Restoring puts the removed and changed rows back and deletes the added rows, in one transaction, through the ordinary Scenario write and its validation. It is refused, with the names of the records concerned, when any row the command wrote has changed since or a removed row's ID exists again. Restore points are independent: an older one can be restored when its rows are untouched, whatever came after it. A restore is itself recorded as a restore point, so it can be undone.
4. **Storage.** Restore points are local operational data in a new Dexie table `restorePoints`. They are not in JSON backups and are not copied with a Scenario or Project. They survive a page reload and the deletion of their project. Retention: the newest 20, none older than 30 days, and at most 50 MB in total (estimated from the serialized length at capture); the oldest go first. A later database upgrade may discard them; it states so.
5. **No new confirmations.** Undo replaces added friction. No new confirmation dialog is introduced. Existing confirmations stay for actions whose effects reach beyond the visible table; the plan names a few single, visible removals whose confirmation is replaced by the Undo notice.

### Working context

6. **The application never changes the working context silently.** The Trip profile and Day of each Scenario and the Direction of each Route are remembered on the device across reloads. When a remembered or open choice no longer exists and the application opens another one, it says so once in the notice area. A change the planner made does not produce a notice.
7. **One visible context line.** Option A (recommended): the scope bar's Project › Scenario breadcrumb continues with Trip profile › Blocking scenario on the tabs they govern (Trips, Blocking, Costing), each a switcher that also holds its lifecycle commands, as the Project and Scenario switchers do. Route, Day, and Direction stay as the tab's scope selectors. Option B: keep today's placement and add only items 6, 9, and 10.
8. **One working Trip profile and Blocking scenario.** The Costing cost basis follows the working Trip profile and Blocking scenario, with a Blocked or Estimated choice; choosing a basis on Costing changes the working context for Trips and Blocking.
9. **Emphasis by ambiguity.** A context level with one choice is shown plainly. A level with two or more choices shows an identity colour dot (a hashed colour token, as Block pills do), never as the only signal.
10. **Context at the moment it matters.** Each dialog that changes data outside the visible table, and each Undo notice, names the context it acts in on one line (the context stamp). No other place adds context text.

### Optional, decided separately

11. **Run-time staleness by content (FX7).** A Trip records a signature of the runtime inputs it was calculated from; it is stale when the assigned profile's signature differs. Restoring a profile's values or switching the method back then clears "Run times changed".
12. **Trip change history (FX8).** Regenerate, Change pattern, the start-time edit, and Shift Done record restore points of their own kind, replacing the single regeneration undo slot.
13. **Scenario lock (FX9).** A Scenario can be locked against edits.

## Consequences

- Dexie version 13 adds the `restorePoints` table. The JSON backup schema does not change for items 1 to 10.
- Every covered command runs inside a wrapper transaction that spans every table, so the commands it calls must not await anything other than IndexedDB requests inside it. The first structural package verifies this with a test for each command.
- A covered command reads the Scenario's records twice more (before and after). On the golden project this is a fraction of a second, and only covered commands pay it.
- The header gains an Undo entry point and an Undo history dialog. The "This cannot be undone." sentence is removed from covered dialogs.
- Items 7 and 8 move controls and must fit header row 2 at 1024 px without wrapping. They require a UI-design package with a mock-up gate.

## Alternatives considered

- **Per-command inverse operations** (one undo function per command, as the existing segment, distance, and stop undos do). Rejected for the High-risk set: about 25 inverse implementations, each a source of its own defects. The generic difference covers every command that writes through Scenario records.
- **Whole-Scenario snapshots.** Rejected: a restore would discard every later change in the Scenario, and an unrelated write (for example the automatic "Default" blocking scenario) would block the Undo.
- **A backup prompt before every High-risk action**, as project deletion has. Rejected as nagging; restore points make it unnecessary. Project deletion keeps its prompt.
- **More confirmations or typed confirmations** ("type the scenario name"). Rejected as nagging.
- **A "you are in Trip profile X" reminder before edits.** Rejected as nagging; the context line and the context stamp give the same information without interrupting.
