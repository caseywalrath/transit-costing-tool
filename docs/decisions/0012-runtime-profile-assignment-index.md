# Decision 0012: Index runtime-profile assignments for lifecycle commands

## Status

Accepted.

## Context

Runtime-profile deletion and replacement must find all service-day assignments that reference a profile. The original IndexedDB schema indexed assignments by scenario, pattern, and pattern/service-day, but not by `runtimeProfileId`. A deletion therefore failed at runtime with a raw Dexie error stating that the key path was not indexed.

## Decision

1. Add `runtimeProfileId` as a non-unique index on the `runtimeAssignments` object store.
2. Increment the Dexie database schema from version 1 to version 2. Dexie upgrades existing local databases automatically when they are opened.
3. Keep the profile deletion preflight in the application layer. It continues to report assignments and saved-trip references before any destructive write.
4. Treat IndexedDB/Dexie implementation errors as technical errors. The UI must replace them with the operation-specific fallback message and must not expose key paths, object-store names, or index terminology.

## Consequences

- Runtime-profile deletion and replacement can query assignments by profile without a transaction failure.
- Existing users receive the new index through the normal local database upgrade path; no backup restore is required.
- The persistence schema version is independent from JSON backup schema versions.
- Future lifecycle commands must add indexes for their authoritative lookup paths during the same schema change review.
