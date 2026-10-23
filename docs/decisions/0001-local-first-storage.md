# Decision 0001: Local-First Storage

- Status: Accepted
- Date: 2026-09-10

## Context

The initial application is a single-user planning tool deployed through GitHub Pages. It does not require shared editing, authentication, or central administration.

## Decision

Use IndexedDB as the authoritative working store through a typed persistence layer. Do not add a backend in the initial architecture.

Provide versioned JSON export and import for complete backup and restore. Provide CSV separately for tabular exchange.

## Consequences

- The application can operate as a static site and continue working without a server after loading.
- User data remains in one browser profile on one device.
- GitHub Pages deployment does not back up or synchronize project data.
- Clearing site data or changing browser profiles may remove access to locally stored projects.
- Database migrations and reliable backup/restore are required before the tool is considered usable for substantive work.
- Future cloud synchronization will require a new decision and repository implementation, but domain entities should not require replacement.

## Rejected alternatives

- Local storage: insufficient for structured datasets and migrations.
- File-only persistence: creates excessive save prompts and weak recovery behavior.
- Immediate backend: adds authentication, hosting, security, and maintenance requirements before they are needed.

## Amendment, 2026-10-23: protecting the local data (code review Package P10)

Status: accepted and implemented. Context: the code review (issues I-023 and I-045; findings 4-006 and 6-003; user decisions 11 and 16; Stage 3 decision C5) found that only Route saves showed the save status, that the application never asked the browser to keep its store and never reminded the planner to export a backup, and that a full store showed the browser's raw error text ("The current transaction exceeded its quota limitations. QuotaExceededError: ..."). Because one JSON backup is the only recovery path for the data, these consequences of local-first storage needed an answer in the application.

Decision:

1. **One save status for every write (decision 11).** `SaveStatusPublisher` (`src/application/saveStatus.ts`) is the only publisher of the visible save status. The Route, Trips, Blocking, and Costing services all run their writes through the same instance, which `src/main.tsx` creates. The status is `saving` while any write is in flight and ends as `saved`, or as `error` if any write of that burst failed. `error` stays until the next successful write. The Trips, Blocking, and Costing services publish by wrapping the write methods of their repository (`publishWrites`), so a call site cannot forget to; each service lists its write methods, and a unit test fails when a repository gains a write-like method that no service lists.
2. **A full store gets plain guidance (decision 16).** A quota failure, as IndexedDB, Dexie, or a wrapper of either reports it, becomes `StorageFullError` with the message "Browser storage is full. Export a backup, then free space." before it is published and rethrown. The original error is kept as its `cause`. Other errors are rethrown unchanged.
3. **The browser is asked to keep the store (decision 16).** After the first successful save on a browser profile the application calls `navigator.storage.persist()` once, unless the store already reports itself persistent, and records the answer (`granted`, `denied`, or `unavailable` when the browser has no such request). A refusal is recorded and not repeated automatically: Firefox shows a permission prompt for each request, and the answer can still be changed in the browser's site settings. `requestPersistentStorage()` can be called again from a planner action.
4. **The time of the last backup is remembered (decision 16).** Producing the JSON backup (`exportProject`) records the time. The answer to item 3 and this time are device-local facts about data protection: they are stored in `localStorage` beside the selection preferences (key `transit-costing-tool.local-data-protection.v1`), are never part of a backup, are never authoritative, and are read through the `LocalDataProtectionQueries` port (`getLocalDataProtection`, `subscribeToLocalDataProtection`, also on `RouteDefinitionService`). A missing or malformed record reads as empty.
5. **Presentation is Package U02's.** U02 shows the read-only status, the last backup time ("Last backup: ..." or "No backup exported yet"), and the storage-full message. This package adds no screen. Package F1 (2026-10-23) adds the answer of item 3: when it is `denied` or `unavailable`, the Project menu shows a second line under the last backup time, "This browser may clear local data. Export backups regularly."; `granted` or no answer yet shows nothing.

Consequences:

- Writes of Trips, Blocking, and Costing now change the header status. The existing indicator shows "Saving locally…" while a write runs and "Local save failed" after a failure, until the next successful write.
- A stale-source rejection of a Blocking write (the source changed after the review) also shows as a failed save, because the rejection happens inside the write.
- The backup time is recorded when the backup text is produced, not when the browser finishes downloading it. A download the planner cancels is still counted. The application cannot observe the download.
- **Shared-origin risk (decision C5), recorded, no code change.** GitHub Pages serves every repository of an account from one origin, so the IndexedDB database and the `localStorage` keys of this application are shared with every sibling Pages site of that account, and so is the browser's decision whether to keep the store. A sibling site that clears or fills storage affects this application. The application's keys are namespaced (`transit-costing-tool.*`) and its database name is its own, so a sibling site does not collide with them by accident. Moving to a dedicated origin (a custom domain or subdomain) would remove the risk, but stored data does not move with the origin, so planners would export and re-import their projects. That choice is deferred.
- Real quota exhaustion was not reproduced in this environment. The browser tests simulate it as the review did, by making `IDBObjectStore.put` and `add` throw the error a full store raises; Chromium's DevTools quota override did not block writes.
