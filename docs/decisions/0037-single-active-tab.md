# Decision 0037: One Active Tab Writes the Local Database

- Status: Accepted and implemented
- Date: 2026-10-22

## Context

The application keeps all planning data in the browser's IndexedDB, which two tabs of the same site share. Nothing coordinated them. The code review (issue I-002; findings 4-002 and 4-021) reproduced six cases in which a save from an older tab silently deleted or reverted data saved in the other tab: Route and Node edits, a Scenario-wide write, Runtime band values, Costing assumptions, a Route edit that recreated a deleted Project as orphan rows, and Build Trips for a deleted Trip profile. A tab running an older database schema also kept writing after another tab upgraded the database. Because local storage is the only copy of the data (Decision 0001), a lost write cannot be recovered. User decision 10 chose to allow one active tab and make other tabs read-only.

## Decision

1. The first tab to start holds a Web Locks lock named `transit-costing-tool.active-tab` for as long as the page lives. A later tab waits up to 1.5 seconds for the lock, which covers a reload while the previous page is still closing, and then becomes read-only. It withdraws its lock request so it can never be granted the lock later.
2. Where Web Locks is not available, tabs elect an active tab over a `BroadcastChannel`: a starting tab announces a claim, an active tab answers, and of two simultaneous claimants the lower random id wins. If neither mechanism exists, the tab is treated as active, because nothing can coordinate tabs.
3. A read-only tab never promotes itself. Its data may be older than storage, so the planner closes the other tab and reloads. This also gives the required result that closing the active tab lets another open tab become active after a reload.
4. The check lives in the database layer, not in each repository method. `TransitDatabase` takes an optional `WriteGuard`. When one is supplied, a Dexie middleware rejects every write to every table with `ReadOnlySessionError`. This covers all repositories, including Blocking and Costing, and any write added later. `main.tsx` is the only place that builds the production database and always supplies the guard. Code that builds `new TransitDatabase()` without a guard (tests) is unguarded by design.
5. A Dexie `versionchange` event, which means another tab needs to upgrade the database, switches the tab to read-only (reason `databaseUpgraded`), releases its lock, and closes its connection so the upgrade can run. The tab that triggered the upgrade may itself be read-only, so the middleware lets writes through while IndexedDB is running a schema upgrade (transaction mode `versionchange`). Those writes are migrations, not edits. After such an upgrade no tab holds the lock; the planner reloads one tab and it becomes active.
6. The status is exposed through the `SessionStatusQueries` port (`getSessionStatus`, `subscribeToSessionStatus`) for the data-safety presentation package U02. In this package no new interface is added: the rejection message appears in the existing error banner.
7. Finding 4-021 (stale checks run outside the write transaction) is accepted under this single-writer model. With one writing tab, no other writer can change data between a check and its write. Preview-then-commit checks in the application layer still protect against changes made by the same tab between review and commit.
8. The `ReadOnlySessionError` message is written for planners: "This tab is read-only because the Transit Costing Tool is open in another tab. Close the other tab and reload this one to edit here."

## Consequences

- Two tabs can no longer overwrite each other. A planner who opens a second tab sees the data but cannot change it.
- The Blocking stale-source control still works inside the active tab; it protects against changes made after a Blocking view was loaded, not against other tabs.
- A tab whose database was upgraded elsewhere has a closed connection, so its later operations, reads included, fail with a database-closed error. The current error banner replaces that with its generic message. U02 should present `SessionStatus.message` instead.
- The 1.5-second wait delays a read-only second tab's start by that long.
- A read-only tab shows editing controls that fail when used. Disabling them is U02's work.
- Known limits, none of which loses data: a reload that takes longer than the 1.5-second wait leaves the reloaded tab read-only while the lock is free, and a second reload fixes it. In the `BroadcastChannel` fallback an active tab whose page is blocked for more than 250 milliseconds does not answer a claim, so a new tab can also become active; browsers that have Web Locks never use the fallback, and it is tested with fakes only. A page restored from the back-forward cache is not re-checked. Deleting the database fires the same event as an upgrade and shows the upgrade message.
- Not covered: two profiles (separate browser profiles have separate databases) and other origins on the same GitHub Pages host (finding 6-003, decision C5, Package P10).
