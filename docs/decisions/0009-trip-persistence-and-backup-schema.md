# Decision 0009: Trip Persistence and Backup Schema

- Status: Superseded for Phase 2R where generation sets are required; see Decision 0010
- Date: 2026-09-11

## Decision

Trip generation sets, materialized trips, scheduled points, and blocks are part of the project snapshot and scenario-owned persistence graph. JSON backup schema version 3 adds `generationSets`, `trips`, and `blocks` top-level arrays.

Version 1 and version 2 backups remain importable. Missing trip-generation collections are normalized to empty arrays. Import validates all cross-record references before a write begins.

Regeneration persistence uses one transaction over the generation-set, trip, and block tables. The confirmed result replaces the affected generation positions, reuses surviving trip IDs, removes deleted trip activities, and leaves new trips unassigned.

## Consequences

- Scenario duplication and import-as-copy remap generation sets, trips, scheduled-point references, blocks, and revenue-trip activities.
- CSV output can expose authoritative generation inputs and materialized schedule points with 24-plus times.
- At the time of this decision, the Dexie version 1 schema was retained because all then-required tables and indexes existed; export schema version and database version remain distinct. Decision 0012 later adds the runtime-profile assignment index in database version 2.
