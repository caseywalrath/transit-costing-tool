# Decision 0007: Runtime Persistence and Copy Rules

- Status: Accepted for Phase 2B
- Date: 2026-09-11

## Decisions

1. Runtime profiles and runtime assignments are part of the project snapshot and JSON backup graph.
2. JSON backup schema version 2 adds `runtimeProfiles` and `runtimeAssignments` arrays. Version 1 backups remain supported and import as valid graphs with empty runtime collections.
3. Runtime tables are part of the Dexie schema. The original version 1 schema omitted the `runtimeProfileId` lookup index; Decision 0012 adds it in database version 2.
4. Runtime profile copy and reverse-copy commands require a user-provided nonblank name.
5. Reverse-copy compatibility is based on reversed node sequence. Cumulative-mile compatibility is deferred while mileage behavior is being rebuilt.
6. Runtime assignment uniqueness is enforced by the pair `patternId + serviceDayId` before writes.

## Consequences

- Scenario duplication and import-as-copy remap profile, band, assignment, pattern, route, service-day, and scenario identifiers.
- Backup validation completes before a repository write begins.
- Runtime profile gaps remain valid saved data; a departure in a gap produces a runtime-resolution finding.
