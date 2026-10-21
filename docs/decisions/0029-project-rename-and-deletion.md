# Decision 0029: Project Rename and Deletion

- Status: Accepted and implemented
- Date: 2026-10-20

## Context

Project lifecycle actions were limited to creation and selection. Users need to rename a project or remove a project and all data it owns.

## Decision

1. Project Actions contains **Rename project** and **Delete project** for the selected Project, alongside project creation and backup/restore.
2. Renaming requires a non-empty name and updates the Project record without changing its scenarios or planning data.
3. Deleting a Project first displays the number of its scenarios, routes, patterns, Trips, and Blocks. Confirmation names the Project and states that related service days, runtime and Trip profiles, Blocking Scenarios, and costing data will also be removed.
4. Confirmed deletion removes the Project and all Project-owned data in one database transaction. No minimum Project count is enforced; deleting the final Project returns the interface to its empty state.
5. Project rename and deletion do not change the JSON backup format. A previously exported backup file remains external to the application and is unaffected.

## Consequences

- Project deletion is an explicit irreversible action with a named Delete confirmation button.
- The application layer obtains deletion impact; React does not calculate the project data graph.
- IndexedDB and in-memory repositories apply the same cascade behavior. No schema migration is required.
